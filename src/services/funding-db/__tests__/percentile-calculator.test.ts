import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jsonNullToken: Symbol("JsonNull"),
  analysisFindMany: vi.fn(),
  loadResults: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findMany: mocks.analysisFindMany,
    },
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    JsonNull: mocks.jsonNullToken,
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

const { calculateDealPercentile, clearDealPercentileCacheForTests } = await import("../percentile-calculator");

function buildAnalysis(
  id: string,
  sector: string | null,
  stage: string | null
) {
  return {
    id,
    deal: {
      sector,
      stage,
    },
    results: {
      "synthesis-deal-scorer": {
        success: true,
        data: {
          overallScore: 999,
        },
      },
    },
  };
}

function buildScorerResult(score: number) {
  return {
    "synthesis-deal-scorer": {
      success: true,
      data: {
        overallScore: score,
      },
    },
  };
}

describe("calculateDealPercentile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDealPercentileCacheForTests();
  });

  it("loads canonical results without selecting the raw Prisma blob", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      buildAnalysis("analysis_1", "Fintech Infrastructure", "Seed"),
      buildAnalysis("analysis_2", "Fintech", "Seed"),
      buildAnalysis("analysis_3", "Fintech", "Seed"),
      buildAnalysis("analysis_4", "Fintech", "Seed"),
      buildAnalysis("analysis_5", "Fintech", "Series A"),
      buildAnalysis("analysis_6", "SaaS", "Seed"),
    ]);

    const scoresByAnalysisId: Record<string, unknown> = {
      analysis_1: buildScorerResult(10),
      analysis_2: buildScorerResult(30),
      analysis_3: buildScorerResult(50),
      analysis_4: buildScorerResult(70),
      analysis_5: buildScorerResult(90),
      analysis_6: buildScorerResult(80),
    };

    mocks.loadResults.mockImplementation(async (analysisId: string) => {
      return scoresByAnalysisId[analysisId] ?? null;
    });

    const result = await calculateDealPercentile(60, "Fintech", "Seed");

    const query = mocks.analysisFindMany.mock.calls[0]?.[0];

    expect(query).toMatchObject({
      where: {
        status: "COMPLETED",
        results: { not: mocks.jsonNullToken },
      },
      select: {
        id: true,
        deal: {
          select: {
            sector: true,
            stage: true,
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 500,
    });
    expect(query).not.toHaveProperty("include");
    expect(query.select).not.toHaveProperty("results");
    expect(mocks.loadResults.mock.calls.map(([analysisId]) => analysisId)).toEqual([
      "analysis_1",
      "analysis_2",
      "analysis_3",
      "analysis_4",
      "analysis_5",
      "analysis_6",
    ]);
    expect(result).toMatchObject({
      percentileOverall: 50,
      percentileSector: 60,
      percentileStage: 60,
      similarDealsAnalyzed: 6,
      sectorDealsCount: 5,
      stageDealsCount: 5,
      scoreDistribution: {
        p25: 30,
        median: 70,
        p75: 80,
      },
      method: "INTERPOLATED",
    });
  });

  it("falls back to the overall percentile when sector or stage cohorts stay below five scored deals", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      buildAnalysis("analysis_1", "Healthtech", "Series A"),
      buildAnalysis("analysis_2", "Healthtech", "Series A"),
      buildAnalysis("analysis_3", "Healthtech", "Series A"),
      buildAnalysis("analysis_4", "Healthtech", "Series A"),
      buildAnalysis("analysis_5", "Healthtech", "Series A"),
      buildAnalysis("analysis_6", "Climate", "Seed"),
    ]);

    mocks.loadResults.mockImplementation(async (analysisId: string) => {
      if (analysisId === "analysis_5") {
        return {
          "synthesis-deal-scorer": {
            success: false,
          },
        };
      }

      const scoreMap: Record<string, number> = {
        analysis_1: 20,
        analysis_2: 40,
        analysis_3: 60,
        analysis_4: 80,
        analysis_6: 100,
      };

      return buildScorerResult(scoreMap[analysisId]!);
    });

    const result = await calculateDealPercentile(50, "Health", "Series A");

    expect(result).toMatchObject({
      percentileOverall: 40,
      percentileSector: 40,
      percentileStage: 40,
      similarDealsAnalyzed: 5,
      sectorDealsCount: 4,
      stageDealsCount: 4,
      method: "INTERPOLATED",
    });
  });

  it("loads more than one canonical results batch without dropping analyses", async () => {
    const analyses = Array.from({ length: 27 }, (_, index) =>
      buildAnalysis(`analysis_${index + 1}`, "AI", "Series B")
    );

    mocks.analysisFindMany.mockResolvedValue(analyses);
    mocks.loadResults.mockImplementation(async (analysisId: string) => {
      const numericId = Number(analysisId.replace("analysis_", ""));
      return buildScorerResult(numericId);
    });

    const result = await calculateDealPercentile(14.5, "AI", "Series B");

    expect(mocks.loadResults).toHaveBeenCalledTimes(27);
    expect(result).toMatchObject({
      percentileOverall: 52,
      percentileSector: 52,
      percentileStage: 52,
      similarDealsAnalyzed: 27,
      sectorDealsCount: 27,
      stageDealsCount: 27,
      method: "EXACT",
    });
  });

  it("reuses the loaded cohort for repeated percentile calculations within the cache TTL", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      buildAnalysis("analysis_1", "AI", "Seed"),
      buildAnalysis("analysis_2", "AI", "Series A"),
      buildAnalysis("analysis_3", "SaaS", "Seed"),
    ]);

    mocks.loadResults.mockImplementation(async (analysisId: string) => {
      const scoreMap: Record<string, number> = {
        analysis_1: 20,
        analysis_2: 60,
        analysis_3: 80,
      };

      return buildScorerResult(scoreMap[analysisId]!);
    });

    const first = await calculateDealPercentile(50, "AI", "Seed");
    const second = await calculateDealPercentile(70, "SaaS", "Seed");

    expect(mocks.analysisFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.loadResults).toHaveBeenCalledTimes(3);
    expect(first.percentileOverall).toBe(33);
    expect(second.percentileOverall).toBe(67);
    expect(second.sectorDealsCount).toBe(1);
  });
});
