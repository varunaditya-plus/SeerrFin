'use strict';

(function () {
    if (window.__seerrFinAccountInit) return;
    window.__seerrFinAccountInit = true;
    let pending;
    let pendingUser;

    function escapeHtml(value) {
        const element = document.createElement('div');
        element.textContent = String(value || '');
        return element.innerHTML;
    }

    function getAccount() {
        const userId = ApiClient.getCurrentUserId();
        if (pending && pendingUser === userId) return pending;
        pendingUser = userId;
        const request = ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/account'), type: 'GET', dataType: 'json' });
        pending = request;
        // Share only in-flight reads. Every subsequent refresh asks Seerr for current usage.
        request.then(clear, clear);
        function clear() { if (pending === request) pending = null; }
        return request;
    }

    function render(data) {
        const allowed = key => data.permissions.find(permission => permission.key === key)?.allowed === true;
        const quotas = ['movie', 'tv'].map(function (type) {
            const quota = data[type];
            const label = type === 'movie' ? 'Movies' : 'TV seasons';
            const remaining = quota.limit > 0 ? `${quota.remaining} of ${quota.limit} remaining` : 'Unlimited';
            const period = quota.days > 0 ? `Over the past ${quota.days} ${quota.days === 1 ? 'day' : 'days'}` : 'Across all request history';
            return `<div class="seerrfin-account-quota${quota.restricted ? ' is-restricted' : ''}">
                <strong>${label}</strong><span>${escapeHtml(remaining)}</span>
                ${quota.limit > 0 ? `<small>${quota.used} used · ${period}${quota.restricted ? ' · Limit reached' : ''}</small>` : ''}
                <small>HD requests: ${allowed('request-' + type) ? 'Allowed' : 'Not allowed'} · 4K requests: ${allowed('request4k-' + type) ? 'Allowed' : 'Not allowed'}</small>
            </div>`;
        }).join('');
        return `<div class="seerrfin-account-heading"><h3>Request limits</h3>
                <button type="button" class="emby-button raised" data-seerrfin-account-refresh>Refresh</button></div>
            <div class="seerrfin-account-quotas" role="status" aria-live="polite">${quotas}</div>
            <p class="seerrfin-account-note">TV limits count seasons. HD and 4K share these limits. ${data.bypassQuota ? 'Quota exemption enabled.' : ''}</p>
            <details class="seerrfin-account-permissions"><summary>Permissions</summary>
                <ul>${data.permissions.map(permission => `<li><span>${escapeHtml(permission.label)}</span><strong>${permission.allowed ? 'Allowed' : 'Not allowed'}</strong></li>`).join('')}</ul>
            </details>`;
    }

    function mount(container) {
        if (!container) return;
        if (!container.dataset.accountBound) {
            container.dataset.accountBound = 'true';
            container.addEventListener('click', function (event) {
                if (event.target.closest('[data-seerrfin-account-refresh]')) mount(container);
            });
        }
        const userId = ApiClient.getCurrentUserId();
        const requestId = (container._accountRequestId || 0) + 1;
        container._accountRequestId = requestId;
        const permissionsOpen = !!container.querySelector('details[open]');
        container.innerHTML = '<p role="status">Loading your limits and permissions…</p>';
        getAccount().then(function (data) {
            if (!container.isConnected || container._accountRequestId !== requestId || ApiClient.getCurrentUserId() !== userId) return;
            container.innerHTML = render(data);
            if (permissionsOpen) container.querySelector('details').open = true;
        }).catch(async function (error) {
            const message = await errorMessage(error, 'Unable to load your limits and permissions.');
            if (!container.isConnected || container._accountRequestId !== requestId || ApiClient.getCurrentUserId() !== userId) return;
            container.innerHTML = `<p role="alert">${escapeHtml(message)}</p><button type="button" class="emby-button raised" data-seerrfin-account-refresh>Retry</button>`;
        });
    }

    function refreshVisible() {
        const limits = profileState?.root.querySelector('[data-profile-section="limits"]');
        if (limits && !limits.hidden) mount(limits.querySelector('[data-seerrfin-account]'));
    }

    let profileState;
    async function errorMessage(error, fallback) {
        if (error?.responseJSON?.message) return error.responseJSON.message;
        if (typeof error?.clone === 'function') {
            try { return (await error.clone().json()).message || fallback; } catch (_) {}
        }
        return fallback;
    }
    function profileApi(values) {
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/profile'), type: values ? 'POST' : 'GET', dataType: 'json',
            ...(values ? { data: JSON.stringify(values), contentType: 'application/json' } : {}) });
    }
    function closeProfile(reload = true) {
        if (!profileState) return;
        const state = profileState;
        profileState = null;
        state.root.remove();
        if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
        document.removeEventListener('keydown', state.keydown);
        document.body.style.overflow = state.overflow;
        if (state.origin?.isConnected) state.origin.focus();
        if (reload && state.saved && state.user === ApiClient.getCurrentUserId()) window.location.reload();
    }
    function openProfile() {
        if (profileState) return;
        const root = document.createElement('div');
        root.className = 'seerrfin-profile-view';
        root.innerHTML = `<div class="seerrfin-profile-backdrop" data-profile-close></div><section role="dialog" aria-modal="true" aria-label="Seerr Profile &amp; Limits" class="seerrfin-profile-panel">
            <button type="button" class="paper-icon-button-light seerrfin-profile-close" data-profile-close aria-label="Close profile"><span class="material-icons" aria-hidden="true">close</span></button>
            <div data-profile-content></div></section>`;
        const state = profileState = { root, user: ApiClient.getCurrentUserId(), origin: document.activeElement, overflow: document.body.style.overflow, saved: false, saving: false };
        document.body.appendChild(root);
        document.body.style.overflow = 'hidden';
        const content = root.querySelector('[data-profile-content]');
        const current = () => profileState === state && root.isConnected && state.user === ApiClient.getCurrentUserId();
        function renderProfile(data) {
            state.emailEditable = data.emailEditable;
            const options = items => items.slice().sort((a,b) => a.name.localeCompare(b.name)).map(x => `<option value="${escapeHtml(x.id).replace(/"/g, '&quot;')}">${escapeHtml(x.name)}</option>`).join('');
            const defaultName = (key, items, fallback) => (data.defaults[key] || '').split('|').map(x => items.find(i => i.id === x)?.name || x).filter(Boolean).join(' · ') || fallback;
            const select = (key, label, items, fallback, all) => `<label>${label}<select name="${key}"><option value="">Server default (${escapeHtml(defaultName(key, items, fallback))})</option>${all ? `<option value="all">${all}</option>` : ''}${options(items)}</select></label>`;
            content.innerHTML = `<div class="seerrfin-profile-identity"><div class="seerrfin-profile-avatar"><span class="material-icons" aria-hidden="true">person</span><img data-profile-avatar alt="" hidden></div><div><strong data-profile-name>${escapeHtml(data.displayName)}</strong><span>${escapeHtml(data.role)}${data.jellyfinUsername ? ` · ${escapeHtml(data.jellyfinUsername)}` : ''}</span></div></div>
                <div class="seerrfin-profile-tabs" role="tablist" aria-label="Profile sections"><button type="button" role="tab" aria-selected="true" data-profile-tab="preferences">Profile</button><button type="button" role="tab" aria-selected="false" data-profile-tab="limits">Limits &amp; permissions</button></div>
                <div data-profile-section="preferences"><form><div class="seerrfin-profile-fields">
                    <label>Display name<input name="username" type="text" maxlength="100" autocomplete="nickname"></label>
                    <label>Email<input name="email" type="email" maxlength="254" autocomplete="email"${data.emailEditable ? '' : ' disabled'}${data.emailRequired && data.emailEditable ? ' required' : ''}></label>
                    ${select('locale', 'Seerr locale', data.locales, 'English')}
                    ${select('discoverRegion', 'Discovery region', data.regions, 'All regions', 'All regions')}
                    ${select('streamingRegion', 'Streaming region', data.streamingRegions, 'Seerr default')}
                    <label>Original-language preference<select name="languageMode"><option value="">Server default (${escapeHtml(defaultName('originalLanguage', data.languages, 'All languages'))})</option><option value="all">All languages</option><option value="custom">Choose languages</option></select></label>
                    <label data-profile-languages>Preferred original languages (up to 20)<select name="languages" multiple size="5">${options(data.languages)}</select></label>
                </div><p class="seerrfin-profile-note">Preferences sync with your Seerr account.</p>
                <div class="seerrfin-profile-actions"><button type="submit" class="emby-button raised">Save profile</button><button type="button" class="emby-button raised" data-profile-defaults>Use server preferences</button></div>
                <p data-profile-status role="status" aria-live="polite"></p></form></div><div data-profile-section="limits" hidden><div data-seerrfin-account></div></div>`;
            const form = content.querySelector('form');
            content.querySelectorAll('[data-profile-tab]').forEach(button => button.addEventListener('click', () => {
                content.querySelectorAll('[data-profile-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
                content.querySelectorAll('[data-profile-section]').forEach(panel => { panel.hidden = panel.dataset.profileSection !== button.dataset.profileTab; });
                if (button.dataset.profileTab === 'limits') mount(content.querySelector('[data-seerrfin-account]'));
            }));
            if (!state.avatarUrl && !state.avatarLoading) {
                state.avatarLoading = true;
                fetch(ApiClient.getUrl('SeerrFin/profile/avatar'), { headers: { Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' } }).then(response => { if (!response.ok) throw new Error(); return response.blob(); }).then(blob => {
                    if (!current()) return;
                    state.avatarUrl = URL.createObjectURL(blob);
                    showAvatar();
                }).catch(() => {}).finally(() => { state.avatarLoading = false; });
            } else if (state.avatarUrl) showAvatar();
            function showAvatar() { const img = content.querySelector('[data-profile-avatar]'); img.src = state.avatarUrl; img.hidden = false; }
            for (const key of ['username','email','locale','discoverRegion','streamingRegion']) {
                const input = form.elements[key];
                const value = data.values[key];
                if (input.tagName === 'SELECT' && value && ![...input.options].some(x => x.value === value)) input.add(new Option(value, value));
                input.value = value;
            }
            const original = data.values.originalLanguage;
            const originalLanguages = original.split('|');
            form.elements.languageMode.value = !original || original === 'all' ? original : 'custom';
            [...form.elements.languages.options].forEach(x => { x.selected = originalLanguages.includes(x.value); });
            function languagesVisibility() { content.querySelector('[data-profile-languages]').hidden = form.elements.languageMode.value !== 'custom'; }
            languagesVisibility();
            form.elements.languageMode.addEventListener('change', languagesVisibility);
            content.querySelector('[data-profile-defaults]').addEventListener('click', () => {
                for (const key of ['locale','discoverRegion','streamingRegion','languageMode']) form.elements[key].value = '';
                languagesVisibility();
                const status = content.querySelector('[data-profile-status]');
                status.setAttribute('role', 'status'); status.textContent = 'Server preferences selected.';
            });
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (!current() || state.saving || !form.reportValidity()) return;
                const status = content.querySelector('[data-profile-status]');
                const selected = [...form.elements.languages.selectedOptions].map(x => x.value);
                if (form.elements.languageMode.value === 'custom' && (selected.length < 1 || selected.length > 20)) {
                    status.setAttribute('role', 'alert'); status.textContent = 'Choose between 1 and 20 original languages.'; return;
                }
                const values = {};
                for (const key of ['username','email','locale','discoverRegion','streamingRegion']) values[key] = form.elements[key].value;
                values.originalLanguage = form.elements.languageMode.value === 'custom' ? selected.join('|') : form.elements.languageMode.value;
                state.saving = true;
                root.querySelectorAll('button, input, select').forEach(x => { x.disabled = true; });
                status.setAttribute('role', 'status'); status.textContent = 'Saving your profile…';
                try {
                    const saved = await profileApi(values);
                    if (!current()) return;
                    state.saved = true;
                    renderProfile(saved);
                    const message = content.querySelector('[data-profile-status]');
                    message.textContent = 'Profile saved.';
                    message.tabIndex = -1; message.focus();
                } catch (error) {
                    const message = await errorMessage(error, 'Unable to save your profile. Please try again.');
                    if (!current()) return;
                    status.setAttribute('role', 'alert'); status.textContent = message;
                } finally {
                    if (current()) {
                        state.saving = false;
                        root.querySelectorAll('button, input, select').forEach(x => { x.disabled = false; });
                        if (!state.emailEditable) content.querySelector('[name="email"]').disabled = true;
                    }
                }
            });
        }
        async function load() {
            content.innerHTML = '<p role="status">Loading your profile…</p>';
            try {
                const data = await profileApi();
                if (current()) renderProfile(data);
            } catch (error) {
                const message = await errorMessage(error, 'Unable to load your profile. Please try again.');
                if (current()) content.innerHTML = `<p role="alert">${escapeHtml(message)}</p><button type="button" class="emby-button raised" data-profile-retry>Retry profile</button>`;
            }
        }
        root.addEventListener('click', event => {
            if (event.target.closest('[data-profile-close]') && !state.saving) closeProfile();
            if (event.target.closest('[data-profile-retry]')) load();
        });
        state.keydown = event => {
            if (!current()) return;
            if (event.key === 'Escape') { event.preventDefault(); if (!state.saving) closeProfile(); }
            if (event.key === 'Tab') {
                const elements = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(x => x.getClientRects().length);
                if (!elements.length) { event.preventDefault(); return; }
                const first = elements[0], last = elements[elements.length - 1];
                if (!elements.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
                else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', state.keydown);
        root.querySelector('button[data-profile-close]').focus();
        load();
    }
    window.addEventListener('hashchange', () => closeProfile());
    document.addEventListener('viewshow', () => { if (profileState && profileState.user !== ApiClient.getCurrentUserId()) closeProfile(false); });

    const menuPages = [
        ['profile', 'Profile & Limits', 'person'], ['requests', 'Requests', 'schedule'],
        ['blocklist', 'Blocklist', 'visibility_off'], ['issues', 'Issues', 'report_problem'],
        ['users', 'Users', 'group'], ['settings', 'Settings', 'settings']
    ];
    let menuRead;
    let appState;
    function createAppSession(page) {
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/app-session'), type: 'POST', dataType: 'json', contentType: 'application/json', data: JSON.stringify({ page }) });
    }
    function revokeApp(state) {
        const sessionId = state.sessionId;
        state.sessionId = null;
        if (sessionId) fetch(ApiClient.getUrl('SeerrFin/app/' + sessionId + '/session-close'), { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    }
    function closeApp() {
        if (!appState) return;
        const state = appState; appState = null;
        state.root.remove(); revokeApp(state);
        document.removeEventListener('keydown', state.keydown);
        document.body.style.overflow = state.overflow;
        if (state.origin?.isConnected) state.origin.focus();
    }
    function openApp(page) {
        if (appState) return;
        const label = menuPages.find(item => item[0] === page)?.[1];
        if (!label) return;
        const root = document.createElement('div'); root.className = 'seerrfin-app-view';
        root.innerHTML = `<section role="dialog" aria-modal="true" aria-label="Seerr ${label}" class="seerrfin-app-panel"><header><h2>Seerr ${label}</h2><button type="button" class="paper-icon-button-light" data-app-refresh aria-label="Reload Seerr page"><span class="material-icons" aria-hidden="true">refresh</span></button><button type="button" class="paper-icon-button-light" data-app-close aria-label="Close Seerr page"><span class="material-icons" aria-hidden="true">close</span></button></header><div data-app-body><p role="status">Loading…</p></div></section>`;
        const state = appState = { root, user: ApiClient.getCurrentUserId(), origin: document.activeElement, overflow: document.body.style.overflow };
        document.body.appendChild(root); document.body.style.overflow = 'hidden';
        const current = () => appState === state && state.user === ApiClient.getCurrentUserId();
        async function loadApp() {
            const body = root.querySelector('[data-app-body]'); body.innerHTML = '<p role="status">Loading…</p>';
            root.querySelector('[data-app-refresh]').disabled = true;
            revokeApp(state);
            try {
                const session = await createAppSession(page);
                state.sessionId = session.sessionId;
                if (!current()) { revokeApp(state); return; }
                const frame = document.createElement('iframe'); frame.title = 'Seerr ' + label;
                frame.src = session.path; frame.referrerPolicy = 'no-referrer';
                body.replaceChildren(frame); state.frame = frame;
            } catch (error) {
                const message = await errorMessage(error, 'Unable to open Seerr. Please try again.');
                if (current()) body.innerHTML = `<p role="alert">${escapeHtml(message)}</p>`;
            } finally { if (current()) root.querySelector('[data-app-refresh]').disabled = false; }
        }
        root.addEventListener('click', event => {
            if (event.target.closest('[data-app-close]')) closeApp();
            if (event.target.closest('[data-app-refresh]')) loadApp();
        });
        state.keydown = event => {
            if (!current()) return;
            if (event.key === 'Escape') { event.preventDefault(); closeApp(); }
            if (event.key === 'Tab') {
                const controls = [...root.querySelectorAll('button:not(:disabled),iframe')];
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', state.keydown);
        root.querySelector('[data-app-close]').focus(); loadApp();
    }
    window.addEventListener('message', event => {
        if (event.origin !== location.origin || !appState || event.source !== appState.frame?.contentWindow) return;
        if (event.data?.type === 'seerrfin-app-close') closeApp();
        else if (event.data?.type === 'seerrfin-app-error') {
            appState.root.querySelector('[data-app-body]').innerHTML = '<p role="alert">Unable to load the Seerr page. Try reloading.</p>';
            revokeApp(appState);
        }
    });
    async function mountSettingsMenu() {
        if (typeof ApiClient === 'undefined' || !location.hash.startsWith('#/mypreferencesmenu')) return;
        const user = ApiClient.getCurrentUserId();
        const selectedUser = new URLSearchParams(location.hash.split('?')[1] || '').get('userId');
        const page = document.querySelector('#myPreferencesMenuPage:not(.hide)');
        const target = page?.querySelector('.readOnlyContent');
        if (!target) return;
        if (selectedUser && selectedUser !== user) { target.querySelector('[data-seerrfin-menu]')?.remove(); return; }
        let section = target.querySelector('[data-seerrfin-menu]');
        if (section?.dataset.user === user || (menuRead?.user === user && menuRead.target === target)) return;
        section?.remove();
        const read = menuRead = { user, target };
        try {
            const data = await getAccount();
            if (menuRead !== read || user !== ApiClient.getCurrentUserId() || !target.isConnected || !location.hash.startsWith('#/mypreferencesmenu')) return;
            section = document.createElement('div'); section.className = 'verticalSection verticalSection-extrabottompadding'; section.dataset.seerrfinMenu = ''; section.dataset.user = user;
            section.innerHTML = menuPages.filter(item => data.pages.includes(item[0])).map(([id, label, icon]) => `<button type="button" class="emby-button listItem-border seerrfin-settings-link" data-seerrfin-page="${id}"><div class="listItem"><span class="material-icons listItemIcon listItemIcon-transparent" aria-hidden="true">${icon}</span><div class="listItemBody"><div class="listItemBodyText">SeerrFin - Seerr ${label.replace('&', '&amp;')}</div></div></div></button>`).join('');
            target.querySelector('[data-seerrfin-menu]')?.remove(); target.appendChild(section);
        } catch (_) {} finally { if (menuRead === read) menuRead = null; }
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-seerrfin-page]');
        if (!button || button.closest('[data-seerrfin-menu]')?.dataset.user !== ApiClient.getCurrentUserId()) return;
        if (button.dataset.seerrfinPage === 'profile') openProfile(); else openApp(button.dataset.seerrfinPage);
    });
    window.addEventListener('hashchange', () => { closeApp(); mountSettingsMenu(); });
    document.addEventListener('viewshow', () => {
        if (appState && appState.user !== ApiClient.getCurrentUserId()) closeApp();
        document.querySelectorAll('[data-seerrfin-menu]').forEach(section => section.remove());
        mountSettingsMenu();
    });
    new MutationObserver(mountSettingsMenu).observe(document.body, { childList: true, subtree: true });
    mountSettingsMenu();

    document.addEventListener('viewshow', refreshVisible);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshVisible(); });
})();
