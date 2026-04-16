/**
 * Backoff exponentiel pour le stream SSE /api/analyze/stream.
 *
 * Objectif: eviter de poller la DB toutes les 1.5s pendant plusieurs minutes
 * (360+ queries / analyse) alors que la progression est intermittente.
 *
 * Regle:
 *  - Si completedAgents a augmente (progressed=true) -> reset au base.
 *  - Sinon -> double le delai jusqu'au cap.
 *  - Cap different selon le type d'analyse (quick vs deep).
 */

export interface StreamBackoffConfig {
  baseMs: number;
  capMs: number;
}

const FAST_TYPES = new Set([
  "screening",
  "extraction",
  "quick_scan",
  "tier1_complete",
]);

const SLOW_TYPES = new Set([
  "full_analysis",
  "full_dd",
  "tier2_sector",
  "tier3_synthesis",
  "deep_dive",
]);

/**
 * Retourne la config de backoff selon le type d'analyse.
 * - Types rapides (screening/extraction/quick_scan): 500ms -> 2s
 * - Types lents (Deep Dive/full_analysis): 2s -> 5s
 * - Fallback default: 1.5s -> 3s
 */
export function getStreamBackoffConfig(type: string | null | undefined): StreamBackoffConfig {
  if (type && FAST_TYPES.has(type)) return { baseMs: 500, capMs: 2000 };
  if (type && SLOW_TYPES.has(type)) return { baseMs: 2000, capMs: 5000 };
  return { baseMs: 1500, capMs: 3000 };
}

/**
 * Calcule le prochain delai de backoff.
 * - previousMs=0 (premier tick) -> baseMs
 * - progressed=true               -> reset au baseMs
 * - sinon                          -> min(previousMs * 2, capMs)
 */
export function nextStreamBackoffMs(params: {
  type: string | null | undefined;
  previousMs: number;
  progressed: boolean;
}): number {
  const { baseMs, capMs } = getStreamBackoffConfig(params.type);
  if (params.progressed || params.previousMs <= 0) return baseMs;
  return Math.min(params.previousMs * 2, capMs);
}

/**
 * Hard timeout global du stream (10 min) pour les Deep Dive extremes
 * ou les analyses qui partent en zombie.
 */
export const DEFAULT_STREAM_HARD_TIMEOUT_MS = 10 * 60 * 1000;
