/**
 * Result Sanitizer (F52)
 *
 * Filters agent results before injection into downstream agent contexts.
 * GOAL: Remove evaluative content (scores, assessments, verdicts) while
 * keeping raw factual data (metrics, numbers, extracted text).
 *
 * This prevents confirmation bias where downstream agents anchor on
 * upstream evaluations instead of forming independent assessments.
 */

import type { AgentResult } from "../types";

/**
 * Keys that contain evaluative judgments (scores, verdicts, assessments).
 * These should be STRIPPED from previousResults before injection.
 */
const EVALUATIVE_KEYS = new Set([
  // Scores
  "score",
  "scores",
  "overallScore",
  "confidenceScore",
  "qualityScore",
  "riskScore",
  "rating",
  "ratings",
  "grade",
  "grades",
  // Evaluations
  "verdict",
  "assessment",
  "recommendation",
  "recommendations",
  "alertSignal",
  "narrative",
  "investmentRecommendation",
  "skepticismAssessment",
  "killReasons",
  "concernsSummary",
  "moatVerdict",
  "overallRiskLevel",
  "riskLevel",
  // Opinions
  "opinion",
  "opinions",
  "interpretation",
  "interpretations",
  "conclusion",
  "conclusions",
  "synthesis",
  // Red flags (evaluations, not facts)
  "redFlags",
  "warnings",
  "alerts",
  // Suggestions
  "questionsToAsk",
  "suggestedActions",
  "nextSteps",
]);

/**
 * Recursively strip evaluative keys from a data object.
 * Returns a new object with only factual data.
 */
function stripEvaluativeData(data: unknown, depth = 0): unknown {
  if (depth > 5) return data;
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map(item => stripEvaluativeData(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    // Strip evaluative keys at the TOP level of agent data
    if (depth <= 1 && EVALUATIVE_KEYS.has(key)) {
      continue;
    }

    // For nested objects within findings, strip score-like subkeys
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      if ("score" in nested && typeof nested.score === "object" && nested.score !== null && "value" in (nested.score as Record<string, unknown>)) {
        const { score: _score, ...rest } = nested;
        void _score;
        result[key] = stripEvaluativeData(rest, depth + 1);
        continue;
      }
    }

    result[key] = stripEvaluativeData(value, depth + 1);
  }
  return result;
}

/**
 * Sanitize an agent result for injection into downstream agents.
 * Keeps: success status, execution time, raw factual data
 * Removes: scores, verdicts, assessments, narratives
 *
 * F97: skipSanitization option for Tier 3 agents that need full results
 */
export function sanitizeResultForDownstream(
  result: AgentResult,
  options?: { skipSanitization?: boolean }
): AgentResult {
  // Tier 3 agents need full results for synthesis (F97)
  if (options?.skipSanitization) {
    return result;
  }

  // Always keep: pure extractors (no evaluation)
  if (
    result.agentName === "document-extractor" ||
    result.agentName === "fact-extractor" ||
    result.agentName === "deck-coherence-checker"
  ) {
    return result;
  }

  if (!result.success || !("data" in result)) {
    return result;
  }

  const sanitizedData = stripEvaluativeData((result as { data: unknown }).data);

  return {
    ...result,
    data: sanitizedData,
  } as AgentResult;
}

/**
 * Sanitize a full previousResults map for downstream injection.
 */
export function sanitizePreviousResults(
  results: Record<string, AgentResult>
): Record<string, AgentResult> {
  const sanitized: Record<string, AgentResult> = {};
  for (const [key, result] of Object.entries(results)) {
    sanitized[key] = sanitizeResultForDownstream(result);
  }
  return sanitized;
}

// =============================================================================
// NARRATIVE SANITIZER (Rule #1: Angel Desk ANALYSE et GUIDE, ne DÉCIDE JAMAIS)
// =============================================================================

/**
 * Forbidden prescriptive patterns in LLM-generated text.
 * Each entry: [regex pattern, replacement text]
 */
