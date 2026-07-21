import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractFactsFromDealContext: vi.fn(),
  persistExtractedFactsWithMatching: vi.fn(),
  formatFactStoreForAgents: vi.fn(),
}));

vi.mock("@/services/context-engine/fact-normalizer", () => ({
  extractFactsFromDealContext: mocks.extractFactsFromDealContext,
}));

vi.mock("@/services/openrouter/router", () => ({
  runWithLLMContext: vi.fn((_context: unknown, fn: () => unknown) => fn()),
  setAnalysisContext: vi.fn(),
}));

vi.mock("@/services/fact-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fact-store")>();
  return {
    ...actual,
    persistExtractedFactsWithMatching: mocks.persistExtractedFactsWithMatching,
    formatFactStoreForAgents: mocks.formatFactStoreForAgents,
  };
});

const { AgentOrchestrator } = await import("../index");
const { logger } = await import("@/lib/logger");

type OrchestratorPrivateMethods = {
  mergeContextEngineFacts: (
    dealId: string,
    contextEngineData: Record<string, unknown>,
    currentFactStore: []
  ) => Promise<unknown>;
};

describe("Context Engine fact contradiction logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractFactsFromDealContext.mockReturnValue([
      { factKey: "financial.arr" },
    ]);
    mocks.formatFactStoreForAgents.mockReturnValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a stable log for each SIGNIFICANT contradiction", async () => {
    mocks.persistExtractedFactsWithMatching.mockResolvedValue({
      success: true,
      createdCount: 0,
      supersededCount: 1,
      ignoredCount: 0,
      pendingReviewCount: 0,
      contradictions: [
        {
          factKey: "financial.arr",
          existingValue: 1000000,
          newValue: 1200000,
          existingSource: "PITCH_DECK",
          newSource: "CONTEXT_ENGINE",
          deltaPercent: 0.2,
          significance: "SIGNIFICANT",
        },
      ],
      currentFacts: [],
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const orchestrator = new AgentOrchestrator() as unknown as OrchestratorPrivateMethods;

    await orchestrator.mergeContextEngineFacts("deal_1", {}, []);

    expect(warnSpy).toHaveBeenCalledWith(
      "[FactContradiction] dealId=deal_1 factKey=financial.arr " +
        "significance=SIGNIFICANT existing=1000000 new=1200000"
    );
  });
});
