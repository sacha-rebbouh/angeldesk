import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCurrentFacts, getCurrentFactsByCategory } from "@/services/fact-store/current-facts";
import type { FactCategory } from "@/services/fact-store/types";
import type { Prisma } from "@prisma/client";

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);

  if (!record || now > record.resetAt) {
    requestCounts.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const VALID_CATEGORIES: FactCategory[] = [
  'FINANCIAL',
  'TEAM',
  'MARKET',
  'PRODUCT',
  'LEGAL',
  'COMPETITION',
  'TRACTION',
  'OTHER',
];

const querySchema = z.object({
  category: z.enum(['FINANCIAL', 'TEAM', 'MARKET', 'PRODUCT', 'LEGAL', 'COMPETITION', 'TRACTION', 'OTHER']).optional(),
  includeHistory: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
});

const overrideSchema = z.object({
  factKey: z.string().min(1, "factKey is required"),
  value: z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.array(z.string()),
    z.record(z.string(), z.unknown()),
  ]),
  displayValue: z.string().min(1, "displayValue is required"),
  reason: z.string().min(1, "reason is required"),
});

// ============================================================================
// GET /api/facts/[dealId] - List current facts for a deal
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Rate limit check
    const rateLimitKey = `facts:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Validate dealId format
    if (!dealId || dealId.length < 10) {
      return NextResponse.json(
        { error: "Invalid deal ID" },
        { status: 400 }
      );
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Parse query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const queryResult = querySchema.safeParse(searchParams);

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { category, includeHistory } = queryResult.data;

    // Use the service to get current facts
    const facts = category
      ? await getCurrentFactsByCategory(dealId, category)
      : await getCurrentFacts(dealId);

    // Transform to API response format (optionally strip eventHistory)
    const responseFacts = facts.map((fact) => ({
      dealId: fact.dealId,
      factKey: fact.factKey,
      category: fact.category,
      currentValue: fact.currentValue,
      currentDisplayValue: fact.currentDisplayValue,
      currentSource: fact.currentSource,
      currentConfidence: fact.currentConfidence,
      isDisputed: fact.isDisputed,
      disputeDetails: fact.disputeDetails,
      ...(includeHistory ? { eventHistory: fact.eventHistory } : {}),
      firstSeenAt: fact.firstSeenAt,
      lastUpdatedAt: fact.lastUpdatedAt,
    }));

    return NextResponse.json({
      data: {
        dealId,
        factsCount: responseFacts.length,
        facts: responseFacts,
      },
    });
  } catch (error) {
    console.error("Error fetching facts:", error);
    return NextResponse.json(
      { error: "Failed to fetch facts" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/facts/[dealId] - BA Override of a fact
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Rate limit check
    const rateLimitKey = `facts:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate dealId format
    if (!dealId || dealId.length < 10) {
      return NextResponse.json(
        { error: "Invalid deal ID" },
        { status: 400 }
      );
    }

    // Validate body
    const parseResult = overrideSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { factKey, value, displayValue, reason } = parseResult.data;

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Get the category from the factKey (e.g., "financial.arr" -> "FINANCIAL")
    const categoryFromKey = factKey.split('.')[0]?.toUpperCase();
    const category = VALID_CATEGORIES.includes(categoryFromKey as FactCategory)
      ? categoryFromKey
      : 'OTHER';

    // Find the existing fact event to supersede (if any)
    const existingFact = await prisma.factEvent.findFirst({
      where: {
        dealId,
        factKey,
        eventType: {
          notIn: ['DELETED', 'SUPERSEDED'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Use a transaction to create the new event and supersede the old one
    const result = await prisma.$transaction(async (tx) => {
      // If there's an existing fact, mark it as superseded
      if (existingFact) {
        await tx.factEvent.update({
          where: { id: existingFact.id },
          data: { eventType: 'SUPERSEDED' },
        });
      }

      // Create the new BA_OVERRIDE event
      const newEvent = await tx.factEvent.create({
        data: {
          dealId,
          factKey,
          category,
          value: value as Prisma.InputJsonValue,
          displayValue,
          source: 'BA_OVERRIDE',
          sourceConfidence: 100, // BA override has max confidence
          eventType: existingFact ? 'SUPERSEDED' : 'CREATED',
          supersedesEventId: existingFact?.id,
          createdBy: user.id,
          reason,
        },
      });

      // Correct the eventType for the new event (it should be CREATED)
      const correctedEvent = await tx.factEvent.update({
        where: { id: newEvent.id },
        data: { eventType: 'CREATED' },
      });

      return correctedEvent;
    });

    return NextResponse.json({
      data: {
        id: result.id,
        dealId,
        factKey,
        category: result.category,
        value: result.value,
        displayValue: result.displayValue,
        source: result.source,
        sourceConfidence: result.sourceConfidence,
        eventType: result.eventType,
        supersedesEventId: result.supersedesEventId,
        createdAt: result.createdAt,
        createdBy: result.createdBy,
        reason: result.reason,
      },
    });
  } catch (error) {
    console.error("Error creating fact override:", error);
    return NextResponse.json(
      { error: "Failed to create fact override" },
      { status: 500 }
    );
  }
}
