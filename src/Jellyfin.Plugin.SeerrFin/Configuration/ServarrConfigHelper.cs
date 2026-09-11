namespace Jellyfin.Plugin.SeerrFin.Configuration;

public static class ServarrConfigHelper
{
    private static readonly string[] KnownKinds = new[] { "radarr", "sonarr" };

    public static IReadOnlyList<ServarrInstanceConfig> Resolve(PluginConfiguration config)
    {
        config.ServarrInstances ??= new List<ServarrInstanceConfig>();

        List<ServarrInstanceConfig> instances = config.ServarrInstances
            .Where(instance => instance != null)
            .Select(NormalizeInstance)
            .Where(instance => !IsEffectivelyEmpty(instance))
            .ToList();

        if (instances.Count == 0)
        {
            instances = CreateLegacyInstances(config);
        }

        NormalizeNames(instances);
        NormalizeDefaults(instances);

        config.ServarrInstances = instances;
        SyncLegacyFields(config, instances);
        return instances;
    }

    public static IReadOnlyList<ServarrInstanceConfig> GetConfiguredInstances(PluginConfiguration config, string kind) =>
        Resolve(config)
            .Where(instance => string.Equals(instance.Kind, NormalizeKind(kind), StringComparison.OrdinalIgnoreCase) && IsConfigured(instance))
            .ToList();

    public static string? GetPreferredUrl(PluginConfiguration config, string kind)
    {
        ServarrInstanceConfig? instance = GetPreferredInstance(config, kind);
        return instance?.Url?.Trim();
    }

