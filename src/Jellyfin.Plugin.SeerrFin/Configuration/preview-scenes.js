'use strict';

(function () {
    const PREVIEW_SETTINGS = new Set([
        'streamingServiceUseImages', 'studioNetworkUseImages', 'genreUseBackdrops', 'discoverUsePosters',
        'nativeCarousels', 'nativeGridPages', 'nativeSearchResults', 'showDownloadDetailsInDiscoveryPages',
        'useStarForRatings', 'qualityRecommendations',
        'advDiscoverRowFocusScale', 'advBrowseCarouselFocusScale',
        'advRequestsCardsInteractive', 'advRequestsCardsIncludeMetaText', 'advLbRequestCardsInteractive',
        'advLbRequestCardsIncludeMetaText', 'advTvSeasonPickerEnabled', 'advIncludeSpecialsSeason',
        'advRequireExplicitSeasonSelection', 'advShowRequest4kButton', 'advShowRootFolderSelector', 'bstCustomizeDuotone'
    ]);
    const REQUEST_ACTIONS = '[data-action="request"], [data-action="play"], [data-action="request-4k"]';
    const ACTION_GROUP = '.bst-actions-left, .bst-actions-left > button';

    function supports(input) {
        return !!input && (PREVIEW_SETTINGS.has(input.id) || input.hasAttribute('data-rating-source'));
    }

    function escapeHtml(value) {
        const element = document.createElement('span');
        element.textContent = String(value == null ? '' : value);
        return element.innerHTML;
    }

    function copy(value) { return JSON.parse(JSON.stringify(value || {})); }
    function scene(html, note, kind, options) {
        kind = kind || 'cards';
        const focus = {
            cards: '.bst-preview-cards > .card:first-child, .bst-preview-boxes > .card:first-child, .seerrfin-letterboxd-grid > .seerrfin-letterboxd-card-slot:first-child',
            seasons: '.bst-quality-panel',
            quality: '.bst-quality-panel'
        };
        return Object.assign({ html: html, note: note || '', kind: kind, focusSelector: focus[kind] }, options);
    }
    function value(context, id, fallback) { return context.values && context.values[id] !== undefined ? context.values[id] : fallback; }

    function externalRatings(samples, id, type) {
        const ratings = type === 'tv' ? samples.tvRatingsById : samples.ratingsById;
        return ratings && ratings[id];
    }

    function renderer(context) {
        if (!context.plugin) { return null; }

        const plugin = Object.create(context.plugin);
        plugin._displaySettings = copy(context.plugin._displaySettings);
        plugin._advancedSettings = copy(context.plugin._advancedSettings);
        const originalYearText = plugin.buildDiscoverYearText;
        plugin.buildDiscoverYearText = function (item) {
            const meta = originalYearText.call(this, item);
            const type = this.normalizeDiscoverMediaType(this.getField(item, 'SourceType', 'sourceType', 'mediaType', 'MediaType'));
            const samples = context.samples || {};
            const mediaId = this.getProviderId(item, 'Tmdb') || this.getProviderId(item, 'Jellyseerr') || this.getField(item, 'id', 'Id');
            const external = externalRatings(samples, mediaId, type);

            if (!external) { return meta; }

            const tmdb = Number(this.getField(item, 'CommunityRating', 'communityRating') || 0);
            const modal = window.seerrFinModal;
            const ratings = modal.getRatingEntries(tmdb, null, external, modal.getRatingSources(type, this._displaySettings), this._displaySettings);
            meta.yearText = '<span data-seerrfin-card-ratings>' + this.renderCardRatings(ratings, meta.year) + '</span>';
            meta.rating = ratings[0]?.value || 0;
            return meta;
        };
        return plugin;
    }

    function row(html, plugin, kind, title, nativeCards) {
        const carousel = kind === 'carousel';
        const native = nativeCards === undefined ? plugin && plugin.shouldUseNativeCarousels() : nativeCards;
        const advanced = plugin && plugin._advancedSettings.carousel || {};
        const focusScale = carousel ? advanced.browseCarouselFocusScale === true : advanced.discoverRowFocusScale !== false;
        const heading = title ? '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left"><h2 class="sectionTitle sectionTitle-cards">' + escapeHtml(title) + '</h2></div>' : '';
        return '<div class="verticalSection ' + (carousel ? 'seerrfin-carousel-section' : 'seerrfin-poster-section') + '">' + heading +
            '<div is="emby-scroller" class="' + (focusScale ? 'padded-top-focusscale padded-bottom-focusscale ' : '') + 'emby-scroller"' + (advanced.enableCenterFocus !== false ? ' data-centerfocus="true"' : '') + '>' +
            '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x' + (native ? ' animatedScrollX' : '') + ' ' + (carousel ? 'bst-preview-boxes' : 'bst-preview-cards') + '">' + html + '</div></div></div>';
    }

    function presentBackdrop(plugin, card) {
        if (!plugin || !card.classList.contains('seerrfin-discover-card--backdrop')) return;
        const fallback = card.dataset.fallbackSrc || plugin.buildTmdbImageUrl(card.dataset.tmdbBackdropPath);
        const key = card.dataset.mediaType && card.dataset.tmdbId && plugin.getBackdropCacheKey(card.dataset.mediaType, card.dataset.tmdbId);
        const cached = key && plugin._backdropResultCache && plugin._backdropResultCache[key];
        let localArtwork = false;
        if (fallback) {
            const url = new URL(fallback, document.baseURI);
            localArtwork = url.origin === window.location.origin && !url.pathname.includes('/SeerrFin/CachedImage/');
        }
        if (!localArtwork && cached && cached.hasEnglishBackdrop && cached.url) {
            plugin.applyDiscoverBackdropResult(card, cached, fallback);
        } else {
            plugin.setDiscoverBackdropPresentation(card, 'fallback');
            plugin.setDiscoverBackdropImage(card, fallback);
        }
    }

    function exampleCard(plugin, mediaType, raw) {
        const template = document.createElement('template');
        const item = { Name: 'Example', SourceType: mediaType === 'tv' ? 'Series' : 'Movie', ProviderIds: { Tmdb: 'preview-example' } };
        template.innerHTML = plugin ? plugin.createDiscoverCards([item], false, { nativeCards: plugin.shouldUseNativeCarousels(), interactive: false, includeMetaText: true }) :
            '<div class="card portraitCard"><div class="cardBox"><div class="cardScalable"><div class="cardPadder cardPadder-portrait"></div></div><div class="cardText cardTextCentered">Example</div></div></div>';

        const card = template.content.querySelector('.card');
        if (card) {
            card.setAttribute('data-bst-preview-example', 'true');
            presentBackdrop(plugin, card);
        }
        return raw ? template.innerHTML : row(template.innerHTML, plugin, 'poster');
    }

    function cards(plugin, context, options) {
        const samples = context.samples || {};
        const mediaType = context.previewMediaType;
        const library = mediaType === 'tv' ? samples.libraryTv || [] : mediaType === 'movie' ? samples.libraryMovies || [] : [(samples.libraryMovies || [])[0], (samples.libraryTv || [])[0]].filter(Boolean);

        const discovery = mediaType === 'tv' ? samples.tv : samples.movies;
        const items = (context.previewItems || (library.length ? library : discovery) || []).slice(0, options && options.limit || 2);
        if (!plugin || !items.length) return exampleCard(plugin, mediaType, options && options.raw);

        const template = document.createElement('template');
        template.innerHTML = plugin.createDiscoverCards(items, options && options.forGrid === true, Object.assign({
            nativeCards: plugin.shouldUseNativeCarousels(), interactive: false, discoveryPage: false
        }, options));

        if (!template.content.querySelector('.card')) return exampleCard(plugin, mediaType, options && options.raw);
        template.content.querySelectorAll('.seerrfin-discover-card--backdrop').forEach(function (card) { presentBackdrop(plugin, card); });
        template.content.querySelectorAll('[data-seerrfin-native-card="true"][data-use-poster="false"]').forEach(function (card) {
            const key = plugin.getBackdropCacheKey(card.dataset.mediaType, card.dataset.tmdbId);
            const cached = plugin._backdropResultCache && plugin._backdropResultCache[key];
            const path = cached && cached.path || card.dataset.tmdbBackdropPath;
            const url = path ? plugin.buildTmdbImageUrl(path, 'discoverBackdrop') : card.dataset.fallbackSrc;
            const image = card.querySelector('.cardImageContainer.cardContent');

            if (image && url) {
                image.removeAttribute('data-src');
                image.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
            }
        });
        if (options && options.raw) return template.innerHTML;
        if (options && options.letterboxdSlot) {
            return '<div class="seerrfin-grid-view"><div class="seerrfin-letterboxd-grid seerrfin-letterboxd-grid--' +
                (plugin.shouldUseBackdropThumbnails() ? 'landscape' : 'portrait') + ' bst-preview-cards">' + template.innerHTML + '</div></div>';
        }
        const html = row(template.innerHTML, plugin, 'poster', options && options.title, options && options.nativeCards);
        if (options && options.search && options.nativeCards === true) {
            const search = document.createElement('template');
            search.innerHTML = html;
            const heading = search.content.querySelector('.sectionTitleContainer');
            heading.outerHTML = '<h2 class="sectionTitle sectionTitle-cards focuscontainer-x padded-left padded-right">Seerr results</h2>';
            return search.innerHTML;
        }
        return html;
    }

    function box(plugin, context, kind) {
        const samples = context.samples || {};
        let mediaType = context.previewMediaType || (kind === 'network' ? 'tv' : 'movie');
        const key = kind === 'provider' ? mediaType === 'tv' ? 'providerTv' : 'provider' : kind === 'genre' ? mediaType === 'tv' ? 'genreTv' : 'genre' : kind === 'network' ? 'network' : 'studio';
        let item = samples[key];
        if (!item && !context.previewMediaType) {
            if (kind === 'provider') item = samples.providerTv;
            if (kind === 'genre') item = samples.genreTv;
            if (kind === 'studio' && samples.network) { item = samples.network; kind = 'network'; }
            if (item) mediaType = 'tv';
        }
        if (!plugin || !item) return exampleCard(plugin, mediaType);
        const sample = Object.assign({}, item, { backdrops: (item.backdrops || []).slice(0, 1) });
        return row(plugin.shouldUseNativeCarousels() && window.seerrFinNativeUi ?
            window.seerrFinNativeUi.createBoxCard(plugin, sample, mediaType, kind) : plugin.createBoxCard(sample, mediaType, kind), plugin, 'carousel');
    }

    function requestItem(item) {
        return {
            Name: item.title, SourceType: item.type, PremiereDate: item.year ? item.year + '-01-01' : '', CommunityRating: item.voteAverage,
            ProviderIds: { Tmdb: String(item.tmdbId), TmdbPosterPath: item.posterPath, TmdbBackdropPath: item.backdropPath, JellyseerrBackdrop: item.backdropUrl }
        };
    }

    function realRequests(samples) {
        return (samples.requests || []).filter(function (item) { return item.tmdbId && item.title && item.title !== 'Unknown'; });
    }

    function requestPreview(plugin, item, options) {
        const html = window.seerrFinRequestsPreview && window.seerrFinRequestsPreview.render(item, Object.assign({ plugin: plugin }, options));
        if (!html) return exampleCard(plugin);
        const template = document.createElement('template');
        template.innerHTML = html;
        template.content.querySelectorAll('.seerrfin-discover-card--backdrop').forEach(function (card) { presentBackdrop(plugin, card); });
        return '<div class="seerrfin-requests-body"><div class="seerrfin-requests-grid padded-left padded-right seerrfin-requests-grid--' +
            (plugin.shouldUseBackdropThumbnails() ? 'landscape' : 'portrait') + '">' + template.innerHTML + '</div></div>';
    }

    function withItems(context, items) {
        return Object.assign({}, context, { previewItems: items });
    }

    function withMediaType(context, mediaType) {
        return Object.assign({}, context, { previewMediaType: mediaType });
    }

    function modalScene(id, enabled, plugin, context) {
        const samples = context.samples || {};
        const api = window.seerrFinModal;
        if (!plugin || !api || !api.renderSettingsPreview) return scene(exampleCard(plugin));
        if (samples.detailsReady === false || id === 'qualityRecommendations' && samples.qualitiesReady === false) {
            return Object.assign(scene(exampleCard(plugin)), { pending: true });
        }

        const modal = Object.assign({}, plugin._advancedSettings.requestModal);
        if (['advIncludeSpecialsSeason', 'advRequireExplicitSeasonSelection'].includes(id)) { modal.tvSeasonPickerEnabled = true; }
        const settings = plugin._displaySettings;
        const tv = (samples.tvDetailsList || []).slice().sort(function (first, second) {
            return (first.seasons || []).length - (second.seasons || []).length;
        });

        const movies = samples.movieDetailsList || [];
        let kind = 'details';
        let mediaType = 'movie';
        let data;
        let qualities;
        let requestOptions = samples.movieOptions || samples.requestOptions;

        if (id === 'qualityRecommendations') {
            data = movies.find(function (entry) { return samples.qualities && samples.qualities[entry.id]; });
            qualities = data && samples.qualities[data.id];
            settings.QualityRecommendations = enabled;
        } else if (id === 'advShowRequest4kButton') {
            data = movies.find(function (entry) { return !entry.jellyfinItemId || ![4, 5].includes(entry.mediaInfo && entry.mediaInfo.status4k); });
            modal.showRequest4kButton = enabled;
        } else {
            mediaType = 'tv';
            requestOptions = samples.requestOptions;
            kind = id === 'advShowRootFolderSelector' ? 'quality' : 'seasons';
            data = tv.find(function (entry) {
                const eligible = (entry.seasons || []).some(function (season) {
                    return season.episodeCount > 0 && (id !== 'advIncludeSpecialsSeason' || season.seasonNumber === 0);
                });
                if (!eligible || id !== 'advRequireExplicitSeasonSelection') return eligible;
                const candidate = document.createElement('template');
                candidate.innerHTML = api.renderSettingsPreview('seasons', entry, {
                    mediaType: 'tv', requestModal: Object.assign({}, modal, { tvSeasonPickerEnabled: true, requireExplicitSeasonSelection: false }),
                    displaySettings: settings, requestOptions: requestOptions
                });
                return !candidate.content.querySelector('.bst-quality-continue').disabled;
            });
            if (id === 'advTvSeasonPickerEnabled') modal.tvSeasonPickerEnabled = enabled;
            if (id === 'advIncludeSpecialsSeason') modal.includeSpecialsSeason = enabled;
            if (id === 'advRequireExplicitSeasonSelection') modal.requireExplicitSeasonSelection = enabled;
            if (id === 'advShowRootFolderSelector') {
                data = tv[0];
                modal.showRootFolderSelector = enabled;
                const profiles = (requestOptions && (requestOptions.options || requestOptions.Options) || []).filter(function (profile) { return !(profile.is4k ?? profile.Is4k); });
                const selected = profiles.find(function (profile) { return (profile.isDefault ?? profile.IsDefault) && (profile.isDefaultProfile ?? profile.IsDefaultProfile); }) || (profiles.length === 1 ? profiles[0] : null);
                const folders = selected && (selected.rootFolders || selected.RootFolders) || [];
                if (!(requestOptions && (requestOptions.canRequestAdvanced ?? requestOptions.CanRequestAdvanced)) || !folders.length || profiles.length === 1 && folders.length <= 1) data = null;
            }
        }
        if (!data) return scene(exampleCard(plugin));
        let html = api.renderSettingsPreview(kind, data, {
            mediaType: mediaType, requestModal: modal, displaySettings: settings, requestOptions: requestOptions,
            qualities: qualities, externalRatings: externalRatings(samples, data.id, mediaType)
        });
        if (id === 'advRequireExplicitSeasonSelection') {
            const template = document.createElement('template');
            template.innerHTML = html;
            template.content.querySelector('.bst-season-row-input:not(:disabled)')?.closest('.bst-season-option').classList.add('bst-preview-season-choice');
            html = template.innerHTML;
        }
        const focus = id === 'qualityRecommendations' ? '[data-quality-slot]' : ACTION_GROUP;
        return scene(html, data.title || data.name, kind, kind === 'details' ? { focusSelector: focus, clipSelector: focus } : undefined);
    }

    function renderScene(input, enabled, context) {
        if (!supports(input)) return null;

        const id = input.id || '';
        const plugin = renderer(context);
        const settings = plugin && plugin._displaySettings || {};
        const samples = context.samples || {};
        const displayKeys = { streamingServiceUseImages: 'StreamingServiceUseImages', studioNetworkUseImages: 'StudioNetworkUseImages', genreUseBackdrops: 'GenreUseBackdrops', discoverUsePosters: 'DiscoverUsePosters', nativeCarousels: 'NativeCarousels', nativeGridPages: 'NativeGridPages', nativeSearchResults: 'NativeSearchResults', useStarForRatings: 'UseStarForRatings' };

        if (displayKeys[id]) settings[displayKeys[id]] = enabled;
        if (input.hasAttribute('data-rating-source')) {
            const group = input.closest('#movieRatingSources, #tvShowRatingSources');
            const tv = group && group.id === 'tvShowRatingSources';
            const mediaType = tv ? 'tv' : 'movie';
            const candidates = (tv ? samples.tv : samples.movies) || [];
            const item = plugin && candidates.find(function (candidate) {
                const id = plugin.getProviderId(candidate, 'Tmdb') || plugin.getProviderId(candidate, 'Jellyseerr') || plugin.getField(candidate, 'id', 'Id');
                const tmdb = Number(plugin.getField(candidate, 'CommunityRating', 'communityRating') || 0);
                return window.seerrFinModal.getRatingEntries(tmdb, null, externalRatings(samples, id, mediaType), [input.value], settings).length > 0;
            }) || candidates[0];
            settings[tv ? 'TvShowRatingSources' : 'MovieRatingSources'] = enabled ? [input.value] : [];
            return scene(cards(plugin, withItems(withMediaType(context, mediaType), item ? [item] : [])));
        }

        switch (id) {
            case 'streamingServiceUseImages': return scene(box(plugin, context, 'provider'));
            case 'studioNetworkUseImages': return scene(box(plugin, context, 'studio'));
            case 'genreUseBackdrops': return scene(box(plugin, context, 'genre'));
            case 'discoverUsePosters':
            case 'nativeCarousels': return scene(cards(plugin, context));
            case 'useStarForRatings': return scene(cards(plugin, withItems(context, samples.movies || [])));
            case 'nativeSearchResults':
                return scene(cards(plugin, context, { nativeCards: enabled, interactive: true, title: 'Seerr results', search: true }), '', 'cards', {
                    focusSelector: '.sectionTitle, .bst-preview-cards > .card:first-child', align: 'left'
                });
            case 'nativeGridPages': {
                if (!plugin) return scene(exampleCard(plugin));
                const template = document.createElement('template');
                template.innerHTML = plugin.renderGridViewShell(enabled);
                template.content.querySelector('.sectionTitle').textContent = 'Browse';
                const items = (samples.libraryMovies || []).concat(samples.libraryTv || []);
                const container = template.content.querySelector('.itemsContainer');
                container.innerHTML = cards(plugin, items.length ? withItems(context, items) : context, { nativeCards: enabled, forGrid: true, raw: true, limit: 1 });
                container.classList.add('justify-content-center');
                template.content.querySelectorAll('[data-grid-menu]').forEach(function (button) { button.disabled = false; });
                return scene(template.innerHTML, '', 'grid', { focusSelector: '.bst-preview-subject' + (enabled ? ', [data-grid-menu]' : '') });
            }
            case 'showDownloadDetailsInDiscoveryPages': {
                const request = realRequests(samples).find(function (item) { return item.statusLabel || item.mediaStatusLabel; });
                if (!request || !plugin) return scene(exampleCard(plugin));
                settings.ShowDownloadDetailsInDiscoveryPages = enabled;
                const template = document.createElement('template');
                template.innerHTML = cards(plugin, withItems(context, [requestItem(request)]), { discoveryPage: true, interactive: true });
                template.content.querySelectorAll('.seerrfin-discover-download-details').forEach(function (slot) { slot.innerHTML = plugin.renderDiscoveryDownloadDetails(request); });
                return scene(template.innerHTML);
            }
            case 'qualityRecommendations':
            case 'advTvSeasonPickerEnabled':
            case 'advIncludeSpecialsSeason':
            case 'advRequireExplicitSeasonSelection':
            case 'advShowRequest4kButton':
            case 'advShowRootFolderSelector': return modalScene(id, enabled, plugin, context);
            case 'advDiscoverRowFocusScale':
            case 'advBrowseCarouselFocusScale': {
                if (plugin) {
                    plugin._advancedSettings.carousel = plugin._advancedSettings.carousel || {};
                    const key = id === 'advDiscoverRowFocusScale' ? 'discoverRowFocusScale' : 'browseCarouselFocusScale';
                    plugin._advancedSettings.carousel[key] = enabled;
                }
                const template = document.createElement('template');
                template.innerHTML = '<div class="bst-preview-focus' + (enabled ? ' is-focused' : '') + '">' +
                    (id === 'advBrowseCarouselFocusScale' ? box(plugin, context, 'provider') : cards(plugin, context)) + '</div>';
                const firstCard = template.content.querySelector('.card');
                if (enabled && firstCard) firstCard.classList.add('show-animation');
                return scene(template.innerHTML, '', 'cards', { focusSelector: '.card:first-child > .cardBox' });
            }
            case 'advRequestsCardsInteractive':
            case 'advRequestsCardsIncludeMetaText': {
                const request = realRequests(samples)[0];
                if (!request || !window.seerrFinRequestsPreview) return scene(exampleCard(plugin));
                const advanced = plugin && plugin._advancedSettings.requests || {};
                return scene(requestPreview(plugin, request, {
                    cardsInteractive: id === 'advRequestsCardsInteractive' ? enabled : advanced.cardsInteractive === true,
                    cardsIncludeMetaText: id === 'advRequestsCardsIncludeMetaText' ? enabled : advanced.cardsIncludeMetaText === true
                }), request.title, 'requests', { focusSelector: '.seerrfin-request-card-slot .card:first-child' });
            }
            case 'advLbRequestCardsInteractive':
            case 'advLbRequestCardsIncludeMetaText': {
                const advanced = plugin && plugin._advancedSettings.letterboxd || {};
                const template = document.createElement('template');
                template.innerHTML = cards(plugin, withMediaType(context, 'movie'), { nativeCards: false, letterboxdSlot: true, forGrid: true,
                    interactive: id === 'advLbRequestCardsInteractive' ? enabled : advanced.requestCardsInteractive === true,
                    includeMetaText: id === 'advLbRequestCardsIncludeMetaText' ? enabled : advanced.requestCardsIncludeMetaText !== false });
                template.content.querySelectorAll('.seerrfin-request-card-actions').forEach(function (element) { element.remove(); });
                return scene(template.innerHTML);
            }
            case 'bstCustomizeDuotone': {
                const key = context.customizeKey || 'streamingService';
                const configKeys = { streamingService: 'StreamingService', studioNetwork: 'StudioNetwork', genreBackdrop: 'GenreBackdrop', discoverBackdrop: 'DiscoverBackdrop' };
                settings.DisplayCustomizations = settings.DisplayCustomizations || {};
                settings.DisplayCustomizations[configKeys[key]] = Object.assign({}, settings.DisplayCustomizations[configKeys[key]], {
                    DuotoneEnabled: enabled,
                    DuotoneLight: String(value(context, 'bstCustomizeDuotoneLight', '#ffffff')).replace('#', ''),
                    DuotoneDark: String(value(context, 'bstCustomizeDuotoneDark', '#969696')).replace('#', '')
                });
                const prerequisite = { streamingService: 'StreamingServiceUseImages', studioNetwork: 'StudioNetworkUseImages', genreBackdrop: 'GenreUseBackdrops', discoverBackdrop: 'DiscoverUsePosters' };
                settings[prerequisite[key]] = key !== 'discoverBackdrop';
                if (key === 'discoverBackdrop') {
                    const items = (samples.movies || []).filter(function (item) { return plugin && plugin.getProviderId(item, 'TmdbBackdropPath'); });
                    return scene(items.length ? cards(plugin, withItems(context, items)) : exampleCard(plugin));
                }
                return scene(box(plugin, context, key === 'streamingService' ? 'provider' : key === 'studioNetwork' ? 'studio' : 'genre'));
            }
        }
        return scene(exampleCard(plugin));
    }

    function render(input, enabled, context) {
        let result = renderScene(input, enabled, context);
        if (!result) { return result; }
        const counterpart = renderScene(input, !enabled, context);
        if (counterpart && counterpart.html === result.html && !result.html.includes('data-bst-preview-example')) {
            result = scene(exampleCard(renderer(context)));
        }
        if (result.html.includes('data-bst-preview-example') && (context.samples?.baseReady === false || (input.hasAttribute('data-rating-source') || input.id === 'useStarForRatings') && context.samples?.qualitiesReady === false)) {
            result.pending = true;
        }

        const card = '.bst-preview-subject';
        const box = card + ' > .cardBox';
        const artwork = card + ' .cardScalable';
        const text = card + ' .cardText';
        const effects = {
            streamingServiceUseImages: artwork + ', ' + text,
            studioNetworkUseImages: artwork + ', ' + text,
            genreUseBackdrops: artwork + ', ' + text,
            discoverUsePosters: artwork,
            nativeCarousels: box,
            nativeSearchResults: '.sectionTitle, ' + box,
            nativeGridPages: box + (enabled ? ', [data-grid-menu]' : ''),
            showDownloadDetailsInDiscoveryPages: enabled ? card + ' .seerrfin-discover-download-details > *' : card + ' .discover-requestbutton',
            useStarForRatings: card + ' [data-seerrfin-card-ratings]',
            qualityRecommendations: enabled ? '.bst-sidebar-lines--qualities' : '[data-quality-slot] .bst-sidebar-lines:not(.bst-sidebar-lines--qualities)',
            advDiscoverRowFocusScale: box,
            advBrowseCarouselFocusScale: box,
            advRequestsCardsInteractive: enabled ? card + ' .discover-requestbutton' : artwork,
            advLbRequestCardsInteractive: enabled ? card + ' .discover-requestbutton' : artwork,
            advRequestsCardsIncludeMetaText: enabled ? text : artwork,
            advLbRequestCardsIncludeMetaText: enabled ? text : artwork,
            advTvSeasonPickerEnabled: '.bst-quality-header h3, .bst-season-select-all, .bst-season-select-all + .bst-season-option, .bst-quality-option:first-child',
            advIncludeSpecialsSeason: enabled ? '.bst-season-option:has(.bst-season-row-input[value="0"])' : '.bst-season-option:not(.bst-season-select-all)',
            advRequireExplicitSeasonSelection: '.bst-preview-season-choice, .bst-quality-continue',
            advShowRequest4kButton: REQUEST_ACTIONS,
            advShowRootFolderSelector: '.bst-root-folder-field, .bst-quality-continue',
            bstCustomizeDuotone: artwork
        };

        result.effectSelector = input.hasAttribute('data-rating-source') ? card + ' [data-seerrfin-card-ratings]' : effects[input.id];
        if (input.id === 'advIncludeSpecialsSeason' && !enabled) { result.effectFirst = true; }
        result.hover = enabled && ['advRequestsCardsInteractive', 'advLbRequestCardsInteractive'].includes(input.id) || input.id === 'showDownloadDetailsInDiscoveryPages';
        if (['advDiscoverRowFocusScale', 'advBrowseCarouselFocusScale', 'advRequestsCardsInteractive', 'advLbRequestCardsInteractive', 'showDownloadDetailsInDiscoveryPages'].includes(input.id)) {
            result.cursorSelector = '.bst-preview-subject .cardScalable';
        }
        return result;
    }

    window.seerrFinPreviewScenes = { supports: supports, render: render };
})();
