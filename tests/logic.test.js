const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// ---- Jeux de données ----
const client = (name) => ({ id: `c-${name}`, name });
const project = (id, name, clientName, status = 'en_cours') => ({ id, name, status, client_id: `c-${clientName}`, clients: client(clientName) });
const task = (over) => ({ id: Math.random().toString(36).slice(2), project_id: 'p1', estimated_hours: 1, day_of_week: 'Lundi', is_completed: false, ...over });

describe('same', () => {
  test('ignore la casse et les espaces', () => {
    assert.equal(L.same('  Acme ', 'acme'), true);
    assert.equal(L.same('Acme', 'Acme 2'), false);
  });
});

describe('suggestProjects', () => {
  const projects = [
    project('p1', 'Site vitrine', 'Acme'),
    project('p2', 'Site e-commerce', 'Acme'),
    project('p3', 'Refonte', 'Acme'),
    project('p4', 'Site vitrine', 'Globex'),
    project('p5', 'Ancien site', 'Acme', 'termine'),
    project('p6', 'Intranet', 'Globex'),
  ];

  test('le projet exact est suggéré en premier', () => {
    const res = L.suggestProjects(projects, 'acme', 'site vitrine');
    assert.equal(res[0].p.id, 'p1');
    assert.equal(res[0].exact, true);
  });

  test('même client + nom proche passe avant les autres projets du client', () => {
    const res = L.suggestProjects(projects, 'Acme', 'Site');
    assert.deepEqual(res.slice(0, 2).map((s) => s.p.id).sort(), ['p1', 'p2']);
    assert.equal(res.at(-1).p.id, 'p3');
  });

  test('même nom chez un autre client est proposé', () => {
    const res = L.suggestProjects(projects, 'Initech', 'Site vitrine');
    assert.deepEqual(res.map((s) => s.p.id).sort(), ['p1', 'p4']);
    assert.ok(res.every((s) => !s.exact));
  });

  test('un projet archivé n’est suggéré que s’il correspond exactement', () => {
    assert.ok(!L.suggestProjects(projects, 'Acme', 'Ancien').some((s) => s.p.id === 'p5'));
    const exact = L.suggestProjects(projects, 'Acme', 'Ancien site');
    assert.equal(exact[0].p.id, 'p5');
    assert.equal(exact[0].exact, true);
  });

  test('aucune correspondance : liste vide (=> création d’un nouveau projet)', () => {
    assert.deepEqual(L.suggestProjects(projects, 'Inconnu', 'Rien'), []);
  });

  test('au plus 5 suggestions', () => {
    const many = Array.from({ length: 8 }, (_, i) => project(`x${i}`, `Projet ${i}`, 'Acme'));
    assert.equal(L.suggestProjects(many, 'Acme', 'Autre').length, 5);
  });
});

describe('waitingProjects (sas d’attente)', () => {
  const projects = [
    project('p1', 'A', 'Acme'),
    project('p2', 'B', 'Acme'),
    project('p3', 'C', 'Acme', 'termine'),
    project('p4', 'D', 'Acme'),
  ];

  test('projet en cours sans aucune tâche : en attente', () => {
    assert.deepEqual(L.waitingProjects(projects, []).map((p) => p.id), ['p1', 'p2', 'p4']);
  });

  test('projet avec une tâche planifiée : hors du sas', () => {
    const tasks = [task({ project_id: 'p1', day_of_week: 'Mardi' })];
    assert.deepEqual(L.waitingProjects(projects, tasks).map((p) => p.id), ['p2', 'p4']);
  });

  test('projet avec uniquement des tâches rangées : dans le sas', () => {
    const tasks = [task({ project_id: 'p1', day_of_week: null })];
    assert.ok(L.waitingProjects(projects, tasks).some((p) => p.id === 'p1'));
  });

  test('tâche planifiée + tâche rangée : dans le sas (dossier avec la tâche rangée)', () => {
    const tasks = [task({ project_id: 'p1', day_of_week: 'Lundi' }), task({ project_id: 'p1', day_of_week: null })];
    assert.ok(L.waitingProjects(projects, tasks).some((p) => p.id === 'p1'));
    assert.equal(L.parkedTasks(tasks, 'p1').length, 1);
  });

  test('un projet archivé n’apparaît jamais dans le sas', () => {
    assert.ok(!L.waitingProjects(projects, []).some((p) => p.id === 'p3'));
  });
});

describe('projectTime (temps passé)', () => {
  test('cumule les tâches actives et l’historique', () => {
    const tasks = [
      task({ project_id: 'p1', estimated_hours: 2, is_completed: true }),
      task({ project_id: 'p1', estimated_hours: 3 }),
      task({ project_id: 'p2', estimated_hours: 10, is_completed: true }),
    ];
    const history = [task({ project_id: 'p1', estimated_hours: 4, is_completed: true, archived_at: 'x' })];
    assert.deepEqual(L.projectTime(tasks, history, 'p1'), { count: 3, planned: 9, spent: 6 });
  });

  test('projet sans tâche : tout à zéro', () => {
    assert.deepEqual(L.projectTime([], [], 'p1'), { count: 0, planned: 0, spent: 0 });
  });

  test('heures invalides comptées pour 0', () => {
    const tasks = [task({ estimated_hours: null }), task({ estimated_hours: '1.5' })];
    assert.equal(L.projectTime(tasks, [], 'p1').planned, 1.5);
  });
});

describe('temps effectif (Lot 22)', () => {
  test('hoursSpent : temps passé saisi, sinon heures estimées', () => {
    assert.equal(L.hoursSpent(task({ estimated_hours: 2, actual_hours: 3.5 })), 3.5);
    assert.equal(L.hoursSpent(task({ estimated_hours: 2, actual_hours: null })), 2);
    assert.equal(L.hoursSpent(task({ estimated_hours: 2 })), 2);
    assert.equal(L.hoursSpent(task({ estimated_hours: 2, actual_hours: '1.25' })), 1.25);
  });

  test('hoursSpent : un temps passé de 0 est une vraie valeur, pas un oubli', () => {
    assert.equal(L.hoursSpent(task({ estimated_hours: 2, actual_hours: 0 })), 0);
  });

  test('projectTime : le temps passé cumule le réel des tâches terminées (actives et archivées)', () => {
    const tasks = [
      task({ project_id: 'p1', estimated_hours: 2, actual_hours: 3, is_completed: true }),
      task({ project_id: 'p1', estimated_hours: 5, actual_hours: 4 }), // pas terminée : ne compte pas
    ];
    const history = [
      task({ project_id: 'p1', estimated_hours: 4, actual_hours: 1, is_completed: true, archived_at: 'x' }),
      task({ project_id: 'p1', estimated_hours: 1, is_completed: true, archived_at: 'y' }), // sans réel : estimé
    ];
    const time = L.projectTime(tasks, history, 'p1');
    assert.equal(time.spent, 5);
    assert.equal(time.planned, 12);
  });

  test('parseOptionalHours : vide = non renseigné, virgule acceptée, négatif refusé', () => {
    assert.equal(L.parseOptionalHours(''), null);
    assert.equal(L.parseOptionalHours('   '), null);
    assert.equal(L.parseOptionalHours(null), null);
    assert.equal(L.parseOptionalHours('12'), 12);
    assert.equal(L.parseOptionalHours('1,5'), 1.5);
    assert.equal(L.parseOptionalHours('0'), 0);
    assert.throws(() => L.parseOptionalHours('-2'), /invalide/);
    assert.throws(() => L.parseOptionalHours('abc'), /invalide/);
  });

  test('budgetStatus : sans estimé, rien à comparer', () => {
    assert.equal(L.budgetStatus(null, 5), null);
    assert.equal(L.budgetStatus(undefined, 5), null);
    assert.equal(L.budgetStatus(0, 5), null);
  });

  test('budgetStatus : avancement en %, plafonné à 100, et dépassement', () => {
    assert.deepEqual(L.budgetStatus(40, 10), { estimated: 40, spent: 10, pct: 25, over: false });
    assert.deepEqual(L.budgetStatus(40, 40), { estimated: 40, spent: 40, pct: 100, over: false });
    assert.deepEqual(L.budgetStatus(40, 50), { estimated: 40, spent: 50, pct: 100, over: true });
    assert.deepEqual(L.budgetStatus('8', 2), { estimated: 8, spent: 2, pct: 25, over: false });
  });
});

