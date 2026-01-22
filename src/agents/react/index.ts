/**
 * ReAct Engine
 * Reasoning-Action-Observation loop implementation
 */

// Export types
export * from "./types";
export * from "./tools/types";

// Export engine
export { ReActEngine, createReActEngine } from "./engine";

// Export tool registry
export { toolRegistry } from "./tools/registry";

// Export and register built-in tools
export {
  registerBuiltInTools,
  searchBenchmarks,
  analyzeSection,
  crossReference,
  calculateMetric,
  writeMemory,
  readMemory,
} from "./tools/built-in";

// Export ReAct agents
export { financialAuditorReAct, FinancialAuditorReAct } from "./agents/financial-auditor-react";
export { teamInvestigatorReAct, TeamInvestigatorReAct } from "./agents/team-investigator-react";
export { marketIntelligenceReAct, MarketIntelligenceReAct } from "./agents/market-intelligence-react";
export { competitiveIntelReAct, CompetitiveIntelReAct } from "./agents/competitive-intel-react";

// Export new ReAct agents (Phase 3 migration)
export { deckForensicsReAct, DeckForensicsReAct } from "./agents/deck-forensics-react";
export { technicalDDReAct, TechnicalDDReAct } from "./agents/technical-dd-react";
export { capTableAuditorReAct, CapTableAuditorReAct } from "./agents/cap-table-auditor-react";
export { legalRegulatoryReAct, LegalRegulatoryReAct } from "./agents/legal-regulatory-react";
export { gtmAnalystReAct, GTMAnalystReAct } from "./agents/gtm-analyst-react";
export { customerIntelReAct, CustomerIntelReAct } from "./agents/customer-intel-react";
export { exitStrategistReAct, ExitStrategistReAct } from "./agents/exit-strategist-react";
export { questionMasterReAct, QuestionMasterReAct } from "./agents/question-master-react";
