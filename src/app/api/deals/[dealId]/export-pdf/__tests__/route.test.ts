import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  analysisFindFirst: vi.fn(),
  factEventFindMany: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  thesisFindFirst: vi.fn(),
  thesisGetById: vi.fn(),
  thesisGetLatest: vi.fn(),
  loadResults: vi.fn(),
  normalizeThesisEvaluation: vi.fn(),
  generateAnalysisPdf: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    analysis: {
      findFirst: mocks.analysisFindFirst,
      findMany: mocks.analysisFindMany,
    },
    factEvent: {
      findMany: mocks.factEventFindMany,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getById: mocks.thesisGetById,
    getLatest: mocks.thesisGetLatest,
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: mocks.normalizeThesisEvaluation,
}));

vi.mock("@/lib/pdf/generate-analysis-pdf", () => ({
  generateAnalysisPdf: mocks.generateAnalysisPdf,
}));

// ARC-LIGHT Phase 1 gate: these existing flow tests are not about the gate,
// so neutralize it here. Gate coverage lives in __tests__/route-gate.test.ts.
vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertAnalysisCorpusReady: vi.fn().mockResolvedValue(undefined),
    assertDealCorpusReady: vi.fn().mockResolvedValue(undefined),
  };
});

const { GET } = await import("../route");

const baseDeal = {
  id: "deal_1",
  name: "Deal 1",
  companyName: "Company 1",
  sector: "SaaS",
  stage: "Seed",
  geography: "FR",
  valuationPre: 1_500_000,
  amountRequested: 500_000,
  arr: 300_000,
  growthRate: 120,
  website: "https://example.com",
  description: "Deal description",
  founders: [],
  redFlags: [],
};

const baseAnalysis = {
  id: "analysis_1",
  thesisId: null,
  corpusSnapshotId: "snap_analysis",
  type: "FULL_DD",
  status: "COMPLETED",
  completedAt: new Date("2026-04-20T08:00:00.000Z"),
  totalAgents: 12,
  completedAgents: 12,
  negotiationStrategy: null,
};

const matchedThesis = {
  id: "thesis_snapshot",
  corpusSnapshotId: "snap_analysis",
  reformulated: "Snapshot thesis",
  verdict: "favorable",
  confidence: 84,
  ycLens: {},
  thielLens: {},
  angelDeskLens: {},
};

describe("GET /api/deals/[dealId]/export-pdf thesis pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue(baseDeal);
    mocks.analysisFindFirst.mockResolvedValue(baseAnalysis);
    mocks.factEventFindMany.mockResolvedValue([]);
    mocks.getCurrentFactsFromView.mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "company.name",
        category: "OTHER",
        currentValue: "Canonical Company 1",
        currentDisplayValue: "Canonical Company 1",
        currentSource: "PITCH_DECK",
        currentConfidence: 95,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "other.website",
        category: "OTHER",
        currentValue: "https://canonical.example",
        currentDisplayValue: "https://canonical.example",
        currentSource: "CONTEXT_ENGINE",
        currentConfidence: 88,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.arr",
        category: "FINANCIAL",
        currentValue: 1_200_000,
        currentDisplayValue: "€1.2M",
        currentSource: "DATA_ROOM",
        currentConfidence: 97,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
    ]);
    mocks.analysisFindMany.mockResolvedValue([]);
    mocks.thesisGetById.mockResolvedValue(null);
    mocks.thesisGetLatest.mockResolvedValue(matchedThesis);
    mocks.thesisFindFirst.mockResolvedValue(matchedThesis);
    mocks.loadResults.mockResolvedValue({
      "synthesis-deal-scorer": {
        success: true,
        data: { overallScore: 81 },
      },
    });
    mocks.normalizeThesisEvaluation.mockReturnValue({
      thesisQuality: { verdict: "favorable", summary: "Aligned" },
      investorProfileFit: { verdict: "favorable", summary: "Aligned" },
      dealAccessibility: { verdict: "favorable", summary: "Aligned" },
    });
    mocks.generateAnalysisPdf.mockResolvedValue(Buffer.from("pdf"));
  });

  it("uses the thesis aligned by corpus snapshot when the analysis has no thesisId", async () => {
    const request = new NextRequest(
      "http://localhost/api/deals/deal_1/export-pdf?analysisId=analysis_1"
    );

    const response = await GET(request, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.thesisFindFirst).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        corpusSnapshotId: "snap_analysis",
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });

    const exportPayload = mocks.generateAnalysisPdf.mock.calls[0]?.[0];
    expect(exportPayload.thesis?.reformulated).toBe("Snapshot thesis");
    expect(exportPayload.deal.companyName).toBe("Canonical Company 1");
    expect(exportPayload.deal.website).toBe("https://canonical.example");
    expect(exportPayload.deal.arr).toBe(1_200_000);
  });

  it("does not attach an unrelated latest thesis when no linked thesis can be resolved", async () => {
    mocks.thesisFindFirst.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/deals/deal_1/export-pdf?analysisId=analysis_1"
    );

    const response = await GET(request, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(response.status).toBe(200);

    const exportPayload = mocks.generateAnalysisPdf.mock.calls[0]?.[0];
    expect(exportPayload.thesis).toBeNull();
  });

  it("uses the canonical analysis aligned to the latest thesis when no analysisId is provided", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      {
        ...baseAnalysis,
        id: "analysis_old",
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
        dealId: "deal_1",
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        completedAt: new Date("2026-04-20T08:00:00.000Z"),
      },
      {
        ...baseAnalysis,
        id: "analysis_canonical",
        thesisId: null,
        corpusSnapshotId: "snap_analysis",
        dealId: "deal_1",
        createdAt: new Date("2026-04-19T08:00:00.000Z"),
        completedAt: new Date("2026-04-19T08:00:00.000Z"),
      },
    ]);
    mocks.loadResults.mockResolvedValue({
      "synthesis-deal-scorer": {
        success: true,
        data: { overallScore: 81 },
      },
    });

    const request = new NextRequest(
      "http://localhost/api/deals/deal_1/export-pdf"
    );

    const response = await GET(request, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_canonical");
  });

  it("returns 409 when no completed analysis is aligned to the latest thesis", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      {
        ...baseAnalysis,
        id: "analysis_old",
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
        dealId: "deal_1",
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        completedAt: new Date("2026-04-20T08:00:00.000Z"),
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/deals/deal_1/export-pdf"
    );

    const response = await GET(request, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(response.status).toBe(409);
    expect(mocks.generateAnalysisPdf).not.toHaveBeenCalled();
  });
});
