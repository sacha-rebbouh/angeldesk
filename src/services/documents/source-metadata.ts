import {
  Prisma,
  type DocumentSourceKind,
  type DocumentType,
  type PrismaClient,
} from "@prisma/client";

/**
 * Phase B6.1 fix-up (Codex P2) — atomic merge helper for
 * `Document.sourceMetadata`.
 *
 * Why this exists :
 *   The earlier B6.1 endpoint did `findUnique → patch → update` outside
 *   a transaction, so a concurrent writer (B6.2/B6.3 manual override,
 *   an evidence-engine `temporal` promotion, an email-source-inference
 *   refresh) could slip between the read and the write and lose its
 *   block when the second writer committed.
 *
 *   This helper wraps the read + write in a single Serializable
 *   transaction. Two interleaving patches will be detected by
 *   Postgres's MVCC checker — the second commit will fail with a
 *   serialization error, the helper retries, and the second writer's
 *   merge runs against the now-committed first writer's value. Final
 *   state: BOTH blocks preserved.
 *
 *   The helper is shared so B6.2 (type / sourceKind override) and B6.3
 *   (email metadata override) can reuse the same atomic primitive
 *   instead of each re-implementing the read-modify-write.
 */

const DEFAULT_MAX_RETRIES = 3;

export interface SourceMetadataPatchSnapshot {
  /** Document.sourceDate as it is in the DB at the start of the txn (post-lock). */
  sourceDate: Date | null;
  /**
   * Document.sourceMetadata as it is in the DB at the start of the txn.
   * Object literal when present, `null` if the column is null or a
   * non-object scalar / array (which the caller MUST treat as "no
   * existing manual context" to avoid blindly extending arrays/scalars).
   */
  sourceMetadata: Record<string, unknown> | null;
  /**
   * B6.2 — `Document.type` (enum) as seen at the start of the txn. The
   * patch fn uses this to record the `previousValue` in the manual
   * audit trail (`manual.documentType.previousValue`).
   */
  type: DocumentType;
  /**
   * B6.2 — `Document.sourceKind` (enum) as seen at the start of the
   * txn. Same audit-trail usage.
   */
  sourceKind: DocumentSourceKind;
  /**
   * B6.3 — email metadata snapshot, used for `previousValue` audit
   * trail on manual.receivedAt / manual.sourceAuthor /
   * manual.sourceSubject patches. All nullable in the schema; here
   * they're projected through as-is.
   */
  receivedAt: Date | null;
  sourceAuthor: string | null;
  sourceSubject: string | null;
}

export interface SourceMetadataPatchResult {
  /** The Document.sourceMetadata JSON to write. Always a plain object. */
  nextSourceMetadata: Record<string, unknown>;
  /**
   * The Document.sourceDate to write. Pass `undefined` to leave the
   * column unchanged (i.e. only mutate `sourceMetadata`). Pass `null`
   * to explicitly clear the column (caller's responsibility — most
   * surfaces will pass a Date).
   */
  nextSourceDate?: Date | null | undefined;
  /**
   * B6.2 → B6.3 — additional Document columns the caller wants to
   * write atomically with the sourceMetadata patch. Today this
   * carries `type`, `sourceKind` (B6.2), `receivedAt`, `sourceAuthor`,
   * `sourceSubject` (B6.3 — email metadata corrections). Future B6.x
   * can add more. The helper spreads these into the same Prisma
   * update so all writes commit together (or fail together — same
   * Serializable transaction).
   *
   * Constrained shape (NOT `Record<string, unknown>`) to keep the
   * helper's API resistant to accidental writes of unrelated columns
   * — e.g. `extractedText` or `processingStatus` MUST NOT be settable
   * through this surface.
   */
  additionalDocumentFields?: {
    type?: DocumentType;
    sourceKind?: DocumentSourceKind;
    // B6.3 — email-specific metadata. `null` clears the column;
    // `undefined` leaves it untouched. The route's Zod schema
    // distinguishes between "user explicitly cleared" (null) and
    // "user didn't touch" (undefined) — most surfaces will only
    // pass these when the user actually changed them.
    receivedAt?: Date | null;
    sourceAuthor?: string | null;
    sourceSubject?: string | null;
  };
}

export type SourceMetadataPatchFn = (
  snapshot: SourceMetadataPatchSnapshot
) => SourceMetadataPatchResult;

