namespace Jellyfin.Plugin.SeerrFin.Configuration;

public sealed class ServarrInstanceConfig
{
    public string Kind { get; set; } = "radarr";

    public string? Name { get; set; } = string.Empty;

    public string? Url { get; set; } = string.Empty;

    public string? ApiKey { get; set; } = string.Empty;

    public bool IsDefault { get; set; }

    public bool Is4k { get; set; }
}
