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
});
