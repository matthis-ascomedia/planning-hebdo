-- Lot 23 : consigner une tâche terminée (archivée tout de suite, avec son temps passé).
-- consigned_at : date de la consignation. Une tâche consignée a aussi archived_at ; son week_id reste vide
-- jusqu'à la prochaine « Nouvelle Semaine », qui la rattache à la semaine close.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 23.
-- Idempotent : peut être relancé sans risque. (tasks.actual_hours existe depuis le Lot 22.)

alter table public.tasks add column if not exists consigned_at timestamptz;
create index if not exists tasks_consigned_at_idx on public.tasks(consigned_at) where consigned_at is not null;

-- Recharge le schéma de l'API (sinon : « Could not find the 'consigned_at' column … in the schema cache »).
notify pgrst, 'reload schema';
