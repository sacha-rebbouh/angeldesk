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
import { normalizeThesisEvaluation } from "@/services/thesis/normalization";
import { checkRateLimitDistributed, isValidCuid, CUID_PATTERN } from "@/lib/sanitize";
import { dealChatAgent, type FullChatContext } from "@/agents/chat";
import { handleApiError } from "@/lib/api-error";
import type { DealChatContextData } from "@/services/chat-context";

// ============================================================================
// SCHEMAS
// ============================================================================

const sendMessageSchema = z.object({
  conversationId: z
    .string()
    .regex(CUID_PATTERN, "Invalid conversation ID format")
    .nullish(), // Accept null, undefined, or valid CUID
  message: z.string().min(1).max(10000),
  investorLevel: z.enum(["beginner", "intermediate", "expert"]).optional(),
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
    const rateLimit = await checkRateLimitDistributed(`chat:${user.id}`, {
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

    // Fetch full context, conversation history, thesis, and analysis-linked thesisBypass in parallel
    // La these est injectee dans le contexte chat pour permettre a l'agent d'y repondre
    // de maniere informee (intent=THESIS). Si aucune these persistee : null → agent skip section.
    const { thesisService } = await import("@/services/thesis");
    const [history, latestThesis] = await Promise.all([
      conversationId ? getConversationHistoryForLLM(conversationId) : Promise.resolve([]),
      thesisService.getLatest(dealId),
    ]);

    // FIX (audit P0 #13) : propager thesisBypass depuis l'analyse la plus recente.
    // Sans ca le chat disait toujours "bypass actif: false" meme si le BA avait continue
    // apres une these fragile — le chat ne pouvait pas raisonner correctement sur le score.
    let thesisBypass = false;
    let linkedThesisAnalysis:
      | {
          id: string;
          mode: string | null;
          summary: string | null;
          completedAt: Date | null;
          hasResults: boolean;
        }
      | null = null;
    const normalizedThesisEvaluation = latestThesis
      ? normalizeThesisEvaluation({
          verdict: latestThesis.verdict as never,
          confidence: latestThesis.confidence,
          ycLens: latestThesis.ycLens as never,
          thielLens: latestThesis.thielLens as never,
          angelDeskLens: latestThesis.angelDeskLens as never,
        })
      : null;
    if (latestThesis) {
      const linkedAnalysis = await prisma.analysis.findFirst({
        where: { dealId, thesisId: latestThesis.id, status: "COMPLETED" },
        select: {
          thesisBypass: true,
          id: true,
          mode: true,
          summary: true,
          completedAt: true,
          results: true,
        },
        orderBy: { completedAt: "desc" },
      });
      thesisBypass = linkedAnalysis?.thesisBypass ?? false;
      linkedThesisAnalysis = linkedAnalysis
        ? {
            id: linkedAnalysis.id,
            mode: linkedAnalysis.mode,
            summary: linkedAnalysis.summary,
            completedAt: linkedAnalysis.completedAt,
            hasResults: !!linkedAnalysis.results,
          }
        : null;
    }

    const thesisGated = normalizedThesisEvaluation
      ? new Set(["alert_dominant", "vigilance"]).has(normalizedThesisEvaluation.thesisQuality.verdict) && !thesisBypass
      : false;

    const fullContextData = latestThesis
      ? await getFullChatContext(dealId, { analysisId: linkedThesisAnalysis?.id ?? null })
      : await getFullChatContext(dealId);
    const effectiveLatestAnalysis = latestThesis
      ? linkedThesisAnalysis
      : fullContextData.latestAnalysis;
    const sanitizedChatContext = sanitizeChatContextForThesisGate(
      fullContextData.chatContext,
      thesisGated
    );

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
            arr: fullContextData.deal.arr != null ? Number(fullContextData.deal.arr) : null,
            growthRate: fullContextData.deal.growthRate != null
              ? Number(fullContextData.deal.growthRate)
              : null,
            amountRequested: fullContextData.deal.amountRequested != null
              ? Number(fullContextData.deal.amountRequested)
              : null,
            valuationPre: fullContextData.deal.valuationPre != null
              ? Number(fullContextData.deal.valuationPre)
              : null,
            globalScore: thesisGated ? null : fullContextData.deal.globalScore,
            teamScore: thesisGated ? null : fullContextData.deal.teamScore,
            marketScore: thesisGated ? null : fullContextData.deal.marketScore,
            productScore: thesisGated ? null : fullContextData.deal.productScore,
            financialsScore: thesisGated ? null : fullContextData.deal.financialsScore,
            founders: fullContextData.deal.founders,
          }
        : {
            id: dealId,
            name: "Unknown Deal",
          },
      chatContext: sanitizedChatContext,
      documents: fullContextData.documents,
      latestAnalysis: effectiveLatestAnalysis
        ? {
            id: effectiveLatestAnalysis.id,
            mode: effectiveLatestAnalysis.mode ?? "unknown",
            summary: effectiveLatestAnalysis.summary ?? null,
            completedAt: effectiveLatestAnalysis.completedAt ?? null,
            hasResults: effectiveLatestAnalysis.hasResults ?? false,
          }
        : null,
      liveSessions: fullContextData.liveSessions,
      thesis: latestThesis
        ? {
            id: latestThesis.id,
            version: latestThesis.version,
            reformulated: latestThesis.reformulated,
            problem: latestThesis.problem,
            solution: latestThesis.solution,
            whyNow: latestThesis.whyNow,
            moat: latestThesis.moat,
            pathToExit: latestThesis.pathToExit,
            verdict: latestThesis.verdict,
            confidence: latestThesis.confidence,
            loadBearing: (latestThesis.loadBearing as Array<{
              id: string;
              statement: string;
              status: string;
              impact: string;
              validationPath: string;
            }>) ?? [],
            alerts: (latestThesis.alerts as Array<{
              severity: string;
              category: string;
              title: string;
              detail: string;
            }>) ?? [],
            ycLens: (latestThesis.ycLens as {
              verdict: string;
              confidence: number;
              summary: string;
              failures: string[];
              strengths: string[];
            }) ?? { verdict: "unknown", confidence: 0, summary: "", failures: [], strengths: [] },
            thielLens: (latestThesis.thielLens as {
              verdict: string;
              confidence: number;
              summary: string;
              failures: string[];
              strengths: string[];
            }) ?? { verdict: "unknown", confidence: 0, summary: "", failures: [], strengths: [] },
            angelDeskLens: (latestThesis.angelDeskLens as {
              verdict: string;
              confidence: number;
              summary: string;
              failures: string[];
              strengths: string[];
            }) ?? { verdict: "unknown", confidence: 0, summary: "", failures: [], strengths: [] },
            evaluationAxes: normalizedThesisEvaluation!,
            decision: latestThesis.decision,
            thesisBypass,
            rebuttalCount: latestThesis.rebuttalCount,
          }
        : null,
      investorLevel: validated.investorLevel,
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

function sanitizeChatContextForThesisGate(
  chatContext: DealChatContextData | null,
  thesisGated: boolean
): DealChatContextData | null {
  if (!chatContext || !thesisGated) return chatContext;

  return {
    ...chatContext,
    agentSummaries: Object.fromEntries(
      Object.entries(chatContext.agentSummaries).map(([agentName, summary]) => [
        agentName,
        { ...summary, score: undefined },
      ])
    ),
  };
}
