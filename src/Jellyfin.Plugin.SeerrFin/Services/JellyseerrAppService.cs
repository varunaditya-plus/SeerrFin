using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeerrFin.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.SeerrFin.Services;

/// <summary>Serves Seerr's own interface as the linked Jellyfin user without exposing its API key.</summary>
public class JellyseerrAppService(IHttpClientFactory clientFactory, ILogger<JellyseerrAppService> logger)
{
    public const string ClientName = "SeerrFin.App";
    public const string CookieName = "SeerrFin.App";
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(15);
    private readonly ConcurrentDictionary<string, Session> _sessions = new(StringComparer.Ordinal);

    private sealed record Session(Guid Id, int SeerrUserId, DateTimeOffset ExpiresAt, Uri Origin, string ConfigurationHash, CookieContainer Cookies, JObject BootstrapProps);
    public sealed record SessionResult(int StatusCode, string? Ticket = null, Guid? SessionId = null, string? Path = null, string? Message = null);
    public sealed record Reply(int StatusCode, byte[] Body, string ContentType, string? Location = null);

    public async Task<SessionResult> CreateAsync(Guid userId, string page, string prefix, CancellationToken cancellationToken, int? mediaId = null)
    {
        if (userId == Guid.Empty) return new(401, Message: "User not found.");
        bool mediaPage = page is "movie" or "tv";
        if (mediaPage ? mediaId is null or <= 0 : mediaId != null) return new(400, Message: "Choose a valid Seerr page.");
        int? required = PagePermission(page);
        if (!required.HasValue) return new(400, Message: "Choose a Seerr page.");
        if (!TryConfiguration(out var origin, out var key, out var hash)) return new(400, Message: "Seerr is not configured in SeerrFin.");
        try
        {
            using HttpClient client = CreateClient();
            CookieContainer cookies = new();
            JObject? user = await ReadActorAsync(client, origin, key, userId, cancellationToken, cookies).ConfigureAwait(false);
            if (user == null) return new(404, Message: "Seerr user not linked. Sign in to Seerr with this Jellyfin account first.");
            int permissions = user.Value<int>("permissions");
            if (required.Value != 0 && (permissions & 2) == 0 && (permissions & required.Value) == 0) return new(403, Message: "You do not have access to this Seerr page.");
            DateTimeOffset now = DateTimeOffset.UtcNow;
            foreach (var entry in _sessions) if (entry.Value.ExpiresAt <= now) _sessions.TryRemove(entry.Key, out _);
            string ticket = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            Guid id = Guid.NewGuid();
            _sessions[ticket] = new(id, user.Value<int>("id"), now + SessionLifetime, origin, hash, cookies, new());
            string path = mediaPage ? page + "/" + mediaId!.Value.ToString(CultureInfo.InvariantCulture) + "?manage=1" : page;
            return new(200, ticket, id, prefix + "/" + id + "/" + path);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception)
        {
            logger.LogWarning("SeerrFin • Unable to open the linked Seerr interface");
            return new(502, Message: "Unable to open Seerr. Please try again.");
        }
    }

    public void RevokeTicket(string? ticket, Guid sessionId)
    {
        if (ticket != null && _sessions.TryGetValue(ticket, out var session) && session.Id == sessionId) _sessions.TryRemove(ticket, out _);
    }

