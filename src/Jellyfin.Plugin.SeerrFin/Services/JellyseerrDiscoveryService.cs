using System.Globalization;
using System.Net.Http.Headers;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using Jellyfin.Plugin.SeerrFin.Helpers;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class JellyseerrDiscoveryService
{
    // For future reference: 1 UNKNOWN, 2 PENDING, 3 PROCESSING, 4 PARTIALLY_AVAILABLE, 5 AVAILABLE, 6 BLOCKLISTED, 7 DELETED.

    private readonly ImageCacheService _imageCacheService;
    private readonly ILogger<JellyseerrDiscoveryService> _logger;

    public JellyseerrDiscoveryService(
        ImageCacheService imageCacheService,
        ILogger<JellyseerrDiscoveryService> logger)
    {
        _imageCacheService = imageCacheService;
        _logger = logger;
    }

    public QueryResult<BaseItemDto> GetAnimeRow(string username, int startIndex = 0, int? limit = null)
    {
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Discovery;
        return GetDiscoverRow(username, discovery.AnimeDiscoverPath, "tv", startIndex, limit, useSeerrMapping: discovery.UseSeerrMappingForAnime);
    }

    public QueryResult<BaseItemDto> Search(string username, string query, string? language = null)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) ||
            string.IsNullOrWhiteSpace(config.JellyseerrApiKey) ||
            string.IsNullOrWhiteSpace(username) ||
            string.IsNullOrWhiteSpace(query))
        {
            return EmptyResult();
        }

        query = query.Trim();
        if (query.Length > 256)
        {
            int cut = 256;
            if (cut > 0 && char.IsHighSurrogate(query[cut - 1]))
            {
                cut--;
            }

            query = query[..cut];
        }

        using HttpClient client = CreateClient(config);
        int? jellyseerrUserId = ResolveJellyseerrUserId(client, username);
        if (jellyseerrUserId == null)
        {
            return EmptyResult();
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());

        try
        {
            string path = $"/api/v1/search?query={Uri.EscapeDataString(query)}";
            if (!string.IsNullOrWhiteSpace(language))
            {
                path += $"&language={Uri.EscapeDataString(language.Trim())}";
            }

            HttpResponseMessage response = client.GetAsync(path).GetAwaiter().GetResult();
            if (!response.IsSuccessStatusCode)
            {
                return EmptyResult();
            }

            string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            JObject json = JObject.Parse(jsonRaw);
            JArray? results = json.Value<JArray>("results");
            if (results == null || results.Count == 0)
            {
                return EmptyResult();
            }

            DiscoverItemFilterOptions mapping = ResolveSearchMapping();
            List<BaseItemDto> items = new();
            foreach (JObject item in results.OfType<JObject>())
            {
                string? mediaType = item.Value<string>("mediaType");
                if (!string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(mediaType, "tv", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                BaseItemDto? dto = MapDiscoverItem(item, mapping);
                if (dto != null)
                {
                    items.Add(dto);
                }
            }

            return new QueryResult<BaseItemDto>
            {
                Items = items.ToArray(),
                StartIndex = 0,
                TotalRecordCount = items.Count
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to search Seerr for {Query}", query);
            return EmptyResult();
        }
    }

    public QueryResult<BaseItemDto> GetDiscoverRow(string username, string jellyseerrPath, string? mediaTypeFilter = null, int startIndex = 0, int? limit = null, bool useSeerrMapping = false)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return EmptyResult();
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            return EmptyResult();
        }

        using HttpClient client = CreateClient(config);
        int? jellyseerrUserId = ResolveJellyseerrUserId(client, username);
        if (jellyseerrUserId == null)
        {
            return EmptyResult();
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());

        string? tmdbApiKey = config.TmdbApiKey?.Trim();
        bool hasReleaseTypeFilter = ShouldApplyReleaseTypeFilter(mediaTypeFilter, jellyseerrPath, config);
        if (hasReleaseTypeFilter && string.IsNullOrWhiteSpace(tmdbApiKey))
        {
            _logger.LogWarning("SeerrFin • release type filters are configured but no TMDB API key set");
            return EmptyResult();
        }

        JObject preferences;
        JObject defaults = new();
        try
        {
            bool provider = jellyseerrPath.Contains("watchProviders=", StringComparison.Ordinal);
            preferences = hasReleaseTypeFilter || provider ? JellyseerrProfileService.ReadMainAsync(client, jellyseerrUserId.Value).GetAwaiter().GetResult() : new JObject();
            if (hasReleaseTypeFilter || provider) defaults = JellyseerrProfileService.ReadDefaultsAsync(client).GetAwaiter().GetResult();
            if (provider && !jellyseerrPath.Contains("watchRegion=", StringComparison.Ordinal))
                jellyseerrPath += "&watchRegion=" + Uri.EscapeDataString(JellyseerrProfileService.StreamingRegion(preferences, config, defaults));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to load personal discovery preferences");
            return EmptyResult();
        }

        bool useTmdbReleaseFilter = hasReleaseTypeFilter;
        Dictionary<int, bool> releaseTypeCache = new();

        // Seerr mapping needs to be used for Anime discovery because of Seerr's default filters applied on their direct API.
        AdvancedDiscoverySettings discoverySettings = AdvancedSettingsHelper.Resolve(config).Discovery;
        DiscoverItemFilterOptions mapping = ResolveMapping(config, useSeerrMapping);

        List<BaseItemDto> items = new();
        int jellyseerrPage = 1;
        int targetLimit = Math.Max(1, limit ?? config.RowItemLimit);
        int skipped = 0;
        int totalResults = 0;
        bool isGridRequest = limit.HasValue;
        int maxJellyseerrPages = isGridRequest ? discoverySettings.GridMaxJellyseerrPages : discoverySettings.CarouselMaxJellyseerrPages;

        // Paginate until we have enough items or hit the max pages
        while (items.Count < targetLimit && jellyseerrPage <= maxJellyseerrPages)
        {
            try
            {
                JObject? json;
                if (useTmdbReleaseFilter)
                {
                    if (jellyseerrPath.Contains("/discover/trending", StringComparison.OrdinalIgnoreCase))
                    {
                        json = FetchTmdbTrendingMoviesJson(tmdbApiKey!, config, jellyseerrPage, releaseTypeCache, preferences.Value<string>("locale") is { Length: > 0 } locale ? locale : defaults.Value<string>("locale") ?? "en");
                    }
                    else
                    {
                        string url = BuildTmdbDiscoverUrl(jellyseerrPath, config, jellyseerrPage, preferences, defaults);
                        json = FetchTmdbDiscoverJson(url, tmdbApiKey!);
                    }
                }
                else
                {
                    string path = jellyseerrPath.Contains('?', StringComparison.Ordinal)
                        ? $"{jellyseerrPath}&page={jellyseerrPage}"
                        : $"{jellyseerrPath}?page={jellyseerrPage}";

                    HttpResponseMessage response = client.GetAsync(path).GetAwaiter().GetResult();
                    if (!response.IsSuccessStatusCode)
                    {
                        break;
                    }

                    string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    json = JObject.Parse(jsonRaw);
                }

                if (json == null)
                {
                    break;
                }

                JArray? results = json.Value<JArray>("results");
                if (results == null || results.Count == 0)
                {
                    if (useTmdbReleaseFilter
                        && jellyseerrPath.Contains("/discover/trending", StringComparison.OrdinalIgnoreCase)
                        && jellyseerrPage < maxJellyseerrPages)
                    {
                        jellyseerrPage++;
                        continue;
                    }

                    break;
                }

                totalResults = json.Value<int?>("totalResults") ?? json.Value<int?>("total_results") ?? totalResults;

                foreach (JObject item in results.OfType<JObject>())
                {
                    if (items.Count >= targetLimit)
                    {
                        break;
                    }

                    string? itemMediaType = item.Value<string>("mediaType");
                    if (!string.IsNullOrEmpty(mediaTypeFilter) &&
                        !string.Equals(itemMediaType, mediaTypeFilter, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    BaseItemDto? dto = MapDiscoverItem(item, mapping);
                    if (dto == null)
                    {
                        continue;
                    }

                    if (skipped < startIndex)
                    {
                        skipped++;
                        continue;
                    }

                    items.Add(dto);
                }

                int totalPages = json.Value<int?>("totalPages")
                    ?? json.Value<int?>("total_pages")
                    ?? jellyseerrPage;
                if (jellyseerrPage >= totalPages)
                {
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, useTmdbReleaseFilter
                    ? "SeerrFin • failed to fetch TMDB discover movies for path {Path}"
                    : "SeerrFin • failed to fetch Seerr path {Path}", jellyseerrPath);
                break;
            }

            jellyseerrPage++;
        }

        return new QueryResult<BaseItemDto>
        {
            Items = items,
            StartIndex = startIndex,
            TotalRecordCount = totalResults > 0 ? totalResults : items.Count
        };
    }

    public JArray GetGenreSlider(string mediaType, string username)
    {
        string path = mediaType == "movie"
            ? "/api/v1/discover/genreslider/movie"
            : "/api/v1/discover/genreslider/tv";
        return GetJsonArray(path, username);
    }

    public JArray GetWatchProviders(string mediaType, string username)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        string region = string.IsNullOrWhiteSpace(config.WatchRegion) ? "US" : config.WatchRegion;
        string path = mediaType == "movie"
            ? $"/api/v1/watchproviders/movies?watchRegion={Uri.EscapeDataString(region)}"
            : $"/api/v1/watchproviders/tv?watchRegion={Uri.EscapeDataString(region)}";
        return GetJsonArray(path, username);
    }

    public JArray GetStudios() => ToBrowseArray(MovieStudios);

    public JArray GetNetworks() => ToBrowseArray(TvNetworks);

    public JArray GetMovieStreamingServices() => ToBrowseArray(MovieStreamingServices);

    public JArray GetTvStreamingServices() => ToBrowseArray(TvStreamingServices);

    private static JArray ToBrowseArray(IEnumerable<(int Id, string Name, string Logo, bool WeirdSize)> items)
    {
        JArray array = new();
        foreach ((int id, string name, string logo, bool weirdSize) in items)
        {
            array.Add(new JObject
            {
                ["id"] = id,
                ["name"] = name,
                ["logo"] = logo,
                ["weirdSize"] = weirdSize
            });
        }

        return array;
    }

    private static readonly (int Id, string Name, string Logo, bool WeirdSize)[] MovieStudios =
    {
        (2, "Disney", "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", true),
        (127928, "20th Century Studios", "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", true),
        (34, "Sony Pictures", "/mtp1fvZbe4H991Ka1HOORl572VH.png", true),
        (174, "Warner Bros. Pictures", "/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png", true),
        (33, "Universal", "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png", true),
        (4, "Paramount", "/jay6WcMgagAklUt7i9Euwj1pzTF.png", true),
        (3, "Pixar", "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", false),
        (521, "Dreamworks", "/3BPX5VGBov8SDqTV7wC1L1xShAS.png", true),
        (420, "Marvel Studios", "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", false),
        (9993, "DC", "not found", false),
        (41077, "A24", "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png", false)
    };

    private static readonly (int Id, string Name, string Logo, bool WeirdSize)[] TvNetworks =
    {
        (213, "Netflix", "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", false),
        (2739, "Disney+", "/1edZOYAfoyZyZ3rklNSiUpXX30Q.png", true),
        (1024, "Prime Video", "/w7HfLNm9CWwRmAMU58udl2L7We7.png", false),
        (2552, "Apple TV+", "/bngHRFi794mnMq34gfVcm9nDxN1.png", false),
        (453, "Hulu", "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", false),
        (49, "HBO", "/tuomPhY2UtuPTqqFnKMVHvSb724.png", false),
        (4353, "Discovery+", "/1D1bS3Dyw4ScYnFWTlBOvJXC3nb.png", false),
        (2, "ABC", "/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png", true),
        (19, "FOX", "/1DSpHrWyOORkL9N2QHX7Adt31mQ.png", false),
        (359, "Cinemax", "not found", false),
        (174, "AMC", "/pmvRmATOCaDykE6JrVoeYxlFHw3.png", false),
        (67, "Showtime", "/Allse9kbjiP6ExaQrnSpIhkurEi.png", true),
        (318, "Starz", "/qx3Y9LCaK4mq1ykFuDIfjshlo3U.png", false),
        (71, "The CW", "/hEpcdJ4O6eitG9ADSnDXNUrlovS.png", false),
        (6, "NBC", "/cm111bsDVlYaC1foL0itvEI4yLG.png", false),
        (16, "CBS", "/wju8KhOUsR5y4bH9p3Jc50hhaLO.png", false),
        (4330, "Paramount+", "/fi83B1oztoS47xxcemFdPMhIzK.png", false),
        (4, "BBC One", "/uJjcCg3O4DMEjM0xtno9OWFciRP.png", false),
        (56, "Cartoon Network", "/c5OC6oVCg6QP4eqzW6XIq17CQjI.png", false),
        (80, "Adult Swim", "/tHZPHOLc6iF27G34cAZGPsMtMSy.png", false),
        (13, "Nickelodeon", "/aYkLXz4dxHgOrFNH7Jv7Cpy56Ms.png", false),
        (3353, "Peacock", "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png", false)
    };

    private static readonly (int Id, string Name, string Logo, bool WeirdSize)[] MovieStreamingServices =
    {
        (8, "Netflix", "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", false),
        (350, "Apple TV", "/bngHRFi794mnMq34gfVcm9nDxN1.png", false),
        (9, "Amazon Prime Video", "/w7HfLNm9CWwRmAMU58udl2L7We7.png", false),
        (337, "Disney Plus", "/1edZOYAfoyZyZ3rklNSiUpXX30Q.png", true),
        (15, "Hulu", "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", false),
        (2303, "Paramount Plus Premium", "/fi83B1oztoS47xxcemFdPMhIzK.png", false),
        (386, "Peacock Premium", "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png", false),
        (1899, "HBO Max", "/rAb4M1LjGpWASxpk6Va791A7Nkw.png", false),
        (526, "AMC+", "/pmvRmATOCaDykE6JrVoeYxlFHw3.png", false),
        (83, "The CW", "/hEpcdJ4O6eitG9ADSnDXNUrlovS.png", false),
        (43, "Starz", "/qx3Y9LCaK4mq1ykFuDIfjshlo3U.png", false),
        (209, "PBS", "/4Fn4eQmEmJZ9YWjiIhZ6cF1QHAi.png", false),
        (79, "NBC", "/cm111bsDVlYaC1foL0itvEI4yLG.png", false),
        (34, "MGM Plus", "/usUnaYV6hQnlVAXP6r4HwrlLFPG.png", true)
    };

    private static readonly (int Id, string Name, string Logo, bool WeirdSize)[] TvStreamingServices =
    {
        (8, "Netflix", "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", false),
        (350, "Apple TV", "/bngHRFi794mnMq34gfVcm9nDxN1.png", false),
        (9, "Amazon Prime Video", "/w7HfLNm9CWwRmAMU58udl2L7We7.png", false),
        (337, "Disney Plus", "/1edZOYAfoyZyZ3rklNSiUpXX30Q.png", true),
        (15, "Hulu", "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", false),
        (2303, "Paramount Plus Premium", "/fi83B1oztoS47xxcemFdPMhIzK.png", false),
        (386, "Peacock Premium", "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png", false),
        (1899, "HBO Max", "/rAb4M1LjGpWASxpk6Va791A7Nkw.png", false),
        (526, "AMC+", "/pmvRmATOCaDykE6JrVoeYxlFHw3.png", false),
        (83, "The CW", "/hEpcdJ4O6eitG9ADSnDXNUrlovS.png", false),
        (43, "Starz", "/qx3Y9LCaK4mq1ykFuDIfjshlo3U.png", false),
        (209, "PBS", "/4Fn4eQmEmJZ9YWjiIhZ6cF1QHAi.png", false),
        (123, "FXNow", "/aexGjtcs42DgRtZh7zOxayiry4J.png", false),
        (79, "NBC", "/cm111bsDVlYaC1foL0itvEI4yLG.png", false),
        (34, "MGM Plus", "/usUnaYV6hQnlVAXP6r4HwrlLFPG.png", true),
        (211, "Freeform", "/jk2Z7WH6JnHSZrxouYh4sireM3a.png", false),
        (156, "A&E", "/ptSTdU4GPNJ1M8UVEOtA0KgtuNk.png", false),
        (157, "Lifetime", "/kEeaVLcJ6L6jq3v5YlPcjQs9igm.png", false),
        (318, "Adult Swim", "/tHZPHOLc6iF27G34cAZGPsMtMSy.png", false),
        (322, "USA Network", "/g1e0H0Ka97IG5SyInMXdJkHGKiH.png", false),
        (365, "Bravo TV", "/wX5HsfS47u6UUCSpYXqaQ1x2qdu.png", false),
        (363, "TNT", "/6ISsKwa2XUhSC6oBtHZjYf6xFqv.png", true),
        (412, "TLC", "/6GRfZSrYh9D6C88n9kWlyrySB2l.png", false),
        (406, "HGTV", "/tzTtKdQ7vC2FkBvJDUErOhBPdKJ.png", false),
        (399, "Animal Planet", "/m3KrDu1g96YByhH0wp4OvyghgsG.png", true),
        (403, "Discovery", "/tmttRFo2OiXQD0EHMxxlw8EzUuZ.png", false),
        (422, "VH1", "/w9oUxxUiXTC1O1MzJSvsMjQbgft.png", false),
        (506, "TBS", "/65r0kR6MfOBYF0gEQsJGM6v5fEG.png", false),
        (508, "DisneyNOW", "/9AxUB1RdRnm0r5ki8Thb69Jo9Ma.png", false),
        (520, "Discovery +", "/1D1bS3Dyw4ScYnFWTlBOvJXC3nb.png", false),
        (1964, "National Geographic", "/5UtQpFierweXjriDoRf3LUVDjce.png", false),
        (148, "ABC", "/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png", true),
        (155, "History", "/9fGgdJz17aBX7dOyfHJtsozB7bf.png", true)
    };

    public JObject? GetMediaDetails(string username, string mediaType, int mediaId)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return null;
        }

        return FetchJellyseerrDetails(username, config, mediaType, mediaId);
    }

    public List<int> GetAlreadyRequestedMovieIds(string username, IEnumerable<int> tmdbIds)
    {
        string scope = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration)
            .Letterboxd.AlreadyRequestedStatusScope;
        bool availableOnly = string.Equals(scope, "availableOnly", StringComparison.OrdinalIgnoreCase);

        List<int> alreadyRequested = new();
        foreach (int tmdbId in tmdbIds.Distinct())
        {
            JObject? details = GetMediaDetails(username, "movie", tmdbId);
            JObject? mediaInfo = details?.Value<JObject>("mediaInfo");
            if (mediaInfo == null)
            {
                continue;
            }

            if (!availableOnly || IsAvailableInLibrary(details!))
            {
                alreadyRequested.Add(tmdbId);
            }
        }

        return alreadyRequested;
    }

    private JObject? FetchJellyseerrDetails(string username, PluginConfiguration config, string mediaType, int mediaId)
    {
        using HttpClient client = CreateClient(config);
        if (!string.IsNullOrWhiteSpace(username))
        {
            int? jellyseerrUserId = ResolveJellyseerrUserId(client, username);
            if (jellyseerrUserId != null)
            {
                client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());
            }
        }

        string path = mediaType == "tv"
            ? $"/api/v1/tv/{mediaId}"
            : $"/api/v1/movie/{mediaId}";

        try
        {
            HttpResponseMessage response = client.GetAsync(path).GetAwaiter().GetResult();
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return JObject.Parse(jsonRaw);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to fetch Seerr details for {MediaType}/{MediaId}", mediaType, mediaId);
            return null;
        }
    }

    private JArray GetJsonArray(string path, string username)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return new JArray();
        }

        using HttpClient client = CreateClient(config);
        if (!string.IsNullOrWhiteSpace(username))
        {
            int? jellyseerrUserId = ResolveJellyseerrUserId(client, username);
            if (jellyseerrUserId != null)
            {
                client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());
                if (path.Contains("/watchproviders/", StringComparison.Ordinal))
                {
                    try
                    {
                        JObject main = JellyseerrProfileService.ReadMainAsync(client, jellyseerrUserId.Value).GetAwaiter().GetResult();
                        JObject defaults = JellyseerrProfileService.ReadDefaultsAsync(client).GetAwaiter().GetResult();
                        path = path[..path.IndexOf('?')] + "?watchRegion=" + Uri.EscapeDataString(JellyseerrProfileService.StreamingRegion(main, config, defaults));
                    }
                    catch (Exception ex) { _logger.LogWarning(ex, "SeerrFin • failed to load personal streaming region"); return new JArray(); }
                }
            }
        }

        try
        {
            HttpResponseMessage response = client.GetAsync(path).GetAwaiter().GetResult();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("SeerrFin • Seerr request failed for {Path} with status {StatusCode}", path, response.StatusCode);
                return new JArray();
            }

            string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            JToken? token = JToken.Parse(jsonRaw);
            // Endpoints return either a bare array or { results: [...] }
            return token switch
            {
                JArray array => array,
                JObject obj when obj["results"] is JArray results => results,
                _ => new JArray()
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to fetch Seerr array from {Path}", path);
            return new JArray();
        }
    }

    private BaseItemDto? MapDiscoverItem(JObject item, DiscoverItemFilterOptions filterOptions)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(config).Discovery;
        AdvancedTmdbSettings tmdb = AdvancedSettingsHelper.Resolve(config).Tmdb;

        if (discovery.HideAdultContent && item.Value<bool?>("adult") == true)
        {
            return null;
        }

        // Seerr returns blocklisted titles from discovery/search and drops them client side and equesting one always fails, so filter them out here
        if (discovery.HideBlocklistedMedia && GetMediaStatus(item) == 6) // Blocklisted
        {
            return null;
        }

        string? language = item.Value<string>("originalLanguage");
        if (filterOptions.ApplyLanguageFilter &&
            !string.IsNullOrEmpty(config.JellyseerrPreferredLanguages) &&
            !string.IsNullOrEmpty(language) &&
            !config.JellyseerrPreferredLanguages.Split(',')
                .Select(x => x.Trim())
                .Contains(language, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }

        // Match Seerr default (hideAvailable=false): only hide available titles when configured.
        if (filterOptions.HideAvailableInLibrary && IsAvailableInLibrary(item))
        {
            return null;
        }

        if (filterOptions.HideRequestedMedia && item.Value<JObject>("mediaInfo") != null)
        {
            return null;
        }

        string dateTimeString = item.Value<string>("firstAirDate")
                                ?? item.Value<string>("releaseDate")
                                ?? "1970-01-01";
        if (string.IsNullOrWhiteSpace(dateTimeString))
        {
            dateTimeString = "1970-01-01";
        }

        string posterPath = item.Value<string>("posterPath") ?? string.Empty;
        string posterSize = string.IsNullOrWhiteSpace(tmdb.PosterImageSize) ? "w600_and_h900_bestv2" : tmdb.PosterImageSize;
        string posterUrl = string.IsNullOrEmpty(posterPath)
            ? string.Empty
            : ImageCacheHelper.GetCachedImageUrl(
                _imageCacheService,
                $"https://image.tmdb.org/t/p/{posterSize}{posterPath}",
                _logger);

        string backdropPath = item.Value<string>("backdropPath") ?? item.Value<string>("backdrop_path") ?? string.Empty;
        string backdropSize = string.IsNullOrWhiteSpace(tmdb.BackdropImageSize) ? "w780" : tmdb.BackdropImageSize;
        string backdropUrl = string.IsNullOrEmpty(backdropPath)
            ? string.Empty
            : ImageCacheHelper.GetCachedImageUrl(_imageCacheService, $"https://image.tmdb.org/t/p/{backdropSize}{backdropPath}", _logger);

        float rating = item.Value<float?>("vote_average") ?? item.Value<float?>("voteAverage") ?? 0f;
        string? mediaType = item.Value<string>("mediaType");
        int? tmdbId = item.Value<int?>("tmdbId") ?? item.Value<int?>("id");

        return new BaseItemDto
        {
            Name = item.Value<string>("title") ?? item.Value<string>("name"),
            OriginalTitle = item.Value<string>("originalTitle") ?? item.Value<string>("originalName"),
            SourceType = mediaType,
            CommunityRating = rating > 0 ? rating : null,
            ProviderIds = new Dictionary<string, string>
            {
                { "Jellyseerr", item.Value<int>("id").ToString() },
                { "JellyseerrPoster", posterUrl },
                { "JellyseerrBackdrop", backdropUrl },
                { "TmdbPosterPath", posterPath },
                { "TmdbBackdropPath", backdropPath },
                { "Tmdb", tmdbId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty }
            },
            PremiereDate = DateTime.TryParse(dateTimeString, out DateTime dt) ? dt : DateTime.Parse("1970-01-01")
        };
    }

    private static HttpClient CreateClient(PluginConfiguration config)
    {
        HttpClient client = new() { BaseAddress = new Uri(config.JellyseerrUrl!) };
        client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
        return client;
    }

    // Match Jellyfin username to linked Seerr user for per-user X-Api-User header.
    private static int? ResolveJellyseerrUserId(HttpClient client, string username)
    {
        HttpResponseMessage usersResponse = client.GetAsync($"/api/v1/user?q={Uri.EscapeDataString(username)}").GetAwaiter().GetResult();
        string userResponseRaw = usersResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        return JObject.Parse(userResponseRaw).Value<JArray>("results")?
            .OfType<JObject>()
            .FirstOrDefault(x => string.Equals(x.Value<string>("jellyfinUsername"), username, StringComparison.OrdinalIgnoreCase))
            ?.Value<int>("id");
    }

    private static int? GetMediaStatus(JObject item)
    {
        JToken? status = item.Value<JObject>("mediaInfo")?["status"];
        return status?.Type == JTokenType.Integer ? status.Value<int>() : null;
    }

    private static bool IsAvailableInLibrary(JObject item) =>
        GetMediaStatus(item) is 4 or 5; // Partially available / Available

    private static bool ShouldApplyReleaseTypeFilter(string? mediaTypeFilter, string jellyseerrPath, PluginConfiguration config) =>
        string.Equals(mediaTypeFilter, "movie", StringComparison.OrdinalIgnoreCase) && GetReleaseTypes(config).Count > 0 && !jellyseerrPath.Contains("/upcoming", StringComparison.OrdinalIgnoreCase);

    private static List<int> GetReleaseTypes(PluginConfiguration config) =>
        (config.DiscoverReleaseTypes ?? new List<int>())
            .Where(type => type is >= 1 and <= 6)
            .Distinct()
            .OrderBy(type => type)
            .ToList();

    private static string GetWatchRegion(PluginConfiguration config) => string.IsNullOrWhiteSpace(config.WatchRegion) ? "US" : config.WatchRegion.Trim();

    private static string GetDefaultFutureReleaseDate() => DateTime.UtcNow.AddDays((int)(365 * 1.5)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string BuildTmdbDiscoverUrl(string jellyseerrPath, PluginConfiguration config, int page, JObject preferences, JObject defaults)
    {
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(config).Discovery;
        var query = new List<string>
        {
            "with_release_type=" + Uri.EscapeDataString(string.Join("|", GetReleaseTypes(config))),
            "page=" + page.ToString(CultureInfo.InvariantCulture),
            "include_adult=" + (discovery.HideAdultContent ? "false" : "true"),
            "include_video=true",
            "primary_release_date.gte=1900-01-01",
            "primary_release_date.lte=" + GetDefaultFutureReleaseDate()
        };

        AppendLanguageFilter(query, config);
        string Effective(string key) => preferences.Value<string>(key) is { Length: > 0 } value ? value : defaults.Value<string>(key) ?? "";
        query.Add("language=" + Uri.EscapeDataString(Effective("locale")));
        string region = Effective("discoverRegion");
        if (region.Length > 0 && region != "all") query.Add("region=" + Uri.EscapeDataString(region));
        string original = Effective("originalLanguage");
        if (original.Length > 0 && original != "all")
        {
            query.RemoveAll(x => x.StartsWith("with_original_language=", StringComparison.Ordinal));
            query.Add("with_original_language=" + Uri.EscapeDataString(original));
        }
        AppendPathParams(query, jellyseerrPath, GetWatchRegion(config));

        if (!query.Exists(static part => part.StartsWith("sort_by=", StringComparison.Ordinal)))
        {
            query.Add("sort_by=popularity.desc");
        }

        return "https://api.themoviedb.org/3/discover/movie?" + string.Join("&", query);
    }

    private static void AppendLanguageFilter(List<string> query, PluginConfiguration config)
    {
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(config).Discovery;
        if (!discovery.ApplyLanguageFilter || string.IsNullOrWhiteSpace(config.JellyseerrPreferredLanguages))
        {
            return;
        }

        string language = config.JellyseerrPreferredLanguages.Split(',')[0].Trim();
        if (!string.IsNullOrEmpty(language))
        {
            query.Add("with_original_language=" + Uri.EscapeDataString(language));
        }
    }

    private static void AppendPathParams(List<string> query, string jellyseerrPath, string defaultWatchRegion)
    {
        int queryStart = jellyseerrPath.IndexOf('?', StringComparison.Ordinal);
        if (queryStart < 0)
        {
            return;
        }

        foreach (string pair in jellyseerrPath[(queryStart + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            string[] parts = pair.Split('=', 2);
            if (parts.Length != 2)
            {
                continue;
            }

            string key = Uri.UnescapeDataString(parts[0]);
            string value = Uri.EscapeDataString(Uri.UnescapeDataString(parts[1]));
            switch (key) // yes im elite i use switch case
            {
                case "sortBy":
                    query.Add("sort_by=" + value);
                    break;
                case "genre":
                    query.Add("with_genres=" + value);
                    break;
                case "studio":
                    query.Add("with_companies=" + value);
                    break;
                case "watchProviders":
                    query.Add("with_watch_providers=" + value);
                    break;
                case "watchRegion":
                    query.Add("watch_region=" + value);
                    break;
                case "voteCountGte":
                    query.Add("vote_count.gte=" + value);
                    break;
                case "voteAverageGte":
                    query.Add("vote_average.gte=" + value);
                    break;
            }
        }

        if (query.Exists(static part => part.StartsWith("with_watch_providers=", StringComparison.Ordinal))
            && !query.Exists(static part => part.StartsWith("watch_region=", StringComparison.Ordinal)))
        {
            query.Add("watch_region=" + Uri.EscapeDataString(defaultWatchRegion));
        }
    }

    private JObject? FetchTmdbTrendingMoviesJson(string apiKey, PluginConfiguration config, int page, Dictionary<int, bool> releaseTypeCache, string locale)
    {
        string url = "https://api.themoviedb.org/3/trending/movie/week?page="
            + page.ToString(CultureInfo.InvariantCulture) + "&language=" + Uri.EscapeDataString(locale);

        using HttpRequestMessage request = CreateTmdbRequest(url, apiKey);
        using HttpResponseMessage response = new HttpClient().SendAsync(request).GetAwaiter().GetResult();
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("SeerrFin • TMDB trending request failed with status {StatusCode} for {Url}", (int)response.StatusCode, url);
            return null;
        }

        string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        JObject tmdb = JObject.Parse(jsonRaw);
        IReadOnlyList<int> releaseTypes = GetReleaseTypes(config);
        JArray results = new();

        foreach (JObject movie in tmdb.Value<JArray>("results")?.OfType<JObject>() ?? [])
        {
            int id = movie.Value<int>("id");
            if (!MovieMatchesReleaseTypes(id, releaseTypes, apiKey, releaseTypeCache))
            {
                continue;
            }

            results.Add(MapTmdbMovie(movie));
        }

        return new JObject
        {
            ["results"] = results,
            ["totalResults"] = tmdb.Value<int?>("total_results"),
            ["totalPages"] = tmdb.Value<int?>("total_pages")
        };
    }

    private bool MovieMatchesReleaseTypes(int movieId, IReadOnlyList<int> releaseTypes, string apiKey, Dictionary<int, bool> cache)
    {
        if (cache.TryGetValue(movieId, out bool cached))
        {
            return cached;
        }

        bool matches = false;
        try
        {
            string url = "https://api.themoviedb.org/3/movie/" + movieId.ToString(CultureInfo.InvariantCulture) + "/release_dates";

            using HttpRequestMessage request = CreateTmdbRequest(url, apiKey);
            using HttpResponseMessage response = new HttpClient().SendAsync(request).GetAwaiter().GetResult();
            if (response.IsSuccessStatusCode)
            {
                string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                matches = HasMatchingReleaseTypeAnywhere(JObject.Parse(jsonRaw), releaseTypes);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SeerrFin • failed to fetch TMDB release dates for movie {MovieId}", movieId);
        }

        cache[movieId] = matches;
        return matches;
    }

    private static bool HasMatchingReleaseTypeAnywhere(JObject releaseDates, IReadOnlyList<int> releaseTypes)
    {
        foreach (JObject country in releaseDates.Value<JArray>("results")?.OfType<JObject>() ?? [])
        {
            foreach (JObject entry in country.Value<JArray>("release_dates")?.OfType<JObject>() ?? [])
            {
                int? type = entry.Value<int?>("type");
                if (type != null && releaseTypes.Contains(type.Value))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static JObject MapTmdbMovie(JObject movie)
    {
        int id = movie.Value<int>("id");
        return new JObject
        {
            ["id"] = id,
            ["tmdbId"] = id,
            ["mediaType"] = "movie",
            ["title"] = movie.Value<string>("title"),
            ["originalTitle"] = movie.Value<string>("original_title"),
            ["releaseDate"] = movie.Value<string>("release_date"),
            ["posterPath"] = NormalizeTmdbImagePath(movie.Value<string>("poster_path")),
            ["backdropPath"] = NormalizeTmdbImagePath(movie.Value<string>("backdrop_path")),
            ["voteAverage"] = movie.Value<float?>("vote_average"),
            ["originalLanguage"] = movie.Value<string>("original_language"),
            ["adult"] = movie.Value<bool?>("adult")
        };
    }

    private JObject? FetchTmdbDiscoverJson(string url, string apiKey)
    {
        using HttpRequestMessage request = CreateTmdbRequest(url, apiKey);
        using HttpResponseMessage response = new HttpClient().SendAsync(request).GetAwaiter().GetResult();
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("SeerrFin • TMDB discover request failed with status {StatusCode} for {Url}", (int)response.StatusCode, url);
            return null;
        }

        string jsonRaw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        JObject tmdb = JObject.Parse(jsonRaw);
        JArray results = new();
        
        foreach (JObject movie in tmdb.Value<JArray>("results")?.OfType<JObject>() ?? [])
        {
            results.Add(MapTmdbMovie(movie));
        }

        return new JObject
        {
            ["results"] = results,
            ["totalResults"] = tmdb.Value<int?>("total_results"),
            ["totalPages"] = tmdb.Value<int?>("total_pages")
        };
    }

    private static HttpRequestMessage CreateTmdbRequest(string url, string apiKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (apiKey.Split('.').Length == 3)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            return request;
        }

        request.RequestUri = new Uri(url + (url.Contains('?', StringComparison.Ordinal) ? "&" : "?") + "api_key=" + Uri.EscapeDataString(apiKey));
        return request;
    }

    private static string? NormalizeTmdbImagePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return path;
        }

        return path.StartsWith('/') ? path : "/" + path;
    }

    private static DiscoverItemFilterOptions ResolveSearchMapping()
    {
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Discovery;
        return new DiscoverItemFilterOptions
        {
            ApplyLanguageFilter = false,
            HideRequestedMedia = discovery.HideRequestedMedia,
            HideAvailableInLibrary = discovery.HideAvailableInLibrary
        };
    }

    private static DiscoverItemFilterOptions ResolveMapping(PluginConfiguration config, bool useSeerrMapping)
    {
        AdvancedDiscoverySettings discovery = AdvancedSettingsHelper.Resolve(config).Discovery;
        if (useSeerrMapping && discovery.UseSeerrMappingForAnime)
        {
            return new DiscoverItemFilterOptions
            {
                ApplyLanguageFilter = false,
                HideRequestedMedia = discovery.HideRequestedMedia,
                HideAvailableInLibrary = discovery.HideAvailableInLibrary
            };
        }

        return new DiscoverItemFilterOptions
        {
            ApplyLanguageFilter = discovery.ApplyLanguageFilter,
            HideRequestedMedia = discovery.HideRequestedMedia,
            HideAvailableInLibrary = discovery.HideAvailableInLibrary
        };
    }

    private sealed class DiscoverItemFilterOptions
    {
        public bool ApplyLanguageFilter { get; init; }

        public bool HideRequestedMedia { get; init; }

        public bool HideAvailableInLibrary { get; init; }
    }

    private static QueryResult<BaseItemDto> EmptyResult() => new()
    {
        Items = Array.Empty<BaseItemDto>(),
        StartIndex = 0,
        TotalRecordCount = 0
    };

}
