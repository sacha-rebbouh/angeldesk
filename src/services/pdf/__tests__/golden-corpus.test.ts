import { describe, expect, it } from "vitest";

import { buildGoldenAuditSnapshot, compareGoldenAudit } from "../golden-corpus";
import type { ExtractionManifest } from "../ocr-service";

describe("golden-corpus helpers", () => {
  it("builds a compact snapshot from a manifest", () => {
    const manifest = {
      version: "strict-pdf-v1",
      status: "needs_review",
      pageCount: 2,
      pagesProcessed: 2,
      pagesSucceeded: 1,
      pagesFailed: 0,
      pagesSkipped: 0,
      coverageRatio: 1,
      textPages: 1,
      ocrPages: 1,
      hybridPages: 0,
      failedPages: [],
      skippedPages: [],
      criticalPages: [2],
      hardBlockers: [],
      creditEstimate: {
        estimatedCredits: 1,
        estimatedUsd: 0.1,
        pagesByTier: { native_only: 1, standard_ocr: 1, high_fidelity: 0, supreme: 0 },
        unitCredits: { native_only: 0, standard_ocr: 1, high_fidelity: 2, supreme: 3 },
        unitUsd: { native_only: 0, standard_ocr: 0.1, high_fidelity: 0.2, supreme: 0.3 },
        cachedPages: 0,
      },
      completedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          status: "ready",
          method: "native_text",
          charCount: 120,
          wordCount: 30,
          qualityScore: 80,
          hasTables: false,
          hasCharts: false,
          hasFinancialKeywords: false,
          hasTeamKeywords: false,
          hasMarketKeywords: false,
          requiresOCR: false,
          ocrProcessed: false,
          extractionTier: "native_only",
          visualRiskScore: 0,
          visualRiskReasons: [],
        },
        {
          pageNumber: 2,
          status: "needs_review",
          method: "hybrid",
          charCount: 400,
          wordCount: 70,
          qualityScore: 70,
          hasTables: true,
          hasCharts: true,
          hasFinancialKeywords: true,
          hasTeamKeywords: false,
          hasMarketKeywords: false,
          requiresOCR: true,
          ocrProcessed: true,
          extractionTier: "high_fidelity",
          visualRiskScore: 90,
          visualRiskReasons: ["table-like numeric structure"],
          semanticAssessment: {
            pageClass: "mixed_visual_analytics",
            classConfidence: "high",
            classReasons: ["table and chart signals on same page"],
            structureDependency: "critical",
            semanticSufficiency: "insufficient",
            labelValueIntegrity: "strong",
            visualNoiseScore: 40,
            analyticalValueScore: 90,
            requiresStructuredPreservation: true,
            shouldBlockIfStructureMissing: true,
            canDegradeToWarning: false,
            minimumEvidence: ["table mapping"],
            rationale: [],
          },
        },
      ],
    } satisfies ExtractionManifest;

    const snapshot = buildGoldenAuditSnapshot(manifest);

    expect(snapshot.blockingPages).toEqual([2]);
    expect(snapshot.inspectionPages).toEqual([2]);
    expect(snapshot.pages[1]).toMatchObject({
      pageNumber: 2,
      pageClass: "mixed_visual_analytics",
      blocksAnalysis: true,
    });
  });

  it("reports precise diffs against expectations", () => {
    const diffs = compareGoldenAudit(
      {
        blockingPages: [2],
        pageExpectations: [
          { pageNumber: 2, pageClass: "chart_kpi", blocksAnalysis: true },
        ],
      },
      {
        blockingPages: [1],
        inspectionPages: [1],
        pages: [
          {
            pageNumber: 2,
            status: "needs_review",
            pageClass: "mixed_visual_analytics",
            structureDependency: "critical",
            semanticSufficiency: "partial",
            blocksAnalysis: false,
          },
        ],
      }
    );

    expect(diffs).toEqual([
      "blockingPages mismatch: expected [2] but got [1]",
      "page 2 pageClass mismatch: expected chart_kpi but got mixed_visual_analytics",
      "page 2 blocksAnalysis mismatch: expected true but got false",
    ]);
  });
});