describe('suppression définitive des archives (Lot 24)', () => {
  const state = () => ({
    projects: [project('p1', 'Site', 'Acme', 'termine'), project('p2', 'App', 'Acme')],
    tasks: [task({ id: 'a', project_id: 'p1' }), task({ id: 'b', project_id: 'p2' })],
    history: [task({ id: 'h1', project_id: 'p1', archived_at: 'x' }), task({ id: 'h2', project_id: 'p2', archived_at: 'x' }), task({ id: 'h3', project_id: 'p1', archived_at: 'y' })],
    comments: [
      { id: 'c1', task_id: 'a', body: 'x' }, { id: 'c2', task_id: 'h1', body: 'y' },
      { id: 'c3', task_id: 'b', body: 'z' }, { id: 'c4', task_id: 'h2', body: 'w' },
    ],
    links: [{ id: 'l1', project_id: 'p1' }, { id: 'l2', project_id: 'p2' }],
    recurrences: [{ id: 'r1', project_id: 'p1' }, { id: 'r2', project_id: 'p2' }],
  });

  test('canDeleteProject : seul un projet archivé (terminé) peut être supprimé', () => {
    assert.equal(L.canDeleteProject(project('p', 'X', 'A', 'termine')), true);
    assert.equal(L.canDeleteProject(project('p', 'X', 'A', 'en_cours')), false);
  });

  test('projectDeletion : tout ce qui part avec le projet', () => {
    const s = state();
    assert.deepEqual(L.projectDeletion(s, 'p1'), { tasks: 3, comments: 2, links: 1, series: 1 });
    assert.deepEqual(L.projectDeletion(s, 'p2'), { tasks: 2, comments: 2, links: 1, series: 1 });
    assert.deepEqual(L.projectDeletion(s, 'zz'), { tasks: 0, comments: 0, links: 0, series: 0 });
  });

  test('projectDeletion : le devis (champ du projet) ne compte pas comme lien', () => {
    const s = state();
    s.projects[0].quote_url = 'https://d.fr';
    assert.equal(L.projectDeletion(s, 'p1').links, 1);
  });

  test('deletionParts : phrases au singulier ou au pluriel, sans les zéros', () => {
    assert.deepEqual(L.deletionParts({ tasks: 3, comments: 1, links: 0, series: 2 }), ['3 tâches', '1 commentaire', '2 récurrences']);
    assert.deepEqual(L.deletionParts({ tasks: 1, comments: 0, links: 1, series: 0 }), ['1 tâche', '1 lien']);
    assert.deepEqual(L.deletionParts({ tasks: 0, comments: 0, links: 0, series: 0 }), []);
  });

  test('withoutProject : le projet, ses tâches (actives et archivées), commentaires, liens et séries disparaissent', () => {
    const next = L.withoutProject(state(), 'p1');
    assert.deepEqual(next.projects.map((p) => p.id), ['p2']);
    assert.deepEqual(next.tasks.map((t) => t.id), ['b']);
    assert.deepEqual(next.history.map((t) => t.id), ['h2']);
    assert.deepEqual(next.comments.map((c) => c.id), ['c3', 'c4']);
    assert.deepEqual(next.links.map((l) => l.id), ['l2']);
    assert.deepEqual(next.recurrences.map((r) => r.id), ['r2']);
  });

  test('withoutProject : ne modifie pas l’état reçu', () => {
    const s = state();
    L.withoutProject(s, 'p1');
    assert.equal(s.projects.length, 2);
    assert.equal(s.history.length, 3);
  });

  test('withoutTask : la tâche et ses commentaires seulement', () => {
    const next = L.withoutTask(state(), 'h1');
    assert.deepEqual(next.history.map((t) => t.id), ['h2', 'h3']);
    assert.deepEqual(next.comments.map((c) => c.id), ['c1', 'c3', 'c4']);
    assert.equal(next.tasks.length, 2);
  });
});

describe('consigner une tâche (Lot 23)', () => {
  const NOW = '2026-10-19T09:30:00.000Z';

  test('canConsign : seulement une tâche terminée et encore active', () => {
    assert.equal(L.canConsign(task({ is_completed: true })), true);
    assert.equal(L.canConsign(task({ is_completed: false })), false);
    assert.equal(L.canConsign(task({ is_completed: true, archived_at: NOW })), false);
  });

  test('consignPatch : archivée tout de suite, datée, avec le temps passé saisi', () => {
    assert.deepEqual(L.consignPatch(4.5, NOW), { actual_hours: 4.5, consigned_at: NOW, archived_at: NOW, is_completed: true });
  });

  test('consignPatch : sans temps saisi, le temps passé reste vide (heures prévues)', () => {
    assert.equal(L.consignPatch(null, NOW).actual_hours, null);
  });

  test('consignedTasks : tâches consignées, la plus récente d’abord ; les archives de semaine n’en font pas partie', () => {
    const history = [
      task({ id: 'a', archived_at: '2026-10-09T10:00:00Z', week_id: 'w1' }),
      task({ id: 'b', archived_at: '2026-10-12T10:00:00Z', consigned_at: '2026-10-12T10:00:00Z' }),
      task({ id: 'c', archived_at: '2026-10-15T10:00:00Z', consigned_at: '2026-10-15T10:00:00Z', week_id: 'w2' }),
    ];
    assert.deepEqual(L.consignedTasks(history).map((t) => t.id), ['c', 'b']);
  });

  test('consignedPending : consignées qui attendent encore la prochaine « Nouvelle Semaine »', () => {
    const history = [
      task({ id: 'b', consigned_at: '2026-10-12T10:00:00Z', archived_at: '2026-10-12T10:00:00Z' }),
      task({ id: 'c', consigned_at: '2026-10-15T10:00:00Z', archived_at: '2026-10-15T10:00:00Z', week_id: 'w2' }),
      task({ id: 'd', archived_at: '2026-10-09T10:00:00Z', week_id: 'w1' }),
    ];
    assert.deepEqual(L.consignedPending(history).map((t) => t.id), ['b']);
  });

  test('canUnconsign / unconsignPatch : rétablir tant que la semaine n’est pas close', () => {
    assert.equal(L.canUnconsign(task({ consigned_at: NOW, archived_at: NOW })), true);
    assert.equal(L.canUnconsign(task({ consigned_at: NOW, archived_at: NOW, week_id: 'w1' })), false);
    assert.equal(L.canUnconsign(task({ archived_at: NOW, week_id: 'w1' })), false);
    assert.deepEqual(L.unconsignPatch(), { archived_at: null, consigned_at: null });
  });

  test('weekSnapshot : les consignées en attente comptent dans la semaine qui se clôt', () => {
    const tasks = [
      task({ id: 'a', is_completed: true, estimated_hours: 2, client_name: 'Acme' }),
      task({ id: 'o', is_completed: false, day_of_week: 'Mardi', estimated_hours: 1, client_name: 'Acme' }),
    ];
    const consigned = [task({ id: 'c', is_completed: true, estimated_hours: 3, client_name: 'Beta', consigned_at: NOW, archived_at: NOW })];
    const snap = L.weekSnapshot(tasks, [], consigned);
    assert.equal(snap.finished_count, 2);
    assert.equal(snap.finished_hours, 5);
    assert.equal(snap.carried_count, 1);
    assert.deepEqual(snap.by_client.map((c) => [c.client, c.count, c.hours]), [['Beta', 1, 3], ['Acme', 1, 2]]);
  });

  test('weekSnapshot : sans consignées, comportement inchangé', () => {
    const tasks = [task({ is_completed: true, estimated_hours: 2, client_name: 'Acme' })];
    assert.deepEqual(L.weekSnapshot(tasks, []), L.weekSnapshot(tasks, [], []));
  });
});

describe('newWeek', () => {
  const at = '2026-10-12T08:00:00.000Z';

  test('les tâches terminées passent dans l’historique avec leur date d’archivage', () => {
    const done = task({ id: 'done', is_completed: true, day_of_week: 'Mercredi' });
    const res = L.newWeek([done], [], at);
    assert.equal(res.finished, 1);
    assert.deepEqual(res.tasks, []);
    assert.equal(res.history[0].id, 'done');
    assert.equal(res.history[0].archived_at, at);
  });

  test('les tâches ouvertes planifiées reviennent sur Lundi', () => {
    const res = L.newWeek([task({ id: 'a', day_of_week: 'Vendredi' }), task({ id: 'b', day_of_week: 'Lundi' })], [], at);
    assert.deepEqual(res.tasks.map((t) => t.day_of_week), ['Lundi', 'Lundi']);
    assert.equal(res.moving, 1); // seule la tâche hors Lundi est déplacée
  });

  test('les tâches rangées dans le sas restent sans jour', () => {
    const res = L.newWeek([task({ id: 'p', day_of_week: null })], [], at);
    assert.equal(res.tasks[0].day_of_week, null);
    assert.equal(res.moving, 0);
  });

  test('l’historique existant est conservé, les nouvelles archives passent devant', () => {
    const old = task({ id: 'old', is_completed: true, archived_at: 'avant' });
    const res = L.newWeek([task({ id: 'new', is_completed: true })], [old], at);
    assert.deepEqual(res.history.map((t) => t.id), ['new', 'old']);
  });

  test('ne modifie pas les tableaux d’origine', () => {
    const tasks = [task({ id: 'a', day_of_week: 'Jeudi' }), task({ id: 'b', is_completed: true })];
    const copy = JSON.parse(JSON.stringify(tasks));
    L.newWeek(tasks, [], at);
    assert.deepEqual(tasks, copy);
  });

  test('le temps passé reste identique après la nouvelle semaine', () => {
    const tasks = [task({ estimated_hours: 2, is_completed: true }), task({ estimated_hours: 5 })];
    const before = L.projectTime(tasks, [], 'p1');
    const res = L.newWeek(tasks, [], at);
    const after = L.projectTime(res.tasks, res.history, 'p1');
    assert.equal(after.spent, before.spent);
    assert.equal(after.planned, before.planned);
  });
});

