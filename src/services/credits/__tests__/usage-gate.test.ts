// ═══════════════════════════════════════════════════════════════════════
// USAGE GATE - CREDIT SYSTEM TESTS
// Tests for credit checking and usage recording
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsageGate } from '../usage-gate';
import { CREDIT_COSTS } from '../types';
import type { CreditActionType } from '../types';

// ═══════════════════════════════════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════════════════════════════════

// Mock the prisma client
const mockPrismaUser = {
  findFirst: vi.fn(),
};

const mockPrismaUserCredits = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockPrismaCreditTransaction = {
  create: vi.fn(),
  findMany: vi.fn(),
};

const mockPrismaTransaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => mockPrismaUser.findFirst(...args),
    },
    userCredits: {
      findUnique: (...args: unknown[]) => mockPrismaUserCredits.findUnique(...args),
      create: (...args: unknown[]) => mockPrismaUserCredits.create(...args),
      update: (...args: unknown[]) => mockPrismaUserCredits.update(...args),
    },
    creditTransaction: {
      create: (...args: unknown[]) => mockPrismaCreditTransaction.create(...args),
      findMany: (...args: unknown[]) => mockPrismaCreditTransaction.findMany(...args),
    },
    $transaction: (...args: unknown[]) => mockPrismaTransaction(...args),
  },
}));

// ═══════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════

function createMockUserCredits(overrides: Partial<{
  clerkUserId: string;
  balance: number;
  monthlyAllocation: number;
  lastResetAt: Date;
  nextResetAt: Date;
}> = {}) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  return {
    clerkUserId: 'user-123',
    balance: 10,
    monthlyAllocation: 10,
    lastResetAt: new Date(),
    nextResetAt: futureDate,
    ...overrides,
  };
}

