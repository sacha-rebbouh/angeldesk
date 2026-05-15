import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { encryptJsonField, encryptText, safeDecrypt, safeDecryptJsonField } from "@/lib/encryption";
import type { DocumentPageArtifact, ExtractionManifest, ExtractionPageManifest, PageOCRResult } from "@/services/pdf";
import { assessExtractionSemantics, type ExtractionSemanticAssessment } from "@/services/pdf/extraction-semantics";
import {
  isExtractionStrictReadinessEnabled,
  isPageArtifactToxic,
  readPageVerificationState,
} from "./extraction-readiness-policy";

// Phase 3 (Privacy DB): the `artifact` JSON column and the `textPreview`
// string column both carry raw corpus material (page text, table cells,
// numeric claims). Wrap every write so the persisted form is encrypted, and
// expose helpers so call sites that store these payloads cannot accidentally
// bypass encryption.
type EncryptedPagePayload = {
  artifact: Prisma.InputJsonValue;
  textPreview: string | null;
};
export function encryptExtractionPagePayload(params: {
  artifact: unknown;
  textPreview: string | null | undefined;
}): EncryptedPagePayload {
  const envelope = encryptJsonField(params.artifact);
  return {
    artifact: (envelope ?? Prisma.DbNull) as Prisma.InputJsonValue,
    textPreview: params.textPreview ? encryptText(params.textPreview) : null,
  };
}

export const STRICT_EXTRACTION_PIPELINE_VERSION = "strict-document-extraction-v1";

type PageStatus = "READY" | "READY_WITH_WARNINGS" | "NEEDS_REVIEW" | "FAILED" | "SKIPPED";
type PageMethod = "NATIVE_TEXT" | "OCR" | "HYBRID" | "SKIPPED";
type RunStatus = "PENDING" | "PROCESSING" | "READY" | "READY_WITH_WARNINGS" | "BLOCKED" | "FAILED";

type ExtractionRunWithDetails = Prisma.DocumentExtractionRunGetPayload<{
  include: {
    pages: true;
    overrides: true;
    document: { select: { id: true; name: true; type: true; mimeType: true } };
  };
}>;

export interface DocumentReadinessIssue {
  documentId: string;
  documentName: string;
  runId?: string;
  pageNumber?: number;
  code: string;
  message: string;
  actionRequired: "REPROCESS" | "REVIEW_PAGE" | "UPLOAD_AGAIN";
  canBypass: boolean;
}

export interface DealDocumentReadiness {
  ready: boolean;
  dealId: string;
  checkedAt: string;
  documentCount: number;
  readyDocumentCount: number;
  runIds: string[];
  warnings: DocumentReadinessIssue[];
  blockers: DocumentReadinessIssue[];
}

export function hashExtractedCorpus(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function buildDocumentPageArtifact(params: {
  pageNumber: number;
  label?: string;
  text: string;
  hasTables?: boolean;
  hasCharts?: boolean;
  confidence?: "high" | "medium" | "low";
  needsHumanReview?: boolean;
  sourceHash?: string;
  ocrMode?: "standard" | "high_fidelity" | "supreme";
  error?: string;
}): DocumentPageArtifact {
  const confidence = params.confidence ?? (params.error ? "low" : params.text.length >= 300 ? "high" : "medium");
  const visualBlocks: DocumentPageArtifact["visualBlocks"] = [];
  const tables: DocumentPageArtifact["tables"] = [];
  const charts: DocumentPageArtifact["charts"] = [];
  const unreadableRegions: DocumentPageArtifact["unreadableRegions"] = [];
  const numericClaims: DocumentPageArtifact["numericClaims"] = inferNumericClaims(params.text, confidence);

  if (params.hasTables) {
    tables.push({
      title: params.label,
      markdown: params.text.includes("|") ? params.text : undefined,
      confidence,
    });
    visualBlocks.push({
      type: "table",
      title: params.label,
      description: "Table-like content detected during extraction.",
      confidence,
    });
  }

  if (params.hasCharts) {
    charts.push({
      title: params.label,
      chartType: "unknown",
      description: "Chart-like content detected during extraction; use the extracted text and review if numeric detail is sparse.",
      confidence,
    });
    visualBlocks.push({
      type: "chart",
      title: params.label,
      description: "Chart-like visual content detected during extraction.",
      confidence,
    });
  }

  if (params.error || params.needsHumanReview) {
    unreadableRegions.push({
      reason: params.error ?? "Low-density or visually complex extraction requires human review.",
      severity: params.error ? "high" : "medium",
    });
  }

  return {
    version: "document-page-artifact-v1",
    pageNumber: params.pageNumber,
    label: params.label,
    text: params.text,
    visualBlocks,
    tables,
    charts,
    unreadableRegions,
    numericClaims,
    confidence,
    needsHumanReview: params.needsHumanReview ?? Boolean(params.error),
    ocrMode: params.ocrMode,
    sourceHash: params.sourceHash ?? (params.text ? hashExtractedCorpus(params.text) : undefined),
  };
}

export function calculateArtifactCompleteness(params: {
  hasTables: boolean;
  hasCharts: boolean;
  artifact?: DocumentPageArtifact | null;
}): {
  score: number;
  expectedVisualBlocks: number;
  extractedVisualBlocks: number;
  missing: string[];
} {
  const expected: string[] = [];
  if (params.hasTables) expected.push("table");
  if (params.hasCharts) expected.push("chart");
  const artifact = params.artifact;
  if (!artifact) {
    return {
      score: expected.length === 0 ? 100 : 0,
      expectedVisualBlocks: expected.length,
      extractedVisualBlocks: 0,
      missing: expected,
    };
  }

  const missing: string[] = [];
  const tableExtracted = artifact.tables.length > 0 || artifact.visualBlocks.some((block) => block.type === "table");
  const chartExtracted = artifact.charts.some((chart) => (chart.values?.length ?? 0) > 0) ||
    artifact.visualBlocks.some((block) => block.type === "chart") && artifact.numericClaims.length >= 3;
  if (params.hasTables && !tableExtracted) missing.push("table");
  if (params.hasCharts && !chartExtracted) missing.push("chart_values");
  if (artifact.unreadableRegions.some((region) => region.severity === "high")) missing.push("high_unreadable_region");

  const expectedVisualBlocks = Math.max(expected.length, artifact.visualBlocks.filter((block) => (
    block.type === "table" || block.type === "chart" || block.type === "diagram" || block.type === "image"
  )).length);
  const extractedVisualBlocks = artifact.tables.length + artifact.charts.length +
    artifact.visualBlocks.filter((block) => block.type === "diagram" || block.type === "image").length;

  if (expected.length === 0 && !artifact.needsHumanReview && missing.length === 0) {
    return { score: 100, expectedVisualBlocks, extractedVisualBlocks, missing: [] };
  }

  const base = expected.length === 0
    ? (artifact.needsHumanReview ? 70 : 100)
    : Math.round(((expected.length - missing.filter((item) => item === "table" || item === "chart_values").length) / expected.length) * 100);
  const penalty = artifact.unreadableRegions.reduce((sum, region) => (
    sum + (region.severity === "high" ? 30 : region.severity === "medium" ? 15 : 5)
  ), 0);

  return {
    score: Math.max(0, Math.min(100, base - penalty)),
    expectedVisualBlocks,
    extractedVisualBlocks,
    missing,
  };
}

function extractSemanticAssessment(value: unknown): ExtractionSemanticAssessment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = (value as { semanticAssessment?: unknown }).semanticAssessment;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.pageClass !== "string" ||
    typeof record.structureDependency !== "string" ||
    typeof record.semanticSufficiency !== "string" ||
    typeof record.labelValueIntegrity !== "string"
  ) {
    return undefined;
  }
  return candidate as ExtractionSemanticAssessment;
}

