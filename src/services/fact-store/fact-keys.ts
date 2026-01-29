// ═══════════════════════════════════════════════════════════════════════
// FACT KEYS TAXONOMY
// Cles canoniques pour le Fact Store (~80 cles)
// ═══════════════════════════════════════════════════════════════════════

import { FactCategory } from './types';

export interface FactKeyDefinition {
  type: 'currency' | 'percentage' | 'number' | 'string' | 'date' | 'boolean' | 'array' | 'enum';
  category: FactCategory;
  unit?: string;
  enumValues?: string[];
  description?: string;
  isTemporal?: boolean; // True if this fact varies over time (ARR, MRR, headcount, etc.)
}

export const FACT_KEYS: Record<string, FactKeyDefinition> = {
  // ═══════════════════════════════════════════════════════════════════
  // FINANCIAL (~20 cles)
  // ═══════════════════════════════════════════════════════════════════
  'financial.arr': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Annual Recurring Revenue',
    isTemporal: true,
  },
  'financial.mrr': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Monthly Recurring Revenue',
    isTemporal: true,
  },
  'financial.revenue': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Total Revenue (non-recurring)',
    isTemporal: true,
  },
  'financial.revenue_growth_yoy': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Year-over-year revenue growth',
  },
  'financial.revenue_growth_mom': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Month-over-month revenue growth',
  },
  'financial.burn_rate': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR/month',
    description: 'Monthly burn rate',
    isTemporal: true,
  },
  'financial.runway_months': {
    type: 'number',
    category: 'FINANCIAL',
    description: 'Months of runway remaining',
    isTemporal: true,
  },
  'financial.gross_margin': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Gross margin percentage',
  },
  'financial.net_margin': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Net margin percentage',
  },
  'financial.ebitda': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'EBITDA',
  },
  'financial.cash_position': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Current cash in bank',
  },
  'financial.debt': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Total debt',
  },
  'financial.valuation_pre': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Pre-money valuation',
  },
  'financial.valuation_post': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Post-money valuation',
  },
  'financial.valuation_multiple': {
    type: 'number',
    category: 'FINANCIAL',
    description: 'Valuation multiple (x ARR)',
  },
  'financial.amount_raised_total': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Total amount raised to date',
  },
  'financial.amount_raising': {
    type: 'currency',
    category: 'FINANCIAL',
    unit: 'EUR',
    description: 'Amount raising in current round',
  },
  'financial.dilution_current_round': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Dilution in current round',
  },
  'financial.post_money_ownership_founders': {
    type: 'percentage',
    category: 'FINANCIAL',
    description: 'Founder ownership post-money',
  },

  // ═══════════════════════════════════════════════════════════════════
  // TRACTION (~15 cles)
  // ═══════════════════════════════════════════════════════════════════
  'traction.churn_monthly': {
    type: 'percentage',
    category: 'TRACTION',
    description: 'Monthly churn rate',
    isTemporal: true,
  },
  'traction.churn_annual': {
    type: 'percentage',
    category: 'TRACTION',
    description: 'Annual churn rate',
  },
  'traction.nrr': {
    type: 'percentage',
    category: 'TRACTION',
    description: 'Net Revenue Retention',
    isTemporal: true,
  },
  'traction.grr': {
    type: 'percentage',
    category: 'TRACTION',
    description: 'Gross Revenue Retention',
  },
  'traction.cac': {
    type: 'currency',
    category: 'TRACTION',
    unit: 'EUR',
    description: 'Customer Acquisition Cost',
  },
  'traction.ltv': {
    type: 'currency',
    category: 'TRACTION',
    unit: 'EUR',
    description: 'Customer Lifetime Value',
  },
  'traction.ltv_cac_ratio': {
    type: 'number',
    category: 'TRACTION',
    description: 'LTV/CAC ratio',
  },
  'traction.payback_months': {
    type: 'number',
    category: 'TRACTION',
    description: 'CAC payback period in months',
  },
  'traction.customers_count': {
    type: 'number',
    category: 'TRACTION',
    description: 'Total paying customers',
    isTemporal: true,
  },
  'traction.users_count': {
    type: 'number',
    category: 'TRACTION',
    description: 'Total users (free + paid)',
    isTemporal: true,
  },
  'traction.dau': {
    type: 'number',
    category: 'TRACTION',
    description: 'Daily Active Users',
  },
  'traction.mau': {
    type: 'number',
    category: 'TRACTION',
    description: 'Monthly Active Users',
  },
  'traction.conversion_rate': {
    type: 'percentage',
    category: 'TRACTION',
    description: 'Free to paid conversion rate',
  },
  'traction.arpu': {
    type: 'currency',
    category: 'TRACTION',
    unit: 'EUR',
    description: 'Average Revenue Per User',
  },
  'traction.arppu': {
    type: 'currency',
    category: 'TRACTION',
    unit: 'EUR',
    description: 'Average Revenue Per Paying User',
  },

  // ═══════════════════════════════════════════════════════════════════
  // TEAM (~15 cles)
  // ═══════════════════════════════════════════════════════════════════
  'team.size': {
    type: 'number',
    category: 'TEAM',
    description: 'Total team size',
    isTemporal: true,
  },
  'team.founders_count': {
    type: 'number',
    category: 'TEAM',
    description: 'Number of founders',
  },
  'team.technical_count': {
    type: 'number',
    category: 'TEAM',
    description: 'Number of technical team members',
  },
  'team.technical_ratio': {
    type: 'percentage',
    category: 'TEAM',
    description: 'Technical team as % of total',
  },
  'team.ceo.name': {
    type: 'string',
    category: 'TEAM',
    description: 'CEO name',
  },
  'team.ceo.linkedin': {
    type: 'string',
    category: 'TEAM',
    description: 'CEO LinkedIn URL',
  },
  'team.ceo.background': {
    type: 'string',
    category: 'TEAM',
    description: 'CEO professional background',
  },
  'team.ceo.previous_exits': {
    type: 'number',
    category: 'TEAM',
    description: 'Number of previous exits for CEO',
  },
  'team.cto.name': {
    type: 'string',
    category: 'TEAM',
    description: 'CTO name',
  },
  'team.cto.linkedin': {
    type: 'string',
    category: 'TEAM',
    description: 'CTO LinkedIn URL',
  },
  'team.cto.background': {
    type: 'string',
    category: 'TEAM',
    description: 'CTO professional background',
  },
  'team.advisors_count': {
    type: 'number',
    category: 'TEAM',
    description: 'Number of advisors',
  },
  'team.advisors': {
    type: 'array',
    category: 'TEAM',
    description: 'List of advisors with backgrounds',
  },
  'team.vesting_months': {
    type: 'number',
    category: 'TEAM',
    description: 'Vesting period in months',
  },
  'team.cliff_months': {
    type: 'number',
    category: 'TEAM',
    description: 'Cliff period in months',
  },

  // ═══════════════════════════════════════════════════════════════════
  // MARKET (~10 cles)
  // ═══════════════════════════════════════════════════════════════════
  'market.tam': {
    type: 'currency',
    category: 'MARKET',
    unit: 'EUR',
    description: 'Total Addressable Market',
  },
  'market.sam': {
    type: 'currency',
    category: 'MARKET',
    unit: 'EUR',
    description: 'Serviceable Addressable Market',
  },
  'market.som': {
    type: 'currency',
    category: 'MARKET',
    unit: 'EUR',
    description: 'Serviceable Obtainable Market',
  },
  'market.cagr': {
    type: 'percentage',
    category: 'MARKET',
    description: 'Market CAGR',
  },
  'market.geography_primary': {
    type: 'string',
    category: 'MARKET',
    description: 'Primary geographic market',
  },
  'market.geography_expansion': {
    type: 'array',
    category: 'MARKET',
    description: 'Expansion markets planned',
  },
  'market.segment': {
    type: 'string',
    category: 'MARKET',
    description: 'Target market segment',
  },
  'market.vertical': {
    type: 'string',
    category: 'MARKET',
    description: 'Industry vertical',
  },
  'market.b2b_or_b2c': {
    type: 'enum',
    category: 'MARKET',
    enumValues: ['B2B', 'B2C', 'B2B2C'],
    description: 'Business model type',
  },
  'market.timing_assessment': {
    type: 'string',
    category: 'MARKET',
    description: 'Market timing assessment',
  },

  // ═══════════════════════════════════════════════════════════════════
  // PRODUCT (~10 cles)
  // ═══════════════════════════════════════════════════════════════════
  'product.name': {
    type: 'string',
    category: 'PRODUCT',
    description: 'Product name',
  },
  'product.tagline': {
    type: 'string',
    category: 'PRODUCT',
    description: 'Product tagline/one-liner',
  },
  'product.stage': {
    type: 'enum',
    category: 'PRODUCT',
    enumValues: ['idea', 'mvp', 'beta', 'launched', 'scaling'],
    description: 'Product stage',
  },
  'product.launch_date': {
    type: 'date',
    category: 'PRODUCT',
    description: 'Product launch date',
  },
  'product.tech_stack': {
    type: 'array',
    category: 'PRODUCT',
    description: 'Technology stack',
  },
  'product.moat': {
    type: 'string',
    category: 'PRODUCT',
    description: 'Competitive moat/defensibility',
  },
  'product.ip_patents_count': {
    type: 'number',
    category: 'PRODUCT',
    description: 'Number of patents filed/granted',
  },
  'product.nps': {
    type: 'number',
    category: 'PRODUCT',
    description: 'Net Promoter Score',
  },
  'product.time_to_value_days': {
    type: 'number',
    category: 'PRODUCT',
    description: 'Time to value for customers in days',
  },
  'product.integration_count': {
    type: 'number',
    category: 'PRODUCT',
    description: 'Number of integrations available',
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPETITION (~8 cles)
  // ═══════════════════════════════════════════════════════════════════
  'competition.main_competitor': {
    type: 'string',
    category: 'COMPETITION',
    description: 'Main competitor name',
  },
  'competition.competitors_count': {
    type: 'number',
    category: 'COMPETITION',
    description: 'Number of direct competitors',
  },
  'competition.competitors_list': {
    type: 'array',
    category: 'COMPETITION',
    description: 'List of competitor names',
  },
  'competition.competitors_funded': {
    type: 'array',
    category: 'COMPETITION',
    description: 'Funded competitors with amounts',
  },
  'competition.differentiation': {
    type: 'string',
    category: 'COMPETITION',
    description: 'Key differentiator vs competition',
  },
  'competition.market_position': {
    type: 'enum',
    category: 'COMPETITION',
    enumValues: ['leader', 'challenger', 'follower', 'niche'],
    description: 'Market position',
  },
  'competition.switching_cost': {
    type: 'enum',
    category: 'COMPETITION',
    enumValues: ['low', 'medium', 'high'],
    description: 'Customer switching cost',
  },
  'competition.big_tech_threat': {
    type: 'enum',
    category: 'COMPETITION',
    enumValues: ['none', 'low', 'medium', 'high', 'critical'],
    description: 'Big Tech threat level',
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEGAL (~8 cles)
  // ═══════════════════════════════════════════════════════════════════
  'legal.incorporation_country': {
    type: 'string',
    category: 'LEGAL',
    description: 'Country of incorporation',
  },
  'legal.incorporation_date': {
    type: 'date',
    category: 'LEGAL',
    description: 'Date of incorporation',
  },
  'legal.legal_structure': {
    type: 'string',
    category: 'LEGAL',
    description: 'Legal structure (SAS, SARL, etc.)',
  },
  'legal.patents_filed': {
    type: 'number',
    category: 'LEGAL',
    description: 'Patents filed',
  },
  'legal.patents_granted': {
    type: 'number',
    category: 'LEGAL',
    description: 'Patents granted',
  },
  'legal.pending_litigation': {
    type: 'boolean',
    category: 'LEGAL',
    description: 'Any pending litigation',
  },
  'legal.regulatory_approvals': {
    type: 'array',
    category: 'LEGAL',
    description: 'Regulatory approvals obtained',
  },
  'legal.compliance_certifications': {
    type: 'array',
    category: 'LEGAL',
    description: 'Compliance certifications (SOC2, GDPR, etc.)',
  },

  // ═══════════════════════════════════════════════════════════════════
  // OTHER (~4 cles)
  // ═══════════════════════════════════════════════════════════════════
  'other.founding_date': {
    type: 'date',
    category: 'OTHER',
    description: 'Company founding date',
  },
  'other.headquarters': {
    type: 'string',
    category: 'OTHER',
    description: 'Headquarters location',
  },
  'other.website': {
    type: 'string',
    category: 'OTHER',
    description: 'Company website URL',
  },
  'other.sector': {
    type: 'string',
    category: 'OTHER',
    description: 'Primary sector/industry',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the definition for a specific fact key
 */
export function getFactKeyDefinition(factKey: string): FactKeyDefinition | undefined {
  return FACT_KEYS[factKey];
}

/**
 * Get all fact keys belonging to a specific category
 */
export function getFactKeysByCategory(category: FactCategory): string[] {
  return Object.entries(FACT_KEYS)
    .filter(([_, def]) => def.category === category)
    .map(([key]) => key);
}

/**
 * Check if a fact key is valid (exists in the taxonomy)
 */
export function isValidFactKey(factKey: string): boolean {
  return factKey in FACT_KEYS;
}

/**
 * Get the category from a fact key
 */
export function getCategoryFromFactKey(factKey: string): FactCategory | undefined {
  const def = FACT_KEYS[factKey];
  return def?.category;
}

/**
 * Get all fact keys of a specific type
 */
export function getFactKeysByType(
  type: FactKeyDefinition['type']
): string[] {
  return Object.entries(FACT_KEYS)
    .filter(([_, def]) => def.type === type)
    .map(([key]) => key);
}

/**
 * Get all currency fact keys (useful for formatting)
 */
export function getCurrencyFactKeys(): string[] {
  return getFactKeysByType('currency');
}

/**
 * Get all percentage fact keys (useful for formatting)
 */
export function getPercentageFactKeys(): string[] {
  return getFactKeysByType('percentage');
}

/**
 * Get fact keys with enum values
 */
export function getEnumFactKeys(): Array<{ key: string; values: string[] }> {
  return Object.entries(FACT_KEYS)
    .filter(([_, def]) => def.type === 'enum' && def.enumValues)
    .map(([key, def]) => ({
      key,
      values: def.enumValues!,
    }));
}

/**
 * Validate an enum value for a given fact key
 */
export function isValidEnumValue(factKey: string, value: string): boolean {
  const def = FACT_KEYS[factKey];
  if (!def || def.type !== 'enum' || !def.enumValues) {
    return false;
  }
  return def.enumValues.includes(value);
}

/**
 * Get all categories with their fact count
 */
export function getCategoryStats(): Record<FactCategory, number> {
  const stats: Record<string, number> = {};

  for (const def of Object.values(FACT_KEYS)) {
    stats[def.category] = (stats[def.category] || 0) + 1;
  }

  return stats as Record<FactCategory, number>;
}

/**
 * Total number of fact keys in the taxonomy
 */
export const FACT_KEY_COUNT = Object.keys(FACT_KEYS).length;

/**
 * All available fact keys as a typed array
 */
export const ALL_FACT_KEYS = Object.keys(FACT_KEYS) as ReadonlyArray<keyof typeof FACT_KEYS>;

/**
 * Type for valid fact key strings
 */
export type FactKey = keyof typeof FACT_KEYS;
