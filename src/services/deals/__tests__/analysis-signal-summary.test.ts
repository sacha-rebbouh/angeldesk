import { describe, expect, it } from "vitest";

import { computeAnalysisSignalSummary } from "@/services/deals/analysis-signal-summary";

// Locks the cache "compute" contract: the denormalized read-model must store
// exactly what extractAnalysisScores + extractCanonicalExtractedInfo produce, so
// a cache hit is indistinguishable from a live extraction (miss).
describe("computeAnalysisSignalSummary", () => {
  it("derives scores + extracted-info from a results map", () => {
    const results = {
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

    expect(computeAnalysisSignalSummary(results)).toEqual({
      scores: {
        globalScore: 82,
        teamScore: 88,
        marketScore: 75,
        // Float, not Int: dimension sub-scores are clamped but not rounded, so the
        // cache must preserve the exact number extractAnalysisScores returns.
        productScore: 79.5,
        financialsScore: 70,
      },
      extractedInfo: {
        sector: "Fintech",
        stage: "SEED",
        instrument: "SAFE",
        geography: "France",
        description: "Banking for SMBs",
      },
    });
  });

  it("returns all-null scores and null extracted-info for empty / garbage results", () => {
    expect(computeAnalysisSignalSummary({})).toEqual({
      scores: {
        globalScore: null,
        teamScore: null,
        marketScore: null,
        productScore: null,
        financialsScore: null,
      },
      extractedInfo: null,
    });
    expect(computeAnalysisSignalSummary(null)).toEqual({
      scores: {
        globalScore: null,
        teamScore: null,
        marketScore: null,
        productScore: null,
        financialsScore: null,
      },
      extractedInfo: null,
    });
  });
});
