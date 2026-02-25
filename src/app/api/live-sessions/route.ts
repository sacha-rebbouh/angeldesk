import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, isValidCuid } from "@/lib/sanitize";
import { detectPlatform } from "@/lib/live/recall-client";
import { handleApiError } from "@/lib/api-error";

const createSessionSchema = z.object({
  dealId: z.string().optional(),
  meetingUrl: z.string().url("Invalid meeting URL"),
  language: z.string().optional(),
});

// POST /api/live-sessions — Create a new live session
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 10 session creations per minute
    const rateLimit = checkRateLimit(`live-sessions-post:${user.id}`, {
      maxRequests: 10,
      windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const body = await request.json();
    const validatedData = createSessionSchema.parse(body);

    // Detect meeting platform from URL
    const platform = detectPlatform(validatedData.meetingUrl);
    if (!platform) {
      return NextResponse.json(
        { error: "Unsupported meeting platform. Supported: Zoom, Google Meet, Microsoft Teams." },
        { status: 400 }
      );
    }

    // Check max 1 active session per user
    const activeSession = await prisma.liveSession.findFirst({
      where: {
        userId: user.id,
        status: { in: ["created", "bot_joining", "live"] },
      },
    });
    if (activeSession) {
      return NextResponse.json(
        { error: "You already have an active session. Stop it before creating a new one." },
        { status: 400 }
      );
    }

    // Check max 3 sessions per rolling 24h (consistent with live-session-limits.ts)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.liveSession.count({
      where: {
        userId: user.id,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });
    if (recentCount >= 50) {
      return NextResponse.json(
        { error: "Daily session limit reached (50 per 24h)." },
        { status: 400 }
      );
    }

    // If dealId provided, verify it exists and belongs to user
    if (validatedData.dealId) {
      if (!isValidCuid(validatedData.dealId)) {
        return NextResponse.json(
          { error: "Invalid deal ID format" },
          { status: 400 }
        );
      }

      const deal = await prisma.deal.findFirst({
        where: {
          id: validatedData.dealId,
          userId: user.id,
        },
      });
      if (!deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 }
        );
      }
    }

    const session = await prisma.liveSession.create({
      data: {
        dealId: validatedData.dealId ?? null,
        userId: user.id,
        meetingUrl: validatedData.meetingUrl,
        meetingPlatform: platform,
        language: validatedData.language ?? "fr-en",
        status: "created",
      },
    });

    return NextResponse.json({ data: session }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create live session");
  }
}

// GET /api/live-sessions — List sessions for the current user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 60 requests per minute
    const rateLimit = checkRateLimit(`live-sessions-get:${user.id}`, {
      maxRequests: 60,
      windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const dealId = searchParams.get("dealId");
    const status = searchParams.get("status");
    const includeSummary = searchParams.get("includeSummary") === "true";

    // Validate dealId if provided
    if (dealId && !isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const where = {
      userId: user.id,
      ...(dealId && { dealId }),
      ...(status && { status }),
    };

    const sessions = await prisma.liveSession.findMany({
      where,
      include: {
        summary: includeSummary ? true : undefined,
        coachingCards: true, // Always include cards
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    return handleApiError(error, "fetch live sessions");
  }
}
