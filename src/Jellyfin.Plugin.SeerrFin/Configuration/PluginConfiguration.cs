using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Xml.Serialization;
using Jellyfin.Plugin.SeerrFin.Configuration.Advanced;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeerrFin.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string? JellyseerrUrl { get; set; } = string.Empty;

    public string? ExternalJellyseerrUrl { get; set; } = string.Empty;

    private string? _jellyseerrApiKey = string.Empty;

    // Not serialized to disk directly - value is persisted encrypted via JellyseerrApiKeyEncrypted.
    [XmlIgnore]
    public string? JellyseerrApiKey
    {
        get => _jellyseerrApiKey;
        set => _jellyseerrApiKey = value;
    }

    [XmlElement("JellyseerrApiKey")]
    public string? JellyseerrApiKeyEncrypted
    {
        get => Protect(_jellyseerrApiKey);
        set => _jellyseerrApiKey = Unprotect(value);
    }

    public string? RadarrUrl { get; set; } = string.Empty;

    private string? _radarrApiKey = string.Empty;

    [XmlIgnore]
    public string? RadarrApiKey
    {
        get => _radarrApiKey;
        set => _radarrApiKey = value;
    }

    [XmlElement("RadarrApiKey")]
    public string? RadarrApiKeyEncrypted
    {
        get => Protect(_radarrApiKey);
        set => _radarrApiKey = Unprotect(value);
    }

    public string? SonarrUrl { get; set; } = string.Empty;

    private string? _sonarrApiKey = string.Empty;

    [XmlIgnore]
    public string? SonarrApiKey
    {
        get => _sonarrApiKey;
        set => _sonarrApiKey = value;
    }

    [XmlElement("SonarrApiKey")]
    public string? SonarrApiKeyEncrypted
    {
        get => Protect(_sonarrApiKey);
        set => _sonarrApiKey = Unprotect(value);
    }

    public string? JellyseerrPreferredLanguages { get; set; } = "en";

    private string? _tmdbApiKey = string.Empty;

    [XmlIgnore]
    public string? TmdbApiKey
    {
        get => _tmdbApiKey;
        set => _tmdbApiKey = value;
    }

    [XmlElement("TmdbApiKey")]
    public string? TmdbApiKeyEncrypted
    {
        get => Protect(_tmdbApiKey);
        set => _tmdbApiKey = Unprotect(value);
    }

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

    private static readonly byte[] EncryptionKey = SHA256.HashData(Encoding.UTF8.GetBytes("SeerrFin.Config." + Environment.MachineName));

    private static string? Protect(string? plainText)
    {
        if (string.IsNullOrEmpty(plainText))
        {
            return plainText;
        }

        using Aes aes = Aes.Create();
        aes.Key = EncryptionKey;
        aes.GenerateIV();
        using ICryptoTransform encryptor = aes.CreateEncryptor();
        byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
        byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
        return Convert.ToBase64String(aes.IV.Concat(cipherBytes).ToArray());
    }

    private static string? Unprotect(string? protectedText)
    {
        if (string.IsNullOrEmpty(protectedText))
        {
            return protectedText;
        }

        try
        {
            byte[] data = Convert.FromBase64String(protectedText);
            using Aes aes = Aes.Create();
            aes.Key = EncryptionKey;
            aes.IV = data.Take(16).ToArray();
            using ICryptoTransform decryptor = aes.CreateDecryptor();
            byte[] cipherBytes = data.Skip(16).ToArray();
            return Encoding.UTF8.GetString(decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length));
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException or ArgumentException)
        {
            // Legacy plaintext value saved before encryption at rest was introduced.
            return protectedText;
        }
    }
}
