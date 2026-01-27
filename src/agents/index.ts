// Types
export * from "./types";

// Base Agents
export { redFlagDetector } from "./red-flag-detector";
export { documentExtractor } from "./document-extractor";
export { dealScorer } from "./deal-scorer";

// Tier 1 Agents (Investigation)
export {
  financialAuditor,
  deckForensics,
  capTableAuditor,
  techStackDD,
  techOpsDD,
  teamInvestigator,
  competitiveIntel,
  marketIntelligence,
  legalRegulatory,
  gtmAnalyst,
  customerIntel,
  exitStrategist,
  questionMaster,
} from "./tier1";

// Tier 3 Agents (Synthesis)
export {
  contradictionDetector,
  scenarioModeler,
  synthesisDealScorer,
  devilsAdvocate,
  memoGenerator,
} from "./tier3";

// Orchestrator
export { orchestrator, type AnalysisType, type AnalysisResult } from "./orchestrator";
