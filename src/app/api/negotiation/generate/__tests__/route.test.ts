import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  analysisFindFirst: vi.fn(),
  analysisUpdate: vi.fn(),
  loadResults: vi.fn(),
  assertFeatureAccess: vi.fn(),
  getLatestThesis: vi.fn(),
  resolveSourceScope: vi.fn(),
  generateNegotiationStrategy: vi.fn(),
  normalizeThesisEvaluation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findFirst: mocks.analysisFindFirst,
      update: mocks.analysisUpdate,
    },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/credits/feature-access", () => ({
  assertFeatureAccess: mocks.assertFeatureAccess,
  FeatureAccessError: class FeatureAccessError extends Error {},
  serializeFeatureAccessError: vi.fn(),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.getLatestThesis,
    resolveSourceScope: mocks.resolveSourceScope,
  },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: mocks.normalizeThesisEvaluation,
}));

vi.mock("@/services/negotiation/strategist", () => ({
  generateNegotiationStrategy: mocks.generateNegotiationStrategy,
}));

// ARC-LIGHT Phase 1 gate: neutralize for these flow tests. Dedicated gate
// coverage lives in __tests__/route-gate.test.ts.
vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertAnalysisCorpusReady: vi.fn().mockResolvedValue(undefined),
    assertDealCorpusReady: vi.fn().mockResolvedValue(undefined),
  };
});

const { GET, POST } = await import("../route");

