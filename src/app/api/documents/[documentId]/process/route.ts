import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { extractTextFromPDFUrl } from "@/services/pdf/extractor";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/process - Reprocess a document
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

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

    if (extraction.success && extraction.text) {
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: extraction.text,
          processingStatus: "COMPLETED",
        },
      });

      return NextResponse.json({
        data: updated,
        extraction: {
          pageCount: extraction.pageCount,
          textLength: extraction.text.length,
          info: extraction.info,
        },
      });
    } else {
      await prisma.document.update({
        where: { id: documentId },
        data: { processingStatus: "FAILED" },
      });

      return NextResponse.json(
        { error: extraction.error ?? "Failed to extract text from PDF" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error processing document:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
