import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySvixSignature } from "@/lib/live/recall-client";
import { isLiveCoachingEnabled } from "@/lib/feature-flags";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { generateAndSavePostCallReport } from "@/lib/live/post-call-generator";
import { handleApiError } from "@/lib/api-error";
import type { SessionStatus } from "@/lib/live/types";

// Phase C slice C1b — REL-003 : `maxDuration` aligné avec stop/retry-report
// (300s). Le payload `done` peut déclencher `generateAndSavePostCallReport`
// via `after(...)` qui lance un Sonnet call (~6-15s) + condensation +
// trigger reanalyze. Sans 300s, le rapport pouvait être tronqué/perdu
// silencieusement avec `maxDuration=10` qui correspondait à une simple
// borne d'enqueue.
export const maxDuration = 300;

/**
 * Phase C slice C1b round 2 — SEC-002 : quadruple-guard strict avec
 * opt-in explicite pour le bypass de la vérification Svix.
 *
 * Aligné sur le pattern `DEV_MODE` de `src/lib/auth.ts:6-10` (qui exige
 * `BYPASS_AUTH=true`) et `BYPASS_AUTH` de `src/proxy.ts:21-25`. Empêche
 * qu'un déploiement preview, self-hosted, ou un environnement Docker
 * avec `NODE_ENV=development` laissé par accident désactive la
 * vérification de signature.
 *
 * Bypass autorisé uniquement si LES QUATRE conditions sont réunies :
 *   - `NODE_ENV === "development"` (Next runtime local)
 *   - `RECALL_WEBHOOK_BYPASS_SIGNATURE === "true"` (opt-in explicite —
 *     le développeur doit le poser intentionnellement dans son `.env.local`)
 *   - `VERCEL_ENV !== "production"` (filet contre l'override)
 *   - `!VERCEL` (set sur tous les déploiements Vercel — preview inclus)
 *
 * Le opt-in explicite (`RECALL_WEBHOOK_BYPASS_SIGNATURE=true`) protège
 * spécifiquement le cas self-hosted Docker / non-Vercel où `NODE_ENV`
 * peut rester sur "development" par accident sans que VERCEL soit set.
 * Sans ce flag, le bypass est refusé même en runtime local.
 *
 * Évalué à chaque appel (pas au module load) pour permettre tests via
 * `vi.stubEnv`.
 */
function isLocalDevRuntime(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.RECALL_WEBHOOK_BYPASS_SIGNATURE === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    !process.env.VERCEL
  );
}

// POST /api/webhooks/recall — Receive bot status events from Recall.ai
export async function POST(request: NextRequest) {
  try {
    // ── Verify Svix webhook signature ──
    const rawBody = await request.text();
    const webhookSecret = process.env.RECALL_WEBHOOK_SECRET;
    const isDev = isLocalDevRuntime();

    const svixHeaders = {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    };

    if (webhookSecret && svixHeaders.svixId) {
      const isValid = verifySvixSignature(rawBody, svixHeaders, webhookSecret);
      if (!isValid) {
        if (isDev) {
          console.warn("[recall-webhook] Svix signature invalid — BYPASSED in local dev runtime");
        } else {
          return NextResponse.json(
            { error: "Invalid webhook signature" },
            { status: 401 }
          );
        }
      }
    } else if (!isDev) {
      // In production / preview / Vercel, require signature verification.
      console.error("[recall-webhook] Missing webhook secret or Svix headers");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Live Coaching archivé → on ACQUITTE (200) APRÈS vérif signature mais on NE traite RIEN
    // (aucun lookup DB / LLM / Neon réveillé). Évite les retries Recall. Réactivable via flag.
    if (!isLiveCoachingEnabled()) {
      return NextResponse.json({ ok: true, archived: true });
    }

    // ── Parse body ──
    console.log(`[recall-webhook] Received event: ${rawBody.slice(0, 300)}`);
    const body = JSON.parse(rawBody) as {
      event: string;
      data: {
        bot_id: string;
        status?: {
          code: string;
          message: string;
        };
      };
    };

    const botId = body.data?.bot_id;
    if (!botId) {
      // Malformed event — acknowledge silently
      return NextResponse.json({ ok: true });
    }

    // ── Look up session by botId ──
    const session = await prisma.liveSession.findFirst({
      where: { botId },
    });

    if (!session) {
      // Orphan event (bot no longer linked to a session) — ignore
      return NextResponse.json({ ok: true });
    }

    const statusCode = body.data.status?.code ?? "";
    const statusMessage = body.data.status?.message ?? "";

    // ── Map Recall status codes to session status ──
    let newStatus: SessionStatus | null = null;
    const updateData: Record<string, unknown> = {};
    let ablyMessage = "";

    switch (statusCode) {
      case "in_call_recording":
      case "in_call_not_recording": {
        newStatus = "live";
        ablyMessage = "Bot has joined the meeting. Live coaching active.";
        // Only set startedAt if not already set
        if (!session.startedAt) {
          updateData.startedAt = new Date();
        }
        break;
      }

      case "call_ended":
      case "done": {
        // Only transition if not already processing/completed (duplicate guard)
        if (session.status !== "processing" && session.status !== "completed") {
          if (session.status === "live" || session.status === "bot_joining") {
            newStatus = "processing";
            ablyMessage = "Call ended. Generating post-call report...";
            if (!session.endedAt) {
              updateData.endedAt = new Date();
            }
          }
        }
        break;
      }

      case "fatal": {
        newStatus = "failed";
        ablyMessage = `Bot encountered an error: ${statusMessage}`;
        updateData.errorMessage = statusMessage || "Fatal bot error";
        break;
      }

      default: {
        // Unknown or intermediate status (e.g. "analysis_done") — log and ignore
        console.log(
          `[recall-webhook] Unhandled status code "${statusCode}" for session ${session.id}`
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (!newStatus) {
      return NextResponse.json({ ok: true });
    }

    // ── Atomic status transition: use updateMany with allowed source statuses ──
    // This prevents overwriting terminal states (processing/completed) with earlier states
    const allowedSourceStatuses: Record<string, string[]> = {
      live: ["created", "bot_joining"],
      processing: ["live", "bot_joining"],
      failed: ["created", "bot_joining", "live"],
    };
    const allowedFrom = allowedSourceStatuses[newStatus] ?? [];

    const result = await prisma.liveSession.updateMany({
      where: {
        id: session.id,
        status: { in: allowedFrom },
      },
      data: {
        status: newStatus,
        ...updateData,
      },
    });

    if (result.count === 0) {
      console.log(`[recall-webhook] Session ${session.id} already in terminal state, skipping ${newStatus} transition`);
      return NextResponse.json({ ok: true });
    }

    // ── Publish Ably session status event ──
    await publishSessionStatus(session.id, {
      status: newStatus,
      message: ablyMessage,
    });

    // ── Trigger post-call report on call end (using after() for Vercel survival) ──
    if (newStatus === "processing") {
      after(async () => {
        try {
          await generateAndSavePostCallReport(session.id);
        } catch (err) {
          console.error(
            `[recall-webhook] Post-call report failed for session ${session.id}:`,
            err
          );
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "process recall webhook");
  }
}
