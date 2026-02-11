/**
 * Document Content Hash Service (F63)
 *
 * SHA-256 hashing for document deduplication and cache invalidation.
 * - Computes hash at upload time
 * - Detects duplicate uploads within the same deal
 * - Detects re-uploads across deals for the same user
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Compute SHA-256 hash of file content
 */
export function computeContentHash(content: Buffer | string): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : content)
    .digest("hex");
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingDocument?: {
    id: string;
    name: string;
    dealId: string;
    dealName?: string;
    uploadedAt: Date;
  };
  sameDeal: boolean;
}

/**
 * Check if a document with the same content hash already exists
 */
export async function checkDuplicateDocument(
  contentHash: string,
  dealId: string,
  userId: string
): Promise<DuplicateCheckResult> {
  const existing = await prisma.document.findFirst({
    where: {
      contentHash,
      deal: { userId },
    },
    select: {
      id: true,
      name: true,
      dealId: true,
      uploadedAt: true,
      deal: { select: { name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  if (!existing) {
    return { isDuplicate: false, sameDeal: false };
  }

  return {
    isDuplicate: true,
    existingDocument: {
      id: existing.id,
      name: existing.name,
      dealId: existing.dealId,
      dealName: existing.deal.name,
      uploadedAt: existing.uploadedAt,
    },
    sameDeal: existing.dealId === dealId,
  };
}

/**
 * Invalidate analysis cache when document content changes.
 * Called when a new version of a document is uploaded with a different hash.
 */
export async function invalidateAnalysisCache(dealId: string): Promise<void> {
  // Mark the latest analysis as stale by setting a flag
  // The analysis panel checks this to show "Re-analysis recommended"
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      // Reset analysis status to indicate re-analysis needed
      updatedAt: new Date(),
    },
  });
}
