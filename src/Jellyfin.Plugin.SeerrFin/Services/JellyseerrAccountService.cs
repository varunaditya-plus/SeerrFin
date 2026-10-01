using Jellyfin.Plugin.SeerrFin.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

/// <summary>Reads the signed-in user's effective quotas and permissions from Seerr.</summary>
public class JellyseerrAccountService(IHttpClientFactory clientFactory, ILogger<JellyseerrAccountService> logger)
{
    public async Task<(int StatusCode, string Body)> GetAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty) return Error(401, "User not found.");
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return Error(400, "Seerr is not configured in SeerrFin.");
        }

        try
        {
            using HttpClient client = clientFactory.CreateClient();
            client.BaseAddress = new Uri(config.JellyseerrUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
            using HttpResponseMessage identity = await client.GetAsync($"/api/v1/user/jellyfin/{userId:N}", cancellationToken).ConfigureAwait(false);
            if (identity.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return Error(404, "Seerr user not linked. Sign in to Seerr with this Jellyfin account first.");
            }
            identity.EnsureSuccessStatusCode();
            JObject user = JObject.Parse(await identity.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            int id = user.Value<int>("id");
            if (id <= 0 || user["permissions"]?.Type != JTokenType.Integer) return Error(502, "Unable to read your Seerr account.");

            int permissions = user.Value<int>("permissions");
            bool Has(int mask) => (permissions & 2) != 0 || (permissions & mask) != 0;
            JArray capabilities = new();
            void Add(string label, bool allowed, string? key = null)
            {
                JObject capability = new() { ["label"] = label, ["allowed"] = allowed };
                if (key != null) capability["key"] = key;
                capabilities.Add(capability);
            }
            foreach (string type in new[] { "movie", "tv" })
            {
                string label = type == "movie" ? "movies" : "TV shows";
                Add($"Request {label}", JellyseerrRequestService.HasRequestPermission(permissions, type, false), "request-" + type);
                Add($"Request 4K {label}", JellyseerrRequestService.HasRequestPermission(permissions, type, true), "request4k-" + type);
                // Seerr also automatically approves requests submitted by request managers.
                Add($"Automatic approval for {label}", Has(16 | 128 | (type == "movie" ? 256 : 512)));
                Add($"Automatic approval for 4K {label}", Has(16 | 32768 | (type == "movie" ? 65536 : 131072)));
                Add($"Plex watchlist auto-requests for {label}", Has(8388608 | (type == "movie" ? 16777216 : 33554432)));
            }
            Add("Choose request server, quality profile and root folder", JellyseerrRequestService.HasRequestAdvanced(permissions));
            Add("View other users' requests", Has(16 | 16384));
            Add("Manage and approve requests", Has(16));
            Add("Report issues", Has(1048576 | 4194304));
            Add("View all issues", Has(1048576 | 2097152));
            Add("Manage issues", Has(1048576));
            Add("View other users' watchlists", Has(16 | 134217728));
            Add("View recently added media", Has(67108864));
            Add("View the blocklist", Has(268435456 | 1073741824));
            Add("Manage the blocklist", Has(268435456));
            Add("Manage users", Has(8));
            Add("Manage Seerr settings", Has(2));
            Add("Administrator access", Has(2));

            // Never accept a Seerr user ID from the browser or fall back to the API-key owner.
            client.DefaultRequestHeaders.Add("X-Api-User", id.ToString(System.Globalization.CultureInfo.InvariantCulture));
            using HttpResponseMessage response = await client.GetAsync($"/api/v1/user/{id}/quota", cancellationToken).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            JObject quotas = JObject.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            JArray pages = new("profile", "requests");
            if (Has(268435456 | 1073741824)) pages.Add("blocklist");
            if (Has(1048576 | 2097152 | 4194304)) pages.Add("issues");
            if (Has(8)) pages.Add("users");
            if (Has(2)) pages.Add("settings");
            JObject result = new()
            {
                ["movie"] = ReadQuota(quotas["movie"]),
                ["tv"] = ReadQuota(quotas["tv"]),
                ["bypassQuota"] = Has(8),
                ["permissions"] = capabilities, ["pages"] = pages
            };
            return (200, result.ToString(Formatting.None));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SeerrFin • Failed to read personal quotas and permissions");
            return Error(502, "Unable to load your Seerr limits and permissions. Please try again.");
        }
    }

    private static JObject ReadQuota(JToken? quota)
    {
        if (quota is not JObject || quota["limit"]?.Type is not (null or JTokenType.Null or JTokenType.Integer) || quota["used"]?.Type != JTokenType.Integer || quota["restricted"]?.Type != JTokenType.Boolean)
        {
            throw new JsonException("Invalid Seerr quota response.");
        }
        int limit = quota.Value<int?>("limit") ?? 0;
        if (limit < 0 || (limit > 0 && quota["remaining"]?.Type != JTokenType.Integer)) throw new JsonException("Invalid Seerr quota limit.");
        int used = quota.Value<int>("used");
        int days = quota.Value<int?>("days") ?? 0;
        int? remaining = limit > 0 ? quota.Value<int>("remaining") : null;
        if (used < 0 || days < 0 || remaining < 0 || (limit == 0 && quota.Value<bool>("restricted"))) throw new JsonException("Invalid Seerr quota usage.");
        return new JObject
        {
            ["limit"] = limit, ["used"] = used, ["remaining"] = remaining,
            ["days"] = days, ["restricted"] = quota["restricted"]
        };
    }

    private static (int, string) Error(int status, string message) => (status, new JObject { ["message"] = message }.ToString(Formatting.None));
}
