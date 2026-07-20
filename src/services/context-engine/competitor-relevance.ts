/**
 * Competitor Relevance — check de pertinence catégorie avant restitution.
 *
 * Audit HelloCoco 2026-07-20, chantier 2 : les connecteurs statiques
 * (seedtable, french-tech, incubators) matchent par mot-clé de SECTEUR et
 * hardcodent `overlap` sans jamais l'évaluer → Dataiku / Mistral AI /
 * Ankorstore restitués comme « concurrents » d'un produit d'agents
 * conversationnels e-commerce, puis élevés en contradiction / red flag
 * CRITICAL par les agents aval.
 *
 * Règle (doctrine « zéro faux positif > exhaustivité ») : toute entité
 * candidate passe un juge LLM léger qui classe l'overlap CATÉGORIE avec
 * justification. Seuls `direct` et `partial` avec justification non vide
 * sont restitués comme concurrents ; `adjacent`/`none`/doute/justification
 * absente = suppression, pas de « peut-être ». Fail-closed intégral : juge
 * indisponible ou réponse inexploitable → AUCUN concurrent restitué (une
 * liste vide et explicite vaut mieux qu'une liste non évaluée).
 */
import { postOpenRouterCompletion } from "./connectors/web-search";
import type { Competitor, CompetitiveLandscape, ConnectorQuery } from "./types";

const JUDGE_MODEL = "openai/gpt-4o-mini";
/** Cap d'entrée du juge — au-delà, le surplus est loggé (pas de cap silencieux). */
export const MAX_JUDGED_COMPETITORS = 30;

export interface RelevanceVerdict {
  name: string;
  overlap: "direct" | "partial" | "adjacent" | "none";
  justification: string;
}

const VALID_OVERLAPS = new Set(["direct", "partial", "adjacent", "none"]);
/** Overlaps restitués comme « concurrents » — adjacent/none = suppression. */
const KEPT_OVERLAPS = new Set(["direct", "partial"]);

/**
 * Parse la réponse JSON du juge. Retourne null si le contenu est
 * inexploitable (l'appelant est alors fail-closed : aucun concurrent restitué).
 */
export function parseRelevanceVerdicts(content: string): RelevanceVerdict[] | null {
  const stripped = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const verdicts: RelevanceVerdict[] = [];
  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as RelevanceVerdict).name !== "string" ||
      !VALID_OVERLAPS.has((entry as RelevanceVerdict).overlap)
    ) {
      return null;
    }
    verdicts.push({
      name: (entry as RelevanceVerdict).name,
      overlap: (entry as RelevanceVerdict).overlap,
      justification:
        typeof (entry as RelevanceVerdict).justification === "string"
          ? (entry as RelevanceVerdict).justification
          : "",
    });
  }
  return verdicts;
}

/**
 * Applique les verdicts du juge : garde direct/partial avec justification
 * NON VIDE, supprime adjacent/none. Un candidat sans verdict ou sans
 * justification est supprimé (fail-closed).
 */
export function applyRelevanceVerdicts(
  candidates: Competitor[],
  verdicts: RelevanceVerdict[]
): Competitor[] {
  const byName = new Map<string, RelevanceVerdict>();
  for (const v of verdicts) {
    byName.set(v.name.toLowerCase().trim(), v);
  }

  const kept: Competitor[] = [];
  for (const candidate of candidates) {
    const verdict = byName.get(candidate.name.toLowerCase().trim());
    if (!verdict || !KEPT_OVERLAPS.has(verdict.overlap)) continue;
    const justification = verdict.justification.trim();
    if (justification.length === 0) continue;
    kept.push({
      ...candidate,
      overlap: verdict.overlap as Competitor["overlap"],
      overlapJustification: justification,
    });
  }
  return kept;
}

/**
 * Sanitize au chargement d'un snapshot persisté : fail-closed — seuls les
 * concurrents porteurs d'une justification d'overlap sont gardés et la
 * concentration est supprimée tant qu'aucun calcul réel ne la produit.
 */
