'use strict';

(function () {
    if (window.seerrFinSettingsPreviews) { return; }

    let activePreview = null;

    function getPreviewPlacement(x, y, box, width, height, avoidPointer) {
        const margin = 12;
        const offset = 22;
        function place(w, h) {
            let left = x + offset;
            let top = y + offset;
            if (left + w > width - margin) { left = x - w - offset; }
            if (top + h > height - margin) { top = y - h - offset; }
            return {
                left: Math.max(margin, Math.min(left, width - w - margin)),
                top: Math.max(margin, Math.min(top, height - h - margin)),
                width: w,
                height: h
            };
        }
        const w = Math.min(box.width, width - margin * 2);
        const h = Math.min(box.height, height - margin * 2);
        const result = place(w, h);
        if (!avoidPointer || x < result.left || x > result.left + w || y < result.top || y > result.top + h) { return result; }
        const choices = [
            { width: Math.min(w, width - margin - x - offset), height: h },
            { width: Math.min(w, x - margin - offset), height: h },
            { width: w, height: Math.min(h, height - margin - y - offset) },
            { width: w, height: Math.min(h, y - margin - offset) }
        ].filter(function (choice) { return choice.width > 0 && choice.height > 0; });
        choices.sort(function (first, second) { return second.width * second.height - first.width * first.height; });
        return choices.length ? place(Math.floor(choices[0].width), Math.floor(choices[0].height)) : result;
    }

    window.seerrFinSettingsPreviews = {
        mount: function (page, options) {
            if (activePreview) { activePreview.destroy(); }

            const cache = new Map();
            const preparing = new Map();
            const artwork = new Map();
            const samples = { movies: [], provider: null, studio: null, genre: null, baseReady: false, detailsReady: false, qualitiesReady: false, ratingsById: {}, tvRatingsById: {} };
            const listeners = [];
            const tooltip = document.createElement('div');
            tooltip.id = 'bstSettingsPreview';
            tooltip.className = 'bst-settings-preview';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.hidden = true;
            document.body.appendChild(tooltip);
            const staging = document.createElement('div');
            staging.className = 'bst-settings-preview bst-preview-staging';
            staging.setAttribute('aria-hidden', 'true');
            staging.inert = true;
            document.body.appendChild(staging);

            let disposed = false;
            let hoveredInput = null;
            let currentInput = null;
            let pendingInput = null;
            let point = null;
            let previewSize = null;
            let refreshTimer = null;
            let positionFrame = null;
            let nextSceneId = 0;

            function listen(target, name, handler, settings) {
                target.addEventListener(name, handler, settings);
                listeners.push(function () { target.removeEventListener(name, handler, settings); });
            }

            function titleFor(input) {
                const row = input.closest('.bst-toggle-row, .bst-modal-row, .bst-tab-card');
                const label = row && row.querySelector('.bst-toggle-label, .bst-modal-row-label, .bst-tab-title');
                const chip = input.closest('.bst-release-type-btn');

                if (chip) {
                    const group = input.closest('[role="group"]');
                    const heading = group && document.getElementById(group.getAttribute('aria-labelledby'));
                    return (heading ? heading.textContent.trim() + ': ' : 'Release type: ') + chip.textContent.trim();
                }

                return (label && label.textContent.trim()) || input.getAttribute('aria-label') || (input.closest('label') && input.closest('label').getAttribute('aria-label')) || 'Setting preview';
            }

            function preload(url) {
                if (!url) { return null; }
                if (artwork.has(url)) { return artwork.get(url); }
                const image = new Image();
                const entry = { image: image, loaded: false, failed: false };
                entry.ready = new Promise(function (resolve) {
                    image.onload = resolve;
                    image.onerror = function () { entry.failed = true; resolve(); };
                    image.src = url;
                    if (image.complete) { resolve(); }
                }).then(function () { return image.decode ? image.decode().catch(function () { entry.failed = true; }) : null; })
                    .then(function () { entry.loaded = true; });
                artwork.set(url, entry);
                if (artwork.size > 64) { artwork.delete(artwork.keys().next().value); }
                return entry;
            }

            function cacheKey(input, context) {
                if (input.hasAttribute('data-rating-source')) { return input.closest('[role="group"]').id + '/' + input.value; }
                return input.id === 'bstCustomizeDuotone' ? input.id + '/' + (context.customizeKey || 'streamingService') : input.id;
            }

            function isolateControls(root) {
                const prefix = 'bstPreview' + (++nextSceneId) + '_';
                const ids = new Map();
                root.querySelectorAll('[id]').forEach(function (element) {
                    ids.set(element.id, prefix + element.id);
                    element.id = prefix + element.id;
                });
                root.querySelectorAll('*').forEach(function (element) {
                    ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns'].forEach(function (attribute) {
                        if (!element.hasAttribute(attribute)) { return; }
                        element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map(function (id) { return ids.get(id) || id; }).join(' '));
                    });
                    if (element.matches('input[name], select[name], textarea[name]')) { element.name = prefix + element.name; }
                    Array.from(element.attributes).forEach(function (attribute) {
                        let value = attribute.value;
                        ids.forEach(function (replacement, id) {
                            if ((attribute.name === 'href' || attribute.name === 'xlink:href') && value === '#' + id) { value = '#' + replacement; }
                            value = value.replaceAll('url(#' + id + ')', 'url(#' + replacement + ')')
                                .replaceAll('url("#' + id + '")', 'url("#' + replacement + '")')
                                .replaceAll("url('#" + id + "')", "url('#" + replacement + "')");
                        });
                        if (value !== attribute.value) { element.setAttribute(attribute.name, value); }
                    });
                });
            }

            function prepare(input, context) {
                if (!window.seerrFinPreviewScenes.supports(input)) { return; }
                const key = cacheKey(input, context);
                const dependencies = [];
                function warm(url) {
                    const entry = preload(url);
                    if (entry && !entry.loaded) { dependencies.push(entry.ready); }
                }
                const comparison = document.createElement('div');
                comparison.className = 'bst-preview-comparison';
                comparison.dataset.previewKey = key;
                comparison.setAttribute('aria-label', titleFor(input));
                const columns = document.createElement('div');
                columns.className = 'bst-preview-columns';
                const sceneContext = Object.assign({}, context, { samples: samples });

                [false, true].forEach(function (enabled) {
                    const column = document.createElement('div');
                    column.className = 'bst-preview-column';
                    const heading = document.createElement('div');
                    heading.className = 'bst-preview-state' + (enabled ? ' is-on' : '');
                    heading.textContent = enabled ? 'ON' : 'OFF';
                    const scene = document.createElement('div');
                    scene.className = 'bst-preview-scene';
                    scene.inert = true;
                    const result = window.seerrFinPreviewScenes.render(input, enabled, sceneContext);
                    if (result.pending) { comparison.dataset.previewPending = 'true'; }
                    const live = document.createElement('div');
                    live.className = 'bst-preview-live';
                    live.dataset.previewKind = result.kind;
                    live.dataset.previewAlign = result.align || 'center';
                    const pageStyle = getComputedStyle(document.body);
                    ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing'].forEach(function (property) { live.style[property] = pageStyle[property]; });
                    live.style.width = document.documentElement.clientWidth + 'px';
                    live.style.height = window.innerHeight + 'px';
                    if (result.focusSelector) { live.dataset.previewFocus = result.focusSelector; }
                    if (result.effectSelector) { live.dataset.previewEffect = result.effectSelector; }
                    if (result.effectFirst) { live.dataset.previewEffectFirst = 'true'; }
                    if (result.hover) { live.dataset.previewHover = 'true'; }
                    if (result.clipSelector) { live.dataset.previewClip = result.clipSelector; }
                    if (result.cursorSelector) { live.dataset.previewCursor = result.cursorSelector; }
                    const content = document.createElement('div');
                    content.className = 'bst-preview-content';
                    content.innerHTML = result.html;
                    live.appendChild(content);
                    scene.appendChild(live);
                    if (result.cursorSelector) {
                        const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        cursor.classList.add('bst-preview-cursor');
                        cursor.setAttribute('viewBox', '0 0 24 28');
                        cursor.setAttribute('aria-hidden', 'true');
                        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        arrow.setAttribute('d', 'M3 2V22L8.5 17L12.5 25L16 23.5L12 15.5L20 15Z');
                        arrow.setAttribute('fill', '#fff');
                        arrow.setAttribute('stroke', '#111');
                        arrow.setAttribute('stroke-width', '1.5');
                        arrow.setAttribute('stroke-linejoin', 'round');
                        cursor.appendChild(arrow);
                        scene.appendChild(cursor);
                    }
                    isolateControls(live);

                    // Use the same image URLs and markup, without the live UI's observers or event handlers.
                    scene.querySelectorAll('[data-src]').forEach(function (image) {
                        const url = image.getAttribute('data-src');
                        if (!url) { return; }
                        image.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
                        warm(url);
                        image.classList.remove('lazy', 'lazy-hidden');
                    });
                    scene.querySelectorAll('.card[data-fallback-src], .card[data-tmdb-backdrop-path]').forEach(function (card) {
                        const url = context.plugin && card.dataset.tmdbBackdropPath ?
                            context.plugin.buildTmdbImageUrl(card.dataset.tmdbBackdropPath, 'discoverBackdrop') : card.dataset.fallbackSrc;
                        const image = card.querySelector('.seerrfin-discover-backdrop-media') || card.querySelector('.cardImageContainer[role="img"]');
                        if (image && url && !image.style.backgroundImage) {
                            image.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
                            image.classList.remove('lazy-hidden');
                        }
                    });
                    scene.querySelectorAll('img').forEach(function (image) { image.loading = 'eager'; warm(image.getAttribute('src')); });
                    scene.querySelectorAll('[style*="background-image"]').forEach(function (image) {
                        Array.from(image.style.backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)).forEach(function (match) {
                            warm(String(match[1] ?? match[2] ?? match[3] ?? '').trim());
                        });
                    });
                    scene.querySelectorAll('.lazy-hidden, .lazy-hidden-children, .lazy-image-fadein').forEach(function (element) {
                        element.classList.remove('lazy-hidden', 'lazy-hidden-children', 'lazy-image-fadein');
                    });
                    scene.setAttribute('aria-label', result.note || (enabled ? 'Enabled' : 'Disabled'));
                    column.append(scene, heading);
                    columns.appendChild(column);
                });

                const worlds = Array.from(columns.querySelectorAll('.bst-preview-live'));
                const cards = worlds.map(function (world) { return Array.from(world.querySelectorAll('.card')); });
                function ratingSignature(rating) {
                    return rating.textContent + Array.from(rating.querySelectorAll('img')).map(function (image) { return image.getAttribute('src'); }).join('|');
                }
                const changed = input.hasAttribute('data-rating-source') ? cards[0].findIndex(function (card, index) {
                        const off = card.querySelector('[data-seerrfin-card-ratings]');
                        const on = cards[1][index] && cards[1][index].querySelector('[data-seerrfin-card-ratings]');
                        return off && on && ratingSignature(off) !== ratingSignature(on);
                    }) : -1;
                worlds.forEach(function (world, index) {
                    const subject = cards[index][Math.max(0, changed)];
                    if (!subject) { return; }
                    subject.classList.add('bst-preview-subject');
                    cards[index].forEach(function (card) {
                        if (card !== subject) { card.classList.add('bst-preview-hidden-context'); card.style.visibility = 'hidden'; }
                    });
                    if (input.hasAttribute('data-rating-source')) { world.dataset.previewFocus = '.bst-preview-subject'; }
                    if (subject.hasAttribute('data-bst-preview-example')) {
                        world.dataset.previewEffect = '.bst-preview-subject > .cardBox';
                    }
                });

                comparison.appendChild(columns);
                const previous = preparing.get(key);
                if (previous) { previous.remove(); }
                preparing.set(key, comparison);
                staging.appendChild(comparison);
                function ready() {
                    if (disposed || preparing.get(key) !== comparison) { comparison.remove(); return; }
                    if (comparison.dataset.previewPending === 'true') { preparing.delete(key); comparison.remove(); return; }
                    comparison.querySelectorAll('.card').forEach(function (card) {
                        const art = card.querySelector('.cardScalable');
                        if (!art) { return; }
                        function loaded(url) {
                            const entry = artwork.get(url);
                            return entry && entry.loaded && !entry.failed;
                        }
                        const hasArtwork = Array.from(art.querySelectorAll('img[src]')).some(function (image) { return loaded(image.getAttribute('src')); }) ||
                            Array.from(art.querySelectorAll('[style]')).some(function (element) {
                                return Array.from(element.style.backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)).some(function (match) {
                                    return loaded(String(match[1] ?? match[2] ?? match[3] ?? '').trim());
                                });
                            });
                        if (hasArtwork) {
                            art.querySelectorAll('.seerrfin-card-thumb-skeleton').forEach(function (element) { element.classList.remove('seerrfin-card-thumb-skeleton'); });
                        } else if (card.hasAttribute('data-bst-preview-example') || art.querySelector('.seerrfin-card-thumb-skeleton')) {
                            art.querySelector('.cardPadder')?.classList.add('seerrfin-native-skeleton-image');
                            art.querySelectorAll('.cardImageContainer').forEach(function (element) { element.style.backgroundColor = 'transparent'; });
                        }
                        art.querySelectorAll('.blurhash-canvas').forEach(function (canvas) { canvas.style.visibility = 'hidden'; });
                    });
                    layoutScenes(comparison);
                    if (document.fonts && document.fonts.status === 'loading') { document.fonts.ready.then(ready); return; }
                    const old = cache.get(key);
                    if (old && old.parentElement !== tooltip) { old.remove(); }
                    cache.set(key, comparison);
                    preparing.delete(key);
                    const target = pendingInput;
                    if (tooltip.hidden && window.seerrFinPreviewScenes.supports(target) && cacheKey(target, options.getContext()) === key) { show(target); }
                }
                if (dependencies.length) { Promise.all(dependencies).then(ready); }
                else { ready(); }
            }

            function refresh() {
                clearTimeout(refreshTimer);
                if (disposed) { return; }
                if (!page.isConnected) { destroy(); return; }

                const context = options.getContext();
                const seen = new Set();
                function prepareOnce(input, sceneContext) {
                    if (!window.seerrFinPreviewScenes.supports(input)) { return; }
                    const key = cacheKey(input, sceneContext);
                    if (seen.has(key)) { return; }
                    seen.add(key);
                    prepare(input, sceneContext);
                }
                page.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
                    if (input.id !== 'bstCustomizeDuotone' || context.customizeKey || !context.customizeKeys) { prepareOnce(input, context); }
                });
                const customize = page.querySelector('#bstCustomizeDuotone');
                if (customize) {
                    (context.customizeKeys || []).forEach(function (key) {
                        const values = Object.assign({}, context.values);
                        const style = context.plugin && context.plugin.getDisplayStyle(key);
                        if (key !== context.customizeKey && style) {
                            values.bstCustomizeDuotoneLight = style.duotoneLight;
                            values.bstCustomizeDuotoneDark = style.duotoneDark;
                        }
                        prepareOnce(customize, Object.assign({}, context, { customizeKey: key, values: values }));
                    });
                }
            }

            function scheduleRefresh() {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(refresh, 80);
            }

            function describedBy(input, add) {
                if (!input) { return; }
                const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
                    .filter(function (id) { return id !== tooltip.id; });
                if (add) { ids.push(tooltip.id); }
                if (ids.length) { input.setAttribute('aria-describedby', ids.join(' ')); }
                else { input.removeAttribute('aria-describedby'); }
            }

            function hide() {
                const comparison = tooltip.firstElementChild;
                if (comparison) {
                    if (cache.get(comparison.dataset.previewKey) === comparison) {
                        staging.appendChild(comparison);
                        comparison.style.width = comparison.dataset.previewWidth + 'px';
                        comparison.style.height = comparison.dataset.previewHeight + 'px';
                    }
                    else { comparison.remove(); }
                }
                describedBy(currentInput, false);
                currentInput = null;
                pendingInput = null;
                previewSize = null;
                tooltip.hidden = true;
            }

            function updateBackground() {
                const ancestors = [];
                for (let element = page; element && element !== document.body; element = element.parentElement) {
                    ancestors.unshift(element);
                }
                // Jellyfin's full-page background is a sibling of the content, rather than an ancestor.
                const background = Array.from(document.querySelectorAll('.backgroundContainer')).find(function (element) {
                    const style = getComputedStyle(element);
                    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && !element.closest('[hidden]');
                });
                if (background) { themeObserver.observe(background, { attributes: true }); }
                let color = 'Canvas';
                const overlays = [];
                Array.from(new Set([document.documentElement, document.body, background].concat(ancestors).filter(Boolean))).forEach(function (element) {
                    const style = getComputedStyle(element);
                    let layer = style.backgroundColor;
                    if (!layer || layer === 'transparent' || style.display === 'none' || style.visibility === 'hidden') { return; }
                    const alphaMatch = (/^rgba\(/.test(layer) || layer.includes('/')) && layer.match(/[,/]\s*([\d.]+)(%)?\s*\)$/);
                    const opacity = Number(style.opacity || 1);
                    const alpha = (alphaMatch ? Number(alphaMatch[1]) / (alphaMatch[2] ? 100 : 1) : 1) * opacity;
                    if (alpha === 0) { return; }
                    if (opacity < 1) {
                        const rgb = layer.match(/^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
                        layer = rgb ? 'rgba(' + rgb[1] + ', ' + rgb[2] + ', ' + rgb[3] + ', ' + alpha + ')' : 'color-mix(in srgb, ' + layer + ' ' + (opacity * 100) + '%, transparent)';
                    }
                    if (alpha === 1) {
                        color = layer;
                        overlays.length = 0;
                    } else {
                        // Let CSS composite colors, including modern color spaces, without rasterizing the preview.
                        overlays.unshift('linear-gradient(' + layer + ', ' + layer + ')');
                    }
                });
                tooltip.style.backgroundColor = color;
                tooltip.style.backgroundImage = overlays.join(', ') || 'none';
            }

            function position() {
                positionFrame = null;
                if (tooltip.hidden || !currentInput) { return; }
                const anchor = currentInput.closest('.bst-toggle, .bst-release-type-btn') || currentInput;
                const rect = anchor.getBoundingClientRect();
                const x = point ? point.x : rect.right;
                const y = point ? point.y : rect.top;
                const comparison = tooltip.firstElementChild;
                const box = previewSize || { width: Number(comparison.dataset.previewWidth), height: Number(comparison.dataset.previewHeight) };
                const placement = getPreviewPlacement(x, y, box, document.documentElement.clientWidth, window.innerHeight, !!point);
                previewSize = { width: placement.width, height: placement.height };
                tooltip.style.width = placement.width + 'px';
                tooltip.style.height = placement.height + 'px';
                const bounds = comparison.getBoundingClientRect();
                if (comparison.dataset.previewBox !== Math.round(bounds.width) + 'x' + Math.round(bounds.height)) { layoutScenes(comparison); }
                tooltip.style.left = placement.left + 'px';
                tooltip.style.top = placement.top + 'px';
            }

            function layoutScenes(comparison) {
                const width = document.documentElement.clientWidth;
                const height = window.innerHeight;
                const pageStyle = getComputedStyle(document.body);
                function measure(target) {
                    let rect = target.getBoundingClientRect();
                    if (!rect.width || !rect.height || target.closest('.bst-preview-hidden-context, [hidden]')) { return null; }
                    if (target.matches('.sectionTitle, .bst-quality-header h3')) {
                        const text = document.createRange();
                        text.selectNodeContents(target);
                        if (text.getBoundingClientRect) { rect = text.getBoundingClientRect(); }
                    }
                    return rect;
                }
                function union(rectangles, origin) {
                    return rectangles.length ? {
                        left: Math.min(...rectangles.map(function (rect) { return rect.left; })) - origin.left,
                        right: Math.max(...rectangles.map(function (rect) { return rect.right; })) - origin.left,
                        top: Math.min(...rectangles.map(function (rect) { return rect.top; })) - origin.top,
                        bottom: Math.max(...rectangles.map(function (rect) { return rect.bottom; })) - origin.top
                    } : null;
                }
                const worlds = Array.from(comparison.querySelectorAll('.bst-preview-live'));
                worlds.forEach(function (live) {
                    live.style.width = width + 'px';
                    live.style.height = height + 'px';
                    ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing'].forEach(function (property) { live.style[property] = pageStyle[property]; });
                    live.style.transform = 'none';
                });
                worlds.forEach(function (live) {
                    if (live.dataset.previewAlign !== 'left') { return; }
                    const heading = live.querySelector('.sectionTitle');
                    const artwork = live.querySelector('.bst-preview-subject .cardScalable');
                    if (!heading || !artwork) { return; }
                    heading.style.position = 'relative';
                    heading.style.left = '0px';
                    heading.style.left = (artwork.getBoundingClientRect().left - measure(heading).left) + 'px';
                });
                const frames = worlds.map(function (live) {
                    const scene = live.parentElement.getBoundingClientRect();
                    const origin = live.getBoundingClientRect();
                    const selector = live.dataset.previewFocus || '.card > .cardBox, .seerrfin-letterboxd-card-slot';
                    const targets = Array.from(live.querySelectorAll(selector));
                    const subject = live.querySelector('.bst-preview-subject');
                    if (subject && !targets.includes(subject)) { targets.push(subject); }
                    let effects = live.dataset.previewEffect ? Array.from(live.querySelectorAll(live.dataset.previewEffect)) : [];
                    if (live.dataset.previewEffectFirst === 'true') { effects = effects.slice(0, 1); }
                    effects.forEach(function (target) {
                        const scroller = target.closest('.bst-modal-scroll, .bst-quality-list');
                        if (scroller) {
                            const targetBounds = target.getBoundingClientRect();
                            const viewport = scroller.getBoundingClientRect();
                            scroller.scrollTop += targetBounds.top - viewport.top - (scroller.clientHeight - targetBounds.height) / 2;
                            scroller.dataset.previewScrollTop = String(scroller.scrollTop);
                        }
                    });
                    const rectangles = targets.flatMap(function (target) {
                        const rect = measure(target);
                        const box = target.matches('.card') && target.querySelector('.cardBox');
                        return box ? [rect, box.getBoundingClientRect()] : [rect];
                    }).filter(function (rect) { return rect && rect.width > 0 && rect.height > 0; });
                    const bounds = union(rectangles, origin) || { left: 0, right: 0, top: 0, bottom: 0 };
                    const effect = union(effects.map(measure).filter(Boolean), origin);
                    if (effect) {
                        bounds.left = Math.min(bounds.left, effect.left);
                        bounds.right = Math.max(bounds.right, effect.right);
                        bounds.top = Math.min(bounds.top, effect.top);
                        bounds.bottom = Math.max(bounds.bottom, effect.bottom);
                    }
                    return { live: live, scene: scene, bounds: bounds, effect: effect };
                });
                const desiredScale = 0.75;
                const contentWidth = Math.max(0, ...frames.map(function (entry) { return entry.bounds.right - entry.bounds.left; }));
                const contentHeight = Math.max(0, ...frames.map(function (entry) { return entry.bounds.bottom - entry.bounds.top; }));
                const preferredWidth = Math.round(Math.min(width - 24, Math.max(240, Math.min(600, (contentWidth + 12) * desiredScale * 2 + 52))));
                const paneWidth = Math.max(1, (preferredWidth - 2) / 2 - 25);
                let heightScale = desiredScale;
                frames.forEach(function (entry) {
                    const contentWidth = entry.bounds.right - entry.bounds.left;
                    heightScale = Math.min(heightScale, paneWidth / (contentWidth + 12));
                });
                const preferredHeight = Math.round(Math.min(height - 24, Math.max(128, Math.min(460, (contentHeight + 12) * heightScale + 58))));
                comparison.dataset.previewWidth = String(preferredWidth);
                comparison.dataset.previewHeight = String(preferredHeight);
                if (comparison.parentElement === staging) {
                    comparison.style.width = preferredWidth + 'px';
                    comparison.style.height = preferredHeight + 'px';
                }
                frames.forEach(function (entry) { entry.scene = entry.live.parentElement.getBoundingClientRect(); });
                let scale = desiredScale;
                frames.forEach(function (entry) {
                    const width = entry.bounds.right - entry.bounds.left;
                    const height = entry.bounds.bottom - entry.bounds.top;
                    if (width && height && entry.scene.width && entry.scene.height) {
                        scale = Math.min(scale, entry.scene.width / (width + 12), entry.scene.height / (height + 12));
                    }
                });
                frames.forEach(function (entry) {
                    scale = Math.min(scale, entry.scene.height / (entry.bounds.bottom - entry.bounds.top + 12));
                    if (!entry.effect) { return; }
                    const effect = entry.effect;
                    scale = Math.min(scale, entry.scene.width / (effect.right - effect.left + 12), entry.scene.height / (effect.bottom - effect.top + 12));
                });
                comparison.style.setProperty('--bst-preview-scale', String(scale));
                comparison.dataset.previewViewport = width + 'x' + height;
                const box = comparison.getBoundingClientRect();
                comparison.dataset.previewBox = Math.round(box.width) + 'x' + Math.round(box.height);
                frames.forEach(function (entry) {
                    const bounds = entry.bounds;
                    const viewportWidth = entry.scene.width / scale;
                    let x = entry.live.dataset.previewAlign === 'left' ? 6 - bounds.left : (viewportWidth - bounds.left - bounds.right) / 2;
                    const y = 6 - bounds.top;
                    if (entry.effect) {
                        x = Math.max(6 - entry.effect.left, Math.min(x, viewportWidth - entry.effect.right - 6));
                    }
                    entry.live.style.setProperty('--bst-preview-x', x + 'px');
                    entry.live.style.setProperty('--bst-preview-y', y + 'px');
                    entry.live.style.transform = '';
                    const cutouts = entry.live.dataset.previewClip ? Array.from(entry.live.querySelectorAll(entry.live.dataset.previewClip)).map(function (element) { return element.getBoundingClientRect(); }) : [];
                    if (cutouts.length) {
                        const rect = {
                            top: Math.min(...cutouts.map(function (rect) { return rect.top; })),
                            right: Math.max(...cutouts.map(function (rect) { return rect.right; })),
                            bottom: Math.max(...cutouts.map(function (rect) { return rect.bottom; })),
                            left: Math.min(...cutouts.map(function (rect) { return rect.left; }))
                        };
                        entry.live.parentElement.style.clipPath = 'inset(' + [
                            Math.max(0, rect.top - entry.scene.top - 6 * scale),
                            Math.max(0, entry.scene.right - rect.right - 6 * scale),
                            Math.max(0, entry.scene.bottom - rect.bottom - 6 * scale),
                            Math.max(0, rect.left - entry.scene.left - 6 * scale)
                        ].map(function (inset) { return inset + 'px'; }).join(' ') + ')';
                    } else {
                        entry.live.parentElement.style.clipPath = '';
                    }
                    const cursor = entry.live.parentElement.querySelector('.bst-preview-cursor');
                    const target = entry.live.dataset.previewCursor && entry.live.querySelector(entry.live.dataset.previewCursor);
                    if (cursor && target) {
                        const rect = target.getBoundingClientRect();
                        cursor.style.left = Math.max(2, Math.min(entry.scene.width - 22, rect.left - entry.scene.left + rect.width * 0.63)) + 'px';
                        cursor.style.top = Math.max(2, Math.min(entry.scene.height - 27, rect.top - entry.scene.top + rect.height * 0.45)) + 'px';
                    }
                });
            }

            function show(input) {
                if (disposed || !input || !input.isConnected || !window.seerrFinPreviewScenes.supports(input)) { hide(); return; }
                if (currentInput && currentInput !== input) { hide(); }
                pendingInput = input;
                const context = options.getContext();
                const key = cacheKey(input, context);
                if (!cache.has(key)) { prepare(input, context); }
                if (!cache.has(key)) { return; }
                if (currentInput) { hide(); }
                pendingInput = null;
                currentInput = input;
                const comparison = cache.get(key);
                const box = comparison.getBoundingClientRect();
                if (comparison.dataset.previewViewport !== document.documentElement.clientWidth + 'x' + window.innerHeight || comparison.dataset.previewBox !== Math.round(box.width) + 'x' + Math.round(box.height)) { layoutScenes(comparison); }
                tooltip.replaceChildren(comparison);
                comparison.style.width = '100%';
                comparison.style.height = '100%';
                tooltip.style.width = comparison.dataset.previewWidth + 'px';
                tooltip.style.height = comparison.dataset.previewHeight + 'px';
                tooltip.hidden = false;
                tooltip.querySelectorAll('[data-preview-scroll-top]').forEach(function (element) { element.scrollTop = Number(element.dataset.previewScrollTop); });
                updateBackground();
                describedBy(input, true);
                position();
            }

            function inputFor(target) {
                if (!(target instanceof Element)) { return null; }
                const control = target.closest('.bst-release-type-btn, .bst-toggle-row, .bst-modal-row, .bst-tab-card');
                const input = control && page.contains(control) ? control.querySelector('input[type="checkbox"]') : null;
                return window.seerrFinPreviewScenes.supports(input) ? input : null;
            }

            listen(page, 'pointerover', function (event) {
                if (event.pointerType === 'touch') { return; }
                const input = inputFor(event.target);
                if (input === hoveredInput) { return; }
                hide();
                hoveredInput = input;
                point = { x: event.clientX, y: event.clientY };
                if (input) { show(input); }
            });
            listen(page, 'pointerout', function (event) {
                if (inputFor(event.relatedTarget) === hoveredInput) { return; }
                hoveredInput = null;
                hide();
            });
            listen(page, 'pointermove', function (event) {
                point = { x: event.clientX, y: event.clientY };
                if (!tooltip.hidden && positionFrame === null) { positionFrame = requestAnimationFrame(position); }
            });
            listen(page, 'focusin', function (event) {
                if (!event.target.matches('input[type="checkbox"]') || !window.seerrFinPreviewScenes.supports(event.target) || hoveredInput === event.target && !tooltip.hidden) { return; }
                point = null;
                show(event.target);
            });
            listen(page, 'focusout', hide);
            listen(page, 'input', scheduleRefresh);
            listen(page, 'change', scheduleRefresh);
            // Apply buttons and modal openings can update draft state without an input event.
            listen(page, 'click', function (event) {
                if (event.target.closest('button')) { hide(); refresh(); }
            });
            listen(document, 'keydown', function (event) { if (event.key === 'Escape') { hide(); } });
            listen(document, 'scroll', function (event) { if (!tooltip.contains(event.target) && !staging.contains(event.target)) { hide(); } }, true);
            listen(window, 'resize', function () { hide(); scheduleRefresh(); });
            listen(window, 'blur', hide);
            listen(window, 'hashchange', destroy);
            listen(window, 'pagehide', destroy);
            listen(page, 'viewhide', destroy);

            const themeObserver = new MutationObserver(function () { if (!tooltip.hidden) { updateBackground(); } });
            for (let element = page; element; element = element.parentElement) {
                themeObserver.observe(element, { attributes: true });
            }
            document.querySelectorAll('.backgroundContainer').forEach(function (element) {
                themeObserver.observe(element, { attributes: true });
            });
            themeObserver.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel', 'media', 'disabled'] });
            listen(document, 'load', function (event) { if (event.target.matches && event.target.matches('link[rel="stylesheet"]') && !tooltip.hidden) { updateBackground(); } }, true);
            listen(document, 'transitionend', function (event) {
                if (!tooltip.hidden && event.target instanceof Element && (event.target.contains(page) || event.target.matches('.backgroundContainer'))) { updateBackground(); }
            }, true);
            const colorScheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
            if (colorScheme && colorScheme.addEventListener) {
                listen(colorScheme, 'change', function () { if (!tooltip.hidden) { updateBackground(); } });
            }

            const observer = new MutationObserver(function () {
                if (!page.isConnected) { destroy(); return; }
                const context = options.getContext();
                if (Array.from(page.querySelectorAll('input[type="checkbox"]')).some(function (input) { return window.seerrFinPreviewScenes.supports(input) && !cache.has(cacheKey(input, context)) && !preparing.has(cacheKey(input, context)); })) {
                    scheduleRefresh();
                }
            });
            observer.observe(page, { childList: true, subtree: true });
            // Jellyfin's React router can remove the entire configuration view without viewhide.
            const removalObserver = new MutationObserver(function () {
                if (!page.isConnected) { destroy(); }
                else if (!tooltip.hidden) { updateBackground(); }
            });
            removalObserver.observe(document.body, { childList: true, subtree: true });

            function destroy() {
                if (disposed) { return; }
                disposed = true;
                hide();
                clearTimeout(refreshTimer);
                if (positionFrame !== null) { cancelAnimationFrame(positionFrame); }
                observer.disconnect();
                themeObserver.disconnect();
                removalObserver.disconnect();
                listeners.forEach(function (remove) { remove(); });
                cache.clear();
                preparing.clear();
                artwork.clear();
                tooltip.remove();
                staging.remove();
                if (activePreview && activePreview.destroy === destroy) { activePreview = null; }
            }

            activePreview = { refresh: scheduleRefresh, destroy: destroy };
            refresh();

            function loadExample(read, use, timeoutMilliseconds) {
                let timeout;
                return Promise.race([
                    Promise.resolve().then(read),
                    new Promise(function (resolve) { timeout = setTimeout(function () { resolve(null); }, timeoutMilliseconds || 8000); })
                ]).then(function (data) { if (!disposed && data) { use(data); } })
                    .catch(function () { /* Keep the other examples when this source is unavailable. */ })
                    .finally(function () { clearTimeout(timeout); });
            }

            function sample(path, use, timeoutMilliseconds) {
                return loadExample(function () {
                    return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/' + path), type: 'GET', dataType: 'json' });
                }, use, timeoutMilliseconds);
            }

            function librarySample(type, key) {
                return loadExample(function () {
                    return ApiClient.getItems(ApiClient.getCurrentUserId(), {
                        IncludeItemTypes: type, Recursive: true, SortBy: 'Random', Limit: 3,
                        Fields: 'ProviderIds', EnableImages: true, EnableTotalRecordCount: false
                    });
                }, function (data) {
                    samples[key] = (data.Items || []).filter(function (item) { return item.Id && item.Name; }).map(function (item) {
                        const providers = Object.assign({}, item.ProviderIds);
                        const primaryTag = item.ImageTags && item.ImageTags.Primary;
                        const backdropTag = (item.BackdropImageTags || [])[0] || (item.ParentBackdropImageTags || [])[0];
                        const backdropId = (item.BackdropImageTags || []).length ? item.Id : item.ParentBackdropItemId;
                        if (primaryTag) {
                            providers.JellyseerrPoster = ApiClient.getImageUrl(item.Id, { type: 'Primary', tag: primaryTag, maxWidth: 600, quality: 90 });
                        }
                        if (backdropTag && backdropId) {
                            providers.JellyseerrBackdrop = ApiClient.getImageUrl(backdropId, { type: 'Backdrop', index: 0, tag: backdropTag, maxWidth: 780, quality: 90 });
                        } else {
                            providers.JellyseerrBackdrop = providers.JellyseerrPoster;
                        }
                        return Object.assign({}, item, {
                            SourceType: type === 'Series' ? 'tv' : 'movie',
                            PremiereDate: item.PremiereDate || (item.ProductionYear ? item.ProductionYear + '-01-01' : ''),
                            ProviderIds: providers
                        });
                    }).sort(function (first, second) {
                        function artworkCount(item) { return Number(!!item.ImageTags?.Primary) + Number(!!((item.BackdropImageTags || []).length || (item.ParentBackdropImageTags || []).length)); }
                        return artworkCount(second) - artworkCount(first);
                    });
                });
            }

            Promise.all([
                librarySample('Movie', 'libraryMovies'),
                librarySample('Series', 'libraryTv'),
                sample('discover/movies/trending?limit=3', function (data) { samples.movies = (data.Items || data.items || []).slice(0, 3); }),
                sample('discover/tv/trending?limit=2', function (data) { samples.tv = (data.Items || data.items || []).slice(0, 2); }),
                sample('providers/movie', function (data) { samples.provider = data.find(function (item) { return item.logo || item.logoPath; }) || data[0] || null; }),
                sample('studios/movie', function (data) { samples.studio = data.find(function (item) { return item.logo || item.logoPath; }) || data[0] || null; }),
                sample('genres/movie', function (data) { samples.genre = data.find(function (item) { return item.backdrops && item.backdrops.length; }) || data[0] || null; }),
                sample('providers/tv', function (data) { samples.providerTv = data.find(function (item) { return item.logo || item.logoPath; }) || data[0] || null; }),
                sample('networks/tv', function (data) { samples.network = data.find(function (item) { return item.logo || item.logoPath; }) || data[0] || null; }),
                sample('genres/tv', function (data) { samples.genreTv = data.find(function (item) { return item.backdrops && item.backdrops.length; }) || data[0] || null; }),
                sample('request-options/tv', function (data) { samples.requestOptions = data; }),
                sample('request-options/movie', function (data) { samples.movieOptions = data; }),
                sample('requests?take=8', function (data) { samples.requests = data.requests || data.items || []; }, 30000)
            ]).then(function () {
                if (disposed) { return; }
                samples.baseReady = true;
                refresh();

                const plugin = options.getContext().plugin;
                function sampleId(item) {
                    return plugin && item && (plugin.getProviderId(item, 'Tmdb') || plugin.getProviderId(item, 'Jellyseerr'));
                }
                const movieId = sampleId(samples.movies[0]);
                const details = [];
                samples.movieDetailsList = [];
                samples.tvDetailsList = [];
                samples.qualities = {};
                if (movieId) {
                    details.push(sample('jellyseerr/movie/' + encodeURIComponent(movieId) + '/ratingscombined', function (data) { samples.ratingsById[movieId] = data; }));
                }
                Array.from(new Set((samples.tv || []).slice(0, 2).map(sampleId).filter(Boolean))).forEach(function (id) {
                    details.push(sample('jellyseerr/tv/' + encodeURIComponent(id) + '/ratings', function (data) {
                        samples.tvRatingsById[id] = { rt: data };
                    }));
                });
                ['movie', 'tv'].forEach(function (type) {
                    const items = type === 'movie' ? samples.movies : samples.tv || [];
                    const requests = (samples.requests || []).filter(function (item) { return item.type === type && item.tmdbId; });
                    const request = requests[0];
                    const available = requests.find(function (item) { return /^(partially )?available$/i.test(item.mediaStatusLabel || item.statusLabel || ''); });
                    // Hydrate an available title even when newer requests have a different status.
                    const ids = [available && available.tmdbId, request && request.tmdbId].concat(items.map(sampleId));
                    Array.from(new Set(ids.filter(Boolean).map(String))).slice(0, 4).forEach(function (id) {
                        details.push(sample('details/' + type + '/' + encodeURIComponent(id), function (data) {
                            samples[type === 'movie' ? 'movieDetailsList' : 'tvDetailsList'].push(data);
                            samples.requests = (samples.requests || []).map(function (request) {
                                if (String(request.tmdbId) !== String(data.id) || request.type !== type) { return request; }
                                const date = data.releaseDate || data.firstAirDate || '';
                                return Object.assign({}, request, {
                                    title: data.title || data.name || request.title,
                                    posterPath: data.posterPath || request.posterPath,
                                    backdropPath: data.backdropPath || request.backdropPath,
                                    year: date ? parseInt(date.slice(0, 4), 10) : request.year,
                                    voteAverage: data.voteAverage ?? request.voteAverage,
                                    metadataPending: false
                                });
                            });
                            scheduleRefresh();
                        }));
                    });
                });
                Promise.all(details).then(function () {
                    if (disposed) { return; }
                    samples.detailsReady = true;
                    refresh();
                    // Released titles already requested are useful quality examples when trending titles are not released yet.
                    const candidates = samples.movieDetailsList.slice().sort(function (a, b) {
                        return Number(!!b.mediaInfo) - Number(!!a.mediaInfo);
                    }).slice(0, 3);
                    const qualityReads = candidates.map(function (data) {
                        return sample('justwatch/qualities/movie/' + encodeURIComponent(data.id), function (qualities) {
                            if (qualities.highestReleasedQuality || qualities.mostCommonQuality) { samples.qualities[data.id] = qualities; }
                        });
                    });
                    candidates.forEach(function (data) {
                        if (samples.ratingsById[data.id]) { return; }
                        qualityReads.push(sample('jellyseerr/movie/' + encodeURIComponent(data.id) + '/ratingscombined', function (ratings) { samples.ratingsById[data.id] = ratings; }));
                    });
                    Promise.all(qualityReads).then(function () { samples.qualitiesReady = true; refresh(); });
                });
            });

            return activePreview;
        }
    };
})();