export function summarizeManifestForLegacyMetrics(manifest: ExtractionManifest) {
  const blockingPages = getBlockingPageNumbersFromManifest(manifest);
  const summary = {
    strictExtraction: true,
    manifestVersion: manifest.version,
    status: manifest.status,
    pageCount: manifest.pageCount,
    pagesProcessed: manifest.pagesProcessed,
    pagesSucceeded: manifest.pagesSucceeded,
    pagesFailed: manifest.pagesFailed,
    pagesSkipped: manifest.pagesSkipped,
    coverageRatio: manifest.coverageRatio,
    failedPages: manifest.failedPages,
    skippedPages: manifest.skippedPages,
    criticalPages: manifest.criticalPages,
    blockingPages,
    hardBlockers: manifest.hardBlockers,
    creditEstimate: manifest.creditEstimate,
    cachedPages: manifest.creditEstimate.cachedPages,
    pageQualityPlan: manifest.pages.map((page) => ({
      pageNumber: page.pageNumber,
      extractionTier: page.extractionTier,
      visualRiskScore: page.visualRiskScore,
      visualRiskReasons: page.visualRiskReasons,
      pageClass: page.semanticAssessment?.pageClass ?? null,
      structureDependency: page.semanticAssessment?.structureDependency ?? null,
      semanticSufficiency: page.semanticAssessment?.semanticSufficiency ?? null,
      labelValueIntegrity: page.semanticAssessment?.labelValueIntegrity ?? null,
      visualNoiseScore: page.semanticAssessment?.visualNoiseScore ?? null,
      analyticalValueScore: page.semanticAssessment?.analyticalValueScore ?? null,
    })),
  };
  return JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonObject;
}

type ExtractionPageReviewShape = Pick<
  ExtractionPageManifest,
  | "pageNumber"
  | "status"
  | "charCount"
  | "hasTables"
  | "hasCharts"
  | "hasFinancialKeywords"
  | "hasMarketKeywords"
  | "hasTeamKeywords"
  | "error"
> & {
  qualityScore?: number | null;
  errorMessage?: string | null;
  semanticAssessment?: ExtractionSemanticAssessment;
  ocrProcessed?: boolean;
};

const FATAL_PAGE_ERROR_PATTERN = /did not complete|returned no text|could not be extracted reliably/i;

function isBlockingReviewPage(page: ExtractionPageReviewShape): boolean {
  if (page.status === "failed") return true;
  if (page.status !== "needs_review") return false;

  const ocrApplied = page.ocrProcessed === true;
  const errorText = (page.errorMessage ?? page.error ?? "").toLowerCase();
  const hasFatalError = FATAL_PAGE_ERROR_PATTERN.test(errorText);

  if (ocrApplied) {
    // The new visual extraction pipeline already gave its best shot on this
    // page (high-fidelity / supreme tier OCR + semantic verifier). Forcing
    // the user through a manual review for every page that comes back as
    // `needs_review` defeats the purpose of the pipeline — re-running won't
    // make the extraction richer. Block only when the page is genuinely
    // unusable: explicit fatal error from the OCR provider, or a semantic
    // assessment that says the page is BOTH analytically critical AND
    // insufficient at a high confidence threshold.
    if (hasFatalError) return true;
    if (page.semanticAssessment) {
      return (
        page.semanticAssessment.semanticSufficiency === "insufficient" &&
        (page.semanticAssessment.analyticalValueScore ?? 100) >= 70
      );
    }
    return false;
  }

  if (page.semanticAssessment) {
    if (
      page.semanticAssessment.semanticSufficiency === "insufficient" &&
      (page.semanticAssessment.analyticalValueScore ?? 100) >= 35
    ) {
      return true;
    }
    if (
      page.semanticAssessment.shouldBlockIfStructureMissing &&
      !page.semanticAssessment.canDegradeToWarning &&
      page.semanticAssessment.semanticSufficiency !== "sufficient"
    ) {
      return true;
    }
    return false;
  }

  const qualityScore = page.qualityScore ?? 0;
  const isAnalyticallyCritical =
    page.hasFinancialKeywords || page.hasMarketKeywords || page.hasTables || page.hasCharts;

  if (FATAL_PAGE_ERROR_PATTERN.test(errorText) || /very little text/i.test(errorText)) {
    return true;
  }

  if (!isAnalyticallyCritical) {
    return false;
  }

  if (page.charCount < 180) return true;
  if (qualityScore < 60) return true;
  if ((page.hasTables || page.hasCharts) && page.charCount < 320) return true;

  return false;
}

export function getBlockingPageNumbersFromManifest(manifest: ExtractionManifest): number[] {
  return manifest.pages
    .filter(isBlockingReviewPage)
    .map((page) => page.pageNumber);
}

export function getBlockingPageNumbersFromStoredPages(
  pages: Array<{
    pageNumber: number;
    status: PageStatus;
    charCount: number;
    qualityScore: number | null;
    hasTables: boolean;
    hasCharts: boolean;
    hasFinancialKeywords: boolean;
    hasMarketKeywords: boolean;
    hasTeamKeywords: boolean;
    errorMessage?: string | null;
    artifact?: unknown;
    ocrProcessed?: boolean;
  }>
): number[] {
  return pages
    .filter((page) =>
      isBlockingReviewPage({
        pageNumber: page.pageNumber,
        status: page.status === "READY"
          ? "ready"
          : page.status === "READY_WITH_WARNINGS"
            ? "ready_with_warnings"
            : page.status === "FAILED"
              ? "failed"
              : page.status === "SKIPPED"
                ? "skipped"
                : "needs_review",
        charCount: page.charCount,
        qualityScore: page.qualityScore,
        hasTables: page.hasTables,
        hasCharts: page.hasCharts,
        hasFinancialKeywords: page.hasFinancialKeywords,
        hasMarketKeywords: page.hasMarketKeywords,
        hasTeamKeywords: page.hasTeamKeywords,
        errorMessage: page.errorMessage,
        ocrProcessed: page.ocrProcessed,
        // Phase 3: artifact is stored encrypted; safeDecryptJsonField is a
        // no-op on legacy plaintext rows and decrypts new envelope rows.
        semanticAssessment: extractSemanticAssessment(safeDecryptJsonField(page.artifact)),
      })
    )
    .map((page) => page.pageNumber);
}

