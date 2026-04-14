import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DocumentPageArtifact, ExtractionManifest, ExtractionPageManifest, PageOCRResult } from "@/services/pdf";

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
    sourceHash: params.sourceHash ?? (params.text ? hashExtractedCorpus(params.text) : undefined),
  };
}

export function summarizeManifestForLegacyMetrics(manifest: ExtractionManifest) {
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
    hardBlockers: manifest.hardBlockers,
    creditEstimate: manifest.creditEstimate,
    pageQualityPlan: manifest.pages.map((page) => ({
      pageNumber: page.pageNumber,
      extractionTier: page.extractionTier,
      visualRiskScore: page.visualRiskScore,
      visualRiskReasons: page.visualRiskReasons,
    })),
  };
  return JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonObject;
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
    const pageArtifact = buildDocumentPageArtifact({
      pageNumber: artifact.index,
      label: artifact.label,
      text: artifact.text,
      hasTables,
      hasCharts,
      confidence: artifact.error ? "low" : status === "needs_review" ? "medium" : "high",
      needsHumanReview: status === "needs_review" || status === "failed",
      error: artifact.error,
    });

    return {
      pageNumber: artifact.index,
      status,
      method: artifact.method ?? "native_text",
      charCount,
      wordCount,
      qualityScore: artifact.error ? 0 : scoreStructuredArtifactQuality(charCount, artifact),
      hasTables,
      hasCharts,
      hasFinancialKeywords: artifact.hasFinancialKeywords ?? /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|valuation|cap table|forecast|budget)\b/i.test(artifact.text),
      hasTeamKeywords: artifact.hasTeamKeywords ?? /\b(team|founder|ceo|cto|cfo|coo|linkedin)\b/i.test(artifact.text),
      hasMarketKeywords: artifact.hasMarketKeywords ?? /\b(tam|sam|som|market|cagr|competitor|competition)\b/i.test(artifact.text),
      requiresOCR: false,
      ocrProcessed: artifact.method === "ocr" || artifact.method === "hybrid",
      extractionTier: artifact.method === "ocr" || artifact.method === "hybrid" ? "high_fidelity" : "native_only",
      visualRiskScore: artifact.requiresReview ? 75 : 0,
      visualRiskReasons: artifact.requiresReview ? [`${artifact.label} needs manual review`] : [],
      artifact: pageArtifact,
      pageImageHash: pageArtifact.sourceHash,
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
}) {
  const blockedReason = buildBlockedReason(params.manifest);
  const status = mapRunStatus(params.manifest);
  const readyForAnalysis = status === "READY" || status === "READY_WITH_WARNINGS";

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

  return prisma.documentExtractionRun.update({
    where: { id: params.runId },
    data,
  });
}

export async function recordExtractionPageProgress(params: {
  runId: string;
  page: PageOCRResult;
}) {
  const artifact = params.page.artifact ?? buildDocumentPageArtifact({
    pageNumber: params.page.pageNumber,
    text: params.page.text,
    hasCharts: params.page.hasCharts,
    confidence: params.page.confidence,
    needsHumanReview: params.page.confidence === "low",
  });
  const charCount = params.page.text.length;
  const wordCount = params.page.text.trim().split(/\s+/).filter(Boolean).length;
  const status: PageStatus = params.page.text.trim().length === 0
    ? "FAILED"
    : params.page.confidence === "low"
      ? "NEEDS_REVIEW"
      : "READY_WITH_WARNINGS";
  const method: PageMethod = "OCR";

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
      artifact: JSON.parse(JSON.stringify(artifact)) as Prisma.InputJsonValue,
      pageImageHash: artifact.sourceHash ?? null,
      errorMessage: params.page.text.trim().length === 0 ? "OCR returned no text for this page" : null,
      textPreview: params.page.text.slice(0, 300),
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
      artifact: JSON.parse(JSON.stringify(artifact)) as Prisma.InputJsonValue,
      pageImageHash: artifact.sourceHash ?? null,
      errorMessage: params.page.text.trim().length === 0 ? "OCR returned no text for this page" : null,
      textPreview: params.page.text.slice(0, 300),
    },
  });

  const processedCount = await prisma.documentExtractionPage.count({
    where: { runId: params.runId },
  });

  return prisma.documentExtractionRun.update({
    where: { id: params.runId },
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

export async function completeDocumentExtractionRun(params: {
  runId: string;
  text: string;
  qualityScore: number | null;
  manifest: ExtractionManifest;
  warnings?: unknown;
}) {
  const blockedReason = buildBlockedReason(params.manifest);
  const status = mapRunStatus(params.manifest);
  const readyForAnalysis = status === "READY" || status === "READY_WITH_WARNINGS";

  return prisma.$transaction(async (tx) => {
    await tx.documentExtractionPage.deleteMany({ where: { runId: params.runId } });
    return tx.documentExtractionRun.update({
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
    include: { pages: true, overrides: true },
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

  return prisma.documentExtractionRun.update({
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
    if (!run.readyForAnalysis || unresolvedPages.length > 0) {
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
      if (unresolvedPages.length === 0) {
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
    artifact: JSON.parse(JSON.stringify(artifact)) as Prisma.InputJsonValue,
    pageImageHash: page.pageImageHash ?? artifact.sourceHash ?? null,
    errorMessage: page.error ?? null,
    textPreview: buildPagePreview(page),
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

  if (manifest.status === "needs_review") {
    return `Pages requiring review: ${manifest.pages
      .filter((page) => page.status === "needs_review" || page.status === "failed")
      .map((page) => page.pageNumber)
      .join(", ")}`;
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

  return run.pages
    .filter((page) => page.status === "FAILED" || page.status === "NEEDS_REVIEW")
    .filter((page) => !overriddenPages.has(page.pageNumber))
    .map((page) => page.pageNumber);
}
