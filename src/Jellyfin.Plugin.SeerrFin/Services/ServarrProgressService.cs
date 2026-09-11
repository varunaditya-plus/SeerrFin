using System.Globalization;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public sealed class ServarrProgressService
{
    private readonly ILogger<ServarrProgressService> _logger;

    public ServarrProgressService(ILogger<ServarrProgressService> logger)
    {
        _logger = logger;
    }

    public async Task EnrichRequestsAsync(JArray requests, CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        IReadOnlyList<ServarrInstanceConfig> radarrInstances = ServarrConfigHelper.GetConfiguredInstances(config, "radarr");
        IReadOnlyList<ServarrInstanceConfig> sonarrInstances = ServarrConfigHelper.GetConfiguredInstances(config, "sonarr");
        if (radarrInstances.Count == 0 && sonarrInstances.Count == 0)
        {
            return;
        }

        List<ServarrRequestContext> contexts = requests
            .OfType<JObject>()
            .Select(BuildContext)
            .Where(c => c != null)
            .Cast<ServarrRequestContext>()
            .ToList();

        if (contexts.Count == 0)
        {
            return;
        }

        List<RadarrSnapshot> radarrSnapshots = radarrInstances.Count > 0
            ? await LoadRadarrSnapshotsAsync(radarrInstances, contexts, cancellationToken).ConfigureAwait(false)
            : new List<RadarrSnapshot>();

        List<SonarrSnapshot> sonarrSnapshots = sonarrInstances.Count > 0
            ? await LoadSonarrSnapshotsAsync(sonarrInstances, contexts, cancellationToken).ConfigureAwait(false)
            : new List<SonarrSnapshot>();

        foreach (ServarrRequestContext context in contexts)
        {
            ServarrProgressInfo? progress = string.Equals(context.Type, "tv", StringComparison.OrdinalIgnoreCase)
                ? BuildSeriesProgress(context, ResolveSonarrSnapshot(context, sonarrSnapshots))
                : BuildMovieProgress(context, ResolveRadarrSnapshot(context, radarrSnapshots));

            if (progress != null)
            {
                context.Request["servarrProgress"] = new JObject
                {
                    ["statusLabel"] = progress.StatusLabel,
                    ["statusKey"] = progress.StatusKey,
                    ["percent"] = progress.Percent,
                    ["downloadedBytes"] = progress.DownloadedBytes,
                    ["totalBytes"] = progress.TotalBytes,
                    ["isActive"] = progress.IsActive,
                    ["openUrl"] = progress.OpenUrl,
                    ["instanceName"] = progress.InstanceName
                };
            }
        }
    }

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

        bool is4k = request.Value<bool?>("is4k") ?? false;

        return new ServarrRequestContext(request, type, tmdbId.Value, request.Value<int?>("externalServiceId"), seasonNumbers, is4k);
    }

    private async Task<List<RadarrSnapshot>> LoadRadarrSnapshotsAsync(
        IReadOnlyCollection<ServarrInstanceConfig> instances,
        IReadOnlyCollection<ServarrRequestContext> contexts,
        CancellationToken cancellationToken)
    {
        RadarrSnapshot?[] snapshots = await Task.WhenAll(
                instances.Select(instance => LoadRadarrSnapshotAsync(instance, contexts, cancellationToken)))
            .ConfigureAwait(false);

        return snapshots.Where(snapshot => snapshot != null).Cast<RadarrSnapshot>().ToList();
    }

    private async Task<List<SonarrSnapshot>> LoadSonarrSnapshotsAsync(
        IReadOnlyCollection<ServarrInstanceConfig> instances,
        IReadOnlyCollection<ServarrRequestContext> contexts,
        CancellationToken cancellationToken)
    {
        SonarrSnapshot?[] snapshots = await Task.WhenAll(
                instances.Select(instance => LoadSonarrSnapshotAsync(instance, contexts, cancellationToken)))
            .ConfigureAwait(false);

        return snapshots.Where(snapshot => snapshot != null).Cast<SonarrSnapshot>().ToList();
    }

    private async Task<RadarrSnapshot?> LoadRadarrSnapshotAsync(
        ServarrInstanceConfig instance,
        IReadOnlyCollection<ServarrRequestContext> contexts,
        CancellationToken cancellationToken)
    {
        try
        {
            using HttpClient client = CreateClient(instance.Url!, instance.ApiKey!);
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
                        if (movie != null)
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

            return new RadarrSnapshot(
                instance.Name?.Trim() ?? ServarrConfigHelper.GetKindLabel(instance.Kind),
                instance.IsDefault,
                instance.Is4k,
                NormalizeServarrBaseUrl(instance.Url!),
                moviesByTmdbId,
                queueByMovieId,
                queueByTmdbId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SF • failed to load Radarr progress snapshot from {RadarrUrl} ({Name})", instance.Url, instance.Name);
            return null;
        }
    }

    private async Task<SonarrSnapshot?> LoadSonarrSnapshotAsync(
        ServarrInstanceConfig instance,
        IReadOnlyCollection<ServarrRequestContext> contexts,
        CancellationToken cancellationToken)
    {
        try
        {
            using HttpClient client = CreateClient(instance.Url!, instance.ApiKey!);
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
                        if (series == null)
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

            return new SonarrSnapshot(
                instance.Name?.Trim() ?? ServarrConfigHelper.GetKindLabel(instance.Kind),
                instance.IsDefault,
                NormalizeServarrBaseUrl(instance.Url!),
                seriesByTmdbId,
                episodesBySeriesId,
                queueBySeriesId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SF • failed to load Sonarr progress snapshot from {SonarrUrl} ({Name})", instance.Url, instance.Name);
            return null;
        }
    }

    private static RadarrSnapshot? ResolveRadarrSnapshot(ServarrRequestContext context, IReadOnlyCollection<RadarrSnapshot> snapshots)
    {
        if (snapshots.Count == 0)
        {
            return null;
        }

        List<RadarrSnapshot> matches = snapshots.Where(snapshot => snapshot.Matches(context)).ToList();
        List<RadarrSnapshot> preferred = matches.Where(snapshot => snapshot.Is4k == context.Is4k).ToList();
        IReadOnlyCollection<RadarrSnapshot> pool = preferred.Count > 0 ? preferred : matches.Count > 0 ? matches : snapshots;

        return pool.FirstOrDefault(snapshot => snapshot.IsDefault) ?? pool.FirstOrDefault();
    }

    private static SonarrSnapshot? ResolveSonarrSnapshot(ServarrRequestContext context, IReadOnlyCollection<SonarrSnapshot> snapshots)
    {
        if (snapshots.Count == 0)
        {
            return null;
        }

        List<SonarrSnapshot> matches = snapshots.Where(snapshot => snapshot.Matches(context)).ToList();
        IReadOnlyCollection<SonarrSnapshot> pool = matches.Count > 0 ? matches : snapshots;

        return pool.FirstOrDefault(snapshot => snapshot.IsDefault) ?? pool.FirstOrDefault();
    }

    private static ServarrProgressInfo? BuildMovieProgress(ServarrRequestContext context, RadarrSnapshot? snapshot)
    {
        if (snapshot == null)
        {
            return null;
        }

        JObject? movie = snapshot.MoviesByTmdbId.GetValueOrDefault(context.TmdbId);
        int? movieId = movie?.Value<int?>("id") ?? context.ExternalServiceId;

        List<JObject> queueItems = movieId.HasValue && snapshot.QueueByMovieId.TryGetValue(movieId.Value, out List<JObject>? byId)
            ? byId
            : snapshot.QueueByTmdbId.GetValueOrDefault(context.TmdbId) ?? new List<JObject>();

        if (queueItems.Count > 0)
        {
            return BuildQueueProgress(queueItems, snapshot.BaseUrl, movie, isMovie: true, snapshot.InstanceName);
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
            openUrl: BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(movie), isMovie: true),
            instanceName: snapshot.InstanceName);
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

        int? seriesId = series.Value<int?>("id") ?? context.ExternalServiceId;
        List<JObject> queueItems = seriesId.HasValue && snapshot.QueueBySeriesId.TryGetValue(seriesId.Value, out List<JObject>? queued)
            ? FilterQueueBySeasons(queued, context.SeasonNumbers)
            : new List<JObject>();

        if (queueItems.Count > 0)
        {
            return BuildQueueProgress(queueItems, snapshot.BaseUrl, series, isMovie: false, snapshot.InstanceName);
        }

        List<JObject> episodes = seriesId.HasValue && snapshot.EpisodesBySeriesId.TryGetValue(seriesId.Value, out List<JObject>? eps)
            ? FilterEpisodesBySeasons(eps, context.SeasonNumbers)
            : new List<JObject>();

        if (episodes.Count == 0)
        {
            bool monitored = series.Value<bool?>("monitored") ?? false;
            long sizeOnDisk = series.Value<long?>("sizeOnDisk") ?? 0;
            bool hasFile = sizeOnDisk > 0;
            return BuildLibraryProgress(
                hasFile,
                monitored,
                isUnreleased: false,
                sizeOnDisk,
                BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(series), isMovie: false),
                snapshot.InstanceName);
        }

        bool anyFile = episodes.Any(e => e.Value<bool?>("hasFile") == true);
        bool allHaveFiles = episodes.All(e => e.Value<bool?>("hasFile") == true);
        bool anyMonitored = episodes.Any(e => e.Value<bool?>("monitored") == true);
        bool allMonitored = episodes.All(e => e.Value<bool?>("monitored") == true);
        bool allUnreleased = episodes.All(e =>
            IsUnreleasedMedia(e.Value<string>("airDateUtc") ?? e.Value<string>("airDate")));
        long totalSize = episodes.Where(e => e.Value<bool?>("hasFile") == true)
            .Sum(e => e.Value<long?>("sizeOnDisk") ?? 0);
        string? seriesOpenUrl = BuildServarrOpenUrl(snapshot.BaseUrl, GetTitleSlug(series), isMovie: false);

        if (allUnreleased && !anyFile)
        {
            return BuildLibraryProgress(false, anyMonitored, true, 0, seriesOpenUrl, snapshot.InstanceName);
        }

        if (allHaveFiles && allMonitored)
        {
            return BuildLibraryProgress(true, true, false, totalSize, seriesOpenUrl, snapshot.InstanceName);
        }

        if (allHaveFiles)
        {
            return BuildLibraryProgress(true, false, false, totalSize, seriesOpenUrl, snapshot.InstanceName);
        }

        if (!anyFile && anyMonitored)
        {
            return BuildLibraryProgress(false, true, false, 0, seriesOpenUrl, snapshot.InstanceName);
        }

        return BuildLibraryProgress(false, false, false, 0, seriesOpenUrl, snapshot.InstanceName);
    }

    private static ServarrProgressInfo BuildQueueProgress(
        IReadOnlyCollection<JObject> queueItems,
        string baseUrl,
        JObject? media,
        bool isMovie,
        string instanceName)
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
            OpenUrl = BuildServarrOpenUrl(baseUrl, titleSlug, isMovie),
            InstanceName = instanceName
        };
    }

    private static ServarrProgressInfo BuildLibraryProgress(
        bool hasFile,
        bool monitored,
        bool isUnreleased,
        long sizeOnDisk,
        string? openUrl = null,
        string? instanceName = null)
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
                OpenUrl = openUrl,
                InstanceName = instanceName ?? string.Empty
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
                OpenUrl = openUrl,
                InstanceName = instanceName ?? string.Empty
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
                OpenUrl = openUrl,
                InstanceName = instanceName ?? string.Empty
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
                OpenUrl = openUrl,
                InstanceName = instanceName ?? string.Empty
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
            OpenUrl = openUrl,
            InstanceName = instanceName ?? string.Empty
        };
    }

    private static string NormalizeServarrBaseUrl(string baseUrl) => baseUrl.Trim().TrimEnd('/');

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
        HttpClient client = new() { BaseAddress = new Uri(normalized + "/api/v3/") };
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

    private sealed record ServarrRequestContext(
        JObject Request,
        string Type,
        int TmdbId,
        int? ExternalServiceId,
        HashSet<int> SeasonNumbers,
        bool Is4k);

    private sealed record RadarrSnapshot(
        string InstanceName,
        bool IsDefault,
        bool Is4k,
        string BaseUrl,
        Dictionary<int, JObject> MoviesByTmdbId,
        Dictionary<int, List<JObject>> QueueByMovieId,
        Dictionary<int, List<JObject>> QueueByTmdbId)
    {
        public bool Matches(ServarrRequestContext context) =>
            MoviesByTmdbId.ContainsKey(context.TmdbId)
            || QueueByTmdbId.ContainsKey(context.TmdbId)
            || (context.ExternalServiceId.HasValue && QueueByMovieId.ContainsKey(context.ExternalServiceId.Value));
    }

    private sealed record SonarrSnapshot(
        string InstanceName,
        bool IsDefault,
        string BaseUrl,
        Dictionary<int, JObject> SeriesByTmdbId,
        Dictionary<int, List<JObject>> EpisodesBySeriesId,
        Dictionary<int, List<JObject>> QueueBySeriesId)
    {
        public bool Matches(ServarrRequestContext context) =>
            SeriesByTmdbId.ContainsKey(context.TmdbId)
            || (context.ExternalServiceId.HasValue && QueueBySeriesId.ContainsKey(context.ExternalServiceId.Value));
    }

    private sealed class ServarrProgressInfo
    {
        public string StatusLabel { get; set; } = string.Empty;

        public string StatusKey { get; set; } = string.Empty;

        public int Percent { get; set; }

        public long DownloadedBytes { get; set; }

        public long TotalBytes { get; set; }

        public bool IsActive { get; set; }

        public string? OpenUrl { get; set; }

        public string InstanceName { get; set; } = string.Empty;
    }
}
