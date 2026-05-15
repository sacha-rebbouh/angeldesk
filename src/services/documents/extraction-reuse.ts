import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  encryptJsonField,
  encryptText,
  tryDecryptJsonField,
  tryDecryptText,
} from "@/lib/encryption";
import { promoteDocumentVersionTx } from "@/services/documents/extraction-runs";
import type { ExtractionCreditEstimate, ExtractionWarning } from "@/services/pdf";

export type ReuseCompletedExtractionResult = {
  extractionQuality: number | null;
  extractionWarnings: ExtractionWarning[];
  requiresOCR: boolean;
  ocrProcessed: boolean;
  pagesOCRd: number;
  ocrCost: number;
  creditEstimate: ExtractionCreditEstimate | null;
  pageCount: number;
  pagesProcessed: number;
};

export async function reuseCompletedExtractionForContentHash(params: {
  targetDocumentId: string;
  targetDocumentVersion: number;
  contentHash: string;
  userId: string;
}): Promise<ReuseCompletedExtractionResult | null> {
  // Tenant isolation: only reuse extraction artifacts the current user already
  // owns. Matching a content hash from another tenant would leak the source
  // tenant's extracted text / OCR pages into this upload.
  const sourceDocument = await prisma.document.findFirst({
    where: {
      id: { not: params.targetDocumentId },
      contentHash: params.contentHash,
      processingStatus: "COMPLETED",
      extractedText: { not: null },
      deal: { userId: params.userId },
      extractionRuns: {
        some: {
          status: { in: ["READY", "READY_WITH_WARNINGS", "BLOCKED"] },
          pageCount: { gt: 0 },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
    include: {
      extractionRuns: {
        where: { status: { in: ["READY", "READY_WITH_WARNINGS", "BLOCKED"] } },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        take: 1,
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      },
    },
  });

  const sourceRun = sourceDocument?.extractionRuns[0];
  if (!sourceDocument?.extractedText || !sourceRun) return null;
  if (sourceRun.pageCount > 0 && sourceRun.pagesProcessed < sourceRun.pageCount) return null;

  const clonedRun = await prisma.$transaction(async (tx) => {
    const createdRun = await tx.documentExtractionRun.create({
      data: {
        documentId: params.targetDocumentId,
        documentVersion: params.targetDocumentVersion,
        status: sourceRun.status,
        pageCount: sourceRun.pageCount,
        pagesProcessed: sourceRun.pagesProcessed,
        pagesSucceeded: sourceRun.pagesSucceeded,
        pagesFailed: sourceRun.pagesFailed,
        pagesSkipped: sourceRun.pagesSkipped,
        coverageRatio: sourceRun.coverageRatio,
        qualityScore: sourceRun.qualityScore,
        readyForAnalysis: sourceRun.readyForAnalysis,
        blockedReason: sourceRun.blockedReason,
        extractionVersion: sourceRun.extractionVersion,
        pipelineVersion: sourceRun.pipelineVersion,
        contentHash: params.contentHash,
        corpusTextHash: sourceRun.corpusTextHash,
        summaryMetrics: mergeJsonObject(sourceRun.summaryMetrics, {
          reusedExtraction: true,
          reusedFromDocumentId: sourceDocument.id,
          reusedFromExtractionRunId: sourceRun.id,
        }),
        warnings: cloneJsonForPrisma(sourceRun.warnings),
        completedAt: sourceRun.completedAt ?? new Date(),
        pages: {
          // Phase 3.5(c): re-encrypt the artifact + textPreview for the
          // NEW target row. If we simply forwarded the source value, a
          // legacy plaintext source would land plaintext on disk again —
          // breaking the Phase 3 invariant "every new write is encrypted".
          // For an already-encrypted source, safeDecryptJsonField returns
          // the decrypted payload and we re-encrypt with a fresh IV, which
          // is also harmless.
          create: sourceRun.pages.map((page) => ({
            pageNumber: page.pageNumber,
            status: page.status,
            method: page.method,
            charCount: page.charCount,
            wordCount: page.wordCount,
            qualityScore: page.qualityScore,
            confidence: page.confidence,
            hasTables: page.hasTables,
            hasCharts: page.hasCharts,
            hasFinancialKeywords: page.hasFinancialKeywords,
            hasTeamKeywords: page.hasTeamKeywords,
            hasMarketKeywords: page.hasMarketKeywords,
            requiresOCR: page.requiresOCR,
            ocrProcessed: page.ocrProcessed,
            contentHash: page.contentHash,
            artifactVersion: page.artifactVersion,
            artifact: reEncryptArtifactForReuse(page.artifact),
            pageImageHash: page.pageImageHash,
            errorMessage: page.errorMessage,
            textPreview: reEncryptTextPreviewForReuse(page.textPreview),
          })),
        },
      },
    });

    await tx.document.update({
      where: { id: params.targetDocumentId },
      data: {
        extractedText: sourceDocument.extractedText,
        processingStatus: "COMPLETED",
        extractionQuality: sourceDocument.extractionQuality,
        extractionMetrics: buildReusedExtractionMetrics(sourceDocument.extractionMetrics, {
          latestExtractionRunId: createdRun.id,
          reusedExtraction: true,
          reusedFromDocumentId: sourceDocument.id,
          reusedFromExtractionRunId: sourceRun.id,
        }),
        extractionWarnings: cloneJsonForPrisma(sourceDocument.extractionWarnings),
        requiresOCR: sourceDocument.requiresOCR,
        ocrProcessed: sourceDocument.ocrProcessed,
      },
    });

    // Phase 4.3: a reused extraction finalizes the target document COMPLETED
    // immediately — so the candidate-version promotion happens here, in the
    // SAME transaction as the COMPLETED write. A re-uploaded document whose
    // content matches a cached extraction becomes `isLatest` atomically;
    // there is no PROCESSING window for this path.
    await promoteDocumentVersionTx(tx, params.targetDocumentId);

    return createdRun;
  });

  const metrics = asJsonRecord(sourceDocument.extractionMetrics);
  return {
    extractionQuality: sourceDocument.extractionQuality,
    extractionWarnings: Array.isArray(sourceDocument.extractionWarnings)
      ? sourceDocument.extractionWarnings as unknown as ExtractionWarning[]
      : [],
    requiresOCR: sourceDocument.requiresOCR,
    ocrProcessed: sourceDocument.ocrProcessed,
    pagesOCRd: getMetricNumber(metrics, "pagesOCRd"),
    ocrCost: getMetricNumber(metrics, "ocrCost"),
    creditEstimate: getCreditEstimate(metrics),
    pageCount: clonedRun.pageCount,
    pagesProcessed: clonedRun.pagesProcessed,
  };
}

function cloneJsonForPrisma(
  value: Prisma.JsonValue | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asJsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function mergeJsonObject(
  value: Prisma.JsonValue | null | undefined,
  extra: Record<string, unknown>
): Prisma.InputJsonObject {
  return {
    ...asJsonRecord(value),
    ...extra,
  } as Prisma.InputJsonObject;
}

function buildReusedExtractionMetrics(
  value: Prisma.JsonValue | null | undefined,
  extra: Record<string, unknown>
): Prisma.InputJsonObject {
  const metrics = asJsonRecord(value);
  const sourceCreditsCharged = metrics.extractionCreditsCharged;
  if (sourceCreditsCharged !== undefined) {
    metrics.reusedSourceExtractionCreditsCharged = sourceCreditsCharged;
  }
  metrics.extractionCreditsCharged = 0;
  return {
    ...metrics,
    ...extra,
  } as Prisma.InputJsonObject;
}

function getMetricNumber(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getCreditEstimate(metrics: Record<string, unknown>): ExtractionCreditEstimate | null {
  const value = metrics.creditEstimate;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ExtractionCreditEstimate;
}

// Phase 3.5(c): re-encrypt artifact / textPreview when cloning a page from a
// reused extraction run. Source may be legacy plaintext or a Phase-3 envelope;
// the target row must always end up encrypted on disk.
//
// Phase 3.5(d): a corrupted envelope on the source must abort the clone. We
// MUST NOT silently downgrade an unreadable envelope to `Prisma.DbNull`,
// because that would let the reuse pipeline "clean" tampered or
// key-rotation-stranded rows into NULL artifacts on the target — losing
// auditability and masking the underlying integrity failure.
class CorruptedSourceArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorruptedSourceArtifactError";
  }
}

function reEncryptArtifactForReuse(stored: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const result = tryDecryptJsonField(stored);
  switch (result.kind) {
    case "absent":
      return Prisma.DbNull;
    case "corrupted":
      throw new CorruptedSourceArtifactError(
        `extraction-reuse: source page artifact has an undecryptable envelope (${result.reason}). Refusing to clone — re-extract the source document.`
      );
    case "plaintext":
    case "decrypted": {
      const envelope = encryptJsonField(result.value);
      return envelope === null ? Prisma.DbNull : (envelope as unknown as Prisma.InputJsonValue);
    }
  }
}

function reEncryptTextPreviewForReuse(stored: string | null): string | null {
  if (stored === null || stored === undefined) return null;
  // `tryDecryptText` distinguishes the three cases we care about:
  //   - plaintext  → legacy row, encrypt as-is.
  //   - decrypted  → Phase-3 row, decrypt then re-encrypt with a fresh IV.
  //   - corrupted  → ciphertext-looking but does not decrypt. We MUST NOT
  //     fall back to encrypting the input verbatim (that would propagate
  //     the corrupt ciphertext into a brand new row as if it were
  //     plaintext). Throw so the transaction rolls back.
  // The previous implementation used `safeDecrypt` which silently swallows
  // the AES auth-tag error and returns the input — defeating the fail-
  // closed guarantee. Codex Phase 3.5(e) repro caught this.
  const result = tryDecryptText(stored);
  switch (result.kind) {
    case "corrupted":
      throw new CorruptedSourceArtifactError(
        `extraction-reuse: source page textPreview has an undecryptable envelope (${result.reason}). Refusing to clone.`
      );
    case "plaintext":
    case "decrypted":
      return encryptText(result.value);
  }
}
