-- Lot 10 : commentaires de tâche (traités / non traités).
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 10.
-- Idempotent : peut être relancé sans risque.

-- 1. Commentaires : plusieurs par tâche, conservés quand la tâche est archivée
--    (supprimés seulement avec la tâche elle-même).
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_id_idx on public.task_comments(task_id);

-- 2. RLS (même modèle que les autres tables : réservé aux utilisateurs connectés)
alter table public.task_comments enable row level security;
revoke all on public.task_comments from anon;
grant select, insert, update, delete on public.task_comments to authenticated;

drop policy if exists "task_comments_all_authenticated" on public.task_comments;
create policy "task_comments_all_authenticated" on public.task_comments
  for all to authenticated using (true) with check (true);
