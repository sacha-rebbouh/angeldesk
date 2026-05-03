import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma, type ProcessingStatus } from "@prisma/client";
import { z } from "zod";

import { handleApiError } from "@/lib/api-error";
import { requireAuth } from "@/lib/auth";
import { encryptText, safeDecrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import {
  buildDocumentPageArtifact,
  calculateArtifactCompleteness,
  hashExtractedCorpus,
  refreshRunExtractionStats,
} from "@/services/documents/extraction-runs";
import { getRunningAnalysisForDeal } from "@/services/analysis/guards";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import { detectPageSignals, selectiveOCR } from "@/services/pdf";
import { assessExtractionSemantics } from "@/services/pdf/extraction-semantics";
import { downloadFile } from "@/services/storage";

export const maxDuration = 300;

const cuidSchema = z.string().cuid();
const pageNumberSchema = z.coerce.number().int().positive();

type RouteParams = {
  params: Promise<{ documentId: string; pageNumber: string }>;
};

type PageStatus = "READY" | "READY_WITH_WARNINGS" | "NEEDS_REVIEW" | "FAILED";

export async function POST(_request: Request, context: RouteParams) {
  let claimedDocumentId: string | null = null;
  let claimedOriginalStatus: ProcessingStatus | null = null;
  let refundContext: { userId: string; dealId: string; documentId: string; pageNumber: number; requestId: string } | null = null;
  let chargedCredits = 0;
  try {
    const user = await requireAuth();
    const { documentId, pageNumber: rawPageNumber } = await context.params;

    const documentIdCheck = cuidSchema.safeParse(documentId);
    const pageNumberCheck = pageNumberSchema.safeParse(rawPageNumber);
    if (!documentIdCheck.success || !pageNumberCheck.success) {
      return NextResponse.json({ error: "Invalid document or page ID format" }, { status: 400 });
    }
    const pageNumber = pageNumberCheck.data;

    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      include: {
        extractionRuns: {
          orderBy: { completedAt: "desc" },
          take: 1,
          include: {
            pages: true,
            overrides: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const runningAnalysis = await getRunningAnalysisForDeal(document.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: "Une analyse est en cours sur ce deal. Finalisez-la avant de relancer une page d'extraction.",
          analysisId: runningAnalysis.id,
        },
        { status: 409 }
      );
    }
    if (document.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF documents can be retried page by page" }, { status: 400 });
    }
    if (!document.storageUrl) {
      return NextResponse.json({ error: "Document has no storage URL" }, { status: 400 });
    }

    const latestRun = document.extractionRuns[0] ?? null;
    if (!latestRun) {
      return NextResponse.json({ error: "No extraction run found for this document" }, { status: 409 });
    }
    if (pageNumber > latestRun.pageCount) {
      return NextResponse.json({ error: `Page ${pageNumber} is outside the extracted document range` }, { status: 400 });
    }

    const page = latestRun.pages.find((candidate) => candidate.pageNumber === pageNumber);
    if (!page) {
      return NextResponse.json({ error: `Page ${pageNumber} was not tracked in the latest extraction run` }, { status: 404 });
    }
    if (!canRetryPage(page, latestRun.summaryMetrics)) {
      return NextResponse.json(
        { error: `Page ${pageNumber} does not require a targeted retry` },
        { status: 409 }
      );
    }

    const processingClaim = await prisma.document.updateMany({
      where: {
        id: documentId,
        processingStatus: { not: "PROCESSING" },
      },
      data: { processingStatus: "PROCESSING" },
    });

    if (processingClaim.count === 0) {
      const latestStatus = await prisma.document.findUnique({
        where: { id: documentId },
        select: { processingStatus: true },
      });
      return NextResponse.json(
        { error: `Document cannot retry extraction from status "${latestStatus?.processingStatus ?? document.processingStatus}".` },
        { status: 409 }
      );
    }

    claimedDocumentId = documentId;
    claimedOriginalStatus = document.processingStatus;

    const retryRequestId = randomUUID();
    refundContext = {
      userId: user.id,
      dealId: document.dealId,
      documentId,
      pageNumber,
      requestId: retryRequestId,
    };

    const creditDeduction = await deductCreditAmount(user.id, "EXTRACTION_SUPREME_PAGE", 2, {
      dealId: document.dealId,
      documentId,
      documentExtractionRunId: latestRun.id,
      pageNumber,
      idempotencyKey: `extraction:supreme-page:${latestRun.id}:${pageNumber}:${retryRequestId}`,
      description: `Supreme OCR retry for ${document.name}, page ${pageNumber}`,
    });
    if (!creditDeduction.success) {
      await prisma.document.updateMany({
        where: { id: documentId, processingStatus: "PROCESSING" },
        data: { processingStatus: document.processingStatus },
      }).catch(() => undefined);
      return NextResponse.json(
        { error: creditDeduction.error ?? "Credits insuffisants pour relancer cette page", requiredCredits: 2 },
          { status: 402 }
      );
    }
    chargedCredits = 2;

    const existingCorpus = document.extractedText ? safeDecrypt(document.extractedText) : "";
    const buffer = await downloadFile(document.storageUrl);
    const retryResult = await selectiveOCR(buffer, [pageNumber - 1], undefined, {
      maxPages: 1,
      mode: "supreme",
      scale: 3,
    });
    const retryPage = retryResult.pageResults.find((result) => result.pageNumber === pageNumber);

    if (!retryResult.success || !retryPage || retryPage.text.trim().length === 0) {
      await prisma.documentExtractionPage.update({
        where: { runId_pageNumber: { runId: latestRun.id, pageNumber } },
        data: {
          status: "FAILED",
          method: "OCR",
          charCount: 0,
          wordCount: 0,
          qualityScore: 0,
          confidence: "low",
          requiresOCR: true,
          ocrProcessed: false,
          errorMessage: retryResult.error ?? "Targeted supreme OCR returned no text",
          textPreview: retryResult.error ?? "Targeted supreme OCR returned no text",
        },
      });
      await refreshRunExtractionStats(latestRun.id, existingCorpus);
      await prisma.document.update({
        where: { id: documentId },
        data: { processingStatus: "COMPLETED" },
      });

      return NextResponse.json(
        { error: retryResult.error ?? `Page ${pageNumber} retry did not extract usable text` },
        { status: 422 }
      );
    }

    const retryModeLabel = (retryPage.mode ?? "supreme").replace("_", " ");
    const replacementText = `[Page ${pageNumber} - ${retryModeLabel} OCR retry]\n${retryPage.text.trim()}`;
    const updatedCorpus = replacePageText(existingCorpus, pageNumber, replacementText);
    const qualityPlan = getPageQualityPlan(latestRun.summaryMetrics, pageNumber);
    const signals = detectPageSignals(retryPage.text);
    const expectedHasTables = page.hasTables || signals.hasTables || isTableLikeQualityPlan(qualityPlan);
    const expectedHasCharts = page.hasCharts || signals.hasCharts || isChartLikeQualityPlan(qualityPlan);
    const charCount = retryPage.text.length;
    const wordCount = retryPage.text.split(/\s+/).filter(Boolean).length;
    const qualityScore = scoreRetriedPage(charCount, signals);
    const pageArtifact = retryPage.artifact ?? buildDocumentPageArtifact({
      pageNumber,
      label: `Page ${pageNumber}`,
      text: retryPage.text,
      hasTables: expectedHasTables,
      hasCharts: expectedHasCharts,
      confidence: retryPage.confidence,
      needsHumanReview: retryPage.confidence === "low",
      ocrMode: retryPage.mode ?? "supreme",
    });
    const semanticAssessment = assessExtractionSemantics({
      pageNumber,
      text: retryPage.text,
      charCount,
      wordCount,
      hasTables: expectedHasTables,
      hasCharts: expectedHasCharts,
      hasFinancialKeywords: signals.hasFinancialKeywords,
      hasTeamKeywords: signals.hasTeamKeywords,
      hasMarketKeywords: signals.hasMarketKeywords,
      artifact: pageArtifact,
    });
    pageArtifact.semanticAssessment = semanticAssessment;
    const artifactCompleteness = calculateArtifactCompleteness({
      hasTables: expectedHasTables,
      hasCharts: expectedHasCharts,
      artifact: pageArtifact,
    });
    const status = determineRetriedPageStatus({
      originalStatus: page.status,
      charCount,
      qualityScore,
      confidence: retryPage.confidence,
      semanticAssessment,
      artifactCompletenessScore: artifactCompleteness.score,
      visualRiskScore: readQualityPlanVisualRiskScore(qualityPlan),
    });
    if (status === "NEEDS_REVIEW") {
      pageArtifact.needsHumanReview = true;
      if (!pageArtifact.unreadableRegions.some((region) => region.reason === "Targeted OCR retry requires human inspection before acceptance.")) {
        pageArtifact.unreadableRegions.push({
          reason: "Targeted OCR retry requires human inspection before acceptance.",
          severity: "medium",
        });
      }
    }
    const summaryMetrics = updateSummaryMetrics(latestRun.summaryMetrics, {
      pageNumber,
      extractionTier: "supreme",
      visualRiskScore: 95,
      visualRiskReasons: ["targeted_page_retry", `${retryPage.mode ?? "supreme"}_ocr`],
    });

    await prisma.$transaction([
      prisma.documentExtractionPage.update({
        where: { runId_pageNumber: { runId: latestRun.id, pageNumber } },
        data: {
          status,
          method: "HYBRID",
          charCount,
          wordCount,
          qualityScore,
          confidence: retryPage.confidence,
          hasTables: expectedHasTables,
          hasCharts: expectedHasCharts,
          hasFinancialKeywords: signals.hasFinancialKeywords,
          hasTeamKeywords: signals.hasTeamKeywords,
          hasMarketKeywords: signals.hasMarketKeywords,
          requiresOCR: true,
          ocrProcessed: true,
          contentHash: hashExtractedCorpus(retryPage.text),
          artifactVersion: pageArtifact.version,
          artifact: JSON.parse(JSON.stringify(pageArtifact)) as Prisma.InputJsonValue,
          pageImageHash: retryPage.pageImageHash ?? null,
          errorMessage: status === "NEEDS_REVIEW" ? "Targeted supreme OCR completed but still needs review" : null,
          textPreview: buildPreview(retryPage.text),
        },
      }),
      prisma.documentExtractionRun.update({
        where: { id: latestRun.id },
        data: {
          summaryMetrics,
          warnings: mergeRetryWarning(latestRun.warnings, {
            pageNumber,
            status,
            message: `Page ${pageNumber} retried with targeted supreme OCR.`,
          }),
        },
      }),
      prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: encryptText(updatedCorpus),
          extractionMetrics: mergeExtractionMetrics(document.extractionMetrics, {
            latestExtractionRunId: latestRun.id,
            lastPageRetry: {
              pageNumber,
              mode: retryPage.mode ?? "supreme",
              status,
              charCount,
              wordCount,
              cost: retryResult.totalCost,
              creditsCharged: 2,
              creditAction: "EXTRACTION_SUPREME_PAGE",
              retriedAt: new Date().toISOString(),
            },
          }),
          extractionWarnings: mergeRetryWarning(document.extractionWarnings, {
            pageNumber,
            status,
            message: `Page ${pageNumber} retried with targeted supreme OCR.`,
          }),
          processingStatus: "COMPLETED",
          requiresOCR: true,
          ocrProcessed: true,
        },
      }),
    ]);

    const refreshedRun = await refreshRunExtractionStats(latestRun.id, updatedCorpus);

    return NextResponse.json({
      data: {
        pageNumber,
        status,
        charCount,
        wordCount,
        qualityScore,
        runStatus: refreshedRun?.status ?? latestRun.status,
        readyForAnalysis: refreshedRun?.readyForAnalysis ?? latestRun.readyForAnalysis,
        creditsCharged: 2,
      },
    });
  } catch (error) {
    if (refundContext && chargedCredits > 0) {
      await refundCreditAmount(refundContext.userId, "EXTRACTION_SUPREME_PAGE", chargedCredits, {
        dealId: refundContext.dealId,
        documentId: refundContext.documentId,
        pageNumber: refundContext.pageNumber,
        idempotencyKey: `extraction:refund:supreme-page:${refundContext.requestId}`,
        description: `Refund failed supreme OCR retry for ${refundContext.documentId} page ${refundContext.pageNumber}`,
      }).catch(() => undefined);
    }
    if (claimedDocumentId && claimedOriginalStatus) {
      await prisma.document.updateMany({
        where: { id: claimedDocumentId, processingStatus: "PROCESSING" },
        data: { processingStatus: claimedOriginalStatus },
      }).catch(() => undefined);
    }
    return handleApiError(error, "retry extraction page");
  }
}

