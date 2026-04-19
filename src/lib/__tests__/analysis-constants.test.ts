import { describe, expect, it } from "vitest";

import {
  ANALYSIS_TYPES,
  CREDIT_ANALYSIS_CONFIG,
  PLAN_ANALYSIS_CONFIG,
  formatAnalysisMode,
  getAnalysisTypeForPlan,
} from "../analysis-constants";

describe("analysis-constants thesis-first contract", () => {
  it("n'expose plus aucun entrypoint public legacy", () => {
    const publicTypes = ANALYSIS_TYPES.map((entry) => entry.value);

    expect(publicTypes).toContain("full_analysis");
    expect(publicTypes).not.toContain("full_dd");
    expect(publicTypes).not.toContain("quick_scan");
    expect(publicTypes).not.toContain("tier1_complete");
  });

  it("aligne tous les plans sur le meme Deep Dive thesis-first", () => {
    expect(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE.analysisType).toBe("full_analysis");

    expect(getAnalysisTypeForPlan("FREE")).toBe("full_analysis");
    expect(getAnalysisTypeForPlan("PRO")).toBe("full_analysis");
    expect(getAnalysisTypeForPlan("ENTERPRISE")).toBe("full_analysis");

    expect(PLAN_ANALYSIS_CONFIG.FREE).toBe(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE);
    expect(PLAN_ANALYSIS_CONFIG.PRO).toBe(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE);
    expect(PLAN_ANALYSIS_CONFIG.ENTERPRISE).toBe(CREDIT_ANALYSIS_CONFIG.DEEP_DIVE);
  });

  it("garde les libelles legacy en lecture seule sans les re-promettre comme produit actif", () => {
    expect(formatAnalysisMode("full_analysis")).toBe("Deep Dive thesis-first");
    expect(formatAnalysisMode("full_dd")).toContain("legacy");
    expect(formatAnalysisMode("tier1_complete")).toContain("legacy");
  });
});
