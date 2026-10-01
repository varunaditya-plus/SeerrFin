using Jellyfin.Plugin.SeerrFin.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SeerrFin.Controllers;

[ApiController]
[Route("SeerrFin")]
public class SeerrFinAppController(JellyseerrAppService service) : ControllerBase
{
    public sealed record OpenRequest(string Page, int? MediaId = null);
    private Guid UserId => Guid.TryParse(User.Claims.FirstOrDefault(x => x.Type.Equals("Jellyfin-UserId", StringComparison.OrdinalIgnoreCase))?.Value, out var id) ? id : Guid.Empty;
    private string Prefix => Request.PathBase + "/SeerrFin/app";
    private void NoCache() => Response.Headers.CacheControl = "no-store";
    private bool SameOrigin => Uri.TryCreate(Request.Headers.Origin.ToString(), UriKind.Absolute, out var source) && Uri.TryCreate(Request.Scheme + "://" + Request.Host, UriKind.Absolute, out var target) && source.Scheme == target.Scheme && source.Host.Equals(target.Host, StringComparison.OrdinalIgnoreCase) && source.Port == target.Port;

    [HttpPost("app-session")]
    [Authorize]
    public async Task<IActionResult> Open([FromBody] OpenRequest request, CancellationToken cancellationToken)
    {
        NoCache();
        var result = await service.CreateAsync(UserId, request.Page, Prefix, cancellationToken, request.MediaId).ConfigureAwait(false);
        if (result.StatusCode != 200) return StatusCode(result.StatusCode, new { message = result.Message });
        SetSessionCookie(result.Ticket!, result.SessionId!.Value);
        return Ok(new { sessionId = result.SessionId.Value.ToString("D"), path = result.Path });
    }

    [HttpDelete("app/{sessionId:guid}/session-close")]
    [AllowAnonymous]
    public IActionResult CloseTicket(Guid sessionId)
    {
        NoCache();
        if (!SameOrigin) return StatusCode(403, new { message = "This action must come from Jellyfin." });
        service.RevokeTicket(Request.Cookies[JellyseerrAppService.CookieName], sessionId);
        Response.Cookies.Delete(JellyseerrAppService.CookieName, new CookieOptions { Path = Prefix + "/" + sessionId, HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict });
        return NoContent();
    }

    [HttpGet("profile/avatar")]
    [Authorize]
    public async Task<IActionResult> Avatar(CancellationToken cancellationToken)
    {
        NoCache();
        var result = await service.AvatarAsync(UserId, cancellationToken).ConfigureAwait(false);
        return Result(result);
    }

    [Route("app/{sessionId:guid}/{**path}")]
    [AcceptVerbs("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE")]
    [AllowAnonymous]
    public async Task<IActionResult> App(Guid sessionId, string? path, CancellationToken cancellationToken)
    {
        NoCache();
        string? ticket = Request.Cookies[JellyseerrAppService.CookieName];
        var result = await service.ProxyAsync(ticket, sessionId, path ?? "", Request.QueryString.Value ?? "", Request.Method, Request.Body, Request.ContentType, Prefix + "/" + sessionId, SameOrigin, cancellationToken).ConfigureAwait(false);
        if (ticket != null && result.StatusCode != 401) SetSessionCookie(ticket, sessionId);
        return Result(result);
    }

    private void SetSessionCookie(string ticket, Guid sessionId) => Response.Cookies.Append(JellyseerrAppService.CookieName, ticket, new CookieOptions
    {
        HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict,
        Path = Prefix + "/" + sessionId, MaxAge = JellyseerrAppService.SessionLifetime, IsEssential = true
    });

    private IActionResult Result(JellyseerrAppService.Reply reply)
    {
        Response.StatusCode = reply.StatusCode;
        if (reply.Location != null) Response.Headers.Location = reply.Location;
        return File(reply.Body, reply.ContentType);
    }
}
