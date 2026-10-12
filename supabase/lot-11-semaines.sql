-- Lot 11 : historique des semaines.
-- « Nouvelle Semaine » enregistre un instantané (tâches terminées / reportées, répartition par client)
-- et rattache les tâches archivées à leur semaine.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 11.
-- Idempotent : peut être relancé sans risque.

-- 1. Semaines closes (une par clic sur « Nouvelle Semaine » ayant archivé au moins une tâche)
create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  closed_at timestamptz not null unique,          -- = archived_at des tâches de la semaine
  finished_count integer not null default 0,
  finished_hours numeric not null default 0,
  carried_count integer,                           -- NULL : inconnu (semaines reprises de l'existant)
  carried_hours numeric,
  by_client jsonb not null default '[]'::jsonb,    -- [{ "client": "...", "count": n, "hours": h }]
  created_at timestamptz not null default now()
);

-- 2. Rattachement des tâches archivées
alter table public.tasks add column if not exists week_id uuid references public.weeks(id) on delete set null;
create index if not exists tasks_week_id_idx on public.tasks(week_id);

-- 3. Reprise de l'existant : une semaine par date d'archivage déjà présente.
--    Les tâches reportées de ces semaines n'ont pas été enregistrées : carried_* reste NULL.
insert into public.weeks (closed_at, finished_count, finished_hours, by_client)
select a.archived_at, a.n, a.h, coalesce((
  select jsonb_agg(jsonb_build_object('client', c.client, 'count', c.n, 'hours', c.h) order by c.h desc, c.client)
  from (
    select coalesce(nullif(trim(t2.client_name), ''), 'Sans client') as client, count(*) as n, sum(t2.estimated_hours) as h
    from public.tasks t2
    where t2.archived_at = a.archived_at
    group by 1
  ) c
), '[]'::jsonb)
from (
  select archived_at, count(*) as n, coalesce(sum(estimated_hours), 0) as h
  from public.tasks
  where archived_at is not null
  group by archived_at
) a
on conflict (closed_at) do nothing;

update public.tasks t
set week_id = w.id
from public.weeks w
where t.week_id is null
  and t.archived_at is not null
  and t.archived_at = w.closed_at;

-- 4. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.weeks enable row level security;
revoke all on public.weeks from anon;
grant select, insert, update, delete on public.weeks to authenticated;

drop policy if exists "weeks_all_authenticated" on public.weeks;
create policy "weeks_all_authenticated" on public.weeks
  for all to authenticated using (true) with check (true);
