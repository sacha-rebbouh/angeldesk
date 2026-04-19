import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeJSONMock, ensureLLMContextMock } = vi.hoisted(() => ({
  completeJSONMock: vi.fn(),
  ensureLLMContextMock: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: completeJSONMock,
  ensureLLMContext: ensureLLMContextMock,
}));

import { generateExcelAnalystReport } from "../analyst";

describe("generateExcelAnalystReport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    ensureLLMContextMock.mockImplementation(async (_agentName: string, fn: () => Promise<unknown>) => fn());
  });

  it("tries top-tier excel auditor models in order and returns the first successful result", async () => {
    completeJSONMock
      .mockRejectedValueOnce(new Error("sonnet 4.5 unavailable"))
      .mockResolvedValueOnce({
        data: {
          executiveSummary: "ok",
          topRedFlags: [],
          topGreenFlags: [],
          keyQuestions: [],
          priorityChecks: [],
          confidence: "medium",
          reasoningNotes: [],
        },
        cost: 0.123,
      });

    const result = await generateExcelAnalystReport({
      extraction: {
        metadata: {
          sheetCount: 2,
          totalRows: 10,
          totalCells: 20,
          hasFormulas: true,
          formulaCount: 5,
          hasCharts: false,
          hiddenSheetCount: 0,
        },
        workbookAudit: {
          hiddenSheets: [],
          assumptionSheets: ["Assumptions"],
          outputSheets: ["Outputs"],
          calcSheets: [],
          criticalSheets: ["Assumptions", "Outputs"],
          formulaHeavySheets: [],
          warningFlags: [],
        },
        corpus: "",
        sheets: [],
      } as never,
      intelligence: {
        workbookMap: { sheetCount: 2, hiddenSheets: [], roles: [] },
        warnings: [],
        drivers: { count: 0, top: [] },
        outputs: { count: 0, canonical: [], top: [] },
        hardcodes: { count: 0, highSeverityCount: 0, top: [] },
        hiddenStructures: [],
        disconnectedCalcs: [],
        criticalDependencies: [],
      } as never,
      financialAudit: {
        consistencyFlags: [],
        reconciliationFlags: [],
        plausibilityFlags: [],
        heroicAssumptionFlags: [],
        dependencyFlags: [],
        greenFlags: [],
        keyMetrics: [],
        topSensitivities: [],
        overallRisk: "medium",
        warnings: [],
      } as never,
    });

    expect(result?.report.executiveSummary).toBe("ok");
    expect(completeJSONMock).toHaveBeenCalledTimes(2);
    expect(completeJSONMock.mock.calls[0][1]?.model).toBe("CLAUDE_SONNET_45");
    expect(completeJSONMock.mock.calls[1][1]?.model).toBe("GPT_54");
  });

  it("returns null when no OpenRouter key is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await generateExcelAnalystReport({
      extraction: {} as never,
      intelligence: {} as never,
      financialAudit: {} as never,
    });

    expect(result).toBeNull();
    expect(completeJSONMock).not.toHaveBeenCalled();
  });
});
