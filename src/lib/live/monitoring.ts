// ============================================================================
// Live Coaching — Monitoring & Latency Tracking
// ============================================================================
// Structured logging for live coaching sessions. Simple console-based output
// with consistent formatting. No external monitoring dependency — ready to be
// swapped for a proper observability service later (Datadog, Sentry, etc.).
// ============================================================================

const PREFIX = "[LiveCoaching]";
const SLOW_THRESHOLD_MS = 5_000;

// ============================================================================
// LATENCY TRACKING
// ============================================================================

/**
 * Log latency for a coaching pipeline stage.
 * Warns if elapsed time exceeds 5 seconds.
 */
export function logCoachingLatency(
  sessionId: string,
  stage: string,
  startTime: number
): void {
  const elapsed = Date.now() - startTime;

  console.log(
    `${PREFIX} Session ${sessionId} | ${stage}: ${elapsed}ms`
  );

  if (elapsed > SLOW_THRESHOLD_MS) {
    console.warn(
      `${PREFIX} SLOW: ${stage} took ${elapsed}ms for session ${sessionId}`
    );
  }
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Log a coaching pipeline error with session context.
 */
export function logCoachingError(
  sessionId: string,
  stage: string,
  error: unknown
): void {
  console.error(
    `${PREFIX} ERROR in ${stage} for session ${sessionId}:`,
    error
  );
}

// ============================================================================
// SESSION EVENT LOGGING
// ============================================================================

/**
 * Log a session lifecycle event with optional structured data.
 */
export function logSessionEvent(
  sessionId: string,
  event: string,
  data?: Record<string, unknown>
): void {
  if (data) {
    console.log(
      `${PREFIX} Session ${sessionId} | ${event}`,
      JSON.stringify(data)
    );
  } else {
    console.log(`${PREFIX} Session ${sessionId} | ${event}`);
  }
}

// ============================================================================
// COST TRACKING
// ============================================================================

/**
 * Track LLM cost for a coaching agent invocation.
 * Currently logs to console — ready to be wired to a cost aggregation service.
 */
export function trackCoachingCost(
  sessionId: string,
  agentName: string,
  cost: number
): void {
  console.log(
    `${PREFIX} Cost | Session ${sessionId} | ${agentName}: $${cost.toFixed(4)}`
  );
}
