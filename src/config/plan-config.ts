/**
 * Plan configuration — Credit-based system
 * ALL files needing credit costs/packs MUST import from services/credits/types.ts
 * This file provides UI-oriented config only.
 */

import { CREDIT_COSTS, CREDIT_PACKS, FULL_DEAL_PACKAGE_CREDITS } from '@/services/credits/types';
import {
  TIER1_AGENT_NAMES,
  TIER2_SECTOR_EXPERT_COUNT,
  TIER3_AGENT_NAMES,
} from "@/agents/orchestrator/types";

export { CREDIT_COSTS, CREDIT_PACKS, FULL_DEAL_PACKAGE_CREDITS };

const TIER1_AGENT_COUNT = TIER1_AGENT_NAMES.length;
const TIER3_AGENT_COUNT = TIER3_AGENT_NAMES.length;
const DEEP_DIVE_AGENT_COUNT = TIER1_AGENT_COUNT + TIER2_SECTOR_EXPERT_COUNT + TIER3_AGENT_COUNT;

export const TIER_DESCRIPTIONS = {
  TIER_1: {
    name: 'Tier 1 : Screening rapide',
    description: `${TIER1_AGENT_COUNT} agents en parallele - 2 min`,
    agents: TIER1_AGENT_COUNT,
    creditAction: 'QUICK_SCAN' as const,
    credits: CREDIT_COSTS.QUICK_SCAN,
  },
  TIER_2: {
    name: 'Tier 2 : Expert sectoriel',
    description: `${TIER2_SECTOR_EXPERT_COUNT} expert specialise selon le secteur`,
    agents: TIER2_SECTOR_EXPERT_COUNT,
  },
  TIER_3: {
    name: 'Tier 3 : Synthese & scoring',
    description: `${TIER3_AGENT_COUNT} agents de synthese, scenarios, memo`,
    agents: TIER3_AGENT_COUNT,
  },
  DEEP_DIVE: {
    name: 'Deep Dive (Tier 1+2+3)',
    description: 'Analyse complete avec tous les tiers',
    agents: DEEP_DIVE_AGENT_COUNT,
    creditAction: 'DEEP_DIVE' as const,
    credits: CREDIT_COSTS.DEEP_DIVE,
  },
} as const;

// Credit action display config for UI
export const CREDIT_ACTION_DISPLAY = {
  QUICK_SCAN: {
    name: 'Quick Scan',
    description: `Tier 1 : Screening rapide (${TIER1_AGENT_COUNT} agents)`,
    credits: CREDIT_COSTS.QUICK_SCAN,
    icon: 'zap',
  },
  DEEP_DIVE: {
    name: 'Deep Dive',
    description: 'Analyse complète (Tier 1+2+3)',
    credits: CREDIT_COSTS.DEEP_DIVE,
    icon: 'search',
  },
  AI_BOARD: {
    name: 'AI Board',
    description: '4 LLMs en délibération',
    credits: CREDIT_COSTS.AI_BOARD,
    icon: 'users',
  },
  LIVE_COACHING: {
    name: 'Live Coaching',
    description: 'Coaching temps réel (session 30 min)',
    credits: CREDIT_COSTS.LIVE_COACHING,
    icon: 'headphones',
  },
  RE_ANALYSIS: {
    name: 'Re-analyse',
    description: 'Re-analyse avec nouvelles données',
    credits: CREDIT_COSTS.RE_ANALYSIS,
    icon: 'refresh-cw',
  },
  CHAT: {
    name: 'Chat IA',
    description: 'Chat contextuel illimité',
    credits: CREDIT_COSTS.CHAT,
    icon: 'message-square',
  },
  PDF_EXPORT: {
    name: 'Export PDF',
    description: 'Rapport PDF professionnel',
    credits: CREDIT_COSTS.PDF_EXPORT,
    icon: 'file-text',
  },
} as const;
