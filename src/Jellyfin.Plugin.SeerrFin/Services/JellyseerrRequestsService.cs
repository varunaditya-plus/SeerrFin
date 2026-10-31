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
    private readonly ConcurrentDictionary<string, RequestMetadataEntry> _requestMetadata = new(StringComparer.Ordinal);
    private static readonly TimeSpan RequestMetadataLifetime = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<string, MediaSnapshotEntry> _mediaSnapshots = new(StringComparer.Ordinal);
    private static readonly TimeSpan MediaSnapshotLifetime = TimeSpan.FromSeconds(5);

    private readonly ILogger<JellyseerrRequestsService> _logger;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ServarrProgressService _servarrProgressService;

    public JellyseerrRequestsService(
        ILogger<JellyseerrRequestsService> logger,
        ILibraryManager libraryManager,
        IUserManager userManager,
        ServarrProgressService servarrProgressService
    )
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
        CancellationToken cancellationToken,
        bool refresh = false
    )
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
        bool comingSoon = string.Equals(filter, "comingsoon", StringComparison.OrdinalIgnoreCase);

        try
        {
            MediaStatusSnapshot snapshot = await GetMediaSnapshotAsync(username, refresh, cancellationToken).ConfigureAwait(false);
            List<JObject> requests = snapshot.Requests.OfType<JObject>().Where(req => MatchesRequestFilter(req, filter)).ToList();
            int totalPages = Math.Max(1, (int)Math.Ceiling(requests.Count / (double)take));
            List<JObject> page = requests.Skip(skip).Take(take).ToList();
            Dictionary<string, Guid?> libraryItemCache = new(StringComparer.OrdinalIgnoreCase);
            User? user = _userManager.GetUserById(userId);
            if (user != null) { ResolveLibraryItemIds(user, page, libraryItemCache); }
            if (comingSoon)
            {
                // This filter needs current release dates before deciding which requests belong in it.
                JObject?[] candidates = await Task.WhenAll(page.Select(async request =>
                {
                    try
                    {
                        await GetRequestMetadataAsync(config, snapshot.UserId, request, cancellationToken).ConfigureAwait(false);
                        return (JObject?)request;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
                    {
                        _logger.LogDebug(ex, "SeerrFin • failed to load release dates for request {RequestId}", request.Value<int>("id"));
                        return null;
                    }
                })).ConfigureAwait(false);
                page = candidates.OfType<JObject>().ToList();
            }
            JArray mappedRequests = new();

            foreach (JObject request in page)
            {
                RequestMetadataEntry metadata = GetRequestMetadataEntry(config, snapshot.UserId, request);
                JObject? details;
                bool metadataPending;
                lock (metadata.Sync)
                {
                    details = metadata.Data;
                    metadataPending = details == null || DateTime.UtcNow - metadata.CachedAt >= RequestMetadataLifetime;
                }
                JObject mapped = MapRequest(request, details, user, libraryItemCache);
                mapped["metadataPending"] = metadataPending;
                if (snapshot.RequestProgress.TryGetValue(request.Value<int>("id"), out JObject? progress))
                {
                    mapped["servarrProgress"] = progress.DeepClone();
                }

                if (mapped.Value<string>("mediaStatusLabel") == "Failed")
                {
                    mapped["servarrProgress"] = new JObject
                    {
                        ["statusKey"] = "failed",
                        ["statusLabel"] = "Failed to find content",
                        ["percent"] = 100,
                        ["isActive"] = false
                    };
                }
                else if (mapped["servarrProgress"]?.Value<string>("statusKey") == "missing-monitored")
                {
                    mapped.Remove("servarrProgress");
                }

                mappedRequests.Add(mapped);
            }

            if (comingSoon)
            {
                mappedRequests = new JArray(mappedRequests.OfType<JObject>().Where(r => r.Value<bool?>("isComingSoon") == true)
                    .OrderBy(r => r.Value<string>("releaseSortDate") ?? "9999"));
                totalPages = Math.Max(1, (int)Math.Ceiling(mappedRequests.Count / (double)take));
            }

            return (200, new JObject
            {
                ["requests"] = mappedRequests,
                ["totalPages"] = totalPages,
                ["mediaStatuses"] = snapshot.Items.DeepClone()
            }.ToString());
        }
        catch (MediaSnapshotException ex)
        {
            return (ex.StatusCode, ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to fetch Seerr requests");
            return (502, "{\"error\":true,\"message\":\"Failed to reach Seerr.\"}");
        }
    }

    public async Task<(byte[]? Data, string? ContentType)> GetAvatarAsync(string? path, CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (
            string.IsNullOrWhiteSpace(config.JellyseerrUrl)
            || string.IsNullOrWhiteSpace(config.JellyseerrApiKey)
            || string.IsNullOrWhiteSpace(path)
        )
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

        if (
            avatarPath.Contains("..", StringComparison.Ordinal)
            || avatarPath.Contains("://", StringComparison.Ordinal)
            || avatarPath.Contains('@')
        )
        {
            return (null, null);
        }

        if (
            !avatarPath.StartsWith("/avatar/", StringComparison.OrdinalIgnoreCase)
            && !avatarPath.StartsWith("/avatarproxy/", StringComparison.OrdinalIgnoreCase)
            && !avatarPath.StartsWith("/api/v1/avatar/", StringComparison.OrdinalIgnoreCase)
        )
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

    public async Task<(int StatusCode, string Body)> GetMediaStatusesAsync(
        string username,
        bool refresh,
        CancellationToken cancellationToken
    )
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (!config.ShowDownloadDetailsInDiscoveryPages)
        {
            return (200, "{\"items\":[]}");
        }
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return (400, "{\"error\":true,\"message\":\"Seerr is not configured.\"}");
        }

        try
        {
            MediaStatusSnapshot snapshot = await GetMediaSnapshotAsync(username, refresh, cancellationToken).ConfigureAwait(false);
            return (200, new JObject { ["items"] = snapshot.Items.DeepClone() }.ToString());
        }
        catch (MediaSnapshotException ex)
        {
            return (ex.StatusCode, ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to load media status snapshot");
            return (502, "{\"error\":true,\"message\":\"Failed to load media statuses.\"}");
        }
    }

    public void InvalidateMediaStatuses()
    {
        foreach (MediaSnapshotEntry entry in _mediaSnapshots.Values)
        {
            lock (entry.Sync)
            {
                entry.Revision++;
                entry.Snapshot = null;
            }
        }
    }

    private async Task<MediaStatusSnapshot> GetMediaSnapshotAsync(string username, bool refresh, CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        string cacheKey = $"{config.JellyseerrUrl}\n{config.JellyseerrApiKey}\n{username}";
        MediaSnapshotEntry entry = _mediaSnapshots.GetOrAdd(cacheKey, _ => new MediaSnapshotEntry());
        TaskCompletionSource<MediaStatusSnapshot>? owner = null;
        Task<MediaStatusSnapshot> pending;
        lock (entry.Sync)
        {
            if (refresh)
            {
                entry.Revision++;
                entry.Snapshot = null;
            }
            if (entry.Snapshot != null && DateTime.UtcNow - entry.CachedAt < MediaSnapshotLifetime)
            {
                return entry.Snapshot;
            }
            if (entry.InFlight == null)
            {
                owner = new TaskCompletionSource<MediaStatusSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
                entry.InFlight = owner.Task;
            }
            pending = entry.InFlight;
        }

        if (owner != null)
        {
            _ = LoadMediaSnapshotAsync(entry, owner, config, username);
        }
        return await pending.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task LoadMediaSnapshotAsync(
        MediaSnapshotEntry entry,
        TaskCompletionSource<MediaStatusSnapshot> completion,
        PluginConfiguration config,
        string username
    )
    {
        try
        {
            using CancellationTokenSource timeout = new(TimeSpan.FromSeconds(60));
            while (true)
            {
                int revision;
                lock (entry.Sync) { revision = entry.Revision; }
                MediaStatusSnapshot snapshot = await FetchMediaSnapshotAsync(config, username, timeout.Token).ConfigureAwait(false);
                lock (entry.Sync)
                {
                    // Requests submitted during a refresh require a new snapshot, never the older response.
                    if (revision != entry.Revision) { continue; }
                    entry.Snapshot = snapshot;
                    entry.CachedAt = DateTime.UtcNow;
                    entry.InFlight = null;
                    completion.SetResult(snapshot);
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            lock (entry.Sync) { entry.InFlight = null; }
            completion.SetException(ex);
        }
    }

    private async Task<MediaStatusSnapshot> FetchMediaSnapshotAsync(
        PluginConfiguration config,
        string username,
        CancellationToken cancellationToken
    )
    {
        using HttpClient client = CreateClient(config);
        int? userId = await ResolveJellyseerrUserIdAsync(client, username, cancellationToken).ConfigureAwait(false);
        if (userId == null)
        {
            throw new MediaSnapshotException(404, "{\"error\":true,\"message\":\"Seerr user not linked.\"}");
        }
        client.DefaultRequestHeaders.Add("X-Api-User", userId.Value.ToString(CultureInfo.InvariantCulture));
        Task<JArray> mediaTask = FetchAllSeerrRecordsAsync(client, "/api/v1/media", cancellationToken);
        Task<JArray> requestsTask = FetchAllSeerrRecordsAsync(client, "/api/v1/request", cancellationToken);
        await Task.WhenAll(mediaTask, requestsTask).ConfigureAwait(false);
        JArray requests = requestsTask.Result;
        Dictionary<string, JObject> mediaById = mediaTask.Result.OfType<JObject>()
            .Where(media => MediaKey(media) != null).GroupBy(media => MediaKey(media)!)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        foreach (JObject request in requests.OfType<JObject>())
        {
            JObject? media = request.Value<JObject>("media");
            string? key = MediaKey(media);
            if (key == null) { continue; }
            if (!mediaById.TryGetValue(key, out JObject? current))
            {
                mediaById[key] = media!;
            }
            else
            {
                foreach (string field in new[] { "downloadStatus", "downloadStatus4k" })
                {
                    if (current[field] is null or { Type: JTokenType.Null } && media![field] is JArray downloads)
                    {
                        current[field] = downloads.DeepClone();
                    }
                }
                request["media"] = current.DeepClone();
            }
        }

        Dictionary<string, JObject> latestRequests = requests.OfType<JObject>()
            .Where(req => MediaKey(req.Value<JObject>("media")) != null)
            .GroupBy(req => VariantKey(req.Value<JObject>("media")!, req.Value<bool?>("is4k") ?? false))
            .ToDictionary(group => group.Key, group => group.MaxBy(req => req.Value<int?>("id") ?? 0)!, StringComparer.Ordinal);
        List<List<JObject>> variants = new();
        JArray fallback = new();
        Dictionary<int, JObject> requestContexts = new();

        foreach (JObject media in mediaById.Values)
        {
            List<JObject> mediaVariants = new();
            foreach (bool is4k in new[] { false, true })
            {
                latestRequests.TryGetValue(VariantKey(media, is4k), out JObject? request);
                int? status = media.Value<int?>(is4k ? "status4k" : "status");
                if (is4k && (status is null or <= 1) && request == null) { continue; }
                JObject context = BuildStatusContext(media, request, is4k);
                mediaVariants.Add(context);
                if (!ApplySeerrDownloadProgress(context, media, is4k) && status is >= 2 and <= 5)
                {
                    fallback.Add(context);
                }
            }
            variants.Add(mediaVariants);
        }

        foreach (JObject request in requests.OfType<JObject>())
        {
            JObject? media = request.Value<JObject>("media");
            if (MediaKey(media) == null) { continue; }
            bool is4k = request.Value<bool?>("is4k") ?? false;
            JObject context = BuildStatusContext(media!, request, is4k);
            context["seasonNumbers"] = GetSeasonNumbers(request.Value<JArray>("seasons"));
            int? status = media!.Value<int?>(is4k ? "status4k" : "status");
            if (!ApplySeerrDownloadProgress(context, media, is4k) && status is >= 2 and <= 5 && context.Value<string>("mediaStatusLabel") != "Failed")
            {
                fallback.Add(context);
            }
            requestContexts[request.Value<int>("id")] = context;
        }

        if (fallback.Count > 0)
        {
            try
            {
                await _servarrProgressService.EnrichRequestsAsync(fallback, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
            {
                _logger.LogDebug(ex, "SeerrFin • fallback download progress is unavailable");
            }
        }
        JArray items = new();
        foreach (List<JObject> choices in variants)
        {
            JObject selected = choices.FirstOrDefault(item => item["servarrProgress"]?.Value<string>("statusKey") == "queued")
                ?? choices.FirstOrDefault(item => item.Value<string>("mediaStatusLabel") != "Unknown") ?? choices[0];
            JObject item = new()
            {
                ["tmdbId"] = selected["tmdbId"],
                ["type"] = selected["type"],
                ["mediaStatusLabel"] = selected["mediaStatusLabel"]
            };
            if (selected["servarrProgress"]?.Value<string>("statusKey") == "queued")
            {
                item["downloadPercent"] = selected["servarrProgress"]!["percent"];
            }
            items.Add(item);
        }
        Dictionary<int, JObject> requestProgress = requestContexts.Where(pair => pair.Value["servarrProgress"] is JObject)
            .ToDictionary(pair => pair.Key, pair => (JObject)pair.Value["servarrProgress"]!);
        return new MediaStatusSnapshot(userId.Value, requests, items, requestProgress);
    }

    private static async Task<JArray> FetchAllSeerrRecordsAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        JArray records = new();
        int skip = 0;
        while (true)
        {
            using HttpResponseMessage response = await client.GetAsync($"{path}?take=500&skip={skip}&sort=added", cancellationToken)
                .ConfigureAwait(false);
            string body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) { throw new MediaSnapshotException((int)response.StatusCode, body); }
            JObject page = JObject.Parse(body);
            if (page["results"] is not JArray results) { throw new InvalidDataException("Seerr returned an invalid media page."); }
            int? total = page["pageInfo"]?.Value<int?>("results");
            if (results.Count == 0)
            {
                if (total > skip) { throw new InvalidDataException("Seerr returned an incomplete media page."); }
                break;
            }
            records.Merge(results);
            skip += results.Count;
            if (total != null ? skip >= total : results.Count < 500) { break; }
        }
        return new JArray(records.OfType<JObject>().GroupBy(record => record.Value<int>("id")).Select(group => group.First()));
    }

    private static string? MediaKey(JObject? media)
    {
        string? type = media?.Value<string>("mediaType");
        int? id = media?.Value<int?>("tmdbId");
        return type is "movie" or "tv" && id > 0 ? $"{type}:{id}" : null;
    }

    private static string VariantKey(JObject media, bool is4k) => $"{MediaKey(media)}:{is4k}";

    private static JObject BuildStatusContext(JObject media, JObject? request, bool is4k) => new()
    {
        ["tmdbId"] = media["tmdbId"],
        ["type"] = media["mediaType"],
        ["is4k"] = is4k,
        ["mediaStatusLabel"] = GetMediaStatusLabel(request?.Value<int?>("status"), media.Value<int?>(is4k ? "status4k" : "status")),
        ["serviceId"] = media[is4k ? "serviceId4k" : "serviceId"] ?? request?["serverId"],
        ["externalServiceId"] = media[is4k ? "externalServiceId4k" : "externalServiceId"]
    };

    private static bool ApplySeerrDownloadProgress(JObject context, JObject media, bool is4k)
    {
        if (media[is4k ? "downloadStatus4k" : "downloadStatus"] is not JArray downloads) { return false; }
        List<JObject> entries = downloads.OfType<JObject>().ToList();
        if (entries.Count != downloads.Count || entries.Any(item => !IsDownloadSize(item["size"]) || !IsDownloadSize(item["sizeLeft"])))
        {
            return false;
        }
        HashSet<int> seasons = context["seasonNumbers"]?.Values<int>().ToHashSet() ?? new();
        if (context.Value<string>("type") == "tv" && seasons.Count > 0)
        {
            entries = entries.Where(item => item["episode"]?.Value<int?>("seasonNumber") is not int season || seasons.Contains(season)).ToList();
        }
        if (entries.Count == 0) { return true; }
        double total = entries.Sum(item => item.Value<double>("size"));
        double leftTotal = entries.Sum(item => item.Value<double>("sizeLeft"));
        if (!double.IsFinite(total) || !double.IsFinite(leftTotal)) { return false; }
        double downloaded = Math.Clamp(total - leftTotal, 0, total);
        context["servarrProgress"] = new JObject
        {
            ["statusKey"] = "queued",
            ["statusLabel"] = "Downloading",
            ["percent"] = total > 0 ? (int)Math.Round(downloaded / total * 100) : 0,
            ["downloadedBytes"] = (long)downloaded,
            ["totalBytes"] = (long)total,
            ["isActive"] = true
        };
        return true;
    }

    private static bool IsDownloadSize(JToken? value)
    {
        if (value?.Type is not (JTokenType.Integer or JTokenType.Float)) { return false; }
        double size = value.Value<double>();
        return double.IsFinite(size) && size >= 0;
    }

    private static bool MatchesRequestFilter(JObject request, string? filter)
    {
        int? status = request.Value<int?>("status");
        JObject? media = request.Value<JObject>("media");
        int? mediaStatus = media?.Value<int?>(request.Value<bool?>("is4k") == true ? "status4k" : "status");
        return filter?.ToLowerInvariant() switch
        {
            "pending" => status == 1 && mediaStatus is >= 1 and <= 5 or 7,
            "available" => status == 5 && mediaStatus == 5,
            "processing" or "comingsoon" => status == 2 && mediaStatus is >= 1 and <= 4,
            _ => true
        };
    }

    private sealed class MediaSnapshotEntry
    {
        public object Sync { get; } = new();
        public int Revision { get; set; }
        public DateTime CachedAt { get; set; }
        public MediaStatusSnapshot? Snapshot { get; set; }
        public Task<MediaStatusSnapshot>? InFlight { get; set; }
    }

    private sealed record MediaStatusSnapshot(int UserId, JArray Requests, JArray Items, Dictionary<int, JObject> RequestProgress);

    private sealed class MediaSnapshotException(int statusCode, string body) : Exception(body)
    {
        public int StatusCode { get; } = statusCode;
    }

    public async Task<(int StatusCode, string Body)> GetRequestMetadataAsync(
        string username,
        int requestId,
        CancellationToken cancellationToken
    )
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

        try
        {
            MediaStatusSnapshot snapshot = await GetMediaSnapshotAsync(username, false, cancellationToken).ConfigureAwait(false);
            JObject? request = snapshot.Requests.OfType<JObject>().FirstOrDefault(item => item.Value<int>("id") == requestId);
            if (request == null) { return (404, "{\"error\":true,\"message\":\"Request not found.\"}"); }
            JObject details = await GetRequestMetadataAsync(config, snapshot.UserId, request, cancellationToken).ConfigureAwait(false);
            JObject mapped = MapRequest(request, details, null, new Dictionary<string, Guid?>());
            string[] fields = { "id", "tmdbId", "type", "title", "year", "posterPath", "backdropPath", "posterUrl", "backdropUrl" };
            JObject metadata = new();
            foreach (string field in fields) { metadata[field] = mapped[field]?.DeepClone(); }
            return (200, metadata.ToString());
        }
        catch (MediaSnapshotException ex)
        {
            return (ex.StatusCode, ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogDebug(ex, "SeerrFin • failed to load metadata for request {RequestId}", requestId);
            return (502, "{\"error\":true,\"message\":\"Could not load request details.\"}");
        }
    }

    private RequestMetadataEntry GetRequestMetadataEntry(PluginConfiguration config, int seerrUserId, JObject request)
    {
        JObject? media = request.Value<JObject>("media");
        string? type = request.Value<string>("type") ?? media?.Value<string>("mediaType");
        string key = $"{config.JellyseerrUrl}\n{config.JellyseerrApiKey}\n{seerrUserId}\n{type}:{media?.Value<int?>("tmdbId")}";
        return _requestMetadata.GetOrAdd(key, _ => new RequestMetadataEntry());
    }

    private async Task<JObject> GetRequestMetadataAsync(
        PluginConfiguration config,
        int seerrUserId,
        JObject request,
        CancellationToken cancellationToken
    )
    {
        RequestMetadataEntry entry = GetRequestMetadataEntry(config, seerrUserId, request);
        TaskCompletionSource<JObject>? owner = null;
        Task<JObject> pending;
        lock (entry.Sync)
        {
            if (entry.Data != null && DateTime.UtcNow - entry.CachedAt < RequestMetadataLifetime) { return entry.Data; }
            if (entry.InFlight == null)
            {
                owner = new TaskCompletionSource<JObject>(TaskCreationOptions.RunContinuationsAsynchronously);
                entry.InFlight = owner.Task;
            }
            pending = entry.InFlight;
        }
        if (owner != null) { _ = LoadRequestMetadataAsync(entry, owner, config, seerrUserId, request); }
        return await pending.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task LoadRequestMetadataAsync(
        RequestMetadataEntry entry,
        TaskCompletionSource<JObject> completion,
        PluginConfiguration config,
        int seerrUserId,
        JObject request
    )
    {
        try
        {
            JObject? media = request.Value<JObject>("media");
            string? type = request.Value<string>("type") ?? media?.Value<string>("mediaType");
            int? tmdbId = media?.Value<int?>("tmdbId");
            if (type is not ("movie" or "tv") || tmdbId is not > 0) { throw new InvalidDataException("Request has no media identity."); }
            using CancellationTokenSource timeout = new(TimeSpan.FromSeconds(20));
            using HttpClient client = CreateClient(config);
            client.DefaultRequestHeaders.Add("X-Api-User", seerrUserId.ToString(CultureInfo.InvariantCulture));
            using HttpResponseMessage response = await client.GetAsync($"/api/v1/{type}/{tmdbId}", timeout.Token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            JObject source = JObject.Parse(await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false));
            JObject details = new();
            foreach (string field in new[] { "title", "name", "posterPath", "backdropPath", "voteAverage", "releaseDate", "firstAirDate", "digitalReleaseDate" })
            {
                if (source[field] is JToken value && value.Type != JTokenType.Null) { details[field] = value.DeepClone(); }
            }
            foreach (string field in new[] { "nextEpisodeToAir", "nextAiring" })
            {
                string? airDate = (source[field] as JObject)?.Value<string>("airDate");
                if (airDate != null) { details[field] = new JObject { ["airDate"] = airDate }; }
            }
            lock (entry.Sync)
            {
                entry.Data = details;
                entry.CachedAt = DateTime.UtcNow;
                entry.InFlight = null;
                completion.SetResult(details);
            }
        }
        catch (Exception ex)
        {
            lock (entry.Sync) { entry.InFlight = null; }
            completion.SetException(ex);
        }
    }

    private sealed class RequestMetadataEntry
    {
        public object Sync { get; } = new();
        public JObject? Data { get; set; }
        public DateTime CachedAt { get; set; }
        public Task<JObject>? InFlight { get; set; }
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
        int? tmdbId = media?.Value<int?>("tmdbId");

        JObject mapped = new()
        {
            ["id"] = req["id"],
            ["tmdbId"] = tmdbId,
            ["type"] = type,
            ["servarrUrl"] = ServarrProgressService.NormalizeBrowseUrl(
                is4k ? media?.Value<string>("serviceUrl4k") : media?.Value<string>("serviceUrl")
            ),
            ["posterPath"] = posterPath,
            ["backdropPath"] = backdropPath,
            ["title"] =
                details?.Value<string>("title")
                ?? details?.Value<string>("name")
                ?? media?.Value<string>("title")
                ?? media?.Value<string>("name")
                ?? "Unknown",
            ["year"] = ExtractYear(details?["releaseDate"]?.ToString() ?? details?["firstAirDate"]?.ToString()),
            ["voteAverage"] = details?["voteAverage"],
            ["posterUrl"] = string.IsNullOrWhiteSpace(posterPath)
                ? null
                : $"https://image.tmdb.org/t/p/w300{posterPath}",
            ["backdropUrl"] = string.IsNullOrWhiteSpace(backdropPath)
                ? null
                : $"https://image.tmdb.org/t/p/w780{backdropPath}",
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

    private void ResolveLibraryItemIds(User user, IEnumerable<JObject> requests, Dictionary<string, Guid?> cache)
    {
        Dictionary<BaseItemKind, Dictionary<string, List<string>>> lookups = new();
        foreach (JObject request in requests)
        {
            JObject? media = request.Value<JObject>("media");
            int? mediaStatus = media?.Value<int?>(request.Value<bool?>("is4k") == true ? "status4k" : "status");
            mediaStatus ??= media?.Value<int?>("status");
            if (!IsPlayableMediaStatus(mediaStatus) || media?.Value<int?>("tmdbId") is not int tmdbId) { continue; }

            string? type = request.Value<string>("type") ?? media.Value<string>("mediaType");
            string cacheKey = $"{type}:{tmdbId}";
            cache[cacheKey] = null;
            BaseItemKind itemType = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase) ? BaseItemKind.Series : BaseItemKind.Movie;
            if (!lookups.TryGetValue(itemType, out Dictionary<string, List<string>>? ids))
            {
                ids = new(StringComparer.Ordinal);
                lookups[itemType] = ids;
            }
            string providerId = tmdbId.ToString(CultureInfo.InvariantCulture);
            if (!ids.TryGetValue(providerId, out List<string>? keys)) { ids[providerId] = keys = new(); }
            if (!keys.Contains(cacheKey, StringComparer.OrdinalIgnoreCase)) { keys.Add(cacheKey); }
        }

        foreach ((BaseItemKind itemType, Dictionary<string, List<string>> ids) in lookups)
        {
            try
            {
                InternalItemsQuery query = new(user)
                {
                    Recursive = true,
                    IncludeItemTypes = new[] { itemType },
                    HasAnyProviderIds = new Dictionary<string, string[]> { ["Tmdb"] = ids.Keys.ToArray() },
                    EnableTotalRecordCount = false,
                    DtoOptions = new(false) { Fields = new[] { ItemFields.ProviderIds }, EnableImages = false, EnableUserData = false }
                };
                foreach (BaseItem item in _libraryManager.GetItemsResult(query).Items)
                {
                    if (item.GetBaseItemKind() != itemType || !item.ProviderIds.TryGetValue("Tmdb", out string? providerId)
                        || !ids.TryGetValue(providerId, out List<string>? keys)) { continue; }
                    foreach (string key in keys) { cache[key] ??= item.Id; }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "SeerrFin • failed to resolve Jellyfin items for {Type}", itemType);
            }
        }
    }

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
                HasAnyProviderId = new Dictionary<string, string> { { "Tmdb", tmdbId.ToString(CultureInfo.InvariantCulture) } },
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

        foreach (
            int? seasonNumber in seasons.OfType<JObject>().Select(s => s.Value<int?>("seasonNumber")).Where(n => n != null).OrderBy(n => n)
        )
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
            string? nextAirDate = details?["nextEpisodeToAir"]?["airDate"]?.ToString() ?? details?["nextAiring"]?["airDate"]?.ToString();

            return !string.IsNullOrWhiteSpace(nextAirDate)
                && DateTime.TryParse(nextAirDate, out DateTime airDate)
                && airDate.Date > today
                && status is "processing" or "approved" or "partially available";
        }

        if (status is not ("processing" or "approved"))
        {
            return false;
        }

        return new[] { details?["digitalReleaseDate"]?.ToString(), details?["releaseDate"]?.ToString() }.Any(
            dateValue =>
                !string.IsNullOrWhiteSpace(dateValue)
                && DateTime.TryParse(dateValue, out DateTime releaseDate)
                && releaseDate.Date > today
        );
    }

    private static DateTime GetReleaseSortDate(JObject mapped, JObject? details)
    {
        string? type = mapped.Value<string>("type");
        string? candidate = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase)
            ? (details?["nextEpisodeToAir"] as JObject)?.Value<string>("airDate") ?? (details?["nextAiring"] as JObject)?.Value<string>("airDate")
            : details?.Value<string>("digitalReleaseDate") ?? details?.Value<string>("releaseDate");

        return DateTime.TryParse(candidate, out DateTime parsed) ? parsed : DateTime.MaxValue;
    }

    private static int? ExtractYear(string? dateValue) => !string.IsNullOrWhiteSpace(dateValue) && dateValue.Length >= 4 && int.TryParse(dateValue[..4], out int year) ? year : null;

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

    private static async Task<int?> ResolveJellyseerrUserIdAsync(HttpClient client, string username, CancellationToken cancellationToken)
    {
        using HttpResponseMessage usersResponse = await client
            .GetAsync($"/api/v1/user?q={Uri.EscapeDataString(username)}", cancellationToken)
            .ConfigureAwait(false);
        if (!usersResponse.IsSuccessStatusCode)
        {
            return null;
        }

        string userResponseRaw = await usersResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        return JObject.Parse(userResponseRaw).Value<JArray>("results")
            ?.OfType<JObject>()
            .FirstOrDefault(x => string.Equals(x.Value<string>("jellyfinUsername"), username, StringComparison.OrdinalIgnoreCase))
            ?.Value<int>("id");
    }
}
