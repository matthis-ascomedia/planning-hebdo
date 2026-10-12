const SUPABASE_URL = 'https://eubxxvoiudlopkimysaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Ynh4dm9pdWRsb3BraW15c2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODkwMTksImV4cCI6MjEwNzM2NTAxOX0.LUdqhs06JZ98yE2M5_oifX6is0hyGWwGnU1iWXDkTOE';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const REST = `${SUPABASE_URL}/rest/v1/tasks`;
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

let tasks = [];

// ---------- Supabase (REST) ----------
async function api(path = '', { method = 'GET', body, prefer } = {}) {
  const res = await fetch(REST + path, {
    method,
    headers: { ...HEADERS, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const db = {
  list: () => api('?select=*&order=created_at.asc'),
  insert: (row) => api('', { method: 'POST', body: row, prefer: 'return=representation' }),
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

// ---------- Init ----------
run(async () => {
  tasks = await db.list();
  render();
});
render();