describe('normalizeTask (import JSON)', () => {
  test('valeurs par défaut : 0 h, Lundi, non terminée', () => {
    assert.deepEqual(L.normalizeTask({ task_name: ' Maquette ' }, 0), {
      client_name: '', project_name: '', task_name: 'Maquette',
      estimated_hours: 0, day_of_week: 'Lundi', is_completed: false,
    });
  });

  test('refuse un nom de tâche vide', () => {
    assert.throws(() => L.normalizeTask({ task_name: '  ' }, 2), /Élément 3 : "task_name" est obligatoire/);
  });

  test('refuse un jour inconnu et des heures négatives ou non numériques', () => {
    assert.throws(() => L.normalizeTask({ task_name: 'x', day_of_week: 'Dimanche' }, 0), /day_of_week/);
    assert.throws(() => L.normalizeTask({ task_name: 'x', estimated_hours: -1 }, 0), /estimated_hours/);
    assert.throws(() => L.normalizeTask({ task_name: 'x', estimated_hours: 'abc' }, 0), /estimated_hours/);
  });

  test('refuse une entrée qui n’est pas un objet', () => {
    assert.throws(() => L.normalizeTask(null, 0), /un objet est attendu/);
    assert.throws(() => L.normalizeTask([1], 0), /un objet est attendu/);
  });

  test('is_completed n’est vrai que pour le booléen true', () => {
    assert.equal(L.normalizeTask({ task_name: 'x', is_completed: 'true' }, 0).is_completed, false);
    assert.equal(L.normalizeTask({ task_name: 'x', is_completed: true }, 0).is_completed, true);
  });
});

describe('routeOf', () => {
  const routes = ['planning', 'archives'];

  test('le hash vide ou inconnu mène au planning', () => {
    assert.equal(L.routeOf('', routes), 'planning');
    assert.equal(L.routeOf('#', routes), 'planning');
    assert.equal(L.routeOf('#nimporte-quoi', routes), 'planning');
  });

  test('reconnaît un onglet existant, avec ou sans #', () => {
    assert.equal(L.routeOf('#archives', routes), 'archives');
    assert.equal(L.routeOf('archives', routes), 'archives');
    assert.equal(L.routeOf('#planning', routes), 'planning');
  });
});

describe('buildLabel', () => {
  test('version et commit', () => {
    assert.equal(L.buildLabel('1.7.0', 'a1b2c3d'), 'v1.7.0 · a1b2c3d');
  });

  test('sans commit connu, seule la version est affichée', () => {
    assert.equal(L.buildLabel('1.7.0', ''), 'v1.7.0');
    assert.equal(L.buildLabel('1.7.0', undefined), 'v1.7.0');
  });
});

describe('routeOf / routeParam (sous-pages)', () => {
  const routes = ['planning', 'clients', 'archives'];

  test('un hash #clients/<id> reste dans l’onglet clients', () => {
    assert.equal(L.routeOf('#clients/abc-123', routes), 'clients');
    assert.equal(L.routeParam('#clients/abc-123'), 'abc-123');
  });

  test('sans sous-page, pas de paramètre', () => {
    assert.equal(L.routeParam('#clients'), '');
    assert.equal(L.routeParam(''), '');
  });
});

describe('normalizeUrl', () => {
  test('ajoute https:// quand le schéma manque', () => {
    assert.equal(L.normalizeUrl('acme.fr'), 'https://acme.fr');
    assert.equal(L.normalizeUrl('  www.acme.fr/devis  '), 'https://www.acme.fr/devis');
  });

  test('conserve un lien http(s) complet', () => {
    assert.equal(L.normalizeUrl('http://acme.fr'), 'http://acme.fr');
    assert.equal(L.normalizeUrl('https://drive.google.com/file/d/1'), 'https://drive.google.com/file/d/1');
  });

  test('une valeur vide donne une chaîne vide', () => {
    assert.equal(L.normalizeUrl('   '), '');
    assert.equal(L.normalizeUrl(null), '');
  });

  test('refuse les schémas dangereux ou les hôtes invalides', () => {
    assert.throws(() => L.normalizeUrl('javascript:alert(1)'), /Lien invalide/);
    assert.throws(() => L.normalizeUrl('ftp://acme.fr'), /Lien invalide/);
    assert.throws(() => L.normalizeUrl('acme'), /Lien invalide/);
    assert.throws(() => L.normalizeUrl('https://exa mple.fr'), /Lien invalide/);
  });
});

describe('parseYear', () => {
  test('accepte une année plausible', () => {
    assert.equal(L.parseYear('2026'), 2026);
    assert.equal(L.parseYear(2025), 2025);
  });

  test('refuse le reste', () => {
    assert.throws(() => L.parseYear(''), /année/i);
    assert.throws(() => L.parseYear('abc'), /année/i);
    assert.throws(() => L.parseYear('1899'), /année/i);
    assert.throws(() => L.parseYear('2026.5'), /année/i);
  });
});

