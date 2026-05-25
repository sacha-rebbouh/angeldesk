// ============================================================================
// Live Coaching — Monitoring & Latency Tracking
// ============================================================================
// Routes Live observability through the central Pino-like logger
// (`@/lib/logger`) which emits JSON in production and hooks Sentry
// automatically on `error`/`fatal` (+ `warn` breadcrumbs). No external
// monitoring dependency is added here — we consume the existing one.
//
// Public signatures are preserved (no callsite changes). The internal
// channel switches from `console.*` to the structured logger.
// ============================================================================

import { logger } from "@/lib/logger";

const COMPONENT = "live-coaching";
const SLOW_THRESHOLD_MS = 5_000;

// ============================================================================
// ERROR CATEGORIZATION
// ============================================================================

export type LiveErrorCategory =
  | "timeout"
  | "llm_truncated"
  | "llm_parse_error"
  | "llm_provider_error"
  | "db_error"
  | "validation_error"
  | "unknown";

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name || error.constructor?.name || "";
  }
  return "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "";
  try {
    return String(error);
  } catch {
    return "";
  }
}

/**
 * Best-effort classification of a Live error into a stable category for
 * dashboards and alerting. Heuristics are intentionally conservative: when in
 * doubt we return `"unknown"` so triage stays honest (cf. doctrine § 5
 * abstention).
 */
export function categorizeLiveError(error: unknown): LiveErrorCategory {
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  // 1) Type-based detection (most reliable when the originating module sets
  //    a proper `name`).
  if (name === "CircuitOpenError") return "llm_provider_error";
  if (name === "ZodError") return "validation_error";
  if (name.startsWith("PrismaClient")) return "db_error";

  // 2) Truncation — Phase C1d marker. Checked early because the message may
  //    also mention "JSON" or "parse" and we want to win that race.
  if (
    lower.includes("truncated and auto-repaired") ||
    lower.includes("llm json response was truncated") ||
    lower.includes("response was truncated")
  ) {
    return "llm_truncated";
  }

  // 3) Timeout — covers the Promise.race "TIMEOUT" sentinel used by
  //    coaching-engine and generic "timed out" messages.
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "timeout";
  }

  // 4) JSON parse failures (router auto-repair giving up, raw consumers).
  if (
    lower.includes("json.parse") ||
    lower.includes("unexpected end of json") ||
    lower.includes("failed to parse llm response") ||
    lower.includes("parse llm")
  ) {
    return "llm_parse_error";
  }

  // 5) Provider-level errors (rate limits, OpenRouter outages, 429/5xx).
  if (
    lower.includes("rate limit") ||
    lower.includes("openrouter") ||
    lower.includes("provider") ||
    /\b429\b/.test(message) ||
    /\b5\d\d\b/.test(message)
  ) {
    return "llm_provider_error";
  }

  // 6) Database (Prisma) — name-based checks above cover the canonical Prisma
  //    error classes; the message-based fallback catches generic wrappers.
  if (lower.includes("prisma") || lower.includes("database")) {
    return "db_error";
  }

  // 7) Schema validation.
  if (lower.includes("validation")) {
    return "validation_error";
  }

  return "unknown";
}

// ============================================================================
// LATENCY TRACKING
// ============================================================================

/**
 * Log latency for a coaching pipeline stage.
 * Emits `logger.warn` (with a Sentry breadcrumb) when elapsed time exceeds
 * the slow threshold (5 s); `logger.info` otherwise.
 */
export function logCoachingLatency(
  sessionId: string,
  stage: string,
  startTime: number
): void {
  const durationMs = Date.now() - startTime;
  const slow = durationMs > SLOW_THRESHOLD_MS;

  const context: Record<string, unknown> = {
    component: COMPONENT,
    sessionId,
    stage,
    durationMs,
    slow,
  };

  if (slow) {
    logger.warn(context, `Slow Live stage ${stage} (${durationMs}ms)`);
  } else {
    logger.info(context, `Live stage ${stage} (${durationMs}ms)`);
  }
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Log a coaching pipeline error with session context and a stable
 * `errorCategory`. The central logger captures `err` to Sentry on `error`.
 */
export function logCoachingError(
  sessionId: string,
  stage: string,
  error: unknown
): void {
  const errorCategory = categorizeLiveError(error);

  const context: Record<string, unknown> = {
    component: COMPONENT,
    sessionId,
    stage,
    errorCategory,
  };

  if (error instanceof Error) {
    context.err = error;
  } else {
    context.errorMessage = getErrorMessage(error);
  }

  logger.error(context, `Live stage ${stage} failed (${errorCategory})`);
}

// ============================================================================
// SESSION EVENT LOGGING
// ============================================================================

/**
 * Log a session lifecycle event with optional structured data.
 * `data` is forwarded as-is; the central logger applies PII redaction
 * (cf. `lib/logger.ts` `REDACTED_KEYS`) before emission. This wrapper does
 * NOT enrich the context with raw transcript / utterance / prompt fields.
 */
export function logSessionEvent(
  sessionId: string,
  event: string,
  data?: Record<string, unknown>
): void {
  const context: Record<string, unknown> = {
    component: COMPONENT,
    sessionId,
    event,
  };

  if (data) {
    context.data = data;
  }

  logger.info(context, `Live session event ${event}`);
}

// ============================================================================
// COST TRACKING
// ============================================================================

/**
 * Track LLM cost for a coaching agent invocation.
 * C3a — log-only: this emits a structured `cost`/`costUsd` line. CostEvent
 * persistence is wired separately in C3b (see C3 plan).
 */
export function trackCoachingCost(
  sessionId: string,
  agentName: string,
  cost: number
): void {
  logger.info(
    {
      component: COMPONENT,
      sessionId,
      agentName,
      cost,
      costUsd: cost,
    },
    `Live cost ${agentName} ($${cost.toFixed(4)})`
  );
}
