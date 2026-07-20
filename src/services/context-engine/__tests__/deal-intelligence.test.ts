import { describe, expect, it } from "vitest";
import {
  buildDealIntelligence,
  hasDefensibleMultiples,
  sanitizeDealIntelligence,
  MIN_MULTIPLE_SAMPLE,
} from "../deal-intelligence";
import type { ConnectorQuery, DealIntelligence, SimilarDeal } from "../types";

function makeDeal(overrides: Partial<SimilarDeal> = {}): SimilarDeal {
  return {
    companyName: "TestCo",
    sector: "ai",
    stage: "Seed",
    geography: "France",
    fundingAmount: 1_000_000,
    fundingDate: "2026-01-01",
    investors: [],
    source: {
      name: "Test Source",
      type: "database",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      confidence: 0.85,
    },
    ...overrides,
  };
}

const seedQuery: ConnectorQuery = { sector: "ai", stage: "Seed" };

describe("buildDealIntelligence", () => {
  it("ne fabrique aucune médiane quand aucun deal n'a de multiple vérifié (cas HelloCoco)", () => {
    // 67 deals sans multiple — reproduit le contexte HelloCoco où la seule
    // « médiane » provenait d'une heuristique fabriquée (Dataiku 1.15x).
    const deals = Array.from({ length: 67 }, (_, i) =>
      makeDeal({ companyName: `Deal${i}`, stage: i % 2 === 0 ? "Seed" : "Unknown" })
    );

    const di = buildDealIntelligence(deals, seedQuery);

    expect(di.fundingContext.medianValuationMultiple).toBeUndefined();
    expect(di.fundingContext.p25ValuationMultiple).toBeUndefined();
    expect(di.fundingContext.p75ValuationMultiple).toBeUndefined();
    expect(di.fundingContext.multiplesSampleSize).toBe(0);
    expect(di.fundingContext.totalDealsInPeriod).toBe(67);
    // Plus aucun verdict / percentile fabriqué sans donnée réelle
    expect(di.verdict).toBeUndefined();
    expect(di.percentileRank).toBeUndefined();
    expect(di.fairValueRange).toBeUndefined();
    expect(hasDefensibleMultiples(di.fundingContext)).toBe(false);
  });

  it("échantillon sous le seuil → pas de médiane restituée (un seul multiple)", () => {
    const deals = [
      makeDeal({ companyName: "Dataiku", stage: "Seed", valuationMultiple: 1.15 }),
      ...Array.from({ length: 10 }, (_, i) => makeDeal({ companyName: `NoMult${i}` })),
    ];

    const di = buildDealIntelligence(deals, seedQuery);

    expect(di.fundingContext.medianValuationMultiple).toBeUndefined();
    expect(di.fundingContext.multiplesSampleSize).toBe(1);
    expect(hasDefensibleMultiples(di.fundingContext)).toBe(false);
  });

  it("calibration de stage : les multiples d'un autre stage sont exclus", () => {
    // 6 deals Growth avec multiples (assez pour une médiane), mais la query est Seed.
    const deals = Array.from({ length: 6 }, (_, i) =>
      makeDeal({ companyName: `Growth${i}`, stage: "Growth", valuationMultiple: 10 + i })
    );

    const di = buildDealIntelligence(deals, seedQuery);

    expect(di.fundingContext.multiplesSampleSize).toBe(0);
    expect(di.fundingContext.medianValuationMultiple).toBeUndefined();
    expect(di.fundingContext.multiplesStage).toBe("seed");
  });

  it("échantillon suffisant et stage-calibré → médiane + quartiles + taille d'échantillon", () => {
    const multiples = [4, 5, 6, 8, 12, 20, 3];
    const deals = [
      ...multiples.map((m, i) =>
        makeDeal({ companyName: `Seed${i}`, stage: "seed", valuationMultiple: m })
      ),
      // Bruit : autres stages et deals sans multiple — ignorés
      makeDeal({ companyName: "GrowthNoise", stage: "Growth", valuationMultiple: 1.15 }),
      makeDeal({ companyName: "NoMult" }),
    ];

    const di = buildDealIntelligence(deals, seedQuery);
    const sorted = [...multiples].sort((a, b) => a - b);

    expect(di.fundingContext.multiplesSampleSize).toBe(multiples.length);
    expect(di.fundingContext.medianValuationMultiple).toBe(
      sorted[Math.floor(sorted.length / 2)]
    );
    expect(di.fundingContext.p25ValuationMultiple).toBe(
      sorted[Math.floor(sorted.length * 0.25)]
    );
    expect(di.fundingContext.p75ValuationMultiple).toBe(
      sorted[Math.floor(sorted.length * 0.75)]
    );
    expect(di.fundingContext.multiplesStage).toBe("seed");
    expect(hasDefensibleMultiples(di.fundingContext)).toBe(true);
  });

  it("sans stage dans la query, tous les multiples valides comptent (pas de calibration possible)", () => {
    const deals = Array.from({ length: MIN_MULTIPLE_SAMPLE }, (_, i) =>
      makeDeal({ companyName: `D${i}`, stage: "Growth", valuationMultiple: 5 + i })
    );

    const di = buildDealIntelligence(deals, { sector: "ai" });

    expect(di.fundingContext.multiplesSampleSize).toBe(MIN_MULTIPLE_SAMPLE);
    expect(di.fundingContext.medianValuationMultiple).toBeDefined();
    expect(di.fundingContext.multiplesStage).toBe("all");
  });

  it("exclut les multiples dégénérés (0, négatif, NaN, Infinity)", () => {
    const deals = [
      makeDeal({ valuationMultiple: 0 }),
      makeDeal({ valuationMultiple: -3 }),
      makeDeal({ valuationMultiple: Number.NaN }),
      makeDeal({ valuationMultiple: Number.POSITIVE_INFINITY }),
    ];

    const di = buildDealIntelligence(deals, seedQuery);

    expect(di.fundingContext.multiplesSampleSize).toBe(0);
    expect(di.fundingContext.medianValuationMultiple).toBeUndefined();
  });

  it("garde le top 10 des similarDeals et le compte total", () => {
    const deals = Array.from({ length: 25 }, (_, i) => makeDeal({ companyName: `D${i}` }));
    const di = buildDealIntelligence(deals, seedQuery);
    expect(di.similarDeals).toHaveLength(10);
    expect(di.fundingContext.totalDealsInPeriod).toBe(25);
  });
});

