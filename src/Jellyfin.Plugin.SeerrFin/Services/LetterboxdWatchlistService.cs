using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using Jellyfin.Plugin.SeerrFin;
using Jellyfin.Plugin.SeerrFin.Model;
using MediaBrowser.Model.Dto;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class LetterboxdWatchlistService
{
    private const string UserAgent =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

    private static readonly Regex MovieEntryRegex = new(
        @"data-item-slug=""([^""]+)""[^>]*data-item-link=""[^""]*"" data-item-full-display-name=""([^""]+)""",
        RegexOptions.Compiled
    );

    private static readonly Regex PageNumberRegex = new(
        @"<li class=""paginate-page[^""]*""[^>]*>(?:<a[^>]*>|<span[^>]*>)\s*(\d+)",
        RegexOptions.Compiled
    );

    private static readonly Regex DisplayNameRegex = new(@"^(.+?) \((\d{4})\)$", RegexOptions.Compiled);

    private static readonly Regex TmdbIdRegex = new(@"data-tmdb-id=""(\d+)""", RegexOptions.Compiled);

    private readonly HttpClient _httpClient;
    private readonly ConcurrentDictionary<Guid, LetterboxdSyncProgressDto> _syncProgress = new();

    public LetterboxdWatchlistService(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient(nameof(LetterboxdWatchlistService));
        int timeout = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Letterboxd.HttpTimeoutSeconds;
        _httpClient.Timeout = TimeSpan.FromSeconds(timeout);
    }

    public LetterboxdSyncProgressDto GetSyncProgress(Guid userId)
    {
        if (_syncProgress.TryGetValue(userId, out LetterboxdSyncProgressDto? progress))
        {
            return progress;
        }

        return new LetterboxdSyncProgressDto { Percent = 0, Phase = string.Empty, IsActive = false };
    }

    public async Task<(List<BaseItemDto> Items, int TotalCount, int ResolvedCount, int UnresolvedCount)> SyncAsync(
        Guid userId,
        string username,
        CancellationToken cancellationToken = default
    )
    {
        username = username.Trim();

        if (!AdvancedSettingsHelper.IsValidLetterboxdUsername(SeerrFinPlugin.Instance.Configuration, username))
        {
            throw new ArgumentException("Invalid Letterboxd username.");
        }

        string? apiKey = SeerrFinPlugin.Instance.Configuration.TmdbApiKey?.Trim();
        if (string.IsNullOrEmpty(apiKey))
        {
            throw new InvalidOperationException("TMDB API key is required to sync Letterboxd watchlists.");
        }

        SetSyncProgress(userId, 0, "pages");

        try
        {
            // Scrape public watchlist pages
            string firstUrl = $"https://letterboxd.com/{Uri.EscapeDataString(username)}/watchlist/";
            string html = await FetchLetterboxdAsync(firstUrl, cancellationToken).ConfigureAwait(false);

            // Last paginate-page number is the total page count.
            List<int> pageNumbers = PageNumberRegex.Matches(html)
                .Select(match => int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture))
                .ToList();
            int totalPages = pageNumbers.Count == 0 ? 1 : pageNumbers[^1];

            List<(string Slug, string Title, int Year)> movies = new();

            for (int page = 1; page <= totalPages; page++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                // Page 1 html already loaded. fetch remaining pages separately.
                string pageHtml =
                    page == 1
                        ? html
                        : await FetchLetterboxdAsync(
                                $"https://letterboxd.com/{Uri.EscapeDataString(username)}/watchlist/page/{page}/",
                                cancellationToken
                            )
                            .ConfigureAwait(false);

                foreach ((string slug, string title, int year) in MoviesFromPage(pageHtml))
                {
                    if (!movies.Contains((slug, title, year)))
                    {
                        movies.Add((slug, title, year));
                    }
                }

                SetSyncProgress(userId, PageProgressPercent(page, totalPages), "pages");
            }

            List<BaseItemDto> items = new();
            HashSet<int> seenTmdbIds = new();
            int unresolvedCount = 0;
            int totalMovies = movies.Count;
            int resolvedIndex = 0;

            SetSyncProgress(userId, 50, "tmdb");

            foreach ((string slug, string title, int year) in movies)
            {
                cancellationToken.ThrowIfCancellationRequested();

                // Search tmdb by title/year first, then get data-tmdb-id from the movie page.
                TmdbMovieRefs? movie = await SearchTmdbMovieAsync(title, year, apiKey, cancellationToken).ConfigureAwait(false);
                if (movie == null)
                {
                    int? tmdbId = await TmdbIdFromLetterboxdAsync(slug, cancellationToken).ConfigureAwait(false);
                    if (tmdbId != null)
                    {
                        movie = await GetTmdbMovieDetailsAsync(tmdbId.Value, apiKey, cancellationToken).ConfigureAwait(false);
                    }
                }

                if (movie == null)
                {
                    unresolvedCount++;
                }
                else if (seenTmdbIds.Add(movie.Id))
                {
                    Dictionary<string, string> providerIds = new() { { "Tmdb", movie.Id.ToString(CultureInfo.InvariantCulture) } };

                    if (!string.IsNullOrEmpty(movie.PosterPath))
                    {
                        providerIds["TmdbPosterPath"] = movie.PosterPath;
                    }

                    if (!string.IsNullOrEmpty(movie.BackdropPath))
                    {
                        providerIds["TmdbBackdropPath"] = movie.BackdropPath;
                    }

                    items.Add(
                        new BaseItemDto
                        {
                            Name = title,
                            SourceType = "movie",
                            PremiereDate = new DateTime(year, 1, 1),
                            CommunityRating = movie.Rating,
                            ProviderIds = providerIds
                        }
                    );
                }

                resolvedIndex++;
                SetSyncProgress(userId, TmdbProgressPercent(resolvedIndex, totalMovies), "tmdb");
            }

            SetSyncProgress(userId, 100, "tmdb");

            return (items, movies.Count, items.Count, unresolvedCount);
        }
        finally
        {
            ClearSyncProgress(userId);
        }
    }

    private static int PageProgressPercent(int page, int totalPages)
    {
        if (totalPages <= 0)
        {
            return 0;
        }

        int pagesWeight = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Letterboxd.SyncPagesProgressWeight;

        return (int)Math.Round(page * pagesWeight / (double)totalPages);
    }

    private static int TmdbProgressPercent(int resolvedIndex, int totalMovies)
    {
        if (totalMovies <= 0)
        {
            return 100;
        }

        int pagesWeight = AdvancedSettingsHelper.Resolve(SeerrFinPlugin.Instance.Configuration).Letterboxd.SyncPagesProgressWeight;
        int tmdbWeight = Math.Max(0, 100 - pagesWeight);

        return pagesWeight + (int)Math.Round(resolvedIndex * tmdbWeight / (double)totalMovies);
    }

    private void SetSyncProgress(Guid userId, int percent, string phase)
    {
        _syncProgress[userId] = new LetterboxdSyncProgressDto
        {
            Percent = Math.Clamp(percent, 0, 100),
            Phase = phase,
            IsActive = true
        };
    }

    private void ClearSyncProgress(Guid userId)
    {
        _syncProgress.TryRemove(userId, out _);
    }

    // Parse data-item-slug and "Title (Year)" from watchlist card markup.
    private static IEnumerable<(string Slug, string Title, int Year)> MoviesFromPage(string pageHtml)
    {
        foreach (Match match in MovieEntryRegex.Matches(pageHtml))
        {
            string display = WebUtility.HtmlDecode(match.Groups[2].Value);
            Match titleMatch = DisplayNameRegex.Match(display);
            if (!titleMatch.Success)
            {
                continue;
            }

            yield return (
                match.Groups[1].Value,
                titleMatch.Groups[1].Value.Trim(),
                int.Parse(titleMatch.Groups[2].Value, CultureInfo.InvariantCulture)
            );
        }
    }

    // Letterboxd needs a validated request (cookie + sec-fetch-user) before real page fetch or else will cf block
    private async Task<string> FetchLetterboxdAsync(string url, CancellationToken cancellationToken)
    {
        using HttpRequestMessage warmup = CreateLetterboxdRequest(url, "https://letterboxd.com/", includeSecFetchUser: true);
        using HttpResponseMessage warmupResponse = await _httpClient.SendAsync(warmup, cancellationToken).ConfigureAwait(false);
        await warmupResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        using HttpRequestMessage request = CreateLetterboxdRequest(url, url, includeSecFetchUser: false);
        using HttpResponseMessage response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
    }

    private static HttpRequestMessage CreateLetterboxdRequest(string url, string referer, bool includeSecFetchUser)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("User-Agent", UserAgent);
        request.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "document");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "navigate");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "same-origin");
        request.Headers.TryAddWithoutValidation("Referer", referer);

        if (includeSecFetchUser)
        {
            request.Headers.TryAddWithoutValidation("Sec-Fetch-User", "?1");
        }

        request.Headers.TryAddWithoutValidation("Cookie", "useMobileSite=no");

        return request;
    }

    private sealed record TmdbMovieRefs(int Id, string? PosterPath, string? BackdropPath, float? Rating);

    private async Task<TmdbMovieRefs?> SearchTmdbMovieAsync(string title, int year, string apiKey, CancellationToken cancellationToken)
    {
        string url =
            $"https://api.themoviedb.org/3/search/movie?query={Uri.EscapeDataString(title)}&year={year.ToString(CultureInfo.InvariantCulture)}";
        using HttpRequestMessage request = CreateTmdbRequest(url, apiKey);
        using HttpResponseMessage response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        string json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        // Require exact title match and release year to prevent wrong tmdb hit
        foreach (JObject movie in JObject.Parse(json).Value<JArray>("results")?.OfType<JObject>() ?? [])
        {
            if (!string.Equals(movie.Value<string>("title")?.Trim(), title.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string releaseDate = movie.Value<string>("release_date") ?? string.Empty;
            if (!releaseDate.StartsWith(year.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
            {
                continue;
            }

            return new TmdbMovieRefs(
                movie.Value<int>("id"),
                NormalizeTmdbImagePath(movie.Value<string>("poster_path")),
                NormalizeTmdbImagePath(movie.Value<string>("backdrop_path")),
                movie.Value<float?>("vote_average")
            );
        }

        return null;
    }

    private async Task<TmdbMovieRefs?> GetTmdbMovieDetailsAsync(int tmdbId, string apiKey, CancellationToken cancellationToken)
    {
        string url = "https://api.themoviedb.org/3/movie/" + tmdbId.ToString(CultureInfo.InvariantCulture);
        using HttpRequestMessage request = CreateTmdbRequest(url, apiKey);
        using HttpResponseMessage response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        string json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        JObject movie = JObject.Parse(json);
        int? id = movie.Value<int?>("id");
        if (id == null)
        {
            return null;
        }

        return new TmdbMovieRefs(
            id.Value,
            NormalizeTmdbImagePath(movie.Value<string>("poster_path")),
            NormalizeTmdbImagePath(movie.Value<string>("backdrop_path")),
            movie.Value<float?>("vote_average")
        );
    }

    private static string? NormalizeTmdbImagePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        return path.StartsWith('/') ? path : "/" + path;
    }

    // Fallback if no tmdb id found from search: read data-tmdb-id from Letterboxd film page
    // This takes around 2x longer with only letterboxd scraping, so use tmdb search as primary source.
    private async Task<int?> TmdbIdFromLetterboxdAsync(string slug, CancellationToken cancellationToken)
    {
        string html = await FetchLetterboxdAsync($"https://letterboxd.com/film/{Uri.EscapeDataString(slug)}/", cancellationToken)
            .ConfigureAwait(false);
        Match match = TmdbIdRegex.Match(html);

        return
            match.Success
            && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int tmdbId)
            ? tmdbId
            : null;
    }

    private static HttpRequestMessage CreateTmdbRequest(string url, string apiKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (apiKey.Split('.').Length == 3)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }
        else
        {
            request.RequestUri = new Uri(
                url
                    + (url.Contains('?', StringComparison.Ordinal) ? "&" : "?")
                    + "api_key="
                    + Uri.EscapeDataString(apiKey)
            );
        }

        return request;
    }
}
