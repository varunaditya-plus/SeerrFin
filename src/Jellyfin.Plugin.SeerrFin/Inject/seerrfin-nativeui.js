'use strict';

window.seerrFinLog = window.seerrFinLog || {
    info: function (msg) {
        console.log('SeerrFin • ' + msg);
    },
    warn: function (msg, detail) {
        if (detail !== undefined) {
            console.warn('SeerrFin • ' + msg, detail);
        } else {
            console.warn('SeerrFin • ' + msg);
        }
    },
    error: function (msg, detail) {
        if (detail !== undefined) {
            console.error('SeerrFin • ' + msg, detail);
        } else {
            console.error('SeerrFin • ' + msg);
        }
    }
};

(function () {
    if (window.seerrFinNativeUi) {
        return;
    }

    function t(source) {
        return window.seerrFinI18n ? window.seerrFinI18n.t(source) : source;
    }

    const log = window.seerrFinLog;

    window.seerrFinNativeUi = {
        // Picks best backdrop url for native Seerr result card
        buildCardImageUrl: function (plugin, item) {
            let backdropUrl = plugin.getProviderId(item, 'JellyseerrBackdrop');
            backdropUrl = plugin.resolveImageUrl(backdropUrl);
            if (backdropUrl) {
                return backdropUrl;
            }

            const tmdbBackdropPath = plugin.getProviderId(item, 'TmdbBackdropPath');
            if (tmdbBackdropPath) {
                return plugin.buildTmdbImageUrl(tmdbBackdropPath, null, 'w780');
            }

            return plugin.buildDiscoverPosterUrl(item);
        },

        // Builds Jellyfin cards for Seerr results
        createDiscoverCards: function (plugin, items, options) {
            const self = this;
            options = options || {};
            const interactive = options.interactive !== false;
            const includeMetaText = options.includeMetaText !== false;
            const forGrid = options.forGrid === true;
            const usePoster = options.usePoster === true;
            // english backdrop hydration only for landscape
            const preferEnglishBackdrop = !usePoster && options.preferEnglishBackdrop === true;
            const cardType = usePoster ? (forGrid ? 'portraitCard' : 'overflowPortraitCard') : (forGrid ? 'backdropCard' : 'overflowBackdropCard');
            const padderType = usePoster ? (forGrid ? 'cardPadder-portrait' : 'cardPadder-overflowPortrait') : (forGrid ? 'cardPadder-backdrop' : 'cardPadder-overflowBackdrop');

            return (items || []).map(function (item) {
                const mediaId = plugin.getProviderId(item, 'Tmdb') || plugin.getProviderId(item, 'Jellyseerr') || plugin.getField(item, 'id', 'Id');
                const mediaType = plugin.normalizeDiscoverMediaType(plugin.getField(item, 'SourceType', 'sourceType', 'mediaType', 'MediaType'));
                const safeName = plugin.escapeHtml(plugin.getField(item, 'Name', 'name', 'OriginalTitle', 'originalTitle') || 'Unknown');
                if (!mediaId || !mediaType) {
                    return '';
                }

                const posterUrl = plugin.buildDiscoverPosterUrl(item);
                const backdropUrl = self.buildCardImageUrl(plugin, item);
                const displayUrl = usePoster ? (posterUrl || backdropUrl) : backdropUrl;
                const safeDisplayUrl = plugin.escapeHtml(displayUrl || '');
                const safeBackdropUrl = plugin.escapeHtml(backdropUrl || '');
                const imageAttrs = (!preferEnglishBackdrop && safeDisplayUrl) ? ` data-src="${safeDisplayUrl}"` : '';
                // landscape fallback for grid Thumb/ThumbCard view switches
                const fallbackAttr = safeBackdropUrl ? ` data-fallback-src="${safeBackdropUrl}"` : '';
                const tmdbBackdropPath = plugin.getProviderId(item, 'TmdbBackdropPath') || '';
                const backdropPathAttr = tmdbBackdropPath ? ` data-tmdb-backdrop-path="${plugin.escapeHtml(tmdbBackdropPath)}"` : '';
                const posterAttr = posterUrl ? ` data-poster-src="${plugin.escapeHtml(posterUrl)}"` : '';
                const meta = plugin.buildDiscoverYearText(item);
                const yearValue = parseInt(meta.year || '0', 10) || 0;
                const ratingValue = Number(plugin.getField(item, 'CommunityRating', 'communityRating') || 0) || 0;
                const imageClass = !preferEnglishBackdrop && safeDisplayUrl
                    ? 'cardImageContainer coveredImage cardContent lazy blurhashed lazy-hidden'
                    : 'cardImageContainer coveredImage cardContent lazy-hidden';
                const metaHtml = includeMetaText ? `
                    <div class="cardText cardTextCentered cardText-first"><bdi><span title="${safeName}">${safeName}</span></bdi></div>
                    <div class="cardText cardTextCentered cardText-secondary"><bdi><span title="${meta.year}">${meta.yearText}</span></bdi></div>` : '';
                const overlayHtml = interactive ? `
                    <div class="cardOverlayContainer">
                        <div class="cardImageContainer"></div>
                        <div class="cardOverlayButton-br flex">
                            <button is="discover-requestbutton" type="button" class="discover-requestbutton cardOverlayButton cardOverlayButton-hover paper-icon-button-light emby-button" data-id="${mediaId}" data-media-type="${mediaType}">
                                <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover add" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>` : '';

                return `
                    <div class="card ${cardType} card-hoverable card-withuserdata" data-seerrfin-native-card="true" data-tmdb-id="${mediaId}" data-media-type="${mediaType}" data-name="${safeName}" data-year="${yearValue}" data-rating="${ratingValue}" data-use-poster="${usePoster ? 'true' : 'false'}"${fallbackAttr}${backdropPathAttr}${posterAttr}>
                        <div class="cardBox cardBox-bottompadded">
                            <div class="cardScalable">
                                <div class="cardPadder ${padderType} seerrfin-card-thumb-skeleton"></div>
                                <canvas aria-hidden="true" width="20" height="20" class="blurhash-canvas lazy-hidden"></canvas>
                                <div class="${imageClass}"${imageAttrs} aria-label="${safeName}" role="img"></div>
                                ${overlayHtml}
                            </div>
                            ${metaHtml}
                        </div>
                    </div>`;
            }).join('');
        },

        // kkeleton carousel using jellyfin card markup
        buildRowSkeleton: function (plugin, title, kind) {
            const isCarousel = kind === 'carousel';
            const usePoster = !isCarousel && !plugin.shouldUseBackdropThumbnails();
            const count = isCarousel ? 6 : (usePoster ? 8 : 6);
            const sectionClass = isCarousel
                ? 'verticalSection seerrfin-carousel-section seerrfin-skeleton-section'
                : 'verticalSection seerrfin-poster-section seerrfin-skeleton-section';
            const focusScale = isCarousel
                ? plugin.getAdvancedCarouselSetting('browseCarouselFocusScale', false)
                : plugin.getAdvancedCarouselSetting('discoverRowFocusScale', true);
            const scrollerClass = focusScale
                ? 'padded-top-focusscale padded-bottom-focusscale emby-scroller'
                : 'emby-scroller';
            const centerFocusAttr = plugin.getAdvancedCarouselSetting('enableCenterFocus', true)
                ? ' data-centerfocus="true"'
                : '';
            const safeTitle = plugin.escapeHtml(title || 'Loading');
            const cardType = usePoster ? 'overflowPortraitCard' : 'overflowBackdropCard';
            const padderType = usePoster ? 'cardPadder-overflowPortrait' : 'cardPadder-overflowBackdrop';

            // match real native cards and meta lines
            let cards = '';
            for (let i = 0; i < count; i++) {
                const metaHtml = isCarousel ? '' : `
                    <div class="cardText cardTextCentered cardText-secondary">
                        <span class="seerrfin-native-skeleton-text seerrfin-native-skeleton-text--meta"></span>
                    </div>`;
                cards += `
                    <div class="card ${cardType} card-hoverable" data-seerrfin-skeleton-card="true" aria-hidden="true">
                        <div class="cardBox cardBox-bottompadded">
                            <div class="cardScalable">
                                <div class="cardPadder ${padderType}"></div>
                                <div class="cardImageContainer coveredImage cardContent seerrfin-native-skeleton-image" role="presentation"></div>
                            </div>
                            <div class="cardText cardTextCentered cardText-first">
                                <span class="seerrfin-native-skeleton-text seerrfin-native-skeleton-text--title"></span>
                            </div>
                            ${metaHtml}
                        </div>
                    </div>`;
            }

            return plugin.mountFromHtml(`
                <div class="${sectionClass}" aria-hidden="true" data-seerrfin-skeleton="true" data-seerrfin-native-skeleton="true">
                    <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                        <h2 class="sectionTitle sectionTitle-cards">${safeTitle}</h2>
                    </div>
                    <div is="emby-scroller" class="${scrollerClass}"${centerFocusAttr}>
                        <div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x animatedScrollX" data-monitor="videoplayback,markplayed">
                            ${cards}
                        </div>
                    </div>
                </div>`);
        },

        // Builds carousel cards for genres providers studios and networks
        createBoxCard: function (plugin, item, mediaType, kind) {
            const id = item.id;
            const name = item.name || 'Unknown';
            const safeName = plugin.escapeHtml(name);
            const showLogo = plugin.shouldShowLogo(kind);
            const logoStyleKey = kind === 'provider'
                ? 'streamingService'
                : (kind === 'studio' || kind === 'network' ? 'studioNetwork' : null);
            const logoPath = item.logo || item.logoPath;
            const logoUrl = showLogo && logoStyleKey && logoPath && logoPath !== 'not found'
                ? plugin.buildTmdbImageUrl(logoPath, logoStyleKey)
                : null;

            let imageStyle = '';
            let mediaHtml = '';

            if (kind === 'genre' && (plugin._displaySettings || {}).GenreUseBackdrops !== false) {
                const backdrops = item.backdrops || [];
                if (backdrops.length) {
                    const mode = ((plugin._advancedSettings || {}).tmdb || {}).genreBackdropSelectionMode || 'random';
                    const backdropPath = mode === 'first' ? backdrops[0] : backdrops[Math.floor(Math.random() * backdrops.length)];
                    const backdropUrl = plugin.buildTmdbImageUrl(backdropPath, 'genreBackdrop');
                    if (backdropUrl) {
                        imageStyle = ` style="background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${backdropUrl.replace(/'/g, "\\'")}')"`;
                    }
                }
            }

            if (logoUrl) {
                imageStyle = ' style="display:flex;align-items:center;justify-content:center;background-color:var(--jf-palette-background-paper,rgba(255,255,255,.03))"';
                const inset = item.weirdSize ? '20% 12%' : '29% 15%';
                mediaHtml = `<span role="img" aria-label="${safeName}" style="position:absolute;inset:${inset};background-image:url('${plugin.escapeHtml(logoUrl).replace(/'/g, "\\'")}');background-size:contain;background-position:center;background-repeat:no-repeat"></span>`;
            }

            return `
                <div class="card overflowBackdropCard card-hoverable"
                    data-seerrfin-box-card="true" data-kind="${kind}" data-media-type="${mediaType}" data-id="${plugin.escapeHtml(String(id || ''))}" data-name="${safeName}" role="button" tabindex="0">
                    <div class="cardBox cardBox-bottompadded">
                        <div class="cardScalable">
                            <div class="cardPadder cardPadder-overflowBackdrop"></div>
                            <div class="cardImageContainer coveredImage cardContent"${imageStyle} aria-label="${safeName}" role="img">
                                ${mediaHtml}
                            </div>
                        </div>
                        <div class="cardText cardTextCentered cardText-first"><bdi><span title="${safeName}">${safeName}</span></bdi></div>
                    </div>
                </div>`;
        },

        // Renders native grid using Jellyfin page markup
        renderGridViewShell: function () {
            return `
                <div data-seerrfin-grid-view="true" data-grid-shell="native">
                    <div class="verticalSection">
                        <div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">
                            <button type="button" is="paper-icon-button-light" class="paper-icon-button-light" title="Back" aria-label="Back" data-grid-nav="back">
                                <span class="material-icons arrow_back" aria-hidden="true"></span>
                            </button>
                            <h2 class="sectionTitle sectionTitle-cards"></h2>
                        </div>
                        <div class="flex align-items-center justify-content-center flex-wrap-wrap padded-left padded-right focuscontainer-x">
                            <div class="paging"><div class="listPaging"><span data-seerrfin-paging-text style="vertical-align:middle;"></span></div></div>
                            <button type="button" is="paper-icon-button-light" class="btnSelectView autoSize paper-icon-button-light" title="Select view" disabled data-grid-menu="view">
                                <span class="material-icons view_comfy" aria-hidden="true"></span>
                            </button>
                            <button type="button" is="paper-icon-button-light" class="btnSort autoSize paper-icon-button-light" title="Sort" disabled data-grid-menu="sort">
                                <span class="material-icons sort_by_alpha" aria-hidden="true"></span>
                            </button>
                        </div>
                        <div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x" data-monitor="videoplayback,markplayed"></div>
                        <div data-seerrfin-loadmore style="display:none" class="paging padded-left padded-right">
                            <button type="button" class="raised emby-button">Load more</button>
                        </div>
                        <div data-seerrfin-status style="display:none" class="listItemBodyText secondary padded-left padded-right"></div>
                    </div>
                </div>`;
        },

        // Gets Jellyfin's webpack require so we can reach bundled UI modules
        getJellyfinWebpackRequire: function () {
            if (window.__seerrfinWebpackRequire) {
                return window.__seerrfinWebpackRequire;
            }

            if (!window.webpackChunk || typeof window.webpackChunk.push !== 'function') {
                return null;
            }

            try {
                let req = null;
                window.webpackChunk.push([[`seerrfin_native_${Date.now()}`], {}, function (__webpackRequire) {
                    req = __webpackRequire;
                }]);
                window.__seerrfinWebpackRequire = req;
                return req;
            } catch (err) {
                log.warn('failed to access Jellyfin webpack runtime', err);
                return null;
            }
        },

        // Finds a Jellyfin webpack module by checking the module factory source
        findJellyfinModule: function (predicate) {
            const req = this.getJellyfinWebpackRequire();
            if (!req || !req.m) {
                return null;
            }

            const cacheKey = predicate.cacheKey;
            if (cacheKey && this._jellyfinModuleCache && this._jellyfinModuleCache[cacheKey]) {
                return this._jellyfinModuleCache[cacheKey];
            }

            for (const id of Object.keys(req.m)) {
                try {
                    const factorySource = String(req.m[id]);
                    if (!predicate(factorySource, id)) {
                        continue;
                    }
                    const moduleExports = req(id);
                    if (cacheKey) {
                        this._jellyfinModuleCache = this._jellyfinModuleCache || {};
                        this._jellyfinModuleCache[cacheKey] = moduleExports;
                    }
                    return moduleExports;
                } catch (err) {
                    // Keep scanning; unrelated factories may throw when loaded out of band.
                }
            }

            return null;
        },

        // Finds Jellyfin's actionSheet module for native dropdown menus
        getNativeActionSheet: function () {
            const predicate = function (source) {
                return source.indexOf('actionSheet') !== -1 && source.indexOf('positionTo') !== -1;
            };
            predicate.cacheKey = 'actionSheet';
            const moduleExports = this.findJellyfinModule(predicate);
            return moduleExports && (moduleExports.default || moduleExports);
        },

        // Opens Jellyfin's native action sheet for grid menus
        showNativeActionSheet: function (button, items, callback) {
            const actionSheet = this.getNativeActionSheet();
            if (!actionSheet || typeof actionSheet.show !== 'function') {
                log.warn('native action sheet unavailable');
                return false;
            }

            actionSheet.show({
                items: items,
                positionTo: button,
                callback: callback
            }).catch(function (err) {
                log.info('native action sheet dismissed or failed', err);
            });
            return true;
        },

        // Returns the local fallback options for the grid view and sort menus
        getGridMenuOptions: function (type) {
            if (type === 'view') {
                return [
                    { value: 'Poster', label: t('Poster') },
                    { value: 'PosterCard', label: t('Poster Card') },
                    { value: 'Thumb', label: t('Thumb') },
                    { value: 'ThumbCard', label: t('Thumb Card') }
                ];
            }
            if (type === 'sort') {
                return [
                    { value: 'title', label: t('Title') },
                    { value: 'year', label: t('Release date') },
                    { value: 'rating', label: t('Community rating') }
                ];
            }
            return [];
        },

        // Binds native grid view and sort controls
        bindGridControls: function (plugin, gridView) {
            const self = this;
            if (!gridView || gridView.dataset.controlsBound === 'true') {
                return;
            }

            gridView.dataset.controlsBound = 'true';
            gridView.querySelectorAll('[data-grid-menu]').forEach(function (button) {
                if (button.getAttribute('data-grid-menu') === 'view') {
                    button.addEventListener('layoutchange', function (event) {
                        gridView.dataset.gridViewMode = event.detail && event.detail.viewStyle || 'ThumbCard';
                        plugin.applyGridViewMode(gridView);
                    });
                }

                button.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (button.disabled) {
                        return;
                    }
                    const type = button.getAttribute('data-grid-menu');

                    if (type === 'view' && window.LibraryBrowser && typeof window.LibraryBrowser.showLayoutMenu === 'function') {
                        window.LibraryBrowser.showLayoutMenu(button, gridView.dataset.gridViewMode || 'ThumbCard', ['Poster', 'PosterCard', 'Thumb', 'ThumbCard']);
                        return;
                    }

                    if (type === 'sort' && window.LibraryBrowser && typeof window.LibraryBrowser.showSortMenu === 'function') {
                        const query = {
                            SortBy: gridView.dataset.gridSortBy || 'SortName',
                            SortOrder: gridView.dataset.gridSortOrder || 'Ascending',
                            StartIndex: 0
                        };
                        window.LibraryBrowser.showSortMenu({
                            button: button,
                            query: query,
                            items: [
                                { name: t('Name'), id: 'SortName' },
                                { name: t('Community rating'), id: 'CommunityRating,SortName' },
                                { name: t('Release date'), id: 'PremiereDate,SortName' }
                            ],
                            callback: function () {
                                gridView.dataset.gridSortBy = query.SortBy;
                                gridView.dataset.gridSortOrder = query.SortOrder;
                                if (query.SortBy.indexOf('CommunityRating') === 0) {
                                    gridView.dataset.gridSort = 'rating';
                                } else if (query.SortBy.indexOf('PremiereDate') === 0) {
                                    gridView.dataset.gridSort = 'year';
                                } else {
                                    gridView.dataset.gridSort = 'title';
                                }
                                plugin.applyGridSort(gridView);
                            }
                        });
                        return;
                    }

                    if (type === 'view') {
                        self.showNativeActionSheet(button, self.getGridMenuOptions('view').map(function (option) {
                            return {
                                id: option.value,
                                name: option.label,
                                selected: option.value === (gridView.dataset.gridViewMode || 'ThumbCard')
                            };
                        }), function (value) {
                            gridView.dataset.gridViewMode = value || 'ThumbCard';
                            plugin.applyGridViewMode(gridView);
                        });
                        return;
                    }

                    if (type === 'sort') {
                        self.showNativeActionSheet(button, self.getGridMenuOptions('sort').map(function (option) {
                            return {
                                id: option.value,
                                name: option.label,
                                selected: option.value === (gridView.dataset.gridSort || 'title')
                            };
                        }), function (value) {
                            gridView.dataset.gridSort = value || 'title';
                            plugin.applyGridSort(gridView);
                        });
                        return;
                    }
                });
            });
        },

        // Updates paging text for the grid
        updateGridChrome: function (gridView) {
            if (!gridView) {
                return;
            }

            const loaded = parseInt(gridView.dataset.loadedCount || '0', 10);
            const total = parseInt(gridView.dataset.total || '0', 10);
            const pagingText = gridView.querySelector('[data-seerrfin-paging-text]');
            if (pagingText) {
                pagingText.textContent = loaded > 0
                    ? ('1-' + loaded + (total > 0 ? ' of ' + total : ''))
                    : '';
            }
        },

        // Enables or disables the grid toolbar buttons
        setGridControlsEnabled: function (gridView, enabled) {
            if (!gridView) {
                return;
            }
            gridView.querySelectorAll('[data-grid-menu]').forEach(function (button) {
                button.disabled = !enabled;
            });
        }
    };
})();