const PRESCRIPTIVE_PATTERNS: Array<[RegExp, string]> = [
  // French prescriptive verbs/phrases
  [/\bNe pas investir\b/gi, "Signaux d'alerte dominants identifiés"],
  [/\bN'investissez pas\b/gi, "Les signaux d'alerte dominent"],
  [/\bInvestir\b(?!\s+(en|dans\s+l['']))/gi, "Signaux favorables identifiés"],
  [/\bInvestissez\b/gi, "Les signaux sont favorables"],
  [/\bRejeter l['']opportunit[ée]\b/gi, "Signaux d'alerte dominants sur plusieurs dimensions"],
  [/\bRejetez\b/gi, "Les signaux suggèrent une vigilance accrue"],
  [/\bPasser ce deal\b/gi, "Vigilance requise sur ce deal"],
  [/\bPassez\b(?!\s+(en|à|par|au))/gi, "La prudence est de mise"],
  [/\bFuyez\b/gi, "Les signaux d'alerte sont nombreux"],
  [/\bÉvitez\b(?!\s+de\s+(sous|sur))/gi, "Vigilance recommandée"],
  // English prescriptive phrases
  [/\bDo not invest\b/gi, "Alert signals dominate"],
  [/\bPass on this deal\b/gi, "Vigilance required on this deal"],
  [/\bReject this opportunity\b/gi, "Alert signals dominant across multiple dimensions"],
  // GO/NO-GO verdicts
  [/\bNO[\s-]?GO\b/gi, "Signaux d'alerte dominants"],
  [/\bSTRONG[\s_]?PASS\b/gi, "Signaux d'alerte dominants"],
  [/\bWEAK[\s_]?PASS\b/gi, "Vigilance requise"],
  // Dealbreaker as verdict (not as analytical term)
  [/\b[Dd]ealbreaker\b(?!\s+(potentiel|identifi[ée]|d[ée]tect[ée]))/g, "risque critique"],
  // Additional forbidden phrases from CLAUDE.md
  [/[Tt]oute n[ée]gociation serait une perte de temps/gi, "Les points de négociation identifiés sont limités compte tenu des signaux d'alerte"],
  [/[Rr]ecommandation\s*:\s*(PASS|STRONG.?PASS|NO.?GO)/gi, "Profil de signal : signaux d'alerte dominants"],
  [/\bRefusez\b/gi, "Les signaux suggèrent la prudence"],
  [/\bClasser le dossier\b/gi, "Questions prioritaires à clarifier avant toute décision"],
  [/\bClasser ce deal\b/gi, "Questions prioritaires à clarifier avant toute décision"],
];

/**
 * Text fields in agent output that may contain prescriptive language.
 */
const NARRATIVE_FIELD_NAMES = new Set([
  "narrative", "summary", "oneLiner", "keyInsight",
  "nextSteps", "forNegotiation", "rationale",
  "recommendation", "conclusion", "synthesis",
  "description", "explanation", "assessment",
]);

/**
 * Sanitize a single text string: replace prescriptive patterns.
 * Returns { text, violations } where violations lists what was found.
 */
export function sanitizeNarrativeText(text: string): { text: string; violations: string[] } {
  const violations: string[] = [];
  let result = text;

  for (const [pattern, replacement] of PRESCRIPTIVE_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      violations.push(`"${match[0]}" → "${replacement}"`);
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, violations };
}

/**
 * Recursively scan and sanitize all narrative text fields in an object.
 * Returns { data, totalViolations } with sanitized data.
 */
export function sanitizeAgentNarratives(
  data: unknown,
  depth = 0
): { data: unknown; totalViolations: number; violationDetails: string[] } {
  const allViolations: string[] = [];

  function walk(obj: unknown, d: number): unknown {
    if (d > 8) return obj;
    if (obj == null) return obj;

    if (typeof obj === "string") {
      const { text, violations } = sanitizeNarrativeText(obj);
      allViolations.push(...violations);
      return text;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => walk(item, d + 1));
    }

    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === "string" && NARRATIVE_FIELD_NAMES.has(key)) {
          const { text, violations } = sanitizeNarrativeText(value);
          allViolations.push(...violations);
          result[key] = text;
        } else if (typeof value === "object" && value !== null) {
          result[key] = walk(value, d + 1);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return obj;
  }

  const sanitized = walk(data, depth);
  return {
    data: sanitized,
    totalViolations: allViolations.length,
    violationDetails: allViolations,
  };
}
