import { describe, expect, it } from "vitest";

import {
  formatAxisPromptLine,
  formatAxisVerdictToken,
  formatDetailedFrameworkSection,
  formatFrameworkPromptLine,
  formatFrameworkVerdictToken,
  formatReconcilerLensSection,
} from "../prompt-formatting";

describe("thesis prompt formatting", () => {
  it("marks degraded frameworks as unavailable in compact tokens", () => {
    expect(
      formatFrameworkVerdictToken("Thiel", {
        verdict: "contrasted",
        availability: "degraded_chain_exhausted",
      })
    ).toBe("Thiel=indisponible");
  });

  it("marks unavailable axes as unavailable in compact tokens", () => {
    expect(
      formatAxisVerdictToken("thesisQuality", {
        verdict: "vigilance",
        sourceFrameworks: [],
      })
    ).toBe("thesisQuality=indisponible");
  });

  it("renders degraded framework sections as system incidents", () => {
    const section = formatDetailedFrameworkSection("YC", {
      verdict: "contrasted",
      confidence: 0,
      summary: "yc unavailable",
      failures: ["placeholder"],
      strengths: [],
      availability: "degraded_schema_recovered",
    });

    expect(section).toContain("Evaluation indisponible");
    expect(section).not.toContain("placeholder");
  });

  it("renders unavailable axes with an explicit ignore hint", () => {
    const line = formatAxisPromptLine("Deal Accessibility", {
      verdict: "contrasted",
      summary: "Indisponible",
      sourceFrameworks: [],
    });

    expect(line).toContain("indisponible");
    expect(line).toContain("ignorer comme signal metier");
  });

  it("renders evaluated frameworks normally", () => {
    expect(
      formatFrameworkPromptLine("YC", {
        verdict: "favorable",
        availability: "evaluated",
      })
    ).toBe("- **YC** : favorable");
  });

  it("renders degraded frameworks as unavailable for the reconciler", () => {
    const section = formatReconcilerLensSection("Angel Desk", {
      availability: "degraded_chain_exhausted",
      summary: "placeholder",
      claims: [],
    });

    expect(section).toContain("indisponible");
    expect(section).toContain("ignorer dans la reconciliation");
  });
});
