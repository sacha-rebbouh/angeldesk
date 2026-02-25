// ============================================================================
// Live Coaching — Shared Types
// ============================================================================

// --- Session & Platform ---

export type SessionStatus =
  | "created"
  | "bot_joining"
  | "live"
  | "processing"
  | "completed"
  | "failed";

export type MeetingPlatform = "zoom" | "meet" | "teams";

// --- Speakers ---

export type SpeakerRole =
  | "founder"
  | "co-founder"
  | "ba"
  | "investor"
  | "lawyer"
  | "advisor"
  | "other";

export interface Participant {
  name: string;
  role: SpeakerRole;
  speakerId: string;
}

// --- Utterance Classification ---

export type UtteranceClassification =
  | "financial_claim"
  | "competitive_claim"
  | "team_info"
  | "market_claim"
  | "tech_claim"
  | "strategy_reveal"
  | "negotiation_point"
  | "question_response"
  | "small_talk"
  | "filler";

// --- Coaching Cards ---

export type CoachingCardType =
  | "question"
  | "contradiction"
  | "new_info"
  | "negotiation";

export type CardPriority = "high" | "medium" | "low";

export type CardStatus = "active" | "addressed" | "dismissed" | "expired";

// --- Deal Context (compiled for LLM injection) ---

export interface DealContext {
  dealId: string;
  companyName: string;
  sector: string | null;
  stage: string | null;

  financialSummary: {
    keyMetrics: Record<string, number | string>;
    benchmarkPosition: string;
    redFlags: string[];
  };

  teamSummary: {
    founders: string[];
    keyStrengths: string[];
    concerns: string[];
  };

  marketSummary: {
    size: string;
    competitors: string[];
    positioning: string;
  };

  techSummary: {
    stack: string;
    maturity: string;
    concerns: string[];
  };

  redFlags: Array<{
    severity: string;
    description: string;
    source: string;
    question: string;
  }>;

  questionsToAsk: Array<{
    question: string;
    priority: "high" | "medium" | "low";
    category: string;
    context: string;
  }>;

  benchmarks: {
    valuationRange: { p25: number; p50: number; p75: number } | null;
    comparableDeals: string[];
  };

  overallScore: number | null;
  signalProfile: string;
  keyContradictions: string[];

  documentSummaries: Array<{
    name: string;
    type: string;
    keyClaims: string[];
  }>;

  previousSessions: Array<{
    date: string;
    keyFindings: string[];
    unresolvedQuestions: string[];
  }>;
}

// --- Coaching Engine I/O ---

export interface CoachingInput {
  dealContext: DealContext;
  recentTranscript: Array<{
    speaker: string;
    role: string;
    text: string;
  }>;
  currentUtterance: {
    speaker: string;
    role: string;
    text: string;
    classification: UtteranceClassification;
  };
  previousSuggestions: Array<{
    type: string;
    content: string;
  }>;
  addressedTopics: string[];
}

export interface CoachingResponse {
  shouldRespond: boolean;
  type: CoachingCardType;
  priority: CardPriority;
  content: string;
  reference: string;
  suggestedQuestion: string | null;
}

// --- Post-Call Report ---

export interface PostCallReport {
  executiveSummary: string;
  keyPoints: Array<{
    topic: string;
    summary: string;
    speakerQuotes: string[];
  }>;
  actionItems: Array<{
    description: string;
    owner: "ba" | "founder" | "shared";
    deadline?: string;
  }>;
  newInformation: Array<{
    fact: string;
    impact: string;
    agentsAffected: string[];
  }>;
  contradictions: Array<{
    claimInDeck: string;
    claimInCall: string;
    severity: "high" | "medium" | "low";
  }>;
  questionsAsked: Array<{
    question: string;
    answer: string;
    wasFromCoaching: boolean;
  }>;
  remainingQuestions: string[];
  confidenceDelta: {
    before: number;
    after: number;
    reason: string;
  };
  sessionStats: {
    duration: number;
    totalUtterances: number;
    coachingCardsGenerated: number;
    coachingCardsAddressed: number;
    topicsChecklist: { total: number; covered: number };
  };
}

export interface DeltaReport {
  newFacts: Array<{ fact: string; impact: string }>;
  contradictions: Array<{
    claimInDeck: string;
    claimInCall: string;
    severity: "high" | "medium" | "low";
  }>;
  resolvedQuestions: Array<{ question: string; answer: string }>;
  impactedAgents: string[];
  confidenceChange: { before: number; after: number; reason: string };
}

// --- Ably Events ---

export type AblyEventName =
  | "coaching-card"
  | "card-addressed"
  | "session-status"
  | "participant-joined"
  | "participant-left";

export interface AblyCoachingCardEvent {
  id: string;
  type: CoachingCardType;
  priority: CardPriority;
  content: string;
  context: string | null;
  reference: string | null;
  suggestedQuestion: string | null;
  status: CardStatus;
  createdAt: string;
}

export interface AblyCardAddressedEvent {
  cardId: string;
  addressedBy: "auto" | "manual";
}

export interface AblySessionStatusEvent {
  status: SessionStatus;
  message: string;
}

// --- Recall.ai Types ---

export interface RecallBotConfig {
  meeting_url: string;
  bot_name?: string;
  recording_config: {
    transcript: {
      provider:
        | {
            // Deepgram Nova-3 — multilingual, high accuracy
            deepgram_streaming: {
              model: "nova-3" | "nova-2";
              language: "multi" | "fr" | "en" | string;
              smart_format?: boolean;
              punctuate?: boolean;
              diarize?: boolean;
              mip_opt_out?: boolean;
            };
          }
        | {
            // Recall built-in — EN only in low latency mode
            recallai_streaming: {
              mode: "prioritize_low_latency" | "prioritize_accuracy";
              language_code?: string;
            };
          };
    };
    realtime_endpoints: Array<{
      type: "webhook";
      url: string;
      events: Array<"transcript.data" | "transcript.partial_data">;
    }>;
  };
  automatic_leave?: {
    waiting_room_timeout?: number;
    noone_joined_timeout?: number;
    everyone_left_timeout?: number;
  };
}

export interface RecallTranscriptChunk {
  speaker: string;
  words: Array<{
    text: string;
    start_time: number;
    end_time: number;
  }>;
  is_final: boolean;
}

export interface RecallBotStatus {
  id: string;
  status: string;
  meeting_url: string;
  status_changes?: Array<{
    code: string;
    message: string;
    created_at: string;
  }>;
}

export type RecallRealtimeEvent =
  | "transcript.data"
  | "transcript.partial_data";

export interface RecallWebhookEvent {
  event: string;
  data: {
    bot_id: string;
    status?: {
      code: string;
      message: string;
    };
    transcript?: RecallTranscriptChunk;
    participant?: {
      id: string;
      name: string;
    };
  };
}
