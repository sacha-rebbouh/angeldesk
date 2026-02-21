/**
 * Centralized score extraction utilities.
 * Single source of truth for extracting scores from agent results.
 */

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

/**
 * Extract the deal score from synthesis-deal-scorer agent results.
 * Handles both old format (overallScore) and new format (score.value).
 */
export function extractDealScore(results: Record<string, AgentResult> | null | undefined): number | null {
  if (!results) return null;
  const scorerResult = results["synthesis-deal-scorer"];
  if (!scorerResult?.success || !scorerResult.data) return null;
  const d = scorerResult.data as { overallScore?: number; score?: { value?: number } };
  return d.overallScore ?? d.score?.value ?? null;
}

/**
 * Extract the recommendation from synthesis-deal-scorer agent results.
 */
export function extractDealRecommendation(results: Record<string, AgentResult> | null | undefined): string | null {
  if (!results) return null;
  const scorerResult = results["synthesis-deal-scorer"];
  if (!scorerResult?.success || !scorerResult.data) return null;
  const d = scorerResult.data as { recommendation?: string };
  return d.recommendation ?? null;
}
