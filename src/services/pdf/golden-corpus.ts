import type { ExtractionManifest } from "./ocr-service";
import type { PDFExtractionResult } from "./extractor";
import { getBlockingPageNumbersFromManifest } from "../documents/extraction-runs";

export type GoldenNumericExpectation =
  | number
  | {
      eq?: number;
      min?: number;
      max?: number;
    };

export interface GoldenPageExpectation {
  pageNumber: number;
  status?: "ready" | "ready_with_warnings" | "needs_review" | "failed" | "skipped";
  method?: "native_text" | "ocr" | "hybrid" | "skipped";
  extractionTier?: "native_only" | "standard_ocr" | "high_fidelity" | "supreme";
  pageClass?: string | null;
  structureDependency?: string | null;
  semanticSufficiency?: string | null;
  labelValueIntegrity?: string | null;
  charCount?: GoldenNumericExpectation;
  wordCount?: GoldenNumericExpectation;
  qualityScore?: GoldenNumericExpectation;
  visualRiskScore?: GoldenNumericExpectation;
  analyticalValueScore?: GoldenNumericExpectation;
  hasTables?: boolean;
  hasCharts?: boolean;
  hasFinancialKeywords?: boolean;
  hasTeamKeywords?: boolean;
  hasMarketKeywords?: boolean;
  minimumEvidenceIncludes?: string[];
  blocksAnalysis?: boolean;
}

export interface GoldenDocumentSummaryExpectation {
  manifestStatus?: ExtractionManifest["status"];
  pageCount?: GoldenNumericExpectation;
  pagesProcessed?: GoldenNumericExpectation;
  pagesSucceeded?: GoldenNumericExpectation;
  pagesFailed?: GoldenNumericExpectation;
  pagesSkipped?: GoldenNumericExpectation;
  coverageRatio?: GoldenNumericExpectation;
  blockerCount?: GoldenNumericExpectation;
  inspectionCount?: GoldenNumericExpectation;
  statusCounts?: Record<string, number>;
  methodCounts?: Record<string, number>;
  extractionTierCounts?: Record<string, number>;
  pageClassCounts?: Record<string, number>;
  structureDependencyCounts?: Record<string, number>;
  semanticSufficiencyCounts?: Record<string, number>;
  labelValueIntegrityCounts?: Record<string, number>;
  evidenceCounts?: Partial<GoldenAuditSnapshot["summary"]["evidenceCounts"]>;
  quality?: {
    totalCharCount?: GoldenNumericExpectation;
    totalWordCount?: GoldenNumericExpectation;
    avgCharCount?: GoldenNumericExpectation;
    avgWordCount?: GoldenNumericExpectation;
    avgQualityScore?: GoldenNumericExpectation;
    minQualityScore?: GoldenNumericExpectation;
    maxVisualRiskScore?: GoldenNumericExpectation;
    avgVisualRiskScore?: GoldenNumericExpectation;
    maxAnalyticalValueScore?: GoldenNumericExpectation;
    avgAnalyticalValueScore?: GoldenNumericExpectation;
  };
}

export interface GoldenDocumentExpectation {
  blockingPages?: number[];
  inspectionPages?: number[];
  summary?: GoldenDocumentSummaryExpectation;
  pageExpectations?: GoldenPageExpectation[];
}

export interface GoldenDocumentSpec {
  label: string;
  documentPath: string;
  expectation?: GoldenDocumentExpectation;
}

