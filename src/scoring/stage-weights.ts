/**
 * Dynamic scoring weights by investment stage.
 *
 * Rationale:
 * - Pre-Seed: Team is everything (no metrics). Vision/market matter.
 * - Seed: Team still dominant, but early traction signals appear.
 * - Series A: PMF must be proven. GTM/Traction becomes critical.
 * - Series B+: Unit economics and financials dominate. Team is table stakes.
 */

export interface DimensionWeights {
  team: number;
  financials: number;
  market: number;
  productTech: number;
  gtmTraction: number;
  competitive: number;
  exitPotential: number;
}

export const STAGE_WEIGHTS: Record<string, DimensionWeights> = {
  PRE_SEED: {
    team: 0.40,
    financials: 0.05,
    market: 0.20,
    productTech: 0.15,
    gtmTraction: 0.05,
    competitive: 0.10,
    exitPotential: 0.05,
  },
  SEED: {
    team: 0.30,
    financials: 0.10,
    market: 0.15,
    productTech: 0.15,
    gtmTraction: 0.15,
    competitive: 0.10,
    exitPotential: 0.05,
  },
  SERIES_A: {
    team: 0.20,
    financials: 0.20,
    market: 0.15,
    productTech: 0.15,
    gtmTraction: 0.20,
    competitive: 0.05,
    exitPotential: 0.05,
  },
  SERIES_B: {
    team: 0.15,
    financials: 0.30,
    market: 0.10,
    productTech: 0.10,
    gtmTraction: 0.20,
    competitive: 0.05,
    exitPotential: 0.10,
  },
  SERIES_C: {
    team: 0.10,
    financials: 0.35,
    market: 0.10,
    productTech: 0.10,
    gtmTraction: 0.15,
    competitive: 0.05,
    exitPotential: 0.15,
  },
  LATER: {
    team: 0.10,
    financials: 0.35,
    market: 0.10,
    productTech: 0.10,
    gtmTraction: 0.15,
    competitive: 0.05,
    exitPotential: 0.15,
  },
};

/**
 * Sector-specific weight adjustments.
 * Applied as multipliers on top of stage weights.
 * Values > 1.0 increase the weight, < 1.0 decrease it.
 * The total is re-normalized to 100% after application.
 */
export const SECTOR_ADJUSTMENTS: Record<string, Partial<Record<keyof DimensionWeights, number>>> = {
  deeptech: {
    productTech: 1.5,
    gtmTraction: 0.5,
    exitPotential: 0.7,
  },
  saas: {
    financials: 1.3,
    gtmTraction: 1.3,
    productTech: 0.8,
  },
  biotech: {
    team: 1.4,
    productTech: 1.3,
    gtmTraction: 0.5,
    competitive: 0.7,
  },
  healthtech: {
    team: 1.3,
    productTech: 1.2,
    gtmTraction: 0.7,
  },
  marketplace: {
    gtmTraction: 1.5,
    competitive: 1.3,
    financials: 0.8,
  },
  fintech: {
    financials: 1.3,
    competitive: 1.2,
    productTech: 1.1,
  },
};

/**
 * Get the appropriate weights for a given stage and sector.
 */
export function getWeightsForDeal(
  stage: string | null | undefined,
  sector: string | null | undefined
): DimensionWeights {
  const normalizedStage = normalizeStage(stage);
  const baseWeights = { ...(STAGE_WEIGHTS[normalizedStage] || STAGE_WEIGHTS.SEED) };

  if (sector) {
    const normalizedSector = sector.toLowerCase().replace(/[^a-z]/g, '');
    const adjustments = SECTOR_ADJUSTMENTS[normalizedSector];

    if (adjustments) {
      for (const [dimension, multiplier] of Object.entries(adjustments)) {
        const key = dimension as keyof DimensionWeights;
        if (baseWeights[key] !== undefined && multiplier !== undefined) {
          baseWeights[key] *= multiplier;
        }
      }

      // Re-normalize to sum = 1.0
      const total = Object.values(baseWeights).reduce((sum, w) => sum + w, 0);
      for (const key of Object.keys(baseWeights) as (keyof DimensionWeights)[]) {
        baseWeights[key] = Math.round((baseWeights[key] / total) * 100) / 100;
      }

      // Fix rounding errors
      const newTotal = Object.values(baseWeights).reduce((sum, w) => sum + w, 0);
      if (Math.abs(newTotal - 1.0) > 0.001) {
        const largestKey = (Object.keys(baseWeights) as (keyof DimensionWeights)[])
          .reduce((a, b) => baseWeights[a] > baseWeights[b] ? a : b);
        baseWeights[largestKey] += (1.0 - newTotal);
        baseWeights[largestKey] = Math.round(baseWeights[largestKey] * 100) / 100;
      }
    }
  }

  return baseWeights;
}

/**
 * Format weights as a markdown table for injection into prompts.
 */
export function formatWeightsForPrompt(weights: DimensionWeights): string {
  const dimensionNames: Record<keyof DimensionWeights, { label: string; agents: string }> = {
    team: { label: 'Team', agents: 'team-investigator' },
    financials: { label: 'Financials', agents: 'financial-auditor, cap-table-auditor' },
    market: { label: 'Market', agents: 'market-intelligence' },
    productTech: { label: 'Product/Tech', agents: 'tech-stack-dd, tech-ops-dd, deck-forensics' },
    gtmTraction: { label: 'GTM/Traction', agents: 'gtm-analyst, customer-intel' },
    competitive: { label: 'Competitive', agents: 'competitive-intel' },
    exitPotential: { label: 'Exit Potential', agents: 'exit-strategist' },
  };

  let table = '| Dimension | Poids | Agents sources |\n|-----------|-------|----------------|\n';

  for (const [key, config] of Object.entries(dimensionNames)) {
    const weight = weights[key as keyof DimensionWeights];
    table += `| ${config.label} | ${Math.round(weight * 100)}% | ${config.agents} |\n`;
  }

  return table;
}

function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return 'SEED';
  const upper = stage.toUpperCase().replace(/[^A-Z_]/g, '').replace(/\s+/g, '_');
  if (upper.includes('PRE')) return 'PRE_SEED';
  if (upper.includes('SEED')) return 'SEED';
  if (upper.includes('SERIES_A') || upper === 'A') return 'SERIES_A';
  if (upper.includes('SERIES_B') || upper === 'B') return 'SERIES_B';
  if (upper.includes('SERIES_C') || upper === 'C') return 'SERIES_C';
  if (upper.includes('LATER') || upper.includes('GROWTH')) return 'LATER';
  return 'SEED';
}
