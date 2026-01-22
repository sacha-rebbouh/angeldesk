/**
 * Agent Message Bus
 * Pub/sub system for inter-agent communication
 */

import type {
  AgentMessage,
  MessageBusStats,
  MessageFilter,
  MessageHandler,
  MessageType,
  MessageTopic,
  Subscription,
} from "./message-types";

/**
 * Message Bus for agent communication
 */
export class AgentMessageBus {
  private messages: AgentMessage[] = [];
  private subscriptions: Map<string, Subscription> = new Map();
  private messageQueue: AgentMessage[] = [];
  private processing = false;

  // Configuration
  private readonly maxHistorySize = 1000;
  private readonly maxQueueSize = 100;

  /**
   * Publish a message to the bus
   */
  async publish(message: AgentMessage): Promise<void> {
    // Add to history
    this.messages.push(message);

    // Trim history if needed
    if (this.messages.length > this.maxHistorySize) {
      this.messages = this.messages.slice(-this.maxHistorySize);
    }

    // Add to queue for processing
    this.messageQueue.push(message);

    // Process queue
    await this.processQueue();
  }

  /**
   * Subscribe to messages matching a filter
   */
  subscribe(filter: MessageFilter, handler: MessageHandler): string {
    const subscriptionId = crypto.randomUUID();

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      filter,
      handler,
      subscribedAt: new Date(),
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get messages matching a filter
   */
  getMessages(filter: MessageFilter = {}): AgentMessage[] {
    return this.messages.filter((msg) => this.matchesFilter(msg, filter));
  }

  /**
   * Get a specific message by ID
   */
  getMessage(id: string): AgentMessage | undefined {
    return this.messages.find((msg) => msg.id === id);
  }

  /**
   * Get messages for a specific agent
   */
  getMessagesFor(agentName: string): AgentMessage[] {
    return this.messages.filter(
      (msg) =>
        msg.to === agentName ||
        msg.to === "*" ||
        (Array.isArray(msg.to) && msg.to.includes(agentName))
    );
  }

  /**
   * Get messages from a specific agent
   */
  getMessagesFrom(agentName: string): AgentMessage[] {
    return this.messages.filter((msg) => msg.from === agentName);
  }

  /**
   * Acknowledge a message was processed
   */
  acknowledge(messageId: string, agentName: string): void {
    const message = this.messages.find((msg) => msg.id === messageId);
    if (message) {
      message.acknowledged = true;
      if (!message.processedBy.includes(agentName)) {
        message.processedBy.push(agentName);
      }
    }
  }

  /**
   * Get pending messages for an agent
   */
  getPendingMessages(agentName: string): AgentMessage[] {
    return this.getMessagesFor(agentName).filter(
      (msg) => !msg.processedBy.includes(agentName)
    );
  }

  /**
   * Get all findings from messages
   */
  getAllFindings(): import("@/scoring/types").ScoredFinding[] {
    return this.messages
      .filter((msg) => msg.type === "finding" && msg.payload.type === "finding")
      .map((msg) => (msg.payload as import("./message-types").FindingPayload).finding);
  }

  /**
   * Get contradictions
   */
  getContradictions(): import("./message-types").ContradictionPayload[] {
    return this.messages
      .filter(
        (msg) => msg.type === "contradiction" && msg.payload.type === "contradiction"
      )
      .map((msg) => msg.payload as import("./message-types").ContradictionPayload);
  }

  /**
   * Get bus statistics
   */
  getStats(): MessageBusStats {
    const messagesByType: Record<MessageType, number> = {
      finding: 0,
      question: 0,
      contradiction: 0,
      request: 0,
      response: 0,
      state_change: 0,
      error: 0,
    };

    const messagesByTopic: Record<MessageTopic, number> = {
      financial: 0,
      team: 0,
      market: 0,
      product: 0,
      competitive: 0,
      legal: 0,
      technical: 0,
      synthesis: 0,
      general: 0,
    };

    for (const msg of this.messages) {
      messagesByType[msg.type]++;
      messagesByTopic[msg.topic]++;
    }

    return {
      totalMessages: this.messages.length,
      messagesByType,
      messagesByTopic,
      activeSubscriptions: this.subscriptions.size,
      pendingMessages: this.messageQueue.length,
    };
  }

  /**
   * Clear all messages and subscriptions
   */
  clear(): void {
    this.messages = [];
    this.messageQueue = [];
    this.subscriptions.clear();
  }

  /**
   * Process the message queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (!message) continue;

        // Find matching subscriptions
        const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
          (sub) => this.matchesFilter(message, sub.filter)
        );

        // Execute handlers
        await Promise.all(
          matchingSubscriptions.map(async (sub) => {
            try {
              await sub.handler(message);
            } catch (error) {
              console.error(
                `Error in message handler for subscription ${sub.id}:`,
                error
              );
            }
          })
        );
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Check if a message matches a filter
   */
  private matchesFilter(message: AgentMessage, filter: MessageFilter): boolean {
    // Type filter
    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      if (!types.includes(message.type)) return false;
    }

    // Topic filter
    if (filter.topic) {
      const topics = Array.isArray(filter.topic) ? filter.topic : [filter.topic];
      if (!topics.includes(message.topic)) return false;
    }

    // From filter
    if (filter.from) {
      const froms = Array.isArray(filter.from) ? filter.from : [filter.from];
      if (!froms.includes(message.from)) return false;
    }

    // To filter
    if (filter.to) {
      if (message.to === "*") return true;
      if (Array.isArray(message.to)) {
        if (!message.to.includes(filter.to)) return false;
      } else {
        if (message.to !== filter.to) return false;
      }
    }

    // Priority filter
    if (filter.priority) {
      const priorities = Array.isArray(filter.priority)
        ? filter.priority
        : [filter.priority];
      if (!priorities.includes(message.priority)) return false;
    }

    // Time filters
    if (filter.since && message.timestamp < filter.since) return false;
    if (filter.until && message.timestamp > filter.until) return false;

    return true;
  }
}

// Singleton instance
export const messageBus = new AgentMessageBus();
