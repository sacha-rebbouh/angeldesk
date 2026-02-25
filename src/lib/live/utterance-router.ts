// ============================================================================
// Live Coaching — Utterance Router
// ============================================================================
// Classifies each transcript chunk to determine if it should trigger the
// coaching engine. Hybrid approach: regex first (O(1)), then LLM (Haiku)
// for ambiguous cases.
// ============================================================================

import type { SpeakerRole, UtteranceClassification } from "./types";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";

// ============================================================================
// REGEX PATTERNS — Fast-path classification (no LLM call)
// ============================================================================

/**
 * Filler patterns — short acknowledgements, hesitation markers.
 * Only matched when the utterance is < 5 words.
 */
export const FILLER_PATTERNS: RegExp[] = [
  // French fillers
  /^(oui|ouais|ok|okay|d'accord|exactement|euh|mm+|hmm+|voilà|absolument|effectivement|tout à fait|c'est ça|bien sûr|entendu|certes|bon)\.?$/i,
  // English fillers
  /^(yes|yeah|yep|ok|okay|sure|right|uh|um+|mhm+|exactly|i see|got it|alright|indeed)\.?$/i,
];

/**
 * Small talk patterns — greetings, weather, pleasantries, closings.
 * Matched regardless of word count.
 */
export const SMALL_TALK_PATTERNS: RegExp[] = [
  // French greetings & small talk
  /\b(bonjour|bonsoir|salut|comment allez[- ]vous|ça va|enchanté|ravi de vous (re)?rencontrer|bienvenue|au revoir|à bientôt|bonne (journée|soirée)|merci (beaucoup|bien)|je vous en prie)\b/i,
  // English greetings & small talk
  /\b(hello|hi there|hey|how are you|nice to meet you|welcome|goodbye|see you|have a (good|nice) (day|evening)|thank you (so much|very much)|you're welcome)\b/i,
  // Weather / generic pleasantries
  /\b(il fait (beau|froid|chaud)|quel temps|the weather|beautiful day)\b/i,
  // Meeting logistics
  /\b(vous m'entendez|can you hear me|on commence|shall we (start|begin)|je vous entends bien)\b/i,
];

// ============================================================================
// KEYWORD PATTERNS — Quick detection for obvious domain-specific cases
// ============================================================================

const FINANCIAL_PATTERN =
  /(\d[\d\s]*[kKmMbB€$£%]|\d[\d\s]*euros?|\d[\d\s]*dollars?|chiffre d'affaires|revenue|MRR|ARR|EBITDA|burn rate|runway|trésorerie|cash\s*flow|marge|margin|rentabilit|profitab)/i;

const COMPETITIVE_PATTERN =
  /\b(concurrent|compétiteur|competitor|concurrence|compétition|competition|parts? de marché|market share|par rapport à|compared to|versus|vs\.?)\b/i;

const NEGOTIATION_PATTERN =
  /\b(valorisation|valuation|levée|round|funding|série [A-Z]|series [A-Z]|ticket|dilution|pre[- ]money|post[- ]money|cap table|term\s*sheet|conditions|clauses?|liquidation preference|anti[- ]dilution|vesting)\b/i;

// ============================================================================
// CLASSIFICATION
// ============================================================================

interface ClassificationResult {
  classification: UtteranceClassification;
  confidence: number;
}

/**
 * Count words in a string (whitespace-separated tokens).
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Classify an utterance using a hybrid regex + LLM approach.
 *
 * Priority order:
 * 1. Short fillers (regex, < 5 words) → instant, confidence 1.0
 * 2. Small talk (regex) → instant, confidence 0.9
 * 3. Domain keywords (regex) → instant, confidence 0.8
 * 4. LLM classification (Haiku) → ~200ms, variable confidence
 */
export async function classifyUtterance(
  text: string,
  speakerRole: SpeakerRole
): Promise<ClassificationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { classification: "filler", confidence: 1.0 };
  }

  // ── Step 1: Short fillers (< 5 words + regex match) ──
  if (wordCount(trimmed) < 5) {
    for (const pattern of FILLER_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { classification: "filler", confidence: 1.0 };
      }
    }
  }

  // ── Step 2: Small talk (any length) ──
  for (const pattern of SMALL_TALK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { classification: "small_talk", confidence: 0.9 };
    }
  }

  // ── Step 3: Domain keyword detection ──
  if (FINANCIAL_PATTERN.test(trimmed)) {
    return { classification: "financial_claim", confidence: 0.8 };
  }
  if (COMPETITIVE_PATTERN.test(trimmed)) {
    return { classification: "competitive_claim", confidence: 0.8 };
  }
  if (NEGOTIATION_PATTERN.test(trimmed)) {
    return { classification: "negotiation_point", confidence: 0.8 };
  }

  // ── Step 4: LLM classification (Haiku) for ambiguous utterances ──
  return classifyWithLLM(trimmed, speakerRole);
}