export function buildStructuredDocumentManifest(params: {
  artifacts: Array<{
    index: number;
    label: string;
    text: string;
    method?: ExtractionPageManifest["method"];
    hasTables?: boolean;
    hasCharts?: boolean;
    hasFinancialKeywords?: boolean;
    hasTeamKeywords?: boolean;
    hasMarketKeywords?: boolean;
    requiresReview?: boolean;
    error?: string;
    artifact?: DocumentPageArtifact;
  }>;
  estimatedCredits?: number;
  estimatedUsd?: number;
}): ExtractionManifest {
  const pages: ExtractionPageManifest[] = params.artifacts.map((artifact) => {
    const wordCount = artifact.text.trim().split(/\s+/).filter(Boolean).length;
    const charCount = artifact.text.length;
    const status: ExtractionPageManifest["status"] = artifact.error
      ? "failed"
      : artifact.requiresReview
        ? "needs_review"
        : "ready";

    const hasTables = artifact.hasTables ?? /\|/.test(artifact.text);
    const hasCharts = artifact.hasCharts ?? /chart|graph|diagram|graphique|histogram/i.test(artifact.text);
    const pageArtifact = artifact.artifact ?? buildDocumentPageArtifact({
      pageNumber: artifact.index,
      label: artifact.label,
      text: artifact.text,
      hasTables,
      hasCharts,
      confidence: artifact.error ? "low" : status === "needs_review" ? "medium" : "high",
      needsHumanReview: status === "needs_review" || status === "failed",
      error: artifact.error,
    });
    const visualArtifactIncomplete = (
      (hasTables && pageArtifact.tables.length === 0) ||
      (hasCharts && pageArtifact.charts.length === 0) ||
      pageArtifact.unreadableRegions.some((region) => region.severity === "high")
    );
    const artifactCompleteness = calculateArtifactCompleteness({
      hasTables,
      hasCharts,
      artifact: pageArtifact,
    });
    const semanticAssessment = assessExtractionSemantics({
      pageNumber: artifact.index,
      text: artifact.text,
      charCount,
      wordCount,
      hasTables,
      hasCharts,
      hasFinancialKeywords: artifact.hasFinancialKeywords ?? /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|valuation|cap table|forecast|budget)\b/i.test(artifact.text),
      hasTeamKeywords: artifact.hasTeamKeywords ?? /\b(team|founder|ceo|cto|cfo|coo|linkedin)\b/i.test(artifact.text),
      hasMarketKeywords: artifact.hasMarketKeywords ?? /\b(tam|sam|som|market|cagr|competitor|competition)\b/i.test(artifact.text),
      artifact: pageArtifact,
    });
    pageArtifact.semanticAssessment = semanticAssessment;
    const finalStatus: ExtractionPageManifest["status"] = (
      status === "ready" &&
      visualArtifactIncomplete &&
      (
        (
          semanticAssessment.semanticSufficiency === "insufficient" &&
          (semanticAssessment.analyticalValueScore ?? 100) >= 35
        ) ||
        (semanticAssessment.shouldBlockIfStructureMissing &&
          !semanticAssessment.canDegradeToWarning &&
          semanticAssessment.semanticSufficiency !== "sufficient")
      )
    )
      ? "needs_review"
      : status === "ready" && visualArtifactIncomplete
        ? "ready_with_warnings"
        : status;

    return {
      pageNumber: artifact.index,
      status: finalStatus,
      method: artifact.method ?? "native_text",
      charCount,
      wordCount,
      qualityScore: artifact.error ? 0 : Math.max(0, scoreStructuredArtifactQuality(charCount, artifact) - (100 - artifactCompleteness.score)),
      hasTables,
      hasCharts,
      hasFinancialKeywords: artifact.hasFinancialKeywords ?? /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|valuation|cap table|forecast|budget)\b/i.test(artifact.text),
      hasTeamKeywords: artifact.hasTeamKeywords ?? /\b(team|founder|ceo|cto|cfo|coo|linkedin)\b/i.test(artifact.text),
      hasMarketKeywords: artifact.hasMarketKeywords ?? /\b(tam|sam|som|market|cagr|competitor|competition)\b/i.test(artifact.text),
      requiresOCR: false,
      ocrProcessed: artifact.method === "ocr" || artifact.method === "hybrid",
      extractionTier: artifact.method === "ocr" || artifact.method === "hybrid" ? "high_fidelity" : "native_only",
      visualRiskScore: artifact.requiresReview || visualArtifactIncomplete ? Math.max(75, 100 - artifactCompleteness.score) : 0,
      visualRiskReasons: [
        ...(artifact.requiresReview ? [`${artifact.label} needs manual review`] : []),
        ...(visualArtifactIncomplete ? [`${artifact.label} has incomplete structured visual extraction`] : []),
        ...artifactCompleteness.missing.map((missing) => `${artifact.label} missing ${missing}`),
      ],
      semanticAssessment,
      artifact: pageArtifact,
      pageImageHash: undefined,
      error: artifact.error,
    };
  });

  const failedPages = pages.filter((page) => page.status === "failed").map((page) => page.pageNumber);
  const pagesFailed = failedPages.length;
  const pagesSkipped = pages.filter((page) => page.status === "skipped").length;
  const pagesProcessed = pages.length - pagesSkipped;
  const coverageRatio = pages.length > 0 ? pagesProcessed / pages.length : 0;
  const hasReview = pages.some((page) => page.status === "needs_review");
  const status: ExtractionManifest["status"] = pagesFailed > 0 || coverageRatio < 1
    ? "failed"
    : hasReview
      ? "needs_review"
      : "ready";

  return {
    version: "strict-document-v1",
    status,
    pageCount: pages.length,
    pagesProcessed,
    pagesSucceeded: pages.filter((page) => page.status === "ready" || page.status === "ready_with_warnings").length,
    pagesFailed,
    pagesSkipped,
    coverageRatio,
    textPages: pages.filter((page) => page.method === "native_text").length,
    ocrPages: pages.filter((page) => page.method === "ocr").length,
    hybridPages: pages.filter((page) => page.method === "hybrid").length,
    failedPages,
    skippedPages: pages.filter((page) => page.status === "skipped").map((page) => page.pageNumber),
    criticalPages: pages
      .filter((page) => page.hasFinancialKeywords || page.hasTeamKeywords || page.hasMarketKeywords || page.hasTables || page.hasCharts)
      .map((page) => page.pageNumber),
    hardBlockers: failedPages.map((pageNumber) => ({
      code: "STRUCTURED_DOCUMENT_ARTIFACT_FAILED",
      message: `Structured artifact ${pageNumber} failed extraction.`,
      pageNumber,
    })),
    creditEstimate: {
      estimatedCredits: params.estimatedCredits ?? 0,
      estimatedUsd: params.estimatedUsd ?? 0,
      pagesByTier: {
        native_only: pages.filter((page) => page.extractionTier === "native_only").length,
        standard_ocr: pages.filter((page) => page.extractionTier === "standard_ocr").length,
        high_fidelity: pages.filter((page) => page.extractionTier === "high_fidelity").length,
        supreme: pages.filter((page) => page.extractionTier === "supreme").length,
      },
      unitCredits: { native_only: 0, standard_ocr: 0, high_fidelity: 1, supreme: 2 },
      unitUsd: { native_only: 0, standard_ocr: 0.002, high_fidelity: 0.006, supreme: 0.015 },
      cachedPages: 0,
    },
    pages,
    completedAt: new Date().toISOString(),
  };
}

