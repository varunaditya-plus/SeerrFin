namespace Jellyfin.Plugin.SeerrFin.Configuration.Advanced;

public class AdvancedRequestModalSettings
{
    public bool AllowQualityProfileSelection { get; set; } = true;

    public bool TvSeasonPickerEnabled { get; set; } = true;

    public bool IncludeSpecialsSeason { get; set; }

    public bool RequireExplicitSeasonSelection { get; set; }

    public bool ShowRequest4kButton { get; set; } = true;
}
