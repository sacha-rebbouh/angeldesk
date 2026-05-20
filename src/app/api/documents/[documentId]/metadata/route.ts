import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DocumentSourceKind, DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  DocumentNotFoundForMetadataPatchError,
  patchDocumentSourceMetadataAtomic,
} from "@/services/documents/source-metadata";
import { runEvidenceForDocument } from "@/services/evidence";
import { getRunningAnalysisForDeal, isPendingThesisReview } from "@/services/analysis/guards";
import { tryDecryptJsonField } from "@/lib/encryption";

/**
 * Phase B6.x — manual metadata editor.
 *
 *   B6.1 (sourceDate) — landed first.
 *   B6.2 (type / sourceKind) — landed here, same endpoint, additive.
 *   B6.3 (email metadata) — will land via the same endpoint later.
 *
 * Why a dedicated endpoint (vs extending the rename PATCH on the
 * parent route) :
 *   - clear separation of "user-overridable metadata" from "name" so
 *     future B6 surfaces grow here without overloading the rename
 *     contract;
 *   - lets us trace each manual mutation in `sourceMetadata.manual`
 *     (audit trail per field) — the trace is the proof of the
 *     "non-écrasable par extractor" guarantee;
 *   - keeps the endpoint surface minimal so IDOR / shape audits stay
 *     scoped and easy.
 */
interface RouteParams {
  params: Promise<{ documentId: string }>;
}

const cuidSchema = z.string().cuid();

/**
 * Body schema. Each field is optional independently — the user may
 * change one, two, or three at the same time. We refuse an EMPTY
 * body (no field provided) because that's a client bug, not a
 * legitimate no-op.
 *
 * B6.2 — `type` and `sourceKind` are enum-validated via the live
 * Prisma enums (NOT free-string). A typo or an injection attempt is
 * rejected by Zod before the helper opens its transaction.
 */
const bodySchema = z.object({
  sourceDate: z
    .string()
    .min(1, "sourceDate cannot be empty")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "sourceDate must be a parseable ISO 8601 date",
    })
    .optional(),
  // B6.2 — DocumentType enum (PITCH_DECK | FINANCIAL_MODEL | ...). Zod
  // takes a tuple of literals; we derive it from the Prisma enum so
  // adding a new DocumentType in schema.prisma surfaces here as a
  // TypeScript error (caught at build time, not runtime).
  type: z.nativeEnum(DocumentType).optional(),
  // B6.2 — DocumentSourceKind enum (FILE | EMAIL | NOTE). Same
  // contract.
  sourceKind: z.nativeEnum(DocumentSourceKind).optional(),
  // B6.3 — email-specific metadata corrections. `receivedAt` is an
  // ISO 8601 string or explicit null to clear; `sourceAuthor` /
  // `sourceSubject` are trimmed strings or explicit null. `undefined`
  // (field absent) means "don't touch".
  receivedAt: z
    .union([
      z
        .string()
        .min(1, "receivedAt cannot be empty")
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: "receivedAt must be a parseable ISO 8601 date",
        }),
      z.null(),
    ])
    .optional(),
  sourceAuthor: z
    .union([
      z.string().max(500, "sourceAuthor must be ≤500 characters"),
      z.null(),
    ])
    .optional(),
  sourceSubject: z
    .union([
      z.string().max(500, "sourceSubject must be ≤500 characters"),
      z.null(),
    ])
    .optional(),
});

