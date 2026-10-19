-- Lot 22 : temps estimé d'un projet et temps effectif (passé) d'une tâche.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 22.
-- Idempotent : peut être relancé sans risque. Colonnes facultatives (NULL = non renseigné) :
-- les projets existants n'ont pas d'estimé, et une tâche sans temps passé compte ses heures estimées.

alter table public.projects add column if not exists estimated_hours numeric;
alter table public.tasks add column if not exists actual_hours numeric;

alter table public.projects drop constraint if exists projects_estimated_hours_check;
alter table public.projects add constraint projects_estimated_hours_check check (estimated_hours is null or estimated_hours >= 0);

alter table public.tasks drop constraint if exists tasks_actual_hours_check;
alter table public.tasks add constraint tasks_actual_hours_check check (actual_hours is null or actual_hours >= 0);

-- Recharge le schéma de l'API (sinon : « Could not find the 'estimated_hours' column … in the schema cache »).
notify pgrst, 'reload schema';
