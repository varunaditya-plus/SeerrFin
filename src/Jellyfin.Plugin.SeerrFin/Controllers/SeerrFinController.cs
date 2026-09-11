using System.Reflection;
using System.Text;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using Jellyfin.Plugin.SeerrFin.Model;
using Jellyfin.Plugin.SeerrFin.Services;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Controllers;

[ApiController]
[Route("[controller]")]
public class SeerrFinController : ControllerBase
{
    private readonly JellyseerrDiscoveryService _discoveryService;
    private readonly JellyseerrRequestService _requestService;
    private readonly JellyseerrRequestsService _requestsService;
    private readonly JellyseerrProxyService _proxyService;
    private readonly ImageCacheService _imageCacheService;
    private readonly TmdbBackdropService _tmdbBackdropService;
    private readonly JustWatchQualitiesService _justWatchQualitiesService;
    private readonly LetterboxdWatchlistService _letterboxdWatchlistService;
    private readonly LetterboxdBulkRequestService _letterboxdBulkRequestService;

    public SeerrFinController(
        JellyseerrDiscoveryService discoveryService,
        JellyseerrRequestService requestService,
        JellyseerrRequestsService requestsService,
        JellyseerrProxyService proxyService,
        ImageCacheService imageCacheService,
        TmdbBackdropService tmdbBackdropService,
        JustWatchQualitiesService justWatchQualitiesService,
        LetterboxdWatchlistService letterboxdWatchlistService,
        LetterboxdBulkRequestService letterboxdBulkRequestService)
    {
        _discoveryService = discoveryService;
        _requestService = requestService;
        _requestsService = requestsService;
        _proxyService = proxyService;
        _imageCacheService = imageCacheService;
        _tmdbBackdropService = tmdbBackdropService;
        _justWatchQualitiesService = justWatchQualitiesService;
        _letterboxdWatchlistService = letterboxdWatchlistService;
        _letterboxdBulkRequestService = letterboxdBulkRequestService;
    }

    private Guid GetUserId()
    {
        string? userIdString = User.Claims
            .FirstOrDefault(x => x.Type.Equals("Jellyfin-UserId", StringComparison.OrdinalIgnoreCase))?.Value;
        return string.IsNullOrEmpty(userIdString) ? Guid.Empty : Guid.Parse(userIdString);
    }

    private string? GetUsername(IUserManager userManager)
    {
        Guid userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return null;
        }

