/**
 * Phase 3.1 — Idempotent entry-point to run the Evidence Engine for a
 * document that has a completed extraction run.
 *
 * Called from TWO places in the extraction pipeline (Codex round 9 P1 fix):
 *   1. Fresh-success path: right after completeDocumentExtractionRun commits.
 *   2. Terminal-success retry path: when Inngest re-enters and finds the run
 *      already READY/READY_WITH_WARNINGS/BLOCKED. Without this catch-up,
 *      a crash between extraction commit and the evidence block would mean
 *      no signal is ever written for that document.
 *
 * Idempotence is enforced down-stream:
 *   - createEvidenceSignal handles P2002 → return existing (round 4 P1)
 *   - promoteSourceDateFromSignals is no-op if sourceDate already set (round 9 P1)
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { safeDecrypt } from "@/lib/encryption";
import { linkEmailAttachments } from "./attachment-linker";
import { persistTemporalSignals } from "./persist-temporal-signals";
import { promoteSourceDateFromSignals } from "./promote-source-date";
import { runTemporalExtractor, TEMPORAL_EXTRACTOR_VERSION } from "./temporal-extractor";
import { runClaimsExtractor, CLAIMS_EXTRACTOR_VERSION } from "./claims-extractor";

export interface RunEvidenceForDocumentInput {
  documentId: string;
  /**
   * Optional plaintext override. The fresh-success path passes the
   * already-in-memory `extraction.text` (no need to re-read + decrypt).
   * The retry catch-up path leaves this undefined → the helper reads
   * Document.extractedText + safeDecrypt.
   */
  extractedTextPlaintext?: string | null;
  /**
   * Optional explicit extraction run id. When omitted, the helper looks up
   * the latest READY/READY_WITH_WARNINGS run for the document.
   */
  extractionRunId?: string | null;
}

export interface RunEvidenceForDocumentResult {
  status: "ran" | "skipped" | "failed";
  reason?: string;
  signalsPersisted?: number;
  signalsDeduplicated?: number;
  promoted?: boolean;
  /** Phase 4: attachment relations created (only for EMAIL docs). */
  attachmentsLinked?: number;
  /** Phase 6: financial / metric claims persisted. */
  claimsPersisted?: number;
  claimsDeduplicated?: number;
}

export async function runEvidenceForDocument(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: RunEvidenceForDocumentInput
): Promise<RunEvidenceForDocumentResult> {
  const doc = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      name: true,
      type: true,
      dealId: true,
      version: true,
      mimeType: true,
      sourceKind: true,
      sourceDate: true,
      sourceMetadata: true,
      extractedText: true,
      processingStatus: true,
    },
  });

  if (!doc) return { status: "skipped", reason: "document_not_found" };
  if (doc.processingStatus !== "COMPLETED") {
    return { status: "skipped", reason: `processing_status_${doc.processingStatus}` };
  }

  // Decide the plaintext we extract from. Caller-provided wins (fresh path
  // already has it in memory); otherwise decrypt the stored field.
  const text =
    input.extractedTextPlaintext !== undefined && input.extractedTextPlaintext !== null
      ? input.extractedTextPlaintext
      : doc.extractedText
        ? safeDecrypt(doc.extractedText)
        : null;

  if (!text || !text.trim()) {
    return { status: "skipped", reason: "no_extracted_text" };
  }

  // Resolve the extraction run id: either the explicit one passed by the
  // fresh-success path, or the latest successful run for the document.
  let extractionRunId: string | null = input.extractionRunId ?? null;
  if (!extractionRunId) {
    const latestRun = await prisma.documentExtractionRun.findFirst({
      where: {
        documentId: doc.id,
        status: { in: ["READY", "READY_WITH_WARNINGS", "BLOCKED"] },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    extractionRunId = latestRun?.id ?? null;
  }

  const sourceKind = (doc.sourceKind ?? "FILE") as "FILE" | "EMAIL" | "NOTE";

  const signals = runTemporalExtractor({
    documentName: doc.name,
    documentType: doc.type,
    mimeType: doc.mimeType,
    extractedText: text,
    sourceKind,
    sourceMetadata: doc.sourceMetadata,
    documentSourceDate: doc.sourceDate,
  });

  const persistResult = await persistTemporalSignals(
    prisma,
    {
      dealId: doc.dealId,
      documentId: doc.id,
      documentVersion: doc.version,
      extractionRunId,
      extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
    },
    signals
  );

  const promotion = await promoteSourceDateFromSignals(prisma, {
    documentId: doc.id,
    dealId: doc.dealId,
    documentType: doc.type,
    currentSourceDate: doc.sourceDate,
  });

  // Phase 4: attachment linking (EMAIL docs only).
  // The linker reads the email's extracted text + the deal's other docs and
  // emits ATTACHMENT_RELATION signals on matched CHILD docs (NOT on the email).
  let attachmentsLinked = 0;
  if (sourceKind === "EMAIL") {
    const linkResult = await linkEmailAttachments(prisma, {
      emailDocumentId: doc.id,
      emailDealId: doc.dealId,
      emailDocumentVersion: doc.version,
      emailExtractedText: text,
      emailSourceDate: doc.sourceDate,
    });
    attachmentsLinked = linkResult.matched;
  }

  // Phase 6: financial / metric claims. Conservative deterministic extractor.
  // Runs on every doc type; classification depends on docType + sourceKind
  // (EMAIL → claim, FINANCIAL_MODEL → forecast, FINANCIAL_STATEMENTS → actual).
  const claimSignals = runClaimsExtractor({
    documentName: doc.name,
    documentType: doc.type,
    extractedText: text,
    sourceKind,
  });
  const claimsPersistResult = await persistTemporalSignals(
    prisma,
    {
      dealId: doc.dealId,
      documentId: doc.id,
      documentVersion: doc.version,
      extractionRunId,
      extractorVersion: CLAIMS_EXTRACTOR_VERSION,
    },
    // Claims share the same persisted shape as temporal signals (derivedFrom,
    // valueJson, etc.) so persistTemporalSignals handles them.
    claimSignals
  );

  return {
    status: "ran",
    signalsPersisted: persistResult.persisted,
    signalsDeduplicated: persistResult.deduplicated,
    promoted: promotion.promoted,
    attachmentsLinked,
    claimsPersisted: claimsPersistResult.persisted,
    claimsDeduplicated: claimsPersistResult.deduplicated,
  };
}
