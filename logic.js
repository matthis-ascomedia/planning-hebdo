// Règles métier pures (sans DOM ni réseau) : partagées par l'application (window.PlanningLogic)
// et par les tests automatisés (require('./logic.js')).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlanningLogic = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const TASK_FIELDS = ['client_name', 'project_name', 'task_name'];

  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const hoursOf = (t) => +t.estimated_hours || 0;
  const sumHours = (list) => list.reduce((s, t) => s + hoursOf(t), 0);

  // Projets proposés pour ranger une tâche : exact (4), même client + nom proche (3),
  // même nom chez un autre client (2), autre projet en cours du même client (1).
  // Un projet archivé n'est suggéré que s'il correspond exactement.
  function suggestProjects(projects, client, project) {
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

  // Tâches d'un projet rangées dans le sas (pas de jour).
  const parkedTasks = (tasks, projectId) => tasks.filter((t) => t.project_id === projectId && !t.day_of_week);

  // Sas d'attente : projets en cours sans tâche planifiée, ou ayant des tâches rangées.
  function waitingProjects(projects, tasks) {
    const planned = new Set(tasks.filter((t) => t.day_of_week).map((t) => t.project_id));
    return projects.filter((p) => p.status === 'en_cours'
      && (!planned.has(p.id) || parkedTasks(tasks, p.id).length > 0));
  }

  // Temps d'un projet : tâches actives + historique. « Passé » = terminées (actives ou archivées).
  function projectTime(tasks, history, projectId) {
    const current = tasks.filter((t) => t.project_id === projectId);
    const past = history.filter((t) => t.project_id === projectId);
    return {
      count: current.length + past.length,
      planned: sumHours(current) + sumHours(past),
      spent: sumHours(past) + sumHours(current.filter((t) => t.is_completed)),
    };
  }

  // « Nouvelle Semaine » : terminées -> historique ; les autres planifiées reviennent sur Lundi ;
  // les tâches du sas (sans jour) restent rangées. Ne modifie pas les tableaux reçus.
  function newWeek(tasks, history, archivedAt) {
    const finished = tasks.filter((t) => t.is_completed);
    const moving = tasks.filter((t) => !t.is_completed && t.day_of_week && t.day_of_week !== 'Lundi').length;
    return {
      finished: finished.length,
      moving,
      history: finished.map((t) => ({ ...t, archived_at: archivedAt })).concat(history),
      tasks: tasks.filter((t) => !t.is_completed).map((t) => (t.day_of_week ? { ...t, day_of_week: 'Lundi' } : t)),
    };
  }

  // Validation d'un élément du fichier d'import JSON.
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

  // Onglet affiché pour un hash d'URL (« #clients/<id> » reste dans « clients ») :
  // « planning » par défaut (hash vide ou inconnu).
  function routeOf(hash, routes) {
    const name = String(hash || '').replace(/^#/, '').split('/')[0];
    return routes.includes(name) ? name : 'planning';
  }

  // Sous-page d'un onglet : « #clients/<id> » -> « <id> » (chaîne vide sinon).
  const routeParam = (hash) => decodeURIComponent(String(hash || '').replace(/^#/, '').split('/')[1] || '');

  // Lien saisi par l'utilisateur : http(s) uniquement, https:// ajouté si le schéma manque.
  // Chaîne vide si rien n'est saisi ; lève une erreur si le lien est inutilisable.
  function normalizeUrl(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
    let url;
    try { url = new URL(candidate); } catch { throw new Error(`Lien invalide : « ${text} ».`); }
    const hostOk = url.hostname.includes('.') || url.hostname === 'localhost';
    if (!['http:', 'https:'].includes(url.protocol) || !hostOk) throw new Error(`Lien invalide : « ${text} ».`);
    return candidate;
  }

  // Année d'un projet (prestation vendue) : entier plausible.
  function parseYear(raw) {
    const text = String(raw ?? '').trim();
    const year = Number(text);
    if (!/^\d{4}$/.test(text) || year < 2000 || year > 2100) throw new Error('Année invalide (ex. 2026).');
    return year;
  }

  // Message d'erreur pour un nom de client (vide, ou déjà pris par un autre) ; '' si valide.
  function clientNameError(clients, id, name) {
    if (!String(name ?? '').trim()) return 'Le nom du client est obligatoire.';
    return clients.some((c) => c.id !== id && same(c.name, name)) ? 'Ce client existe déjà.' : '';
  }

  // Raison pour laquelle un client ne peut pas être supprimé ; '' s'il le peut.
  function deleteClientBlocker(client, projects, protectedName) {
    if (same(client.name, protectedName)) return 'Ce client par défaut est protégé.';
    const n = projects.filter((p) => p.client_id === client.id).length;
    return n ? `Ce client a encore ${n} projet${n > 1 ? 's' : ''} rattaché${n > 1 ? 's' : ''}.` : '';
  }

  // Projets d'un client : année décroissante, puis nom.
  const clientProjects = (projects, clientId) => projects
    .filter((p) => p.client_id === clientId)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));

  // Libellé de version affiché en pied de page ; le commit est omis s'il est inconnu.
  const buildLabel = (version, commit) => `v${version}${commit ? ` · ${commit}` : ''}`;

  return { DAYS, same, suggestProjects, parkedTasks, waitingProjects, projectTime, newWeek, normalizeTask, routeOf, routeParam, buildLabel,
    normalizeUrl, parseYear, clientNameError, deleteClientBlocker, clientProjects };
}));
