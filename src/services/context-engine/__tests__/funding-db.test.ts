import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundingRound: {
      findMany: mocks.findMany,
    },
  },
}));

import { fundingDbConnector } from "../connectors/funding-db";

describe("fundingDbConnector", () => {
  afterEach(() => {
    mocks.findMany.mockReset();
  });

  it("excludes similar deals without a fundingDate instead of substituting today's date", async () => {
    mocks.findMany.mockResolvedValue([
      {
        companyName: "DatedCo",
        amount: 10_000_000,
        amountUsd: 10_000_000,
        currency: "USD",
        stage: "Seed",
        geography: "US",
        sector: "saas",
        fundingDate: new Date("2026-01-15T00:00:00.000Z"),
        source: "test",
        sourceUrl: "https://example.com/dated",
      },
      {
        companyName: "UndatedCo",
        amount: 8_000_000,
        amountUsd: 8_000_000,
        currency: "USD",
        stage: "Seed",
        geography: "US",
        sector: "saas",
        fundingDate: null,
        source: "test",
        sourceUrl: "https://example.com/undated",
      },
    ]);

    const searchSimilarDeals = fundingDbConnector.searchSimilarDeals;
    if (!searchSimilarDeals) throw new Error("searchSimilarDeals is not configured");

    const deals = await searchSimilarDeals({ sector: "saas", stage: "seed" });

    expect(deals).toEqual([
      expect.objectContaining({
        companyName: "DatedCo",
        fundingAmount: 10_000_000,
        currency: "USD",
        fundingDate: "2026-01-15T00:00:00.000Z",
      }),
    ]);
    expect(deals.map((deal) => deal.companyName)).not.toContain("UndatedCo");
  });

  it("labels funding amount benchmarks as USD because they are calculated from amountUsd", async () => {
    mocks.findMany.mockResolvedValue([
      { stageNormalized: "seed", amountUsd: 1_000_000 },
      { stageNormalized: "seed", amountUsd: 3_000_000 },
      { stageNormalized: "seed", amountUsd: 5_000_000 },
    ]);

    const getMarketData = fundingDbConnector.getMarketData;
    if (!getMarketData) throw new Error("getMarketData is not configured");

    const marketData = await getMarketData({ sector: "saas", stage: "seed" });

    expect(marketData.benchmarks).toEqual([
      expect.objectContaining({
        metricName: "Funding Amount",
        p25: 1_000_000,
        median: 3_000_000,
        p75: 5_000_000,
        unit: "USD",
      }),
    ]);
  });
});
