import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, isValidCuid } from "@/lib/sanitize";
import { detectPlatform } from "@/lib/live/recall-client";
import { canStartLiveSession } from "@/services/live-session-limits";
import { checkCredits } from "@/services/credits";
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

    // Check session limits (max 1 active + max 3 per 24h)
    const limitCheck = await canStartLiveSession(user.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.reason },
        { status: 429 }
      );
    }

    // Check credits (LIVE_COACHING = 8 credits, deducted on /start)
    const creditCheck = await checkCredits(user.id, 'LIVE_COACHING');
    if (!creditCheck.allowed) {
      return NextResponse.json(
        {
          error: `Crédits insuffisants (${creditCheck.balance} disponibles, ${creditCheck.cost} requis)`,
          creditCheck,
        },
        { status: 402 }
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

    const includeCards = searchParams.get("includeCards") === "true";

    const sessions = await prisma.liveSession.findMany({
      where,
      include: {
        summary: includeSummary ? true : undefined,
        coachingCards: includeCards ? true : undefined,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    return handleApiError(error, "fetch live sessions");
  }
}
