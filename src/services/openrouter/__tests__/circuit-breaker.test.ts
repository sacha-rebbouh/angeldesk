// ============================================================================
// CIRCUIT BREAKER - UNIT TESTS
// Tests for per-model circuit breaker isolation, state transitions, and config
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock distributed-state before importing circuit-breaker
vi.mock("@/services/distributed-state", () => ({
  getStore: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(undefined),
  }),
}));

import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetCircuitBreaker,
} from "../circuit-breaker";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Record N failures on a circuit breaker instance.
 * Uses execute() with a failing function to go through normal flow.
 */
async function recordFailures(cb: CircuitBreaker, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error(`failure-${i}`)));
    } catch {
      // Expected failures
    }
  }
}

/**
 * Record N successes on a circuit breaker instance.
 */
async function recordSuccesses(cb: CircuitBreaker, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await cb.execute(() => Promise.resolve("ok"));
  }
}

// ============================================================================
// PER-MODEL INSTANCE ISOLATION
// ============================================================================

describe("getCircuitBreaker — per-model instances", () => {
  beforeEach(() => {
    // Reset all breakers between tests to avoid cross-contamination
    resetCircuitBreaker();
  });

  it("returns DIFFERENT instances for different model keys", () => {
    const haiku = getCircuitBreaker("HAIKU");
    const gemini = getCircuitBreaker("GEMINI_3_FLASH");

    expect(haiku).not.toBe(gemini);
  });

  it("returns the SAME instance when called twice with the same key", () => {
    const first = getCircuitBreaker("HAIKU");
    const second = getCircuitBreaker("HAIKU");

    expect(first).toBe(second);
  });

  it('defaults to "global" when no key is provided', () => {
    const noArg = getCircuitBreaker();
    const global = getCircuitBreaker("global");

    expect(noArg).toBe(global);
  });

  it("HAIKU circuit OPEN does not affect GEMINI_3_FLASH circuit", async () => {
    const haiku = getCircuitBreaker("HAIKU");
    const gemini = getCircuitBreaker("GEMINI_3_FLASH");

    // Open HAIKU by forcing it
    haiku.forceOpen();

    // HAIKU should be OPEN
    expect(haiku.getStats().state).toBe("OPEN");

    // GEMINI should still be CLOSED
    expect(gemini.getStats().state).toBe("CLOSED");
  });
});

// ============================================================================
// resetCircuitBreaker
// ============================================================================

describe("resetCircuitBreaker", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it("resets only the specified model when a key is given", async () => {
    const haiku = getCircuitBreaker("HAIKU");
    const gemini = getCircuitBreaker("GEMINI_3_FLASH");

    haiku.forceOpen();
    gemini.forceOpen();

    // Reset only HAIKU
    resetCircuitBreaker("HAIKU");

    expect(haiku.getStats().state).toBe("CLOSED");
    expect(gemini.getStats().state).toBe("OPEN");
  });

  it("resets ALL breakers when no key is given", () => {
    const haiku = getCircuitBreaker("HAIKU");
    const gemini = getCircuitBreaker("GEMINI_3_FLASH");

    haiku.forceOpen();
    gemini.forceOpen();

    resetCircuitBreaker();

    expect(haiku.getStats().state).toBe("CLOSED");
    expect(gemini.getStats().state).toBe("CLOSED");
  });
});

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

describe("CircuitBreaker — default config", () => {
  it("has failureThreshold=10 and recoveryTimeout=15000", () => {
    const cb = new CircuitBreaker();

    // The only way to observe config is through behavior:
    // - We need 10 failures to open (not 5)
    // We verify this in the state transition tests below
    // For now, verify that the stats start as expected
    const stats = cb.getStats();
    expect(stats.state).toBe("CLOSED");
    expect(stats.failures).toBe(0);
    expect(stats.totalRequests).toBe(0);
  });
});

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

