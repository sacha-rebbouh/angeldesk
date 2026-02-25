// ============================================================================
// Live Coaching — Auto-Dismiss
// ============================================================================
// Detects when the BA addresses a coaching card topic during the call.
// Uses Haiku for semantic comparison (not keyword matching) to determine
// which active cards have been addressed by the BA's utterance.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { publishCardAddressed } from "@/lib/live/ably-server";

// ============================================================================
// TYPES
// ============================================================================

interface CoachingCard {
  id: string;
  type: string;
  content: string;
  suggestedQuestion: string | null;
}

interface AutoDismissLLMResponse {
  addressedCardIds: string[];
}

// ============================================================================
// AUTO-DISMISS SYSTEM PROMPT
// ============================================================================

const AUTO_DISMISS_SYSTEM_PROMPT = `Tu analyses si un Business Angel (BA) a abordé des sujets suggérés par des cartes de coaching pendant un appel live avec un fondateur.

On te donne :
1. Ce que le BA vient de dire
2. Une liste de cartes de coaching actives (avec leurs IDs)

Pour chaque carte, détermine si le BA a SUBSTANTIELLEMENT abordé le sujet :
- Une question similaire a été posée (même si formulée différemment)
- Le sujet de la contradiction a été mentionné
- L'information a été discutée
- Le point de négociation a été soulevé

Sois raisonnablement flexible dans la correspondance sémantique — le BA ne va pas répéter mot pour mot la suggestion.

Retourne un JSON : { "addressedCardIds": ["id1", "id2"] }
Si aucune carte n'a été adressée, retourne : { "addressedCardIds": [] }`;

// ============================================================================
// CHECK AUTO-DISMISS
// ============================================================================

/**
 * Given what the BA just said and the list of active coaching cards,
 * returns the IDs of cards that were addressed.
 *
 * Uses Haiku LLM for semantic comparison — not keyword matching — to detect
 * when the BA has substantively addressed a coaching suggestion.
 *
 * Returns empty array when:
 * - No active cards
 * - LLM determines no cards were addressed
 * - An error occurs (fail-safe: never dismiss cards by mistake)
 */
export async function checkAutoDismiss(
  baUtterance: string,
  activeCards: CoachingCard[]
): Promise<string[]> {
  // Early exit: no cards to check
  if (activeCards.length === 0) {
    return [];
  }

  // Early exit: empty utterance
  if (!baUtterance.trim()) {
    return [];
  }

  // Build the card list for the prompt
  const cardDescriptions = activeCards
    .map((card) => {
      const question = card.suggestedQuestion
        ? ` | Question suggérée : "${card.suggestedQuestion}"`
        : "";
      return `- ID: ${card.id} | Type: ${card.type} | Contenu: "${card.content}"${question}`;
    })
    .join("\n");

  const prompt = `## Ce que le BA vient de dire
"${baUtterance}"

## Cartes de coaching actives
${cardDescriptions}

Quelles cartes ont été substantiellement adressées par ce que le BA vient de dire ?`;

  try {
    const result = await runWithLLMContext(
      { agentName: "auto-dismiss" },
      () =>
        completeJSON<AutoDismissLLMResponse>(prompt, {
          model: "HAIKU",
          systemPrompt: AUTO_DISMISS_SYSTEM_PROMPT,
          maxTokens: 200,
          temperature: 0.2,
        })
    );

    const { addressedCardIds } = result.data;

    // Validate: only return IDs that actually exist in the active cards
    if (!Array.isArray(addressedCardIds)) {
      return [];
    }

    const validIds = new Set(activeCards.map((c) => c.id));
    return addressedCardIds.filter(
      (id) => typeof id === "string" && validIds.has(id)
    );
  } catch (error) {
    // Fail-safe: never auto-dismiss cards on error
    console.error("[auto-dismiss] LLM check failed:", error);
    return [];
  }
}

// ============================================================================
// MARK CARDS AS ADDRESSED
// ============================================================================

/**
 * Updates addressed cards in DB and broadcasts Ably events for real-time
 * UI updates on the BA's screen.
 */
export async function markCardsAsAddressed(
  sessionId: string,
  cardIds: string[]
): Promise<void> {
  if (cardIds.length === 0) return;

  const now = new Date();

  // Batch update all addressed cards in DB
  await prisma.coachingCard.updateMany({
    where: {
      id: { in: cardIds },
      sessionId,
      status: "active",
    },
    data: {
      status: "addressed",
      addressedAt: now,
      addressedBy: "auto",
    },
  });

  // Publish Ably events for each card (parallel)
  await Promise.all(
    cardIds.map((cardId) =>
      publishCardAddressed(sessionId, {
        cardId,
        addressedBy: "auto",
      })
    )
  );
}
