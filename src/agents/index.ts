// Types
export * from "./types";

// Base Agents
export { dealScreener } from "./deal-screener";
export { redFlagDetector } from "./red-flag-detector";
export { documentExtractor } from "./document-extractor";
export { dealScorer } from "./deal-scorer";

// Tier 1 Agents (Investigation)
export {
  financialAuditor,
  deckForensics,
  capTableAuditor,
  technicalDD,
  teamInvestigator,
  competitiveIntel,
  marketIntelligence,
  legalRegulatory,
  gtmAnalyst,
  customerIntel,
  exitStrategist,
  questionMaster,
} from "./tier1";

// Tier 2 Agents (Synthesis)
export {
  contradictionDetector,
  scenarioModeler,
  synthesisDealScorer,
  devilsAdvocate,
  memoGenerator,
} from "./tier2";

// Orchestrator
export { orchestrator, type AnalysisType, type AnalysisResult } from "./orchestrator";