// PATCH /api/documents/[documentId]/metadata — user-driven metadata override.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();

    // B11.2 (Codex P2) — rate limit. PATCH metadata can trigger an
    // Evidence recompute (Serializable txn). Without throttling a
    // single user can chain hundreds of recomputes and pin the DB.
    // 30/min mirrors evidence-health/resolutions and the alert
    // resolutions route.
    const rateLimit = await checkRateLimitDistributed(`metadata-patch:${user.id}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const { documentId } = await params;

    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    const rawBody = await request.json().catch(() => null);
    if (rawBody === null || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // B6.1 → B6.3 — at least one field must be provided. Empty PATCH
    // is a client bug; returning 400 surfaces it instead of silently
    // no-op'ing.
    const hasAtLeastOneField =
      parsed.data.sourceDate !== undefined ||
      parsed.data.type !== undefined ||
      parsed.data.sourceKind !== undefined ||
      parsed.data.receivedAt !== undefined ||
      parsed.data.sourceAuthor !== undefined ||
      parsed.data.sourceSubject !== undefined;
    if (!hasAtLeastOneField) {
      return NextResponse.json(
        {
          error:
            "At least one metadata field is required (sourceDate, type, sourceKind, receivedAt, sourceAuthor, or sourceSubject)",
        },
        { status: 400 }
      );
    }

    // Ownership check OUTSIDE the patch transaction — auth is cheap and
    // we want a fast 404 before we open a Serializable txn that
    // would just throw anyway. The patch helper re-verifies (id, dealId)
    // inside the txn, so a concurrent ownership transfer between this
    // read and the helper's read still terminates cleanly.
    //
    // B6.2.1 (Codex P1) — we also need the pre-patch type + sourceKind
    // + processingStatus so we can decide whether to trigger an
    // Evidence recompute after the patch. The recompute fires only
    // when type or sourceKind actually changed AND the doc is
    // COMPLETED (no point recomputing on a doc that hasn't been
    // extracted yet — the next extraction will re-run evidence
    // naturally).
    //
    // B11.2 (Codex P2) — composite ownership find returning 404
    // uniformly. Anti-enumeration: no more 403 vs 404 disclosure on
    // doc id probing.
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        dealId: true,
        type: true,
        sourceKind: true,
        // B6.3 — sourceDate needed for the recompute trigger
        // (sourceDate change on EMAIL doc → cleanup + recompute).
        sourceDate: true,
        processingStatus: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // B11.2 (Codex P2) — analysis-running gate. Convention across the
    // corpus-mutation surface (upload, text, ocr, process, retry):
    // refuse mutations while an analysis is in flight on the same
    // deal, since the analyzer snapshots Document.{type, sourceKind,
    // sourceDate} + the EvidenceSignal rows. A metadata PATCH that
    // races the snapshot could land the analysis on
    // pre-vs-post-PATCH inconsistent state. 409 + reason mirrors
    // the other surfaces' contract.
    const runningAnalysis = await getRunningAnalysisForDeal(document.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: isPendingThesisReview(runningAnalysis)
            ? "Une revue de thèse est en attente. Finalisez-la avant de corriger les métadonnées du document."
            : "Une analyse est en cours sur ce deal. Finalisez-la avant de corriger les métadonnées du document.",
          reason: "analysis_running",
          analysisId: runningAnalysis.id,
        },
        { status: 409 }
      );
    }

    const nextSourceDate =
      parsed.data.sourceDate !== undefined ? new Date(parsed.data.sourceDate) : undefined;
    // B6.3 — receivedAt parsing. `null` keeps null (explicit clear);
    // an ISO string parses to Date; `undefined` means untouched.
    const nextReceivedAt =
      parsed.data.receivedAt === undefined
        ? undefined
        : parsed.data.receivedAt === null
          ? null
          : new Date(parsed.data.receivedAt);
    // B6.3 — text fields: trim. Zod already validated the type +
    // length cap; empty string would be a legitimate "clear" but
    // we treat empty-after-trim as null for consistency (the user
    // who wants to clear should send null explicitly).
    const nextSourceAuthor =
      parsed.data.sourceAuthor === undefined
        ? undefined
        : parsed.data.sourceAuthor === null
          ? null
          : parsed.data.sourceAuthor.trim() === ""
            ? null
            : parsed.data.sourceAuthor.trim();
    const nextSourceSubject =
      parsed.data.sourceSubject === undefined
        ? undefined
        : parsed.data.sourceSubject === null
          ? null
          : parsed.data.sourceSubject.trim() === ""
            ? null
            : parsed.data.sourceSubject.trim();

    try {
      // B6.1 fix-up (Codex P2) — atomic patch. The helper opens a
      // Serializable transaction, reads sourceMetadata + sourceDate
      // (+ type + sourceKind for the snapshot's audit trail) INSIDE
      // the txn, runs our merge function, and writes back — all under
      // the txn's isolation guarantee. A concurrent backfill writing
      // to `temporal` will be ordered before or after us; the MVCC
      // checker rejects interleavings and the helper retries.
      //
      // B6.2 — the patch fn now also writes `type` and `sourceKind`
      // on Document (NOT only sourceMetadata.manual). The atomic
      // helper accepts arbitrary fields via the extended return shape
      // (see source-metadata.ts).
      await patchDocumentSourceMetadataAtomic(prisma, {
        documentId,
        dealId: document.dealId,
        patch: (snapshot) => {
          const existingMeta = snapshot.sourceMetadata ?? {};
          const existingManual = isPlainObject(existingMeta.manual)
            ? (existingMeta.manual as Record<string, unknown>)
            : {};

          // Build the next manual block — additive merge, each
          // sub-key independent. Existing siblings (B6.1 sourceDate,
          // future B6.3 email) MUST survive.
          const nextManual: Record<string, unknown> = { ...existingManual };
          const nowIso = new Date().toISOString();

          if (nextSourceDate !== undefined) {
            const previousSourceDate = snapshot.sourceDate
              ? snapshot.sourceDate.toISOString()
              : null;
            nextManual.sourceDate = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: previousSourceDate,
              newValue: nextSourceDate.toISOString(),
            };
          }
          if (parsed.data.type !== undefined) {
            nextManual.documentType = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: snapshot.type ?? null,
              newValue: parsed.data.type,
            };
          }
          if (parsed.data.sourceKind !== undefined) {
            nextManual.sourceKind = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: snapshot.sourceKind ?? null,
              newValue: parsed.data.sourceKind,
            };
          }
          // B6.3 — email metadata audit blocks. Each emits a manual.*
          // entry with previousValue/newValue so the trace surface
          // can show "X overrode receivedAt from auto-detected Y to Z".
          if (nextReceivedAt !== undefined) {
            nextManual.receivedAt = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: snapshot.receivedAt ? snapshot.receivedAt.toISOString() : null,
              newValue: nextReceivedAt ? nextReceivedAt.toISOString() : null,
            };
          }
          if (nextSourceAuthor !== undefined) {
            nextManual.sourceAuthor = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: snapshot.sourceAuthor ?? null,
              newValue: nextSourceAuthor,
            };
          }
          if (nextSourceSubject !== undefined) {
            nextManual.sourceSubject = {
              setBy: user.id,
              setAt: nowIso,
              previousValue: snapshot.sourceSubject ?? null,
              newValue: nextSourceSubject,
            };
          }

          const patchedMeta: Record<string, unknown> = {
            ...existingMeta,
            manual: nextManual,
          };

          // Build the additional Document column writes. B6.2: type +
          // sourceKind. B6.3: receivedAt + sourceAuthor + sourceSubject.
          // The helper's typed shape enforces the closed set — non-
          // metadata columns (extractedText, processingStatus, etc.)
          // cannot slip through.
          const additionalDocumentFields: {
            type?: DocumentType;
            sourceKind?: DocumentSourceKind;
            receivedAt?: Date | null;
            sourceAuthor?: string | null;
            sourceSubject?: string | null;
          } = {};
          if (parsed.data.type !== undefined) {
            additionalDocumentFields.type = parsed.data.type;
          }
          if (parsed.data.sourceKind !== undefined) {
            additionalDocumentFields.sourceKind = parsed.data.sourceKind;
          }
          if (nextReceivedAt !== undefined) {
            additionalDocumentFields.receivedAt = nextReceivedAt;
          }
          if (nextSourceAuthor !== undefined) {
            additionalDocumentFields.sourceAuthor = nextSourceAuthor;
          }
          if (nextSourceSubject !== undefined) {
            additionalDocumentFields.sourceSubject = nextSourceSubject;
          }

          return {
            nextSourceMetadata: patchedMeta,
            nextSourceDate,
            additionalDocumentFields:
              Object.keys(additionalDocumentFields).length > 0
                ? additionalDocumentFields
                : undefined,
          };
        },
      });
    } catch (error) {
      if (error instanceof DocumentNotFoundForMetadataPatchError) {
        // Row vanished between the auth check and the patch txn
        // (delete race). Surface as 404 — same UX as the original
        // "document not found" path.
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      throw error;
    }

    // B6.2.1 (Codex P1) → B6.2.2 fix-up — Evidence recompute on
    // type/sourceKind change, made atomic + ATTACHMENT_RELATION-aware.
    //
    // Why this is non-trivial:
    //   - Extractors in `runEvidenceForDocument` depend on doc.type
    //     and doc.sourceKind (claims-extractor branches on type for
    //     forecast/actual; attachment-linker only fires when
    //     sourceKind=EMAIL). Without a recompute, OTHER →
    //     FINANCIAL_MODEL would never produce forecast signals, and
    //     FILE → EMAIL would never run attachment-linker.
    //   - ATTACHMENT_RELATION signals on a doc are emitted by the
    //     EMAIL's linker run (attachment-linker.ts:284) and stored on
    //     the CHILD doc. They are NOT regenerable by
    //     runEvidenceForDocument(child) because the linker is
    //     EMAIL-gated. Wiping them on a child-type change would lose
    //     the email provenance permanently.
    //   - The previous round (B6.2.1) did `deleteMany + recompute`
    //     OUTSIDE any transaction. If recompute failed, signals were
    //     gone until manual backfill (signal vacuum). Codex P1.
    //
    // Strategy (B6.2.2):
    //   1. Scope the delete to DOC-OWNED kinds only — everything
    //      EXCEPT ATTACHMENT_RELATION. Inbound relations from emails
    //      survive untouched.
    //   2. If sourceKind transitions AWAY from EMAIL (this doc was
    //      an email, now isn't), ALSO delete OUTBOUND relations on
    //      OTHER docs where valueJson.emailDocId === this doc id.
    //      The doc is no longer claiming to be an email, so its
    //      attachments shouldn't claim it either.
    //   3. Wrap delete + recompute in a Serializable $transaction.
    //      If runEvidenceForDocument throws OR returns status:'failed',
    //      throw to force a rollback — old signals are preserved
    //      and the user's metadata PATCH (already committed by the
    //      helper) stays. No signal vacuum.
    //   4. Outer catch is non-fatal for the PATCH: the metadata
    //      change is the user's authoritative action. A failed
    //      recompute logs loudly; the user sees 200 + stale
    //      Evidence Health (resolvable by re-triggering).
    const typeChanged =
      parsed.data.type !== undefined && parsed.data.type !== document.type;
    const sourceKindChanged =
      parsed.data.sourceKind !== undefined &&
      parsed.data.sourceKind !== document.sourceKind;
    // B6.3 — sourceDate change on a doc that IS or WAS an EMAIL also
    // forces a recompute, because attachment-linker outputs include
    // `reportedAt: input.emailSourceDate` AND `valueJson.emailSourceDate`.
    // If the user corrects the email's sent date, the existing
    // ATTACHMENT_RELATION signals on the child docs have STALE
    // reportedAt. We need to clean them up and re-run the linker.
    //
    // We trigger on (was EMAIL) OR (will be EMAIL) because both cases
    // touch attachment-linker output: a doc that WAS an email had
    // outbound relations whose emailSourceDate is now wrong; a doc
    // that BECOMES an email needs the linker to fire with the new
    // sourceDate.
    const sourceDateChanged =
      nextSourceDate !== undefined &&
      (document.sourceKind === "EMAIL" || parsed.data.sourceKind === "EMAIL") &&
      document.sourceDate?.getTime() !== nextSourceDate.getTime();
    const shouldRecomputeEvidence =
      (typeChanged || sourceKindChanged || sourceDateChanged) &&
      document.processingStatus === "COMPLETED";
    // B6.3 — outbound cleanup is needed whenever the doc was an EMAIL
    // AND the cause is either (a) transition away from EMAIL (B6.2.2)
    // or (b) sourceDate change while still EMAIL (NEW B6.3 — the
    // outbound relations have stale reportedAt).
    const wasEmail = document.sourceKind === "EMAIL";
    const transitionedAwayFromEmail =
      sourceKindChanged && wasEmail && parsed.data.sourceKind !== "EMAIL";
    const needsOutboundCleanup =
      wasEmail && (transitionedAwayFromEmail || sourceDateChanged);

    if (shouldRecomputeEvidence) {
      try {
        await prisma.$transaction(
          async (tx) => {
            // Step 1: delete doc-owned signals only. Inbound
            // ATTACHMENT_RELATION is preserved — those are emitted
            // by the email's linker on the child and cannot be
            // re-created by the child's own runEvidenceForDocument.
            await tx.evidenceSignal.deleteMany({
              where: {
                documentId,
                dealId: document.dealId,
                kind: { not: "ATTACHMENT_RELATION" },
              },
            });

            // Step 2: outbound ATTACHMENT_RELATION cleanup. Fires in
            // two cases (B6.3 generalisation of B6.2.2's
            // transitionedAwayFromEmail):
            //   (a) EMAIL → non-EMAIL transition: the doc is no
            //       longer an email, so its outbound relations on
            //       child docs are stale provenance.
            //   (b) sourceDate changed on a doc that WAS an EMAIL:
            //       the outbound relations have
            //       reportedAt + valueJson.emailSourceDate frozen at
            //       the OLD sourceDate. runEvidenceForDocument below
            //       will re-fire attachment-linker which produces
            //       NEW signals with the new emailSourceDate — but
            //       persistTemporalSignals dedups by signalHash
            //       (which includes the encrypted valueJson, so it
            //       differs), meaning the OLD signals would survive
            //       alongside the NEW ones. Wipe first.
            //
            // B6.2.3 fix-up (Codex P1) — `valueJson` is ENCRYPTED at
            // write time (see services/evidence-signals/create-signal.ts:
            // `encryptJsonField(input.valueJson)`). A Prisma JSON path
            // query like `valueJson: { path: ["emailDocId"], equals: X }`
            // would query the encrypted envelope (`{ alg, data }`),
            // never the plaintext, and would silently match nothing.
            //
            // Correct strategy: fetch the deal's ATTACHMENT_RELATION
            // signals (id + encrypted valueJson) inside this txn,
            // decrypt in-app, collect ids where the decrypted
            // `emailDocId` matches this document, and deleteMany by
            // id. All inside the same Serializable txn so MVCC still
            // catches concurrent writers.
            //
            // Scope: dealId only (IDOR-safe). We do NOT scope by
            // documentId because the SIGNAL lives on the CHILD, not
            // on the email.
            //
            // Defensive: corrupted / absent envelopes are skipped
            // with a log — we don't want a single bad signal to
            // block the cleanup of the rest.
            if (needsOutboundCleanup) {
              const candidates = await tx.evidenceSignal.findMany({
                where: {
                  dealId: document.dealId,
                  kind: "ATTACHMENT_RELATION",
                },
                select: { id: true, valueJson: true },
              });
              const orphanIds: string[] = [];
              for (const candidate of candidates) {
                const decrypted = tryDecryptJsonField<{
                  emailDocId?: string;
                }>(candidate.valueJson);
                if (decrypted.kind === "corrupted") {
                  console.warn(
                    "[metadata-editor] skipping corrupted ATTACHMENT_RELATION envelope during cleanup",
                    {
                      signalId: candidate.id,
                      dealId: document.dealId,
                      reason: decrypted.reason,
                    }
                  );
                  continue;
                }
                if (decrypted.kind === "absent") continue;
                if (decrypted.value?.emailDocId === documentId) {
                  orphanIds.push(candidate.id);
                }
              }
              if (orphanIds.length > 0) {
                await tx.evidenceSignal.deleteMany({
                  where: {
                    id: { in: orphanIds },
                    // dealId-scoped redundancy (defense in depth — the
                    // candidate query already filtered by dealId, but
                    // a future bug in the in-app filter shouldn't
                    // let a cross-tenant id slip through).
                    dealId: document.dealId,
                  },
                });
              }
            }

            // Step 3: recompute. runEvidenceForDocument accepts a
            // TransactionClient — same txn, same isolation.
            const evidenceResult = await runEvidenceForDocument(tx, {
              documentId,
            });
            // B6.3.1 (Codex P1) — rollback on ANYTHING that is NOT
            // `ran`. Previously we only rolled back on `failed`, but
            // `runEvidenceForDocument` also returns `skipped` in
            // legitimate cases that produce no new signals:
            //   - document_not_found (race with delete)
            //   - processing_status_<not COMPLETED> (re-extraction
            //     in flight)
            //   - no_extracted_text (empty/whitespace corpus)
            // In all those cases, the delete above WOULD COMMIT and
            // the doc would end up with ZERO signals — exactly the
            // vacuum we tried to close in B6.2.2. The contract is:
            // a successful recompute MUST replace the deleted
            // signals; anything else rolls back. The thrown error
            // is caught one level up and logged non-fatally; the
            // user's PATCH (committed by the helper before this
            // block) is preserved, and the OLD signals are also
            // preserved via rollback.
            if (evidenceResult.status !== "ran") {
              throw new Error(
                `Evidence recompute did not run (status=${evidenceResult.status}, reason=${evidenceResult.reason ?? "unknown"}) — rolling back delete to preserve old signals`
              );
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (recomputeError) {
        // Non-fatal — see strategy comment above. Log loudly so
        // ops can spot patterns of recompute failures (e.g. a
        // specific extractor crashing on a class of doc).
        console.error(
          "[metadata-editor] post-patch evidence recompute failed — rolled back, old signals preserved",
          { documentId, dealId: document.dealId, error: recomputeError }
        );
      }
    }

    // Re-fetch the canonical row so the client gets the same shape as
    // GET /api/documents/[id]. Keeps payload contracts consistent.
    //
    // B6.3.1 (Codex P2) — added receivedAt + sourceAuthor +
    // sourceSubject so the canonical-row response reflects the
    // B6.3 fields. Without this, an API consumer that PATCHes an
    // email metadata field couldn't read the new value from the
    // response and had to re-fetch separately (UI today invalidates
    // via React Query so it works; but the API contract was
    // inconsistent with its own "canonical row" promise).
    const updated = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        dealId: true,
        sourceDate: true,
        sourceMetadata: true,
        sourceKind: true,
        type: true,
        name: true,
        processingStatus: true,
        receivedAt: true,
        sourceAuthor: true,
        sourceSubject: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "update document metadata");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