export interface GoldenAuditSnapshot {
  version: "golden-audit-v2";
  manifestStatus: ExtractionManifest["status"];
  pageCount: number;
  pagesProcessed: number;
  pagesSucceeded: number;
  pagesFailed: number;
  pagesSkipped: number;
  coverageRatio: number;
  blockingPages: number[];
  inspectionPages: number[];
  summary: {
    blockerCount: number;
    inspectionCount: number;
    statusCounts: Record<string, number>;
    methodCounts: Record<string, number>;
    extractionTierCounts: Record<string, number>;
    pageClassCounts: Record<string, number>;
    structureDependencyCounts: Record<string, number>;
    semanticSufficiencyCounts: Record<string, number>;
    labelValueIntegrityCounts: Record<string, number>;
    evidenceCounts: {
      tables: number;
      charts: number;
      financialKeywordPages: number;
      teamKeywordPages: number;
      marketKeywordPages: number;
      pagesNeedingReview: number;
      blocksAnalysis: number;
    };
    quality: {
      totalCharCount: number;
      totalWordCount: number;
      avgCharCount: number;
      avgWordCount: number;
      avgQualityScore: number | null;
      minQualityScore: number | null;
      maxVisualRiskScore: number | null;
      avgVisualRiskScore: number | null;
      maxAnalyticalValueScore: number | null;
      avgAnalyticalValueScore: number | null;
    };
  };
  pages: Array<{
    pageNumber: number;
    status: string;
    method: string;
    extractionTier: string;
    charCount: number;
    wordCount: number;
    qualityScore: number | null;
    visualRiskScore: number;
    hasTables: boolean;
    hasCharts: boolean;
    hasFinancialKeywords: boolean;
    hasTeamKeywords: boolean;
    hasMarketKeywords: boolean;
    pageClass: string | null;
    structureDependency: string | null;
    semanticSufficiency: string | null;
    labelValueIntegrity: string | null;
    analyticalValueScore: number | null;
    minimumEvidence: string[];
    blocksAnalysis: boolean;
  }>;
}

export interface GoldenNativePdfSnapshot {
  version: "golden-native-pdf-v1";
  success: boolean;
  pageCount: number;
  totalCharCount: number;
  totalWordCount: number;
  charsPerPage: number;
  wordsPerPage: number;
  pageCharCounts: number[];
  qualityScore: number | null;
  confidenceLevel: string | null;
  requiresOCR: boolean | null;
  isUsable: boolean | null;
  warningCodes: string[];
  warningSeverityCounts: Record<string, number>;
  emptyPages: number | null;
  lowContentPages: number | null;
  goodContentPages: number | null;
  keywordMatchCount: number | null;
  missingCriticalSections: string[];
}

export interface GoldenStackComparisonSnapshot {
  version: "golden-stack-comparison-v1";
  pageCountDelta: number;
  totalCharCountDelta: number;
  totalWordCountDelta: number;
  charsPerPageDelta: number;
  wordsPerPageDelta: number;
  native: {
    qualityScore: number | null;
    confidenceLevel: string | null;
    requiresOCR: boolean | null;
    warningCodes: string[];
  };
  strict: {
    manifestStatus: ExtractionManifest["status"];
    blockerCount: number;
    inspectionCount: number;
    methodCounts: Record<string, number>;
    extractionTierCounts: Record<string, number>;
    pageClassCounts: Record<string, number>;
    evidenceCounts: GoldenAuditSnapshot["summary"]["evidenceCounts"];
    quality: Pick<
      GoldenAuditSnapshot["summary"]["quality"],
      | "avgQualityScore"
      | "minQualityScore"
      | "maxVisualRiskScore"
      | "avgVisualRiskScore"
      | "maxAnalyticalValueScore"
      | "avgAnalyticalValueScore"
    >;
  };
}

