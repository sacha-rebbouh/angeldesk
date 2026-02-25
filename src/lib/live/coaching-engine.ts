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
import type {
  CoachingInput,
  CoachingResponse,
  CoachingCardType,
  CardPriority,
} from "@/lib/live/types";

// ============================================================================
// TRANSCRIPT SANITIZATION — strip prompt injection delimiters from user text
// ============================================================================

const MAX_UTTERANCE_LENGTH = 2000;

/**
 * Sanitize transcript text before injecting into LLM prompts.
 * Strips common prompt injection delimiters and enforces max length.
 * This is lighter than the full sanitizeForLLM (which throws on suspicious
 * patterns) because transcript text may legitimately contain flagged phrases.
 */
function sanitizeTranscriptText(text: string): string {
  return text
    .replace(/```/g, "")
    .replace(/<\/?system>/gi, "")
    .replace(/<\/?user>/gi, "")
    .replace(/<\/?assistant>/gi, "")
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .slice(0, MAX_UTTERANCE_LENGTH);
}

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

## Types de cartes
- \`contradiction\` : incohérence entre ce qui vient d'être dit et les données de l'analyse. CITE les deux chiffres.
- \`negotiation\` : le fondateur vient de mentionner un chiffre → compare au benchmark de l'analyse.
- \`question\` : question de suivi DIRECTEMENT liée à ce qui vient d'être dit.
- \`new_info\` : info significative pas couverte par l'analyse existante.

## Priorité
- \`high\` : contradiction flagrante, chiffre aberrant, info critique
- \`medium\` : question pertinente, point d'approfondissement
- \`low\` : nuance, contexte additionnel

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
  const prompt = buildCoachingPrompt(input);

  // 5-second hard timeout via Promise.race — completeJSON does not support
  // AbortController signals, so we race the LLM call against a timer.
  // If the timer wins, the LLM call continues in the background but its
  // result is discarded.
  const TIMEOUT_MS = 5_000;

  try {
    const timeoutPromise = new Promise<"TIMEOUT">((resolve) =>
      setTimeout(() => resolve("TIMEOUT"), TIMEOUT_MS)
    );

    const llmPromise = runWithLLMContext(
      { agentName: "coaching-engine" },
      () =>
        completeJSON<CoachingResponse>(prompt, {
          model: "SONNET",
          systemPrompt: COACHING_SYSTEM_PROMPT,
          maxTokens: 500,
          temperature: 0.4,
        })
    );

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
