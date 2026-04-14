import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { encryptText } from "@/lib/encryption";
import {
  completeDocumentExtractionRun,
  markExtractionRunProgress,
  recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics,
  startDocumentExtractionRun,
} from "@/services/documents/extraction-runs";
import { deductCreditAmount } from "@/services/credits";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/ocr - Force OCR on a PDF document
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { deal: { select: { userId: true } } },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.deal.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (document.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF documents support OCR" }, { status: 400 });
    }

    if (!document.storageUrl) {
      return NextResponse.json({ error: "Document has no storage URL" }, { status: 400 });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "PROCESSING" },
    });
    const progressRun = await startDocumentExtractionRun({
      documentId,
      documentVersion: document.version,
      contentHash: document.contentHash,
      extractionVersion: "strict-pdf-v1",
    });
    let creditsCharged = 0;

    // Download the PDF buffer from storage
    const buffer = await downloadFile(document.storageUrl);

    // Force OCR with low threshold to process all pages
    const result = await smartExtract(buffer, {
      qualityThreshold: 100, // Force OCR on all pages
      maxOCRPages: Number.POSITIVE_INFINITY,
      autoOCR: true,
      strict: true,
      onProgress: async (event) => {
        if (event.phase === "native_extracted") {
          const estimatedCredits = Math.max(0, event.pageCount);
          if (estimatedCredits > 0 && creditsCharged === 0) {
            const deduction = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", estimatedCredits, {
              dealId: document.dealId,
              documentId,
              documentExtractionRunId: progressRun.id,
              idempotencyKey: `extraction:full-ocr:${progressRun.id}`,
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
            creditsCharged = estimatedCredits;
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

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedText: result.text ? encryptText(result.text) : null,
        processingStatus: result.text ? "COMPLETED" : "FAILED",
        extractionQuality: result.quality,
        extractionMetrics: {
          quality: result.quality,
          method: "ocr",
          pagesOCRd: result.pagesOCRd,
          ocrCost: result.estimatedCost,
          extractionCreditsCharged: creditsCharged,
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
    return handleApiError(error, "process OCR");
  }
}
