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

  // Noms de projets proposés à la saisie d'une tâche : projets en cours du client, puis ses projets
  // terminés, puis les autres noms existants (chacun une seule fois, triés par nom dans chaque groupe).
  function projectSuggestions(projects, client) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    const own = projects.filter((p) => client.trim() && same(p.clients.name, client));
    const groups = [
      own.filter((p) => p.status === 'en_cours').sort(byName).map((p) => ({ value: p.name, label: `${p.clients.name} · en cours` })),
      own.filter((p) => p.status !== 'en_cours').sort(byName).map((p) => ({ value: p.name, label: `${p.clients.name} · terminé` })),
      [...projects].sort(byName).map((p) => ({ value: p.name, label: '' })),
    ];
    const seen = new Set();
    return groups.flat().filter((s) => !seen.has(s.value.toLowerCase()) && seen.add(s.value.toLowerCase()));
  }

  // Types de projet proposés : ceux par défaut (Réglages) dans leur ordre, puis les types personnalisés
  // saisis sur des projets (absents des défauts), triés et sans doublon (casse ignorée).
  function typeSuggestions(types, projects) {
    const defaults = [...types].sort((a, b) => a.position - b.position).map((t) => ({ name: t.name, custom: false }));
    const seen = new Set(defaults.map((t) => normalizeText(t.name)));
    const custom = [];
    projects.forEach((p) => {
      const name = String(p.type ?? '').trim();
      if (!name || seen.has(normalizeText(name))) return;
      seen.add(normalizeText(name));
      custom.push({ name, custom: true });
    });
    return defaults.concat(custom.sort((a, b) => a.name.localeCompare(b.name)));
  }

  // Message d'erreur pour un nom de type par défaut (vide, ou déjà pris) ; '' si valide.
  function typeNameError(types, id, name) {
    if (!String(name ?? '').trim()) return 'Le nom du type est obligatoire.';
    return types.some((t) => t.id !== id && same(t.name, name)) ? 'Ce type existe déjà.' : '';
  }

  // Déplace un élément d'un cran (dir = -1 vers le haut, +1 vers le bas) dans une liste ordonnée par
  // `position` ; renvoie une nouvelle liste renumérotée 1..n (les objets reçus ne sont pas modifiés).
  function moveItem(list, id, dir) {
    const sorted = [...list].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < sorted.length) [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    return sorted.map((x, k) => ({ ...x, position: k + 1 }));
  }

  // Étiquettes (Réglages) : palette fixe ; l'ordre (position) sert de priorité visuelle.
  const LABEL_COLORS = ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'gris'];

  // Étiquettes d'une tâche, de la plus prioritaire à la moins prioritaire (identifiants inconnus ignorés).
  function taskLabels(task, labels) {
    const ids = new Set(task.label_ids || []);
    return labels.filter((l) => ids.has(l.id)).sort((a, b) => a.position - b.position);
  }

  // Étiquette qui donne sa teinte à la carte : la plus haute dans l'ordre des réglages.
  const primaryLabel = (task, labels) => taskLabels(task, labels)[0] ?? null;

  // Une tâche est une réunion dès qu'elle porte une étiquette « réunion » (heure + lien du salon).
  const isMeeting = (task, labels) => taskLabels(task, labels).some((l) => l.is_meeting);

  // Ordre d'une colonne : réunions avec heure en tête (heure croissante), puis le reste dans l'ordre reçu.
  function sortDay(tasks, labels) {
    const timed = (t) => !!t.start_time && isMeeting(t, labels);
    return tasks.filter(timed).sort((a, b) => a.start_time.localeCompare(b.start_time))
      .concat(tasks.filter((t) => !timed(t)));
  }

  // Colonne d'un jour regroupée par client : un groupe par client (projets distincts listés), tâches
  // triées par sortDay (réunions par heure d'abord). Le groupe qui a la réunion la plus tôt passe en tête,
  // puis les autres dans l'ordre d'apparition de leur première tâche.
  // Clé du conteneur d'une tâche : identifiant du client de son projet, sinon son nom normalisé.
  const clientKey = (t) => t.projects?.clients?.id ?? `n:${normalizeText(t.projects?.clients?.name ?? t.client_name ?? '')}`;

  // Ordre manuel (glisser-déposer) : un groupe a pour rang le plus petit `group_rank` de ses tâches.
  // Les groupes classés passent d'abord (par rang), les autres ensuite dans l'ordre par défaut.
  // Tâches cochées (Lot 27) : sous les tâches à faire de leur groupe ; un groupe entièrement coché passe sous les autres.
  function groupDay(tasks, labels) {
    const groups = new Map();
    tasks.forEach((t) => {
      const key = clientKey(t);
      if (!groups.has(key)) groups.set(key, { key, client: t.projects?.clients?.name ?? t.client_name ?? '', projects: [], tasks: [] });
      const g = groups.get(key);
      const project = t.projects?.name ?? t.project_name ?? '';
      if (!g.projects.includes(project)) g.projects.push(project);
      g.tasks.push(t);
    });
    const open = (g) => g.tasks.filter((t) => !t.is_completed);
    const firstMeeting = (g) => (open(g).length ? open(g) : g.tasks).find((t) => t.start_time && isMeeting(t, labels))?.start_time ?? null;
    const rankOf = (g) => {
      const ranks = g.tasks.map((t) => t.group_rank).filter((r) => r != null);
      return ranks.length ? Math.min(...ranks) : null;
    };
    const byDefault = (a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0) || a.order - b.order;
    const byRank = (a, b) => (a.rank != null && b.rank != null ? a.rank - b.rank : a.rank != null ? -1 : b.rank != null ? 1 : byDefault(a, b));
    return doneLast([...groups.values()]
      .map((g, i) => ({ ...g, tasks: doneLast(sortDay(g.tasks, labels)), order: i, at: firstMeeting(g), rank: rankOf(g) }))
      .sort(byRank))
      .map(({ order, at, rank, ...g }) => g);
  }

  // Tâches cochées après les autres, ou groupes entièrement cochés après les autres ; ordre conservé de part et d'autre.
  const isDone = (x) => (x.tasks ? x.tasks.every((t) => t.is_completed) : !!x.is_completed);
  const doneLast = (list) => list.filter((x) => !isDone(x)).concat(list.filter(isDone));

  // Ordre de clés après déplacement de `key` à la position `index` (calculée sans elle).
  function placeAt(keys, key, index) {
    const rest = keys.filter((k) => k !== key);
    rest.splice(Math.min(Math.max(index, 0), rest.length), 0, key);
    return rest;
  }

  // Rangs 1..n d'une colonne ordonnée : un PATCH par groupe dont au moins une tâche change de rang.
  const rankPatches = (groups) => groups
    .map((g, i) => ({ ids: g.tasks.map((t) => t.id), rank: i + 1, stale: g.tasks.some((t) => t.group_rank !== i + 1) }))
    .filter((p) => p.stale)
    .map(({ ids, rank }) => ({ ids, rank }));

  // Position d'insertion : nombre d'éléments dont le milieu vertical est au-dessus du pointeur.
  const dropIndex = (mids, y) => mids.filter((m) => m < y).length;

  // Ordres successifs fusionnés sans doublon (« Nouvelle Semaine » : Lundi, puis les jours suivants).
  const mergeOrder = (lists) => [...new Set(lists.flat())];

  // Dossiers du sas : par position manuelle, ceux sans position ensuite (ordre reçu conservé).
  const sortFolders = (projects) => projects
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.sas_position ?? Infinity) - (b.p.sas_position ?? Infinity) || a.i - b.i)
    .map((x) => x.p);

  const folderPatches = (ordered) => ordered
    .map((p, i) => ({ id: p.id, sas_position: i + 1, stale: p.sas_position !== i + 1 }))
    .filter((x) => x.stale)
    .map(({ id, sas_position }) => ({ id, sas_position }));

  function labelNameError(labels, id, name) {
    if (!String(name ?? '').trim()) return 'Le nom de l’étiquette est obligatoire.';
    return labels.some((l) => l.id !== id && same(l.name, name)) ? 'Cette étiquette existe déjà.' : '';
  }

  // Heure d'une réunion : « 9:05 », « 9h », « 14h30 », « 14:30:00 »… -> « HH:MM » ; '' si vide.
  function parseTime(raw) {
    const text = String(raw ?? '').trim().toLowerCase();
    if (!text) return '';
    const m = text.match(/^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?(?::\d{2})?$/);
    const hh = m ? Number(m[1]) : NaN;
    const mm = m && m[2] ? Number(m[2]) : 0;
    if (!m || hh > 23 || mm > 59) throw new Error(`Heure invalide : « ${String(raw).trim()} » (ex. 09:30).`);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Copie d'une tâche vers un jour (ou le sas si null) : projet, nom, heures, étiquettes et réunion.
  // Ni commentaires, ni état « terminée », ni récurrence : la copie est une tâche ponctuelle.
  const duplicateRow = (t, day) => ({
    project_id: t.project_id,
    client_name: t.client_name,
    project_name: t.project_name,
    task_name: t.task_name,
    estimated_hours: t.estimated_hours,
    day_of_week: day || null,
    is_completed: false,
    label_ids: [...(t.label_ids || [])],
    start_time: t.start_time ?? null,
    meeting_url: t.meeting_url ?? null,
  });

  // Tâches d'un projet rangées dans le sas (pas de jour).
  const parkedTasks = (tasks, projectId) => tasks.filter((t) => t.project_id === projectId && !t.day_of_week);

  // Sas d'attente : projets en cours sans tâche planifiée, ou ayant des tâches rangées.
  function waitingProjects(projects, tasks) {
    const planned = new Set(tasks.filter((t) => t.day_of_week).map((t) => t.project_id));
    return projects.filter((p) => p.status === 'en_cours'
      && (!planned.has(p.id) || parkedTasks(tasks, p.id).length > 0));
  }

  // Temps effectif d'une tâche : le temps passé saisi (actual_hours), sinon ses heures estimées.
  // Un temps passé de 0 est une vraie valeur ; seul « non renseigné » (null, vide) retombe sur l'estimé.
  const hasValue = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v);
  const hoursSpent = (t) => (hasValue(t.actual_hours) ? +t.actual_hours : hoursOf(t));
  const sumSpent = (list) => list.reduce((s, t) => s + hoursSpent(t), 0);

  // Temps d'un projet : tâches actives + historique. « Passé » = effectif des terminées (actives ou archivées).
  function projectTime(tasks, history, projectId) {
    const current = tasks.filter((t) => t.project_id === projectId);
    const past = history.filter((t) => t.project_id === projectId);
    return {
      count: current.length + past.length,
      planned: sumHours(current) + sumHours(past),
      spent: sumSpent(past) + sumSpent(current.filter((t) => t.is_completed)),
    };
  }

  // Heures saisies dans un champ facultatif : null si vide, nombre ≥ 0 sinon (virgule décimale acceptée).
  function parseOptionalHours(raw) {
    const text = String(raw ?? '').trim().replace(',', '.');
    if (!text) return null;
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) throw new Error('Heures invalides.');
    return n;
  }

  // Temps effectif face au temps estimé du projet ; null tant qu'aucun estimé n'est renseigné.
  function budgetStatus(estimated, spent) {
    const est = hasValue(estimated) ? +estimated : 0;
    if (est <= 0) return null;
    return { estimated: est, spent, pct: Math.min(100, Math.round((spent / est) * 100)), over: spent > est };
  }

  // « Nouvelle Semaine » : terminées -> historique ; les autres planifiées reviennent sur Lundi ;
  // les tâches du sas (sans jour) restent rangées. `keepIds` : tâches terminées gardées dans le
  // planning (commentaires non traités), traitées comme des tâches reportées. Ne modifie pas les tableaux reçus.
  // `stayIds` : occurrences de tâches récurrentes qui, non terminées, restent sur leur jour au lieu de Lundi.
  function newWeek(tasks, history, archivedAt, keepIds = [], stayIds = []) {
    const kept = new Set(keepIds);
    const stay = new Set(stayIds);
    const archived = (t) => t.is_completed && !kept.has(t.id);
    const moves = (t) => t.day_of_week && !(stay.has(t.id) && !t.is_completed);
    const finished = tasks.filter(archived);
    const staying = tasks.filter((t) => !archived(t));
    const moving = staying.filter((t) => moves(t) && t.day_of_week !== 'Lundi').length;
    return {
      finished: finished.length,
      moving,
      history: finished.map((t) => ({ ...t, archived_at: archivedAt })).concat(history),
      tasks: staying.map((t) => (moves(t) ? { ...t, day_of_week: 'Lundi' } : t)),
    };
  }

  // ---- Tâches récurrentes (séries) ----
  // Dates locales, à minuit. Lundi de la semaine qui commence : le lundi qui suit, ou ce lundi même.
  const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  const comingMonday = (date) => addDays(midnight(date), (8 - date.getDay()) % 7);
  // Lundi de la semaine planifiée en ce moment (le week-end, c'est déjà la suivante).
  const planningMonday = (date) => ([0, 6].includes(date.getDay()) ? comingMonday(date) : addDays(midnight(date), 1 - date.getDay()));
  const dayDate = (monday, day) => addDays(monday, DAYS.indexOf(day));

  // ---- Bloc-notes de la semaine (Lot 25) ----
  // Une note par semaine, repérée par le lundi de la semaine planifiée (« AAAA-MM-JJ », date locale).
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const keyDate = (key) => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d); };
  const weekKey = (date) => isoDay(planningMonday(date));
  const shiftWeek = (key, n) => isoDay(addDays(keyDate(key), 7 * n));
  // Écart en semaines entre deux lundis (positif : `key` est après `ref`), insensible aux changements d'heure.
  const weekOffset = (key, ref) => {
    const utc = (k) => { const d = keyDate(k); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
    return Math.round((utc(key) - utc(ref)) / (7 * 86400000));
  };

  // Entrée dans le bloc-notes, curseur en `caret` : sur une ligne de liste (« - », « * », « • », « 1. », « 1) »),
  // la liste continue à la ligne suivante (numéro + 1) ; sur une puce vide, la puce est retirée (fin de liste).
  // Renvoie la modification { from, to, insert } à appliquer, ou null pour un retour à la ligne normal.
  function continueList(text, caret) {
    const start = text.lastIndexOf('\n', caret - 1) + 1;
    const m = text.slice(start, caret).match(/^(\s*)(?:([-*•])|(\d{1,3})([.)]))\s+(.*)$/);
    if (!m) return null;
    const [, indent, bullet, num, sep, rest] = m;
    const after = text.slice(caret).split('\n')[0];
    if (!rest.trim() && !after.trim()) return { from: start, to: caret, insert: '' };
    return { from: caret, to: caret, insert: `\n${indent}${bullet || `${Number(num) + 1}${sep}`} ` };
  }

  // ---- Suggestions de tâches tirées du bloc-notes (Lot 26, analyse locale, sans service externe) ----
  // Chaque ligne est rattachée à un projet par les noms de client et de projet qu'elle cite (accents et casse ignorés).
  // Une ligne qui ne cite qu'un projet devient le contexte des lignes suivantes (jusqu'à une ligne vide).
  // Le reste de la ligne, découpé aux virgules, donne les tâches ; le jour (« jeudi ») et la durée (« 2h »,
  // « demi-journée ») sont repris. Une tâche active du projet au nom proche est proposée à la place d'un doublon ;
  // un projet cité sans action propose ses tâches du sas. Les lignes barrées ou marquées comme faites sont ignorées.
  const wordsOf = (s) => ` ${normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const ACCENTS = { a: 'aàâä', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', c: 'cç', y: 'yÿ' };
  // Expression qui retrouve un nom dans le texte d'origine, accents, casse et séparateurs ignorés.
  const looseName = (name) => new RegExp(wordsOf(name).trim().split(' ').map((w) => [...w]
    .map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch)).join('')).join("[\\s\\-·'’._/]+"), 'iu');
  const DONE_LINE = /^\s*(?:[-*•]\s*)?(?:✓|✔|\[x\]|~~)|(?:✓|✔|\(faite?\)|\bfaite?\s*)$/iu;
  const DAY_TEXT = /\b(lundi|mardi|mercredi|jeudi|vendredi)(?:\s+(?:matin|midi|apr[eè]s-midi|soir))?\b/giu;
  const HOURS_TEXT = /\b\d{1,2}\s*h\s*\d{2}\b|\b\d+(?:[.,]\d+)?\s*(?:h|heures?)(?!\p{L})|\b(?:une\s+)?(?:demi[- ])?journ[ée]e\b/giu;

  function noteHours(line) {
    const t = normalizeText(line);
    let m = t.match(/\b(\d{1,2})\s*h\s*(\d{2})\b/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    m = t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:h|heures?)(?![a-z])/);
    if (m) return Number(m[1].replace(',', '.'));
    if (/demi[- ]journee/.test(t)) return 4;
    return /\bjournee\b/.test(t) ? 7 : 0;
  }

  const noteDay = (line) => DAYS.find((d) => wordsOf(line).includes(` ${normalizeText(d)} `)) ?? '';

  // Projet cité par une ligne : projet et client cités, sinon un projet du client cité (deviné s'il en a plusieurs
  // en cours), sinon un projet cité seul. En cours avant archivé, nom le plus long d'abord. Un client peut être cité
  // par un seul mot de son nom (« Bobo » pour « Boulangerie Bobo ») s'il a au moins 4 lettres et n'appartient qu'à lui.
  // `names` : les noms tels qu'ils sont cités, retirés ensuite du texte des actions.
  function lineProject(line, projects, tasks) {
    const w = wordsOf(line);
    const cites = (name) => { const n = wordsOf(name).trim(); return n.length >= 2 && w.includes(` ${n} `); };
    const clientNames = [...new Set(projects.map((p) => p.clients?.name ?? ''))];
    const clientCite = (name) => {
      if (cites(name)) return name;
      const others = clientNames.filter((n) => n !== name).map(wordsOf).join(' ');
      return wordsOf(name).trim().split(' ').find((word) => word.length >= 4 && !others.includes(` ${word} `) && w.includes(` ${word} `)) ?? null;
    };
    const best = (list) => [...list].sort((a, b) => (a.status === 'en_cours' ? 0 : 1) - (b.status === 'en_cours' ? 0 : 1)
      || b.name.length - a.name.length)[0];
    const named = projects.filter((p) => cites(p.name));
    const ofClient = projects.filter((p) => clientCite(p.clients?.name ?? ''));
    const both = named.filter((p) => ofClient.includes(p));
    if (both.length) return { project: best(both), names: [best(both).name, clientCite(best(both).clients.name)], guessed: false };
    if (ofClient.length) {
      const open = ofClient.filter((p) => p.status === 'en_cours');
      const pool = open.length ? open : ofClient;
      const busy = pool.filter((p) => tasks.some((t) => t.project_id === p.id));
      const project = pool.length === 1 ? pool[0] : (busy[0] ?? pool[0]);
      return { project, names: [clientCite(project.clients.name)], guessed: pool.length > 1 };
    }
    if (named.length) return { project: best(named), names: [best(named).name], guessed: false };
    return null;
  }

  // Actions d'une ligne : morceaux du texte restant une fois retirés la puce et les noms cités, chacun avec le jour
  // et la durée qu'il porte. Un morceau qui n'est qu'un jour ou une durée (« , une demi-journée ») complète l'action
  // qui le précède.
  function lineActions(line, names) {
    const rest0 = line.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '').replace(/https?:\/\/[^\s,;]+/gi, ' '); // liens ignorés (la virgule qui suit reste un séparateur)
    // Les noms ne sont retirés qu'avant les deux-points (« Bobo : créer un logo » garde « logo »).
    const colon = rest0.indexOf(':');
    let head = colon >= 0 ? rest0.slice(0, colon) : rest0;
    names.filter(Boolean).forEach((n) => { head = head.replace(looseName(n), ' '); });
    const rest = head + (colon >= 0 ? rest0.slice(colon) : '');
    const actions = [];
    // Coupures : virgule (sauf « 1,5 »), point-virgule, +, tiret ou deux-points entre espaces.
    rest.split(/\s*(?:(?<!\d),|,(?!\d)|[;+])\s*|\s+[-–—·:/|]\s+|\s*:\s+/).forEach((chunk) => {
      const day = noteDay(chunk);
      const hours = noteHours(chunk);
      const name = chunk.replace(DAY_TEXT, ' ').replace(HOURS_TEXT, ' ')
        .replace(/^[\s\-–—·:/|.,!()]+|[\s\-–—·:/|.,!()]+$/g, '').replace(/\s+/g, ' ')
        .replace(/\s+(?:pour|chez|avec|de|du|des|à|sur|le|la|les)$/iu, ''); // « … pour Acme » une fois le nom retiré
      if (/\p{L}{3,}/u.test(name)) actions.push({ name: name[0].toUpperCase() + name.slice(1), day, hours });
      else if (actions.length) Object.assign(actions.at(-1), { day: actions.at(-1).day || day, hours: actions.at(-1).hours || hours });
    });
    return actions;
  }

  // Tâche active du projet au nom proche (identique, ou l'un contenu dans l'autre).
  const twinTask = (tasks, projectId, name) => {
    const n = wordsOf(name).trim();
    return tasks.find((t) => {
      if (t.project_id !== projectId) return false;
      const m = wordsOf(t.task_name).trim();
      return m === n || (Math.min(m.length, n.length) >= 4 && (m.includes(n) || n.includes(m)));
    });
  };

  // Propositions brutes (même forme que reviewSuggestions attend) et lignes d'action sans projet reconnu.
  function noteSuggestions(note, projects, tasks) {
    const suggestions = [];
    const unmatched = [];
    let context = null; // { project, day, used, excerpt, reason }
    const raw = (o) => ({ kind: 'new_task', project_id: '', new_client: '', new_project: '', task_id: '', task_name: '', estimated_hours: 0, day: '', note_excerpt: '', reason: '', ...o });
    const closeContext = () => {
      if (context && !context.used) {
        tasks.filter((t) => t.project_id === context.project.id && !t.day_of_week && !t.is_completed).forEach((t) => suggestions.push(raw({
          kind: 'plan_existing', project_id: t.project_id, task_id: t.id, task_name: t.task_name, day: context.day, note_excerpt: context.excerpt, reason: context.reason,
        })));
      }
      context = null;
    };
    String(note ?? '').split('\n').forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) { closeContext(); return; }
      if (DONE_LINE.test(line)) return;
      const match = lineProject(line, projects, tasks);
      const actions = lineActions(line, match?.names ?? []);
      const day = actions.length ? '' : noteDay(line); // jour d'une ligne sans action : celui des tâches du sas proposées
      const reason = match?.guessed ? `Projet deviné d’après le client ${match.project.clients.name}` : '';
      if (match) {
        closeContext();
        context = { project: match.project, day, used: actions.length > 0, excerpt: line, reason };
      } else if (context && actions.length) {
        context.used = true;
      } else if (actions.length) {
        unmatched.push(line);
        return;
      }
      const target = match ?? context;
      actions.forEach((a) => {
        const twin = twinTask(tasks, target.project.id, a.name);
        const common = { project_id: target.project.id, day: a.day || (match ? '' : target.day), note_excerpt: line, reason: match ? reason : target.reason };
        suggestions.push(raw(twin
          ? { ...common, kind: 'plan_existing', task_id: twin.id, task_name: twin.task_name }
          : { ...common, task_name: a.name, estimated_hours: a.hours }));
      });
    });
    closeContext();
    return { suggestions, unmatched };
  }

  // ---- « Copier pour Claude » (Lot 28) : la note analysée dans une conversation Claude de l'utilisateur ----
  // Texte à coller dans Claude : consignes, projets et tâches actives repérés par des codes courts (P1, T1…),
  // la note, et le format de réponse attendu. `refs` relie les codes aux identifiants pour relire la réponse.
  function claudePrompt(note, weekLabel, projects, tasks) {
    const open = projects.filter((p) => p.status === 'en_cours');
    const archived = projects.filter((p) => p.status !== 'en_cours');
    const list = open.concat(archived);
    const active = tasks.filter((t) => !t.is_completed);
    const refs = { projects: {}, tasks: {} };
    list.forEach((p, i) => { refs.projects[`P${i + 1}`] = p.id; });
    active.forEach((t, i) => { refs.tasks[`T${i + 1}`] = t.id; });
    const code = (map, id) => Object.keys(map).find((k) => map[k] === id) ?? '';
    const projectLines = list.map((p) => `${code(refs.projects, p.id)} · ${p.clients?.name ?? ''} · ${p.name}${p.status === 'en_cours' ? '' : ' (archivé)'}`);
    const taskLines = active.map((t) => `${code(refs.tasks, t.id)} · ${code(refs.projects, t.project_id) || '?'} · ${t.task_name} · ${hoursOf(t)} h · ${t.day_of_week || 'sas'}`);
    const text = `Aide-moi à préparer ma semaine de travail (${weekLabel}). Voici mon bloc-notes, mes projets et mes tâches en cours. Propose les tâches à créer ou à planifier.

