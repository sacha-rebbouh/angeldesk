import { describe, expect, it } from "vitest";

import { getAxisDisplayState } from "../thesis-hero-card";
import { getFrameworkLensDisplayState } from "../thesis-frameworks-expand";
import { isRetryableRebuttalResponse } from "../thesis-review-modal";

describe("thesis UI helpers", () => {
  it("detects retryable rebuttal responses", () => {
    expect(
      isRetryableRebuttalResponse(503, {
        retryable: true,
        error: "Juge temporairement indisponible",
      })
    ).toBe(true);

    expect(isRetryableRebuttalResponse(500, { retryable: true })).toBe(false);
    expect(isRetryableRebuttalResponse(503, { retryable: false })).toBe(false);
  });

  it("renders degraded framework lenses as unavailable", () => {
    const display = getFrameworkLensDisplayState({
      verdict: "contrasted",
      availability: "degraded_chain_exhausted",
    });

    expect(display.unavailable).toBe(true);
    expect(display.badgeLabel).toBe("Indisponible");
    expect(display.detailLabel).toContain("Aucun modèle");
  });

  it("renders evaluated framework lenses with their verdict badge", () => {
    const display = getFrameworkLensDisplayState({
      verdict: "favorable",
      availability: "evaluated",
    });

    expect(display.unavailable).toBe(false);
    expect(display.badgeLabel).toBeTruthy();
    expect(display.detailLabel).toBeNull();
  });

  it("renders unavailable axes neutrally", () => {
    const axisDisplay = getAxisDisplayState({
      key: "deal_accessibility",
      label: "Deal Accessibility",
      verdict: "contrasted",
      confidence: 0,
      summary: "Indisponible",
      strengths: [],
      failures: [],
      claims: [],
      sourceFrameworks: [],
    });

    expect(axisDisplay.label).toBe("Indisponible");
    expect(axisDisplay.className).toContain("slate");
  });
});
