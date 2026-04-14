import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ExtractionManifest, ExtractionPageManifest } from "@/services/pdf";

export const STRICT_EXTRACTION_PIPELINE_VERSION = "strict-document-extraction-v1";

type PageStatus = "READY" | "READY_WITH_WARNINGS" | "NEEDS_REVIEW" | "FAILED" | "SKIPPED";
type PageMethod = "NATIVE_TEXT" | "OCR" | "HYBRID" | "SKIPPED";
type RunStatus = "READY" | "READY_WITH_WARNINGS" | "BLOCKED" | "FAILED";

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
        create: params.manifest.pages.map((page) => ({
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
          contentHash: null,
          errorMessage: page.error ?? null,
          textPreview: buildPagePreview(page),
        })),
      },
    },
    include: {
      pages: true,
      overrides: true,
    },
  });
}

export async function getLatestExtractionRunForDocument(documentId: string) {
  return prisma.documentExtractionRun.findFirst({
    where: { documentId },
    orderBy: { completedAt: "desc" },
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
    if (document.mimeType !== "application/pdf") {
      if (document.processingStatus === "COMPLETED") {
        readyDocumentCount += 1;
      } else {
        blockers.push({
          documentId: document.id,
          documentName: document.name,
          code: "DOCUMENT_NOT_PROCESSED",
          message: `${document.name} has not completed extraction.`,
          actionRequired: "REPROCESS",
          canBypass: false,
        });
      }
      continue;
    }

    const run = document.extractionRuns[0];
    if (!run) {
      blockers.push({
        documentId: document.id,
        documentName: document.name,
        code: "STRICT_EXTRACTION_MISSING",
        message: `${document.name} must be reprocessed with strict page-level extraction before analysis.`,
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
