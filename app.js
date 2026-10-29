const SUPABASE_URL = 'https://eubxxvoiudlopkimysaj.supabase.co';
// Identifiant client OAuth Google (public, non secret) : Google Cloud > API et services > Identifiants.
// Vide : le bouton « Google Agenda » explique comment le configurer.
const GOOGLE_CLIENT_ID = '741288364082-gis9o46ntlgr2ucse69ol8lkl5m48ihg.apps.googleusercontent.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Ynh4dm9pdWRsb3BraW15c2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODkwMTksImV4cCI6MjEwNzM2NTAxOX0.LUdqhs06JZ98yE2M5_oifX6is0hyGWwGnU1iWXDkTOE';

// Règles métier pures : voir logic.js (testées dans tests/logic.test.js)
const { DAYS, same, suggestProjects: suggestFrom, projectSuggestions, duplicateRow, typeSuggestions, typeNameError, moveItem,
  LABEL_COLORS, taskLabels, primaryLabel, isMeeting, sortDay, groupDay, labelNameError, parseTime,
  clientKey, doneLast, placeAt, rankPatches, dropIndex, mergeOrder, sortFolders, folderPatches,
  comingMonday, planningMonday, dayDate, weekKey, shiftWeek, weekOffset, continueList, noteSuggestions, lineActions, claudePrompt, parseClaudeReply, reviewSuggestions, monthlyRank, dueOccurrences, recurrenceLabel,
  extractMeetingLink, eventSlot, suggestProject, importPlan, parkedTasks, waitingProjects, projectTime, hoursSpent, parseOptionalHours, budgetStatus, canConsign, consignPatch, consignedTasks, consignedPending, canUnconsign, unconsignPatch, canDeleteProject, projectDeletion, deletionParts, withoutProject, withoutTask, newWeek, normalizeTask, routeOf, routeParam, buildLabel,
  normalizeUrl, parseYear, clientNameError, deleteClientBlocker, clientProjects,
  searchEntities, filterProjects, groupByClient,
  pendingCount, pendingByProject, commentCounts, commentKindPatch, finishedWithPending, parseComment, linksOf,
  initialsOf, clientProjectRows, clientWeek, clientConsigned, clientOverview, clientCards, defaultClientFilter, projectOverview,
  weekSnapshot, weekPeriods, weekTasks } = PlanningLogic;
const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = 'planning_session';
const SEEN_KEY = 'planning_changelog_seen';
const SAS_VIEW_KEY = 'planning_sas_view';
const LINKS_KEY = 'planning_show_links';
const DEFAULT_CLIENT = 'Sans client';
const DEFAULT_PROJECT = 'Sans projet';
const TASK_SELECT = '*,projects(id,name,status,clients(id,name))';
const PROJECT_SELECT = '*,clients(id,name)';

// Journal des mises à jour (skill mdui-onboarding-overlays) — une entrée par lot livré.
const CHANGELOG = [
  {
    version: '1.31.0', type: 'mineure', lot: 'Lot 31', date: '2026-10-29',
    items: [
      'Page projet dédiée : un clic sur un projet (planning, sas, archives, fiche client, recherche) ouvre sa page avec en-tête, liens rapides, quatre indicateurs et ses tâches.',
      'Tâches regroupées en À faire, Terminées et Historique (avec « Afficher les autres »), commentaires visibles et à traiter sous chaque tâche.',
      'Indicateurs : tâches à faire / terminées, temps planifié, temps passé sur l’estimé (barre) et reste sur l’estimé, qui passe en ambre « +X h » au-delà.',
      'La fenêtre du projet devient « Modifier le projet » (identité, estimation et devis, accès rapide) avec un bouton « Voir la fiche projet ».',
      'Carte du sas : bouton Ouvrir, liens rapides, tâches rangées et heures. Archives : type, année, temps passé sur estimé et bouton Ouvrir.',
    ],
  },
  {
    version: '1.30.0', type: 'mineure', lot: 'Lot 30', date: '2026-10-29',
    items: [
      'Liste des clients : recherche par nom ou site, filtre Actifs / Inactifs / Tous (Actifs par défaut) et tri par nom, dépassés d’abord, temps passé, charge de la semaine ou date de création (récents d’abord).',
      'Chaque carte client affiche ses projets en cours, ses tâches de la semaine, le temps passé sur l’estimé avec une barre (ambre au-delà de l’estimé) et une pastille « dépassé ».',
      'Un client sans projet en cours est atténué et indique l’année de son dernier projet terminé.',
    ],
  },
  {
    version: '1.29.0', type: 'mineure', lot: 'Lot 29', date: '2026-10-29',
    items: [
      'Fiche client refondue : logo, nom, site web et ancienneté en en-tête ; le formulaire passe derrière « Modifier la fiche ».',
      'Quatre indicateurs : projets en cours, temps passé sur l’estimé, projets dont l’estimé est dépassé, charge de la semaine.',
      'Projets du client : filtre En cours / Terminés / Tous, temps passé et estimé avec barre (ambre au-delà de l’estimé), devis et liens rapides, Ouvrir / Rouvrir. Les projets dépassés passent en premier.',
      'Colonne de droite : tâches du client cette semaine (à cocher comme dans le planning) et dernières tâches consignées.',
      'Les initiales des clients sans logo reprennent la première lettre de deux mots (« Maison Lumen » → ML).',
    ],
  },
  {
    version: '1.28.1', type: 'patch', lot: 'Lot 28', date: '2026-10-21',
    items: [
      'Copier pour Claude : si la copie automatique est refusée, le texte s’affiche à part, déjà sélectionné ; la zone « Réponse de Claude » reste libre.',
      'Copier pour Claude : la réponse se relit correctement même après un rechargement de la page.',
      'Suggestions : les liens collés dans la note ne deviennent plus des tâches, et « 2 hôtels » n’est plus lu comme une durée.',
    ],
  },
  {
    version: '1.28.0', type: 'mineure', lot: 'Lot 28', date: '2026-10-21',
    items: [
      'Bloc-notes : bouton « Copier pour Claude ». La note, tes projets et tes tâches sont copiés avec les consignes, à coller dans ta conversation Claude (abonnement, sans coût supplémentaire).',
      'La réponse de Claude, recollée dans la fenêtre, s’affiche dans les suggestions habituelles : tu valides chaque tâche avant de l’ajouter.',
      'Le lien de ta conversation Claude dédiée se modifie dans la fenêtre et reste mémorisé sur l’appareil.',
    ],
  },
  {
    version: '1.27.0', type: 'mineure', lot: 'Lot 27', date: '2026-10-20',
    items: [
      'Planning : une tâche cochée passe sous les tâches à faire de son conteneur ; un conteneur entièrement coché passe en bas de la journée.',
      'Décocher une tâche la remet à sa place ; toutes les tâches restent déplaçables par glisser-déposer.',
    ],
  },
  {
    version: '1.26.0', type: 'mineure', lot: 'Lot 26', date: '2026-10-21',
    items: [
      'Bloc-notes : bouton « Suggérer des tâches ». L’application lit la note et propose, projet par projet, les tâches à créer dans le sas et celles du sas à planifier.',
      'Analyse faite dans le navigateur, sans service externe ni coût : une ligne cite le client et/ou le projet (« Acme · Refonte site : maquettes, devis jeudi 2h ») ; virgules, jour et durée sont reconnus. Un projet seul sur une ligne vaut pour les lignes suivantes.',
      'Chaque suggestion se valide : case à cocher, nom, projet, heures et destination (sas ou jour) modifiables. Rien n’est créé sans « Appliquer ».',
    ],
  },
  {
    version: '1.25.0', type: 'mineure', lot: 'Lot 25', date: '2026-10-20',
    items: [
      'Bloc-notes de la semaine : une pastille sur le bord gauche déplie un volet pour noter les projets prévus avant de les placer dans le planning.',
      'Enregistrement automatique pendant la saisie (gardé sur l’appareil en cas de coupure réseau) ; une note par semaine, ‹ › pour consulter les autres.',
      'Entrée prolonge une liste à puces ou numérotée ; « Reprendre la semaine précédente » recopie la note d’avant dans une note vide.',
    ],
  },
  {
    version: '1.24.1', type: 'patch', lot: 'Lot 24', date: '2026-10-20',
    items: [
      'Commentaires d’une carte : le texte garde toute la largeur, les boutons « → note » et × apparaissent par-dessus au survol.',
      'Historique et détail d’un projet : les heures prévues sont suivies du temps passé quand il diffère.',
      'Les prochaines semaines closes comptent le temps passé des tâches terminées (heures prévues à défaut) dans leur total et le temps par client.',
      'Archives : les boutons « Rétablir » et « Supprimer » restent alignés à droite des tâches consignées.',
      '« Nouvelle Semaine » : messages accordés au nombre de tâches, tâches consignées mentionnées aussi quand des commentaires restent à traiter.',
    ],
  },
  {
    version: '1.24.0', type: 'mineure', lot: 'Lot 24', date: '2026-10-19',
    items: [
      'Archives : un bouton « Supprimer » sur chaque projet archivé et chaque tâche consignée, avec une confirmation qui détaille ce qui part.',
      'Supprimer un projet supprime aussi ses tâches (actives et archivées), leurs commentaires, ses liens et ses récurrences. Irréversible.',
      'Les semaines closes gardent leurs chiffres ; les tâches supprimées disparaissent seulement de leur détail.',
    ],
  },
  {
    version: '1.23.0', type: 'mineure', lot: 'Lot 23', date: '2026-10-19',
    items: [
      'Bouton « Consigner » sur une tâche terminée : saisis le temps réellement passé (pré-rempli avec les heures prévues), la tâche quitte le planning tout de suite pour les archives.',
      'Archives : nouvelle section « Tâches consignées » (prévu / passé, date, semaine) avec « Rétablir » tant que la semaine n’est pas close ; « Annuler » est aussi proposé juste après.',
      '« Nouvelle Semaine » compte les tâches consignées depuis la dernière clôture dans la semaine enregistrée (historique, temps par client).',
    ],
  },
  {
    version: '1.22.0', type: 'mineure', lot: 'Lot 22', date: '2026-10-19',
    items: [
      'Temps estimé d’un projet : à renseigner (facultatif) à sa création, dans le sas ou à l’ajout d’une tâche d’un nouveau projet, et modifiable dans son détail.',
      'Temps effectif : un champ « Temps passé » (facultatif) dans la modale de modification d’une tâche. Sans valeur, ses heures prévues comptent, comme avant.',
      'Sas d’attente : chaque projet affiche « effectif / estimé » avec une barre d’avancement, en ambre quand l’estimé est dépassé.',
      'Détail d’un projet : quatre chiffres (tâches, planifié, estimé, effectif).',
    ],
  },
  {
    version: '1.21.0', type: 'mineure', lot: 'Lot 21', date: '2026-10-19',
    items: [
      'Historique : un bouton en face de chaque tâche d’une semaine close la duplique dans le sas d’attente de la semaine active.',
      'La copie reprend le projet, le nom, les heures, les étiquettes et la réunion ; ni commentaires, ni récurrence. Un projet archivé est rouvert.',
    ],
  },
  {
    version: '1.20.0', type: 'mineure', lot: 'Lot 20', date: '2026-10-19',
    items: [
      'Commentaires : par défaut, ce qu’on écrit sur une carte est une simple note (sans case à cocher, jamais comptée comme non traitée).',
      'Le bouton « À traiter » à côté du champ crée au contraire un point à cocher, comme avant.',
      'Au survol d’un commentaire, « → note » / « → à traiter » change sa nature. Les commentaires existants restent « à traiter ».',
    ],
  },
  {
    version: '1.19.1', type: 'patch', lot: 'Lot 19', date: '2026-10-16',
    items: ['Import Google Agenda : une réunion par ligne sur écran large (horaire, projet et statut alignés).'],
  },
  {
    version: '1.19.0', type: 'mineure', lot: 'Lot 19', date: '2026-10-16',
    items: [
      'Bouton « Google Agenda » : importe les réunions visio de la semaine (Meet, Zoom, Teams, Webex) comme tâches « Réunion ».',
      'Projet proposé d’après les participants ou le titre ; une réunion déjà saisie au même créneau est complétée avec son lien.',
      'Un événement déjà importé n’est jamais recréé.',
    ],
  },
  {
    version: '1.18.0', type: 'mineure', lot: 'Lot 18', date: '2026-10-16',
    items: [
      'Glisser-déposer : réorganise les conteneurs client d’une journée (un trait indique l’endroit du dépôt).',
      'Glisser un conteneur sur un autre jour y déplace toutes ses tâches, à l’endroit choisi.',
      'Sas d’attente (vue Projets) : les dossiers se réordonnent par glisser-déposer.',
    ],
  },
  {
    version: '1.17.0', type: 'mineure', lot: 'Lot 17', date: '2026-10-16',
    items: [
      'Cartes : le client et le projet passent au-dessus du titre de la tâche.',
      'Les tâches d’un même client sur une journée sont rangées dans un conteneur commun.',
      'Sas d’attente : client (et type) au-dessus du nom du projet, avec le logo du client.',
    ],
  },
  {
    version: '1.16.0', type: 'mineure', lot: 'Lot 16', date: '2026-10-16',
    items: [
      'Dupliquer une tâche (icône ⧉ au survol de la carte) vers un jour de la semaine ou le sas d’attente.',
      'La copie reprend le projet, le nom, les heures, les étiquettes et la réunion ; ni commentaires, ni récurrence.',
    ],
  },
  {
    version: '1.15.1', type: 'patch', lot: 'Lot 15', date: '2026-10-16',
    items: ['Mobile : les cinq onglets (dont Réglages) tiennent sur la largeur de l’écran.'],
  },
  {
    version: '1.15.0', type: 'mineure', lot: 'Lot 15', date: '2026-10-16',
    items: [
      'Tâches récurrentes : chaque semaine, ou chaque mois (1ᵉʳ, 2ᵉ, 3ᵉ, 4ᵉ ou dernier jour donné du mois).',
      '« Nouvelle Semaine » crée les occurrences de la semaine qui commence, sans doublon ; une occurrence non faite reste sur son jour.',
      'Modifier une occurrence peut s’appliquer aux suivantes ; « Aucune » arrête la répétition. Liste des séries dans Réglages.',
    ],
  },
  {
    version: '1.14.0', type: 'mineure', lot: 'Lot 14', date: '2026-10-16',
    items: [
      'Étiquettes de tâche administrables dans Réglages (nom, teinte, ordre) : Urgent, En attente client, Réunion.',
      'Les cartes prennent la teinte de leur étiquette la plus prioritaire.',
      'Réunions : heure bien visible, bouton « Rejoindre » vers le salon de visio, tri par heure en haut du jour.',
    ],
  },
  {
    version: '1.13.0', type: 'mineure', lot: 'Lot 13', date: '2026-10-16',
    items: [
      'Nouvel onglet Réglages : types de projet par défaut (ajout, renommage, ordre, suppression).',
      'Chaque projet peut recevoir un type : les types par défaut sont proposés avant les types personnalisés.',
      'Le type s’affiche dans le sas, la fiche client et la recherche rapide.',
    ],
  },
  {
    version: '1.12.0', type: 'mineure', lot: 'Lot 12', date: '2026-10-16',
    items: [
      'Le × d’une carte du planning la renvoie dans le sas (avec « Annuler ») ; la suppression définitive se fait depuis le sas ou la modale d’édition.',
      'Archiver un projet demande désormais une confirmation.',
      'Confirmations harmonisées dans une fenêtre aux couleurs de l’application.',
      'Saisie d’une tâche : les projets du client choisi sont proposés en premier (en cours, puis terminés).',
    ],
  },
  {
    version: '1.11.1', type: 'patch', lot: 'Lot 11', date: '2026-10-12',
    items: [
      'Cartes du planning : titre sur toute la largeur (actions ✎ / × en surimpression au survol).',
      'Mobile : en-tête et onglets sans débordement (la page n’est plus dézoomée).',
      'Corrections visuelles : champ « Nouveau client », boutons de la fenêtre « Nouvelle Semaine », ordre du tutoriel.',
    ],
  },
  {
    version: '1.11.0', type: 'mineure', lot: 'Lot 11', date: '2026-10-12',
    items: [
      'Nouvel onglet Historique : une fiche par semaine close (tâches terminées, reportées, temps par client).',
      '« Nouvelle Semaine » enregistre la semaine dès qu’au moins une tâche terminée est archivée.',
      'Les semaines déjà archivées sont reprises dans l’historique (reports non connus pour celles-ci).',
    ],
  },
  {
    version: '1.10.0', type: 'mineure', lot: 'Lot 10', date: '2026-10-12',
    items: [
      'Commentaires sur chaque carte : saisie directe, à cocher une fois traités, compteur des non traités.',
      'Liens du projet (devis compris) affichés sur les cartes ; bouton « Liens » pour les masquer.',
      '« Nouvelle Semaine » prévient quand des tâches terminées ont des commentaires non traités.',
    ],
  },
  {
    version: '1.9.0', type: 'mineure', lot: 'Lot 9', date: '2026-10-12',
    items: [
      'Sas d’attente : recherche rapide d’un client ou d’un projet, avec accès direct à sa fiche.',
      'Sas d’attente : affichage par projet ou regroupé par client (choix mémorisé).',
    ],
  },
  {
    version: '1.8.0', type: 'mineure', lot: 'Lot 8', date: '2026-10-12',
    items: [
      'Nouvel onglet Clients : fiche avec logo, site web et projets attachés.',
      'Projets : année de la prestation, devis (lien) et liens d’accès rapide avec libellé.',
    ],
  },
  {
    version: '1.7.0', type: 'mineure', lot: 'Lot 7', date: '2026-10-12',
    items: [
      'Nouvelle organisation : planning et ajout de tâche à gauche (2/3), sas d’attente à droite (1/3).',
      'Barre d’onglets pour naviguer entre le planning et les archives.',
      'Icône d’onglet personnalisée.',
      'Numéro de version et identifiant de commit affichés en bas de page.',
    ],
  },
  {
    version: '1.6.0', type: 'majeure', lot: 'Lot 5', date: '2026-10-12', tour: 'onboarding-v1',
    items: [
      'Tutoriel pas-à-pas au premier lancement : ajout de tâche, planning, sas d’attente, archives.',
      'Le tutoriel peut être rejoué depuis ce journal.',
    ],
  },
  {
    version: '1.5.0', type: 'mineure', lot: 'Lot 4', date: '2026-10-12',
    items: [
      '« Nouvelle Semaine » archive les tâches terminées au lieu de les supprimer.',
      'Détail d’un projet : temps prévu, temps passé total et historique des tâches terminées.',
    ],
  },
  {
    version: '1.4.0', type: 'mineure', lot: 'Lot 3', date: '2026-10-12',
    items: [
      'Glisser un projet du sas sur un jour : ses tâches rangées y sont planifiées.',
      'Clic sur un projet du sas : détail des tâches, temps total, renommage.',
      'Tâche ajoutée dans le sas : une modale propose le projet de rangement ou la création d’un nouveau projet.',
    ],
  },
  {
    version: '1.3.0', type: 'mineure', lot: 'Lot 2', date: '2026-10-12',
    items: [
      'Glisser une tâche du planning vers le sas d’attente : elle est rangée dans le dossier de son projet.',
      'Depuis le sas, glisser une tâche sur un jour pour la replanifier.',
      'Page Archives : projets terminés, avec possibilité de les rouvrir.',
    ],
  },
  {
    version: '1.2.0', type: 'majeure', lot: 'Lot 1', date: '2026-10-12',
    items: [
      'Édition d’une tâche après sa création (client, projet, nom, heures, jour).',
      'Chaque tâche est rattachée à un projet, lui-même rattaché à un client.',
      'Sas d’attente : projets en cours sans aucune tâche cette semaine.',
    ],
  },
  { version: '1.1.0', type: 'mineure', lot: 'Lot 0', items: ['Import de tâches depuis un fichier JSON.'] },
  { version: '1.0.0', type: 'majeure', lot: 'Lot 0', items: ['Planning hebdomadaire avec glisser-déposer.'] },
];

let tasks = []; // tâches actives (planning + sas)
let history = []; // tâches terminées puis archivées par « Nouvelle Semaine » (temps passé)
let projects = [];
let clients = [];
let links = []; // liens d'accès rapide des projets (project_links)
let comments = []; // commentaires des tâches (task_comments), archivées comprises
let weeks = []; // semaines closes par « Nouvelle Semaine » (instantanés)
let projectTypes = []; // types de projet par défaut (Réglages), ordonnés par position
let labels = []; // étiquettes de tâche (Réglages), ordonnées par position = priorité visuelle
let recurrences = []; // séries de tâches récurrentes (règle + modèle)
let notes = []; // bloc-notes : une note par semaine (week_notes, Lot 25)
const openWeeks = new Set(); // fiches de semaine dépliées dans l'historique
const openComments = new Set(); // cartes dont la liste de commentaires est dépliée
const todoDrafts = new Set(); // cartes dont le prochain commentaire est « à traiter » (par défaut : une note)
let showLinks = true;
try { showLinks = localStorage.getItem(LINKS_KEY) !== 'off'; } catch { /* stockage indisponible */ }
let session = null;

// ---------- Authentification (Supabase Auth, RLS) ----------
function loadSession() {
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { session = null; }
}

function saveSession(data) {
  session = data && {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* stockage indisponible : la session reste en mémoire */ }
}

