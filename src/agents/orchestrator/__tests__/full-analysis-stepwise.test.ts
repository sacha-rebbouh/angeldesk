import { beforeEach, describe, expect, it, vi } from "vitest";

// D.5a — INVARIANT BLOQUANT : en mode stepwise, le pipeline full_analysis n'émet
// AUCUN checkpoint legacy. Trois sources de checkpoint sont conditionnées :
//   1. AnalysisStateMachine `enableCheckpointing: !stepwise` (couvert par les tests
//      de la state machine + revue de diff — non re-testé ici).
//   2. `persistTierCheckpoint` (4 frontières ANALYZING) → no-op si stepwise.
//   3. `runFinalCompletion` → pas de `saveCheckpoint("COMPLETED")` si stepwise, mais
//      `completeAnalysis` (complétion canonique) tourne toujours.
// Ce fichier verrouille (2) et (3) au niveau de l'orchestrateur. OFF (stepwise=false)
// = comportement actuel exact (régression gardée par les assertions « called once »).

const persistenceMocks = vi.hoisted(() => ({
  saveCheckpoint: vi.fn(),
  completeAnalysis: vi.fn(),
  updateDealStatus: vi.fn(),
}));

vi.mock("../persistence", () => ({
  getDealWithRelations: vi.fn(),
  createAnalysis: vi.fn(),
  updateAnalysisProgress: vi.fn(),
  completeAnalysis: persistenceMocks.completeAnalysis,
  persistStateTransition: vi.fn(),
  persistReasoningTrace: vi.fn(),
  persistScoredFindings: vi.fn(),
  persistDebateRecord: vi.fn(),
  processAgentResult: vi.fn(),
  updateDealStatus: persistenceMocks.updateDealStatus,
  findInterruptedAnalyses: vi.fn(),
  loadAnalysisForRecovery: vi.fn(),
  markAnalysisAsFailed: vi.fn(),
  loadPreviousAnalysisQuestions: vi.fn(),
  saveCheckpoint: persistenceMocks.saveCheckpoint,
}));

vi.mock("@/services/openrouter/router", () => ({
  runWithLLMContext: vi.fn(async (_context: unknown, fn: () => unknown) => await fn()),
  setAnalysisContext: vi.fn(),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: { getById: vi.fn(), applyReconciliation: vi.fn() },
}));

vi.mock("@/services/cost-monitor", () => ({
  costMonitor: {
    startAnalysis: vi.fn(),
    endAnalysis: vi.fn().mockResolvedValue(null),
    recordCall: vi.fn(),
  },
}));

const { AgentOrchestrator } = await import("../index");

type OrchestratorPrivateMethods = {
  persistTierCheckpoint: (
    analysisId: string,
    allResults: Record<string, unknown>,
    totalCost: number,
    startTimeMs: number,
    stepwise: boolean,
  ) => Promise<void>;
  runFinalCompletion: (params: Record<string, unknown>) => Promise<unknown>;
};

// d-2a — surface privée pour tester le routing EXACT par version de graphe stepwise.
// On stube initializeFullAnalysisRun + runFullAnalysisPipeline (le bootstrap DB et le corps
// pipeline ne sont pas le sujet) pour exercer SEULEMENT la branche de routing.
type RoutingPrivateMethods = {
  runFullAnalysis: (
    deal: unknown,
    dealId: string,
    onProgress: undefined,
    advancedOptions: { stepwiseGraphVersion?: number },
  ) => Promise<{ sessionId?: string }>;
  initializeFullAnalysisRun: (...args: unknown[]) => Promise<unknown>;
  runFullAnalysisPipeline: (...args: unknown[]) => Promise<unknown>;
  runFullAnalysisStepwise: (...args: unknown[]) => Promise<unknown>;
  runFullAnalysisStepwiseV3: (...args: unknown[]) => Promise<unknown>;
};

function makeFakeStateMachine() {
  return {
    complete: vi.fn().mockResolvedValue(undefined),
    getSummary: vi.fn(() => ({ transitions: 0, totalFindings: 0 })),
  };
}