    public static ServarrInstanceConfig? GetPreferredInstance(PluginConfiguration config, string kind)
    {
        string normalizedKind = NormalizeKind(kind);
        IReadOnlyList<ServarrInstanceConfig> instances = Resolve(config)
            .Where(instance => string.Equals(instance.Kind, normalizedKind, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (instances.Count == 0)
        {
            return null;
        }

        ServarrInstanceConfig? configuredDefault = instances.FirstOrDefault(instance => instance.IsDefault && IsConfigured(instance));
        if (configuredDefault != null)
        {
            return configuredDefault;
        }

        ServarrInstanceConfig? configured = instances.FirstOrDefault(IsConfigured);
        if (configured != null)
        {
            return configured;
        }

        return instances[0];
    }

    public static bool IsConfigured(ServarrInstanceConfig instance) =>
        !string.IsNullOrWhiteSpace(instance.Url) && !string.IsNullOrWhiteSpace(instance.ApiKey);

    public static string NormalizeKind(string? kind) =>
        string.Equals(kind, "sonarr", StringComparison.OrdinalIgnoreCase) ? "sonarr" : "radarr";

    public static string GetKindLabel(string kind) =>
        string.Equals(NormalizeKind(kind), "sonarr", StringComparison.OrdinalIgnoreCase) ? "Sonarr" : "Radarr";

    private static ServarrInstanceConfig NormalizeInstance(ServarrInstanceConfig instance)
    {
        string kind = NormalizeKind(instance.Kind);
        return new ServarrInstanceConfig
        {
            Kind = kind,
            Name = string.IsNullOrWhiteSpace(instance.Name) ? string.Empty : instance.Name.Trim(),
            Url = string.IsNullOrWhiteSpace(instance.Url) ? string.Empty : instance.Url.Trim(),
            ApiKey = string.IsNullOrWhiteSpace(instance.ApiKey) ? string.Empty : instance.ApiKey.Trim(),
            IsDefault = instance.IsDefault,
            Is4k = string.Equals(kind, "radarr", StringComparison.OrdinalIgnoreCase) && instance.Is4k
        };
    }

    private static List<ServarrInstanceConfig> CreateLegacyInstances(PluginConfiguration config)
    {
        List<ServarrInstanceConfig> instances = new();

        if (!string.IsNullOrWhiteSpace(config.RadarrUrl) || !string.IsNullOrWhiteSpace(config.RadarrApiKey))
        {
            instances.Add(new ServarrInstanceConfig
            {
                Kind = "radarr",
                Name = string.Empty,
                Url = config.RadarrUrl?.Trim() ?? string.Empty,
                ApiKey = config.RadarrApiKey?.Trim() ?? string.Empty,
                IsDefault = true,
                Is4k = false
            });
        }

        if (!string.IsNullOrWhiteSpace(config.SonarrUrl) || !string.IsNullOrWhiteSpace(config.SonarrApiKey))
        {
            instances.Add(new ServarrInstanceConfig
            {
                Kind = "sonarr",
                Name = string.Empty,
                Url = config.SonarrUrl?.Trim() ?? string.Empty,
                ApiKey = config.SonarrApiKey?.Trim() ?? string.Empty,
                IsDefault = true,
                Is4k = false
            });
        }

        return instances;
    }

    private static void NormalizeNames(List<ServarrInstanceConfig> instances)
    {
        Dictionary<string, int> counts = new(StringComparer.OrdinalIgnoreCase);

        foreach (ServarrInstanceConfig instance in instances)
        {
            string kind = NormalizeKind(instance.Kind);
            counts.TryGetValue(kind, out int current);
            current++;
            counts[kind] = current;

            if (string.IsNullOrWhiteSpace(instance.Name))
            {
                instance.Name = $"{GetKindLabel(kind)} {current}";
            }
            else
            {
                instance.Name = instance.Name.Trim();
            }
        }
    }

    private static void NormalizeDefaults(List<ServarrInstanceConfig> instances)
    {
        foreach (string kind in KnownKinds)
        {
            List<ServarrInstanceConfig> byKind = instances
                .Where(instance => string.Equals(instance.Kind, kind, StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (byKind.Count == 0)
            {
                continue;
            }

            ServarrInstanceConfig? selected = byKind.FirstOrDefault(instance => instance.IsDefault && IsConfigured(instance))
                ?? byKind.FirstOrDefault(instance => instance.IsDefault)
                ?? byKind.FirstOrDefault(IsConfigured)
                ?? byKind[0];

            bool selectedSeen = false;
            foreach (ServarrInstanceConfig instance in byKind)
            {
                if (!selectedSeen && ReferenceEquals(instance, selected))
                {
                    instance.IsDefault = true;
                    selectedSeen = true;
                }
                else
                {
                    instance.IsDefault = false;
                }
            }
        }
    }

    private static void SyncLegacyFields(PluginConfiguration config, IReadOnlyList<ServarrInstanceConfig> instances)
    {
        ServarrInstanceConfig? radarr = GetPreferredLegacySource(instances, "radarr");
        ServarrInstanceConfig? sonarr = GetPreferredLegacySource(instances, "sonarr");

        config.RadarrUrl = radarr?.Url?.Trim() ?? string.Empty;
        config.RadarrApiKey = radarr?.ApiKey?.Trim() ?? string.Empty;
        config.SonarrUrl = sonarr?.Url?.Trim() ?? string.Empty;
        config.SonarrApiKey = sonarr?.ApiKey?.Trim() ?? string.Empty;
    }

    private static ServarrInstanceConfig? GetPreferredLegacySource(IReadOnlyList<ServarrInstanceConfig> instances, string kind)
    {
        string normalizedKind = NormalizeKind(kind);
        return instances.FirstOrDefault(instance => string.Equals(instance.Kind, normalizedKind, StringComparison.OrdinalIgnoreCase) && instance.IsDefault && IsConfigured(instance))
            ?? instances.FirstOrDefault(instance => string.Equals(instance.Kind, normalizedKind, StringComparison.OrdinalIgnoreCase) && IsConfigured(instance))
            ?? instances.FirstOrDefault(instance => string.Equals(instance.Kind, normalizedKind, StringComparison.OrdinalIgnoreCase) && instance.IsDefault)
            ?? instances.FirstOrDefault(instance => string.Equals(instance.Kind, normalizedKind, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsEffectivelyEmpty(ServarrInstanceConfig instance) =>
        string.IsNullOrWhiteSpace(instance.Url) && string.IsNullOrWhiteSpace(instance.ApiKey);
}
