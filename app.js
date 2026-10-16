const SUPABASE_URL = 'https://eubxxvoiudlopkimysaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Ynh4dm9pdWRsb3BraW15c2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODkwMTksImV4cCI6MjEwNzM2NTAxOX0.LUdqhs06JZ98yE2M5_oifX6is0hyGWwGnU1iWXDkTOE';

// Règles métier pures : voir logic.js (testées dans tests/logic.test.js)
const { DAYS, same, suggestProjects: suggestFrom, projectSuggestions, typeSuggestions, typeNameError, moveItem, parkedTasks, waitingProjects, projectTime, newWeek, normalizeTask, routeOf, routeParam, buildLabel,
  normalizeUrl, parseYear, clientNameError, deleteClientBlocker, clientProjects,
  searchEntities, filterProjects, groupByClient,
  pendingCount, pendingByProject, finishedWithPending, parseComment, linksOf,
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
const openWeeks = new Set(); // fiches de semaine dépliées dans l'historique
const openComments = new Set(); // cartes dont la liste de commentaires est dépliée
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

async function api(table, query = '', { method = 'GET', body, prefer } = {}, retried = false) {
  const res = await fetch(`${REST}/${table}${query}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && session && !retried) {
    try { await refreshSession(); } catch { setAuthed(false); throw new Error('Session expirée, reconnecte-toi.'); }
    return api(table, query, { method, body, prefer }, true);
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
};

// Retrouve (ou crée) le client puis le projet correspondant.
async function ensureProject(clientName, projectName) {
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
    method: 'POST', body: { client_id: client.id, name: pName }, prefer: 'return=representation',
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
function cardHTML(t) {
  const done = t.is_completed;
  return `
    <article class="card group relative bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition ${done ? 'opacity-60' : ''}"
             draggable="true" data-id="${t.id}">
      <div class="flex items-start gap-2">
        <input type="checkbox" class="chk mt-0.5" ${done ? 'checked' : ''} data-toggle="${t.id}" aria-label="Terminée" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium leading-snug break-words hyphens-auto ${done ? 'line-through text-slate-400' : ''}" lang="fr">${esc(t.task_name)}</p>
          <p class="text-xs text-slate-500 mt-1 truncate">${esc(taskClient(t))} · ${esc(taskProject(t))}</p>
        </div>
      </div>
      <!-- Actions en surimpression au survol : le titre garde toute la largeur de la carte -->
      <div class="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-white/95 px-1 py-0.5 shadow-sm ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button class="text-slate-400 hover:text-slate-900 text-sm leading-none px-0.5"
                data-edit="${t.id}" data-lot="Lot 1" title="Modifier" aria-label="Modifier">✎</button>
        <button class="text-slate-400 hover:text-red-500 text-base leading-none px-0.5"
                data-unplan="${t.id}" data-lot="Lot 12" title="Retirer du planning (retour dans le sas)" aria-label="Retirer du planning">×</button>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span class="inline-block text-[11px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">${fmtH(t.estimated_hours)}</span>
        ${commentBadgeHTML(t)}
      </div>
      ${showLinks ? cardLinksHTML(t) : ''}
      ${openComments.has(t.id) ? `<ul class="mt-2 space-y-1" data-lot="Lot 10">${taskComments(t.id).map(commentHTML).join('')}</ul>` : ''}
      <form class="mt-2" data-comment-form="${t.id}" data-lot="Lot 10">
        <input name="body" autocomplete="off" maxlength="2000" placeholder="Commenter…" aria-label="Ajouter un commentaire à « ${esc(t.task_name)} »"
          class="w-full px-2 py-1 text-xs rounded-md bg-slate-50 border border-transparent placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none" />
      </form>
    </article>`;
}

const taskComments = (taskId) => comments.filter((c) => c.task_id === taskId);

const BUBBLE = '<svg viewBox="0 0 16 16" aria-hidden="true" class="w-3 h-3 fill-current"><path d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3.5 3v-3H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>';

// Compteur en direct : nombre de commentaires non traités (ambre), sinon total traité (gris).
function commentBadgeHTML(t) {
  const all = taskComments(t.id).length;
  if (!all) return '';
  const pending = pendingCount(comments, t.id);
  const cls = pending ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200';
  const label = pending ? `${pending} commentaire${pending > 1 ? 's' : ''} non traité${pending > 1 ? 's' : ''}` : `${all} commentaire${all > 1 ? 's' : ''} traité${all > 1 ? 's' : ''}`;
  return `<button type="button" data-comments="${t.id}" aria-expanded="${openComments.has(t.id)}" title="${label}" aria-label="${label}"
    class="inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 tabular-nums transition ${cls}">${BUBBLE}${pending || all}</button>`;
}

function commentHTML(c) {
  return `
    <li class="group/c flex items-start gap-1.5 text-xs">
      <input type="checkbox" class="chk mt-px" ${c.is_done ? 'checked' : ''} data-comment-toggle="${c.id}" aria-label="Commentaire traité" />
      <span class="min-w-0 flex-1 break-words whitespace-pre-line ${c.is_done ? 'line-through text-slate-400' : 'text-slate-700'}">${esc(c.body)}</span>
      <button type="button" class="opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 text-slate-300 hover:text-red-500 leading-none transition"
              data-delete-comment="${c.id}" title="Supprimer le commentaire" aria-label="Supprimer le commentaire">×</button>
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

function render() {
  $('#board').innerHTML = DAYS.map((day) => {
    const list = tasks.filter((t) => t.day_of_week === day);
    const total = list.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
    return `
      <section class="col flex flex-col rounded-xl bg-slate-100/60 p-2 min-h-[200px] md:min-h-[60vh] transition" data-day="${day}">
        <div class="flex items-baseline justify-between px-2 pt-1 pb-2.5">
          <h2 class="text-sm font-semibold">${day}</h2>
          <span class="text-xs font-medium text-slate-500 tabular-nums" data-total="${day}">${fmtH(total)}</span>
        </div>
        <div class="flex flex-col gap-2 flex-1">${list.map(cardHTML).join('')}</div>
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
  renderSettings();
  $('#clients-list').innerHTML = clients.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
  fillProjectList($('#add-form').client_name.value);
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
  if (e.target.name === 'client_name' && e.target.form?.project_name?.getAttribute('list') === 'projects-list') fillProjectList(e.target.value);
});

// Tâche rangée dans le dossier de son projet (sas d'attente) : glissable vers un jour du planning.
function parkedHTML(t) {
  return `
    <article class="card group flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-slate-300 transition"
             draggable="true" data-id="${t.id}">
      <p class="min-w-0 flex-1 text-sm break-words ${t.is_completed ? 'line-through text-slate-400' : ''}">${esc(t.task_name)}</p>
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
        <button class="min-w-0 flex-1 text-left" data-open="${p.id}" title="Détail du projet">
          <span class="block text-sm font-medium truncate">${esc(p.name)}</span>
          ${[showClient && p.clients.name, p.type].filter(Boolean).length
            ? `<span class="block text-xs text-slate-500 truncate">${esc([showClient && p.clients.name, p.type].filter(Boolean).join(' · '))}</span>` : ''}
        </button>
        ${projectPendingHTML(p)}
        <button class="text-xs text-slate-400 hover:text-slate-900 px-1.5 py-1 rounded transition" data-finish="${p.id}"
                title="Archiver le projet (terminé)">Archiver</button>
      </div>
      <div class="mt-2 flex flex-col gap-1.5">
        ${list.length ? list.map(parkedHTML).join('') : '<p class="text-xs text-slate-400">Aucune tâche rangée.</p>'}
      </div>
    </li>`;
}

function projectPendingHTML(p) {
  const n = pendingByProject(comments, tasks.concat(history), p.id);
  return n ? `<span class="shrink-0 inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 tabular-nums"
    title="${n} commentaire${n > 1 ? 's' : ''} non traité${n > 1 ? 's' : ''}" data-lot="Lot 10">${BUBBLE}${n}</span>` : '';
}

// Sas d'attente : projets en cours sans tâche planifiée dans la semaine, ou ayant des tâches rangées dans leur dossier.
function renderWaiting() {
  const waiting = filterProjects(waitingProjects(projects, tasks), sasQuery);
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
  else openProject(projectId);
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

// Page Archives : projets terminés, groupés par client.
function renderArchives() {
  const done = projects.filter((p) => p.status === 'termine');
  $('#archives-count').textContent = done.length;
  const byClient = new Map();
  done.forEach((p) => {
    if (!byClient.has(p.clients.name)) byClient.set(p.clients.name, []);
    byClient.get(p.clients.name).push(p);
  });
  $('#archives-list').innerHTML = done.length
    ? [...byClient].sort((a, b) => a[0].localeCompare(b[0])).map(([client, list]) => `
        <section>
          <h3 class="text-sm font-semibold mb-2">${esc(client)}</h3>
          <ul class="flex flex-col gap-2">
            ${list.map((p) => {
              const n = tasks.concat(history).filter((t) => t.project_id === p.id).length;
              return `
              <li class="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
                <span class="min-w-0 flex-1 text-sm font-medium truncate">${esc(p.name)}</span>
                <span class="text-xs text-slate-500">${n} tâche${n > 1 ? 's' : ''}</span>
                <button class="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                        data-reopen="${p.id}">Rouvrir</button>
              </li>`;
            }).join('')}
          </ul>
        </section>`).join('')
    : '<p class="text-sm text-slate-400">Aucun projet archivé pour le moment.</p>';
}

// Navigation par onglets (hash) : une vue #<nom>-view par onglet.
const ROUTES = ['planning', 'history', 'clients', 'archives', 'settings'];
const currentRoute = () => routeOf(location.hash, ROUTES);

function route() {
  const active = currentRoute();
  ROUTES.forEach((name) => {
    $(`#${name}-view`).classList.toggle('hidden', name !== active);
    const tab = $(`#tab-${name}`);
    if (name === active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  renderClients();
}
window.addEventListener('hashchange', route);

// ---------- Actions ----------
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const draft = {
    client: f.client_name.value,
    project: f.project_name.value,
    task_name: f.task_name.value.trim(),
    estimated_hours: parseFloat(f.estimated_hours.value) || 0,
    day_of_week: f.day_of_week.value || null,
  };
  // Tâche ajoutée directement dans le sas : on demande dans quel projet la ranger.
  if (!draft.day_of_week) return openAssign(draft);
  run(async () => {
    await createTask(await ensureProject(draft.client, draft.project), draft);
    resetAddForm();
  });
});

function resetAddForm() {
  const f = $('#add-form');
  f.task_name.value = '';
  f.estimated_hours.value = '';
  f.task_name.focus();
}

async function createTask(project, draft) {
  const [created] = await db.insert({
    project_id: project.id,
    client_name: project.clients.name,
    project_name: project.name,
    task_name: draft.task_name,
    estimated_hours: draft.estimated_hours,
    day_of_week: draft.day_of_week,
    is_completed: false,
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
      project = await ensureProject(f.new_client.value, f.new_project.value);
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
    const [created] = await api('task_comments', '', { method: 'POST', body: { task_id: taskId, body }, prefer: 'return=representation' });
    comments.push(created);
    openComments.add(taskId);
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
  refreshProjectDialog();
  run(() => api('task_comments', `?id=eq.${id}`, { method: 'PATCH', body: { is_done: done } }), () => { c.is_done = prev; refreshProjectDialog(); });
}

function deleteComment(id) {
  const snapshot = comments;
  comments = comments.filter((x) => x.id !== id);
  render();
  refreshProjectDialog();
  run(() => api('task_comments', `?id=eq.${id}`, { method: 'DELETE' }), () => { comments = snapshot; refreshProjectDialog(); });
}

function onCommentAction(e) {
  const toggle = e.target.closest('[data-comments]')?.dataset.comments;
  if (toggle) {
    if (openComments.has(toggle)) openComments.delete(toggle); else openComments.add(toggle);
    render();
    return true;
  }
  const del = e.target.dataset.deleteComment;
  if (del) { deleteComment(del); return true; }
  return false;
}

$('#board').addEventListener('change', (e) => {
  const commentId = e.target.dataset.commentToggle;
  if (commentId) return toggleComment(commentId, e.target.checked);
  const id = e.target.dataset.toggle;
  if (!id) return;
  const t = tasks.find((x) => x.id === id);
  const prev = t.is_completed;
  t.is_completed = e.target.checked;
  render();
  run(() => db.update(id, { is_completed: t.is_completed }), () => { t.is_completed = prev; });
});

// Édition / suppression : cartes du planning et tâches rangées dans le sas
function onTaskAction(e) {
  if (onCommentAction(e)) return;
  const editId = e.target.dataset.edit;
  if (editId) return openEdit(editId);
  const unplan = e.target.dataset.unplan;
  if (unplan) return unplanTask(unplan);
  const id = e.target.dataset.delete;
  if (id) deleteTaskForever(id);
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
    message: `« ${t.task_name} » sera supprimée${n > 1 ? ` avec ses ${n} commentaires` : n ? ' avec son commentaire' : ''}. Cette action est irréversible.`,
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

// Drag & drop : planning (jours) <-> sas d'attente (tâche rangée dans le dossier de son projet)
let dragId = null; // tâche en cours de déplacement
let dragFolder = null; // projet (dossier du sas) en cours de déplacement
const board = $('#planning-view');

board.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  const folder = e.target.closest('.folder');
  if (!card && !folder) return;
  if (card) dragId = card.dataset.id;
  else dragFolder = folder.dataset.folder;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId || dragFolder);
  const el = card || folder;
  requestAnimationFrame(() => el.classList.add('dragging'));
});

board.addEventListener('dragend', () => {
  dragId = null;
  dragFolder = null;
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});

// Cible de dépôt : une colonne de jour, ou l'ensemble du sas (day = null)
const dropTarget = (e) => e.target.closest('.col, #waiting');

board.addEventListener('dragover', (e) => {
  const zone = dropTarget(e);
  if (!zone || !(dragId || dragFolder)) return;
  if (dragFolder && !zone.dataset.day) return; // un projet se dépose sur un jour uniquement
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach((el) => el !== zone && el.classList.remove('drag-over'));
  zone.classList.add('drag-over');
});

board.addEventListener('drop', (e) => {
  const zone = dropTarget(e);
  if (!zone || !(dragId || dragFolder)) return;
  e.preventDefault();
  if (dragFolder) return dropFolder(dragFolder, zone.dataset.day);
  const day = zone.dataset.day ?? null;
  const t = tasks.find((x) => x.id === dragId);
  dragId = null;
  if (!t || t.day_of_week === day) return render();
  const prev = t.day_of_week;
  t.day_of_week = day;
  render();
  run(() => db.update(t.id, { day_of_week: day }), () => { t.day_of_week = prev; });
});

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
  parked.forEach((t) => { t.day_of_week = day; });
  render();
  run(
    () => api('tasks', `?project_id=eq.${projectId}&day_of_week=is.null`, { method: 'PATCH', body: { day_of_week: day } }),
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
  const archivedAt = new Date().toISOString();
  const stats = weekSnapshot(tasks, keepIds);
  const next = newWeek(tasks, history, archivedAt, keepIds);
  const keep = keepIds.length ? `&id=not.in.(${keepIds.join(',')})` : '';
  const snapshot = { tasks, history, weeks };
  ({ tasks, history } = next);
  render();
  let week = null;
  run(
    async () => {
      if (next.finished) {
        [week] = await api('weeks', '', { method: 'POST', body: { closed_at: archivedAt, ...stats }, prefer: 'return=representation' });
        try {
          await api('tasks', `?is_completed=eq.true&archived_at=is.null${keep}`, { method: 'PATCH', body: { archived_at: archivedAt, week_id: week.id } });
        } catch (ex) { // tâches non archivées : la semaine enregistrée n'a plus lieu d'être
          await api('weeks', `?id=eq.${week.id}`, { method: 'DELETE' }).catch(() => {});
          throw ex;
        }
        weeks = [week, ...weeks];
        history.forEach((t) => { if (t.archived_at === archivedAt) t.week_id = week.id; });
        render();
      }
      if (next.moving) {
        await api('tasks', '?is_completed=eq.false&archived_at=is.null&day_of_week=not.is.null', { method: 'PATCH', body: { day_of_week: 'Lundi' } });
        if (keepIds.length) {
          await api('tasks', `?id=in.(${keepIds.join(',')})&day_of_week=not.is.null`, { method: 'PATCH', body: { day_of_week: 'Lundi' } });
        }
      }
      if (keepIds.length) toast(`${keepIds.length} tâche${keepIds.length > 1 ? 's' : ''} gardée${keepIds.length > 1 ? 's' : ''} dans le planning`);
    },
    () => { ({ tasks, history, weeks } = snapshot); }
  );
}

const weekDialog = $('#week-dialog');
let weekPending = [];

$('#new-week').addEventListener('click', () => {
  weekPending = finishedWithPending(tasks, comments);
  const finished = tasks.filter((t) => t.is_completed).length;
  if (!weekPending.length) {
    const question = finished
      ? `Nouvelle semaine : archiver ${finished} tâche(s) terminée(s), enregistrer la semaine dans l'historique et ramener les autres sur Lundi ?`
      : 'Aucune tâche terminée : rien à archiver, aucune semaine ne sera enregistrée. Ramener les tâches planifiées sur Lundi ?';
    askConfirm({ title: 'Nouvelle semaine', message: question, confirmLabel: finished ? 'Archiver et continuer' : 'Ramener sur Lundi' })
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
  $('#week-summary').textContent = `${finished} tâche${finished > 1 ? 's' : ''} terminée${finished > 1 ? 's' : ''} au total`
    + (others > 1 ? ` : les ${others} autres seront archivées dans tous les cas.`
      : others ? ' : l’autre sera archivée dans tous les cas.' : '.');
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
  editForm.day_of_week.value = t.day_of_week ?? '';
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
    const project = await ensureProject(f.client_name.value, f.project_name.value);
    const updated = await db.updateFull(f.dataset.id, {
      project_id: project.id,
      client_name: project.clients.name,
      project_name: project.name,
      task_name: f.task_name.value.trim(),
      estimated_hours: parseFloat(f.estimated_hours.value) || 0,
      day_of_week: f.day_of_week.value || null,
    });
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
    openProject(openId);
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

function openProject(id, { keepForm = false } = {}) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  projectEditForm.dataset.id = id;
  if (!keepForm) {
    projectEditForm.project_name.value = p.name;
    projectEditForm.year.value = p.year ?? '';
    projectEditForm.type.value = p.type ?? '';
    fillTypeList();
    projectEditForm.quote_label.value = p.quote_label ?? '';
    projectEditForm.quote_url.value = p.quote_url ?? '';
    $('#project-error').classList.add('hidden');
  }
  $('#project-client').textContent = p.clients.name;
  renderProjectLinks(p);
  const current = tasks.filter((t) => t.project_id === id);
  const past = history.filter((t) => t.project_id === id);
  const time = projectTime(tasks, history, id);
  $('#project-stats').innerHTML = `
    <div><dt class="text-xs text-slate-500">Tâches</dt><dd class="text-sm font-semibold">${time.count}</dd></div>
    <div><dt class="text-xs text-slate-500">Temps prévu</dt><dd class="text-sm font-semibold">${fmtH(time.planned)}</dd></div>
    <div><dt class="text-xs text-slate-500">Temps passé</dt><dd class="text-sm font-semibold">${fmtH(time.spent)}</dd></div>`;
  const row = (t, status) => {
    const list = taskComments(t.id);
    return `
    <li class="py-1.5 border-b border-slate-100 last:border-0">
      <div class="flex items-center gap-2 text-sm">
        <span class="min-w-0 flex-1 truncate ${t.is_completed ? 'line-through text-slate-400' : ''}">${esc(t.task_name)}</span>
        <span class="text-xs text-slate-500">${esc(status)}</span>
        <span class="text-xs font-medium tabular-nums">${fmtH(t.estimated_hours)}</span>
      </div>
      ${list.length ? `<ul class="mt-1 pl-3 space-y-1" data-lot="Lot 10">${list.map(commentHTML).join('')}</ul>` : ''}
    </li>`;
  };
  const date = (t) => new Date(t.archived_at).toLocaleDateString('fr-FR');
  $('#project-tasks').innerHTML = (current.length || past.length)
    ? current.map((t) => row(t, t.is_completed ? 'Terminée' : t.day_of_week || 'Sas')).join('')
      + (past.length
        ? `<li class="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500" data-lot="Lot 4">Historique</li>`
          + past.map((t) => row(t, `Terminée · ${date(t)}`)).join('')
        : '')
    : '<li class="text-sm text-slate-400 py-1">Aucune tâche rattachée.</li>';
  if (!projectDialog.open) projectDialog.showModal();
}

projectDialog.addEventListener('click', (e) => { if (e.target === projectDialog) projectDialog.close(); });

// Rafraîchit la liste des tâches du détail projet ouvert (commentaires cochés / supprimés).
function refreshProjectDialog() {
  if (!projectDialog.open) return;
  const scroll = $('#project-tasks').scrollTop;
  openProject(projectEditForm.dataset.id, { keepForm: true });
  $('#project-tasks').scrollTop = scroll;
}

$('#project-tasks').addEventListener('change', (e) => {
  const id = e.target.dataset.commentToggle;
  if (id) toggleComment(id, e.target.checked);
});
$('#project-tasks').addEventListener('click', (e) => {
  const id = e.target.dataset.deleteComment;
  if (id) deleteComment(id);
});
$('#project-close').addEventListener('click', () => projectDialog.close());
$('#project-plan').addEventListener('click', () => {
  const p = projects.find((x) => x.id === projectEditForm.dataset.id);
  projectDialog.close();
  prefillAdd(p);
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
    const patch = { name, year, type: canonicalType(f.type.value), quote_label: quoteUrl ? quoteLabel : null, quote_url: quoteUrl || null };
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
  const open = e.target.closest('[data-open-project]')?.dataset.openProject;
  if (open) openProject(open);
}));

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  run(async () => {
    const p = await ensureProject(f.client_name.value, f.project_name.value);
    if (p.status !== 'en_cours') {
      await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: { status: 'en_cours' } });
      p.status = 'en_cours';
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
        <span class="min-w-0 flex-1">
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
                  <span class="text-xs font-medium tabular-nums">${fmtH(t.estimated_hours)}</span>
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
  const id = e.target.dataset.deleteComment;
  if (id) deleteComment(id);
});

// ---------- Clients : liste et fiche (#clients/<id>) ----------
const initials = (name) => esc(name.trim().slice(0, 2).toUpperCase());
const logoHTML = (c, size) => c.logo
  ? `<img src="${esc(c.logo)}" alt="" class="${size} rounded-lg object-cover bg-white border border-slate-200" />`
  : `<span class="${size} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-400">${initials(c.name)}</span>`;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

function renderClients() {
  const id = currentRoute() === 'clients' ? routeParam(location.hash) : '';
  const client = clients.find((c) => c.id === id);
  $('#clients-index').classList.toggle('hidden', !!client);
  $('#client-page').classList.toggle('hidden', !client);
  $('#clients-count').textContent = clients.length;
  if (client) return renderClientPage(client);
  $('#client-edit-form').dataset.id = '';
  const list = clients.map((c) => {
    const ps = projects.filter((p) => p.client_id === c.id);
    const open = ps.filter((p) => p.status === 'en_cours').length;
    return `
      <li>
        <a href="#clients/${c.id}" class="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-slate-300 transition">
          ${logoHTML(c, 'w-12 h-12 shrink-0')}
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium truncate">${esc(c.name)}</span>
            <span class="block text-xs text-slate-500 truncate">${c.website ? esc(hostOf(c.website)) : 'Pas de site web'}</span>
            <span class="block text-xs text-slate-500">${ps.length} projet${ps.length > 1 ? 's' : ''}${open ? ` · ${open} en cours` : ''}</span>
          </span>
        </a>
      </li>`;
  });
  $('#clients-grid').innerHTML = list.join('') || '<li class="text-sm text-slate-400">Aucun client pour le moment.</li>';
}

function renderClientPage(c) {
  const f = $('#client-edit-form');
  if (f.dataset.id !== c.id) { // première ouverture de cette fiche : on remplit le formulaire
    f.dataset.id = c.id;
    f.client_name.value = c.name;
    f.website.value = c.website ?? '';
    $('#client-error').classList.add('hidden');
  }
  $('#client-logo').innerHTML = c.logo
    ? `<img src="${esc(c.logo)}" alt="Logo de ${esc(c.name)}" class="w-full h-full object-cover" />`
    : initials(c.name);
  $('#client-logo-clear').disabled = !c.logo;
  const ps = clientProjects(projects, c.id);
  $('#client-projects-count').textContent = ps.length;
  $('#client-projects').innerHTML = ps.map((p) => `
    <li class="flex items-center gap-2 py-2 text-sm">
      <button type="button" class="min-w-0 flex-1 text-left truncate font-medium hover:underline" data-open-project="${p.id}">${esc(p.name)}</button>
      ${p.type ? `<span class="hidden sm:inline text-xs text-slate-500 truncate max-w-[10rem]">${esc(p.type)}</span>` : ''}
      <span class="text-xs text-slate-500 tabular-nums">${p.year ?? ''}</span>
      ${p.status === 'termine'
        ? `<span class="text-[11px] font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Terminé</span>
           <button type="button" class="text-xs font-medium px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition" data-reopen="${p.id}">Rouvrir</button>`
        : '<span class="text-[11px] font-medium bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">En cours</span>'}
    </li>`).join('') || '<li class="py-2 text-sm text-slate-400">Aucun projet rattaché.</li>';
  const blocker = deleteClientBlocker(c, projects, DEFAULT_CLIENT);
  $('#client-delete').disabled = !!blocker;
  $('#client-delete-reason').textContent = blocker;
}

const currentClient = () => clients.find((c) => c.id === $('#client-edit-form').dataset.id);

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

$('#client-project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const c = currentClient();
  const err = $('#client-error');
  err.classList.add('hidden');
  run(async () => {
    const name = f.project_name.value.trim();
    if (projects.some((p) => p.client_id === c.id && same(p.name, name))) throw new Error('Ce client a déjà un projet portant ce nom.');
    await ensureProject(c.name, name);
    f.reset();
    render();
  });
});

$('#client-delete').addEventListener('click', async () => {
  const c = currentClient();
  const err = $('#client-error');
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

function renderSettings() {
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
      { id: 'board', targetSelector: '#board', placement: 'bottom', lot: 'Lot 1',
        title: 'Le planning de la semaine',
        content: 'Glisse les cartes d’un jour à l’autre. Survole une carte pour la modifier (✎) ou la renvoyer dans le sas (×), et coche-la une fois terminée.' },
      { id: 'comments', targetSelector: '#board [data-comment-form]', placement: 'bottom', lot: 'Lot 10',
        title: 'Commentaires et liens',
        content: 'Écris un commentaire directement sur une carte (Entrée pour l’ajouter). Le compteur ambre indique les commentaires non traités ; clique dessus pour les cocher. Les liens du projet s’affichent sur la carte, le bouton « Liens » les masque.' },
      { id: 'waiting', targetSelector: '#waiting', placement: 'top', lot: 'Lot 3',
        title: 'Le sas d’attente',
        content: 'Les projets en cours sans tâche cette semaine attendent ici, avec leurs tâches rangées. Glisse un projet sur un jour pour le planifier, ou clique dessus pour voir son détail, son temps passé et le renommer.' },
      { id: 'sas-search', targetSelector: '#sas-search', placement: 'top', lot: 'Lot 9',
        title: 'Recherche rapide',
        content: 'Tape un client ou un projet pour filtrer le sas et ouvrir sa fiche d’un clic (Entrée ouvre le premier résultat). Le bouton Clients regroupe le sas par client.' },
      { id: 'history', targetSelector: '#tab-history', placement: 'bottom', lot: 'Lot 11',
        title: 'L’historique des semaines',
        content: 'Chaque « Nouvelle Semaine » enregistre ici la semaine close : tâches terminées et reportées, temps par client, et commentaires restés non traités.' },
      { id: 'clients', targetSelector: '#tab-clients', placement: 'bottom', lot: 'Lot 8',
        title: 'Les clients',
        content: 'Chaque client a sa fiche : logo, site web et projets rattachés. Dans le détail d’un projet, ajoute l’année, le devis et des liens d’accès rapide.' },
      { id: 'archives', targetSelector: '#tab-archives', placement: 'bottom', lot: 'Lot 2',
        title: 'Les archives',
        content: 'Les projets archivés depuis le sas sont rangés dans cet onglet. Tu peux les rouvrir à tout moment.' },
      { id: 'settings', targetSelector: '#tab-settings', placement: 'bottom', lot: 'Lot 13',
        title: 'Les réglages',
        content: 'Définis ici les types de projet par défaut et leur ordre. Ils sont proposés en premier dans le détail d’un projet, avant les types saisis librement.' },
      { id: 'new-week', targetSelector: '#new-week', placement: 'bottom', lot: 'Lot 4',
        title: 'Nouvelle semaine',
        content: 'Les tâches terminées sont archivées (le temps passé est conservé), la semaine est enregistrée dans l’onglet Historique et les autres tâches reviennent sur Lundi.' },
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

$('#logout').addEventListener('click', () => {
  saveSession(null);
  tasks = [];
  history = [];
  projects = [];
  clients = [];
  links = [];
  comments = [];
  weeks = [];
  projectTypes = [];
  openComments.clear();
  openWeeks.clear();
  setAuthed(false);
});

// ---------- Init ----------
async function start() {
  setAuthed(true);
  render();
  await run(async () => {
    [clients, projects, tasks, history, links, comments, weeks, projectTypes] = await Promise.all([
      db.listClients(), db.listProjects(), db.list(), db.listHistory(), db.listLinks(), db.listComments(), db.listWeeks(), db.listTypes(),
    ]);
    render();
  });
  setTimeout(() => startTour('onboarding-v1'), 400); // une seule fois (état mémorisé)
}

loadSession();
route();
if (session) start();
else setAuthed(false);
