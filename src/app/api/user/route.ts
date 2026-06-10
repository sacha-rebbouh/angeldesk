import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { cleanupDealRelations } from "@/lib/deal-cleanup";

/**
 * DELETE /api/user — Delete the authenticated user's account and its data.
 *
 * Deletion order (respects FK constraints):
 * 1. Vercel Blob files (documents).
 * 2. Per-deal orphan tables (dealId scalaire sans cascade vers Deal) via le
 *    helper partagé `cleanupDealRelations` : LLMCallLog, CostEvent, CostAlert,
 *    ContextEngineSnapshot, DealChatContext, ChatConversation (+ ChatMessage),
 *    AIBoardSession (+ members/rounds). Source unique partagée avec la
 *    suppression deal pour éviter la divergence.
 * 3. CostAlert de niveau utilisateur (dealId null) anonymisées (userId=null) ;
 *    UserBoardCredits / UserDealUsage (userId sans cascade User).
 * 4. User record (cascades: Deal -> Document/Analysis/RedFlag/Founder/...,
 *    CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession).
 *
 * Does NOT delete the Clerk account — the client handles that after a successful response.
 */
export async function DELETE() {
  try {
    const user = await requireAuth();
    const userId = user.id;

    // 1. Collect all document storage URLs before deletion
    const documents = await prisma.document.findMany({
      where: { deal: { userId } },
      select: { storageUrl: true, storagePath: true },
    });

    // 2. Delete blob files (best-effort, don't block account deletion on storage errors)
    // Documents without storage (emails/notes) have no blob to delete — skip silently.
    const blobDeletions = documents.map((doc) => {
      const urlOrPath = doc.storageUrl || doc.storagePath;
      if (!urlOrPath) return Promise.resolve();
      return deleteFile(urlOrPath).catch(() => {
        // Silently ignore — file may already be gone
      });
    });
    await Promise.all(blobDeletions);

    // 3. Delete all data in a transaction
    await prisma.$transaction(
      async (tx) => {
        // (a) Orphelins des deals ENCORE présents — helper partagé avec la
        //     suppression deal (source unique). Couvre notamment DealChatContext
        //     et ContextEngineSnapshot qui n'ont pas de userId (seulement
        //     atteignables via les deals courants).
        const userDeals = await tx.deal.findMany({ where: { userId }, select: { id: true } });
        await cleanupDealRelations(tx, userDeals.map((d) => d.id));

        // (b) Résidu par userId : capture les lignes ORPHELINES d'anciennes
        //     suppressions de deals (deal déjà disparu → hors (a)) mais encore
        //     rattachées à l'utilisateur. Sans ce filet, une suppression de deal
        //     antérieure au fix laissait des lignes survivre à la suppression
        //     compte.
        const userSessions = await tx.aIBoardSession.findMany({ where: { userId }, select: { id: true } });
        const userSessionIds = userSessions.map((s) => s.id);
        if (userSessionIds.length > 0) {
          // LLMCallLog n'a pas de userId : rattaché via boardSessionId.
          await tx.lLMCallLog.deleteMany({ where: { boardSessionId: { in: userSessionIds } } });
          await tx.aIBoardSession.deleteMany({ where: { userId } }); // cascade members/rounds
        }
        await tx.chatConversation.deleteMany({ where: { userId } }); // cascade ChatMessage
        await tx.costEvent.deleteMany({ where: { userId } });
        // CostAlert : supprimer les alertes liées à un deal (dealId
        // potentiellement danglant), anonymiser SEULEMENT les alertes de niveau
        // utilisateur (dealId null) — politique 'shared resource' conservée.
        await tx.costAlert.deleteMany({ where: { userId, dealId: { not: null } } });
        await tx.costAlert.updateMany({ where: { userId, dealId: null }, data: { userId: null } });

        // (c) Tables à userId sans relation cascade vers User.
        await tx.userBoardCredits.deleteMany({ where: { userId } });
        await tx.userDealUsage.deleteMany({ where: { userId } });

        // --- User record: cascades delete Deal, CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession ---
        // Deal cascade further deletes: Document, Analysis, RedFlag, Founder, FactEvent,
        // DealTerms, DealStructure, DealTermsVersion, AlertResolution
        // Analysis cascade deletes: ScoredFinding, ReasoningTrace, DebateRecord, AgentMessage, StateTransition, AnalysisCheckpoint
        // LiveSession cascade deletes: TranscriptChunk, CoachingCard, ScreenCapture, SessionSummary
        await tx.user.delete({ where: { id: userId } });
      },
      { timeout: 20_000 }
    );

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error, "delete account");
  }
}