async function authRequest(grant, body) {
  const res = await fetch(`${AUTH}/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_code === 'invalid_credentials' || data.msg === 'Invalid login credentials' || data.error_description === 'Invalid login credentials'
    ? 'Email ou mot de passe incorrect.'
    : data.error_description || data.msg || `Authentification refusée (${res.status})`);
  return data;
}

async function refreshSession() {
  if (!session?.refresh_token) throw new Error('Session expirée');
  saveSession(await authRequest('refresh_token', { refresh_token: session.refresh_token }));
}

// ---------- Supabase (REST) ----------
function headers(extra) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// `keepalive` : la requête aboutit même si la page se ferme (enregistrement du bloc-notes).
async function api(table, query = '', { method = 'GET', body, prefer, keepalive = false } = {}, retried = false) {
  const res = await fetch(`${REST}/${table}${query}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : undefined),
    body: body ? JSON.stringify(body) : undefined,
    keepalive,
  });
  if (res.status === 401 && session && !retried) {
    try { await refreshSession(); } catch { setAuthed(false); throw new Error('Session expirée, reconnecte-toi.'); }
    return api(table, query, { method, body, prefer, keepalive }, true);
  }
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const db = {
  list: () => api('tasks', `?select=${TASK_SELECT}&archived_at=is.null&order=created_at.asc`),
  listHistory: () => api('tasks', '?select=*&archived_at=not.is.null&order=archived_at.desc'),
  insert: (rows) => api('tasks', `?select=${TASK_SELECT}`, { method: 'POST', body: rows, prefer: 'return=representation' }),
  update: (id, patch) => api('tasks', `?id=eq.${id}`, { method: 'PATCH', body: patch }),
  updateFull: async (id, patch) => (await api('tasks', `?id=eq.${id}&select=${TASK_SELECT}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }))[0],
  remove: (id) => api('tasks', `?id=eq.${id}`, { method: 'DELETE' }),
  listProjects: () => api('projects', `?select=${PROJECT_SELECT}&order=created_at.asc`),
  listClients: () => api('clients', '?select=*&order=name.asc'),
  listLinks: () => api('project_links', '?select=*&order=created_at.asc'),
  listComments: () => api('task_comments', '?select=*&order=created_at.asc'),
  listWeeks: () => api('weeks', '?select=*&order=closed_at.desc'),
  listTypes: () => api('project_types', '?select=*&order=position.asc'),
  listLabels: () => api('labels', '?select=*&order=position.asc'),
  listRecurrences: () => api('recurrences', '?select=*&order=created_at.asc'),
  listNotes: () => api('week_notes', '?select=*&order=week_start.desc'),
  saveNote: (row, opts) => api('week_notes', '?on_conflict=week_start', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation', ...opts }),
};

// Retrouve (ou crée) le client puis le projet correspondant.
// `hours` : temps estimé du projet, appliqué seulement s'il est créé ici (Lot 22).
async function ensureProject(clientName, projectName, hours = null) {
  const cName = clientName.trim() || DEFAULT_CLIENT;
  const pName = projectName.trim() || DEFAULT_PROJECT;
  const found = projects.find((p) => same(p.name, pName) && same(p.clients.name, cName));
  if (found) return found;
  let client = clients.find((c) => same(c.name, cName));
  if (!client) {
    [client] = await api('clients', '', { method: 'POST', body: { name: cName }, prefer: 'return=representation' });
    clients.push(client);
  }
  const [project] = await api('projects', `?select=${PROJECT_SELECT}`, {
    method: 'POST', body: { client_id: client.id, name: pName, ...(hours != null ? { estimated_hours: hours } : {}) }, prefer: 'return=representation',
  });
  projects.push(project);
  return project;
}

const taskClient = (t) => t.projects?.clients?.name ?? t.client_name ?? '';
const taskProject = (t) => t.projects?.name ?? t.project_name ?? '';

// ---------- Utilitaires ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtH = (n) => `${Number((+n || 0).toFixed(2))} h`;

function showError(msg) {
  const el = $('#error');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

let toastTimer;
// `action` : { label, run } — bouton dans le toast (ex. « Annuler »), qui le referme.
function toast(msg, type = 'success', action = null) {
  const el = $('#toast');
  const hide = () => el.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
  el.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shrink-0 underline underline-offset-2 text-slate-200 hover:text-white';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hide(); action.run(); });
    el.append(btn);
  }
  el.classList.toggle('bg-slate-900', type !== 'error');
  el.classList.toggle('bg-red-600', type === 'error');
  el.classList.toggle('pointer-events-none', !action);
  el.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, type === 'error' || action ? 6000 : 3500);
}

// Confirmation dans une modale de l'application ; résout true si l'utilisateur confirme.
const confirmDialog = $('#confirm-dialog');
function askConfirm({ title, message = '', confirmLabel = 'Confirmer', danger = false }) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  const ok = $('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.classList.toggle('bg-red-600', danger);
  ok.classList.toggle('hover:bg-red-700', danger);
  ok.classList.toggle('bg-slate-900', !danger);
  ok.classList.toggle('hover:bg-slate-700', !danger);
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  ok.focus();
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
  });
}
confirmDialog.addEventListener('click', (e) => { if (e.target === confirmDialog) confirmDialog.close(); });

function setAuthed(ok) {
  $('#login').classList.toggle('hidden', ok);
  $('#app').classList.toggle('hidden', !ok);
}

async function run(action, rollback) {
  try {
    showError('');
    await action();
  } catch (e) {
    console.error(e);
    if (rollback) rollback();
    showError(e.message);
    render();
  }
}

// ---------- Rendu ----------
// Teintes de la palette des étiquettes (classes Tailwind complètes : générées par le CDN à l'affichage).
const TINTS = {
  rouge: { name: 'Rouge', chip: 'bg-red-100 text-red-800', card: 'bg-red-50', edge: 'border-l-red-500', dot: 'bg-red-500', text: 'text-red-700', on: 'peer-checked:bg-red-100 peer-checked:text-red-800' },
  orange: { name: 'Orange', chip: 'bg-orange-100 text-orange-800', card: 'bg-orange-50', edge: 'border-l-orange-500', dot: 'bg-orange-500', text: 'text-orange-700', on: 'peer-checked:bg-orange-100 peer-checked:text-orange-800' },
  jaune: { name: 'Jaune', chip: 'bg-yellow-100 text-yellow-800', card: 'bg-yellow-50', edge: 'border-l-yellow-400', dot: 'bg-yellow-400', text: 'text-yellow-700', on: 'peer-checked:bg-yellow-100 peer-checked:text-yellow-800' },
  vert: { name: 'Vert', chip: 'bg-emerald-100 text-emerald-800', card: 'bg-emerald-50', edge: 'border-l-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700', on: 'peer-checked:bg-emerald-100 peer-checked:text-emerald-800' },
  bleu: { name: 'Bleu', chip: 'bg-blue-100 text-blue-800', card: 'bg-blue-50', edge: 'border-l-blue-500', dot: 'bg-blue-500', text: 'text-blue-700', on: 'peer-checked:bg-blue-100 peer-checked:text-blue-800' },
  violet: { name: 'Violet', chip: 'bg-violet-100 text-violet-800', card: 'bg-violet-50', edge: 'border-l-violet-500', dot: 'bg-violet-500', text: 'text-violet-700', on: 'peer-checked:bg-violet-100 peer-checked:text-violet-800' },
  rose: { name: 'Rose', chip: 'bg-pink-100 text-pink-800', card: 'bg-pink-50', edge: 'border-l-pink-500', dot: 'bg-pink-500', text: 'text-pink-700', on: 'peer-checked:bg-pink-100 peer-checked:text-pink-800' },
  gris: { name: 'Gris', chip: 'bg-slate-200 text-slate-700', card: 'bg-slate-100', edge: 'border-l-slate-500', dot: 'bg-slate-500', text: 'text-slate-700', on: 'peer-checked:bg-slate-200 peer-checked:text-slate-800' },
};
const tint = (l) => TINTS[l?.color] || TINTS.gris;

// Pastilles des étiquettes d'une tâche (planning, sas, détail projet, historique).
const labelChipsHTML = (t) => taskLabels(t, labels).map((l) => `
  <span class="inline-flex items-center max-w-full truncate text-[11px] font-medium rounded px-1.5 py-0.5 ${tint(l).chip}">${esc(l.name)}</span>`).join('');

// ---- Tâches récurrentes ----
const activeSeriesOf = (t) => (t.recurrence_id ? recurrences.find((x) => x.id === t.recurrence_id && x.active) : null) ?? null;

function recurrenceBadgeHTML(t) {
  const series = activeSeriesOf(t);
  if (!series) return '';
  const label = recurrenceLabel(series);
  return `<span class="inline-flex items-center text-[11px] font-medium text-slate-500 bg-white/70 border border-slate-200 rounded px-1.5 py-0.5"
    title="${esc(label)}" aria-label="Tâche récurrente : ${esc(label)}" data-lot="Lot 15">↻</span>`;
}

// Champs « Répétition » : rang du mois visible en mensuel, prérempli d'après le jour choisi.
function syncRecurrenceFields(form, { prefill = false } = {}) {
  const monthly = form.recurrence.value === 'monthly';
  const day = form.day_of_week.value;
  form.monthly_rank.classList.toggle('hidden', !monthly);
  const dayText = form.querySelector('[data-rank-day]');
  dayText.classList.toggle('hidden', !monthly);
  dayText.textContent = day ? `${day.toLowerCase()} du mois` : 'jour du mois';
  if (monthly && prefill && day) {
    const rank = monthlyRank(dayDate(planningMonday(new Date()), day));
    form.monthly_rank.value = String(Math.min(rank, 5));
  }
}

document.addEventListener('change', (e) => {
  const form = e.target.form;
  if (!form?.querySelector?.('[data-recurrence-fields]')) return;
  if (e.target.name === 'recurrence' || e.target.name === 'day_of_week') syncRecurrenceFields(form, { prefill: true });
});

// Règle saisie dans un formulaire ; null si « Aucune ». Une tâche récurrente doit avoir un jour.
function recurrenceInput(form) {
  const frequency = form.recurrence.value;
  if (!frequency) return null;
  if (!form.day_of_week.value) throw new Error('Une tâche récurrente doit être planifiée sur un jour (pas dans le sas).');
  return { frequency, monthly_rank: frequency === 'monthly' ? Number(form.monthly_rank.value) : null, day_of_week: form.day_of_week.value };
}

async function createSeries(rule, template) {
  const [series] = await api('recurrences', '', { method: 'POST', body: { ...rule, ...template, active: true }, prefer: 'return=representation' });
  recurrences.push(series);
  return series;
}

// Ligne d'occurrence à créer pour une série (noms client / projet repris du projet actuel).
function occurrenceRow(series) {
  const project = projects.find((p) => p.id === series.project_id);
  if (!project) return null;
  return {
    project_id: project.id,
    client_name: project.clients.name,
    project_name: project.name,
    task_name: series.task_name,
    estimated_hours: series.estimated_hours,
    day_of_week: series.day_of_week,
    is_completed: false,
    label_ids: series.label_ids ?? [],
    start_time: series.start_time ?? null,
    meeting_url: series.meeting_url ?? null,
    recurrence_id: series.id,
  };
}

// Pictogramme « duplication » (deux feuilles superposées).
const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5"/></svg>';

// Surface d'une tâche : teinte de son étiquette la plus prioritaire (fond léger + liseré gauche).
const taskSurface = (t) => {
  const main = primaryLabel(t, labels);
  return main ? `${tint(main).card} border-l-[3px] ${tint(main).edge}` : '';
};

// Corps d'une tâche, de haut en bas : origine (client · projet), réunion, titre, pastilles, liens, commentaires.
function taskBodyHTML(t, origin) {
  const done = t.is_completed;
  const main = primaryLabel(t, labels);
  return `
      ${origin ? `<p class="text-xs text-slate-500 truncate mb-1 pr-16" title="${esc(origin)}">${t.project_id
        ? `<a href="#projets/${t.project_id}" draggable="false" class="hover:underline" data-lot="Lot 31">${esc(origin)}</a>` : esc(origin)}</p>` : ''}
      ${isMeeting(t, labels) ? `
      <div class="flex items-center gap-2 mb-1.5" data-lot="Lot 14">
        <span class="text-base font-semibold tabular-nums ${tint(main).text}">${esc(t.start_time || '--:--')}</span>
        ${t.meeting_url ? `<a href="${esc(t.meeting_url)}" target="_blank" rel="noopener noreferrer" draggable="false" title="${esc(t.meeting_url)}"
             class="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md bg-slate-900 text-white px-2 py-1 hover:bg-slate-700 transition">Rejoindre ↗</a>` : ''}
      </div>` : ''}
      <div class="flex items-start gap-2">
        <input type="checkbox" class="chk mt-0.5" ${done ? 'checked' : ''} data-toggle="${t.id}" aria-label="Terminée" />
        <p class="min-w-0 flex-1 text-sm font-medium leading-snug break-words hyphens-auto ${done ? 'line-through text-slate-400' : ''}" lang="fr">${esc(t.task_name)}</p>
      </div>
      <!-- Actions en surimpression au survol : le titre garde toute la largeur de la carte -->
      <div class="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-white/95 px-1 py-0.5 shadow-sm ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button class="text-slate-400 hover:text-slate-900 leading-none px-0.5" data-duplicate="${t.id}" data-lot="Lot 16"
                title="Dupliquer" aria-label="Dupliquer la tâche">${COPY_ICON}</button>
        <button class="text-slate-400 hover:text-slate-900 text-sm leading-none px-0.5"
                data-edit="${t.id}" data-lot="Lot 1" title="Modifier" aria-label="Modifier">✎</button>
        <button class="text-slate-400 hover:text-red-500 text-base leading-none px-0.5"
                data-unplan="${t.id}" data-lot="Lot 12" title="Retirer du planning (retour dans le sas)" aria-label="Retirer du planning">×</button>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span class="inline-block text-[11px] font-medium text-slate-600 bg-white/70 border border-slate-200 rounded px-1.5 py-0.5">${fmtH(t.estimated_hours)}</span>
        ${labelChipsHTML(t)}
        ${recurrenceBadgeHTML(t)}
        ${commentBadgeHTML(t)}
        ${canConsign(t) ? `<button type="button" data-consign="${t.id}" data-lot="Lot 23" title="Consigner : archiver tout de suite, avec le temps passé"
          class="text-[11px] font-medium rounded px-1.5 py-0.5 border border-slate-300 bg-white text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition">Consigner</button>` : ''}
      </div>
      ${showLinks ? cardLinksHTML(t) : ''}
      ${openComments.has(t.id) ? `<ul class="mt-2 space-y-1" data-lot="Lot 10">${taskComments(t.id).map(commentHTML).join('')}</ul>` : ''}
      <form class="mt-2 flex items-center gap-1" data-comment-form="${t.id}" data-lot="Lot 10">
        <input name="body" autocomplete="off" maxlength="2000" placeholder="${todoDrafts.has(t.id) ? 'Point à traiter…' : 'Note…'}" aria-label="Ajouter un commentaire à « ${esc(t.task_name)} »"
          class="min-w-0 flex-1 px-2 py-1 text-xs rounded-md bg-slate-900/[.04] border border-transparent placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none" />
        <button type="button" data-comment-mode="${t.id}" data-lot="Lot 20" aria-pressed="${todoDrafts.has(t.id)}"
          title="Le prochain commentaire sera un point à traiter (case à cocher) plutôt qu’une simple note"
          class="shrink-0 text-[11px] font-medium rounded-md border border-transparent px-1.5 py-1 text-slate-400 hover:text-slate-700 transition
                 aria-pressed:bg-amber-100 aria-pressed:text-amber-800 aria-pressed:border-amber-200">À traiter</button>
      </form>`;
}

// Carte seule (tâche unique de son client ce jour-là).
function cardHTML(t) {
  const surface = taskSurface(t);
  return `
    <article class="card group relative ${surface || 'bg-white'} border border-slate-200 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing ${surface ? 'hover:shadow-md' : 'hover:border-slate-300'} transition ${t.is_completed ? 'opacity-60' : ''}"
             draggable="true" data-id="${t.id}" data-group="${esc(clientKey(t))}">${taskBodyHTML(t, `${taskClient(t)} · ${taskProject(t)}`)}
    </article>`;
}

// Conteneur client : en-tête « Client · Projet » (ou « Client » si plusieurs projets), puis une ligne par tâche.
function clientGroupHTML(g) {
  if (g.tasks.length === 1) return cardHTML(g.tasks[0]);
  const single = g.projects.length === 1;
  const header = single ? `${g.client} · ${g.projects[0]}` : g.client;
  return `
    <section class="client-group rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden" data-lot="Lot 17" aria-label="${esc(header)}"
             draggable="true" data-group="${esc(g.key)}">
      <p class="px-2.5 pt-2 pb-0.5 text-xs font-medium text-slate-500 truncate cursor-grab active:cursor-grabbing" data-lot="Lot 18"
         title="Glisser pour déplacer tout le conteneur">${esc(header)}</p>
      <div>${g.tasks.map((t, i) => `
        <article class="card group relative ${taskSurface(t)} ${i ? 'border-t border-t-slate-100' : ''} p-2.5 cursor-grab active:cursor-grabbing hover:bg-slate-50/60 transition ${t.is_completed ? 'opacity-60' : ''}"
                 draggable="true" data-id="${t.id}">${taskBodyHTML(t, single ? '' : taskProject(t))}
        </article>`).join('')}
      </div>
    </section>`;
}

const taskComments = (taskId) => comments.filter((c) => c.task_id === taskId);

const BUBBLE = '<svg viewBox="0 0 16 16" aria-hidden="true" class="w-3 h-3 fill-current"><path d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3.5 3v-3H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>';

// Compteur en direct : commentaires non traités (ambre), sinon total (gris) : « notes » si ce ne sont que des notes.
function commentBadgeHTML(t) {
  const { total, notes, pending } = commentCounts(comments, t.id);
  if (!total) return '';
  const cls = pending ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200';
  const label = pending ? `${pending} commentaire${pending > 1 ? 's' : ''} non traité${pending > 1 ? 's' : ''}`
    : notes === total ? `${total} note${total > 1 ? 's' : ''}`
      : `${total} commentaire${total > 1 ? 's' : ''} traité${total > 1 ? 's' : ''}`;
  return `<button type="button" data-comments="${t.id}" aria-expanded="${openComments.has(t.id)}" title="${label}" aria-label="${label}"
    class="inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 tabular-nums transition ${cls}">${BUBBLE}${pending || total}</button>`;
}

// Une note n'a pas de case à cocher ; un point à traiter oui. Les boutons de droite (au survol, en surimpression :
// le texte garde toute la largeur) changent la nature du commentaire ou le suppriment.
function commentHTML(c) {
  const lead = c.is_note
    ? '<span class="mt-px w-[15px] shrink-0 text-center text-slate-300 leading-none" title="Note" aria-label="Note">•</span>'
    : `<input type="checkbox" class="chk mt-px" ${c.is_done ? 'checked' : ''} data-comment-toggle="${c.id}" aria-label="Commentaire traité" />`;
  const kind = c.is_note ? 'à traiter' : 'note';
  return `
    <li class="group/c relative flex items-start gap-1.5 text-xs" data-lot="Lot 20">
      ${lead}
      <span class="min-w-0 flex-1 break-words whitespace-pre-line ${c.is_done ? 'line-through text-slate-400' : 'text-slate-700'}">${esc(c.body)}</span>
      <span class="absolute -top-0.5 right-0 flex items-center gap-1.5 rounded bg-white/95 px-1 py-0.5 shadow-sm ring-1 ring-slate-200 opacity-0 group-hover/c:opacity-100 focus-within:opacity-100 transition">
        <button type="button" class="text-[10px] font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap leading-none"
                data-comment-kind="${c.id}" title="Transformer en ${kind === 'note' ? 'simple note' : 'point à traiter'}" aria-label="Transformer en ${kind === 'note' ? 'simple note' : 'point à traiter'}">→ ${kind}</button>
        <button type="button" class="text-slate-400 hover:text-red-500 leading-none"
                data-delete-comment="${c.id}" title="Supprimer le commentaire" aria-label="Supprimer le commentaire">×</button>
      </span>
    </li>`;
}

// Liens du projet (devis en tête) sous forme de pastilles cliquables.
function cardLinksHTML(t) {
  const list = linksOf(projects.find((p) => p.id === t.project_id), links);
  if (!list.length) return '';
  return `<div class="mt-1.5 flex flex-wrap gap-1" data-lot="Lot 10">${list.map((l) => `
    <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" draggable="false" title="${esc(l.url)}"
       class="max-w-full truncate text-[11px] font-medium rounded px-1.5 py-0.5 border transition ${l.quote
         ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
         : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">${esc(l.label)}</a>`).join('')}</div>`;
}

// Sélecteur d'étiquettes d'un formulaire : pastilles à cocher ; conserve la sélection en cours d'un rendu à l'autre.
const formLabels = (form) => [...form.querySelectorAll('input[name="label"]:checked')].map((i) => i.value);

function renderLabelPicker(form, selected = formLabels(form)) {
  const box = form.querySelector('[data-label-picker]');
  box.innerHTML = labels.length ? '<span class="text-xs text-slate-500 mr-0.5">Étiquettes</span>' + [...labels].sort((a, b) => a.position - b.position).map((l) => `
    <label class="cursor-pointer">
      <input type="checkbox" name="label" value="${l.id}" class="peer sr-only" ${selected.includes(l.id) ? 'checked' : ''} />
      <span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition
        hover:border-slate-300 peer-checked:border-transparent ${tint(l).on} peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400 peer-checked:[&>.mark]:inline">
        <span class="w-2 h-2 rounded-full ${tint(l).dot}"></span>${esc(l.name)}<span class="mark hidden" aria-hidden="true">✓</span>
      </span>
    </label>`).join('') : '';
  syncMeetingFields(form);
}

// Les champs heure + lien n'apparaissent que si une étiquette « réunion » est cochée.
function syncMeetingFields(form) {
  const meeting = isMeeting({ label_ids: formLabels(form) }, labels);
  form.querySelector('[data-meeting-fields]').classList.toggle('hidden', !meeting);
  return meeting;
}

document.addEventListener('change', (e) => {
  if (e.target.name === 'label' && e.target.form) syncMeetingFields(e.target.form);
});

// Champs réunion d'un formulaire, validés ; null si aucune étiquette « réunion » n'est cochée.
function meetingInput(form) {
  if (!syncMeetingFields(form)) return null;
  return { start_time: parseTime(form.start_time.value) || null, meeting_url: normalizeUrl(form.meeting_url.value) || null };
}

function render() {
  renderLabelPicker($('#add-form'));
  $('#board').innerHTML = DAYS.map((day) => {
    const list = tasks.filter((t) => t.day_of_week === day);
    const total = list.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
    return `
      <section class="col flex flex-col rounded-xl bg-slate-100/60 p-2 min-h-[200px] md:min-h-[60vh] transition" data-day="${day}">
        <div class="flex items-baseline justify-between px-2 pt-1 pb-2.5">
          <h2 class="text-sm font-semibold">${day}</h2>
          <span class="text-xs font-medium text-slate-500 tabular-nums" data-total="${day}">${fmtH(total)}</span>
        </div>
        <div class="flex flex-col gap-2 flex-1" data-groups>${groupDay(list, labels).map(clientGroupHTML).join('')}</div>
      </section>`;
  }).join('');

  $('#toggle-links').setAttribute('aria-pressed', String(showLinks));
  const open = tasks.filter((t) => t.day_of_week && !t.is_completed);
  const hours = open.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
  $('#summary').textContent = `${open.length} tâche${open.length > 1 ? 's' : ''} à faire · ${fmtH(hours)}`;

  renderWaiting();
  renderArchives();
  renderHistory();
  renderClients();
  renderProjectPage();
  renderSettings();
  $('#clients-list').innerHTML = clients.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
  fillProjectList($('#add-form').client_name.value);
  syncProjectEstimate($('#add-form'));
}

// Suggestions de projets (datalist partagée) : ceux du client saisi d'abord (en cours, puis terminés), puis les autres.
function fillProjectList(client) {
  $('#projects-list').innerHTML = projectSuggestions(projects, client || '')
    .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
}
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('input[list="projects-list"]')) fillProjectList(e.target.form?.client_name?.value);
});
document.addEventListener('input', (e) => {
  if (e.target.form?.id === 'add-form' && (e.target.name === 'client_name' || e.target.name === 'project_name')) syncProjectEstimate(e.target.form);
  if (e.target.name === 'client_name' && e.target.form?.project_name?.getAttribute('list') === 'projects-list') fillProjectList(e.target.value);
});

// Tâche rangée dans le dossier de son projet (sas d'attente) : glissable vers un jour du planning.
function parkedHTML(t) {
  return `
    <article class="card group flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-slate-300 transition"
             draggable="true" data-id="${t.id}">
      <p class="min-w-0 flex-1 text-sm break-words ${t.is_completed ? 'line-through text-slate-400' : ''}">${esc(t.task_name)}
        ${taskLabels(t, labels).length || activeSeriesOf(t) ? `<span class="mt-0.5 flex flex-wrap items-center gap-1">${labelChipsHTML(t)}${recurrenceBadgeHTML(t)}</span>` : ''}</p>
      <span class="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">${fmtH(t.estimated_hours)}</span>
      <button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-300 hover:text-slate-700 text-sm leading-none transition"
              data-edit="${t.id}" title="Modifier" aria-label="Modifier">✎</button>
      <button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-300 hover:text-red-500 text-base leading-none transition"
              data-delete="${t.id}" title="Supprimer définitivement" aria-label="Supprimer définitivement">×</button>
    </article>`;
}

// Affichage du sas : par projet (liste) ou par client (groupes) ; recherche rapide en direct.
let sasView = 'project';
try { if (localStorage.getItem(SAS_VIEW_KEY) === 'client') sasView = 'client'; } catch { /* stockage indisponible */ }
let sasQuery = '';

function folderHTML(p, { showClient }) {
  const list = parkedTasks(tasks, p.id);
  return `
    <li class="folder bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing" data-lot="Lot 3"
        draggable="true" data-folder="${p.id}">
      <div class="flex items-start gap-1">
        <button class="min-w-0 flex-1 flex items-center gap-2 text-left" data-open="${p.id}" title="Ouvrir la page du projet">
          ${showClient ? logoHTML(clients.find((c) => c.id === p.client_id) || p.clients, 'w-8 h-8 shrink-0') : ''}
          <span class="min-w-0 flex-1" data-lot="Lot 17">
            ${[showClient && p.clients.name, p.type].filter(Boolean).length
              ? `<span class="block text-xs text-slate-500 truncate">${esc([showClient && p.clients.name, p.type].filter(Boolean).join(' · '))}</span>` : ''}
            <span class="block text-sm font-medium truncate">${esc(p.name)}</span>
          </span>
        </button>
        ${projectPendingHTML(p)}
        <button class="text-xs text-slate-500 hover:text-slate-900 px-1.5 py-1 rounded transition" data-open="${p.id}" data-lot="Lot 31"
                title="Ouvrir la page du projet">Ouvrir</button>
        <button class="text-xs text-slate-400 hover:text-slate-900 px-1.5 py-1 rounded transition" data-finish="${p.id}"
                title="Archiver le projet (terminé)">Archiver</button>
      </div>
      ${linksOf(p, links).length ? `<div class="mt-1.5 flex flex-wrap gap-1" data-lot="Lot 31">${linksOf(p, links).map(clientLinkChip).join('')}</div>` : ''}
      ${budgetHTML(p, list)}
      <div class="mt-2 flex flex-col gap-1.5">
        ${list.length ? list.map(parkedHTML).join('') : '<p class="text-xs text-slate-400">Aucune tâche rangée.</p>'}
      </div>
    </li>`;
}

// Temps effectif / estimé d'un projet du sas : « 12 h / 40 h » et une fine barre (ambre au-delà de l'estimé).
function budgetHTML(p, list = []) {
  const spent = projectTime(tasks, history, p.id).spent;
  const b = budgetStatus(p.estimated_hours, spent);
  const parkedHours = list.reduce((sum, t) => sum + (+t.estimated_hours || 0), 0);
  const parked = list.length ? `<span class="text-slate-400" data-lot="Lot 31">${plural(list.length, 'tâche')} rangée${list.length > 1 ? 's' : ''} · ${fmtH(parkedHours)}</span>` : '';
  if (!b) return spent || parked ? `<p class="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums" data-lot="Lot 22" title="Temps effectif (aucun estimé renseigné)"><span>${spent ? fmtH(spent) : ''}</span>${parked}</p>` : '';
  const tone = b.over ? 'bg-amber-500' : 'bg-slate-900';
  return `
      <div class="mt-1.5" data-lot="Lot 22" title="Temps effectif / temps estimé${b.over ? ' : estimé dépassé' : ''}">
        <p class="flex items-center justify-between gap-2 text-[11px] tabular-nums ${b.over ? 'font-medium text-amber-700' : 'text-slate-500'}"><span>${fmtH(b.spent)} / ${fmtH(b.estimated)}</span>${parked}</p>
        <div class="mt-0.5 h-1 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${b.pct}"
             aria-label="Avancement du temps effectif sur l’estimé"><div class="h-full rounded-full ${tone}" style="width:${b.pct}%"></div></div>
      </div>`;
}

function projectPendingHTML(p) {
  const n = pendingByProject(comments, tasks.concat(history), p.id);
  return n ? `<span class="shrink-0 inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 tabular-nums"
    title="${n} commentaire${n > 1 ? 's' : ''} non traité${n > 1 ? 's' : ''}" data-lot="Lot 10">${BUBBLE}${n}</span>` : '';
}

// Sas d'attente : projets en cours sans tâche planifiée dans la semaine, ou ayant des tâches rangées dans leur dossier.
function renderWaiting() {
  const waiting = filterProjects(sortFolders(waitingProjects(projects, tasks)), sasQuery);
  $('#waiting-count').textContent = waiting.length;
  document.querySelectorAll('[data-sas-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sasView === sasView)));
  let html;
  if (!waiting.length) {
    html = `<li class="text-sm text-slate-400 py-1">${sasQuery.trim()
      ? 'Aucun projet du sas ne correspond à la recherche.'
      : 'Tous les projets en cours ont au moins une tâche cette semaine.'}</li>`;
  } else if (sasView === 'client') {
    html = groupByClient(waiting).map((g) => `
      <li data-lot="Lot 9">
        <h3 class="flex items-center gap-2 px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ${logoHTML(clients.find((c) => c.id === g.client.id) || g.client, 'w-5 h-5 shrink-0')}
          <span class="truncate">${esc(g.client.name)}</span>
          <span class="font-medium tabular-nums">${g.projects.length}</span>
        </h3>
        <ul class="grid grid-cols-1 gap-2">${g.projects.map((p) => folderHTML(p, { showClient: false })).join('')}</ul>
      </li>`).join('');
  } else {
    html = waiting.map((p) => folderHTML(p, { showClient: true })).join('');
  }
  $('#waiting-list').innerHTML = html;
  renderSasResults();
}

// Résultats de la recherche rapide : clients puis projets (terminés compris), accès direct à la fiche.
function renderSasResults() {
  const box = $('#sas-results');
  const hits = searchEntities(clients, projects, sasQuery);
  const n = hits.clients.length + hits.projects.length;
  box.classList.toggle('hidden', !sasQuery.trim());
  if (!sasQuery.trim()) return;
  const row = (attr, id, title, sub, badge) => `
    <li><button type="button" ${attr}="${id}" class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 transition">
      <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(title)}</span><span class="block truncate text-xs text-slate-500">${esc(sub)}</span></span>
      ${badge}
    </button></li>`;
  const tag = (t, cls = 'bg-slate-100 text-slate-600') => `<span class="shrink-0 text-[11px] font-medium ${cls} rounded px-1.5 py-0.5">${t}</span>`;
  box.innerHTML = n
    ? hits.clients.map((c) => row('data-result-client', c.id, c.name, c.website ? hostOf(c.website) : 'Fiche client', tag('Client'))).join('')
      + hits.projects.map((p) => row('data-result-project', p.id, p.name, [p.clients.name, p.type, p.year].filter(Boolean).join(' · '),
        p.status === 'termine' ? tag('Terminé') : tag('Projet', 'bg-emerald-50 text-emerald-700'))).join('')
    : '<li class="px-2.5 py-2 text-sm text-slate-400">Aucun client ni projet trouvé.</li>';
}

function openResult(target) {
  const clientId = target.closest('[data-result-client]')?.dataset.resultClient;
  const projectId = target.closest('[data-result-project]')?.dataset.resultProject;
  if (!clientId && !projectId) return false;
  sasQuery = '';
  $('#sas-search').value = '';
  renderWaiting();
  if (clientId) location.hash = `#clients/${clientId}`;
  else goProject(projectId);
  return true;
}

$('#sas-search').addEventListener('input', (e) => {
  sasQuery = e.target.value;
  renderWaiting();
});

$('#sas-search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    sasQuery = '';
    e.target.value = '';
    renderWaiting();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const first = $('#sas-results button');
    if (first) openResult(first);
  }
});

