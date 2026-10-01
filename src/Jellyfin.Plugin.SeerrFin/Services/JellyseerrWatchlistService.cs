using System.Net;
using System.Text;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

/// <summary>Uses Seerr's persisted watchlist, always scoped to the authenticated Jellyfin user.</summary>
public class JellyseerrWatchlistService(IHttpClientFactory clientFactory, ILogger<JellyseerrWatchlistService> logger)
{
    public async Task<(int StatusCode, string Body)> SendAsync(
        Guid userId, HttpMethod method, int page, string? mediaType, int tmdbId, CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (userId == Guid.Empty)
        {
            return Error(401, "User not found.");
        }

        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return Error(400, "Seerr is not configured in SeerrFin.");
        }

        try
        {
            using HttpClient client = clientFactory.CreateClient();
            client.BaseAddress = new Uri(config.JellyseerrUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
            // Resolve the immutable identity rather than accepting a client-supplied Seerr user ID.
            using HttpResponseMessage identity = await client.GetAsync($"/api/v1/user/jellyfin/{userId:N}", cancellationToken).ConfigureAwait(false);
            if (!identity.IsSuccessStatusCode)
            {
                return Error((int)identity.StatusCode, "Seerr user not linked. Sign in to Seerr with this Jellyfin account first.");
            }

            JObject user = JObject.Parse(await identity.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            int seerrUserId = user.Value<int>("id");
            if (seerrUserId <= 0)
            {
                return Error(404, "Seerr user not linked.");
            }

            client.DefaultRequestHeaders.Add("X-Api-User", seerrUserId.ToString(System.Globalization.CultureInfo.InvariantCulture));
            string listPath = $"/api/v1/user/{seerrUserId}/watchlist";

            if (mediaType != null && method != HttpMethod.Get)
            {
                string path = method == HttpMethod.Delete ? $"/api/v1/watchlist/{tmdbId}?mediaType={mediaType}" : "/api/v1/watchlist";
                using HttpRequestMessage request = new(method, path);
                // Seerr's optional CSRF protection also covers API-key requests.
                if (identity.Headers.TryGetValues("Set-Cookie", out var setCookies))
                {
                    foreach (string cookie in setCookies)
                    {
                        string pair = cookie.Split(';', 2)[0];
                        if (pair.StartsWith("XSRF-TOKEN=", StringComparison.Ordinal))
                        {
                            request.Headers.TryAddWithoutValidation("X-CSRF-Token", Uri.UnescapeDataString(pair[11..]));
                        }
                        else if (pair.StartsWith("_csrf=", StringComparison.Ordinal))
                        {
                            request.Headers.TryAddWithoutValidation("Cookie", pair);
                        }
                    }
                }
                if (method == HttpMethod.Post)
                {
                    request.Content = new StringContent(new JObject { ["tmdbId"] = tmdbId, ["mediaType"] = mediaType }.ToString(Formatting.None), Encoding.UTF8, "application/json");
                }

                using HttpResponseMessage response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
                // Seerr's entity response includes user data. Return only the state our UI needs.
                if (response.IsSuccessStatusCode || (method == HttpMethod.Delete && response.StatusCode == HttpStatusCode.NotFound))
                {
                    return (200, new JObject { ["watchlisted"] = method == HttpMethod.Post }.ToString(Formatting.None));
                }

                // A 409 can also be a database error; verify membership before treating it as success.
                if (method == HttpMethod.Post && response.StatusCode == HttpStatusCode.Conflict &&
                    await ContainsAsync(client, listPath, mediaType, tmdbId, cancellationToken).ConfigureAwait(false))
                {
                    return (200, "{\"watchlisted\":true}");
                }

                return Error((int)response.StatusCode, "Unable to update watchlist in Seerr. Please try again.");
            }

            if (mediaType != null)
            {
                bool contains = await ContainsAsync(client, listPath, mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
                return (200, new JObject { ["watchlisted"] = contains }.ToString(Formatting.None));
            }

            JObject list = await GetJsonAsync(client, $"{listPath}?page={page}", cancellationToken).ConfigureAwait(false);
            int totalPages = Math.Max(1, list.Value<int>("totalPages"));
            if (page > totalPages)
            {
                page = totalPages;
                list = await GetJsonAsync(client, $"{listPath}?page={page}", cancellationToken).ConfigureAwait(false);
            }

            // Enrich one upstream page at a time. A failed metadata lookup must not hide an entry.
            using SemaphoreSlim concurrency = new(4);
            var tasks = (list["results"] as JArray ?? []).OfType<JObject>().Select(async entry =>
            {
                string type = entry.Value<string>("mediaType") ?? string.Empty;
                int id = entry.Value<int>("tmdbId");
                JObject item = new() { ["id"] = id, ["mediaType"] = type, ["title"] = string.IsNullOrWhiteSpace(entry.Value<string>("title")) ? $"{type} #{id}" : entry.Value<string>("title") };
                if (type != "movie" && type != "tv")
                {
                    return item;
                }

                await concurrency.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    JObject details = await GetJsonAsync(client, $"/api/v1/{type}/{id}", cancellationToken).ConfigureAwait(false);
                    item["title"] = details["title"] ?? details["name"] ?? item["title"];
                    item["posterPath"] = details["posterPath"];
                    item["releaseDate"] = details["releaseDate"] ?? details["firstAirDate"];
                    item["voteAverage"] = details["voteAverage"];
                }
                catch (Exception ex) when (ex is HttpRequestException or JsonException || (ex is OperationCanceledException && !cancellationToken.IsCancellationRequested))
                {
                    item["metadataUnavailable"] = true;
                }
                finally
                {
                    concurrency.Release();
                }

                return item;
            });
            JArray results = new(await Task.WhenAll(tasks).ConfigureAwait(false));
            return (200, new JObject { ["page"] = page, ["totalPages"] = totalPages, ["totalResults"] = list["totalResults"] ?? 0, ["results"] = results }.ToString(Formatting.None));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SeerrFin • Watchlist operation failed");
            return Error(502, "Unable to reach the Seerr watchlist. Please try again.");
        }
    }

    private static async Task<JObject> GetJsonAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JObject.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
    }

    private static async Task<bool> ContainsAsync(HttpClient client, string listPath, string type, int id, CancellationToken cancellationToken)
    {
        // Seerr exposes a user-scoped membership flag on details; avoid walking a large list.
        try
        {
            JObject details = await GetJsonAsync(client, $"/api/v1/{type}/{id}", cancellationToken).ConfigureAwait(false);
            if (details["onUserWatchlist"]?.Type == JTokenType.Boolean)
            {
                return details.Value<bool>("onUserWatchlist");
            }
        }
        catch (HttpRequestException)
        {
            // Deleted/unavailable metadata can still have a saved watchlist entry.
        }

        int page = 1;
        int totalPages;
        do
        {
            JObject list = await GetJsonAsync(client, $"{listPath}?page={page}", cancellationToken).ConfigureAwait(false);
            if ((list["results"] as JArray ?? []).OfType<JObject>().Any(item => item.Value<int>("tmdbId") == id && item.Value<string>("mediaType") == type))
            {
                return true;
            }

            totalPages = list.Value<int>("totalPages");
            page++;
        }
        while (page <= totalPages);
        return false;
    }

    private static (int, string) Error(int status, string message) => (status, new JObject { ["message"] = message }.ToString(Formatting.None));
}
