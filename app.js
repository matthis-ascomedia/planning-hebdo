const SUPABASE_URL = 'https://eubxxvoiudlopkimysaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Ynh4dm9pdWRsb3BraW15c2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODkwMTksImV4cCI6MjEwNzM2NTAxOX0.LUdqhs06JZ98yE2M5_oifX6is0hyGWwGnU1iWXDkTOE';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const REST = `${SUPABASE_URL}/rest/v1/tasks`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = 'planning_session';

let tasks = [];
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

async function api(path = '', { method = 'GET', body, prefer } = {}, retried = false) {
  const res = await fetch(REST + path, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && session && !retried) {
    try { await refreshSession(); } catch { setAuthed(false); throw new Error('Session expirée, reconnecte-toi.'); }
    return api(path, { method, body, prefer }, true);
  }
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const db = {
  list: () => api('?select=*&order=created_at.asc'),
  insert: (rows) => api('', { method: 'POST', body: rows, prefer: 'return=representation' }),
  update: (id, patch) => api(`?id=eq.${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => api(`?id=eq.${id}`, { method: 'DELETE' }),
};

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
          <p class="text-xs text-slate-500 mt-1 truncate">${esc(t.client_name)} · ${esc(t.project_name)}</p>
        </div>
        <button class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-base leading-none transition"
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

  const open = tasks.filter((t) => !t.is_completed);
  const hours = open.reduce((s, t) => s + (+t.estimated_hours || 0), 0);
  $('#summary').textContent = `${open.length} tâche${open.length > 1 ? 's' : ''} à faire · ${fmtH(hours)}`;
}

// ---------- Actions ----------
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const row = {
    client_name: f.client_name.value.trim(),
    project_name: f.project_name.value.trim(),
    task_name: f.task_name.value.trim(),
    estimated_hours: parseFloat(f.estimated_hours.value) || 0,
    day_of_week: f.day_of_week.value,
    is_completed: false,
  };
  run(async () => {
    const [created] = await db.insert(row);
    tasks.push(created);
    render();
    f.task_name.value = '';
    f.estimated_hours.value = '';
    f.task_name.focus();
  });
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

$('#board').addEventListener('click', (e) => {
  const id = e.target.dataset.delete;
  if (!id) return;
  const snapshot = tasks;
  tasks = tasks.filter((x) => x.id !== id);
  render();
  run(() => db.remove(id), () => { tasks = snapshot; });
});

// Drag & drop
let dragId = null;
const board = $('#board');

board.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  dragId = card.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  requestAnimationFrame(() => card.classList.add('dragging'));
});

board.addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});

board.addEventListener('dragover', (e) => {
  const col = e.target.closest('.col');
  if (!col || !dragId) return;
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach((el) => el !== col && el.classList.remove('drag-over'));
  col.classList.add('drag-over');
});

board.addEventListener('drop', (e) => {
  const col = e.target.closest('.col');
  if (!col || !dragId) return;
  e.preventDefault();
  const day = col.dataset.day;
  const t = tasks.find((x) => x.id === dragId);
  dragId = null;
  if (!t || t.day_of_week === day) return render();
  const prev = t.day_of_week;
  t.day_of_week = day;
  render();
  run(() => db.update(t.id, { day_of_week: day }), () => { t.day_of_week = prev; });
});

// Nouvelle semaine
$('#new-week').addEventListener('click', () => {
  const done = tasks.filter((t) => t.is_completed).length;
  const moving = tasks.filter((t) => !t.is_completed && t.day_of_week !== 'Lundi').length;
  if (!confirm(`Nouvelle semaine : supprimer ${done} tâche(s) terminée(s) et ramener les autres sur Lundi ?`)) return;
  const snapshot = tasks.map((t) => ({ ...t }));
  tasks = tasks.filter((t) => !t.is_completed).map((t) => ({ ...t, day_of_week: 'Lundi' }));
  render();
  run(
    async () => {
      if (done) await api('?is_completed=eq.true', { method: 'DELETE' });
      if (moving || tasks.length) await api('?is_completed=eq.false', { method: 'PATCH', body: { day_of_week: 'Lundi' } });
    },
    () => { tasks = snapshot; }
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
  setAuthed(false);
});

// ---------- Init ----------
async function start() {
  setAuthed(true);
  render();
  await run(async () => {
    tasks = await db.list();
    render();
  });
}

loadSession();
if (session) start();
else setAuthed(false);
