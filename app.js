const SUPABASE_URL = 'https://eubxxvoiudlopkimysaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Ynh4dm9pdWRsb3BraW15c2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODkwMTksImV4cCI6MjEwNzM2NTAxOX0.LUdqhs06JZ98yE2M5_oifX6is0hyGWwGnU1iWXDkTOE';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = 'planning_session';
const SEEN_KEY = 'planning_changelog_seen';
const DEFAULT_CLIENT = 'Sans client';
const DEFAULT_PROJECT = 'Sans projet';
const TASK_SELECT = '*,projects(id,name,status,clients(id,name))';
const PROJECT_SELECT = '*,clients(id,name)';

// Journal des mises à jour (skill mdui-onboarding-overlays) — une entrée par lot livré.
const CHANGELOG = [
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
};

// Retrouve (ou crée) le client puis le projet correspondant.
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bg-slate-900', type !== 'error');
  el.classList.toggle('bg-red-600', type === 'error');
  el.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-4'), type === 'error' ? 6000 : 3500);
}

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
    <article class="card group bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition ${done ? 'opacity-60' : ''}"
             draggable="true" data-id="${t.id}">
      <div class="flex items-start gap-2.5">
        <input type="checkbox" class="chk mt-0.5" ${done ? 'checked' : ''} data-toggle="${t.id}" aria-label="Terminée" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium leading-snug break-words ${done ? 'line-through text-slate-400' : ''}">${esc(t.task_name)}</p>
          <p class="text-xs text-slate-500 mt-1 truncate">${esc(taskClient(t))} · ${esc(taskProject(t))}</p>
        </div>
        <button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-300 hover:text-slate-700 text-sm leading-none transition"
                data-edit="${t.id}" data-lot="Lot 1" title="Modifier" aria-label="Modifier">✎</button>
        <button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-300 hover:text-red-500 text-base leading-none transition"
                data-delete="${t.id}" title="Supprimer" aria-label="Supprimer">×</button>
      </div>
      <div class="mt-2 pl-[26px]">
        <span class="inline-block text-[11px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">${fmtH(t.estimated_hours)}</span>
      </div>
    </article>`;
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

  const open = tasks.filter((t) => t.day_of_week && !t.is_completed);
  const hours = open.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
  $('#summary').textContent = `${open.length} tâche${open.length > 1 ? 's' : ''} à faire · ${fmtH(hours)}`;

  renderWaiting();
  renderArchives();
  $('#clients-list').innerHTML = clients.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
  $('#projects-list').innerHTML = [...new Set(projects.map((p) => p.name))].map((n) => `<option value="${esc(n)}"></option>`).join('');
}

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
              data-delete="${t.id}" title="Supprimer" aria-label="Supprimer">×</button>
    </article>`;
}

// Sas d'attente : projets en cours sans tâche planifiée dans la semaine, ou ayant des tâches rangées dans leur dossier.
function renderWaiting() {
  const planned = new Set(tasks.filter((t) => t.day_of_week).map((t) => t.project_id));
  const parked = (p) => tasks.filter((t) => t.project_id === p.id && !t.day_of_week);
  const waiting = projects.filter((p) => p.status === 'en_cours' && (!planned.has(p.id) || parked(p).length));
  $('#waiting-count').textContent = waiting.length;
  $('#waiting-list').innerHTML = waiting.length
    ? waiting.map((p) => {
      const list = parked(p);
      return `
        <li class="folder bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing" data-lot="Lot 3"
            draggable="true" data-folder="${p.id}">
          <div class="flex items-start gap-1">
            <button class="min-w-0 flex-1 text-left" data-open="${p.id}" title="Détail du projet">
              <span class="block text-sm font-medium truncate">${esc(p.name)}</span>
              <span class="block text-xs text-slate-500 truncate">${esc(p.clients.name)}</span>
            </button>
            <button class="text-xs text-slate-400 hover:text-slate-900 px-1.5 py-1 rounded transition" data-finish="${p.id}"
                    title="Archiver le projet (terminé)">Archiver</button>
          </div>
          <div class="mt-2 flex flex-col gap-1.5">
            ${list.length ? list.map(parkedHTML).join('') : '<p class="text-xs text-slate-400">Aucune tâche rangée.</p>'}
          </div>
        </li>`;
    }).join('')
    : '<li class="text-sm text-slate-400 py-1">Tous les projets en cours ont au moins une tâche cette semaine.</li>';
}

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

