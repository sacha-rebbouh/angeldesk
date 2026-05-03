import { describe, expect, it } from "vitest";

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

describe("buildThesisFactScope", () => {
  it("precomputes ebitda margin only when period and currency are compatible", () => {
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

    expect(scope.derivedMetricsByKey.get("ebitda_margin")).toMatchObject({
      displayValue: "25.0%",
      periodLabel: "FY2025",
      currency: "EUR",
    });
  });

  it("does not precompute ebitda margin when temporal metadata is missing", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "financial.revenue",
        category: "FINANCIAL",
        currentValue: 10_000_000,
        currentDisplayValue: "10M EUR",
        currentUnit: "EUR",
      }),
      makeFact({
        factKey: "financial.ebitda",
        category: "FINANCIAL",
        currentValue: 2_500_000,
        currentDisplayValue: "2.5M EUR",
        currentUnit: "EUR",
      }),
    ]);

    expect(scope.derivedMetricsByKey.has("ebitda_margin")).toBe(false);
  });
});
