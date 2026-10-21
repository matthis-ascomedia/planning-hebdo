-- Lot 25 : bloc-notes de la semaine (volet gauche de l'application).
-- Une note par semaine, repérée par le lundi de la semaine planifiée (week_start) ; enregistrée pendant la saisie.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 25.
-- Idempotent : peut être relancé sans risque.

-- 1. Notes (texte libre, une par semaine)
create table if not exists public.week_notes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,                 -- lundi de la semaine
  body text not null default '' check (length(body) <= 20000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.week_notes enable row level security;
revoke all on public.week_notes from anon;
grant select, insert, update, delete on public.week_notes to authenticated;

drop policy if exists "week_notes_all_authenticated" on public.week_notes;
create policy "week_notes_all_authenticated" on public.week_notes
  for all to authenticated using (true) with check (true);

-- Recharge le schéma de l'API (sinon : « Could not find the table 'public.week_notes' in the schema cache »).
notify pgrst, 'reload schema';