describe('clientNameError', () => {
  const clients = [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Globex' }];

  test('nom vide', () => {
    assert.match(L.clientNameError(clients, null, '  '), /obligatoire/);
  });

  test('doublon, sans tenir compte de la casse ni de soi-même', () => {
    assert.match(L.clientNameError(clients, null, 'acme'), /existe déjà/);
    assert.match(L.clientNameError(clients, 'c2', ' ACME '), /existe déjà/);
    assert.equal(L.clientNameError(clients, 'c1', 'ACME'), '');
    assert.equal(L.clientNameError(clients, null, 'Initech'), '');
  });
});

describe('deleteClientBlocker', () => {
  const projects = [project('p1', 'Site', 'Acme')];

  test('un client avec des projets ne peut pas être supprimé', () => {
    assert.match(L.deleteClientBlocker({ id: 'c-Acme', name: 'Acme' }, projects, 'Sans client'), /projet/);
  });

  test('le client par défaut est protégé', () => {
    assert.match(L.deleteClientBlocker({ id: 'c0', name: 'sans client' }, [], 'Sans client'), /protégé/);
  });

  test('un client vide peut être supprimé', () => {
    assert.equal(L.deleteClientBlocker({ id: 'c-Globex', name: 'Globex' }, projects, 'Sans client'), '');
  });
});

describe('clientProjects', () => {
  test('projets d’un client, année décroissante puis nom', () => {
    const list = [
      { ...project('p1', 'Zeta', 'Acme'), year: 2025 },
      { ...project('p2', 'Alpha', 'Acme'), year: 2026 },
      { ...project('p3', 'Beta', 'Acme'), year: 2026 },
      { ...project('p4', 'Autre', 'Globex'), year: 2026 },
    ];
    assert.deepEqual(L.clientProjects(list, 'c-Acme').map((p) => p.id), ['p2', 'p3', 'p1']);
  });
});

describe('normalizeText', () => {
  test('minuscules, sans accents ni espaces superflus', () => {
    assert.equal(L.normalizeText('  Éléphant  Rôti '), 'elephant roti');
  });
});

describe('searchEntities', () => {
  const clients = [{ id: 'c-Acme', name: 'Acme' }, { id: 'c-Globex', name: 'Globex' }, { id: 'c-Café', name: 'Café Martin' }];
  const projects = [
    { ...project('p1', 'Site vitrine', 'Acme'), year: 2026 },
    { ...project('p2', 'Refonte Acme Pro', 'Globex'), year: 2025 },
    { ...project('p3', 'Ancien site', 'Acme', 'termine'), year: 2024 },
    { ...project('p4', 'Menu', 'Café'), year: 2026 },
  ];

  test('requête vide : aucun résultat', () => {
    assert.deepEqual(L.searchEntities(clients, projects, '  '), { clients: [], projects: [] });
  });

  test('trouve clients et projets, sans tenir compte de la casse ni des accents', () => {
    const r = L.searchEntities(clients, projects, 'CAFE');
    assert.deepEqual(r.clients.map((c) => c.id), ['c-Café']);
    assert.deepEqual(r.projects.map((p) => p.id), ['p4']); // via le nom du client
  });

  test('un projet est trouvé par son nom ou par celui de son client', () => {
    const r = L.searchEntities(clients, projects, 'acme');
    assert.deepEqual(r.clients.map((c) => c.id), ['c-Acme']);
    assert.deepEqual(r.projects.map((p) => p.id).sort(), ['p1', 'p2', 'p3']);
  });

  test('les projets terminés restent trouvables', () => {
    assert.deepEqual(L.searchEntities(clients, projects, 'ancien').projects.map((p) => p.id), ['p3']);
  });

  test('les noms qui commencent par la requête passent en premier', () => {
    const r = L.searchEntities(clients, projects, 'site');
    assert.deepEqual(r.projects.map((p) => p.id), ['p1', 'p3']);
  });
});

describe('filterProjects', () => {
  const list = [project('p1', 'Site vitrine', 'Acme'), project('p2', 'Intranet', 'Globex')];

  test('requête vide : tout est conservé', () => {
    assert.equal(L.filterProjects(list, '').length, 2);
  });

  test('filtre sur le nom du projet ou du client', () => {
    assert.deepEqual(L.filterProjects(list, 'intra').map((p) => p.id), ['p2']);
    assert.deepEqual(L.filterProjects(list, 'acme').map((p) => p.id), ['p1']);
    assert.deepEqual(L.filterProjects(list, 'zzz'), []);
  });
});

describe('groupByClient', () => {
  test('regroupe par client, clients et projets triés par nom', () => {
    const list = [project('p1', 'Zeta', 'Globex'), project('p2', 'Beta', 'Acme'), project('p3', 'Alpha', 'Acme')];
    const groups = L.groupByClient(list);
    assert.deepEqual(groups.map((g) => g.client.name), ['Acme', 'Globex']);
    assert.deepEqual(groups[0].projects.map((p) => p.id), ['p3', 'p2']);
  });

  test('liste vide', () => {
    assert.deepEqual(L.groupByClient([]), []);
  });
});

describe('newWeek (tâches gardées)', () => {
  const at = '2026-10-12T08:00:00.000Z';

  test('une tâche terminée gardée reste dans le planning, ramenée sur Lundi', () => {
    const kept = task({ id: 'k', is_completed: true, day_of_week: 'Jeudi' });
    const gone = task({ id: 'g', is_completed: true, day_of_week: 'Mardi' });
    const res = L.newWeek([kept, gone], [], at, ['k']);
    assert.equal(res.finished, 1);
    assert.deepEqual(res.history.map((t) => t.id), ['g']);
    assert.deepEqual(res.tasks.map((t) => [t.id, t.day_of_week, t.is_completed]), [['k', 'Lundi', true]]);
    assert.equal(res.moving, 1);
  });

  test('sans liste, comportement inchangé', () => {
    const res = L.newWeek([task({ id: 'd', is_completed: true })], [], at);
    assert.equal(res.finished, 1);
    assert.deepEqual(res.tasks, []);
  });
});

describe('duplicateRow depuis l’historique (Lot 21)', () => {
  const archived = task({
    id: 'h1', project_id: 'p1', client_name: 'Acme', project_name: 'Site', task_name: 'Maquette', estimated_hours: 3,
    day_of_week: 'Mardi', is_completed: true, label_ids: ['l1'], start_time: '10:00', meeting_url: 'https://meet.x/abc',
    archived_at: '2026-10-09T10:00:00Z', week_id: 'w1', google_event_id: 'ev1', recurrence_id: 'r1',
  });

  test('la copie arrive dans le sas, non terminée, avec projet, nom, heures, étiquettes et réunion', () => {
    const row = L.duplicateRow(archived, null);
    assert.deepEqual(row, {
      project_id: 'p1', client_name: 'Acme', project_name: 'Site', task_name: 'Maquette', estimated_hours: 3,
      day_of_week: null, is_completed: false, label_ids: ['l1'], start_time: '10:00', meeting_url: 'https://meet.x/abc',
    });
  });

  test('rien de l’archivage ne suit : ni semaine, ni date, ni événement Google, ni série', () => {
    const row = L.duplicateRow(archived, null);
    ['archived_at', 'week_id', 'google_event_id', 'recurrence_id', 'id'].forEach((k) => assert.equal(k in row, false, k));
  });

  test('les étiquettes sont copiées, pas partagées', () => {
    const row = L.duplicateRow(archived, null);
    row.label_ids.push('l2');
    assert.deepEqual(archived.label_ids, ['l1']);
  });
});

describe('commentaires', () => {
  const comments = [
    { id: 'm1', task_id: 'a', body: 'x', is_done: false },
    { id: 'm2', task_id: 'a', body: 'y', is_done: true },
    { id: 'm3', task_id: 'a', body: 'z', is_done: false },
    { id: 'm4', task_id: 'b', body: 'w', is_done: false },
  ];

  test('pendingCount : commentaires non traités d’une tâche', () => {
    assert.equal(L.pendingCount(comments, 'a'), 2);
    assert.equal(L.pendingCount(comments, 'b'), 1);
    assert.equal(L.pendingCount(comments, 'zz'), 0);
  });

  test('pendingByProject : toutes les tâches du projet, archivées comprises', () => {
    const list = [task({ id: 'a', project_id: 'p1' }), task({ id: 'b', project_id: 'p2' }), task({ id: 'c', project_id: 'p1' })];
    assert.equal(L.pendingByProject(comments, list, 'p1'), 2);
    assert.equal(L.pendingByProject(comments, list, 'p2'), 1);
  });

  test('finishedWithPending : tâches terminées ayant des commentaires non traités', () => {
    const list = [
      task({ id: 'a', is_completed: true }),
      task({ id: 'b', is_completed: false }),
      task({ id: 'c', is_completed: true }),
    ];
    assert.deepEqual(L.finishedWithPending(list, comments).map((x) => [x.task.id, x.count]), [['a', 2]]);
  });

  describe('notes (Lot 20)', () => {
    const mixed = [
      { id: 'n1', task_id: 'a', body: 'note', is_note: true, is_done: false },
      { id: 'n2', task_id: 'a', body: 'à faire', is_note: false, is_done: false },
      { id: 'n3', task_id: 'a', body: 'fait', is_note: false, is_done: true },
      { id: 'n4', task_id: 'b', body: 'note', is_note: true, is_done: false },
      { id: 'n5', task_id: 'c', body: 'ancien', is_done: false }, // avant le Lot 20 : pas de is_note
    ];

    test('une note n’est jamais « non traitée » ; un commentaire sans is_note reste à traiter', () => {
      assert.equal(L.pendingCount(mixed, 'a'), 1);
      assert.equal(L.pendingCount(mixed, 'b'), 0);
      assert.equal(L.pendingCount(mixed, 'c'), 1);
    });

    test('pendingByProject ignore les notes', () => {
      const list = [task({ id: 'a', project_id: 'p1' }), task({ id: 'b', project_id: 'p1' }), task({ id: 'c', project_id: 'p2' })];
      assert.equal(L.pendingByProject(mixed, list, 'p1'), 1);
      assert.equal(L.pendingByProject(mixed, list, 'p2'), 1);
    });

    test('finishedWithPending : une tâche terminée n’ayant que des notes n’avertit pas', () => {
      const list = [task({ id: 'a', is_completed: true }), task({ id: 'b', is_completed: true })];
      assert.deepEqual(L.finishedWithPending(list, mixed).map((x) => [x.task.id, x.count]), [['a', 1]]);
    });

    test('commentCounts : total, notes et à traiter d’une tâche', () => {
      assert.deepEqual(L.commentCounts(mixed, 'a'), { total: 3, notes: 1, pending: 1 });
      assert.deepEqual(L.commentCounts(mixed, 'b'), { total: 1, notes: 1, pending: 0 });
      assert.deepEqual(L.commentCounts(mixed, 'zz'), { total: 0, notes: 0, pending: 0 });
    });

    test('commentKindPatch : bascule note / à traiter, toujours repartir non traité', () => {
      assert.deepEqual(L.commentKindPatch(true), { is_note: true, is_done: false });
      assert.deepEqual(L.commentKindPatch(false), { is_note: false, is_done: false });
    });
  });

  test('parseComment : texte nettoyé, vide refusé, longueur bornée', () => {
    assert.equal(L.parseComment('  À relire  '), 'À relire');
    assert.throws(() => L.parseComment('   '), /vide/);
    assert.throws(() => L.parseComment('x'.repeat(2001)), /trop long/);
  });
});

describe('linksOf', () => {
  test('devis en tête, puis les liens du projet dans l’ordre', () => {
    const p = { id: 'p1', quote_label: 'Devis D-12', quote_url: 'https://d.fr' };
    const links = [
      { id: 'l1', project_id: 'p1', label: 'Figma', url: 'https://figma.com' },
      { id: 'l2', project_id: 'p2', label: 'Autre', url: 'https://x.fr' },
      { id: 'l3', project_id: 'p1', label: 'Drive', url: 'https://drive.fr' },
    ];
    assert.deepEqual(L.linksOf(p, links).map((l) => [l.label, !!l.quote]), [['Devis D-12', true], ['Figma', false], ['Drive', false]]);
  });

  test('devis sans libellé : « Devis » ; pas de devis : seulement les liens', () => {
    assert.equal(L.linksOf({ id: 'p', quote_url: 'https://d.fr' }, [])[0].label, 'Devis');
    assert.deepEqual(L.linksOf({ id: 'p' }, []), []);
    assert.deepEqual(L.linksOf(null, []), []);
  });
});

describe('weekSnapshot', () => {
  const withClient = (over, name) => task({ ...over, client_name: name });

  test('terminées (archivées), reportées (planifiées restantes) et répartition par client', () => {
    const list = [
      withClient({ id: 'a', is_completed: true, estimated_hours: 2 }, 'Acme'),
      withClient({ id: 'b', is_completed: true, estimated_hours: 3 }, 'Globex'),
      withClient({ id: 'c', is_completed: true, estimated_hours: 1.5 }, 'Acme'),
      withClient({ id: 'd', is_completed: false, estimated_hours: 4, day_of_week: 'Jeudi' }, 'Acme'),
      withClient({ id: 'e', is_completed: false, estimated_hours: 9, day_of_week: null }, 'Acme'), // sas : ni l'un ni l'autre
    ];
    const s = L.weekSnapshot(list);
    assert.equal(s.finished_count, 3);
    assert.equal(s.finished_hours, 6.5);
    assert.equal(s.carried_count, 1);
    assert.equal(s.carried_hours, 4);
    assert.deepEqual(s.by_client, [{ client: 'Acme', count: 2, hours: 3.5 }, { client: 'Globex', count: 1, hours: 3 }]);
  });

  test('une tâche terminée gardée compte comme reportée', () => {
    const list = [task({ id: 'k', is_completed: true, estimated_hours: 2, day_of_week: 'Mardi', client_name: 'Acme' })];
    const s = L.weekSnapshot(list, ['k']);
    assert.equal(s.finished_count, 0);
    assert.equal(s.carried_count, 1);
    assert.deepEqual(s.by_client, []);
  });

  test('le client vient du projet joint s’il existe', () => {
    const t = task({ is_completed: true, client_name: 'Ancien nom', projects: { clients: { name: 'Nouveau nom' } } });
    assert.equal(L.weekSnapshot([t]).by_client[0].client, 'Nouveau nom');
  });

  test('les terminées comptent leur temps passé, les reportées leurs heures prévues', () => {
    const list = [
      task({ id: 'a', is_completed: true, estimated_hours: 2, actual_hours: 3.5, client_name: 'Acme' }),
      task({ id: 'b', is_completed: true, estimated_hours: 1, actual_hours: null, client_name: 'Acme' }),
      task({ id: 'c', is_completed: false, estimated_hours: 4, actual_hours: 1, day_of_week: 'Jeudi', client_name: 'Acme' }),
    ];
    const at = '2026-10-19T10:00:00.000Z';
    const consigned = [task({ id: 'k', is_completed: true, estimated_hours: 2, actual_hours: 0, client_name: 'Beta', consigned_at: at, archived_at: at })];
    const s = L.weekSnapshot(list, [], consigned);
    assert.equal(s.finished_hours, 4.5);
    assert.equal(s.carried_hours, 4);
    assert.deepEqual(s.by_client.map((c) => [c.client, c.hours]), [['Acme', 4.5], ['Beta', 0]]);
  });
});

describe('weekPeriods', () => {
  test('ordre décroissant ; chaque semaine commence à la clôture précédente', () => {
    const weeks = [
      { id: 'w1', closed_at: '2026-09-28T08:00:00Z' },
      { id: 'w3', closed_at: '2026-10-12T08:00:00Z' },
      { id: 'w2', closed_at: '2026-10-05T08:00:00Z' },
    ];
    const res = L.weekPeriods(weeks);
    assert.deepEqual(res.map((w) => [w.id, w.from]), [
      ['w3', '2026-10-05T08:00:00Z'],
      ['w2', '2026-09-28T08:00:00Z'],
      ['w1', null],
    ]);
  });
});

describe('weekTasks', () => {
  test('par week_id, ou par date d’archivage pour les tâches non rattachées', () => {
    const week = { id: 'w1', closed_at: '2026-10-12T08:00:00Z' };
    const history = [
      task({ id: 'a', week_id: 'w1', archived_at: '2026-10-12T08:00:00Z' }),
      task({ id: 'b', week_id: null, archived_at: '2026-10-12T08:00:00Z' }),
      task({ id: 'c', week_id: 'w0', archived_at: '2026-10-05T08:00:00Z' }),
    ];
    assert.deepEqual(L.weekTasks(history, week).map((t) => t.id), ['a', 'b']);
  });

  test('compare les dates, pas leur écriture', () => {
    const week = { id: 'w1', closed_at: '2026-10-12T08:00:00+00:00' };
    assert.equal(L.weekTasks([task({ id: 'a', archived_at: '2026-10-12T08:00:00.000Z' })], week).length, 1);
  });
});

describe('projectSuggestions', () => {
  const list = [
    project('p1', 'Site vitrine', 'Acme'),
    project('p2', 'Ancien site', 'Acme', 'termine'),
    project('p3', 'Intranet', 'Globex'),
    project('p4', 'Site vitrine', 'Globex'),
    project('p5', 'Refonte', 'Acme'),
  ];

  test('projets en cours du client, puis ses terminés, puis les autres noms', () => {
    const res = L.projectSuggestions(list, ' acme ');
    assert.deepEqual(res.map((s) => s.value), ['Refonte', 'Site vitrine', 'Ancien site', 'Intranet']);
    assert.deepEqual(res.map((s) => s.label), ['Acme · en cours', 'Acme · en cours', 'Acme · terminé', '']);
  });

  test('un nom déjà proposé pour le client n’est pas répété', () => {
    const res = L.projectSuggestions(list, 'Acme');
    assert.equal(res.filter((s) => s.value === 'Site vitrine').length, 1);
  });

  test('sans client (ou client inconnu) : tous les noms, triés, sans doublon', () => {
    assert.deepEqual(L.projectSuggestions(list, '').map((s) => s.value), ['Ancien site', 'Intranet', 'Refonte', 'Site vitrine']);
    assert.deepEqual(L.projectSuggestions(list, 'Initech').map((s) => s.label), ['', '', '', '']);
  });
});

describe('typeSuggestions', () => {
  const types = [{ id: 't2', name: 'Print', position: 2 }, { id: 't1', name: 'Site web', position: 1 }];
  const projects = [
    { id: 'p1', type: 'Site web' },
    { id: 'p2', type: 'Podcast' },
    { id: 'p3', type: 'podcast' },
    { id: 'p4', type: 'Événementiel' },
    { id: 'p5', type: null },
    { id: 'p6', type: 'site WEB' },
  ];

  test('types par défaut dans leur ordre, puis personnalisés (triés, sans doublon)', () => {
    const res = L.typeSuggestions(types, projects);
    assert.deepEqual(res.map((t) => [t.name, t.custom]), [
      ['Site web', false], ['Print', false], ['Événementiel', true], ['Podcast', true],
    ]);
  });

  test('sans types ni projets', () => {
    assert.deepEqual(L.typeSuggestions([], []), []);
  });
});

describe('typeNameError', () => {
  const types = [{ id: 't1', name: 'Site web' }];
  test('vide, doublon (casse ignorée), ou valide', () => {
    assert.match(L.typeNameError(types, null, ' '), /obligatoire/);
    assert.match(L.typeNameError(types, null, 'SITE WEB'), /existe déjà/);
    assert.equal(L.typeNameError(types, 't1', 'Site Web'), '');
    assert.equal(L.typeNameError(types, null, 'Vidéo'), '');
  });
});

describe('moveItem', () => {
  const list = [{ id: 'a', position: 1 }, { id: 'b', position: 2 }, { id: 'c', position: 3 }];

  test('monte ou descend un élément et renumérote les positions', () => {
    assert.deepEqual(L.moveItem(list, 'c', -1).map((x) => [x.id, x.position]), [['a', 1], ['c', 2], ['b', 3]]);
    assert.deepEqual(L.moveItem(list, 'a', 1).map((x) => x.id), ['b', 'a', 'c']);
  });

  test('aux extrémités, rien ne bouge ; liste d’origine intacte', () => {
    assert.deepEqual(L.moveItem(list, 'a', -1).map((x) => x.id), ['a', 'b', 'c']);
    assert.deepEqual(L.moveItem(list, 'c', 1).map((x) => x.id), ['a', 'b', 'c']);
    assert.deepEqual(list.map((x) => x.position), [1, 2, 3]);
  });

  test('l’ordre de départ suit la position, pas l’ordre du tableau', () => {
    const shuffled = [list[2], list[0], list[1]];
    assert.deepEqual(L.moveItem(shuffled, 'b', -1).map((x) => x.id), ['b', 'a', 'c']);
  });
});

describe('étiquettes', () => {
  const labels = [
    { id: 'meet', name: 'Réunion', color: 'bleu', is_meeting: true, position: 3 },
    { id: 'urg', name: 'Urgent', color: 'rouge', is_meeting: false, position: 1 },
    { id: 'wait', name: 'En attente client', color: 'jaune', is_meeting: false, position: 2 },
  ];

  test('taskLabels : étiquettes de la tâche par priorité, identifiants inconnus ignorés', () => {
    const t = task({ label_ids: ['meet', 'ghost', 'urg'] });
    assert.deepEqual(L.taskLabels(t, labels).map((l) => l.id), ['urg', 'meet']);
    assert.deepEqual(L.taskLabels(task({}), labels), []);
  });

  test('primaryLabel : la plus haute dans l’ordre des réglages, sinon null', () => {
    assert.equal(L.primaryLabel(task({ label_ids: ['meet', 'urg'] }), labels).id, 'urg');
    assert.equal(L.primaryLabel(task({ label_ids: [] }), labels), null);
  });

  test('isMeeting : vrai dès qu’une étiquette « réunion » est posée', () => {
    assert.equal(L.isMeeting(task({ label_ids: ['urg', 'meet'] }), labels), true);
    assert.equal(L.isMeeting(task({ label_ids: ['urg'] }), labels), false);
  });

  test('sortDay : réunions avec heure en tête par heure croissante, puis le reste dans l’ordre', () => {
    const list = [
      task({ id: 'a' }),
      task({ id: 'm2', label_ids: ['meet'], start_time: '14:00' }),
      task({ id: 'b' }),
      task({ id: 'm1', label_ids: ['meet'], start_time: '09:30' }),
      task({ id: 'm0', label_ids: ['meet'], start_time: null }),
      task({ id: 'x', label_ids: ['urg'], start_time: '08:00' }), // heure masquée : pas une réunion
    ];
    assert.deepEqual(L.sortDay(list, labels).map((t) => t.id), ['m1', 'm2', 'a', 'b', 'm0', 'x']);
  });

  test('labelNameError', () => {
    assert.match(L.labelNameError(labels, null, ''), /obligatoire/);
    assert.match(L.labelNameError(labels, null, 'urgent'), /existe déjà/);
    assert.equal(L.labelNameError(labels, 'urg', 'URGENT'), '');
  });

  test('LABEL_COLORS : palette fixe de 8 teintes', () => {
    assert.deepEqual(L.LABEL_COLORS, ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'gris']);
  });
});

