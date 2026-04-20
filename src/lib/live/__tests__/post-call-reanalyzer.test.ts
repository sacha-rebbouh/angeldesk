import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runAnalysisMock,
  clearContextCacheMock,
  completeJSONMock,
  loadResultsMock,
  getCorpusSnapshotDocumentIdsMock,
} = vi.hoisted(() => ({
  runAnalysisMock: vi.fn(),
  clearContextCacheMock: vi.fn(),
  completeJSONMock: vi.fn(),
  loadResultsMock: vi.fn(),
  getCorpusSnapshotDocumentIdsMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findUnique: vi.fn(),
    },
    analysis: {
      findFirst: vi.fn(),
    },
    sessionSummary: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/agents/orchestrator", () => ({
  AgentOrchestrator: class {
    runAnalysis = runAnalysisMock;
  },
}));

vi.mock("@/lib/live/context-compiler", () => ({
  clearContextCache: clearContextCacheMock,
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: completeJSONMock,
  runWithLLMContext: vi.fn((_ctx, fn) => fn()),
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: loadResultsMock,
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: getCorpusSnapshotDocumentIdsMock,
}));

import { prisma } from "@/lib/prisma";
import {
  generateDeltaReport,
  triggerTargetedReanalysis,
} from "@/lib/live/post-call-reanalyzer";

describe("post-call-reanalyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("anchors reanalysis on the pre-call snapshot plus the session transcript", async () => {
    vi.mocked(prisma.liveSession.findUnique).mockResolvedValue({
      id: "session_1",
      dealId: "deal_1",
      documentId: "call_doc",
      startedAt: new Date("2026-04-10T10:00:00.000Z"),
      createdAt: new Date("2026-04-10T09:55:00.000Z"),
    } as never);
    vi.mocked(prisma.analysis.findFirst).mockResolvedValue({
      id: "analysis_pre",
      summary: "Baseline pre-call",
      corpusSnapshotId: "snap_pre",
      documentIds: [],
    } as never);
    getCorpusSnapshotDocumentIdsMock.mockResolvedValue(["doc_a", "doc_b"]);
    runAnalysisMock.mockResolvedValue({
      sessionId: "analysis_post",
      dealId: "deal_1",
      type: "full_analysis",
      success: true,
      results: {},
      totalCost: 1.2,
      totalTimeMs: 1200,
    });

    const result = await triggerTargetedReanalysis(
      "deal_1",
      ["financial-auditor", "memo-generator"],
      "session_1"
    );

    expect(clearContextCacheMock).toHaveBeenCalledWith("deal_1");
    expect(getCorpusSnapshotDocumentIdsMock).toHaveBeenCalledWith("snap_pre");
    expect(runAnalysisMock).toHaveBeenCalledWith({
      dealId: "deal_1",
      type: "full_analysis",
      forceRefresh: true,
      isUpdate: true,
      analysisModeOverride: "post_call_reanalysis",
      documentIds: ["doc_a", "doc_b", "call_doc"],
    });
    expect(result).toEqual({
      analysisId: "analysis_post",
      baselineAnalysisId: "analysis_pre",
      documentIds: ["doc_a", "doc_b", "call_doc"],
    });
  });

  it("builds delta reports from the pre-call baseline analysis, not the latest arbitrary run", async () => {
    vi.mocked(prisma.sessionSummary.findUnique).mockResolvedValue({
      sessionId: "session_1",
      executiveSummary: "Resume du call",
      newInformation: [{ fact: "ARR a 1.5M", impact: "hausse", agentsAffected: ["financial-auditor"] }],
      contradictions: [],
      questionsAsked: [],
      remainingQuestions: [],
    } as never);
    vi.mocked(prisma.liveSession.findUnique).mockResolvedValue({
      id: "session_1",
      dealId: "deal_1",
      documentId: "call_doc",
      startedAt: new Date("2026-04-10T10:00:00.000Z"),
      createdAt: new Date("2026-04-10T09:55:00.000Z"),
    } as never);
    vi.mocked(prisma.analysis.findFirst).mockResolvedValue({
      id: "analysis_pre",
      summary: "Baseline pre-call",
      corpusSnapshotId: null,
      documentIds: ["doc_a", "doc_b"],
    } as never);
    loadResultsMock.mockResolvedValue({
      "financial-auditor": { success: true, data: { arr: "1.2M" } },
    });
    completeJSONMock.mockResolvedValue({
      data: {
        newFacts: [],
        contradictions: [],
        resolvedQuestions: [],
        impactedAgents: ["financial-auditor"],
        confidenceChange: { before: "medium", after: "high", reason: "better clarity" },
      },
    });

    await generateDeltaReport("session_1", "deal_1");

    expect(loadResultsMock).toHaveBeenCalledWith("analysis_pre");
    expect(completeJSONMock).toHaveBeenCalledTimes(1);
    expect(completeJSONMock.mock.calls[0]?.[0]).toContain("Baseline pre-call");
    expect(completeJSONMock.mock.calls[0]?.[0]).toContain("financial-auditor");
    expect(prisma.analysis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dealId: "deal_1",
          status: "COMPLETED",
          completedAt: {
            lte: new Date("2026-04-10T10:00:00.000Z"),
          },
        }),
      })
    );
  });
});
