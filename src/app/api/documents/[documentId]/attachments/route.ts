import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { tryDecryptJsonField } from "@/lib/encryption";
import { createEvidenceSignal } from "@/services/evidence-signals/create-signal";

/**
 * Phase B7 — attachment relations surface.
 *
 *   B7.1 (GET): surface auto + human ATTACHMENT_RELATION signals
 *     read-only. Returns inbound (doc as child) + outbound (doc as
 *     email), each entry tagged with `provenance: "auto" | "human"`.
 *   B7.2 (POST + DELETE): correction manuelle.
 *     - POST: link this doc (as child) to an email → creates a
 *       human-scoped ATTACHMENT_RELATION via createEvidenceSignal
 *       with signalScopeKey `human:<cuid>`, valueJson.kind="manual_link".
 *     - DELETE [signalId]: unlink. If the signal is human-scoped,
 *       safe-delete. If it's an auto signal, **create a human
 *       suppression signal** instead — preserves the auto trace
 *       (spec: "unlink n'efface pas signal auto sans trace").
 *
 * Suppression model: a suppression is itself an ATTACHMENT_RELATION
 * signal with valueJson.kind="suppression" and valueJson.suppresses
 * pointing at the target signal's id. The GET path filters out
 * targets that appear in any suppression's `suppresses` field.
 *
 * IDOR safety: auth + ownership + dealId scope on every SQL query.
 * Cross-deal isolation is impossible by construction.
 */
interface RouteParams {
  params: Promise<{ documentId: string }>;
}

const cuidSchema = z.string().cuid();

const linkBodySchema = z.object({
  emailDocumentId: z.string().cuid(),
});

const HUMAN_LINK_EXTRACTOR_VERSION = "human-manual-link-v1";
const HUMAN_SUPPRESSION_EXTRACTOR_VERSION = "human-suppression-v1";

interface DecryptedAttachmentValue {
  kind?: "manual_link" | "suppression";
  emailDocId?: string;
  attachmentName?: string;
  matchMethod?: "exact" | "normalized" | "manual";
  matchScore?: number;
  emailSourceDate?: string | null;
  suppresses?: string;
  setBy?: string;
  setAt?: string;
}

interface AttachmentRelationEntry {
  signalId: string;
  relatedDocumentId: string;
  relatedDocumentName: string;
  relatedDocumentType: string;
  attachmentName: string | null;
  matchMethod: "exact" | "normalized" | "manual" | "unknown";
  matchScore: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  emailSourceDate: string | null;
  reportedAt: string | null;
  createdAt: string;
  /**
   * B7.2 — "auto" = produced by attachment-linker (signalScopeKey
   * = "source_metadata"); "human" = produced by manual user link
   * (signalScopeKey starts with "human:"). Drives UI affordances
   * (auto = read-only badge, human = "Délier" deletes for real).
   */
  provenance: "auto" | "human";
}

interface CandidateEmail {
  id: string;
  name: string;
  sourceDate: string | null;
}

/**
 * B7.2.1 fix-up (Codex P1) — DETERMINISTIC `humanOverrideId` derived
 * from the logical identity of the action. Same logical action →
 * same id → same `human:<id>` scopeKey → same signalHash (given
 * matching valueJson) → P2002 → createEvidenceSignal dedups.
 *
 * Without this, two POSTs of the same logical link (e.g. double-
 * click, network retry, re-link of the same email) created two
 * distinct rows with random scopeKeys.
 *
 * Output shape: `c<24-hex-chars>`, matches the validation pattern
 * `c[a-z0-9]{20,32}` in create-signal.ts:56.
 */
function deriveManualLinkOverrideId(childDocumentId: string, emailDocumentId: string): string {
  const hash = createHash("sha256")
    .update(`link:${childDocumentId}:${emailDocumentId}`)
    .digest("hex")
    .slice(0, 24);
  return `c${hash}`;
}
function deriveSuppressionOverrideId(targetSignalId: string): string {
  const hash = createHash("sha256")
    .update(`suppress:${targetSignalId}`)
    .digest("hex")
    .slice(0, 24);
  return `c${hash}`;
}

