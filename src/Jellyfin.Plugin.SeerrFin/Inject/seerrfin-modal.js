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
    const log = window.seerrFinLog;
    const TMDB_LOGO_SVG = '<svg width="2em" height="2em" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190.24 81.52"><defs><linearGradient id="bst-tmdb-grad" y1="40.76" x2="190.24" y2="40.76" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#90cea1"/><stop offset="0.56" stop-color="#3cbec9"/><stop offset="1" stop-color="#00b3e5"/></linearGradient></defs><path fill="url(#bst-tmdb-grad)" d="M105.67,36.06h66.9A17.67,17.67,0,0,0,190.24,18.4h0A17.67,17.67,0,0,0,172.57.73h-66.9A17.67,17.67,0,0,0,88,18.4h0A17.67,17.67,0,0,0,105.67,36.06Zm-88,45h76.9A17.67,17.67,0,0,0,112.24,63.4h0A17.67,17.67,0,0,0,94.57,45.73H17.67A17.67,17.67,0,0,0,0,63.4H0A17.67,17.67,0,0,0,17.67,81.06ZM10.41,35.42h7.8V6.92h10.1V0H.31v6.9h10.1Zm28.1,0h7.8V8.25h.1l9,27.15h6l9.3-27.15h.1V35.4h7.8V0H66.76l-8.2,23.1h-.1L50.31,0H38.51ZM152.43,55.67a15.07,15.07,0,0,0-4.52-5.52,18.57,18.57,0,0,0-6.68-3.08,33.54,33.54,0,0,0-8.07-1h-11.7v35.4h12.75a24.58,24.58,0,0,0,7.55-1.15A19.34,19.34,0,0,0,148.11,77a16.27,16.27,0,0,0,4.37-5.5,16.91,16.91,0,0,0,1.63-7.58A18.5,18.5,0,0,0,152.43,55.67ZM145,68.6A8.8,8.8,0,0,1,142.36,72a10.7,10.7,0,0,1-4,1.82,21.57,21.57,0,0,1-5,.55h-4.05v-21h4.6a17,17,0,0,1,4.67.63,11.66,11.66,0,0,1,3.88,1.87A9.14,9.14,0,0,1,145,59a9.87,9.87,0,0,1,1,4.52A11.89,11.89,0,0,1,145,68.6Zm44.63-.13a8,8,0,0,0-1.58-2.62A8.38,8.38,0,0,0,185.63,64a10.31,10.31,0,0,0-3.17-1v-.1a9.22,9.22,0,0,0,4.42-2.82,7.43,7.43,0,0,0,1.68-5,8.42,8.42,0,0,0-1.15-4.65,8.09,8.09,0,0,0-3-2.72,12.56,12.56,0,0,0-4.18-1.3,32.84,32.84,0,0,0-4.62-.33h-13.2v35.4h14.5a22.41,22.41,0,0,0,4.72-.5,13.53,13.53,0,0,0,4.28-1.65,9.42,9.42,0,0,0,3.1-3,8.52,8.52,0,0,0,1.2-4.68A9.39,9.39,0,0,0,189.66,68.47ZM170.21,52.72h5.3a10,10,0,0,1,1.85.18,6.18,6.18,0,0,1,1.7.57,3.39,3.39,0,0,1,1.22,1.13,3.22,3.22,0,0,1,.48,1.82,3.63,3.63,0,0,1-.43,1.8,3.4,3.4,0,0,1-1.12,1.2,4.92,4.92,0,0,1-1.58.65,7.51,7.51,0,0,1-1.77.2h-5.65Zm11.72,20a3.9,3.9,0,0,1-1.22,1.3,4.64,4.64,0,0,1-1.68.7,8.18,8.18,0,0,1-1.82.2h-7v-8h5.9a15.35,15.35,0,0,1,2,.15,8.47,8.47,0,0,1,2.05.55,4,4,0,0,1,1.57,1.18,3.11,3.11,0,0,1,.63,2A3.71,3.71,0,0,1,181.93,72.72Z"/></svg>';
    const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 320 512"><path fill="currentColor" d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 210.7 54.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L114.7 256 9.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 301.3 265.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L205.3 256 310.6 150.6z"/></svg>';
    const IMDB_ICON = '<svg width="2em" height="2em" fill="currentColor" viewBox="0 0 32 32"><path d="M8.4,21.1H5.9V9.9h3.8l0.7,4.7h0.1L11,9.9h3.8v11.2h-2.5v-6.7h-0.1l-0.9,6.7H9.4l-1-6.7h0L8.4,21.1z"/><path d="M15.8,9.8c0.4,0,3.2-0.1,4.7,0.1c1.2,0.1,1.8,1.1,1.9,2.3c0.1,2.2,0.1,4.4,0.1,6.6c0,0.2,0,0.5-0.1,0.8c-0.2,0.9-0.7,1.4-1.9,1.5c-1.5,0.1-3,0.1-4.4,0.1c0,0-0.1,0-0.2,0V9.8z M18.8,11.9v7.2c0.5,0,0.8-0.2,0.8-0.7c0-1.9,0-3.9,0-5.9C19.6,12,19.4,11.8,18.8,11.9z"/><path d="M2,21.1V9.9h2.9v11.2H2z"/><path d="M29.9,14.1c-0.1-0.8-0.6-1.2-1.4-1.4c-0.8-0.1-1.6,0-2.3,0.7V9.9h-2.8v11.2H26c0.1-0.2,0.1-0.4,0.2-0.5c0.1,0.1,0.2,0.2,0.3,0.3c0.7,0.5,1.5,0.6,2.3,0.3c0.7-0.3,1-0.9,1-1.6c0-0.8,0.1-1.7,0.1-2.6C30,16,30,15,29.9,14.1z M27.1,19.1c0,0.2-0.2,0.4-0.4,0.4s-0.4-0.2-0.4-0.4v-4.3c0-0.2,0.2-0.4,0.4-0.4s0.4,0.2,0.4,0.4V19.1z"/></svg>';

    let activeDetailsRoot = null;
    let activeSeasonRoot = null;
    let activeQualityRoot = null;
    let escapeHandler = null;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function mountFromHtml(html) {
        const mount = document.createElement('div');
        mount.innerHTML = html.trim();
        return mount.firstElementChild;
    }

    function readAdvancedBool(value, fallback) {
        if (value === true || value === false) {
            return value;
        }
        return fallback;
    }

    function getRequestModalAdvanced() {
        const plugin = window.seerrFinPlugin;
        const modal = plugin && plugin._displaySettings && plugin._displaySettings.Advanced
            ? plugin._displaySettings.Advanced.requestModal
            : null;
        return {
            allowQualityProfileSelection: readAdvancedBool(modal && modal.allowQualityProfileSelection, true),
            tvSeasonPickerEnabled: readAdvancedBool(modal && modal.tvSeasonPickerEnabled, true),
            includeSpecialsSeason: readAdvancedBool(modal && modal.includeSpecialsSeason, false),
            requireExplicitSeasonSelection: readAdvancedBool(modal && modal.requireExplicitSeasonSelection, false),
            showRequest4kButton: readAdvancedBool(modal && modal.showRequest4kButton, true),
            backdropLanguageFilter: (modal && modal.backdropLanguageFilter) || 'en,null,en-US'
        };
    }

    function tmdbImage(path, size) {
        if (!path) {
            return '';
        }
        return 'https://image.tmdb.org/t/p/' + (size || 'original') + path;
    }

    function resolveImageUrl(url) {
        if (!url) {
            return '';
        }
        if (url.startsWith('http') || url.startsWith('data:')) {
            return url;
        }
        return ApiClient.getUrl(url);
    }

    const PLUGIN_ID = 'c8e4f2a1-9b3d-4e7f-a6c2-1d5e8f0a3b7c';

    function getLogoImageUrl(data) {
        const rawPath = data && (data.logoPath || data.logo_path);
        if (!rawPath) {
            return '';
        }
        return rawPath.startsWith('http') ? rawPath : tmdbImage(rawPath, 'original');
    }

    function getTmdbApiKey(config) {
        const key = config && (config.tmdbApiKey || config.TmdbApiKey);
        return key && String(key).trim() ? String(key).trim() : '';
    }

    function isEnglishLogo(logo) {
        return logo && String(logo.iso_639_1 || '').toLowerCase() === 'en';
    }

    function isEnUsLogo(logo) {
        return isEnglishLogo(logo) && String(logo.iso_3166_1 || '').toUpperCase() === 'US';
    }

    function pickLogoFilePath(logos) {
        if (!logos || !logos.length) {
            return null;
        }

        const valid = logos.filter(function (logo) {
            return logo && logo.file_path;
        });

        if (!valid.length) {
            return null;
        }

        function byVote(a, b) {
            return (b.vote_average || 0) - (a.vote_average || 0) ||
                (b.width || 0) - (a.width || 0);
        }

        // Prioritize getting English logos over en-US. Fallbacks to highest rated logo (not locale specific)
        const english = valid
            .filter(function (logo) { return isEnglishLogo(logo) && !isEnUsLogo(logo); })
            .sort(byVote)[0];
        if (english) {
            return english.file_path;
        }

        const enUs = valid
            .filter(isEnUsLogo)
            .sort(byVote)[0];
        if (enUs) {
            return enUs.file_path;
        }

        return valid.sort(byVote)[0].file_path;
    }

    function isTmdbBearerToken(apiKey) {
        // v4 read tokens are JWTs, while v3 keys are plain strings.
        const parts = String(apiKey).split('.');
        return parts.length === 3;
    }

    function appendTmdbQuery(url, name, value) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') +
            encodeURIComponent(name) + '=' + encodeURIComponent(value);
    }

    function fetchTmdbJson(url, apiKey) {
        const headers = { accept: 'application/json' };
        let requestUrl = url;

        if (isTmdbBearerToken(apiKey)) {
            headers.Authorization = 'Bearer ' + apiKey;
        } else {
            requestUrl = appendTmdbQuery(url, 'api_key', apiKey);
        }

        return fetch(requestUrl, { headers: headers }).then(function (response) {
            if (!response.ok) {
                throw new Error('TMDB request failed: ' + response.status);
            }
            return response.json();
        });
    }

    function mapMovieDetails(raw) {
        const details = {
            id: raw.id,
            mediaType: 'movie',
            title: raw.title,
            overview: raw.overview,
            backdropPath: raw.backdrop_path,
            posterPath: raw.poster_path,
            voteAverage: raw.vote_average,
            voteCount: raw.vote_count,
            releaseDate: raw.release_date,
            runtime: raw.runtime,
            originalLanguage: raw.original_language,
            adult: raw.adult,
            genres: raw.genres || [],
            credits: raw.credits || {},
            releaseDates: raw.release_dates || {}
        };

        if (raw.videos && raw.videos.results) {
            details.relatedVideos = raw.videos.results;
        }

        if (raw.external_ids) {
            details.externalIds = { imdbId: raw.external_ids.imdb_id };
        }

        return details;
    }

    function mapTvDetails(raw) {
        const details = {
            id: raw.id,
            mediaType: 'tv',
            name: raw.name,
            overview: raw.overview,
            backdropPath: raw.backdrop_path,
            posterPath: raw.poster_path,
            voteAverage: raw.vote_average,
            voteCount: raw.vote_count,
            firstAirDate: raw.first_air_date,
            episodeRunTime: raw.episode_run_time || [],
            originalLanguage: raw.original_language,
            genres: raw.genres || [],
            credits: raw.credits || {},
            contentRatings: raw.content_ratings || {}
        };

        if (raw.videos && raw.videos.results) {
            details.relatedVideos = raw.videos.results;
        }

        if (raw.external_ids) {
            details.externalIds = { imdbId: raw.external_ids.imdb_id };
        }

        return details;
    }

    function fetchTmdbLogoPath(mediaId, mediaType, apiKey) {
        const segment = mediaType === 'tv' ? 'tv' : 'movie';
        const base = 'https://api.themoviedb.org/3/' + segment + '/' + mediaId + '/images';
        const filteredUrl = appendTmdbQuery(
            base,
            'include_image_language',
            getRequestModalAdvanced().backdropLanguageFilter
        );

        return fetchTmdbJson(filteredUrl, apiKey)
            .then(function (payload) {
                let path = pickLogoFilePath(payload.logos);
                if (path) {
                    return path;
                }
                // If no English logo in filtered set, retry with all languages
                return fetchTmdbJson(base, apiKey).then(function (all) {
                    return pickLogoFilePath(all.logos);
                });
            })
            .catch(function (err) {
                log.warn('TMDB logo fetch failed', err);
                return null;
            });
    }

    function fetchSettingsBackdrop(mediaId, mediaType) {
        // Modals have logos, so always use plain backdrop rather than the English backdrop used by cards.
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/backdrop/' + mediaType + '/' + mediaId, { preferNeutral: true }),
            type: 'GET',
            dataType: 'json'
        }).catch(function (err) {
            log.warn('settings backdrop fetch failed for ' + mediaType + '/' + mediaId, err);
            return null;
        });
    }

    function fetchTmdbDetailsFromBrowser(mediaId, mediaType, apiKey) {
        const isTv = mediaType === 'tv';
        const segment = isTv ? 'tv' : 'movie';
        const append = isTv
            ? 'videos,credits,content_ratings,external_ids'
            : 'videos,credits,release_dates,external_ids';
        let detailsUrl = 'https://api.themoviedb.org/3/' + segment + '/' + mediaId;
        detailsUrl = appendTmdbQuery(detailsUrl, 'append_to_response', append);

        return Promise.all([
            fetchTmdbJson(detailsUrl, apiKey),
            fetchTmdbLogoPath(mediaId, mediaType, apiKey),
            fetchSettingsBackdrop(mediaId, mediaType)
        ]).then(function (results) {
            const raw = results[0];
            const logoPath = results[1];
            const backdrop = results[2];
            const mapped = isTv ? mapTvDetails(raw) : mapMovieDetails(raw);
            if (logoPath) {
                mapped.logoPath = logoPath;
            }
            if (backdrop) {
                mapped.backdropUrl = resolveImageUrl(backdrop.backdropUrl || backdrop.BackdropUrl || '');
                mapped.backdropPath = backdrop.tmdbBackdropPath || backdrop.TmdbBackdropPath || mapped.backdropPath;
            }
            return mapped;
        }).catch(function (err) {
            log.warn('TMDB details fetch failed', err);
            return null;
        });
    }

    function mergeJellyseerrOverlay(tmdbDetails, jellyseerrDetails) {
        if (!jellyseerrDetails) {
            return tmdbDetails;
        }

        // Tmdb gives rich metadata. Seer adds request/availability
        if (jellyseerrDetails.mediaInfo) {
            tmdbDetails.mediaInfo = jellyseerrDetails.mediaInfo;
        }

        ['mediaAdded', 'status', 'status4k', 'inProduction'].forEach(function (key) {
            if (jellyseerrDetails[key] !== undefined && jellyseerrDetails[key] !== null) {
                tmdbDetails[key] = jellyseerrDetails[key];
            }
        });

        return tmdbDetails;
    }

    function normalizeMediaStatus(raw) {
        if (raw == null || raw === '') {
            return null;
        }
        if (typeof raw === 'number' && !Number.isNaN(raw)) {
            return raw;
        }
        const key = String(raw).trim().toUpperCase();
        const map = {
            UNKNOWN: 1,
            PENDING: 2,
            PROCESSING: 3,
            PARTIALLY_AVAILABLE: 4,
            AVAILABLE: 5,
            BLOCKLISTED: 6,
            BLACKLISTED: 6,
            DELETED: 7
        };
        if (key in map) {
            return map[key];
        }
        const asNum = parseInt(key, 10);
        return Number.isNaN(asNum) ? null : asNum;
    }

    function getRequestButtonState(data, is4k) {
        const defaultLabel = is4k ? 'Request 4K' : 'Request';
        const info = data && data.mediaInfo;
        const raw = is4k
            ? (info && (info.status4k != null ? info.status4k : info.status4K)) ?? (data && data.status4k)
            : (info && info.status != null ? info.status : (data && data.status));
        const status = normalizeMediaStatus(raw);

        // Seerr mediaInfo means HD was already requested
        if (!is4k && info && (status == null || status <= 1)) {
            return { requested: true, label: 'Already requested' };
        }

        // Deleted media can be requested again
        if (status == null || status <= 1 || status === 7) {
            return { requested: false, label: defaultLabel };
        }

        // Some seasons/eps are present (more seasons should still be able to be requested)
        if (status === 4) {
            return { requested: false, label: defaultLabel };
        }

        const labels = {
            2: 'Pending',
            3: 'Processing',
            5: 'Available',
            6: 'Blocklisted'
        };
        return { requested: true, label: labels[status] || 'Already requested' };
    }

    function markRequestButton(is4k, label) {
        if (!activeDetailsRoot) {
            return;
        }
        const btn = activeDetailsRoot.querySelector(is4k ? '[data-action="request-4k"]' : '[data-action="request"]');
        if (!btn) {
            return;
        }
        btn.disabled = true;
        btn.textContent = label || 'Already requested';
    }

    function fetchJustWatchQualities(mediaId, mediaType) {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/justwatch/qualities/' + mediaType + '/' + mediaId),
            type: 'GET',
            dataType: 'json'
        }).catch(function (err) {
            if (err && err.status === 404) {
                return null;
            }
            log.warn('JustWatch qualities fetch failed', err);
            return null;
        });
    }

    function buildJustWatchQualityLines(mediaId, mediaType) {
        const qualityLines = mountFromHtml(`
            <div class="bst-sidebar-lines bst-sidebar-lines--qualities" hidden>
                <div><span class="bst-label">Highest released quality:</span> <span class="bst-quality-value">…</span></div>
                <div><span class="bst-label">Most common quality:</span> <span class="bst-quality-value">…</span></div>
            </div>`);

        fetchJustWatchQualities(mediaId, mediaType).then(function (result) {
            if (!result) {
                qualityLines.remove();
                return;
            }

            const values = qualityLines.querySelectorAll('.bst-quality-value');
            values[0].textContent =
                result.highestReleasedQuality || result.HighestReleasedQuality || 'Unknown';
            values[1].textContent =
                result.mostCommonQuality || result.MostCommonQuality || 'Unknown';
            qualityLines.hidden = false;
        });

        return qualityLines;
    }

    function fetchJellyseerrDetails(mediaId, mediaType) {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/details/' + mediaType + '/' + mediaId),
            type: 'GET',
            dataType: 'json'
        });
    }

    function loadClientSettings() {
        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/client-settings'),
            type: 'GET',
            dataType: 'json'
        }).catch(function (err) {
            log.warn('client settings fetch failed. falling back to plugin config', err);
            return ApiClient.getPluginConfiguration(PLUGIN_ID).catch(function (configErr) {
                log.warn('plugin config fetch failed', configErr);
                return {};
            });
        });
    }

    function loadModalDetails(mediaId, mediaType) {
        return loadClientSettings().then(function (config) {
                const apiKey = getTmdbApiKey(config);
                const jellyseerrPromise = fetchJellyseerrDetails(mediaId, mediaType);

                if (!apiKey) {
                    return jellyseerrPromise;
                }

                // Fetch both sources but prefer TMDB content with Seerr status
                return Promise.all([
                    jellyseerrPromise,
                    fetchTmdbDetailsFromBrowser(mediaId, mediaType, apiKey)
                ]).then(function (results) {
                    const jellyseerr = results[0];
                    const tmdb = results[1];
                    if (tmdb) {
                        return mergeJellyseerrOverlay(tmdb, jellyseerr);
                    }
                    return jellyseerr;
                });
            });
    }

    function formatRuntime(minutes) {
        if (!minutes) {
            return '';
        }
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h && m) {
            return h + 'h ' + m + 'm';
        }
        if (h) {
            return h + 'h';
        }
        return m + 'm';
    }

    function formatEndsAt(minutes) {
        if (!minutes) {
            return '';
        }
        const end = new Date(Date.now() + minutes * 60 * 1000);
        return end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    function formatReleaseDate(dateStr) {
        if (!dateStr) {
            return '';
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            return dateStr;
        }
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function getCertification(data, mediaType) {
        // Get a US certification from Tmdb release_dates (movies) or content_ratings (TV)
        if (mediaType === 'movie' && data.releaseDates) {
            const us = (data.releaseDates.results || []).find(function (r) { return r.iso_3166_1 === 'US'; });
            const rel = us && us.release_dates && us.release_dates.find(function (rd) { return rd.certification; });
            if (rel && rel.certification) {
                return rel.certification;
            }
        }
        if (mediaType === 'tv' && data.contentRatings) {
            const us = (data.contentRatings.results || []).find(function (r) { return r.iso_3166_1 === 'US'; });
            if (us && us.rating) {
                return us.rating;
            }
        }
        return '';
    }

    function getTrailerKey(data) {
        const videos = data.relatedVideos || data.videos;
        const results = videos && (videos.results || videos);
        if (!results || !results.length) {
            return null;
        }
        const trailer = results.find(function (v) {
            return v.type === 'Trailer' && v.site === 'YouTube';
        }) || results[0];
        return trailer && trailer.key ? trailer.key : null;
    }

    function getCast(data) {
        const credits = data.credits || data.aggregateCredits;
        const cast = credits && (credits.cast || []);
        const crew = credits && (credits.crew || []);
        const directors = crew.filter(function (c) { return c.job === 'Director'; }).slice(0, 2);
        const list = [];

        directors.forEach(function (d) {
            list.push({
                id: d.id,
                name: d.name,
                role: 'Director',
                profile_path: d.profilePath || d.profile_path
            });
        });

        (cast || []).slice(0, 24).forEach(function (c) {
            list.push({
                id: c.id,
                name: c.name,
                role: c.character || (c.roles && c.roles[0] && c.roles[0].character) || '',
                profile_path: c.profilePath || c.profile_path
            });
        });

        return list;
    }

    function removeEscapeHandler() {
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
    }

    function closeQualityModal() {
        if (activeQualityRoot) {
            activeQualityRoot.remove();
            activeQualityRoot = null;
        }
    }

    function closeSeasonModal() {
        if (activeSeasonRoot) {
            activeSeasonRoot.remove();
            activeSeasonRoot = null;
        }
    }

    function closeDetailsModal() {
        closeQualityModal();
        closeSeasonModal();
        if (activeDetailsRoot) {
            activeDetailsRoot.remove();
            activeDetailsRoot = null;
        }
        removeEscapeHandler();
        document.body.style.overflow = '';
    }

    function getRequestableSeasons(details) {
        const includeSpecials = getRequestModalAdvanced().includeSpecialsSeason === true;
        return (details.seasons || [])
            .filter(function (season) {
                if (season.episodeCount === 0) {
                    return false;
                }
                if (!includeSpecials && season.seasonNumber <= 0) {
                    return false;
                }
                return true;
            })
            .sort(function (a, b) {
                return a.seasonNumber - b.seasonNumber;
            });
    }

    function getSeasonRequestState(details, seasonNumber, is4k) {
        const mediaSeasons = details && details.mediaInfo && Array.isArray(details.mediaInfo.seasons) ? details.mediaInfo.seasons : [];
        const mediaSeason = mediaSeasons.find(function (season) {
            return season.seasonNumber === seasonNumber;
        });

        if (!mediaSeason) {
            return null;
        }

        const rawStatus = is4k ? (mediaSeason.status4k != null ? mediaSeason.status4k : mediaSeason.status4K) : mediaSeason.status;
        const status = normalizeMediaStatus(rawStatus);
        const labels = {
            2: 'Pending',
            3: 'Requested',
            4: 'Partially available',
            5: 'Available',
            6: 'Blocklisted'
        };

        return labels[status] ? { status: status, label: labels[status] } : null;
    }

    function notifyUser(message) {
        const text = String(message || 'Request failed');

        if (activeDetailsRoot) {
            let notice = activeDetailsRoot.querySelector('[data-request-notice]');
            if (!notice) {
                const actionsRow = activeDetailsRoot.querySelector('.bst-actions-row');
                if (!actionsRow) {
                    return;
                }
                notice = document.createElement('div');
                notice.className = 'bst-request-notice';
                notice.setAttribute('data-request-notice', '1');
                notice.setAttribute('role', 'alert');
                actionsRow.insertAdjacentElement('afterend', notice);
            }

            notice.textContent = text;
            notice.hidden = false;
            return;
        }

        try {
            if (typeof Dashboard !== 'undefined' && typeof Dashboard.alert === 'function') {
                Dashboard.alert(text);
                return;
            }
        } catch (err) {}
        window.alert(text);
    }

    function submitRequest(mediaId, mediaType, option, onSuccess, onError) {
        const payload = {
            MediaType: mediaType,
            MediaId: parseInt(mediaId, 10),
            Is4k: !!option.is4k
        };

        if (option.serverId != null && !Number.isNaN(Number(option.serverId))) {
            payload.ServerId = Number(option.serverId);
        }
        if (option.profileId != null && !Number.isNaN(Number(option.profileId))) {
            payload.ProfileId = Number(option.profileId);
        }
        if (option.rootFolder) {
            payload.RootFolder = option.rootFolder;
        }

        if (mediaType === 'tv' && option.seasons && option.seasons.length) {
            payload.Seasons = option.seasons.slice().sort(function (a, b) { return a - b; });
        }

        return ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/request'),
            type: 'POST',
            data: JSON.stringify(payload),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json'
        }).then(function (response) {
            // Seerr gives 202 with only a message when every selected season already exists in Seerr
            const apiMessage = response && response.errors && response.errors.length > 0
                ? 'Request failed. Check logs for details.'
                : (response && response.message && response.id == null ? String(response.message) : '');

            if (apiMessage) {
                log.error('request was not created for ' + mediaType + '/' + mediaId, response);
                if (typeof onError === 'function') {
                    onError(apiMessage);
                } else {
                    notifyUser(apiMessage);
                }
                return Promise.reject({ handled: true });
            }
            log.info('request submitted for ' + mediaType + '/' + mediaId);
            // TV might still have more seasons to request (so don't lock the button)
            if (mediaType !== 'tv') {
                markRequestButton(!!option.is4k, 'Already requested');
            }
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }).catch(function (err) {
            if (err && err.handled) {
                return Promise.reject(err);
            }
            if (err && err.status === 409) {
                if (mediaType !== 'tv') {
                    markRequestButton(!!option.is4k, 'Already requested');
                }
                if (typeof onSuccess === 'function') {
                    onSuccess();
                }
                return;
            }

            let messagePromise;
            if (err && err.responseJSON && (err.responseJSON.message || err.responseJSON.error)) {
                messagePromise = Promise.resolve(String(err.responseJSON.message || err.responseJSON.error));
            } else if (err && typeof err.text === 'function') {
                // Jellyfin ApiClient (fetch) often rejects with a Response object.
                const reader = typeof err.clone === 'function' ? err.clone() : err;
                messagePromise = reader.text().then(function (text) {
                    try {
                        const body = JSON.parse(text);
                        return String(body.message || body.error || text || 'Request failed');
                    } catch (e) {
                        return text || 'Request failed';
                    }
                }).catch(function () {
                    return 'Request failed';
                });
            } else if (err && typeof err.message === 'string' && err.message) {
                messagePromise = Promise.resolve(err.message);
            } else {
                messagePromise = Promise.resolve('Request failed');
            }

            return messagePromise.then(function (message) {
                log.error('request failed for ' + mediaType + '/' + mediaId, err);
                if (typeof onError === 'function') {
                    onError(message);
                } else {
                    notifyUser(message);
                }
                return Promise.reject(err);
            });
        });
    }

    function renderSeasonModalShell() {
        return `
            <div class="bst-quality-wrapper">
                <div class="bst-quality-backdrop"></div>
                <div class="bst-quality-panel" role="dialog" aria-modal="true">
                    <div class="bst-quality-header">
                        <h3 id="bst-season-title">Select seasons</h3>
                        <button type="button" class="bst-quality-close" aria-label="Close">${CLOSE_ICON}</button>
                    </div>
                    <div class="bst-quality-list"><div class="bst-quality-loading">Loading seasons…</div></div>
                    <div class="bst-quality-footer">
                        <button type="button" class="bst-quality-continue" disabled>Continue</button>
                    </div>
                </div>
            </div>`;
    }

    function renderSeasonList(seasons, details, is4k) {
        const hasRequestableSeasons = seasons.some(function (season) {
            return !getSeasonRequestState(details, season.seasonNumber, is4k);
        });
        const rowsHtml = seasons.map(function (season) {
            const seasonNumber = season.seasonNumber;
            const requestState = getSeasonRequestState(details, seasonNumber, is4k);
            const displayName = season.name && season.name !== `Season ${seasonNumber}`
                ? escapeHtml(season.name)
                : `Season ${seasonNumber}`;
            const episodesHtml = season.episodeCount
                ? `<span class="bst-season-episodes"> (${season.episodeCount}${season.episodeCount === 1 ? ' episode' : ' episodes'})</span>`
                : '';
            const statusHtml = requestState
                ? `<span class="bst-season-status">${escapeHtml(requestState.label)}</span>`
                : '';
            return `
                <label class="bst-season-option${requestState ? ' bst-season-option--unavailable' : ''}">
                    <input type="checkbox" class="bst-season-checkbox bst-season-row-input" value="${seasonNumber}"${requestState ? ' checked disabled' : ''} />
                    <span class="bst-season-label">${displayName}${episodesHtml}</span>
                    ${statusHtml}
                </label>`;
        }).join('');

        return `
            <label class="bst-season-option bst-season-select-all${hasRequestableSeasons ? '' : ' bst-season-option--unavailable'}">
                <input type="checkbox" class="bst-season-checkbox" data-select-all-seasons${hasRequestableSeasons ? '' : ' disabled'} />
                <span class="bst-season-label">Select all</span>
            </label>
            ${rowsHtml}`;
    }

    function bindSeasonList(root, seasons, details, is4k, ctx) {
        const list = root.querySelector('.bst-quality-list');
        const continueBtn = root.querySelector('.bst-quality-continue');
        const selectedSeasons = ctx.selectedSeasons;
        const requestableSeasons = seasons.filter(function (season) {
            return !getSeasonRequestState(details, season.seasonNumber, is4k);
        });

        function syncSelectAll() {
            const seasonNumbers = requestableSeasons.map(function (s) { return s.seasonNumber; });
            const selectAllInput = list.querySelector('[data-select-all-seasons]');
            if (!selectAllInput) {
                return;
            }
            selectAllInput.disabled = seasonNumbers.length === 0;
            selectAllInput.checked = seasonNumbers.length > 0 && seasonNumbers.every(function (num) {
                return selectedSeasons.indexOf(num) !== -1;
            });
            selectAllInput.indeterminate = selectedSeasons.length > 0 && !selectAllInput.checked;
            const requireExplicit = getRequestModalAdvanced().requireExplicitSeasonSelection === true;
            continueBtn.disabled = seasonNumbers.length === 0 || (requireExplicit && selectedSeasons.length === 0);
        }

        list.addEventListener('change', function (event) {
            const selectAllInput = event.target.closest('[data-select-all-seasons]');
            if (selectAllInput) {
                if (selectAllInput.checked) {
                    ctx.selectedSeasons.length = 0;
                    requestableSeasons.forEach(function (s) {
                        ctx.selectedSeasons.push(s.seasonNumber);
                    });
                } else {
                    ctx.selectedSeasons.length = 0;
                }
                list.querySelectorAll('.bst-season-row-input:not(:disabled)').forEach(function (input) {
                    input.checked = ctx.selectedSeasons.indexOf(parseInt(input.value, 10)) !== -1;
                });
                syncSelectAll();
                return;
            }

            const rowInput = event.target.closest('.bst-season-row-input');
            if (!rowInput || rowInput.disabled) {
                return;
            }

            const seasonNumber = parseInt(rowInput.value, 10);
            if (rowInput.checked) {
                if (ctx.selectedSeasons.indexOf(seasonNumber) === -1) {
                    ctx.selectedSeasons.push(seasonNumber);
                }
            } else {
                const idx = ctx.selectedSeasons.indexOf(seasonNumber);
                if (idx !== -1) {
                    ctx.selectedSeasons.splice(idx, 1);
                }
            }
            syncSelectAll();
        });

        syncSelectAll();
    }

    function openSeasonModal(mediaId, mediaType, title, onSuccess, is4k) {
        closeSeasonModal();
        is4k = !!is4k;

        document.body.insertAdjacentHTML('beforeend', renderSeasonModalShell());
        activeSeasonRoot = document.body.lastElementChild;

        const ctx = { selectedSeasons: [] };
        const continueBtn = activeSeasonRoot.querySelector('.bst-quality-continue');
        const list = activeSeasonRoot.querySelector('.bst-quality-list');

        activeSeasonRoot.querySelector('.bst-quality-backdrop').addEventListener('click', closeSeasonModal);
        activeSeasonRoot.querySelector('.bst-quality-close').addEventListener('click', closeSeasonModal);

        continueBtn.addEventListener('click', function () {
            const seasons = ctx.selectedSeasons.slice();
            closeSeasonModal();
            openQualityModal(mediaId, mediaType, title, onSuccess, is4k, seasons);
        });

        fetchJellyseerrDetails(mediaId, mediaType).then(function (details) {
            const seasons = getRequestableSeasons(details);

            if (!seasons.length) {
                list.innerHTML = `<div class="bst-quality-empty">No seasons available.</div>`;
                continueBtn.disabled = true;
                return;
            }

            list.innerHTML = renderSeasonList(seasons, details, is4k);
            bindSeasonList(activeSeasonRoot, seasons, details, is4k, ctx);
        }).catch(function (err) {
            log.error('seasons load failed', err);
            list.innerHTML = `<div class="bst-quality-empty">Failed to load seasons.</div>`;
            continueBtn.disabled = true;
        });
    }

    function renderQualityModalShell(is4k, useSeerrDefaults) {
        const title = useSeerrDefaults ? 'Request' : (is4k ? 'Choose 4K quality profile' : 'Choose quality profile');
        const loadingText = useSeerrDefaults ? 'Submitting request…' : 'Loading profiles…';
        return `
            <div class="bst-quality-wrapper">
                <div class="bst-quality-backdrop"></div>
                <div class="bst-quality-panel" role="dialog" aria-modal="true">
                    <div class="bst-quality-header">
                        <h3 id="bst-quality-title">${title}</h3>
                        <button type="button" class="bst-quality-close" aria-label="Close">${CLOSE_ICON}</button>
                    </div>
                    <div class="bst-quality-list"><div class="bst-quality-loading">${loadingText}</div></div>
                </div>
            </div>`;
    }

    function renderQualityOptions(options) {
        return options.map(function (opt) {
            const label = escapeHtml(opt.profileName || 'Default');
            const subParts = [];
            if (opt.serverName) {
                subParts.push(opt.serverName);
            }
            if (opt.is4k) {
                subParts.push('4K');
            }
            if (opt.isDefaultProfile) {
                subParts.push('default');
            }
            const subHtml = subParts.length ? `<span class="bst-quality-option-sub">${escapeHtml(subParts.join(' · '))}</span>` : '';
            return `
                <button type="button" class="bst-quality-option"
                    data-server-id="${opt.serverId}" data-profile-id="${opt.profileId}"
                    data-root-folder="${escapeHtml(opt.rootFolder || '')}" data-is-4k="${opt.is4k ? '1' : '0'}">
                    ${label}
                    ${subHtml}
                </button>`;
        }).join('');
    }

    function openQualityModal(mediaId, mediaType, title, onSuccess, is4k, selectedSeasons) {
        if (mediaType === 'tv' && selectedSeasons === undefined) {
            if (getRequestModalAdvanced().tvSeasonPickerEnabled !== false) {
                openSeasonModal(mediaId, mediaType, title, onSuccess, is4k);
                return;
            }
            selectedSeasons = [];
        }

        is4k = !!is4k;
        const useSeerrDefaults = getRequestModalAdvanced().allowQualityProfileSelection === false;

        // Show shell so the click feels instant (fill profiles when the api returns)
        closeQualityModal();
        document.body.insertAdjacentHTML('beforeend', renderQualityModalShell(is4k, useSeerrDefaults));
        activeQualityRoot = document.body.lastElementChild;

        const list = activeQualityRoot.querySelector('.bst-quality-list');
        activeQualityRoot.querySelector('.bst-quality-backdrop').addEventListener('click', closeQualityModal);
        activeQualityRoot.querySelector('.bst-quality-close').addEventListener('click', closeQualityModal);

        function finishRequest() {
            closeQualityModal();
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }

        function failRequest(message) {
            if (!list || !activeQualityRoot) {
                notifyUser(message || 'Request failed');
                return;
            }
            list.innerHTML = `<div class="bst-quality-empty">${escapeHtml(message || 'Request failed')}</div>`;
        }

        if (useSeerrDefaults) {
            submitRequest(mediaId, mediaType, {
                is4k: is4k,
                seasons: selectedSeasons
            }, finishRequest, failRequest).catch(function () {});
            return;
        }

        ApiClient.ajax({
            url: ApiClient.getUrl('SeerrFin/request-options/' + mediaType),
            type: 'GET',
            dataType: 'json'
        }).then(function (data) {
            if (!activeQualityRoot) {
                return;
            }

            const rawOptions = (data && (data.options || data.Options)) || [];
            const payload = {
                options: (Array.isArray(rawOptions) ? rawOptions : []).map(function (opt) {
                    if (!opt) {
                        return null;
                    }
                    return {
                        serverId: opt.serverId != null ? opt.serverId : opt.ServerId,
                        serverName: opt.serverName || opt.ServerName || '',
                        profileId: opt.profileId != null ? opt.profileId : opt.ProfileId,
                        profileName: opt.profileName || opt.ProfileName || '',
                        rootFolder: opt.rootFolder || opt.RootFolder || '',
                        is4k: !!(opt.is4k != null ? opt.is4k : opt.Is4k),
                        isDefaultProfile: !!(opt.isDefaultProfile != null ? opt.isDefaultProfile : opt.IsDefaultProfile)
                    };
                }).filter(Boolean),
                canRequest: !!(data && (data.canRequest || data.CanRequest)),
                canRequest4k: !!(data && (data.canRequest4k || data.CanRequest4k)),
                canRequestAdvanced: !!(data && (data.canRequestAdvanced || data.CanRequestAdvanced))
            };
            const allowed = is4k ? payload.canRequest4k : payload.canRequest;
            if (!allowed) {
                closeQualityModal();
                notifyUser(is4k
                    ? 'You do not have permission to make 4K requests.'
                    : (mediaType === 'tv' ? 'You do not have permission to make series requests.' : 'You do not have permission to make movie requests.'));
                return;
            }

            if (!payload.canRequestAdvanced || !payload.options.length) {
                list.innerHTML = `<div class="bst-quality-loading">Submitting request…</div>`;
                submitRequest(mediaId, mediaType, {
                    is4k: is4k,
                    seasons: selectedSeasons
                }, finishRequest, failRequest).catch(function () {});
                return;
            }

            let filteredOptions = payload.options.filter(function (opt) {
                return !!opt.is4k === is4k;
            });
            if (!filteredOptions.length) {
                filteredOptions = payload.options;
            }

            list.innerHTML = renderQualityOptions(filteredOptions);

            list.addEventListener('click', function (event) {
                const btn = event.target.closest('.bst-quality-option');
                if (!btn || btn.disabled) {
                    return;
                }

                btn.disabled = true;
                submitRequest(mediaId, mediaType, {
                    serverId: parseInt(btn.getAttribute('data-server-id'), 10),
                    profileId: parseInt(btn.getAttribute('data-profile-id'), 10),
                    rootFolder: btn.getAttribute('data-root-folder') || null,
                    is4k: btn.getAttribute('data-is-4k') === '1',
                    seasons: selectedSeasons
                }, finishRequest, failRequest).catch(function () {
                    btn.disabled = false;
                });
            });
        }).catch(function (err) {
            log.error('profiles load failed', err);
            failRequest('Failed to load quality profiles.');
        });
    }

    function renderCast(cast) {
        if (!cast.length) {
            return;
        }

        const cardsHtml = cast.map(function (person) {
            const imgSrc = person.profile_path
                ? tmdbImage(person.profile_path, 'w185')
                : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect fill="#333" width="128" height="128"/></svg>')}`;
            return `
                <a class="bst-cast-card" href="https://www.themoviedb.org/person/${person.id}" target="_blank" rel="noopener noreferrer">
                    <div class="bst-cast-avatar">
                        <img alt="${escapeHtml(person.name)}" src="${imgSrc}" />
                    </div>
                    <span class="bst-cast-name">${escapeHtml(person.name)}</span>
                    <span class="bst-cast-role">${escapeHtml(person.role)}</span>
                </a>`;
        }).join('');

        return `
            <div class="bst-cast-section">
                <div class="bst-cast-scroll">${cardsHtml}</div>
            </div>`;
    }

    function renderDetails(data, mediaId, mediaType) {
        const title = data.title || data.name || 'Details';
        const overview = data.overview || '';
        const year = (data.releaseDate || data.firstAirDate || '').substring(0, 4);
        const rating = data.voteAverage != null ? data.voteAverage : data.vote_average;
        const voteCount = data.voteCount != null ? data.voteCount : data.vote_count;
        const backdrop = resolveImageUrl(data.backdropUrl || data.backdrop_url || '') || tmdbImage(data.backdropPath || data.backdrop_path, 'original');
        const runtimeMinutes = data.runtime || (data.episodeRunTime && data.episodeRunTime[0]);
        const runtime = formatRuntime(runtimeMinutes);
        const endsAt = formatEndsAt(runtimeMinutes);
        const language = (data.originalLanguage || data.original_language || '').toUpperCase();
        const releaseLabel = formatReleaseDate(data.releaseDate || data.firstAirDate);
        const certification = getCertification(data, mediaType);
        const genres = data.genres || [];
        const cast = getCast(data);
        const trailerKey = getTrailerKey(data);
        const tmdbId = data.id;
        const imdbId = data.externalIds && (data.externalIds.imdbId || data.externalIds.imdb_id);
        const logoUrl = getLogoImageUrl(data);
        const requestState = getRequestButtonState(data, false);
        const request4kState = getRequestButtonState(data, true);

        return `
            <div class="bst-popout-wrapper">
                <div class="bst-popout-backdrop"></div>
                <div class="bst-popout-center">
                    <div class="bst-aether-card">
                        <div class="bst-aether-card-inner">
                            <button type="button" class="bst-modal-close" aria-label="Close">${CLOSE_ICON}</button>
                            <div class="bst-modal-scroll">
                                <div class="bst-modal-layout">
                                    <div class="bst-hero">
                                        ${backdrop ? `<div class="bst-hero-backdrop" style="background-image: url(&quot;${backdrop}&quot;)"></div>` : ''}
                                        <div class="bst-hero-title-wrap">
                                            ${logoUrl
                                                ? `<img class="bst-hero-logo" alt="${escapeHtml(title)}" src="${logoUrl}" data-fallback-title="${escapeHtml(title)}" />`
                                                : `<h1 class="bst-hero-title-fallback">${escapeHtml(title)}</h1>`}
                                            ${rating || year ? `
                                                <div class="bst-hero-meta">
                                                    ${rating ? `
                                                        <div class="bst-tmdb-rating">
                                                            ${TMDB_LOGO_SVG}
                                                            <span class="bst-meta-emphasis">${Number(rating).toFixed(1)}</span>
                                                            ${voteCount ? `<span class="bst-vote-muted">(${Number(voteCount).toLocaleString()})</span>` : ''}
                                                        </div>` : ''}
                                                    ${year ? `${rating ? '<span class="bst-dot">•</span>' : ''}<span class="bst-meta-emphasis">${escapeHtml(year)}</span>` : ''}
                                                </div>` : ''}
                                        </div>
                                    </div>
                                    <div class="bst-content">
                                        <div class="bst-actions-row">
                                            <div class="bst-actions-left">
                                                <button type="button" class="bst-btn-request" data-action="request"${requestState.requested ? ' disabled' : ''}>${escapeHtml(requestState.label)}</button>
                                                ${getRequestModalAdvanced().showRequest4kButton !== false
                                                    ? `<button type="button" class="bst-btn-request-4k" data-action="request-4k"${request4kState.requested ? ' disabled' : ''}>${escapeHtml(request4kState.label)}</button>`
                                                    : ''}
                                                ${trailerKey
                                                    ? `<button type="button" class="bst-btn-trailer" data-action="trailer" data-trailer-key="${escapeHtml(trailerKey)}">Trailer</button>`
                                                    : ''}
                                            </div>
                                        </div>
                                        <div class="bst-details-layout">
                                            <div class="bst-details-main">
                                                <p class="bst-overview">${escapeHtml(overview)}</p>
                                                <div class="bst-genres">${genres.map(function (g, i) {
                                                    return `<span class="bst-genre-pill" style="animation-delay:${i * 60}ms">${escapeHtml(g.name || g)}</span>`;
                                                }).join('')}</div>
                                            </div>
                                            <div class="bst-sidebar" data-quality-slot>
                                                <div class="bst-sidebar-lines">
                                                    ${runtime ? `<div><span class="bst-label">Runtime:</span> ${escapeHtml(runtime)}${endsAt ? ` <span class="bst-runtime-sep">•</span> Ends at ${escapeHtml(endsAt)}` : ''}</div>` : ''}
                                                    ${language ? `<div><span class="bst-label">Language:</span> ${escapeHtml(language)}</div>` : ''}
                                                    ${releaseLabel ? `<div><span class="bst-label">Release Date:</span> ${escapeHtml(releaseLabel)}</div>` : ''}
                                                    ${certification ? `<div><span class="bst-label">Rating:</span> ${escapeHtml(certification)}</div>` : ''}
                                                    ${tmdbId ? `<div><span class="bst-label">ID:</span> ${escapeHtml(String(tmdbId))}</div>` : ''}
                                                </div>
                                                ${tmdbId || imdbId ? `
                                                    <div class="bst-external-links">
                                                        ${tmdbId ? `
                                                            <a class="bst-external-link tmdb" href="https://www.themoviedb.org/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}"
                                                                target="_blank" rel="noopener noreferrer" title="View on TMDB" style="animation-delay:60ms">
                                                                ${TMDB_LOGO_SVG}
                                                            </a>` : ''}
                                                        ${imdbId ? `
                                                            <a class="bst-external-link imdb" href="https://www.imdb.com/title/${imdbId}"
                                                                target="_blank" rel="noopener noreferrer" title="View on IMDb" style="animation-delay:120ms">
                                                                ${IMDB_ICON}
                                                            </a>` : ''}
                                                    </div>` : ''}
                                            </div>
                                        </div>
                                        ${cast.length ? renderCast(cast) : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function bindDetailsModal(root, data, mediaId, mediaType) {
        const title = data.title || data.name || 'Details';
        const trailerKey = getTrailerKey(data);
        const tmdbId = data.id;

        root.querySelector('.bst-popout-backdrop').addEventListener('click', closeDetailsModal);
        root.querySelector('.bst-modal-close').addEventListener('click', closeDetailsModal);

        const logoImg = root.querySelector('.bst-hero-logo');
        if (logoImg) {
            logoImg.addEventListener('error', function () {
                const fallbackTitle = logoImg.getAttribute('data-fallback-title') || title;
                logoImg.insertAdjacentHTML('afterend', `<h1 class="bst-hero-title-fallback">${escapeHtml(fallbackTitle)}</h1>`);
                logoImg.remove();
            });
        }

        const requestBtn = root.querySelector('[data-action="request"]');
        if (requestBtn && !requestBtn.disabled) {
            requestBtn.addEventListener('click', function () {
                openQualityModal(mediaId, mediaType, title);
            });
        }

        const request4kBtn = root.querySelector('[data-action="request-4k"]');
        if (request4kBtn && !request4kBtn.disabled) {
            request4kBtn.addEventListener('click', function () {
                openQualityModal(mediaId, mediaType, title, undefined, true);
            });
        }

        const trailerBtn = root.querySelector('[data-action="trailer"]');
        if (trailerBtn && trailerKey) {
            trailerBtn.addEventListener('click', function () {
                window.open(`https://www.youtube.com/watch?v=${trailerKey}`, '_blank', 'noopener,noreferrer');
            });
        }

        const settings = window.seerrFinPlugin && window.seerrFinPlugin._displaySettings;
        const showQualityRecommendations = !settings || settings.QualityRecommendations !== false;
        if (showQualityRecommendations && tmdbId) {
            const qualitySlot = root.querySelector('[data-quality-slot]');
            const qualityLines = buildJustWatchQualityLines(tmdbId, mediaType);
            qualitySlot.insertBefore(qualityLines, qualitySlot.firstChild);
        }
    }

    function buildDetailsDom(data, mediaId, mediaType) {
        const root = mountFromHtml(renderDetails(data, mediaId, mediaType));
        bindDetailsModal(root, data, mediaId, mediaType);
        return root;
    }

    function renderDetailsLoading() {
        return `
            <div class="bst-popout-wrapper">
                <div class="bst-popout-backdrop"></div>
                <div class="bst-popout-center">
                    <div class="bst-aether-card">
                        <div class="bst-modal-loading">Loading…</div>
                    </div>
                </div>
            </div>`;
    }

    function openDetailsModal(mediaId, mediaType) {
        closeDetailsModal();
        log.info('opening details modal for ' + mediaType + '/' + mediaId);

        document.body.insertAdjacentHTML('beforeend', renderDetailsLoading());
        activeDetailsRoot = document.body.lastElementChild;
        document.body.style.overflow = 'hidden';

        loadModalDetails(mediaId, mediaType).then(function (data) {
            const dom = buildDetailsDom(data, mediaId, mediaType);
            activeDetailsRoot.replaceWith(dom);
            activeDetailsRoot = dom;
            log.info('details modal ready for ' + mediaType + '/' + mediaId);

            escapeHandler = function (e) {
                if (e.key === 'Escape') {
                    if (activeQualityRoot) {
                        closeQualityModal();
                    } else if (activeSeasonRoot) {
                        closeSeasonModal();
                    } else {
                        closeDetailsModal();
                    }
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }).catch(function (err) {
            log.error('details modal failed for ' + mediaType + '/' + mediaId, err);
            closeDetailsModal();
            Dashboard.alert('Failed to load details');
        });
    }

    window.seerrFinModal = {
        open: openDetailsModal,
        close: closeDetailsModal,
        openQualityPicker: openQualityModal
    };
})();
