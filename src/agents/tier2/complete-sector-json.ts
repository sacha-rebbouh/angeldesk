import type { ZodType } from "zod";
import { completeJSON, type CompletionOptions } from "@/services/openrouter/router";

/**
 * Appel LLM JSON robuste pour les experts sectoriels (Tier 2).
 *
 * Remplace le pattern fragile dupliqué dans ~21 experts :
 *   `complete(prompt, opts)` (SANS response_format) + `JSON.parse(extractFirstJSON(response.content))`.
 * Si le modèle répond en prose, `extractFirstJSON` ne trouve aucune accolade → `JSON.parse` lève →
 * l'agent échoue (post-mortem Avekapeti : foodtech-expert, `Unexpected token 'V', "Voici l'an"...`).
 *
 * Délègue à `completeJSON` (router) qui fait déjà tout proprement : force `response_format:
 * json_object` (verrou fiable côté API), retry adaptatif (« réponds en JSON only » injecté sur
 * parse-fail), répare le JSON tronqué, fallback modèle cross-family. Puis valide contre le schema
 * Zod. Sur échec Zod STRICT (le JSON est valide mais la forme dévie), renvoie le raw avec
 * `valid:false` — l'appelant applique ses defaults/capping comme avant. Un vrai échec JSON
 * (après tous les retries de completeJSON) LÈVE → l'appelant retombe dans son `catch` habituel.
 */
export async function completeSectorJSON<T>(
  prompt: string,
  options: CompletionOptions,
  schema: ZodType<T>,
): Promise<{ data: T; valid: boolean; cost: number }> {
  const res = await completeJSON<unknown>(prompt, options);
  const parsed = schema.safeParse(res.data);
  if (parsed.success) {
    return { data: parsed.data, valid: true, cost: res.cost };
  }
  return { data: res.data as T, valid: false, cost: res.cost };
}
