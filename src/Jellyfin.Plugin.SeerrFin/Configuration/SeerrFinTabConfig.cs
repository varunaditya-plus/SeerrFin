namespace Jellyfin.Plugin.SeerrFin.Configuration;

public class SeerrFinTabConfig
{
    public string Id { get; set; } = string.Empty;

    public bool Enabled { get; set; } = true;

    public string Title { get; set; } = string.Empty;

    public static List<SeerrFinTabConfig> CreateDefaults() =>
    [
        new() { Id = "movies", Title = "Movies" },
        new() { Id = "tv", Title = "TV Shows" },
        new() { Id = "discover", Enabled = false, Title = "Discover" },
        new() { Id = "requests", Title = "Requests" },
        new() { Id = "watchlist", Title = "Watchlist" },
        new() { Id = "letterboxd", Title = "Letterboxd" }
    ];
}