describe("/api/negotiation/generate cache + thesis alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.assertFeatureAccess.mockResolvedValue(undefined);
    mocks.loadResults.mockResolvedValue({
      "financial-auditor": { success: true, data: {} },
    });
    mocks.normalizeThesisEvaluation.mockReturnValue({
      thesisQuality: { verdict: "favorable", summary: "ok" },
      investorProfileFit: { verdict: "favorable", summary: "ok" },
      dealAccessibility: { verdict: "favorable", summary: "ok" },
    });
    mocks.resolveSourceScope.mockImplementation(async (thesis: { corpusSnapshotId?: string | null; sourceHash?: string }) => ({
      corpusSnapshotId: thesis.corpusSnapshotId ?? null,
      sourceDocumentIds: [],
      sourceHash: thesis.sourceHash ?? "hash_latest",
      isCanonicalSnapshot: !!thesis.corpusSnapshotId,
    }));
    mocks.generateNegotiationStrategy.mockResolvedValue({
      dealName: "Deal",
      generatedAt: "2026-04-17T00:00:00.000Z",
      overallLeverage: "moderate",
      leverageRationale: "Aligned thesis",
      negotiationPoints: [],
      dealbreakers: [],
      tradeoffs: [],
      suggestedApproach: "Proceed carefully",
      keyArguments: [],
    });
    mocks.analysisUpdate.mockResolvedValue(undefined);
  });

  it("refuses POST when the analysis is no longer aligned with the latest canonical thesis", async () => {
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: "thesis_old",
      thesisBypass: false,
      negotiationStrategy: null,
    });
    mocks.getLatestThesis.mockResolvedValue({
      id: "thesis_latest",
      verdict: "favorable",
      confidence: 88,
      reformulated: "Canonical thesis",
      ycLens: {},
      thielLens: {},
      angelDeskLens: {},
      sourceHash: "hash_latest",
      decision: "continue",
      updatedAt: new Date("2026-04-17T10:00:00.000Z"),
    });

    const request = new Request("http://localhost/api/negotiation/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dealId: "ck12345678901234567890123",
        analysisId: "ck12345678901234567890124",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("latest canonical thesis");
    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_1");
    expect(mocks.generateNegotiationStrategy).not.toHaveBeenCalled();
    expect(mocks.analysisUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the canonical results loader finds no persisted results", async () => {
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: "thesis_1",
      thesisBypass: false,
      negotiationStrategy: null,
    });
    mocks.loadResults.mockResolvedValue(null);

    const request = new Request("http://localhost/api/negotiation/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dealId: "ck12345678901234567890123",
        analysisId: "ck12345678901234567890124",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(String(payload.error)).toContain("Analysis not found or has no results");
    expect(mocks.generateNegotiationStrategy).not.toHaveBeenCalled();
  });

  it("returns 400 when the canonical results payload is empty", async () => {
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: "thesis_1",
      thesisBypass: false,
      negotiationStrategy: null,
    });
    mocks.loadResults.mockResolvedValue({});
    mocks.getLatestThesis.mockResolvedValue({
      id: "thesis_1",
      verdict: "favorable",
      confidence: 88,
      reformulated: "Canonical thesis",
      ycLens: {},
      thielLens: {},
      angelDeskLens: {},
      sourceHash: "hash_latest",
      decision: "continue",
      updatedAt: new Date("2026-04-17T10:00:00.000Z"),
      corpusSnapshotId: null,
    });

    const request = new Request("http://localhost/api/negotiation/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dealId: "ck12345678901234567890123",
        analysisId: "ck12345678901234567890124",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(String(payload.error)).toContain("no agent results");
    expect(mocks.generateNegotiationStrategy).not.toHaveBeenCalled();
  });

  it("generates a strategy from results loaded via the canonical loader", async () => {
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: "thesis_1",
      thesisBypass: false,
      negotiationStrategy: null,
    });
    mocks.loadResults.mockResolvedValue({
      "financial-auditor": {
        success: true,
        data: {
          score: { value: 72 },
          findings: {
            valuationAnalysis: { currentValuation: 1000000 },
          },
          redFlags: [{ severity: "medium", title: "Burn", description: "High burn" }],
        },
      },
      "synthesis-deal-scorer": {
        success: true,
        data: {
          overallScore: 81,
          verdict: "invest",
          keyStrengths: ["Growth"],
          keyWeaknesses: ["Burn"],
        },
      },
    });
    mocks.getLatestThesis.mockResolvedValue({
      id: "thesis_1",
      verdict: "favorable",
      confidence: 88,
      reformulated: "Canonical thesis",
      ycLens: {},
      thielLens: {},
      angelDeskLens: {},
      sourceHash: "hash_latest",
      decision: "continue",
      updatedAt: new Date("2026-04-17T10:00:00.000Z"),
      corpusSnapshotId: null,
    });

    const request = new Request("http://localhost/api/negotiation/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dealId: "ck12345678901234567890123",
        analysisId: "ck12345678901234567890124",
        dealName: "Deal",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_1");
    expect(mocks.generateNegotiationStrategy).toHaveBeenCalledWith(
      "Deal",
      expect.objectContaining({
        financialAuditor: expect.objectContaining({
          score: { value: 72 },
        }),
        synthesisDealScorer: expect.objectContaining({
          overallScore: 81,
          verdict: "invest",
        }),
        thesis: expect.objectContaining({
          verdict: "favorable",
          confidence: 88,
        }),
      }),
    );
    expect(mocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ck12345678901234567890124" },
      }),
    );
  });

  it("invalidates legacy or stale cached strategies on GET instead of returning them", async () => {
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: "thesis_1",
      thesisBypass: false,
      negotiationStrategy: {
        dealName: "Deal",
        generatedAt: "2026-04-16T00:00:00.000Z",
        overallLeverage: "moderate",
        leverageRationale: "stale",
        negotiationPoints: [],
        dealbreakers: [],
        tradeoffs: [],
        suggestedApproach: "stale",
        keyArguments: [],
      },
    });
    mocks.getLatestThesis.mockResolvedValue({
      id: "thesis_1",
      sourceHash: "hash_current",
      decision: "continue",
      updatedAt: new Date("2026-04-17T10:00:00.000Z"),
    });

    const request = new Request(
      "http://localhost/api/negotiation/generate?dealId=ck12345678901234567890123&analysisId=ck12345678901234567890124",
      { method: "GET" },
    );

    const response = await GET(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.strategy).toBeNull();
    expect(payload.canonicalAligned).toBe(true);
  });
});