$('#sas-view').addEventListener('click', (e) => {
  const view = e.target.dataset.sasView;
  if (!view) return;
  sasView = view;
  try { localStorage.setItem(SAS_VIEW_KEY, view); } catch { /* stockage indisponible */ }
  renderWaiting();
});

// Page Archives : projets terminés (groupés par client) et tâches consignées (Lot 23).
function renderArchives() {
  const done = projects.filter((p) => p.status === 'termine');
  const consigned = consignedTasks(history);
  $('#archives-count').textContent = done.length + consigned.length;
  const byClient = new Map();
  done.forEach((p) => {
    if (!byClient.has(p.clients.name)) byClient.set(p.clients.name, []);
    byClient.get(p.clients.name).push(p);
  });
  const projectsHTML = done.length
    ? [...byClient].sort((a, b) => a[0].localeCompare(b[0])).map(([client, list]) => `
        <section>
          <h4 class="text-sm font-semibold mb-2">${esc(client)}</h4>
          <ul class="flex flex-col gap-2">
            ${list.map((p) => {
              const o = projectOverview(p, tasks, history);
              const sub = [p.type, p.year, plural(o.count, 'tâche')].filter(Boolean).join(' · ');
              return `
              <li class="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white border border-slate-200 rounded-lg px-3 py-3 shadow-sm">
                <span class="min-w-0 flex-1 basis-48">
                  <span class="block text-sm font-medium truncate">${esc(p.name)}</span>
                  <span class="block text-xs text-slate-500 truncate" data-lot="Lot 31">${esc(sub)}</span>
                </span>
                <span class="w-28 shrink-0" data-lot="Lot 31">${o.estimated !== null
                  ? `<span class="block text-xs tabular-nums text-slate-500">${fmtH(o.spent)} / ${fmtH(o.estimated)}</span>
                     <span class="mt-1 block h-1 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${o.pct}"
                       aria-label="Temps passé sur l’estimé"><span class="block h-full rounded-full ${o.over ? 'bg-amber-500' : 'bg-slate-300'}" style="width:${o.pct}%"></span></span>`
                  : `<span class="block text-xs tabular-nums text-slate-400">${o.spent ? `${fmtH(o.spent)} · sans estimé` : '—'}</span>`}</span>
                <span class="ml-auto flex shrink-0 items-center gap-1.5">
                  <button class="text-sm px-3 py-1.5 rounded-lg border border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition" data-lot="Lot 31"
                          data-open-project="${p.id}" title="Ouvrir la page du projet">Ouvrir</button>
                  <button class="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                          data-reopen="${p.id}">Rouvrir</button>
                  <button class="text-sm font-medium px-3 py-1.5 rounded-lg border border-transparent text-slate-500 hover:text-red-700 hover:bg-red-50 transition" data-lot="Lot 24"
                          data-delete-project="${p.id}" title="Supprimer définitivement le projet et ses tâches" aria-label="Supprimer définitivement le projet ${esc(p.name)}">Supprimer</button>
                </span>
              </li>`;
            }).join('')}
          </ul>
        </section>`).join('')
    : '<p class="text-sm text-slate-400">Aucun projet archivé pour le moment.</p>';
  const consignedHTML = consigned.length
    ? `<ul class="flex flex-col gap-2">${consigned.map((t) => {
        const week = weeks.find((w) => w.id === t.week_id);
        const spent = hoursSpent(t);
        return `
          <li class="flex flex-wrap items-center gap-x-3 gap-y-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            <span class="min-w-0 flex-1 basis-56">
              <span class="block text-xs text-slate-500 truncate">${esc(taskClient(t))} · ${esc(taskProject(t))}</span>
              <span class="block text-sm font-medium truncate">${esc(t.task_name)}</span>
              <span class="block text-xs text-slate-500 tabular-nums">
                <span title="Heures prévues puis temps passé">${fmtH(t.estimated_hours)} prévues · <span class="font-medium ${spent > (+t.estimated_hours || 0) ? 'text-amber-700' : 'text-slate-700'}">${fmtH(spent)} passées</span></span>
                · ${esc(fmtDate(t.consigned_at, SHORT_DATE))} · ${week ? `semaine close le ${esc(fmtDate(week.closed_at, SHORT_DATE))}` : 'prochaine semaine'}
              </span>
            </span>
            <span class="ml-auto flex shrink-0 items-center gap-1.5">
              ${canUnconsign(t) ? `<button class="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                      data-unconsign="${t.id}" title="Remettre la tâche dans le planning">Rétablir</button>` : ''}
              <button class="text-sm font-medium px-3 py-1.5 rounded-lg border border-transparent text-slate-500 hover:text-red-700 hover:bg-red-50 transition" data-lot="Lot 24"
                      data-delete-consigned="${t.id}" title="Supprimer définitivement la tâche" aria-label="Supprimer définitivement la tâche ${esc(t.task_name)}">Supprimer</button>
            </span>
          </li>`;
      }).join('')}</ul>`
    : '<p class="text-sm text-slate-400">Aucune tâche consignée : « Consigner » apparaît sur une tâche terminée du planning.</p>';
  $('#archives-list').innerHTML = `
    <section class="space-y-3" data-lot="Lot 2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Projets archivés <span class="ml-1 font-medium tabular-nums">${done.length}</span></h3>
      <div class="space-y-5">${projectsHTML}</div>
    </section>
    <section class="space-y-3" data-lot="Lot 23">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tâches consignées <span class="ml-1 font-medium tabular-nums">${consigned.length}</span></h3>
      ${consignedHTML}
    </section>`;
}

// Navigation par onglets (hash) : une vue #<nom>-view par onglet.
const ROUTES = ['planning', 'history', 'clients', 'projets', 'archives', 'settings'];
const TAB_OF = { projets: 'clients' }; // la page projet n'a pas d'onglet : elle reste sous « Clients »
const currentRoute = () => routeOf(location.hash, ROUTES);

function route() {
  const active = currentRoute();
  const tabName = TAB_OF[active] ?? active;
  ROUTES.forEach((name) => {
    $(`#${name}-view`).classList.toggle('hidden', name !== active);
    const tab = $(`#tab-${name}`);
    if (!tab) return;
    if (name === tabName) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  renderClients();
  renderProjectPage();
  if (active === 'projets') window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

// ---------- Actions ----------
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  let meeting;
  let recurrence;
  let projectHours = null;
  try {
    meeting = meetingInput(f);
    recurrence = recurrenceInput(f);
    if (!f.querySelector('[data-project-estimate]').classList.contains('hidden')) projectHours = parseOptionalHours(f.project_hours.value);
  } catch (ex) { showError(ex.message); return; }
  const draft = {
    project_hours: projectHours,
    client: f.client_name.value,
    project: f.project_name.value,
    task_name: f.task_name.value.trim(),
    estimated_hours: parseFloat(f.estimated_hours.value) || 0,
    day_of_week: f.day_of_week.value || null,
    label_ids: formLabels(f),
    start_time: meeting?.start_time ?? null,
    meeting_url: meeting?.meeting_url ?? null,
    recurrence,
  };
  // Tâche ajoutée directement dans le sas : on demande dans quel projet la ranger.
  if (!draft.day_of_week) return openAssign(draft);
  run(async () => {
    await createTask(await ensureProject(draft.client, draft.project, draft.project_hours), draft);
    resetAddForm();
  });
});

function resetAddForm() {
  const f = $('#add-form');
  f.task_name.value = '';
  f.estimated_hours.value = '';
  f.project_hours.value = '';
  f.start_time.value = '';
  f.meeting_url.value = '';
  renderLabelPicker(f, []);
  f.recurrence.value = '';
  syncRecurrenceFields(f);
  syncProjectEstimate(f);
  f.task_name.focus();
}

// Le champ « temps estimé » n'apparaît que si client + projet saisis n'existent pas encore (projet créé à l'ajout).
function syncProjectEstimate(form) {
  const client = form.client_name.value.trim();
  const project = form.project_name.value.trim();
  const isNew = !!client && !!project && !projects.some((p) => same(p.name, project) && same(p.clients.name, client));
  form.querySelector('[data-project-estimate]').classList.toggle('hidden', !isNew);
}

async function createTask(project, draft) {
  const series = draft.recurrence ? await createSeries(draft.recurrence, {
    project_id: project.id,
    task_name: draft.task_name,
    estimated_hours: draft.estimated_hours,
    label_ids: draft.label_ids ?? [],
    start_time: draft.start_time ?? null,
    meeting_url: draft.meeting_url ?? null,
  }) : null;
  const [created] = await db.insert({
    recurrence_id: series?.id ?? null,
    project_id: project.id,
    client_name: project.clients.name,
    project_name: project.name,
    task_name: draft.task_name,
    estimated_hours: draft.estimated_hours,
    day_of_week: draft.day_of_week,
    is_completed: false,
    label_ids: draft.label_ids ?? [],
    start_time: draft.start_time ?? null,
    meeting_url: draft.meeting_url ?? null,
  });
  tasks.push(created);
  render();
}

async function reopenIfArchived(project) {
  if (project.status === 'en_cours') return;
  await api('projects', `?id=eq.${project.id}`, { method: 'PATCH', body: { status: 'en_cours' } });
  project.status = 'en_cours';
}

// Modale d'affectation : projets suggérés, ou création d'un nouveau projet.
const assignDialog = $('#assign-dialog');
const assignForm = $('#assign-form');

const suggestProjects = (client, project) => suggestFrom(projects, client, project);

function openAssign(draft) {
  assignForm.dataset.draft = JSON.stringify(draft);
  const sugg = suggestProjects(draft.client, draft.project);
  const hasExact = sugg.some((s) => s.exact);
  $('#assign-task').textContent = draft.task_name;
  $('#assign-options').innerHTML = sugg.map((s, i) => `
    <label class="flex items-start gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
      <input type="radio" name="assign_to" value="${s.p.id}" class="mt-1" ${i === 0 && hasExact ? 'checked' : ''} />
      <span class="min-w-0 text-sm">
        <span class="font-medium">${esc(s.p.name)}</span>
        <span class="text-slate-500"> · ${esc(s.p.clients.name)}</span>
        ${s.exact ? '<span class="ml-1 text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Suggéré</span>' : ''}
        ${s.p.status !== 'en_cours' ? '<span class="block text-xs text-slate-500">Archivé : sera rouvert</span>' : ''}
      </span>
    </label>`).join('') + `
    <label class="flex items-start gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
      <input type="radio" name="assign_to" value="new" class="mt-1" ${hasExact ? '' : 'checked'} />
      <span class="min-w-0 flex-1 text-sm space-y-1.5">
        <span class="block font-medium">Créer un nouveau projet</span>
        <span class="grid grid-cols-2 gap-1.5">
          <input name="new_client" value="${esc(draft.client)}" placeholder="Client" aria-label="Client du nouveau projet" list="clients-list"
            class="px-2.5 py-1.5 text-sm rounded-lg bg-slate-50 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none" />
          <input name="new_project" value="${esc(draft.project)}" placeholder="Projet" aria-label="Nom du nouveau projet"
            class="px-2.5 py-1.5 text-sm rounded-lg bg-slate-50 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none" />
        </span>
      </span>
    </label>`;
  $('#assign-error').classList.add('hidden');
  assignDialog.showModal();
}

assignDialog.addEventListener('click', (e) => { if (e.target === assignDialog) assignDialog.close(); });
$('#assign-cancel').addEventListener('click', () => assignDialog.close());

assignForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#assign-error');
  err.classList.add('hidden');
  try {
    const draft = JSON.parse(f.dataset.draft);
    const target = new FormData(f).get('assign_to');
    let project;
    if (target === 'new') {
      if (!f.new_project.value.trim()) throw new Error('Le nom du projet est obligatoire.');
      project = await ensureProject(f.new_client.value, f.new_project.value, draft.project_hours);
    } else {
      project = projects.find((x) => x.id === target);
    }
    await reopenIfArchived(project);
    await createTask(project, draft);
    assignDialog.close();
    resetAddForm();
    toast(`Tâche rangée dans « ${project.name} »`);
  } catch (ex) {
    console.error(ex);
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

// Commentaires : ajout direct depuis la carte, coche « traité », suppression, dépliage.
$('#board').addEventListener('submit', (e) => {
  const taskId = e.target.dataset.commentForm;
  if (!taskId) return;
  e.preventDefault();
  const input = e.target.body;
  let body;
  try { body = parseComment(input.value); } catch (ex) { toast(ex.message, 'error'); return; }
  run(async () => {
    const [created] = await api('task_comments', '', { method: 'POST', body: { task_id: taskId, body, is_note: !todoDrafts.has(taskId) }, prefer: 'return=representation' });
    comments.push(created);
    openComments.add(taskId);
    todoDrafts.delete(taskId); // retour au mode « note » pour le commentaire suivant
    render();
    document.querySelector(`[data-comment-form="${taskId}"] input`)?.focus();
  });
});

function toggleComment(id, done) {
  const c = comments.find((x) => x.id === id);
  if (!c) return;
  const prev = c.is_done;
  c.is_done = done;
  render();
  run(() => api('task_comments', `?id=eq.${id}`, { method: 'PATCH', body: { is_done: done } }), () => { c.is_done = prev; });
}

function deleteComment(id) {
  const snapshot = comments;
  comments = comments.filter((x) => x.id !== id);
  render();
  run(() => api('task_comments', `?id=eq.${id}`, { method: 'DELETE' }), () => { comments = snapshot; });
}

// Transforme un commentaire en note ou en point à traiter (repart non traité).
function setCommentKind(id) {
  const c = comments.find((x) => x.id === id);
  if (!c) return;
  const prev = { is_note: c.is_note, is_done: c.is_done };
  const patch = commentKindPatch(!c.is_note);
  Object.assign(c, patch);
  render();
  run(() => api('task_comments', `?id=eq.${id}`, { method: 'PATCH', body: patch }), () => { Object.assign(c, prev); });
}

// Suppression et changement de nature d'un commentaire (fiches projet et historique).
function onCommentEdit(e) {
  const del = e.target.dataset.deleteComment;
  if (del) { deleteComment(del); return true; }
  const kind = e.target.dataset.commentKind;
  if (kind) { setCommentKind(kind); return true; }
  return false;
}

function onCommentAction(e) {
  const toggle = e.target.closest('[data-comments]')?.dataset.comments;
  if (toggle) {
    if (openComments.has(toggle)) openComments.delete(toggle); else openComments.add(toggle);
    render();
    return true;
  }
  // Note / à traiter pour le prochain commentaire : mise à jour sur place (le texte déjà saisi est conservé).
  const mode = e.target.closest('[data-comment-mode]');
  if (mode) {
    const id = mode.dataset.commentMode;
    if (todoDrafts.has(id)) todoDrafts.delete(id); else todoDrafts.add(id);
    const todo = todoDrafts.has(id);
    mode.setAttribute('aria-pressed', String(todo));
    mode.form.body.placeholder = todo ? 'Point à traiter…' : 'Note…';
    mode.form.body.focus();
    return true;
  }
  return onCommentEdit(e);
}

$('#board').addEventListener('change', (e) => {
  const commentId = e.target.dataset.commentToggle;
  if (commentId) return toggleComment(commentId, e.target.checked);
  const id = e.target.dataset.toggle;
  if (id) toggleTask(id, e.target.checked);
});

function toggleTask(id, checked) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  const prev = t.is_completed;
  t.is_completed = checked;
  render();
  run(() => db.update(id, { is_completed: t.is_completed }), () => { t.is_completed = prev; });
}

// Fiche client : les tâches de la semaine se cochent comme dans le planning
$('#client-page').addEventListener('change', (e) => {
  const id = e.target.dataset.toggle;
  if (id) toggleTask(id, e.target.checked);
});

// Édition / suppression : cartes du planning et tâches rangées dans le sas
function onTaskAction(e) {
  if (onCommentAction(e)) return;
  const consign = e.target.closest('[data-consign]')?.dataset.consign;
  if (consign) return openConsign(consign);
  const editId = e.target.dataset.edit;
  if (editId) return openEdit(editId);
  const dup = e.target.closest('[data-duplicate]')?.dataset.duplicate;
  if (dup) return openDuplicate(dup);
  const unplan = e.target.dataset.unplan;
  if (unplan) return unplanTask(unplan);
  const id = e.target.dataset.delete;
  if (id) deleteTaskForever(id);
}

// Duplication : choix de la destination (jour ou sas), jour actuel présélectionné.
const duplicateDialog = $('#duplicate-dialog');

function openDuplicate(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  duplicateDialog.dataset.id = id;
  $('#duplicate-task').textContent = t.task_name;
  const btn = (day, label, extra = '') => {
    const current = (t.day_of_week ?? '') === day;
    return `<button type="button" data-duplicate-to="${day}" ${current ? 'aria-current="true"' : ''}
      class="${extra} px-3 py-2 text-sm font-medium rounded-lg border transition ${current
        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-700'
        : 'border-slate-200 bg-white hover:bg-slate-100'}">${label}${current ? ' <span class="text-xs font-normal opacity-75">(actuel)</span>' : ''}</button>`;
  };
  $('#duplicate-targets').innerHTML = DAYS.map((d) => btn(d, d)).join('') + btn('', 'Sas d’attente', 'col-span-2');
  duplicateDialog.showModal();
  ($('#duplicate-targets [aria-current]') || $('#duplicate-targets button')).focus();
}

// Le modèle peut être une tâche du planning ou une tâche archivée (bouton de l'Historique, Lot 21).
async function duplicateTask(id, day) {
  const t = tasks.find((x) => x.id === id) ?? history.find((x) => x.id === id);
  if (!t) return;
  const p = projects.find((x) => x.id === t.project_id);
  await run(async () => {
    const [created] = await db.insert(duplicateRow(t, day || null));
    // Copie rangée dans le sas d'un projet terminé : on le rouvre, sinon elle serait invisible.
    if (!day && p && p.status !== 'en_cours') await reopenIfArchived(p);
    tasks.push(created);
    render();
    toast(day ? `Tâche dupliquée sur ${day}` : 'Tâche dupliquée dans le sas');
  });
}

$('#duplicate-targets').addEventListener('click', (e) => {
  const target = e.target.closest('[data-duplicate-to]');
  if (!target) return;
  duplicateDialog.close();
  duplicateTask(duplicateDialog.dataset.id, target.dataset.duplicateTo);
});
$('#duplicate-cancel').addEventListener('click', () => duplicateDialog.close());
duplicateDialog.addEventListener('click', (e) => { if (e.target === duplicateDialog) duplicateDialog.close(); });

// Consigner (Lot 23) : une tâche terminée est archivée tout de suite, avec le temps réellement passé.
const consignDialog = $('#consign-dialog');
const consignForm = $('#consign-form');

function openConsign(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t || !canConsign(t)) return;
  consignForm.dataset.id = id;
  $('#consign-task').textContent = t.task_name;
  $('#consign-planned').textContent = `(prévu : ${fmtH(t.estimated_hours)})`;
  consignForm.actual_hours.value = t.actual_hours ?? t.estimated_hours;
  const n = pendingCount(comments, id);
  const warn = $('#consign-pending');
  warn.textContent = n ? `${plural(n, 'commentaire')} non traité${n > 1 ? 's' : ''} : ${n > 1 ? 'ils resteront visibles' : 'il restera visible'} dans le détail du projet.` : '';
  warn.classList.toggle('hidden', !n);
  $('#consign-error').classList.add('hidden');
  consignDialog.showModal();
  consignForm.actual_hours.select();
}

consignForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#consign-error');
  err.classList.add('hidden');
  const t = tasks.find((x) => x.id === consignForm.dataset.id);
  if (!t) { consignDialog.close(); return; }
  let hours;
  try { hours = parseOptionalHours(consignForm.actual_hours.value); } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); return; }
  const patch = consignPatch(hours, new Date().toISOString());
  const before = { actual_hours: t.actual_hours ?? null, consigned_at: null, archived_at: null, is_completed: true };
  consignDialog.close();
  tasks = tasks.filter((x) => x.id !== t.id);
  Object.assign(t, patch);
  history = [t, ...history];
  render();
  run(
    async () => {
      await db.update(t.id, patch);
      toast(`« ${t.task_name} » consignée`, 'success', { label: 'Annuler', run: () => unconsignTask(t.id) });
    },
    () => { history = history.filter((x) => x.id !== t.id); Object.assign(t, before); tasks.push(t); }
  );
});
$('#consign-cancel').addEventListener('click', () => consignDialog.close());
consignDialog.addEventListener('click', (e) => { if (e.target === consignDialog) consignDialog.close(); });

// Rétablir une tâche consignée dans le planning, tant que la semaine qui la compte n'est pas close.
function unconsignTask(id) {
  const t = history.find((x) => x.id === id);
  if (!t || !canUnconsign(t)) return;
  const before = { archived_at: t.archived_at, consigned_at: t.consigned_at };
  const patch = unconsignPatch();
  history = history.filter((x) => x.id !== id);
  Object.assign(t, patch);
  tasks.push(t);
  render();
  run(() => db.update(id, patch), () => { tasks = tasks.filter((x) => x.id !== id); Object.assign(t, before); history = [t, ...history]; });
}

