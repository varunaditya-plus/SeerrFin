using System.Globalization;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public sealed class ServarrProgressService
{
    private static readonly TimeSpan SnapshotLifetime = TimeSpan.FromSeconds(10);
    private readonly Dictionary<string, CachedRead> _cache = new();
    private readonly SemaphoreSlim _snapshotSlots = new(4);
    private readonly ILogger<ServarrProgressService> _logger;

    public ServarrProgressService(ILogger<ServarrProgressService> logger)
    {
        _logger = logger;
    }

    public async Task<JArray> GetServerOptionsAsync(string type, CancellationToken cancellationToken)
    {
        JArray? servers = await GetSeerrServersAsync(SeerrFinPlugin.Instance.Configuration, type, cancellationToken).ConfigureAwait(false);
        return new JArray(servers?.OfType<JObject>()
            .Where(server => server.Value<int?>("id") != null)
            .Select(server => new JObject
            {
                ["serverId"] = server["id"],
                ["serverName"] = server.Value<string>("name") ?? $"Server {server.Value<int>("id")}",
                ["is4k"] = server.Value<bool?>("is4k") ?? false
            }) ?? Enumerable.Empty<JObject>());
    }

    public async Task EnrichRequestsAsync(JArray requests, CancellationToken cancellationToken)
    {
        List<ServarrRequestContext> contexts = requests
            .OfType<JObject>()
            .Select(BuildContext)
            .OfType<ServarrRequestContext>()
            .ToList();
        if (contexts.Count == 0)
        {
            return;
        }

        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        await Task.WhenAll(new[] { "radarr", "sonarr" }.Select(async type =>
        {
            List<ServarrRequestContext> typedContexts = contexts
                .Where(context => (context.Type == "tv") == (type == "sonarr"))
                .ToList();
            if (typedContexts.Count == 0)
            {
                return;
            }

            List<ServarrInstanceConfiguration> instances = await GetInstancesAsync(config, type, cancellationToken).ConfigureAwait(false);
            HashSet<bool> fallbackKinds = new();
            if (instances.Count == 1 && typedContexts.Any(context => context.ServiceId == null))
            {
                JArray? servers = await GetSeerrServersAsync(config, type, cancellationToken).ConfigureAwait(false);
                foreach (IGrouping<bool, JObject> group in (servers?.OfType<JObject>() ?? Enumerable.Empty<JObject>())
                    .GroupBy(server => server.Value<bool?>("is4k") ?? false))
                {
                    if (group.Count() == 1 && group.Single().Value<int?>("id") == instances[0].ServerId)
                    {
                        fallbackKinds.Add(group.Key);
                    }
                }
            }
            await Task.WhenAll(instances.Select(async instance =>
            {
                List<ServarrRequestContext> scoped = typedContexts.Where(context => context.ServiceId == instance.ServerId
                    || (context.ServiceId == null && fallbackKinds.Contains(context.Is4k))).ToList();
                if (scoped.Count == 0)
                {
                    return;
                }

                bool hasExternalUrl = NormalizeBrowseUrl(instance.ExternalUrl) != null;
                string browseUrl = NormalizeBrowseUrl(instance.ExternalUrl) ?? NormalizeBrowseUrl(instance.Url)!;
                foreach (ServarrRequestContext context in scoped)
                {
                    if (hasExternalUrl || context.ServiceUrl == null)
                    {
                        context.Request["servarrUrl"] = $"{browseUrl}/add/new?term=tmdb:{context.TmdbId}";
                    }
                }

                string mediaKey = string.Join(",", scoped.Select(context => $"{context.TmdbId}:{context.ExternalServiceId}").Distinct().Order());
                string cacheKey = $"{type}\n{instance.Url.Trim()}\n{instance.ApiKey.Trim()}\n{browseUrl}\n{mediaKey}";
                object? snapshot = await GetCachedAsync<object>(cacheKey, async () =>
                {
                    await _snapshotSlots.WaitAsync().ConfigureAwait(false);
                    try
                    {
                        using CancellationTokenSource timeout = new(TimeSpan.FromSeconds(20));
                        return type == "sonarr"
                            ? await LoadSonarrSnapshotAsync(instance, scoped, timeout.Token).ConfigureAwait(false)
                            : await LoadRadarrSnapshotAsync(instance, scoped, timeout.Token).ConfigureAwait(false);
                    }
                    finally
                    {
                        _snapshotSlots.Release();
                    }
                }, cancellationToken).ConfigureAwait(false);

                foreach (ServarrRequestContext context in scoped)
                {
                    ServarrProgressInfo? progress = type == "sonarr"
                        ? BuildSeriesProgress(context, snapshot as SonarrSnapshot)
                        : BuildMovieProgress(context, snapshot as RadarrSnapshot);
                    if (progress == null)
                    {
                        continue;
                    }

                    if (progress.OpenUrl != null && (hasExternalUrl || context.ServiceUrl == null))
                    {
                        context.Request["servarrUrl"] = progress.OpenUrl;
                    }
                    context.Request["servarrProgress"] = new JObject
                    {
                        ["statusLabel"] = progress.StatusLabel,
                        ["statusKey"] = progress.StatusKey,
                        ["percent"] = progress.Percent,
                        ["downloadedBytes"] = progress.DownloadedBytes,
                        ["totalBytes"] = progress.TotalBytes,
                        ["isActive"] = progress.IsActive,
                        ["openUrl"] = context.Request["servarrUrl"]
                    };
                }
            })).ConfigureAwait(false);
        })).ConfigureAwait(false);
    }

    private async Task<List<ServarrInstanceConfiguration>> GetInstancesAsync(PluginConfiguration config, string type, CancellationToken cancellationToken)
    {
        List<ServarrInstanceConfiguration>? configured = type == "sonarr" ? config.SonarrInstances : config.RadarrInstances;
        if (configured is { Count: > 0 })
        {
            return configured
                .Where(instance => instance.ServerId >= 0 && NormalizeBrowseUrl(instance.Url) != null && !string.IsNullOrWhiteSpace(instance.ApiKey))
                .GroupBy(instance => instance.ServerId)
                .Where(group => group.Count() == 1)
                .Select(group => group.Single())
                .ToList();
        }

        string? url = NormalizeBrowseUrl(type == "sonarr" ? config.SonarrUrl : config.RadarrUrl);
        string? apiKey = type == "sonarr" ? config.SonarrApiKey : config.RadarrApiKey;
        if (url == null || string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return new();
        }

        JArray? servers = await GetSeerrServersAsync(config, type, cancellationToken).ConfigureAwait(false);
        List<JObject> candidates = servers?.OfType<JObject>().Where(server => server.Value<int?>("id") != null).ToList() ?? new();
        List<JObject> matching = candidates.Where(server =>
        {
            string scheme = server.Value<bool?>("useSsl") == true ? "https" : "http";
            string connectionUrl = $"{scheme}://{server.Value<string>("hostname")}:{server.Value<int?>("port")}{server.Value<string>("baseUrl")}";
            return string.Equals(url, NormalizeBrowseUrl(connectionUrl), StringComparison.OrdinalIgnoreCase)
                || string.Equals(url, NormalizeBrowseUrl(server.Value<string>("externalUrl")), StringComparison.OrdinalIgnoreCase);
        }).ToList();
        JObject? match = matching.Count == 1 ? matching[0] : candidates.Count == 1 ? candidates[0] : null;
        return match == null ? new() : new()
        {
            new ServarrInstanceConfiguration { ServerId = match.Value<int>("id"), Url = url, ApiKey = apiKey }
        };
    }

    private Task<JArray?> GetSeerrServersAsync(PluginConfiguration config, string type, CancellationToken cancellationToken) =>
        string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey)
            ? Task.FromResult<JArray?>(null)
            : GetCachedAsync($"services\n{type}\n{config.JellyseerrUrl}\n{config.JellyseerrApiKey}", () => LoadSeerrServersAsync(config, type), cancellationToken);

    private async Task<JArray?> LoadSeerrServersAsync(PluginConfiguration config, string type)
    {
        try
        {
            using HttpClient client = new() { BaseAddress = new Uri(config.JellyseerrUrl!), Timeout = TimeSpan.FromSeconds(10) };
            client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
            JArray? servers = await GetJsonArrayAsync(client, $"/api/v1/settings/{type}", CancellationToken.None).ConfigureAwait(false);
            return servers ?? await GetJsonArrayAsync(client, $"/api/v1/service/{type}", CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to resolve legacy {ServerType} connection", type);
            return null;
        }
    }

    private async Task<T?> GetCachedAsync<T>(string key, Func<Task<T?>> load, CancellationToken cancellationToken) where T : class
    {
        CachedRead entry;
        lock (_cache)
        {
            foreach (string expired in _cache.Where(item => item.Value.IsExpired).Select(item => item.Key).ToArray())
            {
                _cache.Remove(expired);
            }
            if (!_cache.TryGetValue(key, out entry!))
            {
                entry = new CachedRead(async () => await load().ConfigureAwait(false));
                _cache[key] = entry;
            }
        }
        return (T?)await entry.Read.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    internal static string? NormalizeBrowseUrl(string? value) =>
        Uri.TryCreate(value?.Trim(), UriKind.Absolute, out Uri? uri) && (uri.Scheme == "http" || uri.Scheme == "https")
            ? uri.AbsoluteUri.TrimEnd('/') : null;

    private static ServarrRequestContext? BuildContext(JObject request)
    {
        string? type = request.Value<string>("type");
        int? tmdbId = request.Value<int?>("tmdbId");
        if (!tmdbId.HasValue || string.IsNullOrWhiteSpace(type))
        {
            return null;
        }

        HashSet<int> seasonNumbers = request.Value<JArray>("seasonNumbers")?
            .Select(v => v.Type == JTokenType.Integer ? v.Value<int>() : (int?)null)
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .ToHashSet() ?? new HashSet<int>();

        return new ServarrRequestContext(request, type, tmdbId.Value, request.Value<int?>("serviceId"), request.Value<int?>("externalServiceId"),
            request.Value<bool?>("is4k") ?? false, NormalizeBrowseUrl(request.Value<string>("servarrUrl")), seasonNumbers);
    }

    private async Task<RadarrSnapshot?> LoadRadarrSnapshotAsync(ServarrInstanceConfiguration instance, IReadOnlyCollection<ServarrRequestContext> contexts, CancellationToken cancellationToken)
    {
        try
        {
            using HttpClient client = CreateClient(instance.Url, instance.ApiKey);
            List<JObject> queueRecords = await FetchAllQueueRecordsAsync(client, includeMovie: true, cancellationToken)
                .ConfigureAwait(false);

            HashSet<int> tmdbIds = contexts
                .Where(c => !string.Equals(c.Type, "tv", StringComparison.OrdinalIgnoreCase))
                .Select(c => c.TmdbId)
                .ToHashSet();

            Dictionary<int, JObject> moviesByTmdbId = new();
            if (tmdbIds.Count > 0)
            {
                JArray? movies = await GetJsonArrayAsync(client, "movie", cancellationToken).ConfigureAwait(false);
                if (movies != null)
                {
                    foreach (JObject movie in movies.OfType<JObject>())
                    {
                        int? tmdbId = movie.Value<int?>("tmdbId");
                        if (tmdbId.HasValue && tmdbIds.Contains(tmdbId.Value))
                        {
                            moviesByTmdbId[tmdbId.Value] = movie;
                        }
                    }
                }

                foreach (ServarrRequestContext context in contexts.Where(c => !string.Equals(c.Type, "tv", StringComparison.OrdinalIgnoreCase) && !moviesByTmdbId.ContainsKey(c.TmdbId)))
                {
                    if (context.ExternalServiceId.HasValue)
                    {
                        JObject? movie = await GetJsonObjectAsync(client, $"movie/{context.ExternalServiceId.Value}", cancellationToken)
                            .ConfigureAwait(false);
                        if (movie?.Value<int?>("tmdbId") == context.TmdbId)
                        {
                            moviesByTmdbId[context.TmdbId] = movie;
                        }
                    }
                }
            }

            Dictionary<int, List<JObject>> queueByMovieId = new();
            Dictionary<int, List<JObject>> queueByTmdbId = new();
            foreach (JObject record in queueRecords)
            {
                int? movieId = record.Value<int?>("movieId");
                if (movieId.HasValue)
                {
                    AddToLookup(queueByMovieId, movieId.Value, record);
                }

                int? tmdbId = record.Value<JObject>("movie")?.Value<int?>("tmdbId");
                if (tmdbId.HasValue)
                {
                    AddToLookup(queueByTmdbId, tmdbId.Value, record);
                }
            }

            return new RadarrSnapshot(NormalizeBrowseUrl(instance.ExternalUrl) ?? NormalizeBrowseUrl(instance.Url)!, moviesByTmdbId, queueByMovieId, queueByTmdbId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to load Radarr progress snapshot from {RadarrUrl}", instance.Url);
            return null;
        }
    }

    private async Task<SonarrSnapshot?> LoadSonarrSnapshotAsync(ServarrInstanceConfiguration instance, IReadOnlyCollection<ServarrRequestContext> contexts, CancellationToken cancellationToken)
    {
        try
        {
            using HttpClient client = CreateClient(instance.Url, instance.ApiKey);
            List<JObject> queueRecords = await FetchAllQueueRecordsAsync(client, includeMovie: false, cancellationToken)
                .ConfigureAwait(false);

            HashSet<int> tmdbIds = contexts
                .Where(c => string.Equals(c.Type, "tv", StringComparison.OrdinalIgnoreCase))
                .Select(c => c.TmdbId)
                .ToHashSet();

            Dictionary<int, JObject> seriesByTmdbId = new();
            Dictionary<int, List<JObject>> episodesBySeriesId = new();
            if (tmdbIds.Count > 0)
            {
                JArray? seriesList = await GetJsonArrayAsync(client, "series", cancellationToken).ConfigureAwait(false);
                if (seriesList != null)
                {
                    foreach (JObject series in seriesList.OfType<JObject>())
                    {
                        int? tmdbId = series.Value<int?>("tmdbId");
                        if (!tmdbId.HasValue || !tmdbIds.Contains(tmdbId.Value))
                        {
                            continue;
                        }

                        seriesByTmdbId[tmdbId.Value] = series;
                        int? seriesId = series.Value<int?>("id");
                        if (!seriesId.HasValue)
                        {
                            continue;
                        }

                        JArray? episodes = await GetJsonArrayAsync(client, $"episode?seriesId={seriesId.Value}", cancellationToken)
                            .ConfigureAwait(false);
                        if (episodes != null)
                        {
                            episodesBySeriesId[seriesId.Value] = episodes.OfType<JObject>().ToList();
                        }
                    }
                }

                foreach (ServarrRequestContext context in contexts.Where(c =>
                             string.Equals(c.Type, "tv", StringComparison.OrdinalIgnoreCase)
                             && !seriesByTmdbId.ContainsKey(c.TmdbId)))
                {
                    if (context.ExternalServiceId.HasValue)
                    {
                        JObject? series = await GetJsonObjectAsync(client, $"series/{context.ExternalServiceId.Value}", cancellationToken)
                            .ConfigureAwait(false);
                        if (series?.Value<int?>("tmdbId") != context.TmdbId)
                        {
                            continue;
                        }

                        seriesByTmdbId[context.TmdbId] = series;
                        int? seriesId = series.Value<int?>("id");
                        if (!seriesId.HasValue)
                        {
                            continue;
                        }

                        JArray? episodes = await GetJsonArrayAsync(client, $"episode?seriesId={seriesId.Value}", cancellationToken)
                            .ConfigureAwait(false);
                        if (episodes != null)
                        {
                            episodesBySeriesId[seriesId.Value] = episodes.OfType<JObject>().ToList();
                        }
                    }
                }
            }

            Dictionary<int, List<JObject>> queueBySeriesId = new();
            foreach (JObject record in queueRecords)
            {
                int? seriesId = record.Value<int?>("seriesId");
                if (seriesId.HasValue)
                {
                    AddToLookup(queueBySeriesId, seriesId.Value, record);
                }
            }

            return new SonarrSnapshot(NormalizeBrowseUrl(instance.ExternalUrl) ?? NormalizeBrowseUrl(instance.Url)!, seriesByTmdbId, episodesBySeriesId, queueBySeriesId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to load Sonarr progress snapshot from {SonarrUrl}", instance.Url);
            return null;
        }
    }

    private static ServarrProgressInfo? BuildMovieProgress(ServarrRequestContext context, RadarrSnapshot? snapshot)
    {
        if (snapshot == null)
        {
            return null;
        }

        JObject? movie = snapshot.MoviesByTmdbId.GetValueOrDefault(context.TmdbId);
        int? movieId = movie?.Value<int?>("id");

        List<JObject> queueItems = movieId.HasValue && snapshot.QueueByMovieId.TryGetValue(movieId.Value, out List<JObject>? byId)
            ? byId.Where(record => record.Value<JObject>("movie")?.Value<int?>("tmdbId") is not int tmdbId || tmdbId == context.TmdbId).ToList()
            : snapshot.QueueByTmdbId.GetValueOrDefault(context.TmdbId) ?? new List<JObject>();

        if (queueItems.Count > 0)
        {
            return BuildQueueProgress(queueItems, snapshot.BaseUrl, movie, isMovie: true);
        }

        if (movie == null)
        {
            return null;
        }

        return BuildLibraryProgress(
            hasFile: movie.Value<bool?>("hasFile") ?? false,
            monitored: movie.Value<bool?>("monitored") ?? false,
            isUnreleased: IsUnreleasedMedia(movie.Value<string>("status")),
            sizeOnDisk: movie.Value<long?>("sizeOnDisk") ?? 0,
            openUrl: BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(movie), isMovie: true));
    }

    private static ServarrProgressInfo? BuildSeriesProgress(ServarrRequestContext context, SonarrSnapshot? snapshot)
    {
        if (snapshot == null)
        {
            return null;
        }

        if (!snapshot.SeriesByTmdbId.TryGetValue(context.TmdbId, out JObject? series))
        {
            return null;
        }

        int? seriesId = series.Value<int?>("id");
        List<JObject> queueItems = seriesId.HasValue && snapshot.QueueBySeriesId.TryGetValue(seriesId.Value, out List<JObject>? queued)
            ? FilterQueueBySeasons(queued.Where(record => record.Value<JObject>("series")?.Value<int?>("tmdbId") is not int tmdbId || tmdbId == context.TmdbId), context.SeasonNumbers)
            : new List<JObject>();

        if (queueItems.Count > 0)
        {
            return BuildQueueProgress(queueItems, snapshot.BaseUrl, series, isMovie: false);
        }

        List<JObject> episodes = seriesId.HasValue && snapshot.EpisodesBySeriesId.TryGetValue(seriesId.Value, out List<JObject>? eps)
            ? FilterEpisodesBySeasons(eps, context.SeasonNumbers)
            : new List<JObject>();

        if (episodes.Count == 0)
        {
            bool monitored = series.Value<bool?>("monitored") ?? false;
            long sizeOnDisk = series.Value<long?>("sizeOnDisk") ?? 0;
            bool hasFile = sizeOnDisk > 0;
            return BuildLibraryProgress(hasFile, monitored, isUnreleased: false, sizeOnDisk, BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(series), isMovie: false));
        }

        bool anyFile = episodes.Any(e => e.Value<bool?>("hasFile") == true);
        bool allHaveFiles = episodes.All(e => e.Value<bool?>("hasFile") == true);
        bool anyMonitored = episodes.Any(e => e.Value<bool?>("monitored") == true);
        bool allMonitored = episodes.All(e => e.Value<bool?>("monitored") == true);
        bool anyMissingMonitored = episodes.Any(e => e.Value<bool?>("hasFile") != true && e.Value<bool?>("monitored") == true);
        bool allUnreleased = episodes.All(e =>
            IsUnreleasedMedia(e.Value<string>("airDateUtc") ?? e.Value<string>("airDate")));
        long totalSize = episodes.Where(e => e.Value<bool?>("hasFile") == true)
            .Sum(e => e.Value<long?>("sizeOnDisk") ?? 0);
        string? seriesOpenUrl = BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(series), isMovie: false);

        if (allUnreleased && !anyFile)
        {
            return BuildLibraryProgress(false, anyMonitored, true, 0, seriesOpenUrl);
        }

        if (allHaveFiles && allMonitored)
        {
            return BuildLibraryProgress(true, true, false, totalSize, seriesOpenUrl);
        }

        if (allHaveFiles)
        {
            return BuildLibraryProgress(true, false, false, totalSize, seriesOpenUrl);
        }

        if (!anyFile && anyMonitored)
        {
            return BuildLibraryProgress(false, true, false, 0, seriesOpenUrl);
        }

        return BuildLibraryProgress(false, anyMissingMonitored, false, 0, seriesOpenUrl);
    }

    private static ServarrProgressInfo BuildQueueProgress(IReadOnlyCollection<JObject> queueItems, string baseUrl, JObject? media, bool isMovie)
    {
        double totalSize = queueItems.Sum(item => item.Value<double?>("size") ?? 0);
        double sizeLeft = queueItems.Sum(item => item.Value<double?>("sizeleft") ?? 0);
        double downloaded = Math.Max(0, totalSize - sizeLeft);
        int percent = totalSize > 0 ? (int)Math.Round(downloaded / totalSize * 100) : 0;
        string? titleSlug = GetTitleSlug(media)
            ?? queueItems
                .Select(item => GetTitleSlug(isMovie ? item["movie"] as JObject : item["series"] as JObject))
                .FirstOrDefault(slug => !string.IsNullOrWhiteSpace(slug));

        return new ServarrProgressInfo
        {
            StatusLabel = "Queued",
            StatusKey = "queued",
            Percent = percent,
            DownloadedBytes = (long)downloaded,
            TotalBytes = (long)totalSize,
            IsActive = true,
            OpenUrl = BuildServarrOpenUrl(baseUrl, titleSlug, isMovie)
        };
    }

    private static ServarrProgressInfo BuildLibraryProgress(bool hasFile, bool monitored, bool isUnreleased, long sizeOnDisk, string? openUrl = null)
    {
        if (isUnreleased)
        {
            return new ServarrProgressInfo
            {
                StatusLabel = "Unreleased",
                StatusKey = "unreleased",
                Percent = 0,
                DownloadedBytes = 0,
                TotalBytes = 0,
                IsActive = false,
                OpenUrl = openUrl
            };
        }

        bool downloadedActive = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Servarr.DownloadedProgressIsActive;

        if (hasFile && monitored)
        {
            return new ServarrProgressInfo
            {
                StatusLabel = "Downloaded (Monitored)",
                StatusKey = "downloaded-monitored",
                Percent = 100,
                DownloadedBytes = sizeOnDisk,
                TotalBytes = sizeOnDisk,
                IsActive = downloadedActive,
                OpenUrl = openUrl
            };
        }

        if (hasFile)
        {
            return new ServarrProgressInfo
            {
                StatusLabel = "Downloaded (Unmonitored)",
                StatusKey = "downloaded-unmonitored",
                Percent = 100,
                DownloadedBytes = sizeOnDisk,
                TotalBytes = sizeOnDisk,
                IsActive = downloadedActive,
                OpenUrl = openUrl
            };
        }

        if (monitored)
        {
            return new ServarrProgressInfo
            {
                StatusLabel = "Missing (Monitored)",
                StatusKey = "missing-monitored",
                Percent = 0,
                DownloadedBytes = 0,
                TotalBytes = 0,
                IsActive = false,
                OpenUrl = openUrl
            };
        }

        return new ServarrProgressInfo
        {
            StatusLabel = "Missing (Unmonitored)",
            StatusKey = "missing-unmonitored",
            Percent = 0,
            DownloadedBytes = 0,
            TotalBytes = 0,
            IsActive = false,
            OpenUrl = openUrl
        };
    }

    private static string? GetTitleSlug(JObject? media) => media?.Value<string>("titleSlug");

    private static string? BuildServarrOpenUrl(string baseUrl, string? titleSlug, bool isMovie) =>
        !string.IsNullOrWhiteSpace(titleSlug)
            ? $"{baseUrl}/{(isMovie ? "movie" : "series")}/{titleSlug.Trim()}"
            : null;

    private static bool IsUnreleasedMedia(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (string.Equals(value, "announced", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "inCinemas", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out DateTime parsed)
            && parsed.ToUniversalTime() > DateTime.UtcNow;
    }

    private static List<JObject> FilterQueueBySeasons(IEnumerable<JObject> queueItems, HashSet<int> seasonNumbers)
    {
        if (seasonNumbers.Count == 0)
        {
            return queueItems.ToList();
        }

        return queueItems
            .Where(item =>
            {
                int? seasonNumber = item.Value<JObject>("episode")?.Value<int?>("seasonNumber");
                return seasonNumber.HasValue && seasonNumbers.Contains(seasonNumber.Value);
            })
            .ToList();
    }

    private static List<JObject> FilterEpisodesBySeasons(IEnumerable<JObject> episodes, HashSet<int> seasonNumbers)
    {
        bool includeSpecials = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Servarr.IncludeSpecialsInSeriesProgress;
        IEnumerable<JObject> scoped = includeSpecials
            ? episodes
            : episodes.Where(e => e.Value<int?>("seasonNumber") != 0);
        if (seasonNumbers.Count == 0)
        {
            return scoped.ToList();
        }

        return scoped.Where(e =>
        {
            int? seasonNumber = e.Value<int?>("seasonNumber");
            return seasonNumber.HasValue && seasonNumbers.Contains(seasonNumber.Value);
        }).ToList();
    }

    private static async Task<List<JObject>> FetchAllQueueRecordsAsync(HttpClient client, bool includeMovie, CancellationToken cancellationToken)
    {
        List<JObject> records = new();
        int page = 1;
        const int pageSize = 250;

        while (true)
        {
            string path = includeMovie
                ? $"queue?page={page}&pageSize={pageSize}&includeMovie=true"
                : $"queue?page={page}&pageSize={pageSize}&includeSeries=true&includeEpisode=true";

            JObject? payload = await GetJsonObjectAsync(client, path, cancellationToken).ConfigureAwait(false);
            if (payload == null)
            {
                break;
            }

            JArray? pageRecords = payload.Value<JArray>("records");
            if (pageRecords == null || pageRecords.Count == 0)
            {
                break;
            }

            records.AddRange(pageRecords.OfType<JObject>());

            int totalRecords = payload.Value<int?>("totalRecords") ?? records.Count;
            if (records.Count >= totalRecords)
            {
                break;
            }

            page++;
        }

        return records;
    }

    private static async Task<JArray?> GetJsonArrayAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await client.GetAsync(path.TrimStart('/'), cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        string raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        JToken token = JToken.Parse(raw);
        return token as JArray;
    }

    private static async Task<JObject?> GetJsonObjectAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await client.GetAsync(path.TrimStart('/'), cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        string raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JObject.Parse(raw);
    }

    private static HttpClient CreateClient(string baseUrl, string apiKey)
    {
        string normalized = baseUrl.Trim().TrimEnd('/');
        HttpClient client = new() { BaseAddress = new Uri(normalized + "/api/v3/"), Timeout = TimeSpan.FromSeconds(10) };
        client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
        return client;
    }

    private static void AddToLookup(Dictionary<int, List<JObject>> lookup, int key, JObject value)
    {
        if (!lookup.TryGetValue(key, out List<JObject>? list))
        {
            list = new List<JObject>();
            lookup[key] = list;
        }

        list.Add(value);
    }

    private sealed class CachedRead
    {
        private DateTime _completedAt;

        public CachedRead(Func<Task<object?>> load)
        {
            Read = new Lazy<Task<object?>>(async () =>
            {
                try
                {
                    return await load().ConfigureAwait(false);
                }
                finally
                {
                    _completedAt = DateTime.UtcNow;
                }
            });
        }

        public Lazy<Task<object?>> Read { get; }

        public bool IsExpired => Read.IsValueCreated && Read.Value.IsCompleted && DateTime.UtcNow - _completedAt >= SnapshotLifetime;
    }

    private sealed record ServarrRequestContext(
        JObject Request,
        string Type,
        int TmdbId,
        int? ServiceId,
        int? ExternalServiceId,
        bool Is4k,
        string? ServiceUrl,
        HashSet<int> SeasonNumbers);

    private sealed record RadarrSnapshot(
        string BaseUrl,
        Dictionary<int, JObject> MoviesByTmdbId,
        Dictionary<int, List<JObject>> QueueByMovieId,
        Dictionary<int, List<JObject>> QueueByTmdbId);

    private sealed record SonarrSnapshot(
        string BaseUrl,
        Dictionary<int, JObject> SeriesByTmdbId,
        Dictionary<int, List<JObject>> EpisodesBySeriesId,
        Dictionary<int, List<JObject>> QueueBySeriesId);

    private sealed class ServarrProgressInfo
    {
        public string StatusLabel { get; set; } = string.Empty;

        public string StatusKey { get; set; } = string.Empty;

        public int Percent { get; set; }

        public long DownloadedBytes { get; set; }

        public long TotalBytes { get; set; }

        public bool IsActive { get; set; }

        public string? OpenUrl { get; set; }
    }
}
