using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Model;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Helpers;

public static class TransformationPatches
{
    public static string WebConfig(PatchRequestPayload payload)
    {
        string contents = payload.Contents ?? string.Empty;
        JObject webConfig;
        try
        {
            webConfig = JObject.Parse(contents);
        }
        catch (JsonReaderException)
        {
            return contents;
        }

        var config = SeerrFinPlugin.Instance.Configuration;
        var tabs = SeerrFinTabConfigHelper.Normalize(config.Tabs).ToDictionary(tab => tab.Id);
        var menuLinks = webConfig["menuLinks"] as JArray ?? new JArray();
        var tabUrls = tabs.Keys.Select(id => $"#/home?seerrfinTab={id}").ToHashSet(StringComparer.Ordinal);

        // Replace only our own links but keep web client's other settings and links.
        foreach (JObject link in menuLinks.OfType<JObject>().ToList())
        {
            if (tabUrls.Contains(link.Value<string>("url") ?? string.Empty))
            {
                link.Remove();
            }
        }

        foreach (string key in SeerrFinTabConfigHelper.NormalizeBarOrder(config.TabBarOrder))
        {
            if (!key.StartsWith("sf:", StringComparison.Ordinal) || !tabs.TryGetValue(key[3..], out var tab) || !tab.Enabled)
            {
                continue;
            }

            menuLinks.Add(new JObject
            {
                ["name"] = tab.Title,
                ["icon"] = tab.Id switch
                {
                    "movies" => "movie",
                    "tv" => "tv",
                    "requests" => "download",
                    _ => "bookmark"
                },
                ["url"] = $"#/home?seerrfinTab={tab.Id}"
            });
        }

        // Jellyfin 12 renders these in Modern toolbar, overflow menu and drawer.
        webConfig["menuLinks"] = menuLinks;
        return webConfig.ToString(Formatting.None);
    }

    public static string IndexHtml(PatchRequestPayload payload)
    {
        string version = SeerrFinPlugin.Instance.GetType().Assembly.GetName().Version?.ToString() ?? "1.0.0.0";
        var config = SeerrFinPlugin.Instance.Configuration;

        // For development, bust cache every load.
        // For prod, use stabse urls until admin bumps CacheBustCounter.
        string cacheParam = config.DeveloperMode
            ? $"?v={version}&t={DateTimeOffset.UtcNow.Ticks}"
            : $"?v={version}&c={config.CacheBustCounter}";

        // Font that the modal uses (from Aether)
        string fontLinks =
            "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />" +
            "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />" +
            "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&amp;display=swap\" />";

        // CSS/JS that the plugin injects into the page relative to /web/index.html so jf baseurl/proxy is preserved if used
        string cssLinks =
            fontLinks +
            $"<link rel=\"stylesheet\" href=\"../SeerrFin/seerrfin-tabs.css{cacheParam}\" />" +
            $"<link rel=\"stylesheet\" href=\"../SeerrFin/seerrfin-modal.css{cacheParam}\" />" +
            $"<link rel=\"stylesheet\" href=\"../SeerrFin/seerrfin-requests.css{cacheParam}\" />" +
            $"<link rel=\"stylesheet\" href=\"../SeerrFin/seerrfin-letterboxd.css{cacheParam}\" />";
        string scripts =
            $"<script defer src=\"../SeerrFin/seerrfin-i18n.js{cacheParam}\"></script>" +
            $"<script defer src=\"../SeerrFin/seerrfin-modal.js{cacheParam}\"></script>" +
            $"<script defer src=\"../SeerrFin/seerrfin-nativeui.js{cacheParam}\"></script>" +
            $"<script defer src=\"../SeerrFin/seerrfin-tabs.js{cacheParam}\"></script>" +
            $"<script defer src=\"../SeerrFin/seerrfin-requests.js{cacheParam}\"></script>" +
            $"<script defer src=\"../SeerrFin/seerrfin-letterboxd.js{cacheParam}\"></script>";

        return payload.Contents!
            .Replace("</head>", $"{cssLinks}</head>", StringComparison.Ordinal)
            .Replace("</body>", $"{scripts}</body>", StringComparison.Ordinal);
    }
}
