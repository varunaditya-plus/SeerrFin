'use strict';

(function () {
    if (window.seerrFinI18n) {
        return;
    }

    const SUPPORTED_LANGUAGES = Object.freeze({
        en: 'English',
        fr: 'Français'
    });

    const FRENCH = Object.freeze({
        'Access Key for Seerr which you can get by going to Seerr → Settings → API Key': 'Clé d’accès Seerr, disponible dans Seerr → Paramètres → Clé API',
        'Add Seerr movie/tv show results to Jellyfin search results to let you request specific content from Seerr.': 'Ajoute les films et séries de Seerr aux résultats de recherche Jellyfin afin de pouvoir les demander directement.',
        'Add Seerr results in Search': 'Ajouter les résultats Seerr à la recherche',
        'Advanced': 'Avancé',
        'Advanced settings (this can break stuff)': 'Paramètres avancés (une mauvaise configuration peut causer des problèmes)',
        'Allow season 0 (specials) in the TV season picker.': 'Autoriser la saison 0 (épisodes spéciaux) dans le sélecteur de saisons.',
        'Already requested': 'Déjà demandé',
        'Already requested mode': 'Gestion des éléments déjà demandés',
        'Already requested scope': 'Portée des éléments déjà demandés',
        'Anime discover path': 'Chemin de découverte des animés',
        'Anime series': 'Séries animées',
        'Any media info': 'Toute information de média',
        'Apply': 'Appliquer',
        'Apply language filter': 'Appliquer le filtre de langue',
        'Approved': 'Approuvé',
        'All': 'Tous',
        'Auto-refresh interval (seconds)': 'Intervalle d’actualisation automatique (secondes)',
        'Auto-skip': 'Ignorer automatiquement',
        'Available': 'Disponible',
        'Available only': 'Disponibles uniquement',
        'Back': 'Retour',
        'Backdrop batch concurrency': 'Requêtes d’arrière-plans simultanées',
        'Backdrop image size': 'Taille des images d’arrière-plan',
        'Backdrop language filter': 'Filtre de langue des arrière-plans',
        'Blocklisted': 'Sur liste noire',
        'Browse by genre': 'Parcourir par genre',
        'Browse by network': 'Parcourir par chaîne',
        'Browse by streaming service': 'Parcourir par service de diffusion',
        'Browse by studio': 'Parcourir par studio',
        'Bust asset cache on every page load.': 'Invalider le cache des ressources à chaque chargement de page.',
        'Bulk request failed.': 'Échec de la demande groupée.',
        'Cache / developer': 'Cache / développement',
        'Cache timeout (seconds)': 'Durée du cache (secondes)',
        'Cancel': 'Annuler',
        'Carousel': 'Carrousel',
        'Center focus on scrollers': 'Centrer l’élément sélectionné dans les carrousels',
        'Checking for existing requests…': 'Vérification des demandes existantes…',
        'Checking selections…': 'Vérification de la sélection…',
        'Choose 4K quality profile': 'Choisir un profil de qualité 4K',
        'Choose a single Radarr profile for every selected movie.': 'Choisir un seul profil Radarr pour tous les films sélectionnés.',
        'Choose quality profile': 'Choisir un profil de qualité',
        'Close': 'Fermer',
        'Color 1 (shadows)': 'Couleur 1 (ombres)',
        'Color 2 (highlights)': 'Couleur 2 (hautes lumières)',
        'Comma-separated ISO codes.': 'Codes ISO séparés par des virgules.',
        'Coming Soon': 'Bientôt disponible',
        'Community rating': 'Note de la communauté',
        'Completed': 'Terminé',
        'Configurations': 'Configurations',
        'Continue': 'Continuer',
        'Could not check existing requests.': 'Impossible de vérifier les demandes existantes.',
        'Could not load request options.': 'Impossible de charger les options de demande.',
        'Could not load requests. Check Seerr settings.': 'Impossible de charger les demandes. Vérifiez les paramètres Seerr.',
        'Could not sync Letterboxd watchlist.': 'Impossible de synchroniser la liste de suivi Letterboxd.',
        'Count season 0 episodes when calculating series download progress.': 'Compter les épisodes de la saison 0 dans la progression du téléchargement des séries.',
        'Country': 'Pays',
        'Custom label aliases merged over built-in JustWatch-to-Radarr mappings.': 'Alias personnalisés ajoutés aux correspondances JustWatch vers Radarr intégrées.',
        'Custom Tab': 'Onglet personnalisé',
        'Custom Tabs': 'Onglets personnalisés',
        'Customize': 'Personnaliser',
        'Default': 'Par défaut',
        'Declined': 'Refusé',
        'Deleted': 'Supprimé',
        'Default bulk quality mode': 'Mode de qualité par défaut pour les demandes groupées',
        'Default quality strategy when bulk-requesting from Letterboxd.': 'Stratégie de qualité par défaut pour les demandes groupées depuis Letterboxd.',
        'Dependencies': 'Dépendances',
        'Details': 'Détails',
        'Developer mode': 'Mode développeur',
        'Digital': 'Numérique',
        'Directly request TMDB images from browser (no cache, open API key)': 'Charger les images TMDB directement depuis le navigateur (sans cache, clé API exposée)',
        'Director': 'Réalisation',
        'Discovery': 'Découverte',
        'Display settings': 'Paramètres d’affichage',
        'Done': 'Terminé',
        'Downloaded (Monitored)': 'Téléchargé (surveillé)',
        'Downloaded (Unmonitored)': 'Téléchargé (non surveillé)',
        'Downloaded progress is active': 'Considérer la progression téléchargée comme active',
        'Duotone filter': 'Filtre bichromie',
        'ElegantFin fixes': 'Correctifs ElegantFin',
        'Enable': 'Activer',
        'Enable Letterboxd tab': 'Activer l’onglet Letterboxd',
        'Enable Movies tab': 'Activer l’onglet Films',
        'Enable Requests tab': 'Activer l’onglet Demandes',
        'Enable TV Shows tab': 'Activer l’onglet Séries',
        'Enable hover actions and card interactivity on the Requests tab.': 'Activer les actions au survol et l’interactivité des cartes dans l’onglet Demandes.',
        'Enable hover actions on Letterboxd watchlist cards.': 'Activer les actions au survol des cartes de la liste de suivi Letterboxd.',
        'Ends at': 'Se termine à',
        'English': 'English',
        'Enlarge the centered card on browse tab carousels.': 'Agrandir la carte centrée dans les carrousels de navigation.',
        'Enlarge the centered card on home discover rows.': 'Agrandir la carte centrée dans les rangées de découverte de l’accueil.',
        'Enter a valid Letterboxd username.': 'Saisissez un nom d’utilisateur Letterboxd valide.',
        'Exclude adult movies/shows from discovery rows (porn).': 'Exclure les films et séries pour adultes des rangées de découverte.',
        'External Seerr URL': 'URL Seerr externe',
        'Failed': 'Échec',
        'Failed to find content': 'Contenu introuvable',
        'Failed to load details': 'Échec du chargement des détails',
        'Failed to load discovery rows. Check Seerr settings and that your Jellyfin user is linked in Seerr.': 'Échec du chargement des rangées de découverte. Vérifiez les paramètres Seerr et que votre compte Jellyfin est lié dans Seerr.',
        'Failed to load items.': 'Échec du chargement des éléments.',
        'Failed to load quality profiles.': 'Échec du chargement des profils de qualité.',
        'Failed to load seasons.': 'Échec du chargement des saisons.',
        'Fallback to default profile': 'Revenir au profil par défaut',
        'Fallback to original image URL': 'Revenir à l’URL d’image d’origine',
        'Favorites': 'Favoris',
        'Fetch size': 'Taille de récupération',
        'File transformation': 'Transformation de fichiers',
        'Filter discovery carousels by the preferred language from Seerr settings.': 'Filtrer les carrousels de découverte selon la langue préférée définie dans Seerr.',
        'Filter movies/tv shows by release type. Leave all unselected to include all of them. (Needs a TMDB API key)': 'Filtrer les films et séries par type de sortie. Ne rien sélectionner pour tous les inclure. (Nécessite une clé API TMDB)',
        'First': 'Premier',
        'Focus scale on browse carousels': 'Agrandissement de la sélection dans les carrousels',
        'Focus scale on discover rows': 'Agrandissement de la sélection dans les rangées de découverte',
        'Genre backdrop mode': 'Mode d’arrière-plan des genres',
        'Genre box background': 'Arrière-plan des genres',
        'Get an API key': 'Obtenir une clé API',
        'Get watchlist': 'Récupérer la liste de suivi',
        'Gotten:': 'Récupérés :',
        'Grid page size': 'Taille des pages de grille',
        'HTTP timeout (seconds)': 'Délai HTTP (secondes)',
        'Help': 'Aide',
        'Hide adult content': 'Masquer le contenu pour adultes',
        'Hide available in library': 'Masquer le contenu disponible dans la médiathèque',
        'Hide movies/shows that already have been requested through Seerr.': 'Masquer les films et séries déjà demandés dans Seerr.',
        'Hide movies/shows that are "Available" or "Partially Available".': 'Masquer les films et séries « Disponibles » ou « Partiellement disponibles ».',
        'Hide requested media': 'Masquer le contenu demandé',
        'Hide unwanted content': 'Masquer le contenu indésirable',
        'Highest available': 'Meilleure qualité disponible',
        'Highest quality for each': 'Meilleure qualité pour chaque film',
        'Highest released quality:': 'Meilleure qualité publiée :',
        'Home': 'Accueil',
        'How long cached TMDB images are kept before refetch.': 'Durée de conservation des images TMDB en cache avant leur actualisation.',
        'How many TMDB backdrop fetches run in parallel.': 'Nombre d’arrière-plans TMDB récupérés en parallèle.',
        'How many requests to fetch from Seerr per API call.': 'Nombre de demandes récupérées depuis Seerr par appel API.',
        'How many times to retry binding row scroll listeners.': 'Nombre de tentatives pour associer les gestionnaires de défilement.',
        'How much of the sync progress bar reflects page fetching.': 'Part de la barre de progression correspondant à la récupération des pages.',
        'How often the Requests tab will be reloaded while it is open. Set to 0 to disable automatic refreshing.': 'Fréquence d’actualisation de l’onglet Demandes lorsqu’il est ouvert. Utilisez 0 pour désactiver l’actualisation automatique.',
        'How to handle movies already requested during bulk request.': 'Définit comment gérer les films déjà demandés lors d’une demande groupée.',
        'ID:': 'ID :',
        'Include already requested movies in this batch.': 'Inclure les films déjà demandés dans ce lot.',
        'Include partially available titles in the Processing filter.': 'Inclure les titres partiellement disponibles dans le filtre En traitement.',
        'Include partials in Processing filter': 'Inclure les disponibilités partielles dans le filtre En traitement',
        'Include specials (season 0)': 'Inclure les épisodes spéciaux (saison 0)',
        'Include specials in series progress': 'Inclure les épisodes spéciaux dans la progression des séries',
        'Interactive Letterboxd cards': 'Cartes Letterboxd interactives',
        'Interactive request cards': 'Cartes de demandes interactives',
        'Internal URL used by the server (e.g. http://localhost:5055)': 'URL interne utilisée par le serveur (p. ex. http://localhost:5055)',
        'Items loaded per page in grid views.': 'Nombre d’éléments chargés par page dans les grilles.',
        'Items per row': 'Éléments par rangée',
        'JustWatch country code for quality lookups.': 'Code pays JustWatch utilisé pour rechercher les qualités.',
        'JustWatch language code for quality lookups.': 'Code de langue JustWatch utilisé pour rechercher les qualités.',
        'Keep the focused card centered while scrolling.': 'Garder la carte sélectionnée centrée pendant le défilement.',
        'Key for Radarr which you can get from Radarr → Settings → General → Security → API Key': 'Clé Radarr disponible dans Radarr → Paramètres → Général → Sécurité → Clé API',
        'Key for Sonarr which you can get from Sonarr → Settings → General → Security → API Key': 'Clé Sonarr disponible dans Sonarr → Paramètres → Général → Sécurité → Clé API',
        'Language': 'Langue',
        'Language:': 'Langue :',
        'Last synced:': 'Dernière synchronisation :',
        'Less items means carousels load faster.': 'Moins d’éléments accélère le chargement des carrousels.',
        'Letterboxd username': 'Nom d’utilisateur Letterboxd',
        'Letterboxd Watchlist': 'Liste de suivi Letterboxd',
        'Letterboxd tab name': 'Nom de l’onglet Letterboxd',
        'Load more': 'Charger plus',
        'Load more items when scrolling near the end of a row.': 'Charger plus d’éléments à l’approche de la fin d’une rangée.',
        'Loading': 'Chargement',
        'Loading...': 'Chargement…',
        'Loading profiles…': 'Chargement des profils…',
        'Loading seasons…': 'Chargement des saisons…',
        'Loading watchlist…': 'Chargement de la liste de suivi…',
        'Max JustWatch results to consider per title.': 'Nombre maximal de résultats JustWatch examinés par titre.',
        'Max Seerr pages fetched for grid views.': 'Nombre maximal de pages Seerr récupérées pour les grilles.',
        'Max Seerr pages fetched per horizontal carousel row.': 'Nombre maximal de pages Seerr récupérées par carrousel horizontal.',
        'Max image cache entries': 'Nombre maximal d’images en cache',
        'Maximum carousel length': 'Longueur maximale des carrousels',
        'Maximum grid length': 'Longueur maximale des grilles',
        'Maximum number of images stored in the disk cache.': 'Nombre maximal d’images conservées dans le cache disque.',
        'Missing (Monitored)': 'Manquant (surveillé)',
        'Missing (Unmonitored)': 'Manquant (non surveillé)',
        'Most common': 'Qualité la plus courante',
        'Most common quality for each': 'Qualité la plus courante pour chaque film',
        'Most common quality:': 'Qualité la plus courante :',
        'Movie': 'Film',
        'Movies': 'Films',
        'Movies tab name': 'Nom de l’onglet Films',
        'Native carousels': 'Carrousels natifs',
        'Native grid pages': 'Grilles natives',
        'Native search results': 'Résultats de recherche natifs',
        'Name': 'Nom',
        'Never': 'Jamais',
        'Next': 'Suivant',
        'No items to show': 'Aucun élément à afficher',
        'No movies left to request.': 'Il ne reste aucun film à demander.',
        'No quality profiles available.': 'Aucun profil de qualité disponible.',
        'No requests found.': 'Aucune demande trouvée.',
        'No seasons available.': 'Aucune saison disponible.',
        'Open in Jellyfin': 'Ouvrir dans Jellyfin',
        'Open in Radarr': 'Ouvrir dans Radarr',
        'Open in Seerr': 'Ouvrir dans Seerr',
        'Open in Sonarr': 'Ouvrir dans Sonarr',
        'Open request modal': 'Ouvrir la fenêtre de demande',
        'Optional, but recommended. This loads movie/tv details directly, meaning data in modals will load faster. Requesting still uses Seerr.': 'Facultatif, mais recommandé. Charge directement les détails des films et séries afin d’accélérer l’affichage des fenêtres. Les demandes utilisent toujours Seerr.',
        'Overview': 'Vue d’ensemble',
        'Page size': 'Taille de page',
        'Partially Available': 'Partiellement disponible',
        'Pending': 'En attente',
        'Pending Approval': 'En attente d’approbation',
        'Physical': 'Support physique',
        'Pick a random or first backdrop for genre boxes.': 'Choisir le premier arrière-plan ou un arrière-plan aléatoire pour les genres.',
        'Pixels from row edge before loading the next page.': 'Distance du bord de la rangée avant de charger la page suivante.',
        'Plugin cards are not ready yet.': 'Les cartes du plugin ne sont pas encore prêtes.',
        'Popular movies': 'Films populaires',
        'Popular shows': 'Séries populaires',
        'Poster': 'Affiche',
        'Poster Card': 'Carte avec affiche',
        'Poster image size': 'Taille des affiches',
        'Poster thumbnails': 'Miniatures en portrait',
        'Prefer 4K server for Ultra-HD': 'Préférer le serveur 4K pour l’Ultra HD',
        'Prefer original language images': 'Préférer les images dans la langue d’origine',
        'Prefer original-language backdrops over filtered languages.': 'Préférer les arrière-plans dans la langue d’origine aux langues filtrées.',
        'Preferred languages': 'Langues préférées',
        'Premiere': 'Première',
        'Previous': 'Précédent',
        'Processing': 'En traitement',
        'Profile:': 'Profil :',
        'Prompt': 'Demander',
        'Queued': 'Dans la file d’attente',
        'Public Letterboxd watchlists only. Enter your username, get watchlist, select movies, then request them in bulk.': 'Seules les listes de suivi Letterboxd publiques sont prises en charge. Saisissez votre nom d’utilisateur, récupérez la liste, sélectionnez des films, puis demandez-les en lot.',
        'Quality alias JSON (optional)': 'Alias de qualité JSON (facultatif)',
        'Quality recommendations': 'Recommandations de qualité',
        'Radarr / Sonarr progress': 'Progression Radarr / Sonarr',
        'Radarr API Key': 'Clé API Radarr',
        'Radarr URL': 'URL Radarr',
        'Radarr/Sonarr configuration for download progress on Requests page': 'Configuration Radarr / Sonarr pour afficher la progression des téléchargements dans la page Demandes',
        'Random': 'Aléatoire',
        'Rating:': 'Classification :',
        'Refresh watchlist': 'Actualiser la liste de suivi',
        'Refresh when returning to the page': 'Actualiser au retour sur la page',
        'Refresh when switching to Requests': 'Actualiser en ouvrant Demandes',
        'Regex used to validate Letterboxd usernames before sync.': 'Expression régulière utilisée pour valider les noms d’utilisateur Letterboxd avant la synchronisation.',
        'Region for streaming provider carousel.': 'Région utilisée pour le carrousel des services de diffusion.',
        'Release Date:': 'Date de sortie :',
        'Release date': 'Date de sortie',
        'Reload requests': 'Actualiser les demandes',
        'Reload requests when switching to the Requests tab (in Jellyfin).': 'Actualiser les demandes lors du passage à l’onglet Demandes dans Jellyfin.',
        'Reload requests when the you return to this browser tab.': 'Actualiser les demandes au retour sur cet onglet du navigateur.',
        'Request': 'Demander',
        'Request 4K': 'Demander en 4K',
        'Request all': 'Tout demander',
        'Request all anyway': 'Tout demander quand même',
        'Request details': 'Détails de la demande',
        'Request failed': 'Échec de la demande',
        'Request failed. Check logs for details.': 'Échec de la demande. Consultez les journaux pour plus de détails.',
        'Request modal': 'Fenêtre de demande',
        'Request only the remaining movies.': 'Demander uniquement les films restants.',
        'Request selected': 'Demander la sélection',
        'Request selected movies': 'Demander les films sélectionnés',
        'Requested': 'Demandé',
        'Requested by': 'Demandé par',
        'Requested seasons:': 'Saisons demandées :',
        'Requesting movies': 'Demande des films',
        'Requesting…': 'Demande en cours…',
        'Requests': 'Demandes',
        'Requests tab name': 'Nom de l’onglet Demandes',
        'Requests complete': 'Demandes terminées',
        'Requests page': 'Page des demandes',
        'Requests shown per page in the Requests tab.': 'Nombre de demandes affichées par page dans l’onglet Demandes.',
        'Require at least one season before continuing; off requests all seasons.': 'Exiger au moins une saison avant de continuer; si désactivé, toutes les saisons sont demandées.',
        'Require explicit season selection': 'Exiger la sélection explicite des saisons',
        'Route Ultra-HD matches to a 4K Radarr server when available.': 'Acheminer les correspondances Ultra HD vers un serveur Radarr 4K lorsqu’il est disponible.',
        'Row infinite scroll': 'Défilement infini des rangées',
        'Runtime:': 'Durée :',
        'Save': 'Enregistrer',
        'Scroll bind retries': 'Tentatives d’association du défilement',
        'Scroll threshold (px)': 'Seuil de défilement (px)',
        'Search': 'Recherche',
        'Search result limit': 'Limite de résultats',
        'Seerr API Key': 'Clé API Seerr',
        'Seerr API path used for the anime carousel row.': 'Chemin de l’API Seerr utilisé pour le carrousel des animés.',
        'Seerr URL': 'URL Seerr',
        'Seerr configuration': 'Configuration Seerr',
        'Seerr mapping for anime': 'Correspondance Seerr pour les animés',
        'Seerr results': 'Résultats Seerr',
        'SeerrFin configuration sections': 'Sections de configuration SeerrFin',
        'Select all': 'Tout sélectionner',
        'Select none': 'Tout désélectionner',
        'Select seasons': 'Sélectionner les saisons',
        'Select view': 'Choisir l’affichage',
        'Settings': 'Paramètres',
        'Show Request 4K button': 'Afficher le bouton Demander en 4K',
        'Show a random movie or show background behind each genre box.': 'Afficher l’arrière-plan d’un film ou d’une série choisi au hasard derrière chaque genre.',
        'Show a season picker before choosing a quality profile for TV.': 'Afficher un sélecteur de saisons avant le choix du profil de qualité d’une série.',
        'Show metadata on Letterboxd cards': 'Afficher les métadonnées sur les cartes Letterboxd',
        'Show metadata on request cards': 'Afficher les métadonnées sur les cartes de demandes',
        'Show quality recommendations in the request modal to help you choose a quality profile. (uses JustWatch for qualities)': 'Afficher des recommandations dans la fenêtre de demande pour faciliter le choix d’un profil de qualité. (Utilise JustWatch)',
        'Show streaming service logos instead of text in browse carousels.': 'Afficher les logos des services de diffusion plutôt que leur nom dans les carrousels.',
        'Show studio and network logos instead of text in browse carousels.': 'Afficher les logos des studios et des chaînes plutôt que leur nom dans les carrousels.',
        'Show the separate Request 4K button in the details modal.': 'Afficher un bouton distinct Demander en 4K dans la fenêtre de détails.',
        'Show year and status text under Letterboxd cards.': 'Afficher l’année et l’état sous les cartes Letterboxd.',
        'Show year and status text under request cards.': 'Afficher l’année et l’état sous les cartes de demandes.',
        'Single profile': 'Profil unique',
        'Skip them and continue': 'Les ignorer et continuer',
        'Skip image caching and load posters/backdrops directly from image.tmdb.org in the browser.': 'Ignorer le cache d’images et charger les affiches et arrière-plans directement depuis image.tmdb.org dans le navigateur.',
        'Some fixes to correct card sizing and spacing if you use the ElegantFin theme.': 'Correctifs de taille et d’espacement des cartes pour le thème ElegantFin.',
        'Sonarr API Key': 'Clé API Sonarr',
        'Sonarr URL': 'URL Sonarr',
        'Sort': 'Trier',
        'Specials': 'Épisodes spéciaux',
        'Split Partially Available filter': 'Séparer le filtre Partiellement disponible',
        'Streaming services logos': 'Logos des services de diffusion',
        'Studio / Network logos': 'Logos des studios / chaînes',
        'Submitting request…': 'Envoi de la demande…',
        'Sync pages progress weight (%)': 'Poids de la récupération des pages dans la progression (%)',
        'TMDB API Key': 'Clé API TMDB',
        'TMDB configuration': 'Configuration TMDB',
        'TMDB images': 'Images TMDB',
        'TMDB include_image_language value for backdrop and logo fetches.': 'Valeur TMDB include_image_language utilisée pour récupérer les arrière-plans et logos.',
        'TMDB size token for landscape backdrops (e.g. w780).': 'Code de taille TMDB pour les arrière-plans en paysage (p. ex. w780).',
        'TMDB size token for portrait posters.': 'Code de taille TMDB pour les affiches en portrait.',
        'Thumb': 'Miniature',
        'Thumb Card': 'Carte avec miniature',
        'Title': 'Titre',
        'TV season picker': 'Sélecteur de saisons',
        'TV Shows': 'Séries',
        'TV Shows tab name': 'Nom de l’onglet Séries',
        'Tab order': 'Ordre des onglets',
        'Tab order (drag to reorder)': 'Ordre des onglets (faire glisser pour réorganiser)',
        'tab': 'onglet',
        'The URL you usually use to access Seerr (defaults to Seerr URL above)': 'L’URL habituellement utilisée pour accéder à Seerr (utilise par défaut l’URL Seerr ci-dessus)',
        'Theatrical': 'Cinéma',
        'Theatrical (limited)': 'Cinéma (sortie limitée)',
        'Timeout for Letterboxd page scraping requests.': 'Délai maximal des requêtes de récupération des pages Letterboxd.',
        'Top rated movies': 'Films les mieux notés',
        'Top rated series': 'Séries les mieux notées',
        'Trailer': 'Bande-annonce',
        'Treat downloaded items as active for progress bar styling.': 'Considérer les éléments téléchargés comme actifs pour le style de la barre de progression.',
        'Trending movies this week': 'Films tendance cette semaine',
        'Trending shows this week': 'Séries tendance cette semaine',
        'Turn on the tabs you want': 'Activez les onglets souhaités',
        'Tweaks': 'Ajustements',
        'Unknown': 'Inconnu',
        'Unreleased': 'Pas encore sorti',
        'Unresolved:': 'Non résolus :',
        'Upcoming movies': 'Films à venir',
        'Upcoming release types': 'Types de sorties à venir',
        'Upcoming series': 'Séries à venir',
        'URL used by the server to reach Radarr (or you use to access it)': 'URL utilisée par le serveur pour joindre Radarr (ou celle que vous utilisez pour y accéder)',
        'URL used by the server to reach Sonarr (or you use to access it)': 'URL utilisée par le serveur pour joindre Sonarr (ou celle que vous utilisez pour y accéder)',
        'Use Jellyfin\'s default carousel styles for cards in Seerr search results.': 'Utiliser le style de cartes par défaut de Jellyfin dans les résultats de recherche Seerr.',
        'Use Jellyfin\'s default carousel styles for cards in carousels (in discovery tabs).': 'Utiliser le style de cartes par défaut de Jellyfin dans les carrousels des onglets de découverte.',
        'Use Jellyfin\'s default carousel styles for cards in grid pages.': 'Utiliser le style de cartes par défaut de Jellyfin dans les grilles.',
        'Use Seerr filters for the anime carousel to properly get anime.': 'Utiliser les filtres Seerr pour récupérer correctement les animés.',
        'Use the Watch region setting instead of the country below.': 'Utiliser la région de visionnement plutôt que le pays ci-dessous.',
        'Use one quality profile for all': 'Utiliser un seul profil de qualité pour tous',
        'Use the default Radarr profile when no quality match is found.': 'Utiliser le profil Radarr par défaut si aucune qualité correspondante n’est trouvée.',
        'Use the highest released streaming quality recommendation per movie.': 'Utiliser pour chaque film la meilleure qualité de diffusion publiée recommandée.',
        'Use the most common streaming quality recommendation per movie.': 'Utiliser pour chaque film la qualité de diffusion la plus courante recommandée.',
        'Use the source TMDB URL when image caching fails.': 'Utiliser l’URL TMDB d’origine si la mise en cache de l’image échoue.',
        'Using highest released quality for each movie': 'Utilisation de la meilleure qualité publiée pour chaque film',
        'Using most common quality for each movie': 'Utilisation de la qualité la plus courante pour chaque film',
        'Use watch region for country': 'Utiliser la région de visionnement comme pays',
        'Use portrait posters in discovery rows instead of landscape thumbnails. (Landscape thumbnails need TMDB API Key)': 'Utiliser des affiches en portrait dans les rangées de découverte plutôt que des miniatures en paysage. (Les miniatures en paysage nécessitent une clé API TMDB)',
        'Username pattern (regex)': 'Format du nom d’utilisateur (expression régulière)',
        'View on IMDb': 'Voir sur IMDb',
        'View on TMDB': 'Voir sur TMDB',
        'Waiting': 'En attente',
        'Watch region': 'Région de visionnement',
        'When on, Available filter excludes partially available titles.': 'Lorsque cette option est activée, le filtre Disponible exclut les titres partiellement disponibles.',
        'Which Seerr statuses count as already requested.': 'États Seerr considérés comme déjà demandés.',
        'You do not have permission to make 4K requests.': 'Vous n’avez pas l’autorisation d’effectuer des demandes 4K.',
        'You do not have permission to make movie requests.': 'Vous n’avez pas l’autorisation de demander des films.',
        'You do not have permission to make series requests.': 'Vous n’avez pas l’autorisation de demander des séries.'
    });

    const ROOT_SELECTOR = [
        '#seerrFinConfigurationPage',
        '[data-seerrfin-tab]',
        '[data-seerrfin-grid-view]',
        '[class*="seerrfin-"]',
        '[id^="seerrfin-"]',
        '.bst-popout-wrapper',
        '.bst-quality-wrapper',
        '.bst-modal-layout'
    ].join(',');
    const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'title', 'placeholder'];
    const USER_CONTENT_SELECTOR = [
        '.cardText',
        '.cardImageContainer[role="img"]',
        '.seerrfin-discover-card .cardImageContainer',
        '.seerrfin-discover-backdrop-image',
        '.seerrfin-discover-overlay-title',
        '.seerrfin-request-title',
        '.seerrfin-letterboxd-bulk-item-title',
        '.bst-hero-title-fallback',
        '.bst-hero-logo',
        '.bst-overview',
        '.bst-genres',
        '.bst-cast-name',
        '.bst-cast-role'
    ].join(',');
    const textSources = new WeakMap();
    const attributeSources = new WeakMap();
    let language = detectLanguage();

    function normalizeLanguage(value) {
        return String(value || '').toLowerCase().split('-')[0] === 'fr' ? 'fr' : 'en';
    }

    function detectLocale() {
        const documentLanguage = document.documentElement.getAttribute('lang') ||
            document.documentElement.getAttribute('data-culture');
        if (documentLanguage) {
            return String(documentLanguage).replace('_', '-');
        }

        const browserLanguage = navigator.language || navigator.userLanguage ||
            (navigator.languages && navigator.languages[0]);
        return String(browserLanguage || 'en-US').replace('_', '-');
    }

    function detectLanguage() {
        return normalizeLanguage(detectLocale());
    }

    function translatePattern(source) {
        let match;
        if ((match = source.match(/^Page (\d+) of (\d+)$/))) {
            return 'Page ' + match[1] + ' sur ' + match[2];
        }
        if ((match = source.match(/^(\d+) of (\d+)$/))) {
            return match[1] + ' sur ' + match[2];
        }
        if ((match = source.match(/^1-(\d+) of (\d+)$/))) {
            return '1-' + match[1] + ' sur ' + match[2];
        }
        if ((match = source.match(/^(\d+) selected$/))) {
            return match[1] + ' sélectionné' + (match[1] === '1' ? '' : 's');
        }
        if ((match = source.match(/^Season (\d+)$/))) {
            return 'Saison ' + match[1];
        }
        if ((match = source.match(/^\((\d+) episode(s?)\)$/))) {
            return '(' + match[1] + ' épisode' + (match[2] ? 's' : '') + ')';
        }
        if ((match = source.match(/^Requested: (\d+), skipped: (\d+), failed: (\d+)$/))) {
            return 'Demandés : ' + match[1] + ', ignorés : ' + match[2] + ', échoués : ' + match[3];
        }
        if ((match = source.match(/^(\d+) of (\d+) selected (movie already has a request|movies already have requests)\.$/))) {
            const plural = match[1] === '1' ? '' : 's';
            return match[1] + ' sur ' + match[2] + ' film' + plural + ' sélectionné' + plural + ' ' +
                (match[1] === '1' ? 'a déjà été demandé.' : 'ont déjà été demandés.');
        }
        if ((match = source.match(/^Request only the (\d+) remaining (movie|movies)\.$/))) {
            return 'Demander uniquement le' + (match[1] === '1' ? '' : 's') + ' ' + match[1] + ' film' + (match[1] === '1' ? '' : 's') + ' restant' + (match[1] === '1' ? '' : 's') + '.';
        }
        if ((match = source.match(/^(\d+) (movie already has|movies already have) requests$/))) {
            return match[1] + ' film' + (match[1] === '1' ? ' a' : 's ont') + ' déjà été demandé' + (match[1] === '1' ? '' : 's');
        }
        if ((match = source.match(/^Open (.+) in (Jellyfin|Radarr|Sonarr|Seerr)$/))) {
            return 'Ouvrir ' + match[1] + ' dans ' + match[2];
        }
        if ((match = source.match(/^View request details for (.+)$/))) {
            return 'Voir les détails de la demande pour ' + match[1];
        }
        if ((match = source.match(/^Profile: (.+)$/))) {
            return 'Profil : ' + match[1];
        }
        if ((match = source.match(/^(\d+)d ago$/))) {
            return 'il y a ' + match[1] + ' j';
        }
        if ((match = source.match(/^(\d+)h ago$/))) {
            return 'il y a ' + match[1] + ' h';
        }
        if ((match = source.match(/^(\d+)m ago$/))) {
            return 'il y a ' + match[1] + ' min';
        }
        if (source === 'just now') {
            return 'à l’instant';
        }
        if ((match = source.match(/^Custom Tab (\d+)$/))) {
            return 'Onglet personnalisé ' + match[1];
        }
        return source;
    }

    function t(source) {
        const value = String(source == null ? '' : source);
        if (language !== 'fr') {
            return value;
        }
        return Object.prototype.hasOwnProperty.call(FRENCH, value)
            ? FRENCH[value]
            : translatePattern(value);
    }

    function replaceTrimmed(source) {
        const leading = source.match(/^\s*/)[0];
        const trailing = source.match(/\s*$/)[0];
        const core = source.slice(leading.length, source.length - trailing.length);
        return core ? leading + t(core) + trailing : source;
    }

    function translateTextNode(node) {
        if (!textSources.has(node)) {
            textSources.set(node, node.nodeValue || '');
        }
        const source = textSources.get(node);
        const translated = language === 'en' ? source : replaceTrimmed(source);
        if (node.nodeValue !== translated) {
            node.nodeValue = translated;
        }
    }

    function translateAttributes(element) {
        if (element.closest(USER_CONTENT_SELECTOR)) {
            return;
        }
        let sources = attributeSources.get(element);
        if (!sources) {
            sources = {};
            attributeSources.set(element, sources);
        }

        TRANSLATABLE_ATTRIBUTES.forEach(function (attribute) {
            if (!element.hasAttribute(attribute)) {
                return;
            }
            if (!Object.prototype.hasOwnProperty.call(sources, attribute)) {
                sources[attribute] = element.getAttribute(attribute);
            }
            const source = sources[attribute];
            const translated = language === 'en' ? source : t(source);
            if (element.getAttribute(attribute) !== translated) {
                element.setAttribute(attribute, translated);
            }
        });
    }

    function translateTree(root) {
        if (!root) {
            return;
        }
        if (root.nodeType === Node.TEXT_NODE) {
            translateTextNode(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        translateAttributes(root);
        root.querySelectorAll('*').forEach(translateAttributes);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (parent && !parent.closest('.notranslate, script, style, ' + USER_CONTENT_SELECTOR)) {
                translateTextNode(node);
            }
        }
    }

    function translate(root) {
        root = root || document;
        if (root.nodeType === Node.ELEMENT_NODE && root.closest(ROOT_SELECTOR)) {
            translateTree(root);
            return;
        }
        if (root.querySelectorAll) {
            root.querySelectorAll(ROOT_SELECTOR).forEach(translateTree);
        }
    }

    function setLanguage(value) {
        const previousLanguage = language;
        language = normalizeLanguage(value);
        document.documentElement.setAttribute('data-seerrfin-language', language);
        translate(document);
        if (language !== previousLanguage) {
            document.dispatchEvent(new CustomEvent('seerrfinlanguagechange', { detail: { language: language } }));
        }
        return language;
    }

    window.seerrFinI18n = Object.freeze({
        getLanguage: function () { return language; },
        getLocale: detectLocale,
        getSupportedLanguages: function () { return Object.assign({}, SUPPORTED_LANGUAGES); },
        normalizeLanguage: normalizeLanguage,
        setLanguage: setLanguage,
        t: t,
        translate: translate
    });

    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes') {
                setLanguage(detectLanguage());
                return;
            }
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (node.parentElement && node.parentElement.closest(ROOT_SELECTOR)) {
                        translateTextNode(node);
                    }
                    return;
                }
                translate(node);
            });
        });
    });

    function start() {
        setLanguage(detectLanguage());
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['lang', 'data-culture'],
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
