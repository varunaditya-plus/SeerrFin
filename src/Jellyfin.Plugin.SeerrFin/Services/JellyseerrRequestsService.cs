using System.Collections.Concurrent;
using System.Globalization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.SeerrFin.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class JellyseerrRequestsService
{
    private static readonly ConcurrentDictionary<string, (JObject Data, DateTime CachedAt)> MediaDetailCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, Task<JObject?>> MediaDetailInFlight = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan MediaDetailCacheTtl = TimeSpan.FromMinutes(10);

    private readonly ILogger<JellyseerrRequestsService> _logger;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ServarrProgressService _servarrProgressService;

    public JellyseerrRequestsService(ILogger<JellyseerrRequestsService> logger, ILibraryManager libraryManager, IUserManager userManager, ServarrProgressService servarrProgressService)
    {
        _logger = logger;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _servarrProgressService = servarrProgressService;
    }

    public async Task<(int StatusCode, string Body)> GetRequestsAsync(
        Guid userId,
        string username,
        int take,
        int skip,
        string? filter,
        CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return (400, "{\"error\":true,\"message\":\"Seerr is not configured.\"}");
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            return (401, "{\"error\":true,\"message\":\"User not found.\"}");
        }

        take = Math.Clamp(take, 1, 200);
        skip = Math.Max(0, skip);

        bool isComingSoonFilter = string.Equals(filter, "comingsoon", StringComparison.OrdinalIgnoreCase);
        string filterParam = filter?.ToLowerInvariant() switch
        {
            "pending" => "&filter=pending",
            "available" => "&filter=available",
            "processing" => "&filter=processing",
            "comingsoon" => "&filter=processing",
            _ => string.Empty
        };

        using HttpClient client = CreateClient(config);
        int? jellyseerrUserId = await ResolveJellyseerrUserIdAsync(client, username, cancellationToken).ConfigureAwait(false);
        if (jellyseerrUserId == null)
        {
            return (404, "{\"error\":true,\"message\":\"Seerr user not linked.\"}");
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());

        string apiPath = $"/api/v1/request?take={take}&skip={skip}&sort=added&sortDirection=desc{filterParam}";
        try
        {
            using HttpResponseMessage response = await client.GetAsync(apiPath, cancellationToken).ConfigureAwait(false);
            string raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return ((int)response.StatusCode, raw);
            }

            JObject data = JObject.Parse(raw);
            JArray? results = data.Value<JArray>("results");
            if (results == null || results.Count == 0)
            {
                return (200, BuildResponse(data, new JArray(), isComingSoonFilter, take).ToString());
            }

            Dictionary<string, Guid?> libraryItemCache = new(StringComparer.OrdinalIgnoreCase);
            User? user = _userManager.GetUserById(userId);

            (JObject Req, JObject? Details)[] enriched = await Task.WhenAll(
                results.OfType<JObject>().Select(async req =>
                {
                    JObject? details = await GetMediaDetailsAsync(client, req, cancellationToken).ConfigureAwait(false);
                    return (req, details);
                })).ConfigureAwait(false);

            JArray mappedRequests = new();
            foreach ((JObject req, JObject? details) in enriched)
            {
                mappedRequests.Add(MapRequest(req, details, user, libraryItemCache));
            }

            if (isComingSoonFilter)
            {
                mappedRequests = new JArray(
                    mappedRequests.OfType<JObject>()
                        .Where(r => r.Value<bool?>("isComingSoon") == true)
                        .OrderBy(r => r.Value<string>("releaseSortDate") ?? "9999"));
            }

            await _servarrProgressService.EnrichRequestsAsync(mappedRequests, cancellationToken).ConfigureAwait(false);

            foreach (JObject mapped in mappedRequests.OfType<JObject>())
            {
                string? mediaLabel = mapped.Value<string>("mediaStatusLabel");
                string? servarrStatusKey = (mapped["servarrProgress"] as JObject)?.Value<string>("statusKey");

                if (string.Equals(mediaLabel, "Failed", StringComparison.OrdinalIgnoreCase))
                {
                    mapped["servarrProgress"] = new JObject
                    {
                        ["statusKey"] = "failed",
                        ["statusLabel"] = "Failed to find content",
                        ["percent"] = 100,
                        ["isActive"] = false
                    };
                }
                else if (string.Equals(servarrStatusKey, "missing-monitored", StringComparison.OrdinalIgnoreCase))
                {
                    // Unsure state (don't show a bar). Maybe show a gray bar?
                    mapped.Remove("servarrProgress");
                }

                mapped.Remove("externalServiceId");
            }

            return (200, BuildResponse(data, mappedRequests, isComingSoonFilter, take).ToString());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to fetch Seerr requests");
            return (502, "{\"error\":true,\"message\":\"Failed to reach Seerr.\"}");
        }
    }

    public async Task<(byte[]? Data, string? ContentType)> GetAvatarAsync(
        string? path,
        CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl)
            || string.IsNullOrWhiteSpace(config.JellyseerrApiKey)
            || string.IsNullOrWhiteSpace(path))
        {
            return (null, null);
        }

        string avatarPath = path.Trim();
        int queryIndex = avatarPath.IndexOf('?', StringComparison.Ordinal);
        if (queryIndex >= 0)
        {
            avatarPath = avatarPath[..queryIndex];
        }

        if (!avatarPath.StartsWith('/'))
        {
            avatarPath = $"/{avatarPath}";
        }

        if (avatarPath.Contains("..", StringComparison.Ordinal)
            || avatarPath.Contains("://", StringComparison.Ordinal)
            || avatarPath.Contains('@'))
        {
            return (null, null);
        }

        if (!avatarPath.StartsWith("/avatar/", StringComparison.OrdinalIgnoreCase)
            && !avatarPath.StartsWith("/avatarproxy/", StringComparison.OrdinalIgnoreCase)
            && !avatarPath.StartsWith("/api/v1/avatar/", StringComparison.OrdinalIgnoreCase))
        {
            return (null, null);
        }

        using HttpClient client = new() { BaseAddress = new Uri(config.JellyseerrUrl!) };
        client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);

        try
        {
            using HttpResponseMessage response = await client.GetAsync(avatarPath, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return (null, null);
            }

            byte[] data = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            return (data, response.Content.Headers.ContentType?.MediaType ?? "image/jpeg");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SeerrFin • failed to proxy Seerr avatar");
            return (null, null);
        }
    }

    private static JObject BuildResponse(JObject source, JArray requests, bool isComingSoonFilter, int take)
    {
        JObject? pageInfo = source.Value<JObject>("pageInfo");
        int totalPages = isComingSoonFilter
            ? Math.Max(1, (int)Math.Ceiling(requests.Count / (double)take))
            : pageInfo?.Value<int?>("pages") ?? 1;

        return new JObject
        {
            ["requests"] = requests,
            ["totalPages"] = totalPages
        };
    }

    private static async Task<JObject?> GetMediaDetailsAsync(
        HttpClient client,
        JObject req,
        CancellationToken cancellationToken)
    {
        JObject? media = req.Value<JObject>("media");
        string? type = req.Value<string>("type") ?? media?.Value<string>("mediaType");
        int? tmdbId = media?.Value<int?>("tmdbId");
        if (!tmdbId.HasValue || string.IsNullOrEmpty(type))
        {
            return null;
        }

        string cacheKey = $"{type}:{tmdbId.Value}";
        if (MediaDetailCache.TryGetValue(cacheKey, out (JObject Data, DateTime CachedAt) cached) && DateTime.UtcNow - cached.CachedAt < MediaDetailCacheTtl)
        {
            return cached.Data;
        }

        Task<JObject?> fetchTask = MediaDetailInFlight.GetOrAdd(cacheKey, _ => FetchMediaDetailsAsync(client, type, tmdbId.Value, cancellationToken));
        try
        {
            JObject? details = await fetchTask.ConfigureAwait(false);
            if (details != null)
            {
                MediaDetailCache[cacheKey] = (details, DateTime.UtcNow);
                PruneMediaDetailCache();
            }

            return details;
        }
        finally
        {
            MediaDetailInFlight.TryRemove(cacheKey, out _);
        }
    }

    private static async Task<JObject?> FetchMediaDetailsAsync(HttpClient client, string type, int tmdbId, CancellationToken cancellationToken)
    {
        string path = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase)
            ? $"/api/v1/tv/{tmdbId}"
            : $"/api/v1/movie/{tmdbId}";

        try
        {
            using HttpResponseMessage response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            string raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return JObject.Parse(raw);
        }
        catch
        {
            // Fallback to request media fields when detail lookup fails.
            return null;
        }
    }

    private static void PruneMediaDetailCache()
    {
        if (MediaDetailCache.Count <= 500 && MediaDetailCache.Count % 100 != 0)
        {
            return;
        }

        foreach (KeyValuePair<string, (JObject Data, DateTime CachedAt)> entry in MediaDetailCache)
        {
            if (DateTime.UtcNow - entry.Value.CachedAt > MediaDetailCacheTtl)
            {
                MediaDetailCache.TryRemove(entry.Key, out _);
            }
        }
    }

    private JObject MapRequest(JObject req, JObject? details, User? user, Dictionary<string, Guid?> libraryItemCache)
    {
        JObject? media = req.Value<JObject>("media");
        JObject? requestedBy = req.Value<JObject>("requestedBy");

        string? type = req.Value<string>("type") ?? media?.Value<string>("mediaType");
        bool is4k = req.Value<bool?>("is4k") ?? false;
        int? requestStatus = req.Value<int?>("status");
        int? mediaStatus = is4k ? media?.Value<int?>("status4k") : media?.Value<int?>("status");
        mediaStatus ??= media?.Value<int?>("status");

        string? posterPath = details?.Value<string>("posterPath");
        string? backdropPath = details?.Value<string>("backdropPath");
        string? avatar = requestedBy?.Value<string>("avatar");
        int? tmdbId = media?.Value<int?>("tmdbId") ?? details?.Value<int?>("id");
        int? externalServiceId = is4k
            ? media?.Value<int?>("externalServiceId4k") ?? media?.Value<int?>("externalServiceId")
            : media?.Value<int?>("externalServiceId");

        JObject mapped = new()
        {
            ["id"] = req["id"],
            ["tmdbId"] = tmdbId,
            ["type"] = type,
            ["externalServiceId"] = externalServiceId,
            ["posterPath"] = posterPath,
            ["backdropPath"] = backdropPath,
            ["title"] = details?.Value<string>("title")
                ?? details?.Value<string>("name")
                ?? media?.Value<string>("title")
                ?? media?.Value<string>("name")
                ?? "Unknown",
            ["year"] = ExtractYear(details?["releaseDate"]?.ToString() ?? details?["firstAirDate"]?.ToString()),
            ["posterUrl"] = string.IsNullOrWhiteSpace(posterPath) ? null : $"https://image.tmdb.org/t/p/w300{posterPath}",
            ["backdropUrl"] = string.IsNullOrWhiteSpace(backdropPath) ? null : $"https://image.tmdb.org/t/p/w780{backdropPath}",
            ["mediaStatusLabel"] = GetMediaStatusLabel(requestStatus, mediaStatus),
            ["is4k"] = is4k,
            ["requestedBy"] = requestedBy?["displayName"] ?? requestedBy?["username"] ?? "Unknown",
            ["requestedByAvatar"] = string.IsNullOrWhiteSpace(avatar) ? null : avatar,
            ["createdAt"] = req["createdAt"],
            ["seasonNumbers"] = GetSeasonNumbers(req.Value<JArray>("seasons"))
        };

        if (HasFutureRelease(mapped, details))
        {
            mapped["isComingSoon"] = true;
            mapped["releaseSortDate"] = GetReleaseSortDate(mapped, details).ToString("o");
        }

        if (user != null && tmdbId.HasValue && IsPlayableMediaStatus(mediaStatus))
        {
            Guid? jellyfinItemId = ResolveLibraryItemId(user, type, tmdbId.Value, libraryItemCache);
            if (jellyfinItemId.HasValue)
            {
                mapped["jellyfinItemId"] = jellyfinItemId.Value.ToString("N", CultureInfo.InvariantCulture);
            }
        }

        return mapped;
    }

    private static bool IsPlayableMediaStatus(int? mediaStatus) => mediaStatus is 4 or 5;

    public Guid? ResolveLibraryItemId(Guid userId, string? type, int tmdbId)
    {
        User? user = _userManager.GetUserById(userId);
        if (user == null)
        {
            return null;
        }

        return ResolveLibraryItemId(user, type, tmdbId, new Dictionary<string, Guid?>(StringComparer.OrdinalIgnoreCase));
    }

    private Guid? ResolveLibraryItemId(User user, string? type, int tmdbId, Dictionary<string, Guid?> cache)
    {
        string cacheKey = $"{type}:{tmdbId}";
        if (cache.TryGetValue(cacheKey, out Guid? cached))
        {
            return cached;
        }

        Guid? itemId = null;
        try
        {
            BaseItemKind[] itemTypes = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase)
                ? new[] { BaseItemKind.Series }
                : new[] { BaseItemKind.Movie };

            InternalItemsQuery query = new(user)
            {
                Recursive = true,
                IncludeItemTypes = itemTypes,
                HasAnyProviderId = new Dictionary<string, string>
                {
                    { "Tmdb", tmdbId.ToString(CultureInfo.InvariantCulture) }
                },
                Limit = 1
            };

            QueryResult<BaseItem> result = _libraryManager.GetItemsResult(query);
            itemId = result.Items.FirstOrDefault()?.Id;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SeerrFin • failed to resolve Jellyfin item for {Type}/{TmdbId}", type, tmdbId);
        }

        cache[cacheKey] = itemId;
        return itemId;
    }

    private static JArray GetSeasonNumbers(JArray? seasons)
    {
        JArray numbers = new();
        if (seasons == null)
        {
            return numbers;
        }

        foreach (int? seasonNumber in seasons
                     .OfType<JObject>()
                     .Select(s => s.Value<int?>("seasonNumber"))
                     .Where(n => n != null)
                     .OrderBy(n => n))
        {
            numbers.Add(seasonNumber);
        }

        return numbers;
    }

    private static bool HasFutureRelease(JObject mapped, JObject? details)
    {
        string status = mapped.Value<string>("mediaStatusLabel")?.ToLowerInvariant() ?? string.Empty;
        string? type = mapped.Value<string>("type");
        DateTime today = DateTime.UtcNow.Date;

        if (string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase))
        {
            string? nextAirDate = details?["nextEpisodeToAir"]?["airDate"]?.ToString()
                ?? details?["nextAiring"]?["airDate"]?.ToString();
            return !string.IsNullOrWhiteSpace(nextAirDate)
                && DateTime.TryParse(nextAirDate, out DateTime airDate)
                && airDate.Date > today
                && status is "processing" or "approved" or "partially available";
        }

        if (status is not ("processing" or "approved"))
        {
            return false;
        }

        return new[] { details?["digitalReleaseDate"]?.ToString(), details?["releaseDate"]?.ToString() }
            .Any(dateValue => !string.IsNullOrWhiteSpace(dateValue)
                && DateTime.TryParse(dateValue, out DateTime releaseDate)
                && releaseDate.Date > today);
    }

    private static DateTime GetReleaseSortDate(JObject mapped, JObject? details)
    {
        string? type = mapped.Value<string>("type");
        string? candidate = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase)
            ? details?["nextEpisodeToAir"]?["airDate"]?.ToString() ?? details?["nextAiring"]?["airDate"]?.ToString()
            : details?["digitalReleaseDate"]?.ToString() ?? details?["releaseDate"]?.ToString();

        return DateTime.TryParse(candidate, out DateTime parsed) ? parsed : DateTime.MaxValue;
    }

    private static int? ExtractYear(string? dateValue) =>
        !string.IsNullOrWhiteSpace(dateValue) && dateValue.Length >= 4 && int.TryParse(dateValue[..4], out int year)
            ? year
            : null;

    private static string GetMediaStatusLabel(int? requestStatus, int? mediaStatus)
    {
        if (requestStatus == 4 && mediaStatus is not (4 or 5))
        {
            return "Failed";
        }

        return mediaStatus switch
        {
            7 => "Deleted",
            6 => "Blocklisted",
            5 => "Available",
            4 => "Partially Available",
            3 => "Processing",
            2 => "Pending",
            _ => requestStatus switch
            {
                5 => "Completed",
                4 => "Failed",
                3 => "Declined",
                2 => "Approved",
                1 => "Pending Approval",
                _ => "Unknown"
            }
        };
    }

    private static HttpClient CreateClient(PluginConfiguration config)
    {
        HttpClient client = new() { BaseAddress = new Uri(config.JellyseerrUrl!) };
        client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
        return client;
    }

    private static async Task<int?> ResolveJellyseerrUserIdAsync(
        HttpClient client,
        string username,
        CancellationToken cancellationToken)
    {
        using HttpResponseMessage usersResponse = await client
            .GetAsync($"/api/v1/user?q={Uri.EscapeDataString(username)}", cancellationToken)
            .ConfigureAwait(false);
        if (!usersResponse.IsSuccessStatusCode)
        {
            return null;
        }

        string userResponseRaw = await usersResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JObject.Parse(userResponseRaw).Value<JArray>("results")?
            .OfType<JObject>()
            .FirstOrDefault(x => string.Equals(x.Value<string>("jellyfinUsername"), username, StringComparison.OrdinalIgnoreCase))
            ?.Value<int>("id");
    }
}
