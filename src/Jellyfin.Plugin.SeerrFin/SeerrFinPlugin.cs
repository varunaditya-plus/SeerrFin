using Jellyfin.Plugin.SeerrFin.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.SeerrFin;

public class SeerrFinPlugin : BasePlugin<PluginConfiguration>, IHasPluginConfiguration, IHasWebPages
{
    public override Guid Id => Guid.Parse("c8e4f2a1-9b3d-4e7f-a6c2-1d5e8f0a3b7c");

    public override string Name => "SeerrFin";

    public static SeerrFinPlugin Instance { get; private set; } = null!;

    public SeerrFinPlugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;

        // Normalize cached instance once on load. without this SaveConfiguration could stay a partial tab list.
        Configuration.Tabs = SeerrFinTabConfigHelper.Normalize(Configuration.Tabs);
        Configuration.TabBarOrder = SeerrFinTabConfigHelper.NormalizeBarOrder(Configuration.TabBarOrder);
        ServarrConfigHelper.Resolve(Configuration);
    }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        string? prefix = GetType().Namespace;
        yield return new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = $"{prefix}.Configuration.config.html",
            EnableInMainMenu = true,
            DisplayName = "SeerrFin",
            MenuIcon = "preview",
        };
    }

    // to normalize tab settings and order before saving to disk
    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        if (configuration is PluginConfiguration config)
        {
            config.Tabs = SeerrFinTabConfigHelper.Normalize(config.Tabs);
            config.TabBarOrder = SeerrFinTabConfigHelper.NormalizeBarOrder(config.TabBarOrder);
            ServarrConfigHelper.Resolve(config);
        }

        base.UpdateConfiguration(configuration);
    }

    public void BustCache()
    {
        Configuration.CacheBustCounter++;
        SaveConfiguration();
    }
}
