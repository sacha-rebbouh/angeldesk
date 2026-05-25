/**
 * Phase C slice C3b — Live cost wiring via `costMonitor.recordLiveCall`.
 *
 * Couvre :
 *   - dealId présent → LiveSession.update increment + CostEvent.create avec
 *     analysisId/boardSessionId null.
 *   - dealId null → LiveSession.update increment + pas de CostEvent.create
 *     + logger.warn structuré (reason: "missing_dealId_skipped_CostEvent").
 *   - cost <= 0 → no-op (ni increment ni CostEvent).
 *   - 2 appels concurrents → 2 increments séparés (atomicité Prisma).
 *   - recordLiveCall n'affecte pas `currentAnalysis` (startAnalysis +
 *     recordCall continuent de fonctionner).
 *   - Erreur Prisma sur update OU create → catch interne, jamais throw.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks Prisma + logger
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => ({
  liveSession: {
    update: vi.fn(),
  },
  costEvent: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      update: (args: unknown) => mockPrisma.liveSession.update(args),
    },
    costEvent: {
      create: (args: unknown) => mockPrisma.costEvent.create(args),
    },
  },
}));

const { infoMock, warnMock, errorMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/lib/logger", () => {
  const loggerMock = {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => loggerMock),
  };
  return {
    logger: loggerMock,
    createLogger: vi.fn(() => loggerMock),
  };
});

const { costMonitor } = await import("../index");

// ---------------------------------------------------------------------------
// 1. dealId present — LiveSession.update + CostEvent.create
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : dealId présent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockResolvedValue({});
  });

  it("crée 1 CostEvent (analysisId null, boardSessionId null) et incrémente LiveSession.totalCost", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_1",
      userId: "user_1",
      dealId: "deal_1",
      agent: "coaching-engine",
      operation: "live_coaching",
      cost: 0.0012,
      model: "anthropic/claude-haiku-4.5",
      inputTokens: 800,
      outputTokens: 120,
      durationMs: 1450,
    });

    expect(mockPrisma.liveSession.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.liveSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { totalCost: { increment: 0.0012 } },
    });

    expect(mockPrisma.costEvent.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.costEvent.create.mock.calls[0][0];
    expect(createArg.data.userId).toBe("user_1");
    expect(createArg.data.dealId).toBe("deal_1");
    expect(createArg.data.analysisId).toBeNull();
    expect(createArg.data.boardSessionId).toBeNull();
    expect(createArg.data.agent).toBe("coaching-engine");
    expect(createArg.data.operation).toBe("live_coaching");
    expect(createArg.data.cost).toBe(0.0012);
    expect(createArg.data.model).toBe("anthropic/claude-haiku-4.5");
    expect(createArg.data.inputTokens).toBe(800);
    expect(createArg.data.outputTokens).toBe(120);
    expect(createArg.data.durationMs).toBe(1450);
  });

  it("model/tokens/durationMs absents → defaults (model 'unknown', tokens 0, durationMs null)", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_2",
      userId: "user_2",
      dealId: "deal_2",
      agent: "visual-pipeline",
      operation: "live_visual_pipeline",
      cost: 0.005,
    });

    const createArg = mockPrisma.costEvent.create.mock.calls[0][0];
    expect(createArg.data.model).toBe("unknown");
    expect(createArg.data.inputTokens).toBe(0);
    expect(createArg.data.outputTokens).toBe(0);
    expect(createArg.data.durationMs).toBeNull();
  });

  it("metadata fourni est sérialisé dans CostEvent.metadata", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_3",
      userId: "user_3",
      dealId: "deal_3",
      agent: "post-call-report",
      operation: "live_post_call_report",
      cost: 0.04,
      metadata: { retried: true, attempt: 2 },
    });

    const createArg = mockPrisma.costEvent.create.mock.calls[0][0];
    expect(createArg.data.metadata).toEqual({ retried: true, attempt: 2 });
  });
});

// ---------------------------------------------------------------------------
// 2. dealId null — increment LiveSession + warn + pas de CostEvent
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : dealId null (cold session)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockResolvedValue({});
  });

  it("incrémente LiveSession.totalCost mais ne crée PAS de CostEvent + warn structuré", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_cold",
      userId: "user_5",
      dealId: null,
      agent: "coaching-engine",
      operation: "live_coaching",
      cost: 0.0008,
    });

    expect(mockPrisma.liveSession.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();

    expect(warnMock).toHaveBeenCalled();
    const warnCall = warnMock.mock.calls.find((call) => {
      const ctx = call[0];
      return ctx?.reason === "missing_dealId_skipped_CostEvent";
    });
    expect(warnCall).toBeDefined();
    expect(warnCall?.[0].sessionId).toBe("sess_cold");
    expect(warnCall?.[0].agent).toBe("coaching-engine");
    expect(warnCall?.[0].component).toBe("live-coaching-cost");
  });
});

// ---------------------------------------------------------------------------
// 3. cost <= 0 — no-op total
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : cost <= 0 → no-op", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockResolvedValue({});
  });

  it("cost = 0 → aucun appel DB, aucun warn", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_x",
      userId: "user_x",
      dealId: "deal_x",
      agent: "agent_x",
      operation: "op_x",
      cost: 0,
    });

    expect(mockPrisma.liveSession.update).not.toHaveBeenCalled();
    expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();
  });

  it("cost négatif → aucun appel DB", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_x",
      userId: "user_x",
      dealId: "deal_x",
      agent: "agent_x",
      operation: "op_x",
      cost: -1,
    });

    expect(mockPrisma.liveSession.update).not.toHaveBeenCalled();
    expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();
  });

  it("cost NaN → aucun appel DB", async () => {
    await costMonitor.recordLiveCall({
      sessionId: "sess_x",
      userId: "user_x",
      dealId: "deal_x",
      agent: "agent_x",
      operation: "op_x",
      cost: Number.NaN,
    });

    expect(mockPrisma.liveSession.update).not.toHaveBeenCalled();
    expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Concurrence — 2 appels parallèles, 2 increments
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : concurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockResolvedValue({});
  });

  it("2 appels concurrents sur le même sessionId → 2 increments distincts", async () => {
    await Promise.all([
      costMonitor.recordLiveCall({
        sessionId: "sess_concurrent",
        userId: "user_1",
        dealId: "deal_1",
        agent: "coaching-engine",
        operation: "live_coaching",
        cost: 0.0010,
      }),
      costMonitor.recordLiveCall({
        sessionId: "sess_concurrent",
        userId: "user_1",
        dealId: "deal_1",
        agent: "visual-pipeline",
        operation: "live_visual_pipeline",
        cost: 0.0030,
      }),
    ]);

    expect(mockPrisma.liveSession.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.costEvent.create).toHaveBeenCalledTimes(2);

    // Vérifier que les 2 increments ont les bons montants
    const incrementValues = mockPrisma.liveSession.update.mock.calls.map(
      (call) => call[0].data.totalCost.increment
    );
    expect(incrementValues.sort()).toEqual([0.001, 0.003]);
  });
});

// ---------------------------------------------------------------------------
// 5. Isolation orchestrator — recordLiveCall ne touche pas currentAnalysis
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : isolation orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockResolvedValue({});
  });

  it("recordLiveCall ne déclenche pas le warning 'No active analysis' (ne touche pas currentAnalysis)", async () => {
    // Mock console.warn pour détecter le warning legacy.
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await costMonitor.recordLiveCall({
      sessionId: "sess_iso",
      userId: "user_iso",
      dealId: "deal_iso",
      agent: "coaching-engine",
      operation: "live_coaching",
      cost: 0.001,
    });

    const legacyWarn = consoleWarnSpy.mock.calls.find((args) =>
      String(args[0] ?? "").includes("No active analysis")
    );
    expect(legacyWarn).toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it("startAnalysis + recordCall continuent de fonctionner après recordLiveCall (pas de mutation)", async () => {
    // Étape 1 : recordLiveCall ne touche pas currentAnalysis.
    await costMonitor.recordLiveCall({
      sessionId: "sess_x",
      userId: "user_x",
      dealId: "deal_x",
      agent: "agent_x",
      operation: "op_x",
      cost: 0.0005,
    });

    // Étape 2 : startAnalysis pose currentAnalysis.
    costMonitor.startAnalysis({
      analysisId: "analysis_1",
      dealId: "deal_orch",
      userId: "user_orch",
      type: "full_analysis",
    });

    // Étape 3 : recordCall persiste un CostEvent classique (chemin
    // orchestrator, distinct du chemin Live).
    costMonitor.recordCall({
      model: "anthropic/claude-sonnet-4.5",
      agent: "synthesis-deal-scorer",
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.05,
    });

    // Laisser fire-and-forget se résoudre.
    await new Promise((resolve) => setImmediate(resolve));

    // Le CostEvent persisté par le chemin orchestrator doit pointer vers
    // analysis_1 / deal_orch / user_orch (pas vers le Live précédent).
    const orchestratorCreate = mockPrisma.costEvent.create.mock.calls.find(
      (call) => call[0].data.analysisId === "analysis_1"
    );
    expect(orchestratorCreate).toBeDefined();
    expect(orchestratorCreate?.[0].data.dealId).toBe("deal_orch");
    expect(orchestratorCreate?.[0].data.userId).toBe("user_orch");
    expect(orchestratorCreate?.[0].data.agent).toBe("synthesis-deal-scorer");
  });
});

// ---------------------------------------------------------------------------
// 6. Resilience — erreurs Prisma ne throw jamais
// ---------------------------------------------------------------------------

describe("Phase C C3b — recordLiveCall : resilience erreurs Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("erreur LiveSession.update → warn + continue vers CostEvent + jamais throw", async () => {
    mockPrisma.liveSession.update.mockRejectedValue(
      new Error("LiveSession not found")
    );
    mockPrisma.costEvent.create.mockResolvedValue({});

    await expect(
      costMonitor.recordLiveCall({
        sessionId: "sess_x",
        userId: "user_x",
        dealId: "deal_x",
        agent: "agent_x",
        operation: "op_x",
        cost: 0.001,
      })
    ).resolves.toBeUndefined();

    expect(warnMock).toHaveBeenCalled();
    const w = warnMock.mock.calls.find((c) =>
      String(c[1] ?? "").includes("Failed to increment LiveSession.totalCost")
    );
    expect(w).toBeDefined();

    // CostEvent.create est toujours tenté après le warn (LiveSession non-bloquant).
    expect(mockPrisma.costEvent.create).toHaveBeenCalledTimes(1);
  });

  it("erreur CostEvent.create → warn + jamais throw", async () => {
    mockPrisma.liveSession.update.mockResolvedValue({});
    mockPrisma.costEvent.create.mockRejectedValue(
      new Error("DB connection lost")
    );

    await expect(
      costMonitor.recordLiveCall({
        sessionId: "sess_x",
        userId: "user_x",
        dealId: "deal_x",
        agent: "agent_x",
        operation: "op_x",
        cost: 0.001,
      })
    ).resolves.toBeUndefined();

    expect(warnMock).toHaveBeenCalled();
    const w = warnMock.mock.calls.find((c) =>
      String(c[1] ?? "").includes("Failed to persist Live CostEvent")
    );
    expect(w).toBeDefined();
  });
});
