using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

/// <summary>Edits only the linked user's general Seerr profile and discovery preferences.</summary>
public class JellyseerrProfileService(IHttpClientFactory clientFactory, ILogger<JellyseerrProfileService> logger)
{
    private static readonly string[] Fields = ["username", "email", "locale", "discoverRegion", "streamingRegion", "originalLanguage"];
    // Seerr's supported interface locales; metadata languages come from its live catalogue.
    private static readonly JObject Locales = JObject.Parse("""{"bg": "Bulgarian", "ca": "Català", "cs": "Čeština", "da": "Dansk", "de": "Deutsch", "en": "English", "es": "Español", "es-MX": "Español (Latinoamérica)", "et": "Eesti", "fi": "Finnish", "fr": "Français", "he": "Hebrew", "hi": "Hindi", "hr": "Hrvatski", "it": "Italiano", "lb": "Lëtzebuergesch", "lt": "Lietuvių", "hu": "Magyar", "nl": "Nederlands", "nb-NO": "Norsk Bokmål", "pl": "Polski", "pt-BR": "Português (Brasil)", "pt-PT": "Português (Portugal)", "sq": "Shqip", "sv": "Svenska", "el": "Ελληνικά", "ro": "Romanian", "ru": "pусский", "sr": "српски језик", "tr": "Türkçe", "ar": "العربية", "ja": "日本語", "ko": "한국어", "uk": "українська мова", "vi": "Tiếng Việt", "zh-TW": "繁體中文", "zh-CN": "简体中文"}""");