export function buildGoldenAuditSnapshot(manifest: ExtractionManifest): GoldenAuditSnapshot {
  const blockingPages = getBlockingPageNumbersFromManifest(manifest);
  const blockingSet = new Set(blockingPages);
  const inspectionPages = manifest.pages
    .filter((page) => page.status === "needs_review" || page.status === "failed")
    .map((page) => page.pageNumber);
  const qualityScores = manifest.pages
    .map((page) => page.qualityScore)
    .filter((score): score is number => typeof score === "number");
  const visualRiskScores = manifest.pages.map((page) => page.visualRiskScore);
  const analyticalValueScores = manifest.pages
    .map((page) => page.semanticAssessment?.analyticalValueScore)
    .filter((score): score is number => typeof score === "number");
  const totalCharCount = manifest.pages.reduce((sum, page) => sum + page.charCount, 0);
  const totalWordCount = manifest.pages.reduce((sum, page) => sum + page.wordCount, 0);

  return {
    version: "golden-audit-v2",
    manifestStatus: manifest.status,
    pageCount: manifest.pageCount,
    pagesProcessed: manifest.pagesProcessed,
    pagesSucceeded: manifest.pagesSucceeded,
    pagesFailed: manifest.pagesFailed,
    pagesSkipped: manifest.pagesSkipped,
    coverageRatio: roundMetric(manifest.coverageRatio),
    blockingPages,
    inspectionPages,
    summary: {
      blockerCount: blockingPages.length,
      inspectionCount: inspectionPages.length,
      statusCounts: countBy(manifest.pages.map((page) => page.status)),
      methodCounts: countBy(manifest.pages.map((page) => page.method)),
      extractionTierCounts: countBy(manifest.pages.map((page) => page.extractionTier)),
      pageClassCounts: countBy(manifest.pages.map((page) => page.semanticAssessment?.pageClass ?? "unknown")),
      structureDependencyCounts: countBy(manifest.pages.map((page) => page.semanticAssessment?.structureDependency ?? "unknown")),
      semanticSufficiencyCounts: countBy(manifest.pages.map((page) => page.semanticAssessment?.semanticSufficiency ?? "unknown")),
      labelValueIntegrityCounts: countBy(manifest.pages.map((page) => page.semanticAssessment?.labelValueIntegrity ?? "unknown")),
      evidenceCounts: {
        tables: manifest.pages.filter((page) => page.hasTables).length,
        charts: manifest.pages.filter((page) => page.hasCharts).length,
        financialKeywordPages: manifest.pages.filter((page) => page.hasFinancialKeywords).length,
        teamKeywordPages: manifest.pages.filter((page) => page.hasTeamKeywords).length,
        marketKeywordPages: manifest.pages.filter((page) => page.hasMarketKeywords).length,
        pagesNeedingReview: manifest.pages.filter((page) => page.status === "needs_review" || page.status === "failed").length,
        blocksAnalysis: blockingPages.length,
      },
      quality: {
        totalCharCount,
        totalWordCount,
        avgCharCount: roundMetric(totalCharCount / Math.max(1, manifest.pages.length)),
        avgWordCount: roundMetric(totalWordCount / Math.max(1, manifest.pages.length)),
        avgQualityScore: averageMetric(qualityScores),
        minQualityScore: qualityScores.length > 0 ? Math.min(...qualityScores) : null,
        maxVisualRiskScore: visualRiskScores.length > 0 ? Math.max(...visualRiskScores) : null,
        avgVisualRiskScore: averageMetric(visualRiskScores),
        maxAnalyticalValueScore: analyticalValueScores.length > 0 ? Math.max(...analyticalValueScores) : null,
        avgAnalyticalValueScore: averageMetric(analyticalValueScores),
      },
    },
    pages: manifest.pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      method: page.method,
      extractionTier: page.extractionTier,
      charCount: page.charCount,
      wordCount: page.wordCount,
      qualityScore: page.qualityScore ?? null,
      visualRiskScore: page.visualRiskScore,
      hasTables: page.hasTables,
      hasCharts: page.hasCharts,
      hasFinancialKeywords: page.hasFinancialKeywords,
      hasTeamKeywords: page.hasTeamKeywords,
      hasMarketKeywords: page.hasMarketKeywords,
      pageClass: page.semanticAssessment?.pageClass ?? null,
      structureDependency: page.semanticAssessment?.structureDependency ?? null,
      semanticSufficiency: page.semanticAssessment?.semanticSufficiency ?? null,
      labelValueIntegrity: page.semanticAssessment?.labelValueIntegrity ?? null,
      analyticalValueScore: page.semanticAssessment?.analyticalValueScore ?? null,
      minimumEvidence: page.semanticAssessment?.minimumEvidence ?? [],
      blocksAnalysis: blockingSet.has(page.pageNumber),
    })),
  };
}

