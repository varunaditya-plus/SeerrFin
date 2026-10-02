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
    if (window.__seerrFinLetterboxdInit) {
        return;
    }
    window.__seerrFinLetterboxdInit = true;

    const log = window.seerrFinLog;
    const DEFAULT_USERNAME_PATTERN = '^[a-zA-Z0-9_-]{1,30}$';

    const state = {
        username: '',
        syncMeta: null,
        items: [],
        selectedIds: new Set(),
        requestedIds: new Set(),
        syncing: false,
        syncProgressPercent: 0,
        syncProgressPollTimer: null,
        requesting: false,
        requestProgressAppliedCount: 0,
        requestProgressPollTimer: null,
        bulkRoot: null
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function bindBulkModalEvents() {
        const root = state.bulkRoot;
        if (!root || root.dataset.seerrfinBulkBound === 'true') {
            return;
        }
        root.dataset.seerrfinBulkBound = 'true';

        root.addEventListener('click', function (event) {
            if (event.target.closest('.bst-quality-backdrop') || event.target.closest('.bst-quality-close')) {
                if (!state.requesting) {
                    closeBulkModal();
                }
                return;
            }

            const doneBtn = event.target.closest('[data-bulk-done]');
            if (doneBtn) {
                closeBulkModal();
                return;
            }
        });
    }

    function getPlugin() {
        return window.seerrFinPlugin || null;
    }

    function getLetterboxdAdvanced() {
        const plugin = getPlugin();
        const advanced = plugin && plugin._displaySettings && plugin._displaySettings.Advanced;
        return (advanced && advanced.letterboxd) || {};
    }

    function getUsernamePattern() {
        const pattern = getLetterboxdAdvanced().usernamePattern || DEFAULT_USERNAME_PATTERN;
        try {
            return new RegExp(pattern);
        } catch (err) {
            log.warn('invalid Letterboxd username pattern, using default', err);
            return new RegExp(DEFAULT_USERNAME_PATTERN);
        }
    }

    function getCardOptions() {
        const settings = getLetterboxdAdvanced();
        return {
            interactive: settings.requestCardsInteractive === true,
            includeMetaText: settings.requestCardsIncludeMetaText !== false
        };
    }

    function getDefaultBulkQualityMode() {
        return getLetterboxdAdvanced().defaultBulkQualityMode || 'singleProfile';
    }

    function getAlreadyRequestedMode() {
        return getLetterboxdAdvanced().alreadyRequestedMode || 'prompt';
    }

    function findActiveContainer() {
        const all = document.querySelectorAll('.seerrfin-letterboxd-sections');
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

        return all.length ? all[all.length - 1] : null;
    }

    function formatDate(value) {
        if (!value) {
            return 'Never';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }

        const detectedLocale = window.seerrFinI18n ? window.seerrFinI18n.getLocale() : 'en-US';
        const locale = /^(fr|en)(-|$)/i.test(detectedLocale) ? detectedLocale : 'en-US';
        return date.toLocaleString(locale);
    }

    function getSyncButtonLabel() {
        if (state.syncing) {
            return state.syncProgressPercent + '%';
        }

        return state.items.length > 0 ? 'Refresh watchlist' : 'Get watchlist';
    }

    function updateSyncButton(container) {
        const button = container.querySelector('[data-sync-submit]');
        if (button) {
            button.textContent = getSyncButtonLabel();
        }
    }

    function stopSyncProgressPolling() {
        if (state.syncProgressPollTimer) {
            clearInterval(state.syncProgressPollTimer);
            state.syncProgressPollTimer = null;
        }
    }

    function pollSyncProgress(container) {
        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/letterboxd/sync/progress'),
            type: 'GET',
            dataType: 'json'
        }).then(function (result) {
            const raw = result?.percent ?? result?.Percent ?? 0;
            const percent = typeof raw === 'number' ? raw : parseInt(raw, 10);
            if (Number.isNaN(percent)) {
                return;
            }

            const clamped = Math.max(0, Math.min(100, Math.round(percent)));
            if (clamped !== state.syncProgressPercent) {
                state.syncProgressPercent = clamped;
                updateSyncButton(container);
            }
        }).catch(function (err) {
            log.warn('Letterboxd sync progress poll failed', err);
        });
    }

    function startSyncProgressPolling(container) {
        stopSyncProgressPolling();
        state.syncProgressPercent = 0;
        updateSyncButton(container);
        pollSyncProgress(container);
        state.syncProgressPollTimer = setInterval(function () {
            pollSyncProgress(container);
        }, 400);
    }

    function syncWatchlist(username) {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/letterboxd/sync', { letterboxdUsername: username }),
            type: 'POST',
            dataType: 'json'
        }).then(function (result) {
            state.username = result?.letterboxdUsername || result?.LetterboxdUsername || username;
            state.items = result?.items || result?.Items || [];
            state.syncMeta = {
                resolvedCount: result?.resolvedCount || result?.ResolvedCount || 0,
                unresolvedCount: result?.unresolvedCount || result?.UnresolvedCount || 0,
                lastSynced: new Date().toISOString(),
                lastError: null
            };
            return result;
        });
    }

    function getItemTitle(tmdbId) {
        for (let i = 0; i < state.items.length; i++) {
            if (getTmdbId(state.items[i]) === tmdbId) {
                return state.items[i].Name || state.items[i].name || '';
            }
        }

        return '';
    }

    function stopRequestProgressPolling() {
        if (state.requestProgressPollTimer) {
            clearInterval(state.requestProgressPollTimer);
            state.requestProgressPollTimer = null;
        }
    }

    function setRequestingUi(container, requesting) {
        state.requesting = requesting;

        const input = container.querySelector('#seerrfin-letterboxd-username');
        const syncBtn = container.querySelector('[data-sync-submit]');
        if (input) {
            input.disabled = requesting || state.syncing;
        }
        if (syncBtn) {
            syncBtn.disabled = requesting || state.syncing;
        }

        container.querySelectorAll('[data-select-all], [data-select-none]').forEach(function (button) {
            button.disabled = requesting;
        });

        const actionbar = container.querySelector('.seerrfin-letterboxd-actionbar');
        if (actionbar) {
            actionbar.classList.toggle('seerrfin-letterboxd-disabled', requesting);
        }

        updateSelectionUi(container);
    }

    function getBulkQualityLabel(item) {
        const profileName = item.profileName || item.ProfileName || '';
        const qualityLabel = item.qualityLabel || item.QualityLabel || '';
        if (profileName && qualityLabel && profileName !== qualityLabel) {
            return qualityLabel + ' · ' + profileName;
        }

        return profileName || qualityLabel || '';
    }

    function getBulkStatusLabel(status) {
        if (status === 'requested') {
            return 'Requested';
        }
        if (status === 'skipped') {
            return 'Already requested';
        }
        if (status === 'failed') {
            return 'Failed';
        }

        return 'Waiting';
    }

    function setBulkModalLocked(locked) {
        const closeBtn = state.bulkRoot?.querySelector('.bst-quality-close');
        const backdrop = state.bulkRoot?.querySelector('.bst-quality-backdrop');
        if (closeBtn) {
            closeBtn.disabled = locked;
            closeBtn.style.opacity = locked ? '0.4' : '';
            closeBtn.style.cursor = locked ? 'default' : '';
        }
        if (backdrop) {
            backdrop.style.pointerEvents = locked ? 'none' : '';
        }
    }

    function showBulkRequestProgressPanel(panel, payload) {
        const tmdbIds = payload.TmdbIds || [];
        panel.classList.add('bst-letterboxd-bulk-panel');
        const header = panel.querySelector('.bst-quality-header h3');
        if (header) {
            header.textContent = 'Requesting movies';
        }

        setBulkModalLocked(true);

        let subtitle = '';
        if (payload.QualityMode === 'singleProfile' && payload.ProfileName) {
            subtitle = 'Profile: ' + payload.ProfileName;
        } else if (payload.QualityMode === 'highestAvailable') {
            subtitle = 'Using highest released quality for each movie';
        } else if (payload.QualityMode === 'mostCommon') {
            subtitle = 'Using most common quality for each movie';
        }

        const list = panel.querySelector('.bst-quality-list');
        if (!list) {
            return;
        }

        list.innerHTML = renderBulkProgress(subtitle, tmdbIds);

        const doneBtn = list.querySelector('[data-bulk-done]');
        if (doneBtn) {
            doneBtn.addEventListener('click', closeBulkModal);
        }
    }

    function renderBulkProgress(subtitle, tmdbIds) {
        const subtitleHtml = subtitle ? `<div class="bst-letterboxd-bulk-subtitle">${escapeHtml(subtitle)}</div>` : '';
        const itemsHtml = tmdbIds.map(function (id) {
            return `
                <div class="bst-letterboxd-bulk-item" data-bulk-item data-tmdb-id="${id}">
                    <div class="bst-letterboxd-bulk-item-main">
                        <span class="bst-letterboxd-bulk-item-title">${escapeHtml(getItemTitle(id) || 'Movie')}</span>
                        <span class="bst-letterboxd-bulk-item-quality" data-bulk-quality></span>
                    </div>
                    <span class="bst-letterboxd-bulk-item-status" data-bulk-status>Waiting</span>
                </div>`;
        }).join('');

        return `
            ${subtitleHtml}
            <div class="bst-letterboxd-bulk-progress">
                <div class="bst-letterboxd-bulk-progress-track">
                    <div class="bst-letterboxd-bulk-progress-fill" data-bulk-progress-fill style="width:0%"></div>
                </div>
                <span class="bst-letterboxd-bulk-progress-count" data-bulk-progress-count>0 of ${tmdbIds.length}</span>
            </div>
            <div class="bst-letterboxd-bulk-items" data-bulk-items>${itemsHtml}</div>
            <button type="button" class="bst-quality-option bst-letterboxd-bulk-done" data-bulk-footer data-bulk-done hidden>Done</button>`;
    }

    function updateBulkItemRow(panel, item) {
        const tmdbId = parseInt(item.tmdbId || item.TmdbId, 10);
        if (Number.isNaN(tmdbId)) {
            return;
        }

        const row = panel.querySelector('[data-bulk-item][data-tmdb-id="' + tmdbId + '"]');
        if (!row) {
            return;
        }

        const status = (item.status || item.Status || '').toLowerCase();
        row.classList.remove('is-active');
        row.classList.remove('is-requested', 'is-skipped', 'is-failed', 'is-waiting');
        row.classList.add('is-' + status);

        const qualityEl = row.querySelector('[data-bulk-quality]');
        if (qualityEl) {
            qualityEl.textContent = getBulkQualityLabel(item);
        }

        const statusEl = row.querySelector('[data-bulk-status]');
        if (statusEl) {
            statusEl.textContent = getBulkStatusLabel(status);
        }
    }

    function updateBulkRequestProgressModal(container, progress) {
        const panel = state.bulkRoot?.querySelector('.bst-quality-panel');
        if (!panel) {
            return;
        }

        const done = progress?.done ?? progress?.Done ?? 0;
        const total = progress?.total ?? progress?.Total ?? 0;
        const percent = progress?.percent ?? progress?.Percent ?? 0;
        const currentId = progress?.currentTmdbId ?? progress?.CurrentTmdbId ?? null;
        const completed = progress?.completed || progress?.Completed || [];

        const fill = panel.querySelector('[data-bulk-progress-fill]');
        if (fill) {
            fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
        }

        const countEl = panel.querySelector('[data-bulk-progress-count]');
        if (countEl) {
            countEl.textContent = done + ' of ' + total;
        }

        panel.querySelectorAll('[data-bulk-item].is-active').forEach(function (row) {
            row.classList.remove('is-active');
            const statusEl = row.querySelector('[data-bulk-status]');
            if (statusEl && statusEl.textContent === 'Requesting…') {
                statusEl.textContent = 'Waiting';
            }
        });

        // Only show newly completed results since the last poll.
        for (let i = state.requestProgressAppliedCount; i < completed.length; i++) {
            const item = completed[i];
            updateBulkItemRow(panel, item);

            const tmdbId = parseInt(item.tmdbId || item.TmdbId, 10);
            const status = (item.status || item.Status || '').toLowerCase();
            if (!Number.isNaN(tmdbId)) {
                applyRequestResultToCard(container, tmdbId, status);
            }
        }

        state.requestProgressAppliedCount = completed.length;
        updateSelectionUi(container);

        if (currentId && done < total) {
            const row = panel.querySelector('[data-bulk-item][data-tmdb-id="' + currentId + '"]');
            if (row && !row.classList.contains('is-requested') &&
                !row.classList.contains('is-skipped') &&
                !row.classList.contains('is-failed')) {
                row.classList.add('is-active');
                const statusEl = row.querySelector('[data-bulk-status]');
                if (statusEl) {
                    statusEl.textContent = 'Requesting…';
                }
            }
        }
    }

    function showBulkRequestComplete(panel, requested, skipped, failed) {
        const header = panel.querySelector('.bst-quality-header h3');
        if (header) {
            header.textContent = 'Requests complete';
        }

        setBulkModalLocked(false);

        const fill = panel.querySelector('[data-bulk-progress-fill]');
        if (fill) {
            fill.style.width = '100%';
        }

        let subtitle = panel.querySelector('.bst-letterboxd-bulk-subtitle');
        if (!subtitle) {
            const list = panel.querySelector('.bst-quality-list');
            if (list) {
                list.insertAdjacentHTML('afterbegin', `<div class="bst-letterboxd-bulk-subtitle"></div>`);
                subtitle = list.querySelector('.bst-letterboxd-bulk-subtitle');
            }
        }

        if (subtitle) {
            subtitle.textContent = `Requested: ${requested}, skipped: ${skipped}, failed: ${failed}`;
        }

        const footer = panel.querySelector('[data-bulk-footer]');
        if (footer) {
            footer.hidden = false;
        }
    }

    function showBulkRequestError(panel, message) {
        const header = panel.querySelector('.bst-quality-header h3');
        if (header) {
            header.textContent = 'Request failed';
        }

        setBulkModalLocked(false);

        let subtitle = panel.querySelector('.bst-letterboxd-bulk-subtitle');
        if (!subtitle) {
            const list = panel.querySelector('.bst-quality-list');
            if (list) {
                list.insertAdjacentHTML('afterbegin', `<div class="bst-letterboxd-bulk-subtitle bst-letterboxd-bulk-subtitle--error"></div>`);
                subtitle = list.querySelector('.bst-letterboxd-bulk-subtitle');
            }
        }

        if (subtitle) {
            subtitle.textContent = message;
        }

        const footer = panel.querySelector('[data-bulk-footer]');
        if (footer) {
            footer.hidden = false;
        }
    }

    function applyRequestResultToCard(container, tmdbId, status) {
        const card = container.querySelector('.seerrfin-discover-card[data-tmdb-id="' + tmdbId + '"]');
        if (!card) {
            return;
        }

        if (status === 'requested' || status === 'skipped') {
            state.requestedIds.add(tmdbId);
            state.selectedIds.delete(tmdbId);
            card.classList.remove('is-selected');
            card.setAttribute('aria-selected', 'false');
        }
    }

    function applyCompletedResults(container, completed, fromIndex) {
        const panel = state.bulkRoot?.querySelector('.bst-quality-panel');
        for (let i = fromIndex; i < completed.length; i++) {
            const item = completed[i];
            const tmdbId = parseInt(item.tmdbId || item.TmdbId, 10);
            const status = (item.status || item.Status || '').toLowerCase();
            if (panel) {
                updateBulkItemRow(panel, item);
            }
            if (!Number.isNaN(tmdbId)) {
                applyRequestResultToCard(container, tmdbId, status);
            }
        }

        state.requestProgressAppliedCount = completed.length;
        updateSelectionUi(container);
    }

    function pollRequestProgress(container) {
        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/letterboxd/request/progress'),
            type: 'GET',
            dataType: 'json'
        }).then(function (result) {
            const isActive = result?.isActive ?? result?.IsActive ?? false;
            if (!isActive) {
                return;
            }

            updateBulkRequestProgressModal(container, result);
        }).catch(function (err) {
            log.warn('Letterboxd request progress poll failed', err);
        });
    }

    function startRequestProgressPolling(container) {
        stopRequestProgressPolling();
        state.requestProgressAppliedCount = 0;
        pollRequestProgress(container);
        state.requestProgressPollTimer = setInterval(function () {
            pollRequestProgress(container);
        }, 400);
    }

    function mapItemToDiscover(item) {
        const providerIds = item.ProviderIds || item.providerIds || {};
        const premiereDate = item.PremiereDate || item.premiereDate || null;
        return {
            Id: providerIds.Tmdb || providerIds.tmdb,
            Name: item.Name || item.name,
            SourceType: 'movie',
            PremiereDate: premiereDate,
            CommunityRating: item.CommunityRating || item.communityRating,
            ProviderIds: providerIds
        };
    }

    function getTmdbId(item) {
        const providerIds = item.ProviderIds || item.providerIds || {};
        const raw = providerIds.Tmdb || providerIds.tmdb || item.Id || item.id;
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? null : parsed;
    }

    function updatePanelErrorBar(container, message) {
        let errorEl = container.querySelector('.seerrfin-letterboxd-error');
        if (message) {
            if (!errorEl) {
                const help = container.querySelector('.seerrfin-letterboxd-help');
                if (help) {
                    help.insertAdjacentHTML('afterend', `<div class="seerrfin-letterboxd-error"></div>`);
                    errorEl = container.querySelector('.seerrfin-letterboxd-error');
                }
            }
            if (errorEl) {
                errorEl.textContent = message;
            }
            return;
        }

        if (errorEl) {
            errorEl.remove();
        }
    }

    function renderLetterboxdPanel() {
        const syncMeta = state.syncMeta || {};
        const resolvedCount = syncMeta.resolvedCount || 0;
        const unresolvedCount = syncMeta.unresolvedCount || 0;
        const lastSynced = syncMeta.lastSynced || null;
        const lastError = syncMeta.lastError || null;
        const hasWatchlist = state.items.length > 0;
        const showToolbar = hasWatchlist && !state.syncing;
        const selectedCount = state.selectedIds.size;
        const disabledAttr = state.syncing || state.requesting ? ' disabled' : '';

        const errorHtml = lastError ? `<div class="seerrfin-letterboxd-error">${escapeHtml(lastError)}</div>` : '';

        let metaHtml = '';
        if (state.syncing) {
            metaHtml = `<div class="seerrfin-loading-row">Loading watchlist…</div>`;
        } else if (lastSynced || hasWatchlist) {
            const unresolvedHtml = unresolvedCount ? `<span>Unresolved: <strong>${escapeHtml(String(unresolvedCount))}</strong></span>` : '';
            metaHtml = `
                <div class="seerrfin-letterboxd-meta">
                    <span>Last synced: <strong>${escapeHtml(formatDate(lastSynced))}</strong></span>
                    <span>Gotten: <strong>${escapeHtml(String(resolvedCount))}</strong></span>
                    ${unresolvedHtml}
                </div>`;
        }

        const toolbarHtml = showToolbar ? `
            <div class="seerrfin-letterboxd-toolbar">
                <div class="seerrfin-letterboxd-toolbar-actions">
                    <button type="button" class="seerrfin-letterboxd-toolbar-btn" data-select-all>Select all</button>
                    <button type="button" class="seerrfin-letterboxd-toolbar-btn" data-select-none>Select none</button>
                </div>
                <span class="seerrfin-letterboxd-toolbar-separator" aria-hidden="true"></span>
                <span class="seerrfin-letterboxd-selected-count" data-selected-count>${selectedCount} selected</span>
            </div>` : '';

        const actionbarHtml = showToolbar ? `
            <div class="seerrfin-letterboxd-actionbar${state.requesting ? ' seerrfin-letterboxd-disabled' : ''}">
                <button type="button" data-request-selected${selectedCount === 0 || state.requesting ? ' disabled' : ''}>Request selected</button>
            </div>` : '';

        return `
            <div class="verticalSection seerrfin-letterboxd-panel padded-left padded-right">
                <div class="sectionTitleContainer sectionTitleContainer-cards">
                    <h2 class="sectionTitle sectionTitle-cards">Letterboxd Watchlist</h2>
                </div>
                <div class="seerrfin-letterboxd-header">
                    <form data-letterboxd-form>
                        <div>
                            <label for="seerrfin-letterboxd-username">Letterboxd username</label>
                            <input id="seerrfin-letterboxd-username" type="text" autocomplete="username"
                                placeholder="your-letterboxd-username" value="${escapeHtml(state.username)}"${disabledAttr} />
                        </div>
                        <button type="submit" data-sync-submit${disabledAttr}>${escapeHtml(getSyncButtonLabel())}</button>
                    </form>
                </div>
                <div class="seerrfin-letterboxd-help">Public Letterboxd watchlists only. Enter your username, get watchlist, select movies, then request them in bulk.</div>
                ${errorHtml}
                ${metaHtml}
                ${toolbarHtml}
                <div class="seerrfin-letterboxd-body"></div>
                ${actionbarHtml}
            </div>`;
    }

    function renderPanel(container) {
        container.innerHTML = renderLetterboxdPanel();
        renderGrid(container);

        const form = container.querySelector('[data-letterboxd-form]');
        if (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                handleSync(container);
            });
        }
    }

    function renderGrid(container) {
        const body = container.querySelector('.seerrfin-letterboxd-body');
        if (!body) {
            return;
        }

        if (state.syncing) {
            body.innerHTML = '';
            return;
        }

        if (!state.items.length) {
            body.innerHTML = '';
            return;
        }

        const plugin = getPlugin();
        if (!plugin || typeof plugin.createDiscoverCards !== 'function') {
            body.innerHTML = '';
            updatePanelErrorBar(container, 'Plugin cards are not ready yet.');
            return;
        }

        updatePanelErrorBar(container, state.syncMeta?.lastError || null);

        const renderCards = function () {
            const useBackdrop = typeof plugin.shouldUseBackdropThumbnails === 'function'
                ? plugin.shouldUseBackdropThumbnails()
                : false;
            const cardOptions = Object.assign({}, getCardOptions(), {
                forceBackdrop: useBackdrop,
                letterboxdSlot: true,
                getLetterboxdSelected: function (tmdbId) {
                    return state.selectedIds.has(tmdbId);
                }
            });
            const discoverItems = state.items.map(mapItemToDiscover).filter(function (item) {
                return item.Id;
            });
            const cardsHtml = plugin.createDiscoverCards(discoverItems, true, cardOptions);
            body.innerHTML = `
                <div class="seerrfin-grid-view">
                    <div class="seerrfin-letterboxd-grid seerrfin-letterboxd-grid--${useBackdrop ? 'landscape' : 'portrait'}">
                        ${cardsHtml}
                    </div>
                </div>`;

            if (useBackdrop && typeof plugin.hydrateDiscoverBackdropCards === 'function') {
                plugin.hydrateDiscoverBackdropCards(body);
            } else if (typeof plugin.initLazyImages === 'function') {
                plugin.initLazyImages(body);
            }
        };

        if (typeof plugin.loadDisplaySettings === 'function') {
            plugin.loadDisplaySettings().then(renderCards).catch(function (err) {
                log.warn('Letterboxd display settings failed', err);
                renderCards();
            });
            return;
        }

        renderCards();
    }

    function toggleSelection(tmdbId, selected, container) {
        if (state.requesting) {
            return;
        }

        if (selected) {
            state.selectedIds.add(tmdbId);
        } else {
            state.selectedIds.delete(tmdbId);
        }
        updateSelectionUi(container);
    }

    function updateSelectionUi(container) {
        const selectedCount = state.selectedIds.size;
        const countEl = container.querySelector('[data-selected-count]');
        if (countEl) {
            countEl.textContent = selectedCount + ' selected';
        }

        const requestBtn = container.querySelector('[data-request-selected]');
        if (requestBtn) {
            requestBtn.disabled = selectedCount === 0 || state.requesting;
        }

        container.querySelectorAll('.seerrfin-discover-card.seerrfin-letterboxd-card').forEach(function (card) {
            if (!card) {
                return;
            }

            const tmdbId = parseInt(card.getAttribute('data-tmdb-id'), 10);
            const isSelected = state.selectedIds.has(tmdbId);
            card.classList.toggle('is-selected', isSelected);
            card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    }

    function selectAll(container) {
        if (state.requesting) {
            return;
        }

        state.items.forEach(function (item) {
            const tmdbId = getTmdbId(item);
            if (tmdbId != null && !state.requestedIds.has(tmdbId)) {
                state.selectedIds.add(tmdbId);
            }
        });
        updateSelectionUi(container);
    }

    function selectNone(container) {
        if (state.requesting) {
            return;
        }

        state.selectedIds.clear();
        updateSelectionUi(container);
    }

    function validateUsername(username) {
        return getUsernamePattern().test((username || '').trim());
    }

    function handleSync(container) {
        const input = container.querySelector('#seerrfin-letterboxd-username');
        const username = input ? input.value.trim() : state.username.trim();
        if (!validateUsername(username)) {
            state.syncMeta = Object.assign({}, state.syncMeta || {}, {
                lastError: 'Enter a valid Letterboxd username.'
            });
            updatePanelErrorBar(container, state.syncMeta.lastError);
            return;
        }

        state.syncing = true;
        state.syncProgressPercent = 0;
        state.syncMeta = Object.assign({}, state.syncMeta || {}, { lastError: null });
        log.info('Letterboxd sync starting for ' + username);
        renderPanel(container);
        startSyncProgressPolling(container);

        syncWatchlist(username)
            .then(function () {
                state.selectedIds.clear();
            })
            .catch(function (err) {
                log.error('Letterboxd sync failed', err);
                const message = err?.responseJSON?.message || 'Could not sync Letterboxd watchlist.';
                state.syncMeta = Object.assign({}, state.syncMeta || {}, { lastError: message });
            })
            .finally(function () {
                stopSyncProgressPolling();
                state.syncing = false;
                state.syncProgressPercent = 0;
                renderPanel(container);
            });
    }

    function closeBulkModal() {
        if (state.bulkRoot) {
            state.bulkRoot.remove();
            state.bulkRoot = null;
        }
    }

    function renderBulkModalShell(title) {
        return `
            <div class="bst-quality-wrapper">
                <div class="bst-quality-backdrop"></div>
                <div class="bst-quality-panel" role="dialog" aria-modal="true">
                    <div class="bst-quality-header">
                        <h3>${escapeHtml(title)}</h3>
                        <button type="button" class="bst-quality-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="bst-quality-list"></div>
                </div>
            </div>`;
    }

    function createBulkModalShell(title) {
        closeBulkModal();

        document.body.insertAdjacentHTML('beforeend', renderBulkModalShell(title));
        state.bulkRoot = document.body.lastElementChild;
        bindBulkModalEvents();

        return state.bulkRoot.querySelector('.bst-quality-panel');
    }

    function getSelectedTmdbIds() {
        return Array.from(state.selectedIds);
    }

    function mergeAlreadyRequestedIds(apiIds, selectedIds) {
        const merged = new Set();
        // Mix server state with ids requested during this page session.
        (apiIds || []).forEach(function (id) {
            merged.add(parseInt(id, 10));
        });
        selectedIds.forEach(function (id) {
            if (state.requestedIds.has(id)) {
                merged.add(id);
            }
        });
        return Array.from(merged).filter(function (id) {
            return !Number.isNaN(id);
        });
    }

    function checkAlreadyRequested(tmdbIds) {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/letterboxd/request/check'),
            type: 'POST',
            data: JSON.stringify({ TmdbIds: tmdbIds }),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json'
        }).then(function (result) {
            const apiIds = result?.tmdbIds || result?.TmdbIds || [];
            return mergeAlreadyRequestedIds(apiIds, tmdbIds);
        });
    }

    function removeSelectedIds(tmdbIds) {
        tmdbIds.forEach(function (id) {
            state.selectedIds.delete(id);
        });
    }

    function renderQualitySelection() {
        return `
            <button type="button" class="bst-quality-option" data-quality-mode="singleProfile">
                Use one quality profile for all
                <span class="bst-quality-option-sub">Choose a single Radarr profile for every selected movie.</span>
            </button>
            <button type="button" class="bst-quality-option" data-quality-mode="highestAvailable">
                Highest quality for each
                <span class="bst-quality-option-sub">Use the highest released streaming quality recommendation per movie.</span>
            </button>
            <button type="button" class="bst-quality-option" data-quality-mode="mostCommon">
                Most common quality for each
                <span class="bst-quality-option-sub">Use the most common streaming quality recommendation per movie.</span>
            </button>
            <div data-profile-list hidden></div>`;
    }

    function showQualitySelection(panel, container, tmdbIds) {
        if (!tmdbIds.length) {
            return;
        }

        panel.classList.remove('bst-letterboxd-bulk-panel');
        const header = panel.querySelector('.bst-quality-header h3');
        if (header) {
            header.textContent = 'Request selected movies';
        }

        const list = panel.querySelector('.bst-quality-list');
        if (!list) {
            return;
        }

        list.innerHTML = renderQualitySelection();

        list.addEventListener('click', function onQualityClick(event) {
            const button = event.target.closest('[data-quality-mode]');
            if (!button) {
                return;
            }

            const mode = button.getAttribute('data-quality-mode');
            if (mode === 'singleProfile') {
                list.removeEventListener('click', onQualityClick);
                showProfilePicker(panel, container, tmdbIds);
                return;
            }

            list.removeEventListener('click', onQualityClick);
            submitBulkRequest(container, {
                QualityMode: mode,
                TmdbIds: tmdbIds.slice()
            }, panel);
        });
    }

    function renderAlreadyRequestedPrompt(alreadyRequestedIds, selectedIds) {
        const count = alreadyRequestedIds.length;
        const total = selectedIds.length;
        const movieWord = count === 1 ? 'movie already has a request' : 'movies already have requests';
        const remaining = total - count;
        const remainingWord = remaining === 1 ? 'movie' : 'movies';

        const itemsHtml = alreadyRequestedIds.map(function (id) {
            return `
                <div class="bst-letterboxd-bulk-item is-skipped">
                    <div class="bst-letterboxd-bulk-item-main">
                        <span class="bst-letterboxd-bulk-item-title">${escapeHtml(getItemTitle(id) || 'Movie')}</span>
                    </div>
                    <span class="bst-letterboxd-bulk-item-status">Already requested</span>
                </div>`;
        }).join('');

        return `
            <div class="bst-letterboxd-bulk-subtitle">
                ${escapeHtml(`${count} of ${total} selected ${movieWord}.`)}
            </div>
            <div class="bst-letterboxd-bulk-items bst-letterboxd-bulk-items--prompt">${itemsHtml}</div>
            <button type="button" class="bst-quality-option" data-skip-requested>
                Skip them and continue
                <span class="bst-quality-option-sub">Request only the ${remaining} remaining ${remainingWord}.</span>
            </button>
            <button type="button" class="bst-quality-option" data-request-all>
                Request all anyway
                <span class="bst-quality-option-sub">Include already requested movies in this batch.</span>
            </button>
            <button type="button" class="bst-quality-option bst-letterboxd-bulk-cancel" data-cancel-request>Cancel</button>`;
    }

    function showAlreadyRequestedPrompt(panel, container, alreadyRequestedIds, selectedIds) {
        const header = panel.querySelector('.bst-quality-header h3');
        if (header) {
            header.textContent = 'Already requested';
        }

        const list = panel.querySelector('.bst-quality-list');
        if (!list) {
            return;
        }

        list.innerHTML = renderAlreadyRequestedPrompt(alreadyRequestedIds, selectedIds);

        list.addEventListener('click', function onPromptClick(event) {
            if (event.target.closest('[data-skip-requested]')) {
                list.removeEventListener('click', onPromptClick);
                const remaining = selectedIds.filter(function (id) {
                    return alreadyRequestedIds.indexOf(id) === -1;
                });

                removeSelectedIds(alreadyRequestedIds);
                updateSelectionUi(container);

                if (!remaining.length) {
                    list.innerHTML = `<div class="bst-quality-empty">No movies left to request.</div>`;
                    return;
                }

                continueBulkRequest(panel, container, remaining);
                return;
            }

            if (event.target.closest('[data-request-all]')) {
                list.removeEventListener('click', onPromptClick);
                continueBulkRequest(panel, container, selectedIds.slice());
                return;
            }

            if (event.target.closest('[data-cancel-request]')) {
                list.removeEventListener('click', onPromptClick);
                closeBulkModal();
            }
        });
    }

    function normalizeRequestOptionsPayload(data) {
        const raw = (data && (data.options || data.Options)) || [];
        return {
            options: (Array.isArray(raw) ? raw : []).map(function (opt) {
                if (!opt) {
                    return null;
                }
                return {
                    serverId: opt.serverId != null ? opt.serverId : opt.ServerId,
                    serverName: opt.serverName || opt.ServerName || '',
                    profileId: opt.profileId != null ? opt.profileId : opt.ProfileId,
                    profileName: opt.profileName || opt.ProfileName || '',
                    rootFolder: opt.rootFolder || opt.RootFolder || '',
                    is4k: !!(opt.is4k != null ? opt.is4k : opt.Is4k)
                };
            }).filter(Boolean),
            canRequest: !!(data && (data.canRequest || data.CanRequest)),
            canRequestAdvanced: !!(data && (data.canRequestAdvanced || data.CanRequestAdvanced))
        };
    }

    function continueBulkRequest(panel, container, tmdbIds) {
        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/request-options/movie'),
            type: 'GET',
            dataType: 'json'
        }).then(function (data) {
            const payload = normalizeRequestOptionsPayload(data);
            if (!payload.canRequest) {
                showBulkRequestError(panel, 'You do not have permission to make movie requests.');
                return;
            }

            // if no advanced permission / no profiles use Seerr defaults (no picker)
            if (!payload.canRequestAdvanced || !payload.options.length) {
                submitBulkRequest(container, {
                    TmdbIds: tmdbIds.slice()
                }, panel);
                return;
            }

            const defaultMode = getDefaultBulkQualityMode();
            if (defaultMode === 'highestAvailable' || defaultMode === 'mostCommon') {
                submitBulkRequest(container, {
                    QualityMode: defaultMode,
                    TmdbIds: tmdbIds.slice()
                }, panel);
                return;
            }
            showQualitySelection(panel, container, tmdbIds);
        }).catch(function (err) {
            log.error('Letterboxd request options failed', err);
            showBulkRequestError(panel, 'Could not load request options.');
        });
    }

    function handleAlreadyRequested(panel, container, alreadyRequestedIds, selectedIds) {
        const mode = getAlreadyRequestedMode();
        if (mode === 'requestAll') {
            continueBulkRequest(panel, container, selectedIds.slice());
            return;
        }

        if (mode === 'skip') {
            const remaining = selectedIds.filter(function (id) {
                return alreadyRequestedIds.indexOf(id) === -1;
            });
            removeSelectedIds(alreadyRequestedIds);
            updateSelectionUi(container);
            if (!remaining.length) {
                const list = panel.querySelector('.bst-quality-list');
                if (list) {
                    list.innerHTML = `<div class="bst-quality-empty">No movies left to request.</div>`;
                }
                return;
            }
            continueBulkRequest(panel, container, remaining);
            return;
        }

        showAlreadyRequestedPrompt(panel, container, alreadyRequestedIds, selectedIds);
    }

    function openBulkModal(container) {
        const selectedIds = getSelectedTmdbIds();
        if (!selectedIds.length) {
            return;
        }

        const panel = createBulkModalShell('Checking selections…');
        const list = panel.querySelector('.bst-quality-list');
        if (list) {
            list.innerHTML = `<div class="bst-quality-loading">Checking for existing requests…</div>`;
        }

        checkAlreadyRequested(selectedIds)
            .then(function (alreadyRequestedIds) {
                if (alreadyRequestedIds.length > 0) {
                    handleAlreadyRequested(panel, container, alreadyRequestedIds, selectedIds);
                    return;
                }

                continueBulkRequest(panel, container, selectedIds);
            })
            .catch(function (err) {
                log.error('Letterboxd request check failed', err);
                if (list) {
                    list.innerHTML = `<div class="bst-quality-empty">Could not check existing requests.</div>`;
                }
            });
    }

    function renderProfileOptions(options) {
        return options.map(function (opt) {
            const label = escapeHtml(opt.profileName || 'Default');
            const subParts = [];
            if (opt.serverName) {
                subParts.push(opt.serverName);
            }
            if (opt.is4k) {
                subParts.push('4K');
            }
            const subHtml = subParts.length ? `<span class="bst-quality-option-sub">${escapeHtml(subParts.join(' · '))}</span>` : '';
            return `
                <button type="button" class="bst-quality-option" data-profile-id="${opt.profileId}"
                    data-server-id="${opt.serverId}" data-root-folder="${escapeHtml(opt.rootFolder || '')}"
                    data-is-4k="${opt.is4k ? '1' : '0'}" data-profile-name="${label}">
                    ${label}
                    ${subHtml}
                </button>`;
        }).join('');
    }

    function showProfilePicker(panel, container, tmdbIds) {
        const list = panel.querySelector('[data-profile-list]');
        if (!list) {
            return;
        }

        list.hidden = false;
        list.innerHTML = `<div class="bst-quality-loading">Loading profiles…</div>`;

        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/request-options/movie'),
            type: 'GET',
            dataType: 'json'
        }).then(function (data) {
            const payload = normalizeRequestOptionsPayload(data);
            if (!payload.canRequestAdvanced || !payload.options.length) {
                list.innerHTML = `<div class="bst-quality-empty">No quality profiles available.</div>`;
                return;
            }

            list.innerHTML = renderProfileOptions(payload.options);

            list.addEventListener('click', function onProfileClick(event) {
                const button = event.target.closest('[data-profile-id]');
                if (!button) {
                    return;
                }

                list.removeEventListener('click', onProfileClick);
                submitBulkRequest(container, {
                    QualityMode: 'singleProfile',
                    TmdbIds: tmdbIds.slice(),
                    ServerId: parseInt(button.getAttribute('data-server-id'), 10),
                    ProfileId: parseInt(button.getAttribute('data-profile-id'), 10),
                    RootFolder: button.getAttribute('data-root-folder') || null,
                    Is4k: button.getAttribute('data-is-4k') === '1',
                    ProfileName: button.getAttribute('data-profile-name')
                }, panel);
            });
        }).catch(function (err) {
            log.error('Letterboxd profiles load failed', err);
            list.innerHTML = `<div class="bst-quality-empty">Failed to load quality profiles.</div>`;
        });
    }

    function submitBulkRequest(container, payload, panel) {
        if (!panel) {
            return;
        }

        state.requestProgressAppliedCount = 0;
        setRequestingUi(container, true);
        showBulkRequestProgressPanel(panel, payload);
        startRequestProgressPolling(container);

        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/letterboxd/request'),
            type: 'POST',
            data: JSON.stringify(payload),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json'
        }).then(function (result) {
            const results = result?.results || result?.Results || [];
            const requested = result?.requested || result?.Requested || 0;
            const skipped = result?.skipped || result?.Skipped || 0;
            const failed = result?.failed || result?.Failed || 0;

            applyCompletedResults(container, results, state.requestProgressAppliedCount);
            showBulkRequestComplete(panel, requested, skipped, failed);
        }).catch(function (err) {
            log.error('Letterboxd bulk request failed', err);
            showBulkRequestError(panel, err?.responseJSON?.message || 'Bulk request failed.');
        }).finally(function () {
            stopRequestProgressPolling();
            setRequestingUi(container, false);
        });
    }

    function bindContainerEvents(container) {
        if (container.dataset.seerrfinLetterboxdBound === 'true') {
            return;
        }
        container.dataset.seerrfinLetterboxdBound = 'true';

        container.addEventListener('click', function (event) {
            const card = event.target.closest('.seerrfin-letterboxd-body .seerrfin-discover-card.seerrfin-letterboxd-card');
            if (card && !event.target.closest('.seerrfin-request-card-actions')) {
                const tmdbId = parseInt(card.getAttribute('data-tmdb-id'), 10);
                if (!Number.isNaN(tmdbId) && !state.requesting) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSelection(tmdbId, !state.selectedIds.has(tmdbId), container);
                }
                return;
            }

            const modalBtn = event.target.closest('.seerrfin-letterboxd-body .seerrfin-request-modal-btn');
            if (modalBtn) {
                const cardEl = modalBtn.closest('.seerrfin-discover-card');
                const tmdbId = cardEl ? cardEl.getAttribute('data-tmdb-id') : null;
                if (tmdbId) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (window.seerrFinModal && typeof window.seerrFinModal.open === 'function') {
                        window.seerrFinModal.open(String(tmdbId), 'movie');
                    }
                }
                return;
            }

            if (event.target.closest('[data-select-all]')) {
                event.preventDefault();
                selectAll(container);
                return;
            }

            if (event.target.closest('[data-select-none]')) {
                event.preventDefault();
                selectNone(container);
                return;
            }

            if (event.target.closest('[data-request-selected]')) {
                event.preventDefault();
                if (state.selectedIds.size === 0 || state.requesting) {
                    return;
                }
                openBulkModal(container);
            }
        });
    }

    function mount(container) {
        bindContainerEvents(container);

        if (container.querySelector('.seerrfin-letterboxd-panel')) {
            return;
        }

        log.info('adding Letterboxd panel');
        renderPanel(container);
    }

    function ensureMounted() {
        const container = findActiveContainer();
        if (container) {
            mount(container);
        }
    }

    function init() {
        if (typeof ApiClient === 'undefined') {
            setTimeout(init, 200);
            return;
        }

        log.info('Letterboxd module init');
        window.__seerrFinLetterboxdEnsureMounted = ensureMounted;
        document.addEventListener('viewshow', ensureMounted);
        ensureMounted();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
