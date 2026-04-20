import { describe, expect, it } from "vitest";
import type { Deal } from "@prisma/client";
import type { AgentResult } from "@/agents/types";
import type { CurrentFact } from "@/services/fact-store/types";
import { buildCanonicalRuntimeDeal } from "../canonical-runtime-deal";

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "deal-1",
    userId: "user-1",
    name: "Legacy Deal Name",
    companyName: "Legacy Company",
    description: "Legacy description",
    sector: "Legacy Sector",
    stage: "Legacy Stage",
    instrument: "SAFE",
    geography: "Legacy Geography",
    website: "https://legacy.example",
    status: "NEW",
    amountRequested: 100000,
    valuationPre: 2000000,
    valuationPost: null,
    arr: 50000,
    mrr: null,
    revenue: null,
    growthRate: 15,
    burnRate: null,
    runway: null,
    foundedYear: null,
    teamSize: null,
    customers: null,
    users: null,
    fundingRaised: null,
    fundingRaisedDate: null,
    targetMarket: null,
    businessModel: null,
    techStack: [],
    competitors: [],
    redFlags: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastAnalyzedAt: null,
    analysisCount: 0,
    lastAnalysisHash: null,
    cacheFingerprint: null,
    cacheFingerprintAt: null,
    score: null,
    ...overrides,
  } as Deal;
}

function makeFact(
  factKey: string,
  currentValue: string | number | null,
  currentDisplayValue: string,
): CurrentFact {
  return {
    dealId: "deal-1",
    factKey,
    category: "OTHER",
    currentValue,
    currentDisplayValue,
    currentSource: "BA_OVERRIDE",
    currentConfidence: 100,
    eventId: `event-${factKey}`,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    lastUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    isDisputed: false,
    eventHistory: [],
    reliability: {
      reliability: "VERIFIED",
      isProjection: false,
      reasoning: "test",
    },
  } as unknown as CurrentFact;
}

function makeDocumentExtractorResult(
  extractedInfo: Record<string, unknown>
): Record<string, AgentResult> {
  return {
    "document-extractor": {
      agentName: "document-extractor",
      success: true,
      executionTimeMs: 10,
      cost: 0.1,
      data: { extractedInfo },
    } as AgentResult,
  };
}

describe("buildCanonicalRuntimeDeal", () => {
  it("prefers fact store values over extractor and legacy row", () => {
    const deal = makeDeal();
    const facts = [
      makeFact("company.name", "Canonical Co", "Canonical Co"),
      makeFact("other.sector", "Canonical Sector", "Canonical Sector"),
      makeFact("product.stage", "Series A", "Series A"),
      makeFact("market.geography_primary", "France", "France"),
      makeFact("other.website", "https://canonical.example", "https://canonical.example"),
      makeFact("product.tagline", "Canonical tagline", "Canonical tagline"),
      makeFact("financial.arr", 250000, "€250k"),
      makeFact("financial.revenue_growth_yoy", 82, "82%"),
      makeFact("financial.amount_raising", 1500000, "€1.5m"),
      makeFact("financial.valuation_pre", 9000000, "€9m"),
    ];
    const previousResults = makeDocumentExtractorResult({
      companyName: "Extractor Co",
      sector: "Extractor Sector",
      stage: "Extractor Stage",
      geography: "Extractor Geography",
      websiteUrl: "https://extractor.example",
      tagline: "Extractor tagline",
      arr: 111111,
      growthRateYoY: 33,
      amountRaising: 222222,
      valuationPre: 3333333,
    });

    const canonical = buildCanonicalRuntimeDeal(deal, {
      factStore: facts,
      previousResults,
    });

    expect(canonical.companyName).toBe("Canonical Co");
    expect(canonical.sector).toBe("Canonical Sector");
    expect(canonical.stage).toBe("Series A");
    expect(canonical.geography).toBe("France");
    expect(canonical.website).toBe("https://canonical.example");
    expect(canonical.description).toBe("Canonical tagline");
    expect(canonical.arr).toBe(250000);
    expect(canonical.growthRate).toBe(82);
    expect(canonical.amountRequested).toBe(1500000);
    expect(canonical.valuationPre).toBe(9000000);
  });

  it("falls back to document-extractor values when facts are absent", () => {
    const deal = makeDeal({
      companyName: null,
      sector: null,
      stage: null,
      geography: null,
      website: null,
      description: null,
      arr: null,
      growthRate: null,
      amountRequested: null,
      valuationPre: null,
    });

    const canonical = buildCanonicalRuntimeDeal(deal, {
      previousResults: makeDocumentExtractorResult({
        companyName: "Extractor Co",
        sector: "Extractor Sector",
        stage: "Extractor Stage",
        geography: "Extractor Geography",
        instrument: "EQUITY",
        websiteUrl: "https://extractor.example",
        tagline: "Extractor tagline",
        arr: 111111,
        growthRateYoY: 33,
        amountRaising: 222222,
        valuationPre: 3333333,
      }),
    });

    expect(canonical.companyName).toBe("Extractor Co");
    expect(canonical.sector).toBe("Extractor Sector");
    expect(canonical.stage).toBe("Extractor Stage");
    expect(canonical.instrument).toBe("EQUITY");
    expect(canonical.geography).toBe("Extractor Geography");
    expect(canonical.website).toBe("https://extractor.example");
    expect(canonical.description).toBe("Extractor tagline");
    expect(canonical.arr).toBe(111111);
    expect(canonical.growthRate).toBe(33);
    expect(canonical.amountRequested).toBe(222222);
    expect(canonical.valuationPre).toBe(3333333);
  });

  it("keeps legacy row values as final fallback", () => {
    const deal = makeDeal({
      companyName: null,
    });

    const canonical = buildCanonicalRuntimeDeal(deal);

    expect(canonical.companyName).toBe("Legacy Deal Name");
    expect(canonical.sector).toBe("Legacy Sector");
    expect(canonical.stage).toBe("Legacy Stage");
    expect(canonical.geography).toBe("Legacy Geography");
    expect(canonical.website).toBe("https://legacy.example");
    expect(canonical.description).toBe("Legacy description");
    expect(canonical.arr).toBe(50000);
    expect(canonical.growthRate).toBe(15);
    expect(canonical.amountRequested).toBe(100000);
    expect(canonical.valuationPre).toBe(2000000);
  });
});
