import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/services/storage";

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
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(pdfBuffer, { scale: 2 });

    if (pageCheck.data > doc.length) {
      return NextResponse.json({ error: "Page number out of range" }, { status: 400 });
    }

    const imageBuffer = await doc.getPage(pageCheck.data);

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(imageBuffer.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error, "render document preview page");
  }
}