Règles :
- Une suggestion par action concrète citée dans la note ; n'invente rien et ignore ce qui est barré ou marqué fait.
- Rattache chaque tâche au bon projet (code P…), même si la note abrège ou ne cite que le client. Si aucun projet ne correspond, laisse "projet" vide et remplis "nouveau_client" et "nouveau_projet".
- Si une tâche équivalente attend déjà dans le sas (jour = sas), propose "planifier" avec son code T… au lieu d'en créer une nouvelle.
- "jour" : le jour cité par la note (Lundi à Vendredi), sinon "". "heures" : la durée citée, sinon une estimation réaliste.
- "nom" : court, en français, sans répéter le client ni le projet. "extrait" : le passage de la note concerné.

Réponds uniquement avec ce bloc JSON, sans autre texte :
{"suggestions":[{"type":"nouvelle","projet":"P1","nouveau_client":"","nouveau_projet":"","tache":"","nom":"…","heures":1,"jour":"","extrait":"…","remarque":""}]}
("type" vaut "nouvelle" ou "planifier" ; "tache" : le code T… à planifier, sinon "".)

PROJETS (code · client · projet)
${projectLines.join('\n') || '(aucun)'}

TÂCHES EN COURS (code · projet · nom · heures · jour)
${taskLines.join('\n') || '(aucune)'}