// Navigation Planning / Archives (hash)
function route() {
  const archives = location.hash === '#archives';
  $('#planning-view').classList.toggle('hidden', archives);
  $('#archives-view').classList.toggle('hidden', !archives);
  $('#toggle-archives').textContent = archives ? '← Planning' : 'Archives';
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

function suggestProjects(client, project) {
  const c = client.trim().toLowerCase();
  const p = project.trim().toLowerCase();
  return projects
    .map((x) => {
      const xc = x.clients.name.toLowerCase();
      const xp = x.name.toLowerCase();
      const exact = xc === c && xp === p;
      let score = 0;
      if (exact) score = 4;
      else if (xc === c && (xp.includes(p) || p.includes(xp))) score = 3;
      else if (xp === p) score = 2;
      else if (xc === c && x.status === 'en_cours') score = 1;
      return { p: x, exact, score };
    })
    .filter((s) => s.score > 0 && (s.exact || s.p.status === 'en_cours'))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

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

$('#board').addEventListener('change', (e) => {
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
  const editId = e.target.dataset.edit;
  if (editId) return openEdit(editId);
  const id = e.target.dataset.delete;
  if (!id) return;
  const snapshot = tasks;
  tasks = tasks.filter((x) => x.id !== id);
  render();
  run(() => db.remove(id), () => { tasks = snapshot; });
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
$('#new-week').addEventListener('click', () => {
  const finished = tasks.filter((t) => t.is_completed);
  const moving = tasks.filter((t) => !t.is_completed && t.day_of_week && t.day_of_week !== 'Lundi').length;
  if (!confirm(`Nouvelle semaine : archiver ${finished.length} tâche(s) terminée(s) dans l'historique des projets et ramener les autres sur Lundi ?`)) return;
  const snapshot = { tasks: tasks.map((t) => ({ ...t })), history: history.slice() };
  const archivedAt = new Date().toISOString();
  // Les tâches terminées rejoignent l'historique (temps passé conservé) ;
  // les tâches rangées dans le sas (day_of_week null) restent dans leur dossier.
  history = finished.map((t) => ({ ...t, archived_at: archivedAt })).concat(history);
  tasks = tasks.filter((t) => !t.is_completed).map((t) => (t.day_of_week ? { ...t, day_of_week: 'Lundi' } : t));
  render();
  run(
    async () => {
      if (finished.length) {
        await api('tasks', '?is_completed=eq.true&archived_at=is.null', { method: 'PATCH', body: { archived_at: archivedAt } });
      }
      if (moving) {
        await api('tasks', '?is_completed=eq.false&archived_at=is.null&day_of_week=not.is.null', { method: 'PATCH', body: { day_of_week: 'Lundi' } });
      }
    },
    () => { tasks = snapshot.tasks; history = snapshot.history; }
  );
});

// Import JSON
const TASK_FIELDS = ['client_name', 'project_name', 'task_name'];

function normalizeTask(raw, i) {
  const label = `Élément ${i + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label} : un objet est attendu.`);
  const row = {};
  TASK_FIELDS.forEach((k) => { row[k] = String(raw[k] ?? '').trim(); });
  if (!row.task_name) throw new Error(`${label} : "task_name" est obligatoire.`);
  const hours = raw.estimated_hours == null || raw.estimated_hours === '' ? 0 : Number(raw.estimated_hours);
  if (!Number.isFinite(hours) || hours < 0) throw new Error(`${label} : "estimated_hours" doit être un nombre positif.`);
  row.estimated_hours = hours;
  row.day_of_week = raw.day_of_week ?? 'Lundi';
  if (!DAYS.includes(row.day_of_week)) throw new Error(`${label} : "day_of_week" doit être parmi ${DAYS.join(', ')}.`);
  row.is_completed = raw.is_completed === true;
  return row;
}

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
  const openId = e.target.closest('[data-open]')?.dataset.open;
  const finishId = e.target.closest('[data-finish]')?.dataset.finish;
  if (openId) {
    openProject(openId);
  } else if (finishId) {
    const p = projects.find((x) => x.id === finishId);
    const prev = p.status;
    p.status = 'termine';
    render();
    run(() => api('projects', `?id=eq.${finishId}`, { method: 'PATCH', body: { status: 'termine' } }), () => { p.status = prev; });
  }
});

// Détail d'un projet : tâches rattachées, temps total, édition du nom
const projectDialog = $('#project-dialog');
const projectEditForm = $('#project-edit-form');

function openProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  projectEditForm.dataset.id = id;
  projectEditForm.project_name.value = p.name;
  $('#project-client').textContent = p.clients.name;
  $('#project-error').classList.add('hidden');
  const current = tasks.filter((t) => t.project_id === id);
  const past = history.filter((t) => t.project_id === id);
  const sum = (list) => list.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
  const spent = sum(past) + sum(current.filter((t) => t.is_completed));
  $('#project-stats').innerHTML = `
    <div><dt class="text-xs text-slate-500">Tâches</dt><dd class="text-sm font-semibold">${current.length + past.length}</dd></div>
    <div><dt class="text-xs text-slate-500">Temps prévu</dt><dd class="text-sm font-semibold">${fmtH(sum(current) + sum(past))}</dd></div>
    <div><dt class="text-xs text-slate-500">Temps passé</dt><dd class="text-sm font-semibold">${fmtH(spent)}</dd></div>`;
  const row = (t, status) => `
    <li class="flex items-center gap-2 text-sm py-1.5 border-b border-slate-100 last:border-0">
      <span class="min-w-0 flex-1 truncate ${t.is_completed ? 'line-through text-slate-400' : ''}">${esc(t.task_name)}</span>
      <span class="text-xs text-slate-500">${esc(status)}</span>
      <span class="text-xs font-medium tabular-nums">${fmtH(t.estimated_hours)}</span>
    </li>`;
  const date = (t) => new Date(t.archived_at).toLocaleDateString('fr-FR');
  $('#project-tasks').innerHTML = (current.length || past.length)
    ? current.map((t) => row(t, t.is_completed ? 'Terminée' : t.day_of_week || 'Sas')).join('')
      + (past.length
        ? `<li class="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500" data-lot="Lot 4">Historique</li>`
          + past.map((t) => row(t, `Terminée · ${date(t)}`)).join('')
        : '')
    : '<li class="text-sm text-slate-400 py-1">Aucune tâche rattachée.</li>';
  projectDialog.showModal();
}

