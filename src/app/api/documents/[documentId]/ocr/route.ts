import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { encryptText } from "@/lib/encryption";

export const maxDuration = 120;

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

    // Download the PDF buffer from storage
    const buffer = await downloadFile(document.storageUrl);

    // Force OCR with low threshold to process all pages
    const result = await smartExtract(buffer, {
      qualityThreshold: 100, // Force OCR on all pages
      maxOCRPages: 50,
      autoOCR: true,
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

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedText: result.text ? encryptText(result.text) : null,
        processingStatus: "COMPLETED",
        extractionQuality: result.quality,
        extractionMetrics: {
          quality: result.quality,
          method: "ocr",
          pagesOCRd: result.pagesOCRd,
          ocrCost: result.estimatedCost,
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
        isUsable: result.quality >= 40,
      },
    });
  } catch (error) {
    return handleApiError(error, "process OCR");
  }
}
