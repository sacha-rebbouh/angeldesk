import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { encryptText } from "@/lib/encryption";
import {
  recordDocumentExtractionRun,
  summarizeManifestForLegacyMetrics,
} from "@/services/documents/extraction-runs";

// CUID validation schema
const cuidSchema = z.string().cuid();

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/process - Reprocess a document
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // Update status to PROCESSING
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "PROCESSING" },
    });

    // Extract text from the stored PDF. downloadFile() transparently decrypts
    // private document blobs before pdfjs reads the buffer.
    const buffer = await downloadFile(document.storageUrl);
    const extraction = await smartExtract(buffer, {
      qualityThreshold: 40,
      maxOCRPages: Number.POSITIVE_INFINITY,
      autoOCR: true,
      strict: true,
    });
    const extractionWarnings: ExtractionWarning[] = extraction.manifest.hardBlockers.map((blocker) => ({
      code: blocker.code,
      severity: "critical",
      message: blocker.message,
      suggestion: blocker.pageNumber
        ? `Review page ${blocker.pageNumber}, rerun OCR, upload a corrected file, or approve an explicit override.`
        : "Rerun extraction, upload a corrected file, or approve an explicit override.",
    }));
    const extractionRun = await recordDocumentExtractionRun({
      documentId,
      documentVersion: document.version,
      contentHash: document.contentHash,
      text: extraction.text,
      qualityScore: extraction.quality,
      manifest: extraction.manifest,
      warnings: extractionWarnings.length > 0 ? JSON.parse(JSON.stringify(extractionWarnings)) : [],
    });

    if (extraction.text) {
      const extractionQuality = extraction.quality;
      const requiresOCR = extraction.manifest.status === "needs_review" || extraction.manifest.status === "failed";

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
    return handleApiError(error, "process document");
  }
}
