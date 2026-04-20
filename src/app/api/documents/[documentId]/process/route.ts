import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type ProcessingStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { encryptText } from "@/lib/encryption";
import {
  completeDocumentExtractionRun,
  getBlockingPageNumbersFromManifest,
  markExtractionRunProgress,
  recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics,
  startDocumentExtractionRun,
} from "@/services/documents/extraction-runs";
import { getRunningAnalysisForDeal } from "@/services/analysis/guards";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";

// CUID validation schema
const cuidSchema = z.string().cuid();

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/process - Reprocess a document
export async function POST(request: NextRequest, { params }: RouteParams) {
  let claimedDocumentId: string | null = null;
  let claimedOriginalStatus: ProcessingStatus | null = null;
  let chargedCredits = 0;
  let refundContext: { userId: string; dealId: string; documentId: string; requestId: string } | null = null;
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    // Find document and verify ownership through deal
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        deal: {
          select: { userId: true },
        },
        extractionRuns: {
          orderBy: { completedAt: "desc" },
          take: 1,
          select: { summaryMetrics: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (document.deal.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const runningAnalysis = await getRunningAnalysisForDeal(document.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: "Une analyse est en cours sur ce deal. Finalisez-la avant de relancer l'extraction du document.",
          analysisId: runningAnalysis.id,
        },
        { status: 409 }
      );
    }

    // Only process PDFs
    if (document.mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF documents can be processed" },
        { status: 400 }
      );
    }

    if (!document.storageUrl) {
      return NextResponse.json(
        { error: "Document has no storage URL" },
        { status: 400 }
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
        { error: `Document cannot be reprocessed from status "${latestStatus?.processingStatus ?? document.processingStatus}".` },
        { status: 409 }
      );
    }

    claimedDocumentId = documentId;
    claimedOriginalStatus = document.processingStatus;

    const estimatedCredits = extractEstimatedCredits(document.extractionRuns[0]?.summaryMetrics);
    if (estimatedCredits > 0) {
      const reprocessRequestId = randomUUID();
      refundContext = {
        userId: user.id,
        dealId: document.dealId,
        documentId,
        requestId: reprocessRequestId,
      };
      const deduction = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", estimatedCredits, {
        dealId: document.dealId,
        documentId,
        idempotencyKey: `extraction:reprocess:${documentId}:${reprocessRequestId}`,
        description: `Enhanced document re-extraction for ${document.name}`,
      });
      if (!deduction.success) {
        await prisma.document.updateMany({
          where: { id: documentId, processingStatus: "PROCESSING" },
          data: { processingStatus: document.processingStatus },
        }).catch(() => undefined);
        return NextResponse.json(
          { error: deduction.error ?? "Credits insuffisants pour relancer l'extraction", requiredCredits: estimatedCredits },
          { status: 402 }
        );
      }
      chargedCredits = estimatedCredits;
    }
    const progressRun = await startDocumentExtractionRun({
      documentId,
      documentVersion: document.version,
      contentHash: document.contentHash,
      extractionVersion: "strict-pdf-v1",
    });

    // Extract text from the stored PDF. downloadFile() transparently decrypts
    // private document blobs before pdfjs reads the buffer.
    const buffer = await downloadFile(document.storageUrl);
    const extraction = await smartExtract(buffer, {
      qualityThreshold: 40,
      maxOCRPages: Number.POSITIVE_INFINITY,
      autoOCR: true,
      strict: true,
      onProgress: async (event) => {
        if (event.phase === "native_extracted") {
          await markExtractionRunProgress({
            runId: progressRun.id,
            pageCount: event.pageCount,
            pagesProcessed: 0,
            phase: event.phase,
            message: event.message,
          });
          return;
        }
        if (event.phase === "page_processed") {
          await recordExtractionPageProgress({
            runId: progressRun.id,
            page: event.page,
          });
          return;
        }
        await markExtractionRunProgress({
          runId: progressRun.id,
          phase: event.phase,
          message: event.message,
          pageCount: "pageCount" in event ? event.pageCount : undefined,
          pagesProcessed: "pagesProcessed" in event ? event.pagesProcessed : undefined,
        });
      },
    });
    const extractionWarnings: ExtractionWarning[] = extraction.manifest.hardBlockers.map((blocker) => ({
      code: blocker.code,
      severity: "critical",
      message: blocker.message,
      suggestion: blocker.pageNumber
        ? `Review page ${blocker.pageNumber}, rerun OCR, upload a corrected file, or approve an explicit override.`
        : "Rerun extraction, upload a corrected file, or approve an explicit override.",
    }));
    const extractionRun = await completeDocumentExtractionRun({
      runId: progressRun.id,
      text: extraction.text,
      qualityScore: extraction.quality,
      manifest: extraction.manifest,
      warnings: extractionWarnings.length > 0 ? JSON.parse(JSON.stringify(extractionWarnings)) : [],
    });

    if (extraction.text) {
      const extractionQuality = extraction.quality;
      const requiresOCR =
        extraction.manifest.status === "failed" ||
        getBlockingPageNumbersFromManifest(extraction.manifest).length > 0;

      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: extraction.text ? encryptText(extraction.text) : null,
          processingStatus: "COMPLETED",
          extractionQuality,
          extractionMetrics: {
            quality: extractionQuality,
            method: extraction.method,
            pagesOCRd: extraction.pagesOCRd,
            ocrCost: extraction.estimatedCost,
            latestExtractionRunId: extractionRun.id,
            ...summarizeManifestForLegacyMetrics(extraction.manifest),
          },
          extractionWarnings: extractionWarnings.length > 0 ? JSON.parse(JSON.stringify(extractionWarnings)) : Prisma.DbNull,
          requiresOCR,
          ocrProcessed: extraction.method === "ocr" || extraction.method === "hybrid",
        },
      });

      return NextResponse.json({
        data: updated,
        extraction: {
          pageCount: extraction.manifest.pageCount,
          textLength: extraction.text.length,
          quality: extractionQuality,
          warnings: extractionWarnings,
          requiresOCR,
          isUsable: extractionRun.readyForAnalysis,
          creditEstimate: extraction.manifest.creditEstimate,
          creditsCharged: estimatedCredits,
          manifest: extraction.manifest,
        },
      });
    } else {
      const errorWarning: ExtractionWarning = {
        code: "EXTRACTION_FAILED",
        severity: "critical",
        message: extraction.manifest.hardBlockers[0]?.message ?? "Failed to extract text from PDF",
        suggestion: "Try re-exporting the PDF from the original source."
      };

      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: "FAILED",
          extractionQuality: extraction.quality,
          extractionMetrics: {
            quality: extraction.quality,
            method: extraction.method,
            pagesOCRd: extraction.pagesOCRd,
            ocrCost: extraction.estimatedCost,
            latestExtractionRunId: extractionRun.id,
            ...summarizeManifestForLegacyMetrics(extraction.manifest),
          },
          extractionWarnings: JSON.parse(JSON.stringify([errorWarning])),
        },
      });

      return NextResponse.json(
        {
          error: extraction.manifest.hardBlockers[0]?.message ?? "Failed to extract text from PDF",
          warnings: [errorWarning]
        },
        { status: 500 }
      );
    }
  } catch (error) {
    if (refundContext && chargedCredits > 0) {
      await refundCreditAmount(refundContext.userId, "EXTRACTION_HIGH_PAGE", chargedCredits, {
        dealId: refundContext.dealId,
        documentId: refundContext.documentId,
        idempotencyKey: `extraction:refund:reprocess:${refundContext.requestId}`,
        description: `Refund failed document re-extraction for ${refundContext.documentId}`,
      }).catch(() => undefined);
    }
    if (claimedDocumentId && claimedOriginalStatus) {
      await prisma.document.updateMany({
        where: { id: claimedDocumentId, processingStatus: "PROCESSING" },
        data: { processingStatus: claimedOriginalStatus },
      }).catch(() => undefined);
    }
    return handleApiError(error, "process document");
  }
}

function extractEstimatedCredits(summaryMetrics: unknown): number {
  if (!summaryMetrics || typeof summaryMetrics !== "object" || Array.isArray(summaryMetrics)) return 0;
  const creditEstimate = (summaryMetrics as { creditEstimate?: { estimatedCredits?: unknown } }).creditEstimate;
  const value = creditEstimate?.estimatedCredits;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}
