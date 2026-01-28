// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - MATCHING
// Supersession logic based on SOURCE_PRIORITY
// Determines how new facts interact with existing facts
// ═══════════════════════════════════════════════════════════════════════

import type {
  ExtractedFact,
  CurrentFact,
  MatchResult,
  MatchResultType,
  ContradictionInfo,
  FactSource,
  SOURCE_PRIORITY,
} from './types';
import { SOURCE_PRIORITY as PRIORITY } from './types';
import { getFactKeyDefinition } from './fact-keys';

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Threshold for considering a numeric difference as a major contradiction.
 * Values differing by more than 30% trigger REVIEW_NEEDED.
 */
const MAJOR_CONTRADICTION_THRESHOLD = 0.30;

/**
 * Threshold for significant contradiction (requires attention but not blocking).
 */
const SIGNIFICANT_CONTRADICTION_THRESHOLD = 0.15;

/**
 * Threshold for minor contradiction (informational only).
 */
const MINOR_CONTRADICTION_THRESHOLD = 0.05;

// ═══════════════════════════════════════════════════════════════════════
// MAIN MATCHING FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determines how a new fact should be handled relative to existing facts.
 *
 * Rules:
 * 1. If no existing fact for this key -> NEW
 * 2. If major contradiction (>30% delta on numerics) -> REVIEW_NEEDED
 * 3. If new source has higher priority -> SUPERSEDE
 * 4. If same priority, newer is better -> SUPERSEDE
 * 5. If new source has lower priority -> IGNORE
 *
 * @param newFact - The newly extracted fact
 * @param existingFacts - Array of current facts for the deal
 * @returns MatchResult indicating how to handle the new fact
 */