export async function recordDocumentExtractionRun(params: {
  documentId: string;
  documentVersion: number;
  contentHash?: string | null;
  text: string;
  qualityScore: number | null;
  manifest: ExtractionManifest;
  warnings?: unknown;
  extraSummaryMetrics?: Prisma.InputJsonObject;
}) {
  const blockedReason = buildBlockedReason(params.manifest);
  // Same shared corpus-usability rule as `completeDocumentExtractionRun`: a
  // manifest can say ready_with_warnings while the composed corpus is empty
  // (image OCR that yielded nothing, etc.). Force FAILED so the run status
  // never disagrees with "there is no usable text".
  const hasUsableCorpus = hasUsableExtractionCorpus(params.text);
  const status: RunStatus = hasUsableCorpus ? mapRunStatus(params.manifest) : "FAILED";
  const readyForAnalysis =
    hasUsableCorpus && (status === "READY" || status === "READY_WITH_WARNINGS");

  return prisma.documentExtractionRun.create({
    data: {
      documentId: params.documentId,
      documentVersion: params.documentVersion,
      status,
      pageCount: params.manifest.pageCount,
      pagesProcessed: params.manifest.pagesProcessed,
      pagesSucceeded: params.manifest.pagesSucceeded,
      pagesFailed: params.manifest.pagesFailed,
      pagesSkipped: params.manifest.pagesSkipped,
      coverageRatio: new Prisma.Decimal(params.manifest.coverageRatio),
      qualityScore: params.qualityScore,
      readyForAnalysis,
      blockedReason,
      extractionVersion: params.manifest.version,
      pipelineVersion: STRICT_EXTRACTION_PIPELINE_VERSION,
      contentHash: params.contentHash ?? null,
      corpusTextHash: params.text ? hashExtractedCorpus(params.text) : null,
      summaryMetrics: {
        ...summarizeManifestForLegacyMetrics(params.manifest),
        ...(params.extraSummaryMetrics ?? {}),
      },
      warnings: params.warnings === undefined ? Prisma.DbNull : (params.warnings as Prisma.InputJsonValue),
      completedAt: new Date(params.manifest.completedAt),
      pages: {
        create: params.manifest.pages.map(buildExtractionPageCreateInput),
      },
    },
    include: {
      pages: true,
      overrides: true,
    },
  });
}

export async function startDocumentExtractionRun(params: {
  documentId: string;
  documentVersion: number;
  contentHash?: string | null;
  extractionVersion?: ExtractionManifest["version"];
  pageCount?: number;
  summaryMetrics?: Prisma.InputJsonValue;
}) {
  return prisma.documentExtractionRun.create({
    data: {
      documentId: params.documentId,
      documentVersion: params.documentVersion,
      status: "PROCESSING",
      pageCount: params.pageCount ?? 0,
      pagesProcessed: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
      coverageRatio: new Prisma.Decimal(0),
      readyForAnalysis: false,
      blockedReason: "Extraction in progress",
      extractionVersion: params.extractionVersion ?? "strict-pdf-v1",
      pipelineVersion: STRICT_EXTRACTION_PIPELINE_VERSION,
      contentHash: params.contentHash ?? null,
      summaryMetrics: params.summaryMetrics ?? {
        strictExtraction: true,
        progress: { phase: "started", message: "Extraction in progress" },
      },
      startedAt: new Date(),
    },
  });
}

// A run is "live" (still mutable by progress writes) only in these states.
// Every other status — READY, READY_WITH_WARNINGS, BLOCKED, FAILED — is
// TERMINAL. Progress writes (`markExtractionRunProgress`,
// `recordExtractionPageProgress`) must never re-open a terminal run: Codex
// Phase 4.4 P1 — a late `onProgress` callback from a timed-out `smartExtract`
// still running in the background could otherwise flip a FAILED run back to
// PROCESSING, breaking the "no oscillating state" invariant.
const LIVE_RUN_STATUSES = ["PENDING", "PROCESSING"] as const;

/**
 * Phase 4 durability: force a run into the terminal FAILED state.
 *
 * Idempotent — only flips a run that is still NON-terminal (PENDING /
 * PROCESSING). A run that already reached a terminal status (including an
 * earlier FAILED) is left untouched, so this is safe to call from every
 * catch path (pipeline, Inngest compensation, pre-enqueue route catch)
 * without risking an oscillating state. Returns the number of rows
 * actually transitioned (0 = it was already terminal).
 */
export async function terminalizeExtractionRunAsFailed(
  runId: string,
  reason: string
): Promise<number> {
  const result = await prisma.documentExtractionRun.updateMany({
    where: { id: runId, status: { in: [...LIVE_RUN_STATUSES] } },
    data: {
      status: "FAILED",
      readyForAnalysis: false,
      blockedReason: reason.slice(0, 500),
      completedAt: new Date(),
    },
  });
  return result.count;
}

export async function markExtractionRunProgress(params: {
  runId: string;
  pageCount?: number;
  pagesProcessed?: number;
  message?: string;
  phase?: string;
}) {
  const isFailed = params.phase === "failed";
  const data: Prisma.DocumentExtractionRunUpdateInput = {
    status: isFailed ? "FAILED" : "PROCESSING",
    readyForAnalysis: false,
    blockedReason: params.message ?? "Extraction in progress",
    summaryMetrics: {
      strictExtraction: true,
      progress: {
        phase: params.phase ?? "processing",
        message: params.message ?? "Extraction in progress",
        updatedAt: new Date().toISOString(),
      },
    },
  };
  if (isFailed) {
    data.completedAt = new Date();
  }
  if (typeof params.pageCount === "number") {
    data.pageCount = params.pageCount;
  }
  if (typeof params.pagesProcessed === "number") {
    data.pagesProcessed = params.pagesProcessed;
    if (typeof params.pageCount === "number" && params.pageCount > 0) {
      data.coverageRatio = new Prisma.Decimal(Math.min(1, params.pagesProcessed / params.pageCount));
    }
  }

  // Monotone guard: a progress write must never mutate a run that already
  // reached a terminal status. `updateMany` scoped to LIVE statuses makes
  // this atomic — a late callback from a timed-out background `smartExtract`
  // is a 0-row no-op instead of flipping FAILED → PROCESSING. The legitimate
  // PROCESSING → FAILED transition (phase: "failed") still passes because
  // PROCESSING is a LIVE status.
  return prisma.documentExtractionRun.updateMany({
    where: { id: params.runId, status: { in: [...LIVE_RUN_STATUSES] } },
    data,
  });
}

