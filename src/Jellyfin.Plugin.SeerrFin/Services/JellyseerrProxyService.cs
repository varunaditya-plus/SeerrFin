using System.Net.Http.Headers;
using System.Text;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Jellyfin.Plugin.SeerrFin.Helpers;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SeerrFin.Services;

public class JellyseerrProxyService
{
    private readonly IHttpClientFactory _clientFactory;
    private readonly ILogger<JellyseerrProxyService> _logger;

    public JellyseerrProxyService(IHttpClientFactory clientFactory, ILogger<JellyseerrProxyService> logger)
    {
        _clientFactory = clientFactory;
        _logger = logger;
    }

    public async Task<(int StatusCode, string Body, string ContentType)> ProxyAsync(
        string username,
        HttpMethod method,
        string relativePath,
        string? requestBody,
        CancellationToken cancellationToken
    )
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        if (string.IsNullOrWhiteSpace(config.JellyseerrUrl) || string.IsNullOrWhiteSpace(config.JellyseerrApiKey))
        {
            return (400, "{\"error\":true,\"message\":\"Seerr is not configured in SeerrFin.\"}", "application/json");
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            return (401, "{\"error\":true,\"message\":\"User not found.\"}", "application/json");
        }

        using HttpClient client = _clientFactory.CreateClient(SeerrCsrfHandler.ClientName);
        client.BaseAddress = new Uri(config.JellyseerrUrl!);
        client.DefaultRequestHeaders.Add("X-Api-Key", config.JellyseerrApiKey);

        int? jellyseerrUserId = await ResolveJellyseerrUserIdAsync(client, username, cancellationToken).ConfigureAwait(false);
        if (jellyseerrUserId == null)
        {
            return (404, "{\"error\":true,\"message\":\"Seerr user not linked.\"}", "application/json");
        }

        client.DefaultRequestHeaders.Add("X-Api-User", jellyseerrUserId.ToString());

        // Accept both full seerr paths and short paths from client proxy
        string apiPath = relativePath.StartsWith("/api/v1/", StringComparison.OrdinalIgnoreCase)
            ? relativePath
            : $"/api/v1/{relativePath.TrimStart('/')}";

        using HttpRequestMessage request = new(method, apiPath);

        if (requestBody != null && method != HttpMethod.Get && method != HttpMethod.Head)
        {
            request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        }

        try
        {
            using HttpResponseMessage response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            string body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            string contentType = response.Content.Headers.ContentType?.MediaType ?? "application/json";

            return ((int)response.StatusCode, body, contentType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SeerrFin • Seerr proxy failed for {Path}", apiPath);

            return (502, "{\"error\":true,\"message\":\"Failed to reach Seerr.\"}", "application/json");
        }
    }

    private static async Task<int?> ResolveJellyseerrUserIdAsync(HttpClient client, string username, CancellationToken cancellationToken)
    {
        using HttpResponseMessage usersResponse = await client
            .GetAsync($"/api/v1/user?q={Uri.EscapeDataString(username)}", cancellationToken)
            .ConfigureAwait(false);
        string userResponseRaw = await usersResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        if (!usersResponse.IsSuccessStatusCode)
        {
            return null;
        }

        return Newtonsoft.Json.Linq.JObject.Parse(userResponseRaw).Value<Newtonsoft.Json.Linq.JArray>("results")
            ?.OfType<Newtonsoft.Json.Linq.JObject>()
            .FirstOrDefault(x => string.Equals(x.Value<string>("jellyfinUsername"), username, StringComparison.OrdinalIgnoreCase))
            ?.Value<int>("id");
    }
}
