// ============================================================================
// CREDIT FLOW E2E TEST
// Simulates the full credit lifecycle: 100 credits → all actions → verify
// balance at each step, including refunds and edge cases.
//
// Mocks Prisma at the transaction level to test the real logic of
// checkCredits, deductCredits, addCredits, refundCredits, getCreditBalance.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CREDIT_COSTS,
  type CreditActionType,
  getActionForAnalysisType,
} from '../types';

// ============================================================================
// In-memory credit store (replaces Prisma)
// ============================================================================

interface InMemoryBalance {
  userId: string;
  balance: number;
  totalPurchased: number;
  lastPackName: string | null;
  freeCreditsGranted: boolean;
  autoRefill: boolean;
  autoRefillPackName: string | null;
  expiresAt: Date | null;
}

interface InMemoryTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  action: string;
  description: string | null;
  dealId: string | null;
  packName: string | null;
  stripePaymentId: string | null;
  createdAt: Date;
}

let balances: Map<string, InMemoryBalance>;
let transactions: InMemoryTransaction[];
let txIdCounter: number;

function resetStore() {
  balances = new Map();
  transactions = [];
  txIdCounter = 0;
}

function nextId() {
  return `tx_${++txIdCounter}`;
}

// ============================================================================
// Mock Prisma
// ============================================================================

const mockTx = {
  userCreditBalance: {
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const record = balances.get(where.userId);
      // Return a shallow copy to avoid mutation issues (Prisma returns independent objects)
      return record ? { ...record } : null;
    }),
    create: vi.fn(async ({ data }: { data: Partial<InMemoryBalance> }) => {
      const record: InMemoryBalance = {
        userId: data.userId!,
        balance: data.balance ?? 0,
        totalPurchased: data.totalPurchased ?? 0,
        lastPackName: data.lastPackName ?? null,
        freeCreditsGranted: data.freeCreditsGranted ?? false,
        autoRefill: false,
        autoRefillPackName: null,
        expiresAt: data.expiresAt ?? null,
      };
      balances.set(record.userId, record);
      return record;
    }),
    update: vi.fn(async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
      const record = balances.get(where.userId);
      if (!record) throw new Error(`Balance not found for ${where.userId}`);
      if (data.balance !== undefined) {
        if (typeof data.balance === 'object' && data.balance !== null) {
          const op = data.balance as { increment?: number; decrement?: number };
          if (op.increment) record.balance += op.increment;
          if (op.decrement) record.balance -= op.decrement;
        } else {
          record.balance = data.balance as number;
        }
      }
      return record;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const userId = where.userId as string;
      const record = balances.get(userId);
      if (!record) return { count: 0 };

      // Check balance constraint
      const balanceConstraint = where.balance as { gte?: number } | undefined;
      if (balanceConstraint?.gte !== undefined && record.balance < balanceConstraint.gte) {
        return { count: 0 };
      }

      if (data.balance !== undefined) {
        if (typeof data.balance === 'object' && data.balance !== null) {
          const op = data.balance as { increment?: number; decrement?: number };
          if (op.increment) record.balance += op.increment;
          if (op.decrement) record.balance -= op.decrement;
        } else {
          record.balance = data.balance as number;
        }
      }
      return { count: 1 };
    }),
    upsert: vi.fn(async ({ where, create, update }: {
      where: { userId: string };
      create: Partial<InMemoryBalance>;
      update: Record<string, unknown>;
    }) => {
      const existing = balances.get(where.userId);
      if (!existing) {
        const record: InMemoryBalance = {
          userId: where.userId,
          balance: (create.balance as number) ?? 0,
          totalPurchased: (create.totalPurchased as number) ?? 0,
          lastPackName: (create.lastPackName as string) ?? null,
          freeCreditsGranted: (create.freeCreditsGranted as boolean) ?? false,
          autoRefill: false,
          autoRefillPackName: null,
          expiresAt: (create.expiresAt as Date) ?? null,
        };
        balances.set(where.userId, record);
        return record;
      }
      // Apply update
      if (update.balance !== undefined) {
        if (typeof update.balance === 'object' && update.balance !== null) {
          const op = update.balance as { increment?: number; decrement?: number };
          if (op.increment) existing.balance += op.increment;
          if (op.decrement) existing.balance -= op.decrement;
        }
      }
      if (update.totalPurchased !== undefined) {
        if (typeof update.totalPurchased === 'object' && update.totalPurchased !== null) {
          const op = update.totalPurchased as { increment?: number };
          if (op.increment) existing.totalPurchased += op.increment;
        }
      }
      if (update.lastPackName !== undefined) existing.lastPackName = update.lastPackName as string;
      if (update.freeCreditsGranted !== undefined) existing.freeCreditsGranted = update.freeCreditsGranted as boolean;
      if (update.expiresAt !== undefined) existing.expiresAt = update.expiresAt as Date;
      return existing;
    }),
  },
  creditTransaction: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return transactions.find(
        (tx) =>
          tx.userId === where.userId &&
          tx.dealId === where.dealId &&
          tx.action === where.action
      ) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const tx: InMemoryTransaction = {
        id: nextId(),
        userId: data.userId as string,
        amount: data.amount as number,
        balanceAfter: data.balanceAfter as number,
        action: data.action as string,
        description: (data.description as string) ?? null,
        dealId: (data.dealId as string) ?? null,
        packName: (data.packName as string) ?? null,
        stripePaymentId: (data.stripePaymentId as string) ?? null,
        createdAt: new Date(),
      };
      transactions.push(tx);
      return tx;
    }),
  },
};