export class DocumentNotFoundForMetadataPatchError extends Error {
  constructor(documentId: string, dealId: string) {
    super(`Document ${documentId} (deal ${dealId}) not found for metadata patch`);
    this.name = "DocumentNotFoundForMetadataPatchError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Patch `Document.sourceMetadata` (and optionally `Document.sourceDate`)
 * atomically.
 *
 * The transaction is scoped to (`id`, `dealId`) so the helper is also
 * IDOR-redundant when the caller has already auth-checked — a bug that
 * passes a wrong dealId for a document that doesn't belong to it
 * surfaces as `DocumentNotFoundForMetadataPatchError`, not a silent
 * cross-tenant write.
 *
 * The patch function is invoked WITH the snapshot read inside the
 * transaction (NOT a snapshot from outside) so the user code can
 * inspect the canonical pre-merge state. Implementations should treat
 * the snapshot as immutable and return a NEW object — the helper does
 * not deep-clone.
 *
 * Retries on serialization failures (Postgres 40001 / 40P01) up to
 * `maxRetries` times. Beyond that the original error is rethrown so
 * the caller can surface it (e.g. as HTTP 503 — "try again").
 */
export async function patchDocumentSourceMetadataAtomic(
  prismaClient: PrismaClient,
  params: {
    documentId: string;
    dealId: string;
    patch: SourceMetadataPatchFn;
    maxRetries?: number;
  }
): Promise<{ sourceMetadata: Record<string, unknown>; sourceDate: Date | null }> {
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prismaClient.$transaction(
        async (tx) => {
          // Read inside the txn — Serializable isolation guarantees the
          // value we see is the version the eventual COMMIT will see,
          // OR the COMMIT fails with a serialization error and we retry.
          //
          // B6.2 — added `type` + `sourceKind` to the SELECT so the
          // patch fn can record the previousValue in the manual audit
          // trail (`manual.documentType.previousValue`,
          // `manual.sourceKind.previousValue`).
          const current = await tx.document.findUnique({
            where: { id: params.documentId },
            select: {
              id: true,
              dealId: true,
              sourceDate: true,
              sourceMetadata: true,
              type: true,
              sourceKind: true,
              // B6.3 — email metadata fields for the snapshot's
              // previousValue audit trail.
              receivedAt: true,
              sourceAuthor: true,
              sourceSubject: true,
            },
          });
          if (!current || current.dealId !== params.dealId) {
            throw new DocumentNotFoundForMetadataPatchError(params.documentId, params.dealId);
          }

          const snapshot: SourceMetadataPatchSnapshot = {
            sourceDate: current.sourceDate,
            sourceMetadata: isPlainObject(current.sourceMetadata)
              ? (current.sourceMetadata as Record<string, unknown>)
              : null,
            type: current.type,
            sourceKind: current.sourceKind,
            receivedAt: current.receivedAt,
            sourceAuthor: current.sourceAuthor,
            sourceSubject: current.sourceSubject,
          };

          const result = params.patch(snapshot);

          // Build the update payload. `nextSourceDate === undefined`
          // means "leave the column alone" (Prisma omits the field
          // automatically when it's absent from the data object).
          const data: Prisma.DocumentUpdateInput = {
            sourceMetadata: result.nextSourceMetadata as Prisma.InputJsonValue,
          };
          if (result.nextSourceDate !== undefined) {
            data.sourceDate = result.nextSourceDate;
          }
          // B6.2 → B6.3 — additional Document columns (type +
          // sourceKind from B6.2; receivedAt + sourceAuthor +
          // sourceSubject from B6.3). The shape is constrained by
          // the SourceMetadataPatchResult type so non-metadata
          // columns CAN NOT slip through. We thread each field
          // individually rather than spreading because Prisma's
          // DocumentUpdateInput tracks specific column types per
          // field, and a blanket spread would lose the type info.
          if (result.additionalDocumentFields) {
            const extra = result.additionalDocumentFields;
            if (extra.type !== undefined) data.type = extra.type;
            if (extra.sourceKind !== undefined) data.sourceKind = extra.sourceKind;
            if (extra.receivedAt !== undefined) data.receivedAt = extra.receivedAt;
            if (extra.sourceAuthor !== undefined) data.sourceAuthor = extra.sourceAuthor;
            if (extra.sourceSubject !== undefined) data.sourceSubject = extra.sourceSubject;
          }

          // updateMany WHERE id AND dealId — IDOR-redundant + lets us
          // detect a row vanishing between the read and the write
          // (returns count: 0 — DocumentNotFoundForMetadataPatchError
          // is rethrown).
          const updateResult = await tx.document.updateMany({
            where: { id: params.documentId, dealId: params.dealId },
            data,
          });
          if (updateResult.count === 0) {
            throw new DocumentNotFoundForMetadataPatchError(params.documentId, params.dealId);
          }

          return {
            sourceMetadata: result.nextSourceMetadata,
            sourceDate:
              result.nextSourceDate === undefined ? current.sourceDate : result.nextSourceDate,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      // Retry on Postgres serialization failures only — everything
      // else (including ownership / validation errors) bubbles up.
      if (isSerializationError(error) && attempt < maxRetries - 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  // Defensive: we should have either returned or thrown by now. If we
  // exit the loop without doing either, surface the last error so the
  // caller sees a real failure instead of `undefined`.
  throw lastError ?? new Error("patchDocumentSourceMetadataAtomic: exhausted retries without a captured error");
}

/**
 * Postgres serialization failure detector.
 *
 *   40001 = serialization_failure (Serializable transaction collision)
 *   40P01 = deadlock_detected (also retryable)
 *
 * Both are first-class retryable conditions for atomic patch loops.
 */
function isSerializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "40001" || code === "40P01") return true;
  // Prisma wraps the original PG error inside PrismaClientKnownRequestError
  // with code "P2034" for transaction conflicts.
  if (code === "P2034") return true;
  return false;
}
