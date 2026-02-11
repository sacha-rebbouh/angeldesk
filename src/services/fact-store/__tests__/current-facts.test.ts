import { describe, it, expect } from 'vitest';
import { updateFactsInMemory } from '../current-facts';
import type { AgentFactValidation } from '../current-facts';
import type { CurrentFact } from '../types';

function createMockFact(overrides: Partial<CurrentFact> = {}): CurrentFact {
  return {
    dealId: 'test-deal',
    factKey: 'financial.arr',
    category: 'FINANCIAL',
    currentValue: 1000000,
    currentDisplayValue: '1M EUR',
    currentSource: 'PITCH_DECK',
    currentConfidence: 85,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date(),
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

describe('updateFactsInMemory', () => {
  it('should NOT mutate original array', () => {
    const original = [createMockFact()];
    const originalValue = original[0].currentValue;

    const validations: AgentFactValidation[] = [{
      factKey: 'financial.arr',
      status: 'CONTRADICTED',
      newConfidence: 30,
      correctedValue: 500000,
      correctedDisplayValue: '500K EUR',
      validatedBy: 'deck-forensics',
      explanation: 'test',
    }];

    const result = updateFactsInMemory(original, validations);

    // Original unchanged
    expect(original[0].currentValue).toBe(originalValue);
    // Result has new value
    expect(result[0].currentValue).toBe(500000);
    // Different references
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });

  it('should update confidence on VERIFIED', () => {
    const facts = [createMockFact({ currentConfidence: 60 })];
    const result = updateFactsInMemory(facts, [{
      factKey: 'financial.arr',
      status: 'VERIFIED',
      newConfidence: 95,
      validatedBy: 'deck-forensics',
      explanation: 'verified against bank statements',
    }]);
    expect(result[0].currentConfidence).toBe(95);
  });

  it('should skip facts not in validations', () => {
    const facts = [
      createMockFact({ factKey: 'financial.arr' }),
      createMockFact({ factKey: 'financial.mrr' }),
    ];
    const result = updateFactsInMemory(facts, [{
      factKey: 'financial.arr',
      status: 'VERIFIED',
      newConfidence: 95,
      validatedBy: 'test',
      explanation: 'test',
    }]);
    expect(result[0].currentConfidence).toBe(95);
    expect(result[1].currentConfidence).toBe(85); // unchanged
  });

  it('should handle empty validations', () => {
    const facts = [createMockFact()];
    const result = updateFactsInMemory(facts, []);
    expect(result).toEqual(facts);
  });

  it('should set disputeDetails with original values on CONTRADICTED', () => {
    const facts = [createMockFact({
      currentValue: 1000000,
      currentSource: 'PITCH_DECK',
    })];
    const result = updateFactsInMemory(facts, [{
      factKey: 'financial.arr',
      status: 'CONTRADICTED',
      newConfidence: 30,
      correctedValue: 500000,
      validatedBy: 'test',
      explanation: 'test',
    }]);
    expect(result[0].isDisputed).toBe(true);
    expect(result[0].disputeDetails?.conflictingValue).toBe(1000000);
    expect(result[0].disputeDetails?.conflictingSource).toBe('PITCH_DECK');
  });
});