// Retire une tâche du planning : elle retourne dans le dossier de son projet (sas), projet rouvert si besoin.
function unplanTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t?.day_of_week) return;
  const day = t.day_of_week;
  const p = projects.find((x) => x.id === t.project_id);
  const reopen = p && p.status !== 'en_cours';
  t.day_of_week = null;
  if (reopen) p.status = 'en_cours';
  render();
  run(async () => {
    await db.update(id, { day_of_week: null });
    if (reopen) await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: { status: 'en_cours' } });
    toast(`« ${t.task_name} » est retournée dans le sas`, 'success', {
      label: 'Annuler',
      run: () => {
        t.day_of_week = day;
        render();
        run(() => db.update(id, { day_of_week: day }), () => { t.day_of_week = null; });
      },
    });
  }, () => { t.day_of_week = day; if (reopen) p.status = 'termine'; });
}

// Suppression définitive (sas ou modale d'édition), toujours confirmée ; les commentaires partent avec la tâche.
async function deleteTaskForever(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return false;
  const n = taskComments(id).length;
  const ok = await askConfirm({
    title: 'Supprimer définitivement la tâche ?',
    message: `« ${t.task_name} » sera supprimée${n > 1 ? ` avec ses ${n} commentaires` : n ? ' avec son commentaire' : ''}. Cette action est irréversible.`
      + (activeSeriesOf(t) ? '\nLa répétition continue : une nouvelle occurrence sera créée à la prochaine semaine concernée. Pour l’arrêter : Réglages › Tâches récurrentes.' : ''),
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return false;
  const snapshot = { tasks, comments };
  tasks = tasks.filter((x) => x.id !== id);
  comments = comments.filter((c) => c.task_id !== id);
  render();
  run(() => db.remove(id), () => { ({ tasks, comments } = snapshot); });
  return true;
}
$('#board').addEventListener('click', onTaskAction);
$('#waiting').addEventListener('click', onTaskAction);

// Drag & drop : tâches et conteneurs client (jours <-> sas), dossiers du sas (réordonnés ou planifiés).
let dragId = null; // tâche en cours de déplacement
let dragGroup = null; // conteneur client en cours de déplacement : { day, key }
let dragFolder = null; // projet (dossier du sas) en cours de déplacement
let dropAt = 0; // position d'insertion calculée au survol
const board = $('#planning-view');
const indicator = Object.assign(document.createElement('div'), { className: 'drop-indicator h-0.5 -my-1 rounded-full bg-slate-900 pointer-events-none' });

board.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  const group = !card && e.target.closest('.client-group');
  const folder = !card && !group && e.target.closest('.folder');
  if (!card && !group && !folder) return;
  if (card) dragId = card.dataset.id;
  else if (group) dragGroup = { day: group.closest('.col').dataset.day, key: group.dataset.group };
  else dragFolder = folder.dataset.folder;
  e.stopPropagation();
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId || dragGroup?.key || dragFolder);
  const el = card || group || folder;
  requestAnimationFrame(() => el.classList.add('dragging'));
});

function clearDrag() {
  dragId = null;
  dragGroup = null;
  dragFolder = null;
  indicator.remove();
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}
board.addEventListener('dragend', clearDrag);

// Cible de dépôt : une colonne de jour, ou l'ensemble du sas (day = null)
const dropTarget = (e) => e.target.closest('.col, #waiting');

// Tâches déplacées : la tâche glissée, ou toutes celles du conteneur glissé.
const movingTasks = () => (dragGroup
  ? tasks.filter((t) => t.day_of_week === dragGroup.day && clientKey(t) === dragGroup.key)
  : tasks.filter((t) => t.id === dragId));
const movingKey = () => dragGroup?.key ?? (dragId ? clientKey(tasks.find((t) => t.id === dragId)) : null);

// Place l'indicateur parmi les éléments d'une liste (hors élément de même clé) et mémorise l'index.
function placeIndicator(list, items, y) {
  const mids = items.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
  dropAt = dropIndex(mids, y);
  const before = items[dropAt];
  if (before) list.insertBefore(indicator, before); else list.append(indicator);
}

const sasReorderable = () => sasView === 'project' && !sasQuery.trim();

board.addEventListener('dragover', (e) => {
  const zone = dropTarget(e);
  if (!zone || !(dragId || dragGroup || dragFolder)) return;
  const day = zone.dataset.day;
  if (dragFolder && !day && !sasReorderable()) return; // vue par client ou recherche : pas de réordonnancement
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach((el) => el !== zone && el.classList.remove('drag-over'));
  zone.classList.add('drag-over');
  if (day && !dragFolder) {
    const key = movingKey();
    const list = zone.querySelector('[data-groups]');
    placeIndicator(list, [...list.children].filter((el) => el.dataset.group && el.dataset.group !== key), e.clientY);
  } else if (!day && dragFolder) {
    const list = $('#waiting-list');
    placeIndicator(list, [...list.querySelectorAll('.folder')].filter((el) => el.dataset.folder !== dragFolder), e.clientY);
  } else {
    indicator.remove();
  }
});

board.addEventListener('drop', (e) => {
  const zone = dropTarget(e);
  if (!zone || !(dragId || dragGroup || dragFolder)) return;
  e.preventDefault();
  const day = zone.dataset.day ?? null;
  const at = dropAt;
  if (dragFolder) {
    const id = dragFolder;
    clearDrag();
    return day ? dropFolder(id, day) : reorderFolder(id, at);
  }
  const moving = movingTasks();
  const fromGroup = !!dragGroup;
  clearDrag();
  if (!moving.length) return render();
  if (!day) return toSas(moving);
  // Une ligne d'un conteneur lâchée dans son propre jour : rien à faire (l'ordre se règle par conteneur).
  const t = moving[0];
  if (!fromGroup && t.day_of_week === day && tasks.filter((x) => x.day_of_week === day && clientKey(x) === clientKey(t)).length > 1) return render();
  placeInDay(moving, day, at);
});

// Place des tâches (une, ou tout un conteneur) dans un jour, leur conteneur à la position `at` ;
// renumérote les conteneurs de ce jour (group_rank 1..n). Les conteneurs entièrement cochés restent en bas (Lot 27).
function placeInDay(moving, day, at) {
  const key = clientKey(moving[0]);
  const prev = moving.map((t) => ({ t, day: t.day_of_week }));
  const ranks = tasks.map((t) => ({ t, rank: t.group_rank ?? null }));
  moving.forEach((t) => { t.day_of_week = day; });
  const groups = groupDay(tasks.filter((t) => t.day_of_week === day), labels);
  const order = doneLast(placeAt(groups.map((g) => g.key), key, at).map((k) => groups.find((g) => g.key === k)));
  const patches = rankPatches(order);
  patches.forEach((p) => p.ids.forEach((id) => { tasks.find((t) => t.id === id).group_rank = p.rank; }));
  const changedDay = prev.filter((x) => x.day !== day).map((x) => x.t.id);
  render();
  run(async () => {
    if (changedDay.length) await api('tasks', `?id=in.(${changedDay.join(',')})`, { method: 'PATCH', body: { day_of_week: day } });
    for (const p of patches) await api('tasks', `?id=in.(${p.ids.join(',')})`, { method: 'PATCH', body: { group_rank: p.rank } });
  }, () => {
    prev.forEach((x) => { x.t.day_of_week = x.day; });
    ranks.forEach((x) => { x.t.group_rank = x.rank; });
  });
}

// Tâches (ou conteneur) lâchées sur le sas : rangées dans le dossier de leur projet.
function toSas(moving) {
  const prev = moving.map((t) => ({ t, day: t.day_of_week }));
  const ids = moving.filter((t) => t.day_of_week).map((t) => t.id);
  if (!ids.length) return render();
  moving.forEach((t) => { t.day_of_week = null; });
  render();
  run(() => api('tasks', `?id=in.(${ids.join(',')})`, { method: 'PATCH', body: { day_of_week: null } }),
    () => prev.forEach((x) => { x.t.day_of_week = x.day; }));
}

// Dossier du sas lâché dans le sas : nouvelle position, renumérotation des dossiers (sas_position 1..n).
function reorderFolder(projectId, at) {
  const ordered = sortFolders(waitingProjects(projects, tasks));
  const keys = placeAt(ordered.map((p) => p.id), projectId, at);
  const next = keys.map((id) => ordered.find((p) => p.id === id));
  const patches = folderPatches(next);
  if (!patches.length) return render();
  const prev = next.map((p) => ({ p, pos: p.sas_position ?? null }));
  patches.forEach((x) => { projects.find((p) => p.id === x.id).sas_position = x.sas_position; });
  render();
  run(async () => {
    for (const x of patches) await api('projects', `?id=eq.${x.id}`, { method: 'PATCH', body: { sas_position: x.sas_position } });
  }, () => prev.forEach((x) => { x.p.sas_position = x.pos; }));
}

// Dépôt d'un projet du sas sur un jour : toutes ses tâches rangées sont planifiées ce jour-là.
function dropFolder(projectId, day) {
  dragFolder = null;
  if (!day) return render();
  const parked = tasks.filter((t) => t.project_id === projectId && !t.day_of_week);
  if (!parked.length) {
    // Dossier vide : on prépare l'ajout d'une tâche pour ce projet, sur ce jour.
    prefillAdd(projects.find((x) => x.id === projectId), day);
    toast(`Aucune tâche rangée : ajoute-en une pour ${day}`);
    return render();
  }
  parked.forEach((t) => { t.day_of_week = day; t.group_rank = null; });
  render();
  run(
    () => api('tasks', `?project_id=eq.${projectId}&day_of_week=is.null`, { method: 'PATCH', body: { day_of_week: day, group_rank: null } }),
    () => parked.forEach((t) => { t.day_of_week = null; })
  );
}

function prefillAdd(project, day) {
  const f = $('#add-form');
  f.client_name.value = project.clients.name;
  f.project_name.value = project.name;
  if (day) f.day_of_week.value = day;
  f.task_name.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Nouvelle semaine
// Archive les tâches terminées (sauf `keepIds`, gardées dans le planning) et ramène le reste sur Lundi.
// La semaine n'est enregistrée (instantané + rattachement des tâches) que si au moins une tâche est archivée.
function startNewWeek(keepIds = []) {
  const now = new Date();
  const archivedAt = now.toISOString();
  const waitingConsigned = consignedPending(history); // consignées depuis la dernière clôture : comptées dans cette semaine
  const stats = weekSnapshot(tasks, keepIds, waitingConsigned);
  // Occurrences récurrentes non terminées : elles restent sur leur jour.
  const stayIds = tasks.filter((t) => !t.is_completed && t.day_of_week && activeSeriesOf(t)).map((t) => t.id);
  const next = newWeek(tasks, history, archivedAt, keepIds, stayIds);
  const due = dueOccurrences(recurrences, next.tasks, comingMonday(now)).map(occurrenceRow).filter(Boolean);
  const keep = keepIds.length ? `&id=not.in.(${keepIds.join(',')})` : '';
  const stay = stayIds.length ? `&id=not.in.(${stayIds.join(',')})` : '';
  const snapshot = { tasks, history, weeks };
  const dayOrder = mergeOrder(DAYS.map((d) => groupDay(tasks.filter((t) => t.day_of_week === d), labels).map((g) => g.key)));
  ({ tasks, history } = next);
  // Lundi : conteneurs renumérotés selon leur ordre d'origine (Lundi d'abord, puis Mardi…).
  const monday = groupDay(tasks.filter((t) => t.day_of_week === 'Lundi'), labels);
  const mondayPatches = next.moving
    ? rankPatches(dayOrder.map((k) => monday.find((g) => g.key === k)).filter(Boolean))
    : [];
  mondayPatches.forEach((p) => p.ids.forEach((id) => { tasks.find((t) => t.id === id).group_rank = p.rank; }));
  render();
  let week = null;
  run(
    async () => {
      if (next.finished || waitingConsigned.length) {
        [week] = await api('weeks', '', { method: 'POST', body: { closed_at: archivedAt, ...stats }, prefer: 'return=representation' });
        try {
          await api('tasks', `?is_completed=eq.true&archived_at=is.null${keep}`, { method: 'PATCH', body: { archived_at: archivedAt, week_id: week.id } });
          if (waitingConsigned.length) await api('tasks', '?consigned_at=not.is.null&week_id=is.null', { method: 'PATCH', body: { week_id: week.id } });
        } catch (ex) { // tâches non archivées : la semaine enregistrée n'a plus lieu d'être
          await api('weeks', `?id=eq.${week.id}`, { method: 'DELETE' }).catch(() => {});
          throw ex;
        }
        weeks = [week, ...weeks];
        history.forEach((t) => { if (t.archived_at === archivedAt) t.week_id = week.id; });
        waitingConsigned.forEach((t) => { t.week_id = week.id; });
        render();
      }
      if (next.moving) {
        await api('tasks', `?is_completed=eq.false&archived_at=is.null&day_of_week=not.is.null${stay}`, { method: 'PATCH', body: { day_of_week: 'Lundi' } });
        if (keepIds.length) {
          await api('tasks', `?id=in.(${keepIds.join(',')})&day_of_week=not.is.null`, { method: 'PATCH', body: { day_of_week: 'Lundi' } });
        }
        for (const p of mondayPatches) await api('tasks', `?id=in.(${p.ids.join(',')})`, { method: 'PATCH', body: { group_rank: p.rank } });
      }
      if (due.length) {
        const created = await db.insert(due);
        tasks = tasks.concat(created);
        render();
      }
      const notes = [
        keepIds.length && `${keepIds.length} tâche${keepIds.length > 1 ? 's' : ''} gardée${keepIds.length > 1 ? 's' : ''} dans le planning`,
        due.length && `${due.length} tâche${due.length > 1 ? 's' : ''} récurrente${due.length > 1 ? 's' : ''} ajoutée${due.length > 1 ? 's' : ''}`,
      ].filter(Boolean);
      if (notes.length) toast(notes.join(' · '));
    },
    () => { ({ tasks, history, weeks } = snapshot); }
  );
}

const weekDialog = $('#week-dialog');
let weekPending = [];

$('#new-week').addEventListener('click', () => {
  weekPending = finishedWithPending(tasks, comments);
  const finished = tasks.filter((t) => t.is_completed).length;
  const consigned = consignedPending(history).length;
  const s = (n) => (n > 1 ? 's' : '');
  if (!weekPending.length) {
    const recorded = finished || consigned;
    const parts = [finished && `archiver ${plural(finished, 'tâche')} terminée${s(finished)}`,
      consigned && `compter ${plural(consigned, 'tâche')} déjà consignée${s(consigned)}`].filter(Boolean);
    const question = recorded
      ? `Nouvelle semaine : ${parts.join(' et ')}, enregistrer la semaine dans l’historique et ramener les autres sur Lundi ?`
      : 'Aucune tâche terminée : rien à archiver, aucune semaine ne sera enregistrée. Ramener les tâches planifiées sur Lundi ?';
    askConfirm({ title: 'Nouvelle semaine', message: question, confirmLabel: recorded ? 'Archiver et continuer' : 'Ramener sur Lundi' })
      .then((ok) => { if (ok) startNewWeek(); });
    return;
  }
  $('#week-pending').innerHTML = weekPending.map(({ task: t, count }) => `
    <li class="flex items-center gap-2 px-3 py-2 text-sm">
      <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(t.task_name)}</span>
        <span class="block truncate text-xs text-slate-500">${esc(taskClient(t))} · ${esc(taskProject(t))}</span></span>
      <span class="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 tabular-nums">${BUBBLE}${count}</span>
    </li>`).join('');
  const others = finished - weekPending.length;
  $('#week-summary').textContent = `${finished} tâche${s(finished)} terminée${s(finished)} au total`
    + (others > 1 ? ` : les ${others} autres seront archivées dans tous les cas.`
      : others ? ' : l’autre sera archivée dans tous les cas.' : '.')
    + (consigned ? ` ${plural(consigned, 'tâche')} déjà consignée${s(consigned)} ${consigned > 1 ? 'seront aussi comptées' : 'sera aussi comptée'} dans la semaine.` : '');
  $('#week-keep').title = weekPending.length > 1 ? 'Garder ces tâches dans le planning cette semaine' : 'Garder cette tâche dans le planning cette semaine';
  weekDialog.showModal();
});

weekDialog.addEventListener('click', (e) => { if (e.target === weekDialog) weekDialog.close(); });
$('#week-cancel').addEventListener('click', () => weekDialog.close());
$('#week-archive').addEventListener('click', () => { weekDialog.close(); startNewWeek(); });
$('#week-keep').addEventListener('click', () => { weekDialog.close(); startNewWeek(weekPending.map((x) => x.task.id)); });

$('#toggle-links').addEventListener('click', () => {
  showLinks = !showLinks;
  try { localStorage.setItem(LINKS_KEY, showLinks ? 'on' : 'off'); } catch { /* stockage indisponible */ }
  render();
});

// Import JSON
$('#import-json').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (e) => {
  const input = e.target;
  const file = input.files[0];
  if (!file) return;
  try {
    showError('');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('Fichier invalide : ce n’est pas du JSON valide.');
    }
    const list = Array.isArray(data) ? data : [data];
    if (!list.length) throw new Error('Le fichier ne contient aucune tâche.');
    const rows = list.map(normalizeTask);
    for (const row of rows) {
      const project = await ensureProject(row.client_name, row.project_name);
      row.project_id = project.id;
      row.client_name = project.clients.name;
      row.project_name = project.name;
    }
    const created = await db.insert(rows);
    tasks = await db.list().catch(() => tasks.concat(created));
    render();
    toast(`${created.length} tâche${created.length > 1 ? 's' : ''} importée${created.length > 1 ? 's' : ''}`);
  } catch (err) {
    console.error(err);
    const offline = err instanceof TypeError;
    toast(offline ? 'Erreur réseau : import impossible, réessaie.' : err.message, 'error');
  } finally {
    input.value = ''; // permet de ré-importer le même fichier
  }
});

// Édition d'une tâche (<dialog> natif : focus piégé, Échap, aria-modal gérés par le navigateur)
const editDialog = $('#edit-dialog');
const editForm = $('#edit-form');

function openEdit(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  editForm.dataset.id = id;
  editForm.client_name.value = taskClient(t);
  editForm.project_name.value = taskProject(t);
  editForm.task_name.value = t.task_name;
  editForm.estimated_hours.value = t.estimated_hours;
  editForm.actual_hours.value = t.actual_hours ?? '';
  editForm.day_of_week.value = t.day_of_week ?? '';
  editForm.start_time.value = t.start_time ?? '';
  editForm.meeting_url.value = t.meeting_url ?? '';
  renderLabelPicker(editForm, t.label_ids ?? []);
  const series = activeSeriesOf(t);
  editForm.recurrence.value = series?.frequency ?? '';
  editForm.monthly_rank.value = String(series?.monthly_rank ?? 1);
  editForm.apply_series.checked = true;
  editForm.querySelector('[data-apply-series]').classList.toggle('hidden', !series);
  syncRecurrenceFields(editForm, { prefill: !series });
  $('#edit-error').classList.add('hidden');
  editDialog.showModal();
  editForm.task_name.focus();
}

editDialog.addEventListener('click', (e) => { if (e.target === editDialog) editDialog.close(); });
$('#edit-delete').addEventListener('click', async () => {
  editDialog.close();
  const deleted = await deleteTaskForever(editForm.dataset.id);
  if (!deleted) editDialog.showModal(); // annulation : on revient à l'édition
});
$('#edit-cancel').addEventListener('click', () => editDialog.close());

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#edit-error');
  err.classList.add('hidden');
  try {
    // Sans étiquette « réunion », l'heure et le lien déjà saisis sont conservés (masqués).
    const meeting = meetingInput(f);
    const rule = recurrenceInput(f);
    const t = tasks.find((x) => x.id === f.dataset.id);
    const project = await ensureProject(f.client_name.value, f.project_name.value);
    const fields = {
      label_ids: formLabels(f),
      ...(meeting || {}),
      project_id: project.id,
      client_name: project.clients.name,
      project_name: project.name,
      task_name: f.task_name.value.trim(),
      estimated_hours: parseFloat(f.estimated_hours.value) || 0,
      actual_hours: parseOptionalHours(f.actual_hours.value),
      day_of_week: f.day_of_week.value || null,
      ...((f.day_of_week.value || null) !== t.day_of_week ? { group_rank: null } : {}),
    };
    // Modèle de série = la tâche telle qu'enregistrée (heure et lien conservés s'ils sont masqués).
    const template = {
      project_id: fields.project_id,
      task_name: fields.task_name,
      estimated_hours: fields.estimated_hours,
      label_ids: fields.label_ids,
      start_time: fields.start_time ?? t.start_time ?? null,
      meeting_url: fields.meeting_url ?? t.meeting_url ?? null,
    };
    const series = activeSeriesOf(t);
    if (!series && rule) {
      fields.recurrence_id = (await createSeries(rule, template)).id;
    } else if (series && !rule) { // « Aucune » : la répétition s'arrête, l'occurrence reste
      await api('recurrences', `?id=eq.${series.id}`, { method: 'PATCH', body: { active: false } });
      series.active = false;
    } else if (series && rule) {
      const patch = f.apply_series.checked
        ? { ...rule, ...template }
        : { frequency: rule.frequency, monthly_rank: rule.monthly_rank };
      await api('recurrences', `?id=eq.${series.id}`, { method: 'PATCH', body: patch });
      Object.assign(series, patch);
    }
    const updated = await db.updateFull(f.dataset.id, fields);
    tasks = tasks.map((x) => (x.id === updated.id ? updated : x));
    editDialog.close();
    render();
    toast('Tâche modifiée');
  } catch (ex) {
    console.error(ex);
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

// Sas d'attente
$('#waiting').addEventListener('click', (e) => {
  if (openResult(e.target)) return;
  const openId = e.target.closest('[data-open]')?.dataset.open;
  const finishId = e.target.closest('[data-finish]')?.dataset.finish;
  if (openId) {
    goProject(openId);
  } else if (finishId) {
    finishProject(finishId);
  }
});

// Archivage d'un projet depuis le sas, après confirmation.
async function finishProject(finishId) {
  const p = projects.find((x) => x.id === finishId);
  const n = parkedTasks(tasks, finishId).length;
  const ok = await askConfirm({
    title: `Archiver le projet « ${p.name} » ?`,
    message: 'Il quitte le sas et rejoint l’onglet Archives, d’où tu pourras le rouvrir.'
      + (n > 1 ? `\nSes ${n} tâches rangées resteront rattachées au projet.`
        : n ? '\nSa tâche rangée restera rattachée au projet.' : ''),
    confirmLabel: 'Archiver le projet',
  });
  if (!ok) return;
  const prev = p.status;
  p.status = 'termine';
  render();
  run(() => api('projects', `?id=eq.${finishId}`, { method: 'PATCH', body: { status: 'termine' } }), () => { p.status = prev; });
}

// Détail d'un projet : tâches rattachées, temps total, édition du nom
const projectDialog = $('#project-dialog');
const projectEditForm = $('#project-edit-form');

function goProject(id) { location.hash = `#projets/${id}`; }

// Édition rapide : nom, année, type, estimé, devis et liens d'accès rapide.
function editProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  projectEditForm.dataset.id = id;
  projectEditForm.project_name.value = p.name;
  projectEditForm.year.value = p.year ?? '';
  projectEditForm.type.value = p.type ?? '';
  projectEditForm.estimated_hours.value = p.estimated_hours ?? '';
  fillTypeList();
  projectEditForm.quote_label.value = p.quote_label ?? '';
  projectEditForm.quote_url.value = p.quote_url ?? '';
  $('#project-error').classList.add('hidden');
  $('#project-client').textContent = p.clients.name;
  $('#project-view').classList.toggle('hidden', currentRoute() === 'projets' && routeParam(location.hash) === id); // déjà sur la fiche
  renderProjectLinks(p);
  if (!projectDialog.open) projectDialog.showModal();
}

// Heures prévues d'une tâche, suivies du temps passé s'il diffère (ambre au-delà du prévu).
const hoursHTML = (t) => `<span class="shrink-0 text-xs font-medium tabular-nums">${fmtH(t.estimated_hours)}${t.actual_hours != null && +t.actual_hours !== +t.estimated_hours
  ? ` <span class="${+t.actual_hours > +t.estimated_hours ? 'text-amber-700' : 'text-slate-500'}" title="Temps passé" data-lot="Lot 22">→ ${fmtH(t.actual_hours)}</span>` : ''}</span>`;

projectDialog.addEventListener('click', (e) => { if (e.target === projectDialog) projectDialog.close(); });
$('#project-close').addEventListener('click', () => projectDialog.close());
$('#project-view').addEventListener('click', () => {
  const id = projectEditForm.dataset.id;
  projectDialog.close();
  goProject(id);
});

// ---------- Page projet (#projets/<id>) ----------
const PAST_VISIBLE = 5;
let ppFor = ''; // projet affiché : en changer replie l'historique
let ppShowPast = false;
const currentProjectId = () => (currentRoute() === 'projets' ? routeParam(location.hash) : '');

function ppTaskHTML(t, detail) {
  const list = taskComments(t.id);
  const done = t.is_completed;
  return `
    <li class="py-2 border-t border-slate-100 first:border-0">
      <div class="flex items-start gap-2.5">
        <input type="checkbox" class="chk mt-0.5" ${done ? 'checked' : ''} disabled aria-label="${done ? 'Terminée' : 'À faire'}" title="Se coche dans le Planning" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm ${done ? 'text-slate-400 line-through' : ''}">${esc(t.task_name)}</span>
          ${labelChipsHTML(t) ? `<span class="mt-0.5 flex flex-wrap gap-1">${labelChipsHTML(t)}</span>` : ''}
          <span class="block text-xs text-slate-500">${esc(detail)}</span>
        </span>
        ${hoursHTML(t)}
      </div>
      ${list.length ? `<ul class="mt-1 pl-[26px] space-y-1" data-lot="Lot 20">${list.map(commentHTML).join('')}</ul>` : ''}
    </li>`;
}

