// ============================================================================
// STATE MACHINE — TIMEOUTS & CHECKPOINT BEHAVIOR TESTS
// Tests for default timeouts, checkpointInterval, and conditional persistence
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// MOCKS
// ============================================================================

const mockSaveCheckpoint = vi.fn().mockResolvedValue("checkpoint-id-123");
const mockCleanupOldCheckpoints = vi.fn().mockResolvedValue(0);
const mockLoadLatestCheckpoint = vi.fn().mockResolvedValue(null);

vi.mock("@/agents/orchestrator/persistence", () => ({
  saveCheckpoint: (...args: unknown[]) => mockSaveCheckpoint(...args),
  cleanupOldCheckpoints: (...args: unknown[]) =>
    mockCleanupOldCheckpoints(...args),
  loadLatestCheckpoint: (...args: unknown[]) =>
    mockLoadLatestCheckpoint(...args),
}));

vi.mock("@/agents/orchestration/message-bus", () => ({
  messageBus: {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalMessages: 0 }),
  },
}));

vi.mock("@/agents/orchestration/message-types", () => ({
  createMessage: (msg: unknown) => msg,
}));

vi.mock("@/scoring/types", () => ({}));

import { AnalysisStateMachine } from "../state-machine";

// ============================================================================
// HELPERS
// ============================================================================