    public async Task<Reply> ProxyAsync(string? ticket, Guid sessionId, string path, string query, string method, Stream body, string? contentType, string prefix, bool sameOrigin, CancellationToken cancellationToken)
    {
        if (ticket == null || !_sessions.TryGetValue(ticket, out var session) || session.Id != sessionId) return Error(401, "Your Seerr session has ended. Open the page again.");
        if (session.ExpiresAt <= DateTimeOffset.UtcNow || !TryConfiguration(out _, out var key, out var hash) || hash != session.ConfigurationHash)
        {
            _sessions.TryRemove(ticket, out _);
            return Error(401, "Your Seerr session has ended. Open the page again.");
        }
        if (method is not ("GET" or "HEAD") && !sameOrigin) return Error(403, "This action must come from Jellyfin.");
        if (!TryPath(path, out var upstreamPath) || query.Contains('#') || query.Contains('\r') || query.Contains('\n')) return Error(400, "Invalid Seerr path.");
        string normalized = upstreamPath.TrimStart('/').ToLowerInvariant();
        if ((normalized == "api/v1/auth" || normalized.StartsWith("api/v1/auth/", StringComparison.Ordinal)) && (normalized != "api/v1/auth/me" || method != "GET")
            || normalized == "login" || normalized.StartsWith("login/", StringComparison.Ordinal) || normalized == "setup" || normalized.StartsWith("setup/", StringComparison.Ordinal))
            return Error(403, "Use your Jellyfin account to access Seerr.");
        _sessions.TryUpdate(ticket, session with { ExpiresAt = DateTimeOffset.UtcNow + SessionLifetime }, session);
        try
        {
            using HttpClient client = CreateClient();
            if (method == "GET")
            {
                // Media pages make cookie-only loopback SSR calls. Use Seerr's real client
                // bootstrap and actor-scoped page data instead of its unauthenticated SSR.
                if (Regex.IsMatch(upstreamPath, "^/(movie|tv)/[1-9][0-9]*/?$", RegexOptions.CultureInvariant))
                    return await BootstrapAsync(client, session, key, upstreamPath, query, prefix, cancellationToken).ConfigureAwait(false);
                Match mediaData = Regex.Match(upstreamPath, "^/_next/data/[^/]+/(?<type>movie|tv)/(?<id>[1-9][0-9]*)\\.json$", RegexOptions.CultureInvariant);
                if (mediaData.Success && int.TryParse(mediaData.Groups["id"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out int mediaId))
                    return await MediaDataAsync(client, session, key, mediaData.Groups["type"].Value, mediaId, cancellationToken).ConfigureAwait(false);
            }
            using HttpRequestMessage request = new(new HttpMethod(method), new Uri(session.Origin, upstreamPath + query));
            request.Headers.Add("X-Api-Key", key);
            request.Headers.Add("X-Api-User", session.SeerrUserId.ToString(CultureInfo.InvariantCulture));
            string csrfCookies = session.Cookies.GetCookieHeader(session.Origin);
            if (csrfCookies.Length > 0) request.Headers.Add("Cookie", csrfCookies);
            if (method is not ("GET" or "HEAD"))
            {
                string? token = session.Cookies.GetCookies(session.Origin)["XSRF-TOKEN"]?.Value;
                if (token != null) request.Headers.Add("X-XSRF-TOKEN", Uri.UnescapeDataString(token));
                request.Content = new StreamContent(body);
                if (!string.IsNullOrEmpty(contentType)) request.Content.Headers.TryAddWithoutValidation("Content-Type", contentType);
            }
            using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            CaptureCsrfCookies(session.Cookies, session.Origin, response);
            string? location = null;
            if (response.Headers.Location != null)
            {
                Uri redirect = new(request.RequestUri!, response.Headers.Location);
                if (redirect.GetLeftPart(UriPartial.Authority) != session.Origin.GetLeftPart(UriPartial.Authority) || !TryPath(redirect.AbsolutePath, out _)) return Error(502, "Seerr returned an unsupported redirect.");
                // Seerr's Next SSR authenticates its loopback request using login cookies,
                // while its API correctly supports X-Api-User. Bootstrap its real client
                // application when SSR cannot see the actor headers.
                if (method == "GET" && redirect.AbsolutePath.TrimEnd('/') == "/login" && !upstreamPath.StartsWith("/api/", StringComparison.Ordinal) && !upstreamPath.StartsWith("/_next/", StringComparison.Ordinal))
                    return await BootstrapAsync(client, session, key, upstreamPath, query, prefix, cancellationToken).ConfigureAwait(false);
                location = prefix + redirect.PathAndQuery + redirect.Fragment;
            }
            string type = response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
            byte[] bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            if (response.Content.Headers.ContentType?.MediaType is "text/html" or "text/css")
            {
                Encoding encoding = Encoding.UTF8;
                if (response.Content.Headers.ContentType.CharSet is { Length: > 0 } charset) encoding = Encoding.GetEncoding(charset.Trim('"'));
                string text = encoding.GetString(bytes);
                text = response.Content.Headers.ContentType.MediaType == "text/html"
                    ? RewriteHtml(text, prefix, upstreamPath + query)
                    : Regex.Replace(text, "url\\(\\s*([\"']?)/(?!/)", "url($1" + prefix + "/", RegexOptions.IgnoreCase);
                bytes = Encoding.UTF8.GetBytes(text);
                type = response.Content.Headers.ContentType.MediaType + "; charset=utf-8";
            }
            return new((int)response.StatusCode, bytes, type, location);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception)
        {
            logger.LogWarning("SeerrFin • Seerr interface request failed");
            return Error(502, "Unable to load this page from Seerr. Please try again.");
        }
    }

    public async Task<Reply> AvatarAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty) return Error(401, "User not found.");
        if (!TryConfiguration(out var origin, out var key, out _)) return Error(400, "Seerr is not configured in SeerrFin.");
        try
        {
            using HttpClient client = CreateClient();
            JObject? user = await ReadActorAsync(client, origin, key, userId, cancellationToken).ConfigureAwait(false);
            if (user == null) return Error(404, "Seerr user not linked.");
            string avatar = user.Value<string>("avatar") ?? "";
            Uri url;
            bool local = avatar.StartsWith("/avatarproxy/", StringComparison.Ordinal) && TryPath(avatar.Split('?')[0], out _);
            if (local) url = new Uri(origin, avatar);
            else if (!Uri.TryCreate(avatar, UriKind.Absolute, out url!) || url.Scheme != Uri.UriSchemeHttps || url.UserInfo.Length != 0 || (url.Host != "gravatar.com" && !url.Host.EndsWith(".gravatar.com", StringComparison.OrdinalIgnoreCase)))
                return Error(404, "No Seerr profile image is available.");
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            if (local)
            {
                request.Headers.Add("X-Api-Key", key);
                request.Headers.Add("X-Api-User", user.Value<int>("id").ToString(CultureInfo.InvariantCulture));
            }
            using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) return Error(404, "No Seerr profile image is available.");
            string? type = response.Content.Headers.ContentType?.MediaType;
            if (type == "image/jpg") type = "image/jpeg";
            if (type is not ("image/jpeg" or "image/png" or "image/webp" or "image/gif" or "image/avif") || response.Content.Headers.ContentLength > 512 * 1024) return Error(502, "Invalid Seerr profile image.");
            using Stream source = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using MemoryStream output = new();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = await source.ReadAsync(buffer, cancellationToken).ConfigureAwait(false)) != 0)
            {
                if (output.Length + count > 512 * 1024) return Error(502, "Invalid Seerr profile image.");
                output.Write(buffer, 0, count);
            }
            return new(200, output.ToArray(), type);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception)
        {
            logger.LogWarning("SeerrFin • Unable to read the linked profile image");
            return Error(502, "Unable to load your Seerr profile image.");
        }
    }

    private HttpClient CreateClient()
    {
        HttpClient client = clientFactory.CreateClient(ClientName);
        client.Timeout = TimeSpan.FromSeconds(60);
        return client;
    }

    private static async Task<Reply> BootstrapAsync(HttpClient client, Session session, string key, string path, string query, string prefix, CancellationToken cancellationToken)
    {
        var bootstrap = await ReadBootstrapAsync(client, session, key, cancellationToken).ConfigureAwait(false);
        string json = JsonConvert.SerializeObject(bootstrap.Data, new JsonSerializerSettings { StringEscapeHandling = StringEscapeHandling.EscapeHtml });
        string html = bootstrap.Html[..bootstrap.Json.Index] + json + bootstrap.Html[(bootstrap.Json.Index + bootstrap.Json.Length)..];
        return new(200, Encoding.UTF8.GetBytes(RewriteHtml(html, prefix, path + query, true)), "text/html; charset=utf-8");
    }

    private static async Task<(string Html, Group Json, JObject Data)> ReadBootstrapAsync(HttpClient client, Session session, string key, CancellationToken cancellationToken)
    {
        using HttpResponseMessage document = await ReadAsActorAsync(client, session, key, "/login", cancellationToken).ConfigureAwait(false);
        document.EnsureSuccessStatusCode();
        string html = await document.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        Match dataTag = Regex.Match(html, "<script\\b[^>]*\\bid\\s*=\\s*([\"'])__NEXT_DATA__\\1[^>]*>(?<json>.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (!dataTag.Success) throw new JsonException("Seerr client bootstrap not found.");
        JObject data = JObject.Parse(dataTag.Groups["json"].Value);
        if (data["props"] is not JObject props) throw new JsonException("Invalid Seerr client bootstrap.");
        using HttpResponseMessage identity = await ReadAsActorAsync(client, session, key, "/api/v1/auth/me", cancellationToken).ConfigureAwait(false);
        identity.EnsureSuccessStatusCode();
        JObject user = JObject.Parse(await identity.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
        if (user.Value<int>("id") != session.SeerrUserId) throw new JsonException("Unexpected Seerr actor.");
        props["user"] = user;
        props["locale"] = user["settings"]?.Value<string>("locale") is { Length: > 0 } locale ? locale : props["currentSettings"]?.Value<string>("locale") ?? props.Value<string>("locale") ?? "en";
        lock (session.BootstrapProps)
        {
            session.BootstrapProps.RemoveAll();
            foreach (JProperty property in props.Properties()) session.BootstrapProps.Add(property.Name, property.Value.DeepClone());
        }
        return (html, dataTag.Groups["json"], data);
    }

    private static async Task<Reply> MediaDataAsync(HttpClient client, Session session, string key, string type, int mediaId, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await ReadAsActorAsync(client, session, key, "/api/v1/" + type + "/" + mediaId.ToString(CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false);
        byte[] bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode) return new((int)response.StatusCode, bytes, response.Content.Headers.ContentType?.ToString() ?? "application/json");
        JObject props;
        lock (session.BootstrapProps) props = (JObject)session.BootstrapProps.DeepClone();
        if (props.Count == 0)
        {
            await ReadBootstrapAsync(client, session, key, cancellationToken).ConfigureAwait(false);
            lock (session.BootstrapProps) props = (JObject)session.BootstrapProps.DeepClone();
        }
        props["pageProps"] = new JObject { [type] = JObject.Parse(Encoding.UTF8.GetString(bytes)) };
        props["__N_SSP"] = true;
        return new(200, Encoding.UTF8.GetBytes(props.ToString(Formatting.None)), "application/json; charset=utf-8");
    }

    private static async Task<HttpResponseMessage> ReadAsActorAsync(HttpClient client, Session session, string key, string path, CancellationToken cancellationToken)
    {
        using HttpRequestMessage request = new(HttpMethod.Get, new Uri(session.Origin, path));
        request.Headers.Add("X-Api-Key", key);
        request.Headers.Add("X-Api-User", session.SeerrUserId.ToString(CultureInfo.InvariantCulture));
        string cookies = session.Cookies.GetCookieHeader(session.Origin);
        if (cookies.Length > 0) request.Headers.Add("Cookie", cookies);
        HttpResponseMessage response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
        CaptureCsrfCookies(session.Cookies, session.Origin, response);
        return response;
    }

    private static async Task<JObject?> ReadActorAsync(HttpClient client, Uri origin, string key, Guid userId, CancellationToken cancellationToken, CookieContainer? cookies = null)
    {
        using HttpRequestMessage request = new(HttpMethod.Get, new Uri(origin, $"/api/v1/user/jellyfin/{userId:N}"));
        request.Headers.Add("X-Api-Key", key);
        using HttpResponseMessage response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (cookies != null) CaptureCsrfCookies(cookies, origin, response);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        JObject user = JObject.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
        if (user.Value<int>("id") <= 0 || user["permissions"]?.Type != JTokenType.Integer) throw new JsonException("Invalid linked Seerr account.");
        return user;
    }

    private static void CaptureCsrfCookies(CookieContainer cookies, Uri origin, HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var values)) return;
        foreach (string value in values)
        {
            string pair = value.Split(';')[0];
            int equals = pair.IndexOf('=');
            if (equals <= 0) continue;
            string name = pair[..equals].Trim();
            // These two server-side cookies support Seerr's optional CSRF protection;
            // browser cookies and Seerr login sessions are never forwarded.
            if (name is "_csrf" or "XSRF-TOKEN") cookies.Add(origin, new Cookie(name, pair[(equals + 1)..], "/"));
        }
    }

    private static int? PagePermission(string page) => page switch
    {
        "requests" or "movie" or "tv" => 0,
        "blocklist" => 268435456 | 1073741824,
        "issues" => 1048576 | 2097152 | 4194304,
        "users" => 8,
        "settings" => 2,
        _ => null
    };

    private static bool TryConfiguration(out Uri origin, out string key, out string hash)
    {
        PluginConfiguration config = SeerrFinPlugin.Instance.Configuration;
        key = config.JellyseerrApiKey ?? "";
        origin = null!;
        hash = "";
        if (string.IsNullOrWhiteSpace(key) || !Uri.TryCreate(config.JellyseerrUrl, UriKind.Absolute, out var configured) || configured.UserInfo.Length != 0 || (configured.Scheme != Uri.UriSchemeHttp && configured.Scheme != Uri.UriSchemeHttps)) return false;
        origin = new Uri(configured.GetLeftPart(UriPartial.Authority));
        hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(origin.AbsoluteUri + "\0" + key)));
        return true;
    }

    private static bool TryPath(string path, out string normalized)
    {
        normalized = "";
        if (path.Length > 8192) return false;
        string decoded = path;
        for (int i = 0; i < 3; i++)
        {
            string next = Uri.UnescapeDataString(decoded);
            if (next == decoded) break;
            decoded = next;
        }
        if (decoded.Contains("//", StringComparison.Ordinal) || decoded.Any(x => char.IsControl(x) || x is '\\' or ':' or '?' or '#' or '%') || decoded.Split('/').Any(x => x is "." or "..")) return false;
        normalized = "/" + decoded.TrimStart('/');
        return true;
    }

    private static string RewriteHtml(string html, string prefix, string path, bool bootstrap = false)
    {
        html = Regex.Replace(html, "<(?:script|link|img|source|video|audio)\\b[^>]*>", match =>
        {
            string tag = Regex.Replace(match.Value, "(?<attribute>\\b(?:src|href|poster)\\s*=\\s*)(?<quote>[\"'])/(?!/)", "${attribute}${quote}" + prefix + "/", RegexOptions.IgnoreCase);
            return Regex.Replace(tag, "(?<attribute>\\bsrcset\\s*=\\s*)(?<quote>[\"'])(?<value>[^\"']*)\\k<quote>", set =>
                set.Groups["attribute"].Value + set.Groups["quote"].Value + Regex.Replace(set.Groups["value"].Value, "(^|,\\s*)/(?!/)", "$1" + prefix + "/") + set.Groups["quote"].Value, RegexOptions.IgnoreCase);
        }, RegexOptions.IgnoreCase);
        JsonSerializerSettings json = new() { StringEscapeHandling = StringEscapeHandling.EscapeHtml };
        string script = prefix[..prefix.LastIndexOf("/app/", StringComparison.Ordinal)] + "/seerrfin-app.js?view=" + Uri.EscapeDataString(prefix[(prefix.LastIndexOf('/') + 1)..]);
        string injection = "<script>window.__seerrFinAppPrefix=" + JsonConvert.SerializeObject(prefix, json) + ";window.__seerrFinAppPath=" + JsonConvert.SerializeObject(path, json) + ";window.__seerrFinAppBootstrap=" + (bootstrap ? "true" : "false") + ";</script><script src=\"" + WebUtility.HtmlEncode(script) + "\"></script>";
        int head = html.IndexOf("<head", StringComparison.OrdinalIgnoreCase);
        int end = head < 0 ? -1 : html.IndexOf('>', head);
        return end < 0 ? injection + html : html.Insert(end + 1, injection);
    }

    private static Reply Error(int status, string message) => new(status, Encoding.UTF8.GetBytes(new JObject { ["message"] = message }.ToString(Formatting.None)), "application/json; charset=utf-8");
}