function ppGroupHTML(title, count, note, items, footer = '') {
  return `
    <section>
      <h4 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">${title}
        <span class="font-medium text-slate-400 tabular-nums">${count}</span>
        ${note ? `<span class="font-normal normal-case tracking-normal text-slate-400">${note}</span>` : ''}</h4>
      <ul class="mt-1">${items.join('')}</ul>${footer}
    </section>`;
}

function renderProjectPage() {
  const onPage = currentRoute() === 'projets';
  const p = projects.find((x) => x.id === currentProjectId());
  $('#project-page').classList.toggle('hidden', !p);
  $('#pp-missing').classList.toggle('hidden', !(onPage && !p && projects.length));
  if (!p) return;
  if (ppFor !== p.id) { ppFor = p.id; ppShowPast = false; }
  const o = projectOverview(p, tasks, history);
  const done = p.status === 'termine';

  $('#pp-back').href = `#clients/${p.client_id}`;
  $('#pp-back').textContent = `← ${p.clients.name}`;
  $('#pp-title').textContent = p.name;
  const status = $('#pp-status');
  status.textContent = done ? 'Terminé' : o.over ? 'Estimé dépassé' : 'En cours';
  status.className = `text-[11px] font-medium rounded px-1.5 py-0.5 ${done ? 'bg-slate-100 text-slate-600' : o.over ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`;
  $('#pp-meta').textContent = [p.clients.name, p.type, p.year].filter(Boolean).join(' · ');
  const ls = linksOf(p, links);
  $('#pp-links').innerHTML = ls.map(clientLinkChip).join('');
  $('#pp-archive').textContent = done ? 'Rouvrir' : 'Archiver';

  $('#pp-stats').innerHTML = [
    statTile('Tâches', String(o.count), o.count ? `${o.todo} à faire · ${plural(o.done, 'terminée')}` : 'aucune tâche'),
    statTile('Planifié', fmtH(o.planned), o.count ? `réparti sur ${plural(o.count, 'tâche')}` : 'rien de planifié'),
    statTile('Temps passé', fmtH(o.spent), o.estimated !== null ? `sur ${fmtH(o.estimated)} estimées · ${Math.round((o.spent / o.estimated) * 100)} %` : 'aucun estimé renseigné',
      { bar: o.estimated !== null ? o.pct : null }),
    o.estimated === null ? statTile('Reste sur l’estimé', '—', 'aucun estimé renseigné')
      : o.over ? statTile('Estimé dépassé', `+${fmtH(o.excess)}`, 'au-delà de l’estimé', { alert: true })
        : statTile('Reste sur l’estimé', fmtH(o.remaining), 'estimé − temps passé'),
  ].join('');

  $('#pp-count').textContent = o.count;
  const g = o.groups;
  const past = ppShowPast ? g.past : g.past.slice(0, PAST_VISIBLE);
  const hidden = g.past.length - PAST_VISIBLE;
  $('#pp-tasks').innerHTML = [
    g.todo.length ? ppGroupHTML('À faire', g.todo.length, '', g.todo.map((t) => ppTaskHTML(t, t.day_of_week || 'Sas'))) : '',
    g.done.length ? ppGroupHTML('Terminées', g.done.length, 'dans le planning', g.done.map((t) => ppTaskHTML(t, t.day_of_week || 'Sas'))) : '',
    g.past.length ? ppGroupHTML('Historique', g.past.length, 'archivées', past.map((t) => ppTaskHTML(t, fmtDate(t.archived_at, SHORT_DATE))),
      hidden > 0 ? `<div class="pt-2 border-t border-slate-100"><button type="button" data-pp-past class="text-xs text-slate-500 hover:text-slate-900 px-1 py-1 transition">${ppShowPast ? 'Réduire l’historique' : `Afficher les ${hidden} autres`}</button></div>` : '') : '',
  ].join('') || '<p class="text-sm text-slate-400">Aucune tâche rattachée.</p>';

  $('#pp-quick').innerHTML = ls.map((l) => `
    <li class="flex items-center gap-2 py-1.5 border-t border-slate-100 first:border-0">
      ${clientLinkChip(l)}
      <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1 truncate text-xs text-slate-500 hover:text-slate-900 transition">${esc(hostOf(l.url))}</a>
      <span aria-hidden="true" class="text-xs text-slate-400">↗</span>
    </li>`).join('') || '<li class="py-1.5 text-sm text-slate-400">Aucun lien pour le moment.</li>';

  const row = (k, v) => `<div class="flex items-center justify-between gap-3 py-1"><dt class="text-xs text-slate-500">${k}</dt><dd class="min-w-0 truncate text-right text-sm font-medium">${v}</dd></div>`;
  $('#pp-info').innerHTML = [
    row('Client', `<a href="#clients/${p.client_id}" class="hover:underline">${esc(p.clients.name)}</a>`),
    row('Type', p.type ? esc(p.type) : '—'),
    row('Année', p.year ?? '—'),
    row('Temps estimé', p.estimated_hours == null ? '—' : fmtH(p.estimated_hours)),
    row('Devis', p.quote_url ? `<a href="${esc(p.quote_url)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${esc(p.quote_label || 'Devis')}</a>` : '—'),
  ].join('');
}

$('#pp-edit').addEventListener('click', () => editProject(currentProjectId()));
$('#pp-add-link').addEventListener('click', () => { editProject(currentProjectId()); $('#link-form').label.focus(); });
$('#pp-add').addEventListener('click', () => {
  const p = projects.find((x) => x.id === currentProjectId());
  if (!p) return;
  window.addEventListener('hashchange', () => prefillAdd(p), { once: true }); // le planning est affiché quand la saisie est préremplie
  location.hash = '#planning';
});
$('#pp-archive').addEventListener('click', () => {
  const p = projects.find((x) => x.id === currentProjectId());
  if (!p) return;
  if (p.status === 'termine') reopenProject(p.id); else finishProject(p.id);
});
$('#projets-view').addEventListener('change', (e) => {
  const id = e.target.dataset.commentToggle;
  if (id) toggleComment(id, e.target.checked);
});
$('#projets-view').addEventListener('click', (e) => {
  if (onCommentEdit(e)) return;
  if (e.target.closest('[data-pp-past]')) { ppShowPast = !ppShowPast; renderProjectPage(); }
});

// Liens d'accès rapide d'un projet (devis compris, en tête)
const linkHTML = (label, url, extra = '') => `
  <li class="flex items-center gap-2 text-sm">
    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
       class="min-w-0 flex-1 truncate text-slate-700 underline decoration-slate-300 hover:decoration-slate-700">${esc(label)}</a>
    ${extra}
  </li>`;

function renderProjectLinks(p) {
  $('#project-links').innerHTML = linksOf(p, links).map((l) => linkHTML(l.label, l.url, l.quote
    ? '<span class="text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Devis</span>'
    : `<button type="button" class="text-slate-300 hover:text-red-500 text-base leading-none transition" data-delete-link="${l.id}"
             title="Supprimer le lien" aria-label="Supprimer le lien ${esc(l.label)}">×</button>`)).join('')
    || '<li class="text-sm text-slate-400">Aucun lien pour le moment.</li>';
}

$('#link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#project-error');
  err.classList.add('hidden');
  try {
    const url = normalizeUrl(f.url.value);
    if (!url) throw new Error('Le lien est obligatoire.');
    const [created] = await api('project_links', '', {
      method: 'POST',
      body: { project_id: projectEditForm.dataset.id, label: f.label.value.trim(), url },
      prefer: 'return=representation',
    });
    links.push(created);
    f.reset();
    renderProjectLinks(projects.find((x) => x.id === projectEditForm.dataset.id));
    render();
    f.label.focus();
  } catch (ex) {
    console.error(ex);
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

$('#project-links').addEventListener('click', async (e) => {
  const id = e.target.dataset.deleteLink;
  if (!id) return;
  const snapshot = links;
  links = links.filter((l) => l.id !== id);
  renderProjectLinks(projects.find((x) => x.id === projectEditForm.dataset.id));
  render();
  run(() => api('project_links', `?id=eq.${id}`, { method: 'DELETE' }), () => { links = snapshot; });
});

projectEditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#project-error');
  err.classList.add('hidden');
  const p = projects.find((x) => x.id === f.dataset.id);
  const name = f.project_name.value.trim();
  try {
    if (!name) throw new Error('Le nom du projet est obligatoire.');
    if (projects.some((x) => x.id !== p.id && x.client_id === p.client_id && same(x.name, name))) {
      throw new Error('Ce client a déjà un projet portant ce nom.');
    }
    const year = parseYear(f.year.value);
    const quoteUrl = normalizeUrl(f.quote_url.value);
    const quoteLabel = f.quote_label.value.trim();
    if (quoteLabel && !quoteUrl) throw new Error('Renseigne le lien du devis.');
    const patch = { name, year, estimated_hours: parseOptionalHours(f.estimated_hours.value), type: canonicalType(f.type.value), quote_label: quoteUrl ? quoteLabel : null, quote_url: quoteUrl || null };
    await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: patch });
    if (name !== p.name) {
      await api('tasks', `?project_id=eq.${p.id}`, { method: 'PATCH', body: { project_name: name } });
      tasks.concat(history).forEach((t) => {
        if (t.project_id !== p.id) return;
        t.project_name = name;
        if (t.projects) t.projects.name = name;
      });
    }
    Object.assign(p, patch);
    projectDialog.close();
    render();
    toast('Projet enregistré');
  } catch (ex) {
    console.error(ex);
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

// Suppression définitive depuis les Archives (Lot 24), toujours confirmée.
const archiveState = () => ({ projects, tasks, history, comments, links, recurrences });
const applyArchiveState = (st) => ({ projects, tasks, history, comments, links, recurrences } = st);

async function deleteArchivedProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p || !canDeleteProject(p)) return;
  const parts = deletionParts(projectDeletion(archiveState(), id));
  const ok = await askConfirm({
    title: `Supprimer définitivement « ${p.name} » ?`,
    message: `Le projet de ${p.clients.name}${parts.length ? ` sera supprimé avec ${parts.join(', ')}` : ' sera supprimé'}. Cette action est irréversible.`
      + (parts.length ? '\nLes semaines déjà closes gardent leurs chiffres ; seul le détail de leurs tâches supprimées disparaît.' : ''),
    confirmLabel: 'Supprimer définitivement',
    danger: true,
  });
  if (!ok) return;
  const snapshot = archiveState();
  applyArchiveState(withoutProject(snapshot, id));
  render();
  run(
    async () => { await api('projects', `?id=eq.${id}`, { method: 'DELETE' }); toast(`Projet « ${p.name} » supprimé`); },
    () => applyArchiveState(snapshot)
  );
}

async function deleteConsignedTask(id) {
  const t = history.find((x) => x.id === id);
  if (!t) return;
  const n = taskComments(id).length;
  const ok = await askConfirm({
    title: 'Supprimer définitivement la tâche ?',
    message: `« ${t.task_name} » sera supprimée${n > 1 ? ` avec ses ${n} commentaires` : n ? ' avec son commentaire' : ''}. Cette action est irréversible.`
      + (t.week_id ? '\nLa semaine close qui la compte garde ses chiffres, mais la tâche disparaîtra de son détail.' : ''),
    confirmLabel: 'Supprimer définitivement',
    danger: true,
  });
  if (!ok) return;
  const snapshot = archiveState();
  applyArchiveState(withoutTask(snapshot, id));
  render();
  run(async () => { await db.remove(id); toast('Tâche supprimée'); }, () => applyArchiveState(snapshot));
}

// Archives : rouvrir un projet terminé (il retourne dans le sas s'il n'a pas de tâche planifiée)
function reopenProject(id) {
  const p = projects.find((x) => x.id === id);
  const prev = p.status;
  p.status = 'en_cours';
  render();
  run(() => api('projects', `?id=eq.${id}`, { method: 'PATCH', body: { status: 'en_cours' } }), () => { p.status = prev; });
}

[$('#archives-view'), $('#clients-view')].forEach((view) => view.addEventListener('click', (e) => {
  const reopen = e.target.dataset.reopen;
  if (reopen) return reopenProject(reopen);
  const unconsign = e.target.dataset.unconsign;
  if (unconsign) return unconsignTask(unconsign);
  const delProject = e.target.dataset.deleteProject;
  if (delProject) return deleteArchivedProject(delProject);
  const delConsigned = e.target.dataset.deleteConsigned;
  if (delConsigned) return deleteConsignedTask(delConsigned);
  const open = e.target.closest('[data-open-project]')?.dataset.openProject;
  if (open) goProject(open);
}));

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  let hours;
  try { hours = parseOptionalHours(f.estimated_hours.value); } catch (ex) { toast(ex.message, 'error'); return; }
  run(async () => {
    const p = await ensureProject(f.client_name.value, f.project_name.value, hours);
    if (p.status !== 'en_cours') {
      await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: { status: 'en_cours' } });
      p.status = 'en_cours';
    }
    // Projet déjà connu mais sans estimé : l'estimé saisi lui est attribué.
    if (hours != null && p.estimated_hours == null) {
      await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: { estimated_hours: hours } });
      p.estimated_hours = hours;
    }
    f.reset();
    render();
  });
});

// ---------- Historique des semaines ----------
const fmtDate = (iso, opts) => new Date(iso).toLocaleDateString('fr-FR', opts);
const LONG_DATE = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const SHORT_DATE = { day: 'numeric', month: 'short' };
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function renderHistory() {
  const list = weekPeriods(weeks);
  $('#weeks-count').textContent = list.length;
  $('#weeks-list').innerHTML = list.length
    ? list.map(weekHTML).join('')
    : '<p class="text-sm text-slate-400">Aucune semaine enregistrée : « Nouvelle Semaine » en crée une dès qu’une tâche terminée est archivée.</p>';
}

function weekHTML(w) {
  const done = weekTasks(history, w);
  const pending = done.reduce((n, t) => n + pendingCount(comments, t.id), 0);
  const max = Math.max(...w.by_client.map((c) => +c.hours || 0), 0);
  const carried = w.carried_count == null
    ? '<span class="text-slate-400" title="Semaine reprise de l’existant : les reports n’étaient pas encore enregistrés">Reports non connus</span>'
    : `${plural(w.carried_count, 'reportée')} · ${fmtH(w.carried_hours)}`;
  // Tâches de la semaine, groupées par client · projet
  const groups = new Map();
  done.forEach((t) => {
    const key = `${t.client_name} · ${t.project_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return `
    <details class="group bg-white border border-slate-200 rounded-xl shadow-sm" data-week="${w.id}" ${openWeeks.has(w.id) ? 'open' : ''}>
      <summary class="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span class="min-w-0 flex-1 basis-56">
          <span class="block text-sm font-semibold first-letter:uppercase">Semaine close le ${esc(fmtDate(w.closed_at, LONG_DATE))}</span>
          <span class="block text-xs text-slate-500">${w.from ? `Du ${esc(fmtDate(w.from, SHORT_DATE))} au ${esc(fmtDate(w.closed_at, SHORT_DATE))}` : 'Première semaine enregistrée'}</span>
        </span>
        <span class="text-xs text-slate-600 tabular-nums">${plural(w.finished_count, 'terminée')} · ${fmtH(w.finished_hours)}</span>
        <span class="text-xs text-slate-600 tabular-nums">${carried}</span>
        ${pending ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 tabular-nums"
          title="${plural(pending, 'commentaire')} non traité${pending > 1 ? 's' : ''}">${BUBBLE}${pending}</span>` : ''}
        <span class="text-slate-400 transition group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <div class="border-t border-slate-100 p-4 space-y-4">
        ${w.by_client.length ? `
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Temps par client</h3>
          <ul class="space-y-1.5">${w.by_client.map((c) => `
            <li class="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
              <span class="truncate">${esc(c.client)}</span>
              <span class="h-2 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full bg-slate-900" style="width:${max ? Math.round((+c.hours / max) * 100) : 0}%"></span></span>
              <span class="text-xs text-slate-600 tabular-nums">${plural(c.count, 'tâche')} · ${fmtH(c.hours)}</span>
            </li>`).join('')}
          </ul>
        </div>` : ''}
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tâches terminées</h3>
          ${done.length ? [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => `
            <p class="text-xs font-medium text-slate-500 mt-3 first:mt-0">${esc(key)}</p>
            <ul class="divide-y divide-slate-100">${list.map((t) => {
              const cs = taskComments(t.id);
              return `
              <li class="py-1.5">
                <div class="flex items-center gap-2 text-sm">
                  <span class="min-w-0 flex-1 truncate">${esc(t.task_name)}</span>
                  ${labelChipsHTML(t)}
                  ${hoursHTML(t)}
                  <button type="button" data-lot="Lot 21" data-duplicate-history="${t.id}"
                    class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 focus-visible:text-slate-900 transition"
                    title="Dupliquer dans le sas d’attente (semaine active)" aria-label="Dupliquer « ${esc(t.task_name)} » dans le sas d’attente">${COPY_ICON}</button>
                </div>
                ${cs.length ? `<ul class="mt-1 pl-3 space-y-1">${cs.map(commentHTML).join('')}</ul>` : ''}
              </li>`;
            }).join('')}</ul>`).join('')
          : '<p class="text-sm text-slate-400">Les tâches de cette semaine ont été supprimées.</p>'}
        </div>
      </div>
    </details>`;
}

// Garde les fiches dépliées d'un rendu à l'autre (l'évènement toggle ne remonte pas : capture).
$('#history-view').addEventListener('toggle', (e) => {
  const id = e.target.dataset?.week;
  if (!id) return;
  if (e.target.open) openWeeks.add(id); else openWeeks.delete(id);
}, true);
$('#history-view').addEventListener('change', (e) => {
  const id = e.target.dataset.commentToggle;
  if (id) toggleComment(id, e.target.checked);
});
$('#history-view').addEventListener('click', (e) => {
  const dup = e.target.closest('[data-duplicate-history]')?.dataset.duplicateHistory;
  if (dup) return duplicateTask(dup, null);
  onCommentEdit(e);
});

// ---------- Clients : liste et fiche (#clients/<id>) ----------
const initials = (name) => esc(initialsOf(name));
const logoHTML = (c, size) => c.logo
  ? `<img src="${esc(c.logo)}" alt="" class="${size} rounded-lg object-cover bg-white border border-slate-200" />`
  : `<span class="${size} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-400">${initials(c.name)}</span>`;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// Liste : recherche, filtre (Actifs par défaut, Tous s'il n'y a aucun client actif) et tri, conservés en mémoire.
const CLIENTS_LIST_FILTERS = [['actifs', 'Actifs'], ['inactifs', 'Inactifs'], ['tous', 'Tous']];
const clientsList = { query: '', filter: null, sort: 'nom' };

function clientCardHTML(k) {
  const c = k.client;
  const inactive = k.open === 0;
  const projets = !k.total ? 'Aucun projet' : `${k.open ? `${k.open} en cours` : 'Aucun en cours'} · ${plural(k.total, 'projet')}`;
  const semaine = k.week ? plural(k.week, 'tâche') : 'Aucune tâche';
  const over = k.overCount > 0;
  let time;
  if (inactive) time = `<span class="block text-xs text-slate-400">${k.lastDoneYear ? `Dernier projet terminé en ${k.lastDoneYear}` : '—'}</span>`;
  else if (k.estimated > 0) {
    const pct = Math.min(100, k.pct ?? 0);
    time = `<span class="block text-xs tabular-nums ${over ? 'font-medium text-amber-700' : 'text-slate-500'}">${fmtH(k.spent)} / ${fmtH(k.estimated)}</span>
      <span class="mt-1 block h-1 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
        aria-label="Temps passé sur l’estimé des projets en cours"><span class="block h-full rounded-full ${over ? 'bg-amber-500' : 'bg-slate-900'}" style="width:${pct}%"></span></span>`;
  } else time = `<span class="block text-xs text-slate-500 tabular-nums">${k.spent ? `${fmtH(k.spent)} · sans estimé` : '—'}</span>`;
  return `
      <li class="flex">
        <a href="#clients/${c.id}" class="flex-1 min-w-0 flex flex-col gap-3 border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition ${inactive ? 'bg-slate-50' : 'bg-white shadow-sm'}">
          <span class="flex items-center gap-3">
            <span class="${inactive ? 'opacity-60' : ''}">${logoHTML(c, 'w-12 h-12 shrink-0')}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium truncate ${inactive ? 'text-slate-500' : ''}">${esc(c.name)}</span>
              <span class="block text-xs text-slate-500 truncate">${c.website ? esc(hostOf(c.website)) : 'Pas de site web'}</span>
            </span>
            ${over ? `<span class="shrink-0 text-[11px] font-medium rounded px-1.5 py-0.5 bg-amber-50 text-amber-700" title="Projets dont l’estimé est dépassé">${k.overCount} dépassé${k.overCount > 1 ? 's' : ''}</span>` : ''}
          </span>
          <span class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-500">${projets}</span>
            <span class="${k.week && !inactive ? 'font-medium text-slate-700' : 'text-slate-400'}" title="Tâches planifiées cette semaine">${semaine}</span>
          </span>
          <span class="block">${time}</span>
        </a>
      </li>`;
}

function renderClients() {
  const id = currentRoute() === 'clients' ? routeParam(location.hash) : '';
  const client = clients.find((c) => c.id === id);
  $('#clients-index').classList.toggle('hidden', !!client);
  $('#client-page').classList.toggle('hidden', !client);
  $('#clients-count').textContent = clients.length;
  if (client) return renderClientPage(client);
  $('#client-edit-form').dataset.id = '';
  const list = clientsList;
  const probe = clientCards(clients, projects, tasks, history, { query: list.query, filter: 'tous' });
  const filter = list.filter ?? defaultClientFilter(probe.counts);
  const { cards, counts } = clientCards(clients, projects, tasks, history, { query: list.query, filter, sort: list.sort });
  $('#clients-filter').innerHTML = CLIENTS_LIST_FILTERS.map(([key, label]) => `
    <button type="button" data-clients-filter="${key}" aria-pressed="${filter === key}"
      class="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 aria-[pressed=true]:bg-slate-900 aria-[pressed=true]:text-white transition">${label} · ${counts[key]}</button>`).join('');
  $('#clients-sort').value = list.sort;
  $('#clients-result').textContent = list.query || filter !== 'tous' ? plural(cards.length, 'client') : '';
  $('#clients-grid').innerHTML = cards.map(clientCardHTML).join('')
    || `<li class="text-sm text-slate-400 sm:col-span-2 xl:col-span-3">${clients.length ? `Aucun client ne correspond.${list.query || filter !== 'tous' ? ' <button type="button" data-clients-reset class="underline hover:text-slate-900">Tout afficher</button>' : ''}` : 'Aucun client pour le moment.'}</li>`;
}

$('#clients-search').addEventListener('input', (e) => { clientsList.query = e.target.value; renderClients(); });
$('#clients-sort').addEventListener('change', (e) => { clientsList.sort = e.target.value; renderClients(); });
$('#clients-index').addEventListener('click', (e) => {
  const key = e.target.closest('[data-clients-filter]')?.dataset.clientsFilter;
  if (key) { clientsList.filter = key; return renderClients(); }
  if (e.target.closest('[data-clients-reset]')) {
    clientsList.query = ''; clientsList.filter = 'tous'; $('#clients-search').value = '';
    renderClients();
  }
});

const CLIENT_FILTERS = [['en_cours', 'En cours'], ['termine', 'Terminés'], ['tous', 'Tous']];
let clientFilter = 'en_cours'; // filtre de la liste des projets de la fiche
let clientFilterFor = ''; // client auquel il s'applique : changer de fiche le réinitialise

function statTile(label, value, detail, { alert = false, bar = null } = {}) {
  return `
    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <dt class="text-xs font-medium text-slate-500">${esc(label)}</dt>
      <dd class="mt-1 text-2xl font-semibold tracking-tight tabular-nums ${alert ? 'text-amber-700' : ''}">${esc(value)}</dd>
      <dd class="mt-0.5 text-xs ${alert ? 'text-amber-700' : 'text-slate-500'}">${esc(detail)}</dd>
      ${bar === null ? '' : `<div class="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${bar}"
        aria-label="Temps passé sur l’estimé"><div class="h-full rounded-full bg-slate-900" style="width:${Math.min(100, bar)}%"></div></div>`}
    </div>`;
}

function clientStatsHTML(o) {
  const worst = o.over[0];
  const week = o.week;
  return [
    statTile('Projets en cours', String(o.open), `sur ${plural(o.total, 'projet')}`),
    statTile('Temps passé · projets en cours', fmtH(o.spent),
      o.estimated > 0 ? `sur ${fmtH(o.estimated)} estimées · ${o.pct} %` : 'aucun estimé renseigné',
      { bar: o.estimated > 0 ? o.pct : null }),
    worst
      ? statTile('Estimé dépassé', plural(o.over.length, 'projet'),
        `${worst.project.name} · +${fmtH(worst.excess)}${o.over.length > 1 ? ` · et ${o.over.length - 1} autre${o.over.length > 2 ? 's' : ''}` : ''}`, { alert: true })
      : statTile('Estimé dépassé', 'Aucun', o.estimated > 0 ? 'tous les projets tiennent leur estimé' : 'aucun estimé renseigné'),
    statTile('Cette semaine', week.planned.length ? plural(week.planned.length, 'tâche') : 'Aucune tâche',
      week.planned.length ? `${fmtH(week.hours)} planifiées · ${plural(week.done, 'terminée')}` : 'rien de planifié'),
  ].join('');
}

const clientLinkChip = (l) => `
  <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" draggable="false" title="${esc(l.url)}"
     class="max-w-[10rem] truncate text-[11px] font-medium rounded px-1.5 py-0.5 border transition ${l.quote
       ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
       : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">${esc(l.label)}</a>`;

function clientProjectHTML({ project: p, time, budget: b, links: ls }) {
  const done = p.status === 'termine';
  const meta = [p.type, p.year].filter(Boolean).join(' · ');
  const timeCell = b
    ? `<p class="text-xs tabular-nums ${b.over ? 'font-medium text-amber-700' : 'text-slate-500'}">${fmtH(b.spent)} / ${fmtH(b.estimated)}</p>
       <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${b.pct}"
            aria-label="Avancement du temps passé sur l’estimé"><div class="h-full rounded-full ${b.over ? 'bg-amber-500' : done ? 'bg-slate-300' : 'bg-slate-900'}" style="width:${b.pct}%"></div></div>`
    : time.spent ? `<p class="text-xs text-slate-400 tabular-nums">${fmtH(time.spent)} · sans estimé</p>` : '<p class="text-xs text-slate-300" aria-label="Aucun temps">—</p>';
  const badge = done ? ['bg-slate-100 text-slate-600', 'Terminé']
    : b?.over ? ['bg-amber-50 text-amber-700', 'Estimé dépassé'] : ['bg-emerald-50 text-emerald-700', 'En cours'];
  const action = done
    ? `<button type="button" class="text-xs font-medium px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition" data-reopen="${p.id}">Rouvrir</button>`
    : `<button type="button" class="text-xs px-2 py-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition" data-open-project="${p.id}">Ouvrir</button>`;
  return `
    <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-t border-slate-100 first:border-0 sm:first:border-t">
      <div class="min-w-0 flex-1 basis-56">
        <button type="button" class="block max-w-full text-left truncate text-sm font-medium hover:underline ${done ? 'text-slate-500' : ''}" data-open-project="${p.id}">${esc(p.name)}</button>
        ${meta || ls.length ? `<p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">${meta ? `<span>${esc(meta)}</span>` : ''}${ls.map(clientLinkChip).join('')}</p>` : ''}
      </div>
      <div class="w-36 shrink-0">${timeCell}</div>
      <div class="flex items-center justify-end gap-2 w-full sm:w-52 shrink-0">
        <span class="text-[11px] font-medium rounded px-1.5 py-0.5 ${badge[0]}">${badge[1]}</span>${action}
      </div>
    </li>`;
}

// Tâche d'une liste de la fiche : case à cocher (planning) ou case figée (consignée), projet, jour ou date, heures.
function clientTaskHTML(t, { detail, hours, toggle }) {
  const p = projects.find((x) => x.id === t.project_id);
  const done = toggle ? t.is_completed : true;
  return `
    <li class="flex items-start gap-2.5 py-1.5">
      <input type="checkbox" class="chk mt-0.5" ${done ? 'checked' : ''} ${toggle ? `data-toggle="${t.id}"` : 'disabled'} aria-label="${toggle ? 'Terminée' : 'Consignée'}" />
      <span class="min-w-0 flex-1">
        <span class="block text-sm ${done ? 'text-slate-400 line-through' : ''}">${esc(t.task_name)}</span>
        <span class="block text-xs text-slate-500 truncate">${esc([p?.name, detail].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="text-xs text-slate-500 tabular-nums">${fmtH(hours)}</span>
    </li>`;
}

const WEEK_LIST_MAX = 8;

function renderClientPage(c) {
  $('#client-edit-form').dataset.id = c.id; // le formulaire de la fenêtre n'est rempli qu'à son ouverture
  const logo = c.logo
    ? `<img src="${esc(c.logo)}" alt="Logo de ${esc(c.name)}" class="w-full h-full object-cover" />`
    : initials(c.name);
  $('#client-logo').innerHTML = logo;
  $('#client-logo-preview').innerHTML = logo;
  $('#client-logo-clear').disabled = !c.logo;
  $('#client-title').textContent = c.name;
  $('#client-dialog-title').textContent = `Modifier « ${c.name} »`;

  const o = clientOverview(projects, tasks, history, c.id);
  const site = $('#client-site');
  site.classList.toggle('hidden', !c.website);
  $('#client-site-sep').classList.toggle('hidden', !c.website || !o.total);
  if (c.website) { site.href = c.website; site.textContent = hostOf(c.website); }
  $('#client-since').textContent = [o.since && `Client depuis ${o.since}`, o.total && plural(o.total, 'projet')].filter(Boolean).join(' · ') || 'Aucun projet pour le moment';
  $('#client-stats').innerHTML = clientStatsHTML(o);

  // Projets : filtre (réinitialisé à chaque changement de fiche ; « Tous » si rien n'est en cours)
  if (clientFilterFor !== c.id) { clientFilterFor = c.id; clientFilter = o.open || !o.done ? 'en_cours' : 'tous'; }
  const counts = { en_cours: o.open, termine: o.done, tous: o.total };
  $('#client-filter').innerHTML = CLIENT_FILTERS.map(([key, label]) => `
    <button type="button" data-client-filter="${key}" aria-pressed="${clientFilter === key}"
      class="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 aria-[pressed=true]:bg-slate-900 aria-[pressed=true]:text-white transition">${label} · ${counts[key]}</button>`).join('');
  $('#client-projects-count').textContent = o.total;
  const rows = clientProjectRows(projects, tasks, history, links, c.id, clientFilter);
  $('#client-projects').innerHTML = rows.map(clientProjectHTML).join('')
    || `<li class="py-3 text-sm text-slate-400">${o.total ? 'Aucun projet dans ce filtre.' : 'Aucun projet rattaché.'}</li>`;
  const more = $('#client-more');
  more.classList.toggle('hidden', !(clientFilter === 'en_cours' && o.done));
  more.innerHTML = `<button type="button" data-client-filter="tous" class="text-xs text-slate-500 hover:text-slate-900 px-1 py-1 transition">Afficher les ${plural(o.done, 'projet')} terminé${o.done > 1 ? 's' : ''}</button>`;

  // Cette semaine et dernières tâches consignées
  const w = o.week;
  $('#client-week').innerHTML = w.planned.slice(0, WEEK_LIST_MAX).map((t) => clientTaskHTML(t, { detail: t.day_of_week, hours: t.estimated_hours, toggle: true })).join('')
    || '<li class="py-1.5 text-sm text-slate-400">Aucune tâche planifiée cette semaine.</li>';
  const extra = [w.planned.length > WEEK_LIST_MAX && `+ ${plural(w.planned.length - WEEK_LIST_MAX, 'autre')} dans le planning`,
    w.parked && `+ ${plural(w.parked, 'tâche')} rangée${w.parked > 1 ? 's' : ''} dans le sas`].filter(Boolean);
  $('#client-week-more').textContent = extra.join(' · ');
  $('#client-week-more').classList.toggle('hidden', !extra.length);
  $('#client-consigned').innerHTML = clientConsigned(projects, history, c.id)
    .map((t) => clientTaskHTML(t, { detail: fmtDate(t.consigned_at, SHORT_DATE), hours: hoursSpent(t), toggle: false })).join('')
    || '<li class="py-1.5 text-sm text-slate-400">Aucune tâche consignée.</li>';

  const blocker = deleteClientBlocker(c, projects, DEFAULT_CLIENT);
  $('#client-delete').disabled = !!blocker;
  $('#client-delete-reason').textContent = blocker || 'Action irréversible.';
}

const currentClient = () => clients.find((c) => c.id === $('#client-edit-form').dataset.id);

// « Modifier la fiche » : logo, nom et site web dans une fenêtre, remplie à l'ouverture.
const clientDialog = $('#client-dialog');
$('#client-edit').addEventListener('click', () => {
  const c = currentClient();
  if (!c) return;
  const f = $('#client-edit-form');
  f.client_name.value = c.name;
  f.website.value = c.website ?? '';
  $('#client-error').classList.add('hidden');
  clientDialog.showModal();
});
$('#client-dialog-cancel').addEventListener('click', () => clientDialog.close());
clientDialog.addEventListener('click', (e) => { if (e.target === clientDialog) clientDialog.close(); });

function fail(el, ex) {
  console.error(ex);
  el.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
  el.classList.remove('hidden');
}

$('#client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#clients-error');
  err.classList.add('hidden');
  try {
    const name = f.client_name.value.trim();
    const msg = clientNameError(clients, null, name);
    if (msg) throw new Error(msg);
    const [created] = await api('clients', '', { method: 'POST', body: { name }, prefer: 'return=representation' });
    clients.push(created);
    clients.sort((a, b) => a.name.localeCompare(b.name));
    f.reset();
    location.hash = `#clients/${created.id}`;
  } catch (ex) { fail(err, ex); }
});

$('#client-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#client-error');
  err.classList.add('hidden');
  const c = currentClient();
  try {
    const name = f.client_name.value.trim();
    const msg = clientNameError(clients, c.id, name);
    if (msg) throw new Error(msg);
    if (same(c.name, DEFAULT_CLIENT) && !same(name, DEFAULT_CLIENT)) throw new Error('Ce client par défaut ne peut pas être renommé.');
    const website = normalizeUrl(f.website.value) || null;
    await api('clients', `?id=eq.${c.id}`, { method: 'PATCH', body: { name, website } });
    if (name !== c.name) {
      const ids = projects.filter((p) => p.client_id === c.id).map((p) => p.id);
      if (ids.length) await api('tasks', `?project_id=in.(${ids.join(',')})`, { method: 'PATCH', body: { client_name: name } });
      projects.forEach((p) => { if (p.client_id === c.id) p.clients.name = name; });
      tasks.concat(history).forEach((t) => {
        if (!ids.includes(t.project_id)) return;
        t.client_name = name;
        if (t.projects?.clients) t.projects.clients.name = name;
      });
    }
    Object.assign(c, { name, website });
    clients.sort((a, b) => a.name.localeCompare(b.name));
    clientDialog.close();
    render();
    toast('Client enregistré');
  } catch (ex) { fail(err, ex); }
});

// Logo : image redimensionnée à 128 px (côté le plus long) et stockée en data URL
const LOGO_MAX = 128;
function resizeLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Ce fichier n’est pas une image.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, LOGO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}

