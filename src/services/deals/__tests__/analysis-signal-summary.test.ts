import { describe, expect, it } from "vitest";

import { computeAnalysisSignalSummary } from "@/services/deals/analysis-signal-summary";

// Locks the cache "compute" contract: the denormalized read-model must store
// exactly what extractCanonicalExtractedInfo produces, so a cache hit is
// indistinguishable from a live extraction (miss).
describe("computeAnalysisSignalSummary", () => {
  it("derives extracted-info from a results map", () => {
    const results = {
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
      extractedInfo: {
        sector: "Fintech",
        stage: "SEED",
        instrument: "SAFE",
        geography: "France",
        description: "Banking for SMBs",
      },
    });
  });

  it("returns null extracted-info for empty / garbage results", () => {
    expect(computeAnalysisSignalSummary({})).toEqual({
      extractedInfo: null,
    });
    expect(computeAnalysisSignalSummary(null)).toEqual({
      extractedInfo: null,
    });
  });
});