export function buildGoldenNativePdfSnapshot(result: PDFExtractionResult): GoldenNativePdfSnapshot {
  const pageCharCounts = result.pageTexts.map((pageText) => pageText.length);
  const totalCharCount = result.quality?.metrics.totalCharacters ?? result.text.length;
  const totalWordCount = result.quality?.metrics.totalWords ?? result.text.split(/\s+/).filter(Boolean).length;

  return {
    version: "golden-native-pdf-v1",
    success: result.success,
    pageCount: result.pageCount,
    totalCharCount,
    totalWordCount,
    charsPerPage: roundMetric(result.pageCount > 0 ? totalCharCount / result.pageCount : 0),
    wordsPerPage: roundMetric(result.pageCount > 0 ? totalWordCount / result.pageCount : 0),
    pageCharCounts,
    qualityScore: result.quality?.metrics.qualityScore ?? null,
    confidenceLevel: result.quality?.metrics.confidenceLevel ?? null,
    requiresOCR: result.quality?.requiresOCR ?? null,
    isUsable: result.quality?.isUsable ?? null,
    warningCodes: (result.quality?.warnings ?? []).map((warning) => warning.code),
    warningSeverityCounts: countBy((result.quality?.warnings ?? []).map((warning) => warning.severity)),
    emptyPages: result.quality?.metrics.emptyPages ?? null,
    lowContentPages: result.quality?.metrics.lowContentPages ?? null,
    goodContentPages: result.quality?.metrics.goodContentPages ?? null,
    keywordMatchCount: result.quality?.metrics.keywordMatchCount ?? null,
    missingCriticalSections: result.quality?.metrics.missingCriticalSections ?? [],
  };
}

export function buildGoldenStackComparisonSnapshot(
  nativeSnapshot: GoldenNativePdfSnapshot,
  strictSnapshot: GoldenAuditSnapshot
): GoldenStackComparisonSnapshot {
  return {
    version: "golden-stack-comparison-v1",
    pageCountDelta: strictSnapshot.pageCount - nativeSnapshot.pageCount,
    totalCharCountDelta: strictSnapshot.summary.quality.totalCharCount - nativeSnapshot.totalCharCount,
    totalWordCountDelta: strictSnapshot.summary.quality.totalWordCount - nativeSnapshot.totalWordCount,
    charsPerPageDelta: roundMetric(strictSnapshot.summary.quality.avgCharCount - nativeSnapshot.charsPerPage),
    wordsPerPageDelta: roundMetric(strictSnapshot.summary.quality.avgWordCount - nativeSnapshot.wordsPerPage),
    native: {
      qualityScore: nativeSnapshot.qualityScore,
      confidenceLevel: nativeSnapshot.confidenceLevel,
      requiresOCR: nativeSnapshot.requiresOCR,
      warningCodes: nativeSnapshot.warningCodes,
    },
    strict: {
      manifestStatus: strictSnapshot.manifestStatus,
      blockerCount: strictSnapshot.summary.blockerCount,
      inspectionCount: strictSnapshot.summary.inspectionCount,
      methodCounts: strictSnapshot.summary.methodCounts,
      extractionTierCounts: strictSnapshot.summary.extractionTierCounts,
      pageClassCounts: strictSnapshot.summary.pageClassCounts,
      evidenceCounts: strictSnapshot.summary.evidenceCounts,
      quality: {
        avgQualityScore: strictSnapshot.summary.quality.avgQualityScore,
        minQualityScore: strictSnapshot.summary.quality.minQualityScore,
        maxVisualRiskScore: strictSnapshot.summary.quality.maxVisualRiskScore,
        avgVisualRiskScore: strictSnapshot.summary.quality.avgVisualRiskScore,
        maxAnalyticalValueScore: strictSnapshot.summary.quality.maxAnalyticalValueScore,
        avgAnalyticalValueScore: strictSnapshot.summary.quality.avgAnalyticalValueScore,
      },
    },
  };
}

