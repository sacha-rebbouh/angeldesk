import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  getDealWithRelations: vi.fn(),
}));

const thesisMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  applyReconciliation: vi.fn(),
}));

vi.mock("../persistence", () => ({
  getDealWithRelations: persistenceMocks.getDealWithRelations,
  createAnalysis: vi.fn(),
  updateAnalysisProgress: vi.fn(),
  completeAnalysis: vi.fn(),
  persistStateTransition: vi.fn(),
  persistReasoningTrace: vi.fn(),
  persistScoredFindings: vi.fn(),
  persistDebateRecord: vi.fn(),
  processAgentResult: vi.fn(),
  updateDealStatus: vi.fn(),
  findInterruptedAnalyses: vi.fn(),
  loadAnalysisForRecovery: vi.fn(),
  markAnalysisAsFailed: vi.fn(),
  loadPreviousAnalysisQuestions: vi.fn(),
  saveCheckpoint: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  runWithLLMContext: vi.fn(async (_context, fn: () => unknown) => await fn()),
  setAnalysisContext: vi.fn(),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getById: thesisMocks.getById,
    applyReconciliation: thesisMocks.applyReconciliation,
  },
}));

const { AgentOrchestrator } = await import("../index");

type OrchestratorPrivateMethods = {
  checkAnalysisCache: (...args: unknown[]) => Promise<unknown>;
  runFullAnalysis: (...args: unknown[]) => Promise<unknown>;
  rehydrateResumeThesis: (
    analysisId: string,
    thesisId: string | null | undefined,
    enrichedContext: Record<string, unknown>
  ) => Promise<void>;
  applyThesisReconciliation: (
    enrichedContext: Record<string, unknown>,
    agentResult: Record<string, unknown>
  ) => Promise<void>;
};

describe("AgentOrchestrator cache behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.getDealWithRelations.mockResolvedValue({
      id: "deal_1",
      name: "Deal 1",
      userId: "user_1",
      documents: [],
    });
    thesisMocks.getById.mockReset();
    thesisMocks.applyReconciliation.mockReset();
  });

  it("never serves full_analysis from the generic analysis cache", async () => {
    const orchestrator = new AgentOrchestrator();
    const privateOrchestrator = orchestrator as unknown as OrchestratorPrivateMethods;

    const checkCacheSpy = vi
      .spyOn(privateOrchestrator, "checkAnalysisCache")
      .mockResolvedValue({
        sessionId: "analysis_cached",
        dealId: "deal_1",
        type: "full_analysis",
        success: true,
        results: {},
        totalCost: 0,
        totalTimeMs: 0,
        fromCache: true,
      });

    const runFullAnalysisSpy = vi
      .spyOn(privateOrchestrator, "runFullAnalysis")
      .mockResolvedValue({
        sessionId: "analysis_live",
        dealId: "deal_1",
        type: "full_analysis",
        success: true,
        results: {},
        totalCost: 1,
        totalTimeMs: 10,
      });

    await orchestrator.runAnalysis({
      dealId: "deal_1",
      type: "full_analysis",
    });

    expect(checkCacheSpy).not.toHaveBeenCalled();
    expect(runFullAnalysisSpy).toHaveBeenCalled();
  });

  it("rehydrates the thesis bound to the analysis instead of the latest thesis", async () => {
    thesisMocks.getById.mockResolvedValue({
      id: "thesis_bound",
      isLatest: true,
      reformulated: "Bound thesis",
      problem: "Problem",
      solution: "Solution",
      whyNow: "Why now",
      moat: null,
      pathToExit: null,
      verdict: "favorable",
      confidence: 73,
      loadBearing: [],
      alerts: [],
      ycLens: { verdict: "favorable" },
      thielLens: { verdict: "contrasted" },
      angelDeskLens: { verdict: "favorable" },
    });

    const orchestrator = new AgentOrchestrator();
    const privateOrchestrator = orchestrator as unknown as OrchestratorPrivateMethods;
    const enrichedContext: Record<string, unknown> = {};

    await privateOrchestrator.rehydrateResumeThesis("analysis_1", "thesis_bound", enrichedContext);

    expect(thesisMocks.getById).toHaveBeenCalledWith("thesis_bound");
    expect(enrichedContext.thesis).toMatchObject({
      id: "thesis_bound",
      verdict: "favorable",
      confidence: 73,
    });
  });

  it("refuses to rehydrate a superseded thesis during resume", async () => {
    thesisMocks.getById.mockResolvedValue({
      id: "thesis_old",
      isLatest: false,
      reformulated: "Old thesis",
      problem: "Problem",
      solution: "Solution",
      whyNow: "Why now",
      moat: null,
      pathToExit: null,
      verdict: "vigilance",
      confidence: 41,
      loadBearing: [],
      alerts: [],
      ycLens: { verdict: "vigilance" },
      thielLens: { verdict: "vigilance" },
      angelDeskLens: { verdict: "vigilance" },
    });

    const orchestrator = new AgentOrchestrator();
    const privateOrchestrator = orchestrator as unknown as OrchestratorPrivateMethods;

    await expect(
      privateOrchestrator.rehydrateResumeThesis("analysis_1", "thesis_old", {})
    ).rejects.toThrow("has been superseded");
  });

  it("skips reconciliation when the hydrated thesis does not match the analysis binding", async () => {
    const orchestrator = new AgentOrchestrator();
    const privateOrchestrator = orchestrator as unknown as OrchestratorPrivateMethods;

    await privateOrchestrator.applyThesisReconciliation(
      {
        analysis: { id: "analysis_1", thesisId: "thesis_bound" },
        thesis: { id: "thesis_other" },
      },
      {
        success: true,
        data: {
          updatedVerdict: "contrasted",
          updatedConfidence: 60,
          verdictChanged: true,
        },
      }
    );

    expect(thesisMocks.applyReconciliation).not.toHaveBeenCalled();
  });

  it("skips thesis reconciliation persistence for post-call reanalysis runs", async () => {
    const orchestrator = new AgentOrchestrator();
    const privateOrchestrator = orchestrator as unknown as OrchestratorPrivateMethods;

    await privateOrchestrator.applyThesisReconciliation(
      {
        analysis: {
          id: "analysis_post_call",
          mode: "post_call_reanalysis",
          thesisId: "thesis_bound",
        },
        thesis: { id: "thesis_bound" },
      },
      {
        success: true,
        data: {
          updatedVerdict: "contrasted",
          updatedConfidence: 61,
          verdictChanged: true,
        },
      }
    );

    expect(thesisMocks.applyReconciliation).not.toHaveBeenCalled();
  });
});
