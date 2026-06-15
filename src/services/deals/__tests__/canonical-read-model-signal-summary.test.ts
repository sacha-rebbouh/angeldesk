import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the DB + blob deps so we can exercise loadCanonicalDealSignals' new
// denormalized read path: cache HIT must skip loadResults entirely; cache MISS
// must self-correct (loadResults + re-upsert) and yield the SAME resolved
// signals as a hit — otherwise users would see different signals depending on
// cache warmth.
const mocks = vi.hoisted(() => ({
  prisma: {
    thesis: { findMany: vi.fn() },
    analysis: { findMany: vi.fn() },
    analysisSignalSummary: { findMany: vi.fn(), upsert: vi.fn() },
  },
  loadResults: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));
vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

import { loadCanonicalDealSignals } from "@/services/deals/canonical-read-model";

const RESULTS = {
  "synthesis-deal-scorer": {
    success: true,
    data: {
      overallScore: 82,
      dimensionScores: [
        { dimension: "Team", score: 88 },
        { dimension: "Market", score: 75 },
        { dimension: "Product & Tech", score: 79.5 },
        { dimension: "Financials", score: 70 },
      ],
    },
  },
  "document-extractor": {
    success: true,
    data: {
      extractedInfo: {
        sector: "Fintech",
        stage: "SEED",
        instrument: "SAFE",
        geography: "France",
        tagline: "Banking for SMBs",
      },
    },
  },
};

const EXTRACTED = {
  sector: "Fintech",
  stage: "SEED",
  instrument: "SAFE",
  geography: "France",
  description: "Banking for SMBs",
};

describe("loadCanonicalDealSignals — denormalized read-model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.thesis.findMany.mockResolvedValue([
      { id: "th_1", dealId: "deal_1", verdict: "favorable", corpusSnapshotId: "snap_1" },
    ]);
    mocks.prisma.analysis.findMany.mockResolvedValue([
      {
        id: "an_1",
        dealId: "deal_1",
        mode: "full_analysis",
        thesisId: "th_1",
        corpusSnapshotId: "snap_1",
        completedAt: new Date("2026-05-01T10:00:00Z"),
        createdAt: new Date("2026-05-01T09:00:00Z"),
      },
    ]);
    mocks.getCurrentFactsFromView.mockResolvedValue([]);
    mocks.prisma.analysisSignalSummary.upsert.mockResolvedValue({});
  });

  it("reads canonical signals from the cache without loading results (hit)", async () => {
    mocks.prisma.analysisSignalSummary.findMany.mockResolvedValue([
      { analysisId: "an_1", ...EXTRACTED },
    ]);

    const signals = await loadCanonicalDealSignals(["deal_1"]);

    expect(mocks.prisma.analysisSignalSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analysisId: { in: ["an_1"] }, schemaVersion: 1 },
      })
    );
    expect(mocks.loadResults).not.toHaveBeenCalled();
    expect(mocks.prisma.analysisSignalSummary.upsert).not.toHaveBeenCalled();
    expect(signals.extractedInfoByDealId.get("deal_1")).toEqual(EXTRACTED);
  });

  it("falls back to loadResults and warms the cache on miss (self-correcting, hit==miss)", async () => {
    mocks.prisma.analysisSignalSummary.findMany.mockResolvedValue([]);
    mocks.loadResults.mockResolvedValue(RESULTS);

    const signals = await loadCanonicalDealSignals(["deal_1"]);

    expect(mocks.loadResults).toHaveBeenCalledWith("an_1");
    expect(mocks.prisma.analysisSignalSummary.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.analysisSignalSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { analysisId: "an_1" } })
    );
    // Equivalence with the hit path above — same resolved signals.
    expect(signals.extractedInfoByDealId.get("deal_1")).toEqual(EXTRACTED);
  });

  it("degrades to loadResults when the cache read itself throws (missing table / transient)", async () => {
    // Simulates the prod deploy window where the migration is not applied yet:
    // the summary read must not crash SSR, every id becomes a miss.
    mocks.prisma.analysisSignalSummary.findMany.mockRejectedValue(
      new Error('relation "AnalysisSignalSummary" does not exist')
    );
    mocks.loadResults.mockResolvedValue(RESULTS);

    const signals = await loadCanonicalDealSignals(["deal_1"]);

    expect(mocks.loadResults).toHaveBeenCalledWith("an_1");
    expect(signals.extractedInfoByDealId.get("deal_1")).toEqual(EXTRACTED);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("does not crash the read when the cache upsert fails on miss", async () => {
    mocks.prisma.analysisSignalSummary.findMany.mockResolvedValue([]);
    mocks.loadResults.mockResolvedValue(RESULTS);
    mocks.prisma.analysisSignalSummary.upsert.mockRejectedValue(new Error("db down"));

    const signals = await loadCanonicalDealSignals(["deal_1"]);

    // Best-effort: the failed upsert is swallowed, the read still returns signals.
    expect(signals.extractedInfoByDealId.get("deal_1")).toEqual(EXTRACTED);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });
});
