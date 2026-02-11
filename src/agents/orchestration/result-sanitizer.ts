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
      if ("score" in nested && "value" in ((nested.score as Record<string, unknown>) ?? {})) {
        const { score: _score, ...rest } = nested;
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
