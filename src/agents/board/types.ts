import { ModelKey } from "@/services/openrouter/client";

// ============================================================================
// BOARD MEMBER CONFIGURATION
// ============================================================================

export interface BoardMemberConfig {
  id: string;
  modelKey: ModelKey;
  name: string;
  color: string; // Hex color for UI
}

export const BOARD_MEMBERS: BoardMemberConfig[] = [
  {
    id: "claude",
    modelKey: "HAIKU",
    name: "Claude Haiku",
    color: "#D97706",
  },
  {
    id: "gpt4",
    modelKey: "GPT4O_MINI",
    name: "GPT-4o Mini",
    color: "#059669",
  },
  {
    id: "gemini",
    modelKey: "HAIKU",
    name: "Claude Haiku 2",
    color: "#2563EB",
  },
  {
    id: "mistral",
    modelKey: "GPT4O_MINI",
    name: "GPT-4o Mini 2",
    color: "#7C3AED",
  },
];

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

  // Previous agent outputs (Tier 1-2-3)
  agentOutputs: {
    tier1?: {
      screener?: unknown;
      scorer?: unknown;
      redFlagDetector?: unknown;
    };
    tier2?: {
      founderAnalyst?: unknown;
      marketAnalyst?: unknown;
      financialAnalyst?: unknown;
      productAnalyst?: unknown;
    };
    tier3?: {
      sectorExperts?: Record<string, unknown>;
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