function finalCompletionParams(stepwise: boolean) {
  return {
    stepwise,
    allResults: {},
    totalCost: 0,
    stateMachine: makeFakeStateMachine(),
    analysis: { id: "analysis_1" },
    dealId: "deal_1",
    startTime: 1_700_000_000_000,
    analysisModeOverride: undefined,
    isUpdate: false,
    collectedWarnings: [],
  };
}

describe("D.5a — zéro checkpoint legacy en mode stepwise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveCheckpoint.mockResolvedValue("checkpoint_1");
    persistenceMocks.completeAnalysis.mockResolvedValue(undefined);
    persistenceMocks.updateDealStatus.mockResolvedValue(undefined);
  });

  describe("persistTierCheckpoint", () => {
    it("stepwise=true → no-op : n'écrit AUCUN checkpoint ANALYZING", async () => {
      const orchestrator = new AgentOrchestrator() as unknown as OrchestratorPrivateMethods;
      await orchestrator.persistTierCheckpoint("analysis_1", {}, 0, Date.now(), true);
      expect(persistenceMocks.saveCheckpoint).not.toHaveBeenCalled();
    });

    it("stepwise=false → écrit le checkpoint ANALYZING (comportement actuel exact)", async () => {
      const orchestrator = new AgentOrchestrator() as unknown as OrchestratorPrivateMethods;
      await orchestrator.persistTierCheckpoint("analysis_1", {}, 1.5, Date.now(), false);
      expect(persistenceMocks.saveCheckpoint).toHaveBeenCalledTimes(1);
      expect(persistenceMocks.saveCheckpoint.mock.calls[0][1]).toMatchObject({ state: "ANALYZING" });
    });
  });

  describe("runFinalCompletion", () => {
    it("stepwise=true → pas de saveCheckpoint COMPLETED, mais completeAnalysis tourne", async () => {
      const orchestrator = new AgentOrchestrator() as unknown as OrchestratorPrivateMethods;
      await orchestrator.runFinalCompletion(finalCompletionParams(true));
      expect(persistenceMocks.saveCheckpoint).not.toHaveBeenCalled();
      expect(persistenceMocks.completeAnalysis).toHaveBeenCalledTimes(1);
    });

    it("stepwise=false → écrit le checkpoint COMPLETED (comportement actuel exact)", async () => {
      const orchestrator = new AgentOrchestrator() as unknown as OrchestratorPrivateMethods;
      await orchestrator.runFinalCompletion(finalCompletionParams(false));
      expect(persistenceMocks.saveCheckpoint).toHaveBeenCalledTimes(1);
      expect(persistenceMocks.saveCheckpoint.mock.calls[0][1]).toMatchObject({ state: "COMPLETED" });
      expect(persistenceMocks.completeAnalysis).toHaveBeenCalledTimes(1);
    });
  });
});

