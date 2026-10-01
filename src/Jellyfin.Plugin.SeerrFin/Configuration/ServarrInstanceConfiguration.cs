namespace Jellyfin.Plugin.SeerrFin.Configuration;

public class ServarrInstanceConfiguration
{
    public int ServerId { get; set; }

    public string Url { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public string ExternalUrl { get; set; } = string.Empty;
}
