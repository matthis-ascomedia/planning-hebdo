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
