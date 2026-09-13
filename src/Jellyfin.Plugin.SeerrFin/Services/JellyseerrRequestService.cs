using System.Text;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Model;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class JellyseerrRequestService
{
    // from Seerr Permission enum
    private const int PermissionAdmin = 2;
    private const int PermissionManageRequests = 16;
    private const int PermissionRequest = 32;
    private const int PermissionRequest4k = 1024;
    private const int PermissionRequest4kMovie = 2048;
    private const int PermissionRequest4kTv = 4096;
    private const int PermissionRequestAdvanced = 8192;
    private const int PermissionRequestMovie = 262144;
    private const int PermissionRequestTv = 524288;

    private readonly ILogger<JellyseerrRequestService> _logger;

    public JellyseerrRequestService(ILogger<JellyseerrRequestService> logger)
    {
        _logger = logger;
    }

    public JArray GetRequestOptions(string username, string mediaType) => GetRequestOptionsResult(username, mediaType).Options;

    public RequestOptionsResult GetRequestOptionsResult(string username, string mediaType)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return RequestOptionsResult.None;
        }

        using HttpClient client = CreateClient(config);
        if (!TryResolveJellyseerrUser(client, username, out int jellyseerrUserId, out int permissions))
        {
            return RequestOptionsResult.None;
        }

        bool canRequest = HasRequestPermission(permissions, mediaType, is4k: false);
        bool canRequest4k = HasRequestPermission(permissions, mediaType, is4k: true);
        bool canRequestAdvanced = HasRequestAdvanced(permissions);

        // request-only users shouldnt pick server/profile/root folder
        if (!canRequestAdvanced)
        {
            return new RequestOptionsResult
            {
                CanRequest = canRequest,
                CanRequest4k = canRequest4k,
                CanRequestAdvanced = false,
                Options = new JArray()
            };
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());
        return new RequestOptionsResult
        {
            CanRequest = canRequest,
            CanRequest4k = canRequest4k,
            CanRequestAdvanced = true,
            Options = FetchServiceOptions(client, mediaType == "movie" ? "radarr" : "sonarr")
        };
    }

    public Task<(int StatusCode, string Body, string ContentType)> SubmitRequestAsync(string username, DiscoverRequestPayload payload, CancellationToken cancellationToken) =>
        SubmitRequestAsync(username, payload, allowQualityProfileSelection: true, cancellationToken: cancellationToken);

    public async Task<(int StatusCode, string Body, string ContentType)> SubmitRequestAsync(
        string username,
        DiscoverRequestPayload payload,
        bool allowQualityProfileSelection,
        CancellationToken cancellationToken)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return (400, "{\"message\":\"Seerr is not configured.\"}", "application/json");
        }

        using HttpClient client = CreateClient(config);
        if (!TryResolveJellyseerrUser(client, username, out int jellyseerrUserId, out int permissions))
        {
            return (400, "{\"message\":\"Could not match Jellyfin user to a Seerr user.\"}", "application/json");
        }

        if (!HasRequestPermission(permissions, payload.MediaType, payload.Is4k))
        {
            string kind = payload.Is4k ? "4K " : string.Empty;
            string mediaLabel = payload.MediaType == "tv" ? "series" : "movie";
            return (403, $"{{\"message\":\"You do not have permission to make {kind}{mediaLabel} requests.\"}}", "application/json");
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());

        JObject body = new()
        {
            ["mediaType"] = payload.MediaType,
            ["mediaId"] = payload.MediaId
        };

        if (payload.MediaType == "tv")
        {
            body["seasons"] = payload.Seasons is { Count: > 0 }
                ? new JArray(payload.Seasons)
                : "all";
        }

        // Only Advanced Requests can override Seerr defaults, and admins can disable profile selection for the request modal.
        if (allowQualityProfileSelection && HasRequestAdvanced(permissions))
        {
            if (payload.ServerId != null)
            {
                body["serverId"] = payload.ServerId.Value;
            }

            if (payload.ProfileId != null)
            {
                body["profileId"] = payload.ProfileId.Value;
            }

            if (!string.IsNullOrWhiteSpace(payload.RootFolder))
            {
                body["rootFolder"] = payload.RootFolder;
            }
        }

        if (payload.Is4k)
        {
            body["is4k"] = true;
        }

        HttpResponseMessage response = await client
            .PostAsync("/api/v1/request", new StringContent(body.ToString(), Encoding.UTF8, "application/json"), cancellationToken)
            .ConfigureAwait(false);

        string content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        string contentType = response.Content.Headers.ContentType?.MediaType ?? "application/json";
        return ((int)response.StatusCode, content, contentType);
    }

    private JArray FetchServiceOptions(HttpClient client, string serverType)
    {
        JArray options = new();
        try
        {
            // Seerr versions expose Radarr/Sonarr lists, which we can use to get profiles
            HttpResponseMessage listResponse = client.GetAsync($"/api/v1/service/{serverType}").GetAwaiter().GetResult();
            if (!listResponse.IsSuccessStatusCode)
            {
                listResponse = client.GetAsync($"/api/v1/settings/{serverType}").GetAwaiter().GetResult();
            }
            if (!listResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "SeerrFin • failed to fetch Seerr {ServerType} services: {StatusCode}",
                    serverType,
                    listResponse.StatusCode);
                return options;
            }

            string listRaw = listResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            JToken? listToken = JToken.Parse(listRaw);
            // API may return one server object or array
            IEnumerable<JObject> servers = listToken switch
            {
                JArray array => array.OfType<JObject>(),
                JObject single => new[] { single },
                _ => Array.Empty<JObject>()
            };

            foreach (JObject server in servers)
            {
                int? serverId = server.Value<int?>("id");
                if (serverId == null)
                {
                    continue;
                }

                string serverName = server.Value<string>("name") ?? $"Server {serverId}";
                bool is4k = server.Value<bool?>("is4k") ?? false;
                HttpResponseMessage detailResponse = client.GetAsync($"/api/v1/service/{serverType}/{serverId}").GetAwaiter().GetResult();
                if (!detailResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "SeerrFin • failed to fetch Seerr {ServerType} service details for {ServerId}: {StatusCode}",
                        serverType,
                        serverId,
                        detailResponse.StatusCode);
                    continue;
                }

                string detailRaw = detailResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                JObject detail = JObject.Parse(detailRaw);
                JObject serverDetails = detail.Value<JObject>("server") ?? server;
                JArray? profiles = detail.Value<JArray>("profiles");
                string? defaultRootFolder = serverDetails.Value<string>("activeDirectory")
                    ?? detail.Value<JArray>("rootFolders")?
                    .OfType<JObject>()
                    .FirstOrDefault()?
                    .Value<string>("path");

                if (profiles == null || profiles.Count == 0)
                {
                    continue;
                }

                int? defaultProfileId = serverDetails.Value<int?>("activeProfileId");

                foreach (JObject profile in profiles.OfType<JObject>())
                {
                    int? profileId = profile.Value<int?>("id");
                    if (profileId == null)
                    {
                        continue;
                    }

                    options.Add(new JObject
                    {
                        ["serverId"] = serverId,
                        ["serverName"] = serverName,
                        ["is4k"] = is4k,
                        ["isDefault"] = serverDetails.Value<bool?>("isDefault") ?? server.Value<bool?>("isDefault") ?? false,
                        ["isDefaultProfile"] = defaultProfileId == profileId,
                        ["profileId"] = profileId,
                        ["profileName"] = profile.Value<string>("name") ?? $"Profile {profileId}",
                        ["rootFolder"] = defaultRootFolder
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • failed to fetch {ServerType} request options", serverType);
        }

        return options;
    }

    private static HttpClient CreateClient(PluginConfiguration config)
    {
        HttpClient client = new() { BaseAddress = new Uri(config.JellyseerrUrl!) };
        client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);
        return client;
    }

    // for REQUEST_ADVANCED or MANAGE_REQUESTS seerr shows advanced requester
    private static bool HasRequestAdvanced(int permissions) =>
        (permissions & PermissionAdmin) != 0
        || (permissions & PermissionManageRequests) != 0
        || (permissions & PermissionRequestAdvanced) != 0;

    private static bool HasRequestPermission(int permissions, string mediaType, bool is4k)
    {
        if ((permissions & PermissionAdmin) != 0)
        {
            return true;
        }

        bool isTv = string.Equals(mediaType, "tv", StringComparison.OrdinalIgnoreCase);
        if (is4k)
        {
            return (permissions & PermissionRequest4k) != 0 || (permissions & (isTv ? PermissionRequest4kTv : PermissionRequest4kMovie)) != 0;
        }

        return (permissions & PermissionRequest) != 0 || (permissions & (isTv ? PermissionRequestTv : PermissionRequestMovie)) != 0;
    }

    private static bool TryResolveJellyseerrUser(
        HttpClient client,
        string username,
        out int jellyseerrUserId,
        out int permissions)
    {
        jellyseerrUserId = 0;
        permissions = 0;

        try
        {
            HttpResponseMessage usersResponse = client
                .GetAsync($"/api/v1/user?q={Uri.EscapeDataString(username)}")
                .GetAwaiter()
                .GetResult();
            string userResponseRaw = usersResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            JObject? match = JObject.Parse(userResponseRaw).Value<JArray>("results")?
                .OfType<JObject>()
                .FirstOrDefault(x => string.Equals(
                    x.Value<string>("jellyfinUsername"),
                    username,
                    StringComparison.OrdinalIgnoreCase));

            if (match == null)
            {
                return false;
            }

            jellyseerrUserId = match.Value<int>("id");
            permissions = match.Value<int?>("permissions") ?? 0;
            return true;
        }
        catch
        {
            return false;
        }
    }
}

public sealed class RequestOptionsResult
{
    public static RequestOptionsResult None { get; } = new();

    public bool CanRequest { get; init; }

    public bool CanRequest4k { get; init; }

    public bool CanRequestAdvanced { get; init; }

    public JArray Options { get; init; } = new();
}
