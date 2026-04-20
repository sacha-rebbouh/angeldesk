import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  dealCount: vi.fn(),
  dealFindMany: vi.fn(),
  handleApiError: vi.fn(),
  loadCanonicalDealSignals: vi.fn(),
  getCurrentFactString: vi.fn(),
  getCurrentFactNumber: vi.fn(),
  resolveCanonicalAnalysisScores: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      count: mocks.dealCount,
      findMany: mocks.dealFindMany,
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  loadCanonicalDealSignals: mocks.loadCanonicalDealSignals,
  getCurrentFactString: mocks.getCurrentFactString,
  getCurrentFactNumber: mocks.getCurrentFactNumber,
  resolveCanonicalAnalysisScores: mocks.resolveCanonicalAnalysisScores,
}));

const { GET } = await import("../route");

describe("GET /api/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.dealCount.mockResolvedValue(1);
    mocks.dealFindMany.mockResolvedValue([
      {
        id: "deal_1",
        name: "Legacy Deal",
        companyName: "Legacy Company",
        website: "https://legacy.example",
        arr: 1000,
        growthRate: 12,
        amountRequested: 100000,
        valuationPre: 1500000,
        globalScore: 11,
        teamScore: 12,
        marketScore: 13,
        productScore: 14,
        financialsScore: 15,
        founders: [],
        documents: [],
        redFlags: [],
        _count: { analyses: 2 },
      },
    ]);
    mocks.loadCanonicalDealSignals.mockResolvedValue({
      factMapByDealId: new Map([["deal_1", new Map()]]),
    });
    mocks.getCurrentFactString
      .mockReturnValueOnce("Canonical Co")
      .mockReturnValueOnce("https://canonical.example");
    mocks.getCurrentFactNumber
      .mockReturnValueOnce(1_200_000)
      .mockReturnValueOnce(88)
      .mockReturnValueOnce(250_000)
      .mockReturnValueOnce(9_000_000);
    mocks.resolveCanonicalAnalysisScores.mockReturnValue({
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
    mocks.handleApiError.mockImplementation((error: unknown) => {
      throw error;
    });
  });

  it("returns canonicalized list data for client deals views", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/deals?page=1&limit=50")
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      website: "https://canonical.example",
      arr: 1_200_000,
      growthRate: 88,
      amountRequested: 250_000,
      valuationPre: 9_000_000,
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
    expect(payload.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: 1,
      totalPages: 1,
      hasMore: false,
    });
  });
});
