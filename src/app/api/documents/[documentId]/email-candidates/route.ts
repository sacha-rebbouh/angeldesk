import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";

/**
 * Phase B7.3 — surface the email-thread date candidates so the user
 * can pick a different `sourceDate` when the inference picked wrong
 * (or didn't pick at all because the thread was ambiguous).
 *
 * The candidates come from `Document.sourceMetadata.threadMessages`
 * (populated by `inferEmailSourceFromExtractedText` — already
 * extracts up to 20 thread messages with from/sentAt/subject). This
 * endpoint reads them, marks the "primary" (the one whose `sentAt`
 * matches the current `Document.sourceDate`), and returns the list
 * for the metadata editor's candidate picker.
 *
 * Read-only. Mutation goes through the existing
 * PATCH /api/documents/[id]/metadata (`sourceDate` field).
 *
 * Spec deliverables:
 *   - "ne pas écraser bas de thread" — preserves all thread
 *     messages from sourceMetadata (already done by inference)
 *   - "représenter les dates candidates avec confidence" — each
 *     candidate carries `isPrimary` + the document-level
 *     `inferredConfidence` ("high" | "medium")
 *   - "si ambigu : demander correction utilisateur, ne pas inventer"
 *     — the UI picker (consumer of this endpoint) IS the correction
 *     surface; the endpoint never picks, it surfaces all candidates.
 */
interface RouteParams {
  params: Promise<{ documentId: string }>;
}

const cuidSchema = z.string().cuid();

/**
 * B7.3.1 fix-up (Codex P2) — defensive cap on the candidate count.
 * The inference already caps at 20 via `threadMessages.slice(0, 20)`,
 * but if a future writer (manual DB edit, migration script, parser
 * regression) bypasses that cap, we don't want this endpoint to
 * leak hundreds of thread messages into the picker. Same number as
 * the inference for consistency.
 */
const MAX_CANDIDATES = 20;

/**
 * B7.3.1 fix-up (Codex P1) — derive a day-level key for the
 * isPrimary comparison. The metadata editor stores sourceDate at
 * day granularity (via `<input type="date">`), so a candidate
 * whose `sentAt` is on the same UTC day MUST be flagged "Actuel"
 * even if its hours/minutes differ from the stored midnight.
 *
 * Returns "YYYY-MM-DD" in UTC. We use UTC (not local time) to
 * match what `toISOString().slice(0, 10)` would yield — the same
 * normalisation the picker uses to populate `<input type="date">`.
 */
function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface EmailCandidate {
  from: string | null;
  sentAt: string; // ISO 8601
  subject: string | null;
  /**
   * True when this candidate's `sentAt` matches the current
   * `Document.sourceDate` (i.e. the inference picked this one as
   * the primary). The picker UI highlights it so the user sees
   * which candidate is currently "active".
   */
  isPrimary: boolean;
}

interface EmailCandidatesPayload {
  data: {
    documentId: string;
    sourceKind: "FILE" | "EMAIL" | "NOTE";
    /** Current Document.sourceDate (ISO 8601) — what the system thinks is the email date. */
    currentSourceDate: string | null;
    /**
     * Confidence the inference assigned ("high" | "medium").
     * Read from sourceMetadata.confidence if present; undefined
     * when the doc isn't an email or the inference didn't fire.
     */
    inferredConfidence: "high" | "medium" | null;
    /** "uploaded_file_text" when set by the inference; null otherwise. */
    inferredFrom: string | null;
    /** All thread messages detected at inference time. Up to 20. */
    candidates: EmailCandidate[];
    /**
     * Whether the user has manually overridden the sourceDate
     * (via B6.1's PATCH /metadata). True when
     * `sourceMetadata.manual.sourceDate` exists. The UI uses this
     * to surface "Override manuel actif" instead of "Date détectée".
     */
    hasManualOverride: boolean;
  };
}

async function authenticate(): Promise<
  { kind: "ok"; user: { id: string } } | { kind: "response"; response: NextResponse }
