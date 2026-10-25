using System.Collections.Concurrent;

namespace Jellyfin.Plugin.SeerrFin.Helpers;

/// <summary>Adds Seerr's CSRF cookie and token to API writes.</summary>
public class SeerrCsrfHandler : DelegatingHandler
{
    public const string ClientName = "SeerrFin.Seerr";

    // CSRF tokens stay valid with their matching secret, so reuse one pair per origin.
    private static readonly ConcurrentDictionary<string, CsrfPair> Pairs = new(StringComparer.OrdinalIgnoreCase);

    private sealed record CsrfPair(string Secret, string Token);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (
            request.RequestUri is { IsAbsoluteUri: true } uri
            && request.Method != HttpMethod.Get
            && request.Method != HttpMethod.Head
            && request.Method != HttpMethod.Options
        )
        {
            Uri origin = new(uri.GetLeftPart(UriPartial.Authority));
            CsrfPair? pair = await GetPairAsync(origin, cancellationToken).ConfigureAwait(false);

            if (pair != null)
            {
                request.Headers.Remove("Cookie");
                request.Headers.Remove("X-XSRF-TOKEN");
                request.Headers.TryAddWithoutValidation("Cookie", "_csrf=" + pair.Secret);
                request.Headers.TryAddWithoutValidation("X-XSRF-TOKEN", pair.Token);
            }
        }

        return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private async Task<CsrfPair?> GetPairAsync(Uri origin, CancellationToken cancellationToken)
    {
        if (Pairs.TryGetValue(origin.AbsoluteUri, out CsrfPair? cached)) return cached;

        // Read CSRF cookies from Seerr's public status endpoint.
        using HttpRequestMessage probe = new(HttpMethod.Get, new Uri(origin, "/api/v1/status"));
        using HttpResponseMessage response = await base.SendAsync(probe, cancellationToken).ConfigureAwait(false);

        if (!response.Headers.TryGetValues("Set-Cookie", out var values)) return null;

        string? secret = null;
        string? token = null;

        foreach (string value in values)
        {
            string cookie = value.Split(';', 2)[0];
            int equals = cookie.IndexOf('=');

            if (equals <= 0) continue;

            string name = cookie[..equals].Trim();

            if (name == "_csrf") secret = cookie[(equals + 1)..];
            else if (name == "XSRF-TOKEN") token = Uri.UnescapeDataString(cookie[(equals + 1)..]);
        }

        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(token)) return null;

        CsrfPair pair = new(secret, token);
        Pairs[origin.AbsoluteUri] = pair;

        return pair;
    }
}
