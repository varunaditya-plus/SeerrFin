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

if (typeof window.seerrFinPlugin === 'undefined') {
    const log = window.seerrFinLog;

    window.seerrFinPlugin = {
        movieRows: [
            { title: 'Trending movies this week', path: 'discover/movies/trending' },
            { title: 'Popular movies', path: 'discover/movies/popular' },
            { title: 'Top rated movies', path: 'discover/movies/top-rated' },
            { title: 'Upcoming movies', path: 'discover/movies/upcoming' }
        ],

        tvRows: [
            { title: 'Trending shows this week', path: 'discover/tv/trending' },
            { title: 'Popular shows', path: 'discover/tv/popular' },
            { title: 'Top rated series', path: 'discover/tv/top-rated' },
            { title: 'Upcoming series', path: 'discover/tv/upcoming' },
            { title: 'Anime series', path: 'discover/tv/anime' }
        ],

        _watchersReady: false,
        _handlersBound: false,
        _gridPageSize: 40,
        _carouselScrollThreshold: 1200,
        _displaySettings: null,
        _displaySettingsPromise: null,
        _tabSettingsSnapshot: null,
        _tabConfig: null,
        _tabConfigPromise: null,
        _tabsEnsuring: false,
        _lastSearchQuery: null,
        _lastSearchItems: null,
        _activeSearchToken: null,

        TAB_DEFS: {
            movies: { sectionClass: 'seerrfin-movies-sections', defaultTitle: 'Movies' },
            tv: { sectionClass: 'seerrfin-tv-sections', defaultTitle: 'TV Shows' },
            requests: { sectionClass: 'seerrfin-requests-sections', defaultTitle: 'Requests' },
            letterboxd: { sectionClass: 'seerrfin-letterboxd-sections', defaultTitle: 'Letterboxd' }
        },

        CUSTOM_TABS_PLUGIN_ID: 'fbacd0b6-fd46-4a05-b0a4-2045d6a135b0',

        init: function () {
            if (typeof ApiClient === 'undefined') {
                log.warn('init waiting for ApiClient');
                setTimeout(() => this.init(), 200);
                return;
            }

            if (!this._handlersBound) {
                this._handlersBound = true;
                log.info('init binding handlers');
                this.bindRequestHandler();
                this.bindCardClickHandler();
                this.bindViewMoreHandler();
                this.bindModernNavigation();
                this.loadDisplaySettings();
                this.setupSearchIntegration();
            }

            if (!this._watchersReady) {
                this._watchersReady = true;
                log.info('init setting up native tab watchers');
                this.setupNativeTabWatchers();
            }

            this.ensureNativeTabs().then(function () {
                window.seerrFinPlugin.scheduleRender();
            });
        },

        isContainerVisible: function (container) {
            if (!container || !container.isConnected) {
                return false;
            }

            // jf hides inactive pages with .hide rather than removing from the actual page
            const page = container.closest('.page');
            if (page && page.classList.contains('hide')) {
                return false;
            }

            const tabPanel = container.closest('.tabContent, .pageTabContent');
            if (tabPanel && tabPanel.classList.contains('hide')) {
                return false;
            }

            if (tabPanel && tabPanel.classList.contains('pageTabContent') && !tabPanel.classList.contains('is-active')) {
                return false;
            }

            return container.offsetParent !== null;
        },

        findActiveContainer: function (selector) {
            // jf might keep the duplicate tab dom, so prefer last match
            const all = document.querySelectorAll(selector);
            for (let i = all.length - 1; i >= 0; i--) {
                if (this.isContainerVisible(all[i])) {
                    return all[i];
                }
            }
            return null;
        },

        asArray: function (data) {
            if (!data) {
                return [];
            }
            if (Array.isArray(data)) {
                return data;
            }
            if (data.results && Array.isArray(data.results)) {
                return data.results;
            }
            return [];
        },

        scheduleRender: function () {
            const self = this;
            if (self._renderPending) {
                return;
            }
            self._renderPending = true;
            requestAnimationFrame(function () {
                self._renderPending = false;
                self.renderIfContainerVisible('movies');
                self.renderIfContainerVisible('tv');
            });
        },

        getDefaultTabConfig: function () {
            const self = this;
            return Object.keys(this.TAB_DEFS).map(function (id) {
                return { id: id, enabled: true, title: self.TAB_DEFS[id].defaultTitle };
            });
        },

        resolveTabTitle: function (id, title) {
            const value = String(title || '').trim();
            const tabDef = this.TAB_DEFS[id];
            return value || (tabDef && tabDef.defaultTitle) || id;
        },

        normalizeTabConfig: function (tabs) {
            const self = this;
            const defaults = this.getDefaultTabConfig();
            const enabledById = {};
            const titleById = {};
            (Array.isArray(tabs) ? tabs : []).forEach(function (tab) {
                const id = String(tab && tab.id || '').toLowerCase();
                if (!defaults.some(function (item) { return item.id === id; })) {
                    return;
                }
                enabledById[id] = tab.enabled !== false;
                const title = String(tab.title || '').trim();
                if (title) {
                    titleById[id] = title;
                }
            });

            return defaults.map(function (tab) {
                return {
                    id: tab.id,
                    enabled: Object.prototype.hasOwnProperty.call(enabledById, tab.id)
                        ? enabledById[tab.id]
                        : true,
                    title: Object.prototype.hasOwnProperty.call(titleById, tab.id)
                        ? titleById[tab.id]
                        : self.resolveTabTitle(tab.id)
                };
            });
        },

        findActiveHomePage: function () {
            // Jellyfin 12 legacy view caches pages by route, so multiple indexPage IDs can stay mounted. The newest page without .hide uses the header
            const pages = document.querySelectorAll('.page:not(.hide)');
            for (let i = pages.length - 1; i >= 0; i--) {
                if (!pages[i].closest('.hide')) {
                    return pages[i].id === 'indexPage' ? pages[i] : null;
                }
            }
            return null;
        },

        isHomeTabContext: function () {
            const hash = window.location.hash || '';
            const onHomeHash = hash === '' ||
                hash === '#/home' ||
                hash === '#/home.html' ||
                hash.indexOf('#/home?') === 0 ||
                hash.indexOf('#/home.html?') === 0;
            if (!onHomeHash) {
                return false;
            }

            return !!this.findActiveHomePage();
        },

        cleanupSeerrFinHeaderButtons: function () {
            document.querySelectorAll('.headerTabs [data-seerrfin-tab]').forEach(function (btn) {
                btn.remove();
            });
        },

        seerrFinBarKey: function (id) {
            return 'sf:' + String(id || '').toLowerCase();
        },

        customTabsBarKey: function (index) {
            return 'ct:' + index;
        },

        isLegacySeerrFinCustomTabHtml: function (html) {
            const value = String(html || '').toLowerCase();
            const tabDefs = this.TAB_DEFS;
            return Object.keys(tabDefs).some(function (id) {
                return value.indexOf(tabDefs[id].sectionClass) !== -1;
            });
        },

        normalizeBarOrder: function (barOrder, customTabs) {
            const self = this;
            const customList = Array.isArray(customTabs) ? customTabs : [];
            const result = [];
            const seen = {};

            function add(key) {
                if (!key || seen[key]) {
                    return;
                }
                seen[key] = true;
                result.push(key);
            }

            add('jf:home');
            add('jf:favorites');

            (Array.isArray(barOrder) ? barOrder : []).forEach(function (raw) {
                let key = String(raw || '').trim();
                if (!key) {
                    return;
                }

                if (self.TAB_DEFS[key.toLowerCase()]) {
                    key = self.seerrFinBarKey(key);
                }

                if (key === 'jf:home' || key === 'jf:favorites') {
                    return;
                }

                if (key.indexOf('sf:') === 0) {
                    const id = key.slice(3);
                    if (self.TAB_DEFS[id]) {
                        add(self.seerrFinBarKey(id));
                    }
                    return;
                }

                if (key.indexOf('ct:') === 0) {
                    const index = parseInt(key.slice(3), 10);
                    if (!isNaN(index) && index >= 0 && index < customList.length && !customList[index].legacySeerrFin) {
                        add(self.customTabsBarKey(index));
                    }
                }
            });

            Object.keys(self.TAB_DEFS).forEach(function (id) {
                add(self.seerrFinBarKey(id));
            });

            customList.forEach(function (tab, index) {
                if (!tab.legacySeerrFin) {
                    add(self.customTabsBarKey(index));
                }
            });

            return result;
        },

        loadCustomTabsConfig: function () {
            const self = this;

            function mapTabs(tabs) {
                return (Array.isArray(tabs) ? tabs : []).map(function (tab, index) {
                    return {
                        index: index,
                        legacySeerrFin: self.isLegacySeerrFinCustomTabHtml(tab.ContentHtml || tab.contentHtml || '')
                    };
                });
            }

            return ApiClient.ajax({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json'
            }).then(mapTabs).catch(function () {
                return ApiClient.getPluginConfiguration(self.CUSTOM_TABS_PLUGIN_ID).then(function (config) {
                    return mapTabs(config.Tabs || config.tabs);
                }).catch(function () {
                    return [];
                });
            });
        },

        loadTabConfig: function () {
            const self = this;
            if (self._tabConfig) {
                return Promise.resolve(self._tabConfig);
            }
            if (self._tabConfigPromise) {
                return self._tabConfigPromise;
            }

            const displaySettingsPromise = self._tabSettingsSnapshot
                ? Promise.resolve(self._tabSettingsSnapshot)
                : self.loadDisplaySettings().then(function () {
                    return self._tabSettingsSnapshot || {};
                });

            self._tabConfigPromise = Promise.all([
                displaySettingsPromise,
                self.loadCustomTabsConfig()
            ]).then(function (results) {
                const settings = results[0] || {};
                const customTabs = results[1] || [];
                const tabs = self.normalizeTabConfig(settings.tabs);
                return {
                    tabs: tabs,
                    tabBarOrder: self.normalizeBarOrder(settings.tabBarOrder, customTabs),
                    customTabs: customTabs
                };
            }).catch(function (err) {
                log.warn('tab config fetch failed, using defaults', err);
                const tabs = self.getDefaultTabConfig();
                return {
                    tabs: tabs,
                    tabBarOrder: self.normalizeBarOrder([], []),
                    customTabs: []
                };
            }).then(function (config) {
                self._tabConfig = config;
                self._tabConfigPromise = null;
                return config;
            });

            return self._tabConfigPromise;
        },

        syncTabPanelsActiveState: function (selectedIndex) {
            if (isNaN(selectedIndex) || !this.isHomeTabContext()) {
                return;
            }

            const page = this.findActiveHomePage();
            page.querySelectorAll('.tabContent[data-index]').forEach(function (panel) {
                const panelIndex = parseInt(panel.getAttribute('data-index'), 10);
                panel.classList.toggle('is-active', panelIndex === selectedIndex);
            });
        },

        attachPluginTabGuard: function (tabs) {
            if (!tabs || tabs.dataset.seerrfinPluginTabGuard === 'true') {
                return;
            }

            tabs.dataset.seerrfinPluginTabGuard = 'true';
            log.info('native tab guard attached');
            const self = this;

            tabs.addEventListener('click', function (event) {
                if (!self.isHomeTabContext()) {
                    return;
                }
                const route = new URLSearchParams(window.location.hash.split('?')[1] || '');
                const button = event.target.closest && event.target.closest('.emby-tab-button');
                if ((!route.has('seerrfinTab') && !route.has('tab')) || !button || button.classList.contains('hide')) {
                    return;
                }
                const id = button.getAttribute('data-seerrfin-tab');
                const index = parseInt(button.getAttribute('data-index'), 10);
                if (isNaN(index)) {
                    return;
                }
                // Legacy tab clicks do not update the route, so keep a home deep link in sync so a later header refresh cant restore the tab just left
                window.location.hash = id ? '#/home?seerrfinTab=' + id : (index === 0 ? '#/home' : '#/home?tab=' + index);
            }, true);

            tabs.addEventListener('beforetabchange', function (event) {
                if (!self.isHomeTabContext()) {
                    return;
                }

                const index = parseInt(event.detail && event.detail.selectedTabIndex, 10);
                if (isNaN(index)) {
                    return;
                }

                // jellyfin activates panels by NodeList index.
                // sync by data-index so SeerrFin panels stay in the right order.
                self.syncTabPanelsActiveState(index);
                requestAnimationFrame(function () { self.syncModernNavigation(); });

                const selectedButton = tabs.querySelector('.emby-tab-button[data-index="' + index + '"]');
                if (selectedButton && selectedButton.getAttribute('data-seerrfin-tab')) {
                    log.info('SeerrFin tab before change to index ' + index);
                    setTimeout(function () {
                        if (self.isHomeTabContext()) {
                            self.onSeerrFinTabShown();
                        }
                    }, 0);
                }
            }, true);

            // Jellyfin HomeView only has controllers for Home/Favorites (block plugin tabs by identity)
            tabs.addEventListener('tabchange', function (event) {
                if (!self.isHomeTabContext()) {
                    return;
                }

                const index = parseInt(event.detail && event.detail.selectedTabIndex, 10);
                if (isNaN(index)) {
                    return;
                }

                const selectedButton = tabs.querySelector('.emby-tab-button[data-index="' + index + '"]');
                if (!selectedButton) {
                    return;
                }

                const isPluginTab = index > 1;
                if (!isPluginTab) {
                    return;
                }

                log.info('blocking Jellyfin tabchange handler for plugin tab index ' + index);
                event.stopImmediatePropagation();
            }, true);
        },

        onSeerrFinTabShown: function () {
            const self = this;
            log.info('SeerrFin tab shown, scheduling render');
            setTimeout(function () {
                self.scheduleRender();
                if (typeof window.__seerrFinRequestsEnsureMounted === 'function') {
                    window.__seerrFinRequestsEnsureMounted({ tabShown: true });
                }
                if (typeof window.__seerrFinLetterboxdEnsureMounted === 'function') {
                    window.__seerrFinLetterboxdEnsureMounted();
                }
            }, 0);
        },

        removeObsoleteSeerrFinPanels: function (page, slots) {
            const tabDefs = this.TAB_DEFS;
            const sectionSelector = Object.keys(tabDefs).map(function (id) {
                return '.' + tabDefs[id].sectionClass;
            }).join(', ');
            const activeIds = new Set(slots.filter(function (slot) {
                return slot.type === 'seerrfin';
            }).map(function (slot) {
                return slot.id;
            }));

            page.querySelectorAll('.tabContent').forEach(function (panel) {
                const reservedIndex = panel.getAttribute('data-seerrfin-reserved-index');
                if (reservedIndex !== null) {
                    if (!slots.some(function (slot) { return slot.key === 'reserved:' + reservedIndex; })) panel.remove();
                    return;
                }
                const id = panel.getAttribute('data-seerrfin-tab');
                if (id) {
                    if (!activeIds.has(id)) {
                        panel.remove();
                    }
                    return;
                }

                if (panel.querySelector(sectionSelector)) {
                    panel.remove();
                }
            });
        },

        createTabButton: function (id, title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'emby-button-foreground';
            titleEl.textContent = this.resolveTabTitle(id, title);

            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('is', 'empty-button');
            button.className = 'emby-tab-button emby-button';
            button.setAttribute('data-seerrfin-tab', id);
            button.appendChild(titleEl);
            return button;
        },

        setTabButtonTitle: function (button, id, title) {
            if (!button) {
                return;
            }
            const titleEl = button.querySelector('.emby-button-foreground');
            const nextTitle = this.resolveTabTitle(id, title);
            if (titleEl && titleEl.textContent !== nextTitle) {
                titleEl.textContent = nextTitle;
            }
        },

        applyTabTitles: function (tabsSlider, slots) {
            const self = this;
            (slots || []).forEach(function (slot) {
                if (slot.type !== 'seerrfin') {
                    return;
                }
                const button = tabsSlider.querySelector('[data-seerrfin-tab="' + slot.id + '"]');
                self.setTabButtonTitle(button, slot.id, slot.title);
            });
        },

        createTabPanel: function (id) {
            const panel = document.createElement('div');
            panel.className = 'tabContent pageTabContent';
            panel.setAttribute('data-seerrfin-tab', id);

            const sections = document.createElement('div');
            sections.className = 'sections ' + this.TAB_DEFS[id].sectionClass;
            panel.appendChild(sections);
            return panel;
        },

        findJellyfinTabButton: function (tabsSlider, kind) {
            const buttons = Array.from(tabsSlider.querySelectorAll('.emby-tab-button'));
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                if (btn.hasAttribute('data-seerrfin-tab') || (btn.id || '').indexOf('customTabButton_') === 0) {
                    continue;
                }
                const index = parseInt(btn.getAttribute('data-index'), 10);
                if (kind === 'home' && index === 0) {
                    return btn;
                }
                if (kind === 'favorites' && index === 1) {
                    return btn;
                }
            }

            // Fallback only while still on home: first two non-plugin buttons in DOM order.
            const native = buttons.filter(function (btn) {
                return !btn.hasAttribute('data-seerrfin-tab') && (btn.id || '').indexOf('customTabButton_') !== 0;
            });
            if (kind === 'home') {
                return native[0] || null;
            }
            return native[1] || null;
        },

        buildDesiredBarSlots: function (config) {
            const self = this;
            const tabsById = {};
            (config.tabs || []).forEach(function (tab) {
                tabsById[tab.id] = tab;
            });

            return (config.tabBarOrder || []).map(function (key) {
                if (key === 'jf:home') {
                    return { key: key, type: 'jellyfin', id: 'home' };
                }
                if (key === 'jf:favorites') {
                    return { key: key, type: 'jellyfin', id: 'favorites' };
                }
                if (key.indexOf('sf:') === 0) {
                    const id = key.slice(3);
                    const tab = tabsById[id];
                    if (!tab || tab.enabled === false || !self.TAB_DEFS[id]) {
                        return null;
                    }
                    return { key: key, type: 'seerrfin', id: id, title: tab.title };
                }
                if (key.indexOf('ct:') === 0) {
                    const index = parseInt(key.slice(3), 10);
                    const custom = (config.customTabs || [])[index];
                    if (!custom || custom.legacySeerrFin) {
                        return null;
                    }
                    return { key: key, type: 'customtabs', index: index };
                }
                return null;
            }).filter(Boolean);
        },

        barPlacementSignature: function (slots) {
            return slots.map(function (slot) {
                return slot.key;
            }).join('|');
        },

        includeExternalTabSlots: function (page, tabsSlider, slots) {
            // Only count mounted Custom Tabs when reserving jellyfin enhanced's numeric indices. A late or disabled Custom Tab cant shift the external tab's actual slot
            const result = slots.filter(function (slot) {
                return slot.type !== 'customtabs' || (tabsSlider.querySelector('#customTabButton_' + slot.index) && page.querySelector('[id="customTab_' + slot.index + '"]'));
            });
            const external = [];
            tabsSlider.querySelectorAll('.emby-tab-button').forEach(function (button) {
                const index = parseInt(button.getAttribute('data-index'), 10);
                if (index < 2 || isNaN(index) || button.hasAttribute('data-seerrfin-tab') || button.hasAttribute('data-seerrfin-reserved-index') || /^customTabButton_/.test(button.id)) {
                    return;
                }

                // Enhanced caches tab indices for its header links, so keep these slots in place, including when its cached index collides with a newly built bar
                const enhancedId = /^je-native-tab-btn-(.+)$/.exec(button.id);
                const panel = enhancedId
                    ? page.querySelector('[id="je-native-tab-panel-' + enhancedId[1] + '"]')
                    : Array.from(page.querySelectorAll('.tabContent')).find(function (candidate) {
                        return candidate.getAttribute('data-index') === String(index) && !candidate.hasAttribute('data-seerrfin-tab') && !/^(homeTab|favoritesTab|customTab_)/.test(candidate.id);
                    });
                if (panel) {
                    external.push({ key: 'external:' + (button.id || index), type: 'external', index: index, button: button, panel: panel });
                }
            });
            external.sort(function (a, b) { return a.index - b.index; });
            external.forEach(function (slot) {
                // Disabling one of our tabs should not renumber an Enhanced tab whose cached deep link is later in the strip. Hidden slots retain that index
                while (result.length < slot.index) {
                    result.push({ key: 'reserved:' + result.length, type: 'reserved', index: result.length });
                }
                result.splice(slot.index, 0, slot);
            });
            return result;
        },

        readCurrentBarSignature: function (tabsSlider) {
            return Array.from(tabsSlider.querySelectorAll('.emby-tab-button')).map(function (btn) {
                if (btn.hasAttribute('data-seerrfin-reserved-index')) {
                    return 'reserved:' + btn.getAttribute('data-seerrfin-reserved-index');
                }
                const sf = btn.getAttribute('data-seerrfin-tab');
                if (sf) {
                    return 'sf:' + sf;
                }
                const ct = /^customTabButton_(\d+)$/.exec(btn.id || '');
                if (ct) {
                    return 'ct:' + ct[1];
                }
                const index = btn.getAttribute('data-index');
                if (index === '0') {
                    return 'jf:home';
                }
                if (index === '1') {
                    return 'jf:favorites';
                }
                return 'external:' + (btn.id || index);
            }).join('|');
        },

        waitForCustomTabs: function (customTabs, attemptsLeft) {
            const self = this;
            const page = self.findActiveHomePage();
            const missing = (customTabs || []).some(function (tab) {
                if (tab.legacySeerrFin) {
                    return false;
                }
                const button = document.querySelector('.headerTabs #customTabButton_' + tab.index);
                const panel = page && page.querySelector('[id="customTab_' + tab.index + '"]');
                return !button || !panel;
            });
            if (!missing || attemptsLeft <= 0) {
                return Promise.resolve();
            }

            return new Promise(function (resolve) {
                setTimeout(function () {
                    self.waitForCustomTabs(customTabs, attemptsLeft - 1).then(resolve);
                }, 150);
            });
        },

        // I figured out that reappending a node detaches it first, with emby itemscontainer dropping its fetchDate/getItemsHtml hooks when detached.
        // jellyfin's home rows start hidden and only show when hooks deliver items, so when we detach #homeTab, nothing ever loads.
        // jellyfin indexes tabs relative to .tabContent so nodes already there stay.
        placeInOrder: function (parent, nodes) {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const previous = i > 0 ? nodes[i - 1] : null;

                if (!previous) {
                    if (node.parentNode !== parent) {
                        parent.appendChild(node);
                    }
                    continue;
                }

                const alreadyAfter = node.parentNode === parent &&
                    (previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
                if (!alreadyAfter) {
                    parent.insertBefore(node, previous.nextSibling);
                }
            }
        },

        removeUnplannedTabButtons: function (tabsSlider, plannedButtons) {
            const keep = new Set(plannedButtons);
            tabsSlider.querySelectorAll('.emby-tab-button').forEach(function (button) {
                if (!keep.has(button) && (button.hasAttribute('data-seerrfin-tab') || button.hasAttribute('data-seerrfin-reserved-index') || /^customTabButton_/.test(button.id))) {
                    button.remove();
                }
            });
        },

        applyBarOrder: function (page, tabsSlider, slots) {
            const self = this;
            if (!self.isHomeTabContext() || !page || !tabsSlider) {
                return false;
            }

            const homeTab = page.querySelector('[id="homeTab"]');
            const favoritesTab = page.querySelector('[id="favoritesTab"]');
            if (!homeTab || !favoritesTab) {
                log.warn('home tab panels missing; skipping bar apply');
                return false;
            }

            // Resolve references first so we can abort before moving nodes.
            const planned = [];
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                let button = null;
                let panel = null;

                if (slot.type === 'jellyfin') {
                    button = self.findJellyfinTabButton(tabsSlider, slot.id);
                    panel = slot.id === 'home' ? homeTab : favoritesTab;
                    if (!button || !panel) {
                        continue;
                    }
                } else if (slot.type === 'customtabs') {
                    button = tabsSlider.querySelector('#customTabButton_' + slot.index);
                    // Never fabricate custom tab panels. empty placeholders remove real custom tab html on rebuild.
                    panel = page.querySelector('[id="customTab_' + slot.index + '"]');
                    if (!button || !panel) {
                        continue;
                    }
                } else if (slot.type === 'external') {
                    button = slot.button;
                    panel = slot.panel;
                } else if (slot.type === 'reserved') {
                    button = tabsSlider.querySelector('[data-seerrfin-reserved-index="' + slot.index + '"]');
                    panel = page.querySelector('.tabContent[data-seerrfin-reserved-index="' + slot.index + '"]');
                    if (!button) {
                        button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'emby-tab-button hide';
                        button.setAttribute('data-seerrfin-reserved-index', String(slot.index));
                    }
                    if (!panel) {
                        panel = document.createElement('div');
                        panel.className = 'tabContent pageTabContent hide';
                        panel.setAttribute('data-seerrfin-reserved-index', String(slot.index));
                    }
                } else if (slot.type === 'seerrfin') {
                    button = tabsSlider.querySelector('[data-seerrfin-tab="' + slot.id + '"]');
                    panel = page.querySelector('.tabContent[data-seerrfin-tab="' + slot.id + '"]');
                }

                planned.push({ slot: slot, button: button, panel: panel });
            }

            if (!planned.length || !self.isHomeTabContext()) {
                return false;
            }

            self.removeObsoleteSeerrFinPanels(page, slots);

            const orderedButtons = [];
            const orderedPanels = [];

            planned.forEach(function (item, placedIndex) {
                let button = item.button;
                let panel = item.panel;

                if (item.slot.type === 'seerrfin') {
                    if (!(button && button.getAttribute('data-seerrfin-tab') === item.slot.id)) {
                        button = self.createTabButton(item.slot.id, item.slot.title);
                    } else {
                        self.setTabButtonTitle(button, item.slot.id, item.slot.title);
                    }
                    if (!(panel && panel.getAttribute('data-seerrfin-tab') === item.slot.id)) {
                        panel = self.createTabPanel(item.slot.id);
                    }
                }

                button.setAttribute('data-index', String(placedIndex));
                panel.setAttribute('data-index', String(placedIndex));
                orderedButtons.push(button);
                orderedPanels.push(panel);
            });

            if (!self.isHomeTabContext()) {
                return false;
            }

            self.placeInOrder(tabsSlider, orderedButtons);
            self.removeUnplannedTabButtons(tabsSlider, orderedButtons);

            // Put Jellyfin, Custom Tabs, and SeerrFin panels in bar order.
            self.placeInOrder(page, orderedPanels);
            return true;
        },

        getModernNavId: function (link) {
            if (!link || !link.closest('header.MuiAppBar-root, .MuiDrawer-paper, #user-view-overflow-menu, .customMenuOptions')) return null;
            const match = /^#\/home\?seerrfinTab=(movies|tv|requests|letterboxd)$/.exec(link.getAttribute('href') || '');
            return match ? match[1] : null;
        },

        bindModernNavigation: function () {
            const self = this;
            // menuLinks are native anchors with target=_blank, including freshly mounted More/drawer entries. Handle only our ordinary clicks and let Jellyfin's own bubbling handlers close the native menu/drawer.
            document.addEventListener('click', function (event) {
                if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                const link = event.target.closest && event.target.closest('a[href]');
                if (!self.getModernNavId(link)) return;
                event.preventDefault();
                window.location.hash = link.getAttribute('href');
                self.ensureNativeTabs().then(function () { self.scheduleRender(); });
            }, true);
        },

        ensureModernNavigationLinks: function (config) {
            const self = this;
            const tabsById = {};
            (config.tabs || []).forEach(function (tab) {
                tabsById[tab.id] = tab;
            });
            const desired = (config.tabBarOrder || []).map(function (key) {
                const id = key.indexOf('sf:') === 0 ? key.slice(3) : '';
                const tab = tabsById[id];
                return tab && tab.enabled !== false ? tab : null;
            }).filter(Boolean);
            const icons = { movies: 'movie', tv: 'tv', requests: 'download', letterboxd: 'bookmark' };

            document.querySelectorAll('header.MuiAppBar-root .MuiToolbar-root > .MuiStack-root').forEach(function (nav) {
                const runtimeLinks = Array.from(nav.querySelectorAll('[data-seerrfin-runtime-nav]'));
                if (nav.querySelector('a[href^="#/home?seerrfinTab="]:not([data-seerrfin-runtime-nav])')) {
                    runtimeLinks.forEach(function (link) { link.remove(); });
                    return;
                }

                const favorite = nav.querySelector('a[href^="#/home?tab=1"]');
                if (!favorite) {
                    return;
                }

                const desiredIds = new Set(desired.map(function (tab) { return tab.id; }));
                runtimeLinks.forEach(function (link) {
                    if (!desiredIds.has(link.dataset.seerrfinRuntimeNav)) {
                        link.remove();
                    }
                });

                let previous = favorite;
                desired.forEach(function (tab) {
                    let link = nav.querySelector('[data-seerrfin-runtime-nav="' + tab.id + '"]');
                    if (!link) {
                        link = favorite.cloneNode(false);
                        link.removeAttribute('data-sleekfin-current');
                        link.removeAttribute('data-sleekfin-header-link');
                        link.dataset.seerrfinRuntimeNav = tab.id;
                    }

                    const title = self.resolveTabTitle(tab.id, tab.title);
                    if (link.dataset.seerrfinRuntimeTitle !== title) {
                        const iconContainer = favorite.firstElementChild.cloneNode(false);
                        const icon = document.createElement('span');
                        icon.className = 'material-icons notranslate MuiIcon-root MuiIcon-fontSizeMedium';
                        icon.setAttribute('aria-hidden', 'true');
                        icon.textContent = icons[tab.id] || 'bookmark';
                        iconContainer.appendChild(icon);
                        link.replaceChildren(iconContainer, title);
                        link.dataset.seerrfinRuntimeTitle = title;
                    }

                    link.setAttribute('href', '#/home?seerrfinTab=' + tab.id);
                    if (previous.nextSibling !== link) {
                        nav.insertBefore(link, previous.nextSibling);
                    }
                    previous = link;
                });
            });
        },

        syncModernNavigation: function () {
            const self = this;
            const selected = self.isHomeTabContext() && document.querySelector('.headerTabs .emby-tab-button-active');
            const activeId = selected && selected.getAttribute('data-seerrfin-tab');
            document.querySelectorAll('header.MuiAppBar-root a[href], .MuiDrawer-paper a[href], #user-view-overflow-menu a[href], .customMenuOptions a[href]').forEach(function (link) {
                const id = self.getModernNavId(link);
                if (!id) {
                    return;
                }
                link.dataset.seerrfinMenuNav = id;
                const active = activeId === id;
                if (active && link.getAttribute('aria-current') !== 'page') {
                    link.setAttribute('aria-current', 'page');
                } else if (!active && link.hasAttribute('aria-current')) {
                    link.removeAttribute('aria-current');
                }
            });
        },

        restoreHomeTabSelection: function (page, tabs) {
            if (typeof tabs.selectedIndex !== 'function') return;
            const route = new URLSearchParams(window.location.hash.split('?')[1] || '');
            const tabId = route.get('seerrfinTab');
            const namedButton = tabId && Array.from(tabs.querySelectorAll('[data-seerrfin-tab]')).find(function (button) {
                return button.dataset.seerrfinTab === tabId && !button.classList.contains('hide');
            });
            const namedIndex = namedButton ? parseInt(namedButton.dataset.index, 10) : 0;
            if (page.dataset.seerrfinTabRoute === window.location.hash && page._seerrfinTabsElement === tabs &&
                page._seerrfinTabRouteMatched && (!tabId || tabs.selectedIndex() === namedIndex)) return;
            page.dataset.seerrfinTabRoute = window.location.hash;
            page._seerrfinTabsElement = tabs;
            const match = /[?&]tab=(\d+)/.exec(window.location.hash);
            const selected = tabId ? namedIndex : (match ? parseInt(match[1], 10) : 0);
            const button = tabs.querySelector('.emby-tab-button:not(.hide)[data-index="' + selected + '"]');
            page._seerrfinTabRouteMatched = !!button;
            // Restore deep links after the React home/header have mounted and plugin panels exist
            if (button) {
                tabs.selectedIndex(selected);
            } else if (tabs.selectedIndex() !== 0) {
                tabs.selectedIndex(0);
            }
        },

        ensureNativeTabs: function () {
            const self = this;
            self.syncModernNavigation();
            if (self._tabsEnsuring) {
                return self._tabsEnsuring;
            }

            self._tabsEnsuring = self.loadTabConfig().then(function (config) {
                self.ensureModernNavigationLinks(config);
                self.syncModernNavigation();

                if (!self.isHomeTabContext()) {
                    self.cleanupSeerrFinHeaderButtons();
                    return;
                }

                return self.waitForCustomTabs(config.customTabs, 20).then(function () {
                    if (!self.isHomeTabContext()) {
                        self.cleanupSeerrFinHeaderButtons();
                        return;
                    }

                    const page = self.findActiveHomePage();
                    const tabsSlider = document.querySelector('.headerTabs .emby-tabs-slider');
                    const tabsEl = document.querySelector('.headerTabs [is="emby-tabs"]');
                    if (!page || !tabsSlider || !tabsEl) {
                        return;
                    }

                    self.attachPluginTabGuard(tabsEl);

                    const slots = self.includeExternalTabSlots(page, tabsSlider, self.buildDesiredBarSlots(config));
                    const desiredSig = self.barPlacementSignature(slots);
                    const currentSig = self.readCurrentBarSignature(tabsSlider);
                    const panelsMatch = slots.every(function (slot) {
                        if (slot.type === 'seerrfin') {
                            return !!page.querySelector('.tabContent[data-seerrfin-tab="' + slot.id + '"]');
                        }
                        if (slot.type === 'customtabs') {
                            return !!page.querySelector('[id="customTab_' + slot.index + '"]');
                        }
                        if (slot.type === 'reserved') {
                            return !!page.querySelector('.tabContent[data-seerrfin-reserved-index="' + slot.index + '"]');
                        }
                        return true;
                    });

                    if (desiredSig === currentSig && panelsMatch) {
                        self.applyTabTitles(tabsSlider, slots);
                        self.restoreHomeTabSelection(page, tabsEl);
                        self.syncModernNavigation();
                        return;
                    }

                    if (!self.applyBarOrder(page, tabsSlider, slots)) {
                        return;
                    }

                    self.restoreHomeTabSelection(page, tabsEl);
                    self.syncModernNavigation();

                    log.info('native tab bar ready: ' + slots.map(function (s) { return s.key; }).join(', '));

                    if (typeof tabsEl.refresh === 'function') {
                        try {
                            tabsEl.refresh();
                        } catch (err) {
                            // scroller refresh is best-effort
                        }
                    }
                });
            }).catch(function (err) {
                log.error('failed to ensure native tabs', err);
            }).then(function () {
                self._tabsEnsuring = null;
            });

            return self._tabsEnsuring;
        },

        setupNativeTabWatchers: function () {
            const self = this;
            log.info('native tab watchers ready');

            document.addEventListener('viewshow', function (event) {
                if (event.target && event.target.id === 'indexPage') {
                    self.ensureNativeTabs().then(function () {
                        if (!self.isHomeTabContext()) {
                            return;
                        }
                        self.scheduleRender();
                    });
                } else {
                    // left home for a library/folder view (never leave seerrfin buttons in the header)
                    self.cleanupSeerrFinHeaderButtons();
                    self.syncModernNavigation();
                    self.scheduleRender();
                }
            });

            const scheduleTabs = function () {
                if (!self._ctObserveTimer) {
                    self._ctObserveTimer = setTimeout(function () {
                        self._ctObserveTimer = null;
                        self.ensureNativeTabs();
                    }, 50);
                }
            };
            window.addEventListener('hashchange', scheduleTabs);

            if (!self._ctButtonObserver && typeof MutationObserver !== 'undefined') {
                self._ctButtonObserver = new MutationObserver(function (records) {
                    const selector = '.skinHeader, .headerTabs, #indexPage, header.MuiAppBar-root, .MuiDrawer-paper, #user-view-overflow-menu, .customMenuOptions';
                    const relevant = records.some(function (record) {
                        const target = record.target;
                        if (target.nodeType === 1 && target.closest(selector)) {
                            if (!target.closest('#indexPage') || target.id === 'indexPage') { // Card and image rendering within the page doesnt affect the tab bar
                                return true;
                            }
                        }
                        return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(function (node) {
                            return node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
                        });
                    });
                    if (relevant) scheduleTabs();
                });
                // Jellyfin 12 can mount or replace the React page/header after boot
                self._ctButtonObserver.observe(document.body, { childList: true, subtree: true });
            }
        },

        isContainerLoading: function (container) {
            return container.dataset.seerrfinLoading === 'true';
        },

        isContainerPopulated: function (container) {
            return container.querySelector('.seerrfin-poster-section') !== null;
        },

        isGridViewOpen: function (container) {
            if (!container) {
                return false;
            }

            const children = Array.from(container.children);
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.hasAttribute('data-seerrfin-grid-view') && child.style.display !== 'none') {
                    return true;
                }
            }
            return false;
        },

        cancelContainerLoad: function (container) {
            if (!container) {
                return;
            }

            container.dataset.seerrfinLoadId = 'cancelled-' + Date.now() + '-' + Math.random().toString(16).slice(2);
            container.dataset.seerrfinLoading = 'false';
            if (!this.isContainerPopulated(container)) {
                delete container.dataset.seerrfinLoaded;
            }

            Array.from(container.childNodes).forEach(function (node) {
                if (node.nodeType === Node.COMMENT_NODE && /seerrfin-(row|carousel)-slot/.test(node.nodeValue || '')) {
                    node.remove();
                }
            });
        },

        renderIfContainerVisible: function (type) {
            const selector = type === 'movies' ? '.seerrfin-movies-sections' : '.seerrfin-tv-sections';
            const container = this.findActiveContainer(selector);
            if (!container) {
                return;
            }

            if (this.isContainerLoading(container)) {
                return;
            }

            const self = this;
            this.loadDisplaySettings().then(function () {
                const settingsKey = self.getDisplaySettingsKey();

                if (container.dataset.seerrfinDisplaySettings !== settingsKey) {
                    log.info(type + ' tab display settings changed, clearing container');
                    container.dataset.seerrfinDisplaySettings = settingsKey;
                    if (self.isContainerPopulated(container)) {
                        container.innerHTML = '';
                        delete container.dataset.seerrfinLoaded;
                        delete container.dataset.seerrfinLoading;
                    }
                }

                if (self.isContainerPopulated(container)) {
                    return;
                }

                const hasError = container.querySelector('.seerrfin-empty-row');
                if (hasError && container.dataset.seerrfinLoaded === 'true') {
                    return;
                }

                self.loadTab(type, container);
            }).catch(function (err) {
                log.error(type + ' tab render aborted: display settings failed', err);
            });
        },

        loadTab: function (type, container) {
            if (!container) {
                container = this.findActiveContainer(
                    type === 'movies' ? '.seerrfin-movies-sections' : '.seerrfin-tv-sections'
                );
            }
            if (!container || !this.isContainerVisible(container) || this.isGridViewOpen(container)) {
                if (container && !this.isContainerVisible(container)) {
                    log.info(type + ' tab skip load: container not visible');
                }
                return;
            }

            if (this.isContainerLoading(container) || this.isContainerPopulated(container)) {
                return;
            }

            const rows = type === 'movies' ? this.movieRows : this.tvRows;
            const mediaType = type === 'movies' ? 'movie' : 'tv';
            const self = this;
            const loadId = String(Date.now()) + '-' + Math.random().toString(16).slice(2);

            log.info('loading ' + type + ' tab (' + rows.length + ' rows)');
            container.dataset.seerrfinLoading = 'true';
            container.dataset.seerrfinLoadId = loadId;
            delete container.dataset.seerrfinLoaded;

            // Ignore results if user switched tabs or theres a newer load.
            const finishLoading = function () {
                if (container.dataset.seerrfinLoadId !== loadId) {
                    log.info(type + ' tab load finished but was superseded');
                    return;
                }
                container.dataset.seerrfinLoading = 'false';
                container.dataset.seerrfinLoaded = 'true';
                log.info(type + ' tab load complete');
            };

            const isStale = function () {
                return container.dataset.seerrfinLoadId !== loadId || !self.isContainerVisible(container) || self.isGridViewOpen(container);
            };

            const browseTitle = mediaType === 'movie' ? 'Browse by studio' : 'Browse by network';
            const browseKind = mediaType === 'movie' ? 'studio' : 'network';
            const carouselDefs = [
                { title: 'Browse by genre', path: 'genres/' + mediaType, kind: 'genre' },
                { title: 'Browse by streaming service', path: 'providers/' + mediaType, kind: 'provider' },
                { title: browseTitle, path: mediaType === 'movie' ? 'studios/movie' : 'networks/tv', kind: browseKind }
            ];

            self.loadDisplaySettings().then(function () {
                if (isStale()) {
                    log.info(type + ' tab load stale before fetch');
                    finishLoading();
                    return;
                }

                container.innerHTML = '';
                const useNativeCarousels = self.shouldUseNativeCarousels();
                log.info(type + ' tab using ' + (useNativeCarousels ? 'native' : 'custom') + ' carousels');

                const rowSlots = rows.map(function (row) {
                    const skeleton = self.buildRowSkeleton(row.title, 'poster');
                    container.appendChild(skeleton);
                    return { row: row, skeleton: skeleton };
                });

                const carouselSlots = carouselDefs.map(function (def) {
                    const skeleton = self.buildRowSkeleton(def.title, 'carousel');
                    container.appendChild(skeleton);
                    return { def: def, skeleton: skeleton };
                });

                const totalSlots = rowSlots.length + carouselSlots.length;
                let completedSlots = 0;
                let anySuccess = false;

                const checkAllDone = function () {
                    completedSlots++;
                    if (completedSlots < totalSlots) {
                        return;
                    }
                    if (!anySuccess && !isStale()) {
                        log.error(type + ' tab: all discovery rows/carousels failed');
                        container.innerHTML = `<div class="seerrfin-empty-row">Failed to load discovery rows. Check Seerr settings and that your Jellyfin user is linked in Seerr.</div>`;
                    }
                    finishLoading();
                };

                const replaceSkeleton = function (skeleton, node) {
                    if (isStale()) {
                        return;
                    }

                    if (node) {
                        node.classList.add('seerrfin-section-fadein');
                        if (skeleton && skeleton.parentNode) {
                            skeleton.replaceWith(node);
                        } else {
                            container.appendChild(node);
                        }
                        self.refreshScrollers(container);
                    } else if (skeleton && skeleton.parentNode) {
                        skeleton.remove();
                    } else {
                        return;
                    }
                };

                rowSlots.forEach(function (slot) {
                    self.fetchDiscover(slot.row.path).then(function (result) {
                        if (isStale()) {
                            return;
                        }
                        anySuccess = true;
                        try {
                            replaceSkeleton(slot.skeleton, self.buildPosterRow(slot.row.title, result.items, slot.row.path, {
                                total: result.total
                            }));
                        } catch (err) {
                            log.warn('row render failed: ' + slot.row.title, err);
                            replaceSkeleton(slot.skeleton, null);
                        }
                    }).catch(function (err) {
                        log.warn('row failed: ' + slot.row.path, err);
                        replaceSkeleton(slot.skeleton, null);
                    }).finally(checkAllDone);
                });

                carouselSlots.forEach(function (slot) {
                    self.fetchJson(slot.def.path).then(function (data) {
                        if (isStale()) {
                            return;
                        }
                        const items = self.asArray(data);
                        if (!items.length) {
                            log.warn('carousel empty: ' + slot.def.path);
                            replaceSkeleton(slot.skeleton, null);
                            return;
                        }
                        anySuccess = true;
                        try {
                            replaceSkeleton(slot.skeleton, self.buildCarouselSection(slot.def.title, items, mediaType, slot.def.kind));
                        } catch (err) {
                            log.warn('carousel render failed: ' + slot.def.title, err);
                            replaceSkeleton(slot.skeleton, null);
                        }
                    }).catch(function (err) {
                        log.warn('carousel failed: ' + slot.def.path, err);
                        replaceSkeleton(slot.skeleton, null);
                    }).finally(checkAllDone);
                });
            }).catch(function (err) {
                if (isStale()) {
                    return;
                }
                log.error(type + ' tab load failed', err);
                container.dataset.seerrfinLoading = 'false';
                container.dataset.seerrfinLoaded = 'true';
                container.innerHTML = `<div class="seerrfin-empty-row">Failed to load discovery rows. Check Seerr settings and that your Jellyfin user is linked in Seerr.</div>`;
            });
        },

        fetchDiscover: function (path, query) {
            let url = ApiClient.getUrl('SeerrFin/' + path);
            if (query) {
                url += query;
            }
            return ApiClient.ajax({
                url: url,
                type: 'GET',
                dataType: 'json'
            }).then(function (data) {
                const items = data && (data.Items || data.items || data.Results || data.results);
                const total = data && (data.TotalRecordCount ?? data.totalRecordCount ?? 0);
                return {
                    items: Array.isArray(items) ? items : [],
                    total: total
                };
            });
        },

        fetchJson: function (path) {
            return ApiClient.ajax({
                url: ApiClient.getUrl('SeerrFin/' + path),
                type: 'GET',
                dataType: 'json'
            });
        },

        loadDisplaySettings: function () {
            const self = this;
            if (self._displaySettingsPromise) {
                return self._displaySettingsPromise;
            }

            const hadDisplaySettings = !!self._displaySettings;
            const previousSettingsKey = hadDisplaySettings ? self.getDisplaySettingsKey() : '';
            self._displaySettingsPromise = ApiClient.ajax({
                url: ApiClient.getUrl('SeerrFin/display-settings') + '?_=' + Date.now(),
                type: 'GET',
                dataType: 'json',
                cache: false
            }).then(function (data) {
                self._tabSettingsSnapshot = {
                    tabs: data && data.tabs,
                    tabBarOrder: data && data.tabBarOrder
                };
                self._displaySettings = {
                    StreamingServiceUseImages: self.readConfigBool(
                        data,
                        'StreamingServiceUseImages',
                        'streamingServiceUseImages',
                        true
                    ),
                    StudioNetworkUseImages: self.readConfigBool(
                        data,
                        'StudioNetworkUseImages',
                        'studioNetworkUseImages',
                        true
                    ),
                    GenreUseBackdrops: self.readConfigBool(
                        data,
                        'GenreUseBackdrops',
                        'genreUseBackdrops',
                        true
                    ),
                    DiscoverUsePosters: self.readConfigBool(
                        data,
                        'DiscoverUsePosters',
                        'discoverUsePosters',
                        true
                    ),
                    ElegantFinFixes: self.readConfigBool(
                        data,
                        'ElegantFinFixes',
                        'elegantFinFixes',
                        false
                    ),
                    QualityRecommendations: self.readConfigBool(
                        data,
                        'QualityRecommendations',
                        'qualityRecommendations',
                        true
                    ),
                    AddSeerrResultsInSearch: self.readConfigBool(
                        data,
                        'AddSeerrResultsInSearch',
                        'addSeerrResultsInSearch',
                        true
                    ),
                    NativeCarousels: self.readConfigBool(
                        data,
                        'NativeCarousels',
                        'nativeCarousels',
                        false
                    ),
                    NativeGridPages: self.readConfigBool(
                        data,
                        'NativeGridPages',
                        'nativeGridPages',
                        false
                    ),
                    NativeSearchResults: self.readConfigBool(
                        data,
                        'NativeSearchResults',
                        'nativeSearchResults',
                        false
                    ),
                    DisplayCustomizations: self.parseDisplayCustomizations(data),
                    Advanced: self.parseAdvancedSettings(data)
                };
                self.applyAdvancedSettings(self._displaySettings.Advanced);
                self.syncElegantFinFixes();
                if (hadDisplaySettings && previousSettingsKey !== self.getDisplaySettingsKey()) {
                    self.clearBackdropCaches();
                }
                log.info('display settings loaded');
                return self._displaySettings;
            }).catch(function (err) {
                log.warn('display settings fetch failed, using defaults', err);
                self._tabSettingsSnapshot = null;
                self._displaySettings = {
                    StreamingServiceUseImages: true,
                    StudioNetworkUseImages: true,
                    GenreUseBackdrops: true,
                    DiscoverUsePosters: true,
                    ElegantFinFixes: false,
                    QualityRecommendations: true,
                    AddSeerrResultsInSearch: true,
                    NativeCarousels: false,
                    NativeGridPages: false,
                    NativeSearchResults: false,
                    DisplayCustomizations: self.parseDisplayCustomizations(null),
                    Advanced: self.parseAdvancedSettings(null)
                };
                self.applyAdvancedSettings(self._displaySettings.Advanced);
                self.syncElegantFinFixes();
                if (hadDisplaySettings && previousSettingsKey !== self.getDisplaySettingsKey()) {
                    self.clearBackdropCaches();
                }
                return self._displaySettings;
            }).then(function (settings) {
                self._displaySettingsPromise = null;
                return settings;
            });

            return self._displaySettingsPromise;
        },

        readAdvancedBool: function (value, fallback) {
            if (value === true || value === false) {
                return value;
            }
            return fallback;
        },

        parseAdvancedSettings: function (data) {
            const self = this;
            const root = (data && (data.advanced || data.Advanced)) || {};
            const discovery = root.discovery || root.Discovery || {};
            const carousel = root.carousel || root.Carousel || {};
            const requests = root.requests || root.Requests || {};
            const requestModal = root.requestModal || root.RequestModal || {};
            const tmdb = root.tmdb || root.Tmdb || {};
            const letterboxd = root.letterboxd || root.Letterboxd || {};
            return {
                discovery: {
                    gridPageSize: discovery.gridPageSize ?? discovery.GridPageSize ?? 40
                },
                carousel: {
                    carouselScrollThreshold: carousel.carouselScrollThreshold ?? carousel.CarouselScrollThreshold ?? 1200,
                    discoverRowFocusScale: self.readAdvancedBool(carousel.discoverRowFocusScale ?? carousel.DiscoverRowFocusScale, true),
                    browseCarouselFocusScale: self.readAdvancedBool(carousel.browseCarouselFocusScale ?? carousel.BrowseCarouselFocusScale, false),
                    enableCenterFocus: self.readAdvancedBool(carousel.enableCenterFocus ?? carousel.EnableCenterFocus, true),
                    enableRowInfiniteScroll: self.readAdvancedBool(carousel.enableRowInfiniteScroll ?? carousel.EnableRowInfiniteScroll, true),
                    rowScrollBindRetries: carousel.rowScrollBindRetries ?? carousel.RowScrollBindRetries ?? 10
                },
                requests: {
                    pageSize: requests.pageSize ?? requests.PageSize ?? 20,
                    fetchSize: requests.fetchSize ?? requests.FetchSize ?? 100,
                    cardsInteractive: self.readAdvancedBool(requests.cardsInteractive ?? requests.CardsInteractive, false),
                    cardsIncludeMetaText: self.readAdvancedBool(requests.cardsIncludeMetaText ?? requests.CardsIncludeMetaText, false),
                    includePartialsInProcessingFilter: self.readAdvancedBool(requests.includePartialsInProcessingFilter ?? requests.IncludePartialsInProcessingFilter, false),
                    splitPartiallyAvailableFilter: self.readAdvancedBool(requests.splitPartiallyAvailableFilter ?? requests.SplitPartiallyAvailableFilter, false),
                    autoRefreshIntervalSeconds: requests.autoRefreshIntervalSeconds ?? requests.AutoRefreshIntervalSeconds ?? 10,
                    refreshOnVisibility: self.readAdvancedBool(requests.refreshOnVisibility ?? requests.RefreshOnVisibility, true),
                    refreshOnTabShow: self.readAdvancedBool(requests.refreshOnTabShow ?? requests.RefreshOnTabShow, true)
                },
                requestModal: {
                    allowQualityProfileSelection: self.readAdvancedBool(requestModal.allowQualityProfileSelection ?? requestModal.AllowQualityProfileSelection, true),
                    tvSeasonPickerEnabled: self.readAdvancedBool(requestModal.tvSeasonPickerEnabled ?? requestModal.TvSeasonPickerEnabled, true),
                    includeSpecialsSeason: self.readAdvancedBool(requestModal.includeSpecialsSeason ?? requestModal.IncludeSpecialsSeason, false),
                    requireExplicitSeasonSelection: self.readAdvancedBool(requestModal.requireExplicitSeasonSelection ?? requestModal.RequireExplicitSeasonSelection, false),
                    showRequest4kButton: self.readAdvancedBool(requestModal.showRequest4kButton ?? requestModal.ShowRequest4kButton, true),
                    backdropLanguageFilter: requestModal.backdropLanguageFilter || requestModal.BackdropLanguageFilter || 'en,null,en-US'
                },
                tmdb: {
                    backdropImageSize: tmdb.backdropImageSize || tmdb.BackdropImageSize || 'w780',
                    posterImageSize: tmdb.posterImageSize || tmdb.PosterImageSize || 'w600_and_h900_bestv2',
                    backdropLanguageFilter: tmdb.backdropLanguageFilter || tmdb.BackdropLanguageFilter || 'en,null,en-US',
                    preferOriginalLanguageImages: self.readAdvancedBool(tmdb.preferOriginalLanguageImages ?? tmdb.PreferOriginalLanguageImages, false),
                    genreBackdropSelectionMode: tmdb.genreBackdropSelectionMode || tmdb.GenreBackdropSelectionMode || 'random',
                    fallbackToOriginalImageUrl: self.readAdvancedBool(tmdb.fallbackToOriginalImageUrl ?? tmdb.FallbackToOriginalImageUrl, true),
                    directBrowserImages: self.readAdvancedBool(tmdb.directBrowserImages ?? tmdb.DirectBrowserImages, false)
                },
                letterboxd: {
                    usernamePattern: letterboxd.usernamePattern || letterboxd.UsernamePattern || '^[a-zA-Z0-9_-]{1,30}$',
                    requestCardsInteractive: self.readAdvancedBool(letterboxd.requestCardsInteractive ?? letterboxd.RequestCardsInteractive, false),
                    requestCardsIncludeMetaText: self.readAdvancedBool(letterboxd.requestCardsIncludeMetaText ?? letterboxd.RequestCardsIncludeMetaText, true),
                    defaultBulkQualityMode: letterboxd.defaultBulkQualityMode || letterboxd.DefaultBulkQualityMode || 'singleProfile',
                    alreadyRequestedMode: letterboxd.alreadyRequestedMode || letterboxd.AlreadyRequestedMode || 'prompt',
                }
            };
        },

        applyAdvancedSettings: function (advanced) {
            advanced = advanced || this.parseAdvancedSettings(null);
            this._gridPageSize = Number(advanced.discovery.gridPageSize) || 40;
            this._carouselScrollThreshold = Number(advanced.carousel.carouselScrollThreshold) || 1200;
            this._rowScrollBindRetries = Number(advanced.carousel.rowScrollBindRetries) || 10;
            this._advancedSettings = advanced;
        },

        getAdvancedCarouselSetting: function (key, fallback) {
            const carousel = (this._advancedSettings || {}).carousel || {};
            const value = carousel[key];
            if (value === true || value === false) {
                return value;
            }
            return fallback;
        },

        parseDisplayCustomizations: function (data) {
            const root = (data && (data.DisplayCustomizations || data.displayCustomizations)) || {};
            return {
                StreamingService: root.StreamingService || root.streamingService || {},
                StudioNetwork: root.StudioNetwork || root.studioNetwork || {},
                GenreBackdrop: root.GenreBackdrop || root.genreBackdrop || {},
                DiscoverBackdrop: root.DiscoverBackdrop || root.discoverBackdrop || {}
            };
        },

        getDisplaySettingsKey: function () {
            const settings = this._displaySettings || {};
            return [
                settings.StreamingServiceUseImages,
                settings.StudioNetworkUseImages,
                settings.GenreUseBackdrops,
                settings.DiscoverUsePosters,
                settings.ElegantFinFixes,
                settings.AddSeerrResultsInSearch,
                settings.NativeCarousels,
                settings.NativeGridPages,
                settings.NativeSearchResults,
                JSON.stringify(settings.DisplayCustomizations || {}),
                JSON.stringify(settings.Advanced || {})
            ].join(':');
        },

        syncElegantFinFixes: function () {
            const enabled = (this._displaySettings || {}).ElegantFinFixes === true;
            document.documentElement.classList.toggle('seerrfin-elegantfin', enabled);
        },

        normalizeHexColor: function (value, fallback) {
            const raw = String(value || fallback || '').replace('#', '').trim();
            if (/^[0-9a-fA-F]{6}$/.test(raw)) {
                return raw.toLowerCase();
            }

            return String(fallback || 'ffffff').replace('#', '').toLowerCase();
        },

        getDisplayStyle: function (styleKey) {
            const settings = this._displaySettings || {};
            const customizations = settings.DisplayCustomizations || {};
            const configKeyMap = {
                streamingService: 'StreamingService',
                studioNetwork: 'StudioNetwork',
                genreBackdrop: 'GenreBackdrop',
                discoverBackdrop: 'DiscoverBackdrop'
            };
            const defaults = {
                streamingService: { duotoneEnabled: true, duotoneLight: 'ffffff', duotoneDark: '969696' },
                studioNetwork: { duotoneEnabled: true, duotoneLight: 'ffffff', duotoneDark: '969696' },
                genreBackdrop: { duotoneEnabled: false, duotoneLight: 'ffffff', duotoneDark: '969696' },
                discoverBackdrop: { duotoneEnabled: false, duotoneLight: 'ffffff', duotoneDark: '969696' }
            };
            const fallback = defaults[styleKey] || defaults.streamingService;
            const source = customizations[configKeyMap[styleKey]] || {};

            return {
                duotoneEnabled: this.readConfigBool(source, 'DuotoneEnabled', 'duotoneEnabled', fallback.duotoneEnabled),
                duotoneLight: this.normalizeHexColor(source.DuotoneLight ?? source.duotoneLight, fallback.duotoneLight),
                duotoneDark: this.normalizeHexColor(source.DuotoneDark ?? source.duotoneDark, fallback.duotoneDark)
            };
        },

        buildTmdbImageUrl: function (path, styleKey, size) {
            if (!path) {
                return null;
            }

            const pathNorm = path.startsWith('/') ? path : '/' + path;
            let sizePart = size || 'w780';

            if (styleKey) {
                const style = this.getDisplayStyle(styleKey);
                if (style.duotoneEnabled) {
                    sizePart += '_filter(duotone,' + style.duotoneDark + ',' + style.duotoneLight + ')';
                }
            }

            return 'https://image.tmdb.org/t/p/' + sizePart + pathNorm;
        },

        buildDiscoverPosterUrl: function (item) {
            const posterPath = this.getProviderId(item, 'TmdbPosterPath');
            if (this.getDisplayStyle('discoverBackdrop').duotoneEnabled && posterPath) {
                return this.buildTmdbImageUrl(posterPath, 'discoverBackdrop', 'w600_and_h900_bestv2');
            }

            let posterUrl = this.getProviderId(item, 'JellyseerrPoster');
            if (posterUrl && !posterUrl.startsWith('http')) {
                posterUrl = window.ApiClient.getUrl(posterUrl);
            }

            if (posterUrl) {
                return posterUrl;
            }

            if (posterPath) {
                return this.buildTmdbImageUrl(posterPath, null, 'w600_and_h900_bestv2');
            }

            return null;
        },

        shouldUseBackdropThumbnails: function () {
            return (this._displaySettings || {}).DiscoverUsePosters === false;
        },

        isNativeUiAvailable: function () {
            return !!(window.seerrFinNativeUi &&
                typeof window.seerrFinNativeUi.createDiscoverCards === 'function' &&
                typeof window.seerrFinNativeUi.createBoxCard === 'function' &&
                typeof window.seerrFinNativeUi.renderGridViewShell === 'function');
        },

        shouldUseNativeCarousels: function () {
            return (this._displaySettings || {}).NativeCarousels === true && this.isNativeUiAvailable();
        },

        shouldUseNativeGridPages: function () {
            return (this._displaySettings || {}).NativeGridPages === true && this.isNativeUiAvailable();
        },

        shouldUseNativeSearchResults: function () {
            return (this._displaySettings || {}).NativeSearchResults === true && this.isNativeUiAvailable();
        },

        resolveImageUrl: function (url) {
            if (!url) {
                return '';
            }
            if (url.startsWith('http')) {
                return url;
            }
            return window.ApiClient.getUrl(url);
        },

        clearBackdropCaches: function () {
            this._backdropResultCache = {};
            this._backdropBatchInflight = {};
        },

        invalidateDisplaySettings: function () {
            const self = this;
            const pendingSettings = this._displaySettingsPromise;
            const pendingTabConfig = this._tabConfigPromise;
            this._displaySettings = null;
            this._tabSettingsSnapshot = null;
            this._tabConfig = null;
            this._tabConfigPromise = null;
            this.clearBackdropCaches();
            document.querySelectorAll('.seerrfin-movies-sections, .seerrfin-tv-sections, .seerrfin-search-section').forEach(function (section) {
                delete section.dataset.seerrfinDisplaySettings;
            });
            Promise.all([pendingSettings, pendingTabConfig]).then(function () {
                self._displaySettings = null;
                self._tabSettingsSnapshot = null;
                self._tabConfig = null;
                self._tabConfigPromise = null;
                return self.loadDisplaySettings();
            }).then(function () {
                return self.ensureNativeTabs();
            }).then(function () {
                self.scheduleRender();
                self.handleJellyfinSearchPage();
            });
        },

        readConfigBool: function (data, pascalKey, camelKey, defaultValue) {
            if (!data) {
                return defaultValue;
            }

            const value = data[pascalKey] ?? data[camelKey];
            if (value === true || value === false) {
                return value;
            }

            return defaultValue;
        },

        shouldShowLogo: function (kind) {
            const settings = this._displaySettings || {};
            if (kind === 'provider') {
                return settings.StreamingServiceUseImages !== false;
            }
            if (kind === 'studio' || kind === 'network') {
                return settings.StudioNetworkUseImages !== false;
            }
            return false;
        },

        mountFromHtml: function (html) {
            const mount = document.createElement('div');
            mount.innerHTML = html.trim();
            return mount.firstElementChild;
        },

        renderLetterboxdCardChrome: function () {
            return `
                <span class="seerrfin-letterboxd-select-indicator" aria-hidden="true">
                    <span class="material-icons" aria-hidden="true">check</span>
                </span>
                <div class="seerrfin-request-card-actions">
                    <button type="button" class="seerrfin-request-action-btn seerrfin-request-modal-btn"
                        aria-label="Open request modal" title="Open request modal">
                        <span class="material-icons" aria-hidden="true">download</span>
                    </button>
                </div>`;
        },

        wrapDiscoverCard: function (cardHtml, options) {
            if (!options.letterboxdSlot) {
                return cardHtml;
            }
            return `<div class="seerrfin-letterboxd-card-slot">${cardHtml}</div>`;
        },

        buildRowSkeleton: function (title, kind, options) {
            options = options || {};
            const useNative = options.native != null ? options.native === true : this.shouldUseNativeCarousels();

            if (useNative &&
                window.seerrFinNativeUi &&
                typeof window.seerrFinNativeUi.buildRowSkeleton === 'function') {
                return window.seerrFinNativeUi.buildRowSkeleton(this, title, kind);
            }

            const useBackdrop = kind === 'poster' && this.shouldUseBackdropThumbnails();
            const cardClass = kind === 'carousel'
                ? 'seerrfin-skeleton-card seerrfin-skeleton-card--carousel'
                : `seerrfin-skeleton-card seerrfin-skeleton-card--poster${useBackdrop ? ' seerrfin-skeleton-card--backdrop' : ''}`;
            const count = kind === 'carousel' ? 6 : 8;
            const cards = Array.from({ length: count }, function () {
                return `<div class="${cardClass}"></div>`;
            }).join('');

            return this.mountFromHtml(`
                <div class="verticalSection seerrfin-skeleton-section" aria-hidden="true" data-seerrfin-skeleton="true">
                    <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                        <div class="seerrfin-skeleton-title" aria-label="${this.escapeHtml(title || 'Loading')}"></div>
                    </div>
                    <div class="seerrfin-skeleton-track padded-left">${cards}</div>
                </div>`);
        },

        buildPosterRow: function (title, items, path, options) {
            options = options || {};
            const safeTitle = this.escapeHtml(title);
            const useNativeCards = this.shouldUseNativeCarousels();

            if (!items || items.length === 0) {
                return this.mountFromHtml(`
                    <div class="verticalSection seerrfin-poster-section">
                        <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                            <h2 class="sectionTitle sectionTitle-cards">${safeTitle}</h2>
                        </div>
                        <div class="seerrfin-empty-row padded-left">No items to show</div>
                    </div>`);
            }

            const viewMoreBtn = path && items.length > 0 ? `
                <button type="button" class="seerrfin-view-more" data-path="${this.escapeHtml(path)}" data-title="${safeTitle}">
                    View more \u2192
                </button>` : '';

            let pathAttrs = '';
            if (path) {
                const total = parseInt(options.total || '0', 10);
                pathAttrs = ` data-path="${this.escapeHtml(path)}" data-loaded-count="${items.length}" data-total="${total}" data-has-more="${total === 0 || items.length < total}" data-native-cards="${useNativeCards ? 'true' : 'false'}"`;
            }
            const containerClass = useNativeCards
                ? 'itemsContainer scrollSlider focuscontainer-x animatedScrollX'
                : 'itemsContainer scrollSlider focuscontainer-x';

            const section = this.mountFromHtml(`
                <div class="verticalSection seerrfin-poster-section"${pathAttrs}>
                    <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                        <h2 class="sectionTitle sectionTitle-cards">${safeTitle}</h2>
                        ${viewMoreBtn}
                    </div>
                    <div is="emby-itemscontainer" class="${containerClass}" data-monitor="videoplayback,markplayed"></div>
                </div>`);

            const itemsContainer = section.querySelector('.itemsContainer');
            itemsContainer.innerHTML = this.createDiscoverCards(items, false, {
                nativeCards: useNativeCards
            });
            this.appendHorizontalScroller(section, itemsContainer, {
                focusScale: this.getAdvancedCarouselSetting('discoverRowFocusScale', true),
                scrollEvent: this.getAdvancedCarouselSetting('enableRowInfiniteScroll', true)
            });
            this.initNativeOrCustomCards(itemsContainer, useNativeCards);
            return section;
        },

        initNativeOrCustomCards: function (container, useNativeCards) {
            if (useNativeCards) {
                if (this.shouldUseBackdropThumbnails()) {
                    this.hydrateNativeBackdropCards(container);
                }
                this.initLazyImages(container);
                return;
            }

            if (this.shouldUseBackdropThumbnails()) {
                this.hydrateDiscoverBackdropCards(container);
            } else {
                this.initLazyImages(container);
            }
        },

        bindRowInfiniteScroll: function (section) {
            if (!this.getAdvancedCarouselSetting('enableRowInfiniteScroll', true)) {
                return;
            }

            if (section.dataset.seerrfinRowScrollBound === 'true') {
                return;
            }

            const scroller = section.querySelector('[is="emby-scroller"]');
            if (!scroller || !section.dataset.path) {
                return;
            }

            if (!scroller.scroller || typeof scroller.addScrollEventListener !== 'function') {
                const retries = parseInt(section.dataset.seerrfinRowScrollRetries || '0', 10);
                const maxRetries = this._rowScrollBindRetries || 10;
                if (retries >= maxRetries) {
                    return;
                }
                section.dataset.seerrfinRowScrollRetries = String(retries + 1);
                const self = this;
                requestAnimationFrame(function () {
                    self.bindRowInfiniteScroll(section);
                });
                return;
            }

            delete section.dataset.seerrfinRowScrollRetries;
            section.dataset.seerrfinRowScrollBound = 'true';
            section._seerrfinRowScroller = scroller;

            const self = this;
            scroller.addScrollEventListener(function () {
                self.scheduleRowScrollCheck(section);
            }, { passive: true });

            self.scheduleRowScrollCheck(section);
        },

        scheduleRowScrollCheck: function (section) {
            if (section._seerrfinRowScrollRaf) {
                return;
            }
            const self = this;
            section._seerrfinRowScrollRaf = requestAnimationFrame(function () {
                section._seerrfinRowScrollRaf = 0;
                self.checkRowScrollEnd(section);
            });
        },

        checkRowScrollEnd: function (section) {
            if (section.dataset.hasMore !== 'true' || section.dataset.loading === 'true') {
                return;
            }

            const scroller = section._seerrfinRowScroller;
            if (!scroller || typeof scroller.getScrollPosition !== 'function' || typeof scroller.getScrollSize !== 'function') {
                return;
            }

            const pos = scroller.getScrollPosition() || 0;
            const size = scroller.getScrollSize() || 0;
            const viewport = scroller.clientWidth || 0;
            const threshold = this._carouselScrollThreshold;
            const nearEnd = size <= viewport + threshold || pos + viewport >= size - threshold;

            if (nearEnd) {
                this.loadMorePosterRowItems(section);
            }
        },

        loadMorePosterRowItems: function (section) {
            const self = this;
            const path = section.dataset.path;
            const itemsContainer = section.querySelector('.itemsContainer');
            if (!path || !itemsContainer || section.dataset.hasMore !== 'true') {
                return;
            }

            if (section.dataset.loading === 'true') {
                return;
            }

            const loadedCount = parseInt(section.dataset.loadedCount || '0', 10);
            const pageSize = self._gridPageSize;
            const useNativeCards = section.dataset.nativeCards === 'true';
            section.dataset.loading = 'true';

            self.fetchDiscover(path, '?startIndex=' + encodeURIComponent(loadedCount) + '&limit=' + encodeURIComponent(pageSize)).then(function (result) {
                section.dataset.loading = 'false';

                if (!result.items.length) {
                    section.dataset.hasMore = 'false';
                    return;
                }

                const total = parseInt(result.total || section.dataset.total || '0', 10);
                if (total > 0) {
                    section.dataset.total = String(total);
                }

                const existingIds = new Set();
                itemsContainer.querySelectorAll('[data-tmdb-id]').forEach(function (card) {
                    existingIds.add(card.getAttribute('data-tmdb-id'));
                });
                const newItems = result.items.filter(function (item) {
                    const id = String(self.getProviderId(item, 'Tmdb') ||
                        self.getProviderId(item, 'Jellyseerr') ||
                        self.getField(item, 'id', 'Id') || '');
                    return id && !existingIds.has(id) && existingIds.add(id);
                });

                if (newItems.length) {
                    itemsContainer.insertAdjacentHTML('beforeend', self.createDiscoverCards(newItems, false, {
                        nativeCards: useNativeCards
                    }));
                    self.initNativeOrCustomCards(itemsContainer, useNativeCards);
                }

                const newCount = loadedCount + result.items.length;
                section.dataset.loadedCount = String(newCount);
                const hasMore = result.items.length === pageSize && (total === 0 || newCount < total);
                section.dataset.hasMore = String(hasMore);

                const scroller = section._seerrfinRowScroller;
                if (scroller && scroller.scroller && scroller.scroller.reload) {
                    scroller.scroller.reload();
                }
                self.scheduleRowScrollCheck(section);
            }).catch(function (err) {
                section.dataset.loading = 'false';
                log.error('row infinite scroll load failed', err);
            });
        },

        appendHorizontalScroller: function (section, itemsContainer, options) {
            const settings = options || {};
            const scroller = document.createElement('div');
            scroller.setAttribute('is', 'emby-scroller');
            scroller.className = settings.focusScale
                ? 'padded-top-focusscale padded-bottom-focusscale emby-scroller'
                : 'emby-scroller';
            if (this.getAdvancedCarouselSetting('enableCenterFocus', true)) {
                scroller.setAttribute('data-centerfocus', 'true');
            }
            if (settings.scrollEvent) {
                scroller.setAttribute('data-scrollevent', 'true');
            }

            scroller.appendChild(itemsContainer);
            section.appendChild(scroller);
        },

        buildCarouselSection: function (title, items, mediaType, kind) {
            const self = this;
            const safeTitle = this.escapeHtml(title);
            const useNativeCards = this.shouldUseNativeCarousels();
            const cardsHtml = (items || []).map(function (item) {
                return useNativeCards
                    ? window.seerrFinNativeUi.createBoxCard(self, item, mediaType, kind)
                    : self.createBoxCard(item, mediaType, kind);
            }).join('');

            if (!cardsHtml) {
                return this.mountFromHtml(`
                    <div class="verticalSection seerrfin-carousel-section">
                        <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                            <h2 class="sectionTitle sectionTitle-cards">${safeTitle}</h2>
                        </div>
                        <div class="seerrfin-empty-row padded-left">No items to show</div>
                    </div>`);
            }

            const containerClass = useNativeCards
                ? 'itemsContainer scrollSlider focuscontainer-x animatedScrollX'
                : 'itemsContainer scrollSlider focuscontainer-x';
            const section = this.mountFromHtml(`
                <div class="verticalSection seerrfin-carousel-section">
                    <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                        <h2 class="sectionTitle sectionTitle-cards">${safeTitle}</h2>
                    </div>
                    <div is="emby-itemscontainer" class="${containerClass}" data-monitor="videoplayback,markplayed"></div>
                </div>`);

            const itemsContainer = section.querySelector('.itemsContainer');
            itemsContainer.innerHTML = cardsHtml;
            this.appendHorizontalScroller(section, itemsContainer, {
                focusScale: this.getAdvancedCarouselSetting('browseCarouselFocusScale', false)
            });
            if (useNativeCards) {
                this.initLazyImages(itemsContainer);
            }
            return section;
        },

        createBoxCard: function (item, mediaType, kind) {
            const id = item.id;
            const name = item.name || 'Unknown';
            const safeName = this.escapeHtml(name);
            const showLogo = this.shouldShowLogo(kind);
            const logoStyleKey = kind === 'provider'
                ? 'streamingService'
                : (kind === 'studio' || kind === 'network' ? 'studioNetwork' : null);
            const logoPath = item.logo || item.logoPath;
            const logoUrl = showLogo && logoStyleKey && logoPath && logoPath !== 'not found'
                ? this.buildTmdbImageUrl(logoPath, logoStyleKey)
                : null;

            let extraClass = ' seerrfin-discover-card--fallback';
            let mediaHtml = '';
            let overlayTitleHtml = '';

            if (kind === 'genre' && (this._displaySettings || {}).GenreUseBackdrops !== false) {
                const backdrops = item.backdrops || [];
                if (backdrops.length) {
                    const mode = ((this._advancedSettings || {}).tmdb || {}).genreBackdropSelectionMode || 'random';
                    const backdropPath = mode === 'first' ? backdrops[0] : backdrops[Math.floor(Math.random() * backdrops.length)];
                    const backdropUrl = this.buildTmdbImageUrl(backdropPath, 'genreBackdrop');
                    if (backdropUrl) {
                        mediaHtml = `<span class="seerrfin-discover-backdrop-media" style="background-image: url('${this.escapeHtml(backdropUrl)}')"></span>`;
                    }
                }
            }

            if (logoUrl) {
                extraClass = ' seerrfin-box-card--logo';
                const logoClass = item.weirdSize ? 'seerrfin-box-logo-weird' : 'seerrfin-box-logo';
                mediaHtml = `<img class="${logoClass}" src="${this.escapeHtml(logoUrl)}" alt="${safeName}" loading="lazy" />`;
            } else {
                overlayTitleHtml = `<span class="seerrfin-discover-overlay-title seerrfin-box-label">${safeName}</span>`;
            }

            return `
                <div class="card seerrfin-discover-card seerrfin-discover-card--backdrop seerrfin-box-card seerrfin-discover-card--static${extraClass}"
                    data-seerrfin-box-card="true" data-kind="${kind}" data-media-type="${mediaType}" data-id="${id}" data-name="${safeName}" role="button" tabindex="0">
                    <div class="cardBox">
                        <div class="cardScalable seerrfin-discover-backdrop-scalable">
                            <div class="cardPadder seerrfin-discover-backdrop-padder"></div>
                            <div class="cardImageContainer coveredImage cardContent seerrfin-discover-backdrop-image" aria-label="${safeName}">
                                ${mediaHtml}${overlayTitleHtml}
                            </div>
                        </div>
                    </div>
                </div>`;
        },

        buildBrowseGridPath: function (kind, mediaType, id) {
            const prefix = mediaType === 'tv' ? 'discover/tv' : 'discover/movies';
            if (kind === 'genre') {
                return prefix + '/genre/' + id;
            }
            if (kind === 'provider') {
                return prefix + '/provider/' + id;
            }
            if (kind === 'studio') {
                return 'discover/movies/studio/' + id;
            }
            if (kind === 'network') {
                return 'discover/tv/network/' + id;
            }
            return null;
        },

        createDiscoverCards: function (items, forGrid, options) {
            options = options || {};
            const useBackdrop = options.forceBackdrop === true ||
                (options.forceBackdrop !== false && this.shouldUseBackdropThumbnails());

            if (options.nativeCards === true) {
                return window.seerrFinNativeUi.createDiscoverCards(this, items, Object.assign({}, options, {
                    forGrid: forGrid === true,
                    usePoster: !useBackdrop,
                    preferEnglishBackdrop: (((this._advancedSettings || {}).tmdb || {}).preferOriginalLanguageImages !== true)
                }));
            }

            if (useBackdrop) {
                return this.createDiscoverBackdropCards(items, forGrid, options);
            }
            return this.createDiscoverPosterCards(items, forGrid, options);
        },

        normalizeDiscoverMediaType: function (value) {
            const normalized = String(value || '').toLowerCase();
            if (normalized === 'series' || normalized === 'tv') {
                return 'tv';
            }
            if (normalized === 'movie') {
                return 'movie';
            }
            return value;
        },

        buildDiscoverYearText: function (item) {
            const self = this;
            const date = new Date(self.getField(item, 'PremiereDate', 'premiereDate', 'releaseDate', 'firstAirDate') || '');
            const year = Number.isNaN(date.getFullYear()) ? '' : date.getFullYear();
            const rating = Number(self.getField(item, 'CommunityRating', 'communityRating') || 0);
            const starIcon = '<span class="material-icons" style="font-size:14px;vertical-align:middle;color:#FFD700;">star</span>';
            const yearText = rating
                ? `${starIcon} ${rating.toFixed(1)} • ${year}`
                : `${starIcon} - • ${year}`;
            return { year: year, yearText: yearText };
        },

        createDiscoverPosterCards: function (items, forGrid, options) {
            const self = this;
            options = options || {};
            const interactive = options.interactive !== false;
            const includeMetaText = options.includeMetaText !== false;
            const cardType = forGrid ? 'portraitCard' : 'overflowPortraitCard';
            const padderType = forGrid ? 'cardPadder-portrait' : 'cardPadder-overflowPortrait';
            const staticClass = interactive ? '' : ' seerrfin-discover-card--static';
            const boxClass = includeMetaText ? 'cardBox cardBox-bottompadded' : 'cardBox';
            const letterboxdSlot = options.letterboxdSlot === true;

            return items.map(function (item) {
                const mediaId = self.getProviderId(item, 'Tmdb') ||
                    self.getProviderId(item, 'Jellyseerr') ||
                    self.getField(item, 'id', 'Id');
                const mediaType = self.normalizeDiscoverMediaType(
                    self.getField(item, 'SourceType', 'sourceType', 'mediaType', 'MediaType')
                );
                const posterUrl = self.buildDiscoverPosterUrl(item);
                const safeName = self.escapeHtml(self.getField(item, 'Name', 'name', 'OriginalTitle', 'originalTitle') || 'Unknown');
                if (!mediaId || !mediaType) {
                    return;
                }

                const safeUrl = self.escapeHtml(posterUrl || '');
                const imageAttrs = posterUrl ? ` data-src="${safeUrl}"` : '';
                const overlayHtml = interactive ? `
                    <div class="cardOverlayContainer">
                        <div class="cardImageContainer"></div>
                        <div class="cardOverlayButton-br flex">
                            <button is="discover-requestbutton" type="button" class="discover-requestbutton cardOverlayButton cardOverlayButton-hover paper-icon-button-light emby-button" data-id="${mediaId}" data-media-type="${mediaType}">
                                <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover add" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>` : '';
                const metaHtml = includeMetaText ? (function () {
                    const meta = self.buildDiscoverYearText(item);
                    return `
                        <div class="cardText cardTextCentered cardText-first"><bdi><span title="${safeName}">${safeName}</span></bdi></div>
                        <div class="cardText cardTextCentered cardText-secondary"><bdi><span title="${meta.year}">${meta.yearText}</span></bdi></div>`;
                })() : '';
                const selected = letterboxdSlot && typeof options.getLetterboxdSelected === 'function'
                    ? options.getLetterboxdSelected(parseInt(mediaId, 10))
                    : false;
                const letterboxdClass = letterboxdSlot
                    ? ` seerrfin-letterboxd-card${selected ? ' is-selected' : ''}`
                    : '';
                const ariaSelected = letterboxdSlot
                    ? ` aria-selected="${selected ? 'true' : 'false'}"`
                    : '';
                const chromeHtml = letterboxdSlot ? self.renderLetterboxdCardChrome() : '';

                const cardHtml = `
                    <div class="card ${cardType} seerrfin-discover-card${staticClass}${letterboxdClass}" data-tmdb-id="${mediaId}" data-media-type="${mediaType}"${ariaSelected}>
                        <div class="${boxClass}">
                            <div class="cardScalable">
                                <div class="cardPadder ${padderType} lazy-hidden-children"></div>
                                <div class="cardImageContainer coveredImage cardContent lazy lazy-hidden"${imageAttrs} aria-label="${safeName}"></div>
                                ${overlayHtml}
                                ${chromeHtml}
                            </div>
                            ${metaHtml}
                        </div>
                    </div>`;

                return self.wrapDiscoverCard(cardHtml, options);
            }).join('');
        },

        createDiscoverBackdropCards: function (items, forGrid, options) {
            const self = this;
            options = options || {};
            const interactive = options.interactive !== false;
            const includeMetaText = options.includeMetaText !== false;
            const gridClass = forGrid ? ' seerrfin-discover-card--grid' : '';
            const staticClass = interactive ? '' : ' seerrfin-discover-card--static';
            const boxClass = includeMetaText ? 'cardBox cardBox-bottompadded' : 'cardBox';
            const letterboxdSlot = options.letterboxdSlot === true;

            return items.map(function (item) {
                const mediaId = self.getProviderId(item, 'Tmdb') ||
                    self.getProviderId(item, 'Jellyseerr') ||
                    self.getField(item, 'id', 'Id');
                const mediaType = self.normalizeDiscoverMediaType(
                    self.getField(item, 'SourceType', 'sourceType', 'mediaType', 'MediaType')
                );
                const safeName = self.escapeHtml(self.getField(item, 'Name', 'name', 'OriginalTitle', 'originalTitle') || 'Unknown');
                if (!mediaId || !mediaType) {
                    return;
                }

                let fallbackUrl = self.getProviderId(item, 'JellyseerrBackdrop');
                fallbackUrl = self.resolveImageUrl(fallbackUrl);
                const tmdbBackdropPath = self.getProviderId(item, 'TmdbBackdropPath') || '';
                const safeFallback = self.escapeHtml(fallbackUrl || '');
                const safeBackdropPath = self.escapeHtml(tmdbBackdropPath);
                const fallbackAttr = safeFallback ? ` data-fallback-src="${safeFallback}"` : '';
                const backdropPathAttr = safeBackdropPath ? ` data-tmdb-backdrop-path="${safeBackdropPath}"` : '';
                const overlayHtml = interactive ? `
                    <div class="cardOverlayContainer">
                        <div class="cardImageContainer"></div>
                        <div class="cardOverlayButton-br flex">
                            <button is="discover-requestbutton" type="button" class="discover-requestbutton cardOverlayButton cardOverlayButton-hover paper-icon-button-light emby-button" data-id="${mediaId}" data-media-type="${mediaType}">
                                <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover add" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>` : '';
                const metaHtml = includeMetaText ? (function () {
                    const meta = self.buildDiscoverYearText(item);
                    return `
                        <div class="cardText cardTextCentered cardText-first seerrfin-discover-title-below"><bdi><span title="${safeName}">${safeName}</span></bdi></div>
                        <div class="cardText cardTextCentered cardText-secondary"><bdi><span title="${meta.year}">${meta.yearText}</span></bdi></div>`;
                })() : '';
                const selected = letterboxdSlot && typeof options.getLetterboxdSelected === 'function'
                    ? options.getLetterboxdSelected(parseInt(mediaId, 10))
                    : false;
                const letterboxdClass = letterboxdSlot ? ` seerrfin-letterboxd-card${selected ? ' is-selected' : ''}` : '';
                const ariaSelected = letterboxdSlot ? ` aria-selected="${selected ? 'true' : 'false'}"` : '';
                const chromeHtml = letterboxdSlot ? self.renderLetterboxdCardChrome() : '';

                const cardHtml = `
                    <div class="card seerrfin-discover-card seerrfin-discover-card--backdrop${gridClass}${staticClass}${letterboxdClass}" data-tmdb-id="${mediaId}" data-media-type="${mediaType}"${fallbackAttr}${backdropPathAttr}${ariaSelected}>
                        <div class="${boxClass}">
                            <div class="cardScalable seerrfin-discover-backdrop-scalable">
                                <div class="cardPadder seerrfin-discover-backdrop-padder"></div>
                                <div class="cardImageContainer coveredImage cardContent seerrfin-discover-backdrop-image" aria-label="${safeName}">
                                    <span class="seerrfin-discover-backdrop-media"></span>
                                    <span class="seerrfin-discover-overlay-title seerrfin-box-label">${safeName}</span>
                                </div>
                                ${overlayHtml}
                                ${chromeHtml}
                            </div>
                            ${metaHtml}
                        </div>
                    </div>`;

                return self.wrapDiscoverCard(cardHtml, options);
            }).join('');
        },

        setDiscoverBackdropImage: function (card, cachedUrl) {
            if (!card) {
                return;
            }

            const media = card.querySelector('.seerrfin-discover-backdrop-media');
            if (!media) {
                return;
            }

            const path = card.getAttribute('data-tmdb-backdrop-path') || '';
            const style = this.getDisplayStyle('discoverBackdrop');
            let displayUrl = style.duotoneEnabled && path
                ? (this.buildTmdbImageUrl(path, 'discoverBackdrop') || '')
                : '';

            if (!displayUrl) {
                displayUrl = cachedUrl || '';
            }

            if (!displayUrl) {
                return;
            }

            media.style.backgroundImage = "url('" + displayUrl.replace(/'/g, "\\'") + "')";
        },

        setDiscoverBackdropPresentation: function (card, mode) {
            if (!card) {
                return;
            }

            card.classList.remove(
                'seerrfin-discover-card--english',
                'seerrfin-discover-card--fallback'
            );

            if (mode === 'english') {
                card.classList.add('seerrfin-discover-card--english');
                return;
            }

            if (mode === 'fallback') {
                card.classList.add('seerrfin-discover-card--fallback');
            }
        },

        getBackdropCacheKey: function (mediaType, tmdbId) {
            return String(mediaType || '').toLowerCase() + ':' + String(tmdbId || '');
        },

        // Use English backdrops by default, unless the original-language image setting is enabled.
        cacheBackdropResult: function (cacheKey, incoming) {
            if (!cacheKey || !incoming || !incoming.url) {
                return;
            }

            if (!this._backdropResultCache) {
                this._backdropResultCache = {};
            }

            const existing = this._backdropResultCache[cacheKey];
            if (!existing || !existing.url) {
                this._backdropResultCache[cacheKey] = incoming;
                return;
            }

            const preferOriginal = (((this._advancedSettings || {}).tmdb || {}).preferOriginalLanguageImages === true);
            if (preferOriginal) {
                this._backdropResultCache[cacheKey] = incoming;
                return;
            }

            if (incoming.hasEnglishBackdrop && !existing.hasEnglishBackdrop) {
                this._backdropResultCache[cacheKey] = incoming;
            }
        },

        normalizeBackdropBatchItem: function (item) {
            if (!item) {
                return null;
            }

            const mediaType = String(item.mediaType || item.MediaType || '').toLowerCase();
            const tmdbId = parseInt(item.tmdbId || item.TmdbId || '0', 10);
            const url = item.backdropUrl || item.BackdropUrl || '';
            const path = item.tmdbBackdropPath || item.TmdbBackdropPath || '';
            const hasEnglish = !!(item.hasEnglishBackdrop || item.HasEnglishBackdrop);

            return {
                mediaType: mediaType,
                tmdbId: tmdbId,
                url: url ? this.resolveImageUrl(url) : '',
                path: path,
                hasEnglishBackdrop: hasEnglish
            };
        },

        fetchTmdbBackdropBatch: function (items) {
            const self = this;
            if (!items || !items.length) {
                return Promise.resolve(self._backdropResultCache || {});
            }

            if (!self._backdropResultCache) {
                self._backdropResultCache = {};
            }

            const unique = {};
            const uncached = [];

            items.forEach(function (item) {
                const mediaType = String(item.mediaType || '').toLowerCase();
                const tmdbId = parseInt(item.tmdbId || '0', 10);
                if (!mediaType || !tmdbId) {
                    return;
                }

                const cacheKey = self.getBackdropCacheKey(mediaType, tmdbId);
                if (unique[cacheKey]) {
                    return;
                }

                unique[cacheKey] = true;
                if (!self._backdropResultCache[cacheKey]) {
                    uncached.push({
                        mediaType: mediaType,
                        tmdbId: tmdbId
                    });
                }
            });

            if (!uncached.length) {
                return Promise.resolve(self._backdropResultCache);
            }

            if (!self._backdropBatchInflight) {
                self._backdropBatchInflight = {};
            }

            const batchKey = uncached.map(function (item) {
                return item.mediaType + ':' + item.tmdbId;
            }).sort().join('|');

            if (self._backdropBatchInflight[batchKey]) {
                return self._backdropBatchInflight[batchKey];
            }

            const promise = ApiClient.ajax({
                url: ApiClient.getUrl('SeerrFin/backdrops'),
                type: 'POST',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({ items: uncached })
            }).then(function (data) {
                const results = data && (data.items || data.Items || []);
                (results || []).forEach(function (item) {
                    const normalized = self.normalizeBackdropBatchItem(item);
                    if (!normalized || !normalized.tmdbId) {
                        return;
                    }

                    const cacheKey = self.getBackdropCacheKey(normalized.mediaType, normalized.tmdbId);
                    self.cacheBackdropResult(cacheKey, normalized);
                });
                return self._backdropResultCache;
            }).catch(function (err) {
                log.warn('backdrop batch fetch failed', err);
                return self._backdropResultCache;
            }).finally(function () {
                delete self._backdropBatchInflight[batchKey];
            });

            self._backdropBatchInflight[batchKey] = promise;
            return promise;
        },

        applyDiscoverBackdropResult: function (card, result, seerrFallbackUrl) {
            const self = this;
            const url = result && result.url;
            const hasEnglish = result && result.hasEnglishBackdrop;
            const alreadyEnglish = card.classList.contains('seerrfin-discover-card--english');

            if (result && result.path) {
                card.setAttribute('data-tmdb-backdrop-path', result.path);
            }

            if (url && hasEnglish) {
                self.setDiscoverBackdropPresentation(card, 'english');
                self.setDiscoverBackdropImage(card, url);
                return;
            }

            // Dont downgrade a card that already resolved to English backdrop.
            if (alreadyEnglish) {
                return;
            }

            const fallbackUrl = url || seerrFallbackUrl;
            if (fallbackUrl || card.getAttribute('data-tmdb-backdrop-path')) {
                self.setDiscoverBackdropPresentation(card, 'fallback');
                self.setDiscoverBackdropImage(card, fallbackUrl);
            }
        },

        hydrateDiscoverBackdropCards: function (container) {
            const self = this;
            if (!container) {
                return;
            }

            const cards = container.querySelectorAll('.seerrfin-discover-card--backdrop:not([data-backdrop-hydrate-queued]):not([data-backdrop-loaded])');
            if (!cards.length) {
                return;
            }

            if (!self._backdropResultCache) {
                self._backdropResultCache = {};
            }

            const batchItems = [];
            const cardEntries = [];

            cards.forEach(function (card) {
                card.dataset.backdropHydrateQueued = 'true';

                const seerrFallback = card.getAttribute('data-fallback-src') || '';
                const mediaId = card.dataset.tmdbId;
                const mediaType = card.dataset.mediaType;
                const cacheKey = mediaType && mediaId ? self.getBackdropCacheKey(mediaType, mediaId) : '';
                const cachedResult = cacheKey ? self._backdropResultCache[cacheKey] : null;

                if (cachedResult) {
                    self.applyDiscoverBackdropResult(card, cachedResult, seerrFallback);
                    card.dataset.backdropLoaded = 'true';
                    return;
                }

                if (!mediaId || !mediaType) {
                    card.dataset.backdropLoaded = 'true';
                    return;
                }

                batchItems.push({
                    mediaType: mediaType,
                    tmdbId: parseInt(mediaId, 10)
                });
                cardEntries.push({
                    card: card,
                    seerrFallback: seerrFallback,
                    mediaType: mediaType,
                    mediaId: mediaId
                });
            });

            if (!cardEntries.length) {
                return;
            }

            self.fetchTmdbBackdropBatch(batchItems).then(function () {
                let retryPending = false;
                cardEntries.forEach(function (entry) {
                    const cacheKey = self.getBackdropCacheKey(entry.mediaType, entry.mediaId);
                    const result = self._backdropResultCache[cacheKey] || null;

                    if (entry.card.classList.contains('seerrfin-discover-card--english') &&
                        !(result && result.hasEnglishBackdrop)) {
                        entry.card.dataset.backdropLoaded = 'true';
                        delete entry.card.dataset.backdropAttempts;
                        return;
                    }

                    self.applyDiscoverBackdropResult(entry.card, result, entry.seerrFallback);

                    // Missing results mean TMDB lookup failed (rate limit).
                    // Leave the card un-hydrated so it retries a few times to avoid retrying items that truly have no backdrop.
                    if (result && result.url) {
                        entry.card.dataset.backdropLoaded = 'true';
                        delete entry.card.dataset.backdropAttempts;
                        return;
                    }

                    const attempts = (parseInt(entry.card.dataset.backdropAttempts || '0', 10) || 0) + 1;
                    if (attempts >= 3) {
                        entry.card.dataset.backdropLoaded = 'true';
                        return;
                    }
                    entry.card.dataset.backdropAttempts = String(attempts);
                    delete entry.card.dataset.backdropHydrateQueued;
                    retryPending = true;
                });

                if (retryPending && container.isConnected) {
                    setTimeout(function () {
                        self.hydrateDiscoverBackdropCards(container);
                    }, 2000);
                }
            });
        },

        clearCardThumbSkeleton: function (root) {
            if (!root) {
                return;
            }

            const card = root.closest ? (root.closest('.card') || root) : root;
            if (!card || !card.querySelectorAll) {
                return;
            }

            card.querySelectorAll('.seerrfin-card-thumb-skeleton').forEach(function (skeleton) {
                if (skeleton.classList.contains('cardPadder')) {
                    skeleton.classList.remove('seerrfin-card-thumb-skeleton');
                    return;
                }
                skeleton.remove();
            });
        },

        setNativeBackdropImage: function (card, url, fallbackUrl) {
            const self = this;
            if (!card) {
                return;
            }

            if (!url) {
                self.clearCardThumbSkeleton(card);
                return;
            }

            const image = card.querySelector('.cardImageContainer.cardContent');
            if (!image) {
                self.clearCardThumbSkeleton(card);
                return;
            }

            const requestId = String((parseInt(card.dataset.nativeBackdropRequest || '0', 10) || 0) + 1);
            card.dataset.nativeBackdropRequest = requestId;

            const applyLoadedImage = function (loadedUrl) {
                if (!card.isConnected || card.dataset.nativeBackdropRequest !== requestId) {
                    return;
                }

                image.removeAttribute('data-src');
                card.setAttribute('data-native-backdrop-src', loadedUrl);
                image.style.backgroundImage = "url('" + loadedUrl.replace(/'/g, "\\'") + "')";
                image.classList.add('lazy-image-fadein-fast');
                image.classList.remove('lazy-hidden');

                const canvas = card.querySelector('.blurhash-canvas');
                if (canvas) {
                    canvas.classList.add('lazy-hidden');
                }

                const clearSkeleton = function () {
                    if (card.dataset.nativeBackdropRequest === requestId) {
                        self.clearCardThumbSkeleton(card);
                    }
                };
                image.addEventListener('animationend', function onEnd() {
                    clearSkeleton();
                    image.removeEventListener('animationend', onEnd);
                });
                setTimeout(clearSkeleton, 200);

                const padder = card.querySelector('.cardPadder');
                if (padder) {
                    padder.classList.add('lazy-hidden-children');
                }
            };

            const preloader = new Image();
            preloader.onload = function () {
                applyLoadedImage(url);
            };
            preloader.onerror = function () {
                if (!fallbackUrl || fallbackUrl === url) {
                    self.clearCardThumbSkeleton(card);
                    return;
                }

                const fallback = new Image();
                fallback.onload = function () {
                    applyLoadedImage(fallbackUrl);
                };
                fallback.onerror = function () {
                    self.clearCardThumbSkeleton(card);
                };
                fallback.src = fallbackUrl;
            };
            preloader.src = url;
        },

        applyNativeBackdropResult: function (card, result) {
            if (!card) {
                return;
            }

            if (result && result.path) {
                card.setAttribute('data-tmdb-backdrop-path', result.path);
            }

            if (card.dataset.nativeBackdropEnglish === 'true' && !(result && result.hasEnglishBackdrop)) {
                return;
            }

            const englishUrl = result && result.hasEnglishBackdrop && result.url ? result.url : '';
            const fallbackUrl = (result && result.url) ||
                card.getAttribute('data-fallback-src') ||
                '';

            if (englishUrl) {
                card.dataset.nativeBackdropEnglish = 'true';
                this.setNativeBackdropImage(card, englishUrl, fallbackUrl);
                return;
            }

            if (card.dataset.nativeBackdropEnglish === 'true') {
                return;
            }

            this.setNativeBackdropImage(card, fallbackUrl);
        },

        hydrateNativeBackdropCards: function (container) {
            const self = this;
            if (!container) {
                return;
            }

            const cards = container.querySelectorAll('[data-seerrfin-native-card="true"]:not([data-native-backdrop-hydrate-queued]):not([data-native-backdrop-loaded])');
            if (!cards.length) {
                return;
            }

            const batchItems = [];
            const cardEntries = [];

            cards.forEach(function (card) {
                card.dataset.nativeBackdropHydrateQueued = 'true';

                const mediaId = card.dataset.tmdbId;
                const mediaType = card.dataset.mediaType;
                const cacheKey = mediaType && mediaId ? self.getBackdropCacheKey(mediaType, mediaId) : '';
                const cachedResult = cacheKey && self._backdropResultCache ? self._backdropResultCache[cacheKey] : null;

                if (cachedResult) {
                    self.applyNativeBackdropResult(card, cachedResult);
                    card.dataset.nativeBackdropLoaded = 'true';
                    return;
                }

                if (!mediaId || !mediaType) {
                    self.clearCardThumbSkeleton(card);
                    card.dataset.nativeBackdropLoaded = 'true';
                    return;
                }

                batchItems.push({
                    mediaType: mediaType,
                    tmdbId: parseInt(mediaId, 10)
                });
                cardEntries.push({
                    card: card,
                    mediaType: mediaType,
                    mediaId: mediaId
                });
            });

            if (!cardEntries.length) {
                return;
            }

            self.fetchTmdbBackdropBatch(batchItems).then(function () {
                cardEntries.forEach(function (entry) {
                    const cacheKey = self.getBackdropCacheKey(entry.mediaType, entry.mediaId);
                    const result = self._backdropResultCache && self._backdropResultCache[cacheKey] || null;
                    self.applyNativeBackdropResult(entry.card, result);

                    const hasUrl = !!(result && result.url) || !!entry.card.getAttribute('data-fallback-src');
                    if (!hasUrl) {
                        self.clearCardThumbSkeleton(entry.card);
                    }
                    entry.card.dataset.nativeBackdropLoaded = 'true';
                });
            });
        },

        bindRequestHandler: function () {
            // Capturing runs before card navigation handlers
            document.addEventListener('click', function (e) {
                const btn = e.target.closest('.discover-requestbutton');
                if (!btn || !btn.closest('.seerrfin-movies-sections, .seerrfin-tv-sections, [data-seerrfin-grid-view], .seerrfin-search-section')) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const mediaId = btn.getAttribute('data-id');
                const mediaType = btn.getAttribute('data-media-type');
                if (window.seerrFinModal && window.seerrFinModal.openQualityPicker) {
                    window.seerrFinModal.openQualityPicker(mediaId, mediaType);
                }
            }, true);
        },

        bindCardClickHandler: function () {
            // Capturing so card opens our modal instead of jellyfin detail page
            document.addEventListener('click', function (e) {
                if (e.target.closest('.discover-requestbutton')) {
                    return;
                }

                const card = e.target.closest('.seerrfin-discover-card, [data-seerrfin-native-card="true"]');
                if (!card || card.classList.contains('seerrfin-discover-card--static') ||
                    !card.closest('.seerrfin-movies-sections, .seerrfin-tv-sections, [data-seerrfin-grid-view], .seerrfin-search-section')) {
                    return;
                }

                const mediaId = card.dataset.tmdbId;
                const mediaType = card.dataset.mediaType;
                if (!mediaId || !mediaType) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (window.seerrFinModal && window.seerrFinModal.open) {
                    window.seerrFinModal.open(mediaId, mediaType);
                }
            }, true);
        },

        bindViewMoreHandler: function () {
            const self = this;

            document.addEventListener('contextmenu', function (e) {
                if (e.target.closest('[data-seerrfin-grid-view]')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);

            document.addEventListener('click', function (e) {
                const btn = e.target.closest('.seerrfin-view-more');
                if (btn) {
                    const container = btn.closest('.seerrfin-movies-sections, .seerrfin-tv-sections');
                    if (!container) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    const path = btn.getAttribute('data-path');
                    const title = btn.getAttribute('data-title');
                    if (path && title) {
                        self.openGridView(container, title, path);
                    }
                    return;
                }

                const boxCard = e.target.closest('[data-seerrfin-box-card="true"]');
                if (!boxCard) {
                    return;
                }

                const boxContainer = boxCard.closest('.seerrfin-movies-sections, .seerrfin-tv-sections');
                if (!boxContainer) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const kind = boxCard.getAttribute('data-kind');
                const mediaType = boxCard.getAttribute('data-media-type');
                const id = boxCard.getAttribute('data-id');
                const name = boxCard.getAttribute('data-name');
                const browsePath = self.buildBrowseGridPath(kind, mediaType, id);
                if (browsePath && name) {
                    self.openGridView(boxContainer, name, browsePath);
                }
            }, true);
        },

        clearJellyfinSelection: function () {
            const closeBtn = document.querySelector('.btnCloseSelectionPanel');
            if (closeBtn) {
                closeBtn.click();
                return;
            }

            document.querySelectorAll('.itemSelectionPanel').forEach(function (panel) {
                const parent = panel.parentNode;
                if (parent) {
                    parent.removeChild(panel);
                    parent.classList.remove('withMultiSelect');
                }
            });

            document.querySelectorAll('.selectionCommandsPanel').forEach(function (panel) {
                if (panel.parentNode) {
                    panel.parentNode.removeChild(panel);
                }
            });
        },

        renderLegacyGridViewShell: function () {
            return `
                <div class="seerrfin-grid-view" data-seerrfin-grid-view="true" data-grid-shell="legacy">
                    <div class="seerrfin-grid-header padded-left padded-right">
                        <button type="button" class="seerrfin-grid-back paper-icon-button-light emby-button" title="Back" aria-label="Back" data-grid-nav="back">
                            <span class="material-icons" aria-hidden="true">arrow_back</span>
                        </button>
                        <h2 class="seerrfin-grid-title sectionTitle sectionTitle-cards"></h2>
                    </div>
                    <div>
                        <div is="emby-itemscontainer" class="itemsContainer padded-left padded-right vertical-wrap focuscontainer-x" data-monitor="videoplayback,markplayed"></div>
                    </div>
                    <div data-seerrfin-loadmore style="display:none" class="seerrfin-grid-loadmore">
                        <button type="button" class="raised emby-button">Load more</button>
                    </div>
                    <div data-seerrfin-status style="display:none" class="seerrfin-grid-status"></div>
                </div>`;
        },

        renderGridViewShell: function (useNativeGrid) {
            return useNativeGrid
                ? window.seerrFinNativeUi.renderGridViewShell()
                : this.renderLegacyGridViewShell();
        },

        applyGridViewMode: function (gridView) {
            const mode = gridView.dataset.gridViewMode || 'ThumbCard';
            const usePoster = mode === 'Poster' || mode === 'PosterCard';
            const showCardText = mode === 'PosterCard' || mode === 'ThumbCard';
            const cards = gridView.querySelectorAll('[data-seerrfin-native-card="true"]');

            cards.forEach(function (card) {
                const image = card.querySelector('.cardImageContainer.cardContent');
                const padder = card.querySelector('.cardPadder');
                if (!image || !padder) {
                    return;
                }

                card.classList.remove('overflowBackdropCard', 'overflowPortraitCard', 'backdropCard', 'portraitCard');
                card.classList.add(usePoster ? 'portraitCard' : 'backdropCard');
                padder.classList.remove(
                    'cardPadder-overflowBackdrop',
                    'cardPadder-overflowPortrait',
                    'cardPadder-backdrop',
                    'cardPadder-portrait'
                );
                padder.classList.add(usePoster ? 'cardPadder-portrait' : 'cardPadder-backdrop');
                image.classList.add('coveredImage');

                const cardBox = card.querySelector('.cardBox');
                if (cardBox) {
                    cardBox.classList.add('cardBox-bottompadded');
                }

                card.querySelectorAll('.cardText').forEach(function (textEl) {
                    textEl.classList.toggle('hide', !showCardText);
                });

                const nextUrl = usePoster
                    ? (card.getAttribute('data-poster-src') || card.getAttribute('data-fallback-src') || '')
                    : (card.getAttribute('data-native-backdrop-src') || card.getAttribute('data-fallback-src') || '');
                if (nextUrl) {
                    image.style.backgroundImage = "url('" + nextUrl.replace(/'/g, "\\'") + "')";
                    image.removeAttribute('data-src');
                    image.classList.remove('lazy-hidden');
                }
            });
        },

        applyGridSort: function (gridView) {
            const itemsContainer = gridView.querySelector('.itemsContainer');
            if (!itemsContainer) {
                return;
            }

            const sort = gridView.dataset.gridSort || 'title';
            const sortOrder = gridView.dataset.gridSortOrder || (sort === 'title' ? 'Ascending' : 'Descending');
            const cards = Array.from(itemsContainer.querySelectorAll('.card'));
            cards.sort(function (a, b) {
                let result;
                if (sort === 'year') {
                    result = (parseInt(b.dataset.year || '0', 10) || 0) - (parseInt(a.dataset.year || '0', 10) || 0);
                } else if (sort === 'rating') {
                    result = (Number(b.dataset.rating || 0) || 0) - (Number(a.dataset.rating || 0) || 0);
                } else {
                    result = (a.dataset.name || '').localeCompare(b.dataset.name || '');
                }
                if (sort === 'title') {
                    return sortOrder === 'Descending' ? -result : result;
                }
                return sortOrder === 'Ascending' ? -result : result;
            });
            cards.forEach(function (card) {
                itemsContainer.appendChild(card);
            });
        },

        applyGridPresentation: function (gridView) {
            this.applyGridViewMode(gridView);
            this.applyGridSort(gridView);
        },

        openGridView: function (container, title, path) {
            const self = this;
            self.clearJellyfinSelection();
            self.cancelContainerLoad(container);

            Array.from(container.children).forEach(function (child) {
                if (!child.hasAttribute('data-seerrfin-grid-view')) {
                    child.style.display = 'none';
                    child.dataset.seerrfinHidden = 'true';
                }
            });

            const useNativeGrid = self.shouldUseNativeGridPages();
            const shellMode = useNativeGrid ? 'native' : 'legacy';
            let gridView = container.querySelector('[data-seerrfin-grid-view]');
            if (gridView && gridView.dataset.gridShell !== shellMode) {
                gridView.remove();
                gridView = null;
            }
            if (!gridView) {
                gridView = self.mountFromHtml(self.renderGridViewShell(useNativeGrid));
                gridView.dataset.gridShell = shellMode;
                container.appendChild(gridView);

                gridView.querySelectorAll('[data-grid-nav="back"]').forEach(function (button) {
                    button.addEventListener('click', function () {
                        self.closeGridView(container);
                    });
                });
                gridView.querySelector('[data-seerrfin-loadmore] button').addEventListener('click', function () {
                    self.loadMoreGridItems(gridView);
                });
            }

            if (useNativeGrid) {
                window.seerrFinNativeUi.bindGridControls(self, gridView);
            }

            gridView.dataset.path = path;
            gridView.dataset.gridSessionId = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
            gridView.dataset.loading = 'false';
            gridView.dataset.loadedCount = '0';
            gridView.dataset.total = '0';
            gridView.dataset.nativeCards = useNativeGrid ? 'true' : 'false';
            gridView.dataset.gridViewMode = self.shouldUseBackdropThumbnails() ? 'ThumbCard' : 'PosterCard';
            gridView.dataset.gridSort = 'title';
            gridView.dataset.gridSortBy = 'SortName';
            delete gridView.dataset.gridSortOrder;
            const gridTitle = gridView.querySelector('.sectionTitle');
            if (gridTitle) {
                gridTitle.textContent = title;
            }
            gridView.querySelector('.itemsContainer').innerHTML = '';
            gridView.querySelector('[data-seerrfin-loadmore]').style.display = 'none';
            gridView.querySelector('[data-seerrfin-status]').style.display = 'none';
            gridView.style.display = '';
            if (useNativeGrid) {
                window.seerrFinNativeUi.setGridControlsEnabled(gridView, false);
                window.seerrFinNativeUi.updateGridChrome(gridView);
            }

            self.loadMoreGridItems(gridView, true);
        },

        closeGridView: function (container) {
            this.clearJellyfinSelection();

            const gridView = container.querySelector('[data-seerrfin-grid-view]');
            if (gridView) {
                gridView.dataset.gridSessionId = 'closed-' + Date.now() + '-' + Math.random().toString(16).slice(2);
                gridView.dataset.loading = 'false';
                gridView.style.display = 'none';
            }

            Array.from(container.children).forEach(function (child) {
                if (child.dataset.seerrfinHidden === 'true') {
                    child.style.display = '';
                    delete child.dataset.seerrfinHidden;
                }
            });
            this.scheduleRender();
        },

        loadMoreGridItems: function (gridView, isInitial) {
            const self = this;
            const path = gridView.dataset.path;
            const itemsContainer = gridView.querySelector('.itemsContainer');
            const loadMore = gridView.querySelector('[data-seerrfin-loadmore]');
            const loadMoreBtn = loadMore.querySelector('button');
            const status = gridView.querySelector('[data-seerrfin-status]');
            const loadedCount = parseInt(gridView.dataset.loadedCount || '0', 10);
            const pageSize = self._gridPageSize;
            const useNativeCards = gridView.dataset.nativeCards === 'true';
            const gridSessionId = gridView.dataset.gridSessionId || '';

            if (gridView.dataset.loading === 'true') {
                return;
            }

            gridView.dataset.loading = 'true';
            if (isInitial) {
                status.textContent = 'Loading...';
                status.style.display = '';
            } else {
                loadMoreBtn.textContent = 'Loading...';
                loadMoreBtn.disabled = true;
            }

            self.fetchDiscover(path, '?startIndex=' + encodeURIComponent(loadedCount) + '&limit=' + encodeURIComponent(pageSize)).then(function (result) {
                if (!gridView.isConnected || gridView.dataset.gridSessionId !== gridSessionId || gridView.dataset.path !== path) {
                    return;
                }

                gridView.dataset.loading = 'false';
                status.style.display = 'none';

                if (!result.items.length && loadedCount === 0) {
                    itemsContainer.innerHTML = `<div class="seerrfin-empty-row">No items to show</div>`;
                    loadMore.style.display = 'none';
                    if (useNativeCards) {
                        window.seerrFinNativeUi.setGridControlsEnabled(gridView, false);
                        window.seerrFinNativeUi.updateGridChrome(gridView);
                    }
                    return;
                }

                const existingIds = new Set();
                itemsContainer.querySelectorAll('[data-tmdb-id]').forEach(function (card) {
                    existingIds.add(card.getAttribute('data-tmdb-id'));
                });
                const newItems = result.items.filter(function (item) {
                    const id = String(self.getProviderId(item, 'Tmdb') ||
                        self.getProviderId(item, 'Jellyseerr') ||
                        self.getField(item, 'id', 'Id') || '');
                    return id && !existingIds.has(id) && existingIds.add(id);
                });

                itemsContainer.insertAdjacentHTML('beforeend', self.createDiscoverCards(newItems, true, {
                    nativeCards: useNativeCards
                }));
                self.initNativeOrCustomCards(itemsContainer, useNativeCards);
                const newCount = loadedCount + result.items.length;
                gridView.dataset.loadedCount = String(newCount);

                const total = parseInt(result.total || gridView.dataset.total || '0', 10);
                if (total > 0) {
                    gridView.dataset.total = String(total);
                }

                const hasMore = result.items.length === pageSize &&
                    (total === 0 || newCount < total);
                loadMore.style.display = hasMore ? '' : 'none';
                loadMoreBtn.textContent = 'Load more';
                loadMoreBtn.disabled = false;
                if (useNativeCards) {
                    self.applyGridPresentation(gridView);
                    window.seerrFinNativeUi.setGridControlsEnabled(gridView, newCount > 0);
                    window.seerrFinNativeUi.updateGridChrome(gridView);
                }
            }).catch(function (err) {
                if (!gridView.isConnected || gridView.dataset.gridSessionId !== gridSessionId || gridView.dataset.path !== path) {
                    return;
                }

                gridView.dataset.loading = 'false';
                status.style.display = 'none';
                loadMoreBtn.textContent = 'Load more';
                loadMoreBtn.disabled = false;
                log.error('grid load failed for ' + path, err);
                if (loadedCount === 0) {
                    itemsContainer.innerHTML = `<div class="seerrfin-empty-row">Failed to load items.</div>`;
                }
                if (useNativeCards) {
                    window.seerrFinNativeUi.updateGridChrome(gridView);
                }
            });
        },

        setupSearchIntegration: function () {
            if (this._searchIntegrationBound) {
                return;
            }

            this._searchIntegrationBound = true;
            const self = this;
            const schedule = function () {
                clearTimeout(self._searchAttachTimer);
                self._searchAttachTimer = setTimeout(function () {
                    self.attachJellyfinSearchInput();
                    self.handleJellyfinSearchPage();
                }, 100);
            };

            document.addEventListener('viewshow', schedule);
            window.addEventListener('hashchange', schedule);

            if (document.body) {
                this._searchMutationObserver = new MutationObserver(schedule);
                this._searchMutationObserver.observe(document.body, { childList: true, subtree: true });
            }

            schedule();
        },

        isSearchSettingEnabled: function () {
            const settings = this._displaySettings;
            return !settings || settings.AddSeerrResultsInSearch !== false;
        },

        findSearchPage: function () {
            const pages = document.querySelectorAll('#searchPage');
            for (let i = pages.length - 1; i >= 0; i--) {
                if (this.isContainerVisible(pages[i])) {
                    return pages[i];
                }
            }
            return null;
        },

        findSearchInput: function (searchPage) {
            if (!searchPage) {
                return null;
            }

            return searchPage.querySelector('#searchTextInput, input[type="search"], input.searchfields-txt');
        },

        findSearchResultsContainer: function (searchPage) {
            if (!searchPage) {
                return null;
            }

            // Match Jellyfin's results area, not the search input fields container.
            return searchPage.querySelector('.searchResults.padded-top.padded-bottom-page') ||
                searchPage.querySelector('.searchResults') ||
                searchPage.querySelector('[class*="searchResults"]');
        },

        insertSearchSection: function (searchPage, section) {
            const resultsContainer = this.findSearchResultsContainer(searchPage);
            if (resultsContainer) {
                resultsContainer.appendChild(section);
                return true;
            }

            const noResultsMessage = searchPage.querySelector('.noItemsMessage');
            if (noResultsMessage && noResultsMessage.parentNode) {
                noResultsMessage.parentNode.insertBefore(section, noResultsMessage.nextSibling);
                return true;
            }

            return false;
        },

        attachJellyfinSearchInput: function () {
            const self = this;
            const searchPage = self.findSearchPage();
            const input = self.findSearchInput(searchPage);
            if (!input || input.dataset.seerrfinSearchListener === 'true') {
                return;
            }

            input.dataset.seerrfinSearchListener = 'true';
            input.addEventListener('input', function () {
                self.handleJellyfinSearchPage();
            });
        },

        handleJellyfinSearchPage: function () {
            const self = this;
            const searchPage = self.findSearchPage();
            const input = self.findSearchInput(searchPage);
            const query = (input && input.value ? input.value : '').trim();

            if (!searchPage || !input || !query || !self.isSearchSettingEnabled()) {
                self.removeSearchSection();
                self._lastSearchQuery = null;
                self._lastSearchItems = null;
                self._activeSearchToken = null;
                return;
            }

            clearTimeout(self._searchDebounceTimer);
            self._searchDebounceTimer = setTimeout(function () {
                self.runJellyfinSearch(query);
            }, 300);
        },

        removeSearchSection: function () {
            document.querySelectorAll('.seerrfin-search-section').forEach(function (section) {
                section.remove();
            });
        },

        showSearchSkeleton: function (searchPage) {
            this.removeSearchSection();
            const skeleton = this.buildRowSkeleton('Seerr results', 'poster', {
                native: this.shouldUseNativeSearchResults()
            });
            skeleton.classList.add('seerrfin-search-section');
            this.insertSearchSection(searchPage, skeleton);
        },

        fetchSeerrSearch: function (query) {
            const language = ((navigator.language || 'en').split('-')[0] || 'en');
            const url = ApiClient.getUrl('SeerrFin/search') +
                '?query=' + encodeURIComponent(query) +
                '&language=' + encodeURIComponent(language) +
                '&_=' + Date.now();

            return ApiClient.ajax({
                url: url,
                type: 'GET',
                dataType: 'json',
                cache: false
            }).then(function (data) {
                const items = data && (data.Items || data.items || data.Results || data.results);
                const total = data && (data.TotalRecordCount ?? data.totalRecordCount ?? 0);
                return {
                    items: Array.isArray(items) ? items : [],
                    total: total
                };
            });
        },

        getSearchItemMediaRefs: function (item) {
            const mediaType = this.normalizeDiscoverMediaType(
                this.getField(item, 'SourceType', 'sourceType', 'mediaType', 'MediaType')
            );
            const tmdbId = parseInt(this.getProviderId(item, 'Tmdb') || '0', 10);
            return {
                mediaType: mediaType,
                tmdbId: tmdbId
            };
        },

        runJellyfinSearch: function (query) {
            const self = this;
            const searchPage = self.findSearchPage();
            const input = self.findSearchInput(searchPage);
            if (!searchPage || !input || input.value.trim() !== query || !self.isSearchSettingEnabled()) {
                return;
            }

            if (self._lastSearchQuery === query) {
                const existingSection = searchPage.querySelector('.seerrfin-search-section');
                if (!existingSection && Array.isArray(self._lastSearchItems) && self._lastSearchItems.length) {
                    self.renderSearchSection(searchPage, query, self._lastSearchItems);
                }
                return;
            }

            self._lastSearchQuery = query;
            self._lastSearchItems = null;
            const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
            self._activeSearchToken = token;

            self.showSearchSkeleton(searchPage);

            self.loadDisplaySettings().then(function () {
                if (self._activeSearchToken !== token || !self.isSearchSettingEnabled()) {
                    return;
                }

                return self.fetchSeerrSearch(query);
            }).then(function (result) {
                if (!result || self._activeSearchToken !== token) {
                    return;
                }

                const currentPage = self.findSearchPage();
                const currentInput = self.findSearchInput(currentPage);
                if (!currentPage || !currentInput || currentInput.value.trim() !== query) {
                    return;
                }

                self._lastSearchItems = result.items;
                self.renderSearchSection(currentPage, query, result.items);
            }).catch(function (err) {
                if (self._activeSearchToken === token) {
                    self._lastSearchItems = [];
                    log.warn('search failed for "' + query + '"', err);
                    self.removeSearchSection();
                }
            });
        },

        renderSearchSection: function (searchPage, query, items) {
            this.removeSearchSection();
            if (!items || !items.length) {
                return;
            }

            const safeQuery = this.escapeHtml(query);
            const useNativeCards = this.shouldUseNativeSearchResults();
            const section = useNativeCards
                ? this.mountFromHtml(`
                    <div class="verticalSection seerrfin-poster-section seerrfin-search-section seerrfin-section-fadein" data-query="${safeQuery}">
                        <h2 class="sectionTitle sectionTitle-cards focuscontainer-x padded-left padded-right">Seerr results</h2>
                        <div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x animatedScrollX" data-monitor="videoplayback,markplayed"></div>
                    </div>`)
                : this.mountFromHtml(`
                    <div class="verticalSection seerrfin-poster-section seerrfin-search-section seerrfin-section-fadein" data-query="${safeQuery}">
                        <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
                            <h2 class="sectionTitle sectionTitle-cards">Seerr results</h2>
                        </div>
                        <div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x"></div>
                    </div>`);

            const itemsContainer = section.querySelector('.itemsContainer');
            itemsContainer.innerHTML = this.createDiscoverCards(items, false, {
                interactive: true,
                includeMetaText: true,
                nativeCards: useNativeCards
            });
            this.appendHorizontalScroller(section, itemsContainer, {
                focusScale: this.getAdvancedCarouselSetting('discoverRowFocusScale', true),
                scrollEvent: false
            });

            if (!this.insertSearchSection(searchPage, section)) {
                return;
            }

            this.initNativeOrCustomCards(itemsContainer, useNativeCards);
            this.refreshScrollers(section);
        },

        refreshScrollers: function (container) {
            const self = this;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    const scrollers = container.querySelectorAll('[is="emby-scroller"]');
                    scrollers.forEach(function (scroller) {
                        if (scroller.scroller && scroller.scroller.reload) {
                            scroller.scroller.reload();
                        }
                    });

                    container.querySelectorAll('.seerrfin-poster-section').forEach(function (section) {
                        self.bindRowInfiniteScroll(section);
                    });
                });
            });
        },

        initLazyImages: function (container) {
            if (!container) {
                return;
            }

            const self = this;
            const images = container.querySelectorAll('.cardImageContainer.lazy[data-src]');

            if (!images.length) {
                return;
            }

            if (!self._lazyObserver) {
                self._lazyObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        if (!entry.isIntersecting) {
                            return;
                        }
                        self.loadLazyImage(entry.target);
                        self._lazyObserver.unobserve(entry.target);
                    });
                }, { rootMargin: '200px 0px' });
            }

            images.forEach(function (img) {
                if (img.dataset.bstLazyBound === 'true') {
                    return;
                }
                img.dataset.bstLazyBound = 'true';
                self._lazyObserver.observe(img);
            });
        },

        loadLazyImage: function (elem) {
            const self = this;
            const url = elem.getAttribute('data-src');
            if (!url) {
                self.clearCardThumbSkeleton(elem);
                return;
            }

            const preloader = new Image();
            preloader.src = url;

            preloader.onload = function () {
                requestAnimationFrame(function () {
                    elem.style.backgroundImage = "url('" + url.replace(/'/g, "\\'") + "')";
                    elem.removeAttribute('data-src');
                    elem.classList.add('lazy-image-fadein-fast');
                    elem.classList.remove('lazy-hidden');

                    const clearSkeleton = function () {
                        self.clearCardThumbSkeleton(elem);
                    };

                    elem.addEventListener('animationend', function onEnd() {
                        const padder = elem.parentNode && elem.parentNode.querySelector('.cardPadder');
                        if (padder) {
                            padder.classList.add('lazy-hidden-children');
                        }
                        clearSkeleton();
                        elem.removeEventListener('animationend', onEnd);
                    });
                    setTimeout(clearSkeleton, 200);
                });
            };

            preloader.onerror = function () {
                self.clearCardThumbSkeleton(elem);
            };
        },

        getField: function (item) {
            for (let i = 1; i < arguments.length; i++) {
                const key = arguments[i];
                if (item && item[key] !== undefined && item[key] !== null) {
                    return item[key];
                }
            }
            return null;
        },

        getProviderId: function (item, key) {
            const providerIds = item && (item.ProviderIds || item.providerIds);
            if (!providerIds) {
                return null;
            }
            return providerIds[key] || providerIds[key.toLowerCase()] || null;
        },

        escapeHtml: function (text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }
    };

    function boot() {
        log.info('boot');
        window.seerrFinPlugin.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('popstate', function () {
        log.info('popstate. rebooting');
        setTimeout(boot, 800);
    });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && window.seerrFinPlugin) {
            setTimeout(function () {
                window.seerrFinPlugin.scheduleRender();
            }, 300);
        }
    });
}
