'use strict';

// Keep Seerr's own router and UI while sending its requests through the actor-scoped bridge.
(function () {
    if (!window.__seerrFinAppPath) return;
    // Seerr must not register or use Jellyfin's root service worker; this affects only the iframe realm.
    delete Navigator.prototype.serviceWorker;
    const prefix = window.__seerrFinAppPrefix;
    const scriptPath = prefix.slice(0, prefix.lastIndexOf('/app/')) + '/seerrfin-app.js';
    const initialPath = window.__seerrFinAppPath;
    const bootstrap = window.__seerrFinAppBootstrap === true;
    history.replaceState(history.state, '', bootstrap ? '/login' : initialPath);
    if (bootstrap) document.documentElement.style.visibility = 'hidden';
    function resource(value) {
        if (typeof value !== 'string' || !value || /^(data:|blob:|javascript:|#)/i.test(value)) return value;
        const url = new URL(value, location.href);
        if (url.origin !== location.origin || url.pathname.startsWith(prefix + '/') || url.pathname === scriptPath) return value;
        return prefix + url.pathname + url.search + url.hash;
    }
    const fetchRequest = window.fetch.bind(window);
    window.fetch = function (input, options) {
        return fetchRequest(input instanceof Request ? new Request(resource(input.url), input) : resource(String(input)), options);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...args) { return open.call(this, method, resource(String(url)), ...args); };
    function srcset(value) {
        const candidates = [];
        let index = 0;
        while (index < value.length) {
            while (/[\s,]/.test(value[index] || '') && index < value.length) index++;
            const start = index, data = value.slice(index).startsWith('data:');
            while (index < value.length && !/\s/.test(value[index]) && (data || value[index] !== ',')) index++;
            const url = value.slice(start, index).replace(/,+$/, '');
            const descriptorStart = index;
            while (index < value.length && value[index] !== ',') index++;
            const descriptor = value.slice(descriptorStart, index).trim();
            if (url) candidates.push(resource(url) + (descriptor ? ' ' + descriptor : ''));
            index++;
        }
        return candidates.join(', ');
    }
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        name = name.toLowerCase();
        if ((name === 'src' && /^(IMG|SCRIPT|SOURCE|VIDEO|AUDIO)$/.test(this.tagName)) || (name === 'href' && this.tagName === 'LINK')) value = resource(String(value));
        if (name === 'srcset' && /^(IMG|SOURCE)$/.test(this.tagName)) value = srcset(String(value));
        return setAttribute.call(this, name, value);
    };
    // Turbopack keys registered chunks by their original src, while the browser loads the bridge URL.
    const getAttribute = Element.prototype.getAttribute;
    Element.prototype.getAttribute = function (name) {
        const value = getAttribute.call(this, name);
        return this.tagName === 'SCRIPT' && name.toLowerCase() === 'src' && value?.startsWith(prefix + '/') ? value.slice(prefix.length) : value;
    };
    for (const [type, property] of [[HTMLImageElement, 'src'], [HTMLImageElement, 'srcset'], [HTMLScriptElement, 'src'], [HTMLLinkElement, 'href'], [HTMLSourceElement, 'src'], [HTMLVideoElement, 'poster']]) {
        const descriptor = Object.getOwnPropertyDescriptor(type.prototype, property);
        if (descriptor?.set) Object.defineProperty(type.prototype, property, { ...descriptor, set(value) { descriptor.set.call(this, property === 'srcset' ? srcset(String(value)) : resource(String(value))); } });
    }
    if (bootstrap) {
        let router, readinessTimer, attempts = 0, finished = false, navigating = false, retryRequested = false;
        const mediaPath = /^(\/(?:movie|tv)\/[1-9][0-9]*)\?manage=1$/.exec(initialPath)?.[1];
        const timeout = setTimeout(fail, 45000);
        function cleanup() {
            finished = true;
            clearTimeout(timeout);
            clearTimeout(readinessTimer);
            router?.events.off('routeChangeComplete', complete);
            window.removeEventListener('pagehide', cleanup);
        }
        function complete(path) {
            if (finished) return;
            if (path === initialPath || (mediaPath && path === mediaPath)) {
                cleanup();
                document.documentElement.style.visibility = '';
            } else {
                retryRequested = true;
                navigate();
            }
        }
        async function navigate() {
            if (finished || navigating) return;
            if (++attempts > 5) { fail(); return; }
            navigating = true;
            retryRequested = false;
            try {
                if (await router.replace(initialPath) === false) retryRequested = true;
            } catch (error) {
                if (error?.cancelled) retryRequested = true;
                else fail();
            } finally {
                navigating = false;
                if (!finished && retryRequested) navigate();
            }
        }
        function ready() {
            if (finished) return;
            router = window.next?.router;
            if (!router?.isReady) {
                readinessTimer = setTimeout(ready, 50);
                return;
            }
            router.events.on('routeChangeComplete', complete);
            navigate();
        }
        function fail() {
            if (finished) return;
            cleanup();
            parent.postMessage({ type: 'seerrfin-app-error' }, location.origin);
        }
        window.addEventListener('pagehide', cleanup, { once: true });
        ready();
    }
    // Reloading stays on the bridge rather than Jellyfin's root routes.
    window.addEventListener('beforeunload', () => { history.replaceState(history.state, '', resource(location.href)); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') parent.postMessage({ type: 'seerrfin-app-close' }, location.origin);
    });
})();