describe("hasDefensibleMultiples", () => {
  it("rejette les snapshots legacy où la médiane fabriquée existe sans taille d'échantillon", () => {
    // Forme persistée avant le fix (snapshot HelloCoco) : median présent, pas de sampleSize.
    expect(
      hasDefensibleMultiples({
        totalDealsInPeriod: 67,
        medianValuationMultiple: 1.15,
        p25ValuationMultiple: 0.805,
        p75ValuationMultiple: 1.495,
        trend: "stable",
        trendPercentage: 0,
        downRoundCount: 0,
        period: "Last 12 months",
      })
    ).toBe(false);
  });

  it("rejette un fundingContext absent", () => {
    expect(hasDefensibleMultiples(undefined)).toBe(false);
  });

  it("rejette un objet partiel avec sampleSize suffisant mais quartiles absents", () => {
    expect(
      hasDefensibleMultiples({
        totalDealsInPeriod: 30,
        medianValuationMultiple: 6,
        multiplesSampleSize: 8,
        trend: "stable",
        trendPercentage: 0,
        downRoundCount: 0,
        period: "Last 12 months",
      })
    ).toBe(false);
  });
});

describe("sanitizeDealIntelligence", () => {
  it("purge un snapshot legacy HelloCoco : médiane fabriquée, verdict hardcodé, multiple par deal", () => {
    // Forme exacte persistée pour HelloCoco avant le fix.
    const legacy: DealIntelligence = {
      similarDeals: [
        makeDeal({ companyName: "Dataiku", stage: "Growth", valuationMultiple: 1.15 }),
        makeDeal({ companyName: "Didask" }),
      ],
      fundingContext: {
        totalDealsInPeriod: 67,
        medianValuationMultiple: 1.15,
        p25ValuationMultiple: 0.805,
        p75ValuationMultiple: 1.495,
        trend: "stable",
        trendPercentage: 0,
        downRoundCount: 0,
        period: "Last 12 months",
      },
      percentileRank: 50,
      fairValueRange: { low: 0, high: 0, currency: "EUR" },
      verdict: "fair",
    };

    const sanitized = sanitizeDealIntelligence(legacy);

    expect(sanitized).toBeDefined();
    expect(sanitized!.fundingContext.medianValuationMultiple).toBeUndefined();
    expect(sanitized!.fundingContext.p25ValuationMultiple).toBeUndefined();
    expect(sanitized!.fundingContext.p75ValuationMultiple).toBeUndefined();
    expect(sanitized!.fundingContext.multiplesSampleSize).toBe(0);
    expect(sanitized!.fundingContext.totalDealsInPeriod).toBe(67);
    expect(sanitized!.percentileRank).toBeUndefined();
    expect(sanitized!.fairValueRange).toBeUndefined();
    expect(sanitized!.verdict).toBeUndefined();
    expect(sanitized!.similarDeals.every((d) => d.valuationMultiple === undefined)).toBe(true);
    // Aucune trace de 1.15 ne doit survivre à un JSON.stringify (bypass Tier 2)
    expect(JSON.stringify(sanitized)).not.toContain("1.15");
  });

  it("laisse passer intactes des données fraîches défendables", () => {
    const fresh = buildDealIntelligence(
      Array.from({ length: 6 }, (_, i) =>
        makeDeal({ companyName: `D${i}`, stage: "seed", valuationMultiple: 4 + i })
      ),
      { sector: "ai", stage: "Seed" }
    );

    const sanitized = sanitizeDealIntelligence(fresh);

    expect(sanitized).toEqual(fresh);
    expect(sanitized!.fundingContext.medianValuationMultiple).toBeDefined();
  });

  it("retire une médiane incomplète sur données récentes (JSON partiel sans quartiles)", () => {
    const partial: DealIntelligence = {
      similarDeals: [],
      fundingContext: {
        totalDealsInPeriod: 12,
        medianValuationMultiple: 6,
        multiplesSampleSize: 8,
        multiplesStage: "seed",
        trend: "stable",
        trendPercentage: 0,
        downRoundCount: 0,
        period: "Last 12 months",
      },
    };

    const sanitized = sanitizeDealIntelligence(partial);

    expect(sanitized!.fundingContext.medianValuationMultiple).toBeUndefined();
  });

  it("retourne undefined pour une entrée absente", () => {
    expect(sanitizeDealIntelligence(undefined)).toBeUndefined();
    expect(sanitizeDealIntelligence(null)).toBeUndefined();
  });
});
