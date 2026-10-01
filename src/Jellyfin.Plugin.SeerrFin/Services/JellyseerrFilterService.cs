using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeerrFin.Model;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class JellyseerrFilterService(IHttpClientFactory clientFactory, JellyseerrDiscoveryService discovery, ILogger<JellyseerrFilterService> logger)
{
    public async Task<(int StatusCode, string Body)> GetAsync(Guid userId, string type, IReadOnlyDictionary<string, string> query, bool options, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty) return Error(401, "User not found.");
        var config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey)) return Error(400, "Seerr is not configured in SeerrFin.");
        try
        {
            string path = options ? OptionsPath(type, query) : DiscoveryFilterQuery.BuildPath(type, query);
            using HttpClient client = clientFactory.CreateClient();
            client.BaseAddress = new Uri(config.JellyseerrUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
            using HttpResponseMessage identity = await client.GetAsync($"/api/v1/user/jellyfin/{userId:N}", cancellationToken).ConfigureAwait(false);
            if (identity.StatusCode == HttpStatusCode.NotFound) return Error(404, "Seerr user not linked. Sign in to Seerr with this Jellyfin account first.");
            identity.EnsureSuccessStatusCode();
            int id = JObject.Parse(await identity.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false)).Value<int>("id");
            if (id <= 0) return Error(502, "Unable to read your Seerr account.");
            client.DefaultRequestHeaders.Add("X-Api-User", id.ToString(CultureInfo.InvariantCulture));

            if (options)
            {
                if (path.Length > 0)
                {
                    JToken data = await ReadAsync(client, path, cancellationToken).ConfigureAwait(false);
                    return (200, OptionList(data, "id", "name", query.GetValueOrDefault("kind") == "providers").ToString(Formatting.None));
                }
                // One user-scoped connection loads the small catalogues needed by the form.
                var catalogues = await Task.WhenAll(
                    ReadAsync(client, $"/api/v1/genres/{type}", cancellationToken),
                    ReadAsync(client, "/api/v1/languages", cancellationToken),
                    ReadAsync(client, "/api/v1/watchproviders/regions", cancellationToken),
                    ReadAsync(client, "/api/v1/settings/public", cancellationToken)).ConfigureAwait(false);
                JObject result = new()
                {
                    ["genres"] = OptionList(catalogues[0], "id", "name"),
                    ["languages"] = OptionList(catalogues[1], "iso_639_1", "english_name"),
                    ["regions"] = OptionList(catalogues[2], "iso_3166_1", "english_name"),
                    ["region"] = JellyseerrProfileService.StreamingRegion(await JellyseerrProfileService.ReadMainAsync(client, id, cancellationToken).ConfigureAwait(false), config, (JObject)catalogues[3])
                };
                if (type == "tv") result["networks"] = OptionList(discovery.GetNetworks(), "id", "name");
                return (200, result.ToString(Formatting.None));
            }

            JObject page = (JObject)await ReadAsync(client, path, cancellationToken).ConfigureAwait(false);
            int number = query.TryGetValue("page", out string? pageNumber) && !string.IsNullOrWhiteSpace(pageNumber) ? int.Parse(pageNumber, CultureInfo.InvariantCulture) : 1;
            int totalPages = Math.Min(500, Math.Max(1, page.Value<int>("totalPages")));
            if (number > totalPages)
            {
                var lastPage = new Dictionary<string, string>(query) { ["page"] = totalPages.ToString(CultureInfo.InvariantCulture) };
                page = (JObject)await ReadAsync(client, DiscoveryFilterQuery.BuildPath(type, lastPage), cancellationToken).ConfigureAwait(false);
                number = totalPages;
            }
            var entries = (page["results"] as JArray ?? []).OfType<JObject>().Where(x => x.Value<string>("mediaType") == type).ToArray();
            var releaseTypes = type == "movie" ? JellyseerrDiscoveryService.GetReleaseTypes(config) : [];
            if (releaseTypes.Count > 0)
            {
                if (string.IsNullOrWhiteSpace(config.TmdbApiKey)) return Error(400, "Configured movie release filters require a TMDB API key.");
                using HttpClient tmdb = clientFactory.CreateClient();
                tmdb.Timeout = TimeSpan.FromSeconds(30);
                string key = config.TmdbApiKey.Trim();
                using SemaphoreSlim concurrency = new(4);
                var matching = await Task.WhenAll(entries.Select(async entry =>
                {
                    await concurrency.WaitAsync(cancellationToken).ConfigureAwait(false);
                    try
                    {
                        string releaseUrl = $"https://api.themoviedb.org/3/movie/{entry.Value<int>("id")}/release_dates";
                        using HttpRequestMessage request = JellyseerrDiscoveryService.CreateTmdbRequest(releaseUrl, key);
                        using HttpResponseMessage releaseResponse = await tmdb.SendAsync(request, cancellationToken).ConfigureAwait(false);
                        releaseResponse.EnsureSuccessStatusCode();
                        JObject dates = JObject.Parse(await releaseResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
                        return JellyseerrDiscoveryService.HasMatchingReleaseTypeAnywhere(dates, releaseTypes) ? entry : null;
                    }
                    finally { concurrency.Release(); }
                })).ConfigureAwait(false);
                entries = matching.OfType<JObject>().ToArray();
            }
            bool hasLanguage = query.TryGetValue("language", out string? language) && !string.IsNullOrWhiteSpace(language);
            var items = entries.Select(x => discovery.MapFilteredDiscoverItem(x, hasLanguage)).Where(x => x != null).ToArray();
            var serializer = JsonSerializer.Create(new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore, DefaultValueHandling = DefaultValueHandling.Ignore });
            return (200, new JObject { ["page"] = number, ["totalPages"] = totalPages, ["items"] = JArray.FromObject(items, serializer) }.ToString(Formatting.None));
        }
        catch (ArgumentException ex) { return Error(400, ex.Message); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SeerrFin • Advanced discovery failed");
            return Error(502, "Unable to load discovery from Seerr. Please try again.");
        }
    }

    private static string OptionsPath(string type, IReadOnlyDictionary<string, string> query)
    {
        DiscoveryFilterQuery.ValidateMediaType(type);
        if (query.Keys.Any(x => x != "kind" && x != "region" && x != "query")) throw new ArgumentException("Invalid discovery option.");
        string kind = query.GetValueOrDefault("kind") ?? "initial";
        if (kind == "initial") return "";
        if (kind == "providers")
        {
            string region = query.GetValueOrDefault("region") ?? "";
            if (!Regex.IsMatch(region, "^[A-Z]{2}$")) throw new ArgumentException("Choose a streaming region.");
            return $"/api/v1/watchproviders/{(type == "movie" ? "movies" : "tv")}?watchRegion={region}";
        }
        if (kind == "keyword" || (kind == "company" && type == "movie"))
        {
            string term = query.GetValueOrDefault("query")?.Trim() ?? "";
            if (term.Length < 2 || term.Length > 80) throw new ArgumentException("Enter between 2 and 80 characters to search.");
            return $"/api/v1/search/{kind}?query={Uri.EscapeDataString(term)}&page=1";
        }
        throw new ArgumentException("Invalid discovery option.");
    }

    private static async Task<JToken> ReadAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JToken.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
    }
    private static JArray OptionList(JToken data, string id, string name, bool logos = false) => new((data as JArray ?? data["results"] as JArray ?? []).OfType<JObject>()
        .Where(x => x[id] != null && x[name] != null).Select(x => {
            JObject choice = new() { ["id"] = x[id], ["name"] = x[name] };
            if (logos) choice["logoPath"] = x.Value<string>("logoPath");
            return choice;
        }));
    private static (int, string) Error(int status, string message) => (status, new JObject { ["message"] = message }.ToString(Formatting.None));
}
