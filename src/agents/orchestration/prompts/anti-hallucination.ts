/**
 * Anti-Hallucination Directives — Evidence Gate (Phase A v12)
 *
 * Source unique des directives anti-hallucination obligatoires pour TOUS les
 * appels LLM hors BaseAgent.
 *
 * Refonte Phase A slice A9-helpers (D4 verrouillé) : la directive historique
 * de seuil d'auto-confiance est SUPPRIMÉE — elle reposait sur une auto-
 * confiance déclarée du modèle, contraire à la doctrine §5 (CLAUDE.md,
 * reference.yaml §19) et au gate de preuve structuré §6-bis du plan Phase A.
 *
 * Le nouveau contrat — gate de preuve structuré — exige :
 *  - n'affirmer que ce qui est supporté par une source, une observation,
 *    ou une inférence explicitement marquée ;
 *  - en l'absence de preuve, retourner unknown / missing_evidence /
 *    open_question (ou équivalent typé par l'agent) plutôt qu'une
 *    affirmation auto-confiante ;
 *  - marquer toute inférence comme telle ;
 *  - exposer les contradictions entre sources, pas les masquer ;
 *  - faire un self-audit final sur la qualité de preuve, pas sur
 *    l'auto-confiance ;
 *  - ne jamais utiliser une auto-confiance LLM comme vérité, score
 *    décisionnel ou solidité des preuves.
 *
 * Les agents principaux (Tier 1/2/3/chat/board) passent par BaseAgent qui
 * injecte automatiquement les directives via `buildFullSystemPrompt()`.
 * Les appels LLM "fallback" (Zod fallbacks, dedup, meta-eval) se font hors
 * BaseAgent — ils doivent importer ce module et concaténer le texte au
 * systemPrompt du fallback.
 *
 * Le nom de la fonction `getFiveAntiHallucinationDirectives` est conservé
 * pour ne pas casser ses 2 consumers actuels (fact-extractor.ts:1135 et
 * board-orchestrator.ts:1232). Elle retourne désormais 5 directives gate
 * de preuve, pas les 5 directives historiques basées sur l'auto-confiance.
 */

const EVIDENCE_BASED_ASSERTION = `## Anti-Hallucination Directive — Evidence-Based Assertion
Do not assert anything that is not supported by either: (a) a cited source (document, slide, benchmark, agent output, dataset), (b) a direct observation in the provided context, or (c) an inference explicitly marked as such.
Auto-confidence (e.g. "I am 90% sure", "I think this is correct") is NOT evidence and is NOT acceptable as a basis for an assertion.
Every factual claim must be traceable to one of (a), (b), or (c).`;

const MISSING_EVIDENCE_HANDLING = `## Anti-Hallucination Directive — Missing Evidence Handling
When the evidence required to answer is missing, ambiguous, or contradictory, do NOT fabricate a confident answer.
Instead, return a structured uncertainty marker appropriate to the agent's contract:
- "unknown" / "missing_evidence" / "open_question" / "insufficient_data" (or equivalent typed value the agent's schema expects)
- a [UNCERTAIN] tag with a brief reason on the affected claim
Returning a typed unknown is the correct outcome when evidence is missing. It is never penalised here.`;

const INFERENCE_MARKING = `## Anti-Hallucination Directive — Inference Marking
If a claim is not directly observed or sourced but is inferred from the available evidence, mark it explicitly as an inference:
- Use [INFERRED] or "inferred from <X>" in the claim
- Name the basis of the inference (which source, which observation, which pattern)
- Do not present inferences as direct observations or as sourced facts
This applies even when the inference seems obvious. The reader needs to distinguish "verified" from "reasoned from partial evidence".`;

const CONTRADICTION_SURFACING = `## Anti-Hallucination Directive — Contradiction Surfacing
When the sources, claims, or signals available to you disagree (deck vs. founder declarations, two documents giving different numbers, two agents reaching opposite conclusions), do NOT silently pick one and present it as fact.
Instead:
- Surface the contradiction explicitly in your response
- Name the disagreeing sources
- Describe the nature of the disagreement
- Let the consumer (UI / downstream agent / investor) decide how to interpret
Suppressing a contradiction to deliver a clean answer is a hallucination by omission.`;

const SELF_AUDIT_EVIDENCE = `## Anti-Hallucination Directive — Evidence Self-Audit
After completing your response, audit EVIDENCE QUALITY (not auto-confidence):
1. Identify the 3 claims in your response with the WEAKEST evidence support (least direct source, most inference, most ambiguous data)
2. For each, name explicitly what evidence is missing and what could be wrong
3. Confirm that every inference is marked [INFERRED] and every uncertain claim is marked [UNCERTAIN]
4. Confirm that no contradiction in the input data was silently suppressed
The metric here is evidence quality, not declared self-confidence. Do not output any self-confidence score (no qualitative grade, no numeric percentage). Auto-confidence is not evidence.`;

/**
 * Retourne les 5 directives anti-hallucination Phase A v12 (gate de preuve structuré).
 * À concatener au systemPrompt de TOUT appel LLM fallback (hors BaseAgent).
 *
 * Le nom historique `getFiveAntiHallucinationDirectives` est conservé pour
 * compat de signature avec les 2 consumers (fact-extractor + board-orchestrator).
 * Le contenu retourné a été refondu Phase A : auto-confiance LLM supprimée,
 * gate de preuve structuré substitué (cf. en-tête du fichier).
 */
export function getFiveAntiHallucinationDirectives(): string {
  return [
    EVIDENCE_BASED_ASSERTION,
    MISSING_EVIDENCE_HANDLING,
    INFERENCE_MARKING,
    CONTRADICTION_SURFACING,
    SELF_AUDIT_EVIDENCE,
  ].join("\n\n");
}

/**
 * Construit un systemPrompt fallback complet: role + langue + 5 directives gate de preuve.
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