function replacePageText(corpus: string, pageNumber: number, replacementText: string): string {
  const marker = /\[Page (\d+) - [^\]]+\]/g;
  const matches = [...corpus.matchAll(marker)];
  if (matches.length === 0) {
    return [corpus.trim(), replacementText].filter(Boolean).join("\n\n");
  }

  const rebuilt: string[] = [];
  const prefix = corpus.slice(0, matches[0].index ?? 0).trim();
  if (prefix) rebuilt.push(prefix);

  let inserted = false;
  for (const [index, match] of matches.entries()) {
    const currentPageNumber = Number(match[1]);
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? corpus.length;
    const chunk = corpus.slice(start, end).trim();

    if (currentPageNumber === pageNumber) {
      if (!inserted) {
        rebuilt.push(replacementText);
        inserted = true;
      }
      continue;
    }

    rebuilt.push(chunk);
  }

  if (!inserted) rebuilt.push(replacementText);
  return rebuilt.filter(Boolean).join("\n\n");
}

function scoreRetriedPage(
  charCount: number,
  signals: ReturnType<typeof detectPageSignals>
): number {
  let score = Math.min(90, Math.round(charCount / 18));
  if (signals.hasTables || signals.hasCharts) score += 10;
  if (signals.hasFinancialKeywords || signals.hasMarketKeywords || signals.hasTeamKeywords) score += 5;
  return Math.max(0, Math.min(100, score));
}

