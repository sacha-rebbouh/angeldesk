import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { leaveMeeting } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { generateAndSavePostCallReport } from "@/lib/live/post-call-generator";
import { handleApiError } from "@/lib/api-error";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/stop — Stop session and trigger post-call report
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify ownership
    const session = await prisma.liveSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "live" && session.status !== "bot_joining") {
      return NextResponse.json(
        {
          error: `Session cannot be stopped from status "${session.status}". Must be "live" or "bot_joining".`,
        },
        { status: 400 }
      );
    }

    // Ask bot to leave the meeting (if botId exists)
    // Gracefully handle 404 (bot already left or was on wrong region)
    if (session.botId) {
      try {
        await leaveMeeting(session.botId);
      } catch (err) {
        console.warn(`[stop] leaveMeeting failed for bot ${session.botId}:`, err instanceof Error ? err.message : err);
      }
    }

    // Atomic status transition: only update if still live/bot_joining (prevents race with recall webhook)
    const updatedSession = await prisma.liveSession.updateMany({
      where: {
        id,
        status: { in: ["live", "bot_joining"] },
      },
      data: {
        status: "processing",
        endedAt: new Date(),
      },
    });

    if (updatedSession.count === 0) {
      // Already transitioned by recall webhook — return current state
      const current = await prisma.liveSession.findUnique({ where: { id } });
      return NextResponse.json({ data: current });
    }

    // Publish real-time status event
    await publishSessionStatus(id, {
      status: "processing",
      message: "Session ended. Generating post-call report...",
    });

    // Use after() to run post-call report generation (survives response sending on Vercel)
    after(async () => {
      try {
        await generateAndSavePostCallReport(id);
      } catch (err) {
        console.error(`[stop] Post-call report failed for session ${id}:`, err);
      }
    });

    const current = await prisma.liveSession.findUnique({ where: { id } });
    return NextResponse.json({ data: current });
  } catch (error) {
    return handleApiError(error, "stop live session");
  }
}
