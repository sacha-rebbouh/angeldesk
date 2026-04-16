import { describe, expect, it } from "vitest";

import {
  buildStructuredDocumentManifest,
  summarizeManifestForLegacyMetrics,
} from "../extraction-runs";

describe("buildStructuredDocumentManifest", () => {
  it("builds a strict manifest with page-level status, blockers, and credit estimates", () => {
    const manifest = buildStructuredDocumentManifest({
      estimatedCredits: 7,
      estimatedUsd: 0.021,
      artifacts: [
        {
          index: 1,
          label: "cover",
          text: "Pithos\nPrivate and Confidential\nSelf-storage strategy paper",
          method: "native_text",
        },
        {
          index: 2,
          label: "table slide",
          text: "Revenue | 2023 | 2024\nARR | 1.0 | 2.0",
          method: "hybrid",
          hasTables: true,
          hasFinancialKeywords: true,
        },
        {
          index: 3,
          label: "chart slide",
          text: "NRI growth chart and market trajectory",
          method: "ocr",
          hasCharts: true,
          requiresReview: true,
        },
        {
          index: 4,
          label: "broken slide",
          text: "",
          method: "ocr",
          error: "OCR failed",
        },
      ],
    });

    expect(manifest.version).toBe("strict-document-v1");
    expect(manifest.status).toBe("failed");
    expect(manifest.pageCount).toBe(4);
    expect(manifest.pagesProcessed).toBe(4);
    expect(manifest.pagesSucceeded).toBe(2);
    expect(manifest.pagesFailed).toBe(1);
    expect(manifest.pagesSkipped).toBe(0);
    expect(manifest.coverageRatio).toBe(1);
    expect(manifest.criticalPages).toEqual([2, 3]);
    expect(manifest.hardBlockers).toEqual([
      {
        code: "STRUCTURED_DOCUMENT_ARTIFACT_FAILED",
        message: "Structured artifact 4 failed extraction.",
        pageNumber: 4,
      },
    ]);

    expect(manifest.pages[1]).toMatchObject({
      pageNumber: 2,
      status: "ready",
      method: "hybrid",
      hasTables: true,
      hasFinancialKeywords: true,
      extractionTier: "high_fidelity",
      ocrProcessed: true,
    });
    expect(manifest.pages[1].artifact?.tables).toHaveLength(1);
    expect(manifest.pages[1].artifact?.numericClaims.length).toBeGreaterThan(0);

    expect(manifest.pages[2]).toMatchObject({
      pageNumber: 3,
      status: "needs_review",
      method: "ocr",
      hasCharts: true,
      extractionTier: "high_fidelity",
      visualRiskScore: 100,
    });

    expect(manifest.pages[3]).toMatchObject({
      pageNumber: 4,
      status: "failed",
      qualityScore: 0,
      error: "OCR failed",
    });

    expect(manifest.creditEstimate).toMatchObject({
      estimatedCredits: 7,
      estimatedUsd: 0.021,
      pagesByTier: {
        native_only: 1,
        standard_ocr: 0,
        high_fidelity: 3,
        supreme: 0,
      },
      unitCredits: {
        native_only: 0,
        standard_ocr: 0,
        high_fidelity: 1,
        supreme: 2,
      },
    });
  });

  it("serializes legacy metrics without dropping page quality planning", () => {
    const manifest = buildStructuredDocumentManifest({
      artifacts: [
        {
          index: 1,
          label: "table page",
          text: "ARR | 2023 | 2024\n1 | 10 | 20",
          method: "hybrid",
          hasTables: true,
        },
      ],
    });

    const legacyMetrics = summarizeManifestForLegacyMetrics(manifest);

    expect(legacyMetrics).toMatchObject({
      strictExtraction: true,
      manifestVersion: "strict-document-v1",
      status: "ready",
      pageCount: 1,
      pagesProcessed: 1,
      pagesSucceeded: 1,
      pagesFailed: 0,
      pagesSkipped: 0,
      coverageRatio: 1,
      failedPages: [],
      criticalPages: [1],
      pageQualityPlan: [
        {
          pageNumber: 1,
          extractionTier: "high_fidelity",
          visualRiskScore: 0,
          visualRiskReasons: [],
        },
      ],
    });
  });

  it("blocks visually flagged artifacts when structured tables/charts are missing", () => {
    const manifest = buildStructuredDocumentManifest({
      artifacts: [
        {
          index: 1,
          label: "visual page",
          text: "Revenue chart with visible axis and percentages",
          method: "hybrid",
          hasCharts: true,
          hasFinancialKeywords: true,
          artifact: {
            version: "document-page-artifact-v1",
            pageNumber: 1,
            label: "visual page",
            text: "Revenue chart with visible axis and percentages",
            visualBlocks: [{ type: "chart", description: "Chart detected", confidence: "medium" }],
            tables: [],
            charts: [],
            unreadableRegions: [],
            numericClaims: [],
            confidence: "medium",
            needsHumanReview: true,
          },
        },
      ],
    });

    expect(manifest.status).toBe("needs_review");
    expect(manifest.pages[0]).toMatchObject({
      status: "needs_review",
      visualRiskScore: 100,
    });
    expect(manifest.pages[0].visualRiskReasons).toContain("visual page has incomplete structured visual extraction");
  });
});
