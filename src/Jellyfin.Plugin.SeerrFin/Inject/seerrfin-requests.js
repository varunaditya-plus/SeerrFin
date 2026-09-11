'use strict';

window.seerrFinLog = window.seerrFinLog || {
    info: function (msg) {
        console.log('SF • ' + msg);
    },
    warn: function (msg, detail) {
        if (detail !== undefined) {
            console.warn('SF • ' + msg, detail);
        } else {
            console.warn('SF • ' + msg);
        }
    },
    error: function (msg, detail) {
        if (detail !== undefined) {
            console.error('SF • ' + msg, detail);
        } else {
            console.error('SF • ' + msg);
        }
    }
};

(function () {
    if (window.__seerrFinRequestsInit) {
        return;
    }
    window.__seerrFinRequestsInit = true;

    const log = window.seerrFinLog;
    const DEFAULT_PAGE_SIZE = 20;
    const SEERR_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="1.45em" height="1.45em" viewBox="0 0 96 96" fill="none"><circle cx="52" cy="52" r="28" fill="#131928"/><path fill-rule="evenodd" clip-rule="evenodd" d="M48 96C74.5097 96 96 74.5097 96 48C96 21.4903 74.5097 0 48 0C21.4903 0 0 21.4903 0 48C0 74.5097 21.4903 96 48 96ZM80.0001 52C80.0001 67.464 67.4641 80 52.0001 80C36.5361 80 24.0001 67.464 24.0001 52C24.0001 49.1303 24.4318 46.3615 25.2338 43.7548C27.4288 48.6165 32.3194 52 38.0001 52C45.7321 52 52.0001 45.732 52.0001 38C52.0001 32.3192 48.6166 27.4287 43.755 25.2337C46.3616 24.4317 49.1304 24 52.0001 24C67.4641 24 80.0001 36.536 80.0001 52Z" fill="url(#bst-seerr-grad0)"/><path opacity="0.2" fill-rule="evenodd" clip-rule="evenodd" d="M80.0002 52C80.0002 67.464 67.4642 80 52.0002 80C36.864 80 24.5329 67.9897 24.017 52.9791C24.0057 53.318 24 53.6583 24 54C24 70.5685 37.4315 84 54 84C70.5685 84 84 70.5685 84 54C84 37.4315 70.5685 24 54 24C53.6597 24 53.3207 24.0057 52.9831 24.0169C67.9919 24.5347 80.0002 36.865 80.0002 52Z" fill="#131928"/><path fill-rule="evenodd" clip-rule="evenodd" d="M48 12C28.1177 12 12 28.1177 12 48C12 50.2091 10.2091 52 8 52C5.79086 52 4 50.2091 4 48C4 23.6995 23.6995 4 48 4C50.2091 4 52 5.79086 52 8C52 10.2091 50.2091 12 48 12Z" fill="url(#bst-seerr-grad1)"/><defs><linearGradient id="bst-seerr-grad0" x1="48" y1="-2.07126e-06" x2="117.5" y2="69.5" gradientUnits="userSpaceOnUse"><stop stop-color="#C395FC"/><stop offset="1" stop-color="#4F65F5"/></linearGradient><linearGradient id="bst-seerr-grad1" x1="28" y1="8" x2="28" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.4"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs></svg>';
    const RADARR_LOGO = '<svg width="1.45em" height="1.45em" viewBox="0 0 1024 1024" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg"><g id="Simple-Logo-Light"><g id="Group-Copy" transform="translate(70 21.00012)"><path d="M105.302 154.943L112.824 869.492C52.651 877.014 7.52158 846.927 7.52158 786.755L0 192.55C0 4.51106 172.996 -40.6184 278.298 34.5974L812.33 342.982C887.546 395.633 902.589 493.413 864.981 561.107C857.46 508.456 834.895 478.37 789.765 448.284L188.039 109.813C142.91 79.7268 105.302 87.2484 105.302 154.943Z" id="Shape" fill="#24292E" stroke="none" /><path d="M0 376.079C45.1295 391.122 90.259 383.6 127.867 361.036L744.636 0C782.244 52.651 774.723 105.302 729.593 135.388L210.604 436.251C135.388 473.859 37.6079 436.251 0 376.079Z" transform="translate(60.17249 531.0214)" id="Shape" fill="#24292E" stroke="none" /><path d="M0 413.687L368.557 203.083L7.52157 0L0 413.687Z" transform="translate(240.6902 282.8092)" id="Shape" fill="#FFC230" stroke="none" /></g></g></svg>';
    const SONARR_LOGO = '<svg height="1.45em" viewBox="0 0 216.7 216.9" width="1.45em" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M216.7 108.45c0 29.833-10.533 55.4-31.6 76.7-.7.833-1.483 1.6-2.35 2.3-3.466 3.4-7.133 6.484-11 9.25-18.267 13.467-39.367 20.2-63.3 20.2-23.967 0-45.033-6.733-63.2-20.2-4.8-3.4-9.3-7.25-13.5-11.55-16.367-16.266-26.417-35.167-30.15-56.7-.733-4.2-1.217-8.467-1.45-12.8-.1-2.4-.15-4.8-.15-7.2 0-2.533.05-4.95.15-7.25 0-.233.066-.467.2-.7 1.567-26.6 12.033-49.583 31.4-68.95C53.05 10.517 78.617 0 108.45 0c29.933 0 55.484 10.517 76.65 31.55 21.067 21.433 31.6 47.067 31.6 76.9z" fill="#EEE" fill-rule="evenodd"/><path clip-rule="evenodd" d="M194.65 42.5l-22.4 22.4C159.152 77.998 158 89.4 158 109.5c0 17.934 2.852 34.352 16.2 47.7 9.746 9.746 19 18.95 19 18.95-2.5 3.067-5.2 6.067-8.1 9-.7.833-1.483 1.6-2.35 2.3-2.533 2.5-5.167 4.817-7.9 6.95l-17.55-17.55c-15.598-15.6-27.996-17.1-48.6-17.1-19.77 0-33.223 1.822-47.7 16.3-8.647 8.647-18.55 18.6-18.55 18.6-3.767-2.867-7.333-6.034-10.7-9.5-2.8-2.8-5.417-5.667-7.85-8.6 0 0 9.798-9.848 19.15-19.2 13.852-13.853 16.1-29.916 16.1-47.85 0-17.5-2.874-33.823-15.6-46.55-8.835-8.836-21.05-21-21.05-21 2.833-3.6 5.917-7.067 9.25-10.4 2.934-2.867 5.934-5.55 9-8.05L61.1 43.85C74.102 56.852 90.767 60.2 108.7 60.2c18.467 0 35.077-3.577 48.6-17.1 8.32-8.32 19.3-19.25 19.3-19.25 2.9 2.367 5.733 4.933 8.5 7.7 3.467 3.533 6.65 7.183 9.55 10.95z" fill="#3A3F51" fill-rule="evenodd"/><g clip-rule="evenodd"><path d="M78.7 114c-.2-1.167-.332-2.35-.4-3.55-.032-.667-.05-1.333-.05-2 0-.7.018-1.367.05-2 0-.067.018-.133.05-.2.435-7.367 3.334-13.733 8.7-19.1 5.9-5.833 12.984-8.75 21.25-8.75 8.3 0 15.384 2.917 21.25 8.75 5.834 5.934 8.75 13.033 8.75 21.3 0 8.267-2.916 15.35-8.75 21.25-.2.233-.416.45-.65.65-.966.933-1.982 1.783-3.05 2.55-5.065 3.733-10.916 5.6-17.55 5.6s-12.466-1.866-17.5-5.6c-1.332-.934-2.582-2-3.75-3.2-4.532-4.5-7.316-9.734-8.35-15.7z" fill="#0CF" fill-rule="evenodd"/><path d="M157.8 59.75l-15 14.65M30.785 32.526L71.65 73.25m84.6 84.25l27.808 28.78m1.855-153.894L157.8 59.75m-125.45 126l27.35-27.4" fill="none" stroke="#0CF" stroke-miterlimit="1" stroke-width="2"/><path d="M157.8 59.75l-16.95 17.2M58.97 60.604l17.2 17.15M59.623 158.43l16.75-17.4m61.928-1.396l18.028 17.945" fill="none" stroke="#0CF" stroke-miterlimit="1" stroke-width="7"/></g></svg>';
    const FILTERS = [
        { id: 'all', label: 'All' },
        { id: 'pending', label: 'Pending Approval' },
        { id: 'processing', label: 'Processing' },
        { id: 'comingsoon', label: 'Coming Soon' },
        { id: 'available', label: 'Available' }
    ];

    const state = {
        pageRequests: [],
        totalPages: 1,
        page: 1,
        filter: 'all',
        loadId: 0,
        isLoading: false,
        reloadResultTimer: null,
        autoRefreshTimer: null,
        lastAutoRefreshAt: 0,
        clientSettings: null
    };

    const AUTO_REFRESH_DEBOUNCE_MS = 1000;
    const DEFAULT_AUTO_REFRESH_INTERVAL_SECONDS = 10;

    function loadClientSettings() {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/client-settings'),
            type: 'GET',
            dataType: 'json'
        }).then(function (config) {
            const radarrInstances = Array.isArray(config.radarrInstances) ? config.radarrInstances : [];
            const sonarrInstances = Array.isArray(config.sonarrInstances) ? config.sonarrInstances : [];
            state.clientSettings = {
                jellyseerrBrowseUrl: (config.jellyseerrBrowseUrl || '').replace(/\/+$/, ''),
                hasRadarr: config.hasRadarr === true || radarrInstances.length > 0 || !!config.radarrUrl,
                hasSonarr: config.hasSonarr === true || sonarrInstances.length > 0 || !!config.sonarrUrl,
                radarrUrl: ((config.radarrUrl || (radarrInstances[0] && radarrInstances[0].url)) || '').replace(/\/+$/, ''),
                sonarrUrl: ((config.sonarrUrl || (sonarrInstances[0] && sonarrInstances[0].url)) || '').replace(/\/+$/, ''),
                radarrInstances: radarrInstances,
                sonarrInstances: sonarrInstances
            };
        }).catch(function (err) {
            log.warn('client settings fetch failed', err);
            state.clientSettings = {
                jellyseerrBrowseUrl: '',
                hasRadarr: false,
                hasSonarr: false,
                radarrUrl: '',
                sonarrUrl: '',
                radarrInstances: [],
                sonarrInstances: []
            };
        });
    }

    function openJellyseerrManage(tmdbId, mediaType) {
        if (!tmdbId || !mediaType) {
            return;
        }

        const openWithBase = function (base) {
            if (!base) {
                return;
            }

            const segment = mediaType === 'tv' ? 'tv' : 'movie';
            window.open(base + '/' + segment + '/' + tmdbId + '?manage=1', '_blank', 'noopener,noreferrer');
        };

        if (state.clientSettings?.jellyseerrBrowseUrl) {
            openWithBase(state.clientSettings.jellyseerrBrowseUrl);
            return;
        }

        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/client-settings'),
            type: 'GET',
            dataType: 'json'
        }).then(function (config) {
            openWithBase((config.jellyseerrBrowseUrl || '').replace(/\/+$/, ''));
        }).catch(function (err) {
            log.warn('Jellyseerr browse URL fetch failed', err);
        });
    }

    function openServarrUrl(url) {
        if (!url) {
            return;
        }

        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function getPreferredServarrInstanceUrl(instances, prefer4k) {
        const list = Array.isArray(instances) ? instances : [];
        if (!list.length) {
            return '';
        }

        const preferred = typeof prefer4k === 'boolean'
            ? list.filter(function (instance) {
                return prefer4k ? instance.is4k === true : instance.is4k !== true;
            })
            : list;
        const pool = preferred.length > 0 ? preferred : list;
        const selected = pool.find(function (instance) {
            return instance.isDefault === true && String(instance.url || '').trim() !== '';
        }) || pool.find(function (instance) {
            return String(instance.url || '').trim() !== '';
        }) || null;

        return selected ? String(selected.url || '').replace(/\/+$/, '') : '';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function getPlugin() {
        return window.seerrFinPlugin || null;
    }

    function getRequestsAdvanced() {
        const plugin = getPlugin();
        const advanced = plugin && plugin._displaySettings && plugin._displaySettings.Advanced;
        return (advanced && advanced.requests) || {};
    }

    function getPageSize() {
        return Number(getRequestsAdvanced().pageSize) || DEFAULT_PAGE_SIZE;
    }

    function getRefreshSettings() {
        const settings = getRequestsAdvanced();
        const rawInterval = settings.autoRefreshIntervalSeconds;
        let intervalSeconds = DEFAULT_AUTO_REFRESH_INTERVAL_SECONDS;
        if (rawInterval === 0 || rawInterval === '0') {
            intervalSeconds = 0;
        } else if (rawInterval !== undefined && rawInterval !== null && rawInterval !== '') {
            const parsed = Number(rawInterval);
            if (!isNaN(parsed)) {
                intervalSeconds = Math.max(0, Math.min(3600, parsed));
            }
        }

        return {
            intervalSeconds: intervalSeconds,
            onVisibility: settings.refreshOnVisibility !== false,
            onTabShow: settings.refreshOnTabShow !== false
        };
    }

    function getCardOptions() {
        const settings = getRequestsAdvanced();
        return {
            interactive: settings.cardsInteractive === true,
            includeMetaText: settings.cardsIncludeMetaText === true
        };
    }

    function findActiveContainer() {
        const all = document.querySelectorAll('.seerrfin-requests-sections');
        for (let i = all.length - 1; i >= 0; i--) {
            const container = all[i];
            if (!container.isConnected) {
                continue;
            }

            const page = container.closest('.page');
            if (page && page.classList.contains('hide')) {
                continue;
            }

            const tabPanel = container.closest('.tabContent, .pageTabContent');
            if (tabPanel && tabPanel.classList.contains('hide')) {
                continue;
            }

            if (container.offsetParent !== null) {
                return container;
            }
        }
        return null;
    }

    function formatRelativeDate(dateStr) {
        if (!dateStr) {
            return '';
        }

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return '';
        }

        const diff = Date.now() - date.getTime();
        if (diff < 0) {
            return '';
        }

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) {
            return 'just now';
        }
        if (minutes < 60) {
            return minutes + 'm ago';
        }
        if (hours < 24) {
            return hours + 'h ago';
        }
        if (days < 30) {
            return days + 'd ago';
        }

        return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function chipClassForStatus(label) {
        const normalized = (label || '').toLowerCase();
        if (normalized.includes('available') && !normalized.includes('partially')) {
            return 'seerrfin-request-chip--available';
        }
        if (normalized.includes('partially')) {
            return 'seerrfin-request-chip--partial';
        }
        if (normalized.includes('processing')) {
            return 'seerrfin-request-chip--processing';
        }
        if (normalized.includes('pending')) {
            return 'seerrfin-request-chip--pending';
        }
        if (normalized.includes('approved')) {
            return 'seerrfin-request-chip--approved';
        }
        if (normalized.includes('declined') || normalized.includes('failed')) {
            return 'seerrfin-request-chip--declined';
        }
        return '';
    }

    function getAvatarUrl(avatarPath) {
        if (!avatarPath) {
            return '';
        }

        return ApiClient.getUrl('SeerrFin/proxy/avatar', {
            path: avatarPath,
            ApiKey: ApiClient.accessToken()
        });
    }

    function isPlayableRequest(item) {
        const label = (item.mediaStatusLabel || '').toLowerCase();
        return (label === 'available' || label === 'partially available') && item.jellyfinItemId;
    }

    function navigateToJellyfinItem(itemId) {
        if (!itemId || typeof ApiClient === 'undefined') {
            return;
        }

        function openDetails(id, item) {
            window.Emby.Page.showItem(item || { Id: id, ServerId: ApiClient.serverId() });
        }

        ApiClient.getItem(ApiClient.getCurrentUserId(), itemId)
            .then(function (item) {
                openDetails(itemId, item);
            })
            .catch(function (err) {
                log.warn('Jellyfin item lookup failed for ' + itemId, err);
                openDetails(itemId);
            });
    }

    function openRequestModal(tmdbId, mediaType) {
        if (!tmdbId || !mediaType) {
            return;
        }

        if (window.seerrFinModal && typeof window.seerrFinModal.open === 'function') {
            window.seerrFinModal.open(tmdbId, mediaType);
        }
    }

    function getServarrOpenUrl(item) {
        const progress = getServarrProgress(item);
        if (progress?.openUrl) {
            return progress.openUrl;
        }

        const mediaType = item.type === 'tv' ? 'tv' : 'movie';
        const instances = mediaType === 'tv'
            ? state.clientSettings?.sonarrInstances
            : state.clientSettings?.radarrInstances;
        const base = getPreferredServarrInstanceUrl(
            instances,
            mediaType === 'movie' ? item.is4k === true : undefined
        ) || (mediaType === 'tv'
            ? state.clientSettings?.sonarrUrl
            : state.clientSettings?.radarrUrl);
        if (!base || !item.tmdbId) {
            return '';
        }

        return base + '/add/new?term=tmdb:' + item.tmdbId;
    }

    function renderCardActions(item) {
        if (!item.tmdbId) {
            return;
        }

        const titleText = item.title || 'content';
        const safeTitle = escapeHtml(titleText);
        const mediaType = item.type === 'tv' ? 'tv' : 'movie';
        const safeTmdbId = escapeHtml(String(item.tmdbId));
        const safeMediaType = escapeHtml(mediaType);
        const progress = getServarrProgress(item);
        const instanceSuffixText = progress?.instanceName ? ` (${progress.instanceName})` : '';
        const radarrTitleText = `Open ${titleText} in Radarr${instanceSuffixText}`;
        const sonarrTitleText = `Open ${titleText} in Sonarr${instanceSuffixText}`;
        const radarrTooltipText = `Open in Radarr${instanceSuffixText}`;
        const sonarrTooltipText = `Open in Sonarr${instanceSuffixText}`;

        const playBtn = isPlayableRequest(item) ? `
            <button type="button" class="seerrfin-request-action-btn seerrfin-request-play-btn"
                data-jellyfin-item-id="${escapeHtml(String(item.jellyfinItemId))}"
                aria-label="Open ${safeTitle} in Jellyfin" title="Open in Jellyfin">
                <span class="material-icons" aria-hidden="true">play_arrow</span>
            </button>` : '';

        let radarrBtn = '';
        if (mediaType === 'movie' && (state.clientSettings?.hasRadarr || state.clientSettings?.radarrUrl)) {
            const radarrUrl = getServarrOpenUrl(item);
            if (radarrUrl) {
                radarrBtn = `
            <button type="button" class="seerrfin-request-action-btn seerrfin-request-radarr-btn"
                data-open-url="${escapeHtml(radarrUrl)}"
                aria-label="${escapeHtml(radarrTitleText)}" title="${escapeHtml(radarrTooltipText)}">
                ${RADARR_LOGO}
            </button>`;
            }
        }

        let sonarrBtn = '';
        if (mediaType === 'tv' && (state.clientSettings?.hasSonarr || state.clientSettings?.sonarrUrl)) {
            const sonarrUrl = getServarrOpenUrl(item);
            if (sonarrUrl) {
                sonarrBtn = `
            <button type="button" class="seerrfin-request-action-btn seerrfin-request-sonarr-btn"
                data-open-url="${escapeHtml(sonarrUrl)}"
                aria-label="${escapeHtml(sonarrTitleText)}" title="${escapeHtml(sonarrTooltipText)}">
                ${SONARR_LOGO}
            </button>`;
            }
        }

        return `
            <div class="seerrfin-request-card-actions">
                ${playBtn}
                <button type="button" class="seerrfin-request-action-btn seerrfin-request-modal-btn"
                    data-tmdb-id="${safeTmdbId}" data-media-type="${safeMediaType}"
                    aria-label="View request details for ${safeTitle}" title="Request details">
                    <span class="material-icons" aria-hidden="true">download</span>
                </button>
                <button type="button" class="seerrfin-request-action-btn seerrfin-request-seerr-btn"
                    data-tmdb-id="${safeTmdbId}" data-media-type="${safeMediaType}"
                    aria-label="Open ${safeTitle} in Seerr" title="Open in Seerr">
                    ${SEERR_LOGO}
                </button>
                ${radarrBtn}
                ${sonarrBtn}
            </div>`;
    }

    function mapRequestToDiscoverItem(item) {
        const mediaType = item.type === 'tv' ? 'tv' : 'movie';
        const providerIds = {};

        if (item.tmdbId) {
            providerIds.Tmdb = String(item.tmdbId);
        }
        if (item.posterPath) {
            providerIds.TmdbPosterPath = item.posterPath;
        }
        if (item.backdropPath) {
            providerIds.TmdbBackdropPath = item.backdropPath;
        }
        if (item.posterUrl) {
            providerIds.JellyseerrPoster = item.posterUrl;
        }
        if (item.backdropUrl) {
            providerIds.JellyseerrBackdrop = item.backdropUrl;
        }

        return {
            Id: item.tmdbId,
            id: item.tmdbId,
            Name: item.title,
            name: item.title,
            mediaType: mediaType,
            SourceType: mediaType,
            PremiereDate: item.year ? item.year + '-01-01' : null,
            ProviderIds: providerIds
        };
    }

    function renderDiscoverCard(item) {
        const plugin = getPlugin();
        if (!plugin || !item.tmdbId || typeof plugin.createDiscoverCards !== 'function') {
            return;
        }

        return plugin.createDiscoverCards([mapRequestToDiscoverItem(item)], false, getCardOptions());
    }

    function shouldUseLandscapeCards() {
        const plugin = getPlugin();
        return plugin && typeof plugin.shouldUseBackdropThumbnails === 'function'
            ? plugin.shouldUseBackdropThumbnails()
            : false;
    }

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!value || value <= 0) {
            return '0.0 GB';
        }

        return (value / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    function getServarrProgress(item) {
        const raw = item.servarrProgress || item.ServarrProgress;
        const statusKey = raw && (raw.statusKey || raw.StatusKey);
        const mediaFailed = (item.mediaStatusLabel || '').toLowerCase() === 'failed';

        if (!raw || !statusKey) {
            return mediaFailed
                ? { statusKey: 'failed', statusLabel: 'Failed to find content', percent: 100, isActive: false }
                : null;
        }

        return {
            statusKey: statusKey,
            statusLabel: raw.statusLabel || raw.StatusLabel || '',
            percent: raw.percent ?? raw.Percent ?? 0,
            downloadedBytes: raw.downloadedBytes ?? raw.DownloadedBytes ?? 0,
            totalBytes: raw.totalBytes ?? raw.TotalBytes ?? 0,
            isActive: raw.isActive ?? raw.IsActive ?? false,
            instanceName: raw.instanceName || raw.InstanceName || ''
        };
    }

    function renderProgressBlock(item) {
        const progress = getServarrProgress(item);
        if (!progress) {
            return;
        }

        const isFailed = progress.statusKey === 'failed' || (item.mediaStatusLabel || '').toLowerCase() === 'failed';
        const percent = isFailed ? 100 : Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const statusKey = isFailed ? 'failed' : escapeHtml(progress.statusKey);
        const isTransfer = !isFailed && progress.isActive === true && (
            progress.statusKey === 'queued' || progress.statusKey.indexOf('downloaded-') === 0
        );
        const instanceSuffixText = progress.instanceName ? ` · ${progress.instanceName}` : '';

        const percentText = isFailed ? 'Failed' : (isTransfer ? `${percent}%` : '0%');
        const detailBase = isFailed
            ? 'Failed to find content'
            : (isTransfer
                ? `${formatBytes(progress.downloadedBytes)}/${formatBytes(progress.totalBytes)}`
                : (progress.statusLabel || ''));
        const detailText = detailBase + instanceSuffixText;

        return `
            <div class="seerrfin-request-progress" data-status="${statusKey}">
                <div class="seerrfin-request-progress-bar" aria-hidden="true">
                    <div class="seerrfin-request-progress-fill" style="width:${percent}%"></div>
                </div>
                <div class="seerrfin-request-progress-meta">
                    <span class="seerrfin-request-progress-percent">${escapeHtml(percentText)}</span>
                    <span class="seerrfin-request-progress-detail">${escapeHtml(detailText)}</span>
                </div>
            </div>`;
    }

    function renderContentBlock(item, isLandscape) {
        const statusLabel = item.mediaStatusLabel || 'Unknown';
        const safeTitle = escapeHtml(item.title || 'Unknown');
        const timeAgo = item.createdAt ? escapeHtml(formatRelativeDate(item.createdAt)) : '';
        const avatarUrl = getAvatarUrl(item.requestedByAvatar);
        const avatarHtml = avatarUrl
            ? `<img class="seerrfin-request-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" onerror="this.remove()">`
            : '';

        const chips = [
            `<span class="seerrfin-request-chip ${chipClassForStatus(statusLabel)}">${escapeHtml(statusLabel)}</span>`
        ];

        if (item.is4k) {
            chips.push('<span class="seerrfin-request-chip seerrfin-request-chip--4k">4K</span>');
        }

        if (item.type) {
            chips.push(`<span class="seerrfin-request-chip seerrfin-request-chip--type">${escapeHtml(item.type === 'tv' ? 'TV' : 'Movie')}</span>`);
        }

        const yearHtml = item.year ? ` <span class="seerrfin-request-year">(${escapeHtml(String(item.year))})</span>` : '';
        const timeAgoHtml = timeAgo ? ` &bull; <span>${timeAgo}</span>` : '';

        const seasonNumbers = Array.isArray(item.seasonNumbers) ? item.seasonNumbers : [];
        const seasonsHtml = item.type === 'tv' && seasonNumbers.length ? `<div class="seerrfin-request-meta">Requested seasons: <span class="seerrfin-request-meta-light">${escapeHtml(seasonNumbers.join(', '))}</span></div>` : '';

        const progress = getServarrProgress(item);
        const progressSpacerHtml = progress && !isLandscape ? '<div class="seerrfin-request-progress-spacer"></div>' : '';
        const progressHtml = progress ? renderProgressBlock(item) : '';

        return `
            <div class="seerrfin-request-content">
                <div class="seerrfin-request-title">
                    <span title="${safeTitle}">${safeTitle}</span>${yearHtml}
                </div>
                <div class="seerrfin-request-chips">${chips.join('')}</div>
                <div class="seerrfin-request-meta">
                    <span>Requested by</span> ${avatarHtml}
                    <span class="seerrfin-request-meta-light">${escapeHtml(item.requestedBy || 'Unknown')}</span>${timeAgoHtml}
                </div>
                ${seasonsHtml}
                ${progressSpacerHtml}
                ${progressHtml}
            </div>`;
    }

    function renderRequestCard(item) {
        const isLandscape = shouldUseLandscapeCards();
        const layoutClass = isLandscape ? 'seerrfin-request-box--landscape' : 'seerrfin-request-box--portrait';
        const discoverCard = renderDiscoverCard(item);

        if (!discoverCard) {
            return;
        }

        return `
            <article class="seerrfin-request-box ${layoutClass}">
                <div class="seerrfin-request-box-inner">
                    <div class="seerrfin-request-card-slot">${discoverCard}${renderCardActions(item) || ''}</div>
                    ${renderContentBlock(item, isLandscape)}
                </div>
            </article>`;
    }

    function hydrateRequestCards(container) {
        const plugin = getPlugin();
        if (!plugin || !container) {
            return;
        }

        if (typeof plugin.initLazyImages === 'function') {
            plugin.initLazyImages(container);
        }

        if (typeof plugin.hydrateDiscoverBackdropCards === 'function') {
            plugin.hydrateDiscoverBackdropCards(container);
        }
    }

    function matchesFilter(item, filterId) {
        if (filterId === 'all') {
            return true;
        }

        if (filterId === 'comingsoon') {
            return item.isComingSoon === true;
        }

        const label = (item.mediaStatusLabel || '').toLowerCase();

        if (filterId === 'pending') {
            return label.includes('pending');
        }

        const settings = getRequestsAdvanced();

        if (filterId === 'available') {
            if (settings.splitPartiallyAvailableFilter === true) {
                return label === 'available';
            }
            return label.includes('available');
        }

        if (filterId === 'processing') {
            const isProcessing = label === 'processing' || label === 'approved';
            if (settings.includePartialsInProcessingFilter === true) {
                return isProcessing || label === 'partially available';
            }
            return label !== 'partially available' && isProcessing;
        }

        return true;
    }

    function updateFilters(container) {
        container.querySelectorAll('.seerrfin-requests-filter').forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-filter') === state.filter);
        });
    }

    function renderPagination(page, totalPages) {
        return `
            <button type="button" class="raised emby-button seerrfin-requests-prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
            <span class="seerrfin-requests-page-info">Page ${page} of ${totalPages}</span>
            <button type="button" class="raised emby-button seerrfin-requests-next" ${page >= totalPages ? 'disabled' : ''}>Next</button>`;
    }

    function updatePagination(container, totalPages) {
        let pagination = container.querySelector('.seerrfin-requests-pagination');

        if (totalPages <= 1) {
            if (pagination) {
                pagination.remove();
            }
            return;
        }

        if (!pagination) {
            pagination = document.createElement('div');
            pagination.className = 'seerrfin-grid-loadmore seerrfin-requests-pagination padded-left';
            container.appendChild(pagination);
        }

        pagination.innerHTML = renderPagination(state.page, totalPages);
    }

    function renderPage(container) {
        updateFilters(container);

        const body = container.querySelector('.seerrfin-requests-body');
        if (!body) {
            return;
        }

        if (!state.pageRequests.length) {
            body.innerHTML = `<div class="seerrfin-empty-row padded-left">No requests found.</div>`;
            updatePagination(container, state.totalPages);
            return;
        }

        const cards = state.pageRequests.map(renderRequestCard).filter(Boolean).join('');
        if (!cards) {
            body.innerHTML = `<div class="seerrfin-empty-row padded-left">No requests found.</div>`;
            updatePagination(container, state.totalPages);
            return;
        }

        const gridClass = shouldUseLandscapeCards()
            ? ' seerrfin-requests-grid--landscape'
            : ' seerrfin-requests-grid--portrait';

        body.innerHTML = `
            <div class="seerrfin-requests-grid${gridClass} padded-left padded-right">${cards}</div>`;

        hydrateRequestCards(body);
        updatePagination(container, state.totalPages);
    }

    function fetchRequestsPage() {
        const pageSize = getPageSize();
        const params = {
            take: pageSize,
            skip: (state.page - 1) * pageSize
        };

        if (state.filter && state.filter !== 'all') {
            params.filter = state.filter;
        }

        return fetch(ApiClient.getUrl('SeerrFin/requests', params), {
            headers: { Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        });
    }

    function setReloadButtonState(container, mode) {
        const reloadBtn = container && container.querySelector('.seerrfin-requests-reload');
        if (!reloadBtn) {
            return;
        }

        if (state.reloadResultTimer) {
            clearTimeout(state.reloadResultTimer);
            state.reloadResultTimer = null;
        }

        const icon = reloadBtn.querySelector('.material-icons');
        reloadBtn.classList.remove('is-loading', 'is-success', 'is-error');

        if (mode === 'loading') {
            reloadBtn.disabled = true;
            reloadBtn.classList.add('is-loading');
            reloadBtn.setAttribute('aria-busy', 'true');
            if (icon) {
                icon.textContent = 'refresh';
            }
            return;
        }

        if (mode === 'success' || mode === 'error') {
            reloadBtn.disabled = true;
            reloadBtn.classList.add(mode === 'success' ? 'is-success' : 'is-error');
            reloadBtn.setAttribute('aria-busy', 'false');
            if (icon) {
                icon.textContent = mode === 'success' ? 'check' : 'close';
            }
            state.reloadResultTimer = setTimeout(function () {
                state.reloadResultTimer = null;
                setReloadButtonState(container, 'idle');
            }, 2000);
            return;
        }

        reloadBtn.disabled = false;
        reloadBtn.setAttribute('aria-busy', 'false');
        if (icon) {
            icon.textContent = 'refresh';
        }
    }

    function loadRequests(container, options) {
        if (!container) {
            return;
        }

        options = options || {};
        const keepVisible = options.keepVisible === true;

        if (keepVisible && state.isLoading) {
            return;
        }

        const loadId = ++state.loadId;
        state.isLoading = true;
        setReloadButtonState(container, 'loading');

        const body = container.querySelector('.seerrfin-requests-body');
        // Refresh keeps current cards on screen; only initial/filter/page loads show Loading...
        if (body && !keepVisible) {
            body.innerHTML = `<div class="seerrfin-loading-row padded-left">Loading...</div>`;
        }

        log.info('loading requests tab (page ' + state.page + ', filter ' + state.filter + ')');
        fetchRequestsPage()
            .then(function (data) {
                if (loadId !== state.loadId || !container.isConnected) {
                    return;
                }

                state.pageRequests = (data.requests || []).filter(function (item) {
                    return matchesFilter(item, state.filter);
                });
                state.totalPages = Math.max(1, Number(data.totalPages) || 1);
                if (state.page > state.totalPages) {
                    state.page = state.totalPages;
                }

                log.info('requests loaded (' + state.pageRequests.length + ' on page, ' + state.totalPages + ' pages)');
                renderPage(container);
                setReloadButtonState(container, keepVisible ? 'success' : 'idle');
            })
            .catch(function (err) {
                log.error('requests ' + (keepVisible ? 'refresh' : 'load') + ' failed (page ' + state.page + ', filter ' + state.filter + ')', err);

                if (loadId !== state.loadId || !container.isConnected) {
                    return;
                }

                if (keepVisible) {
                    setReloadButtonState(container, 'error');
                    return;
                }

                state.pageRequests = [];
                state.totalPages = 1;
                updateFilters(container);
                updatePagination(container, 1);
                if (body) {
                    body.innerHTML = `<div class="seerrfin-empty-row padded-left">Could not load requests. Check Seerr settings.</div>`;
                }
                setReloadButtonState(container, 'idle');
            })
            .then(function () {
                if (loadId === state.loadId) {
                    state.isLoading = false;
                }
            });
    }

    function stopAutoRefresh() {
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }
    }

    function refreshIfActive(options) {
        options = options || {};
        const reason = options.reason || 'manual';
        const settings = getRefreshSettings();

        if (reason === 'interval' && settings.intervalSeconds <= 0) {
            return;
        }
        if (reason === 'visibility' && !settings.onVisibility) {
            return;
        }
        if (reason === 'tab' && !settings.onTabShow) {
            return;
        }

        const container = findActiveContainer();
        if (!container || !container.querySelector('.seerrfin-requests-panel')) {
            return;
        }

        const now = Date.now();
        if (reason !== 'manual' && now - state.lastAutoRefreshAt < AUTO_REFRESH_DEBOUNCE_MS) {
            return;
        }
        state.lastAutoRefreshAt = now;

        loadRequests(container, { keepVisible: true });
    }

    function startAutoRefresh() {
        stopAutoRefresh();

        if (document.hidden) {
            return;
        }

        const container = findActiveContainer();
        if (!container || !container.querySelector('.seerrfin-requests-panel')) {
            return;
        }

        const settings = getRefreshSettings();
        if (settings.intervalSeconds <= 0) {
            return;
        }

        state.autoRefreshTimer = setInterval(function () {
            if (!findActiveContainer()) {
                stopAutoRefresh();
                return;
            }
            refreshIfActive({ reason: 'interval' });
        }, settings.intervalSeconds * 1000);
    }

    function renderRequestsPanel() {
        const filterButtons = FILTERS.map(function (filter) {
            const activeClass = state.filter === filter.id ? ' is-active' : '';
            return `
                <button type="button" class="seerrfin-requests-filter${activeClass}" data-filter="${filter.id}">
                    ${escapeHtml(filter.label)}
                </button>`;
        }).join('');

        return `
            <div class="verticalSection seerrfin-requests-panel">
                <div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">
                    <h2 class="sectionTitle sectionTitle-cards">Requests</h2>
                    <button type="button" class="seerrfin-requests-reload" aria-label="Reload requests" title="Reload requests">
                        <span class="material-icons" aria-hidden="true">refresh</span>
                    </button>
                </div>
                <div class="seerrfin-requests-filters padded-left padded-right">
                    ${filterButtons}
                </div>
            </div>
            <div class="seerrfin-requests-body"></div>`;
    }

    function mount(container) {
        if (container.querySelector('.seerrfin-requests-panel')) {
            return;
        }

        log.info('adding requests panel');
        container.innerHTML = renderRequestsPanel();

        bindContainerEvents(container);

        const plugin = getPlugin();
        const settingsPromise = plugin && typeof plugin.loadDisplaySettings === 'function'
            ? plugin.loadDisplaySettings().catch(function (err) {
                log.warn('requests tab display settings failed', err);
                return null;
            })
            : Promise.resolve();

        settingsPromise.then(function () {
            return loadClientSettings();
        }).then(function () {
            loadRequests(container);
            startAutoRefresh();
        });
    }

    function bindContainerEvents(container) {
        if (container.dataset.seerrfinRequestsBound === 'true') {
            return;
        }
        container.dataset.seerrfinRequestsBound = 'true';

        container.addEventListener('click', function (event) {
            const reloadBtn = event.target.closest('.seerrfin-requests-reload');
            if (reloadBtn) {
                event.preventDefault();
                loadRequests(container, { keepVisible: true });
                return;
            }

            const modalBtn = event.target.closest('.seerrfin-request-modal-btn');
            if (modalBtn) {
                event.preventDefault();
                event.stopPropagation();
                openRequestModal(
                    modalBtn.getAttribute('data-tmdb-id'),
                    modalBtn.getAttribute('data-media-type')
                );
                return;
            }

            const seerrBtn = event.target.closest('.seerrfin-request-seerr-btn');
            if (seerrBtn) {
                event.preventDefault();
                event.stopPropagation();
                openJellyseerrManage(
                    seerrBtn.getAttribute('data-tmdb-id'),
                    seerrBtn.getAttribute('data-media-type')
                );
                return;
            }

            const radarrBtn = event.target.closest('.seerrfin-request-radarr-btn');
            if (radarrBtn) {
                event.preventDefault();
                event.stopPropagation();
                openServarrUrl(radarrBtn.getAttribute('data-open-url'));
                return;
            }

            const sonarrBtn = event.target.closest('.seerrfin-request-sonarr-btn');
            if (sonarrBtn) {
                event.preventDefault();
                event.stopPropagation();
                openServarrUrl(sonarrBtn.getAttribute('data-open-url'));
                return;
            }

            const playBtn = event.target.closest('.seerrfin-request-play-btn');
            if (playBtn) {
                event.preventDefault();
                event.stopPropagation();
                navigateToJellyfinItem(playBtn.getAttribute('data-jellyfin-item-id'));
                return;
            }

            const tab = event.target.closest('.seerrfin-requests-filter');
            if (tab) {
                event.preventDefault();
                const filter = tab.getAttribute('data-filter');
                if (filter && filter !== state.filter) {
                    state.filter = filter;
                    state.page = 1;
                    loadRequests(container);
                }
                return;
            }

            if (event.target.closest('.seerrfin-requests-prev') && state.page > 1) {
                state.page -= 1;
                loadRequests(container);
                return;
            }

            if (event.target.closest('.seerrfin-requests-next') && state.page < state.totalPages) {
                state.page += 1;
                loadRequests(container);
            }
        });
    }

    function ensureMounted(options) {
        options = options || {};
        const container = findActiveContainer();
        if (!container) {
            stopAutoRefresh();
            return;
        }

        const alreadyMounted = !!container.querySelector('.seerrfin-requests-panel');
        if (!alreadyMounted) {
            mount(container);
            return;
        }

        startAutoRefresh();
        if (options.tabShown) {
            refreshIfActive({ reason: 'tab' });
        }
    }

    function onVisibilityChange() {
        if (document.hidden) {
            stopAutoRefresh();
            return;
        }

        startAutoRefresh();
        refreshIfActive({ reason: 'visibility' });
    }

    function init() {
        if (typeof ApiClient === 'undefined' || !getPlugin()) {
            setTimeout(init, 200);
            return;
        }

        log.info('requests module init');
        window.__seerrFinRequestsEnsureMounted = ensureMounted;
        document.addEventListener('viewshow', function () {
            ensureMounted();
        });
        document.addEventListener('visibilitychange', onVisibilityChange);
        ensureMounted();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
