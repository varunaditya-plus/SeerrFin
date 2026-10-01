using Jellyfin.Plugin.SeerrFin.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SeerrFin;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHttpClient();
        serviceCollection.AddHttpClient(JellyseerrAppService.ClientName).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            AllowAutoRedirect = false, UseCookies = false, AutomaticDecompression = System.Net.DecompressionMethods.All
        });
        serviceCollection.AddSingleton<ImageCacheService>(services =>
        {
            IHttpClientFactory httpClientFactory = services.GetRequiredService<IHttpClientFactory>();
            return ActivatorUtilities.CreateInstance<ImageCacheService>(services, httpClientFactory.CreateClient());
        });
        serviceCollection.AddSingleton<TmdbBackdropService>(services =>
        {
            IHttpClientFactory httpClientFactory = services.GetRequiredService<IHttpClientFactory>();
            return ActivatorUtilities.CreateInstance<TmdbBackdropService>(services, httpClientFactory.CreateClient());
        });
        serviceCollection.AddSingleton<JustWatchQualitiesService>(services =>
        {
            IHttpClientFactory httpClientFactory = services.GetRequiredService<IHttpClientFactory>();
            return ActivatorUtilities.CreateInstance<JustWatchQualitiesService>(services, httpClientFactory.CreateClient());
        });
        serviceCollection.AddSingleton<JellyseerrDiscoveryService>();
        serviceCollection.AddSingleton<JellyseerrRequestService>();
        serviceCollection.AddSingleton<JellyseerrRequestsService>();
        serviceCollection.AddSingleton<ServarrProgressService>();
        serviceCollection.AddSingleton<JellyseerrProxyService>();
        serviceCollection.AddSingleton<JellyseerrWatchlistService>();
        serviceCollection.AddSingleton<JellyseerrAccountService>();
        serviceCollection.AddSingleton<JellyseerrProfileService>();
        serviceCollection.AddSingleton<JellyseerrAppService>();
        serviceCollection.AddSingleton<LetterboxdWatchlistService>();
        serviceCollection.AddSingleton<LetterboxdBulkRequestService>();
    }
}
