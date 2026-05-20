import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { safeDecrypt } from "@/lib/encryption";
import { deleteFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";

// CUID validation schema
const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

/**
 * GET /api/documents/[documentId] — fetch one document.
 *
 * Optional `?includeText=1` decrypts and returns `extractedText`
 * (the raw OCR plaintext). This is a LEGITIMATE owner-only
 * plaintext surface — used by:
 *   - src/components/deals/document-preview-dialog.tsx (fallback
 *     when the file is not previewable inline);
 *   - src/components/deals/text-preview-dialog.tsx (text-only
 *     corpus pieces — emails, notes).
 * The same IDOR guard as every other read path protects it: the
 * document must belong to a deal owned by the caller. Without that
 * guard, an authenticated user could decrypt another tenant's OCR
 * by guessing document ids.
 *
 * B11.2 (Codex P2) — the IDOR guard is now a single composite
 * `findFirst` (`id + deal.userId`) returning **404 uniformly**
 * whether the doc doesn't exist OR is owned by someone else.
 * Anti-enumeration: a stranger can't distinguish "id valid but not
 * mine" (403) from "id never existed" (404) anymore.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      include: {
        corpusParentDocument: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const includeText = request.nextUrl.searchParams.get("includeText") === "1";
    const { storageUrl, storagePath, ...data } = document;
    if (includeText && data.extractedText) {
      data.extractedText = safeDecrypt(data.extractedText);
    } else {
      data.extractedText = null;
    }
    // Never leak the raw Blob URL or storage path to the client. Preview and
    // download go through the dedicated server-side routes that resolve the
    // URL themselves; surfacing it here would let a leaked deal-detail JSON
    // double as a signed-URL dump.
    return NextResponse.json({ data: { ...data, hasStorage: Boolean(storageUrl ?? storagePath) } });
  } catch (error) {
    return handleApiError(error, "fetch document");
  }
}

// PATCH /api/documents/[documentId] - Rename a document
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // B11.2 (Codex P2) — IDOR uniformised to 404. Composite find
    // (id + deal.userId) returns null whether the doc doesn't exist
    // OR is owned by someone else. Anti-enumeration on the rename
    // surface — a stranger can't probe doc ids by reading 403 vs 404.
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      include: {
        corpusParentDocument: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { name: name.trim() },
    });

    const { storageUrl, storagePath, ...safe } = updated;
    return NextResponse.json({
      data: { ...safe, hasStorage: Boolean(storageUrl ?? storagePath) },
    });
  } catch (error) {
    return handleApiError(error, "rename document");
  }
}

// DELETE /api/documents/[documentId] - Delete a document
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    // B11.2 (Codex P2) — IDOR uniformised to 404 (composite find).
    // Anti-enumeration on DELETE: a stranger probing doc ids gets
    // the same 404 whether the row exists in another tenant or
    // never existed.
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      include: {
        corpusParentDocument: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete from storage. Some legacy rows only carry `storagePath` (no
    // full URL — local dev / old uploads), so we fall back to it. Mirrors
    // the cascade in DELETE /api/deals/[dealId].
    const storageTarget = document.storageUrl ?? document.storagePath;
    if (storageTarget) {
      try {
        await deleteFile(storageTarget);
      } catch (storageError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error deleting from storage:", storageError);
        }
        // Continue with DB deletion even if storage fails
      }
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete document");
  }
}
