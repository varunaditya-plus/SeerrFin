'use strict';

(function () {
    if (window.__seerrFinWatchlistInit) return;
    window.__seerrFinWatchlistInit = true;

    function escapeHtml(value) {
        const element = document.createElement('div');
        element.textContent = String(value || '');
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isVisible(container) {
        return container.isConnected && container.offsetParent !== null &&
            !container.closest('.page.hide, .tabContent.hide, .pageTabContent.hide');
    }

    function api(path, method) {
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/watchlist' + path), type: method || 'GET', dataType: 'json' });
    }

    function errorMessage(error, fallback) {
        return error?.responseJSON?.message || fallback || 'Unable to load watchlist. Please try again.';
    }

    // This API is also used by the details modal. No membership state is shared across users.
    window.seerrFinWatchlist = {
        get: function (id, type) { return api('/' + type + '/' + id); },
        set: function (id, type, added) {
            const userId = ApiClient.getCurrentUserId();
            return api('/' + type + '/' + id, added ? 'POST' : 'DELETE').then(function (result) {
                if (ApiClient.getCurrentUserId() === userId) document.dispatchEvent(new Event('seerrfin-watchlist-changed'));
                return result;
            });
        }
    };

    function renderPanel(container) {
        const plugin = window.seerrFinPlugin;
        const title = plugin.resolveTabTitle('watchlist', plugin._tabConfig?.tabs?.find(function (tab) { return tab.id === 'watchlist'; })?.title);
        container.innerHTML = `
            <div class="verticalSection seerrfin-watchlist-panel">
                <div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">
                    <h2 class="sectionTitle sectionTitle-cards">${escapeHtml(title)}</h2>
                    <button type="button" class="seerrfin-requests-reload" data-watchlist-refresh aria-label="Reload watchlist" title="Reload watchlist">
                        <span class="material-icons" aria-hidden="true">refresh</span>
                    </button>
                </div>
                <div class="seerrfin-watchlist-body"></div>
                <div class="seerrfin-watchlist-message padded-left padded-right" data-watchlist-message role="alert" hidden></div>
            </div>`;
    }

    function render(container, data) {
        const plugin = window.seerrFinPlugin;
        container._watchlistPage = data.page;
        const items = data.results || [];
        const cards = items.map(function (item) {
            const discover = {
                Name: item.title, SourceType: item.mediaType,
                PremiereDate: item.releaseDate, CommunityRating: item.voteAverage,
                ProviderIds: { Tmdb: String(item.id), TmdbPosterPath: item.posterPath }
            };
            const safeTitle = escapeHtml(item.title);
            return `<div class="seerrfin-watchlist-entry" data-watchlist-id="${item.id}" data-watchlist-type="${escapeHtml(item.mediaType)}">
                ${plugin.createDiscoverCards([discover], true, { interactive: false, forceBackdrop: false })}
                <button type="button" class="seerrfin-watchlist-remove" data-watchlist-remove aria-label="Remove ${safeTitle} from watchlist" title="Remove from watchlist">
                    <span class="material-icons" aria-hidden="true">close</span>
                </button></div>`;
        }).join('');
        const body = container.querySelector('.seerrfin-watchlist-body');
        body.innerHTML = cards
            ? `<div class="seerrfin-watchlist-grid padded-left padded-right">${cards}</div>`
            : '<div class="seerrfin-empty-row padded-left">Your watchlist is empty.</div>';
        body.querySelectorAll('.seerrfin-discover-card').forEach(function (card, index) {
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', 'Open ' + items[index].title);
        });
        if (data.totalPages > 1) {
            body.insertAdjacentHTML('beforeend', `<div class="seerrfin-grid-loadmore seerrfin-requests-pagination padded-left">
                <button type="button" class="raised emby-button" data-watchlist-page="${data.page - 1}"${data.page <= 1 ? ' disabled' : ''}>Previous</button>
                <span class="seerrfin-requests-page-info">Page ${data.page} of ${data.totalPages}</span>
                <button type="button" class="raised emby-button" data-watchlist-page="${data.page + 1}"${data.page >= data.totalPages ? ' disabled' : ''}>Next</button>
            </div>`);
        }
        plugin.initLazyImages(body);
    }

    function setLoading(container, loading) {
        const button = container.querySelector('[data-watchlist-refresh]');
        button.disabled = loading;
        button.classList.toggle('is-loading', loading);
        button.setAttribute('aria-busy', String(loading));
        container.querySelector('.seerrfin-watchlist-body').setAttribute('aria-busy', String(loading));
    }

    function load(container, page) {
        const userId = ApiClient.getCurrentUserId();
        const requestId = (container._watchlistRequestId || 0) + 1;
        container._watchlistRequestId = requestId;
        const userChanged = container._watchlistUserId !== userId;
        container._watchlistUserId = userId;
        if (userChanged || !container.querySelector('.seerrfin-watchlist-panel')) renderPanel(container);
        const body = container.querySelector('.seerrfin-watchlist-body');
        if (!body.innerHTML) body.innerHTML = '<div role="status" class="seerrfin-empty-row padded-left">Loading watchlist…</div>';
        container.querySelector('[data-watchlist-message]').hidden = true;
        setLoading(container, true);
        api('?page=' + page).then(function (data) {
            if (!container.isConnected || requestId !== container._watchlistRequestId || userId !== ApiClient.getCurrentUserId()) return;
            render(container, data);
            setLoading(container, false);
        }).catch(function (error) {
            if (!container.isConnected || requestId !== container._watchlistRequestId || userId !== ApiClient.getCurrentUserId()) return;
            setLoading(container, false);
            if (body.querySelector('[role="status"]')) body.innerHTML = '';
            const message = container.querySelector('[data-watchlist-message]');
            message.textContent = errorMessage(error);
            message.hidden = false;
        });
    }

    function mount(container, refresh) {
        if (!container.dataset.watchlistBound) {
            container.dataset.watchlistBound = 'true';
            container.addEventListener('click', function (event) {
                const button = event.target.closest('button');
                const entry = event.target.closest('.seerrfin-watchlist-entry');
                if (container._watchlistUserId !== ApiClient.getCurrentUserId()) { load(container, 1); return; }
                if (button?.disabled) return;
                if (button?.hasAttribute('data-watchlist-refresh')) { load(container, container._watchlistPage || 1); return; }
                if (button?.hasAttribute('data-watchlist-page')) { load(container, Number(button.dataset.watchlistPage)); return; }
                if (!entry) return;
                const id = entry.dataset.watchlistId;
                const type = entry.dataset.watchlistType;
                if (button?.hasAttribute('data-watchlist-remove')) {
                    const userId = ApiClient.getCurrentUserId();
                    const requestId = container._watchlistRequestId;
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                    button.querySelector('.material-icons').textContent = 'hourglass_top';
                    window.seerrFinWatchlist.set(id, type, false).catch(function (error) {
                        if (!container.isConnected || userId !== ApiClient.getCurrentUserId() || requestId !== container._watchlistRequestId) return;
                        const message = container.querySelector('[data-watchlist-message]');
                        if (message) { message.textContent = errorMessage(error, 'Unable to remove this title. Please try again.'); message.hidden = false; }
                        button.disabled = false;
                        button.removeAttribute('aria-busy');
                        button.querySelector('.material-icons').textContent = 'close';
                    });
                } else if (event.target.closest('.seerrfin-discover-card')) {
                    window.seerrFinModal.open(id, type);
                }
            });
            container.addEventListener('keydown', function (event) {
                const card = event.target.closest('.seerrfin-discover-card');
                if (card && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    card.click();
                }
            });
        }
        const userChanged = container._watchlistUserId !== ApiClient.getCurrentUserId();
        if (userChanged || refresh || !container.innerHTML) load(container, userChanged ? 1 : (container._watchlistPage || 1));
    }

    function ensureMounted(refresh) {
        if (typeof ApiClient === 'undefined' || !window.seerrFinPlugin) return;
        document.querySelectorAll('.seerrfin-watchlist-sections').forEach(function (container) {
            if (isVisible(container)) mount(container, refresh === true);
            else if (container._watchlistUserId && container._watchlistUserId !== ApiClient.getCurrentUserId()) {
                container._watchlistRequestId = (container._watchlistRequestId || 0) + 1;
                container.innerHTML = '';
                container._watchlistUserId = null;
            }
        });
    }

    function init() {
        if (typeof ApiClient === 'undefined' || !window.seerrFinPlugin) { setTimeout(init, 200); return; }
        window.__seerrFinWatchlistEnsureMounted = function () { ensureMounted(true); };
        document.addEventListener('viewshow', function () { ensureMounted(true); });
        document.addEventListener('seerrfin-watchlist-changed', function () { ensureMounted(true); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) ensureMounted(true); });
        ensureMounted();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
