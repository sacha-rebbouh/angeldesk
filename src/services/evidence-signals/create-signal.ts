import { Prisma } from "@prisma/client";
import type {
  EvidenceSignal,
  EvidenceSignalConfidence,
  EvidenceSignalKind,
  EvidenceSignalMethod,
  EvidenceSignalPrecision,
  PrismaClient,
} from "@prisma/client";
import { encryptJsonField, encryptText } from "@/lib/encryption";
import { evidenceSignalMetadataSchema, type EvidenceSignalMetadata } from "./metadata-schema";
import { computeSignalHash } from "./signal-hash";

export interface CreateEvidenceSignalInput {
  dealId: string;
  documentId: string;
  documentVersion: number;
  signalScopeKey: string;
  extractionRunId?: string | null;
  extractorVersion: string;
  sourceTextHash?: string | null;

  kind: EvidenceSignalKind;
  valueJson: unknown;

  dateStart?: Date | null;
  dateEnd?: Date | null;
  asOfDate?: Date | null;
  reportedAt?: Date | null;

  precision?: EvidenceSignalPrecision;
  confidence: EvidenceSignalConfidence;
  sourceMethod: EvidenceSignalMethod;

  evidenceText?: string | null;
  pageNumber?: number | null;
  sheetName?: string | null;
  charOffset?: number | null;

  metadata?: EvidenceSignalMetadata | null;
}

export type CreateEvidenceSignalResult = {
  signal: EvidenceSignal;
  /** True if the row already existed and we returned it instead of inserting. */
  deduplicated: boolean;
};

// Producer scopes (Codex round 2 P1 + round 7 P2):
//   "run:<extractionRunId>"  signals derived from a specific extraction run
//   "filename"               signals derived from Document.name only
//   "source_metadata"        signals mirrored from Document.sourceMetadata
//                            (e.g. EMAIL_SENT_AT from email inference)
//   "human:<overrideId>"     signals from a manual user override
//   "import:<batchId>"       signals from a backfill/import batch
const SCOPE_KEY_PATTERN = /^(run:c[a-z0-9]{20,32}|filename|source_metadata|human:c[a-z0-9]{20,32}|import:[a-zA-Z0-9_-]{1,64})$/;

export function validateSignalScopeKey(key: string, extractionRunId: string | null | undefined): void {
  if (!SCOPE_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid signalScopeKey "${key}". Expected: "run:<id>" | "filename" | "human:<id>" | "import:<batch>".`);
  }
  if (key.startsWith("run:")) {
    const runIdInKey = key.slice("run:".length);
    if (!extractionRunId) {
      throw new Error(`signalScopeKey="${key}" requires extractionRunId to be set.`);
    }
    if (extractionRunId !== runIdInKey) {
      throw new Error(`signalScopeKey="${key}" must match extractionRunId="${extractionRunId}".`);
    }
  } else if (extractionRunId) {
    throw new Error(`signalScopeKey="${key}" must not have extractionRunId set (got "${extractionRunId}").`);
  }
}

/**
 * Idempotent write path. Re-running with the same payload (same scope, same
 * extractor version, same content) returns the existing row instead of throwing.
 *
 * Codex round 4 P1 fix: P2002 on the unique tuple is now treated as "this
 * signal already exists, return it" — required for safe Phase 2 extractor
 * retries (Inngest, backfill, re-extraction).
 */
export async function createEvidenceSignal(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: CreateEvidenceSignalInput
): Promise<CreateEvidenceSignalResult> {
  validateSignalScopeKey(input.signalScopeKey, input.extractionRunId);

  if (input.metadata !== undefined && input.metadata !== null) {
    evidenceSignalMetadataSchema.parse(input.metadata);
  }

  const signalHash = computeSignalHash({
    extractorVersion: input.extractorVersion,
    kind: input.kind,
    valueJson: input.valueJson,
    evidenceText: input.evidenceText ?? null,
    pageNumber: input.pageNumber ?? null,
    sheetName: input.sheetName ?? null,
    charOffset: input.charOffset ?? null,
  });

  const encryptedValueJson = encryptJsonField(input.valueJson);
  if (!encryptedValueJson) {
    throw new Error("Failed to encrypt valueJson (encryptJsonField returned null).");
  }

  const encryptedEvidenceText = input.evidenceText ? encryptText(input.evidenceText) : null;

  try {
    const signal = await prisma.evidenceSignal.create({
      data: {
        dealId: input.dealId,
        documentId: input.documentId,
        documentVersion: input.documentVersion,
        signalScopeKey: input.signalScopeKey,
        extractionRunId: input.extractionRunId ?? null,
        extractorVersion: input.extractorVersion,
        sourceTextHash: input.sourceTextHash ?? null,
        kind: input.kind,
        valueJson: encryptedValueJson as unknown as Prisma.InputJsonValue,
        dateStart: input.dateStart ?? null,
        dateEnd: input.dateEnd ?? null,
        asOfDate: input.asOfDate ?? null,
        reportedAt: input.reportedAt ?? null,
        precision: input.precision ?? "UNKNOWN",
        confidence: input.confidence,
        sourceMethod: input.sourceMethod,
        evidenceText: encryptedEvidenceText,
        pageNumber: input.pageNumber ?? null,
        sheetName: input.sheetName ?? null,
        charOffset: input.charOffset ?? null,
        signalHash,
        metadata: input.metadata == null
          ? Prisma.JsonNull
          : (input.metadata as unknown as Prisma.InputJsonValue),
      },
    });
    return { signal, deduplicated: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.evidenceSignal.findUnique({
        where: {
          documentId_documentVersion_signalScopeKey_kind_signalHash: {
            documentId: input.documentId,
            documentVersion: input.documentVersion,
            signalScopeKey: input.signalScopeKey,
            kind: input.kind,
            signalHash,
          },
        },
      });
      if (existing) return { signal: existing, deduplicated: true };
      // The unique violation came from a different constraint (rare): re-throw.
      throw error;
    }
    throw error;
  }
}
