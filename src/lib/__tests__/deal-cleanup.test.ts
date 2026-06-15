import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { cleanupDealRelations } from "../deal-cleanup";

function makeTx() {
  return {
    analysis: { findMany: vi.fn() },
    aIBoardSession: { findMany: vi.fn(), deleteMany: vi.fn() },
    lLMCallLog: { deleteMany: vi.fn() },
    costEvent: { deleteMany: vi.fn() },
    costAlert: { deleteMany: vi.fn() },
    contextEngineSnapshot: { deleteMany: vi.fn() },
    dealChatContext: { deleteMany: vi.fn() },
    chatConversation: { deleteMany: vi.fn() },
  };
}

describe("cleanupDealRelations (F1/F2 — orphelins par deal)", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    tx = makeTx();
    tx.analysis.findMany.mockResolvedValue([]);
    tx.aIBoardSession.findMany.mockResolvedValue([]);
    for (const dm of [
      tx.aIBoardSession.deleteMany,
      tx.lLMCallLog.deleteMany,
      tx.costEvent.deleteMany,
      tx.costAlert.deleteMany,
      tx.contextEngineSnapshot.deleteMany,
      tx.dealChatContext.deleteMany,
      tx.chatConversation.deleteMany,
    ]) {
      dm.mockResolvedValue({ count: 0 });
    }
  });

  it("ne touche à rien si la liste de deals est vide", async () => {
    await cleanupDealRelations(tx as unknown as Prisma.TransactionClient, []);
    expect(tx.analysis.findMany).not.toHaveBeenCalled();
    expect(tx.costEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("supprime les 6 tables orphelines par dealId IN + LLMCallLog via analyses/sessions résolues", async () => {
    tx.analysis.findMany.mockResolvedValue([{ id: "an_1" }, { id: "an_2" }]);
    tx.aIBoardSession.findMany.mockResolvedValue([{ id: "bs_1" }]);

    await cleanupDealRelations(tx as unknown as Prisma.TransactionClient, ["d_1", "d_2"]);

    // Résolution indirecte LLMCallLog (pas de dealId).
    expect(tx.lLMCallLog.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ analysisId: { in: ["an_1", "an_2"] } }, { boardSessionId: { in: ["bs_1"] } }] },
    });
    // Orphelins dealId-scalaire (CostAlert inclus — recommandation Codex pour la
    // cohérence suppression deal/compte).
    for (const dm of [
      tx.costEvent.deleteMany,
      tx.costAlert.deleteMany,
      tx.contextEngineSnapshot.deleteMany,
      tx.dealChatContext.deleteMany,
      tx.chatConversation.deleteMany,
      tx.aIBoardSession.deleteMany,
    ]) {
      expect(dm).toHaveBeenCalledWith({ where: { dealId: { in: ["d_1", "d_2"] } } });
    }
  });

  it("n'appelle pas LLMCallLog.deleteMany quand aucune analyse ni session board", async () => {
    await cleanupDealRelations(tx as unknown as Prisma.TransactionClient, ["d_1"]);
    expect(tx.lLMCallLog.deleteMany).not.toHaveBeenCalled();
    // Les autres orphelins sont quand même nettoyés.
    expect(tx.costEvent.deleteMany).toHaveBeenCalledWith({ where: { dealId: { in: ["d_1"] } } });
  });
});
