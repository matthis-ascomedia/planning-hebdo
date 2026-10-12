-- À exécuter une fois dans Supabase > SQL Editor.
-- Prérequis : créer ton utilisateur (Authentication > Users > Add user, email + mot de passe)
-- puis désactiver les inscriptions publiques (Authentication > Sign In / Providers > "Allow new users to sign up" = off).

-- 1. Active la RLS : sans policy, personne n'a accès.
alter table public.tasks enable row level security;

-- 2. Retire les droits du rôle anonyme (clé anon publique dans le code du site).
revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

-- 3. Policies : seuls les utilisateurs connectés lisent / écrivent.
drop policy if exists "tasks_select_authenticated" on public.tasks;
drop policy if exists "tasks_insert_authenticated" on public.tasks;
drop policy if exists "tasks_update_authenticated" on public.tasks;
drop policy if exists "tasks_delete_authenticated" on public.tasks;

create policy "tasks_select_authenticated" on public.tasks
  for select to authenticated using (true);
create policy "tasks_insert_authenticated" on public.tasks
  for insert to authenticated with check (true);
create policy "tasks_update_authenticated" on public.tasks
  for update to authenticated using (true) with check (true);
create policy "tasks_delete_authenticated" on public.tasks
  for delete to authenticated using (true);

-- 4. Garde-fous sur les données (validation côté base, y compris pour l'import JSON).
alter table public.tasks drop constraint if exists tasks_day_of_week_check;
alter table public.tasks add constraint tasks_day_of_week_check
  check (day_of_week in ('Lundi','Mardi','Mercredi','Jeudi','Vendredi'));
alter table public.tasks drop constraint if exists tasks_estimated_hours_check;
alter table public.tasks add constraint tasks_estimated_hours_check
  check (estimated_hours >= 0);
