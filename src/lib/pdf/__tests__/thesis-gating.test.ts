import { describe, expect, it } from "vitest";

import { hasFragileThesis } from "../thesis-gating";
import type { PdfExportData } from "../generate-analysis-pdf";

function makeThesis(verdict: string): NonNullable<PdfExportData["thesis"]> {
  return {
    reformulated: "These test",
    verdict,
    confidence: 70,
    evaluationAxes: {
      thesisQuality: {
        key: "thesis_quality",
        label: "Thesis Quality",
        verdict,
        summary: "Resume",
        claims: [],
        failures: [],
      },
      investorProfileFit: {
        key: "investor_profile_fit",
        label: "Investor Profile Fit",
        verdict: "favorable",
        summary: "Resume",
        claims: [],
        failures: [],
      },
      dealAccessibility: {
        key: "deal_accessibility",
        label: "Deal Accessibility",
        verdict: "favorable",
        summary: "Resume",
        claims: [],
        failures: [],
      },
    },
  };
}

describe("hasFragileThesis", () => {
  it("flags vigilance theses as score-gated", () => {
    expect(hasFragileThesis(makeThesis("vigilance"))).toBe(true);
  });

  it("flags alert dominant theses as score-gated", () => {
    expect(hasFragileThesis(makeThesis("alert_dominant"))).toBe(true);
  });

  it("leaves favorable theses ungated", () => {
    expect(hasFragileThesis(makeThesis("favorable"))).toBe(false);
  });
});
