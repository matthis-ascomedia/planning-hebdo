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
  // les tâches du sas (sans jour) restent rangées. `keepIds` : tâches terminées gardées dans le
  // planning (commentaires non traités), traitées comme des tâches reportées. Ne modifie pas les tableaux reçus.
  function newWeek(tasks, history, archivedAt, keepIds = []) {
    const kept = new Set(keepIds);
    const archived = (t) => t.is_completed && !kept.has(t.id);
    const finished = tasks.filter(archived);
    const staying = tasks.filter((t) => !archived(t));
    const moving = staying.filter((t) => t.day_of_week && t.day_of_week !== 'Lundi').length;
    return {
      finished: finished.length,
      moving,
      history: finished.map((t) => ({ ...t, archived_at: archivedAt })).concat(history),
      tasks: staying.map((t) => (t.day_of_week ? { ...t, day_of_week: 'Lundi' } : t)),
    };
  }

  // Instantané enregistré à « Nouvelle Semaine » (avant archivage) : tâches terminées archivées,
  // tâches planifiées reportées (gardées comprises ; le sas n'est ni l'un ni l'autre), répartition par client.
  function weekSnapshot(tasks, keepIds = []) {
    const kept = new Set(keepIds);
    const finished = tasks.filter((t) => t.is_completed && !kept.has(t.id));
    const carried = tasks.filter((t) => t.day_of_week && !(t.is_completed && !kept.has(t.id)));
    const byClient = new Map();
    finished.forEach((t) => {
      const name = t.projects?.clients?.name ?? t.client_name ?? '';
      const row = byClient.get(name) || { client: name, count: 0, hours: 0 };
      row.count += 1;
      row.hours += hoursOf(t);
      byClient.set(name, row);
    });
    return {
      finished_count: finished.length,
      finished_hours: sumHours(finished),
      carried_count: carried.length,
      carried_hours: sumHours(carried),
      by_client: [...byClient.values()].sort((a, b) => b.hours - a.hours || a.client.localeCompare(b.client)),
    };
  }

  // Semaines de la plus récente à la plus ancienne ; `from` = clôture de la semaine précédente (null pour la première).
  function weekPeriods(weeks) {
    const asc = [...weeks].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
    return asc.map((w, i) => ({ ...w, from: i ? asc[i - 1].closed_at : null })).reverse();
  }

  // Tâches archivées d'une semaine : rattachées par week_id, ou (reprise) par date d'archivage identique.
  function weekTasks(history, week) {
    const at = new Date(week.closed_at).getTime();
    return history.filter((t) => t.week_id === week.id || (!t.week_id && new Date(t.archived_at).getTime() === at));
  }

  // Commentaires de tâche : non traités d'une tâche, d'un projet (toutes ses tâches, archivées comprises).
  const pendingCount = (comments, taskId) => comments.filter((c) => c.task_id === taskId && !c.is_done).length;

  function pendingByProject(comments, tasks, projectId) {
    const ids = new Set(tasks.filter((t) => t.project_id === projectId).map((t) => t.id));
    return comments.filter((c) => ids.has(c.task_id) && !c.is_done).length;
  }

  // Tâches terminées qui vont être archivées alors qu'elles ont des commentaires non traités.
  const finishedWithPending = (tasks, comments) => tasks
    .filter((t) => t.is_completed)
    .map((t) => ({ task: t, count: pendingCount(comments, t.id) }))
    .filter((x) => x.count > 0);

  const COMMENT_MAX = 2000;
  function parseComment(raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('Le commentaire est vide.');
    if (text.length > COMMENT_MAX) throw new Error(`Commentaire trop long (${COMMENT_MAX} caractères maximum).`);
    return text;
  }

  // Liens d'accès rapide d'un projet : le devis en tête, puis les liens dans l'ordre de création.
  function linksOf(project, links) {
    if (!project) return [];
    const own = links.filter((l) => l.project_id === project.id).map((l) => ({ ...l, quote: false }));
    return project.quote_url
      ? [{ label: project.quote_label || 'Devis', url: project.quote_url, quote: true }, ...own]
      : own;
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

  // Texte comparable : minuscules, sans accents, espaces réduits.
  const normalizeText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  // Recherche rapide : clients par nom, projets par nom ou par nom de client (terminés inclus).
  // Les noms qui commencent par la requête passent avant les autres.
  function searchEntities(clients, projects, query, limit = 8) {
    const q = normalizeText(query);
    if (!q) return { clients: [], projects: [] };
    const rank = (...names) => {
      const ns = names.map(normalizeText);
      if (ns[0].startsWith(q)) return 0;
      return ns.some((n) => n.includes(q)) ? 1 : -1;
    };
    const pick = (list, ranker) => list
      .map((x) => ({ x, r: ranker(x) }))
      .filter((m) => m.r >= 0)
      .sort((a, b) => a.r - b.r || a.x.name.localeCompare(b.x.name))
      .slice(0, limit)
      .map((m) => m.x);
    return {
      clients: pick(clients, (c) => rank(c.name)),
      projects: pick(projects, (p) => rank(p.name, p.clients.name)),
    };
  }

  // Filtre en direct des projets du sas (nom du projet ou du client) ; requête vide : tout.
  function filterProjects(projects, query) {
    const q = normalizeText(query);
    if (!q) return projects;
    return projects.filter((p) => normalizeText(p.name).includes(q) || normalizeText(p.clients.name).includes(q));
  }

  // Projets regroupés par client (clients et projets triés par nom).
  function groupByClient(projects) {
    const groups = new Map();
    projects.forEach((p) => {
      if (!groups.has(p.client_id)) groups.set(p.client_id, { client: { id: p.client_id, name: p.clients.name }, projects: [] });
      groups.get(p.client_id).projects.push(p);
    });
    return [...groups.values()]
      .sort((a, b) => a.client.name.localeCompare(b.client.name))
      .map((g) => ({ ...g, projects: g.projects.sort((a, b) => a.name.localeCompare(b.name)) }));
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
    normalizeText, searchEntities, filterProjects, groupByClient, normalizeUrl, parseYear, clientNameError, deleteClientBlocker, clientProjects,
    pendingCount, pendingByProject, finishedWithPending, parseComment, linksOf,
    weekSnapshot, weekPeriods, weekTasks };
}));