export async function recordExtractionPageProgress(params: {
  runId: string;
  page: PageOCRResult;
}) {
  // Monotone guard (fast path): if the run already reached a terminal status,
  // skip the whole page write — a late callback from a timed-out background
  // `smartExtract` must not append pages to / re-open a terminal run. The
  // `updateMany` at the end is the atomic backstop for the TOCTOU window
  // (run terminalized between this read and the final write).
  const liveRun = await prisma.documentExtractionRun.findUnique({
    where: { id: params.runId },
    select: { status: true },
  });
  if (!liveRun || !(LIVE_RUN_STATUSES as readonly string[]).includes(liveRun.status)) {
    return;
  }

  const artifact = params.page.artifact ?? buildDocumentPageArtifact({
    pageNumber: params.page.pageNumber,
    text: params.page.text,
    hasCharts: params.page.hasCharts,
    confidence: params.page.confidence,
    needsHumanReview: params.page.confidence === "low",
    ocrMode: params.page.mode,
  });
  const charCount = params.page.text.length;
  const wordCount = params.page.text.trim().split(/\s+/).filter(Boolean).length;
  const status: PageStatus = params.page.text.trim().length === 0
    ? "FAILED"
    : params.page.confidence === "low"
      ? "NEEDS_REVIEW"
      : "READY_WITH_WARNINGS";
  const method: PageMethod = "OCR";

  const encryptedPayload = encryptExtractionPagePayload({
    artifact: JSON.parse(JSON.stringify(artifact)) as Prisma.InputJsonValue,
    textPreview: params.page.text.slice(0, 300),
  });

  await prisma.documentExtractionPage.upsert({
    where: {
      runId_pageNumber: {
        runId: params.runId,
        pageNumber: params.page.pageNumber,
      },
    },
    create: {
      runId: params.runId,
      pageNumber: params.page.pageNumber,
      status,
      method,
      charCount,
      wordCount,
      qualityScore: params.page.confidence === "high" ? 80 : params.page.confidence === "medium" ? 60 : 30,
      confidence: params.page.confidence,
      hasTables: artifact.tables.length > 0,
      hasCharts: params.page.hasCharts || artifact.charts.length > 0,
      hasFinancialKeywords: /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|valuation|cap table|funding)\b/i.test(params.page.text),
      hasTeamKeywords: /\b(team|founder|ceo|cto|cfo|coo|linkedin)\b/i.test(params.page.text),
      hasMarketKeywords: /\b(tam|sam|som|market|cagr|competitor|competition)\b/i.test(params.page.text),
      requiresOCR: true,
      ocrProcessed: true,
      contentHash: artifact.sourceHash ?? null,
      artifactVersion: artifact.version,
      artifact: encryptedPayload.artifact,
      pageImageHash: params.page.pageImageHash ?? null,
      errorMessage: params.page.text.trim().length === 0 ? "OCR returned no text for this page" : null,
      textPreview: encryptedPayload.textPreview,
    },
    update: {
      status,
      method,
      charCount,
      wordCount,
      qualityScore: params.page.confidence === "high" ? 80 : params.page.confidence === "medium" ? 60 : 30,
      confidence: params.page.confidence,
      hasTables: artifact.tables.length > 0,
      hasCharts: params.page.hasCharts || artifact.charts.length > 0,
      ocrProcessed: true,
      contentHash: artifact.sourceHash ?? null,
      artifactVersion: artifact.version,
      artifact: encryptedPayload.artifact,
      pageImageHash: params.page.pageImageHash ?? null,
      errorMessage: params.page.text.trim().length === 0 ? "OCR returned no text for this page" : null,
      textPreview: encryptedPayload.textPreview,
    },
  });

  const processedCount = await prisma.documentExtractionPage.count({
    where: { runId: params.runId },
  });

  // Atomic monotone backstop: only advance a still-LIVE run. If the run was
  // terminalized between the read at the top of this function and here, this
  // is a 0-row no-op rather than flipping a terminal run back to PROCESSING.
  return prisma.documentExtractionRun.updateMany({
    where: { id: params.runId, status: { in: [...LIVE_RUN_STATUSES] } },
    data: {
      status: "PROCESSING",
      pagesProcessed: processedCount,
      blockedReason: `Extraction in progress. Last page processed: ${params.page.pageNumber}`,
      summaryMetrics: {
        strictExtraction: true,
        progress: {
          phase: "page_processed",
          pageNumber: params.page.pageNumber,
          pagesProcessed: processedCount,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
}

/**
 * Single source of truth for "does this extraction produce a usable
 * corpus?". The OCR path can return `success: true` with pagesProcessed > 0
 * yet a whitespace-only composed corpus. Both `completeDocumentExtractionRun`
 * (run status) and `runDocumentExtractionPipeline` (document status + API
 * result) MUST agree on this — otherwise a whitespace corpus produces a
 * run=FAILED / document=COMPLETED divergence and Inngest never refunds.
 */
export function hasUsableExtractionCorpus(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim().length > 0;
}

// Phase 4.3 (durability — versions). A document "lineage" is the tuple
// `(dealId, name, corpusParentDocumentId)` — the exact key the upload route
// uses to detect "same document re-uploaded". All version mutations for one
// lineage (creating a new candidate, promoting a candidate to `isLatest`)
// MUST be serialized, otherwise a check-then-act race produces two
// `isLatest: true` rows or a non-monotonic latest (Codex Phase 4.3 P1).
export type DocumentLineage = {
  dealId: string;
  name: string;
  corpusParentDocumentId: string | null;
};

/**
 * Take a Postgres transaction-scoped advisory lock on a document lineage.
 * Held until the surrounding transaction commits/rolls back, so concurrent
 * lineage mutations run one-at-a-time instead of racing. `hashtext`
 * collisions only make two unrelated lineages serialize occasionally — never
 * a correctness problem. The caller MUST already be inside a transaction.
 */
export async function acquireDocumentLineageLock(
  tx: Prisma.TransactionClient,
  lineage: DocumentLineage
): Promise<void> {
  // The key is passed to PostgreSQL `hashtext()` as a `text` parameter.
  // PostgreSQL rejects 0x00 bytes in `text` values, so the key must never
  // contain a NUL. It must also delimit its parts unambiguously — a
  // separator-joined string would collide if `name` contained the
  // separator. `JSON.stringify` of a fixed-shape array satisfies both: it
  // escapes its contents, never emits a raw NUL, and two distinct lineages
  // can never serialize to the same string.
  const key = JSON.stringify([
    "doc-lineage",
    lineage.dealId,
    lineage.name,
    lineage.corpusParentDocumentId ?? "",
  ]);
  // MUST be `$executeRaw`, not `$queryRaw`: `pg_advisory_xact_lock` returns
  // `void`, and `$queryRaw` throws `P2010 — Failed to deserialize column of
  // type 'void'` trying to materialize the result set. `$executeRaw` runs
  // the statement (taking the lock as the side effect) and returns only a
  // row count — no column deserialization. Caught by the Phase 5 live test;
  // the mocked unit tests could not see it.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Phase 4.3 (durability — versions). A re-uploaded document is created as a
 * CANDIDATE version (`isLatest: false`). It only becomes the lineage's
 * `isLatest` once its extraction reaches a COMPLETED state. This closes the
 * hole where the old (working) document was demoted eagerly at upload time —
 * if the new version's extraction then failed, the deal was left pointing at
 * a broken document with no `isLatest` fallback.
 *
 * The promotion is:
 *   - **gated on COMPLETED** — a PENDING/PROCESSING/FAILED candidate never
 *     promotes, so a failed new version leaves the old one untouched;
 *   - **lineage-scoped** — a lineage is `(dealId, name, corpusParentDocumentId)`,
 *     the exact tuple the upload route uses to detect "same document
 *     re-uploaded";
 *   - **monotonic by version** — if a strictly-newer version already holds
 *     `isLatest`, this (older) candidate stays a completed candidate. This is
 *     what prevents the "état oscillant" a late-completing older version
 *     would otherwise cause (demoting a newer winner);
 *   - **serialized** — the `newerLatest` check and the demote+promote write
 *     run inside a per-lineage advisory lock, so the guarantees above hold
 *     under concurrency (two candidates completing at once), not just for
 *     sequential calls. Without the lock, transaction A could read "no newer
 *     latest" while transaction B promotes a newer version, then A demotes
 *     B's winner — exactly the regression Codex Phase 4.3 P1 flagged.
 *
 * Result: at most one `isLatest: true` per lineage, and it never moves
 * backwards in version order — even under concurrent completion.
 */
export async function promoteDocumentVersionTx(
  tx: Prisma.TransactionClient,
  documentId: string
): Promise<void> {
  // The lineage tuple + version are IMMUTABLE after creation, so this
  // pre-lock read is safe — we only need it to derive the lock key and to
  // fast-exit non-COMPLETED documents before paying for the lock.
  const doc = await tx.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      dealId: true,
      name: true,
      corpusParentDocumentId: true,
      version: true,
      processingStatus: true,
    },
  });
  // Only a successfully-extracted version may take the `isLatest` slot.
  if (!doc || doc.processingStatus !== "COMPLETED") return;

  const lineage: DocumentLineage = {
    dealId: doc.dealId,
    name: doc.name,
    corpusParentDocumentId: doc.corpusParentDocumentId,
  };

  // Critical section start: serialize against concurrent promotions /
  // creations in this lineage. Everything below is now atomic w.r.t. other
  // lineage mutations.
  await acquireDocumentLineageLock(tx, lineage);

  // Re-read processingStatus INSIDE the lock — a concurrent reprocess could
  // have moved this document off COMPLETED between the pre-lock read and
  // here. (dealId/name/corpusParentDocumentId/version are immutable.)
  const locked = await tx.document.findUnique({
    where: { id: documentId },
    select: { processingStatus: true },
  });
  if (!locked || locked.processingStatus !== "COMPLETED") return;

  // A strictly-newer version already won the slot — this older version stays
  // a completed candidate rather than demoting the newer winner. Read under
  // the lock: any concurrent promotion has either committed (visible here)
  // or is queued behind us.
  const newerLatest = await tx.document.findFirst({
    where: { ...lineage, isLatest: true, version: { gt: doc.version } },
    select: { id: true },
  });
  if (newerLatest) return;

  // Demote every other current `isLatest` in the lineage, then promote this
  // one — exactly one `isLatest: true` per lineage at all times.
  await tx.document.updateMany({
    where: { ...lineage, isLatest: true, id: { not: doc.id } },
    data: { isLatest: false, supersededAt: new Date() },
  });
  await tx.document.update({
    where: { id: doc.id },
    data: { isLatest: true, supersededAt: null },
  });
}

/**
 * Standalone wrapper around `promoteDocumentVersionTx` for call sites that
 * finalize a document COMPLETED outside a transaction (the inline
 * image/Excel/Word/PowerPoint upload paths). The durable PDF path promotes
 * atomically inside `completeDocumentExtractionRun` instead.
 */
export async function promoteDocumentVersion(params: { documentId: string }): Promise<void> {
  await prisma.$transaction((tx) => promoteDocumentVersionTx(tx, params.documentId));
}

export async function completeDocumentExtractionRun(params: {
  runId: string;
  text: string;
  qualityScore: number | null;
  manifest: ExtractionManifest;
  warnings?: unknown;
  // Phase 4 durability: when provided, the parent Document is updated in the
  // SAME transaction as the run's terminal status. This closes the atomicity
  // hole where a crash between "run → terminal-success" and "document →
  // COMPLETED" could leave a terminal-success run pointing at a Document
  // that is still PROCESSING / has no extractedText. Either BOTH commit or
  // NEITHER does — so on retry the run is still PROCESSING and the pipeline
  // re-runs cleanly. Legacy callers (upload / ocr routes) omit this and keep
  // their separate document update for now.
  documentFinalization?: {
    documentId: string;
    data: Prisma.DocumentUpdateInput;
  };
}) {
  const blockedReason = buildBlockedReason(params.manifest);
  // Phase 4 durability: `mapRunStatus` derives the status from the manifest
  // only. But the OCR path can return a manifest that says
  // ready_with_warnings / needs_review with pagesProcessed > 0 while the
  // composed corpus is actually empty (all OCR pages yielded text.length
  // === 0). A terminal-success run pointing at an empty corpus is a
  // durability trap: the document is finalized FAILED, but a retry would
  // see the terminal-success run and no-op forever. Force FAILED whenever
  // the final corpus is empty — the run status must never disagree with
  // "there is no usable text". `hasUsableExtractionCorpus` is the shared
  // definition the pipeline uses too (no run/document/API divergence).
  const hasUsableCorpus = hasUsableExtractionCorpus(params.text);
  const status: RunStatus = hasUsableCorpus ? mapRunStatus(params.manifest) : "FAILED";
  const readyForAnalysis =
    hasUsableCorpus && (status === "READY" || status === "READY_WITH_WARNINGS");

  return prisma.$transaction(async (tx) => {
    await tx.documentExtractionPage.deleteMany({ where: { runId: params.runId } });
    const run = await tx.documentExtractionRun.update({
      where: { id: params.runId },
      data: {
        status,
        pageCount: params.manifest.pageCount,
        pagesProcessed: params.manifest.pagesProcessed,
        pagesSucceeded: params.manifest.pagesSucceeded,
        pagesFailed: params.manifest.pagesFailed,
        pagesSkipped: params.manifest.pagesSkipped,
        coverageRatio: new Prisma.Decimal(params.manifest.coverageRatio),
        qualityScore: params.qualityScore,
        readyForAnalysis,
        blockedReason,
        extractionVersion: params.manifest.version,
        corpusTextHash: params.text ? hashExtractedCorpus(params.text) : null,
        summaryMetrics: summarizeManifestForLegacyMetrics(params.manifest),
        warnings: params.warnings === undefined ? Prisma.DbNull : (params.warnings as Prisma.InputJsonValue),
        completedAt: new Date(params.manifest.completedAt),
        pages: {
          create: params.manifest.pages.map(buildExtractionPageCreateInput),
        },
      },
      include: {
        pages: true,
        overrides: true,
      },
    });

    if (params.documentFinalization) {
      await tx.document.update({
        where: { id: params.documentFinalization.documentId },
        data: params.documentFinalization.data,
      });
      // Phase 4.3: a new version becomes the lineage's `isLatest` ONLY once
      // its extraction reaches COMPLETED — and it does so atomically with
      // the run's terminal status. `hasUsableCorpus` is the COMPLETED ⟺
      // success bridge (run forced FAILED + document FAILED when false), so
      // a failed/empty extraction never promotes and the old version is
      // preserved. `promoteDocumentVersionTx` is itself a no-op for a
      // brand-new single-version document.
      if (hasUsableCorpus) {
        await promoteDocumentVersionTx(tx, params.documentFinalization.documentId);
      }
    }

    return run;
  });
}

export async function getLatestExtractionRunForDocument(documentId: string) {
  return prisma.documentExtractionRun.findFirst({
    where: { documentId },
    orderBy: [{ startedAt: "desc" }, { completedAt: "desc" }],
    include: {
      pages: { orderBy: { pageNumber: "asc" } },
      overrides: true,
      document: { select: { id: true, name: true, type: true, mimeType: true } },
    },
  });
}

export async function createExtractionOverride(params: {
  runId: string;
  userId: string;
  pageNumber?: number | null;
  overrideType: "BYPASS_PAGE" | "EXCLUDE_PAGE";
  reason: string;
  payload: Prisma.InputJsonValue;
}) {
  const override = await prisma.documentExtractionOverride.create({
    data: {
      runId: params.runId,
      pageNumber: params.pageNumber ?? null,
      overrideType: params.overrideType,
      reason: params.reason,
      payload: params.payload,
      createdByUserId: params.userId,
      approvedAt: new Date(),
    },
  });

  await refreshRunReadinessWithOverrides(params.runId);
  return override;
}

export async function refreshRunReadinessWithOverrides(runId: string) {
  return refreshRunExtractionStats(runId);
}

export async function refreshRunExtractionStats(runId: string, corpusText?: string | null) {
  const run = await prisma.documentExtractionRun.findUnique({
    where: { id: runId },
    include: {
      pages: true,
      overrides: true,
      document: {
        select: {
          id: true,
          extractionMetrics: true,
        },
      },
    },
  });

  if (!run) return null;

  const unresolvedPages = getUnresolvedBlockingPages(run);
  const hasRunLevelOverride = run.overrides.some((override) => override.pageNumber === null);
  const readyForAnalysis = unresolvedPages.length === 0 || hasRunLevelOverride;
  const pagesSkipped = run.pages.filter((page) => page.status === "SKIPPED").length;
  const pagesFailed = run.pages.filter((page) => page.status === "FAILED").length;
  const pagesSucceeded = run.pages.filter((page) => (
    page.status === "READY" || page.status === "READY_WITH_WARNINGS"
  )).length;
  const pagesProcessed = run.pages.length - pagesSkipped;
  const pageCount = Math.max(run.pageCount, run.pages.length);
  const coverageRatio = pageCount > 0 ? pagesProcessed / pageCount : 0;
  const qualityScores = run.pages
    .map((page) => page.qualityScore)
    .filter((score): score is number => typeof score === "number");
  const qualityScore = qualityScores.length > 0
    ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
    : run.qualityScore;
  const status: RunStatus = readyForAnalysis
    ? run.pages.some((page) => page.status === "NEEDS_REVIEW" || page.status === "FAILED")
      ? "READY_WITH_WARNINGS"
      : "READY"
    : run.pages.length === 0
      ? "FAILED"
      : "BLOCKED";

  const updatedRun = await prisma.documentExtractionRun.update({
    where: { id: runId },
    data: {
      pageCount,
      pagesProcessed,
      pagesSucceeded,
      pagesFailed,
      pagesSkipped,
      coverageRatio: new Prisma.Decimal(coverageRatio),
      qualityScore,
      readyForAnalysis,
      status,
      blockedReason: readyForAnalysis ? null : `Pages requiring explicit review: ${unresolvedPages.join(", ")}`,
      corpusTextHash: corpusText ? hashExtractedCorpus(corpusText) : run.corpusTextHash,
      completedAt: new Date(),
    },
  });

  const unresolvedFailedPages = run.pages
    .filter((page) => page.status === "FAILED")
    .map((page) => page.pageNumber)
    .filter((pageNumber) => unresolvedPages.includes(pageNumber));

  const baseMetrics =
    run.document.extractionMetrics &&
    typeof run.document.extractionMetrics === "object" &&
    !Array.isArray(run.document.extractionMetrics)
      ? { ...(run.document.extractionMetrics as Record<string, unknown>) }
      : {};

  await prisma.document.update({
    where: { id: run.document.id },
    data: {
      extractionMetrics: {
        ...baseMetrics,
        latestExtractionRunId: updatedRun.id,
        status: mapRunStatusToLegacyStatus(updatedRun.status),
        blockingPages: unresolvedPages,
        failedPages: unresolvedFailedPages,
        pagesFailed: unresolvedFailedPages.length,
        pageCount: updatedRun.pageCount,
        pagesProcessed: updatedRun.pagesProcessed,
        pagesSucceeded: updatedRun.pagesSucceeded,
        pagesSkipped: updatedRun.pagesSkipped,
        coverageRatio: Number(updatedRun.coverageRatio),
        quality: updatedRun.qualityScore,
      },
    },
  });

  return updatedRun;
}

function mapRunStatusToLegacyStatus(status: RunStatus): "ready" | "ready_with_warnings" | "needs_review" | "failed" {
  switch (status) {
    case "READY":
      return "ready";
    case "READY_WITH_WARNINGS":
      return "ready_with_warnings";
    case "BLOCKED":
      return "needs_review";
    case "FAILED":
    default:
      return "failed";
  }
}

export async function evaluateDealDocumentReadiness(dealId: string): Promise<DealDocumentReadiness> {
  const documents = await prisma.document.findMany({
    where: { dealId, isLatest: true },
    select: {
      id: true,
      name: true,
      type: true,
      mimeType: true,
      processingStatus: true,
      extractionQuality: true,
      extractionRuns: {
        orderBy: { completedAt: "desc" },
        take: 1,
        include: { pages: { orderBy: { pageNumber: "asc" } }, overrides: true },
      },
    },
  });

  const blockers: DocumentReadinessIssue[] = [];
  const warnings: DocumentReadinessIssue[] = [];
  const runIds: string[] = [];
  let readyDocumentCount = 0;

  for (const document of documents) {
    const run = document.extractionRuns[0];
    if (!run) {
      blockers.push({
        documentId: document.id,
        documentName: document.name,
        code: "STRICT_EXTRACTION_MISSING",
        message: `${document.name} must be reprocessed with strict artifact-level extraction before analysis.`,
        actionRequired: "REPROCESS",
        canBypass: false,
      });
      continue;
    }

    runIds.push(run.id);
    const unresolvedPages = getUnresolvedBlockingPages(run);
    const unresolvedPageSet = new Set<number>(unresolvedPages);

    // Toxic check MUST be computed before the gate so it fires even when
    // run.readyForAnalysis === true and unresolvedPages is empty - which is
    // precisely the angle mort we are closing (run marked READY_WITH_WARNINGS
    // but pages carry heuristic_fallback / unverified / parse_failed).
    const toxicPages = isExtractionStrictReadinessEnabled()
      ? run.pages.filter(
          (page) =>
            isPageArtifactToxic(page.artifact, page.status) &&
            !unresolvedPageSet.has(page.pageNumber)
        )
      : [];

    if (!run.readyForAnalysis || unresolvedPages.length > 0 || toxicPages.length > 0) {
      for (const pageNumber of unresolvedPages) {
        blockers.push({
          documentId: document.id,
          documentName: document.name,
          runId: run.id,
          pageNumber,
          code: "PAGE_REQUIRES_REVIEW",
          message: `${document.name}, page ${pageNumber}, must be fixed or explicitly overridden before analysis.`,
          actionRequired: "REVIEW_PAGE",
          canBypass: true,
        });
      }

      for (const page of toxicPages) {
        const state = readPageVerificationState(page.artifact);
        blockers.push({
          documentId: document.id,
          documentName: document.name,
          runId: run.id,
          pageNumber: page.pageNumber,
          code: "UNVERIFIED_ARTIFACT",
          message: `${document.name}, page ${page.pageNumber}, extraction was not verified by a trusted provider (state: ${state ?? "unknown"}).`,
          actionRequired: "REPROCESS",
          canBypass: false,
        });
      }

      // EXTRACTION_BLOCKED only if no page-level blocker already explains the block.
      if (unresolvedPages.length === 0 && toxicPages.length === 0) {
        blockers.push({
          documentId: document.id,
          documentName: document.name,
          runId: run.id,
          code: "EXTRACTION_BLOCKED",
          message: run.blockedReason ?? `${document.name} is blocked by extraction quality controls.`,
          actionRequired: "REPROCESS",
          canBypass: true,
        });
      }
      continue;
    }

    readyDocumentCount += 1;
    const overriddenPages = run.overrides
      .filter((override) => override.approvedAt)
      .map((override) => override.pageNumber)
      .filter((pageNumber): pageNumber is number => typeof pageNumber === "number");
    for (const pageNumber of overriddenPages) {
      warnings.push({
        documentId: document.id,
        documentName: document.name,
        runId: run.id,
        pageNumber,
        code: "PAGE_OVERRIDE_APPROVED",
        message: `${document.name}, page ${pageNumber}, will be analyzed with an explicit user override.`,
        actionRequired: "REVIEW_PAGE",
        canBypass: false,
      });
    }
  }

  return {
    ready: blockers.length === 0,
    dealId,
    checkedAt: new Date().toISOString(),
    documentCount: documents.length,
    readyDocumentCount,
    runIds,
    warnings,
    blockers,
  };
}

function mapRunStatus(manifest: ExtractionManifest): RunStatus {
  if (manifest.status === "ready") return "READY";
  if (manifest.status === "ready_with_warnings") return "READY_WITH_WARNINGS";
  if (manifest.status === "needs_review" && getBlockingPageNumbersFromManifest(manifest).length === 0) {
    return "READY_WITH_WARNINGS";
  }
  if (manifest.status === "failed" && manifest.pagesProcessed === 0) return "FAILED";
  return "BLOCKED";
}

function buildExtractionPageCreateInput(page: ExtractionPageManifest) {
  const artifact = page.artifact ?? buildDocumentPageArtifact({
    pageNumber: page.pageNumber,
    text: "",
    hasTables: page.hasTables,
    hasCharts: page.hasCharts,
    needsHumanReview: page.status === "needs_review" || page.status === "failed",
    error: page.error,
  });

  const encryptedPayload = encryptExtractionPagePayload({
    artifact: JSON.parse(JSON.stringify(artifact)) as Prisma.InputJsonValue,
    textPreview: buildPagePreview(page),
  });

  return {
    pageNumber: page.pageNumber,
    status: mapPageStatus(page.status),
    method: mapPageMethod(page.method),
    charCount: page.charCount,
    wordCount: page.wordCount,
    qualityScore: page.qualityScore,
    hasTables: page.hasTables,
    hasCharts: page.hasCharts,
    hasFinancialKeywords: page.hasFinancialKeywords,
    hasTeamKeywords: page.hasTeamKeywords,
    hasMarketKeywords: page.hasMarketKeywords,
    requiresOCR: page.requiresOCR,
    ocrProcessed: page.ocrProcessed,
    contentHash: artifact.sourceHash ?? null,
    artifactVersion: artifact.version,
    artifact: encryptedPayload.artifact,
    pageImageHash: page.pageImageHash ?? null,
    errorMessage: page.error ?? null,
    textPreview: encryptedPayload.textPreview,
  };
}

function inferNumericClaims(text: string, confidence: "high" | "medium" | "low"): DocumentPageArtifact["numericClaims"] {
  const claims: DocumentPageArtifact["numericClaims"] = [];
  const pattern = /([A-Za-z][A-Za-z0-9 /&().-]{0,48}?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?)/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[1]?.trim().replace(/^[^\w]+/, "");
    const value = match[2]?.trim();
    if (!label || !value || label.length < 2) continue;
    claims.push({
      label,
      value,
      unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
      sourceText: match[0].slice(0, 180),
      confidence,
    });
    if (claims.length >= 60) break;
  }
  if (claims.length === 0 && /\d/.test(text)) {
    for (const match of text.matchAll(/-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?/g)) {
      const value = match[0].trim();
      claims.push({
        label: "numeric_value",
        value,
        unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
        sourceText: value,
        confidence,
      });
      if (claims.length >= 60) break;
    }
  }
  return claims;
}

function scoreStructuredArtifactQuality(
  charCount: number,
  artifact: { hasTables?: boolean; hasCharts?: boolean; hasFinancialKeywords?: boolean; hasTeamKeywords?: boolean; hasMarketKeywords?: boolean }
): number {
  let score = charCount >= 1200 ? 92 : charCount >= 500 ? 82 : charCount >= 160 ? 65 : charCount >= 40 ? 40 : 15;
  const isCritical = artifact.hasTables || artifact.hasCharts || artifact.hasFinancialKeywords || artifact.hasTeamKeywords || artifact.hasMarketKeywords;
  if (isCritical && charCount < 160) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function mapPageStatus(status: ExtractionPageManifest["status"]): PageStatus {
  switch (status) {
    case "ready":
      return "READY";
    case "ready_with_warnings":
      return "READY_WITH_WARNINGS";
    case "needs_review":
      return "NEEDS_REVIEW";
    case "failed":
      return "FAILED";
    case "skipped":
      return "SKIPPED";
  }
}

function mapPageMethod(method: ExtractionPageManifest["method"]): PageMethod {
  switch (method) {
    case "native_text":
      return "NATIVE_TEXT";
    case "ocr":
      return "OCR";
    case "hybrid":
      return "HYBRID";
    case "skipped":
      return "SKIPPED";
  }
}

function buildBlockedReason(manifest: ExtractionManifest): string | null {
  if (manifest.hardBlockers.length > 0) {
    return manifest.hardBlockers.map((blocker) => blocker.message).join("; ");
  }

  const blockingPages = getBlockingPageNumbersFromManifest(manifest);
  if (blockingPages.length > 0) {
    return `Pages requiring explicit review: ${blockingPages.join(", ")}`;
  }

  if (manifest.coverageRatio < 1) {
    return `Extraction coverage is incomplete (${Math.round(manifest.coverageRatio * 100)}%).`;
  }

  return null;
}

function buildPagePreview(page: ExtractionPageManifest): string | null {
  const signals = [
    page.hasFinancialKeywords ? "financial" : null,
    page.hasMarketKeywords ? "market" : null,
    page.hasTeamKeywords ? "team" : null,
    page.hasTables ? "table" : null,
    page.hasCharts ? "chart" : null,
  ].filter(Boolean);

  if (signals.length === 0 && !page.error) return null;
  return [signals.length > 0 ? `Signals: ${signals.join(", ")}` : null, page.error].filter(Boolean).join(". ");
}

function getUnresolvedBlockingPages(run: Pick<ExtractionRunWithDetails, "pages" | "overrides">): number[] {
  const overriddenPages = new Set(
    run.overrides
      .filter((override) => override.approvedAt)
      .map((override) => override.pageNumber)
      .filter((pageNumber): pageNumber is number => typeof pageNumber === "number")
  );
  const blockingPages = new Set(getBlockingPageNumbersFromStoredPages(run.pages));

  return run.pages
    .filter((page) => blockingPages.has(page.pageNumber))
    .filter((page) => !overriddenPages.has(page.pageNumber))
    .map((page) => page.pageNumber);
}
