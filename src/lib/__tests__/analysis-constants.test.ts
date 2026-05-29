import { describe, expect, it } from "vitest";

import {
  ANALYSIS_TYPES,
  CREDIT_ANALYSIS_CONFIG,
  formatAnalysisMode,
} from "../analysis-constants";

describe("analysis-constants — crédits-only contract", () => {
  it("n'expose plus aucun entrypoint public legacy", () => {
    const publicTypes = ANALYSIS_TYPES.map((entry) => entry.value);

    expect(publicTypes).toContain("full_analysis");
    expect(publicTypes).not.toContain("full_dd");
    expect(publicTypes).not.toContain("quick_scan");
    expect(publicTypes).not.toContain("tier1_complete");
  });

  it("expose un seul produit thesis-first DEEP_DIVE", () => {
    expect(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE.analysisType).toBe("full_analysis");
    expect(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE.credits).toBe(5);
  });

  it("garde les libelles legacy en lecture seule sans les re-promettre comme produit actif", () => {
    expect(formatAnalysisMode("full_analysis")).toBe("Deep Dive thesis-first");
    expect(formatAnalysisMode("full_dd")).toContain("legacy");
    expect(formatAnalysisMode("tier1_complete")).toContain("legacy");
  });
});
