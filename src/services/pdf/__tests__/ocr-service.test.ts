import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("../../openrouter/client", () => ({
  openrouter: {},
  MODELS: {
    GPT4O_MINI: { inputCost: 0.001, outputCost: 0.002 },
    GPT4O: { inputCost: 0.01, outputCost: 0.03 },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentExtractionPage: {
      findMany: findManyMock,
    },
  },
}));

const {
  detectPageSignals,
  sanitizeVisionOCRText,
  shouldLowConfidencePageRequireReview,
  isLowInformationWarningOnlyPage,
  isCachedOCRModeReusable,
  processImageArtifactOCR,
} = await import("../ocr-service");

beforeEach(() => {
  findManyMock.mockReset();
  findManyMock.mockResolvedValue([]);
});

describe("detectPageSignals", () => {
  it("detects chart-like KPI pages even without explicit chart keywords", () => {
    const result = detectPageSignals(
      [
        "Jan-24 Mar-24 May-24 Jul-24 Sep-24 Nov-24",
        "1.2 1.4 1.7 1.9 2.1 2.4",
        "Gross Margin 61% 63% 64%",
        "NRR 118% 121% 124%",
      ].join("\n")
    );

    expect(result.hasCharts).toBe(true);
    expect(result.hasFinancialKeywords).toBe(true);
  });

  it("does not overclassify decorative cover pages as charts just because they contain a year", () => {
    const result = detectPageSignals("Strategy Paper\n2026\nPrivate and Confidential", {
      isEdgePage: true,
    });

    expect(result.hasCharts).toBe(false);
    expect(result.hasTables).toBe(false);
  });
});

describe("sanitizeVisionOCRText", () => {
  it("drops refusal-like assistant answers instead of treating them as OCR content", () => {
    const result = sanitizeVisionOCRText(
      "I'm unable to perform OCR on images or extract detailed information from them. However, I can help guide you on how to approach this task. Let me know how I can assist you!"
    );

    expect(result.refusalLike).toBe(true);
    expect(result.text).toBe("");
  });

  it("keeps real OCR text untouched", () => {
    const result = sanitizeVisionOCRText("Revenue 12.4m\nEBITDA 3.6m\nFY25");

    expect(result.refusalLike).toBe(false);
    expect(result.text).toBe("Revenue 12.4m\nEBITDA 3.6m\nFY25");
  });
});

describe("shouldLowConfidencePageRequireReview", () => {
  it("does not block low-confidence pages when semantic coverage is already sufficient", () => {
    expect(shouldLowConfidencePageRequireReview({
      confidence: "low",
      semanticAssessment: {
        semanticSufficiency: "sufficient",
        canDegradeToWarning: false,
        structureDependency: "high",
      },
    })).toBe(false);
  });

  it("does not block low-confidence pages when partial semantics can degrade to warning", () => {
    expect(shouldLowConfidencePageRequireReview({
      confidence: "low",
      semanticAssessment: {
        semanticSufficiency: "partial",
        canDegradeToWarning: true,
        structureDependency: "critical",
      },
    })).toBe(false);
  });

  it("keeps low-confidence critical pages in review when semantics remain insufficient", () => {
    expect(shouldLowConfidencePageRequireReview({
      confidence: "low",
      semanticAssessment: {
        semanticSufficiency: "insufficient",
        canDegradeToWarning: false,
        structureDependency: "critical",
      },
    })).toBe(true);
  });
});

describe("isLowInformationWarningOnlyPage", () => {
  it("downgrades low-information decorative classes when semantics are already sufficient", () => {
    expect(isLowInformationWarningOnlyPage({
      pageClass: "section_divider",
      semanticSufficiency: "sufficient",
      structureDependency: "low",
      analyticalValueScore: 12,
    })).toBe(true);
  });

  it("keeps analytically meaningful or structurally important pages reviewable", () => {
    expect(isLowInformationWarningOnlyPage({
      pageClass: "mixed_visual_analytics",
      semanticSufficiency: "sufficient",
      structureDependency: "critical",
      analyticalValueScore: 80,
    })).toBe(false);
  });
});

describe("isCachedOCRModeReusable", () => {
  it("allows monotonic reuse from stronger cached OCR modes", () => {
    expect(isCachedOCRModeReusable("supreme", "high_fidelity")).toBe(true);
    expect(isCachedOCRModeReusable("supreme", "standard")).toBe(true);
    expect(isCachedOCRModeReusable("high_fidelity", "standard")).toBe(true);
  });

  it("rejects weaker cached OCR modes for stronger requests", () => {
    expect(isCachedOCRModeReusable("standard", "high_fidelity")).toBe(false);
    expect(isCachedOCRModeReusable("high_fidelity", "supreme")).toBe(false);
    expect(isCachedOCRModeReusable(undefined, "standard")).toBe(false);
  });
});

describe("processImageArtifactOCR cache reuse", () => {
  it("reuses a cached stronger OCR artifact instead of calling the provider again", async () => {
    findManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-04-19T10:00:00.000Z"),
        confidence: "high",
        hasCharts: true,
        artifact: {
          version: "document-page-artifact-v1",
          pageNumber: 1,
          text: "Revenue bridge\n2025A 12.4m\n2026F 18.1m",
          visualBlocks: [{ type: "chart", description: "Bridge chart", confidence: "high" }],
          tables: [],
          charts: [{ title: "Revenue bridge", description: "Bridge chart", confidence: "high" }],
          unreadableRegions: [],
          numericClaims: [{ label: "Revenue", value: "12.4m", sourceText: "Revenue 12.4m", confidence: "high" }],
          needsHumanReview: false,
          ocrMode: "supreme",
        },
      },
    ]);

    const result = await processImageArtifactOCR(Buffer.from("cached-page-image"), "png", 1, "high_fidelity");

    expect(result.cacheHit).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.mode).toBe("supreme");
    expect(result.text).toContain("Revenue bridge");
    expect(findManyMock).toHaveBeenCalledTimes(1);
  });
});
