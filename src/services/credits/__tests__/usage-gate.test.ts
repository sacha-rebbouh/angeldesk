// ============================================================================
// CREDIT SYSTEM TESTS
// Tests for credit checking, deduction, and granting
// ============================================================================

import { describe, it, expect } from 'vitest';
import { CREDIT_COSTS, CREDIT_PACKS, FREE_TIER, FULL_DEAL_PACKAGE_CREDITS } from '../types';

// ============================================================================
// CREDIT_COSTS TESTS
// ============================================================================

describe('CREDIT_COSTS', () => {
  it('Quick Scan should cost 1 credit', () => {
    expect(CREDIT_COSTS.QUICK_SCAN).toBe(1);
  });

  it('Deep Dive should cost 5 credits', () => {
    expect(CREDIT_COSTS.DEEP_DIVE).toBe(5);
  });

  it('AI Board should cost 10 credits', () => {
    expect(CREDIT_COSTS.AI_BOARD).toBe(10);
  });

  it('Live Coaching should cost 8 credits', () => {
    expect(CREDIT_COSTS.LIVE_COACHING).toBe(8);
  });

  it('Re-analysis should cost 3 credits', () => {
    expect(CREDIT_COSTS.RE_ANALYSIS).toBe(3);
  });

  it('Chat should be free', () => {
    expect(CREDIT_COSTS.CHAT).toBe(0);
  });

  it('PDF export should be free', () => {
    expect(CREDIT_COSTS.PDF_EXPORT).toBe(0);
  });
});

// ============================================================================
// CREDIT_PACKS TESTS
// ============================================================================

describe('CREDIT_PACKS', () => {
  it('should have 5 packs', () => {
    expect(CREDIT_PACKS).toHaveLength(5);
  });

  it('Starter should have 10 credits for 49€', () => {
    const starter = CREDIT_PACKS.find(p => p.name === 'starter');
    expect(starter).toBeDefined();
    expect(starter!.credits).toBe(10);
    expect(starter!.priceEur).toBe(49);
  });

  it('Pro should be highlighted', () => {
    const pro = CREDIT_PACKS.find(p => p.name === 'pro');
    expect(pro).toBeDefined();
    expect(pro!.highlight).toBe(true);
  });

  it('Fund should have 300 credits for 749€', () => {
    const fund = CREDIT_PACKS.find(p => p.name === 'fund');
    expect(fund).toBeDefined();
    expect(fund!.credits).toBe(300);
    expect(fund!.priceEur).toBe(749);
  });

  it('per-credit price should decrease with pack size', () => {
    for (let i = 1; i < CREDIT_PACKS.length; i++) {
      expect(CREDIT_PACKS[i].perCredit).toBeLessThan(CREDIT_PACKS[i - 1].perCredit);
    }
  });
});

// ============================================================================
// FULL_DEAL_PACKAGE_CREDITS TESTS
// ============================================================================

describe('FULL_DEAL_PACKAGE_CREDITS', () => {
  it('should be 26 credits (5 + 10 + 8 + 3)', () => {
    expect(FULL_DEAL_PACKAGE_CREDITS).toBe(26);
  });
});

// ============================================================================
// FREE_TIER TESTS
// ============================================================================

describe('FREE_TIER', () => {
  it('should grant 5 initial credits (1 Deep Dive)', () => {
    expect(FREE_TIER.initialCredits).toBe(5);
  });

  it('should not require a card', () => {
    expect(FREE_TIER.requiresCard).toBe(false);
  });
});
