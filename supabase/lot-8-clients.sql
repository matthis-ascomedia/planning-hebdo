-- Lot 8 : fiches clients (logo, site web), année / devis / liens d'accès rapide des projets.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 8.
-- Idempotent : peut être relancé sans risque.

-- 1. Clients : logo (miniature 128 px stockée en data URL) et site web
alter table public.clients add column if not exists logo text;
alter table public.clients add column if not exists website text;

-- 2. Projets : année de la prestation vendue + devis (lien et label)
alter table public.projects add column if not exists year integer;
update public.projects set year = extract(year from created_at)::integer where year is null;
alter table public.projects alter column year set default extract(year from now())::integer;
alter table public.projects alter column year set not null;
alter table public.projects drop constraint if exists projects_year_check;
alter table public.projects add constraint projects_year_check check (year between 2000 and 2100);

alter table public.projects add column if not exists quote_label text;
alter table public.projects add column if not exists quote_url text;

-- 3. Liens d'accès rapide (label + URL) par projet
create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists project_links_project_id_idx on public.project_links(project_id);

-- 4. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.project_links enable row level security;
revoke all on public.project_links from anon;
grant select, insert, update, delete on public.project_links to authenticated;

drop policy if exists "project_links_all_authenticated" on public.project_links;
create policy "project_links_all_authenticated" on public.project_links
  for all to authenticated using (true) with check (true);
