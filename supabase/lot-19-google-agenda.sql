-- Lot 19 : import des réunions depuis Google Agenda.
-- google_event_id : identifiant de l'événement importé (ou complété), pour ne jamais l'importer deux fois.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 19.
-- Idempotent : peut être relancé sans risque.

alter table public.tasks add column if not exists google_event_id text;
create index if not exists tasks_google_event_id_idx on public.tasks(google_event_id);

-- Recharge le schéma de l'API (sinon : « Could not find the 'google_event_id' column … in the schema cache »).
notify pgrst, 'reload schema';
