import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  analysisCount: vi.fn(),
  analysisFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
  thesisFindFirst: vi.fn(),
  recordDealAnalysis: vi.fn(),
  evaluateDealDocumentReadiness: vi.fn(),
  inngestSend: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      count: mocks.analysisCount,
      findFirst: mocks.analysisFindFirst,
    },
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/agents", () => ({
  orchestrator: {},
}));

vi.mock("@/services/deal-limits", () => ({
  recordDealAnalysis: mocks.recordDealAnalysis,
  getUsageStatus: vi.fn(),
}));

vi.mock("@/services/credits", () => ({
  refundCredits: vi.fn(),
  getActionForAnalysisType: vi.fn(),
}));

vi.mock("@/services/documents/extraction-runs", () => ({
  evaluateDealDocumentReadiness: mocks.evaluateDealDocumentReadiness,
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { POST } = await import("../route");

describe("POST /api/analyze thesis-first contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.analysisCount.mockResolvedValue(0);
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
    mocks.thesisFindFirst.mockResolvedValue(null);
    mocks.recordDealAnalysis.mockResolvedValue({ success: true, remainingDeals: 4 });
    mocks.evaluateDealDocumentReadiness.mockResolvedValue({ ready: true });
    mocks.inngestSend.mockResolvedValue(undefined);
  });

  it("refuse publiquement full_dd et indique le remplacement thesis-first", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "deal_legacy",
        type: "full_dd",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      retiredType: "full_dd",
      replacement: "full_analysis",
    });
    expect(String(payload.error)).toContain("Legacy analysis type 'full_dd' is no longer accepted");
    expect(String(payload.error)).toContain("thesis-first Deep Dive flow");
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("ne considere comme resumable qu'un run full_analysis aligne a la these active", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce(null) // resumable lookup
      .mockResolvedValueOnce(null); // running analysis lookup

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    await POST(request as never);

    expect(mocks.analysisFindFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        dealId: "cm1234567890123456789012",
        mode: "full_analysis",
        thesisId: "thesis_active",
      }),
    }));
  });
});