export function compareGoldenAudit(
  expectation: GoldenDocumentExpectation,
  snapshot: GoldenAuditSnapshot
): string[] {
  const diffs: string[] = [];

  if (expectation.blockingPages) {
    const actual = snapshot.blockingPages.join(",");
    const expected = expectation.blockingPages.join(",");
    if (actual !== expected) {
      diffs.push(`blockingPages mismatch: expected [${expected}] but got [${actual}]`);
    }
  }

  if (expectation.inspectionPages) {
    const actual = snapshot.inspectionPages.join(",");
    const expected = expectation.inspectionPages.join(",");
    if (actual !== expected) {
      diffs.push(`inspectionPages mismatch: expected [${expected}] but got [${actual}]`);
    }
  }

  if (expectation.summary) {
    diffs.push(
      ...compareSummaryExpectation(expectation.summary, snapshot)
    );
  }

  for (const pageExpectation of expectation.pageExpectations ?? []) {
    const actual = snapshot.pages.find((page) => page.pageNumber === pageExpectation.pageNumber);
    if (!actual) {
      diffs.push(`page ${pageExpectation.pageNumber} missing from snapshot`);
      continue;
    }

    if (pageExpectation.status && actual.status !== pageExpectation.status) {
      diffs.push(`page ${pageExpectation.pageNumber} status mismatch: expected ${pageExpectation.status} but got ${actual.status}`);
    }
    if (pageExpectation.method && actual.method !== pageExpectation.method) {
      diffs.push(`page ${pageExpectation.pageNumber} method mismatch: expected ${pageExpectation.method} but got ${actual.method}`);
    }
    if (pageExpectation.extractionTier && actual.extractionTier !== pageExpectation.extractionTier) {
      diffs.push(`page ${pageExpectation.pageNumber} extractionTier mismatch: expected ${pageExpectation.extractionTier} but got ${actual.extractionTier}`);
    }
    if (pageExpectation.pageClass !== undefined && actual.pageClass !== pageExpectation.pageClass) {
      diffs.push(`page ${pageExpectation.pageNumber} pageClass mismatch: expected ${pageExpectation.pageClass} but got ${actual.pageClass}`);
    }
    if (pageExpectation.structureDependency !== undefined && actual.structureDependency !== pageExpectation.structureDependency) {
      diffs.push(`page ${pageExpectation.pageNumber} structureDependency mismatch: expected ${pageExpectation.structureDependency} but got ${actual.structureDependency}`);
    }
    if (pageExpectation.semanticSufficiency !== undefined && actual.semanticSufficiency !== pageExpectation.semanticSufficiency) {
      diffs.push(`page ${pageExpectation.pageNumber} semanticSufficiency mismatch: expected ${pageExpectation.semanticSufficiency} but got ${actual.semanticSufficiency}`);
    }
    if (pageExpectation.labelValueIntegrity !== undefined && actual.labelValueIntegrity !== pageExpectation.labelValueIntegrity) {
      diffs.push(`page ${pageExpectation.pageNumber} labelValueIntegrity mismatch: expected ${pageExpectation.labelValueIntegrity} but got ${actual.labelValueIntegrity}`);
    }
    diffs.push(...compareNumericExpectation(`page ${pageExpectation.pageNumber} charCount`, pageExpectation.charCount, actual.charCount));
    diffs.push(...compareNumericExpectation(`page ${pageExpectation.pageNumber} wordCount`, pageExpectation.wordCount, actual.wordCount));
    diffs.push(...compareNumericExpectation(`page ${pageExpectation.pageNumber} qualityScore`, pageExpectation.qualityScore, actual.qualityScore));
    diffs.push(...compareNumericExpectation(`page ${pageExpectation.pageNumber} visualRiskScore`, pageExpectation.visualRiskScore, actual.visualRiskScore));
    diffs.push(...compareNumericExpectation(`page ${pageExpectation.pageNumber} analyticalValueScore`, pageExpectation.analyticalValueScore, actual.analyticalValueScore));
    if (pageExpectation.hasTables !== undefined && actual.hasTables !== pageExpectation.hasTables) {
      diffs.push(`page ${pageExpectation.pageNumber} hasTables mismatch: expected ${pageExpectation.hasTables} but got ${actual.hasTables}`);
    }
    if (pageExpectation.hasCharts !== undefined && actual.hasCharts !== pageExpectation.hasCharts) {
      diffs.push(`page ${pageExpectation.pageNumber} hasCharts mismatch: expected ${pageExpectation.hasCharts} but got ${actual.hasCharts}`);
    }
    if (pageExpectation.hasFinancialKeywords !== undefined && actual.hasFinancialKeywords !== pageExpectation.hasFinancialKeywords) {
      diffs.push(`page ${pageExpectation.pageNumber} hasFinancialKeywords mismatch: expected ${pageExpectation.hasFinancialKeywords} but got ${actual.hasFinancialKeywords}`);
    }
    if (pageExpectation.hasTeamKeywords !== undefined && actual.hasTeamKeywords !== pageExpectation.hasTeamKeywords) {
      diffs.push(`page ${pageExpectation.pageNumber} hasTeamKeywords mismatch: expected ${pageExpectation.hasTeamKeywords} but got ${actual.hasTeamKeywords}`);
    }
    if (pageExpectation.hasMarketKeywords !== undefined && actual.hasMarketKeywords !== pageExpectation.hasMarketKeywords) {
      diffs.push(`page ${pageExpectation.pageNumber} hasMarketKeywords mismatch: expected ${pageExpectation.hasMarketKeywords} but got ${actual.hasMarketKeywords}`);
    }
    if (pageExpectation.minimumEvidenceIncludes) {
      for (const evidence of pageExpectation.minimumEvidenceIncludes) {
        if (!actual.minimumEvidence.includes(evidence)) {
          diffs.push(`page ${pageExpectation.pageNumber} minimumEvidence missing expected item: ${evidence}`);
        }
      }
    }
    if (pageExpectation.blocksAnalysis !== undefined && actual.blocksAnalysis !== pageExpectation.blocksAnalysis) {
      diffs.push(`page ${pageExpectation.pageNumber} blocksAnalysis mismatch: expected ${pageExpectation.blocksAnalysis} but got ${actual.blocksAnalysis}`);
    }
  }

  return diffs;
}

