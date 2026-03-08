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

  // Deal financial basics (raw numbers from the deal itself)
  dealBasics: {
    arr: number | null;
    growthRate: number | null;
    amountRequested: number | null;
    valuationPre: number | null;
    geography: string | null;
    description: string | null;
    website: string | null;
  };

  // All dimension scores
  scores: {
    global: number | null;
    team: number | null;
    market: number | null;
    product: number | null;
    financials: number | null;
  };

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

  // Founder details (LinkedIn, parcours, etc.)
  founderDetails: Array<{
    name: string;
    role: string;
    headline: string;
    experiences: Array<{ title: string; company: string; period: string }>;
    education: string[];
    previousVentures: string[];
  }>;

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

  // All agent findings (key findings from ALL analysis agents)
  allAgentFindings: Record<string, {
    summary: string;
    keyFindings: string[];
    score?: number;
  }>;

  // Negotiation strategy from synthesis
  negotiationStrategy: string;

  documentSummaries: Array<{
    name: string;
    type: string;
    keyClaims: string[];
  }>;

  previousSessions: Array<{
    date: string;
    duration: number;
    keyFindings: string[];
    unresolvedQuestions: string[];
    condensedIntel: CondensedTranscriptIntel | null;
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
  visualContext?: VisualContext;
  sessionId?: string;
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
    screenCapturesAnalyzed?: number;
    topicsChecklist: { total: number; covered: number };
  };
}

// --- Condensed Transcript Intelligence (generated post-call for agent injection + coaching enrichment) ---

export interface CondensedTranscriptIntel {
  /** Key factual claims with numbers (revenue, metrics, dates) */
  keyFacts: Array<{
    fact: string;
    category: "financial" | "team" | "market" | "tech" | "legal" | "competitive" | "product";
    confidence: "verbatim" | "inferred";
  }>;
  /** Explicit commitments/promises by the founder */
  founderCommitments: Array<{ commitment: string; deadline?: string }>;
  /** Financial data points mentioned (numbers only) */
  financialDataPoints: Array<{ metric: string; value: string; context: string }>;
  /** Competitive insights revealed during call */
  competitiveInsights: string[];
  /** Team revelations (new hires, departures, org changes) */
  teamRevelations: string[];
  /** Contradictions between call claims and existing analysis */
  contradictionsWithAnalysis: Array<{
    analysisClaim: string;
    callClaim: string;
    severity: "high" | "medium" | "low";
  }>;
  /** Visual data points extracted from screen share (if any) */
  visualDataPoints: string[];
  /** Questions asked and answers obtained (condensed) */
  answersObtained: Array<{ topic: string; answer: string }>;
  /** Open action items / next steps */
  actionItems: Array<{ item: string; owner: "ba" | "founder" | "shared" }>;
  /** Confidence delta summary */
  confidenceDelta: { direction: "up" | "down" | "stable"; reason: string };
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

// --- Visual Analysis (Screen Capture V2) ---

export type ScreenShareState = "inactive" | "active";

export type VisualContentType =
  | "slide"
  | "dashboard"
  | "demo"
  | "code"
  | "spreadsheet"
  | "document"
  | "other";

export interface VisualClassification {
  isNewContent: boolean;
  contentType: VisualContentType;
  description: string;
}

export interface VisualAnalysis {
  frameId: string;
  sessionId: string;
  timestamp: number;
  contentType: VisualContentType;
  description: string;
  keyData: Array<{
    dataPoint: string;
    category: "financial" | "technical" | "market" | "team" | "other";
    relevance: "high" | "medium" | "low";
  }>;
  contradictions: Array<{
    visualClaim: string;
    analysisClaim: string;
    severity: "high" | "medium" | "low";
    suggestedQuestion?: string | null;
  }>;
  newInsights: string[];
  suggestedQuestion: string | null;
  analysisCost: number;
}

export interface VisualContext {
  currentSlide: string | null;
  keyDataFromVisual: string[];
  visualContradictions: string[];
  recentSlideHistory: string[];
}

// --- Ably Events ---

export type AblyEventName =
  | "coaching-card"
  | "card-addressed"
  | "session-status"
  | "participant-joined"
  | "participant-left"
  | "visual-analysis"
  | "screenshare-state";

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

export interface AblyVisualAnalysisEvent {
  frameId: string;
  contentType: VisualContentType;
  description: string;
  hasContradictions: boolean;
  keyDataCount: number;
  timestamp: number;
}

export interface AblyScreenShareStateEvent {
  state: ScreenShareState;
  participantName: string | null;
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
      type: "webhook" | "websocket";
      url: string;
      events: Array<RecallRealtimeEvent | RecallMediaEvent>;
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
  | "transcript.partial_data"
  | "participant_events.screenshare_on"
  | "participant_events.screenshare_off";

export type RecallMediaEvent =
  | "video_separate_png.data"
  | "video_separate_h264.data"
  | "audio_mixed_raw.data"
  | "audio_separate_raw.data";

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