projectDialog.addEventListener('click', (e) => { if (e.target === projectDialog) projectDialog.close(); });
$('#project-close').addEventListener('click', () => projectDialog.close());
$('#project-plan').addEventListener('click', () => {
  const p = projects.find((x) => x.id === projectEditForm.dataset.id);
  projectDialog.close();
  prefillAdd(p);
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
    if (name !== p.name) {
      await api('projects', `?id=eq.${p.id}`, { method: 'PATCH', body: { name } });
      await api('tasks', `?project_id=eq.${p.id}`, { method: 'PATCH', body: { project_name: name } });
      p.name = name;
      tasks.forEach((t) => {
        if (t.project_id !== p.id) return;
        t.project_name = name;
        if (t.projects) t.projects.name = name;
      });
    }
    projectDialog.close();
    render();
    toast('Projet renommé');
  } catch (ex) {
    console.error(ex);
    err.textContent = ex instanceof TypeError ? 'Erreur réseau, réessaie.' : ex.message;
    err.classList.remove('hidden');
  }
});

// Archives : rouvrir un projet terminé (il retourne dans le sas s'il n'a pas de tâche planifiée)
$('#archives-view').addEventListener('click', (e) => {
  const id = e.target.dataset.reopen;
  if (!id) return;
  const p = projects.find((x) => x.id === id);
  const prev = p.status;
  p.status = 'en_cours';
  render();
  run(() => api('projects', `?id=eq.${id}`, { method: 'PATCH', body: { status: 'en_cours' } }), () => { p.status = prev; });
});

$('#toggle-archives').addEventListener('click', () => {
  location.hash = location.hash === '#archives' ? '' : '#archives';
});

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

// Journal des mises à jour + suivi par lot (skill mdui-onboarding-overlays)
const changelogDialog = $('#changelog');
const LATEST = CHANGELOG[0].version;
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
        content: 'Glisse les cartes d’un jour à l’autre. Survole une carte pour la modifier (✎) ou la supprimer, et coche-la une fois terminée.' },
      { id: 'waiting', targetSelector: '#waiting', placement: 'top', lot: 'Lot 3',
        title: 'Le sas d’attente',
        content: 'Les projets en cours sans tâche cette semaine attendent ici, avec leurs tâches rangées. Glisse un projet sur un jour pour le planifier, ou clique dessus pour voir son détail, son temps passé et le renommer.' },
      { id: 'archives', targetSelector: '#toggle-archives', placement: 'bottom', lot: 'Lot 2',
        title: 'Les archives',
        content: 'Les projets archivés depuis le sas sont rangés ici. Tu peux les rouvrir à tout moment.' },
      { id: 'new-week', targetSelector: '#new-week', placement: 'bottom', lot: 'Lot 4',
        title: 'Nouvelle semaine',
        content: 'Les tâches terminées sont archivées dans l’historique de leur projet (le temps passé est conservé) et les autres reviennent sur Lundi.' },
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
  if (location.hash === '#archives') location.hash = ''; // les cibles sont sur la vue Planning
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
  setAuthed(false);
});

// ---------- Init ----------
async function start() {
  setAuthed(true);
  render();
  await run(async () => {
    [clients, projects, tasks, history] = await Promise.all([db.listClients(), db.listProjects(), db.list(), db.listHistory()]);
    render();
  });
  setTimeout(() => startTour('onboarding-v1'), 400); // une seule fois (état mémorisé)
}

loadSession();
route();
if (session) start();
else setAuthed(false);
