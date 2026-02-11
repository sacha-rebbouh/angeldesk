import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { extractTextFromPDFUrl, type ExtractionWarning } from "@/services/pdf/extractor";
import { handleApiError } from "@/lib/api-error";

// CUID validation schema
const cuidSchema = z.string().cuid();

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

    // Extract text from the stored PDF
    const extraction = await extractTextFromPDFUrl(document.storageUrl);

    if (extraction.success) {
      // Extract quality metrics
      const quality = extraction.quality;
      const extractionQuality = quality?.metrics.qualityScore ?? null;
      const extractionWarnings: ExtractionWarning[] = quality?.warnings ?? [];
      const requiresOCR = quality?.requiresOCR ?? false;

      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: extraction.text,
          processingStatus: "COMPLETED",
          extractionQuality,
          extractionMetrics: quality?.metrics ? JSON.parse(JSON.stringify(quality.metrics)) : Prisma.DbNull,
          extractionWarnings: extractionWarnings.length > 0 ? JSON.parse(JSON.stringify(extractionWarnings)) : Prisma.DbNull,
          requiresOCR,
        },
      });

      return NextResponse.json({
        data: updated,
        extraction: {
          pageCount: extraction.pageCount,
          textLength: extraction.text.length,
          info: extraction.info,
          quality: extractionQuality,
          warnings: extractionWarnings,
          requiresOCR,
          isUsable: (extractionQuality ?? 0) >= 40,
        },
      });
    } else {
      const errorWarning: ExtractionWarning = {
        code: "EXTRACTION_FAILED",
        severity: "critical",
        message: extraction.error ?? "Failed to extract text from PDF",
        suggestion: "Try re-exporting the PDF from the original source."
      };

      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: "FAILED",
          extractionWarnings: JSON.parse(JSON.stringify([errorWarning])),
        },
      });

      return NextResponse.json(
        {
          error: extraction.error ?? "Failed to extract text from PDF",
          warnings: [errorWarning]
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleApiError(error, "process document");
  }
}
