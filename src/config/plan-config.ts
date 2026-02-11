/**
 * F60: Single source of truth for plans and quotas.
 * ALL files needing limits/prices MUST import from here.
 */

export type PlanType = 'FREE' | 'PRO';

export const PLAN_CONFIG = {
  FREE: {
    name: 'Gratuit',
    price: 0,
    currency: 'EUR',
    analysesPerMonth: 3,
    updatesPerDeal: 2,
    boardsPerMonth: 0,
    extraBoardPrice: null as number | null,
    tiers: ['TIER_1', 'SYNTHESIS'] as const,
    maxTier: 1,
    features: {
      screening: true,
      deepAnalysis: false,
      sectorExpert: false,
      aiBoard: false,
      negotiation: false,
      memo: false,
    },
  },
  PRO: {
    name: 'PRO',
    price: 249,
    currency: 'EUR',
    analysesPerMonth: 20,
    updatesPerDeal: -1, // illimite
    boardsPerMonth: 5,
    extraBoardPrice: 59,
    tiers: ['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS'] as const,
    maxTier: 3,
    features: {
      screening: true,
      deepAnalysis: true,
      sectorExpert: true,
      aiBoard: true,
      negotiation: true,
      memo: true,
    },
  },
} as const;

export const TIER_DESCRIPTIONS = {
  TIER_1: {
    name: 'Tier 1 : Screening rapide',
    description: '13 agents en parallele - 2 min',
    agents: 13,
  },
  TIER_2: {
    name: 'Tier 2 : Expert sectoriel',
    description: '1 expert specialise selon le secteur',
    agents: 1,
  },
  TIER_3: {
    name: 'Tier 3 : Synthese & scoring',
    description: '5 agents de synthese, scenarios, memo',
    agents: 5,
  },
} as const;