BLOC-NOTES
${String(note ?? '').trim()}`;
    return { text, refs };
  }

  // Réponse collée depuis Claude : le premier objet JSON trouvé (bloc ```json toléré), traduit vers les propositions
  // brutes de reviewSuggestions (codes P…/T… remplacés par les identifiants). Lève une erreur lisible sinon.
  function parseClaudeReply(reply, refs) {
    const text = String(reply ?? '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Aucun bloc JSON dans la réponse : copie toute la réponse de Claude.');
    let data;
    try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('Réponse illisible : copie le bloc JSON de Claude en entier.'); }
    const list = Array.isArray(data?.suggestions) ? data.suggestions : null;
    if (!list) throw new Error('La réponse ne contient pas de liste « suggestions ».');
    const str = (v) => String(v ?? '').trim();
    return list.filter((s) => s && typeof s === 'object').map((s) => ({
      kind: /planif/i.test(str(s.type)) ? 'plan_existing' : 'new_task',
      project_id: refs.projects[str(s.projet).toUpperCase()] ?? '',
      new_client: str(s.nouveau_client),
      new_project: str(s.nouveau_projet),
      task_id: refs.tasks[str(s.tache).toUpperCase()] ?? '',
      task_name: str(s.nom),
      estimated_hours: Number(String(s.heures ?? '').replace(',', '.')) || 0,
      day: DAYS.find((d) => same(d, str(s.jour))) ?? '',
      note_excerpt: str(s.extrait),
      reason: str(s.remarque),
    }));
  }

  // Propositions vérifiées contre l'état réel (projets, tâches actives) :
  //  - « new » : tâche à créer (sas par défaut, ou le jour cité) dans un projet connu ou un nouveau projet ;
  //  - « plan » : tâche existante encore dans le sas, à planifier (jour cité, sinon Lundi) ;
  //  - « planned » : tâche déjà dans le planning (affichée pour information).
  // Une tâche à créer qui porte le nom d'une tâche active du même projet est traitée comme cette tâche.
  // Les propositions inexploitables (sans nom, projet inconnu sans nouveau projet) et les doublons sont écartés.
  function reviewSuggestions(raw, projects, tasks) {
    const seen = new Set();
    const text = (v) => String(v ?? '').trim();
    const once = (key) => !seen.has(key) && seen.add(key);
    return (Array.isArray(raw) ? raw : []).map((s) => {
      const day = DAYS.includes(s?.day) ? s.day : '';
      const common = { excerpt: text(s?.note_excerpt), reason: text(s?.reason) };
      const name = text(s?.task_name);
      const project = projects.find((p) => p.id === s?.project_id) ?? null;
      const existing = tasks.find((t) => t.id === s?.task_id)
        ?? (project && name ? tasks.find((t) => t.project_id === project.id && same(t.task_name, name)) : null);
      if (existing) {
        if (!once(`t:${existing.id}`)) return null;
        return { ...common, kind: existing.day_of_week ? 'planned' : 'plan', taskId: existing.id, projectId: existing.project_id,
          task_name: existing.task_name, hours: hoursOf(existing), day: existing.day_of_week || day || DAYS[0] };
      }
      const newClient = text(s?.new_client);
      const newProject = text(s?.new_project);
      if (!name || (!project && !newProject)) return null;
      if (!once(`n:${project?.id ?? normalizeText(`${newClient}·${newProject}`)}:${normalizeText(name)}`)) return null;
      const hours = Number.isFinite(+s?.estimated_hours) && +s.estimated_hours > 0 ? Math.round(+s.estimated_hours * 4) / 4 : 1;
      return { ...common, kind: 'new', taskId: '', projectId: project?.id ?? '', newClient: project ? '' : newClient, newProject: project ? '' : newProject,
        task_name: name, hours, day };
    }).filter(Boolean);
  }

  // Rang d'un jour dans son mois : 1 à 4, ou 5 pour un 5ᵉ (toujours le dernier).
  const monthlyRank = (date) => Math.ceil(date.getDate() / 7);
  const isLastOfMonth = (date) => addDays(date, 7).getMonth() !== date.getMonth();

  // La série a-t-elle une occurrence dans la semaine du lundi `monday` ? (monthly_rank 5 = dernier du mois)
  function matchesRule(series, monday) {
    if (series.frequency === 'weekly') return true;
    const date = dayDate(monday, series.day_of_week);
    return series.monthly_rank === 5 ? isLastOfMonth(date) : monthlyRank(date) === series.monthly_rank;
  }

  // Séries à instancier pour la semaine du lundi `monday` : actives, règle satisfaite, et aucune
  // occurrence encore active (planning ou sas) — pas de doublon, pas de rattrapage des semaines passées.
  function dueOccurrences(series, activeTasks, monday) {
    const busy = new Set(activeTasks.map((t) => t.recurrence_id).filter(Boolean));
    return series.filter((s) => s.active && !busy.has(s.id) && matchesRule(s, monday));
  }

  // ---- Import Google Agenda ----
  // Lien de visio d'un événement : Google Meet, point d'entrée vidéo de la conférence, sinon un lien
  // Meet / Zoom / Teams / Webex / Whereby trouvé dans le lieu ou la description.
  const VISIO = /https?:\/\/[^\s"'<>]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com)[^\s"'<>]*/i;
  function extractMeetingLink(event) {
    if (event.hangoutLink) return event.hangoutLink;
    const video = event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
    if (video) return video;
    return `${event.location || ''} ${event.description || ''}`.match(VISIO)?.[0] ?? '';
  }

  // Créneau d'un événement dans la semaine du lundi `monday` : jour du planning, heure locale, durée (quarts
  // d'heure, 0,25 h minimum). null pour un événement annulé, sur la journée entière, le week-end ou hors semaine.
  function eventSlot(event, monday) {
    if (event.status === 'cancelled' || !event.start?.dateTime || !event.end?.dateTime) return null;
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    const index = Math.round((midnight(start) - midnight(monday)) / 86400000);
    if (index < 0 || index > 4) return null;
    const hours = Math.max(0.25, Math.round(((end - start) / 3600000) * 4) / 4);
    const pad = (n) => String(n).padStart(2, '0');
    return { day: DAYS[index], start_time: `${pad(start.getHours())}:${pad(start.getMinutes())}`, hours };
  }

  // Projet proposé pour un événement : domaine e-mail d'un participant = site web d'un client, puis nom
  // de client dans le titre, sinon le projet de repli (dernier utilisé). Projets en cours uniquement ; '' sinon.
  function suggestProject(event, clients, projects, fallbackId) {
    const open = projects.filter((p) => p.status === 'en_cours');
    const firstOf = (clientId) => open.find((p) => p.client_id === clientId)?.id;
    const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
    const domains = (event.attendees || []).filter((a) => !a.self && a.email).map((a) => a.email.split('@')[1].toLowerCase());
    for (const c of clients) {
      const h = c.website && host(c.website);
      if (h && domains.some((d) => d === h || d.endsWith(`.${h}`)) && firstOf(c.id)) return firstOf(c.id);
    }
    const title = normalizeText(event.summary);
    const named = clients.find((c) => normalizeText(c.name) && title.includes(normalizeText(c.name)) && firstOf(c.id));
    if (named) return firstOf(named.id);
    return open.some((p) => p.id === fallbackId) ? fallbackId : '';
  }

  // Statut de chaque événement proposé : déjà importé (identifiant mémorisé), déjà planifié (réunion au même
  // créneau avec un lien), à compléter (réunion au même créneau sans lien), sinon nouveau.
  function importPlan(items, tasks, history, labels) {
    const imported = new Set(tasks.concat(history).map((t) => t.google_event_id).filter(Boolean));
    return items.map((item) => {
      if (imported.has(item.event.id)) return { ...item, status: 'imported' };
      const same = tasks.find((t) => !t.google_event_id && t.day_of_week === item.slot.day
        && t.start_time === item.slot.start_time && isMeeting(t, labels));
      if (same) return { ...item, status: same.meeting_url ? 'exists' : 'complete', taskId: same.id };
      return { ...item, status: 'new' };
    });
  }

  const RANKS = { 1: '1ᵉʳ', 2: '2ᵉ', 3: '3ᵉ', 4: '4ᵉ', 5: 'dernier' };
  function recurrenceLabel(series) {
    const day = String(series.day_of_week || '').toLowerCase();
    return series.frequency === 'weekly' ? `Chaque semaine, le ${day}` : `Le ${RANKS[series.monthly_rank]} ${day} du mois`;
  }

  // Instantané enregistré à « Nouvelle Semaine » (avant archivage) : tâches terminées archivées,
  // tâches planifiées reportées (gardées comprises ; le sas n'est ni l'un ni l'autre), répartition par client.
  // `consigned` : tâches consignées en attente de cette clôture (Lot 23), comptées comme terminées de la semaine.
  // Les terminées comptent leur temps effectif (temps passé, sinon heures prévues) ; les reportées, leurs heures prévues.
  function weekSnapshot(tasks, keepIds = [], consigned = []) {
    const kept = new Set(keepIds);
    const finished = tasks.filter((t) => t.is_completed && !kept.has(t.id)).concat(consigned);
    const carried = tasks.filter((t) => t.day_of_week && !(t.is_completed && !kept.has(t.id)));
    const byClient = new Map();
    finished.forEach((t) => {
      const name = t.projects?.clients?.name ?? t.client_name ?? '';
      const row = byClient.get(name) || { client: name, count: 0, hours: 0 };
      row.count += 1;
      row.hours += hoursSpent(t);
      byClient.set(name, row);
    });
    return {
      finished_count: finished.length,
      finished_hours: sumSpent(finished),
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

  // ---- Consigner une tâche (Lot 23) ----
  // Une tâche terminée peut être consignée sans attendre « Nouvelle Semaine » : elle est archivée aussitôt, avec son
  // temps passé, et rejoint la semaine qui sera close ensuite (week_id vide d'ici là).
  const canConsign = (t) => !!t.is_completed && !t.archived_at;
  const consignPatch = (actualHours, nowIso) => ({ actual_hours: actualHours, consigned_at: nowIso, archived_at: nowIso, is_completed: true });
  const consignedTasks = (history) => history.filter((t) => t.consigned_at)
    .sort((a, b) => new Date(b.consigned_at) - new Date(a.consigned_at));
  const consignedPending = (history) => history.filter((t) => t.consigned_at && !t.week_id);
  const canUnconsign = (t) => !!t.consigned_at && !t.week_id;
  const unconsignPatch = () => ({ archived_at: null, consigned_at: null });

  // ---- Suppression définitive des archives (Lot 24) ----
  // Seul un projet archivé (terminé) peut être supprimé ; avec lui partent ses tâches (actives et archivées),
  // leurs commentaires, ses liens et ses séries récurrentes. Les semaines closes gardent leurs chiffres.
  const canDeleteProject = (p) => p.status === 'termine';

  const projectTaskIds = ({ tasks, history }, projectId) => new Set(tasks.concat(history).filter((t) => t.project_id === projectId).map((t) => t.id));

  function projectDeletion(state, projectId) {
    const ids = projectTaskIds(state, projectId);
    return {
      tasks: ids.size,
      comments: state.comments.filter((c) => ids.has(c.task_id)).length,
      links: state.links.filter((l) => l.project_id === projectId).length,
      series: state.recurrences.filter((r) => r.project_id === projectId).length,
    };
  }

  // Phrases du récapitulatif de suppression (les éléments absents sont omis).
  function deletionParts({ tasks, comments, links, series }) {
    const n = (count, word) => (count ? `${count} ${word}${count > 1 ? 's' : ''}` : '');
    return [n(tasks, 'tâche'), n(comments, 'commentaire'), n(links, 'lien'), n(series, 'récurrence')].filter(Boolean);
  }

  // État sans le projet et tout ce qui lui est rattaché ; ne modifie pas l'état reçu.
  function withoutProject(state, projectId) {
    const ids = projectTaskIds(state, projectId);
    return {
      projects: state.projects.filter((p) => p.id !== projectId),
      tasks: state.tasks.filter((t) => t.project_id !== projectId),
      history: state.history.filter((t) => t.project_id !== projectId),
      comments: state.comments.filter((c) => !ids.has(c.task_id)),
      links: state.links.filter((l) => l.project_id !== projectId),
      recurrences: state.recurrences.filter((r) => r.project_id !== projectId),
    };
  }

  // État sans une tâche (active ou archivée) et ses commentaires.
  const withoutTask = (state, taskId) => ({
    ...state,
    tasks: state.tasks.filter((t) => t.id !== taskId),
    history: state.history.filter((t) => t.id !== taskId),
    comments: state.comments.filter((c) => c.task_id !== taskId),
  });

  // Tâches archivées d'une semaine : rattachées par week_id, ou (reprise) par date d'archivage identique.
  function weekTasks(history, week) {
    const at = new Date(week.closed_at).getTime();
    return history.filter((t) => t.week_id === week.id || (!t.week_id && new Date(t.archived_at).getTime() === at));
  }

  // Commentaires de tâche : une note (is_note) se lit sans être traitée ; seul un commentaire « à traiter »
  // non coché est en attente. Non traités d'une tâche, d'un projet (toutes ses tâches, archivées comprises).
  const isPending = (c) => !c.is_note && !c.is_done;
  const pendingCount = (comments, taskId) => comments.filter((c) => c.task_id === taskId && isPending(c)).length;

  function pendingByProject(comments, tasks, projectId) {
    const ids = new Set(tasks.filter((t) => t.project_id === projectId).map((t) => t.id));
    return comments.filter((c) => ids.has(c.task_id) && isPending(c)).length;
  }

  // Compteurs d'une tâche : tous les commentaires, dont notes et à traiter.
  function commentCounts(comments, taskId) {
    const own = comments.filter((c) => c.task_id === taskId);
    return { total: own.length, notes: own.filter((c) => c.is_note).length, pending: own.filter(isPending).length };
  }

  // Champs modifiés quand un commentaire devient une note ou un point à traiter (repart non traité).
  const commentKindPatch = (isNote) => ({ is_note: !!isNote, is_done: false });

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

  return { DAYS, same, suggestProjects, projectSuggestions, duplicateRow, typeSuggestions, typeNameError, moveItem,
    LABEL_COLORS, taskLabels, primaryLabel, isMeeting, sortDay, groupDay, labelNameError, parseTime,
    clientKey, doneLast, placeAt, rankPatches, dropIndex, mergeOrder, sortFolders, folderPatches,
    comingMonday, planningMonday, dayDate, weekKey, shiftWeek, weekOffset, continueList, noteSuggestions, lineActions, claudePrompt, parseClaudeReply, reviewSuggestions, monthlyRank, isLastOfMonth, matchesRule, dueOccurrences, recurrenceLabel, RANKS,
    extractMeetingLink, eventSlot, suggestProject, importPlan, parkedTasks, waitingProjects, projectTime, hoursSpent, parseOptionalHours, budgetStatus, canConsign, consignPatch, consignedTasks, consignedPending, canUnconsign, unconsignPatch, canDeleteProject, projectDeletion, deletionParts, withoutProject, withoutTask, newWeek, normalizeTask, routeOf, routeParam, buildLabel,
    normalizeText, searchEntities, filterProjects, groupByClient, normalizeUrl, parseYear, clientNameError, deleteClientBlocker, clientProjects,
    pendingCount, pendingByProject, commentCounts, commentKindPatch, finishedWithPending, parseComment, linksOf,
    weekSnapshot, weekPeriods, weekTasks };
}));