describe('parseTime', () => {
  test('formats acceptés, normalisés en HH:MM', () => {
    assert.equal(L.parseTime('09:30'), '09:30');
    assert.equal(L.parseTime('9:05'), '09:05');
    assert.equal(L.parseTime('9h'), '09:00');
    assert.equal(L.parseTime(' 14h30 '), '14:30');
    assert.equal(L.parseTime('14:30:00'), '14:30');
  });

  test('vide : chaîne vide ; invalide : erreur', () => {
    assert.equal(L.parseTime(''), '');
    assert.equal(L.parseTime(null), '');
    assert.throws(() => L.parseTime('25:00'), /Heure invalide/);
    assert.throws(() => L.parseTime('9:75'), /Heure invalide/);
    assert.throws(() => L.parseTime('midi'), /Heure invalide/);
  });
});

describe('récurrences : dates', () => {
  const d = (s) => new Date(`${s}T10:00:00`);
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  test('comingMonday : le lundi qui suit, ou ce lundi même', () => {
    assert.equal(iso(L.comingMonday(d('2026-10-16'))), '2026-10-19'); // vendredi
    assert.equal(iso(L.comingMonday(d('2026-10-19'))), '2026-10-19'); // lundi
    assert.equal(iso(L.comingMonday(d('2026-10-18'))), '2026-10-19'); // dimanche
    assert.equal(iso(L.comingMonday(d('2026-12-29'))), '2027-01-04'); // changement d'année
  });

  test('planningMonday : lundi de la semaine en cours (le week-end : la suivante)', () => {
    assert.equal(iso(L.planningMonday(d('2026-10-14'))), '2026-10-12'); // mercredi
    assert.equal(iso(L.planningMonday(d('2026-10-17'))), '2026-10-19'); // samedi
  });

  test('dayDate : date d’un jour du planning dans la semaine', () => {
    assert.equal(iso(L.dayDate(d('2026-10-19'), 'Mardi')), '2026-10-20');
    assert.equal(iso(L.dayDate(d('2026-10-26'), 'Vendredi')), '2026-10-30');
  });

  test('monthlyRank : rang du jour dans le mois (5 = dernier)', () => {
    assert.equal(L.monthlyRank(d('2026-10-06')), 1); // 1er mardi
    assert.equal(L.monthlyRank(d('2026-10-20')), 3);
    assert.equal(L.monthlyRank(d('2026-10-29')), 5); // 5e jeudi = dernier
  });

  test('isLastOfMonth', () => {
    assert.equal(L.isLastOfMonth(d('2026-10-27')), true); // dernier mardi d'octobre
    assert.equal(L.isLastOfMonth(d('2026-10-20')), false);
  });
});

