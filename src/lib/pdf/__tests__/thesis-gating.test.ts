import { describe, expect, it } from "vitest";

import type { ThesisAxisEvaluation, ThesisVerdict } from "@/agents/thesis/types";

import { hasFragileThesis } from "../thesis-gating";
import type { PdfExportData } from "../generate-analysis-pdf";

function makeAxis(
  key: ThesisAxisEvaluation["key"],
  label: string,
  verdict: ThesisVerdict
): ThesisAxisEvaluation {
  return {
    key,
    label,
    verdict,
    confidence: 70,
    summary: "Resume",
    strengths: [],
    claims: [],
    failures: [],
    sourceFrameworks: ["angel-desk"],
  };
}

function makeThesis(verdict: ThesisVerdict): NonNullable<PdfExportData["thesis"]> {
  return {
    reformulated: "These test",
    verdict,
    confidence: 70,
    evaluationAxes: {
      thesisQuality: makeAxis("thesis_quality", "Thesis Quality", verdict),
      investorProfileFit: makeAxis(
        "investor_profile_fit",
        "Investor Profile Fit",
        "favorable"
      ),
      dealAccessibility: makeAxis(
        "deal_accessibility",
        "Deal Accessibility",
        "favorable"
      ),
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