async function saveLogo(logo) {
  const c = currentClient();
  const err = $('#client-error');
  err.classList.add('hidden');
  try {
    await api('clients', `?id=eq.${c.id}`, { method: 'PATCH', body: { logo } });
    c.logo = logo;
    render();
  } catch (ex) { fail(err, ex); }
}

$('#client-logo-pick').addEventListener('click', () => $('#client-logo-file').click());
$('#client-logo-clear').addEventListener('click', () => saveLogo(null));
$('#client-logo-file').addEventListener('change', async (e) => {
  const input = e.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    await saveLogo(await resizeLogo(file));
  } catch (ex) { fail($('#client-error'), ex); }
});

const clientProjectForm = $('#client-project-form');
function toggleClientProjectForm(open) {
  clientProjectForm.classList.toggle('hidden', !open);
  $('#client-project-toggle').setAttribute('aria-expanded', String(open));
  if (open) clientProjectForm.project_name.focus(); else clientProjectForm.reset();
}
$('#client-project-toggle').addEventListener('click', () => toggleClientProjectForm(clientProjectForm.classList.contains('hidden')));
$('#client-project-cancel').addEventListener('click', () => toggleClientProjectForm(false));

clientProjectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const c = currentClient();
  $('#client-page-error').classList.add('hidden');
  run(async () => {
    const name = f.project_name.value.trim();
    if (projects.some((p) => p.client_id === c.id && same(p.name, name))) throw new Error('Ce client a déjà un projet portant ce nom.');
    await ensureProject(c.name, name);
    toggleClientProjectForm(false);
    clientFilter = 'en_cours'; // le nouveau projet est « en cours » : le rendre visible
    render();
  });
});

// Filtre de la liste des projets de la fiche
$('#client-page').addEventListener('click', (e) => {
  const key = e.target.closest('[data-client-filter]')?.dataset.clientFilter;
  if (!key) return;
  clientFilter = key;
  render();
});

$('#client-delete').addEventListener('click', async () => {
  const c = currentClient();
  const err = $('#client-page-error');
  err.classList.add('hidden');
  if (deleteClientBlocker(c, projects, DEFAULT_CLIENT)) return;
  if (!await askConfirm({ title: `Supprimer le client « ${c.name} » ?`, message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true })) return;
  try {
    await api('clients', `?id=eq.${c.id}`, { method: 'DELETE' });
    clients = clients.filter((x) => x.id !== c.id);
    location.hash = '#clients';
    render();
    toast('Client supprimé');
  } catch (ex) { fail(err, ex); }
});

// ---------- Réglages : types de projet ----------
// Un type saisi qui correspond (casse ignorée) à un type par défaut prend son écriture exacte.
function canonicalType(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  return projectTypes.find((t) => same(t.name, name))?.name ?? name;
}

function fillTypeList() {
  $('#types-datalist').innerHTML = typeSuggestions(projectTypes, projects)
    .map((t) => `<option value="${esc(t.name)}">${t.custom ? 'personnalisé' : ''}</option>`).join('');
}

const typeUsage = (name) => projects.filter((p) => p.type && same(p.type, name)).length;
const ICON_BTN = 'w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition';

function renderRecurrencesSettings() {
  const active = recurrences.filter((x) => x.active);
  $('#recurrences-list').innerHTML = active.map((x) => {
    const p = projects.find((pr) => pr.id === x.project_id);
    return `
      <li class="flex flex-wrap items-center gap-2 py-2 text-sm">
        <span class="min-w-0 flex-1 basis-48">
          <span class="block truncate font-medium">↻ ${esc(x.task_name)}</span>
          <span class="block truncate text-xs text-slate-500">${esc(recurrenceLabel(x))}${p ? ` · ${esc(p.clients.name)} · ${esc(p.name)}` : ''}</span>
        </span>
        <button type="button" data-stop-series="${x.id}"
          class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition">Ne plus répéter</button>
      </li>`;
  }).join('') || '<li class="py-2 text-sm text-slate-400">Aucune tâche récurrente.</li>';
}

$('#recurrences-list').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-stop-series]')?.dataset.stopSeries;
  if (!id) return;
  const x = recurrences.find((y) => y.id === id);
  const ok = await askConfirm({
    title: `Ne plus répéter « ${x.task_name} » ?`,
    message: 'Aucune nouvelle occurrence ne sera créée. Les occurrences déjà présentes dans le planning ou le sas restent en place.',
    confirmLabel: 'Ne plus répéter',
  });
  if (!ok) return;
  x.active = false;
  render();
  run(() => api('recurrences', `?id=eq.${id}`, { method: 'PATCH', body: { active: false } }), () => { x.active = true; });
});

function renderSettings() {
  renderLabelsSettings();
  renderRecurrencesSettings();
  const list = [...projectTypes].sort((a, b) => a.position - b.position);
  $('#types-list').innerHTML = list.map((t, i) => {
    const n = typeUsage(t.name);
    return `
      <li class="flex items-center gap-2 py-1.5">
        <span class="w-5 text-right text-xs text-slate-400 tabular-nums">${i + 1}</span>
        <input value="${esc(t.name)}" data-type-rename="${t.id}" autocomplete="off" aria-label="Nom du type ${esc(t.name)}"
          class="min-w-0 flex-1 px-2 py-1 text-sm rounded-md bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-slate-300 focus:outline-none" />
        <span class="text-xs text-slate-500 tabular-nums whitespace-nowrap">${n} projet${n > 1 ? 's' : ''}</span>
        <button type="button" class="${ICON_BTN}" data-type-move="${t.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Monter" aria-label="Monter ${esc(t.name)}">↑</button>
        <button type="button" class="${ICON_BTN}" data-type-move="${t.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} title="Descendre" aria-label="Descendre ${esc(t.name)}">↓</button>
        <button type="button" class="${ICON_BTN} hover:!text-red-600" data-type-delete="${t.id}" title="Supprimer" aria-label="Supprimer ${esc(t.name)}">×</button>
      </li>`;
  }).join('') || '<li class="py-2 text-sm text-slate-400">Aucun type par défaut.</li>';
  const custom = typeSuggestions(projectTypes, projects).filter((t) => t.custom);
  $('#custom-types').innerHTML = custom.length ? `
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Types personnalisés (saisis sur des projets)</h4>
    <ul class="flex flex-wrap gap-1.5">${custom.map((t) => `
      <li class="inline-flex items-center gap-1.5 text-xs rounded-md border border-slate-200 bg-slate-50 pl-2 pr-1 py-1">
        <span>${esc(t.name)}</span><span class="text-slate-400 tabular-nums">${typeUsage(t.name)}</span>
        <button type="button" class="rounded px-1.5 py-0.5 font-medium text-slate-600 hover:bg-white hover:text-slate-900 transition" data-type-promote="${esc(t.name)}"
          title="Ajouter aux types par défaut">+ Défaut</button>
      </li>`).join('')}</ul>` : '';
}

const typesError = (ex) => fail($('#types-error'), ex);

async function addType(name) {
  $('#types-error').classList.add('hidden');
  const msg = typeNameError(projectTypes, null, name);
  if (msg) throw new Error(msg);
  const position = Math.max(0, ...projectTypes.map((t) => t.position)) + 1;
  const [created] = await api('project_types', '', { method: 'POST', body: { name: name.trim(), position }, prefer: 'return=representation' });
  projectTypes.push(created);
  render();
}

$('#type-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await addType(f.type_name.value);
    f.reset();
    f.type_name.focus();
  } catch (ex) { typesError(ex); }
});

// Renommage : le nouveau nom s'applique aussi aux projets qui portaient l'ancien.
$('#types-list').addEventListener('change', async (e) => {
  const id = e.target.dataset.typeRename;
  if (!id) return;
  const t = projectTypes.find((x) => x.id === id);
  const name = e.target.value.trim();
  $('#types-error').classList.add('hidden');
  try {
    if (name === t.name) return;
    const msg = typeNameError(projectTypes, id, name);
    if (msg) throw new Error(msg);
    const old = t.name;
    await api('project_types', `?id=eq.${id}`, { method: 'PATCH', body: { name } });
    await api('projects', `?type=eq.${encodeURIComponent(old)}`, { method: 'PATCH', body: { type: name } });
    t.name = name;
    projects.forEach((p) => { if (p.type === old) p.type = name; });
    render();
    toast('Type renommé');
  } catch (ex) {
    e.target.value = t.name;
    typesError(ex);
  }
});
$('#types-list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.typeRename) { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape' && e.target.dataset.typeRename) {
    e.target.value = projectTypes.find((x) => x.id === e.target.dataset.typeRename).name;
    e.target.blur();
  }
});