function canRetryPage(
  page: {
    status: string;
    pageNumber: number;
    hasTables: boolean;
    hasCharts: boolean;
    artifact: Prisma.JsonValue | null;
  },
  summaryMetrics: Prisma.JsonValue | null
): boolean {
  if (page.status === "FAILED" || page.status === "NEEDS_REVIEW") return true;

  const artifact = isPlainObject(page.artifact) ? page.artifact : {};
  const tables = Array.isArray(artifact.tables) ? artifact.tables.length : 0;
  const charts = Array.isArray(artifact.charts) ? artifact.charts.length : 0;
  const numericClaims = Array.isArray(artifact.numericClaims) ? artifact.numericClaims.length : 0;
  const needsHumanReview = artifact.needsHumanReview === true;
  const missingExpectedStructure = (page.hasTables && tables === 0) || (page.hasCharts && charts === 0 && numericClaims < 3);
  const visualRiskScore = getVisualRiskScore(summaryMetrics, page.pageNumber);

  return needsHumanReview || missingExpectedStructure || visualRiskScore >= 55;
}

function getVisualRiskScore(summaryMetrics: Prisma.JsonValue | null, pageNumber: number): number {
  return readQualityPlanVisualRiskScore(getPageQualityPlan(summaryMetrics, pageNumber));
}