function compareSummaryExpectation(
  expectation: GoldenDocumentSummaryExpectation,
  snapshot: GoldenAuditSnapshot
): string[] {
  const diffs: string[] = [];

  if (expectation.manifestStatus && snapshot.manifestStatus !== expectation.manifestStatus) {
    diffs.push(`summary manifestStatus mismatch: expected ${expectation.manifestStatus} but got ${snapshot.manifestStatus}`);
  }

  diffs.push(...compareNumericExpectation("summary pageCount", expectation.pageCount, snapshot.pageCount));
  diffs.push(...compareNumericExpectation("summary pagesProcessed", expectation.pagesProcessed, snapshot.pagesProcessed));
  diffs.push(...compareNumericExpectation("summary pagesSucceeded", expectation.pagesSucceeded, snapshot.pagesSucceeded));
  diffs.push(...compareNumericExpectation("summary pagesFailed", expectation.pagesFailed, snapshot.pagesFailed));
  diffs.push(...compareNumericExpectation("summary pagesSkipped", expectation.pagesSkipped, snapshot.pagesSkipped));
  diffs.push(...compareNumericExpectation("summary coverageRatio", expectation.coverageRatio, snapshot.coverageRatio));
  diffs.push(...compareNumericExpectation("summary blockerCount", expectation.blockerCount, snapshot.summary.blockerCount));
  diffs.push(...compareNumericExpectation("summary inspectionCount", expectation.inspectionCount, snapshot.summary.inspectionCount));

  diffs.push(...compareCountMap("summary statusCounts", expectation.statusCounts, snapshot.summary.statusCounts));
  diffs.push(...compareCountMap("summary methodCounts", expectation.methodCounts, snapshot.summary.methodCounts));
  diffs.push(...compareCountMap("summary extractionTierCounts", expectation.extractionTierCounts, snapshot.summary.extractionTierCounts));
  diffs.push(...compareCountMap("summary pageClassCounts", expectation.pageClassCounts, snapshot.summary.pageClassCounts));
  diffs.push(...compareCountMap("summary structureDependencyCounts", expectation.structureDependencyCounts, snapshot.summary.structureDependencyCounts));
  diffs.push(...compareCountMap("summary semanticSufficiencyCounts", expectation.semanticSufficiencyCounts, snapshot.summary.semanticSufficiencyCounts));
  diffs.push(...compareCountMap("summary labelValueIntegrityCounts", expectation.labelValueIntegrityCounts, snapshot.summary.labelValueIntegrityCounts));

  if (expectation.evidenceCounts) {
    for (const [key, expected] of Object.entries(expectation.evidenceCounts)) {
      const actual = snapshot.summary.evidenceCounts[key as keyof GoldenAuditSnapshot["summary"]["evidenceCounts"]];
      if (actual !== expected) {
        diffs.push(`summary evidenceCounts.${key} mismatch: expected ${expected} but got ${actual}`);
      }
    }
  }

  if (expectation.quality) {
    diffs.push(...compareNumericExpectation("summary quality.totalCharCount", expectation.quality.totalCharCount, snapshot.summary.quality.totalCharCount));
    diffs.push(...compareNumericExpectation("summary quality.totalWordCount", expectation.quality.totalWordCount, snapshot.summary.quality.totalWordCount));
    diffs.push(...compareNumericExpectation("summary quality.avgCharCount", expectation.quality.avgCharCount, snapshot.summary.quality.avgCharCount));
    diffs.push(...compareNumericExpectation("summary quality.avgWordCount", expectation.quality.avgWordCount, snapshot.summary.quality.avgWordCount));
    diffs.push(...compareNumericExpectation("summary quality.avgQualityScore", expectation.quality.avgQualityScore, snapshot.summary.quality.avgQualityScore));
    diffs.push(...compareNumericExpectation("summary quality.minQualityScore", expectation.quality.minQualityScore, snapshot.summary.quality.minQualityScore));
    diffs.push(...compareNumericExpectation("summary quality.maxVisualRiskScore", expectation.quality.maxVisualRiskScore, snapshot.summary.quality.maxVisualRiskScore));
    diffs.push(...compareNumericExpectation("summary quality.avgVisualRiskScore", expectation.quality.avgVisualRiskScore, snapshot.summary.quality.avgVisualRiskScore));
    diffs.push(...compareNumericExpectation("summary quality.maxAnalyticalValueScore", expectation.quality.maxAnalyticalValueScore, snapshot.summary.quality.maxAnalyticalValueScore));
    diffs.push(...compareNumericExpectation("summary quality.avgAnalyticalValueScore", expectation.quality.avgAnalyticalValueScore, snapshot.summary.quality.avgAnalyticalValueScore));
  }

  return diffs;
}

