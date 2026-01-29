// ============================================================================
// QUOTA GATE - USAGE LIMIT TESTS
// Tests for quota checking and usage recording
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkQuota, getUserQuotaInfo, recordUsage } from '../usage-gate';
import { PLAN_LIMITS } from '../types';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockUserDealUsage = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockAnalysis = {
  count: vi.fn(),
};

const mockAIBoardSession = {
  count: vi.fn(),
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userDealUsage: {
      findUnique: (...args: unknown[]) => mockUserDealUsage.findUnique(...args),
      create: (...args: unknown[]) => mockUserDealUsage.create(...args),
      update: (...args: unknown[]) => mockUserDealUsage.update(...args),
    },
    analysis: {
      count: (...args: unknown[]) => mockAnalysis.count(...args),
    },
    aIBoardSession: {
      count: (...args: unknown[]) => mockAIBoardSession.count(...args),
    },
  },
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockUsage(overrides: Partial<{
  id: string;
  userId: string;
  monthlyLimit: number;
  usedThisMonth: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  lastResetAt: Date;
}> = {}) {
  return {
    id: 'usage-1',
    userId: 'user-123',
    monthlyLimit: 3,
    usedThisMonth: 0,
    tier1Count: 0,
    tier2Count: 0,
    tier3Count: 0,
    lastResetAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// PLAN_LIMITS TESTS
// ============================================================================

describe('PLAN_LIMITS', () => {
  it('FREE plan should have 3 analyses per month', () => {
    expect(PLAN_LIMITS.FREE.analysesPerMonth).toBe(3);
  });

  it('FREE plan should have 2 updates per deal', () => {
    expect(PLAN_LIMITS.FREE.updatesPerDeal).toBe(2);
  });

  it('FREE plan should have 0 boards per month', () => {
    expect(PLAN_LIMITS.FREE.boardsPerMonth).toBe(0);
  });

  it('PRO plan should have 20 analyses per month', () => {
    expect(PLAN_LIMITS.PRO.analysesPerMonth).toBe(20);
  });

  it('PRO plan should have unlimited updates', () => {
    expect(PLAN_LIMITS.PRO.updatesPerDeal).toBe(-1);
  });

  it('PRO plan should have 5 boards per month', () => {
    expect(PLAN_LIMITS.PRO.boardsPerMonth).toBe(5);
  });
});

// ============================================================================
// checkQuota TESTS
// ============================================================================

describe('checkQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow ANALYSIS when under limit', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ tier1Count: 1 })
    );

    const result = await checkQuota('user-123', 'FREE', 'ANALYSIS');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.current).toBe(1);
    expect(result.limit).toBe(3);
    expect(result.plan).toBe('FREE');
  });

  it('should deny ANALYSIS when limit reached', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ tier1Count: 3 })
    );

    const result = await checkQuota('user-123', 'FREE', 'ANALYSIS');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('LIMIT_REACHED');
    expect(result.current).toBe(3);
    expect(result.limit).toBe(3);
  });

  it('should allow PRO users more analyses', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ tier1Count: 10 })
    );

    const result = await checkQuota('user-123', 'PRO', 'ANALYSIS');

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
  });

  it('should allow unlimited updates for PRO', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(createMockUsage());

    const result = await checkQuota('user-123', 'PRO', 'UPDATE', 'deal-123');

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  it('should deny BOARD for FREE users', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(createMockUsage());

    const result = await checkQuota('user-123', 'FREE', 'BOARD');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('UPGRADE_REQUIRED');
  });

  it('should allow BOARD for PRO users under limit', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(createMockUsage());
    mockAIBoardSession.count.mockResolvedValue(2);

    const result = await checkQuota('user-123', 'PRO', 'BOARD');

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.limit).toBe(5);
  });

  it('should create usage record if not found', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(null);
    mockUserDealUsage.create.mockResolvedValue(createMockUsage());

    const result = await checkQuota('user-123', 'FREE', 'ANALYSIS');

    expect(mockUserDealUsage.create).toHaveBeenCalled();
    expect(result.allowed).toBe(true);
  });

  it('should treat ENTERPRISE as PRO', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(createMockUsage());

    const result = await checkQuota('user-123', 'ENTERPRISE', 'ANALYSIS');

    expect(result.plan).toBe('PRO');
    expect(result.limit).toBe(20);
  });
});

// ============================================================================
// getUserQuotaInfo TESTS
// ============================================================================

describe('getUserQuotaInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return quota info for FREE user', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ tier1Count: 2 })
    );
    mockAIBoardSession.count.mockResolvedValue(0);

    const info = await getUserQuotaInfo('user-123', 'FREE');

    expect(info.plan).toBe('FREE');
    expect(info.analyses.used).toBe(2);
    expect(info.analyses.limit).toBe(3);
    expect(info.boards.used).toBe(0);
    expect(info.boards.limit).toBe(0);
    expect(info.availableTiers).toEqual(['TIER_1', 'SYNTHESIS']);
  });

  it('should return quota info for PRO user', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ tier1Count: 5 })
    );
    mockAIBoardSession.count.mockResolvedValue(2);

    const info = await getUserQuotaInfo('user-123', 'PRO');

    expect(info.plan).toBe('PRO');
    expect(info.analyses.used).toBe(5);
    expect(info.analyses.limit).toBe(20);
    expect(info.boards.used).toBe(2);
    expect(info.boards.limit).toBe(5);
    expect(info.availableTiers).toEqual(['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS']);
  });
});

// ============================================================================
// recordUsage TESTS
// ============================================================================

describe('recordUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should increment counters for ANALYSIS', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ usedThisMonth: 1, tier1Count: 1 })
    );

    await recordUsage('user-123', 'ANALYSIS');

    expect(mockUserDealUsage.update).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      data: {
        usedThisMonth: 2,
        tier1Count: 2,
      },
    });
  });

  it('should increment only usedThisMonth for non-ANALYSIS actions', async () => {
    mockUserDealUsage.findUnique.mockResolvedValue(
      createMockUsage({ usedThisMonth: 3 })
    );

    await recordUsage('user-123', 'BOARD');

    expect(mockUserDealUsage.update).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      data: {
        usedThisMonth: 4,
      },
    });
  });
});