$('#settings-view').addEventListener('click', async (e) => {
  const moveId = e.target.closest('[data-type-move]')?.dataset.typeMove;
  const deleteId = e.target.closest('[data-type-delete]')?.dataset.typeDelete;
  const promote = e.target.closest('[data-type-promote]')?.dataset.typePromote;
  if (moveId) {
    const next = moveItem(projectTypes, moveId, +e.target.closest('[data-type-move]').dataset.dir);
    const changed = next.filter((t) => projectTypes.find((x) => x.id === t.id).position !== t.position);
    const snapshot = projectTypes;
    projectTypes = next;
    render();
    run(() => Promise.all(changed.map((t) => api('project_types', `?id=eq.${t.id}`, { method: 'PATCH', body: { position: t.position } }))),
      () => { projectTypes = snapshot; });
  } else if (deleteId) {
    const t = projectTypes.find((x) => x.id === deleteId);
    const n = typeUsage(t.name);
    const ok = await askConfirm({
      title: `Supprimer le type « ${t.name} » ?`,
      message: n ? `${n > 1 ? `Les ${n} projets qui l’utilisent le gardent` : 'Le projet qui l’utilise le garde'} : il deviendra un type personnalisé.` : 'Aucun projet ne l’utilise.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const snapshot = projectTypes;
    projectTypes = projectTypes.filter((x) => x.id !== deleteId);
    render();
    run(() => api('project_types', `?id=eq.${deleteId}`, { method: 'DELETE' }), () => { projectTypes = snapshot; });
  } else if (promote) {
    try { await addType(promote); } catch (ex) { typesError(ex); }
  }
});

// ---------- Réglages : étiquettes ----------
const colorOptions = (selected) => LABEL_COLORS.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${TINTS[c].name}</option>`).join('');
const labelUsage = (id) => tasks.concat(history).filter((t) => (t.label_ids || []).includes(id)).length;

function renderLabelsSettings() {
  const list = [...labels].sort((a, b) => a.position - b.position);
  $('#labels-list').innerHTML = list.map((l, i) => {
    const n = labelUsage(l.id);
    return `
      <li class="flex flex-wrap items-center gap-2 py-1.5">
        <span class="w-3 h-3 shrink-0 rounded-full ${tint(l).dot}" aria-hidden="true"></span>
        <input value="${esc(l.name)}" data-label-rename="${l.id}" autocomplete="off" aria-label="Nom de l’étiquette ${esc(l.name)}"
          class="min-w-0 flex-1 basis-32 px-2 py-1 text-sm rounded-md bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-slate-300 focus:outline-none" />
        <select data-label-color="${l.id}" aria-label="Teinte de ${esc(l.name)}"
          class="px-2 py-1 text-sm rounded-md bg-slate-50 border border-transparent hover:border-slate-200 focus:border-slate-300 focus:outline-none">${colorOptions(l.color)}</select>
        <label class="inline-flex items-center gap-1.5 text-xs text-slate-600" title="Ajoute une heure et un lien de visio aux tâches qui la portent">
          <input type="checkbox" class="chk" data-label-meeting="${l.id}" ${l.is_meeting ? 'checked' : ''} /> Réunion
        </label>
        <span class="w-16 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">${n} tâche${n > 1 ? 's' : ''}</span>
        <button type="button" class="${ICON_BTN}" data-label-move="${l.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Monter (plus prioritaire)" aria-label="Monter ${esc(l.name)}">↑</button>
        <button type="button" class="${ICON_BTN}" data-label-move="${l.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} title="Descendre" aria-label="Descendre ${esc(l.name)}">↓</button>
        <button type="button" class="${ICON_BTN} hover:!text-red-600" data-label-delete="${l.id}" title="Supprimer" aria-label="Supprimer ${esc(l.name)}">×</button>
      </li>`;
  }).join('') || '<li class="py-2 text-sm text-slate-400">Aucune étiquette.</li>';
  const sel = $('#label-form').color;
  if (!sel.options.length) sel.innerHTML = colorOptions('bleu');
}

const labelsError = (ex) => fail($('#labels-error'), ex);

$('#label-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#labels-error').classList.add('hidden');
  try {
    const name = f.label_name.value.trim();
    const msg = labelNameError(labels, null, name);
    if (msg) throw new Error(msg);
    const position = Math.max(0, ...labels.map((l) => l.position)) + 1;
    const [created] = await api('labels', '', {
      method: 'POST', body: { name, color: f.color.value, is_meeting: f.is_meeting.checked, position }, prefer: 'return=representation',
    });
    labels.push(created);
    f.label_name.value = '';
    f.is_meeting.checked = false;
    render();
    f.label_name.focus();
  } catch (ex) { labelsError(ex); }
});

function patchLabel(l, patch) {
  const prev = { ...l };
  Object.assign(l, patch);
  render();
  run(() => api('labels', `?id=eq.${l.id}`, { method: 'PATCH', body: patch }), () => { Object.assign(l, prev); });
}

$('#labels-list').addEventListener('change', (e) => {
  const { labelRename, labelColor, labelMeeting } = e.target.dataset;
  $('#labels-error').classList.add('hidden');
  if (labelRename) {
    const l = labels.find((x) => x.id === labelRename);
    const name = e.target.value.trim();
    if (name === l.name) return;
    const msg = labelNameError(labels, l.id, name);
    if (msg) { e.target.value = l.name; labelsError(new Error(msg)); return; }
    patchLabel(l, { name });
  } else if (labelColor) {
    patchLabel(labels.find((x) => x.id === labelColor), { color: e.target.value });
  } else if (labelMeeting) {
    patchLabel(labels.find((x) => x.id === labelMeeting), { is_meeting: e.target.checked });
  }
});
$('#labels-list').addEventListener('keydown', (e) => {
  if (!e.target.dataset.labelRename) return;
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') { e.target.value = labels.find((x) => x.id === e.target.dataset.labelRename).name; e.target.blur(); }
});

$('#labels-list').addEventListener('click', async (e) => {
  const moveBtn = e.target.closest('[data-label-move]');
  const deleteId = e.target.closest('[data-label-delete]')?.dataset.labelDelete;
  if (moveBtn) {
    const next = moveItem(labels, moveBtn.dataset.labelMove, +moveBtn.dataset.dir);
    const changed = next.filter((l) => labels.find((x) => x.id === l.id).position !== l.position);
    const snapshot = labels;
    labels = next;
    render();
    run(() => Promise.all(changed.map((l) => api('labels', `?id=eq.${l.id}`, { method: 'PATCH', body: { position: l.position } }))),
      () => { labels = snapshot; });
  } else if (deleteId) {
    // Suppression : l'étiquette est retirée des tâches qui la portent (heure et lien conservés, masqués).
    const l = labels.find((x) => x.id === deleteId);
    const used = tasks.concat(history).filter((t) => (t.label_ids || []).includes(deleteId));
    const ok = await askConfirm({
      title: `Supprimer l’étiquette « ${l.name} » ?`,
      message: used.length
        ? `Elle sera retirée de ${used.length > 1 ? `${used.length} tâches` : 'la tâche qui la porte'} (historique compris).`
        : 'Aucune tâche ne la porte.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const snapshot = { labels, ids: used.map((t) => [t, t.label_ids]) };
    labels = labels.filter((x) => x.id !== deleteId);
    used.forEach((t) => { t.label_ids = t.label_ids.filter((id) => id !== deleteId); });
    render();
    run(async () => {
      await Promise.all(used.map((t) => api('tasks', `?id=eq.${t.id}`, { method: 'PATCH', body: { label_ids: t.label_ids } })));
      await api('labels', `?id=eq.${deleteId}`, { method: 'DELETE' });
    }, () => { labels = snapshot.labels; snapshot.ids.forEach(([t, ids]) => { t.label_ids = ids; }); });
  }
});

// ---------- Import Google Agenda (Google Identity Services, lecture seule, sans serveur) ----------
const GCAL_API = 'https://www.googleapis.com/calendar/v3';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_CALS_KEY = 'planning_gcal_calendars';
const GCAL_PROJECT_KEY = 'planning_gcal_last_project';
const gcalDialog = $('#gcal-dialog');
let gcalToken = null; // { access_token, expires_at } — en mémoire seulement (environ 1 h)
let gcalCalendars = [];
let gcalItems = []; // événements proposés (plan d'import)

// Script Google chargé à l'avance : la fenêtre de consentement doit s'ouvrir directement au clic.
let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    el.onload = () => resolve();
    el.onerror = () => { gisLoading = null; reject(new Error('Impossible de charger le service de connexion Google.')); };
    document.head.append(el);
  });
  return gisLoading;
}

function gcalAccessToken() {
  return new Promise((resolve, reject) => {
    if (gcalToken && gcalToken.expires_at > Date.now() + 60000) return resolve(gcalToken.access_token);
    if (!window.google?.accounts?.oauth2) return reject(new Error('Connexion Google en cours de chargement : réessaie dans un instant.'));
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GCAL_SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error === 'access_denied' ? 'Accès à l’agenda refusé.' : `Connexion Google refusée (${resp.error}).`));
        gcalToken = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in || 3600) * 1000 };
        resolve(gcalToken.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type === 'popup_closed' ? 'Fenêtre Google fermée avant la fin.'
        : err?.type === 'popup_failed_to_open' ? 'Fenêtre Google bloquée : autorise les fenêtres pop-up pour ce site.'
          : 'Connexion Google impossible.')),
    });
    client.requestAccessToken();
  });
}

async function gcalGet(path) {
  const res = await fetch(`${GCAL_API}/${path}`, { headers: { Authorization: `Bearer ${gcalToken.access_token}` } });
  if (res.status === 401) { gcalToken = null; throw new Error('Session Google expirée : relance l’import.'); }
  if (res.status === 403) throw new Error('Accès refusé par Google : vérifie que l’API Google Calendar est activée dans le projet Google Cloud.');
  if (!res.ok) throw new Error(`Google Agenda ${res.status} : ${await res.text()}`);
  return res.json();
}

const gcalStatus = (msg, error = false) => {
  const el = $('#gcal-status');
  el.textContent = msg;
  el.classList.toggle('text-red-700', error);
  el.classList.toggle('text-slate-600', !error);
};

function storedCalendars() {
  try { return JSON.parse(localStorage.getItem(GCAL_CALS_KEY)) || null; } catch { return null; }
}

$('#import-gcal').addEventListener('click', async () => {
  const monday = planningMonday(new Date());
  $('#gcal-week').textContent = `Semaine du ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : réunions visio du lundi au vendredi`;
  $('#gcal-events').classList.add('hidden');
  $('#gcal-calendars-box').classList.add('hidden');
  $('#gcal-import').disabled = true;
  gcalDialog.showModal();
  if (!GOOGLE_CLIENT_ID) {
    return gcalStatus('Connexion Google non configurée : il manque l’identifiant client OAuth (GOOGLE_CLIENT_ID dans app.js).', true);
  }
  if (!labels.some((l) => l.is_meeting)) {
    return gcalStatus('Aucune étiquette « réunion » : crée-en une dans Réglages › Étiquettes avant d’importer.', true);
  }
  gcalStatus('Connexion à Google…');
  try {
    await gcalAccessToken(); // appelé tout de suite : la fenêtre Google s'ouvre dans le geste du clic
    gcalStatus('Lecture de tes agendas…');
    gcalCalendars = (await gcalGet('users/me/calendarList?minAccessRole=reader')).items || [];
    renderGcalCalendars();
    await loadGcalEvents();
  } catch (ex) {
    console.error(ex);
    gcalStatus(ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message, true);
  }
});

function selectedCalendars() {
  const stored = storedCalendars();
  const ids = gcalCalendars.map((c) => c.id);
  const chosen = (stored || []).filter((id) => ids.includes(id));
  return chosen.length ? chosen : gcalCalendars.filter((c) => c.primary).map((c) => c.id);
}

function renderGcalCalendars() {
  const chosen = selectedCalendars();
  $('#gcal-cal-count').textContent = gcalCalendars.filter((c) => chosen.includes(c.id)).map((c) => c.summaryOverride || c.summary).join(', ') || 'aucun';
  $('#gcal-calendars').innerHTML = gcalCalendars.map((c) => `
    <label class="flex items-center gap-2 text-sm text-slate-700 min-w-0">
      <input type="checkbox" class="chk" data-gcal-cal="${esc(c.id)}" ${chosen.includes(c.id) ? 'checked' : ''} />
      <span class="w-2.5 h-2.5 shrink-0 rounded-full" style="background:${esc(c.backgroundColor || '#94a3b8')}"></span>
      <span class="truncate">${esc(c.summaryOverride || c.summary)}</span>
    </label>`).join('');
  $('#gcal-calendars-box').classList.remove('hidden');
}

$('#gcal-calendars').addEventListener('change', async () => {
  const ids = [...document.querySelectorAll('[data-gcal-cal]:checked')].map((i) => i.dataset.gcalCal);
  try { localStorage.setItem(GCAL_CALS_KEY, JSON.stringify(ids)); } catch { /* stockage indisponible */ }
  renderGcalCalendars();
  try { await loadGcalEvents(); } catch (ex) { gcalStatus(ex.message, true); }
});

async function loadGcalEvents() {
  const monday = planningMonday(new Date());
  const saturday = dayDate(monday, 'Vendredi');
  saturday.setDate(saturday.getDate() + 1);
  gcalStatus('Lecture des événements de la semaine…');
  const seen = new Set();
  const items = [];
  for (const id of selectedCalendars()) {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: monday.toISOString(), timeMax: saturday.toISOString() });
    const data = await gcalGet(`calendars/${encodeURIComponent(id)}/events?${q}`);
    (data.items || []).forEach((event) => {
      const slot = eventSlot(event, monday);
      const link = extractMeetingLink(event);
      if (!slot || !link || seen.has(event.id)) return; // même événement présent dans deux agendas : une fois
      seen.add(event.id);
      items.push({ event, slot, link });
    });
  }
  items.sort((a, b) => DAYS.indexOf(a.slot.day) - DAYS.indexOf(b.slot.day) || a.slot.start_time.localeCompare(b.slot.start_time));
  let fallback = '';
  try { fallback = localStorage.getItem(GCAL_PROJECT_KEY) || ''; } catch { /* stockage indisponible */ }
  gcalItems = importPlan(items, tasks, history, labels).map((it) => ({
    ...it,
    picked: it.status === 'new' || it.status === 'complete',
    projectId: it.status === 'new' ? suggestProject(it.event, clients, projects, fallback) : '',
  }));
  renderGcalEvents();
}

const GCAL_BADGE = {
  new: ['Nouvelle', 'bg-emerald-50 text-emerald-700'],
  complete: ['Lien à compléter', 'bg-blue-50 text-blue-700'],
  exists: ['Déjà planifiée', 'bg-slate-100 text-slate-500'],
  imported: ['Déjà importée', 'bg-slate-100 text-slate-500'],
};

function renderGcalEvents() {
  const open = projects.filter((p) => p.status === 'en_cours')
    .sort((a, b) => a.clients.name.localeCompare(b.clients.name) || a.name.localeCompare(b.name));
  const options = (selected) => '<option value="">Choisir un projet…</option>' + open.map((p) =>
    `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.clients.name)} · ${esc(p.name)}</option>`).join('');
  const list = $('#gcal-events');
  list.innerHTML = gcalItems.map((it, i) => {
    const [label, cls] = GCAL_BADGE[it.status];
    const active = it.status === 'new' || it.status === 'complete';
    const target = it.taskId && tasks.find((t) => t.id === it.taskId);
    return `
      <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${active ? '' : 'opacity-60'}">
        <input type="checkbox" class="chk" data-gcal-pick="${i}" ${it.picked ? 'checked' : ''} ${active ? '' : 'disabled'} aria-label="Importer ${esc(it.event.summary || 'cet événement')}" />
        <span class="w-32 shrink-0 whitespace-nowrap text-xs text-slate-600 tabular-nums">${it.slot.day} ${it.slot.start_time} · ${fmtH(it.slot.hours)}</span>
        <span class="min-w-0 flex-1 basis-40">
          <span class="block truncate text-sm font-medium">${esc(it.event.summary || 'Sans titre')}</span>
          <span class="block truncate text-xs text-slate-500">${esc(hostOf(it.link))}</span>
        </span>
        <span class="ml-auto flex min-w-0 max-w-full items-center gap-2">
        ${it.status === 'new' ? `<select data-gcal-project="${i}" aria-label="Projet de la réunion"
            class="min-w-0 max-w-[13rem] px-2 py-1 text-sm rounded-md bg-slate-50 border ${it.picked && !it.projectId ? 'border-red-300' : 'border-transparent'} focus:border-slate-300 focus:outline-none">${options(it.projectId)}</select>`
          : target ? `<span class="min-w-0 text-xs text-slate-500 truncate max-w-[13rem]">« ${esc(target.task_name)} »</span>` : ''}
        <span class="shrink-0 whitespace-nowrap text-[11px] font-medium rounded px-1.5 py-0.5 ${cls}">${label}</span>
        </span>
      </li>`;
  }).join('') || '<li class="px-3 py-3 text-sm text-slate-400">Aucune réunion avec un lien de visio cette semaine dans les agendas choisis.</li>';
  list.classList.remove('hidden');
  const n = gcalItems.filter((it) => it.picked).length;
  $('#gcal-import').disabled = !n;
  $('#gcal-import').textContent = n ? `Importer (${n})` : 'Importer';
  const counts = gcalItems.reduce((acc, it) => ({ ...acc, [it.status]: (acc[it.status] || 0) + 1 }), {});
  gcalStatus(gcalItems.length
    ? `${gcalItems.length} réunion${gcalItems.length > 1 ? 's' : ''} visio trouvée${gcalItems.length > 1 ? 's' : ''}`
      + (counts.imported || counts.exists ? ` (${(counts.imported || 0) + (counts.exists || 0)} déjà dans le planning)` : '') + '.'
    : '');
}

$('#gcal-events').addEventListener('change', (e) => {
  const pick = e.target.dataset.gcalPick;
  const proj = e.target.dataset.gcalProject;
  if (pick != null) gcalItems[pick].picked = e.target.checked;
  if (proj != null) gcalItems[proj].projectId = e.target.value;
  renderGcalEvents();
});

$('#gcal-import').addEventListener('click', async () => {
  const picked = gcalItems.filter((it) => it.picked);
  const missing = picked.filter((it) => it.status === 'new' && !it.projectId);
  if (missing.length) {
    renderGcalEvents();
    return gcalStatus(`Choisis le projet de ${missing.length > 1 ? `${missing.length} réunions` : 'la réunion'} encadrée${missing.length > 1 ? 's' : ''} en rouge.`, true);
  }
  const meetingLabel = [...labels].sort((a, b) => a.position - b.position).find((l) => l.is_meeting);
  const rows = picked.filter((it) => it.status === 'new').map((it) => {
    const p = projects.find((x) => x.id === it.projectId);
    return {
      project_id: p.id,
      client_name: p.clients.name,
      project_name: p.name,
      task_name: (it.event.summary || 'Réunion').trim(),
      estimated_hours: it.slot.hours,
      day_of_week: it.slot.day,
      is_completed: false,
      label_ids: [meetingLabel.id],
      start_time: it.slot.start_time,
      meeting_url: it.link,
      google_event_id: it.event.id,
    };
  });
  const completes = picked.filter((it) => it.status === 'complete');
  $('#gcal-import').disabled = true;
  gcalStatus('Import en cours…');
  try {
    for (const it of completes) {
      const patch = { meeting_url: it.link, google_event_id: it.event.id };
      await db.update(it.taskId, patch);
      Object.assign(tasks.find((t) => t.id === it.taskId), patch);
    }
    if (rows.length) tasks = tasks.concat(await db.insert(rows));
    const last = rows.at(-1)?.project_id;
    if (last) { try { localStorage.setItem(GCAL_PROJECT_KEY, last); } catch { /* stockage indisponible */ } }
    gcalDialog.close();
    render();
    toast([rows.length && `${rows.length} réunion${rows.length > 1 ? 's' : ''} importée${rows.length > 1 ? 's' : ''}`,
      completes.length && `${completes.length} complétée${completes.length > 1 ? 's' : ''}`].filter(Boolean).join(' · '));
  } catch (ex) {
    console.error(ex);
    $('#gcal-import').disabled = false;
    gcalStatus(ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message, true);
  }
});

const closeGcal = () => gcalDialog.close();
$('#gcal-close').addEventListener('click', closeGcal);
$('#gcal-cancel').addEventListener('click', closeGcal);
gcalDialog.addEventListener('click', (e) => { if (e.target === gcalDialog) closeGcal(); });

// ---------- Bloc-notes de la semaine (Lot 25) ----------
// Volet gauche masqué par défaut. Une note par semaine, enregistrée après une pause de saisie, au repli du volet,
// au changement de semaine et quand la page passe en arrière-plan. Un brouillon local protège la saisie tant
// qu'elle n'est pas enregistrée (réseau coupé, page fermée) : il est renvoyé à la connexion suivante.
const NOTE_DRAFT_KEY = 'planning_note_draft';
const notesPanel = $('#notes-panel');
const notesText = $('#notes-text');
let noteWeek = weekKey(new Date()); // semaine affichée
let noteDirty = false; // saisie pas encore enregistrée
let noteTimer = null;
let noteQueue = Promise.resolve(); // un enregistrement à la fois, dans l'ordre

const noteOf = (week) => notes.find((n) => n.week_start === week);
const notesOpen = () => notesPanel.dataset.open === 'true';
const RELATIVE_WEEK = { '-1': 'semaine dernière', 0: 'cette semaine', 1: 'semaine prochaine' };

function noteStatus(msg, error = false) {
  const el = $('#notes-status');
  el.textContent = msg;
  el.classList.toggle('text-red-700', error);
  el.classList.toggle('text-slate-500', !error);
}

function setNotesOpen(open) {
  notesPanel.dataset.open = String(open);
  notesPanel.classList.toggle('-translate-x-full', !open);
  $('#notes-body').inert = !open;
  $('#notes-tab').setAttribute('aria-expanded', String(open));
  $('#notes-tab').title = open ? 'Replier le bloc-notes' : 'Bloc-notes de la semaine';
  if (open) {
    renderNotes();
    notesText.focus();
  } else {
    saveNote();
  }
}

// « Reprendre la semaine précédente » : seulement sur une note vide, si la précédente a du contenu.
// « Suggérer des tâches » : dès que la note a du contenu.
function syncNoteActions() {
  const empty = !notesText.value.trim();
  const previous = noteOf(shiftWeek(noteWeek, -1))?.body ?? '';
  $('#notes-reuse').classList.toggle('hidden', !empty || !previous.trim());
  $('#notes-suggest').disabled = empty;
  $('#notes-claude').disabled = empty;
}

const weekTitle = (week) => `Semaine du ${new Date(`${week}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

// En-tête de la semaine affichée ; le texte n'est remplacé que s'il n'y a pas de saisie en attente.
function renderNotes() {
  const offset = weekOffset(noteWeek, weekKey(new Date()));
  $('#notes-week').textContent = `${weekTitle(noteWeek)}${RELATIVE_WEEK[offset] ? ` · ${RELATIVE_WEEK[offset]}` : ''}`;
  $('#notes-today').classList.toggle('hidden', offset === 0);
  if (!noteDirty) notesText.value = noteOf(noteWeek)?.body ?? '';
  syncNoteActions();
}

function readDraft() {
  try { return JSON.parse(localStorage.getItem(NOTE_DRAFT_KEY)); } catch { return null; }
}
function keepDraft() {
  try { localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ week: noteWeek, body: notesText.value, at: new Date().toISOString() })); } catch { /* stockage indisponible */ }
}
function dropDraft(week, body) {
  const draft = readDraft();
  if (draft?.week !== week || draft.body !== body) return;
  try { localStorage.removeItem(NOTE_DRAFT_KEY); } catch { /* stockage indisponible */ }
}

const noteError = (ex) => (ex instanceof TypeError
  ? 'Hors ligne : notes gardées sur cet appareil, nouvel essai dans un instant.'
  : /week_notes/.test(ex.message) && /404|schema cache/.test(ex.message)
    ? 'Bloc-notes pas encore installé : exécute supabase/lot-25-bloc-notes.sql dans Supabase.'
    : `Notes non enregistrées : ${ex.message}`);

// Enregistre la saisie en attente ; la promesse renvoyée ne rejette jamais (l'erreur s'affiche sous la note).
function saveNote({ keepalive = false } = {}) {
  clearTimeout(noteTimer);
  if (!noteDirty) return noteQueue;
  const row = { week_start: noteWeek, body: notesText.value, updated_at: new Date().toISOString() };
  noteDirty = false;
  noteStatus('Enregistrement…');
  noteQueue = noteQueue.then(async () => {
    try {
      const [saved] = await db.saveNote(row, { keepalive });
      notes = notes.filter((n) => n.week_start !== row.week_start).concat(saved);
      dropDraft(row.week_start, row.body);
      if (!noteDirty) noteStatus(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (ex) {
      console.error(ex);
      if (row.week_start === noteWeek && !noteDirty) {
        noteDirty = true;
        noteTimer = setTimeout(saveNote, 15000);
      }
      noteStatus(noteError(ex), true);
    }
  });
  return noteQueue;
}

// Brouillon d'une saisie interrompue : renvoyé s'il est plus récent que la note enregistrée.
async function restoreDraft() {
  const draft = readDraft();
  if (!draft?.week) return;
  const saved = noteOf(draft.week);
  if (!saved || (saved.body !== draft.body && new Date(draft.at) > new Date(saved.updated_at))) {
    try {
      const [row] = await db.saveNote({ week_start: draft.week, body: draft.body, updated_at: draft.at });
      notes = notes.filter((n) => n.week_start !== draft.week).concat(row);
      if (draft.week === noteWeek && !noteDirty) renderNotes();
    } catch (ex) { console.error(ex); return; } // le brouillon reste pour la prochaine fois
  }
  dropDraft(draft.week, draft.body);
}

async function showNoteWeek(week) {
  await saveNote();
  if (noteDirty) return; // enregistrement impossible : on reste sur la semaine en cours de saisie
  noteWeek = week;
  noteStatus('');
  renderNotes();
  notesText.focus();
}

// Remplace la sélection du bloc-notes : execCommand garde l'annulation (Ctrl+Z) du navigateur, setRangeText en repli.
function editNote(from, to, insert) {
  notesText.setSelectionRange(from, to);
  const done = insert ? document.execCommand('insertText', false, insert) : document.execCommand('delete');
  if (!done) {
    notesText.setRangeText(insert, from, to, 'end');
    notesText.dispatchEvent(new Event('input'));
  }
}

notesText.addEventListener('input', () => {
  noteDirty = true;
  keepDraft();
  syncNoteActions();
  noteStatus('Modifications en cours…');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 800);
});

// Entrée sur une ligne de liste : la puce continue (ou s'arrête sur une puce vide).
notesText.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
  if (notesText.selectionStart !== notesText.selectionEnd) return;
  const edit = continueList(notesText.value, notesText.selectionStart);
  if (!edit) return;
  e.preventDefault();
  editNote(edit.from, edit.to, edit.insert);
});

notesPanel.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !notesOpen()) return;
  e.preventDefault();
  setNotesOpen(false);
  $('#notes-tab').focus();
});
$('#notes-tab').addEventListener('click', () => setNotesOpen(!notesOpen()));
$('#notes-close').addEventListener('click', () => { setNotesOpen(false); $('#notes-tab').focus(); });
$('#notes-prev').addEventListener('click', () => showNoteWeek(shiftWeek(noteWeek, -1)));
$('#notes-next').addEventListener('click', () => showNoteWeek(shiftWeek(noteWeek, 1)));
$('#notes-today').addEventListener('click', () => showNoteWeek(weekKey(new Date())));
$('#notes-reuse').addEventListener('click', () => {
  editNote(0, notesText.value.length, noteOf(shiftWeek(noteWeek, -1))?.body ?? '');
  notesText.focus();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNote({ keepalive: true });
});

// ---------- Suggestions de tâches tirées du bloc-notes (Lot 26) ----------
// Analyse locale de la note (noteSuggestions, sans service externe ni coût), propositions vérifiées
// (reviewSuggestions) puis validées une par une : nouvelles tâches (sas, ou jour choisi) et tâches du sas à planifier.
// Une ligne d'action sans projet reconnu est proposée décochée, projet à choisir.
const suggestDialog = $('#suggest-dialog');
let suggItems = []; // propositions vérifiées + choix en cours (retenue, nom, projet, heures, jour)

const SUGG_BADGE = {
  new: ['Nouvelle tâche', 'bg-emerald-50 text-emerald-700'],
  plan: ['Dans le sas', 'bg-blue-50 text-blue-700'],
  planned: ['Déjà planifiée', 'bg-slate-100 text-slate-500'],
};
const SUGG_FIELD = 'px-2 py-1 text-sm rounded-md bg-slate-50 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none';

function suggestStatus(msg, { error = false } = {}) {
  const el = $('#suggest-status');
  el.textContent = msg;
  el.classList.toggle('text-red-700', error);
  el.classList.toggle('text-slate-600', !error);
}

function openSuggestions() {
  const note = notesText.value.trim();
  if (!note) return;
  saveNote();
  const { suggestions, unmatched } = noteSuggestions(note, projects, tasks);
  const orphans = unmatched.flatMap((line) => {
    // « Globex : kakémono » : ce qui précède les deux-points est le nom inconnu, pas une tâche.
    const [head, ...tail] = line.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '').split(':');
    const unknown = tail.length && head.trim() ? head.trim() : '';
    return lineActions(unknown ? tail.join(':') : line, []).map((a) => ({
      kind: 'new', taskId: '', projectId: '', newClient: '', newProject: '', task_name: a.name, hours: a.hours || 1, day: a.day, excerpt: line,
      reason: unknown ? `« ${unknown} » ne correspond à aucun client ni projet : choisis le projet pour retenir la tâche`
        : 'Aucun projet reconnu : choisis-le pour retenir la tâche',
      picked: false,
    }));
  });
  showSuggestions(suggestions, orphans);
}

// Propositions brutes (analyse locale ou réponse de Claude) vérifiées puis affichées pour validation.
function showSuggestions(raw, extra = []) {
  suggItems = reviewSuggestions(raw, projects, tasks).map((it) => ({ ...it, picked: it.kind !== 'planned' })).concat(extra);
  $('#suggest-week').textContent = `D’après le bloc-notes de la ${weekTitle(noteWeek).toLowerCase()}`;
  suggestDialog.showModal();
  renderSuggestions();
}

function renderSuggestions() {
  const byName = (a, b) => a.clients.name.localeCompare(b.clients.name) || a.name.localeCompare(b.name);
  const open = projects.filter((p) => p.status === 'en_cours').sort(byName);
  const projectOptions = (it) => {
    const current = projects.find((p) => p.id === it.projectId);
    const choices = current && current.status !== 'en_cours' ? [current, ...open] : open;
    const first = it.newProject
      ? `<option value="" ${it.projectId ? '' : 'selected'}>+ Nouveau projet : ${esc(it.newClient || DEFAULT_CLIENT)} · ${esc(it.newProject)}</option>`
      : it.projectId ? '' : '<option value="">Choisir un projet…</option>';
    return first + choices.map((p) => `<option value="${p.id}" ${p.id === it.projectId ? 'selected' : ''}>${esc(p.clients.name)} · ${esc(p.name)}${p.status !== 'en_cours' ? ' (archivé : sera rouvert)' : ''}</option>`).join('');
  };
  const dayOptions = (it) => (it.kind === 'new' ? `<option value="" ${it.day ? '' : 'selected'}>Sas d’attente</option>` : '')
    + DAYS.map((d) => `<option ${d === it.day ? 'selected' : ''}>${d}</option>`).join('');
  $('#suggest-list').innerHTML = suggItems.map((it, i) => {
    const [label, cls] = SUGG_BADGE[it.kind];
    const p = projects.find((x) => x.id === it.projectId);
    const active = it.kind !== 'planned';
    const origin = [it.excerpt && `« ${esc(it.excerpt)} »`, it.reason && `<span class="text-slate-400">${esc(it.reason)}</span>`].filter(Boolean).join(' ');
    return `
      <li class="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5 ${active ? '' : 'opacity-60'}">
        <input type="checkbox" class="chk mt-2" data-sugg-pick="${i}" ${it.picked ? 'checked' : ''} ${active ? '' : 'disabled'} aria-label="Retenir « ${esc(it.task_name)} »" />
        <div class="min-w-0 flex-1 basis-56">
          ${it.kind === 'new'
            ? `<input data-sugg-name="${i}" value="${esc(it.task_name)}" maxlength="200" autocomplete="off" aria-label="Nom de la tâche" class="w-full ${SUGG_FIELD} font-medium" />`
            : `<p class="px-2 py-1 text-sm font-medium break-words">${esc(it.task_name)}</p>`}
          ${origin ? `<p class="mt-0.5 px-2 text-xs text-slate-500 break-words">${origin}</p>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
          ${it.kind === 'new'
            ? `<select data-sugg-project="${i}" aria-label="Projet" class="min-w-0 max-w-[16rem] ${SUGG_FIELD}">${projectOptions(it)}</select>
               <input data-sugg-hours="${i}" type="number" min="0" step="0.25" value="${it.hours}" aria-label="Heures" title="Heures" class="w-20 ${SUGG_FIELD}" />`
            : `<span class="min-w-0 max-w-[16rem] truncate text-xs text-slate-500">${p ? `${esc(p.clients.name)} · ${esc(p.name)} · ` : ''}${fmtH(it.hours)}</span>`}
          ${active ? `<select data-sugg-day="${i}" aria-label="Destination" class="${SUGG_FIELD}">${dayOptions(it)}</select>` : `<span class="text-xs text-slate-500">${esc(it.day)}</span>`}
          <span class="shrink-0 whitespace-nowrap text-[11px] font-medium rounded px-1.5 py-0.5 ${cls}">${label}</span>
        </div>
      </li>`;
  }).join('') || '<li class="px-3 py-3 text-sm text-slate-400">Aucune tâche à proposer.</li>';
  $('#suggest-list').classList.remove('hidden');
  const count = (kind) => suggItems.filter((it) => it.kind === kind).length;
  const s = (n) => (n > 1 ? 's' : '');
  const parts = [
    count('new') && `${count('new')} nouvelle${s(count('new'))} tâche${s(count('new'))}`,
    count('plan') && `${count('plan')} à planifier`,
    count('planned') && `${count('planned')} déjà planifiée${s(count('planned'))}`,
  ].filter(Boolean);
  suggestStatus(parts.length ? `${parts.join(' · ')}. Coche ce que tu retiens, ajuste si besoin, puis applique.`
    : 'Aucune tâche reconnue. Cite le client ou le projet sur la ligne (ex. « Acme · Refonte site : maquettes, devis jeudi 2h »).');
  syncSuggestApply();
}