function compareNumericExpectation(
  label: string,
  expected: GoldenNumericExpectation | undefined,
  actual: number | null
): string[] {
  if (expected === undefined) return [];
  if (actual === null) return [`${label} mismatch: expected ${formatNumericExpectation(expected)} but got null`];

  if (typeof expected === "number") {
    return actual === expected ? [] : [`${label} mismatch: expected ${expected} but got ${actual}`];
  }

  const diffs: string[] = [];
  if (expected.eq !== undefined && actual !== expected.eq) {
    diffs.push(`${label} mismatch: expected ${expected.eq} but got ${actual}`);
  }
  if (expected.min !== undefined && actual < expected.min) {
    diffs.push(`${label} mismatch: expected >= ${expected.min} but got ${actual}`);
  }
  if (expected.max !== undefined && actual > expected.max) {
    diffs.push(`${label} mismatch: expected <= ${expected.max} but got ${actual}`);
  }
  return diffs;
}

function compareCountMap(
  label: string,
  expected: Record<string, number> | undefined,
  actual: Record<string, number>
): string[] {
  if (!expected) return [];
  const diffs: string[] = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key] ?? 0;
    if (actualValue !== expectedValue) {
      diffs.push(`${label}.${key} mismatch: expected ${expectedValue} but got ${actualValue}`);
    }
  }
  return diffs;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function averageMetric(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumericExpectation(value: GoldenNumericExpectation): string {
  if (typeof value === "number") return String(value);
  const parts: string[] = [];
  if (value.eq !== undefined) parts.push(`eq ${value.eq}`);
  if (value.min !== undefined) parts.push(`min ${value.min}`);
  if (value.max !== undefined) parts.push(`max ${value.max}`);
  return parts.join(", ");
}
