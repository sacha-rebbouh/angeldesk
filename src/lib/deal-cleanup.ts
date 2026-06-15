import { Prisma } from "@prisma/client";

/**
 * Supprime les lignes orphelines rattachées à un ensemble de deals : tables à
 * `dealId` scalaire SANS relation cascade vers `Deal` (sinon elles survivent à
 * la suppression du deal ou du compte — fuite RGPD : conversations chat,
 * snapshots Context Engine, prompts/réponses LLM stockés, télémétrie et alertes
 * de coût).
 *
 * À appeler DANS une transaction, AVANT de supprimer les deals (ou le `User`
 * qui les cascade). Les enfants à FK cascade tombent automatiquement
 * (`ChatMessage`←`ChatConversation`, `AIBoardMember`/`AIBoardRound`←
 * `AIBoardSession`). Ce qui a une relation cascade vers `Deal` (Document,
 * Analysis, Thesis, RedFlag, EvidenceSignal via Document, CorpusSnapshot,
 * DealTerms/Structure, LiveSession, FactEvent) est géré par la cascade DB.
 *
 * Source UNIQUE de vérité de « ce qui orpheline par deal », partagée par la
 * suppression deal et la suppression compte — l'audit a trouvé les deux chemins
 * incomplets ET désynchronisés ; centraliser empêche la divergence future.
 */
export async function cleanupDealRelations(
  tx: Prisma.TransactionClient,
  dealIds: string[]
): Promise<void> {
  if (dealIds.length === 0) return;

  // LLMCallLog n'a pas de `dealId` : il est rattaché aux analyses et sessions
  // board des deals. On résout leurs ids AVANT suppression (les prompts et
  // réponses stockés contiennent le contenu du deal → RGPD).
  const analyses = await tx.analysis.findMany({ where: { dealId: { in: dealIds } }, select: { id: true } });
  const boardSessions = await tx.aIBoardSession.findMany({ where: { dealId: { in: dealIds } }, select: { id: true } });
  const analysisIds = analyses.map((a) => a.id);
  const boardSessionIds = boardSessions.map((s) => s.id);
  const llmLogOr: Prisma.LLMCallLogWhereInput[] = [
    ...(analysisIds.length ? [{ analysisId: { in: analysisIds } }] : []),
    ...(boardSessionIds.length ? [{ boardSessionId: { in: boardSessionIds } }] : []),
  ];
  if (llmLogOr.length > 0) {
    await tx.lLMCallLog.deleteMany({ where: { OR: llmLogOr } });
  }

  // Orphelins à `dealId` scalaire (aucune relation cascade vers `Deal`).
  await tx.costEvent.deleteMany({ where: { dealId: { in: dealIds } } });
  await tx.costAlert.deleteMany({ where: { dealId: { in: dealIds } } });
  await tx.contextEngineSnapshot.deleteMany({ where: { dealId: { in: dealIds } } });
  await tx.dealChatContext.deleteMany({ where: { dealId: { in: dealIds } } });
  await tx.chatConversation.deleteMany({ where: { dealId: { in: dealIds } } }); // cascade ChatMessage
  await tx.aIBoardSession.deleteMany({ where: { dealId: { in: dealIds } } });    // cascade AIBoardMember/Round
}
