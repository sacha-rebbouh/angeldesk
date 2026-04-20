import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindMany: vi.fn(),
  thesisFindMany: vi.fn(),
  analysisFindMany: vi.fn(),
  loadResults: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findMany: mocks.dealFindMany,
    },
    thesis: {
      findMany: mocks.thesisFindMany,
    },
    analysis: {
      findMany: mocks.analysisFindMany,
    },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

const { GET } = await import("../route");

const dealIdOne = "ck12345678901234567890123";
const dealIdTwo = "ck12345678901234567890124";

describe("GET /api/deals/compare canonical analysis selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindMany.mockResolvedValue([
      {
        id: dealIdOne,
        name: "Deal 1",
        sector: "SaaS",
        stage: "Seed",
        globalScore: 11,
        teamScore: 12,
        marketScore: 13,
        productScore: 14,
        financialsScore: 15,
        valuationPre: 2_000_000,
        arr: 400_000,
        growthRate: 110,
        redFlags: [{ severity: "HIGH" }],
      },
      {
        id: dealIdTwo,
        name: "Deal 2",
        sector: "Fintech",
        stage: "Series A",
        globalScore: 61,
        teamScore: 62,
        marketScore: 63,
        productScore: 64,
        financialsScore: 65,
        valuationPre: 8_000_000,
        arr: 900_000,
        growthRate: 70,
        redFlags: [],
      },
    ]);
    mocks.thesisFindMany.mockResolvedValue([
      {
        id: "thesis_active",
        dealId: dealIdOne,
        corpusSnapshotId: "snap_active",
      },
    ]);
    mocks.analysisFindMany.mockResolvedValue([
      {
        id: "analysis_unrelated",
        dealId: dealIdOne,
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
        completedAt: new Date("2026-04-20T09:00:00.000Z"),
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
      },
      {
        id: "analysis_linked",
        dealId: dealIdOne,
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_active",
        completedAt: new Date("2026-04-19T09:00:00.000Z"),
        createdAt: new Date("2026-04-19T08:00:00.000Z"),
      },
      {
        id: "analysis_deal_2",
        dealId: dealIdTwo,
        thesisId: null,
        corpusSnapshotId: null,
        completedAt: new Date("2026-04-18T09:00:00.000Z"),
        createdAt: new Date("2026-04-18T08:00:00.000Z"),
      },
    ]);
    mocks.getCurrentFactsFromView.mockImplementation(async (dealId: string) => {
      if (dealId === dealIdOne) {
        return [
          {
            dealId,
            factKey: "financial.valuation_pre",
            category: "FINANCIAL",
            currentValue: 9_000_000,
            currentDisplayValue: "€9M",
            currentSource: "PITCH_DECK",
            currentConfidence: 90,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          },
          {
            dealId,
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
          {
            dealId,
            factKey: "financial.revenue_growth_yoy",
            category: "FINANCIAL",
            currentValue: 88,
            currentDisplayValue: "88%",
            currentSource: "PITCH_DECK",
            currentConfidence: 90,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          },
        ];
      }

      return [];
    });
  });

  it("prefers the completed analysis linked to the active thesis over newer unrelated analyses", async () => {
    mocks.loadResults.mockImplementation(async (analysisId: string) => {
      if (analysisId === "analysis_linked") {
        return {
          "synthesis-deal-scorer": {
            success: true,
            data: {
              overallScore: 81,
              dimensionScores: [
                { dimension: "Equipe", score: 74 },
                { dimension: "Marche", score: 76 },
                { dimension: "Produit", score: 78 },
                { dimension: "Financials", score: 80 },
              ],
            },
          },
        };
      }

      return null;
    });

    const request = new NextRequest(
      `http://localhost/api/deals/compare?ids=${dealIdOne},${dealIdTwo}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      id: dealIdOne,
      globalScore: 81,
      teamScore: 74,
      marketScore: 76,
      productScore: 78,
      financialsScore: 80,
      valuationPre: 9_000_000,
      arr: 1_200_000,
      growthRate: 88,
      criticalRedFlagCount: 1,
    });
    expect(payload.data[1]).toMatchObject({
      id: dealIdTwo,
      globalScore: 61,
      teamScore: 62,
      marketScore: 63,
      productScore: 64,
      financialsScore: 65,
    });
    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_linked");
    expect(mocks.loadResults).not.toHaveBeenCalledWith("analysis_unrelated");
  });

  it("hides stale scores when the active thesis has no linked completed analysis", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      {
        id: "analysis_unrelated",
        dealId: dealIdOne,
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
        completedAt: new Date("2026-04-20T09:00:00.000Z"),
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
      },
      {
        id: "analysis_deal_2",
        dealId: dealIdTwo,
        thesisId: null,
        corpusSnapshotId: null,
        completedAt: new Date("2026-04-18T09:00:00.000Z"),
        createdAt: new Date("2026-04-18T08:00:00.000Z"),
      },
    ]);
    mocks.loadResults.mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost/api/deals/compare?ids=${dealIdOne},${dealIdTwo}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      id: dealIdOne,
      globalScore: null,
      teamScore: null,
      marketScore: null,
      productScore: null,
      financialsScore: null,
    });
    expect(payload.data[1]).toMatchObject({
      id: dealIdTwo,
      globalScore: 61,
    });
    expect(mocks.loadResults).toHaveBeenCalledTimes(1);
    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_deal_2");
  });
});
