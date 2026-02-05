import { ModelKey } from "@/services/openrouter/client";

// ============================================================================
// BOARD MEMBER CONFIGURATION
// ============================================================================

export interface BoardMemberConfig {
  id: string;
  modelKey: ModelKey;
  name: string;
  color: string; // Hex color for UI
  provider: "anthropic" | "openai" | "google" | "xai"; // For UI display
}

/**
 * TEST CONFIG (~$0.50/session)
 * Uses cheaper models for development and testing
 */
export const BOARD_MEMBERS_TEST: BoardMemberConfig[] = [
  {
    id: "claude",
    modelKey: "HAIKU",
    name: "Claude Haiku",
    color: "#D97706", // Amber - Anthropic brand
    provider: "anthropic",
  },
  {
    id: "gpt",
    modelKey: "GPT4O_MINI",
    name: "GPT-4o Mini",
    color: "#10B981", // Green - OpenAI
    provider: "openai",
  },
  {
    id: "gemini",
    modelKey: "GEMINI_FLASH",
    name: "Gemini Flash",
    color: "#3B82F6", // Blue - Google
    provider: "google",
  },
  {
    id: "grok",
    modelKey: "GROK_41_FAST",
    name: "Grok 4.1 Fast",
    color: "#FF6600", // Orange - xAI
    provider: "xai",
  },
];

/**
 * PRODUCTION CONFIG (~$4-5/session)
 * Uses top-tier models from each provider for quality deliberation
 */
export const BOARD_MEMBERS_PROD: BoardMemberConfig[] = [
  {
    id: "claude",
    modelKey: "SONNET",
    name: "Claude Sonnet",
    color: "#D97706", // Amber - Anthropic brand
    provider: "anthropic",
  },
  {
    id: "gpt",
    modelKey: "GPT4O",
    name: "GPT-4o",
    color: "#10B981", // Green - OpenAI
    provider: "openai",
  },
  {
    id: "gemini",
    modelKey: "GEMINI_PRO",
    name: "Gemini Pro",
    color: "#3B82F6", // Blue - Google
    provider: "google",
  },
  {
    id: "grok",
    modelKey: "GROK_4",
    name: "Grok 4",
    color: "#FF6600", // Orange - xAI
    provider: "xai",
  },
];

/**
 * Get the appropriate board members config based on environment
 * In production (NODE_ENV === 'production'), uses premium models
 * Otherwise uses cheaper test models
 */
export function getBoardMembers(): BoardMemberConfig[] {
  // Use BOARD_CONFIG env var to override, or default based on NODE_ENV
  const configMode = process.env.BOARD_CONFIG || (process.env.NODE_ENV === "production" ? "prod" : "test");
  return configMode === "prod" ? BOARD_MEMBERS_PROD : BOARD_MEMBERS_TEST;
}

