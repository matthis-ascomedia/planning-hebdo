// Lot 26 : suggestions de tâches à partir du bloc-notes de la semaine (Supabase Edge Function, Deno).
// Reçoit la note et l'état du planning (projets, tâches actives), demande à Claude des propositions au format
// JSON imposé (structured outputs) et les renvoie : { suggestions: [...] }. L'application les vérifie avant
// de les proposer (logic.js : reviewSuggestions). Déploiement : voir README.md dans ce dossier.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium"; // « low » répond plus vite, « high » réfléchit davantage
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const MAX_NOTE = 20000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (error: string, status: number) => json({ error }, status);

// Format de réponse imposé : tous les champs sont toujours présents (chaîne vide = sans objet).
const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["new_task", "plan_existing"] },
          project_id: { type: "string", description: "id d'un projet de la liste, ou \"\" si aucun ne correspond" },
          new_client: { type: "string", description: "client du projet à créer quand project_id est vide, sinon \"\"" },
          new_project: { type: "string", description: "nom du projet à créer quand project_id est vide, sinon \"\"" },
          task_id: { type: "string", description: "id de la tâche du sas à planifier (plan_existing), sinon \"\"" },
          task_name: { type: "string" },
          estimated_hours: { type: "number" },
          day: { type: "string", enum: ["", ...DAYS] },
          note_excerpt: { type: "string" },
          reason: { type: "string" },
        },
        required: ["kind", "project_id", "new_client", "new_project", "task_id", "task_name", "estimated_hours", "day", "note_excerpt", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

const SYSTEM = `Tu aides une personne qui gère les projets de ses clients à préparer sa semaine de travail.
En début de semaine, elle écrit un bloc-notes libre : les projets sur lesquels elle prévoit de travailler et, souvent, ce qu'il y a à faire. Tu en tires les tâches à créer ou à planifier dans son planning hebdomadaire (du lundi au vendredi). Elle valide ensuite chaque suggestion une par une.

Tu reçois la liste de ses projets (en cours, puis archivés), ses tâches actives (day = jour du planning, ou "sas" pour une tâche en attente, pas encore planifiée) et la note.

Règles :
- Une suggestion par action concrète que la note mentionne (maquetter, envoyer, relancer, intégrer, préparer…). N'invente pas de tâche que la note n'évoque pas, et ignore ce qui est barré ou marqué comme fait (✓, [x], « fait »).
- Une ligne qui cite un projet sans préciser d'action : propose de planifier ses tâches déjà dans le sas ; s'il n'en a aucune, propose une seule tâche courte qui reprend le sens de la ligne.
- Rattache chaque tâche au bon projet (project_id) en tolérant les abréviations, les fautes et le seul nom du client quand il n'a qu'un projet en cours. Préfère un projet en cours à un projet archivé. Si aucun projet ne correspond, laisse project_id vide et remplis new_client et new_project.
- Si une tâche équivalente attend déjà dans le sas pour ce projet, utilise kind "plan_existing" avec son task_id au lieu d'en créer une nouvelle. Si elle est déjà planifiée sur un jour, ne la propose pas.
- day : le jour indiqué par la note (« lundi », « jeudi matin »…), sinon "".
- estimated_hours : la durée indiquée (« 2h », « une demi-journée » = 4, « une journée » = 7), sinon une estimation réaliste, par quarts d'heure.
- task_name : court, en français, à l'infinitif ou sous forme nominale, sans répéter le nom du client ni du projet.
- note_excerpt : le passage de la note qui justifie la suggestion, recopié tel quel et court.
- reason : vide le plus souvent ; une courte précision seulement si le rattachement au projet n'est pas évident.
- Aucune suggestion si la note ne contient rien d'exploitable.`;

type Input = {
  week_start?: unknown;
  note?: unknown;
  projects?: unknown;
  tasks?: unknown;
};

// Seul un utilisateur connecté de l'application peut consommer la clé API (la clé anon publique ne suffit pas).
async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!auth.startsWith("Bearer ") || !url) return false;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  return !!user?.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail("Méthode non autorisée.", 405);
  if (!(await isSignedIn(req))) return fail("Connexion requise : reconnecte-toi à l'application.", 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fail("Clé Anthropic absente : ajoute le secret ANTHROPIC_API_KEY à la fonction (voir README).", 500);

  const input: Input = await req.json().catch(() => ({}));
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  if (!note) return fail("La note est vide.", 400);
  if (note.length > MAX_NOTE || projects.length > 2000 || tasks.length > 3000) return fail("Note ou planning trop volumineux.", 413);
  const week = typeof input.week_start === "string" ? input.week_start : "";

  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // en cas de refus, la requête est rejouée sur le modèle de repli recommandé
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Projets (JSON) :\n${JSON.stringify(projects)}\n\nTâches actives (JSON) :\n${JSON.stringify(tasks)}\n\n`
          + `Bloc-notes de la semaine${week ? ` du lundi ${week}` : ""} :\n<note>\n${note}\n</note>`,
      }],
    });
    if (response.stop_reason === "refusal") return fail("L'IA n'a pas pu traiter cette note. Reformule-la puis réessaie.", 422);
    if (response.stop_reason === "max_tokens") return fail("Réponse de l'IA incomplète : raccourcis la note puis réessaie.", 502);
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const data = JSON.parse(text);
    return json({ suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [], model: response.model });
  } catch (error) {
    console.error(error);
    if (error instanceof Anthropic.AuthenticationError) return fail("Clé Anthropic refusée : vérifie le secret ANTHROPIC_API_KEY.", 502);
    if (error instanceof Anthropic.RateLimitError) return fail("Trop de demandes à l'IA pour le moment : réessaie dans une minute.", 503);
    if (error instanceof Anthropic.APIError) return fail(`Service d'IA indisponible (${error.status ?? "réseau"}) : réessaie plus tard.`, 502);
    if (error instanceof SyntaxError) return fail("Réponse de l'IA illisible : réessaie.", 502);
    return fail("Erreur inattendue pendant l'analyse de la note.", 500);
  }
});
