/**
 * Phase B9.2 — Evidence Signal Resolution API.
 *
 *   POST   /api/deals/[dealId]/evidence-health/resolutions
 *          body: { signalKey, action: "RESOLVED" | "IGNORED", reason? }
 *          → upsert per (dealId, signalKey). Action toggle replaces the row.
 *
 *   DELETE /api/deals/[dealId]/evidence-health/resolutions
 *          body: { signalKey }
 *          → un-resolve (delete the row). Idempotent: deleting a missing
 *          row returns 200 with `{ data: { deleted: false } }`.
 *
 * Security posture:
 *   - Auth via `requireAuth()` with explicit 401 contract (no
 *     fall-through to a generic 500 — matches B8 evidence-health
 *     route).
 *   - IDOR: `prisma.deal.findFirst({ where: { id: dealId, userId } })`
 *     before ANY mutation. A user can't create a resolution against a
 *     deal they don't own.
 *   - Cross-deal: even if a client crafts a `signalKey` that matches
 *     a signal on a DIFFERENT deal, the upsert is scoped to the URL's
 *     dealId via the composite unique `(dealId, signalKey)`. The
 *     overlay row lives on THIS deal regardless of which deal the
 *     signal came from (which is harmless — the partition filter only
 *     reads this deal's resolutions against this deal's bundle).
 *   - signalKey validation goes through `parseSignalKey` (B9.1.1):
 *     unknown kinds / malformed shapes / oversized inputs reject 400
 *     BEFORE touching the database — anti-fuzz against fabricated
 *     tombstones.
 *   - Reason is capped at 1000 chars (matches the schema annotation).
 *   - Rate-limited per user (mirror of /resolutions pattern).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid, checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  buildDealEvidenceContext,
  buildEvidenceHealthBundle,
  enumerateBundleSignalKeys,
  isValidSignalKey,
} from "@/services/evidence";

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

// Body schemas. signalKey goes through `isValidSignalKey` (refine)
// which validates: known prefix, known kind enum, well-formed
// segments, length ≤ 512.
const upsertBodySchema = z.object({
  signalKey: z.string().refine(isValidSignalKey, { message: "Invalid signalKey" }),
  action: z.enum(["RESOLVED", "IGNORED"]),
  reason: z.string().max(1000).optional().nullable(),
});

const deleteBodySchema = z.object({
  signalKey: z.string().refine(isValidSignalKey, { message: "Invalid signalKey" }),
});

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

// POST — upsert (resolve OR ignore OR change-action)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticate();
  if (auth.kind === "response") return auth.response;
  const user = auth.user;

  try {
    const rl = await checkRateLimitDistributed(`evidence-health-resolutions-post:${user.id}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { dealId } = await params;
    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = upsertBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }
    const { signalKey, action, reason: rawReason } = parsed.data;
    // B9.3.1 fix-up (Codex B9.3 P2) — normalise the reason
    // server-side. Without this, a direct API caller (curl, second
    // client) could store `"   "` or `"  text  "` because the trim
    // was UI-only. Now: trim, then collapse whitespace-only to null
    // so the DB never holds a value that looks like content but
    // isn't actionable for the BA. Length cap is already enforced
    // upstream by the Zod `max(1000)` refine.
    const normalisedReason =
      rawReason != null && rawReason.trim().length > 0 ? rawReason.trim() : null;

    // IDOR — verify the caller owns the deal BEFORE writing anything.
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // B9.2.1 fix-up (Codex B9.2 P1) — POST must REFUSE a signalKey
    // that doesn't match an active signal in the current bundle.
    // Without this binding, a client could pre-emptively write
    // `freshness:balance_sheet_stale:<docId>` for a signal that
    // doesn't exist yet, and the partition filter would silently
    // mask it the moment it appeared — a real product hazard.
    //
    // Cost-aware: the bundle is read-only (no LLM, no extraction
    // re-run), same call pattern as the GET /evidence-health route.
    // We pay this only on the POST hot path; DELETE is exempt
    // (idempotent un-resolve doesn't need the binding).
    const bundle = buildEvidenceHealthBundle(await buildDealEvidenceContext(prisma, dealId));
    const activeKeys = enumerateBundleSignalKeys(bundle);
    if (!activeKeys.has(signalKey)) {
      return NextResponse.json(
        { error: "signal_not_active" },
        { status: 409 }
      );
    }

    // Upsert: replace action / reason / userId / updatedAt for an
    // existing row, or create a new one. The composite unique
    // (dealId, signalKey) keeps idempotency at the DB level.
    const resolution = await prisma.evidenceSignalResolution.upsert({
      where: { dealId_signalKey: { dealId, signalKey } },
      create: {
        dealId,
        signalKey,
        action,
        reason: normalisedReason,
        userId: user.id,
      },
      update: {
        action,
        reason: normalisedReason,
        // Track the LAST user who changed the action (e.g. a team
        // member might re-mark a resolution). We keep a single row
        // per signal — past actions are not history-tracked
        // (intentional for B9 scope; an audit table could be added
        // later without breaking the wire format).
        userId: user.id,
      },
      select: {
        signalKey: true,
        action: true,
        reason: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: resolution });
  } catch (error) {
    return handleApiError(error, "upsert evidence signal resolution");
  }
}

// DELETE — un-resolve. Body carries the signalKey (URL-safe variants
// would require %-encoding the `:` which we already do internally,
// but a JSON body keeps the payload uniform with POST).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticate();
  if (auth.kind === "response") return auth.response;
  const user = auth.user;

  try {
    const rl = await checkRateLimitDistributed(`evidence-health-resolutions-delete:${user.id}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { dealId } = await params;
    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = deleteBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }
    const { signalKey } = parsed.data;

    // IDOR — same scoping as POST.
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Idempotent delete: a missing row returns `{ deleted: false }`
    // instead of 404. Prevents UI flicker when the BA double-clicks
    // "Réouvrir" (or two browser tabs race the same action).
    try {
      await prisma.evidenceSignalResolution.delete({
        where: { dealId_signalKey: { dealId, signalKey } },
      });
      return NextResponse.json({ data: { deleted: true } });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
        return NextResponse.json({ data: { deleted: false } });
      }
      throw e;
    }
  } catch (error) {
    return handleApiError(error, "delete evidence signal resolution");
  }
}