export function sanitizeLegacyCompetitiveLandscape(
  cl: CompetitiveLandscape | undefined | null
): CompetitiveLandscape | undefined {
  if (!cl) return undefined;
  const competitors = (cl.competitors ?? []).filter(
    (c) => typeof c.overlapJustification === "string" && c.overlapJustification.trim().length > 0
  );
  const sanitized: CompetitiveLandscape = { ...cl, competitors };
  delete sanitized.marketConcentration;
  return sanitized;
}

function buildJudgePrompt(candidates: Competitor[], query: ConnectorQuery): string {
  const dealLines = [
    `- Company: ${query.companyName ?? "Unknown"}`,
    query.productDescription ? `- Product: ${query.productDescription}` : null,
    query.coreValueProposition ? `- Value proposition: ${query.coreValueProposition}` : null,
    query.useCases && query.useCases.length > 0
      ? `- Use cases: ${query.useCases.join("; ")}`
      : null,
    query.sector ? `- Sector: ${query.sector}` : null,
  ].filter((l): l is string => l !== null);

  const candidateLines = candidates.map(
    (c, i) =>
      `${i + 1}. ${c.name} — ${c.positioning || c.description || "no description"} (source: ${c.source?.name ?? "unknown"})`
  );

  return `You are a category-relevance judge for competitive analysis.

The analyzed company:
${dealLines.join("\n")}

Candidate "competitors" below come from noisy data sources. Some are only same-sector companies or technology suppliers, NOT actual competitors.

Candidates:
${candidateLines.join("\n")}

For EACH candidate, classify the CATEGORY overlap with the analyzed company's product:
- "direct": same product category, competing for the same buyer need
- "partial": clear overlap on part of the use cases, same budget
- "adjacent": nearby space, NOT competing for the same budget today
- "none": not a competitor (different category, or a technology/API supplier)

Rules:
- A technology/API supplier (e.g. a foundation-model provider) is "none" — a technology substitute is not a category competitor.
- Being in the same broad sector (e.g. "AI") is NOT enough for direct/partial.
- If you are uncertain, classify "none" — a false competitor is worse than a missed one.
- "justification": one short sentence citing the concrete use-case overlap (or its absence).

Return STRICT JSON only, no prose, exactly one entry per candidate:
[{"name": "<candidate name>", "overlap": "direct|partial|adjacent|none", "justification": "..."}]`;
}

/**
 * Point d'entrée : filtre les concurrents candidats par pertinence catégorie.
 * Juge LLM léger (1 appel), fail-closed si indisponible.
 */
export async function filterCompetitorsByCategoryRelevance(
  candidates: Competitor[],
  query: ConnectorQuery
): Promise<Competitor[]> {
  if (candidates.length === 0) return candidates;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log(
      "[CompetitorRelevance] No OPENROUTER_API_KEY — fail-closed, no competitor restituted without category-relevance judgment"
    );
    return [];
  }

  const judged = candidates.slice(0, MAX_JUDGED_COMPETITORS);
  if (candidates.length > MAX_JUDGED_COMPETITORS) {
    console.log(
      `[CompetitorRelevance] ${candidates.length - MAX_JUDGED_COMPETITORS} candidates beyond cap ${MAX_JUDGED_COMPETITORS} dropped before judging`
    );
  }

  try {
    const data = await postOpenRouterCompletion(apiKey, "Angel Desk Competitor Relevance", {
      model: JUDGE_MODEL,
      messages: [{ role: "user", content: buildJudgePrompt(judged, query) }],
      temperature: 0,
      max_tokens: 1800,
    });

    const content = data.choices?.[0]?.message?.content ?? "";
    const verdicts = parseRelevanceVerdicts(content);
    if (!verdicts) {
      console.error(
        "[CompetitorRelevance] Unparseable judge response — fail-closed, no competitor restituted"
      );
      return [];
    }

    const kept = applyRelevanceVerdicts(judged, verdicts);
    console.log(
      `[CompetitorRelevance] ${kept.length}/${judged.length} candidates kept as category-relevant competitors`
    );
    return kept;
  } catch (error) {
    console.error("[CompetitorRelevance] Judge failed — fail-closed, no competitor restituted:", error);
    return [];
  }
}