function createStateMachine(
  overrides: Record<string, unknown> = {}
): AnalysisStateMachine {
  return new AnalysisStateMachine({
    analysisId: "test-analysis-001",
    dealId: "test-deal-001",
    agents: ["deck-forensics", "financial-auditor"],
    ...overrides,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

// ============================================================================
// DEFAULT STATE TIMEOUTS (no checkpointing needed)
// ============================================================================

describe("AnalysisStateMachine — default stateTimeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("EXTRACTING timeout defaults to 120000ms (2 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();

    expect(sm.getState()).toBe("EXTRACTING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("GATHERING timeout defaults to 180000ms (3 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();
    await sm.startGathering();

    expect(sm.getState()).toBe("GATHERING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("ANALYZING timeout defaults to 600000ms (10 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();
    await sm.startGathering();
    await sm.startAnalysis();

    expect(sm.getState()).toBe("ANALYZING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("DEBATING timeout defaults to 180000ms (3 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();
    await sm.startGathering();
    await sm.startAnalysis();
    await sm.startDebate();

    expect(sm.getState()).toBe("DEBATING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("REFLECTING timeout defaults to 120000ms (2 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();
    await sm.startGathering();
    await sm.startAnalysis();
    await sm.startReflection();

    expect(sm.getState()).toBe("REFLECTING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("SYNTHESIZING timeout defaults to 300000ms (5 min)", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();
    await sm.startGathering();
    await sm.startAnalysis();
    await sm.startSynthesis();

    expect(sm.getState()).toBe("SYNTHESIZING");
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });
});

// ============================================================================
// CHECKPOINT INTERVAL DEFAULT
// ============================================================================

describe("AnalysisStateMachine — checkpointInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults checkpointInterval to 120000ms", async () => {
    const sm = createStateMachine();
    await sm.start(); // IDLE -> INITIALIZING, saves checkpoint
    // Flush the fire-and-forget checkpoint promise
    await vi.advanceTimersByTimeAsync(0);

    // Clear calls from the transition checkpoint
    mockSaveCheckpoint.mockClear();

    // Advance to just under 120s — periodic checkpoint should NOT fire
    await vi.advanceTimersByTimeAsync(119_999);
    expect(mockSaveCheckpoint).not.toHaveBeenCalled();

    // Advance to 120s — periodic checkpoint fires, but force=false
    // and state hasn't changed (still INITIALIZING, already persisted)
    // so it should be SKIPPED by the conditional check
    await vi.advanceTimersByTimeAsync(1);
    expect(mockSaveCheckpoint).not.toHaveBeenCalled();

    // Cleanup: stop the interval
    await sm.fail(new Error("cleanup"));
    await vi.advanceTimersByTimeAsync(0);
  });
});

// ============================================================================
// CONDITIONAL CHECKPOINTS (force=false skip when state unchanged)
// ============================================================================

describe("AnalysisStateMachine — conditional checkpoints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("periodic timer (force=false) skips saveCheckpoint when state has NOT changed", async () => {
    const sm = createStateMachine({ checkpointInterval: 500 });
    await sm.start(); // IDLE -> INITIALIZING (force=true, saves)
    await vi.advanceTimersByTimeAsync(0);

    const callsAfterStart = mockSaveCheckpoint.mock.calls.length;
    expect(callsAfterStart).toBeGreaterThanOrEqual(1);

    // Clear and advance to trigger periodic checkpoint
    mockSaveCheckpoint.mockClear();
    await vi.advanceTimersByTimeAsync(500);

    // Periodic checkpoint (force=false) should NOT save because state is still INITIALIZING
    expect(mockSaveCheckpoint).not.toHaveBeenCalled();

    // Cleanup
    await sm.fail(new Error("cleanup"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("periodic timer (force=false) DOES save when state has changed since last persist", async () => {
    const sm = createStateMachine({ checkpointInterval: 500 });
    await sm.start();
    await vi.advanceTimersByTimeAsync(0);

    await sm.startExtraction();
    await vi.advanceTimersByTimeAsync(0);

    await sm.startGathering();
    await vi.advanceTimersByTimeAsync(0);

    // Each transition called saveCheckpoint (force=true)
    expect(mockSaveCheckpoint.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Cleanup
    await sm.fail(new Error("cleanup"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("periodic timer (force=false) saves when progress changes within the same state", async () => {
    const sm = createStateMachine({ checkpointInterval: 500 });
    await sm.start();
    await vi.advanceTimersByTimeAsync(0);

    mockSaveCheckpoint.mockClear();

    sm.recordAgentComplete("deck-forensics", {
      agentName: "deck-forensics",
      success: true,
      executionTimeMs: 10,
      cost: 0.01,
      data: {
        meta: {
          agentName: "deck-forensics",
          analysisDate: new Date().toISOString(),
          dataCompleteness: "minimal",
          confidenceLevel: 70,
          limitations: [],
        },
        score: {
          value: 70,
          grade: "B",
          breakdown: [],
        },
        findings: {
          narrativeAnalysis: {
            storyCoherence: 70,
            credibilityAssessment: "Minimal mock for checkpoint persistence test.",
            narrativeStrengths: [],
            narrativeWeaknesses: [],
            criticalMissingInfo: [],
          },
          claimVerification: [],
          inconsistencies: [],
          deckQuality: {
            professionalismScore: 70,
            completenessScore: 70,
            transparencyScore: 70,
            issues: [],
          },
        },
        dbCrossReference: {
          claims: [],
          uncheckedClaims: [],
        },
        redFlags: [],
        questions: [],
        alertSignal: {
          hasBlocker: false,
          recommendation: "PROCEED_WITH_CAUTION",
          justification: "Checkpoint test mock.",
        },
        narrative: {
          oneLiner: "Minimal mock deck result.",
          summary: "Used only to verify checkpoint persistence logic.",
          keyInsights: [],
          forNegotiation: [],
        },
      },
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(1);
    expect(mockSaveCheckpoint.mock.calls[0]?.[1]).toMatchObject({
      completedAgents: ["deck-forensics"],
      pendingAgents: ["financial-auditor"],
    });

    await sm.fail(new Error("cleanup"));
    await vi.advanceTimersByTimeAsync(0);
  });
});

// ============================================================================
// TRANSITION-TRIGGERED CHECKPOINTS (force=true always persists)
// ============================================================================

describe("AnalysisStateMachine — transition-triggered checkpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("every state transition calls saveCheckpoint (force=true)", async () => {
    const sm = createStateMachine({
      enableCheckpointing: true,
      // Use a very long interval so periodic timer never fires
      checkpointInterval: 999_999_999,
    });

    await sm.start(); // IDLE -> INITIALIZING
    // Wait for fire-and-forget checkpoint to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(1);

    await sm.startExtraction(); // INITIALIZING -> EXTRACTING
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(2);

    await sm.startGathering(); // EXTRACTING -> GATHERING
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(3);

    await sm.startAnalysis(); // GATHERING -> ANALYZING
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(4);

    // Cleanup
    await sm.fail(new Error("cleanup"));
  });

  it("saveCheckpoint receives the current analysis state", async () => {
    const sm = createStateMachine({
      enableCheckpointing: true,
      checkpointInterval: 999_999_999,
    });

    await sm.start();
    await new Promise((r) => setTimeout(r, 10));

    // First call: state=INITIALIZING
    expect(mockSaveCheckpoint.mock.calls[0][0]).toBe("test-analysis-001");
    expect(mockSaveCheckpoint.mock.calls[0][1]).toEqual(
      expect.objectContaining({ state: "INITIALIZING" })
    );

    await sm.startExtraction();
    await new Promise((r) => setTimeout(r, 10));

    // Second call: state=EXTRACTING
    expect(mockSaveCheckpoint.mock.calls[1][1]).toEqual(
      expect.objectContaining({ state: "EXTRACTING" })
    );

    // Cleanup
    await sm.fail(new Error("cleanup"));
  });

  it("serializes checkpoint persistence to avoid out-of-order writes", async () => {
    const firstCheckpoint = createDeferred<string>();
    const secondCheckpoint = createDeferred<string>();

    mockSaveCheckpoint
      .mockImplementationOnce(() => firstCheckpoint.promise)
      .mockImplementationOnce(() => secondCheckpoint.promise);

    const sm = createStateMachine({
      enableCheckpointing: true,
      checkpointInterval: 999_999_999,
    });

    await sm.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(1);

    await sm.startExtraction();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(1);

    firstCheckpoint.resolve("checkpoint-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSaveCheckpoint).toHaveBeenCalledTimes(2);

    secondCheckpoint.resolve("checkpoint-2");
    await new Promise((r) => setTimeout(r, 0));

    await sm.fail(new Error("cleanup"));
  });
});

// ============================================================================
// isCurrentStateTimedOut
// ============================================================================

describe("AnalysisStateMachine — isCurrentStateTimedOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false in IDLE (no timeout set for IDLE)", () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("returns false immediately after entering a state with a timeout", async () => {
    const sm = createStateMachine({ enableCheckpointing: false });
    await sm.start();
    await sm.startExtraction();

    expect(sm.isCurrentStateTimedOut()).toBe(false);
  });

  it("returns true when custom timeout is exceeded", async () => {
    vi.useFakeTimers();

    const sm = createStateMachine({
      enableCheckpointing: false,
      stateTimeouts: {
        EXTRACTING: 100,
      },
    });
    await sm.start();
    await sm.startExtraction();

    expect(sm.isCurrentStateTimedOut()).toBe(false);

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(150);
    expect(sm.isCurrentStateTimedOut()).toBe(true);

    vi.useRealTimers();
  });
});
