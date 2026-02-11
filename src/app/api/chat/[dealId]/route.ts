import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createConversation,
  getConversationsForDeal,
  addMessage,
  getConversation,
  verifyDealOwnership,
  verifyConversationOwnershipWithDeal,
  generateConversationTitle,
  getConversationHistoryForLLM,
} from "@/services/chat-context/conversation";
import { getChatContext, getFullChatContext } from "@/services/chat-context";
import { checkRateLimit, isValidCuid, CUID_PATTERN } from "@/lib/sanitize";
import { dealChatAgent, type FullChatContext } from "@/agents/chat";
import { handleApiError } from "@/lib/api-error";

// ============================================================================
// SCHEMAS
// ============================================================================

const createConversationSchema = z.object({
  title: z.string().optional(),
});

const sendMessageSchema = z.object({
  conversationId: z
    .string()
    .regex(CUID_PATTERN, "Invalid conversation ID format")
    .nullish(), // Accept null, undefined, or valid CUID
  message: z.string().min(1).max(10000),
});

// ============================================================================
// ROUTE CONTEXT
// ============================================================================

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// ============================================================================
// GET - List conversations for a deal
// ============================================================================

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal ownership first (security check)
    const ownsDeals = await verifyDealOwnership(dealId, user.id);
    if (!ownsDeals) {
      console.error(`[Chat API] GET 404: deal=${dealId} user=${user.id} - deal not found or not owned`);
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // If conversationId is provided, return that conversation's messages
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (conversationId) {
      if (!isValidCuid(conversationId)) {
        return NextResponse.json(
          { error: "Invalid conversation ID format" },
          { status: 400 }
        );
      }
      const conversation = await getConversation(conversationId, user.id);
      if (!conversation || conversation.dealId !== dealId) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: { conversation } });
    }

    // Parallelize independent DB calls
    const [conversations, chatContext] = await Promise.all([
      getConversationsForDeal(dealId, user.id),
      getChatContext(dealId),
    ]);

    return NextResponse.json({
      data: {
        conversations,
        hasContext: !!chatContext,
        contextVersion: chatContext ? 1 : 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "list conversations");
  }
}

// ============================================================================
// POST - Send message / Create conversation
// ============================================================================

export async function POST(request: NextRequest, context: RouteContext) {
  console.log("[Chat API] POST handler reached");
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;
    console.log(`[Chat API] POST: dealId=${dealId}, userId=${user.id}`);

    // Rate limiting: 10 messages per minute per user
    const rateLimit = checkRateLimit(`chat:${user.id}`, {
      maxRequests: 10,
      windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetIn) },
        }
      );
    }

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal ownership
    const ownsDeal = await verifyDealOwnership(dealId, user.id);
    if (!ownsDeal) {
      console.error(`[Chat API] POST 404: deal=${dealId} user=${user.id} - deal not found or not owned`);
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = sendMessageSchema.parse(body);

    let conversationId = validated.conversationId;
    let isNewConversation = false;

    // If conversationId provided, verify ownership AND dealId match (IDOR prevention)
    if (conversationId) {
      const ownsConversation = await verifyConversationOwnershipWithDeal(
        conversationId,
        user.id,
        dealId
      );
      if (!ownsConversation) {
        console.error(`[Chat API] POST 404: conversation=${conversationId} user=${user.id} deal=${dealId} - conversation not found or not owned`);
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
    } else {
      // Create conversation if needed
      const conversation = await createConversation(dealId, user.id);
      conversationId = conversation.id;
      isNewConversation = true;
    }

    // Add user message
    const userMessage = await addMessage({
      conversationId,
      role: "USER",
      content: validated.message,
    });

    // Auto-generate title for new conversations
    if (isNewConversation) {
      const title = generateConversationTitle(validated.message);
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }

    // Fetch full context and conversation history in parallel
    const [fullContextData, history] = await Promise.all([
      getFullChatContext(dealId),
      conversationId ? getConversationHistoryForLLM(conversationId) : Promise.resolve([]),
    ]);

    // Build FullChatContext for the agent
    const fullContext: FullChatContext = {
      deal: fullContextData.deal
        ? {
            id: fullContextData.deal.id,
            name: fullContextData.deal.name,
            companyName: fullContextData.deal.companyName,
            sector: fullContextData.deal.sector,
            stage: fullContextData.deal.stage,
            geography: fullContextData.deal.geography,
            description: fullContextData.deal.description,
            website: fullContextData.deal.website,
            arr: fullContextData.deal.arr ? Number(fullContextData.deal.arr) : null,
            growthRate: fullContextData.deal.growthRate
              ? Number(fullContextData.deal.growthRate)
              : null,
            amountRequested: fullContextData.deal.amountRequested
              ? Number(fullContextData.deal.amountRequested)
              : null,
            valuationPre: fullContextData.deal.valuationPre
              ? Number(fullContextData.deal.valuationPre)
              : null,
            globalScore: fullContextData.deal.globalScore,
            teamScore: fullContextData.deal.teamScore,
            marketScore: fullContextData.deal.marketScore,
            productScore: fullContextData.deal.productScore,
            financialsScore: fullContextData.deal.financialsScore,
            founders: fullContextData.deal.founders,
          }
        : {
            id: dealId,
            name: "Unknown Deal",
          },
      chatContext: fullContextData.chatContext,
      documents: fullContextData.documents,
      latestAnalysis: fullContextData.latestAnalysis
        ? {
            ...fullContextData.latestAnalysis,
            mode: fullContextData.latestAnalysis.mode ?? "unknown",
          }
        : null,
    };

    // Generate response using DealChatAgent
    const startTime = Date.now();
    const chatResponse = await dealChatAgent.generateResponse(
      validated.message,
      fullContext,
      history
    );
    const responseTimeMs = Date.now() - startTime;

    const assistantMessage = await addMessage({
      conversationId,
      role: "ASSISTANT",
      content: chatResponse.response,
      intent: chatResponse.intent,
      intentConfidence: chatResponse.intentConfidence,
      model: "deal-chat-agent",
      responseTimeMs,
      contextUsed: {
        sourcesUsed: chatResponse.sourcesUsed,
        suggestedFollowUps: chatResponse.suggestedFollowUps,
      },
    });

    return NextResponse.json({
      data: {
        conversationId,
        isNewConversation,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        response: chatResponse.response,
        intent: chatResponse.intent,
        suggestedFollowUps: chatResponse.suggestedFollowUps,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Log validation details server-side, but don't expose to client
      console.error("[Chat API] Validation error:", error.issues);
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    console.error("[Chat API] Error sending message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
