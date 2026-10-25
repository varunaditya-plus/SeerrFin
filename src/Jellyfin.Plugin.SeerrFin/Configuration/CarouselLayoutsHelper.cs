using System.Text.Json;

namespace Jellyfin.Plugin.SeerrFin.Configuration;

public static class CarouselLayoutsHelper
{
    private static readonly string[] MovieIds =
    [
        "discover/movies/trending", "discover/movies/popular", "discover/movies/top-rated", "discover/movies/upcoming", "genres/movie", "providers/movie", "studios/movie"
    ];

    private static readonly string[] TvIds =
    [
        "discover/tv/trending", "discover/tv/popular", "discover/tv/top-rated", "discover/tv/upcoming", "discover/tv/anime", "genres/tv", "providers/tv", "networks/tv"
    ];

    private static Dictionary<string, List<CarouselLayoutItem>> CreateDefaults() => new()
    {
        ["movies"] = MovieIds.Select(id => new CarouselLayoutItem { Id = id }).ToList(),
        ["tv"] = TvIds.Select(id => new CarouselLayoutItem { Id = id }).ToList(),
        ["discover"] = MovieIds.Concat(TvIds).Select(id => new CarouselLayoutItem { Id = id }).ToList()
    };

    public static Dictionary<string, List<CarouselLayoutItem>> Deserialize(string? json)
    {
        var defaultsByPage = CreateDefaults();
        var layouts = new Dictionary<string, List<CarouselLayoutItem>>(defaultsByPage);
        if (string.IsNullOrWhiteSpace(json))
        {
            return layouts;
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return layouts;
            }

            foreach (JsonProperty page in document.RootElement.EnumerateObject())
            {
                string pageId = page.Name.Trim().ToLowerInvariant();
                if (!defaultsByPage.TryGetValue(pageId, out var defaults) || page.Value.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var knownIds = defaults.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
                var ordered = new List<CarouselLayoutItem>();
                var itemsById = new Dictionary<string, CarouselLayoutItem>(StringComparer.Ordinal);

                foreach (JsonElement source in page.Value.EnumerateArray())
                {
                    if (source.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    string id = string.Empty;
                    bool enabled = true;
                    foreach (JsonProperty property in source.EnumerateObject())
                    {
                        if (property.Name.Equals("id", StringComparison.OrdinalIgnoreCase) && property.Value.ValueKind == JsonValueKind.String)
                        {
                            id = (property.Value.GetString() ?? string.Empty).Trim().ToLowerInvariant();
                        }
                        else if (property.Name.Equals("enabled", StringComparison.OrdinalIgnoreCase))
                        {
                            enabled = property.Value.ValueKind != JsonValueKind.False;
                        }
                    }

                    if (!knownIds.Contains(id))
                    {
                        continue;
                    }

                    if (itemsById.TryGetValue(id, out var existing))
                    {
                        // Keep the first position and the most recently saved enabled state.
                        existing.Enabled = enabled;
                        continue;
                    }

                    var item = new CarouselLayoutItem { Id = id, Enabled = enabled };
                    ordered.Add(item);
                    itemsById[id] = item;
                }

                ordered.AddRange(defaults.Where(item => !itemsById.ContainsKey(item.Id)));
                layouts[pageId] = ordered;
            }
        }
        catch (JsonException)
        {
            return CreateDefaults();
        }

        return layouts;
    }

    public static Dictionary<string, List<CarouselLayoutItem>> Resolve(PluginConfiguration config) => Deserialize(config.CarouselLayoutsJson);
}
