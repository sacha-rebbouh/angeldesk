import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/services/storage";
import { getPdfPageCount } from "@/services/pdf/extractor";
import { createRenderer } from "@/services/pdf/renderers";

const cuidSchema = z.string().cuid();
const pageNumberSchema = z.coerce.number().int().positive();

type RouteParams = {
  params: Promise<{ documentId: string; pageNumber: string }>;
};

export async function GET(_request: NextRequest, context: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId, pageNumber } = await context.params;

    const idCheck = cuidSchema.safeParse(documentId);
    const pageCheck = pageNumberSchema.safeParse(pageNumber);
    if (!idCheck.success || !pageCheck.success) {
      return NextResponse.json({ error: "Invalid preview parameters" }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        name: true,
        mimeType: true,
        storageUrl: true,
        storagePath: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Preview is only available for PDFs" }, { status: 400 });
    }

    const fileUrl = document.storageUrl ?? document.storagePath;
    if (!fileUrl) {
      return NextResponse.json({ error: "Document file not available" }, { status: 404 });
    }

    const pdfBuffer = await downloadFile(fileUrl);
    const pageCount = await getPdfPageCount(pdfBuffer);
    if (pageCount <= 0) {
      return NextResponse.json({ error: "Unable to read PDF page count" }, { status: 400 });
    }
    if (pageCheck.data > pageCount) {
      return NextResponse.json({ error: "Page number out of range" }, { status: 400 });
    }

    // ARC-LIGHT Phase 2: route the preview through the same PdfRenderer that
    // feeds the OCR pipeline. This guarantees the audit dialog shows exactly
    // what the OCR stack saw, not a different (broken) rasterization.
    const renderer = createRenderer();
    const rendered = await renderer.renderPage(pdfBuffer, pageCheck.data, { dpi: 144 });

    return new NextResponse(new Uint8Array(rendered.pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(rendered.bytes),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error, "render document preview page");
  }
}
