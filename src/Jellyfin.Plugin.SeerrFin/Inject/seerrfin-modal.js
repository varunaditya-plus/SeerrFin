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
    const CLOSE_ICON = '<span class="material-icons close" aria-hidden="true"></span>';
    const IMDB_ICON = '<svg width="2em" height="2em" fill="currentColor" viewBox="0 0 32 32"><path d="M8.4,21.1H5.9V9.9h3.8l0.7,4.7h0.1L11,9.9h3.8v11.2h-2.5v-6.7h-0.1l-0.9,6.7H9.4l-1-6.7h0L8.4,21.1z"/><path d="M15.8,9.8c0.4,0,3.2-0.1,4.7,0.1c1.2,0.1,1.8,1.1,1.9,2.3c0.1,2.2,0.1,4.4,0.1,6.6c0,0.2,0,0.5-0.1,0.8c-0.2,0.9-0.7,1.4-1.9,1.5c-1.5,0.1-3,0.1-4.4,0.1c0,0-0.1,0-0.2,0V9.8z M18.8,11.9v7.2c0.5,0,0.8-0.2,0.8-0.7c0-1.9,0-3.9,0-5.9C19.6,12,19.4,11.8,18.8,11.9z"/><path d="M2,21.1V9.9h2.9v11.2H2z"/><path d="M29.9,14.1c-0.1-0.8-0.6-1.2-1.4-1.4c-0.8-0.1-1.6,0-2.3,0.7V9.9h-2.8v11.2H26c0.1-0.2,0.1-0.4,0.2-0.5c0.1,0.1,0.2,0.2,0.3,0.3c0.7,0.5,1.5,0.6,2.3,0.3c0.7-0.3,1-0.9,1-1.6c0-0.8,0.1-1.7,0.1-2.6C30,16,30,15,29.9,14.1z M27.1,19.1c0,0.2-0.2,0.4-0.4,0.4s-0.4-0.2-0.4-0.4v-4.3c0-0.2,0.2-0.4,0.4-0.4s0.4,0.2,0.4,0.4V19.1z"/></svg>';
    const ratingLogos = {
        tmdb: ratingLogoUrl(TMDB_LOGO_SVG),
        imdb: ratingLogoUrl(
            IMDB_ICON.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
                .replace('fill="currentColor"', 'fill="#f5c518"')
                .replace('viewBox="0 0 32 32"', 'viewBox="2 9.8 28 11.4"')
        ),
        rtFresh: ratingLogoUrl('<svg viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg"><path d="m478.29 296.98c-3.99-63.966-36.52-111.82-85.468-138.58 0.278 1.56-1.109 3.508-2.688 2.818-32.016-14.006-86.328 31.32-124.28 7.584 0.285 8.519-1.378 50.072-59.914 52.483-1.382 0.056-2.142-1.355-1.268-2.354 7.828-8.929 15.732-31.535 4.367-43.586-24.338 21.81-38.472 30.017-85.138 19.186-29.878 31.241-46.809 74-43.485 127.26 6.78 108.74 108.63 170.89 211.19 164.49 102.56-6.395 193.47-80.572 186.68-189.31" fill="#FA320A"/><path d="M291.375 132.293c21.075-5.023 81.693-.49 101.114 25.274 1.166 1.545-.475 4.468-2.355 3.648-32.016-14.006-86.328 31.32-124.282 7.584.285 8.519-1.378 50.072-59.914 52.483-1.382.056-2.142-1.355-1.268-2.354 7.828-8.929 15.73-31.535 4.367-43.586-26.512 23.758-40.884 31.392-98.426 15.838-1.883-.508-1.241-3.535.762-4.298 10.876-4.157 35.515-22.361 58.824-30.385 4.438-1.526 8.862-2.71 13.18-3.4-25.665-2.293-37.235-5.862-53.559-3.4-1.789.27-3.004-1.813-1.895-3.241 21.995-28.332 62.513-36.888 87.512-21.837-15.41-19.094-27.48-34.321-27.48-34.321l28.601-16.246s11.817 26.4 20.414 45.614c21.275-31.435 60.86-34.336 77.585-12.033.992 1.326-.045 3.21-1.702 3.171-13.612-.331-21.107 12.05-21.675 21.466l.197.023" fill="#00912D"/></svg>'),
        rtRotten: ratingLogoUrl('<svg viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg"><path d="M445.185 444.684c-79.369 4.167-95.587-86.652-126.726-86.006-13.268.279-23.726 14.151-19.133 30.32 2.525 8.888 9.53 21.923 13.944 30.011 15.57 28.544-7.447 60.845-34.383 63.577-44.76 4.54-63.433-21.426-62.278-48.007 1.3-29.84 26.6-60.331.65-73.305-27.194-13.597-49.301 39.572-75.325 51.439-23.553 10.741-56.248 2.413-67.872-23.741-8.164-18.379-6.68-53.768 29.67-67.27 22.706-8.433 73.305 11.029 75.9-13.623 2.992-28.416-53.155-30.812-70.06-37.626-29.912-12.055-47.567-37.85-33.734-65.522 10.378-20.757 40.915-29.203 64.223-20.11 27.922 10.892 32.404 39.853 46.71 51.897 12.324 10.38 29.19 11.68 40.22 4.543 8.135-5.265 10.843-16.828 7.774-27.39-4.07-14.023-14.875-22.773-25.415-31.346-18.758-15.249-45.24-28.36-29.222-69.983 13.13-34.11 51.642-35.34 51.642-35.34 15.3-1.72 29.002 2.9 40.167 12.875 14.927 13.335 17.834 31.16 15.336 50.176-2.283 17.358-8.426 32.56-11.63 49.759-3.717 19.966 6.954 40.086 27.249 40.869 26.694 1.031 34.698-19.486 37.964-32.492 4.782-19.028 11.058-36.694 28.718-47.82 25.346-15.97 60.552-12.47 76.886 18.222 12.92 24.284 8.772 57.715-11.047 75.97-8.892 8.188-19.584 11.075-31.148 11.156-16.585.117-33.162-.29-48.556 7.471-10.48 5.281-15.047 13.888-15.045 25.423 0 11.242 5.853 18.585 15.336 23.363 17.86 9.003 37.577 10.843 56.871 14.222 27.98 4.9 52.581 14.755 68.375 40.72.142.228.28.458.415.69 18.139 30.741-.831 75.005-36.476 76.878" fill="#0AC855"/></svg>'),
        rtAudienceFresh: ratingLogoUrl('<svg viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M370.57 474.214l23.466-237.956c14.93-4.796 29.498-11.15 40.23-20.262L404.16 446.278c-6.748 10.248-19.863 20.86-33.59 27.936zm-78.197 21.631l2.947-244.528c20.894-.599 47.933-3.43 70.97-8.346l-19.07 241.17c-22.724 7.518-35.934 9.848-54.847 11.704zm-99.694-252.874c23.038 4.916 50.077 7.747 70.971 8.346l2.948 244.528c-18.914-1.856-32.123-4.186-54.847-11.705l-19.072-241.17zm-67.974-26.975c10.732 9.112 25.3 15.466 40.23 20.262l23.464 237.956c-13.726-7.075-26.84-17.688-33.59-27.936l-30.104-230.282z"/><path fill="gold" d="M118.905 157.445c1.357 28.827 72.771 51.677 160.578 51.176 76.687-.438 140.659-18.546 156.329-42.336a22.976 22.976 0 00-14.058-7.426c.06-.7.098-1.406.095-2.122-.065-11.4-8.429-20.788-19.327-22.54.287-1.474.438-2.999.43-4.559-.072-12.696-10.426-22.928-23.124-22.856-.287.001-.568.036-.853.049a22.911 22.911 0 001.254-7.56c-.074-12.697-10.425-22.93-23.123-22.858a22.914 22.914 0 00-8.247 1.6c-3.632-6.835-10.606-11.6-18.737-12.149-1.416-11.4-11.157-20.195-22.93-20.129-7.41.042-13.963 3.6-18.136 9.065-4.233-4.605-10.3-7.494-17.047-7.456-12.698.072-22.932 10.424-22.86 23.118a22.983 22.983 0 001.115 6.946 22.918 22.918 0 00-13.07 7.459c-2.644-9.847-11.637-17.084-22.314-17.024-9.975.057-18.406 6.47-21.537 15.366-8.474 3.426-14.439 11.738-14.383 21.433.012 2.154.342 4.227.907 6.202a22.876 22.876 0 00-9.328-1.932c-10.012.058-18.47 6.516-21.574 15.465a22.83 22.83 0 00-9.788-2.149c-12.698.072-22.934 10.422-22.86 23.118a22.833 22.833 0 003.159 11.463c-.202.203-.379.426-.571.636"/><path fill="#FA320A" d="M404.161 446.278c-6.749 10.248-19.864 20.86-33.59 27.936l23.465-237.956c14.93-4.796 29.498-11.15 40.23-20.262L404.16 446.278zM347.22 484.14c-22.723 7.519-35.934 9.85-54.847 11.705l2.947-244.528c20.894-.599 47.933-3.43 70.973-8.346L347.22 484.14zm-135.47 0l-19.07-241.17c23.037 4.917 50.076 7.748 70.97 8.347l2.948 244.528c-18.914-1.856-32.123-4.186-54.847-11.705zm-56.94-37.862l-30.105-230.282c10.732 9.112 25.3 15.466 40.23 20.262l23.464 237.956c-13.726-7.075-26.84-17.688-33.588-27.936zm247.668-321.143c.298 1.453.465 2.955.473 4.498a23.018 23.018 0 01-.43 4.56c10.9 1.749 19.263 11.137 19.328 22.54a23.59 23.59 0 01-.095 2.12 22.976 22.976 0 0114.058 7.425c-15.669 23.792-79.642 41.9-156.327 42.34-87.807.502-159.221-22.346-160.58-51.175.192-.208.37-.433.57-.634-1.355-2.311-2.29-4.887-2.773-7.62-8.408 7.979-13.495 14.412-12.6 23.78.085 1.251 37.196 266.911 37.196 266.911 4.282 42.075 65.391 75.703 138.187 76.12 72.796-.417 133.907-34.045 138.187-76.12 0 0 37.11-265.66 37.197-266.912 1.777-18.736-20.15-35.745-52.39-47.833z"/></svg>'),
        rtAudienceRotten: ratingLogoUrl('<svg viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg"><g transform="translate(33 140)"><path d="m43.802 267.32l237.94 23.482c4.7937 14.937 11.149 29.517 20.259 40.256l-230.27-30.125c-10.248-6.7519-20.861-19.877-27.936-33.612zm222.88-75.298c0.60053 20.906 3.4316 47.964 8.3462 71.017l-241.15-19.083c-7.518-22.739-9.8466-35.959-11.704-54.885l244.51 2.951zm8.3462-102.71c-4.9146 23.053-7.7456 50.111-8.3462 71.017l-244.51 2.951c1.8576-18.926 4.1862-32.146 11.704-54.885l241.15-19.083zm26.973-68.019c-9.1095 10.74-15.465 25.318-20.259 40.257l-237.94 23.48c7.0751-13.735 17.689-26.859 27.936-33.612l230.27-30.125z" fill="#fff"/><path d="m303.57 264.67c3.155-7.8209 14.337-12.586 22.367-12.028 8.5825 0.59581 17.699 9.6258 19.292 18.507 0.29589-0.32244 0.60578-0.62735 0.92093-0.92701 2.7558-2.6356 6.2084-4.3845 9.9867-4.8664-0.57777-2.562-0.71609-5.3045-0.3204-8.1188 1.3954-9.901 9.3336-17.326 18.422-17.252 5.8652 0.047314 11.011 3.0509 14.364 7.6649 0.29939-0.37501 0.6303-0.71848 0.95245-1.069 3.8343-19.991 6.2644-42.578 6.8177-66.547 1.8996-82.42-18.993-149.75-46.663-150.39-27.672-0.63962-51.644 65.656-53.544 148.08 0 0-1.4654 30.062 7.4042 86.951" fill="#00641E"/><path d="m490.91 354.8c1.6353-2.732 2.5492-6.0072 2.4862-9.4874 0.5305-11.245-7.1819-21.439-17.913-20.31 0.3099-1.2862 0.51299-2.6233 0.59178-4.0024 0.64255-11.264-7.1188-20.972-17.337-21.682-0.2241-0.014019-0.44471-0.021029-0.66706-0.028039 1.0627-2.795 1.5897-5.916 1.4024-9.2228-0.52875-9.3717-6.9858-17.268-15.386-18.822-3.0342-0.56076-5.9773-0.28213-8.6718 0.65188-2.5457-6.277-7.8909-10.933-14.393-11.916-0.51474-10.192-7.8699-18.58-17.34-19.238-5.9545-0.41356-11.426 2.3237-15.085 6.9061-3.3528-4.614-8.4985-7.6158-14.364-7.6632-9.0885-0.075352-17.027 7.3495-18.422 17.252-0.39569 2.8126-0.25737 5.555 0.3204 8.1188-3.7783 0.48015-7.2309 2.2308-9.9867 4.8646-0.31515 0.29966-0.62504 0.60457-0.92093 0.92701-1.5932-8.8811-10.71-17.909-19.292-18.507-8.0293-0.55726-19.357 4.3249-22.367 12.028 1.3201 13.434 9.71 50.053 40.055 82.903l0.26963 0.019276c2.9256 2.6496 6.7459 4.1093 10.818 3.7466 2.5247-0.22606 4.8498-1.1303 6.8527-2.5252l0.48848 0.033295c2.67 1.8558 5.8793 2.8266 9.2706 2.5252 1.2956-0.11566 2.5317-0.42758 3.7065-0.87269 2.9064 6.0142 9.3879 9.901 16.622 9.2631 5.6026-0.49417 10.365-3.5959 13.164-7.9611l0.90692 0.063086c2.7961 2.774 6.513 4.3897 10.522 4.2688 3.3143 5.0188 9.4019 8.1065 16.12 7.516 2.5299-0.22255 4.8918-0.95505 6.998-2.0643 3.5139 4.3266 9.2811 6.8991 15.609 6.3419 6.2557-0.5485 11.54-4.02 14.414-8.8197 2.8241 2.2693 6.3625 3.4872 10.12 3.1525 3.6452-0.32594 6.8842-2.0485 9.3179-4.6543l0.40619 0.028038c0.55326-0.80259 1.026-1.6245 1.4654-2.4533 0.010505-0.015772 0.019259-0.033296 0.028014-0.049067 0.059527-0.1104 0.13306-0.21905 0.18909-0.3312" fill="#FFD700"/><path d="m281.75 61.547l-237.94 23.48c7.0751-13.735 17.689-26.859 27.936-33.612l230.27-30.125c-9.1095 10.74-15.465 25.318-20.259 40.257zm20.259 269.51l-230.27-30.125c-10.248-6.7519-20.861-19.877-27.936-33.611l237.94 23.48c4.7937 14.937 11.149 29.517 20.259 40.256zm-268.13-87.102c-7.518-22.739-9.8466-35.957-11.704-54.885l244.51 2.951c0.60053 20.906 3.4316 47.964 8.3462 71.017l-241.15-19.083zm0-135.56l241.15-19.083c-4.9146 23.053-7.7456 50.111-8.3462 71.019l-244.51 2.9493c1.8576-18.926 4.1862-32.146 11.704-54.885zm344.72-82.679c-15.255-17.778-26.206-26.124-35.587-25.04-1.7491 0.22255-266.89 37.222-266.89 37.222-42.074 4.2828-75.7 65.432-76.117 138.28 0.4167 72.843 34.043 133.99 76.117 138.28 0 0 265.64 37.135 266.89 37.221 2.2183-0.014019 4.4086-0.31192 6.5673-0.86568-2.101-0.6256-4.0391-1.7208-5.6867-3.2139l-0.26963-0.019276c-30.345-32.848-38.735-69.47-40.055-82.903 0.003501-0.010514 0.010505-0.019276 0.014006-0.02979-0.003501 0.010514-0.010505 0.019276-0.014006 0.02979-8.8697-56.889-7.4042-86.951-7.4042-86.951 1.8996-82.42 25.872-148.72 53.544-148.08 27.67 0.63962 48.562 67.973 46.663 150.39-0.55326 23.969-2.9834 46.556-6.8177 66.547 3.9393-4.3512 9.2233-6.1842 14.133-5.8372 0.90342 0.064838 1.7823 0.2173 2.6437 0.41531 16.804-92.03-0.81238-181.89-27.729-215.44z" fill="#04A53C"/></g></svg>')
    };

    function ratingLogoUrl(svg) {
        return 'data:image/svg+xml,' + encodeURIComponent(svg.replace('width="2em" height="2em" ', ''));
    }

    let activeDetailsRoot = null;
    let activeSeasonRoot = null;
    let activeQualityRoot = null;
    let escapeHandler = null;
    const ratingCache = new Map();
    const ratingQueue = [];
    let activeRatingRequests = 0;

    function loadRatings() {
        while (activeRatingRequests < 4 && ratingQueue.length) {
            const job = ratingQueue.shift();

            if (job.userId !== ApiClient.getCurrentUserId()) {
                job.resolve({});
                continue;
            }

            activeRatingRequests++;
            const path = job.mediaType === 'tv' ? 'tv/' + job.mediaId + '/ratings' : 'movie/' + job.mediaId + '/ratingscombined';

            ApiClient.ajax({
                url: ApiClient.getUrl('SeerrFin/jellyseerr/' + path),
                type: 'GET',
                dataType: 'json'
            }).then(function (ratings) {
                job.resolve(job.mediaType === 'tv' ? { rt: ratings } : ratings || {});
            }).catch(function (err) {
                ratingCache.delete(job.key);
                if (!err || err.status !== 404) log.warn('Seerr ratings fetch failed', err);

                job.resolve({});
            }).finally(function () {
                activeRatingRequests--;
                loadRatings();
            });
        }
    }

    function fetchRatings(mediaId, mediaType) {
        const userId = ApiClient.getCurrentUserId();
        const key = userId + ':' + mediaType + ':' + mediaId;

        if (!ratingCache.has(key)) {
            if (ratingCache.size >= 200) ratingCache.delete(ratingCache.keys().next().value);

            ratingCache.set(key, new Promise(function (resolve) {
                ratingQueue.push({
                    mediaId: mediaId,
                    mediaType: mediaType,
                    userId: userId,
                    key: key,
                    resolve: resolve
                });
                loadRatings();
            }));
        }

        return ratingCache.get(key);
    }

    function getRatingSources(mediaType, config) {
        const tv = mediaType === 'tv';
        const allowed = tv ? ['tmdb', 'rtCritics', 'rtAudience'] : ['tmdb', 'imdb', 'rtCritics', 'rtAudience'];
        const selected = tv ?
            config?.TvShowRatingSources ?? config?.tvShowRatingSources :
            config?.MovieRatingSources ?? config?.movieRatingSources;
        const values = Array.isArray(selected) ? selected : ['tmdb'];

        return allowed.filter(function (source) { return values.includes(source); });
    }

    function getRatingEntries(tmdbScore, tmdbVotes, ratings, selected, config) {
        const entries = [];
        const color = config?.RatingStarColor ?? config?.ratingStarColor;
        const star = (config?.UseStarForRatings ?? config?.useStarForRatings) === true ?
            ratingLogoUrl(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' +
                (/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffd700') +
                '"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'
            ) :
            null;

        function add(source, label, score, max, logo, votes) {
            if (!selected.includes(source) || (typeof score !== 'number' && typeof score !== 'string') || score === '') return;

            const value = Number(score);

            if (!(value >= 0 && value <= max) || (max === 10 && value === 0)) return;

            entries.push({
                label: label,
                value: value * 10 / max,
                text: max === 100 ? value.toFixed(0) + '%' : value.toFixed(1),
                logo: star || logo,
                votes: votes
            });
        }

        add('tmdb', 'TMDB', tmdbScore, 10, ratingLogos.tmdb, tmdbVotes);
        add('imdb', 'IMDb', ratings?.imdb?.criticsScore, 10, ratingLogos.imdb, ratings?.imdb?.criticsScoreCount);

        const rt = ratings?.rt;

        if (rt?.criticsRating) add('rtCritics', 'Tomatometer', rt.criticsScore, 100,
            rt.criticsRating === 'Rotten' ? ratingLogos.rtRotten : ratingLogos.rtFresh);

        if (rt?.audienceRating) add('rtAudience', 'Popcornmeter', rt.audienceScore, 100,
            rt.audienceRating === 'Spilled' ? ratingLogos.rtAudienceRotten : ratingLogos.rtAudienceFresh);

        return entries;
    }

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
        const modal = plugin && plugin._displaySettings && plugin._displaySettings.Advanced ?
            plugin._displaySettings.Advanced.requestModal :
            null;

        return {
            tvSeasonPickerEnabled: readAdvancedBool(modal && modal.tvSeasonPickerEnabled, true),
            includeSpecialsSeason: readAdvancedBool(modal && modal.includeSpecialsSeason, false),
            requireExplicitSeasonSelection: readAdvancedBool(modal && modal.requireExplicitSeasonSelection, false),
            showRequest4kButton: readAdvancedBool(modal && modal.showRequest4kButton, true),
            showRootFolderSelector: readAdvancedBool(modal && modal.showRootFolderSelector, false),
            backdropLanguageFilter: (modal && modal.backdropLanguageFilter) || 'en,null,en-US'
        };
    }

    function tmdbImage(path, size) {
        if (!path) { return ''; }

        return 'https://image.tmdb.org/t/p/' + (size || 'original') + path;
    }

    function resolveImageUrl(url) {
        if (!url) { return ''; }

        if (url.startsWith('http') || url.startsWith('data:')) {
            return url;
        }

        return ApiClient.getUrl(url);
    }

    const PLUGIN_ID = 'c8e4f2a1-9b3d-4e7f-a6c2-1d5e8f0a3b7c';

    function getLogoImageUrl(data) {
        const rawPath = data && (data.logoPath || data.logo_path);

        if (!rawPath) { return ''; }

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

        const valid = logos.filter(function (logo) { return logo && logo.file_path; });

        if (!valid.length) { return null; }

        function byVote(a, b) {
            return (b.vote_average || 0) - (a.vote_average || 0) || (b.width || 0) - (a.width || 0);
        }

        // Prioritize getting English logos over en-US. Fallbacks to highest rated logo (not locale specific)
        const english = valid.filter(function (logo) { return isEnglishLogo(logo) && !isEnUsLogo(logo); }).sort(byVote)[0];

        if (english) { return english.file_path; }

        const enUs = valid.filter(isEnUsLogo).sort(byVote)[0];

        if (enUs) { return enUs.file_path; }

        return valid.sort(byVote)[0].file_path;
    }

    function isTmdbBearerToken(apiKey) {
        // v4 read tokens are JWTs, while v3 keys are plain strings.
        const parts = String(apiKey).split('.');
        return parts.length === 3;
    }

    function appendTmdbQuery(url, name, value) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(name) + '=' + encodeURIComponent(value);
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
        const filteredUrl = appendTmdbQuery(base, 'include_image_language', getRequestModalAdvanced().backdropLanguageFilter);

        return fetchTmdbJson(filteredUrl, apiKey)
            .then(function (payload) {
                let path = pickLogoFilePath(payload.logos);

                if (path) { return path; }

                // If no English logo in filtered set, retry with all languages
                return fetchTmdbJson(base, apiKey).then(function (all) { return pickLogoFilePath(all.logos); });
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
        const append = isTv ? 'videos,credits,content_ratings,external_ids' : 'videos,credits,release_dates,external_ids';
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
        if (!jellyseerrDetails) { return tmdbDetails; }

        // Preserve Seerr's text in the saved locale alongside TMDB artwork and metadata.
        [
            'title',
            'name',
            'overview',
            'genres'
        ].forEach(function (key) {
            if (jellyseerrDetails[key]) tmdbDetails[key] = jellyseerrDetails[key];
        });

        if (jellyseerrDetails.mediaInfo) {
            tmdbDetails.mediaInfo = jellyseerrDetails.mediaInfo;
        }

        ['mediaAdded', 'status', 'status4k', 'inProduction', 'jellyfinItemId'].forEach(function (key) {
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

        if (key in map) { return map[key]; }

        const asNum = parseInt(key, 10);

        return Number.isNaN(asNum) ? null : asNum;
    }

    function getRequestButtonState(data, is4k) {
        const defaultLabel = is4k ? 'Request 4K' : 'Request';
        const info = data && data.mediaInfo;
        const raw = is4k ?
            (info && (info.status4k != null ? info.status4k : info.status4K)) ?? (data && data.status4k) :
            (info && info.status != null ? info.status : (data && data.status));
        const status = normalizeMediaStatus(raw);

        // Watchlist entries also have mediaInfo; unknown or deleted media can be requested.
        if (status == null || status <= 1 || status === 7) {
            return { requested: false, label: defaultLabel };
        }

        // Some seasons/eps are present (more seasons should still be able to be requested)
        if (status === 4) { return { requested: false, label: defaultLabel }; }

        const labels = {
            2: 'Pending',
            3: 'Processing',
            5: 'Available',
            6: 'Blocklisted'
        };

        return { requested: true, label: labels[status] || 'Already requested' };
    }

    function markRequestButton(is4k, label) {
        if (!activeDetailsRoot) { return; }

        const btn = activeDetailsRoot.querySelector(is4k ? '[data-action="request-4k"]' : '[data-action="request"]');

        if (!btn) { return; }

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
            </div>
        `);

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
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/details/' + mediaType + '/' + mediaId), type: 'GET', dataType: 'json' });
    }

    function navigateToJellyfinItem(itemId) {
        if (!itemId || typeof ApiClient === 'undefined') {
            return;
        }

        // Only navigate once Jellyfin confirms the current user can see the item
        ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).then(function (item) {
                closeDetailsModal();
                window.Emby.Page.showItem(item);
            })
            .catch(function (err) {
                log.warn('Jellyfin item lookup failed for ' + itemId, err);
                Dashboard.alert('Unable to open this item in Jellyfin');
            });
    }

    function loadClientSettings() {
        return ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/client-settings'), type: 'GET', dataType: 'json' }).catch(function (err) {
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
            const ratingSources = getRatingSources(mediaType, config);
            const jellyseerrPromise = fetchJellyseerrDetails(mediaId, mediaType);

            // Fetch both sources but prefer TMDB content with Seerr status
            return Promise.all([
                jellyseerrPromise,
                apiKey ? fetchTmdbDetailsFromBrowser(mediaId, mediaType, apiKey) : null
            ]).then(function (results) {
                const jellyseerr = results[0];
                const tmdb = results[1];
                const details = tmdb ? mergeJellyseerrOverlay(tmdb, jellyseerr) : jellyseerr;
                details.ratingSources = ratingSources;
                details.useStarForRatings = config.UseStarForRatings ?? config.useStarForRatings;
                details.ratingStarColor = config.RatingStarColor ?? config.ratingStarColor;
                return details;
            });
        });
    }

    function formatRuntime(minutes) {
        if (!minutes) { return ''; }

        const h = Math.floor(minutes / 60);
        const m = minutes % 60;

        if (h && m) {
            return h + 'h ' + m + 'm';
        }

        if (h) { return h + 'h'; }

        return m + 'm';
    }

    function formatEndsAt(minutes) {
        if (!minutes) { return ''; }

        const end = new Date(Date.now() + minutes * 60 * 1000);

        return end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    function formatReleaseDate(dateStr) {
        if (!dateStr) { return ''; }

        const d = new Date(dateStr);

        if (isNaN(d.getTime())) { return dateStr; }

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

        const trailer = results.find(function (v) { return v.type === 'Trailer' && v.site === 'YouTube'; }) || results[0];

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
                if (season.episodeCount === 0) { return false; }

                if (!includeSpecials && season.seasonNumber <= 0) {
                    return false;
                }

                return true;
            })
            .sort(function (a, b) { return a.seasonNumber - b.seasonNumber; });
    }

    function getSeasonRequestState(details, seasonNumber, is4k) {
        const mediaSeasons = details && details.mediaInfo && Array.isArray(details.mediaInfo.seasons) ? details.mediaInfo.seasons : [];
        const mediaSeason = mediaSeasons.find(function (season) { return season.seasonNumber === seasonNumber; });

        if (!mediaSeason) { return null; }

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

                if (!actionsRow) { return; }

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
        const payload = { MediaType: mediaType, MediaId: parseInt(mediaId, 10), Is4k: !!option.is4k };

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
            const apiMessage = response && response.errors && response.errors.length > 0 ?
                'Request failed. Check logs for details.' :
                (response && response.message && response.id == null ? String(response.message) : '');

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
            document.dispatchEvent(new Event('seerrfin-request-changed'));

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
                document.dispatchEvent(new Event('seerrfin-request-changed'));
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
                }).catch(function () { return 'Request failed'; });
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
                    <div class="bst-quality-list">
                        <div class="bst-quality-loading">Loading seasons…</div>
                    </div>
                    <div class="bst-quality-footer">
                        <button type="button" class="bst-quality-continue" disabled>Continue</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSeasonList(seasons, details, is4k) {
        const hasRequestableSeasons = seasons.some(function (season) { return !getSeasonRequestState(details, season.seasonNumber, is4k); });
        const rowsHtml = seasons.map(function (season) {
            const seasonNumber = season.seasonNumber;
            const requestState = getSeasonRequestState(details, seasonNumber, is4k);
            const displayName = season.name && season.name !== `Season ${seasonNumber}` ?
                escapeHtml(season.name) :
                `Season ${seasonNumber}`;
            const episodesHtml = season.episodeCount ?
                `<span class="bst-season-episodes"> (${season.episodeCount}${season.episodeCount === 1 ? ' episode' : ' episodes'})</span>` :
                '';
            const statusHtml = requestState ?
                `<span class="bst-season-status">${escapeHtml(requestState.label)}</span>` :
                '';

            return `
                <label class="bst-season-option${requestState ? ' bst-season-option--unavailable' : ''}">
                    <input type="checkbox" class="bst-season-checkbox bst-season-row-input" value="${seasonNumber}"${requestState ? ' checked disabled' : ''} />
                    <span class="bst-season-label">${displayName}${episodesHtml}</span>
                    ${statusHtml}
                </label>
            `;
        }).join('');

        return `
            <label class="bst-season-option bst-season-select-all${hasRequestableSeasons ? '' : ' bst-season-option--unavailable'}">
                <input type="checkbox" class="bst-season-checkbox" data-select-all-seasons${hasRequestableSeasons ? '' : ' disabled'} />
                <span class="bst-season-label">Select all</span>
            </label>
            ${rowsHtml}
        `;
    }

    function bindSeasonList(root, seasons, details, is4k, ctx) {
        const list = root.querySelector('.bst-quality-list');
        const continueBtn = root.querySelector('.bst-quality-continue');
        const selectedSeasons = ctx.selectedSeasons;
        const requestableSeasons = seasons.filter(function (season) { return !getSeasonRequestState(details, season.seasonNumber, is4k); });

        function syncSelectAll() {
            const seasonNumbers = requestableSeasons.map(function (s) { return s.seasonNumber; });
            const selectAllInput = list.querySelector('[data-select-all-seasons]');

            if (!selectAllInput) { return; }

            selectAllInput.disabled = seasonNumbers.length === 0;
            selectAllInput.checked = seasonNumbers.length > 0 && seasonNumbers.every(function (num) { return selectedSeasons.indexOf(num) !== -1; });
            selectAllInput.indeterminate = selectedSeasons.length > 0 && !selectAllInput.checked;
            const requireExplicit = getRequestModalAdvanced().requireExplicitSeasonSelection === true;
            continueBtn.disabled = seasonNumbers.length === 0 || (requireExplicit && selectedSeasons.length === 0);
        }

        list.addEventListener('change', function (event) {
            const selectAllInput = event.target.closest('[data-select-all-seasons]');

            if (selectAllInput) {
                if (selectAllInput.checked) {
                    ctx.selectedSeasons.length = 0;
                    requestableSeasons.forEach(function (s) { ctx.selectedSeasons.push(s.seasonNumber); });
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
        const ctx = {
            selectedSeasons: []
        };
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

    function renderQualityModalShell(is4k) {
        const title = is4k ? 'Choose 4K quality profile' : 'Choose quality profile';

        return `
            <div class="bst-quality-wrapper">
                <div class="bst-quality-backdrop"></div>
                <div class="bst-quality-panel" role="dialog" aria-modal="true" aria-labelledby="bst-quality-title">
                    <div class="bst-quality-header">
                        <h3 id="bst-quality-title">${title}</h3>
                        <button type="button" class="bst-quality-close" aria-label="Close">${CLOSE_ICON}</button>
                    </div>
                    <div class="bst-quality-list">
                        <div class="bst-quality-loading">Loading profiles…</div>
                    </div>
                    <div class="bst-quality-footer" hidden>
                        <div class="bst-root-folder-field" hidden>
                            <label for="bst-root-folder">Root folder</label>
                            <select id="bst-root-folder" class="bst-root-folder-select"></select>
                        </div>
                        <button type="button" class="bst-quality-continue" disabled>${is4k ? 'Request 4K' : 'Request'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderQualityOptions(options) {
        const defaultOption = options.find(function (opt) { return opt.isDefault && opt.isDefaultProfile; });
        const orderedOptions = defaultOption ? [defaultOption].concat(options.filter(function (opt) { return opt !== defaultOption; })) : options;

        return orderedOptions.map(function (opt) {
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
                <label class="bst-quality-option">
                    <input type="radio" class="bst-quality-radio" name="bst-quality-profile"${opt === defaultOption ? ' checked' : ''}
                        data-server-id="${opt.serverId}" data-profile-id="${opt.profileId}" />
                    <span>${label}${opt === defaultOption ? ' (Default)' : ''}${subHtml}</span>
                </label>
            `;
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

        // Hide shell unless profile choice/error needs to be shown
        closeQualityModal();
        document.body.insertAdjacentHTML('beforeend', renderQualityModalShell(is4k));
        activeQualityRoot = document.body.lastElementChild;
        activeQualityRoot.style.display = 'none';
        const list = activeQualityRoot.querySelector('.bst-quality-list');
        const footer = activeQualityRoot.querySelector('.bst-quality-footer');
        const requestBtn = footer.querySelector('.bst-quality-continue');
        const rootFolderField = footer.querySelector('.bst-root-folder-field');
        const rootFolderSelect = footer.querySelector('.bst-root-folder-select');
        activeQualityRoot.querySelector('.bst-quality-backdrop').addEventListener('click', closeQualityModal);
        activeQualityRoot.querySelector('.bst-quality-close').addEventListener('click', closeQualityModal);

        function finishRequest() {
            if (list.isConnected) {
                closeQualityModal();
            }

            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }

        function failRequest(message) {
            if (!list || !activeQualityRoot || !list.isConnected) {
                notifyUser(message || 'Request failed');
                return;
            }

            list.innerHTML = `<div class="bst-quality-empty">${escapeHtml(message || 'Request failed')}</div>`;
            footer.hidden = true;
            activeQualityRoot.style.display = '';
        }

        ApiClient.ajax({ url: ApiClient.getUrl('SeerrFin/request-options/' + mediaType), type: 'GET', dataType: 'json' }).then(function (data) {
            if (!activeQualityRoot || !list.isConnected) { return; }

            const rawOptions = (data && (data.options || data.Options)) || [];
            const payload = {
                options: (Array.isArray(rawOptions) ? rawOptions : []).map(function (opt) {
                    if (!opt) { return null; }

                    return {
                        serverId: opt.serverId != null ? opt.serverId : opt.ServerId,
                        serverName: opt.serverName || opt.ServerName || '',
                        profileId: opt.profileId != null ? opt.profileId : opt.ProfileId,
                        profileName: opt.profileName || opt.ProfileName || '',
                        rootFolder: opt.rootFolder || opt.RootFolder || '',
                        rootFolders: opt.rootFolders || opt.RootFolders || [],
                        is4k: !!(opt.is4k != null ? opt.is4k : opt.Is4k),
                        isDefault: !!(opt.isDefault != null ? opt.isDefault : opt.IsDefault),
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
                notifyUser(is4k ?
                    'You do not have permission to make 4K requests.' :
                    (mediaType === 'tv' ? 'You do not have permission to make series requests.' : 'You do not have permission to make movie requests.'));
                return;
            }

            if (!payload.canRequestAdvanced || !payload.options.length) {
                list.innerHTML = `<div class="bst-quality-loading">Submitting request…</div>`;
                submitRequest(mediaId, mediaType, { is4k: is4k, seasons: selectedSeasons }, finishRequest, failRequest).catch(function () {});
                return;
            }

            const filteredOptions = payload.options.filter(function (opt) { return !!opt.is4k === is4k; });

            if (!filteredOptions.length) {
                failRequest(is4k ? 'No 4K quality profiles available.' : 'No quality profiles available.');
                return;
            }

            if (filteredOptions.length === 1) {
                const option = filteredOptions[0];
                list.innerHTML = `<div class="bst-quality-loading">Submitting request…</div>`;
                submitRequest(mediaId, mediaType, {
                    serverId: option.serverId,
                    profileId: option.profileId,
                    rootFolder: option.rootFolder,
                    is4k: option.is4k,
                    seasons: selectedSeasons
                }, finishRequest, failRequest).catch(function () {});
                return;
            }

            list.innerHTML = renderQualityOptions(filteredOptions);
            list.setAttribute('role', 'radiogroup');
            list.setAttribute('aria-labelledby', 'bst-quality-title');
            footer.hidden = false;
            activeQualityRoot.style.display = '';
            let selectedOption = null;

            function updateSelection() {
                const selected = list.querySelector('.bst-quality-radio:checked');
                const option = selected && filteredOptions.find(function (opt) {
                    return String(opt.serverId) === selected.dataset.serverId && String(opt.profileId) === selected.dataset.profileId;
                });
                const previousFolder = option && selectedOption && option.serverId === selectedOption.serverId ?
                    rootFolderSelect.value : option && option.rootFolder;
                selectedOption = option;
                rootFolderField.hidden = !getRequestModalAdvanced().showRootFolderSelector || !option || !option.rootFolders.length;
                rootFolderSelect.replaceChildren();

                if (!rootFolderField.hidden) {
                    option.rootFolders.forEach(function (path) { rootFolderSelect.add(new Option(path, path)); });
                    rootFolderSelect.value = previousFolder || '';

                    if (!rootFolderSelect.value) {
                        rootFolderSelect.add(new Option('Choose a root folder', '', true, true), 0);
                    }
                }

                updateRequestButton();
            }

            function updateRequestButton() {
                requestBtn.disabled = !selectedOption || (!rootFolderField.hidden && !rootFolderSelect.value);
            }

            updateSelection();
            list.addEventListener('change', updateSelection);
            rootFolderSelect.addEventListener('change', updateRequestButton);

            requestBtn.addEventListener('click', function () {
                if (!selectedOption || requestBtn.disabled) {
                    return;
                }

                requestBtn.disabled = true;
                rootFolderSelect.disabled = true;
                list.innerHTML = `<div class="bst-quality-loading">Submitting request…</div>`;
                submitRequest(mediaId, mediaType, {
                    serverId: selectedOption.serverId,
                    profileId: selectedOption.profileId,
                    rootFolder: rootFolderField.hidden ? selectedOption.rootFolder : rootFolderSelect.value,
                    is4k: selectedOption.is4k,
                    seasons: selectedSeasons
                }, finishRequest, failRequest).catch(function () {});
            });
            (list.querySelector('.bst-quality-radio:checked') || list.querySelector('.bst-quality-radio')).focus();
        }).catch(function (err) {
            log.error('profiles load failed', err);
            failRequest('Failed to load quality profiles.');
        });
    }

    function renderCast(cast) {
        if (!cast.length) { return; }

        const cardsHtml = cast.map(function (person) {
            const imgSrc = person.profile_path ?
                tmdbImage(person.profile_path, 'w185') :
                `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect fill="#333" width="128" height="128"/></svg>')}`;

            return `
                <a class="bst-cast-card" href="https://www.themoviedb.org/person/${person.id}" target="_blank" rel="noopener noreferrer">
                    <div class="bst-cast-avatar">
                        <img alt="${escapeHtml(person.name)}" src="${imgSrc}" />
                    </div>
                    <span class="bst-cast-name">${escapeHtml(person.name)}</span>
                    <span class="bst-cast-role">${escapeHtml(person.role)}</span>
                </a>
            `;
        }).join('');

        return `
            <div class="bst-cast-section">
                <div class="bst-cast-scroll">${cardsHtml}</div>
            </div>
        `;
    }

    function renderDetailsRatings(data) {
        const entries = getRatingEntries(data.voteAverage ?? data.vote_average, data.voteCount ?? data.vote_count,
            data.externalRatings, data.ratingSources, data);

        const parts = entries.map(function (rating) {
            const votes = Number(rating.votes);
            return `<div class="bst-rating" aria-label="${rating.label} rating ${rating.text}">
                <img src="${rating.logo}" alt="${rating.label}"><span class="bst-meta-emphasis">${rating.text}</span>
                ${Number.isFinite(votes) && votes > 0 ? `<span class="bst-vote-muted">(${votes.toLocaleString()})</span>` : ''}
            </div>`;
        });
        const year = (data.releaseDate || data.firstAirDate || '').substring(0, 4);

        if (year) parts.push(`<span class="bst-meta-emphasis">${escapeHtml(year)}</span>`);

        return parts.join('<span class="bst-dot">•</span>');
    }

    function renderDetails(data, mediaId, mediaType) {
        const title = data.title || data.name || 'Details';
        const overview = data.overview || '';
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
        // The play button takes over the "Available" wording, so the disabled Available button is dropped.
        // Other disabled states (Pending, Processing) still carry info and stay.
        const showPlay = !!data.jellyfinItemId;
        const hideRequest = showPlay && requestState.requested && requestState.label === 'Available';
        const hideRequest4k = showPlay && request4kState.requested && request4kState.label === 'Available';
        const playLabel = (hideRequest || hideRequest4k) ? 'Available' : 'Partially available';

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
                                            <div class="bst-hero-meta" data-ratings-slot>${renderDetailsRatings(data)}</div>
                                        </div>
                                    </div>
                                    <div class="bst-content">
                                        <div class="bst-actions-row">
                                            <div class="bst-actions-left">
                                                ${showPlay
                                                    ? `<button type="button" class="bst-btn-play" data-action="play" data-jellyfin-item-id="${escapeHtml(String(data.jellyfinItemId))}">${playLabel}</button>`
                                                    : ''}
                                                ${hideRequest
                                                    ? ''
                                                    : `<button type="button" class="bst-btn-request" data-action="request"${requestState.requested ? ' disabled' : ''}>${escapeHtml(requestState.label)}</button>`}
                                                ${getRequestModalAdvanced().showRequest4kButton !== false && !hideRequest4k
                                                    ? `<button type="button" class="bst-btn-request-4k" data-action="request-4k"${request4kState.requested ? ' disabled' : ''}>${escapeHtml(request4kState.label)}</button>`
                                                    : ''}
                                                <button type="button" class="bst-btn-watchlist" data-action="watchlist" aria-pressed="false" aria-label="Loading watchlist…" title="Loading watchlist…" disabled><span class="material-icons" aria-hidden="true">add</span></button>
                                                ${trailerKey
                                                    ? `<button type="button" class="bst-btn-trailer" data-action="trailer" data-trailer-key="${escapeHtml(trailerKey)}" aria-label="Trailer" title="Trailer"><span class="material-icons" aria-hidden="true">movie</span></button>`
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
                                                            </a>
                                                        ` : ''}
                                                        ${imdbId ? `
                                                            <a class="bst-external-link imdb" href="https://www.imdb.com/title/${imdbId}"
                                                                target="_blank" rel="noopener noreferrer" title="View on IMDb" style="animation-delay:120ms">
                                                                ${IMDB_ICON}
                                                            </a>
                                                        ` : ''}
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                        ${cast.length ? renderCast(cast) : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
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

        const watchlistBtn = root.querySelector('[data-action="watchlist"]');
        const watchlistUserId = ApiClient.getCurrentUserId();

        if (data.ratingSources.some(function (source) { return source !== 'tmdb'; })) {
            fetchRatings(mediaId, mediaType).then(function (ratings) {
                if (!root.isConnected || watchlistUserId !== ApiClient.getCurrentUserId()) return;

                data.externalRatings = ratings;
                root.querySelector('[data-ratings-slot]').innerHTML = renderDetailsRatings(data);
            });
        }

        let watchlisted = false;
        let watchlistLoaded = false;

        function updateWatchlistButton(result) {
            if (!root.isConnected || watchlistUserId !== ApiClient.getCurrentUserId()) return;

            watchlisted = result.watchlisted === true;
            watchlistLoaded = true;
            watchlistBtn.setAttribute('aria-pressed', String(watchlisted));
            watchlistBtn.querySelector('.material-icons').textContent = watchlisted ? 'check' : 'add';
            watchlistBtn.setAttribute('aria-label', watchlisted ? 'Remove from watchlist' : 'Add to watchlist');
            watchlistBtn.title = watchlistBtn.getAttribute('aria-label');
            watchlistBtn.disabled = false;
        }

        function loadWatchlistButton() {
            if (!window.seerrFinWatchlist) {
                watchlistBtn.setAttribute('aria-label', 'Watchlist unavailable');
                watchlistBtn.title = 'Watchlist unavailable';
                return;
            }

            window.seerrFinWatchlist.get(mediaId, mediaType).then(updateWatchlistButton).catch(function () {
                if (!root.isConnected || watchlistUserId !== ApiClient.getCurrentUserId()) return;

                watchlistBtn.setAttribute('aria-label', 'Retry watchlist');
                watchlistBtn.title = 'Retry watchlist';
                watchlistBtn.disabled = false;
            });
        }

        watchlistBtn.addEventListener('click', function () {
            if (watchlistUserId !== ApiClient.getCurrentUserId()) return;

            watchlistBtn.disabled = true;

            if (!watchlistLoaded) {
                loadWatchlistButton();
                return;
            }

            watchlistBtn.setAttribute('aria-label', watchlisted ? 'Removing…' : 'Adding…');
            watchlistBtn.title = watchlistBtn.getAttribute('aria-label');
            window.seerrFinWatchlist.set(mediaId, mediaType, !watchlisted).then(updateWatchlistButton).catch(function (error) {
                if (!root.isConnected || watchlistUserId !== ApiClient.getCurrentUserId()) return;

                updateWatchlistButton({ watchlisted: watchlisted });
                notifyUser(error?.responseJSON?.message || 'Unable to update watchlist. Please try again.');
            });
        });
        loadWatchlistButton();
        const requestBtn = root.querySelector('[data-action="request"]');

        if (requestBtn && !requestBtn.disabled) {
            requestBtn.addEventListener('click', function () { openQualityModal(mediaId, mediaType, title); });
        }

        const request4kBtn = root.querySelector('[data-action="request-4k"]');

        if (request4kBtn && !request4kBtn.disabled) {
            request4kBtn.addEventListener('click', function () { openQualityModal(mediaId, mediaType, title, undefined, true); });
        }

        const playBtn = root.querySelector('[data-action="play"]');

        if (playBtn) {
            playBtn.addEventListener('click', function () { navigateToJellyfinItem(playBtn.getAttribute('data-jellyfin-item-id')); });
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
            </div>
        `;
    }

    function openDetailsModal(mediaId, mediaType) {
        closeDetailsModal();
        log.info('opening details modal for ' + mediaType + '/' + mediaId);
        document.body.insertAdjacentHTML('beforeend', renderDetailsLoading());
        activeDetailsRoot = document.body.lastElementChild;
        document.body.style.overflow = 'hidden';
        const loadingRoot = activeDetailsRoot;
        const userId = ApiClient.getCurrentUserId();

        loadModalDetails(mediaId, mediaType).then(function (data) {
            if (activeDetailsRoot !== loadingRoot || !loadingRoot.isConnected || ApiClient.getCurrentUserId() !== userId) return;

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
            if (activeDetailsRoot !== loadingRoot || !loadingRoot.isConnected || ApiClient.getCurrentUserId() !== userId) return;

            log.error('details modal failed for ' + mediaType + '/' + mediaId, err);
            closeDetailsModal();
            Dashboard.alert('Failed to load details');
        });
    }

    window.seerrFinModal = {
        open: openDetailsModal,
        close: closeDetailsModal,
        openQualityPicker: openQualityModal,
        fetchRatings: fetchRatings,
        getRatingSources: getRatingSources,
        getRatingEntries: getRatingEntries
    };
})();
