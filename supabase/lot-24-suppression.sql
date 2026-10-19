-- Lot 24 : suppression définitive d'un projet archivé (et de ses tâches) depuis l'onglet Archives.
-- Jusqu'ici, tasks.project_id n'avait pas de « on delete cascade » : supprimer un projet qui a des tâches était refusé.
-- Désormais, supprimer un projet supprime aussi ses tâches (actives et archivées) ; leurs commentaires partent avec elles
-- (task_comments : cascade déjà en place), de même que ses liens (project_links) et ses séries récurrentes (recurrences).
-- Les semaines closes (public.weeks) gardent leur instantané chiffré.
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de déployer la version applicative du Lot 24.
-- Idempotent : peut être relancé sans risque.

do $$
declare
  c record;
begin
  -- Retire la clé étrangère tasks -> projects quel que soit son nom, puis la recrée avec la cascade.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and confrelid = 'public.projects'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;

  alter table public.tasks
    add constraint tasks_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;
end $$;

-- Recharge le schéma de l'API.
notify pgrst, 'reload schema';
