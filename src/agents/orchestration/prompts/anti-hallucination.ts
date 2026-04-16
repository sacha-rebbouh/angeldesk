/**
 * Anti-Hallucination Directives — Fallback LLM helper
 *
 * Source unique des 5 directives anti-hallucination obligatoires pour TOUS les
 * appels LLM (voir CLAUDE.md section "ANTI-HALLUCINATION — 5 DIRECTIVES OBLIGATOIRES").
 *
 * Les agents principaux (Tier 1/2/3/chat/board) passent par BaseAgent qui injecte
 * automatiquement ces directives via `buildFullSystemPrompt()`. Les appels LLM
 * "legacy" (fallbacks Zod, dedup, meta-eval) se font hors BaseAgent — ils doivent
 * importer ce module et concatener le texte au systemPrompt du fallback.
 */

const CONFIDENCE_THRESHOLD = `## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.`;

const ABSTENTION_PERMISSION = `## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.`;

const CITATION_DEMAND = `## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.`;

const SELF_AUDIT = `## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.`;

const STRUCTURED_UNCERTAINTY = `## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.`;

/**
 * Retourne les 5 directives anti-hallucination dans leur version complete.
 * A concatener au systemPrompt de TOUT appel LLM fallback (hors BaseAgent).
 */
export function getFiveAntiHallucinationDirectives(): string {
  return [
    CONFIDENCE_THRESHOLD,
    ABSTENTION_PERMISSION,
    CITATION_DEMAND,
    SELF_AUDIT,
    STRUCTURED_UNCERTAINTY,
  ].join("\n\n");
}

/**
 * Construit un systemPrompt fallback complet: role + langue + 5 directives.
 * Usage:
 *   const systemPrompt = buildFallbackSystemPrompt(
 *     "Tu es un analyste qui dedoublonne les key points d'un board IA."
 *   );
 */
export function buildFallbackSystemPrompt(role: string, options: { language?: "fr" | "en" } = {}): string {
  const lang = options.language ?? "fr";
  const languageLine = lang === "fr" ? "LANGUE: Francais." : "LANGUAGE: English.";
  return `${role.trim()}\n\n${languageLine}\n\n${getFiveAntiHallucinationDirectives()}`;
}
