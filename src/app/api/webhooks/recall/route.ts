import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySvixSignature } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { handleApiError } from "@/lib/api-error";
import type { SessionStatus } from "@/lib/live/types";

export const maxDuration = 10;

// POST /api/webhooks/recall — Receive bot status events from Recall.ai
export async function POST(request: NextRequest) {
  try {
    // ── Verify Svix webhook signature ──
    const rawBody = await request.text();
    const webhookSecret = process.env.RECALL_WEBHOOK_SECRET;
    const isDev = process.env.NODE_ENV === "development";

    const svixHeaders = {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    };

    if (webhookSecret && svixHeaders.svixId) {
      const isValid = verifySvixSignature(rawBody, svixHeaders, webhookSecret);
      if (!isValid) {
        if (isDev) {
          console.warn("[recall-webhook] Svix signature invalid — BYPASSED in dev mode");
        } else {
          return NextResponse.json(
            { error: "Invalid webhook signature" },
            { status: 401 }
          );
        }
      }
    } else if (!isDev) {
      // In production, require signature verification
      console.error("[recall-webhook] Missing webhook secret or Svix headers");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    let updateData: Record<string, unknown> = {};
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

    // ── Update session in DB ──
    await prisma.liveSession.update({
      where: { id: session.id },
      data: {
        status: newStatus,
        ...updateData,
      },
    });

    // ── Publish Ably session status event ──
    await publishSessionStatus(session.id, {
      status: newStatus,
      message: ablyMessage,
    });

    // ── Fire-and-forget: trigger post-call report on call end ──
    if (newStatus === "processing") {
      try {
        import("@/lib/live/post-call-generator").then((mod) => {
          mod.generateAndSavePostCallReport(session.id).catch((err: unknown) => {
            console.error(
              `[recall-webhook] Post-call report failed for session ${session.id}:`,
              err
            );
          });
        });
      } catch (err) {
        console.error(
          `[recall-webhook] Failed to import post-call-generator for session ${session.id}:`,
          err
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "process recall webhook");
  }
}
