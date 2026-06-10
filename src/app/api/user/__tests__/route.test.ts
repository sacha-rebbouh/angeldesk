import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  transaction: vi.fn(),
  documentFindMany: vi.fn(),
  dealFindMany: vi.fn(),
  cleanupDealRelations: vi.fn(),
  // résidu par userId (legacy orphans)
  aiBoardSessionFindMany: vi.fn(),
  aiBoardSessionDeleteMany: vi.fn(),
  llmCallLogDeleteMany: vi.fn(),
  chatConversationDeleteMany: vi.fn(),
  costEventDeleteMany: vi.fn(),
  costAlertDeleteMany: vi.fn(),
  costAlertUpdateMany: vi.fn(),
  userBoardCreditsDeleteMany: vi.fn(),
  userDealUsageDeleteMany: vi.fn(),
  userDelete: vi.fn(),
  deleteFile: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    document: { findMany: mocks.documentFindMany },
  },
}));
vi.mock("@/services/storage", () => ({ deleteFile: mocks.deleteFile }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/deal-cleanup", () => ({ cleanupDealRelations: mocks.cleanupDealRelations }));

const { DELETE } = await import("../route");

describe("DELETE /api/user — suppression compte (F2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.dealFindMany.mockResolvedValue([{ id: "deal_a" }, { id: "deal_b" }]);
    mocks.cleanupDealRelations.mockResolvedValue(undefined);
    mocks.aiBoardSessionFindMany.mockResolvedValue([{ id: "bs_legacy" }]);
    mocks.aiBoardSessionDeleteMany.mockResolvedValue({ count: 0 });
    mocks.llmCallLogDeleteMany.mockResolvedValue({ count: 0 });
    mocks.chatConversationDeleteMany.mockResolvedValue({ count: 0 });
    mocks.costEventDeleteMany.mockResolvedValue({ count: 0 });
    mocks.costAlertDeleteMany.mockResolvedValue({ count: 0 });
    mocks.costAlertUpdateMany.mockResolvedValue({ count: 0 });
    mocks.userBoardCreditsDeleteMany.mockResolvedValue({ count: 0 });
    mocks.userDealUsageDeleteMany.mockResolvedValue({ count: 0 });
    mocks.userDelete.mockResolvedValue({ id: "user_1" });
    mocks.handleApiError.mockImplementation((e: unknown) => {
      throw e;
    });
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        deal: { findMany: mocks.dealFindMany },
        aIBoardSession: { findMany: mocks.aiBoardSessionFindMany, deleteMany: mocks.aiBoardSessionDeleteMany },
        lLMCallLog: { deleteMany: mocks.llmCallLogDeleteMany },
        chatConversation: { deleteMany: mocks.chatConversationDeleteMany },
        costEvent: { deleteMany: mocks.costEventDeleteMany },
        costAlert: { deleteMany: mocks.costAlertDeleteMany, updateMany: mocks.costAlertUpdateMany },
        userBoardCredits: { deleteMany: mocks.userBoardCreditsDeleteMany },
        userDealUsage: { deleteMany: mocks.userDealUsageDeleteMany },
        user: { delete: mocks.userDelete },
      })
    );
  });

  it("nettoie les orphelins par deal (helper) PUIS un résidu par userId (legacy), puis supprime le user", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);

    // (a) Helper partagé avec les dealIds courants de l'utilisateur.
    expect(mocks.cleanupDealRelations).toHaveBeenCalledWith(expect.anything(), ["deal_a", "deal_b"]);

    // (b) Résidu par userId — capture les orphelins d'anciennes suppressions deal.
    expect(mocks.llmCallLogDeleteMany).toHaveBeenCalledWith({ where: { boardSessionId: { in: ["bs_legacy"] } } });
    expect(mocks.aiBoardSessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.chatConversationDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.costEventDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    // CostAlert : suppression des alertes deal-liées (dealId danglant possible),
    // anonymisation seulement des alertes user-level.
    expect(mocks.costAlertDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1", dealId: { not: null } } });
    expect(mocks.costAlertUpdateMany).toHaveBeenCalledWith({ where: { userId: "user_1", dealId: null }, data: { userId: null } });

    expect(mocks.userBoardCreditsDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.userDealUsageDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "user_1" } });

    // Ordre : cleanup AVANT la suppression du user (qui cascade les deals).
    const cleanupOrder = mocks.cleanupDealRelations.mock.invocationCallOrder[0];
    const userDeleteOrder = mocks.userDelete.mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(userDeleteOrder);
  });

  it("ne touche pas LLMCallLog/AIBoardSession par userId quand l'utilisateur n'a aucune session board legacy", async () => {
    mocks.aiBoardSessionFindMany.mockResolvedValue([]);

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(mocks.llmCallLogDeleteMany).not.toHaveBeenCalled();
    expect(mocks.aiBoardSessionDeleteMany).not.toHaveBeenCalled();
    // Le reste du résidu tourne quand même.
    expect(mocks.chatConversationDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "user_1" } });
  });
});
