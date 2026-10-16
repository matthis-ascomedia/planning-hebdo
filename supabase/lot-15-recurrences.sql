-- Lot 15 : tâches récurrentes (hebdomadaires ou mensuelles).
-- Une série porte la règle et le modèle de tâche ; « Nouvelle Semaine » crée l'occurrence de la semaine
-- qui commence si la règle est satisfaite et qu'aucune occurrence de la série n'est encore active.
-- Les noms client / projet des occurrences sont repris du projet au moment de la création.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 15.
-- Idempotent : peut être relancé sans risque.

-- 1. Séries
create table if not exists public.recurrences (
  id uuid primary key default gen_random_uuid(),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  monthly_rank integer check (monthly_rank between 1 and 5),          -- 5 = dernier du mois
  day_of_week text not null check (day_of_week in ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi')),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_name text not null,
  estimated_hours numeric not null default 0 check (estimated_hours >= 0),
  label_ids uuid[] not null default '{}',
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  meeting_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (frequency = 'weekly' or monthly_rank is not null)
);

-- 2. Rattachement des occurrences
alter table public.tasks add column if not exists recurrence_id uuid references public.recurrences(id) on delete set null;
create index if not exists tasks_recurrence_id_idx on public.tasks(recurrence_id);

-- 3. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.recurrences enable row level security;
revoke all on public.recurrences from anon;
grant select, insert, update, delete on public.recurrences to authenticated;

drop policy if exists "recurrences_all_authenticated" on public.recurrences;
create policy "recurrences_all_authenticated" on public.recurrences
  for all to authenticated using (true) with check (true);
