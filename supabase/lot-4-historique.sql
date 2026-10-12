-- Lot 4 : historique du temps passé.
-- « Nouvelle Semaine » n'efface plus les tâches terminées : elles reçoivent une date d'archivage
-- (archived_at) et sortent du planning, tout en restant comptées dans le temps passé du projet.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 4.
-- Idempotent.

alter table public.tasks add column if not exists archived_at timestamptz;
create index if not exists tasks_archived_at_idx on public.tasks(archived_at);
