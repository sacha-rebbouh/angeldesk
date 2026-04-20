import { describe, expect, it } from "vitest";
import type { CurrentFact } from "@/services/fact-store/types";

import {
  getCurrentFactNumber,
  getCurrentFactString,
  pickCanonicalAnalysis,
  resolveCanonicalDealFields,
  resolveCanonicalAnalysisScores,
  type CanonicalDealSignals,
} from "@/services/deals/canonical-read-model";

function makeCurrentFact(
  factKey: string,
  currentValue: unknown,
  currentDisplayValue: string
): CurrentFact {
  return {
    dealId: "deal_1",
    factKey,
    category: factKey.startsWith("financial.") ? "FINANCIAL" : "OTHER",
    currentValue,
    currentDisplayValue,
    currentSource: "PITCH_DECK",
    currentConfidence: 90,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date("2026-04-20T09:00:00Z"),
    lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
  };
}

describe("canonical-read-model", () => {
  it("prefers the completed analysis linked to the active thesis", () => {
    const latestThesis = {
      id: "thesis_active",
      corpusSnapshotId: "snap_active",
    };

    const selected = pickCanonicalAnalysis(latestThesis, [
      {
        id: "analysis_unrelated",
        dealId: "deal_1",
        mode: "full_analysis",
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
        completedAt: new Date("2026-04-20T09:00:00Z"),
        createdAt: new Date("2026-04-20T08:00:00Z"),
      },
      {
        id: "analysis_linked",
        dealId: "deal_1",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_active",
        completedAt: new Date("2026-04-19T09:00:00Z"),
        createdAt: new Date("2026-04-19T08:00:00Z"),
      },
    ]);

    expect(selected?.id).toBe("analysis_linked");
  });

  it("ignores post-call reanalysis runs when selecting the canonical deal analysis", () => {
    const latestThesis = {
      id: "thesis_active",
      corpusSnapshotId: "snap_active",
    };

    const selected = pickCanonicalAnalysis(latestThesis, [
      {
        id: "analysis_post_call",
        dealId: "deal_1",
        mode: "post_call_reanalysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_active",
        completedAt: new Date("2026-04-20T10:00:00Z"),
        createdAt: new Date("2026-04-20T09:00:00Z"),
      },
      {
        id: "analysis_official",
        dealId: "deal_1",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_active",
        completedAt: new Date("2026-04-19T10:00:00Z"),
        createdAt: new Date("2026-04-19T09:00:00Z"),
      },
    ]);

    expect(selected?.id).toBe("analysis_official");
  });

  it("hides legacy score fallback when a latest thesis exists without canonical analysis", () => {
    const signals: CanonicalDealSignals = {
      latestThesisByDealId: new Map([
        [
          "deal_1",
          {
            id: "thesis_active",
            dealId: "deal_1",
            verdict: "favorable",
            corpusSnapshotId: "snap_active",
          },
        ],
      ]),
      selectedAnalysisByDealId: new Map([["deal_1", null]]),
      analysisScoresByDealId: new Map([["deal_1", null]]),
      extractedInfoByDealId: new Map([["deal_1", null]]),
      factMapByDealId: new Map([["deal_1", new Map()]]),
    };

    const scores = resolveCanonicalAnalysisScores("deal_1", signals, {
      globalScore: 88,
      teamScore: 80,
      marketScore: 79,
      productScore: 78,
      financialsScore: 77,
    });

    expect(scores).toEqual({
      globalScore: null,
      teamScore: null,
      marketScore: null,
      productScore: null,
      financialsScore: null,
    });
  });

  it("reads canonical fact values from the fact map", () => {
    const factMap = new Map([
      ["company.name", makeCurrentFact("company.name", "Canonical Co", "Canonical Co")],
      ["financial.arr", makeCurrentFact("financial.arr", 1200000, "€1.2M")],
    ]);

    expect(getCurrentFactString(factMap as never, "company.name")).toBe("Canonical Co");
    expect(getCurrentFactNumber(factMap as never, "financial.arr")).toBe(1200000);
  });

  it("resolves detail fields from facts and canonical extracted info", () => {
    const signals: CanonicalDealSignals = {
      latestThesisByDealId: new Map(),
      selectedAnalysisByDealId: new Map(),
      analysisScoresByDealId: new Map([
        [
          "deal_1",
          {
            globalScore: 91,
            teamScore: 83,
            marketScore: 79,
            productScore: 77,
            financialsScore: 75,
          },
        ],
      ]),
      extractedInfoByDealId: new Map([
        [
          "deal_1",
          {
            sector: "Canonical Sector",
            stage: "SERIES_A",
            instrument: "SAFE",
            geography: "France",
            description: "Canonical tagline",
          },
        ],
      ]),
      factMapByDealId: new Map([
        [
          "deal_1",
          new Map([
            ["company.name", makeCurrentFact("company.name", "Canonical Co", "Canonical Co")],
            [
              "other.website",
              makeCurrentFact(
                "other.website",
                "https://canonical.example",
                "https://canonical.example"
              ),
            ],
            ["financial.arr", makeCurrentFact("financial.arr", 1200000, "€1.2M")],
            ["other.sector", makeCurrentFact("other.sector", "Fact Sector", "Fact Sector")],
            ["product.stage", makeCurrentFact("product.stage", "SERIES_B", "SERIES_B")],
            [
              "product.tagline",
              makeCurrentFact("product.tagline", "Fact tagline", "Fact tagline"),
            ],
            [
              "market.geography_primary",
              makeCurrentFact(
                "market.geography_primary",
                "EMEA",
                "EMEA"
              ),
            ],
          ]),
        ],
      ]),
    };

    expect(
      resolveCanonicalDealFields("deal_1", signals, {
        companyName: "Legacy Co",
        website: "https://legacy.example",
        arr: 1000,
        growthRate: 12,
        amountRequested: 100000,
        valuationPre: 1500000,
        sector: "Legacy Sector",
        stage: "SEED",
        instrument: "EQUITY",
        geography: "Legacy Geography",
        description: "Legacy description",
        globalScore: 11,
        teamScore: 12,
        marketScore: 13,
        productScore: 14,
        financialsScore: 15,
      })
    ).toMatchObject({
      companyName: "Canonical Co",
      website: "https://canonical.example",
      arr: 1200000,
      sector: "Fact Sector",
      stage: "SERIES_B",
      instrument: "EQUITY",
      geography: "EMEA",
      description: "Fact tagline",
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
  });
});
