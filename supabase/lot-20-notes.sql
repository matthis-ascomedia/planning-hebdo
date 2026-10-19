-- Lot 20 : un commentaire peut être une simple note (sans case « traité », jamais compté comme en attente).
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 20.
-- Idempotent : peut être relancé sans risque. Les commentaires existants restent « à traiter ».

alter table public.task_comments add column if not exists is_note boolean not null default false;

-- Recharge le schéma de l'API (sinon : « Could not find the 'is_note' column … in the schema cache »).
notify pgrst, 'reload schema';