describe("d-2b — runFullAnalysis : routing EXACT (OFF strict + version de graphe, lock Codex #1)", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRoutingOrchestrator(stepwise: boolean, stopAfterThesis = false) {
    const orch = new AgentOrchestrator() as unknown as RoutingPrivateMethods;
    orch.initializeFullAnalysisRun = vi
      .fn()
      .mockResolvedValue({ stepwise, stopAfterThesis, analysis: { id: "a1" } }) as RoutingPrivateMethods["initializeFullAnalysisRun"];
    orch.runFullAnalysisPipeline = vi
      .fn()
      .mockResolvedValue({ sessionId: "a1", success: true }) as RoutingPrivateMethods["runFullAnalysisPipeline"];
    orch.runFullAnalysisStepwise = vi
      .fn()
      .mockResolvedValue({ sessionId: "a1-stepwise", success: true }) as RoutingPrivateMethods["runFullAnalysisStepwise"];
    orch.runFullAnalysisStepwiseV3 = vi
      .fn()
      .mockResolvedValue({ sessionId: "a1-stepwise-v3", success: true }) as RoutingPrivateMethods["runFullAnalysisStepwiseV3"];
    return orch;
  }

  const callsOf = (fn: unknown) => (fn as unknown as { mock: { calls: unknown[] } }).mock.calls;

  it("OFF strict (stepwise=false) → runFullAnalysisPipeline direct, peu importe la version", async () => {
    for (const advancedOptions of [{}, { stepwiseGraphVersion: 1 }, { stepwiseGraphVersion: 2 }, { stepwiseGraphVersion: 3 }]) {
      const orch = makeRoutingOrchestrator(false);
      const r = await orch.runFullAnalysis({}, "deal_1", undefined, advancedOptions);
      expect(r).toMatchObject({ sessionId: "a1" });
      expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(1);
      expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(0);
      expect(callsOf(orch.runFullAnalysisStepwiseV3)).toHaveLength(0);
    }
  });

  it("ON + undefined|1 → driver « 1 step englobante » (back-compat), PAS le graphe v2", async () => {
    for (const advancedOptions of [{}, { stepwiseGraphVersion: 1 }]) {
      const orch = makeRoutingOrchestrator(true);
      const r = await orch.runFullAnalysis({}, "deal_1", undefined, advancedOptions);
      expect(r).toMatchObject({ sessionId: "a1" }); // driver retourne le liveResult de runFullAnalysisPipeline
      expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(1);
      expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(0);
    }
  });

  it("ON + version 2 → runFullAnalysisStepwise (graphe multi-unités)", async () => {
    const orch = makeRoutingOrchestrator(true);
    const r = await orch.runFullAnalysis({}, "deal_1", undefined, { stepwiseGraphVersion: 2 });
    expect(r).toMatchObject({ sessionId: "a1-stepwise" });
    expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(1);
    expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(0);
  });

  it("ON + version 2 + stopAfterThesis → single-pass (invariant : v2 ne voit jamais stopAfterThesis)", async () => {
    const orch = makeRoutingOrchestrator(true, true);
    const r = await orch.runFullAnalysis({}, "deal_1", undefined, { stepwiseGraphVersion: 2 });
    expect(r).toMatchObject({ sessionId: "a1" });
    expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(1);
    expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(0);
  });

  it("ON + version 3 → runFullAnalysisStepwiseV3 (graphe FIN Tier1 per-phase + post-tier1-glue)", async () => {
    const orch = makeRoutingOrchestrator(true);
    const r = await orch.runFullAnalysis({}, "deal_1", undefined, { stepwiseGraphVersion: 3 });
    expect(r).toMatchObject({ sessionId: "a1-stepwise-v3" });
    expect(callsOf(orch.runFullAnalysisStepwiseV3)).toHaveLength(1);
    expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(0);
    expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(0);
  });

  it("ON + version 3 + stopAfterThesis → single-pass (invariant : v3 ne voit jamais stopAfterThesis)", async () => {
    const orch = makeRoutingOrchestrator(true, true);
    const r = await orch.runFullAnalysis({}, "deal_1", undefined, { stepwiseGraphVersion: 3 });
    expect(r).toMatchObject({ sessionId: "a1" });
    expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(1);
    expect(callsOf(orch.runFullAnalysisStepwiseV3)).toHaveLength(0);
  });

  it("ON + version inconnue (4, worker obsolète vs dispatch) → LÈVE, aucun graphe ne tourne", async () => {
    const orch = makeRoutingOrchestrator(true);
    await expect(orch.runFullAnalysis({}, "deal_1", undefined, { stepwiseGraphVersion: 4 })).rejects.toThrow(
      /version de graphe 4 non supportée/,
    );
    expect(callsOf(orch.runFullAnalysisPipeline)).toHaveLength(0);
    expect(callsOf(orch.runFullAnalysisStepwise)).toHaveLength(0);
    expect(callsOf(orch.runFullAnalysisStepwiseV3)).toHaveLength(0);
  });
});
