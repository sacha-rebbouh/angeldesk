import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import type { FactCategory } from "@/services/fact-store/types";
import type { Prisma } from "@prisma/client";

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
  value: z.unknown(),
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

    // Build the where clause
    const whereClause: {
      dealId: string;
      category?: string;
      eventType?: string;
    } = {
      dealId,
    };

    if (category) {
      whereClause.category = category;
    }

    // Get fact events
    const factEvents = await prisma.factEvent.findMany({
      where: whereClause,
      orderBy: [
        { factKey: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Group facts by factKey and compute current state
    const factsByKey = new Map<string, typeof factEvents>();

    for (const event of factEvents) {
      const existing = factsByKey.get(event.factKey) || [];
      existing.push(event);
      factsByKey.set(event.factKey, existing);
    }

    // Build current facts response
    const currentFacts: Array<{
      dealId: string;
      factKey: string;
      category: string;
      currentValue: unknown;
      currentDisplayValue: string;
      currentSource: string;
      currentConfidence: number;
      isDisputed: boolean;
      disputeDetails?: {
        conflictingValue: unknown;
        conflictingSource: string;
      };
      eventHistory?: Array<{
        id: string;
        eventType: string;
        value: unknown;
        displayValue: string;
        source: string;
        sourceConfidence: number;
        createdAt: Date;
        createdBy: string;
        reason?: string | null;
      }>;
      firstSeenAt: Date;
      lastUpdatedAt: Date;
    }> = [];

    for (const [factKey, events] of factsByKey) {
      // Sort by createdAt desc to get latest first
      const sortedEvents = events.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      // Find the current active event (latest non-DELETED, non-SUPERSEDED)
      const currentEvent = sortedEvents.find(
        (e) => e.eventType !== 'DELETED' && e.eventType !== 'SUPERSEDED'
      );

      if (!currentEvent) {
        // All events are deleted/superseded, skip this fact
        continue;
      }

      // Check for disputes
      const disputedEvents = sortedEvents.filter((e) => e.eventType === 'DISPUTED');
      const isDisputed = disputedEvents.length > 0;

      const fact: typeof currentFacts[0] = {
        dealId,
        factKey,
        category: currentEvent.category,
        currentValue: currentEvent.value,
        currentDisplayValue: currentEvent.displayValue,
        currentSource: currentEvent.source,
        currentConfidence: currentEvent.sourceConfidence,
        isDisputed,
        firstSeenAt: sortedEvents[sortedEvents.length - 1].createdAt,
        lastUpdatedAt: currentEvent.createdAt,
      };

      if (isDisputed && disputedEvents[0]) {
        fact.disputeDetails = {
          conflictingValue: disputedEvents[0].value,
          conflictingSource: disputedEvents[0].source,
        };
      }

      if (includeHistory) {
        fact.eventHistory = sortedEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          value: e.value,
          displayValue: e.displayValue,
          source: e.source,
          sourceConfidence: e.sourceConfidence,
          createdAt: e.createdAt,
          createdBy: e.createdBy,
          reason: e.reason,
        }));
      }

      currentFacts.push(fact);
    }

    return NextResponse.json({
      data: {
        dealId,
        factsCount: currentFacts.length,
        facts: currentFacts,
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
          createdBy: 'ba',
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
