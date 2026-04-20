import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  dealFindMany: vi.fn(),
  dealCount: vi.fn(),
  apiSuccess: vi.fn(),
  apiError: vi.fn(),
  handleApiError: vi.fn(),
  createApiTimer: vi.fn(),
  loadCanonicalDealSignals: vi.fn(),
  getCurrentFactString: vi.fn(),
  getCurrentFactNumber: vi.fn(),
  resolveCanonicalAnalysisScores: vi.fn(),
}));

vi.mock("../../middleware", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findMany: mocks.dealFindMany,
      count: mocks.dealCount,
      create: vi.fn(),
    },
  },
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  loadCanonicalDealSignals: mocks.loadCanonicalDealSignals,
  getCurrentFactString: mocks.getCurrentFactString,
  getCurrentFactNumber: mocks.getCurrentFactNumber,
  resolveCanonicalAnalysisScores: mocks.resolveCanonicalAnalysisScores,
}));

vi.mock("@/lib/api-key-auth", () => ({
  apiSuccess: mocks.apiSuccess,
  apiError: mocks.apiError,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/lib/api-logger", () => ({
  createApiTimer: mocks.createApiTimer,
}));

const timer = {
  setContext: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};

const successResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta: {} }), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const { GET } = await import("../route");

describe("GET /api/v1/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ userId: "user_1", keyId: "key_1" });
    mocks.apiSuccess.mockImplementation(successResponse);
    mocks.apiError.mockImplementation(errorResponse);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "unknown", 500)
    );
    mocks.createApiTimer.mockReturnValue(timer);
    mocks.dealCount.mockResolvedValue(1);
  });

  it("returns canonical deal metrics from current facts and the thesis-linked completed analysis", async () => {
    mocks.dealFindMany.mockResolvedValue([
      {
        id: "deal_1",
        name: "Legacy Deal",
        companyName: "Legacy Company",
        sector: "SaaS",
        stage: "SEED",
        status: "IN_DD",
        geography: "FR",
        globalScore: 11,
        valuationPre: 1_500_000,
        arr: 250_000,
        createdAt: new Date("2026-04-10T10:00:00Z"),
        updatedAt: new Date("2026-04-20T10:00:00Z"),
        _count: { documents: 3, redFlags: 1 },
      },
    ]);
    mocks.loadCanonicalDealSignals.mockResolvedValue({
      factMapByDealId: new Map([["deal_1", new Map()]]),
    });
    mocks.getCurrentFactString.mockReturnValue("Canonical Co");
    mocks.getCurrentFactNumber.mockImplementation((_: unknown, factKey: string) => {
      if (factKey === "financial.valuation_pre") return 9_000_000;
      if (factKey === "financial.arr") return 1_200_000;
      return null;
    });
    mocks.resolveCanonicalAnalysisScores.mockReturnValue({
      globalScore: 91,
      teamScore: null,
      marketScore: null,
      productScore: null,
      financialsScore: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/v1/deals?page=1&limit=20")
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.deals).toEqual([
      expect.objectContaining({
        id: "deal_1",
        companyName: "Canonical Co",
        globalScore: 91,
        valuationPre: 9_000_000,
        arr: 1_200_000,
        documentsCount: 3,
        redFlagsCount: 1,
      }),
    ]);
    expect(payload.data.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });
});
