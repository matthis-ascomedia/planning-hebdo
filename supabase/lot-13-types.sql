-- Lot 13 : onglet Réglages, taxonomie des types de projet.
-- Les types par défaut sont administrés dans Réglages ; un projet porte un type en texte libre
-- (un type par défaut, ou un type personnalisé). Supprimer un type par défaut ne modifie pas les projets.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 13.
-- Idempotent : peut être relancé sans risque.

-- 1. Types de projet par défaut (ordonnés)
create table if not exists public.project_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists project_types_name_key on public.project_types (lower(name));

insert into public.project_types (name, position)
select v.name, v.position
from (values ('Site web', 1), ('Identité visuelle', 2), ('Print', 3), ('Campagne', 4), ('Vidéo', 5), ('Maintenance', 6))
  as v(name, position)
where not exists (select 1 from public.project_types);

-- 2. Type d'un projet
alter table public.projects add column if not exists type text;

-- 3. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.project_types enable row level security;
revoke all on public.project_types from anon;
grant select, insert, update, delete on public.project_types to authenticated;

drop policy if exists "project_types_all_authenticated" on public.project_types;
create policy "project_types_all_authenticated" on public.project_types
  for all to authenticated using (true) with check (true);
