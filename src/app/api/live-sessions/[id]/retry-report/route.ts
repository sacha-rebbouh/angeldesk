import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { handleApiError } from "@/lib/api-error";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/retry-report — Retry report generation for failed sessions
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

    if (session.status !== "failed" && session.status !== "processing") {
      return NextResponse.json(
        {
          error: `Cannot retry report from status "${session.status}". Must be "failed" or "processing".`,
        },
        { status: 400 }
      );
    }

    // Delete existing failed summary if any (to avoid unique constraint violation)
    await prisma.sessionSummary.deleteMany({
      where: { sessionId: id },
    });

    // Reset status to processing
    await prisma.liveSession.update({
      where: { id },
      data: {
        status: "processing",
        errorMessage: null,
      },
    });

    await publishSessionStatus(id, {
      status: "processing",
      message: "Relance de la génération du rapport...",
    });

    // Fire-and-forget: generate report
    try {
      import("@/lib/live/post-call-generator").then((mod) => {
        mod.generateAndSavePostCallReport(id).catch((err: unknown) => {
          console.error(`[retry-report] Post-call report failed for session ${id}:`, err);
        });
      });
    } catch (err) {
      console.error(`[retry-report] Failed to import post-call-generator for session ${id}:`, err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "retry post-call report");
  }
}