> {
  try {
    const user = await requireAuth();
    return { kind: "ok", user };
  } catch (authError) {
    const msg = authError instanceof Error ? authError.message : "";
    if (msg === "Unauthorized" || msg === "Clerk user not found") {
      return {
        kind: "response",
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    return {
      kind: "response",
      response: handleApiError(authError, "auth"),
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// GET /api/documents/[documentId]/email-candidates
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await authenticate();
  if (auth.kind === "response") return auth.response;
  const user = auth.user;

  try {
    const { documentId } = await params;

    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    // B11.2 (Codex P2) — composite ownership find returning 404
    // uniformly. The threadMessages payload is non-sensitive but
    // doc id enumeration was the residual leak.
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        dealId: true,
        sourceKind: true,
        sourceDate: true,
        sourceMetadata: true,
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Pull the candidate list from sourceMetadata.threadMessages.
    // The shape is set by `inferEmailSourceFromExtractedText` and
    // is plaintext JSON (NOT encrypted — sourceMetadata stays
    // clear so reads stay cheap; the encrypted blob lives on
    // `evidenceText` / EvidenceSignal.valueJson).
    const meta = isPlainObject(document.sourceMetadata)
      ? (document.sourceMetadata as Record<string, unknown>)
      : null;
    const rawThreadMessages = meta && Array.isArray(meta.threadMessages)
      ? (meta.threadMessages as Array<Record<string, unknown>>)
      : [];
    const inferredFrom = meta && typeof meta.inferredFrom === "string" ? meta.inferredFrom : null;
    const inferredConfidence: "high" | "medium" | null =
      meta && (meta.confidence === "high" || meta.confidence === "medium")
        ? (meta.confidence as "high" | "medium")
        : null;
    const manualBlock = meta && isPlainObject(meta.manual) ? meta.manual : null;
    const hasManualOverride =
      manualBlock !== null &&
      Object.prototype.hasOwnProperty.call(manualBlock, "sourceDate");

    const currentSourceDate = document.sourceDate?.toISOString() ?? null;
    // B7.3.1 fix-up (Codex P1) — isPrimary at DAY level, not ms.
    // The metadata editor's date input is `<input type="date">` →
    // it stores `YYYY-MM-DD` (midnight UTC) when the user picks a
    // candidate. The candidate's `sentAt` is the full ISO with
    // hours/minutes from the email header. Comparing ms would
    // always fail post-save (a candidate at 01:03 vs a stored
    // midnight is the same DAY but a different INSTANT). Day-level
    // comparison matches the granularity the picker actually
    // persists, so the "Actuel" highlight stays accurate after
    // save + reload.
    const currentSourceDateDay = document.sourceDate
      ? toUtcDayKey(document.sourceDate)
      : null;

    const candidates: EmailCandidate[] = rawThreadMessages
      .slice(0, MAX_CANDIDATES)
      .map((msg) => {
        const sentAt = typeof msg.sentAt === "string" ? msg.sentAt : null;
        if (!sentAt) return null;
        const sentAtDate = new Date(sentAt);
        if (Number.isNaN(sentAtDate.getTime())) return null;
        const from = typeof msg.from === "string" ? msg.from : null;
        const subject = typeof msg.subject === "string" ? msg.subject : null;
        const isPrimary =
          currentSourceDateDay !== null &&
          toUtcDayKey(sentAtDate) === currentSourceDateDay;
        return { from, sentAt, subject, isPrimary };
      })
      .filter((entry): entry is EmailCandidate => entry !== null);

    const payload: EmailCandidatesPayload["data"] = {
      documentId,
      sourceKind: document.sourceKind,
      currentSourceDate,
      inferredConfidence,
      inferredFrom,
      candidates,
      hasManualOverride,
    };

    return NextResponse.json({ data: payload });
  } catch (error) {
    return handleApiError(error, "fetch email date candidates");
  }
}
