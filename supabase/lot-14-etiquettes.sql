-- Lot 14 : étiquettes de tâche (administrées dans Réglages) et réunions visio.
-- Une étiquette a un nom, une teinte (palette fixe) et une option « réunion » qui active, sur les tâches
-- qui la portent, une heure de début et un lien vers le salon de visioconférence.
-- L'ordre (position) sert de priorité : la carte prend la teinte de son étiquette la plus haute.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 14.
-- Idempotent : peut être relancé sans risque.

-- 1. Étiquettes
create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  color text not null default 'gris'
    check (color in ('rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'gris')),
  is_meeting boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists labels_name_key on public.labels (lower(name));

insert into public.labels (name, color, is_meeting, position)
select v.name, v.color, v.is_meeting, v.position
from (values ('Urgent', 'rouge', false, 1), ('En attente client', 'jaune', false, 2), ('Réunion', 'bleu', true, 3))
  as v(name, color, is_meeting, position)
where not exists (select 1 from public.labels);

-- 2. Étiquettes et réunion d'une tâche (heure « HH:MM » et lien du salon conservés si l'étiquette est retirée)
alter table public.tasks add column if not exists label_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists start_time text;
alter table public.tasks drop constraint if exists tasks_start_time_check;
alter table public.tasks add constraint tasks_start_time_check
  check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.tasks add column if not exists meeting_url text;

-- 3. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.labels enable row level security;
revoke all on public.labels from anon;
grant select, insert, update, delete on public.labels to authenticated;

drop policy if exists "labels_all_authenticated" on public.labels;
create policy "labels_all_authenticated" on public.labels
  for all to authenticated using (true) with check (true);