export function matchFact(
  newFact: ExtractedFact,
  existingFacts: CurrentFact[]
): MatchResult {
  // Find existing fact with the same key
  const existingFact = existingFacts.find((f) => f.factKey === newFact.factKey);

  // Case 1: No existing fact - this is a new fact
  if (!existingFact) {
    return {
      type: 'NEW',
      reason: `First occurrence of fact key "${newFact.factKey}"`,
    };
  }

  // Get source priorities
  const newPriority = getSourcePriority(newFact.source);
  const existingPriority = getSourcePriority(existingFact.currentSource);

  // Check for contradictions (only for numeric/percentage types)
  const contradiction = detectContradiction(newFact, existingFact);

  // Case 2: Major contradiction -> needs human review
  if (contradiction && contradiction.significance === 'MAJOR') {
    return {
      type: 'REVIEW_NEEDED',
      existingFact,
      reason: formatContradictionReason(contradiction),
    };
  }

  // Case 3: New source has higher priority -> supersede
  if (newPriority > existingPriority) {
    return {
      type: 'SUPERSEDE',
      existingFact,
      reason: `Higher priority source: ${newFact.source} (${newPriority}) > ${existingFact.currentSource} (${existingPriority})`,
    };
  }

  // Case 4: Same priority -> newer supersedes if confidence is same or higher
  if (newPriority === existingPriority) {
    if (newFact.sourceConfidence >= existingFact.currentConfidence) {
      return {
        type: 'SUPERSEDE',
        existingFact,
        reason: `Same source priority (${newPriority}), newer data with confidence ${newFact.sourceConfidence}% vs ${existingFact.currentConfidence}%`,
      };
    }

    // If new confidence is significantly lower, still supersede but note it
    return {
      type: 'SUPERSEDE',
      existingFact,
      reason: `Same source priority (${newPriority}), newer data takes precedence (confidence: ${newFact.sourceConfidence}% vs ${existingFact.currentConfidence}%)`,
    };
  }

  // Case 5: New source has lower priority -> ignore
  return {
    type: 'IGNORE',
    existingFact,
    reason: `Lower priority source: ${newFact.source} (${newPriority}) < ${existingFact.currentSource} (${existingPriority})`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// BATCH MATCHING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Matches multiple facts at once, returning categorized results.
 *
 * @param newFacts - Array of newly extracted facts
 * @param existingFacts - Array of current facts for the deal
 * @returns Object with facts categorized by match result
 */
export function matchFactsBatch(
  newFacts: ExtractedFact[],
  existingFacts: CurrentFact[]
): {
  newFacts: Array<{ fact: ExtractedFact; result: MatchResult }>;
  toSupersede: Array<{ fact: ExtractedFact; result: MatchResult }>;
  toIgnore: Array<{ fact: ExtractedFact; result: MatchResult }>;
  needsReview: Array<{ fact: ExtractedFact; result: MatchResult }>;
  contradictions: ContradictionInfo[];
} {
  const results = {
    newFacts: [] as Array<{ fact: ExtractedFact; result: MatchResult }>,
    toSupersede: [] as Array<{ fact: ExtractedFact; result: MatchResult }>,
    toIgnore: [] as Array<{ fact: ExtractedFact; result: MatchResult }>,
    needsReview: [] as Array<{ fact: ExtractedFact; result: MatchResult }>,
    contradictions: [] as ContradictionInfo[],
  };

  for (const fact of newFacts) {
    const matchResult = matchFact(fact, existingFacts);

    // Check for contradiction regardless of match result
    const existingFact = existingFacts.find((f) => f.factKey === fact.factKey);
    if (existingFact) {
      const contradiction = detectContradiction(fact, existingFact);
      if (contradiction) {
        results.contradictions.push(contradiction);
      }
    }

    // Categorize by match result type
    switch (matchResult.type) {
      case 'NEW':
        results.newFacts.push({ fact, result: matchResult });
        break;
      case 'SUPERSEDE':
        results.toSupersede.push({ fact, result: matchResult });
        break;
      case 'IGNORE':
        results.toIgnore.push({ fact, result: matchResult });
        break;
      case 'REVIEW_NEEDED':
        results.needsReview.push({ fact, result: matchResult });
        break;
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// CONTRADICTION DETECTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detects contradictions between a new fact and an existing fact.
 * Only applicable to numeric and percentage types.
 *
 * @param newFact - The new fact
 * @param existingFact - The existing fact
 * @returns ContradictionInfo if a contradiction is detected, null otherwise
 */
export function detectContradiction(
  newFact: ExtractedFact,
  existingFact: CurrentFact
): ContradictionInfo | null {
  // Only detect contradictions for the same fact key
  if (newFact.factKey !== existingFact.factKey) {
    return null;
  }

  const factDef = getFactKeyDefinition(newFact.factKey);
  if (!factDef) {
    return null;
  }

  // Only compare numeric types
  if (factDef.type !== 'currency' && factDef.type !== 'percentage' && factDef.type !== 'number') {
    // For non-numeric types, check for exact value differences
    if (JSON.stringify(newFact.value) !== JSON.stringify(existingFact.currentValue)) {
      return {
        factKey: newFact.factKey,
        newValue: newFact.value,
        existingValue: existingFact.currentValue,
        newSource: newFact.source,
        existingSource: existingFact.currentSource,
        significance: 'MINOR', // Non-numeric differences are considered minor
      };
    }
    return null;
  }

  // Get numeric values
  const newValue = extractNumericValue(newFact.value);
  const existingValue = extractNumericValue(existingFact.currentValue);

  if (newValue === null || existingValue === null) {
    return null;
  }

  // Calculate percentage delta
  const deltaPercent = calculateDeltaPercent(newValue, existingValue);

  // No contradiction if values are effectively the same
  if (deltaPercent < MINOR_CONTRADICTION_THRESHOLD) {
    return null;
  }

  // Determine significance
  let significance: ContradictionInfo['significance'];
  if (deltaPercent >= MAJOR_CONTRADICTION_THRESHOLD) {
    significance = 'MAJOR';
  } else if (deltaPercent >= SIGNIFICANT_CONTRADICTION_THRESHOLD) {
    significance = 'SIGNIFICANT';
  } else {
    significance = 'MINOR';
  }

  return {
    factKey: newFact.factKey,
    newValue: newFact.value,
    existingValue: existingFact.currentValue,
    newSource: newFact.source,
    existingSource: existingFact.currentSource,
    deltaPercent: Math.round(deltaPercent * 100) / 100, // Round to 2 decimal places
    significance,
  };
}

/**
 * Detects all contradictions between two sets of facts.
 *
 * @param newFacts - Array of new facts
 * @param existingFacts - Array of existing current facts
 * @returns Array of detected contradictions
 */
export function detectAllContradictions(
  newFacts: ExtractedFact[],
  existingFacts: CurrentFact[]
): ContradictionInfo[] {
  const contradictions: ContradictionInfo[] = [];

  for (const newFact of newFacts) {
    const existingFact = existingFacts.find((f) => f.factKey === newFact.factKey);
    if (existingFact) {
      const contradiction = detectContradiction(newFact, existingFact);
      if (contradiction) {
        contradictions.push(contradiction);
      }
    }
  }

  return contradictions;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Gets the priority for a fact source.
 *
 * @param source - The fact source
 * @returns Priority number (higher = more authoritative)
 */
export function getSourcePriority(source: FactSource): number {
  return PRIORITY[source] ?? 0;
}

/**
 * Compares two sources and returns which one has higher priority.
 *
 * @param source1 - First source
 * @param source2 - Second source
 * @returns 1 if source1 wins, -1 if source2 wins, 0 if equal
 */
export function compareSourcePriority(
  source1: FactSource,
  source2: FactSource
): -1 | 0 | 1 {
  const p1 = getSourcePriority(source1);
  const p2 = getSourcePriority(source2);

  if (p1 > p2) return 1;
  if (p1 < p2) return -1;
  return 0;
}

/**
 * Extracts a numeric value from a fact value.
 * Handles various formats (number, string with currency, etc.)
 *
 * @param value - The fact value
 * @returns Numeric value or null if not extractable
 */
function extractNumericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // Remove currency symbols, commas, spaces
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  if (typeof value === 'object' && value !== null) {
    // Try to extract from object (e.g., { amount: 1000000 })
    const obj = value as Record<string, unknown>;
    if ('amount' in obj) return extractNumericValue(obj.amount);
    if ('value' in obj) return extractNumericValue(obj.value);
  }

  return null;
}

/**
 * Calculates the percentage difference between two values.
 * Uses the average as the base to avoid division by zero and handle both directions.
 *
 * @param newValue - New value
 * @param existingValue - Existing value
 * @returns Percentage difference as a decimal (0.30 = 30%)
 */
function calculateDeltaPercent(newValue: number, existingValue: number): number {
  // Handle edge cases
  if (newValue === existingValue) return 0;
  if (existingValue === 0 && newValue === 0) return 0;
  if (existingValue === 0) return 1; // 100% difference if old value was 0

  // Calculate percentage difference relative to existing value
  const diff = Math.abs(newValue - existingValue);
  const base = Math.abs(existingValue);

  return diff / base;
}

/**
 * Formats a contradiction into a human-readable reason string.
 *
 * @param contradiction - The contradiction info
 * @returns Formatted reason string
 */
function formatContradictionReason(contradiction: ContradictionInfo): string {
  const deltaStr = contradiction.deltaPercent !== undefined
    ? ` (${(contradiction.deltaPercent * 100).toFixed(1)}% difference)`
    : '';

  return `${contradiction.significance} contradiction on "${contradiction.factKey}": ` +
    `${formatValue(contradiction.existingValue)} (${contradiction.existingSource}) vs ` +
    `${formatValue(contradiction.newValue)} (${contradiction.newSource})${deltaStr}`;
}

/**
 * Formats a value for display in messages.
 *
 * @param value - The value to format
 * @returns Formatted string
 */
function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Determines if a match result should trigger a fact update.
 *
 * @param result - The match result
 * @returns True if the fact should be persisted
 */
export function shouldPersistFact(result: MatchResult): boolean {
  return result.type === 'NEW' || result.type === 'SUPERSEDE';
}

/**
 * Determines if a match result needs human review.
 *
 * @param result - The match result
 * @returns True if human review is needed
 */
export function needsHumanReview(result: MatchResult): boolean {
  return result.type === 'REVIEW_NEEDED';
}

/**
 * Gets all sources sorted by priority (highest first).
 *
 * @returns Array of sources sorted by priority
 */
export function getSourcesByPriority(): FactSource[] {
  return Object.entries(PRIORITY)
    .sort(([, a], [, b]) => b - a)
    .map(([source]) => source as FactSource);
}