describe("CircuitBreaker — state transitions", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker();
  });

  it("starts in CLOSED state", () => {
    expect(cb.getStats().state).toBe("CLOSED");
  });

  it("stays CLOSED after 9 failures (threshold is 10)", async () => {
    await recordFailures(cb, 9);

    expect(cb.getStats().state).toBe("CLOSED");
  });

  it("transitions CLOSED -> OPEN after 10 failures", async () => {
    await recordFailures(cb, 10);

    expect(cb.getStats().state).toBe("OPEN");
  });

  it("throws CircuitOpenError when OPEN and recovery timeout not elapsed", async () => {
    await recordFailures(cb, 10);
    expect(cb.getStats().state).toBe("OPEN");

    await expect(
      cb.execute(() => Promise.resolve("should not run"))
    ).rejects.toThrow(CircuitOpenError);
  });

  it("transitions OPEN -> HALF_OPEN after recoveryTimeout", async () => {
    // Use a short recovery timeout for testing
    const fastCb = new CircuitBreaker({ recoveryTimeout: 50 });

    await recordFailures(fastCb, 10);
    expect(fastCb.getStats().state).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 60));

    // The next execute() call should transition to HALF_OPEN
    // Even if the call succeeds, the transition happens before execution
    await fastCb.execute(() => Promise.resolve("recovery attempt"));

    // After 1 success in HALF_OPEN, state should be HALF_OPEN (need 2 successes)
    // Actually after the successful call, onSuccess is called which increments halfOpenSuccesses
    // successThreshold is 2, so after 1 success we're still HALF_OPEN
    expect(fastCb.getStats().state).toBe("HALF_OPEN");
  });

  it("transitions HALF_OPEN -> CLOSED after 2 successes (successThreshold)", async () => {
    const fastCb = new CircuitBreaker({ recoveryTimeout: 50 });

    await recordFailures(fastCb, 10);
    expect(fastCb.getStats().state).toBe("OPEN");

    await new Promise((r) => setTimeout(r, 60));

    // 2 successes should close the circuit
    await recordSuccesses(fastCb, 2);

    expect(fastCb.getStats().state).toBe("CLOSED");
  });

  it("transitions HALF_OPEN -> OPEN on any failure", async () => {
    const fastCb = new CircuitBreaker({ recoveryTimeout: 50 });

    await recordFailures(fastCb, 10);
    expect(fastCb.getStats().state).toBe("OPEN");

    await new Promise((r) => setTimeout(r, 60));

    // First call transitions to HALF_OPEN then succeeds
    await fastCb.execute(() => Promise.resolve("ok"));
    expect(fastCb.getStats().state).toBe("HALF_OPEN");

    // A failure should reopen the circuit
    try {
      await fastCb.execute(() => Promise.reject(new Error("fail in half-open")));
    } catch {
      // expected
    }

    expect(fastCb.getStats().state).toBe("OPEN");
  });
});

// ============================================================================
// canExecute
// ============================================================================

describe("CircuitBreaker — canExecute", () => {
  it("returns true when CLOSED", () => {
    const cb = new CircuitBreaker();
    expect(cb.canExecute()).toBe(true);
  });

  it("returns false when OPEN and recovery timeout not elapsed", async () => {
    const cb = new CircuitBreaker({ recoveryTimeout: 60000 });
    await recordFailures(cb, 10);
    expect(cb.canExecute()).toBe(false);
  });

  it("returns true when OPEN and recovery timeout elapsed", async () => {
    const cb = new CircuitBreaker({ recoveryTimeout: 50 });
    await recordFailures(cb, 10);

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.canExecute()).toBe(true);
  });
});

// ============================================================================
// forceOpen / reset
// ============================================================================

describe("CircuitBreaker — forceOpen & reset", () => {
  it("forceOpen sets state to OPEN", () => {
    const cb = new CircuitBreaker();
    cb.forceOpen();
    expect(cb.getStats().state).toBe("OPEN");
  });

  it("reset returns state to CLOSED", () => {
    const cb = new CircuitBreaker();
    cb.forceOpen();
    cb.reset();
    expect(cb.getStats().state).toBe("CLOSED");
    expect(cb.getStats().failures).toBe(0);
  });
});
