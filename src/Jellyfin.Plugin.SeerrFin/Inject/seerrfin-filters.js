'use strict';

(function () {
    if (window.seerrFinFilters) return;
    let nextId = 0;
    let openState = null;
    const separators = { genre: ',', watchProviders: '|', status: '|', certification: '|' };

    function escapeHtml(value) {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function api(type, options, query) {
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/discover/' + (options ? 'filter-options/' : 'filtered/') + type) + '?' + query, type: 'GET', dataType: 'json' });
    }
    async function errorMessage(error) {
        if (error?.responseJSON?.message) return error.responseJSON.message;
        if (typeof error?.clone === 'function') {
            try { return (await error.clone().json()).message || 'Unable to load discovery. Please try again.'; } catch (_) {}
        }
        return 'Unable to load discovery. Please try again.';
    }
    function optionsHtml(items) {
        return items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    }
    function picker(name, label, options = '') {
        return `<div class="seerrfin-filter-field" data-filter-pick="${name}"><span class="seerrfin-filter-label">${label}</span>
            <button type="button" class="seerrfin-filter-select" data-filter-pick-toggle aria-label="Select ${label.toLowerCase()}" aria-expanded="false"><span data-filter-pick-text>Any</span><span class="material-icons" aria-hidden="true">expand_more</span></button>
            <div class="seerrfin-filter-pick-options" hidden><input type="search" placeholder="Search…" aria-label="Search ${label.toLowerCase()}" autocomplete="off"><div data-filter-pick-items>${options}</div></div></div>`;
    }
    function checkboxes(items, name) {
        return items.map(item => `<label><input type="checkbox" name="${name}" value="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span></label>`).join('');
    }
    function searchField(id, name, label, kind) {
        return `<div class="seerrfin-filter-field" data-filter-search="${name}" data-kind="${kind}"><label class="seerrfin-filter-label" for="${id}-${name}">${label}</label>
            <div class="seerrfin-filter-search-control"><input id="${id}-${name}" type="search" role="combobox" aria-autocomplete="list" aria-controls="${id}-${name}-options" aria-expanded="false" maxlength="80" autocomplete="off" placeholder="Search ${label.toLowerCase()}…">
            <div id="${id}-${name}-options" class="seerrfin-filter-suggestions" role="listbox" aria-label="${label}" hidden></div></div>
            <div class="seerrfin-filter-tags"></div><input type="hidden" name="${name}"><p data-search-status role="status"></p></div>`;
    }
    function range(prefix, label, min, max, step, suffix) {
        return `<fieldset class="seerrfin-filter-range" data-filter-range="${prefix}" data-suffix="${suffix}"><legend>${label}</legend>
            <output>${min} – ${max}${suffix}</output><div class="seerrfin-filter-range-track"><div class="seerrfin-filter-range-fill"></div>
                <input type="range" min="${min}" max="${max}" step="${step}" value="${min}" data-range-min aria-label="Minimum ${label.toLowerCase()}">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${max}" data-range-max aria-label="Maximum ${label.toLowerCase()}"></div>
            <input type="hidden" name="${prefix}Gte"><input type="hidden" name="${prefix}Lte"></fieldset>`;
    }
    function modalHtml(type, id) {
        const movie = type === 'movie';
        const date = movie ? 'primaryReleaseDate' : 'firstAirDate';
        const dateSort = movie ? 'release_date' : 'first_air_date';
        const titleSort = movie ? 'original_title' : 'original_name';
        const sorts = [ ['popularity.desc', 'Popularity descending'], ['popularity.asc', 'Popularity ascending'], [dateSort + '.desc', 'Release date descending'], [dateSort + '.asc', 'Release date ascending'], ['vote_average.desc', 'TMDB rating descending'], ['vote_average.asc', 'TMDB rating ascending'], [titleSort + '.asc', 'Title (A–Z)'], [titleSort + '.desc', 'Title (Z–A)'] ];
        const certificates = movie ? ['NR', 'G', 'PG', 'PG-13', 'R', 'NC-17'] : ['NR', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
        return `<div class="seerrfin-filter-backdrop" data-filter-close></div><section class="seerrfin-filter-panel" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
            <header><div><h2 id="${id}-title">Filters</h2><span data-filter-modal-count>0 active filters</span></div><button type="button" class="paper-icon-button-light" data-filter-close aria-label="Close filters"><span class="material-icons" aria-hidden="true">close</span></button></header>
            <form><div class="seerrfin-filter-fields">
                <label class="seerrfin-filter-field seerrfin-filter-wide"><span class="seerrfin-filter-label">Sort by</span><select name="sortBy">${sorts.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label>
                <fieldset class="seerrfin-filter-dates seerrfin-filter-wide"><legend>${movie ? 'Release date' : 'First air date'}</legend><div><label>From<input name="${date}Gte" type="date"></label><label>To<input name="${date}Lte" type="date"></label></div></fieldset>
                ${movie ? searchField(id, 'studio', 'Studio', 'company') : picker('status', 'Status', checkboxes(['Returning series', 'Planned', 'In production', 'Ended', 'Cancelled', 'Pilot'].map((name, id) => ({ id, name })), 'status'))}
                ${picker('genre', 'Genres')}
                ${searchField(id, 'keywords', 'Keywords', 'keyword')}
                ${searchField(id, 'excludeKeywords', 'Exclude keywords', 'keyword')}
                <div class="seerrfin-filter-field seerrfin-filter-wide"><label class="seerrfin-filter-label" for="${id}-language-mode">Original language</label><select id="${id}-language-mode" data-filter-language-mode><option value="server">Default</option><option value="all">All languages</option><option value="custom">Select languages</option></select>
                    <div data-filter-languages hidden>${picker('languageChoices', 'Languages')}</div><input type="hidden" name="language"></div>
                <fieldset class="seerrfin-filter-certifications seerrfin-filter-wide"><legend>Content rating <span>(US)</span></legend><div>${certificates.map(value => `<label><input type="checkbox" name="certification" value="${value}"><span>${value}</span></label>`).join('')}</div></fieldset>
                ${range('withRuntime', 'Runtime', 0, 400, 1, ' min')}
                ${range('voteAverage', 'TMDB user score', 1, 10, .1, '')}
                ${range('voteCount', 'TMDB user vote count', 0, 1000, 1, '')}
                <div class="seerrfin-filter-field seerrfin-filter-wide"><label class="seerrfin-filter-label" for="${id}-region">Streaming services</label><select id="${id}-region" name="watchRegion" aria-label="Streaming region"></select>
                    <div class="seerrfin-filter-providers" data-filter-providers></div><button type="button" class="seerrfin-filter-more" data-filter-providers-more hidden>Show more</button><p data-filter-providers-status role="status"></p></div>
            </div><p class="seerrfin-filter-status" data-filter-choices-status role="status"></p><p class="seerrfin-filter-status" data-filter-form-status role="alert"></p>
            <footer><button type="button" class="emby-button raised" data-filter-clear disabled>Clear filters</button><button type="submit" class="emby-button raised" data-filter-apply disabled>Apply filters</button></footer></form></section>`;
    }
    function countFilters(query) {
        let count = 0;
        const grouped = new Set();
        for (const key of query.keys()) {
            if (key === 'watchRegion') continue;
            const group = key.replace(/(?:Gte|Lte)$/, '');
            if (!grouped.has(group)) { grouped.add(group); ++count; }
        }
        return count;
    }

    function mount(parent, type, title) {
        const userId = ApiClient.getCurrentUserId();
        const previous = Array.from(parent.children).find(child => child.classList.contains('seerrfin-filter-host'));
        if (previous?._filterState.userId === userId) return;
        previous?._filterState.close();
        previous?.remove();
        delete parent.dataset.seerrfinFilterActive;
        const id = 'seerrfin-filters-' + (++nextId);
        const host = document.createElement('div');
        host.className = 'seerrfin-filter-host padded-left padded-right';
        host.innerHTML = `<div class="seerrfin-filter-heading sectionTitleContainer-cards"><h2 class="sectionTitle">${escapeHtml(title || (type === 'movie' ? 'Movies' : 'TV Shows'))}</h2><button type="button" class="seerrfin-filter-icon" data-filter-open aria-label="${type === 'movie' ? 'Movie' : 'TV'} filters" title="Filters"><span class="material-icons" aria-hidden="true">settings</span><span data-filter-count hidden></span></button></div><div class="seerrfin-filter-results" aria-live="polite"></div>`;
        parent.prepend(host);
        const modal = document.createElement('div');
        modal.className = 'seerrfin-filter-modal';
        modal.innerHTML = modalHtml(type, id);
        const state = { userId, type, title, requestId: 0, choicesId: 0, providerId: 0, applied: null, page: 1, region: 'US', choicesReady: false };
        host._filterState = state;
        const form = modal.querySelector('form');
        const results = host.querySelector('.seerrfin-filter-results');
        const openButton = host.querySelector('[data-filter-open]');
        const current = () => host.isConnected && ApiClient.getCurrentUserId() === userId;
        const checked = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`));
        const status = modal.querySelector('[data-filter-form-status]');

        function queryValues() {
            const data = new FormData(form); const query = new URLSearchParams();
            new Set(data.keys()).forEach(function (key) {
                if (key === 'languageChoices') return;
                const values = data.getAll(key).filter(value => value !== '');
                if (values.length) query.set(key, values.join(separators[key] || ','));
            });
            if (query.get('sortBy') === 'popularity.desc') query.delete('sortBy');
            if (!query.has('watchProviders')) query.delete('watchRegion');
            return query;
        }
        function updateCount() {
            const count = countFilters(queryValues());
            modal.querySelector('[data-filter-modal-count]').textContent = count + ' active filter' + (count === 1 ? '' : 's');
            form.querySelector('[data-filter-clear]').disabled = count === 0 && !state.applied;
        }
        function updateBadge() {
            const count = state.applied ? countFilters(state.applied) : 0;
            const badge = host.querySelector('[data-filter-count]');
            badge.textContent = count; badge.hidden = count === 0;
        }
        function close() {
            if (openState !== state) return;
            openState = null;
            modal.remove();
            state.observer.disconnect();
            document.removeEventListener('keydown', keydown);
            document.body.style.overflow = state.overflow;
            if (openButton.isConnected && ApiClient.getCurrentUserId() === userId) openButton.focus();
        }
        state.close = close;
        function open() {
            if (!current() || openState === state) return;
            openState?.close();
            state.overflow = document.body.style.overflow;
            openState = state;
            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';
            state.observer = new MutationObserver(function () { if (!current()) close(); });
            state.observer.observe(document.body, { childList: true, subtree: true });
            document.addEventListener('keydown', keydown);
            modal.querySelector('button[data-filter-close]').focus();
            if (state.choicesId === 0) choices();
            updateCount();
        }
        function keydown(event) {
            if (openState !== state) return;
            if (event.key === 'Escape') { event.preventDefault(); close(); return; }
            if (event.key !== 'Tab') return;
            const elements = Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled)')).filter(element => !element.closest('[hidden]'));
            const first = elements[0]; const last = elements[elements.length - 1];
            if (!elements.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        function refreshPicker(field) {
            const selected = Array.from(field.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.nextElementSibling.textContent);
            const text = selected.length ? selected.join(', ') : 'Any';
            field.querySelector('[data-filter-pick-text]').textContent = text;
            field.querySelector('[data-filter-pick-toggle]').setAttribute('aria-label', field.querySelector('.seerrfin-filter-label').textContent + ': ' + text);
        }
        function closePickers(except) {
            modal.querySelectorAll('[data-filter-pick]').forEach(function (field) {
                if (field === except) return;
                field.querySelector('.seerrfin-filter-pick-options').hidden = true;
                field.querySelector('[data-filter-pick-toggle]').setAttribute('aria-expanded', 'false');
            });
        }
        function providers() {
            const region = form.elements.watchRegion.value;
            const requestId = ++state.providerId;
            const target = form.querySelector('[data-filter-providers]');
            target.innerHTML = '';
            const more = form.querySelector('[data-filter-providers-more]');
            more.hidden = true; more.textContent = 'Show more';
            const providerStatus = form.querySelector('[data-filter-providers-status]');
            if (!region) return;
            providerStatus.textContent = 'Loading streaming services…';
            api(type, true, new URLSearchParams({ kind: 'providers', region })).then(function (items) {
                if (!current() || requestId !== state.providerId) return;
                target.innerHTML = items.map((item, index) => {
                    const logo = /^\/[a-zA-Z0-9_.-]+$/.test(item.logoPath || '') ? `<img src="https://image.tmdb.org/t/p/w92${escapeHtml(item.logoPath)}" alt="" loading="lazy">` : '<span class="material-icons" aria-hidden="true">live_tv</span>';
                    return `<label${index >= 24 ? ' data-filter-extra-provider hidden' : ''} title="${escapeHtml(item.name)}"><input type="checkbox" name="watchProviders" value="${escapeHtml(item.id)}"><span class="seerrfin-filter-provider-logo">${logo}</span><span class="seerrfin-filter-provider-name">${escapeHtml(item.name)}</span></label>`;
                }).join('');
                more.hidden = items.length <= 24;
                providerStatus.textContent = items.length ? '' : 'No streaming services in this region.';
                updateCount();
            }).catch(async function (error) {
                const message = await errorMessage(error);
                if (!current() || requestId !== state.providerId) return;
                providerStatus.innerHTML = `${escapeHtml(message)} <button type="button" class="emby-button" data-filter-providers-retry>Retry</button>`;
            });
        }
        function choices() {
            const requestId = ++state.choicesId;
            const choicesStatus = form.querySelector('[data-filter-choices-status]');
            choicesStatus.textContent = 'Loading filters…';
            api(type, true, '').then(function (data) {
                if (!current() || requestId !== state.choicesId) return;
                form.querySelector('[data-filter-pick="genre"] [data-filter-pick-items]').innerHTML = checkboxes(data.genres, 'genre');
                form.querySelector('[data-filter-pick="languageChoices"] [data-filter-pick-items]').innerHTML = checkboxes(data.languages.slice().sort((a, b) => a.name.localeCompare(b.name)), 'languageChoices');
                form.elements.watchRegion.innerHTML = optionsHtml(data.regions);
                state.region = data.regions.some(x => x.id === data.region) ? data.region : (data.regions[0]?.id || '');
                form.elements.watchRegion.value = state.region;
                if (data.originalLanguage) {
                    const names = data.originalLanguage.split('|').map(code => data.languages.find(x => x.id === code)?.name || code).join(', ');
                    form.querySelector('[data-filter-language-mode] option[value="server"]').textContent = 'Default (' + (data.originalLanguage === 'all' ? 'All languages' : names) + ')';
                }
                state.choicesReady = true;
                form.querySelector('[data-filter-apply]').disabled = false;
                choicesStatus.textContent = '';
                providers();
            }).catch(async function (error) {
                const message = await errorMessage(error);
                if (!current() || requestId !== state.choicesId) return;
                choicesStatus.innerHTML = `${escapeHtml(message)} <button type="button" class="emby-button" data-filter-choices-retry>Retry</button>`;
            });
        }
        function load(page) {
            const requestId = ++state.requestId;
            state.page = page;
            const query = new URLSearchParams(state.applied); query.set('page', page);
            parent.dataset.seerrfinFilterActive = 'true';
            results.innerHTML = '<p role="status">Loading titles…</p>';
            api(type, false, query).then(function (data) {
                if (!current() || requestId !== state.requestId) return;
                state.page = data.page;
                const plugin = window.seerrFinPlugin;
                const nativeCards = plugin.shouldUseNativeGridPages();
                results.classList.toggle('uses-backdrops', plugin.shouldUseBackdropThumbnails());
                results.innerHTML = `${data.items.length ? '' : '<p role="status">No titles match these filters.</p>'}<div class="seerrfin-filter-grid itemsContainer">${plugin.createDiscoverCards(data.items, true, { nativeCards })}</div>
                    <div class="seerrfin-filter-pagination"><button type="button" class="emby-button raised" data-filter-page="${data.page - 1}"${data.page <= 1 ? ' disabled' : ''}>Previous</button>
                    <span>Page ${data.page} of ${data.totalPages}</span><button type="button" class="emby-button raised" data-filter-page="${data.page + 1}"${data.page >= data.totalPages ? ' disabled' : ''}>Next</button></div>`;
                plugin.initNativeOrCustomCards(results.querySelector('.itemsContainer'), nativeCards);
            }).catch(async function (error) {
                const message = await errorMessage(error);
                if (!current() || requestId !== state.requestId) return;
                results.innerHTML = `<p role="alert">${escapeHtml(message)}</p><button type="button" class="emby-button raised" data-filter-results-retry>Retry</button>`;
            });
        }
        function updateRange(field, changed) {
            const min = field.querySelector('[data-range-min]'); const max = field.querySelector('[data-range-max]');
            if (Number(min.value) > Number(max.value)) {
                if (changed === min) max.value = min.value;
                else min.value = max.value;
            }
            const prefix = field.dataset.filterRange;
            form.elements[prefix + 'Gte'].value = min.value === min.min ? '' : min.value;
            form.elements[prefix + 'Lte'].value = max.value === max.max ? '' : max.value;
            field.querySelector('output').textContent = min.value + ' – ' + max.value + field.dataset.suffix;
            const width = Number(max.max) - Number(min.min);
            const fill = field.querySelector('.seerrfin-filter-range-fill');
            fill.style.left = ((Number(min.value) - Number(min.min)) / width * 100) + '%';
            fill.style.right = ((Number(max.max) - Number(max.value)) / width * 100) + '%';
        }
        function clear() {
            ++state.requestId; state.applied = null; state.page = 1;
            form.reset();
            form.elements.watchRegion.value = state.region;
            form.querySelector('[data-filter-languages]').hidden = true;
            form.elements.language.value = '';
            form.querySelectorAll('[data-filter-range]').forEach(field => updateRange(field));
            form.querySelectorAll('[data-filter-pick]').forEach(function (field) {
                field.querySelectorAll('[data-filter-pick-items] label').forEach(label => { label.hidden = false; });
                refreshPicker(field);
            });
            closePickers();
            form.querySelectorAll('[data-filter-search]').forEach(function (field) {
                const input = field.querySelector('input[type="search"]');
                ++input._queryId; clearTimeout(input._timer); input._choices = [];
                hideSuggestions(field); field.querySelector('[data-search-status]').textContent = '';
                field._selected = []; renderTags(field);
            });
            results.innerHTML = ''; status.textContent = ''; delete parent.dataset.seerrfinFilterActive;
            updateBadge(); updateCount(); providers(); close();
        }
        function hideSuggestions(field) {
            field.querySelector('.seerrfin-filter-suggestions').hidden = true;
            field.querySelector('input[type="search"]').setAttribute('aria-expanded', 'false');
        }
        function renderTags(field) {
            const selected = field._selected || [];
            field.querySelector('input[type="hidden"]').value = selected.map(x => x.id).join(',');
            field.querySelector('.seerrfin-filter-tags').innerHTML = selected.map(item => `<button type="button" data-filter-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">${escapeHtml(item.name)}<span class="material-icons" aria-hidden="true">close</span></button>`).join('');
            updateCount();
        }
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!current() || !state.choicesReady || !form.reportValidity()) return;
            status.textContent = '';
            const mode = form.querySelector('[data-filter-language-mode]');
            if (mode.value === 'custom' && checked('languageChoices').length === 0) {
                status.textContent = 'Select at least one language.'; mode.focus(); return;
            }
            state.applied = queryValues(); updateBadge(); updateCount(); close(); load(1);
        });
        form.addEventListener('input', function (event) {
            const field = event.target.closest('[data-filter-range]');
            if (field) updateRange(field, event.target);
            const picker = event.target.closest('[data-filter-pick]');
            if (picker && event.target.type === 'search') {
                const term = event.target.value.toLocaleLowerCase();
                picker.querySelectorAll('[data-filter-pick-items] label').forEach(label => { label.hidden = !label.textContent.toLocaleLowerCase().includes(term); });
            }
            updateCount();
        });
        form.addEventListener('change', function (event) {
            const input = event.target;
            if (input.name === 'watchRegion') providers();
            if (input.type === 'checkbox' && ['genre', 'languageChoices', 'watchProviders'].includes(input.name) && checked(input.name).length > 20) {
                input.checked = false; status.textContent = 'Select up to 20 options.';
            } else status.textContent = '';
            const picker = input.closest('[data-filter-pick]');
            if (picker) refreshPicker(picker);
            const mode = form.querySelector('[data-filter-language-mode]').value;
            form.querySelector('[data-filter-languages]').hidden = mode !== 'custom';
            form.elements.language.value = mode === 'all' ? 'all' : mode === 'custom' ? checked('languageChoices').map(item => item.value).join('|') : '';
            updateCount();
        });
        host.addEventListener('click', function (event) {
            if (!current()) return;
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            if (button.hasAttribute('data-filter-open')) open();
            else if (button.hasAttribute('data-filter-page')) load(Number(button.dataset.filterPage));
            else if (button.hasAttribute('data-filter-results-retry')) load(state.page);
        });
        modal.addEventListener('click', function (event) {
            if (!current()) { close(); return; }
            if (event.target.closest('[data-filter-close]')) { close(); return; }
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            if (button.hasAttribute('data-filter-clear')) { clear(); return; }
            if (button.hasAttribute('data-filter-choices-retry')) choices();
            if (button.hasAttribute('data-filter-providers-retry')) providers();
            if (button.hasAttribute('data-filter-providers-more')) {
                const showing = button.textContent === 'Show more';
                form.querySelectorAll('[data-filter-extra-provider]').forEach(item => { item.hidden = !showing; });
                button.textContent = showing ? 'Show less' : 'Show more';
            }
            const picker = button.closest('[data-filter-pick]');
            if (button.hasAttribute('data-filter-pick-toggle')) {
                const options = picker.querySelector('.seerrfin-filter-pick-options');
                options.hidden = !options.hidden;
                button.setAttribute('aria-expanded', String(!options.hidden));
                closePickers(picker);
                if (!options.hidden) options.querySelector('input').focus();
            }
            const field = button.closest('[data-filter-search]');
            if (!field) return;
            if (button.hasAttribute('data-filter-remove')) {
                field._selected = (field._selected || []).filter(x => String(x.id) !== button.dataset.filterRemove); renderTags(field);
            } else if (button.hasAttribute('data-filter-choose')) {
                const input = field.querySelector('input[type="search"]');
                const item = (input._choices || []).find(x => String(x.id) === button.dataset.filterChoose);
                if (!item) return;
                const selected = field._selected || [];
                const searchStatus = field.querySelector('[data-search-status]');
                if (selected.length >= 20 && field.dataset.filterSearch !== 'studio') { searchStatus.textContent = 'Select up to 20 keywords.'; return; }
                field._selected = field.dataset.filterSearch === 'studio' ? [item] : (selected.some(x => x.id === item.id) ? selected : selected.concat(item));
                input.value = ''; searchStatus.textContent = ''; hideSuggestions(field); renderTags(field);
                ++input._queryId; clearTimeout(input._timer); input.focus();
            }
        });
        modal.querySelectorAll('[data-filter-search]').forEach(function (field) {
            const input = field.querySelector('input[type="search"]');
            input._queryId = 0;
            input.addEventListener('input', function () {
                clearTimeout(input._timer); const requestId = ++input._queryId;
                const term = input.value.trim(); const searchStatus = field.querySelector('[data-search-status]');
                input._choices = []; hideSuggestions(field); searchStatus.textContent = '';
                if (term.length < 2) return;
                input._timer = setTimeout(function () {
                    api(type, true, new URLSearchParams({ kind: field.dataset.kind, query: term })).then(function (items) {
                        if (!current() || requestId !== input._queryId) return;
                        input._choices = items;
                        const suggestions = field.querySelector('.seerrfin-filter-suggestions');
                        suggestions.innerHTML = items.map(x => `<button type="button" role="option" aria-selected="false" data-filter-choose="${x.id}">${escapeHtml(x.name)}</button>`).join('');
                        suggestions.hidden = items.length === 0;
                        input.setAttribute('aria-expanded', String(items.length > 0));
                        searchStatus.textContent = items.length ? '' : 'No matches.';
                    }).catch(async function (error) {
                        const message = await errorMessage(error);
                        if (current() && requestId === input._queryId) searchStatus.textContent = message;
                    });
                }, 250);
            });
            field.addEventListener('keydown', function (event) {
                const suggestions = field.querySelector('.seerrfin-filter-suggestions');
                if (event.key === 'Enter' && event.target === input) {
                    event.preventDefault();
                    if (!suggestions.hidden) suggestions.querySelector('button')?.click();
                    return;
                }
                if (suggestions.hidden) return;
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideSuggestions(field); input.focus(); return; }
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                const items = Array.from(suggestions.querySelectorAll('button'));
                const index = items.indexOf(document.activeElement);
                const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                event.preventDefault(); items[next]?.focus();
            });
        });
    }
    window.seerrFinFilters = { mount };
    window.addEventListener('hashchange', () => openState?.close());
    document.addEventListener('viewshow', function () {
        if (typeof ApiClient === 'undefined') return;
        if (openState && openState.userId !== ApiClient.getCurrentUserId()) openState.close();
        document.querySelectorAll('.seerrfin-filter-host').forEach(function (host) {
            if (host._filterState.userId !== ApiClient.getCurrentUserId()) mount(host.parentElement, host._filterState.type, host._filterState.title);
        });
    });
})();
