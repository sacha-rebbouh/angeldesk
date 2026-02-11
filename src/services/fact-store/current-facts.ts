// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - CURRENT FACTS
// Materialized view of current facts from event history
// Computes the "latest truth" for each fact key
// ═══════════════════════════════════════════════════════════════════════

import { prisma } from '@/lib/prisma';
import type { FactEvent } from '@prisma/client';
import type {
  CurrentFact,
  FactCategory,
  FactSource,
  FactEventType,
  FactEventRecord,
} from './types';
import { toFactEventRecord } from './persistence';
import { getFactKeyDefinition, FACT_KEYS } from './fact-keys';

// ═══════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// MATERIALIZED VIEW FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get current facts using the materialized view (faster for large datasets).
 * Falls back to the computed version if the view doesn't exist.
 *
 * Note: This version doesn't include event history or dispute details.
 * Use getCurrentFacts() if you need the full event history.
 *
 * @param dealId - The deal ID
 * @returns Array of CurrentFacts (without event history)
 */
export async function getCurrentFactsFromView(dealId: string): Promise<CurrentFact[]> {
  try {
    // Try to use the materialized view
    // SECURITY NOTE: Using Prisma's tagged template literal which auto-parameterizes ${dealId}
    // This is NOT string interpolation - Prisma handles SQL injection prevention
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        dealId: string;
        factKey: string;
        category: string;
        value: unknown;
        displayValue: string;
        unit: string | null;
        source: string;
        sourceDocumentId: string | null;
        sourceConfidence: number;
        extractedText: string | null;
        createdAt: Date;
        createdBy: string;
      }>
    >`
      SELECT * FROM current_facts_mv WHERE "dealId" = ${dealId}
    `;

    return rows.map((row) => ({
      dealId: row.dealId,
      factKey: row.factKey,
      category: row.category as FactCategory,
      currentValue: row.value,
      currentDisplayValue: row.displayValue,
      currentSource: row.source as FactSource,
      currentConfidence: row.sourceConfidence,
      isDisputed: false, // View doesn't track disputes yet
      eventHistory: [], // View doesn't include history
      firstSeenAt: row.createdAt,
      lastUpdatedAt: row.createdAt,
    }));
  } catch (error) {
    // Fallback to computed version if view doesn't exist
    console.warn(
      '[getCurrentFactsFromView] Materialized view not available, using computed version'
    );
    return getCurrentFacts(dealId);
  }
}

/**
 * Refresh the materialized view after fact updates.
 * Should be called after createFactEventsBatch.
 *
 * Uses CONCURRENTLY mode which doesn't block reads during refresh.
 * Fails silently if the view doesn't exist.
 */
