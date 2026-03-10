// ============================================================================
// Live Coaching — Coaching Engine
// ============================================================================
// Generates real-time coaching suggestions during BA/founder calls.
// Fed with deal context + transcript, outputs structured coaching cards.
//
// Latency constraint: 5 s hard timeout — returns { shouldRespond: false }
// on timeout rather than blocking the live coaching pipeline.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { serializeContext } from "@/lib/live/context-compiler";
import { getVisualContextWithFallback } from "@/lib/live/visual-processor";
import type {
  CoachingInput,
  CoachingResponse,
  CoachingCardType,
  CardPriority,
} from "@/lib/live/types";
import { sanitizeTranscriptText } from "@/lib/live/sanitize";

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const COACHING_SYSTEM_PROMPT = `Tu es un coach live pour un Business Angel (BA) pendant un appel avec un fondateur de startup.

## RÈGLE N°1 — RÉACTIVITÉ
Ta carte DOIT être une réaction DIRECTE à ce qui vient d'être dit (l'utterance en cours).
- Tu ne génères JAMAIS de carte sur un sujet qui n'a pas été mentionné dans l'utterance.
- Le contexte deal sert UNIQUEMENT de référence pour enrichir ta réaction (benchmark, contradiction, etc.).
- Si l'utterance parle de valorisation → ta carte parle de valorisation.
- Si l'utterance parle d'équipe → ta carte parle d'équipe.
- INTERDIT : générer une carte sur l'équipe quand l'utterance parle de finance.

## RÈGLE N°2 — POSITIONNEMENT
Tu ANALYSES, tu ne DÉCIDES JAMAIS. Ton analytique, factuel, concis.
JAMAIS : "investir", "rejeter", "passer", "dealbreaker".

## RÈGLE N°3 — CONTEXTE VISUEL
Si un screen share est actif, tu as accès aux données extraites de l'écran partagé.
- Utilise ces données pour enrichir tes réactions (chiffres visibles vs analyse, contradictions visuelles).
- Si le fondateur dit "comme vous le voyez sur cette slide" → réagis aux données visuelles ET à l'utterance.
- Les contradictions visuelles (slide vs analyse) sont des triggers de carte \`contradiction\` prioritaires.

## Types de cartes
- \`contradiction\` : incohérence entre ce qui vient d'être dit/montré et les données de l'analyse. CITE les deux chiffres.
- \`negotiation\` : le fondateur vient de mentionner un chiffre → compare au benchmark de l'analyse.
- \`question\` : question de suivi DIRECTEMENT liée à ce qui vient d'être dit/montré.
- \`new_info\` : info significative pas couverte par l'analyse existante.

## Priorité
- \`high\` : contradiction flagrante, chiffre aberrant, info critique
- \`medium\` : question pertinente, point d'approfondissement
- \`low\` : nuance, contexte additionnel

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.

## Format JSON
{ "shouldRespond": boolean, "type": "...", "priority": "...", "content": "1-2 phrases MAX", "reference": "source dans l'analyse", "suggestedQuestion": "question à poser" | null }

## Règles
1. \`shouldRespond: false\` si l'utterance est du small talk, un filler, ou déjà couverte.
2. Le content fait 1-2 phrases MAX. Le BA jette un oeil rapide.
3. Ne répète JAMAIS une carte déjà émise.
4. Quand \`shouldRespond: false\`, les autres champs = chaînes vides.`;

// ============================================================================
// COACHING RESPONSE FALLBACK
// ============================================================================

const NO_RESPONSE: CoachingResponse = {
  shouldRespond: false,
  type: "question",
  priority: "low",
  content: "",
  reference: "",
  suggestedQuestion: null,
};

// ============================================================================
// PROMPT BUILDER
// ============================================================================

/**
 * Assembles the user-facing prompt from deal context, transcript, current
 * utterance, and previous suggestions.
 */