// DEPRECATED: Use getBoardMembers() instead to avoid module-load-time race condition
// This constant is evaluated at module load time, which may differ from runtime environment
// Keeping for backward compatibility but prefer getBoardMembers() for new code
/** @deprecated Use getBoardMembers() instead */
export const BOARD_MEMBERS: BoardMemberConfig[] =
  process.env.NODE_ENV === "production" ? BOARD_MEMBERS_PROD : BOARD_MEMBERS_TEST;

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface BoardInput {
  dealId: string;
  dealName: string;
  companyName: string;

  // Extracted documents
  documents: {
    name: string;
    type: string;
    extractedText: string | null;
  }[];

  // Enriched data from Context Engine
  enrichedData: {
    linkedinProfiles?: unknown[];
    marketData?: unknown;
    competitorData?: unknown;
    fundingHistory?: unknown;
    newsArticles?: unknown[];
  } | null;

  // Previous agent outputs (Tier 0-1-2-3) - ALL AGENTS
  agentOutputs: {
    // Tier 0: Base agents
    tier0?: {
      documentExtractor?: unknown;  // Extracted data from documents
      dealScorer?: unknown;         // Quick scoring
      redFlagDetector?: unknown;    // Red flags detection
    };

    // Tier 1: 13 Investigation agents (parallel)
    tier1?: {
      deckForensics?: unknown;      // Deck quality, claims verification
      financialAuditor?: unknown;   // Financial metrics, unit economics
      marketIntelligence?: unknown; // TAM/SAM/SOM, market trends
      competitiveIntel?: unknown;   // Competitors, moat analysis
      teamInvestigator?: unknown;   // Founders, team composition
      techStackDD?: unknown;        // Technology stack, scalability
      techOpsDD?: unknown;          // Tech maturity, security, IP
      legalRegulatory?: unknown;    // Legal structure, compliance
      capTableAuditor?: unknown;    // Cap table, dilution
      gtmAnalyst?: unknown;         // Go-to-market, channels
      customerIntel?: unknown;      // Customer analysis, retention
      exitStrategist?: unknown;     // Exit scenarios, IRR
      questionMaster?: unknown;     // Questions to ask founder
    };

    // Tier 2: Sector expert (1 dynamic agent based on sector)
    tier2?: {
      sectorExpertName?: string;    // e.g., "saas-expert", "fintech-expert"
      sectorExpert?: unknown;       // Sector-specific analysis
    };

    // Tier 3: 5 Synthesis agents (sequential)
    tier3?: {
      contradictionDetector?: unknown;  // Contradictions between agents
      scenarioModeler?: unknown;        // Best/base/worst case scenarios
      synthesisDealScorer?: unknown;    // Final weighted score
      devilsAdvocate?: unknown;         // Challenge the thesis
      memoGenerator?: unknown;          // Investment memo
    };

    // Fact Store: Extracted and verified facts
    factStore?: {
      facts?: unknown[];            // All current facts (materialized view)
      contradictions?: unknown[];   // Disputed/contradicted facts
      formatted?: string;           // Pre-formatted for LLM consumption
    };
  };

  // Data sources with reliability info
  sources: {
    source: string;
    reliability: "high" | "medium" | "low";
    dataPoints: string[];
  }[];
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export type BoardVerdictType = "GO" | "NO_GO" | "NEED_MORE_INFO";

export interface InitialAnalysis {
  verdict: BoardVerdictType;
  confidence: number; // 0-100

  // Key arguments
  arguments: {
    point: string;
    strength: "strong" | "moderate" | "weak";
    evidence: string;
  }[];

  // Concerns/risks
  concerns: {
    concern: string;
    severity: "critical" | "high" | "medium" | "low";
    mitigation?: string;
  }[];

  // What would change their mind
  wouldChangeVerdict: string[];
}

// ============================================================================
// DEBATE TYPES
// ============================================================================

export interface DebateResponse {
  positionChanged: boolean;
  newVerdict?: BoardVerdictType;
  newConfidence?: number;

  // Justification for position (or change)
  justification: string;

  // Responses to specific other members
  responsesToOthers: {
    targetMemberId: string;
    pointAddressed: string;
    response: string;
    agreement: "agree" | "disagree" | "partially_agree";
  }[];

  // New points raised
  newPoints?: {
    point: string;
    evidence: string;
  }[];
}

// ============================================================================
// VOTE TYPES
// ============================================================================

export interface FinalVote {
  verdict: BoardVerdictType;
  confidence: number; // 0-100

  // Final justification
  justification: string;

  // Key factors that led to this vote
  keyFactors: {
    factor: string;
    weight: "high" | "medium" | "low";
    direction: "positive" | "negative" | "neutral";
  }[];

  // Points of agreement with others
  agreementPoints: string[];

  // Remaining concerns even if voting GO
  remainingConcerns: string[];
}

// ============================================================================
// VERDICT RESULT
// ============================================================================

export type ConsensusLevelType = "UNANIMOUS" | "STRONG" | "SPLIT" | "MINORITY";

export interface BoardVerdictResult {
  verdict: BoardVerdictType;
  consensusLevel: ConsensusLevelType;
  stoppingReason: "consensus" | "majority_stable" | "max_rounds" | "stagnation";

  // Vote breakdown
  votes: {
    memberId: string;
    memberName: string;
    color: string;
    verdict: BoardVerdictType;
    confidence: number;
    justification: string;
  }[];

  // Synthesis
  consensusPoints: string[]; // What everyone agrees on
  frictionPoints: string[]; // Where disagreement remains
  questionsForFounder: string[]; // Follow-up questions to ask

  // Execution details
  totalRounds: number;
  totalCost: number;
  totalTimeMs: number;
}

// ============================================================================
// PROGRESS EVENTS (for SSE streaming)
// ============================================================================

export type BoardProgressEventType =
  | "session_started"
  | "member_analysis_started"
  | "member_analysis_completed"
  | "member_analysis_failed"
  | "debate_round_started"
  | "debate_response"
  | "debate_round_completed"
  | "voting_started"
  | "member_voted"
  | "verdict_reached"
  | "error"
  | "stopped";

export interface BoardProgressEvent {
  type: BoardProgressEventType;
  timestamp: number;
  sessionId: string;

  // Optional data based on event type
  memberId?: string;
  memberName?: string;
  roundNumber?: number;
  analysis?: InitialAnalysis;
  debateResponse?: DebateResponse;
  vote?: FinalVote;
  verdict?: BoardVerdictResult;
  error?: string;
  message?: string;
}

// ============================================================================
// ORCHESTRATOR OPTIONS
// ============================================================================

export interface BoardOrchestratorOptions {
  dealId: string;
  userId: string;
  maxRounds?: number; // Default: 3
  timeoutMs?: number; // Default: 600000 (10 min)
  onProgress?: (event: BoardProgressEvent) => void;
}

// ============================================================================
// STOPPING CONDITION RESULT
// ============================================================================

export interface StoppingConditionResult {
  shouldStop: boolean;
  reason: "consensus" | "majority_stable" | "max_rounds" | "stagnation" | null;
  currentVerdicts: Record<string, BoardVerdictType>;
  consensusLevel: ConsensusLevelType | null;
}