function isHumanScopeKey(scopeKey: string): boolean {
  return scopeKey.startsWith("human:");
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

// ============================================================
// GET /api/documents/[documentId]/attachments (B7.1 + B7.2 ext.)
// ============================================================
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
    // uniformly. Anti-enumeration on the attachments GET surface.
    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        dealId: true,
        sourceKind: true,
        // B7.2.2 — name + sourceDate needed for the human-provenance
        // derivation in buildEntry (when this doc is the email,
        // the outbound entries' emailSourceDate comes from THIS
        // doc's sourceDate; when this doc is the child, the inbound
        // entries' attachmentName comes from THIS doc's name).
        name: true,
        sourceDate: true,
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const [inboundSignals, outboundCandidates, candidateEmailDocs] = await Promise.all([
      prisma.evidenceSignal.findMany({
        where: { documentId, dealId: document.dealId, kind: "ATTACHMENT_RELATION" },
        select: {
          id: true,
          valueJson: true,
          confidence: true,
          reportedAt: true,
          createdAt: true,
          signalScopeKey: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.evidenceSignal.findMany({
        where: { dealId: document.dealId, kind: "ATTACHMENT_RELATION" },
        select: {
          id: true,
          documentId: true,
          valueJson: true,
          confidence: true,
          reportedAt: true,
          createdAt: true,
          signalScopeKey: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      // B7.2 — candidate emails for the "Lier à un email" picker.
      // Same deal, sourceKind=EMAIL, excluding this doc itself
      // (an email can't be its own child). Sorted by sourceDate
      // desc so the most recent email lands first in the picker.
      //
      // B7.2.2 (Codex P2) — filter `isLatest=true` and
      // `processingStatus != FAILED`. Without these guards the
      // picker would surface stale versions / broken emails that
      // the auto-linker had been hardened to skip — letting the
      // user link to them via manual override would re-introduce
      // the same staleness the linker hardening fixed.
      prisma.document.findMany({
        where: {
          dealId: document.dealId,
          sourceKind: "EMAIL",
          id: { not: documentId },
          isLatest: true,
          processingStatus: { not: "FAILED" },
        },
        select: { id: true, name: true, sourceDate: true },
        orderBy: { sourceDate: "desc" },
      }),
    ]);

    // B7.2 — single decrypt pass shared by the suppression scan AND
    // the classification step. Decrypt is symmetric AES-256-GCM
    // (fast), but calling it twice per signal is both wasteful AND
    // breaks any caller / test that mocks per-call (vi mockReturnValueOnce
    // queue). One pass, cached in a Map keyed by signal id.
    const decryptedById = new Map<string, DecryptedAttachmentValue>();
    for (const signal of [...inboundSignals, ...outboundCandidates]) {
      if (decryptedById.has(signal.id)) continue; // dedup if a row showed up in both queries
      const decrypted = tryDecryptJsonField<DecryptedAttachmentValue>(signal.valueJson);
      if (decrypted.kind !== "decrypted" && decrypted.kind !== "plaintext") continue;
      decryptedById.set(signal.id, decrypted.value);
    }

    // B7.2 — suppression index. A suppression signal has
    // valueJson.kind === "suppression" + valueJson.suppresses = the
    // target signal's id. We scan EVERY decrypted value because a
    // suppression can live on the doc itself OR on any other doc
    // in the deal.
    const suppressedSignalIds = new Set<string>();
    for (const value of decryptedById.values()) {
      if (value.kind === "suppression" && typeof value.suppresses === "string") {
        suppressedSignalIds.add(value.suppresses);
      }
    }

    const referencedDocIds = new Set<string>();

    function classify(signal: { id: string }): DecryptedAttachmentValue | null {
      const value = decryptedById.get(signal.id);
      if (!value) return null;
      // Suppression signals are infrastructure — never surfaced as
      // user-facing relations.
      if (value.kind === "suppression") return null;
      // Suppressed targets are filtered out.
      if (suppressedSignalIds.has(signal.id)) return null;
      return value;
    }

    const inboundDecoded = inboundSignals
      .map((signal) => {
        const value = classify(signal);
        if (!value || !value.emailDocId) return null;
        referencedDocIds.add(value.emailDocId);
        return { signal, value };
      })
      .filter(
        (entry): entry is { signal: typeof inboundSignals[number]; value: DecryptedAttachmentValue } =>
          entry !== null
      );

    const outboundDecoded = outboundCandidates
      .map((signal) => {
        const value = classify(signal);
        if (!value || value.emailDocId !== documentId) return null;
        if (signal.documentId === documentId) return null;
        referencedDocIds.add(signal.documentId);
        return { signal, value };
      })
      .filter(
        (entry): entry is { signal: typeof outboundCandidates[number]; value: DecryptedAttachmentValue } =>
          entry !== null
      );

    const relatedDocs =
      referencedDocIds.size === 0
        ? []
        : await prisma.document.findMany({
            where: {
              id: { in: Array.from(referencedDocIds) },
              dealId: document.dealId,
            },
            // B7.2.2 (Codex P2) — `sourceDate` added to the SELECT
            // so the buildEntry function can derive `emailSourceDate`
            // for human manual_link entries at read time (vs reading
            // a now-possibly-stale snapshot from valueJson).
            select: { id: true, name: true, type: true, sourceDate: true },
          });
    const relatedDocsById = new Map(relatedDocs.map((d) => [d.id, d]));

    // TypeScript narrows `document` non-null at the top of the
    // try block, but the closure below loses that narrowing.
    // Capture into a non-null local so the buildEntry can read
    // `urlDoc.name` / `urlDoc.sourceDate` without re-narrowing.
    const urlDoc = document;
    function buildEntry(
      signal: {
        id: string;
        signalScopeKey: string;
        confidence: "HIGH" | "MEDIUM" | "LOW";
        reportedAt: Date | null;
        createdAt: Date;
      },
      value: DecryptedAttachmentValue,
      relatedId: string,
      side: "inbound" | "outbound"
    ): AttachmentRelationEntry | null {
      const related = relatedDocsById.get(relatedId);
      if (!related) return null;
      const provenance: "auto" | "human" = isHumanScopeKey(signal.signalScopeKey)
        ? "human"
        : "auto";
      const matchMethod: AttachmentRelationEntry["matchMethod"] =
        value.matchMethod === "exact" ||
        value.matchMethod === "normalized" ||
        value.matchMethod === "manual"
          ? value.matchMethod
          : "unknown";
      // B7.2.2 (Codex P2) — human manual_link signals have a
      // MINIMAL valueJson by design (only identity fields). Derive
      // the display fields from the LIVE docs here so a rename
      // (B6.1) or an email-date correction (B6.3) flows through
      // immediately without creating duplicate signals.
      //
      //   inbound (this doc is the child) :
      //     attachmentName  = this doc's current name
      //     emailSourceDate = related (the email)'s current sourceDate
      //
      //   outbound (this doc is the email) :
      //     attachmentName  = related (the child)'s current name
      //     emailSourceDate = this doc's current sourceDate
      //
      // Auto signals keep their valueJson snapshot (matchScore +
      // attachmentNameInEmail may legitimately differ from the
      // child's actual name; B6.3 recompute already refreshes them
      // when the email's sourceDate changes).
      let attachmentName: string | null;
      let emailSourceDate: string | null;
      if (provenance === "human") {
        if (side === "inbound") {
          attachmentName = urlDoc.name;
          emailSourceDate = related.sourceDate?.toISOString() ?? null;
        } else {
          attachmentName = related.name;
          emailSourceDate = urlDoc.sourceDate?.toISOString() ?? null;
        }
      } else {
        attachmentName = value.attachmentName ?? null;
        emailSourceDate = value.emailSourceDate ?? null;
      }
      return {
        signalId: signal.id,
        relatedDocumentId: related.id,
        relatedDocumentName: related.name,
        relatedDocumentType: related.type,
        attachmentName,
        matchMethod,
        matchScore: typeof value.matchScore === "number" ? value.matchScore : null,
        confidence: signal.confidence,
        emailSourceDate,
        reportedAt: signal.reportedAt?.toISOString() ?? null,
        createdAt: signal.createdAt.toISOString(),
        provenance,
      };
    }

    const inbound = inboundDecoded
      .map(({ signal, value }) => buildEntry(signal, value, value.emailDocId!, "inbound"))
      .filter((entry): entry is AttachmentRelationEntry => entry !== null);

    const outbound = outboundDecoded
      .map(({ signal, value }) => buildEntry(signal, value, signal.documentId, "outbound"))
      .filter((entry): entry is AttachmentRelationEntry => entry !== null);

    const candidateEmails: CandidateEmail[] = candidateEmailDocs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      sourceDate: doc.sourceDate?.toISOString() ?? null,
    }));

    return NextResponse.json({
      data: {
        documentId,
        sourceKind: document.sourceKind,
        inbound,
        outbound,
        candidateEmails,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch document attachments");
  }
}

// ============================================================
// POST /api/documents/[documentId]/attachments (B7.2 — link)
// ============================================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticate();
  if (auth.kind === "response") return auth.response;
  const user = auth.user;

  try {
    // B11.2 (Codex P2) — rate limit. POST creates an EvidenceSignal
    // row; without throttling a single user can spam tens of thousands
    // of human-scoped ATTACHMENT_RELATION rows. Same 30/min as
    // resolutions + metadata-patch.
    const rateLimit = await checkRateLimitDistributed(`attachments-mutation:${user.id}`, {
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
    const parsed = linkBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // B7.2 — self-link guard: an email can't be linked to itself.
    if (parsed.data.emailDocumentId === documentId) {
      return NextResponse.json(
        { error: "Cannot link a document to itself" },
        { status: 400 }
      );
    }

    // B11.2 (Codex P2) — both lookups now use composite ownership
    // (`id + deal.userId`) and return 404 uniformly. Anti-enumeration:
    // a stranger probing emailDocumentId values gets the same 404
    // whether the row is in another tenant or never existed.
    const [thisDoc, emailDoc] = await Promise.all([
      prisma.document.findFirst({
        where: { id: documentId, deal: { userId: user.id } },
        select: {
          id: true,
          dealId: true,
          name: true,
          version: true,
        },
      }),
      prisma.document.findFirst({
        where: {
          id: parsed.data.emailDocumentId,
          deal: { userId: user.id },
        },
        select: {
          id: true,
          dealId: true,
          name: true,
          sourceKind: true,
          sourceDate: true,
          // B7.2.2 (Codex P2) — guard against linking to stale
          // versions / broken emails. Selected here so we can
          // reject in app code with a clear 400 message.
          isLatest: true,
          processingStatus: true,
        },
      }),
    ]);

    if (!thisDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!emailDoc) {
      return NextResponse.json(
        { error: "Email document not found" },
        { status: 404 }
      );
    }
    // Cross-deal guard — even if the user owns BOTH deals, we
    // disallow linking across deals. An attachment relation only
    // makes sense within a single deal's corpus.
    if (emailDoc.dealId !== thisDoc.dealId) {
      return NextResponse.json(
        { error: "Email document belongs to a different deal" },
        { status: 400 }
      );
    }
    if (emailDoc.sourceKind !== "EMAIL") {
      return NextResponse.json(
        { error: "Target document is not an email (sourceKind must be EMAIL)" },
        { status: 400 }
      );
    }
    // B7.2.2 (Codex P2) — refuse stale-version emails. The corpus
    // surfaces only `isLatest=true` rows; an attachment relation
    // pointing at a past version of an email would be a permanent
    // dead-link as soon as the user opens it.
    if (!emailDoc.isLatest) {
      return NextResponse.json(
        { error: "Target email is not the latest version" },
        { status: 400 }
      );
    }
    // B7.2.2 (Codex P2) — refuse broken emails (failed extraction).
    // A FAILED doc has no usable extracted content; linking to it
    // would surface a meaningless relation. The auto-linker was
    // hardened to skip FAILED targets — match that contract here.
    if (emailDoc.processingStatus === "FAILED") {
      return NextResponse.json(
        { error: "Target email extraction failed; cannot create a manual link" },
        { status: 400 }
      );
    }

    // B7.2.1 → B7.2.2 (Codex P2 idempotence cassable) — IDEMPOTENT
    // manual link with IDENTITY-STABLE valueJson.
    //   - scopeKey: deterministic from (childDocId, emailDocId)
    //   - valueJson: MINIMAL — only identity fields. NO mutable
    //     snapshots (attachmentName, emailSourceDate, setBy, setAt).
    //     A doc rename or an email-date correction would otherwise
    //     change signalHash → P2002 wouldn't fire → duplicate
    //     signals. The read path derives attachmentName + email
    //     sourceDate from the live related docs (see GET's
    //     buildEntry for the human-provenance branch).
    //   - reportedAt column: snapshot of the email's sourceDate at
    //     creation time. This is acceptable because the column is
    //     NOT part of signalHash (it's a separate column for query
    //     filtering); even if it goes stale, the GET path derives
    //     the displayed date from the live email, so the UI stays
    //     accurate. A future B7.x cron can refresh reportedAt if
    //     needed for SQL filters.
    const humanOverrideId = deriveManualLinkOverrideId(thisDoc.id, emailDoc.id);

    const outcome = await createEvidenceSignal(prisma, {
      dealId: thisDoc.dealId,
      documentId: thisDoc.id,
      documentVersion: thisDoc.version,
      signalScopeKey: `human:${humanOverrideId}`,
      extractionRunId: null,
      extractorVersion: HUMAN_LINK_EXTRACTOR_VERSION,
      sourceTextHash: null,
      kind: "ATTACHMENT_RELATION",
      valueJson: {
        kind: "manual_link",
        emailDocId: emailDoc.id,
        matchMethod: "manual",
      },
      reportedAt: emailDoc.sourceDate,
      precision: emailDoc.sourceDate ? "DAY" : "UNKNOWN",
      confidence: "HIGH",
      sourceMethod: "HUMAN_OVERRIDE",
      evidenceText: null,
      pageNumber: null,
      sheetName: null,
      charOffset: null,
    });

    return NextResponse.json(
      {
        data: {
          signalId: outcome.signal.id,
          deduplicated: outcome.deduplicated,
          provenance: "human" as const,
          emailDocumentId: emailDoc.id,
        },
      },
      { status: outcome.deduplicated ? 200 : 201 }
    );
  } catch (error) {
    return handleApiError(error, "create manual attachment link");
  }
}

// ============================================================
// DELETE /api/documents/[documentId]/attachments (B7.2 — unlink)
//
// The unlink targets a specific signalId via a JSON body so we
// don't have to multiply route segments (`/attachments/[signalId]`).
// The route stays IDOR-safe via the same dealId scope.
// ============================================================
const unlinkBodySchema = z.object({
  signalId: z.string().cuid(),
});

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticate();
  if (auth.kind === "response") return auth.response;
  const user = auth.user;

  try {
    // B11.2 (Codex P2) — rate limit. Same 30/min shared bucket with
    // POST (attachments-mutation:<user>) so a single user can't
    // hammer both endpoints in parallel and bypass the cap.
    const rateLimit = await checkRateLimitDistributed(`attachments-mutation:${user.id}`, {
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
    const parsed = unlinkBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // B11.2 (Codex P2) — composite ownership find returning 404
    // uniformly. The DELETE surface mutates EvidenceSignal rows so
    // even the existence-disclosure was worth closing.
    const thisDoc = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        dealId: true,
        version: true,
      },
    });
    if (!thisDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Find the target signal scoped to this deal — IDOR-safe.
    // The signal MUST be an ATTACHMENT_RELATION; refusing other
    // kinds prevents callers from using this endpoint to delete /
    // suppress arbitrary signals. We also fetch `valueJson` so we
    // can decrypt + verify the signal actually touches the URL doc
    // (Codex B7.2.1 P2 #2 — cross-document mutation guard).
    const targetSignal = await prisma.evidenceSignal.findFirst({
      where: {
        id: parsed.data.signalId,
        dealId: thisDoc.dealId,
        kind: "ATTACHMENT_RELATION",
      },
      select: {
        id: true,
        signalScopeKey: true,
        documentId: true,
        valueJson: true,
      },
    });
    if (!targetSignal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    // B7.2.1 (Codex P2 #2) — verify the signal is in the URL doc's
    // context (either inbound: signal is persisted ON this doc,
    // OR outbound: signal points AT this doc as the email). Without
    // this guard, a caller could pass a signalId for a relation
    // between docs B and C while hitting /documents/A/attachments
    // and mutate it.
    const decryptedTarget = tryDecryptJsonField<DecryptedAttachmentValue>(
      targetSignal.valueJson
    );
    if (decryptedTarget.kind !== "decrypted" && decryptedTarget.kind !== "plaintext") {
      // Corrupted/absent envelope: refuse rather than mutate blindly.
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    const targetValue = decryptedTarget.value;
    // B7.2.1 (Codex defense) — suppression signals are infrastructure;
    // they MUST NOT be deleted / counter-suppressed via the public
    // API. The GET path already hides them, but a direct call with
    // a known suppression signalId shouldn't succeed.
    if (targetValue.kind === "suppression") {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    const touchesUrlDoc =
      targetSignal.documentId === documentId || // inbound: signal lives on URL doc
      targetValue.emailDocId === documentId; // outbound: signal references URL doc as email
    if (!touchesUrlDoc) {
      // Same deal, but unrelated to the URL doc — refuse with 404
      // so we don't disclose its existence.
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    // B7.2 — provenance branching :
    //   - HUMAN signal → safe delete. The user created it; they
    //     can delete it. No trace to preserve.
    //   - AUTO signal → create a suppression signal. The auto
    //     signal MUST survive (audit trail of what the linker
    //     produced); the suppression overrides it at GET-read
    //     time. Spec: "unlink n'efface pas signal auto sans trace".
    if (isHumanScopeKey(targetSignal.signalScopeKey)) {
      await prisma.evidenceSignal.deleteMany({
        where: {
          id: targetSignal.id,
          dealId: thisDoc.dealId,
        },
      });
      return NextResponse.json({
        data: { action: "deleted", signalId: targetSignal.id },
      });
    }

    // Auto-signal suppression. The suppression is itself an
    // ATTACHMENT_RELATION row (so it shares the dedup / read
    // machinery) but its valueJson.kind === "suppression" and
    // valueJson.suppresses points at the target. The suppression
    // lives on the SAME document as the target row (semantically:
    // the suppression belongs where the auto signal lived).
    //
    // B7.2.1 (Codex P2 #3) — `documentVersion` MUST come from the
    // target signal's host document, NOT from the URL doc. When
    // the user unlinks an OUTBOUND relation from an email view,
    // thisDoc is the email but the suppression lives on the child
    // doc with that child's version. Mixing the versions would
    // pin the suppression to a non-existent version.
    //
    // B7.2.1 (Codex P1) — DETERMINISTIC suppression scopeKey so
    // double-click unlink is idempotent (P2002 → createEvidenceSignal
    // dedups). valueJson omits setBy/setAt for the same reason
    // (would break signalHash stability).
    let targetHostVersion = thisDoc.version;
    if (targetSignal.documentId !== documentId) {
      const targetHost = await prisma.document.findUnique({
        where: { id: targetSignal.documentId },
        select: { version: true, dealId: true },
      });
      // Defensive: same-deal already enforced by the signal's
      // dealId scope above, but verify before trusting the row.
      if (!targetHost || targetHost.dealId !== thisDoc.dealId) {
        return NextResponse.json({ error: "Signal not found" }, { status: 404 });
      }
      targetHostVersion = targetHost.version;
    }
    const humanOverrideId = deriveSuppressionOverrideId(targetSignal.id);
    await createEvidenceSignal(prisma, {
      dealId: thisDoc.dealId,
      documentId: targetSignal.documentId,
      documentVersion: targetHostVersion,
      signalScopeKey: `human:${humanOverrideId}`,
      extractionRunId: null,
      extractorVersion: HUMAN_SUPPRESSION_EXTRACTOR_VERSION,
      sourceTextHash: null,
      kind: "ATTACHMENT_RELATION",
      valueJson: {
        kind: "suppression",
        suppresses: targetSignal.id,
      },
      reportedAt: null,
      precision: "UNKNOWN",
      confidence: "HIGH",
      sourceMethod: "HUMAN_OVERRIDE",
      evidenceText: null,
      pageNumber: null,
      sheetName: null,
      charOffset: null,
    });
    return NextResponse.json({
      data: { action: "suppressed", signalId: targetSignal.id },
    });
  } catch (error) {
    return handleApiError(error, "unlink attachment");
  }
}
