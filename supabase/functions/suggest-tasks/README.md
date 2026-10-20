# Fonction `suggest-tasks` (Lot 26)

Lit le bloc-notes de la semaine avec Claude (Anthropic) et propose des tâches : à créer dans le sas, ou déjà dans le sas et à planifier. L'application montre les propositions et rien n'est créé sans validation.

La clé Anthropic reste côté Supabase (secret de la fonction) : elle n'apparaît jamais dans le site. Seul un utilisateur connecté à l'application peut appeler la fonction.

## Installation (une fois)

1. **Clé API Anthropic** : sur <https://console.anthropic.com>, *API Keys* > *Create Key*. Copie la clé (`sk-ant-…`).
2. **Déploiement**, au choix :
   - **Tableau de bord Supabase** : *Edge Functions* > *Deploy a new function* > *Via Editor*. Nomme la fonction `suggest-tasks`, colle le contenu de `index.ts`, puis *Deploy*. Ensuite *Edge Functions* > *Secrets* : ajoute `ANTHROPIC_API_KEY` avec la clé.
   - **Supabase CLI**, depuis la racine du dépôt :
     ```sh
     supabase login
     supabase link --project-ref eubxxvoiudlopkimysaj
     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
     supabase functions deploy suggest-tasks
     ```
3. Laisse **« Verify JWT »** activé (réglage par défaut).

## Réglages

En tête de `index.ts` :

- `MODEL` : `claude-opus-5-5` ;
- `EFFORT` : `medium` par défaut. `low` répond plus vite, `high` analyse plus finement.

En cas de refus du modèle principal, la requête est rejouée automatiquement sur le modèle de repli recommandé par Anthropic (`fallbacks: "default"`).

## Coût

Chaque clic sur « Suggérer des tâches » envoie la note, la liste des projets et les tâches actives : comptez quelques centimes par analyse. La consommation se suit sur la console Anthropic (*Usage*).