        return userManager.GetUserById(userId)?.Username;
    }

    private void SetCacheHeaders()
    {
        var config = SeerrFinPlugin.Instance.Configuration;
        // Developer mode bypasses browser cache. Production uses configurable ttl
        if (config.DeveloperMode)
        {
            Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        }
        else
        {
            Response.Headers.CacheControl = $"public, max-age={config.CacheTimeoutSeconds}";
        }

        // ETag is the assembly version with admin cache-bust counter so config saves invalidate old assets
        string version = SeerrFinPlugin.Instance.GetType().Assembly.GetName().Version?.ToString() ?? "1.0.0.0";
        Response.Headers.ETag = $"\"v{version}-c{config.CacheBustCounter}\"";
    }

    [HttpGet("seerrfin-tabs.js")]
    [Produces("application/javascript")]
    public ActionResult GetScript() => ServeEmbedded("Inject.seerrfin-tabs.js", "application/javascript");

    [HttpGet("seerrfin-tabs.css")]
    [Produces("text/css")]
    public ActionResult GetStylesheet() => ServeEmbedded("Inject.seerrfin-tabs.css", "text/css");

    [HttpGet("seerrfin-nativeui.js")]
    [Produces("application/javascript")]
    public ActionResult GetNativeUiScript() => ServeEmbedded("Inject.seerrfin-nativeui.js", "application/javascript");

    [HttpGet("seerrfin-modal.js")]
    [Produces("application/javascript")]
    public ActionResult GetModalScript() => ServeEmbedded("Inject.seerrfin-modal.js", "application/javascript");

    [HttpGet("seerrfin-modal.css")]
    [Produces("text/css")]
    public ActionResult GetModalStylesheet() => ServeEmbedded("Inject.seerrfin-modal.css", "text/css");

    [HttpGet("seerrfin-requests.js")]
    [Produces("application/javascript")]
    public ActionResult GetRequestsScript() => ServeEmbedded("Inject.seerrfin-requests.js", "application/javascript");

    [HttpGet("seerrfin-requests.css")]
    [Produces("text/css")]
    public ActionResult GetRequestsStylesheet() => ServeEmbedded("Inject.seerrfin-requests.css", "text/css");

    [HttpGet("seerrfin-letterboxd.js")]
    [Produces("application/javascript")]
    public ActionResult GetLetterboxdScript() => ServeEmbedded("Inject.seerrfin-letterboxd.js", "application/javascript");

    [HttpGet("seerrfin-letterboxd.css")]
    [Produces("text/css")]
    public ActionResult GetLetterboxdStylesheet() => ServeEmbedded("Inject.seerrfin-letterboxd.css", "text/css");

    [HttpGet("jellyseerr/{*path}")]
    [Authorize]
    public Task<IActionResult> JellyseerrProxyGet(
        string path,
        [FromServices] IUserManager userManager,
        CancellationToken cancellationToken) =>
        ProxyJellyseerr(userManager, HttpMethod.Get, path, null, cancellationToken);

    [HttpPost("jellyseerr/{*path}")]
    [Authorize]
    public async Task<IActionResult> JellyseerrProxyPost(
        string path,
        [FromServices] IUserManager userManager,
        CancellationToken cancellationToken)
    {
        using StreamReader reader = new(Request.Body, Encoding.UTF8);
        string body = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        return await ProxyJellyseerr(userManager, HttpMethod.Post, path, body, cancellationToken).ConfigureAwait(false);
    }

    private async Task<IActionResult> ProxyJellyseerr(
        IUserManager userManager,
        HttpMethod method,
        string path,
        string? body,
        CancellationToken cancellationToken)
    {
        string? username = GetUsername(userManager);
        if (string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        (int statusCode, string responseBody, string contentType) = await _proxyService
            .ProxyAsync(username, method, path, body, cancellationToken)
            .ConfigureAwait(false);

        return new ContentResult
        {
            StatusCode = statusCode,
            Content = responseBody,
            ContentType = contentType
        };
    }

    [HttpGet("Configuration")]
    [Authorize(Roles = "Administrator")]
    public ActionResult<PluginConfiguration> GetConfiguration()
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        ServarrConfigHelper.Resolve(config);
        return config;
    }

    [HttpGet("display-settings")]
    [Authorize]
    public ActionResult GetDisplaySettings()
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        List<SeerrFinTabConfig> tabs = SeerrFinTabConfigHelper.Normalize(config.Tabs);
        Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        return Ok(new
        {
            config.StreamingServiceUseImages,
            config.StudioNetworkUseImages,
            config.GenreUseBackdrops,
            config.DiscoverUsePosters,
            config.ElegantFinFixes,
            config.QualityRecommendations,
            config.AddSeerrResultsInSearch,
            config.NativeCarousels,
            config.NativeGridPages,
            config.NativeSearchResults,
            displayCustomizations = DisplayCustomizationsHelper.Resolve(config),
            advanced = AdvancedSettingsHelper.BuildFrontendPayload(config),
            tabs = tabs.Select(tab => new { id = tab.Id, enabled = tab.Enabled, title = tab.Title }),
            tabBarOrder = SeerrFinTabConfigHelper.NormalizeBarOrder(config.TabBarOrder)
        });
    }

    [HttpGet("backdrop/{mediaType}/{tmdbId}")]
    [Authorize]
    public async Task<ActionResult> GetBackdrop(string mediaType, int tmdbId, [FromQuery] bool preferNeutral = false, CancellationToken cancellationToken = default)
    {
        if (tmdbId <= 0)
        {
            return NotFound();
        }

        if (!string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(mediaType, "tv", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest();
        }

        TmdbBackdropService.CachedBackdropDto? backdrop = await _tmdbBackdropService
            .GetCachedBackdropAsync(mediaType, tmdbId, preferNeutral, cancellationToken)
            .ConfigureAwait(false);

        if (backdrop == null || string.IsNullOrEmpty(backdrop.BackdropUrl))
        {
            return NotFound();
        }

        return Ok(new
        {
            backdropUrl = backdrop.BackdropUrl,
            tmdbBackdropPath = backdrop.TmdbBackdropPath,
            hasEnglishBackdrop = backdrop.HasEnglishBackdrop
        });
    }

    [HttpGet("CachedImage/{cacheKey}")]
    public ActionResult GetCachedImage([FromRoute] string cacheKey)
    {
        CachedImageFile? cachedFile = _imageCacheService.GetCachedImageFile(cacheKey);
        if (cachedFile == null || !System.IO.File.Exists(cachedFile.FilePath))
        {
            return NotFound();
        }

        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (config.DeveloperMode)
        {
            Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        }
        else
        {
            Response.Headers.CacheControl = $"public, max-age={cachedFile.MaxAgeSeconds}";
        }

        Response.Headers.ETag = cachedFile.ETag;
        Response.Headers.LastModified = cachedFile.LastModified.ToString("R");

        if (Request.Headers.TryGetValue("If-None-Match", out Microsoft.Extensions.Primitives.StringValues etagValues)
            && etagValues.Any(value => string.Equals(value, cachedFile.ETag, StringComparison.Ordinal)))
        {
            return StatusCode(304);
        }

        if (Request.Headers.TryGetValue("If-Modified-Since", out Microsoft.Extensions.Primitives.StringValues modifiedValues)
            && DateTime.TryParse(modifiedValues.FirstOrDefault(), out DateTime ifModifiedSince)
            && ifModifiedSince.ToUniversalTime() >= cachedFile.LastModified)
        {
            return StatusCode(304);
        }

        return PhysicalFile(cachedFile.FilePath, cachedFile.ContentType);
    }

    [HttpPost("backdrops")]
    [Authorize]
    public async Task<ActionResult<BackdropBatchResponseDto>> GetBackdrops(
        [FromBody] BackdropBatchRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.Items == null || request.Items.Count == 0)
        {
            return BadRequest();
        }

        List<BackdropBatchItemDto> items = await _tmdbBackdropService
            .GetCachedBackdropsAsync(request.Items, cancellationToken)
            .ConfigureAwait(false);

        return Ok(new BackdropBatchResponseDto { Items = items });
    }

    [HttpGet("discover/movies/trending")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesTrending(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/trending", "movie", startIndex, limit);

    [HttpGet("discover/movies/popular")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesPopular(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/movies?sortBy=popularity.desc", "movie", startIndex, limit);

    [HttpGet("discover/movies/top-rated")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesTopRated(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/movies?sortBy=vote_average.desc&voteCountGte=200", "movie", startIndex, limit);

    [HttpGet("discover/movies/upcoming")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesUpcoming(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/movies/upcoming", "movie", startIndex, limit);

    [HttpGet("discover/tv/trending")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvTrending(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/trending", "tv", startIndex, limit);

    [HttpGet("discover/tv/popular")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvPopular(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/tv?sortBy=popularity.desc", "tv", startIndex, limit);

    [HttpGet("discover/tv/top-rated")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvTopRated(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/tv?sortBy=vote_average.desc&voteCountGte=200", "tv", startIndex, limit);

    [HttpGet("discover/tv/upcoming")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvUpcoming(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, "/api/v1/discover/tv/upcoming", "tv", startIndex, limit);

    [HttpGet("discover/tv/anime")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvAnime(
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        _discoveryService.GetAnimeRow(GetUsername(userManager) ?? string.Empty, startIndex, limit);

    [HttpGet("discover/movies/genre/{genreId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesByGenre(
        int genreId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, $"/api/v1/discover/movies?genre={genreId}", "movie", startIndex, limit);

    [HttpGet("discover/tv/genre/{genreId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvByGenre(
        int genreId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, $"/api/v1/discover/tv?genre={genreId}", "tv", startIndex, limit);

    [HttpGet("discover/movies/studio/{studioId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesByStudio(
        int studioId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, $"/api/v1/discover/movies?studio={studioId}", "movie", startIndex, limit);

    [HttpGet("discover/tv/network/{networkId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvByNetwork(
        int networkId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null) =>
        DiscoverRow(userManager, $"/api/v1/discover/tv?network={networkId}", "tv", startIndex, limit);

    [HttpGet("discover/movies/provider/{providerId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> MoviesByProvider(
        int providerId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null)
    {
        string region = SeerrFinPlugin.Instance.Configuration.WatchRegion;
        if (string.IsNullOrWhiteSpace(region))
        {
            region = "US";
        }
        return DiscoverRow(userManager, $"/api/v1/discover/movies?watchProviders={providerId}&watchRegion={Uri.EscapeDataString(region)}", "movie", startIndex, limit);
    }

    [HttpGet("discover/tv/provider/{providerId}")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> TvByProvider(
        int providerId,
        [FromServices] IUserManager userManager,
        [FromQuery] int startIndex = 0,
        [FromQuery] int? limit = null)
    {
        string region = SeerrFinPlugin.Instance.Configuration.WatchRegion;
        if (string.IsNullOrWhiteSpace(region))
        {
            region = "US";
        }
        return DiscoverRow(userManager, $"/api/v1/discover/tv?watchProviders={providerId}&watchRegion={Uri.EscapeDataString(region)}", "tv", startIndex, limit);
    }

    private ActionResult<QueryResult<BaseItemDto>> DiscoverRow(
        IUserManager userManager,
        string jellyseerrPath,
        string mediaType,
        int startIndex,
        int? limit) =>
        _discoveryService.GetDiscoverRow(GetUsername(userManager) ?? string.Empty, jellyseerrPath, mediaType, startIndex, limit);

    [HttpGet("search")]
    [Authorize]
    public ActionResult<QueryResult<BaseItemDto>> Search(
        [FromServices] IUserManager userManager,
        [FromQuery] string? query,
        [FromQuery] string? language = null)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new
            {
                error = true,
                code = "missing_query",
                message = "Search query is required."
            });
        }

        return _discoveryService.Search(GetUsername(userManager) ?? string.Empty, query, language);
    }

    [HttpGet("genres/movie")]
    [Authorize]
    public ActionResult MovieGenres([FromServices] IUserManager userManager)
    {
        JArray data = _discoveryService.GetGenreSlider("movie", GetUsername(userManager) ?? string.Empty);
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("genres/tv")]
    [Authorize]
    public ActionResult TvGenres([FromServices] IUserManager userManager)
    {
        JArray data = _discoveryService.GetGenreSlider("tv", GetUsername(userManager) ?? string.Empty);
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("providers/movie")]
    [Authorize]
    public ActionResult MovieProviders()
    {
        JArray data = _discoveryService.GetMovieStreamingServices();
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("providers/tv")]
    [Authorize]
    public ActionResult TvProviders()
    {
        JArray data = _discoveryService.GetTvStreamingServices();
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("studios/movie")]
    [Authorize]
    public ActionResult MovieStudios()
    {
        JArray data = _discoveryService.GetStudios();
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("networks/tv")]
    [Authorize]
    public ActionResult TvNetworks()
    {
        JArray data = _discoveryService.GetNetworks();
        return Content(data.ToString(), "application/json");
    }

    [HttpGet("client-settings")]
    [Authorize]
    public ActionResult GetClientSettings()
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        IReadOnlyList<ServarrInstanceConfig> radarrInstances = ServarrConfigHelper.GetConfiguredInstances(config, "radarr");
        IReadOnlyList<ServarrInstanceConfig> sonarrInstances = ServarrConfigHelper.GetConfiguredInstances(config, "sonarr");
        string? key = config.TmdbApiKey?.Trim();
        string? browseUrl = config.ExternalJellyseerrUrl?.Trim();
        if (string.IsNullOrEmpty(browseUrl))
        {
            browseUrl = config.JellyseerrUrl?.Trim();
        }

        return Ok(new
        {
            tmdbApiKey = key ?? string.Empty,
            jellyseerrBrowseUrl = browseUrl ?? string.Empty,
            hasRadarr = radarrInstances.Count > 0,
            hasSonarr = sonarrInstances.Count > 0,
            radarrUrl = ServarrConfigHelper.GetPreferredUrl(config, "radarr") ?? string.Empty,
            sonarrUrl = ServarrConfigHelper.GetPreferredUrl(config, "sonarr") ?? string.Empty,
            radarrInstances = radarrInstances.Select(instance => new
            {
                name = instance.Name ?? string.Empty,
                url = instance.Url ?? string.Empty,
                isDefault = instance.IsDefault,
                is4k = instance.Is4k
            }),
            sonarrInstances = sonarrInstances.Select(instance => new
            {
                name = instance.Name ?? string.Empty,
                url = instance.Url ?? string.Empty,
                isDefault = instance.IsDefault
            })
        });
    }

    [HttpGet("details/{mediaType}/{mediaId}")]
    [Authorize]
    public ActionResult GetDetails(
        string mediaType,
        int mediaId,
        [FromServices] IUserManager userManager)
    {
        JObject? details = _discoveryService.GetMediaDetails(GetUsername(userManager) ?? string.Empty, mediaType, mediaId);
        return details == null ? NotFound() : Content(details.ToString(), "application/json");
    }

    [HttpGet("justwatch/qualities/{mediaType}/{tmdbId}")]
    [Authorize]
    public async Task<ActionResult<JustWatchQualitiesDto>> GetJustWatchQualities(
        string mediaType,
        int tmdbId,
        CancellationToken cancellationToken)
    {
        if (tmdbId <= 0)
        {
            return BadRequest();
        }

        if (!string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(mediaType, "tv", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest();
        }

        JustWatchQualitiesDto? qualities = await _justWatchQualitiesService
            .GetQualitiesAsync(mediaType, tmdbId, cancellationToken)
            .ConfigureAwait(false);

        if (qualities == null)
        {
            return NotFound();
        }

        return Ok(new
        {
            highestReleasedQuality = qualities.HighestReleasedQuality,
            mostCommonQuality = qualities.MostCommonQuality
        });
    }

    [HttpGet("request-options/{mediaType}")]
    [Authorize]
    public ActionResult GetRequestOptions(string mediaType, [FromServices] IUserManager userManager)
    {
        string? username = GetUsername(userManager);
        if (string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        RequestOptionsResult result = _requestService.GetRequestOptionsResult(username, mediaType);
        // serialize so nested option keys stay camelcase
        JObject payload = new()
        {
            ["canRequest"] = result.CanRequest,
            ["canRequest4k"] = result.CanRequest4k,
            ["canRequestAdvanced"] = result.CanRequestAdvanced,
            ["options"] = result.Options
        };
        return Content(payload.ToString(Newtonsoft.Json.Formatting.None), "application/json");
    }

    [HttpGet("requests")]
    [Authorize]
    public async Task<ActionResult> GetRequests(
        [FromServices] IUserManager userManager,
        [FromQuery] int take = 20,
        [FromQuery] int skip = 0,
        [FromQuery] string? filter = null,
        CancellationToken cancellationToken = default)
    {
        Guid userId = GetUserId();
        string? username = GetUsername(userManager);
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        (int statusCode, string body) = await _requestsService
            .GetRequestsAsync(userId, username, take, skip, filter, cancellationToken)
            .ConfigureAwait(false);

        return new ContentResult
        {
            StatusCode = statusCode,
            Content = body,
            ContentType = "application/json"
        };
    }

    [HttpGet("proxy/avatar")]
    [Authorize]
    public async Task<ActionResult> ProxyAvatar([FromQuery] string? path, CancellationToken cancellationToken)
    {
        (byte[]? data, string? contentType) = await _requestsService
            .GetAvatarAsync(path, cancellationToken)
            .ConfigureAwait(false);

        if (data == null || contentType == null)
        {
            return NotFound();
        }

        return File(data, contentType);
    }

    [HttpPost("request")]
    [Authorize]
    public async Task<ActionResult> MakeDiscoverRequest(
        [FromServices] IUserManager userManager,
        [FromBody] DiscoverRequestPayload payload,
        CancellationToken cancellationToken)
    {
        string? username = GetUsername(userManager);
        if (string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        (int statusCode, string body, string contentType) = await _requestService
            .SubmitRequestAsync(username, payload, cancellationToken)
            .ConfigureAwait(false);

        return new ContentResult
        {
            StatusCode = statusCode,
            Content = body,
            ContentType = contentType
        };
    }

    [HttpGet("letterboxd/sync/progress")]
    [Authorize]
    public ActionResult<LetterboxdSyncProgressDto> GetLetterboxdSyncProgress()
    {
        Guid userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        return Ok(_letterboxdWatchlistService.GetSyncProgress(userId));
    }

    [HttpPost("letterboxd/sync")]
    [Authorize]
    public async Task<ActionResult> SyncLetterboxdWatchlist(
        [FromQuery] string letterboxdUsername,
        CancellationToken cancellationToken)
    {
        Guid userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(letterboxdUsername))
        {
            return BadRequest(new { message = "Letterboxd username is needed." });
        }

        try
        {
            (List<BaseItemDto> items, int totalCount, int resolvedCount, int unresolvedCount) = await _letterboxdWatchlistService
                .SyncAsync(userId, letterboxdUsername, cancellationToken)
                .ConfigureAwait(false);
            Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return Ok(new
            {
                letterboxdUsername = letterboxdUsername.Trim(),
                totalCount,
                resolvedCount,
                unresolvedCount,
                items
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("letterboxd/request/progress")]
    [Authorize]
    public ActionResult<LetterboxdRequestProgressDto> GetLetterboxdRequestProgress()
    {
        Guid userId = GetUserId();
        if (userId == Guid.Empty)
        {
            return Forbid();
        }

        Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        return Ok(_letterboxdBulkRequestService.GetRequestProgress(userId));
    }

    [HttpPost("letterboxd/request/check")]
    [Authorize]
    public ActionResult CheckLetterboxdRequestStatus(
        [FromServices] IUserManager userManager,
        [FromBody] LetterboxdBulkRequestPayload payload)
    {
        string? username = GetUsername(userManager);
        if (string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        if (payload.TmdbIds == null || payload.TmdbIds.Count == 0)
        {
            return BadRequest(new { message = "Select at least one movie." });
        }

        List<int> alreadyRequested = _discoveryService
            .GetAlreadyRequestedMovieIds(username, payload.TmdbIds);
        return Ok(new { tmdbIds = alreadyRequested });
    }

    [HttpPost("letterboxd/request")]
    [Authorize]
    public async Task<ActionResult<LetterboxdBulkRequestResultDto>> RequestLetterboxdItems(
        [FromServices] IUserManager userManager,
        [FromBody] LetterboxdBulkRequestPayload payload,
        CancellationToken cancellationToken)
    {
        Guid userId = GetUserId();
        string? username = GetUsername(userManager);
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(username))
        {
            return Forbid();
        }

        if (payload.TmdbIds == null || payload.TmdbIds.Count == 0)
        {
            return BadRequest(new { message = "Select at least one movie." });
        }

        try
        {
            LetterboxdBulkRequestResultDto result = await _letterboxdBulkRequestService
                .SubmitBulkRequestAsync(userId, username, payload, cancellationToken)
                .ConfigureAwait(false);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private ActionResult ServeEmbedded(string resourceName, string contentType)
    {
        Stream? stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream($"{typeof(SeerrFinPlugin).Namespace}.{resourceName}");
        if (stream == null)
        {
            return NotFound();
        }

        SetCacheHeaders();
        return File(stream, contentType);
    }
}
