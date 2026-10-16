-- Lot 18 : ordre manuel par glisser-déposer.
-- tasks.group_rank : rang du conteneur client dans sa colonne de jour (le plus petit rang des tâches du
--   conteneur fait foi ; NULL = ordre par défaut : réunion la plus tôt, puis ordre de création).
-- projects.sas_position : position du dossier dans le sas (NULL = après les dossiers classés).
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 18.
-- Idempotent : peut être relancé sans risque.

alter table public.tasks add column if not exists group_rank integer;
alter table public.projects add column if not exists sas_position integer;

-- Recharge le schéma de l'API.
notify pgrst, 'reload schema';
