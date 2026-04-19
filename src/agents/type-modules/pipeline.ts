import type { RedFlagResult, ScoringResult, ExtractionResult } from './common';
import type { DeckForensicsResult, FinancialAuditResult, MarketIntelResult, CompetitiveIntelResult, TeamInvestigatorResult, TechnicalDDResult, TechStackDDResult, TechOpsDDResult, LegalRegulatoryResult, CapTableAuditResult, GTMAnalystResult, CustomerIntelResult, ExitStrategistResult, QuestionMasterResult } from './tier1';
import type { ContradictionDetectorResult, ConditionsAnalystResult, ScenarioModelerResult, SynthesisDealScorerResult, DevilsAdvocateResult, MemoGeneratorResult } from './tier3';

// Analysis session types
export type AnalysisAgentResult =
  | ExtractionResult | RedFlagResult | ScoringResult
  | DeckForensicsResult | FinancialAuditResult | MarketIntelResult | CompetitiveIntelResult
  | TeamInvestigatorResult | TechnicalDDResult | TechStackDDResult | TechOpsDDResult
  | LegalRegulatoryResult | CapTableAuditResult | GTMAnalystResult | CustomerIntelResult
  | ExitStrategistResult | QuestionMasterResult | ConditionsAnalystResult
  | ContradictionDetectorResult | ScenarioModelerResult | SynthesisDealScorerResult
  | DevilsAdvocateResult | MemoGeneratorResult;

// Tier 1 agent names
export type Tier1AgentName = "deck-forensics" | "financial-auditor" | "market-intelligence" | "competitive-intel" | "team-investigator" | "technical-dd" | "tech-stack-dd" | "tech-ops-dd" | "legal-regulatory" | "cap-table-auditor" | "gtm-analyst" | "customer-intel" | "exit-strategist" | "question-master";

// Tier 3 agent names
export type Tier3AgentName = "contradiction-detector" | "scenario-modeler" | "synthesis-deal-scorer" | "devils-advocate" | "memo-generator";

/** @deprecated Use Tier3AgentName */
export type Tier2AgentName = Tier3AgentName;

export interface AnalysisSession { id: string; dealId: string; type: "screening" | "full_analysis" | "full_dd"; status: "pending" | "running" | "completed" | "failed"; agents: { name: string; status: "pending" | "running" | "completed" | "failed"; result?: AnalysisAgentResult }[]; totalCost: number; startedAt: Date; completedAt?: Date }

// Agent configuration
export interface AgentConfig { name: string; description: string; modelComplexity: "simple" | "medium" | "complex" | "critical"; maxRetries: number; timeoutMs: number; dependencies?: string[] }