function getPageQualityPlan(summaryMetrics: Prisma.JsonValue | null, pageNumber: number): Record<string, unknown> | null {
  if (!isPlainObject(summaryMetrics) || !Array.isArray(summaryMetrics.pageQualityPlan)) return null;
  const entry = summaryMetrics.pageQualityPlan.find((candidate) => (
    isPlainObject(candidate) && Number(candidate.pageNumber) === pageNumber
  ));
  return isPlainObject(entry) ? entry : null;
}

function readQualityPlanVisualRiskScore(plan: Record<string, unknown> | null): number {
  return typeof plan?.visualRiskScore === "number" ? plan.visualRiskScore : 0;
}

function isTableLikeQualityPlan(plan: Record<string, unknown> | null): boolean {
  return plan?.pageClass === "structured_table" || plan?.pageClass === "transaction_terms";
}

function isChartLikeQualityPlan(plan: Record<string, unknown> | null): boolean {
  return (
    plan?.pageClass === "chart_kpi" ||
    plan?.pageClass === "waterfall_summary" ||
    plan?.pageClass === "segmented_infographic" ||
    plan?.pageClass === "mixed_visual_analytics"
  );
}

function determineRetriedPageStatus(params: {
  originalStatus: string;
  charCount: number;
  qualityScore: number;
  confidence: "high" | "medium" | "low";
  artifactCompletenessScore: number;
  visualRiskScore: number;
  semanticAssessment: {
    semanticSufficiency: "sufficient" | "partial" | "insufficient";
    shouldBlockIfStructureMissing: boolean;
    canDegradeToWarning: boolean;
    analyticalValueScore?: number;
  };
}): PageStatus {
  const {
    originalStatus,
    charCount,
    qualityScore,
    confidence,
    semanticAssessment,
    artifactCompletenessScore,
    visualRiskScore,
  } = params;
  if (charCount < 40) return "FAILED";
  if (
    originalStatus === "FAILED" ||
    originalStatus === "NEEDS_REVIEW" ||
    visualRiskScore >= 55 ||
    artifactCompletenessScore < 80
  ) {
    return "NEEDS_REVIEW";
  }
  if (
    (
      semanticAssessment.semanticSufficiency === "insufficient" &&
      (semanticAssessment.analyticalValueScore ?? 100) >= 35
    ) ||
    (semanticAssessment.shouldBlockIfStructureMissing &&
      !semanticAssessment.canDegradeToWarning &&
      semanticAssessment.semanticSufficiency !== "sufficient")
  ) {
    return "NEEDS_REVIEW";
  }
  if (
    confidence === "low" ||
    qualityScore < 55 ||
    charCount < 180 ||
    semanticAssessment.semanticSufficiency === "partial"
  ) {
    return "READY_WITH_WARNINGS";
  }
  return "READY";
}

function buildPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function updateSummaryMetrics(
  current: unknown,
  pagePlan: {
    pageNumber: number;
    extractionTier: string;
    visualRiskScore: number;
    visualRiskReasons: string[];
  }
): Prisma.InputJsonObject {
  const summary = isPlainObject(current) ? { ...current } : {};
  const existingPlan = Array.isArray(summary.pageQualityPlan) ? summary.pageQualityPlan : [];
  const previousEntry = existingPlan.find((entry) => (
    isPlainObject(entry) && entry.pageNumber === pagePlan.pageNumber
  ));
  const mergedPagePlan = isPlainObject(previousEntry)
    ? { ...previousEntry, ...pagePlan }
    : pagePlan;
  summary.pageQualityPlan = [
    ...existingPlan.filter((entry) => (
      !isPlainObject(entry) || entry.pageNumber !== pagePlan.pageNumber
    )),
    mergedPagePlan,
  ].sort((left, right) => {
    if (!isPlainObject(left) || !isPlainObject(right)) return 0;
    return Number(left.pageNumber ?? 0) - Number(right.pageNumber ?? 0);
  });
  return JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonObject;
}

function mergeExtractionMetrics(
  current: unknown,
  patch: Record<string, unknown>
): Prisma.InputJsonObject {
  const metrics = isPlainObject(current) ? { ...current } : {};
  return JSON.parse(JSON.stringify({ ...metrics, ...patch })) as Prisma.InputJsonObject;
}

function mergeRetryWarning(
  current: unknown,
  retryWarning: { pageNumber: number; status: string; message: string }
): Prisma.InputJsonValue {
  const warning = {
    code: "TARGETED_PAGE_RETRY",
    severity: retryWarning.status === "FAILED" ? "critical" : "warning",
    message: retryWarning.message,
    pageNumber: retryWarning.pageNumber,
    status: retryWarning.status,
    retriedAt: new Date().toISOString(),
  };

  if (Array.isArray(current)) {
    return JSON.parse(JSON.stringify([warning, ...current])) as Prisma.InputJsonValue;
  }
  return JSON.parse(JSON.stringify([warning])) as Prisma.InputJsonValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
