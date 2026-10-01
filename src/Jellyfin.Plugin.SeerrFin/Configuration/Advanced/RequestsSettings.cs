namespace Jellyfin.Plugin.SeerrFin.Configuration.Advanced;

public class AdvancedRequestsSettings
{
    public int PageSize { get; set; } = 20;

    public int FetchSize { get; set; } = 100;

    public bool OpenExternalLinksInModal { get; set; }

    public bool CardsInteractive { get; set; }

    public bool CardsIncludeMetaText { get; set; }

    public bool IncludePartialsInProcessingFilter { get; set; }

    public bool SplitPartiallyAvailableFilter { get; set; }

    public int AutoRefreshIntervalSeconds { get; set; } = 10;

    public bool RefreshOnVisibility { get; set; } = true;

    public bool RefreshOnTabShow { get; set; } = true;
}