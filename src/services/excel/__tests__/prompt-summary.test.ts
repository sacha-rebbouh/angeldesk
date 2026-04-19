import { describe, expect, it } from "vitest";

import { buildExcelPromptSummaryFromMetrics } from "../prompt-summary";

describe("buildExcelPromptSummaryFromMetrics", () => {
  it("builds a compact workbook audit summary for agent prompts", () => {
    const summary = buildExcelPromptSummaryFromMetrics({
      workbookAudit: {
        warningFlags: ["hidden_assumptions", "formula_heavy_outputs"],
        outputSheets: ["Outputs", "LBO Overview"],
        assumptionSheets: ["Assumptions"],
        hiddenSheets: ["Helpers"],
      },
      modelIntelligence: {
        outputs: {
          canonical: [
            { sheet: "Outputs", cell: "B12", metricFamily: "revenue" },
          ],
        },
        hardcodes: { highSeverityCount: 3 },
        criticalDependencies: [
          {
            output: "Outputs!B12",
            hardcodedPrecedentCount: 1,
            transitiveHardcodedPrecedentCount: 2,
            sampleHardcodePaths: [
              { nodes: ["UW!B2", "UW!B3", "Outputs!B12"] },
            ],
          },
        ],
        disconnectedCalcs: [{ sheet: "UW", cell: "F42" }],
      },
      financialAudit: {
        overallRisk: "high",
        consistencyFlags: [{ severity: "high", title: "Calculs déconnectés" }],
        reconciliationFlags: [{ severity: "critical", title: "Reconciliation revenue incohérente" }],
        plausibilityFlags: [{ severity: "critical", title: "Occupancy impossible" }],
        heroicAssumptionFlags: [],
        dependencyFlags: [],
      },
      analystReport: {
        executiveSummary: "Le modèle paraît agressif et dépend de peu de drivers.",
        topRedFlags: ["Occupancy irréaliste", "Hardcodes sur outputs"],
        keyQuestions: ["Quelle est la vraie base d'occupancy historique ?"],
      },
    });

    expect(summary).toContain("Workbook warning flags");
    expect(summary).toContain("Financial audit overall risk: high");
    expect(summary).toContain("Analyst red flags");
    expect(summary).toContain("Canonical outputs");
    expect(summary).toContain("Outputs!B12");
    expect(summary).toContain("transitive hardcoded precedents=2");
    expect(summary).toContain("UW!B2 -> UW!B3 -> Outputs!B12");
    expect(summary).toContain("Reconciliation revenue incohérente");
  });

  it("returns null when no structured excel audit is present", () => {
    expect(buildExcelPromptSummaryFromMetrics({ foo: "bar" })).toBeNull();
    expect(buildExcelPromptSummaryFromMetrics(null)).toBeNull();
  });
});
