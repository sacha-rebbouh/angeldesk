/**
 * Persistence layer for the temporal extractor (Phase 2).
 *
 * Maps each ExtractedTemporalSignal to the right scope key + extractionRunId
 * and calls createEvidenceSignal(). Returns counts of persisted vs deduplicated
 * vs skipped signals (idempotent on retry — see Codex round 4 P1 fix).
 *
 * Skipped reasons:
 *  - "extracted_text" signal with no extractionRunId → can't scope to a run
 *  - validation/encryption failures (rare; bubble up via thrown error)
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { createEvidenceSignal } from "@/services/evidence-signals/create-signal";
import type { ExtractedTemporalSignal } from "./temporal-extractor";

export interface PersistTemporalSignalsBase {
  dealId: string;
  documentId: string;
  documentVersion: number;
  /** Active extraction run ID. Required to persist text-derived signals. */
  extractionRunId: string | null;
  extractorVersion: string;
}

export interface PersistTemporalSignalsResult {
  persisted: number;
  deduplicated: number;
  skipped: number;
  /** Reasons keyed by signal index, only populated for skipped signals. */
  skippedReasons: Array<{ index: number; reason: string }>;
}

export async function persistTemporalSignals(
  prisma: PrismaClient | Prisma.TransactionClient,
  base: PersistTemporalSignalsBase,
  signals: ExtractedTemporalSignal[]
): Promise<PersistTemporalSignalsResult> {
  const result: PersistTemporalSignalsResult = {
    persisted: 0,
    deduplicated: 0,
    skipped: 0,
    skippedReasons: [],
  };

  for (let index = 0; index < signals.length; index += 1) {
    const sig = signals[index];

    let signalScopeKey: string;
    let extractionRunId: string | null;

    switch (sig.derivedFrom) {
      case "extracted_text": {
        if (!base.extractionRunId) {
          result.skipped += 1;
          result.skippedReasons.push({
            index,
            reason: "extracted_text signal requires extractionRunId; got null",
          });
          continue;
        }
        signalScopeKey = `run:${base.extractionRunId}`;
        extractionRunId = base.extractionRunId;
        break;
      }
      case "filename":
        signalScopeKey = "filename";
        extractionRunId = null;
        break;
      case "source_metadata":
        signalScopeKey = "source_metadata";
        extractionRunId = null;
        break;
    }

    const outcome = await createEvidenceSignal(prisma, {
      dealId: base.dealId,
      documentId: base.documentId,
      documentVersion: base.documentVersion,
      signalScopeKey,
      extractionRunId,
      extractorVersion: base.extractorVersion,
      sourceTextHash: sig.sourceTextHash,
      kind: sig.kind,
      valueJson: sig.valueJson,
      dateStart: sig.dateStart,
      dateEnd: sig.dateEnd,
      asOfDate: sig.asOfDate,
      reportedAt: sig.reportedAt,
      precision: sig.precision,
      confidence: sig.confidence,
      sourceMethod: sig.sourceMethod,
      evidenceText: sig.evidenceText,
      pageNumber: sig.pageNumber,
      sheetName: sig.sheetName,
      charOffset: sig.charOffset,
      metadata: sig.metadata,
    });

    if (outcome.deduplicated) {
      result.deduplicated += 1;
    } else {
      result.persisted += 1;
    }
  }

  return result;
}
