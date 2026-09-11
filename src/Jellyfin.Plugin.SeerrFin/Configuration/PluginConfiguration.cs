using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeerrFin.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string? JellyseerrUrl { get; set; } = string.Empty;

    public string? ExternalJellyseerrUrl { get; set; } = string.Empty;

    public string? JellyseerrApiKey { get; set; } = string.Empty;

    public string? RadarrUrl { get; set; } = string.Empty;

    public string? RadarrApiKey { get; set; } = string.Empty;

    public string? SonarrUrl { get; set; } = string.Empty;

    public string? SonarrApiKey { get; set; } = string.Empty;

    public List<ServarrInstanceConfig> ServarrInstances { get; set; } = new();

    public string? JellyseerrPreferredLanguages { get; set; } = "en";

    public string? TmdbApiKey { get; set; } = string.Empty;

    public string WatchRegion { get; set; } = "US";

    public int RowItemLimit { get; set; } = 20;

    public int CacheTimeoutSeconds { get; set; } = 86400;

    public int MaxImageCacheEntries { get; set; } = 5000;

    public bool DeveloperMode { get; set; }

    public int CacheBustCounter { get; set; }

    public bool StreamingServiceUseImages { get; set; } = true;

    public bool StudioNetworkUseImages { get; set; } = true;

    public bool GenreUseBackdrops { get; set; } = true;

    public bool DiscoverUsePosters { get; set; } = true;

    public List<int> DiscoverReleaseTypes { get; set; } = new();

    public bool ElegantFinFixes { get; set; }

    public bool QualityRecommendations { get; set; } = true;

    public bool AddSeerrResultsInSearch { get; set; } = true;

    public bool NativeCarousels { get; set; }

    public bool NativeGridPages { get; set; }

    public bool NativeSearchResults { get; set; }

    public string DisplayCustomizationsJson { get; set; } = string.Empty;

    // Start empty because XmlSerializer adds to existing list instead of replacing so a default would survive deserialization and override saved tab states.
    public List<SeerrFinTabConfig> Tabs { get; set; } = new();

    public List<string> TabBarOrder { get; set; } = new();

    public AdvancedSettings? Advanced { get; set; }
}
