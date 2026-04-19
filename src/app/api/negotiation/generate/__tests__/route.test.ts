import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  analysisFindFirst: vi.fn(),
  analysisUpdate: vi.fn(),
  assertFeatureAccess: vi.fn(),
  getLatestThesis: vi.fn(),
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

vi.mock("@/services/credits/feature-access", () => ({
  assertFeatureAccess: mocks.assertFeatureAccess,
  FeatureAccessError: class FeatureAccessError extends Error {},
  serializeFeatureAccessError: vi.fn(),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.getLatestThesis,
  },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: mocks.normalizeThesisEvaluation,
}));

vi.mock("@/services/negotiation/strategist", () => ({
  generateNegotiationStrategy: mocks.generateNegotiationStrategy,
}));

const { GET, POST } = await import("../route");

describe("/api/negotiation/generate cache + thesis alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.assertFeatureAccess.mockResolvedValue(undefined);
    mocks.normalizeThesisEvaluation.mockReturnValue({
      thesisQuality: { verdict: "favorable", summary: "ok" },
      investorProfileFit: { verdict: "favorable", summary: "ok" },
      dealAccessibility: { verdict: "favorable", summary: "ok" },
    });
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
      results: {
        "financial-auditor": { success: true, data: {} },
      },
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
    expect(mocks.generateNegotiationStrategy).not.toHaveBeenCalled();
    expect(mocks.analysisUpdate).not.toHaveBeenCalled();
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
