import { describe, expect, it } from "vitest";

import { assertSupportedThesisNarrative, findUnsupportedThesisNarrativeClaims } from "../narrative-guards";
import { buildThesisFactScope } from "../fact-scope";
import type { CurrentFact } from "@/services/fact-store/types";

function makeFact(overrides: Partial<CurrentFact> & Pick<CurrentFact, "factKey" | "category" | "currentValue" | "currentDisplayValue">): CurrentFact {
  return {
    dealId: "deal_1",
    factKey: overrides.factKey,
    category: overrides.category,
    currentValue: overrides.currentValue,
    currentDisplayValue: overrides.currentDisplayValue,
    currentUnit: overrides.currentUnit,
    currentExtractedText: overrides.currentExtractedText,
    currentSource: overrides.currentSource ?? "PITCH_DECK",
    currentSourceDocumentId: overrides.currentSourceDocumentId,
    currentConfidence: overrides.currentConfidence ?? 92,
    currentTruthConfidence: overrides.currentTruthConfidence,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    lastUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    reliability: overrides.reliability,
    sourceMetadata: overrides.sourceMetadata,
    validAt: overrides.validAt,
    periodType: overrides.periodType,
    periodLabel: overrides.periodLabel,
  };
}

describe("thesis narrative guards", () => {
  it("rejects unsupported EBITDA margin narratives when the metric is absent", () => {
    expect(() =>
      assertSupportedThesisNarrative(
        {
          reformulated: "La societe vise une marge EBITDA de 57% des 2026.",
        },
        []
      )
    ).toThrow("Unsupported thesis narrative claims detected");
  });

  it("accepts a supported EBITDA margin narrative when the precomputed metric exists", () => {
    const facts: CurrentFact[] = [
      makeFact({
        factKey: "financial.revenue",
        category: "FINANCIAL",
        currentValue: 10_000_000,
        currentDisplayValue: "10M EUR",
        currentUnit: "EUR",
        periodType: "YEAR",
        periodLabel: "FY2025",
        reliability: {
          reliability: "VERIFIED",
          reasoning: "matched",
          isProjection: false,
        },
      }),
      makeFact({
        factKey: "financial.ebitda",
        category: "FINANCIAL",
        currentValue: 2_500_000,
        currentDisplayValue: "2.5M EUR",
        currentUnit: "EUR",
        periodType: "YEAR",
        periodLabel: "FY2025",
        reliability: {
          reliability: "VERIFIED",
          reasoning: "matched",
          isProjection: false,
        },
      }),
    ];

    expect(() =>
      assertSupportedThesisNarrative(
        {
          reformulated: "La societe opere avec une marge EBITDA de 25% sur FY2025.",
        },
        facts
      )
    ).not.toThrow();
  });

  it("flags claimed percentages that diverge from the validated metric", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "financial.revenue",
        category: "FINANCIAL",
        currentValue: 10_000_000,
        currentDisplayValue: "10M EUR",
        currentUnit: "EUR",
        periodType: "YEAR",
        periodLabel: "FY2025",
        reliability: {
          reliability: "VERIFIED",
          reasoning: "matched",
          isProjection: false,
        },
      }),
      makeFact({
        factKey: "financial.ebitda",
        category: "FINANCIAL",
        currentValue: 2_500_000,
        currentDisplayValue: "2.5M EUR",
        currentUnit: "EUR",
        periodType: "YEAR",
        periodLabel: "FY2025",
        reliability: {
          reliability: "VERIFIED",
          reasoning: "matched",
          isProjection: false,
        },
      }),
    ]);

    const issues = findUnsupportedThesisNarrativeClaims(
      { reformulated: "La societe vise une marge EBITDA de 57% sur FY2025." },
      scope
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.reason).toContain("does not match validated metric 25.0%");
  });

  it("does not treat B2B, B2C, or B2B2C labels as unsupported numeric claims", () => {
    expect(
      findUnsupportedThesisNarrativeClaims(
        {
          reformulated: "La société adresse un marché B2B avec des cas B2B2C et B2BtoC.",
          solution: "Le produit peut aussi être vendu en B2C.",
        },
        buildThesisFactScope([])
      )
    ).toEqual([]);
  });

  it("does not treat CAC or LTV wording as a missing customers_count claim", () => {
    expect(
      findUnsupportedThesisNarrativeClaims(
        {
          solution:
            "Le coût d'acquisition client déclaré est de 122 EUR. La valeur vie client estimée atteint 4 808 EUR.",
        },
        buildThesisFactScope([])
      )
    ).toEqual([]);
  });

  it("does not treat French words starting with m as numeric million markers", () => {
    expect(
      findUnsupportedThesisNarrativeClaims(
        {
          solution:
            "Le ratio LTV/CAC déclaré suggère une économie unitaire favorable, mais la méthodologie de calcul reste à détailler.",
        },
        buildThesisFactScope([])
      )
    ).toEqual([]);
  });

  it("still flags explicit customer-count narratives when customers_count is absent", () => {
    const issues = findUnsupportedThesisNarrativeClaims(
      {
        solution: "La société revendique une base de clients de 420 comptes.",
      },
      buildThesisFactScope([])
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.reason).toContain("traction.customers_count");
  });
});
