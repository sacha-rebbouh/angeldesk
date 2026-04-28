import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";

/**
 * DELETE /api/user — Delete the authenticated user's account and all associated data.
 *
 * Deletion order (respects FK constraints):
 * 1. Vercel Blob files (documents)
 * 2. Orphan tables (no cascade from User): AIBoardSession, ChatConversation, CostEvent, UserBoardCredits, UserDealUsage
 * 3. User record (cascades: Deal -> Document/Analysis/RedFlag/Founder/..., CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession)
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
    await prisma.$transaction(async (tx) => {
      // --- Tables with userId but NO cascade from User ---

      // AIBoardSession children cascade from session, but session itself has no User FK
      // First delete children (members, rounds), then sessions
      const boardSessionIds = await tx.aIBoardSession.findMany({
        where: { userId },
        select: { id: true },
      });
      const sessionIds = boardSessionIds.map((s) => s.id);

      if (sessionIds.length > 0) {
        await tx.aIBoardMember.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.aIBoardRound.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.aIBoardSession.deleteMany({ where: { userId } });
      }

      // ChatConversation children cascade, but conversation has no User FK
      const conversationIds = await tx.chatConversation.findMany({
        where: { userId },
        select: { id: true },
      });
      const convIds = conversationIds.map((c) => c.id);

      if (convIds.length > 0) {
        await tx.chatMessage.deleteMany({ where: { conversationId: { in: convIds } } });
        await tx.chatConversation.deleteMany({ where: { userId } });
      }

      // CostEvent — no FK relation to User
      await tx.costEvent.deleteMany({ where: { userId } });

      // CostAlert — optional userId, set to null instead of deleting (shared resource)
      await tx.costAlert.updateMany({ where: { userId }, data: { userId: null } });

      // UserBoardCredits — no FK relation to User
      await tx.userBoardCredits.deleteMany({ where: { userId } });

      // UserDealUsage — no FK relation to User
      await tx.userDealUsage.deleteMany({ where: { userId } });

      // --- User record: cascades delete Deal, CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession ---
      // Deal cascade further deletes: Document, Analysis, RedFlag, Founder, FactEvent,
      // DealTerms, DealStructure, DealTermsVersion, AlertResolution
      // Analysis cascade deletes: ScoredFinding, ReasoningTrace, DebateRecord, AgentMessage, StateTransition, AnalysisCheckpoint
      // LiveSession cascade deletes: TranscriptChunk, CoachingCard, ScreenCapture, SessionSummary
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error, "delete account");
  }
}