// ============================================================================
// LLM CLASSIFICATION (Haiku)
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are a speech classifier for a live startup investment meeting between a Business Angel (BA) and founders.

Classify the given utterance into exactly ONE of these categories:
- financial_claim: mentions financial data, metrics, revenue, costs, funding, valuations
- competitive_claim: mentions competitors, market positioning, differentiation
- team_info: mentions team members, hires, expertise, experience, roles
- market_claim: mentions market size, growth, trends, customer segments, TAM/SAM/SOM
- tech_claim: mentions technology, product, features, architecture, IP, patents
- strategy_reveal: mentions strategy, roadmap, pivots, plans, vision, go-to-market
- negotiation_point: mentions deal terms, valuation, equity, conditions, legal terms
- question_response: a direct answer to a previously asked question
- small_talk: greetings, pleasantries, off-topic chatter
- filler: acknowledgements, hesitations, very short non-substantive responses

Respond with a JSON object: { "classification": "<category>", "confidence": <0.0-1.0> }

Rules:
- If the utterance contains substantive business information, prefer the specific domain category.
- "question_response" should only be used when the utterance is clearly answering a question, not when it introduces new information.
- When in doubt between two categories, pick the one with higher business relevance.
- Confidence should reflect how clearly the utterance fits the chosen category.`;

async function classifyWithLLM(
  text: string,
  speakerRole: SpeakerRole
): Promise<ClassificationResult> {
  try {
    const result = await runWithLLMContext(
      { agentName: "utterance-router" },
      () =>
        completeJSON<{ classification: UtteranceClassification; confidence: number }>(
          `Speaker role: ${speakerRole}\nUtterance: "${text}"`,
          {
            model: "HAIKU",
            systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
            maxTokens: 100,
            temperature: 0.1,
          }
        )
    );

    const { classification, confidence } = result.data;

    // Validate the classification is a known type
    const validTypes: UtteranceClassification[] = [
      "financial_claim",
      "competitive_claim",
      "team_info",
      "market_claim",
      "tech_claim",
      "strategy_reveal",
      "negotiation_point",
      "question_response",
      "small_talk",
      "filler",
    ];

    if (!validTypes.includes(classification)) {
      // Unknown classification from LLM — fallback to safe default
      console.warn(
        `[utterance-router] LLM returned unknown classification: "${classification}". Defaulting to strategy_reveal.`
      );
      return { classification: "strategy_reveal", confidence: 0.5 };
    }

    return {
      classification,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  } catch (error) {
    // LLM failure — fail open: assume the utterance is pertinent
    // (better to over-trigger coaching than miss something important)
    console.error("[utterance-router] LLM classification failed:", error);
    return { classification: "strategy_reveal", confidence: 0.5 };
  }
}

// ============================================================================
// COACHING TRIGGER DECISION
// ============================================================================

/**
 * Determines whether a classified utterance should trigger the coaching engine.
 *
 * Rules:
 * - Fillers and small talk never trigger coaching.
 * - BA utterances never trigger coaching (they trigger auto-dismiss instead).
 * - question_response only triggers if from founder/co-founder.
 * - All other substantive utterances from founder/co-founder trigger coaching.
 */
export function shouldTriggerCoaching(
  classification: UtteranceClassification,
  speakerRole: SpeakerRole
): boolean {
  // Never trigger on fillers or small talk
  if (classification === "filler" || classification === "small_talk") {
    return false;
  }

  // BA utterances trigger auto-dismiss, not coaching
  if (speakerRole === "ba") {
    return false;
  }

  // Non-founder/co-founder investor-side participants don't trigger coaching
  if (speakerRole === "investor") {
    return false;
  }

  // All substantive utterances from non-BA, non-investor roles trigger coaching
  // This includes founder, co-founder, other (unmapped participants), lawyer, advisor
  return true;
}
