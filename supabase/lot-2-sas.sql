-- Lot 2 : une tâche rangée dans le sas d'attente n'a pas de jour (day_of_week = NULL).
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 2.
-- Idempotent. Le check existant (day_of_week in ('Lundi',...)) accepte NULL.

alter table public.tasks alter column day_of_week drop not null;