// Mock prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userCreditBalance: {
      findUnique: (...args: unknown[]) => mockTx.userCreditBalance.findUnique(...args as [never]),
      create: (...args: unknown[]) => mockTx.userCreditBalance.create(...args as [never]),
    },
    $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  },
}));

// Import AFTER mocking
const {
  checkCredits,
  deductCredits,
  addCredits,
  grantFreeCredits,
  refundCredits,
  getCreditBalance,
} = await import('../usage-gate');

// ============================================================================
// HELPERS
// ============================================================================

const USER = 'user_test_100';
const DEAL = 'deal_test_001';

function getBalance(): number {
  return balances.get(USER)?.balance ?? 0;
}

function getTransactionLog(): { action: string; amount: number; balanceAfter: number }[] {
  return transactions
    .filter((t) => t.userId === USER)
    .map((t) => ({ action: t.action, amount: t.amount, balanceAfter: t.balanceAfter }));
}

// ============================================================================
// TESTS
// ============================================================================

describe('Credit Flow E2E — 100 credits full lifecycle', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // SETUP: User starts with 100 credits from a Pro pack purchase
  // --------------------------------------------------------------------------

  async function setupUser() {
    const result = await addCredits(USER, 'pro', 100, 'stripe_pi_test');
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(100);
    expect(getBalance()).toBe(100);
  }

  // --------------------------------------------------------------------------
  // TEST 1: Full happy path — simulate a typical BA workflow
  // --------------------------------------------------------------------------

  it('should correctly deduct credits through a full BA workflow', async () => {
    await setupUser();
    let bal = 100;

    // Step 1: Quick Scan (1 credit) — first deal screening
    const qs1 = await deductCredits(USER, 'QUICK_SCAN', 'deal_001');
    bal -= CREDIT_COSTS.QUICK_SCAN; // 100 - 1 = 99
    expect(qs1.success).toBe(true);
    expect(qs1.balanceAfter).toBe(bal);
    expect(getBalance()).toBe(bal);

    // Step 2: Quick Scan (1 credit) — second deal screening
    const qs2 = await deductCredits(USER, 'QUICK_SCAN', 'deal_002');
    bal -= CREDIT_COSTS.QUICK_SCAN; // 99 - 1 = 98
    expect(qs2.success).toBe(true);
    expect(qs2.balanceAfter).toBe(bal);

    // Step 3: Deep Dive on deal_001 (5 credits) — the deal looks promising
    const dd1 = await deductCredits(USER, 'DEEP_DIVE', 'deal_001');
    bal -= CREDIT_COSTS.DEEP_DIVE; // 98 - 5 = 93
    expect(dd1.success).toBe(true);
    expect(dd1.balanceAfter).toBe(bal);

    // Step 4: AI Board on deal_001 (10 credits) — want multi-model opinion
    const board = await deductCredits(USER, 'AI_BOARD', 'deal_001');
    bal -= CREDIT_COSTS.AI_BOARD; // 93 - 10 = 83
    expect(board.success).toBe(true);
    expect(board.balanceAfter).toBe(bal);

    // Step 5: Live Coaching for founder call (8 credits)
    const coaching = await deductCredits(USER, 'LIVE_COACHING', 'deal_001');
    bal -= CREDIT_COSTS.LIVE_COACHING; // 83 - 8 = 75
    expect(coaching.success).toBe(true);
    expect(coaching.balanceAfter).toBe(bal);

    // Step 6: Re-analysis after founder call (3 credits)
    const reanalysis = await deductCredits(USER, 'RE_ANALYSIS', 'deal_001');
    bal -= CREDIT_COSTS.RE_ANALYSIS; // 75 - 3 = 72
    expect(reanalysis.success).toBe(true);
    expect(reanalysis.balanceAfter).toBe(bal);

    // Step 7: Chat (free) — ask follow-up questions
    const chat = await deductCredits(USER, 'CHAT', 'deal_001');
    expect(chat.success).toBe(true);
    // Balance unchanged (CHAT = 0)
    expect(getBalance()).toBe(bal);

    // Step 8: PDF Export (free) — generate DD report
    const pdf = await deductCredits(USER, 'PDF_EXPORT', 'deal_001');
    expect(pdf.success).toBe(true);
    // Balance unchanged (PDF_EXPORT = 0)
    expect(getBalance()).toBe(bal);

    // Final balance should be 72
    const finalBalance = await getCreditBalance(USER);
    expect(finalBalance.balance).toBe(72);
    expect(finalBalance.totalPurchased).toBe(100);
    expect(finalBalance.lastPackName).toBe('pro');

    // Total spent: 1 + 1 + 5 + 10 + 8 + 3 = 28
    expect(100 - finalBalance.balance).toBe(28);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Full deal package (Deep Dive + Board + Coaching + Re-analysis)
  // --------------------------------------------------------------------------

  it('should correctly deduct a full deal package (26 credits)', async () => {
    await setupUser();

    const actions: { action: CreditActionType; cost: number }[] = [
      { action: 'DEEP_DIVE', cost: 5 },
      { action: 'AI_BOARD', cost: 10 },
      { action: 'LIVE_COACHING', cost: 8 },
      { action: 'RE_ANALYSIS', cost: 3 },
    ];

    let expectedBalance = 100;
    for (const { action, cost } of actions) {
      const result = await deductCredits(USER, action, DEAL);
      expectedBalance -= cost;
      expect(result.success).toBe(true);
      expect(result.balanceAfter).toBe(expectedBalance);
      expect(getBalance()).toBe(expectedBalance);
    }

    // Full deal package = 26 credits
    expect(100 - getBalance()).toBe(26);
    expect(getBalance()).toBe(74);
  });

  // --------------------------------------------------------------------------
  // TEST 3: checkCredits returns correct info without deducting
  // --------------------------------------------------------------------------

  it('checkCredits should preview cost without deducting', async () => {
    await setupUser();

    const check = await checkCredits(USER, 'DEEP_DIVE');
    expect(check.allowed).toBe(true);
    expect(check.balance).toBe(100);
    expect(check.cost).toBe(5);
    expect(check.balanceAfter).toBe(95);

    // Balance should NOT have changed
    expect(getBalance()).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Insufficient credits — deduction blocked
  // --------------------------------------------------------------------------

  it('should block deduction when credits are insufficient', async () => {
    // Setup with only 7 credits
    await addCredits(USER, 'starter', 7);

    // Live Coaching costs 8 — should fail
    const result = await deductCredits(USER, 'LIVE_COACHING', DEAL);
    expect(result.success).toBe(false);
    expect(result.error).toContain('insuffisants');

    // Balance unchanged
    expect(getBalance()).toBe(7);

    // checkCredits should also report not allowed
    const check = await checkCredits(USER, 'LIVE_COACHING');
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('INSUFFICIENT_CREDITS');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Refund restores balance correctly
  // --------------------------------------------------------------------------

  it('should correctly refund credits after failed action', async () => {
    await setupUser();

    // Deduct for Live Coaching
    const deduct = await deductCredits(USER, 'LIVE_COACHING', DEAL);
    expect(deduct.success).toBe(true);
    expect(getBalance()).toBe(92);

    // Bot deploy fails → refund
    await refundCredits(USER, 'LIVE_COACHING', DEAL);
    expect(getBalance()).toBe(100);

    // Transaction log should show deduction then refund
    const log = getTransactionLog();
    const deductTx = log.find((t) => t.action === 'LIVE_COACHING');
    const refundTx = log.find((t) => t.action === 'REFUND');
    expect(deductTx).toBeDefined();
    expect(deductTx!.amount).toBe(-8);
    expect(refundTx).toBeDefined();
    expect(refundTx!.amount).toBe(8);
    expect(refundTx!.balanceAfter).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Analysis type mapping
  // --------------------------------------------------------------------------

  it('getActionForAnalysisType should map correctly', () => {
    // Tier 1 types → QUICK_SCAN (1 credit)
    expect(getActionForAnalysisType('tier1_complete')).toBe('QUICK_SCAN');
    expect(getActionForAnalysisType('extraction')).toBe('QUICK_SCAN');

    // Tier 2/3 types → DEEP_DIVE (5 credits)
    expect(getActionForAnalysisType('full_analysis')).toBe('DEEP_DIVE');
    expect(getActionForAnalysisType('full_dd')).toBe('DEEP_DIVE');
    expect(getActionForAnalysisType('tier2_sector')).toBe('DEEP_DIVE');
    expect(getActionForAnalysisType('tier3_synthesis')).toBe('DEEP_DIVE');

    // Unknown → QUICK_SCAN (safe default)
    expect(getActionForAnalysisType('unknown_type')).toBe('QUICK_SCAN');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Free actions never deduct credits
  // --------------------------------------------------------------------------

  it('free actions (Chat, PDF) should never deduct', async () => {
    await setupUser();

    // Do 50 chats and 50 PDF exports
    for (let i = 0; i < 50; i++) {
      await deductCredits(USER, 'CHAT', DEAL);
      await deductCredits(USER, 'PDF_EXPORT', DEAL);
    }

    // Balance untouched
    expect(getBalance()).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Drain to zero — then everything should be blocked
  // --------------------------------------------------------------------------

  it('should drain to zero then block all paid actions', async () => {
    // Start with exactly 10 credits
    await addCredits(USER, 'starter', 10);

    // Quick Scan x10 = 10 credits (drains to 0)
    for (let i = 0; i < 10; i++) {
      const r = await deductCredits(USER, 'QUICK_SCAN', `deal_${i}`);
      expect(r.success).toBe(true);
    }
    expect(getBalance()).toBe(0);

    // Every paid action should now fail
    const actions: CreditActionType[] = [
      'QUICK_SCAN', 'DEEP_DIVE', 'AI_BOARD', 'LIVE_COACHING', 'RE_ANALYSIS',
    ];
    for (const action of actions) {
      const r = await deductCredits(USER, action, DEAL);
      expect(r.success).toBe(false);
    }

    // Free actions still work
    const chat = await deductCredits(USER, 'CHAT', DEAL);
    expect(chat.success).toBe(true);
    const pdf = await deductCredits(USER, 'PDF_EXPORT', DEAL);
    expect(pdf.success).toBe(true);

    // Balance still 0
    expect(getBalance()).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Multiple refunds don't create money from nothing
  // --------------------------------------------------------------------------

  it('refund should add exactly the action cost', async () => {
    await setupUser();

    // Deduct a Deep Dive (5)
    await deductCredits(USER, 'DEEP_DIVE', DEAL);
    expect(getBalance()).toBe(95);

    // Refund once → 100
    await refundCredits(USER, 'DEEP_DIVE', DEAL);
    expect(getBalance()).toBe(100);

    // Refund again (double refund scenario — idempotence check prevents over-refund)
    await refundCredits(USER, 'DEEP_DIVE', DEAL);
    expect(getBalance()).toBe(100); // Stays at 100 — second refund is correctly skipped
  });

  // --------------------------------------------------------------------------
  // TEST 10: Free credits grant
  // --------------------------------------------------------------------------

  it('grantFreeCredits should give 5 credits exactly once', async () => {
    const granted1 = await grantFreeCredits(USER);
    expect(granted1).toBe(true);
    expect(getBalance()).toBe(5);

    // Second grant should be blocked
    const granted2 = await grantFreeCredits(USER);
    expect(granted2).toBe(false);
    expect(getBalance()).toBe(5);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Exact boundary — have exactly the cost
  // --------------------------------------------------------------------------

  it('should succeed when balance equals exact cost', async () => {
    await addCredits(USER, 'starter', 10);

    const check = await checkCredits(USER, 'AI_BOARD'); // costs 10
    expect(check.allowed).toBe(true);
    expect(check.balanceAfter).toBe(0);

    const deduct = await deductCredits(USER, 'AI_BOARD', DEAL);
    expect(deduct.success).toBe(true);
    expect(deduct.balanceAfter).toBe(0);
    expect(getBalance()).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Full simulation — real BA scenario over 3 deals
  // --------------------------------------------------------------------------

  it('should handle a realistic 3-deal scenario with correct final balance', async () => {
    await setupUser(); // 100 credits

    // ── Deal A: Quick screening only ──
    await deductCredits(USER, 'QUICK_SCAN', 'deal_A');       // -1 → 99

    // ── Deal B: Full DD pipeline ──
    await deductCredits(USER, 'QUICK_SCAN', 'deal_B');       // -1 → 98
    await deductCredits(USER, 'DEEP_DIVE', 'deal_B');        // -5 → 93
    await deductCredits(USER, 'AI_BOARD', 'deal_B');         // -10 → 83
    await deductCredits(USER, 'LIVE_COACHING', 'deal_B');    // -8 → 75
    await deductCredits(USER, 'RE_ANALYSIS', 'deal_B');      // -3 → 72
    await deductCredits(USER, 'CHAT', 'deal_B');             // 0 → 72
    await deductCredits(USER, 'PDF_EXPORT', 'deal_B');       // 0 → 72

    // ── Deal C: Deep Dive + Board fails (refund) + retry Board ──
    await deductCredits(USER, 'QUICK_SCAN', 'deal_C');       // -1 → 71
    await deductCredits(USER, 'DEEP_DIVE', 'deal_C');        // -5 → 66
    // Board deducted...
    await deductCredits(USER, 'AI_BOARD', 'deal_C');         // -10 → 56
    // ...but Board crashed → refund
    await refundCredits(USER, 'AI_BOARD', 'deal_C');         // +10 → 66
    // Retry Board → success
    await deductCredits(USER, 'AI_BOARD', 'deal_C');         // -10 → 56

    expect(getBalance()).toBe(56);

    // Verify total spent: 100 - 56 = 44
    // Deal A: 1
    // Deal B: 1 + 5 + 10 + 8 + 3 = 27
    // Deal C: 1 + 5 + 10 (refund) + 10 = 16
    // Total: 1 + 27 + 16 = 44
    expect(100 - getBalance()).toBe(44);

    // Verify transaction log
    const log = getTransactionLog();
    // Free actions (Chat, PDF_EXPORT) don't create transactions (cost = 0, early return)
    // Paid deductions: QS(A) + QS(B) + DD(B) + Board(B) + Coaching(B) + RA(B)
    //                + QS(C) + DD(C) + Board(C) [failed] + Board(C) [retry] = 10
    const nonFree = log.filter((t) => t.action !== 'PURCHASE');
    const deductions = nonFree.filter((t) => t.amount < 0);
    const refunds = nonFree.filter((t) => t.amount > 0);
    expect(deductions.length).toBe(10); // 10 paid deductions
    expect(refunds.length).toBe(1);     // 1 refund (failed Board)
  });

  // --------------------------------------------------------------------------
  // TEST 13: Verify each API route's credit mapping
  // --------------------------------------------------------------------------

  describe('API route credit mapping', () => {
    it('POST /api/analyze (tier1_complete) → QUICK_SCAN = 1 credit', async () => {
      await setupUser();
      const action = getActionForAnalysisType('tier1_complete');
      expect(action).toBe('QUICK_SCAN');
      const r = await deductCredits(USER, action, DEAL);
      expect(r.success).toBe(true);
      expect(r.balanceAfter).toBe(99);
    });

    it('POST /api/analyze (full_analysis) → DEEP_DIVE = 5 credits', async () => {
      await setupUser();
      const action = getActionForAnalysisType('full_analysis');
      expect(action).toBe('DEEP_DIVE');
      const r = await deductCredits(USER, action, DEAL);
      expect(r.success).toBe(true);
      expect(r.balanceAfter).toBe(95);
    });

    it('POST /api/board → AI_BOARD = 10 credits', async () => {
      await setupUser();
      const r = await deductCredits(USER, 'AI_BOARD', DEAL);
      expect(r.success).toBe(true);
      expect(r.balanceAfter).toBe(90);
    });

    it('POST /api/live-sessions/[id]/start → LIVE_COACHING = 8 credits', async () => {
      await setupUser();
      const r = await deductCredits(USER, 'LIVE_COACHING', DEAL);
      expect(r.success).toBe(true);
      expect(r.balanceAfter).toBe(92);
    });

    it('POST /api/coaching/reanalyze (targeted/full) → RE_ANALYSIS = 3 credits', async () => {
      await setupUser();
      const r = await deductCredits(USER, 'RE_ANALYSIS', DEAL);
      expect(r.success).toBe(true);
      expect(r.balanceAfter).toBe(97);
    });

    it('POST /api/chat → CHAT = 0 credits (free)', async () => {
      await setupUser();
      const r = await deductCredits(USER, 'CHAT', DEAL);
      expect(r.success).toBe(true);
      expect(getBalance()).toBe(100); // Unchanged
    });

    it('GET /api/deals/[id]/export-pdf → PDF_EXPORT = 0 credits (free)', async () => {
      await setupUser();
      const r = await deductCredits(USER, 'PDF_EXPORT', DEAL);
      expect(r.success).toBe(true);
      expect(getBalance()).toBe(100); // Unchanged
    });
  });

  // --------------------------------------------------------------------------
  // TEST 14: Refund scenarios per API route
  // --------------------------------------------------------------------------

  describe('Refund scenarios', () => {
    it('Analysis crash → refund DEEP_DIVE', async () => {
      await setupUser();
      await deductCredits(USER, 'DEEP_DIVE', DEAL);
      expect(getBalance()).toBe(95);

      // orchestrator.runAnalysis() throws → .catch() refunds
      await refundCredits(USER, 'DEEP_DIVE', DEAL);
      expect(getBalance()).toBe(100);
    });

    it('Board crash → refund AI_BOARD', async () => {
      await setupUser();
      await deductCredits(USER, 'AI_BOARD', DEAL);
      expect(getBalance()).toBe(90);

      // BoardOrchestrator throws → refundCredit()
      await refundCredits(USER, 'AI_BOARD', DEAL);
      expect(getBalance()).toBe(100);
    });

    it('Bot deploy crash → refund LIVE_COACHING', async () => {
      await setupUser();
      await deductCredits(USER, 'LIVE_COACHING', DEAL);
      expect(getBalance()).toBe(92);

      // createBot() throws → refundCredits()
      await refundCredits(USER, 'LIVE_COACHING', DEAL);
      expect(getBalance()).toBe(100);
    });

    it('Re-analysis crash → refund RE_ANALYSIS', async () => {
      await setupUser();
      await deductCredits(USER, 'RE_ANALYSIS', DEAL);
      expect(getBalance()).toBe(97);

      // triggerTargetedReanalysis() throws → refundCredits()
      await refundCredits(USER, 'RE_ANALYSIS', DEAL);
      expect(getBalance()).toBe(100);
    });

    it('Chat refund is a no-op (cost = 0)', async () => {
      await setupUser();
      await refundCredits(USER, 'CHAT', DEAL);
      expect(getBalance()).toBe(100); // No change
    });

    it('PDF refund is a no-op (cost = 0)', async () => {
      await setupUser();
      await refundCredits(USER, 'PDF_EXPORT', DEAL);
      expect(getBalance()).toBe(100); // No change
    });
  });

  // --------------------------------------------------------------------------
  // TEST 15: Stress test — rapid concurrent deductions
  // --------------------------------------------------------------------------

  it('should handle rapid sequential deductions correctly', async () => {
    await setupUser();

    // 20 Quick Scans in rapid succession
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(await deductCredits(USER, 'QUICK_SCAN', `deal_${i}`));
    }

    // All should succeed
    expect(results.every((r) => r.success)).toBe(true);

    // Balance should be 100 - 20 = 80
    expect(getBalance()).toBe(80);

    // Each result should have correct descending balance
    for (let i = 0; i < 20; i++) {
      expect(results[i].balanceAfter).toBe(100 - (i + 1));
    }
  });

  // --------------------------------------------------------------------------
  // TEST 16: Add credits after spending — balance is cumulative
  // --------------------------------------------------------------------------

  it('should correctly add credits to an existing balance', async () => {
    await setupUser(); // 100

    // Spend 30
    await deductCredits(USER, 'DEEP_DIVE', 'deal_1');  // -5 → 95
    await deductCredits(USER, 'AI_BOARD', 'deal_1');   // -10 → 85
    await deductCredits(USER, 'LIVE_COACHING', 'deal_1'); // -8 → 77
    await deductCredits(USER, 'DEEP_DIVE', 'deal_2');  // -5 → 72
    await deductCredits(USER, 'RE_ANALYSIS', 'deal_2'); // -3 → 69
    expect(getBalance()).toBe(69);

    // Buy more credits
    const purchase = await addCredits(USER, 'standard', 30);
    expect(purchase.success).toBe(true);
    expect(purchase.newBalance).toBe(99);
    expect(getBalance()).toBe(99);

    // totalPurchased should be cumulative
    const info = await getCreditBalance(USER);
    expect(info.totalPurchased).toBe(130); // 100 + 30
    expect(info.lastPackName).toBe('standard');
  });
});