describe('récurrences : règles', () => {
  const weekly = { id: 's1', frequency: 'weekly', day_of_week: 'Mardi', active: true };
  const firstTue = { id: 's2', frequency: 'monthly', monthly_rank: 1, day_of_week: 'Mardi', active: true };
  const lastFri = { id: 's3', frequency: 'monthly', monthly_rank: 5, day_of_week: 'Vendredi', active: true };
  const mon = (s) => new Date(`${s}T00:00:00`);

  test('matchesRule : hebdomadaire toujours ; mensuelle selon le rang', () => {
    assert.equal(L.matchesRule(weekly, mon('2026-10-19')), true);
    assert.equal(L.matchesRule(firstTue, mon('2026-11-02')), true); // mardi 3 nov.
    assert.equal(L.matchesRule(firstTue, mon('2026-10-19')), false); // mardi 20 oct. = 3e
    assert.equal(L.matchesRule(lastFri, mon('2026-10-26')), true); // vendredi 30 oct.
    assert.equal(L.matchesRule(lastFri, mon('2026-10-19')), false);
  });

  test('dueOccurrences : séries actives, règle satisfaite, sans occurrence encore active', () => {
    const series = [weekly, firstTue, { ...weekly, id: 's4', active: false }, { ...weekly, id: 's5' }];
    const active = [{ id: 't', recurrence_id: 's5', day_of_week: null }]; // occurrence de s5 rangée dans le sas
    assert.deepEqual(L.dueOccurrences(series, active, mon('2026-11-02')).map((s) => s.id), ['s1', 's2']);
    assert.deepEqual(L.dueOccurrences(series, active, mon('2026-10-19')).map((s) => s.id), ['s1']);
  });

  test('recurrenceLabel', () => {
    assert.equal(L.recurrenceLabel(weekly), 'Chaque semaine, le mardi');
    assert.equal(L.recurrenceLabel(firstTue), 'Le 1ᵉʳ mardi du mois');
    assert.equal(L.recurrenceLabel({ ...firstTue, monthly_rank: 3 }), 'Le 3ᵉ mardi du mois');
    assert.equal(L.recurrenceLabel(lastFri), 'Le dernier vendredi du mois');
  });
});

describe('newWeek (occurrences récurrentes)', () => {
  test('une occurrence récurrente non terminée reste sur son jour', () => {
    const res = L.newWeek([task({ id: 'r', day_of_week: 'Jeudi' }), task({ id: 'n', day_of_week: 'Jeudi' })], [], 'x', [], ['r']);
    assert.deepEqual(res.tasks.map((t) => [t.id, t.day_of_week]), [['r', 'Jeudi'], ['n', 'Lundi']]);
    assert.equal(res.moving, 1);
  });

  test('terminée, elle est archivée normalement', () => {
    const res = L.newWeek([task({ id: 'r', is_completed: true, day_of_week: 'Jeudi' })], [], 'x', [], ['r']);
    assert.equal(res.finished, 1);
    assert.deepEqual(res.tasks, []);
  });
});

describe('duplicateRow', () => {
  const original = task({
    id: 'orig', project_id: 'p1', client_name: 'Acme', project_name: 'Site', task_name: 'Point', estimated_hours: 1.5,
    day_of_week: 'Mardi', is_completed: true, label_ids: ['L3'], start_time: '10:00', meeting_url: 'https://meet.google.com/x',
    recurrence_id: 'S1', archived_at: null, week_id: null, created_at: '2026-10-01', projects: { id: 'p1' },
  });

  test('copie projet, nom, heures, étiquettes et réunion, vers la destination choisie', () => {
    assert.deepEqual(L.duplicateRow(original, 'Jeudi'), {
      project_id: 'p1', client_name: 'Acme', project_name: 'Site', task_name: 'Point', estimated_hours: 1.5,
      day_of_week: 'Jeudi', is_completed: false, label_ids: ['L3'], start_time: '10:00', meeting_url: 'https://meet.google.com/x',
    });
  });

  test('vers le sas : pas de jour ; jamais terminée, récurrente ni archivée', () => {
    const row = L.duplicateRow(original, null);
    assert.equal(row.day_of_week, null);
    assert.equal(row.is_completed, false);
    for (const k of ['id', 'recurrence_id', 'archived_at', 'week_id', 'created_at', 'projects']) assert.equal(k in row, false, k);
  });

  test('les étiquettes sont copiées, pas partagées', () => {
    const row = L.duplicateRow(original, 'Lundi');
    row.label_ids.push('X');
    assert.deepEqual(original.label_ids, ['L3']);
  });
});