    public async Task<(int StatusCode, string Body)> ExecuteAsync(Guid userId, JObject? changes, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty) return Error(401, "User not found.");
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey)) return Error(400, "Seerr is not configured in SeerrFin.");
        try
        {
            if (changes != null && (changes.Properties().Any(x => !Fields.Contains(x.Name) || x.Value.Type != JTokenType.String) || Fields.Any(x => changes[x] == null)))
                return Error(400, "Invalid profile fields.");
            using HttpClient client = clientFactory.CreateClient();
            client.BaseAddress = new Uri(config.JellyseerrUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
            using HttpResponseMessage identity = await client.GetAsync($"/api/v1/user/jellyfin/{userId:N}", cancellationToken).ConfigureAwait(false);
            if (identity.StatusCode == HttpStatusCode.NotFound) return Error(404, "Seerr user not linked. Sign in to Seerr with this Jellyfin account first.");
            identity.EnsureSuccessStatusCode();
            JObject user = JObject.Parse(await identity.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            int id = user.Value<int>("id");
            if (id <= 0) return Error(502, "Unable to read your Seerr account.");
            client.DefaultRequestHeaders.Add("X-Api-User", id.ToString(CultureInfo.InvariantCulture));
            var reads = await Task.WhenAll(
                ReadAsync(client, $"/api/v1/user/{id}/settings/main", cancellationToken),
                ReadAsync(client, "/api/v1/settings/public", cancellationToken),
                ReadAsync(client, "/api/v1/regions", cancellationToken),
                ReadAsync(client, "/api/v1/languages", cancellationToken),
                ReadAsync(client, "/api/v1/watchproviders/regions", cancellationToken)).ConfigureAwait(false);
            JObject main = (JObject)reads[0];
            JObject defaults = (JObject)reads[1];
            JArray regions = Options(reads[2], "iso_3166_1", "english_name");
            JArray languages = Options(reads[3], "iso_639_1", "english_name");
            JArray streamingRegions = Options(reads[4], "iso_3166_1", "english_name");
            bool emailEditable = user.Value<int>("userType") != 1; // Plex controls its email address.
            bool emailRequired = id == 1 || user.Value<int>("userType") is not (3 or 4);
            if (changes != null)
            {
                foreach (string field in Fields) changes[field] = changes.Value<string>(field)!.Trim();
                string username = changes.Value<string>("username")!;
                string email = changes.Value<string>("email")!;
                if (username.Length > 100 || username.Any(char.IsControl)) return Error(400, "Display names must be at most 100 characters without control characters.");
                if (!emailEditable && email != (main.Value<string>("email") ?? "")) return Error(400, "This email address is managed by Plex.");
                if (emailEditable && (email.Length > 254 || (email.Length == 0 ? emailRequired : !MailAddress.TryCreate(email, out var address) || address.Address != email || !email.Contains('@'))))
                    return Error(400, "Enter a valid email address.");
                string locale = changes.Value<string>("locale")!;
                if (locale.Length > 0 && Locales[locale] == null) return Error(400, "Choose a supported locale.");
                if (!Choice(changes.Value<string>("discoverRegion")!, regions, true) || !Choice(changes.Value<string>("streamingRegion")!, streamingRegions, false)) return Error(400, "Choose a supported region.");
                string original = changes.Value<string>("originalLanguage")!;
                string[] selectedLanguages = original.Split('|');
                if (original != "" && original != "all" && (selectedLanguages.Length > 20 || selectedLanguages.Any(x => !Choice(x, languages, false) || x.Length == 0) || selectedLanguages.Distinct().Count() != selectedLanguages.Length))
                    return Error(400, "Choose up to 20 distinct original languages, all languages, or the server default.");
                // Seerr replaces these settings on POST, so preserve unrelated watchlist-sync preferences.
                JObject payload = new();
                foreach (string field in Fields) payload[field] = changes[field];
                foreach (string field in new[] { "watchlistSyncMovies", "watchlistSyncTv" }) if (main[field] != null) payload[field] = main[field];
                using HttpResponseMessage saved = await client.PostAsync($"/api/v1/user/{id}/settings/main", new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json"), cancellationToken).ConfigureAwait(false);
                if (!saved.IsSuccessStatusCode)
                {
                    string message = saved.StatusCode == HttpStatusCode.BadRequest ? "Unable to save your profile. Check that your email address is valid and is not used by another account." : "Unable to save your profile in Seerr. Please try again.";
                    return Error((int)saved.StatusCode, message);
                }
                main = await ReadMainAsync(client, id, cancellationToken).ConfigureAwait(false);
            }
            JObject values = new();
            foreach (string field in Fields) values[field] = main.Value<string>(field) ?? "";
            if (emailEditable && !values.Value<string>("email")!.Contains('@')) values["email"] = "";
            JObject result = new()
            {
                ["values"] = values, ["displayName"] = main.Value<string>("username") is { Length: > 0 } name ? name : user.Value<string>("jellyfinUsername") ?? user.Value<string>("displayName"),
                ["jellyfinUsername"] = user["jellyfinUsername"], ["role"] = id == 1 ? "Owner" : (user.Value<int>("permissions") & 2) != 0 ? "Administrator" : "User",
                ["emailEditable"] = emailEditable, ["emailRequired"] = emailRequired,
                ["locales"] = new JArray(Locales.Properties().Select(x => new JObject { ["id"] = x.Name, ["name"] = x.Value })),
                ["regions"] = regions, ["streamingRegions"] = streamingRegions, ["languages"] = languages,
                ["defaults"] = new JObject { ["locale"] = defaults.Value<string>("locale") ?? "en", ["discoverRegion"] = defaults.Value<string>("discoverRegion") ?? "", ["streamingRegion"] = StreamingRegion(new JObject(), config, defaults), ["originalLanguage"] = defaults.Value<string>("originalLanguage") ?? "" }
            };
            return (200, result.ToString(Formatting.None));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SeerrFin • Personal profile operation failed");
            return Error(502, "Unable to load your profile from Seerr. Please try again.");
        }
    }

    internal static async Task<JObject> ReadMainAsync(HttpClient client, int id, CancellationToken cancellationToken = default) =>
        (JObject)await ReadAsync(client, $"/api/v1/user/{id}/settings/main", cancellationToken).ConfigureAwait(false);

    internal static string StreamingRegion(JObject main, PluginConfiguration config, JObject defaults)
    {
        string? region = main.Value<string>("streamingRegion");
        if (string.IsNullOrWhiteSpace(region) || region == "all") region = defaults.Value<string>("streamingRegion");
        return !string.IsNullOrWhiteSpace(region) && region != "all" ? region : string.IsNullOrWhiteSpace(config.WatchRegion) ? "US" : config.WatchRegion.Trim().ToUpperInvariant();
    }

    internal static async Task<JObject> ReadDefaultsAsync(HttpClient client, CancellationToken cancellationToken = default) =>
        (JObject)await ReadAsync(client, "/api/v1/settings/public", cancellationToken).ConfigureAwait(false);

    private static async Task<JToken> ReadAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await client.GetAsync(path, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JToken.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
    }
    private static JArray Options(JToken data, string id, string name) => new((data as JArray ?? data["results"] as JArray ?? []).OfType<JObject>().Where(x => x[id] != null && x[name] != null).Select(x => new JObject { ["id"] = x[id], ["name"] = x[name] }));
    private static bool Choice(string value, JArray options, bool all) => value == "" || (all && value == "all") || options.Any(x => x.Value<string>("id") == value);
    private static (int, string) Error(int status, string message) => (status, new JObject { ["message"] = message }.ToString(Formatting.None));
}