function createMockUser(overrides: Partial<{
  clerkId: string;
  subscriptionStatus: string | null;
}> = {}) {
  return {
    clerkId: 'user-123',
    subscriptionStatus: 'FREE',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CREDIT_COSTS TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('CREDIT_COSTS', () => {
  it('should have INITIAL_ANALYSIS cost of 5', () => {
    expect(CREDIT_COSTS.INITIAL_ANALYSIS).toBe(5);
  });

  it('should have UPDATE_ANALYSIS cost of 2', () => {
    expect(CREDIT_COSTS.UPDATE_ANALYSIS).toBe(2);
  });

  it('should have AI_BOARD cost of 10', () => {
    expect(CREDIT_COSTS.AI_BOARD).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// UsageGate TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('UsageGate', () => {
  let usageGate: UsageGate;

  beforeEach(() => {
    usageGate = new UsageGate();
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.FORCE_PRO_USER;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // canPerform TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('canPerform', () => {
    it('should allow PRO users always', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'PRO' })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('OK');
      // PRO users don't need balance checks
      expect(mockPrismaUserCredits.findUnique).not.toHaveBeenCalled();
    });

    it('should allow ENTERPRISE users always', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'ENTERPRISE' })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('OK');
    });

    it('should allow FREE users with sufficient balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('OK');
      expect(result.currentBalance).toBe(10);
      expect(result.cost).toBe(5);
    });

    it('should deny FREE users with insufficient balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 2 })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_CREDITS');
      expect(result.currentBalance).toBe(2);
      expect(result.cost).toBe(5);
    });

    it('should deny FREE users with 0 balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 0 })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_CREDITS');
    });

    it('should create user credits if they do not exist', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      // First call returns null (no existing credits)
      mockPrismaUserCredits.findUnique.mockResolvedValueOnce(null);
      // After create
      mockPrismaUserCredits.create.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );
      // Second call after potential reset returns the created credits
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(mockPrismaUserCredits.create).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    it('should bypass credit checks when FORCE_PRO_USER env is set', async () => {
      process.env.FORCE_PRO_USER = 'true';
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );

      const result = await usageGate.canPerform('user-123', 'INITIAL_ANALYSIS');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('OK');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // recordUsage TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('recordUsage', () => {
    it('should not decrement balance for PRO users but still log', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'PRO' })
      );

      await usageGate.recordUsage('user-123', 'INITIAL_ANALYSIS', {
        dealId: 'deal-123',
      });

      expect(mockPrismaCreditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkUserId: 'user-123',
          type: 'INITIAL_ANALYSIS',
          amount: 0, // PRO users don't consume credits
          dealId: 'deal-123',
          description: expect.stringContaining('[PRO]'),
        }),
      });
      // No balance decrement for PRO users
      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });

    it('should decrement balance and create transaction for FREE users', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );

      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(createMockUserCredits({ balance: 10 })),
          update: vi.fn(),
        },
        creditTransaction: {
          create: vi.fn(),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await usageGate.recordUsage('user-123', 'INITIAL_ANALYSIS', {
        dealId: 'deal-123',
      });

      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(mockTx.userCredits.update).toHaveBeenCalledWith({
        where: { clerkUserId: 'user-123' },
        data: { balance: { decrement: 5 } },
      });
      expect(mockTx.creditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkUserId: 'user-123',
          type: 'INITIAL_ANALYSIS',
          amount: -5, // Negative for consumption
          dealId: 'deal-123',
        }),
      });
    });

    it('should throw error if user has insufficient balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );

      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(createMockUserCredits({ balance: 2 })),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await expect(
        usageGate.recordUsage('user-123', 'INITIAL_ANALYSIS')
      ).rejects.toThrow('Insufficient credits');
    });

    it('should throw error if UserCredits not found', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );

      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await expect(
        usageGate.recordUsage('user-123', 'INITIAL_ANALYSIS')
      ).rejects.toThrow('UserCredits not found');
    });

    it('should not record transaction for 0 cost actions', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );

      // MONTHLY_RESET has 0 cost
      await usageGate.recordUsage('user-123', 'MONTHLY_RESET');

      expect(mockPrismaTransaction).not.toHaveBeenCalled();
      expect(mockPrismaCreditTransaction.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // checkAndResetCredits TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('checkAndResetCredits', () => {
    it('should reset balance when nextResetAt is past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({
          balance: 3,
          monthlyAllocation: 10,
          nextResetAt: pastDate,
        })
      );

      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(
            createMockUserCredits({
              balance: 3,
              monthlyAllocation: 10,
              nextResetAt: pastDate,
            })
          ),
          update: vi.fn(),
        },
        creditTransaction: {
          create: vi.fn(),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await usageGate.checkAndResetCredits('user-123');

      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(mockTx.userCredits.update).toHaveBeenCalledWith({
        where: { clerkUserId: 'user-123' },
        data: expect.objectContaining({
          balance: 10, // Reset to monthlyAllocation
        }),
      });
      expect(mockTx.creditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'MONTHLY_RESET',
          amount: 10,
        }),
      });
    });

    it('should not reset if nextResetAt is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);

      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({
          balance: 5,
          nextResetAt: futureDate,
        })
      );

      await usageGate.checkAndResetCredits('user-123');

      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });

    it('should do nothing if user credits do not exist', async () => {
      mockPrismaUserCredits.findUnique.mockResolvedValue(null);

      await usageGate.checkAndResetCredits('user-123');

      expect(mockPrismaTransaction).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getOrCreateUserCredits TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('getOrCreateUserCredits', () => {
    it('should return existing credits if found', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 7 })
      );

      const result = await usageGate.getOrCreateUserCredits('user-123');

      expect(result.balance).toBe(7);
      expect(result.plan).toBe('FREE');
      expect(mockPrismaUserCredits.create).not.toHaveBeenCalled();
    });

    it('should create credits with default balance if not found', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(null);
      mockPrismaUserCredits.create.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );

      const result = await usageGate.getOrCreateUserCredits('user-123');

      expect(mockPrismaUserCredits.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkUserId: 'user-123',
          balance: 10,
          monthlyAllocation: 10,
        }),
      });
      expect(result.balance).toBe(10);
    });

    it('should set plan to PRO for pro users', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'PRO' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );

      const result = await usageGate.getOrCreateUserCredits('user-123');

      expect(result.plan).toBe('PRO');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // addBonusCredits TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('addBonusCredits', () => {
    it('should add bonus credits to existing balance', async () => {
      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(createMockUserCredits({ balance: 5 })),
          update: vi.fn(),
        },
        creditTransaction: {
          create: vi.fn(),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await usageGate.addBonusCredits('user-123', 10, 'Welcome bonus');

      expect(mockTx.userCredits.update).toHaveBeenCalledWith({
        where: { clerkUserId: 'user-123' },
        data: { balance: { increment: 10 } },
      });
      expect(mockTx.creditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'BONUS',
          amount: 10,
          description: 'Welcome bonus',
        }),
      });
    });

    it('should create credits if user does not have any', async () => {
      const mockTx = {
        userCredits: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        creditTransaction: {
          create: vi.fn(),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await usageGate.addBonusCredits('user-123', 5, 'New user bonus');

      expect(mockTx.userCredits.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkUserId: 'user-123',
          balance: 15, // Default 10 + 5 bonus
          monthlyAllocation: 10,
        }),
      });
    });

    it('should throw error for non-positive amount', async () => {
      await expect(
        usageGate.addBonusCredits('user-123', 0, 'Invalid bonus')
      ).rejects.toThrow('Bonus amount must be positive');

      await expect(
        usageGate.addBonusCredits('user-123', -5, 'Invalid bonus')
      ).rejects.toThrow('Bonus amount must be positive');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // refundCredits TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('refundCredits', () => {
    it('should add refund credits back to balance', async () => {
      const mockTx = {
        userCredits: {
          update: vi.fn(),
        },
        creditTransaction: {
          create: vi.fn(),
        },
      };
      mockPrismaTransaction.mockImplementation(async (fn) => fn(mockTx));

      await usageGate.refundCredits('user-123', 5, 'Analysis failed', {
        dealId: 'deal-123',
        analysisId: 'analysis-456',
      });

      expect(mockTx.userCredits.update).toHaveBeenCalledWith({
        where: { clerkUserId: 'user-123' },
        data: { balance: { increment: 5 } },
      });
      expect(mockTx.creditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'REFUND',
          amount: 5,
          dealId: 'deal-123',
          analysisId: 'analysis-456',
          description: 'Analysis failed',
        }),
      });
    });

    it('should throw error for non-positive amount', async () => {
      await expect(
        usageGate.refundCredits('user-123', 0, 'Invalid refund')
      ).rejects.toThrow('Refund amount must be positive');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getTransactionHistory TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('getTransactionHistory', () => {
    it('should return formatted transaction history', async () => {
      mockPrismaCreditTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          clerkUserId: 'user-123',
          type: 'INITIAL_ANALYSIS',
          amount: -5,
          dealId: 'deal-123',
          analysisId: null,
          description: 'Initial analysis for deal deal-123',
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'tx-2',
          clerkUserId: 'user-123',
          type: 'BONUS',
          amount: 10,
          dealId: null,
          analysisId: null,
          description: 'Welcome bonus',
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const result = await usageGate.getTransactionHistory('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('tx-1');
      expect(result[0].type).toBe('INITIAL_ANALYSIS');
      expect(result[0].amount).toBe(-5);
      expect(result[0].dealId).toBe('deal-123');
      expect(result[0].analysisId).toBeUndefined();
    });

    it('should respect limit parameter', async () => {
      mockPrismaCreditTransaction.findMany.mockResolvedValue([]);

      await usageGate.getTransactionHistory('user-123', 10);

      expect(mockPrismaCreditTransaction.findMany).toHaveBeenCalledWith({
        where: { clerkUserId: 'user-123' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getBalance TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('getBalance', () => {
    it('should return current balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 8 })
      );

      const result = await usageGate.getBalance('user-123');

      expect(result).toBe(8);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // hasEnoughCredits TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('hasEnoughCredits', () => {
    it('should return true when user has enough credits', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 10 })
      );

      const result = await usageGate.hasEnoughCredits('user-123', 'INITIAL_ANALYSIS');

      expect(result).toBe(true);
    });

    it('should return false when user does not have enough credits', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'FREE' })
      );
      mockPrismaUserCredits.findUnique.mockResolvedValue(
        createMockUserCredits({ balance: 1 })
      );

      const result = await usageGate.hasEnoughCredits('user-123', 'INITIAL_ANALYSIS');

      expect(result).toBe(false);
    });

    it('should return true for PRO users regardless of balance', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(
        createMockUser({ subscriptionStatus: 'PRO' })
      );

      const result = await usageGate.hasEnoughCredits('user-123', 'AI_BOARD');

      expect(result).toBe(true);
    });
  });
});
