/**
 * Message Types for Agent Communication
 */

import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";

// ============================================================================
// MESSAGE CORE TYPES
// ============================================================================

export type MessageType =
  | "finding"
  | "question"
  | "contradiction"
  | "request"
  | "response"
  | "state_change"
  | "error";

export type MessagePriority = "low" | "normal" | "high" | "critical";

export type MessageTopic =
  | "financial"
  | "team"
  | "market"
  | "product"
  | "competitive"
  | "legal"
  | "technical"
  | "synthesis"
  | "general";

/**
 * Core message structure for inter-agent communication
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  topic: MessageTopic;
  priority: MessagePriority;

  // Routing
  from: string; // Agent name or "orchestrator"
  to: string | string[] | "*"; // Target agent(s) or broadcast

  // Content
  subject: string;
  payload: MessagePayload;

  // Metadata
  timestamp: Date;
  correlationId?: string; // For request/response pairs
  replyTo?: string; // Message ID this is replying to
  expiresAt?: Date;

  // Processing
  acknowledged: boolean;
  processedBy: string[];
}

/**
 * Payload types for different message types
 */
export type MessagePayload =
  | FindingPayload
  | QuestionPayload
  | ContradictionPayload
  | RequestPayload
  | ResponsePayload
  | StateChangePayload
  | ErrorPayload;

export interface FindingPayload {
  type: "finding";
  finding: ScoredFinding;
  relatedFindings?: string[]; // IDs of related findings
}

export interface QuestionPayload {
  type: "question";
  question: string;
  context: string;
  options?: string[];
  requiresResponse: boolean;
  deadline?: Date;
}

export interface ContradictionPayload {
  type: "contradiction";
  contradictionId: string;
  findingIds: string[];
  description: string;
  severity: "minor" | "moderate" | "major" | "critical";
}

export interface RequestPayload {
  type: "request";
  requestType: "data" | "analysis" | "verification" | "opinion";
  description: string;
  parameters?: Record<string, unknown>;
  deadline?: Date;
}

export interface ResponsePayload {
  type: "response";
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface StateChangePayload {
  type: "state_change";
  previousState: string;
  newState: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorPayload {
  type: "error";
  errorCode: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

// ============================================================================
// MESSAGE BUS TYPES
// ============================================================================

export interface MessageFilter {
  type?: MessageType | MessageType[];
  topic?: MessageTopic | MessageTopic[];
  from?: string | string[];
  to?: string;
  priority?: MessagePriority | MessagePriority[];
  since?: Date;
  until?: Date;
}

export interface MessageHandler {
  (message: AgentMessage): Promise<void> | void;
}

export interface Subscription {
  id: string;
  filter: MessageFilter;
  handler: MessageHandler;
  subscribedAt: Date;
}

export interface MessageBusStats {
  totalMessages: number;
  messagesByType: Record<MessageType, number>;
  messagesByTopic: Record<MessageTopic, number>;
  activeSubscriptions: number;
  pendingMessages: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function createMessage(
  params: Omit<AgentMessage, "id" | "timestamp" | "acknowledged" | "processedBy">
): AgentMessage {
  return {
    ...params,
    id: crypto.randomUUID(),
    timestamp: new Date(),
    acknowledged: false,
    processedBy: [],
  };
}

export function createFindingMessage(
  from: string,
  to: string | string[] | "*",
  finding: ScoredFinding,
  options: Partial<Omit<AgentMessage, "type" | "payload">> = {}
): AgentMessage {
  return createMessage({
    type: "finding",
    topic: finding.category as MessageTopic,
    priority: finding.confidence.level === "high" ? "high" : "normal",
    from,
    to,
    subject: `Finding: ${finding.metric}`,
    payload: {
      type: "finding",
      finding,
    },
    ...options,
  });
}

export function createContradictionMessage(
  from: string,
  findingIds: string[],
  description: string,
  severity: ContradictionPayload["severity"],
  options: Partial<Omit<AgentMessage, "type" | "payload">> = {}
): AgentMessage {
  return createMessage({
    type: "contradiction",
    topic: "synthesis",
    priority: severity === "critical" ? "critical" : severity === "major" ? "high" : "normal",
    from,
    to: "*",
    subject: `Contradiction detected`,
    payload: {
      type: "contradiction",
      contradictionId: crypto.randomUUID(),
      findingIds,
      description,
      severity,
    },
    ...options,
  });
}

export function createRequestMessage(
  from: string,
  to: string | string[],
  requestType: RequestPayload["requestType"],
  description: string,
  parameters?: Record<string, unknown>,
  options: Partial<Omit<AgentMessage, "type" | "payload">> = {}
): AgentMessage {
  return createMessage({
    type: "request",
    topic: "general",
    priority: "normal",
    from,
    to,
    subject: `Request: ${requestType}`,
    payload: {
      type: "request",
      requestType,
      description,
      parameters,
    },
    ...options,
  });
}
