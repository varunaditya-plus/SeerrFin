using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

internal static class DownloadProgress
{
    public static ServarrProgressInfo? Build(IEnumerable<JObject> records)
    {
        List<JObject> items = records.Where(item => !IsState(item, "trackedDownloadState", "imported")).ToList();
        if (items.Count == 0) { return null; }

        // A season pack has one Sonarr queue row per episode, but only one transfer.
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        List<JObject> downloads = items.OrderByDescending(HasKnownSize).Where(item =>
        {
            string? id = item.Value<string>("downloadId");
            return string.IsNullOrWhiteSpace(id) || seen.Add(id);
        }).ToList();

        bool knownSize = downloads.All(HasKnownSize);
        double total = knownSize ? downloads.Sum(item => item.Value<double>("size")) : 0;
        double left = knownSize ? downloads.Sum(item => Math.Min(item.Value<double>("size"), Remaining(item)!.Value<double>())) : 0;
        knownSize = knownSize && double.IsFinite(total) && total < long.MaxValue;

        double downloaded = total - left;
        var states = items.Select(GetState).ToList();
        var state = states.OrderBy(item => item.Priority).First();

        string label = state.Key == "paused" && states.Any(item => item.Key != "paused") ? "Some downloads paused" : state.Label;
        string detail = string.Join(" • ", items.SelectMany(item =>
            (item["statusMessages"] as JArray)?.OfType<JObject>().SelectMany(message =>
                message["messages"]?.Values<string>() ?? Enumerable.Empty<string>()) ?? Enumerable.Empty<string>())
            .Concat(items.Select(item => item.Value<string>("errorMessage")))
            .Where(message => !string.IsNullOrWhiteSpace(message)).Distinct());

        return new ServarrProgressInfo
        {
            StatusKey = state.Key,
            StatusLabel = label,
            Percent = knownSize ? left == 0 ? 100 : Math.Min(99, (int)Math.Floor(downloaded / total * 100)) : null,
            DownloadedBytes = knownSize ? (long)downloaded : null,
            TotalBytes = knownSize ? (long)total : null,
            IsActive = states.Any(item => item.Active),
            IsTransfer = true,
            Detail = string.IsNullOrEmpty(detail) ? null : detail[..Math.Min(detail.Length, 1200)]
        };
    }

    private static JToken? Remaining(JObject item) => item["sizeleft"] ?? item["sizeLeft"];

    private static bool HasKnownSize(JObject item) => IsSize(item["size"], positive: true) && IsSize(Remaining(item));

    private static bool IsSize(JToken? token, bool positive = false)
    {
        if (token?.Type is not (JTokenType.Integer or JTokenType.Float)) { return false; }
        double value = token.Value<double>();
        return double.IsFinite(value) && value < long.MaxValue && (positive ? value > 0 : value >= 0);
    }

    private static bool IsState(JObject item, string field, string state) =>
        string.Equals(item.Value<string>(field), state, StringComparison.OrdinalIgnoreCase);

    private static (string Key, string Label, int Priority, bool Active) GetState(JObject item)
    {
        string status = item.Value<string>("status")?.ToLowerInvariant() ?? "unknown";
        string tracked = item.Value<string>("trackedDownloadState")?.ToLowerInvariant() ?? string.Empty;
        string health = item.Value<string>("trackedDownloadStatus")?.ToLowerInvariant() ?? "ok";

        if (tracked is "failed" or "failedpending" || status == "failed") { return ("failed", "Download failed", 0, false); }
        if (tracked == "importblocked" || status == "completed" && health is "warning" or "error") { return ("import-blocked", "Import blocked", 1, false); }
        if (tracked == "ignored") { return ("import-blocked", "Import skipped", 2, false); }
        if (status == "warning" || health is "warning" or "error") { return ("warning", "Download warning", 3, false); }
        if (status == "downloadclientunavailable") { return ("warning", "Download client unavailable", 4, false); }
        if (tracked == "importing") { return ("importing", "Importing", 5, true); }
        if (status == "paused") { return ("paused", "Paused", 6, false); }
        if (status == "completed" || tracked == "importpending") { return ("waiting-import", "Waiting for import", 7, false); }
        if (status == "downloading") { return ("downloading", "Downloading", 8, true); }
        if (status is "queued" or "queue" or "delay" or "fallback") { return ("queued", "Queued", 9, false); }
        return ("unknown", "Download status unknown", 10, false);
    }
}

internal sealed class ServarrProgressInfo
{
    public string StatusLabel { get; set; } = string.Empty;
    public string StatusKey { get; set; } = string.Empty;
    public int? Percent { get; set; }
    public long? DownloadedBytes { get; set; }
    public long? TotalBytes { get; set; }
    public bool IsActive { get; set; }
    public bool IsTransfer { get; set; }
    public string? Detail { get; set; }
    public string? OpenUrl { get; set; }

    public JObject ToJson() => new()
    {
        ["statusLabel"] = StatusLabel,
        ["statusKey"] = StatusKey,
        ["percent"] = Percent,
        ["downloadedBytes"] = DownloadedBytes,
        ["totalBytes"] = TotalBytes,
        ["isActive"] = IsActive,
        ["isTransfer"] = IsTransfer,
        ["detail"] = Detail,
        ["openUrl"] = OpenUrl
    };
}
