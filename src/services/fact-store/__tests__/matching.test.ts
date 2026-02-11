// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - MATCHING TESTS
// Tests for supersession logic and contradiction detection
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import {
  matchFact,
  detectContradiction,
  matchFactsBatch,
  getSourcePriority,
  compareSourcePriority,
  shouldPersistFact,
  needsHumanReview,
  getSourcesByPriority,
} from '../matching';
import type { ExtractedFact, CurrentFact } from '../types';
import { SOURCE_PRIORITY } from '../types';

// ═══════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════

function createExtractedFact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    factKey: 'financial.arr',
    category: 'FINANCIAL',
    value: 1000000,
    displayValue: '1,000,000 EUR',
    source: 'PITCH_DECK',
    sourceConfidence: 85,
    ...overrides,
  };
}

function createCurrentFact(overrides: Partial<CurrentFact> = {}): CurrentFact {
  return {
    dealId: 'deal-123',
    factKey: 'financial.arr',
    category: 'FINANCIAL',
    currentValue: 1000000,
    currentDisplayValue: '1,000,000 EUR',
    currentSource: 'PITCH_DECK',
    currentConfidence: 85,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date('2024-01-01'),
    lastUpdatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE_PRIORITY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('SOURCE_PRIORITY', () => {
  it('should have DATA_ROOM as highest priority (100)', () => {
    expect(SOURCE_PRIORITY.DATA_ROOM).toBe(100);
  });

  it('should have BA_OVERRIDE as highest priority (100)', () => {
    expect(SOURCE_PRIORITY.BA_OVERRIDE).toBe(100);
  });

  it('should have CONTEXT_ENGINE as lowest priority (60)', () => {
    expect(SOURCE_PRIORITY.CONTEXT_ENGINE).toBe(60);
  });

  it('should maintain correct priority order', () => {
    expect(SOURCE_PRIORITY.DATA_ROOM).toBeGreaterThan(SOURCE_PRIORITY.FINANCIAL_MODEL);
    expect(SOURCE_PRIORITY.FINANCIAL_MODEL).toBeGreaterThan(SOURCE_PRIORITY.FOUNDER_RESPONSE);
    expect(SOURCE_PRIORITY.PITCH_DECK).toBeGreaterThan(SOURCE_PRIORITY.FOUNDER_RESPONSE);
    expect(SOURCE_PRIORITY.FOUNDER_RESPONSE).toBeGreaterThan(SOURCE_PRIORITY.CONTEXT_ENGINE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getSourcePriority TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('getSourcePriority', () => {
  it('should return correct priority for DATA_ROOM', () => {
    expect(getSourcePriority('DATA_ROOM')).toBe(100);
  });

  it('should return correct priority for PITCH_DECK', () => {
    expect(getSourcePriority('PITCH_DECK')).toBe(80);
  });

  it('should return correct priority for CONTEXT_ENGINE', () => {
    expect(getSourcePriority('CONTEXT_ENGINE')).toBe(60);
  });

  it('should return 0 for unknown source', () => {
    expect(getSourcePriority('UNKNOWN' as any)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// compareSourcePriority TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('compareSourcePriority', () => {
  it('should return 1 when first source has higher priority', () => {
    expect(compareSourcePriority('DATA_ROOM', 'PITCH_DECK')).toBe(1);
  });

  it('should return -1 when first source has lower priority', () => {
    expect(compareSourcePriority('CONTEXT_ENGINE', 'DATA_ROOM')).toBe(-1);
  });

  it('should return 0 when sources have equal priority', () => {
    expect(compareSourcePriority('DATA_ROOM', 'BA_OVERRIDE')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// matchFact TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('matchFact', () => {
  it('should return NEW when no existing fact matches', () => {
    const newFact = createExtractedFact({ factKey: 'financial.arr' });
    const existingFacts: CurrentFact[] = [];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('NEW');
    expect(result.reason).toContain('First occurrence');
    expect(result.existingFact).toBeUndefined();
  });

  it('should return NEW when fact key does not exist in existing facts', () => {
    const newFact = createExtractedFact({ factKey: 'financial.arr' });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({ factKey: 'financial.mrr' }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('NEW');
  });

  it('should return SUPERSEDE when new source has higher priority', () => {
    // DATA_ROOM (100) supersedes PITCH_DECK (80)
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'DATA_ROOM',
      value: 1200000,
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'PITCH_DECK',
        currentValue: 1000000,
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('SUPERSEDE');
    expect(result.reason).toContain('Higher priority source');
    expect(result.reason).toContain('DATA_ROOM');
    expect(result.reason).toContain('PITCH_DECK');
    expect(result.existingFact).toBeDefined();
  });

  it('should return SUPERSEDE when same priority but more recent', () => {
    // Same source (PITCH_DECK), newer fact wins
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'PITCH_DECK',
      value: 1100000,
      sourceConfidence: 90,
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'PITCH_DECK',
        currentValue: 1000000,
        currentConfidence: 85,
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('SUPERSEDE');
    expect(result.reason).toContain('Same source priority');
    expect(result.reason).toContain('newer data');
  });

  it('should return SUPERSEDE when same priority even if lower confidence', () => {
    // Same source, newer fact with lower confidence still wins
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'PITCH_DECK',
      value: 1100000,
      sourceConfidence: 70, // Lower confidence
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'PITCH_DECK',
        currentValue: 1000000,
        currentConfidence: 90, // Higher confidence
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('SUPERSEDE');
    expect(result.reason).toContain('newer data takes precedence');
  });

  it('should return IGNORE when new source has lower priority', () => {
    // CONTEXT_ENGINE (60) ignored vs DATA_ROOM (100)
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'CONTEXT_ENGINE',
      value: 900000,
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'DATA_ROOM',
        currentValue: 1000000,
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('IGNORE');
    expect(result.reason).toContain('Lower priority source');
    expect(result.reason).toContain('CONTEXT_ENGINE');
    expect(result.reason).toContain('DATA_ROOM');
    expect(result.existingFact).toBeDefined();
  });

  it('should return REVIEW_NEEDED for major contradiction (>30% delta)', () => {
    // ARR changed from 1M to 2M (100% delta) - even with higher priority source
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'DATA_ROOM',
      value: 2000000, // 100% increase
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'PITCH_DECK',
        currentValue: 1000000,
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('REVIEW_NEEDED');
    expect(result.reason).toContain('MAJOR contradiction');
    expect(result.existingFact).toBeDefined();
  });

  it('should return SUPERSEDE for moderate contradiction (<30% delta) with higher priority', () => {
    // 20% change is significant but not major
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      source: 'DATA_ROOM',
      value: 1200000, // 20% increase
    });
    const existingFacts: CurrentFact[] = [
      createCurrentFact({
        factKey: 'financial.arr',
        currentSource: 'PITCH_DECK',
        currentValue: 1000000,
      }),
    ];

    const result = matchFact(newFact, existingFacts);

    expect(result.type).toBe('SUPERSEDE');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// detectContradiction TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('detectContradiction', () => {
  it('should detect MAJOR contradiction for >30% delta', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 1500000, // 50% increase from 1M
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MAJOR');
    expect(result?.factKey).toBe('financial.arr');
    expect(result?.deltaPercent).toBeCloseTo(0.5, 2);
  });

  it('should detect SIGNIFICANT contradiction for 15-30% delta', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 1200000, // 20% increase from 1M
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('SIGNIFICANT');
    expect(result?.deltaPercent).toBeCloseTo(0.2, 2);
  });

  it('should detect MINOR contradiction for 5-15% delta', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 1100000, // 10% increase from 1M
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MINOR');
    expect(result?.deltaPercent).toBeCloseTo(0.1, 2);
  });

  it('should return null for <5% delta', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 1020000, // 2% increase from 1M
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).toBeNull();
  });

  it('should return null when fact keys do not match', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 2000000,
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.mrr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).toBeNull();
  });

  it('should handle string values with currency formatting', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: '$1,500,000',
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MAJOR');
  });

  it('should handle object values with amount property', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: { amount: 1500000, currency: 'EUR' },
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 1000000,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MAJOR');
  });

  it('should return 100% delta when existing value is 0 and new value is not', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 1000000,
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 0,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MAJOR');
    expect(result?.deltaPercent).toBe(1);
  });

  it('should return null when both values are 0', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.arr',
      value: 0,
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.arr',
      currentValue: 0,
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).toBeNull();
  });

  it('should detect MINOR contradiction for non-numeric type differences', () => {
    const newFact = createExtractedFact({
      factKey: 'product.name',
      category: 'PRODUCT',
      value: 'New Product Name',
    });
    const existingFact = createCurrentFact({
      factKey: 'product.name',
      category: 'PRODUCT',
      currentValue: 'Old Product Name',
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MINOR');
  });

  it('should handle percentage type facts', () => {
    const newFact = createExtractedFact({
      factKey: 'financial.gross_margin',
      category: 'FINANCIAL',
      value: 0.75, // 75%
    });
    const existingFact = createCurrentFact({
      factKey: 'financial.gross_margin',
      category: 'FINANCIAL',
      currentValue: 0.50, // 50%
    });

    const result = detectContradiction(newFact, existingFact);

    expect(result).not.toBeNull();
    expect(result?.significance).toBe('MAJOR'); // 50% delta
  });
});

// ═══════════════════════════════════════════════════════════════════════
// matchFactsBatch TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('matchFactsBatch', () => {
  it('should categorize multiple facts correctly', () => {
    const newFacts: ExtractedFact[] = [
      createExtractedFact({ factKey: 'financial.arr', source: 'PITCH_DECK' }),
      createExtractedFact({ factKey: 'financial.mrr', source: 'DATA_ROOM' }),
      createExtractedFact({ factKey: 'financial.burn_rate', source: 'CONTEXT_ENGINE' }),
      createExtractedFact({ factKey: 'financial.runway_months', source: 'DATA_ROOM', value: 24 }),
    ];
    const existingFacts: CurrentFact[] = [
      createCurrentFact({ factKey: 'financial.mrr', currentSource: 'PITCH_DECK' }),
      createCurrentFact({ factKey: 'financial.burn_rate', currentSource: 'DATA_ROOM' }),
      createCurrentFact({ factKey: 'financial.runway_months', currentSource: 'PITCH_DECK', currentValue: 6 }),
    ];

    const result = matchFactsBatch(newFacts, existingFacts);

    expect(result.newFacts.length).toBe(1); // financial.arr is new
    expect(result.toSupersede.length).toBe(1); // financial.mrr superseded by DATA_ROOM
    expect(result.toIgnore.length).toBe(1); // financial.burn_rate ignored (CONTEXT_ENGINE < DATA_ROOM)
    expect(result.needsReview.length).toBe(1); // financial.runway_months has major contradiction (24 vs 6 = 300%)
  });

  it('should collect all contradictions regardless of match result', () => {
    const newFacts: ExtractedFact[] = [
      createExtractedFact({ factKey: 'financial.arr', source: 'DATA_ROOM', value: 1500000 }),
      createExtractedFact({ factKey: 'financial.mrr', source: 'CONTEXT_ENGINE', value: 150000 }),
    ];
    const existingFacts: CurrentFact[] = [
      createCurrentFact({ factKey: 'financial.arr', currentSource: 'PITCH_DECK', currentValue: 1000000 }),
      createCurrentFact({ factKey: 'financial.mrr', currentSource: 'DATA_ROOM', currentValue: 100000 }),
    ];

    const result = matchFactsBatch(newFacts, existingFacts);

    expect(result.contradictions.length).toBe(2);
    expect(result.contradictions.some((c) => c.factKey === 'financial.arr')).toBe(true);
    expect(result.contradictions.some((c) => c.factKey === 'financial.mrr')).toBe(true);
  });

  it('should handle empty input arrays', () => {
    const result = matchFactsBatch([], []);

    expect(result.newFacts).toEqual([]);
    expect(result.toSupersede).toEqual([]);
    expect(result.toIgnore).toEqual([]);
    expect(result.needsReview).toEqual([]);
    expect(result.contradictions).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('shouldPersistFact', () => {
  it('should return true for NEW result', () => {
    expect(shouldPersistFact({ type: 'NEW', reason: 'test' })).toBe(true);
  });

  it('should return true for SUPERSEDE result', () => {
    expect(shouldPersistFact({ type: 'SUPERSEDE', reason: 'test' })).toBe(true);
  });

  it('should return false for IGNORE result', () => {
    expect(shouldPersistFact({ type: 'IGNORE', reason: 'test' })).toBe(false);
  });

  it('should return false for REVIEW_NEEDED result', () => {
    expect(shouldPersistFact({ type: 'REVIEW_NEEDED', reason: 'test' })).toBe(false);
  });
});

describe('needsHumanReview', () => {
  it('should return true for REVIEW_NEEDED result', () => {
    expect(needsHumanReview({ type: 'REVIEW_NEEDED', reason: 'test' })).toBe(true);
  });

  it('should return false for other result types', () => {
    expect(needsHumanReview({ type: 'NEW', reason: 'test' })).toBe(false);
    expect(needsHumanReview({ type: 'SUPERSEDE', reason: 'test' })).toBe(false);
    expect(needsHumanReview({ type: 'IGNORE', reason: 'test' })).toBe(false);
  });
});

describe('getSourcesByPriority', () => {
  it('should return sources sorted by priority (highest first)', () => {
    const sources = getSourcesByPriority();

    expect(sources[0]).toBe('DATA_ROOM');
    expect(sources[sources.length - 1]).toBe('CONTEXT_ENGINE');
  });

  it('should include all defined sources', () => {
    const sources = getSourcesByPriority();

    expect(sources).toContain('DATA_ROOM');
    expect(sources).toContain('BA_OVERRIDE');
    expect(sources).toContain('FINANCIAL_MODEL');
    expect(sources).toContain('FOUNDER_RESPONSE');
    expect(sources).toContain('PITCH_DECK');
    expect(sources).toContain('CONTEXT_ENGINE');
  });
});
