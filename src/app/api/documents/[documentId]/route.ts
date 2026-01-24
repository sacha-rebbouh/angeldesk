import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { deleteFile } from "@/services/storage";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// PATCH /api/documents/[documentId] - Rename a document
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Verify ownership through deal
    const document = await prisma.document.findFirst({
      where: { id: documentId },
      include: { deal: { select: { userId: true } } },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.deal.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { name: name.trim() },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Error renaming document:", error);
    return NextResponse.json({ error: "Failed to rename document" }, { status: 500 });
  }
}

// DELETE /api/documents/[documentId] - Delete a document
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Verify ownership through deal
    const document = await prisma.document.findFirst({
      where: { id: documentId },
      include: { deal: { select: { userId: true } } },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.deal.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete from storage
    if (document.storageUrl) {
      try {
        await deleteFile(document.storageUrl);
      } catch (storageError) {
        console.error("Error deleting from storage:", storageError);
        // Continue with DB deletion even if storage fails
      }
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