function buildCoachingPrompt(input: CoachingInput): string {
  const sections: string[] = [];

  // ═══ UTTERANCE EN PREMIER — c'est le sujet principal ═══
  const currentRole =
    input.currentUtterance.role === "ba"
      ? "BA"
      : input.currentUtterance.speaker;
  sections.push("# CE QUI VIENT D'ÊTRE DIT (réagis à ça)");
  sections.push(
    `[${currentRole}] ${sanitizeTranscriptText(input.currentUtterance.text)}`
  );
  sections.push(`Classification : ${input.currentUtterance.classification}`);
  sections.push("");

  // ═══ Contexte visuel (screen share actif) ═══
  // Note: visualContext is pre-fetched by generateCoachingSuggestion (with DB fallback)
  const visualCtx = input.visualContext ?? null;

  const hasVisualData = visualCtx && (
    visualCtx.currentSlide ||
    visualCtx.keyDataFromVisual.length > 0 ||
    visualCtx.visualContradictions.length > 0
  );
  if (hasVisualData) {
    sections.push("# CE QUI EST AFFICHÉ À L'ÉCRAN (screen share actif)");
    if (visualCtx.currentSlide) {
      sections.push(visualCtx.currentSlide);
    }
    if (visualCtx.keyDataFromVisual.length > 0) {
      sections.push("Données extraites du visuel :");
      for (const d of visualCtx.keyDataFromVisual) {
        sections.push(`- ${d}`);
      }
    }
    if (visualCtx.visualContradictions.length > 0) {
      sections.push("CONTRADICTIONS VISUELLES :");
      for (const c of visualCtx.visualContradictions) {
        sections.push(`- ${c}`);
      }
    }
    if (visualCtx.recentSlideHistory.length > 0) {
      sections.push("Slides précédentes montrées :");
      for (const s of visualCtx.recentSlideHistory) {
        sections.push(`- ${s}`);
      }
    }
    sections.push("");
  }

  // ═══ Transcription récente pour le contexte conversationnel ═══
  if (input.recentTranscript.length > 0) {
    sections.push("# CONVERSATION RÉCENTE");
    for (const u of input.recentTranscript) {
      const roleLabel = u.role === "ba" ? "BA" : u.speaker;
      sections.push(`[${roleLabel}] ${sanitizeTranscriptText(u.text)}`);
    }
    sections.push("");
  }

  // ═══ Cartes déjà émises (ne pas répéter) ═══
  if (input.previousSuggestions.length > 0) {
    sections.push("# CARTES DÉJÀ ÉMISES (ne pas répéter)");
    for (const s of input.previousSuggestions) {
      sections.push(`- [${s.type}] ${s.content}`);
    }
    sections.push("");
  }

  // ═══ Sujets abordés ═══
  if (input.addressedTopics.length > 0) {
    sections.push("# SUJETS DÉJÀ TRAITÉS");
    sections.push(input.addressedTopics.join(", "));
    sections.push("");
  }

  // ═══ Contexte deal (RÉFÉRENCE UNIQUEMENT) ═══
  sections.push("# CONTEXTE DEAL (référence — utilise UNIQUEMENT pour enrichir ta réaction à l'utterance ci-dessus)");
  sections.push(serializeContext(input.dealContext));

  // ═══ Instruction finale ═══
  sections.push("");
  sections.push("RAPPEL : ta carte DOIT être une réaction directe à l'utterance ci-dessus. Réponds en JSON.");

  return sections.join("\n");
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate a coaching suggestion for a given utterance in the context of the
 * deal analysis and ongoing conversation.
 *
 * Returns `{ shouldRespond: false }` when:
 * - The LLM decides the utterance doesn't warrant a card
 * - The 5-second timeout is exceeded
 * - An error occurs (fail-safe: never block the pipeline)
 */
export async function generateCoachingSuggestion(
  input: CoachingInput
): Promise<CoachingResponse> {
  // Pre-fetch visual context with DB fallback (for Vercel serverless cold starts)
  if (!input.visualContext && input.sessionId) {
    input.visualContext = (await getVisualContextWithFallback(input.sessionId)) ?? undefined;
  }

  const prompt = buildCoachingPrompt(input);

  // Hard timeout via Promise.race — completeJSON does not support
  // AbortController signals, so we race the LLM call against a timer.
  // If the timer wins, the LLM call continues in the background but its
  // result is discarded.
  // Using HAIKU for speed (~1-2s vs ~6s for Sonnet) — critical for live coaching latency.
  const TIMEOUT_MS = 8_000;

  try {
    const timeoutPromise = new Promise<"TIMEOUT">((resolve) =>
      setTimeout(() => resolve("TIMEOUT"), TIMEOUT_MS)
    );

    const llmPromise = runWithLLMContext(
      { agentName: "coaching-engine" },
      () =>
        completeJSON<CoachingResponse>(prompt, {
          model: "HAIKU",
          systemPrompt: COACHING_SYSTEM_PROMPT,
          maxTokens: 300,
          temperature: 0.3,
        })
    );

    // Prevent unhandled rejection if timeout wins and LLM fails after
    llmPromise.catch(() => {});

    const raceResult = await Promise.race([llmPromise, timeoutPromise]);

    if (raceResult === "TIMEOUT") {
      console.warn("[coaching-engine] 5s timeout exceeded. Skipping card.");
      return NO_RESPONSE;
    }

    const response = raceResult.data;

    // Validate response shape
    if (!response.shouldRespond) {
      return NO_RESPONSE;
    }

    // Validate type
    const validTypes: CoachingCardType[] = [
      "question",
      "contradiction",
      "new_info",
      "negotiation",
    ];
    if (!validTypes.includes(response.type)) {
      console.warn(
        `[coaching-engine] LLM returned unknown card type: "${response.type}". Discarding.`
      );
      return NO_RESPONSE;
    }

    // Validate priority
    const validPriorities: CardPriority[] = ["high", "medium", "low"];
    if (!validPriorities.includes(response.priority)) {
      response.priority = "medium";
    }

    // Ensure content is not empty when shouldRespond is true
    if (!response.content || response.content.trim().length === 0) {
      return NO_RESPONSE;
    }

    return {
      shouldRespond: true,
      type: response.type,
      priority: response.priority,
      content: response.content.trim(),
      reference: response.reference?.trim() ?? "",
      suggestedQuestion: response.suggestedQuestion?.trim() || null,
    };
  } catch (error) {
    // LLM failure — fail-safe: never block the pipeline
    console.error("[coaching-engine] Generation failed:", error);
    return NO_RESPONSE;
  }
}

// ============================================================================
// TRANSCRIPT BUFFER
// ============================================================================

interface TranscriptChunk {
  id: string;
  speaker: string;
  speakerRole: string;
  text: string;
  classification: string | null;
  timestampStart: number;
  timestampEnd: number;
}

/**
 * Fetches the last N significant utterances from DB for a given session.
 * Excludes small_talk and filler classifications to keep the buffer
 * focused on substantive conversation.
 */
export async function getTranscriptBuffer(
  sessionId: string,
  limit: number
): Promise<TranscriptChunk[]> {
  const chunks = await prisma.transcriptChunk.findMany({
    where: {
      sessionId,
      isFinal: true,
      classification: {
        notIn: ["small_talk", "filler"],
      },
    },
    orderBy: { timestampStart: "desc" },
    take: limit,
    select: {
      id: true,
      speaker: true,
      speakerRole: true,
      text: true,
      classification: true,
      timestampStart: true,
      timestampEnd: true,
    },
  });

  // Return in chronological order (oldest first)
  return chunks.reverse();
}
