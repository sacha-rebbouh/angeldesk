import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { CREDIT_COSTS, type CreditActionType, type CanPerformResult } from "@/services/credits/types";

// ============================================================================
// CONSTANTS
// ============================================================================

const MONTHLY_ALLOCATION_FREE = 10;
const MONTHLY_ALLOCATION_PRO = 100;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get or create user credits record
 */
async function getOrCreateUserCredits(clerkUserId: string, isPro: boolean) {
  const existing = await prisma.userCredits.findUnique({
    where: { clerkUserId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (existing) {
    // Check if we need to reset monthly credits
    const now = new Date();
    if (now >= existing.nextResetAt) {
      // Reset credits
      const monthlyAllocation = isPro ? MONTHLY_ALLOCATION_PRO : MONTHLY_ALLOCATION_FREE;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);

      // Update credits and create transaction separately
      await prisma.userCredits.update({
        where: { clerkUserId },
        data: {
          balance: monthlyAllocation,
          monthlyAllocation,
          lastResetAt: now,
          nextResetAt: nextReset,
        },
      });

      // Create the reset transaction
      await prisma.creditTransaction.create({
        data: {
          clerkUserId,
          type: 'MONTHLY_RESET',
          amount: monthlyAllocation,
          description: `Monthly credit reset (${isPro ? 'PRO' : 'FREE'} plan)`,
        },
      });

      // Fetch updated with transactions
      const updated = await prisma.userCredits.findUnique({
        where: { clerkUserId },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      return updated!;
    }

    return existing;
  }

  // Create new record
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);
  nextReset.setHours(0, 0, 0, 0);

  const monthlyAllocation = isPro ? MONTHLY_ALLOCATION_PRO : MONTHLY_ALLOCATION_FREE;

  // Create credits record
  await prisma.userCredits.create({
    data: {
      clerkUserId,
      balance: monthlyAllocation,
      monthlyAllocation,
      lastResetAt: now,
      nextResetAt: nextReset,
    },
  });

  // Create initial transaction
  await prisma.creditTransaction.create({
    data: {
      clerkUserId,
      type: 'MONTHLY_RESET',
      amount: monthlyAllocation,
      description: `Initial credit allocation (${isPro ? 'PRO' : 'FREE'} plan)`,
    },
  });

  // Fetch with transactions
  const created = await prisma.userCredits.findUnique({
    where: { clerkUserId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  return created!;
}

/**
 * Check if user can perform an action (without consuming credits)
 */
function checkCanPerform(
  balance: number,
  action: keyof typeof CREDIT_COSTS,
  resetsAt: Date
): CanPerformResult {
  const cost = CREDIT_COSTS[action];

  if (cost === undefined) {
    return {
      allowed: false,
      reason: 'UPGRADE_REQUIRED',
      currentBalance: balance,
    };
  }

  if (balance >= cost) {
    return {
      allowed: true,
      reason: 'OK',
      currentBalance: balance,
      cost,
      resetsAt,
    };
  }

  return {
    allowed: false,
    reason: 'INSUFFICIENT_CREDITS',
    currentBalance: balance,
    cost,
    resetsAt,
  };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const checkSchema = z.object({
  action: z.enum(['INITIAL_ANALYSIS', 'UPDATE_ANALYSIS', 'AI_BOARD']),
});

// ============================================================================
// GET /api/credits - Get user's credit balance and info
// ============================================================================

export async function GET() {
  try {
    const user = await requireAuth();
    const isPro = user.subscriptionStatus === 'PRO' || user.subscriptionStatus === 'ENTERPRISE';

    const credits = await getOrCreateUserCredits(user.clerkId, isPro);

    return NextResponse.json({
      data: {
        userId: user.id,
        clerkUserId: user.clerkId,
        balance: credits.balance,
        monthlyAllocation: credits.monthlyAllocation,
        lastResetAt: credits.lastResetAt.toISOString(),
        nextResetAt: credits.nextResetAt.toISOString(),
        plan: isPro ? 'PRO' : 'FREE',
        costs: CREDIT_COSTS,
        recentTransactions: credits.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          dealId: t.dealId,
          analysisId: t.analysisId,
          createdAt: t.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching credits:", error);
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/credits - Check if action is possible (without consuming)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    // Validate body
    const parseResult = checkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { action } = parseResult.data;
    const isPro = user.subscriptionStatus === 'PRO' || user.subscriptionStatus === 'ENTERPRISE';

    const credits = await getOrCreateUserCredits(user.clerkId, isPro);
    const result = checkCanPerform(credits.balance, action, credits.nextResetAt);

    return NextResponse.json({
      data: {
        ...result,
        resetsAt: result.resetsAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error checking credits:", error);
    return NextResponse.json(
      { error: "Failed to check credits" },
      { status: 500 }
    );
  }
}
