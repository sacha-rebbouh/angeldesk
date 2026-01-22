import type { AgentResult, EnrichedAgentContext, AgentContext } from "../types";
import { dealScreener } from "../deal-screener";
import { redFlagDetector } from "../red-flag-detector";
import { documentExtractor } from "../document-extractor";
import { dealScorer } from "../deal-scorer";
import type { BaseAgentName } from "./types";

// Base agent registry (existing agents)
export const BASE_AGENTS: Record<BaseAgentName, { run: (context: AgentContext) => Promise<AgentResult> }> = {
  "deal-screener": dealScreener,
  "red-flag-detector": redFlagDetector,
  "document-extractor": documentExtractor,
  "deal-scorer": dealScorer,
};

// Type for dynamic agent modules
type DynamicAgent = { run: (context: EnrichedAgentContext) => Promise<AgentResult> };

// Cached agent modules (lazy loaded)
let tier1Agents: Record<string, DynamicAgent> | null = null;
let tier1ReactAgents: Record<string, DynamicAgent> | null = null;
let tier2Agents: Record<string, DynamicAgent> | null = null;

/**
 * Get Tier 1 agents (12 investigation agents)
 * Supports both standard and ReAct versions
 */
export async function getTier1Agents(useReAct = false): Promise<Record<string, DynamicAgent>> {
  // Return ReAct agents if requested - ALL agents now have ReAct versions
  if (useReAct) {
    if (!tier1ReactAgents) {
      const reactModule = await import("../react");

      // ALL 12 Tier 1 agents now have ReAct versions
      tier1ReactAgents = {
        "deck-forensics": reactModule.deckForensicsReAct,
        "financial-auditor": reactModule.financialAuditorReAct,
        "market-intelligence": reactModule.marketIntelligenceReAct,
        "competitive-intel": reactModule.competitiveIntelReAct,
        "team-investigator": reactModule.teamInvestigatorReAct,
        "technical-dd": reactModule.technicalDDReAct,
        "legal-regulatory": reactModule.legalRegulatoryReAct,
        "cap-table-auditor": reactModule.capTableAuditorReAct,
        "gtm-analyst": reactModule.gtmAnalystReAct,
        "customer-intel": reactModule.customerIntelReAct,
        "exit-strategist": reactModule.exitStrategistReAct,
        "question-master": reactModule.questionMasterReAct,
      };
    }
    return tier1ReactAgents;
  }

  // Standard agents
  if (!tier1Agents) {
    // Dynamic import to avoid circular dependencies
    const tier1Module = await import("../tier1");
    tier1Agents = {
      "deck-forensics": tier1Module.deckForensics,
      "financial-auditor": tier1Module.financialAuditor,
      "market-intelligence": tier1Module.marketIntelligence,
      "competitive-intel": tier1Module.competitiveIntel,
      "team-investigator": tier1Module.teamInvestigator,
      "technical-dd": tier1Module.technicalDD,
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
 * Get Tier 2 agents (5 synthesis agents)
 */
export async function getTier2Agents(): Promise<Record<string, DynamicAgent>> {
  if (!tier2Agents) {
    const tier2Module = await import("../tier2");
    tier2Agents = {
      "contradiction-detector": tier2Module.contradictionDetector,
      "scenario-modeler": tier2Module.scenarioModeler,
      "synthesis-deal-scorer": tier2Module.synthesisDealScorer,
      "devils-advocate": tier2Module.devilsAdvocate,
      "memo-generator": tier2Module.memoGenerator,
    };
  }
  return tier2Agents;
}

/**
 * Get Tier 3 sector expert based on deal sector
 * Returns null if no matching expert is available
 */
export async function getTier3SectorExpert(
  sector: string | null | undefined
): Promise<{ name: string; run: (context: EnrichedAgentContext) => Promise<AgentResult> } | null> {
  if (!sector) return null;

  const tier3Module = await import("../tier3");
  return tier3Module.getSectorExpertForDeal(sector);
}

/**
 * Clear cached agents (useful for testing)
 */
export function clearAgentCache(): void {
  tier1Agents = null;
  tier1ReactAgents = null;
  tier2Agents = null;
}
