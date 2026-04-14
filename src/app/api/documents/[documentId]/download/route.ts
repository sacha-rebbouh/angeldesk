import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { downloadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";

const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// GET /api/documents/[documentId]/download - Download/proxy a document file
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }

    // Fetch document with deal ownership info
    const document = await prisma.document.findFirst({
      where: { id: documentId },
      include: { deal: { select: { userId: true } } },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Verify the user owns the deal this document belongs to
    if (document.deal.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Resolve the URL to fetch from
    const fileUrl = document.storageUrl ?? document.storagePath;
    if (!fileUrl) {
      return NextResponse.json(
        { error: "Document file not available" },
        { status: 404 }
      );
    }

    // Download the file via the storage service (handles both Vercel Blob and local)
    const buffer = await downloadFile(fileUrl);

    // Determine content type
    const contentType = document.mimeType ?? "application/octet-stream";

    // Build a safe filename for Content-Disposition
    const filename = document.name.replace(/[^\w.\-() ]/g, "_");
    const disposition = request.nextUrl.searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error, "download document");
  }
}
