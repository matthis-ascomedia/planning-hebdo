-- Lot 1 : clients / projets + rattachement des tâches à un projet.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 1.
-- Idempotent : peut être relancé sans risque.

-- 1. Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 2. Projets (chaque projet appartient à un client)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  status text not null default 'en_cours' check (status in ('en_cours', 'termine')),
  created_at timestamptz not null default now(),
  unique (client_id, name)
);

-- 3. Rattachement des tâches
alter table public.tasks add column if not exists project_id uuid references public.projects(id);
create index if not exists tasks_project_id_idx on public.tasks(project_id);

-- 4. Reprise de l'existant (client_name / project_name -> clients / projects)
insert into public.clients (name)
select distinct coalesce(nullif(trim(client_name), ''), 'Sans client') from public.tasks
on conflict (name) do nothing;

insert into public.projects (client_id, name)
select distinct c.id, coalesce(nullif(trim(t.project_name), ''), 'Sans projet')
from public.tasks t
join public.clients c on c.name = coalesce(nullif(trim(t.client_name), ''), 'Sans client')
on conflict (client_id, name) do nothing;

update public.tasks t
set project_id = p.id
from public.projects p
join public.clients c on c.id = p.client_id
where t.project_id is null
  and c.name = coalesce(nullif(trim(t.client_name), ''), 'Sans client')
  and p.name = coalesce(nullif(trim(t.project_name), ''), 'Sans projet');

-- 5. RLS (même modèle que public.tasks : réservé aux utilisateurs connectés)
alter table public.clients enable row level security;
alter table public.projects enable row level security;

revoke all on public.clients from anon;
revoke all on public.projects from anon;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists "clients_all_authenticated" on public.clients;
create policy "clients_all_authenticated" on public.clients
  for all to authenticated using (true) with check (true);

drop policy if exists "projects_all_authenticated" on public.projects;
create policy "projects_all_authenticated" on public.projects
  for all to authenticated using (true) with check (true);
