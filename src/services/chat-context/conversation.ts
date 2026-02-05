/**
 * Conversation Service
 *
 * Manages chat conversations and messages for deals.
 */

import { prisma } from "@/lib/prisma";
import type { ChatRole, Prisma } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface CreateMessageInput {
  conversationId: string;
  role: ChatRole;
  content: string;
  contextUsed?: unknown;
  toolsCalled?: unknown[];
  intent?: string;
  intentConfidence?: number;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  responseTimeMs?: number;
}

export interface ConversationWithMessages {
  id: string;
  dealId: string;
  userId: string;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: Date | null;
  totalCost: number | null;
  messages: Array<{
    id: string;
    role: ChatRole;
    content: string;
    intent: string | null;
    createdAt: Date;
  }>;
  createdAt: Date;
}

// ============================================================================
// CONVERSATION CRUD
// ============================================================================

/**
 * Create a new conversation for a deal
 */
export async function createConversation(
  dealId: string,
  userId: string,
  title?: string
): Promise<{ id: string }> {
  const conversation = await prisma.chatConversation.create({
    data: {
      dealId,
      userId,
      title: title ?? null,
    },
    select: { id: true },
  });

  return conversation;
}

/**
 * Get conversation with messages
 */
export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ConversationWithMessages | null> {
  const conversation = await prisma.chatConversation.findFirst({
    where: {
      id: conversationId,
      userId, // Security: user can only access their own conversations
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          intent: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) return null;

  return {
    id: conversation.id,
    dealId: conversation.dealId,
    userId: conversation.userId,
    title: conversation.title,
    status: conversation.status,
    messageCount: conversation.messageCount,
    lastMessageAt: conversation.lastMessageAt,
    totalCost: conversation.totalCost ? Number(conversation.totalCost) : null,
    messages: conversation.messages,
    createdAt: conversation.createdAt,
  };
}

/**
 * Get all conversations for a deal
 */
export async function getConversationsForDeal(
  dealId: string,
  userId: string
): Promise<Array<{
  id: string;
  title: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}>> {
  const conversations = await prisma.chatConversation.findMany({
    where: {
      dealId,
      userId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      messageCount: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });

  return conversations;
}

/**
 * Archive a conversation
 */
export async function archiveConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  await prisma.chatConversation.updateMany({
    where: {
      id: conversationId,
      userId,
    },
    data: {
      status: "ARCHIVED",
    },
  });
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string
): Promise<void> {
  await prisma.chatConversation.updateMany({
    where: {
      id: conversationId,
      userId,
    },
    data: { title },
  });
}

// ============================================================================
// MESSAGE CRUD
// ============================================================================

/**
 * Add a message to a conversation
 * Uses a transaction to ensure message creation and conversation stats update are atomic
 */
export async function addMessage(input: CreateMessageInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        contextUsed: input.contextUsed as Prisma.InputJsonValue,
        toolsCalled: input.toolsCalled as Prisma.InputJsonValue,
        intent: input.intent,
        intentConfidence: input.intentConfidence,
        cost: input.cost,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        model: input.model,
        responseTimeMs: input.responseTimeMs,
      },
      select: { id: true },
    });

    // Update conversation stats atomically
    await tx.chatConversation.update({
      where: { id: input.conversationId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        ...(input.cost && {
          totalCost: { increment: input.cost },
        }),
        ...(input.inputTokens && {
          totalInputTokens: { increment: input.inputTokens },
        }),
        ...(input.outputTokens && {
          totalOutputTokens: { increment: input.outputTokens },
        }),
      },
    });

    return message;
  });
}

/**
 * Get messages for a conversation (with pagination)
 */
export async function getMessages(
  conversationId: string,
  options: {
    limit?: number;
    before?: string; // Message ID to paginate before
  } = {}
): Promise<Array<{
  id: string;
  role: ChatRole;
  content: string;
  contextUsed: unknown;
  toolsCalled: unknown;
  intent: string | null;
  createdAt: Date;
}>> {
  const { limit = 50, before } = options;

  // Fetch cursor date separately to avoid N+1 query
  let cursorDate: Date | undefined;
  if (before) {
    const cursorMessage = await prisma.chatMessage.findUnique({
      where: { id: before },
      select: { createdAt: true },
    });
    cursorDate = cursorMessage?.createdAt;
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(cursorDate && {
        createdAt: { lt: cursorDate },
      }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      contextUsed: true,
      toolsCalled: true,
      intent: true,
      createdAt: true,
    },
  });

  // Return in chronological order
  return messages.reverse();
}

/**
 * Get conversation history formatted for LLM context
 */
export async function getConversationHistoryForLLM(
  conversationId: string,
  maxMessages: number = 20
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      role: { in: ["USER", "ASSISTANT"] },
    },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
    select: {
      role: true,
      content: true,
    },
  });

  // Return in chronological order, mapped to LLM format
  return messages.reverse().map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
  }));
}

// ============================================================================
// AUTO-TITLE GENERATION
// ============================================================================

/**
 * Generate a title for a conversation based on first message
 */
export function generateConversationTitle(firstMessage: string): string {
  // Simple extraction: take first sentence or first 50 chars
  const firstSentence = firstMessage.split(/[.!?]/)[0];

  if (firstSentence.length <= 50) {
    return firstSentence.trim();
  }

  // Truncate at word boundary
  const truncated = firstSentence.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 30) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

// ============================================================================
// CONVERSATION OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify user owns the conversation
 */
export async function verifyConversationOwnership(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const conversation = await prisma.chatConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: { id: true },
  });

  return !!conversation;
}

/**
 * Verify user owns the conversation AND it belongs to the specified deal
 * Prevents IDOR by ensuring conversation.dealId matches the route's dealId
 */
export async function verifyConversationOwnershipWithDeal(
  conversationId: string,
  userId: string,
  dealId: string
): Promise<boolean> {
  const conversation = await prisma.chatConversation.findFirst({
    where: {
      id: conversationId,
      userId,
      dealId, // Also verify dealId matches
    },
    select: { id: true },
  });

  return !!conversation;
}

/**
 * Verify user owns the deal for a conversation
 */
export async function verifyDealOwnership(
  dealId: string,
  userId: string
): Promise<boolean> {
  const deal = await prisma.deal.findFirst({
    where: {
      id: dealId,
      userId,
    },
    select: { id: true },
  });

  return !!deal;
}
