<div align="center">

<div alt style="text-align: center; transform: scale(.25);">
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="https://github.com/varunaditya-plus/SeerrFin/raw/main/assets/logo_dark.png" />
		<img alt="SeerrFin Logo" src="https://github.com/varunaditya-plus/SeerrFin/raw/main/assets/logo_light.png" style="width: 170px;" />
	</picture>
</div>

# SeerrFin
![GitHub License](https://www.shieldcn.dev/github/license/varunaditya-plus/SeerrFin.svg?variant=outline&size=sm)
[![GitHub Downloads (all assets, all releases)](https://shieldcn.dev/github/downloads/varunaditya-plus/SeerrFin.svg?variant=outline&size=sm)](https://github.com/varunaditya-plus/SeerrFin/releases/latest)
[![GitHub Release](https://shieldcn.dev/github/release/varunaditya-plus/SeerrFin.svg?size=sm)](https://github.com/varunaditya-plus/SeerrFin/releases/latest)
![Please star this repo](https://shieldcn.dev/badge/★%20please%20star-22c55e.svg?theme=amber&color=eab308&size=sm&variant=outline)

The best way to discover and request Movies and TV Shows by using Seerr directly in Jellyfin. This plugin adds tabs for discovery, requests, and Letterboxd watchlist syncing, with request modals powered by your Seerr instance. The categories are gotten using TMDB.

</div>

<div align="center" style="width:100%;">
  <video src="https://github.com/user-attachments/assets/cec5bc22-0468-442a-8688-ff52f3129fe0"></video>
</div>

---

## Features
- **Movie and TV tabs**: New tabs for discovering movies and TV shows directly in Jellyfin
- **Discovery sections**: Carousels sorting movies/tv shows to be discovered by (eg. Trending, Popular, etc.)
- **Jellyfin search integration**: Added Seerr movie and TV show results appear in Jellyfin's search to allow you to search and request content directly from Jellyfin
- **Request from Seerr**: Easily request movies and TV shows directly in Jellyfin and select quality profiles and specific seasons (for shows)
- **Quality recommendations**: See the highest released and most common streaming quality when requesting to know the right quality profile for your request
- **Requests tab**: Track your Seerr requests with, and open each request open requested content in Seerr, Radarr or Sonarr
- **Radarr/Sonarr download progress**: See live download progress of requests to see how far along each request is
- **Letterboxd watchlist sync**: Sync your Letterboxd watchlist into Jellyfin and request all movies from your watchlist at once
- **Bulk request from Letterboxd**: Select and request multiple movies from your Letterboxd watchlist at once
- **Display customizations**: Customize logos, backdrops, poster style, and colors for all carousels/cards
- **Native Jellyfin UI**: Optional native look for carousels, grid pages, and search results that matches Jellyfin's own UI style (should work with most themes)
- **Automatic localization**: English and French interfaces follow each user's Jellyfin display language, with English as the fallback


## Installation

### First make sure you have these prerequisites:
- A running Jellyfin **12.0** and Seerr instance
- [File Transformation](https://www.iamparadox.dev/jellyfin/plugins/manifest.json) plugin

### Install from plugin catalog
1. Open **Dashboard → Plugins → Manage Repositories**.
2. Click **New Repository** and paste this repository URL:
```
https://raw.githubusercontent.com/varunaditya-plus/SeerrFin/main/manifest.json
```
3. Now go back to **Plugins** in the sidebar, select **All** in the filters above the plugins, and click SeerrFin. Then click **Install**.
4. Now you have to restart your Jellyfin instance. Go to **Dashboard** and click the **Restart** button. You're done!

### Configuration
After installation, now configure the extension so it will work with your Seerr instance. Go to **Dashboard → SeerrFin**, click settings, and follow the instructions. Also fill out all the configurations (TMDB is optional but recommended). You're not stupid. You figured out how to get Jellyfin and Seerr installed.

## Screenshots
<table>
  <tr>
    <td><img width="1720" height="720" alt="Movie tab" src="https://github.com/user-attachments/assets/94fcae0d-9027-4e96-a6fc-d2c8fd1734c5" /></td>
    <td><img width="1720" height="720" alt="Content modal" src="https://github.com/user-attachments/assets/9b347369-79dd-4f6a-8abb-ba70f83040c3" /></td>
  </tr>
  <tr>
    <td><img width="1720" height="720" alt="Request tab" src="https://github.com/user-attachments/assets/c247919c-a22d-4852-afe5-70f03ee8f8d1" /></td>
    <td><img width="1720" height="720" alt="Letterboxd import tab" src="https://github.com/user-attachments/assets/4eae17eb-ebbc-4b6c-a28f-241088d00936" /></td>
  </tr>
</table>

## Downloads

<p align="center">
  <a href="https://downloadhistory.varunaditya.xyz/#varunaditya-plus/SeerrFin&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://downloadhistory.varunaditya.xyz/svg?repos=varunaditya-plus/SeerrFin&type=Date&title=&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://downloadhistory.varunaditya.xyz/svg?repos=varunaditya-plus/SeerrFin&type=Date&title=" />
      <img alt="Download History Chart" src="https://downloadhistory.varunaditya.xyz/svg?repos=varunaditya-plus/SeerrFin&type=Date&title=" width=600 />
    </picture>
  </a>
</p>

## FAQ

<details><summary><b>The Movie/TV Shows/etc. tabs show up, but nothing loads inside them. What do I do?</b></summary>

1. Clear your browser cache. Try a different browser/incognito mode.
2. Restart Jellyfin so File Transformation can reregister the inject scripts.
3. Open **Dashboard → SeerrFin → Overview**, make sure the tabs are enabled, Save, clear your browser cache, and refresh the home page.

</details>
<details><summary><b>In console, I got <code>Cannot find module './'</code> and tabs don't load. What do I do?</b></summary>

Usually a problem to do with File Transformation not loading the scripts correctly. Uninstall SeerrFin, restart Jellyfin, reinstall SeerrFin, and restart again.

</details>
<details><summary><b>SeerrFin UI looks weird and inconsistent, what should I do?</b></summary>

Some themes, like ElegantFin have issues with SeerFin's elements. In SeerrFin settings, enable **ElegantFin fixes** to fix issues with ElegantFin. For the Abyss theme, make sure to add `#searchPage .scrollSlider { overflow: visible !important; }` at the bottom of your custom CSS so scrolling works in the search carousel.

</details>
<details><summary><b>Is a TMDB API key required?</b></summary>

Not required, but is heavily recommended. TMDB gives you better images, landscape thumbnails, and release-type filtering. Get a key for free from [TMDB](https://www.themoviedb.org/settings/api).

</details>
<details><summary><b>Does SeerrFin work on external Jellyfin clients like mobile/tv apps, or only the web client?</b></summary>

Currently, SeerrFin only works on the Jellyfin web client and anything using the web client, but I am planning to try to support native clients in the future. Native clients each need their own custom SeerrFin implementation in different languages and can't work through just this plugin. [Swiftfin](https://github.com/jellyfin/swiftfin) is the first native client I want SeerrFin to be supported on.

</details>
<details><summary><b>How is SeerrFin different from Jellyfin Enhanced?</b></summary>

While Jellyfin Enhanced has Seerr search results, some discovery features, and a requests page, SeerrFin integrates Seerr discovery directly into Jellyfin in the cleanest way possible with category carousels, genre/network/studio browsing, quality recommendations, Letterboxd sync, and full request modals inside tabs.

</details>
<details><summary><b>Will SeerrFin conflict with Jellyfin Enhanced or other Seerr plugins?</b></summary>

They can run together, and some people do, but be aware that you might see ui from both plugins that do the same thing. Make sure to disable duplicate features in the plugin you don't want to use for that feature. Report any issues in a GitHub issue.

</details>
<details><summary><b>What URL should I use for Seerr/Radarr/Sonarr in the plugin settings?</b></summary>

Use a URL the Jellyfin server can reach. In Docker that's usually the internal hostname (`http://seerr:5055`). Put the browser-facing URL in **External Seerr URL** for the "Open in Seerr" links. Same thing for the *arrs.

</details>
<details><summary><b>Do regular (non-admin) Jellyfin users need anything set up to request media?</b></summary>

They need a matching Seerr user linked to their Jellyfin user with request permissions in Seerr.

</details>


## Contributing & Support
If you have any suggestions or features you want to be implemented in this plugin, please open a pull request. For suggestions, feature requests, or bug reports, open an issue. Please include your Jellyfin version and a screenshot if relevant.

See [CONTRIBUTING.md](CONTRIBUTING.md) for testing expectations, commit format, versioning, and PR guidelines.

## Credits
- [Lato](https://fonts.google.com/specimen/Lato) by Łukasz Dziedzic, served via Google Fonts.
- Movie and TV metadata, images, and the TMDB logo from [The Movie Database (TMDB)](https://www.themoviedb.org/).
- Discover and request flows powered by the [Seerr](https://github.com/seerr-team/seerr) API.
- [Letterboxd](https://letterboxd.com/) for providing user watchlists for Letterboxd syncing
- Streaming quality recommendations gotten from [JustWatch](https://www.justwatch.com/).
- Uses [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) by IAmParadox27.