describe('groupDay', () => {
  const labels = [{ id: 'meet', name: 'Réunion', color: 'bleu', is_meeting: true, position: 1 }];
  const withClient = (over, clientId, clientName, projectName) => task({
    ...over, client_name: clientName, project_name: projectName,
    projects: { id: `p-${projectName}`, name: projectName, clients: { id: clientId, name: clientName } },
  });

  test('regroupe par client ; projets distincts listés ; ordre d’apparition sans réunion', () => {
    const list = [
      withClient({ id: 'a' }, 'c1', 'Acme', 'Site'),
      withClient({ id: 'b' }, 'c2', 'Globex', 'Intranet'),
      withClient({ id: 'c' }, 'c1', 'Acme', 'Logo'),
      withClient({ id: 'd' }, 'c1', 'Acme', 'Site'),
    ];
    const groups = L.groupDay(list, labels);
    assert.deepEqual(groups.map((g) => [g.client, g.projects, g.tasks.map((t) => t.id)]), [
      ['Acme', ['Site', 'Logo'], ['a', 'c', 'd']],
      ['Globex', ['Intranet'], ['b']],
    ]);
  });

  test('le groupe qui a la réunion la plus tôt passe en tête ; dans un groupe, réunions par heure d’abord', () => {
    const list = [
      withClient({ id: 'a' }, 'c1', 'Acme', 'Site'),
      withClient({ id: 'm2', label_ids: ['meet'], start_time: '15:00' }, 'c1', 'Acme', 'Site'),
      withClient({ id: 'b' }, 'c2', 'Globex', 'Intranet'),
      withClient({ id: 'm1', label_ids: ['meet'], start_time: '09:00' }, 'c3', 'Initech', 'Audit'),
    ];
    const groups = L.groupDay(list, labels);
    assert.deepEqual(groups.map((g) => g.client), ['Initech', 'Acme', 'Globex']);
    assert.deepEqual(groups[1].tasks.map((t) => t.id), ['m2', 'a']);
  });

  test('sans projet joint : regroupement sur le nom du client (casse ignorée)', () => {
    const list = [task({ id: 'x', client_name: 'Acme', project_name: 'Site' }), task({ id: 'y', client_name: 'acme ', project_name: 'Site' })];
    const groups = L.groupDay(list, labels);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].tasks.map((t) => t.id), ['x', 'y']);
  });
});

