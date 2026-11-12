using System.Collections.Concurrent;
using System.Globalization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
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
        bool refresh = false,
        string? query = null
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
            List<JObject> allRequests = snapshot.Requests.OfType<JObject>().ToList();
            JObject filterCounts = new() { ["all"] = allRequests.Count };
            foreach (string filterId in new[] { "pending", "approved", "completed", "processing", "partial", "available", "unavailable", "declined", "failed", "deleted" })
            {
                filterCounts[filterId] = allRequests.Count(request => MatchesRequestFilter(request, filterId, snapshot.RequestStatuses.GetValueOrDefault(request.Value<int>("id"))));
            }
            Dictionary<int, string> upcomingDates = await GetComingSoonDatesAsync(config, snapshot, cancellationToken).ConfigureAwait(false);
            filterCounts["comingsoon"] = upcomingDates.Count;

            List<JObject> requests = allRequests.Where(req => comingSoon ? upcomingDates.ContainsKey(req.Value<int>("id")) :
                MatchesRequestFilter(req, filter, snapshot.RequestStatuses.GetValueOrDefault(req.Value<int>("id")))).ToList();
            if (comingSoon) { requests = requests.OrderBy(request => upcomingDates[request.Value<int>("id")]).ToList(); }
            if (!string.IsNullOrWhiteSpace(query))
            {
                string search = query.Trim();
                List<JObject> matches = new();
                
                // Match titles before pagination, reusing cached metadata and limiting uncached lookups.
                foreach (JObject[] batch in requests.Chunk(4))
                {
                    bool[] matched = await Task.WhenAll(batch.Select(async request =>
                    {
                        RequestMetadataEntry metadata = GetRequestMetadataEntry(config, snapshot.UserId, request);
                        JObject? details;
                        lock (metadata.Sync) { details = metadata.Data; }
                        if (details == null)
                        {
                            try
                            {
                                details = await GetRequestMetadataAsync(config, snapshot.UserId, request, cancellationToken).ConfigureAwait(false);
                            }
                            catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
                            {
                                _logger.LogDebug(ex, "SeerrFin • failed to load title for request {RequestId}", request.Value<int>("id"));
                            }
                        }
                        string title = details?.Value<string>("title") ?? details?.Value<string>("name")  ?? request["media"]?.Value<string>("title") ?? request["media"]?.Value<string>("name") ?? string.Empty;
                        return title.Contains(search, StringComparison.OrdinalIgnoreCase);
                    })).ConfigureAwait(false);
                    matches.AddRange(batch.Where((_, index) => matched[index]));
                }
                requests = matches;
            }
            int totalPages = Math.Max(1, (int)Math.Ceiling(requests.Count / (double)take));
            List<JObject> page = requests.Skip(skip).Take(take).ToList();
            Dictionary<string, Guid?> libraryItemCache = new(StringComparer.OrdinalIgnoreCase);
            User? user = _userManager.GetUserById(userId);
            if (user != null) { ResolveLibraryItemIds(user, page, libraryItemCache); }
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
                if (upcomingDates.TryGetValue(request.Value<int>("id"), out string? releaseDate))
                {
                    mapped["isComingSoon"] = true;
                    mapped["releaseSortDate"] = releaseDate;
                }
                if (snapshot.RequestStatuses.TryGetValue(request.Value<int>("id"), out JObject? status))
                {
                    mapped["mediaStatusLabel"] = status["mediaStatusLabel"]?.DeepClone();
                    mapped["statusLabel"] = status["statusLabel"]?.DeepClone();
                    if (status.Value<string>("servarrUrl") is string url) { mapped["servarrUrl"] = url; }
                    if (status["servarrProgress"] is JObject progress) { mapped["servarrProgress"] = progress.DeepClone(); }
                }

                mappedRequests.Add(mapped);
            }

            return (200, new JObject
            {
                ["requests"] = mappedRequests,
                ["totalPages"] = totalPages,
                ["filterCounts"] = filterCounts,
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

    private async Task<Dictionary<int, string>> GetComingSoonDatesAsync(PluginConfiguration config, MediaStatusSnapshot snapshot, CancellationToken cancellationToken)
    {
        Dictionary<int, string> dates = new();
        IEnumerable<JObject> candidates = snapshot.Requests.OfType<JObject>().Where(request =>
            MatchesRequestFilter(request, "comingsoon", snapshot.RequestStatuses.GetValueOrDefault(request.Value<int>("id"))));

        // Release dates are cached with request metadata. Limit uncached lookups to four at a time.
        foreach (JObject[] batch in candidates.Chunk(4))
        {
            (int Id, DateTime? Date)[] results = await Task.WhenAll(batch.Select(async request =>
            {
                int id = request.Value<int>("id");
                try
                {
                    JObject details = await GetRequestMetadataAsync(config, snapshot.UserId, request, cancellationToken).ConfigureAwait(false);
                    string? type = request.Value<string>("type") ?? request["media"]?.Value<string>("mediaType");
                    return (Id: id, Date: GetFutureReleaseDate(type, details));
                }
                catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
                {
                    _logger.LogDebug(ex, "SeerrFin • failed to load release dates for request {RequestId}", request.Value<int>("id"));
                    return (Id: id, Date: (DateTime?)null);
                }
            })).ConfigureAwait(false);
            foreach ((int id, DateTime? date) in results)
            {
                if (date.HasValue) { dates[id] = date.Value.ToString("o"); }
            }
        }

        return dates;
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
                if (ShouldLoadProgress(status, request?.Value<int?>("status")))
                {
                    ApplySeerrDownloadProgress(context, media, is4k);
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
            if (ShouldLoadProgress(status, request.Value<int?>("status")))
            {
                ApplySeerrDownloadProgress(context, media, is4k);
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
                _logger.LogDebug(ex, "SeerrFin • Arr download progress is unavailable");
            }
        }
        foreach (JObject context in variants.SelectMany(choices => choices).Concat(requestContexts.Values))
        {
            ApplyProgressStatus(context);
        }
        JArray items = new();
        foreach (List<JObject> choices in variants)
        {
            JObject selected = choices.FirstOrDefault(item => item["servarrProgress"]?.Value<bool?>("isTransfer") == true)
                ?? choices.FirstOrDefault(item => item.Value<string>("mediaStatusLabel") != "Unknown") ?? choices[0];
            JObject item = new()
            {
                ["tmdbId"] = selected["tmdbId"],
                ["type"] = selected["type"],
                ["mediaStatusLabel"] = selected["mediaStatusLabel"],
                ["statusLabel"] = selected["statusLabel"],
                ["is4k"] = selected["is4k"]
            };
            if (selected["servarrProgress"] is JObject progress)
            {
                item["servarrProgress"] = progress.DeepClone();
                if (progress.Value<bool?>("isTransfer") == true) { item["downloadPercent"] = progress["percent"]; }
            }
            items.Add(item);
        }
        return new MediaStatusSnapshot(userId.Value, requests, items, requestContexts);
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
        ["serviceId"] = media.Value<int?>(is4k ? "serviceId4k" : "serviceId") ?? request?.Value<int?>("serverId"),
        ["externalServiceId"] = media[is4k ? "externalServiceId4k" : "externalServiceId"],
        ["servarrUrl"] = ServarrProgressService.NormalizeBrowseUrl(media.Value<string>(is4k ? "serviceUrl4k" : "serviceUrl"))
    };

    private static bool ApplySeerrDownloadProgress(JObject context, JObject media, bool is4k)
    {
        if (media[is4k ? "downloadStatus4k" : "downloadStatus"] is not JArray downloads) { return false; }
        List<JObject> entries = downloads.OfType<JObject>().ToList();
        if (entries.Count != downloads.Count) { return false; }
        HashSet<int> seasons = context["seasonNumbers"]?.Values<int>().ToHashSet() ?? new();
        if (context.Value<string>("type") == "tv" && seasons.Count > 0)
        {
            entries = entries.Where(item => item["episode"]?.Value<int?>("seasonNumber") is int season && seasons.Contains(season)).ToList();
        }
        ServarrProgressInfo? progress = DownloadProgress.Build(entries);
        if (progress == null) { return false; }
        context["servarrProgress"] = progress.ToJson();
        return true;
    }

    private static bool ShouldLoadProgress(int? mediaStatus, int? requestStatus) =>
        requestStatus is not (1 or 3) && (mediaStatus is >= 3 and <= 5 || mediaStatus is 1 or 2 && requestStatus is 2 or 4);

    private static void ApplyProgressStatus(JObject context)
    {
        JObject? progress = context["servarrProgress"] as JObject;
        string label = context.Value<string>("mediaStatusLabel") ?? "Unknown";
        bool downloaded = progress?.Value<string>("statusKey")?.StartsWith("downloaded-", StringComparison.Ordinal) == true;
        if (label == "Failed" && (progress?.Value<bool?>("isTransfer") == true || downloaded))
        {
            // A Seerr submission can time out after arr has already accepted it (seerr issue)
            label = "Processing";
            context["mediaStatusLabel"] = label;
        }
        if (label == "Failed")
        {
            context["servarrProgress"] = new ServarrProgressInfo { StatusKey = "failed", StatusLabel = "Request failed" }.ToJson();
            context["statusLabel"] = "Request failed";
        }
        else
        {
            context["statusLabel"] = label is "Available" or "Partially Available" ? label
                : downloaded ? "Waiting for Jellyfin" : progress?.Value<string>("statusLabel") ?? label;
        }
    }

    private static bool MatchesRequestFilter(JObject request, string? filter, JObject? context)
    {
        JObject? media = request.Value<JObject>("media");
        string label = context?.Value<string>("mediaStatusLabel") ?? GetMediaStatusLabel(request.Value<int?>("status"),
            media?.Value<int?>(request.Value<bool?>("is4k") == true ? "status4k" : "status"));
        int? requestStatus = request.Value<int?>("status");
        var settings = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Requests;
        return filter?.ToLowerInvariant() switch
        {
            "pending" => requestStatus == 1 || label is "Pending" or "Pending Approval",
            "approved" => requestStatus.HasValue ? requestStatus == 2 : label == "Approved",
            "completed" => requestStatus.HasValue ? requestStatus == 5 : label == "Completed",
            "declined" => requestStatus.HasValue ? requestStatus == 3 : label == "Declined",
            "partial" => label == "Partially Available",
            "failed" => label == "Failed",
            "blocklisted" => label == "Blocklisted",
            "deleted" => label == "Deleted",
            "unknown" => label == "Unknown",
            "unavailable" => requestStatus is null or 1 or 2 && label is "Unknown" or "Pending" or "Pending Approval" or "Approved" or "Processing" or "Partially Available",
            "available" => label == "Available" || label == "Partially Available" && !settings.SplitPartiallyAvailableFilter,
            "processing" => label is "Processing" or "Approved" || label == "Partially Available" && settings.IncludePartialsInProcessingFilter,
            "comingsoon" => label is "Processing" or "Approved",
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

    private sealed record MediaStatusSnapshot(int UserId, JArray Requests, JArray Items, Dictionary<int, JObject> RequestStatuses);

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
            ["requestStatus"] = requestStatus,
            ["is4k"] = is4k,
            ["requestedBy"] = requestedBy?["displayName"] ?? requestedBy?["username"] ?? "Unknown",
            ["requestedByAvatar"] = string.IsNullOrWhiteSpace(avatar) ? null : avatar,
            ["createdAt"] = req["createdAt"],
            ["seasonNumbers"] = GetSeasonNumbers(req.Value<JArray>("seasons"))
        };
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

    private static DateTime? GetFutureReleaseDate(string? type, JObject? details)
    {
        bool isTv = string.Equals(type, "tv", StringComparison.OrdinalIgnoreCase);
        DateTime today = DateTime.UtcNow.Date;
        string?[] candidates = isTv
            ? new[] { details?["nextEpisodeToAir"]?.Value<string>("airDate") ?? details?["nextAiring"]?.Value<string>("airDate") }
            : new[] { details?.Value<string>("digitalReleaseDate"), details?.Value<string>("releaseDate") };
        foreach (string? candidate in candidates)
        {
            if (DateTime.TryParse(candidate, out DateTime date) && date.Date > today) { return date; }
        }
        return null;
    }

    private static int? ExtractYear(string? dateValue) => !string.IsNullOrWhiteSpace(dateValue) && dateValue.Length >= 4 && int.TryParse(dateValue[..4], out int year) ? year : null;

    private static string GetMediaStatusLabel(int? requestStatus, int? mediaStatus)
    {
        if (requestStatus == 4 && mediaStatus is not (4 or 5 or 6 or 7))
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
