import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const createDefaultPdfProviderStackMock = vi.fn();
const createPdfJsNativeExtractionProviderMock = vi.fn();

vi.mock("../../openrouter/client", () => ({
  openrouter: {},
  MODELS: {
    GPT4O_MINI: { inputCost: 0.001, outputCost: 0.002 },
    GPT4O: { inputCost: 0.01, outputCost: 0.03 },
  },
}));

vi.mock("../providers/router", () => ({
  createDefaultPdfProviderStack: createDefaultPdfProviderStackMock,
}));

vi.mock("../providers/native-pdf-provider", () => ({
  createPdfJsNativeExtractionProvider: createPdfJsNativeExtractionProviderMock,
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
  chooseBetterPageOCRResult,
  processImageArtifactOCR,
  smartExtract,
} = await import("../ocr-service");

beforeEach(() => {
  findManyMock.mockReset();
  findManyMock.mockResolvedValue([]);
  createDefaultPdfProviderStackMock.mockReset();
  createPdfJsNativeExtractionProviderMock.mockReset();
  createDefaultPdfProviderStackMock.mockReturnValue({
    native: undefined,
    pageOcr: undefined,
    structuredPrimary: undefined,
    structuredFallback: undefined,
  });
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

describe("chooseBetterPageOCRResult", () => {
  function pageResult(overrides: Partial<Awaited<ReturnType<typeof processImageArtifactOCR>>> = {}) {
    const text = overrides.text ?? "Revenue bridge\n2025A 12.4m\n2026F 18.1m";
    return {
      pageNumber: 1,
      text,
      confidence: overrides.confidence ?? "medium",
      hasCharts: overrides.hasCharts ?? false,
      hasImages: overrides.hasImages ?? false,
      processingTimeMs: 10,
      cost: overrides.cost ?? 0.01,
      mode: overrides.mode ?? "high_fidelity",
      cacheHit: false,
      artifact: overrides.artifact ?? {
        version: "document-page-artifact-v1",
        pageNumber: 1,
        text,
        visualBlocks: [],
        tables: [],
        charts: [],
        unreadableRegions: [],
        numericClaims: [],
        confidence: overrides.confidence ?? "medium",
        needsHumanReview: false,
        ocrMode: overrides.mode ?? "high_fidelity",
      },
    } as Awaited<ReturnType<typeof processImageArtifactOCR>>;
  }

  it("keeps a richer structured-layout baseline when a VLM retry undercovers it", () => {
    const baselineText = [
      "Customer Overview - Cont’d",
      "Strong Managed Services Net Revenue Retention",
      "108% 103% 104% 103% 99% 96% 127% NRR",
      "Recent Logo wins $1.5m ARR and $4.0m recurring sales",
      "Pipeline Opportunities $7.6m Backlog Weighted Pipeline Go-get Buffer FY25B",
    ].join("\n");
    const retryText = [
      "Customer Overview - Cont’d",
      "Genesis combines strong retention and recent logo wins",
      "$1.5m ARR and $4.0m total recurring sales",
    ].join("\n");
    const baseline = pageResult({
      text: baselineText,
      artifact: {
        ...pageResult().artifact!,
        text: baselineText,
        numericClaims: [
          { label: "NRR", value: "127%", sourceText: "127% NRR", confidence: "medium" },
          { label: "Backlog", value: "$7.6m", sourceText: "$7.6m Backlog", confidence: "medium" },
        ],
        provider: {
          kind: "google-document-ai",
          mode: "supreme",
          providerVersion: "structured-layout-v1",
          transport: "provider_structured",
        },
      },
    });
    const retry = pageResult({
      text: retryText,
      confidence: "medium",
      artifact: {
        ...pageResult().artifact!,
        text: retryText,
        provider: {
          kind: "openrouter-vlm",
          modelId: "openai/gpt-4o",
          mode: "supreme",
          providerVersion: "openrouter-v1",
          promptVersion: "ocr-structured-v3",
          schemaVersion: "ocr-structured-schema-v1",
          transport: "json_schema",
        },
      },
    });

    expect(chooseBetterPageOCRResult(baseline, retry)).toBe(baseline);
  });

  it("accepts a VLM retry when it preserves baseline coverage and adds evidence", () => {
    const baselineText = "Revenue bridge\n2025A 12.4m\n2026F 18.1m";
    const retryText = `${baselineText}\nChart shows acceleration from 2025A to 2026F`;
    const baseline = pageResult({
      text: baselineText,
      artifact: {
        ...pageResult().artifact!,
        text: baselineText,
        provider: {
          kind: "google-document-ai",
          mode: "high_fidelity",
          providerVersion: "structured-layout-v1",
          transport: "provider_structured",
        },
      },
    });
    const retry = pageResult({
      text: retryText,
      confidence: "high",
      artifact: {
        ...pageResult().artifact!,
        text: retryText,
        charts: [{ title: "Revenue bridge", description: "Revenue acceleration chart", confidence: "high" }],
        numericClaims: [
          { label: "2025A revenue", value: "12.4m", sourceText: "2025A 12.4m", confidence: "high" },
          { label: "2026F revenue", value: "18.1m", sourceText: "2026F 18.1m", confidence: "high" },
        ],
        provider: {
          kind: "openrouter-vlm",
          modelId: "openai/gpt-4o",
          mode: "high_fidelity",
          providerVersion: "openrouter-v1",
          promptVersion: "ocr-structured-v3",
          schemaVersion: "ocr-structured-schema-v1",
          transport: "json_schema",
        },
      },
    });

    expect(chooseBetterPageOCRResult(baseline, retry)).toBe(retry);
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
          provider: {
            kind: "openrouter-vlm",
            modelId: "openai/gpt-4o",
            mode: "supreme",
            providerVersion: "openrouter-v1",
            promptVersion: "ocr-structured-v3",
            schemaVersion: "ocr-structured-schema-v1",
            transport: "json_schema",
          },
          verification: {
            state: "provider_structured",
            evidence: ["table_count=0", "chart_count=1"],
          },
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

describe("smartExtract structured provider routing", () => {
  it("uses the configured structured layout provider before falling back to VLM OCR", async () => {
    createPdfJsNativeExtractionProviderMock.mockReturnValue({
      extractFromBuffer: vi.fn().mockResolvedValue({
        provider: { id: "pdfjs-native", label: "PDF.js", kind: "native_text" },
        success: true,
        text: "Revenue bridge 12",
        pageTexts: ["Revenue bridge 12"],
        pageCount: 1,
        metadata: {},
        quality: {
          score: 20,
          metrics: {
            qualityScore: 20,
            pageContentDistribution: [17],
          },
          warnings: [],
        },
        raw: {
          success: true,
          text: "Revenue bridge 12",
          pageTexts: ["Revenue bridge 12"],
          pageCount: 1,
          info: {},
          quality: {
            metrics: {
              qualityScore: 20,
              pageContentDistribution: [17],
            },
          },
        },
      }),
    });

    const structuredExtractFromBuffer = vi.fn().mockResolvedValue({
      provider: { id: "google-document-ai", label: "Google Document AI", kind: "structured_layout" },
      success: true,
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: "Revenue bridge\n2025A 12.4m\n2026F 18.1m",
          confidence: "high",
          visualBlocks: [{ type: "table", description: "Extracted table", confidence: "high" }],
          tables: [{ markdown: "| Metric | Value |\n| Revenue | 12.4m |", rows: [["Metric", "Value"], ["Revenue", "12.4m"]], confidence: "high" }],
          charts: [],
          unreadableRegions: [],
          numericClaims: [{ label: "Revenue", value: "12.4m", sourceText: "Revenue 12.4m", confidence: "high" }],
        },
      ],
      raw: {},
    });

    createDefaultPdfProviderStackMock.mockReturnValue({
      native: undefined,
      pageOcr: undefined,
      structuredPrimary: {
        descriptor: { id: "google-document-ai", label: "Google Document AI", kind: "structured_layout" },
        extractFromBuffer: structuredExtractFromBuffer,
      },
      structuredFallback: undefined,
    });

    const result = await smartExtract(Buffer.from("fake-pdf"), {
      autoOCR: true,
      strict: false,
      maxOCRPages: 10,
    });

    expect(result.method).toBe("hybrid");
    expect(result.pagesOCRd).toBe(1);
    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.ocrResult?.pageResults[0]?.artifact?.provider?.kind).toBe("google-document-ai");
    expect(result.manifest.pages[0]?.artifact?.verification?.state).toBe("provider_structured");
    expect(structuredExtractFromBuffer).toHaveBeenCalledWith(expect.objectContaining({
      pageNumbers: [1],
    }));
  });
});
