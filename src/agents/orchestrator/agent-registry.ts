import type { AgentResult, EnrichedAgentContext, AgentContext } from "../types";
import { redFlagDetector } from "../red-flag-detector";
import { documentExtractor } from "../document-extractor";
import { dealScorer } from "../deal-scorer";
import type { BaseAgentName } from "./types";

// Base agent registry (existing agents)
export const BASE_AGENTS: Record<BaseAgentName, { run: (context: AgentContext) => Promise<AgentResult> }> = {
  "red-flag-detector": redFlagDetector,
  "document-extractor": documentExtractor,
  "deal-scorer": dealScorer,
};

// Type for dynamic agent modules
type DynamicAgent = { run: (context: EnrichedAgentContext) => Promise<AgentResult> };

// Cached agent modules (lazy loaded)
let tier1Agents: Record<string, DynamicAgent> | null = null;
let tier3Agents: Record<string, DynamicAgent> | null = null;

/**
 * Get Tier 1 agents (13 investigation agents)
 * Note: technical-dd has been split into tech-stack-dd and tech-ops-dd
 */
export async function getTier1Agents(_useReAct = false): Promise<Record<string, DynamicAgent>> {
  // Always return Standard agents (ReAct removed - better results, 20x cheaper)
  if (!tier1Agents) {
    // Dynamic import to avoid circular dependencies
    const tier1Module = await import("../tier1");
    tier1Agents = {
      "deck-forensics": tier1Module.deckForensics,
      "financial-auditor": tier1Module.financialAuditor,
      "market-intelligence": tier1Module.marketIntelligence,
      "competitive-intel": tier1Module.competitiveIntel,
      "team-investigator": tier1Module.teamInvestigator,
      "tech-stack-dd": tier1Module.techStackDD,
      "tech-ops-dd": tier1Module.techOpsDD,
      "legal-regulatory": tier1Module.legalRegulatory,
      "cap-table-auditor": tier1Module.capTableAuditor,
      "gtm-analyst": tier1Module.gtmAnalyst,
      "customer-intel": tier1Module.customerIntel,
      "exit-strategist": tier1Module.exitStrategist,
      "question-master": tier1Module.questionMaster,
    };
  }
  return tier1Agents;
}

/**
 * Get Tier 3 agents (5 synthesis agents)
 */
export async function getTier3Agents(): Promise<Record<string, DynamicAgent>> {
  if (!tier3Agents) {
    const tier3Module = await import("../tier3");
    tier3Agents = {
      "contradiction-detector": tier3Module.contradictionDetector,
      "scenario-modeler": tier3Module.scenarioModeler,
      "synthesis-deal-scorer": tier3Module.synthesisDealScorer,
      "devils-advocate": tier3Module.devilsAdvocate,
      "memo-generator": tier3Module.memoGenerator,
    };
  }
  return tier3Agents;
}

/**
 * Get Tier 2 sector expert based on deal sector
 * Returns null if no matching expert is available
 */
export async function getTier2SectorExpert(
  sector: string | null | undefined
): Promise<{ name: string; run: (context: EnrichedAgentContext) => Promise<AgentResult> } | null> {
  if (!sector) return null;

  const tier2Module = await import("../tier2");
  return tier2Module.getSectorExpertForDeal(sector);
}

/**
 * Clear cached agents (useful for testing)
 */
export function clearAgentCache(): void {
  tier1Agents = null;
  tier3Agents = null;
}