export async function refreshCurrentFactsView(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT refresh_current_facts_mv()`;
  } catch (error) {
    console.warn('[refreshCurrentFactsView] Failed to refresh materialized view:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COMPUTED CURRENT FACTS (Original Implementation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Computes the current facts for a deal by processing all fact events.
 * Returns the latest non-superseded fact for each fact key.
 *
 * Algorithm:
 * 1. Get all events for the deal ordered by createdAt DESC
 * 2. Build a set of superseded event IDs
 * 3. For each fact key, find the latest non-superseded CREATED event
 * 4. Build CurrentFact with full event history
 *
 * @param dealId - The deal ID
 * @returns Array of CurrentFacts representing the current state
 */
export async function getCurrentFacts(dealId: string): Promise<CurrentFact[]> {
  // Fetch all events for this deal
  const events = await prisma.factEvent.findMany({
    where: { dealId },
    orderBy: { createdAt: 'desc' },
  });

  if (events.length === 0) {
    return [];
  }

  // Build set of superseded event IDs
  const supersededIds = new Set<string>();
  for (const event of events) {
    if (event.supersedesEventId) {
      supersededIds.add(event.supersedesEventId);
    }
  }

  // Group events by fact key
  const eventsByKey = new Map<string, FactEvent[]>();
  for (const event of events) {
    const existing = eventsByKey.get(event.factKey) || [];
    existing.push(event);
    eventsByKey.set(event.factKey, existing);
  }

  // Build current facts
  const currentFacts: CurrentFact[] = [];

  for (const [factKey, factEvents] of eventsByKey) {
    // Find the latest non-superseded event
    const currentEvent = factEvents.find(
      (e) => !supersededIds.has(e.id) && e.eventType !== 'DELETED'
    );

    if (!currentEvent) {
      // All events for this key have been superseded or deleted
      continue;
    }

    // Check if there's a dispute
    const disputeEvent = factEvents.find((e) => e.eventType === 'DISPUTED');
    const isDisputed = disputeEvent !== undefined;

    // Get dispute details if disputed
    let disputeDetails: CurrentFact['disputeDetails'];
    if (isDisputed && disputeEvent) {
      disputeDetails = {
        conflictingValue: disputeEvent.value,
        conflictingSource: disputeEvent.source as FactSource,
      };
    }

    // Build event history
    const eventHistory: FactEventRecord[] = factEvents.map(toFactEventRecord);

    // Get first and last dates
    const sortedByDate = [...factEvents].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const firstSeenAt = sortedByDate[0]?.createdAt ?? new Date();
    const lastUpdatedAt = sortedByDate[sortedByDate.length - 1]?.createdAt ?? new Date();

    currentFacts.push({
      dealId,
      factKey,
      category: currentEvent.category as FactCategory,
      currentValue: currentEvent.value,
      currentDisplayValue: currentEvent.displayValue,
      currentSource: currentEvent.source as FactSource,
      currentConfidence: currentEvent.sourceConfidence,
      isDisputed,
      disputeDetails,
      eventHistory,
      firstSeenAt,
      lastUpdatedAt,
    });
  }

  return currentFacts;
}

/**
 * Gets the current fact for a specific fact key.
 *
 * @param dealId - The deal ID
 * @param factKey - The fact key (e.g., 'financial.arr')
 * @returns The CurrentFact or null if not found
 */
export async function getCurrentFactByKey(
  dealId: string,
  factKey: string
): Promise<CurrentFact | null> {
  const allFacts = await getCurrentFacts(dealId);
  return allFacts.find((f) => f.factKey === factKey) ?? null;
}

/**
 * Gets current facts filtered by category.
 *
 * @param dealId - The deal ID
 * @param category - The category to filter by
 * @returns Array of CurrentFacts in the category
 */
export async function getCurrentFactsByCategory(
  dealId: string,
  category: FactCategory
): Promise<CurrentFact[]> {
  const allFacts = await getCurrentFacts(dealId);
  return allFacts.filter((f) => f.category === category);
}

/**
 * Gets current facts filtered by source.
 *
 * @param dealId - The deal ID
 * @param source - The source to filter by
 * @returns Array of CurrentFacts from the source
 */
export async function getCurrentFactsBySource(
  dealId: string,
  source: FactSource
): Promise<CurrentFact[]> {
  const allFacts = await getCurrentFacts(dealId);
  return allFacts.filter((f) => f.currentSource === source);
}

/**
 * Gets all disputed facts for a deal.
 *
 * @param dealId - The deal ID
 * @returns Array of disputed CurrentFacts
 */
export async function getDisputedFacts(dealId: string): Promise<CurrentFact[]> {
  const allFacts = await getCurrentFacts(dealId);
  return allFacts.filter((f) => f.isDisputed);
}

// ═══════════════════════════════════════════════════════════════════════
// FORMATTING FOR AGENTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Formats the current facts for injection into agent prompts.
 * Creates a structured, readable format that agents can easily parse.
 *
 * @param facts - Array of CurrentFacts to format
 * @returns Formatted string for prompt injection
 */
export function formatFactStoreForAgents(facts: CurrentFact[]): string {
  if (facts.length === 0) {
    return '## Fact Store\n\nNo facts have been extracted yet for this deal.';
  }

  // Group facts by category
  const byCategory = new Map<FactCategory, CurrentFact[]>();
  for (const fact of facts) {
    const existing = byCategory.get(fact.category) || [];
    existing.push(fact);
    byCategory.set(fact.category, existing);
  }

  // Build formatted output
  const lines: string[] = ['## Fact Store'];
  lines.push('');
  lines.push('Les donnees ci-dessous ont ete extraites des documents du deal.');
  lines.push('');
  lines.push('### LEGENDE FIABILITE DES DONNEES');
  lines.push('');
  lines.push('| Icone | Niveau | Signification | Comment utiliser |');
  lines.push('|-------|--------|---------------|-----------------|');
  lines.push('| [AUDITED] | AUDITE | Confirme par audit externe/releve bancaire | Fait etabli, utilisable comme preuve |');
  lines.push('| [VERIFIED] | VERIFIE | Recoupe par plusieurs sources | Haute confiance, utilisable |');
  lines.push('| [DECLARED] | DECLARE | Annonce dans le deck, non verifie | NE PAS traiter comme fait avere. Dire "le fondateur declare X" |');
  lines.push('| [PROJECTED] | PROJETE | Projection/forecast/BP, inclut des donnees futures | CRITIQUE: ce n\'est PAS un fait. Dire "le BP projette X" |');
  lines.push('| [ESTIMATED] | ESTIME | Calcule par l\'IA a partir de donnees partielles | Utiliser avec prudence, mentionner le calcul |');
  lines.push('| [UNVERIFIABLE] | NON VERIFIABLE | Impossible a verifier | Ne PAS utiliser comme base d\'analyse |');
  lines.push('');
  lines.push('**REGLE CRITIQUE:** Ne JAMAIS ecrire "le CA est de X" si la fiabilite est PROJECTED ou DECLARED.');
  lines.push('Ecrire a la place: "le fondateur declare/projette un CA de X" ou "selon le BP, le CA prevu est de X".');
  lines.push('');

  // Define category order for consistent output
  const categoryOrder: FactCategory[] = [
    'FINANCIAL',
    'TRACTION',
    'TEAM',
    'MARKET',
    'PRODUCT',
    'COMPETITION',
    'LEGAL',
    'OTHER',
  ];

  for (const category of categoryOrder) {
    const categoryFacts = byCategory.get(category);
    if (!categoryFacts || categoryFacts.length === 0) {
      continue;
    }

    lines.push(`### ${formatCategoryName(category)}`);
    lines.push('');

    for (const fact of categoryFacts) {
      const factDef = getFactKeyDefinition(fact.factKey);
      const label = factDef?.description || formatFactKeyAsLabel(fact.factKey);

      // Build reliability tag
      const rel = fact.reliability;
      const reliabilityTag = rel ? `[${rel.reliability}]` : '[DECLARED]';
      const isProjection = rel?.isProjection === true;
      const projectionWarning = isProjection && rel?.temporalAnalysis?.projectionPercent
        ? ` (${rel.temporalAnalysis.projectionPercent}% projete)`
        : isProjection ? ' (projection)' : '';

      // Build the fact line with reliability classification
      let factLine: string;
      if (rel?.reliability === 'AUDITED' || rel?.reliability === 'VERIFIED') {
        factLine = `- **${label}**: ${fact.currentDisplayValue} ${reliabilityTag}`;
      } else if (isProjection) {
        factLine = `- **${label}**: ${fact.currentDisplayValue} ${reliabilityTag}${projectionWarning}`;
      } else {
        factLine = `- **${label}**: ${fact.currentDisplayValue} ${reliabilityTag}`;
      }

      // Add reliability reasoning if it's a projection or estimated
      if (rel?.reasoning && (isProjection || rel.reliability === 'ESTIMATED')) {
        factLine += ` — ${rel.reasoning}`;
      }

      // Add confidence indicator for low confidence
      if (fact.currentConfidence < 80) {
        factLine += ` (confidence: ${fact.currentConfidence}%)`;
      }

      // Add dispute warning
      if (fact.isDisputed) {
        factLine += ' [DISPUTED]';
      }

      // Add source tag for context
      factLine += ` [${formatSourceName(fact.currentSource)}]`;

      lines.push(factLine);
    }

    lines.push('');
  }

  // Add disputed facts section if any
  const disputedFacts = facts.filter((f) => f.isDisputed);
  if (disputedFacts.length > 0) {
    lines.push('### Disputed Facts (Require Verification)');
    lines.push('');
    for (const fact of disputedFacts) {
      const factDef = getFactKeyDefinition(fact.factKey);
      const label = factDef?.description || formatFactKeyAsLabel(fact.factKey);
      lines.push(
        `- **${label}**: Current value "${formatValue(fact.currentValue)}" ` +
        `(${fact.currentSource}) conflicts with "${formatValue(fact.disputeDetails?.conflictingValue)}" ` +
        `(${fact.disputeDetails?.conflictingSource})`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats facts as a compact JSON structure for structured prompts.
 *
 * @param facts - Array of CurrentFacts
 * @returns JSON-formatted string
 */
export function formatFactStoreAsJSON(facts: CurrentFact[]): string {
  const structured: Record<string, Record<string, {
    value: unknown;
    display: string;
    confidence: number;
    source: string;
    disputed?: boolean;
  }>> = {};

  for (const fact of facts) {
    const [category, ...keyParts] = fact.factKey.split('.');
    const key = keyParts.join('.');

    if (!structured[category]) {
      structured[category] = {};
    }

    structured[category][key] = {
      value: fact.currentValue,
      display: fact.currentDisplayValue,
      confidence: fact.currentConfidence,
      source: fact.currentSource,
      ...(fact.isDisputed ? { disputed: true } : {}),
    };
  }

  return JSON.stringify(structured, null, 2);
}

/**
 * Creates a summary of the fact store for quick overview.
 *
 * @param facts - Array of CurrentFacts
 * @returns Summary object
 */
export function getFactStoreSummary(facts: CurrentFact[]): {
  totalFacts: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  averageConfidence: number;
  disputedCount: number;
  lowConfidenceCount: number;
} {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let totalConfidence = 0;
  let disputedCount = 0;
  let lowConfidenceCount = 0;

  for (const fact of facts) {
    byCategory[fact.category] = (byCategory[fact.category] || 0) + 1;
    bySource[fact.currentSource] = (bySource[fact.currentSource] || 0) + 1;
    totalConfidence += fact.currentConfidence;

    if (fact.isDisputed) disputedCount++;
    if (fact.currentConfidence < 70) lowConfidenceCount++;
  }

  return {
    totalFacts: facts.length,
    byCategory,
    bySource,
    averageConfidence: facts.length > 0 ? Math.round(totalConfidence / facts.length) : 0,
    disputedCount,
    lowConfidenceCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// IN-MEMORY FACT UPDATES (for sequential pipeline)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validation result from an agent (deck-forensics or financial-auditor).
 * Used to update facts in-memory between pipeline phases.
 */
export interface AgentFactValidation {
  factKey: string;
  status: 'VERIFIED' | 'CONTRADICTED' | 'UNVERIFIABLE';
  /** New confidence after validation (e.g., 95 if verified, 20 if contradicted) */
  newConfidence: number;
  /** Agent that performed the validation */
  validatedBy: string;
  /** Explanation of the validation result */
  explanation: string;
  /** Corrected value if CONTRADICTED */
  correctedValue?: unknown;
  correctedDisplayValue?: string;
}

/**
 * Updates facts in-memory based on agent validation results.
 * Does NOT persist to DB — used between sequential pipeline phases for speed.
 *
 * @param facts - Current facts array (mutated in place)
 * @param validations - Validation results from an agent
 * @returns Updated facts array (same reference, mutated)
 */
export function updateFactsInMemory(
  facts: CurrentFact[],
  validations: AgentFactValidation[]
): CurrentFact[] {
  for (const validation of validations) {
    const fact = facts.find(f => f.factKey === validation.factKey);
    if (!fact) continue;

    if (validation.status === 'CONTRADICTED' && validation.correctedValue !== undefined) {
      const previousValue = fact.currentValue;
      const previousSource = fact.currentSource;
      fact.currentValue = validation.correctedValue;
      fact.currentDisplayValue = validation.correctedDisplayValue ?? String(validation.correctedValue);
      fact.isDisputed = true;
      fact.disputeDetails = {
        conflictingValue: previousValue,
        conflictingSource: previousSource,
      };
    }

    fact.currentConfidence = validation.newConfidence;
  }

  return facts;
}

/**
 * Reformats the fact store string with agent validation annotations.
 * Adds a section showing what was verified/contradicted by the validating agent.
 *
 * @param facts - Current facts (possibly updated by updateFactsInMemory)
 * @param validations - Validation results to annotate
 * @returns New formatted string for injection into subsequent agent prompts
 */
export function reformatFactStoreWithValidations(
  facts: CurrentFact[],
  validations: AgentFactValidation[]
): string {
  // Start with the standard format
  const base = formatFactStoreForAgents(facts);

  if (validations.length === 0) return base;

  // Group validations by the agent that performed them
  const byAgent = new Map<string, AgentFactValidation[]>();
  for (const v of validations) {
    const existing = byAgent.get(v.validatedBy) || [];
    existing.push(v);
    byAgent.set(v.validatedBy, existing);
  }

  const lines: string[] = [base, ''];

  for (const [agent, agentValidations] of byAgent) {
    const verified = agentValidations.filter(v => v.status === 'VERIFIED');
    const contradicted = agentValidations.filter(v => v.status === 'CONTRADICTED');
    const unverifiable = agentValidations.filter(v => v.status === 'UNVERIFIABLE');

    lines.push(`### Validation par ${agent}`);
    lines.push('');

    if (verified.length > 0) {
      lines.push('**Claims vérifiées ✅:**');
      for (const v of verified) {
        lines.push(`- ${v.factKey}: ${v.explanation}`);
      }
      lines.push('');
    }

    if (contradicted.length > 0) {
      lines.push('**Claims contredites ❌:**');
      for (const v of contradicted) {
        lines.push(`- ${v.factKey}: ${v.explanation}${v.correctedDisplayValue ? ` → Valeur corrigée: ${v.correctedDisplayValue}` : ''}`);
      }
      lines.push('');
    }

    if (unverifiable.length > 0) {
      lines.push('**Claims non vérifiables ⚠️:**');
      for (const v of unverifiable) {
        lines.push(`- ${v.factKey}: ${v.explanation}`);
      }
      lines.push('');
    }
  }

  const result = lines.join('\n');

  // Cap output to ~8000 chars to avoid bloating LLM prompts
  const MAX_CHARS = 8000;
  if (result.length > MAX_CHARS) {
    const truncated = result.slice(0, MAX_CHARS);
    const lastNewline = truncated.lastIndexOf('\n');
    return (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated) +
      `\n\n[... ${validations.length} validations au total, sortie tronquée à ${MAX_CHARS} caractères]`;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// FACT EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Gets a specific value from current facts by key.
 * Useful for accessing individual metrics.
 *
 * @param facts - Array of CurrentFacts
 * @param factKey - The fact key to retrieve
 * @returns The value or undefined if not found
 */
export function getFactValue<T = unknown>(
  facts: CurrentFact[],
  factKey: string
): T | undefined {
  const fact = facts.find((f) => f.factKey === factKey);
  return fact?.currentValue as T | undefined;
}

/**
 * Gets multiple fact values at once.
 *
 * @param facts - Array of CurrentFacts
 * @param factKeys - Array of fact keys to retrieve
 * @returns Object mapping keys to values
 */
export function getFactValues(
  facts: CurrentFact[],
  factKeys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of factKeys) {
    const fact = facts.find((f) => f.factKey === key);
    if (fact) {
      result[key] = fact.currentValue;
    }
  }

  return result;
}

/**
 * Checks if all required facts are present.
 *
 * @param facts - Array of CurrentFacts
 * @param requiredKeys - Array of required fact keys
 * @returns Object with missing keys and completeness percentage
 */
export function checkFactCompleteness(
  facts: CurrentFact[],
  requiredKeys: string[]
): { complete: boolean; missing: string[]; completeness: number } {
  const presentKeys = new Set(facts.map((f) => f.factKey));
  const missing = requiredKeys.filter((k) => !presentKeys.has(k));

  return {
    complete: missing.length === 0,
    missing,
    completeness: Math.round(((requiredKeys.length - missing.length) / requiredKeys.length) * 100),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Formats a category enum to a human-readable name.
 */
function formatCategoryName(category: FactCategory): string {
  const names: Record<FactCategory, string> = {
    FINANCIAL: 'Financial Metrics',
    TEAM: 'Team & Organization',
    MARKET: 'Market & Industry',
    PRODUCT: 'Product & Technology',
    LEGAL: 'Legal & Compliance',
    COMPETITION: 'Competitive Landscape',
    TRACTION: 'Traction & Growth',
    OTHER: 'Other Information',
  };

  return names[category] || category;
}

/**
 * Formats a source enum to a human-readable name.
 */
function formatSourceName(source: FactSource): string {
  const names: Record<FactSource, string> = {
    DATA_ROOM: 'Data Room',
    BA_OVERRIDE: 'BA Override',
    FINANCIAL_MODEL: 'Financial Model',
    FOUNDER_RESPONSE: 'Founder',
    PITCH_DECK: 'Pitch Deck',
    CONTEXT_ENGINE: 'Context Engine',
  };

  return names[source] || source;
}

/**
 * Formats a fact key as a human-readable label.
 * Example: 'financial.arr' -> 'Financial ARR'
 */
function formatFactKeyAsLabel(factKey: string): string {
  return factKey
    .split('.')
    .map((part) =>
      part
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(' - ');
}

/**
 * Formats a value for display.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return JSON.stringify(value);
}

/**
 * Gets key financial metrics from facts (commonly used subset).
 *
 * @param facts - Array of CurrentFacts
 * @returns Object with key financial metrics
 */
export function getKeyFinancialMetrics(facts: CurrentFact[]): {
  arr?: number;
  mrr?: number;
  burnRate?: number;
  runway?: number;
  valuation?: number;
  growthRate?: number;
} {
  return {
    arr: getFactValue<number>(facts, 'financial.arr'),
    mrr: getFactValue<number>(facts, 'financial.mrr'),
    burnRate: getFactValue<number>(facts, 'financial.burn_rate'),
    runway: getFactValue<number>(facts, 'financial.runway_months'),
    valuation: getFactValue<number>(facts, 'financial.valuation_pre'),
    growthRate: getFactValue<number>(facts, 'financial.revenue_growth_yoy'),
  };
}

/**
 * Gets key traction metrics from facts.
 *
 * @param facts - Array of CurrentFacts
 * @returns Object with key traction metrics
 */
export function getKeyTractionMetrics(facts: CurrentFact[]): {
  customers?: number;
  users?: number;
  churn?: number;
  nrr?: number;
  ltv?: number;
  cac?: number;
} {
  return {
    customers: getFactValue<number>(facts, 'traction.customers_count'),
    users: getFactValue<number>(facts, 'traction.users_count'),
    churn: getFactValue<number>(facts, 'traction.churn_monthly'),
    nrr: getFactValue<number>(facts, 'traction.nrr'),
    ltv: getFactValue<number>(facts, 'traction.ltv'),
    cac: getFactValue<number>(facts, 'traction.cac'),
  };
}
