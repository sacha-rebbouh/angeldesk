import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { generateAblyToken } from "@/lib/live/ably-server";

// GET /api/coaching/ably-token?sessionId=xxx — Generate scoped Ably token for real-time
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing required query parameter: sessionId" },
        { status: 400 }
      );
    }

    if (!isValidCuid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify session exists and belongs to user
    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    const tokenDetails = await generateAblyToken(sessionId, user.id);

    return NextResponse.json({ data: tokenDetails });
  } catch (error) {
    return handleApiError(error, "generate Ably token");
  }
}