function syncSuggestApply() {
  const n = suggItems.filter((it) => it.picked && it.kind !== 'planned').length;
  $('#suggest-apply').disabled = !n;
  $('#suggest-apply').textContent = n ? `Appliquer (${n})` : 'Appliquer';
}

// Saisies dans la liste : mises à jour sur place (pas de nouveau rendu, le focus reste dans le champ).
function onSuggestEdit(e) {
  const { suggPick, suggName, suggProject, suggHours, suggDay } = e.target.dataset;
  const it = suggItems[suggPick ?? suggName ?? suggProject ?? suggHours ?? suggDay];
  if (!it) return;
  if (suggPick != null) it.picked = e.target.checked;
  if (suggName != null) it.task_name = e.target.value;
  if (suggProject != null) it.projectId = e.target.value;
  if (suggHours != null) it.hours = e.target.value;
  if (suggDay != null) it.day = e.target.value;
  syncSuggestApply();
}
$('#suggest-list').addEventListener('input', onSuggestEdit);
$('#suggest-list').addEventListener('change', onSuggestEdit);

$('#suggest-apply').addEventListener('click', async () => {
  const picked = suggItems.filter((it) => it.picked && it.kind !== 'planned');
  const creations = picked.filter((it) => it.kind === 'new');
  const plans = picked.filter((it) => it.kind === 'plan');
  try {
    creations.forEach((it) => {
      if (!it.task_name.trim()) throw new Error('Une tâche retenue n’a pas de nom.');
      if (!it.projectId && !it.newProject) throw new Error(`Choisis le projet de « ${it.task_name.trim()} ».`);
      it.estimated_hours = parseOptionalHours(it.hours) ?? 0;
    });
  } catch (ex) { suggestStatus(ex.message, { error: true }); return; }
  $('#suggest-apply').disabled = true;
  suggestStatus('Enregistrement…');
  try {
    if (creations.length) {
      const rows = [];
      for (const it of creations) {
        const project = it.projectId ? projects.find((p) => p.id === it.projectId) : await ensureProject(it.newClient, it.newProject);
        await reopenIfArchived(project);
        rows.push({
          project_id: project.id, client_name: project.clients.name, project_name: project.name, task_name: it.task_name.trim(),
          estimated_hours: it.estimated_hours, day_of_week: it.day || null, is_completed: false, label_ids: [],
        });
      }
      tasks = tasks.concat(await db.insert(rows));
      suggItems = suggItems.filter((it) => !creations.includes(it)); // déjà créées : pas de doublon si la suite échoue
    }
    for (const day of DAYS) {
      const batch = plans.filter((it) => it.day === day);
      if (!batch.length) continue;
      const ids = batch.map((it) => it.taskId);
      await api('tasks', `?id=in.(${ids.join(',')})`, { method: 'PATCH', body: { day_of_week: day, group_rank: null } });
      tasks.forEach((t) => { if (ids.includes(t.id)) Object.assign(t, { day_of_week: day, group_rank: null }); });
      suggItems = suggItems.filter((it) => !batch.includes(it));
    }
    suggestDialog.close();
    render();
    const toSas = creations.filter((it) => !it.day).length;
    toast([
      creations.length && `${plural(creations.length, 'tâche')} créée${creations.length > 1 ? 's' : ''}${toSas ? ` (${toSas} dans le sas)` : ''}`,
      plans.length && `${plural(plans.length, 'tâche')} planifiée${plans.length > 1 ? 's' : ''}`,
    ].filter(Boolean).join(' · '));
  } catch (ex) {
    console.error(ex);
    render();
    renderSuggestions();
    suggestStatus(ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message, { error: true });
  }
});

$('#notes-suggest').addEventListener('click', openSuggestions);
const closeSuggest = () => suggestDialog.close();
$('#suggest-close').addEventListener('click', closeSuggest);
$('#suggest-cancel').addEventListener('click', closeSuggest);
suggestDialog.addEventListener('click', (e) => { if (e.target === suggestDialog) closeSuggest(); });

// ---------- Copier pour Claude (Lot 28) ----------
// La note, les projets et les tâches sont copiés avec des consignes ; l'utilisateur les colle dans sa conversation
// Claude (abonnement, sans API), puis recolle la réponse JSON, affichée dans la fenêtre des suggestions.
const CLAUDE_URL_KEY = 'planning_claude_url';
const CLAUDE_REFS_KEY = 'planning_claude_refs'; // codes P…/T… du dernier texte copié : gardés si la page est rechargée
const CLAUDE_DEFAULT_URL = 'https://claude.ai/new';
const claudeDialog = $('#claude-dialog');
let claudeRefs = null;

function claudeUrl() {
  try { return localStorage.getItem(CLAUDE_URL_KEY) || CLAUDE_DEFAULT_URL; } catch { return CLAUDE_DEFAULT_URL; }
}

function storedClaudeRefs() {
  try { return JSON.parse(localStorage.getItem(CLAUDE_REFS_KEY)); } catch { return null; }
}

async function copyForClaude() {
  const note = notesText.value.trim();
  if (!note) return;
  saveNote();
  const { text, refs } = claudePrompt(note, weekTitle(noteWeek).toLowerCase(), projects, tasks);
  claudeRefs = refs;
  try { localStorage.setItem(CLAUDE_REFS_KEY, JSON.stringify(refs)); } catch { /* stockage indisponible */ }
  let copied = true;
  try { await navigator.clipboard.writeText(text); } catch { copied = false; }
  // Presse-papiers refusé : le texte est affiché à part, sélectionné, pour une copie manuelle.
  $('#claude-manual').classList.toggle('hidden', copied);
  $('#claude-prompt').value = copied ? '' : text;
  if (!copied) $('#claude-prompt').select();
  const status = $('#claude-copied');
  status.textContent = copied ? '✓ Texte copié dans le presse-papiers.' : 'Copie automatique impossible : copie le texte surligné ci-dessous.';
  status.classList.toggle('text-red-700', !copied);
  status.classList.toggle('text-slate-500', copied);
}

async function openClaude() {
  if (!notesText.value.trim()) return;
  $('#claude-url').value = claudeUrl();
  $('#claude-open').href = claudeUrl();
  $('#claude-reply').value = '';
  $('#claude-error').classList.add('hidden');
  claudeDialog.showModal();
  await copyForClaude();
}

// Lien de la conversation : validé et mémorisé à chaque saisie ; « Ouvrir » suit le dernier lien valide.
$('#claude-url').addEventListener('input', (e) => {
  let url = '';
  try { url = normalizeUrl(e.target.value); } catch { /* lien incomplet pendant la saisie */ }
  $('#claude-open').href = url || CLAUDE_DEFAULT_URL;
  try {
    if (url) localStorage.setItem(CLAUDE_URL_KEY, url);
    else if (!e.target.value.trim()) localStorage.removeItem(CLAUDE_URL_KEY);
  } catch { /* stockage indisponible */ }
});

$('#claude-copy').addEventListener('click', copyForClaude);

$('#claude-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#claude-error');
  err.classList.add('hidden');
  try {
    const refs = claudeRefs ?? storedClaudeRefs();
    if (!refs) throw new Error('Clique d’abord sur « Recopier le texte » et envoie-le à Claude : sa réponse s’appuie sur ce texte.');
    const raw = parseClaudeReply($('#claude-reply').value, refs);
    claudeDialog.close();
    showSuggestions(raw);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

$('#notes-claude').addEventListener('click', openClaude);
$('#claude-close').addEventListener('click', () => claudeDialog.close());
$('#claude-cancel').addEventListener('click', () => claudeDialog.close());
claudeDialog.addEventListener('click', (e) => { if (e.target === claudeDialog) claudeDialog.close(); });

// Journal des mises à jour + suivi par lot (skill mdui-onboarding-overlays)
const changelogDialog = $('#changelog');
const LATEST = CHANGELOG[0].version;
$('#build-info').textContent = buildLabel(LATEST, window.BUILD?.commit);
const TYPE_LABEL = { majeure: 'Majeure', mineure: 'Mineure', patch: 'Patch' };

function seenVersion() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

function highlightLot(lot) {
  $('#lot-highlight').textContent = lot ? `[data-lot="${lot}"]{outline:2px solid #f59e0b;outline-offset:3px;border-radius:8px}` : '';
}

function renderChangelog() {
  $('#changelog-list').innerHTML = CHANGELOG.map((c) => `
    <li class="border border-slate-200 rounded-lg p-3">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-semibold">v${c.version}</span>
        <span class="text-[11px] font-medium rounded px-1.5 py-0.5 ${c.type === 'majeure' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">${TYPE_LABEL[c.type]}</span>
        <span class="text-xs text-slate-500 ml-auto">${esc(c.lot)}${c.date ? ` · ${esc(c.date)}` : ''}</span>
      </div>
      <ul class="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      ${c.tour ? `<button class="mt-3 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition" data-replay="${esc(c.tour)}">Rejouer le tutoriel</button>` : ''}
    </li>`).join('');
  const lots = [...new Set(CHANGELOG.map((c) => c.lot))];
  $('#lot-select').innerHTML = '<option value="">Aucun</option>' + lots.map((l) => `<option>${esc(l)}</option>`).join('');
}

$('#open-changelog').addEventListener('click', () => {
  changelogDialog.showModal();
  try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* stockage indisponible */ }
  $('#changelog-dot').classList.add('hidden');
});
$('#close-changelog').addEventListener('click', () => changelogDialog.close());
changelogDialog.addEventListener('click', (e) => { if (e.target === changelogDialog) changelogDialog.close(); });
$('#lot-select').addEventListener('change', (e) => highlightLot(e.target.value));
$('#changelog-dot').classList.toggle('hidden', seenVersion() === LATEST);
renderChangelog();

// ---------- Tutoriel pas-à-pas (skill mdui-onboarding-overlays) ----------
const TOUR_KEY = 'planning_tour_done';
const TOURS = {
  'onboarding-v1': {
    steps: [
      { id: 'add', targetSelector: '#add-form', placement: 'bottom', lot: 'Lot 1',
        title: 'Ajouter une tâche',
        content: 'Renseigne le client, le projet, la tâche et les heures, puis choisis un jour. Avec « Sas d’attente », on te propose le projet dans lequel la ranger.' },
      { id: 'notes', targetSelector: '#notes-tab', placement: 'bottom', lot: 'Lot 25',
        title: 'Bloc-notes de la semaine',
        content: 'En début de semaine, déplie le bloc-notes depuis cette pastille et liste les projets prévus. La note s’enregistre toute seule, une par semaine. « Suggérer des tâches » propose ensuite les tâches à créer dans le sas ou à planifier, que tu valides une par une ; « Copier pour Claude » fait analyser la note dans ta conversation Claude.' },
      { id: 'labels', targetSelector: '#add-form [data-label-picker]', placement: 'bottom', lot: 'Lot 14',
        title: 'Étiquettes et réunions',
        content: 'Coche une ou plusieurs étiquettes : la carte prend la teinte de la plus prioritaire. Avec « Réunion », indique l’heure et le lien du salon : la carte affiche l’heure et un bouton « Rejoindre ». Les étiquettes se gèrent dans Réglages.' },
      { id: 'recurrence', targetSelector: '#add-form [data-recurrence-fields]', placement: 'bottom', lot: 'Lot 15',
        title: 'Tâches récurrentes',
        content: 'Choisis « Chaque semaine » ou « Chaque mois » (ex. le 1ᵉʳ mardi) : « Nouvelle Semaine » recréera la tâche quand il le faut. Une occurrence non faite reste sur son jour. Les séries se retrouvent dans Réglages.' },
      { id: 'board', targetSelector: '#board', placement: 'bottom', lot: 'Lot 1',
        title: 'Le planning de la semaine',
        content: 'Glisse les cartes d’un jour à l’autre, ou un conteneur par son en-tête pour réordonner la journée. Survole une carte pour la dupliquer (⧉), la modifier (✎) ou la renvoyer dans le sas (×), et coche-la une fois terminée : elle passe sous les tâches à faire.' },
      { id: 'comments', targetSelector: '#board [data-comment-form]', placement: 'bottom', lot: 'Lot 20',
        title: 'Notes et points à traiter',
        content: 'Écris directement sur une carte (Entrée pour l’ajouter) : c’est une simple note. Active « À traiter » pour créer un point à cocher ; le compteur ambre indique ceux qui restent à traiter. Les liens du projet s’affichent sur la carte, le bouton « Liens » les masque.' },
      { id: 'waiting', targetSelector: '#waiting', placement: 'top', lot: 'Lot 22',
        title: 'Le sas d’attente',
        content: 'Les projets en cours sans tâche cette semaine attendent ici, avec leurs tâches rangées et leur temps effectif face au temps estimé. Glisse un projet sur un jour pour le planifier, ou clique dessus pour voir son détail, régler son estimé et le renommer.' },
      { id: 'sas-search', targetSelector: '#sas-search', placement: 'top', lot: 'Lot 9',
        title: 'Recherche rapide',
        content: 'Tape un client ou un projet pour filtrer le sas et ouvrir sa fiche d’un clic (Entrée ouvre le premier résultat). Le bouton Clients regroupe le sas par client.' },
      { id: 'history', targetSelector: '#tab-history', placement: 'bottom', lot: 'Lot 21',
        title: 'L’historique des semaines',
        content: 'Chaque « Nouvelle Semaine » enregistre ici la semaine close : tâches terminées et reportées, temps par client, et commentaires restés non traités. Le bouton ⧉ d’une tâche la duplique dans le sas d’attente de la semaine active.' },
      { id: 'clients', targetSelector: '#tab-clients', placement: 'bottom', lot: 'Lot 8',
        title: 'Les clients',
        content: 'Chaque client a sa fiche : logo, site web et projets rattachés. Dans le détail d’un projet, ajoute l’année, le devis et des liens d’accès rapide.' },
      { id: 'archives', targetSelector: '#tab-archives', placement: 'bottom', lot: 'Lot 24',
        title: 'Les archives',
        content: 'Les projets archivés depuis le sas sont rangés dans cet onglet ; tu peux les rouvrir à tout moment. Une tâche terminée peut aussi être « consignée » avec son temps passé : elle apparaît ici tout de suite. Chaque élément des archives peut être supprimé définitivement.' },
      { id: 'settings', targetSelector: '#tab-settings', placement: 'bottom', lot: 'Lot 13',
        title: 'Les réglages',
        content: 'Définis ici les types de projet par défaut et leur ordre. Ils sont proposés en premier dans le détail d’un projet, avant les types saisis librement.' },
      { id: 'new-week', targetSelector: '#new-week', placement: 'bottom', lot: 'Lot 4',
        title: 'Nouvelle semaine',
        content: 'Les tâches terminées sont archivées (le temps passé est conservé), la semaine est enregistrée dans l’onglet Historique et les autres tâches reviennent sur Lundi.' },
      { id: 'gcal', targetSelector: '#import-gcal', placement: 'bottom', lot: 'Lot 19',
        title: 'Google Agenda',
        content: 'Importe les réunions visio de la semaine depuis ton agenda : tu valides chaque réunion et son projet ; une réunion déjà saisie au même créneau reçoit simplement son lien.' },
      { id: 'changelog', targetSelector: '#open-changelog', placement: 'bottom', lot: 'Lot 5',
        title: 'Journal des mises à jour',
        content: 'Retrouve ici les nouveautés de chaque version, surligne celles d’un lot, et rejoue ce tutoriel quand tu veux.' },
    ],
  },
};

const tourEl = $('#tour');
const tourSpot = $('#tour-spot');
const tourCard = $('#tour-card');
let tour = null; // { id, steps, index, opener }

function tourDone(id) {
  try { localStorage.setItem(TOUR_KEY, id); } catch { /* stockage indisponible */ }
}

function tourSeen(id) {
  try { return localStorage.getItem(TOUR_KEY) === id; } catch { return false; }
}

function startTour(id, { force = false } = {}) {
  const def = TOURS[id];
  if (!def || tour || (!force && tourSeen(id))) return;
  if (currentRoute() !== 'planning') { location.hash = '#planning'; route(); } // les cibles sont sur la vue Planning
  if (changelogDialog.open) changelogDialog.close();
  tour = { id, steps: def.steps, index: 0, opener: document.activeElement };
  tourEl.classList.remove('hidden');
  showTourStep(0, 1);
}

function endTour() {
  if (!tour) return;
  tourDone(tour.id);
  tourEl.classList.add('hidden');
  tour.opener?.focus?.();
  tour = null;
}

// Affiche l'étape `i` ; `dir` (+1/-1) sert à sauter les cibles absentes ou masquées.
function showTourStep(i, dir) {
  while (tour.steps[i]) {
    const el = document.querySelector(tour.steps[i].targetSelector);
    if (el && el.getClientRects().length) break;
    i += dir;
  }
  if (!tour.steps[i]) return dir > 0 ? endTour() : showTourStep(0, 1);
  tour.index = i;
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;
  $('#tour-lot').textContent = step.lot || '';
  $('#tour-title').textContent = step.title;
  $('#tour-content').textContent = step.content;
  $('#tour-progress').textContent = `Étape ${i + 1} / ${tour.steps.length}`;
  $('#tour-prev').disabled = i === 0;
  $('#tour-next').textContent = last ? 'Terminer' : 'Suivant';
  $('#tour-skip').classList.toggle('hidden', last);
  document.querySelector(step.targetSelector).scrollIntoView({ block: 'center', behavior: 'instant' });
  positionTour();
  $('#tour-next').focus();
}

// Spotlight sur la cible + carte ancrée avec repli si elle déborde de l'écran.
function positionTour() {
  if (!tour) return;
  const step = tour.steps[tour.index];
  const el = document.querySelector(step.targetSelector);
  if (!el) return;
  const pad = 6;
  const r = el.getBoundingClientRect();
  Object.assign(tourSpot.style, {
    top: `${r.top - pad}px`, left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
  });
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = tourCard.offsetWidth;
  const ch = tourCard.offsetHeight;
  const gap = 14;
  const fitsBelow = r.bottom + pad + gap + ch <= vh - 8;
  const fitsAbove = r.top - pad - gap - ch >= 8;
  let top;
  if (step.placement === 'top' && fitsAbove) top = r.top - pad - gap - ch;
  else if (fitsBelow) top = r.bottom + pad + gap;
  else if (fitsAbove) top = r.top - pad - gap - ch;
  else top = Math.max(8, vh - ch - 16); // cible trop grande : carte collée en bas de l'écran
  const left = Math.min(Math.max(8, r.left), Math.max(8, vw - cw - 8));
  tourCard.style.top = `${top}px`;
  tourCard.style.left = `${left}px`;
}

$('#tour-next').addEventListener('click', () => {
  if (tour.index === tour.steps.length - 1) endTour();
  else showTourStep(tour.index + 1, 1);
});
$('#tour-prev').addEventListener('click', () => showTourStep(tour.index - 1, -1));
$('#tour-skip').addEventListener('click', endTour);
tourEl.addEventListener('click', (e) => { if (!tourCard.contains(e.target)) endTour(); });
window.addEventListener('resize', positionTour);
window.addEventListener('scroll', positionTour, { passive: true });

document.addEventListener('keydown', (e) => {
  if (!tour) return;
  if (e.key === 'Escape') { e.preventDefault(); endTour(); return; }
  if (e.key === 'Tab') { // focus piégé dans la carte
    const items = [...tourCard.querySelectorAll('button:not([disabled]):not(.hidden)')];
    if (!items.length) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (!tourCard.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
    else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
  }
});

$('#changelog-list').addEventListener('click', (e) => {
  const id = e.target.dataset.replay;
  if (id) startTour(id, { force: true });
});

// Connexion / déconnexion
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#login-error');
  err.classList.add('hidden');
  try {
    saveSession(await authRequest('password', { email: f.email.value.trim(), password: f.password.value }));
    f.password.value = '';
    await start();
  } catch (ex) {
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

$('#logout').addEventListener('click', async () => {
  await saveNote(); // en cas d'échec, le brouillon local est renvoyé à la prochaine connexion
  setNotesOpen(false);
  notes = [];
  noteDirty = false;
  noteWeek = weekKey(new Date());
  notesText.value = '';
  noteStatus('');
  claudeRefs = null;
  try { localStorage.removeItem(CLAUDE_REFS_KEY); } catch { /* stockage indisponible */ }
  saveSession(null);
  tasks = [];
  history = [];
  projects = [];
  clients = [];
  clientsList.query = ''; clientsList.filter = null; clientsList.sort = 'nom'; $('#clients-search').value = '';
  links = [];
  comments = [];
  weeks = [];
  projectTypes = [];
  labels = [];
  recurrences = [];
  openComments.clear();
  openWeeks.clear();
  todoDrafts.clear();
  setAuthed(false);
});

// ---------- Init ----------
async function start() {
  setAuthed(true);
  render();
  await run(async () => {
    [clients, projects, tasks, history, links, comments, weeks, projectTypes, labels, recurrences] = await Promise.all([
      db.listClients(), db.listProjects(), db.list(), db.listHistory(), db.listLinks(), db.listComments(), db.listWeeks(),
      db.listTypes(), db.listLabels(), db.listRecurrences(),
    ]);
    render();
  });
  // Bloc-notes chargé à part : sans sa table (SQL du Lot 25 pas encore exécuté), le reste de l'application fonctionne.
  try {
    notes = await db.listNotes();
    renderNotes();
    restoreDraft();
  } catch (ex) {
    console.error(ex);
    renderNotes();
    noteStatus(noteError(ex), true);
  }
  if (GOOGLE_CLIENT_ID) loadGis().catch(() => { /* réessayé au clic sur « Google Agenda » */ });
  setTimeout(() => startTour('onboarding-v1'), 400); // une seule fois (état mémorisé)
}

loadSession();
route();
if (session) start();
else setAuthed(false);
