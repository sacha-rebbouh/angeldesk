import { describe, expect, it } from "vitest";

import { detectFactQualityIssues, hasAutoQuarantineIssue } from "../quality";

describe("fact-store quality heuristics", () => {
  it("flags legacy aliases without auto-quarantining them", () => {
    const issues = detectFactQualityIssues({
      factKey: "competition.competitor_count",
      value: 2,
      displayValue: "2",
      source: "PITCH_DECK",
      truthConfidence: 50,
      reliability: { reliability: "DECLARED" },
    });

    expect(issues.some((issue) => issue.code === "LEGACY_ALIAS_FACT_KEY")).toBe(true);
    expect(hasAutoQuarantineIssue(issues)).toBe(false);
  });

  it("flags severe mismatches for structured scalars and currency display mismatches", () => {
    const issues = detectFactQualityIssues({
      factKey: "financial.revenue",
      value: { validated: 195000000 },
      displayValue: "2.8M NOK",
      unit: "EUR",
      extractedText: "€2.8m Revenue (2026)",
      source: "PITCH_DECK",
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "STRUCTURED_VALUE_FOR_SCALAR_KEY",
        "DISPLAY_CURRENCY_MISMATCH",
      ])
    );
    expect(hasAutoQuarantineIssue(issues)).toBe(true);
  });

  it("flags traction semantic mismatches from storage and occupancy snippets", () => {
    const customerIssues = detectFactQualityIssues({
      factKey: "traction.customers_count",
      value: 4000,
      displayValue: "4,000 units",
      extractedText: "4,000 sqm Storage Units",
      source: "PITCH_DECK",
    });
    const mauIssues = detectFactQualityIssues({
      factKey: "traction.mau",
      value: 81.6,
      displayValue: "81.6%",
      extractedText: "81.6% Current Occupancy",
      source: "PITCH_DECK",
    });

    expect(customerIssues.some((issue) => issue.code === "TRACTION_CUSTOMER_USER_SEMANTIC_MISMATCH")).toBe(true);
    expect(mauIssues.some((issue) => issue.code === "TRACTION_MAU_SEMANTIC_MISMATCH")).toBe(true);
  });
});