describe('ordre manuel des conteneurs (group_rank)', () => {
  const labels = [{ id: 'meet', name: 'Réunion', color: 'bleu', is_meeting: true, position: 1 }];
  const t = (id, clientId, extra = {}) => task({
    id, client_name: clientId, project_name: 'P', projects: { id: 'p', name: 'P', clients: { id: clientId, name: clientId } }, ...extra,
  });

  test('clientKey : identifiant du client du projet, sinon son nom normalisé', () => {
    assert.equal(L.clientKey(t('a', 'c1')), 'c1');
    assert.equal(L.clientKey(task({ client_name: ' Acme ' })), 'n:acme');
  });

  test('groupDay : groupes classés d’abord par rang (le plus petit de leurs tâches), les autres ensuite', () => {
    const list = [
      t('a', 'c1'),
      t('m', 'c3', { label_ids: ['meet'], start_time: '08:00' }), // réunion tôt mais sans rang
      t('b', 'c2', { group_rank: 1 }),
      t('c', 'c1', { group_rank: 2 }),
    ];
    assert.deepEqual(L.groupDay(list, labels).map((g) => g.key), ['c2', 'c1', 'c3']);
  });

  test('placeAt : déplace une clé à un index (calculé sans elle)', () => {
    assert.deepEqual(L.placeAt(['a', 'b', 'c', 'd'], 'd', 1), ['a', 'd', 'b', 'c']);
    assert.deepEqual(L.placeAt(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
    assert.deepEqual(L.placeAt(['a', 'b'], 'x', 1), ['a', 'x', 'b']); // nouvelle clé
    assert.deepEqual(L.placeAt(['a', 'b'], 'a', 99), ['b', 'a']);
  });

  test('rankPatches : un PATCH par groupe dont un rang change', () => {
    const groups = [
      { key: 'c2', tasks: [{ id: 'b', group_rank: 1 }] },
      { key: 'c1', tasks: [{ id: 'a', group_rank: null }, { id: 'c', group_rank: 2 }] },
      { key: 'c3', tasks: [{ id: 'm', group_rank: 7 }] },
    ];
    assert.deepEqual(L.rankPatches(groups), [{ ids: ['a', 'c'], rank: 2 }, { ids: ['m'], rank: 3 }]);
  });

  test('dropIndex : nombre de milieux d’éléments au-dessus du pointeur', () => {
    assert.equal(L.dropIndex([10, 50, 90], 5), 0);
    assert.equal(L.dropIndex([10, 50, 90], 60), 2);
    assert.equal(L.dropIndex([10, 50, 90], 200), 3);
    assert.equal(L.dropIndex([], 10), 0);
  });

  test('mergeOrder : ordres concaténés sans doublon (Lundi d’abord, puis les jours suivants)', () => {
    assert.deepEqual(L.mergeOrder([['c1', 'c2'], ['c3', 'c1'], [], ['c4']]), ['c1', 'c2', 'c3', 'c4']);
  });
});

describe('ordre des dossiers du sas (sas_position)', () => {
  const p = (id, pos) => ({ id, sas_position: pos });

  test('sortFolders : par position, sans position à la fin (ordre conservé)', () => {
    assert.deepEqual(L.sortFolders([p('a', null), p('b', 2), p('c', 1), p('d', null)]).map((x) => x.id), ['c', 'b', 'a', 'd']);
  });

  test('folderPatches : positions 1..n, seulement celles qui changent', () => {
    assert.deepEqual(L.folderPatches([p('c', 1), p('a', null), p('b', 2)]), [{ id: 'a', sas_position: 2 }, { id: 'b', sas_position: 3 }]);
  });
});

describe('Google Agenda : lecture des événements', () => {
  const ev = (over = {}) => ({
    id: 'e1', status: 'confirmed', summary: 'Point Acme',
    start: { dateTime: '2026-10-20T09:30:00+02:00' }, end: { dateTime: '2026-10-20T10:15:00+02:00' },
    ...over,
  });

  test('extractMeetingLink : Meet, conférence, puis lien visio dans le lieu ou la description', () => {
    assert.equal(L.extractMeetingLink(ev({ hangoutLink: 'https://meet.google.com/abc-defg-hij' })), 'https://meet.google.com/abc-defg-hij');
    assert.equal(L.extractMeetingLink(ev({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+33' }, { entryPointType: 'video', uri: 'https://zoom.us/j/123' }] } })), 'https://zoom.us/j/123');
    assert.equal(L.extractMeetingLink(ev({ location: 'https://teams.microsoft.com/l/meetup-join/19%3a' })), 'https://teams.microsoft.com/l/meetup-join/19%3a');
    assert.equal(L.extractMeetingLink(ev({ description: 'Rejoindre : <a href="https://acme.webex.com/meet/x">ici</a>' })), 'https://acme.webex.com/meet/x');
    assert.equal(L.extractMeetingLink(ev({ location: 'Salle B', description: 'https://acme.fr' })), '');
  });

  test('eventSlot : jour du planning, heure locale, durée arrondie au quart d’heure', () => {
    const slot = L.eventSlot(ev(), new Date(2026, 9, 19));
    assert.equal(slot.day, 'Mardi');
    assert.equal(slot.hours, 0.75);
    assert.match(slot.start_time, /^\d{2}:\d{2}$/);
  });

  test('eventSlot : hors semaine, journée entière, week-end ou annulé -> null', () => {
    const monday = new Date(2026, 9, 19);
    assert.equal(L.eventSlot(ev({ start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }), monday), null);
    assert.equal(L.eventSlot(ev({ start: { dateTime: '2026-10-24T10:00:00' }, end: { dateTime: '2026-10-24T11:00:00' } }), monday), null);
    assert.equal(L.eventSlot(ev({ start: { dateTime: '2026-10-27T10:00:00' }, end: { dateTime: '2026-10-27T11:00:00' } }), monday), null);
    assert.equal(L.eventSlot(ev({ status: 'cancelled' }), monday), null);
  });
});

describe('Google Agenda : projet proposé', () => {
  const clients = [{ id: 'c1', name: 'Acme', website: 'https://www.acme.fr' }, { id: 'c2', name: 'Globex', website: null }];
  const projects = [
    { id: 'p1', name: 'Site', status: 'en_cours', client_id: 'c1', clients: clients[0] },
    { id: 'p0', name: 'Ancien', status: 'termine', client_id: 'c1', clients: clients[0] },
    { id: 'p2', name: 'Intranet', status: 'en_cours', client_id: 'c2', clients: clients[1] },
  ];

  test('par domaine e-mail d’un participant = site web du client', () => {
    const e = { summary: 'Point', attendees: [{ email: 'moi@ascomedia.fr', self: true }, { email: 'jean@acme.fr' }] };
    assert.equal(L.suggestProject(e, clients, projects, 'p2'), 'p1');
  });

  test('sinon par nom de client dans le titre (accents et casse ignorés)', () => {
    assert.equal(L.suggestProject({ summary: 'Démo GLOBEX', attendees: [] }, clients, projects, 'p1'), 'p2');
  });

  test('sinon le projet de repli (dernier utilisé), s’il est en cours', () => {
    assert.equal(L.suggestProject({ summary: 'Divers' }, clients, projects, 'p2'), 'p2');
    assert.equal(L.suggestProject({ summary: 'Divers' }, clients, projects, 'p0'), '');
  });
});

describe('Google Agenda : plan d’import', () => {
  const labels = [{ id: 'meet', is_meeting: true, position: 1 }];
  const slot = { day: 'Mardi', start_time: '09:30', hours: 1 };

  test('nouveau, à compléter (réunion sans lien au même créneau), déjà importé, déjà planifié', () => {
    const tasks = [
      task({ id: 'x', day_of_week: 'Mardi', label_ids: ['meet'], start_time: '09:30', meeting_url: null }),
      task({ id: 'y', day_of_week: 'Mardi', label_ids: ['meet'], start_time: '14:00', meeting_url: 'https://zoom.us/j/1' }),
    ];
    const history = [task({ id: 'h', google_event_id: 'old' })];
    const items = [
      { event: { id: 'e1' }, slot, link: 'https://meet.google.com/a' },
      { event: { id: 'old' }, slot: { ...slot, start_time: '11:00' }, link: 'https://meet.google.com/b' },
      { event: { id: 'e3' }, slot: { ...slot, start_time: '14:00' }, link: 'https://zoom.us/j/1' },
      { event: { id: 'e4' }, slot: { ...slot, start_time: '16:00' }, link: 'https://meet.google.com/c' },
    ];
    assert.deepEqual(L.importPlan(items, tasks, history, labels).map((i) => [i.event.id, i.status, i.taskId ?? null]), [
      ['e1', 'complete', 'x'], ['old', 'imported', null], ['e3', 'exists', 'y'], ['e4', 'new', null],
    ]);
  });
});

describe('bloc-notes de la semaine (Lot 25)', () => {
  test('weekKey : lundi de la semaine planifiée, en date locale ; le week-end, la semaine suivante', () => {
    assert.equal(L.weekKey(new Date(2026, 9, 21, 23, 30)), '2026-10-19'); // mercredi soir
    assert.equal(L.weekKey(new Date(2026, 9, 19, 0, 5)), '2026-10-19'); // lundi juste après minuit
    assert.equal(L.weekKey(new Date(2026, 9, 24)), '2026-10-26'); // samedi
    assert.equal(L.weekKey(new Date(2026, 9, 25)), '2026-10-26'); // dimanche
  });

  test('shiftWeek et weekOffset : semaines voisines, passage d’heure et de mois compris', () => {
    assert.equal(L.shiftWeek('2026-10-19', 1), '2026-10-26');
    assert.equal(L.shiftWeek('2026-10-26', 1), '2026-11-02'); // changement d'heure le 25 octobre
    assert.equal(L.shiftWeek('2026-01-05', -1), '2025-12-29');
    assert.equal(L.weekOffset('2026-11-02', '2026-10-19'), 2);
    assert.equal(L.weekOffset('2026-10-12', '2026-10-19'), -1);
    assert.equal(L.weekOffset('2026-10-19', '2026-10-19'), 0);
  });

  test('continueList : la puce continue à la ligne suivante, indentation conservée', () => {
    const text = 'Projets\n  - Acme : maquettes';
    assert.deepEqual(L.continueList(text, text.length), { from: text.length, to: text.length, insert: '\n  - ' });
    assert.deepEqual(L.continueList('• a', 3), { from: 3, to: 3, insert: '\n• ' });
  });

  test('continueList : les listes numérotées s’incrémentent', () => {
    assert.equal(L.continueList('1. Brief', 8).insert, '\n2. ');
    assert.equal(L.continueList('9) Envoi', 8).insert, '\n10) ');
  });

  test('continueList : une puce vide est retirée (fin de liste)', () => {
    const text = '- Acme\n- ';
    assert.deepEqual(L.continueList(text, text.length), { from: 7, to: 9, insert: '' });
  });

  test('continueList : hors liste, retour à la ligne normal', () => {
    assert.equal(L.continueList('Projets de la semaine', 21), null);
    assert.equal(L.continueList('-sans espace', 12), null);
    assert.equal(L.continueList('', 0), null);
  });
});

describe('suggestions de tâches par l’IA (Lot 26)', () => {
  const projects = [
    project('p-old', 'Flyers', 'Bobo', 'termine'),
    project('p-site', 'Refonte site', 'Acme'),
    project('p-logo', 'Logo', 'Bobo'),
  ];
  const tasks = [
    task({ id: 't-parked', project_id: 'p-logo', task_name: 'Déclinaisons', day_of_week: null, estimated_hours: 2 }),
    task({ id: 't-planned', project_id: 'p-site', task_name: 'Maquette accueil', day_of_week: 'Mardi', estimated_hours: 3 }),
  ];
  const s = (over) => ({ kind: 'new_task', project_id: '', new_client: '', new_project: '', task_id: '', task_name: '', estimated_hours: 1, day: '', note_excerpt: '', reason: '', ...over });

  test('suggestionContext : projets en cours d’abord, tâches avec leur jour ou « sas »', () => {
    const ctx = L.suggestionContext('  - Acme : maquettes  ', '2026-10-19', projects, tasks);
    assert.equal(ctx.note, '- Acme : maquettes');
    assert.equal(ctx.week_start, '2026-10-19');
    assert.deepEqual(ctx.projects.map((p) => [p.id, p.status]), [['p-site', 'en cours'], ['p-logo', 'en cours'], ['p-old', 'archivé']]);
    assert.deepEqual(ctx.projects[0], { id: 'p-site', client: 'Acme', name: 'Refonte site', type: '', status: 'en cours' });
    assert.deepEqual(ctx.tasks.map((t) => [t.id, t.day, t.hours]), [['t-parked', 'sas', 2], ['t-planned', 'Mardi', 3]]);
  });

  test('nouvelle tâche dans un projet connu : sas par défaut, heures au quart d’heure', () => {
    const [r] = L.reviewSuggestions([s({ project_id: 'p-site', task_name: 'Intégration header', estimated_hours: 1.3, note_excerpt: 'intégration' })], projects, tasks);
    assert.equal(r.kind, 'new');
    assert.equal(r.projectId, 'p-site');
    assert.equal(r.day, '');
    assert.equal(r.hours, 1.25);
    assert.equal(r.excerpt, 'intégration');
  });

  test('jour cité gardé, jour inconnu ignoré, heures absentes : 1 h', () => {
    const [a, b] = L.reviewSuggestions([
      s({ project_id: 'p-site', task_name: 'A', day: 'Jeudi', estimated_hours: 0 }),
      s({ project_id: 'p-site', task_name: 'B', day: 'Samedi' }),
    ], projects, tasks);
    assert.equal(a.day, 'Jeudi');
    assert.equal(a.hours, 1);
    assert.equal(b.day, '');
  });

  test('tâche du sas : à planifier (jour cité, sinon Lundi) ; déjà planifiée : pour information', () => {
    const [plan, planned] = L.reviewSuggestions([
      s({ kind: 'plan_existing', task_id: 't-parked', project_id: 'p-logo', task_name: 'Déclinaisons' }),
      s({ kind: 'plan_existing', task_id: 't-planned', day: 'Jeudi' }),
    ], projects, tasks);
    assert.deepEqual([plan.kind, plan.taskId, plan.day, plan.hours], ['plan', 't-parked', 'Lundi', 2]);
    assert.deepEqual([planned.kind, planned.day], ['planned', 'Mardi']);
  });

  test('une « nouvelle » tâche qui existe déjà dans le projet devient la tâche existante', () => {
    const [r] = L.reviewSuggestions([s({ project_id: 'p-logo', task_name: 'déclinaisons ', day: 'Mercredi' })], projects, tasks);
    assert.deepEqual([r.kind, r.taskId, r.day], ['plan', 't-parked', 'Mercredi']);
  });

  test('projet inconnu : nouveau projet si nommé, sinon écarté ; doublons et noms vides écartés', () => {
    const list = L.reviewSuggestions([
      s({ new_client: 'Globex', new_project: 'Salon', task_name: 'Kakémono' }),
      s({ new_client: 'globex', new_project: 'salon', task_name: 'kakémono' }),
      s({ project_id: 'inconnu', task_name: 'Sans projet' }),
      s({ project_id: 'p-site', task_name: '  ' }),
      s({ kind: 'plan_existing', task_id: 't-parked' }),
      s({ kind: 'plan_existing', task_id: 't-parked' }),
    ], projects, tasks);
    assert.deepEqual(list.map((r) => [r.kind, r.newClient ?? '', r.newProject ?? '', r.task_name]),
      [['new', 'Globex', 'Salon', 'Kakémono'], ['plan', '', '', 'Déclinaisons']]);
  });

  test('projet connu : les champs « nouveau projet » sont ignorés ; réponse invalide : aucune suggestion', () => {
    const [r] = L.reviewSuggestions([s({ project_id: 'p-old', new_client: 'X', new_project: 'Y', task_name: 'Réimpression' })], projects, tasks);
    assert.deepEqual([r.projectId, r.newClient, r.newProject], ['p-old', '', '']);
    assert.deepEqual(L.reviewSuggestions(null, projects, tasks), []);
    assert.deepEqual(L.reviewSuggestions([null, 3], projects, tasks), []);
  });
});
