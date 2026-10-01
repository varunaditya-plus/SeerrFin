using System.Globalization;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.SeerrFin.Model;

/// <summary>Validates the discovery parameters supported by Seerr before building its URL.</summary>
public static class DiscoveryFilterQuery
{
    public static string BuildPath(string mediaType, IReadOnlyDictionary<string, string> input)
    {
        ValidateMediaType(mediaType);
        Dictionary<string, string> query = new() { ["page"] = "1", ["sortBy"] = "popularity.desc" };
        foreach (var (key, raw) in input)
        {
            string value = raw.Trim();
            if (value.Length == 0) continue;
            bool valid = key switch
            {
                "page" => Integer(value, 1, 500),
                "sortBy" => Sorts(mediaType).Contains(value),
                "genre" or "keywords" or "excludeKeywords" => Ids(value, ','),
                "watchProviders" => Ids(value, '|'),
                "studio" when mediaType == "movie" => Integer(value, 1, int.MaxValue),
                "network" when mediaType == "tv" => Integer(value, 1, int.MaxValue),
                "status" when mediaType == "tv" => value.Split('|').Length <= 6 && value.Split('|').All(x => Integer(x, 0, 5)),
                "language" => Languages(value),
                "watchRegion" or "certificationCountry" => Regex.IsMatch(value, "^[A-Z]{2}$"),
                "primaryReleaseDateGte" or "primaryReleaseDateLte" when mediaType == "movie" => Date(value),
                "firstAirDateGte" or "firstAirDateLte" when mediaType == "tv" => Date(value),
                "voteAverageGte" or "voteAverageLte" => Number(value, 0, 10),
                "voteCountGte" or "voteCountLte" => Integer(value, 0, int.MaxValue),
                "withRuntimeGte" or "withRuntimeLte" => Integer(value, 0, 1440),
                "certification" => value.Split('|').All(x => Certifications(mediaType).Contains(x)) && value.Split('|').Length <= 7,
                _ => false
            };
            if (!valid) throw new ArgumentException($"Invalid discovery filter: {key}.");
            query[key] = value;
        }
        foreach (string prefix in new[] { "voteAverage", "voteCount", "withRuntime" })
        {
            if (query.TryGetValue(prefix + "Gte", out string? min) && query.TryGetValue(prefix + "Lte", out string? max) && decimal.Parse(min, CultureInfo.InvariantCulture) > decimal.Parse(max, CultureInfo.InvariantCulture))
                throw new ArgumentException("Minimum filters must not exceed maximum filters.");
        }
        string datePrefix = mediaType == "movie" ? "primaryReleaseDate" : "firstAirDate";
        if (query.TryGetValue(datePrefix + "Gte", out string? from) && query.TryGetValue(datePrefix + "Lte", out string? to) && string.CompareOrdinal(from, to) > 0)
            throw new ArgumentException("The start date must not follow the end date.");
        if (query.ContainsKey("watchProviders") && !query.ContainsKey("watchRegion")) throw new ArgumentException("Choose a streaming region when filtering providers.");
        if (query.ContainsKey("certification")) query["certificationCountry"] = "US";
        else query.Remove("certificationCountry");
        return $"/api/v1/discover/{(mediaType == "movie" ? "movies" : "tv")}?" + string.Join('&', query.Select(x => Uri.EscapeDataString(x.Key) + "=" + Uri.EscapeDataString(x.Value)));
    }

    public static void ValidateMediaType(string mediaType)
    {
        if (mediaType != "movie" && mediaType != "tv") throw new ArgumentException("Choose movies or TV shows.");
    }

    private static bool Languages(string value)
    {
        string[] languages = value.Split('|');
        return value == "all" || (languages.Length <= 20 && languages.Distinct().Count() == languages.Length && languages.All(x => Regex.IsMatch(x, "^[a-z]{2}$")));
    }
    private static bool Integer(string value, int min, int max) => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out int number) && number >= min && number <= max;
    private static bool Number(string value, decimal min, decimal max) => decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out decimal number) && number >= min && number <= max;
    private static bool Date(string value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    private static bool Ids(string value, char separator) => value.Split(separator).Length <= 20 && value.Split(separator).All(x => Integer(x, 1, int.MaxValue));
    private static string[] Certifications(string type) => type == "movie" ? ["NR", "G", "PG", "PG-13", "R", "NC-17"] : ["NR", "TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];
    private static IEnumerable<string> Sorts(string type) => new[] { "popularity", "vote_average", "vote_count" }
        .Concat(type == "movie" ? ["release_date", "primary_release_date", "original_title", "revenue"] : new[] { "first_air_date", "original_name" })
        .SelectMany(x => new[] { x + ".asc", x + ".desc" });
}
