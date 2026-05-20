import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ProcessingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateOrUnauthorized } from "@/lib/auth-helpers";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { encryptText } from "@/lib/encryption";
import {
  completeDocumentExtractionRun,
  hasUsableExtractionCorpus,
  markExtractionRunProgress,
  recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics,
  startDocumentExtractionRun,
} from "@/services/documents/extraction-runs";
import { getRunningAnalysisForDeal } from "@/services/analysis/guards";
import { CHARGE_DOCUMENT_EXTRACTION_CREDITS, deductCreditAmount, refundCreditAmount } from "@/services/credits";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/ocr - Force OCR on a PDF document
export async function POST(request: NextRequest, { params }: RouteParams) {
  // B11.3.1 (Codex P2) — explicit 401 contract.
  const auth = await authenticateOrUnauthorized();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  let claimedDocumentId: string | null = null;
  let claimedOriginalStatus: ProcessingStatus | null = null;
  let refundContext: { userId: string; dealId: string; documentId: string; requestId: string } | null = null;
  let chargedCredits = 0;
  try {
    const { documentId } = await params;

    // B11.2 (Codex P2) — composite ownership find returning 404
    // uniformly. Replaces the old findUnique → 403 split (404 vs 403
    // disclosure on doc id enumeration).
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const runningAnalysis = await getRunningAnalysisForDeal(document.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: "Une analyse est en cours sur ce deal. Finalisez-la avant de relancer un OCR complet.",
          analysisId: runningAnalysis.id,
        },
        { status: 409 }
      );
    }

    if (document.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF documents support OCR" }, { status: 400 });
    }

    // The schema allows `storagePath` without `storageUrl` (local dev /
    // legacy rows). Mirror download/delete which accept either coordinate.
    const storageTarget = document.storageUrl ?? document.storagePath;
    if (!storageTarget) {
      return NextResponse.json({ error: "Document has no storage reference" }, { status: 400 });
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
        { error: `Document cannot start OCR from status "${latestStatus?.processingStatus ?? document.processingStatus}".` },
        { status: 409 }
      );
    }

    claimedDocumentId = documentId;
    claimedOriginalStatus = document.processingStatus;
    const progressRun = await startDocumentExtractionRun({
      documentId,
      documentVersion: document.version,
      contentHash: document.contentHash,
      extractionVersion: "strict-pdf-v1",
    });
    const ocrRequestId = randomUUID();
    refundContext = {
      userId: user.id,
      dealId: document.dealId,
      documentId,
      requestId: ocrRequestId,
    };

    // Download the PDF buffer from storage
    const buffer = await downloadFile(storageTarget);

    // Force OCR with low threshold to process all pages
    const result = await smartExtract(buffer, {
      qualityThreshold: 100, // Force OCR on all pages
      maxOCRPages: Number.POSITIVE_INFINITY,
      autoOCR: true,
      strict: true,
      onProgress: async (event) => {
        if (event.phase === "native_extracted") {
          const estimatedCredits = Math.max(0, event.pageCount);
          // B10.1 — extraction is not billed separately while
          // `CHARGE_DOCUMENT_EXTRACTION_CREDITS` is false. We skip
          // the deduct AND leave `chargedCredits` at 0 so the catch
          // block's refund-on-failure path is a guaranteed no-op
          // (refund is gated on `chargedCredits > 0`).
          if (CHARGE_DOCUMENT_EXTRACTION_CREDITS && estimatedCredits > 0 && chargedCredits === 0) {
            const deduction = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", estimatedCredits, {
              dealId: document.dealId,
              documentId,
              documentExtractionRunId: progressRun.id,
              idempotencyKey: `extraction:full-ocr:${documentId}:${ocrRequestId}`,
              description: `Full OCR extraction for ${document.name}`,
            });
            if (!deduction.success) {
              const message = deduction.error ?? "Credits insuffisants pour lancer l'OCR";
              await markExtractionRunProgress({
                runId: progressRun.id,
                pageCount: event.pageCount,
                pagesProcessed: 0,
                phase: "failed",
                message,
              });
              await prisma.document.update({
                where: { id: documentId },
                data: { processingStatus: "FAILED" },
              });
              throw new Error(message);
            }
            chargedCredits = estimatedCredits;
          }
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

    const extractionWarnings: ExtractionWarning[] = [];

    if (result.ocrResult?.pageResults) {
      const lowConfidencePages = result.ocrResult.pageResults
        .filter((p) => p.confidence === "low")
        .map((p) => p.pageNumber);

      if (lowConfidencePages.length > 0) {
        extractionWarnings.push({
          code: "LOW_OCR_CONFIDENCE",
          severity: "medium",
          message: `OCR had low confidence on pages: ${lowConfidencePages.join(", ")}`,
          suggestion: "Some text may not be accurately extracted from these pages.",
        });
      }
    }

    extractionWarnings.push({
      code: "FULL_OCR",
      severity: "low",
      message: `Full OCR applied (${result.pagesOCRd} pages). Cost: $${result.estimatedCost.toFixed(4)}`,
      suggestion: "Text extracted via OCR.",
    });

    const extractionRun = await completeDocumentExtractionRun({
      runId: progressRun.id,
      text: result.text,
      qualityScore: result.quality,
      manifest: result.manifest,
      warnings: extractionWarnings,
    });

    // Shared corpus-usability rule — must agree with the run status set by
    // completeDocumentExtractionRun above. A whitespace-only OCR result is
    // NOT a success: document FAILED, no extractedText.
    const ocrProducedUsableCorpus = hasUsableExtractionCorpus(result.text);
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedText: ocrProducedUsableCorpus ? encryptText(result.text) : null,
        processingStatus: ocrProducedUsableCorpus ? "COMPLETED" : "FAILED",
        extractionQuality: result.quality,
        extractionMetrics: {
          quality: result.quality,
          method: "ocr",
          pagesOCRd: result.pagesOCRd,
          ocrCost: result.estimatedCost,
          extractionCreditsCharged: chargedCredits,
          latestExtractionRunId: extractionRun.id,
          ...summarizeManifestForLegacyMetrics(result.manifest),
        },
        extractionWarnings: JSON.parse(JSON.stringify(extractionWarnings)),
        requiresOCR: false,
        ocrProcessed: true,
      },
    });

    return NextResponse.json({
      data: updated,
      extraction: {
        quality: result.quality,
        pagesOCRd: result.pagesOCRd,
        ocrCost: result.estimatedCost,
        isUsable: extractionRun.readyForAnalysis,
        manifest: result.manifest,
      },
    });
  } catch (error) {
    if (refundContext && chargedCredits > 0) {
      await refundCreditAmount(refundContext.userId, "EXTRACTION_HIGH_PAGE", chargedCredits, {
        dealId: refundContext.dealId,
        documentId: refundContext.documentId,
        idempotencyKey: `extraction:refund:full-ocr:${refundContext.requestId}`,
        description: `Refund failed full OCR for ${refundContext.documentId}`,
      }).catch(() => undefined);
    }
    if (claimedDocumentId && claimedOriginalStatus) {
      await prisma.document.updateMany({
        where: { id: claimedDocumentId, processingStatus: "PROCESSING" },
        data: { processingStatus: claimedOriginalStatus },
      }).catch(() => undefined);
    }
    return handleApiError(error, "process OCR");
  }
}
