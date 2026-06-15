import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isValidCuid: vi.fn(),
  dealFindFirst: vi.fn(),
  dealUpdate: vi.fn(),
  dealDelete: vi.fn(),
  documentFindMany: vi.fn(),
  transaction: vi.fn(),
  // F1 — cleanup orphelins à la suppression deal
  analysisFindMany: vi.fn(),
  aiBoardSessionFindMany: vi.fn(),
  aiBoardSessionDeleteMany: vi.fn(),
  llmCallLogDeleteMany: vi.fn(),
  costEventDeleteMany: vi.fn(),
  costAlertDeleteMany: vi.fn(),
  contextEngineSnapshotDeleteMany: vi.fn(),
  dealChatContextDeleteMany: vi.fn(),
  chatConversationDeleteMany: vi.fn(),
  factEventFindFirst: vi.fn(),
  factEventUpdate: vi.fn(),
  factEventCreate: vi.fn(),
  handleApiError: vi.fn(),
  loadCanonicalDealSignals: vi.fn(),
  resolveCanonicalDealFields: vi.fn(),
  refreshCurrentFactsView: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    deal: {
      findFirst: mocks.dealFindFirst,
      update: mocks.dealUpdate,
      delete: mocks.dealDelete,
    },
    document: {
      findMany: mocks.documentFindMany,
    },
    factEvent: {
      findFirst: mocks.factEventFindFirst,
      update: mocks.factEventUpdate,
      create: mocks.factEventCreate,
    },
  },
}));

vi.mock("@/services/storage", () => ({
  deleteFile: mocks.deleteFile,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  loadCanonicalDealSignals: mocks.loadCanonicalDealSignals,
  resolveCanonicalDealFields: mocks.resolveCanonicalDealFields,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  refreshCurrentFactsView: mocks.refreshCurrentFactsView,
}));

const { GET, PATCH, DELETE } = await import("../route");

describe("/api/deals/[dealId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.handleApiError.mockImplementation((error: unknown) => {
      throw error;
    });
    mocks.loadCanonicalDealSignals.mockResolvedValue({
      factMapByDealId: new Map([["deal_1", new Map()]]),
    });
    mocks.resolveCanonicalDealFields.mockReturnValue({
      companyName: "Canonical Co",
      website: "https://canonical.example",
      amountRequested: 250_000,
      arr: 1_200_000,
      growthRate: 88,
      valuationPre: 9_000_000,
      sector: "Canonical Sector",
      stage: "SERIES_A",
      instrument: "SAFE",
      geography: "France",
      description: "Canonical tagline",
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        deal: {
          update: mocks.dealUpdate,
          delete: mocks.dealDelete,
        },
        factEvent: {
          findFirst: mocks.factEventFindFirst,
          update: mocks.factEventUpdate,
          create: mocks.factEventCreate,
        },
        analysis: { findMany: mocks.analysisFindMany },
        aIBoardSession: { findMany: mocks.aiBoardSessionFindMany, deleteMany: mocks.aiBoardSessionDeleteMany },
        lLMCallLog: { deleteMany: mocks.llmCallLogDeleteMany },
        costEvent: { deleteMany: mocks.costEventDeleteMany },
        costAlert: { deleteMany: mocks.costAlertDeleteMany },
        contextEngineSnapshot: { deleteMany: mocks.contextEngineSnapshotDeleteMany },
        dealChatContext: { deleteMany: mocks.dealChatContextDeleteMany },
        chatConversation: { deleteMany: mocks.chatConversationDeleteMany },
      })
    );
    mocks.refreshCurrentFactsView.mockResolvedValue(undefined);
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.dealDelete.mockResolvedValue({ id: "deal_1" });
    mocks.deleteFile.mockResolvedValue(undefined);
    // F1 — défauts cleanup orphelins (aucune ligne par défaut)
    mocks.analysisFindMany.mockResolvedValue([]);
    mocks.aiBoardSessionFindMany.mockResolvedValue([]);
    mocks.aiBoardSessionDeleteMany.mockResolvedValue({ count: 0 });
    mocks.llmCallLogDeleteMany.mockResolvedValue({ count: 0 });
    mocks.costEventDeleteMany.mockResolvedValue({ count: 0 });
    mocks.costAlertDeleteMany.mockResolvedValue({ count: 0 });
    mocks.contextEngineSnapshotDeleteMany.mockResolvedValue({ count: 0 });
    mocks.dealChatContextDeleteMany.mockResolvedValue({ count: 0 });
    mocks.chatConversationDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns canonicalized detail data on GET", async () => {
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
      companyName: "Legacy Company",
      website: "https://legacy.example",
      amountRequested: 100_000,
      arr: 1_000,
      growthRate: 12,
      valuationPre: 1_500_000,
      sector: "Legacy Sector",
      stage: "SEED",
      instrument: "EQUITY",
      geography: "Legacy Geography",
      description: "Legacy description",
      founders: [],
      documents: [],
      redFlags: [],
      analyses: [],
    });

    const response = await GET(new Request("http://localhost/api/deals/deal_1") as never, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      website: "https://canonical.example",
      amountRequested: 250_000,
      arr: 1_200_000,
      growthRate: 88,
      valuationPre: 9_000_000,
      sector: "Canonical Sector",
      stage: "SERIES_A",
      instrument: "SAFE",
      geography: "France",
      description: "Canonical tagline",
    });
  });

  it("returns canonicalized detail data after PATCH", async () => {
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
    });
    mocks.dealUpdate.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
      companyName: "Legacy Company",
      website: "https://legacy.example",
      amountRequested: 100_000,
      arr: 1_000,
      growthRate: 12,
      valuationPre: 1_500_000,
      sector: "Legacy Sector",
      stage: "SEED",
      instrument: "EQUITY",
      geography: "Legacy Geography",
      description: "Legacy description",
      founders: [],
      documents: [],
      redFlags: [],
      analyses: [],
    });
    mocks.factEventFindFirst.mockResolvedValue(null);
    mocks.factEventCreate.mockResolvedValue({ id: "fact_1" });

    const response = await PATCH(
      new Request("http://localhost/api/deals/deal_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arr: 2000 }),
      }) as never,
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deal_1" },
        data: expect.objectContaining({ arr: 2000 }),
      })
    );
    expect(mocks.factEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: "deal_1",
          factKey: "financial.arr",
          source: "BA_OVERRIDE",
          eventType: "CREATED",
          value: 2000,
        }),
      })
    );
    expect(mocks.refreshCurrentFactsView).toHaveBeenCalled();
    expect(payload.data).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      arr: 1_200_000,
      stage: "SERIES_A",
    });
  });

  describe("DELETE /api/deals/:dealId — cascade blob deletion", () => {
    it("deletes every Document's blob before dropping the deal row", async () => {
      mocks.dealFindFirst.mockResolvedValue({
        id: "deal_1",
        userId: "user_1",
      });
      mocks.documentFindMany.mockResolvedValue([
        { id: "doc_1", storageUrl: "https://blob.example/a", storagePath: "deals/deal_1/aaa.pdf" },
        { id: "doc_2", storageUrl: null, storagePath: "deals/deal_1/bbb.pdf" },
        { id: "doc_3", storageUrl: null, storagePath: null }, // nothing to delete
      ]);

      const response = await DELETE(new Request("http://localhost/api/deals/deal_1") as never, {
        params: Promise.resolve({ dealId: "deal_1" }),
      });

      expect(response.status).toBe(200);
      // Blobs deleted for doc_1 (via storageUrl) and doc_2 (via storagePath).
      // doc_3 is skipped because it has no storage reference.
      expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
      expect(mocks.deleteFile).toHaveBeenCalledWith("https://blob.example/a");
      expect(mocks.deleteFile).toHaveBeenCalledWith("deals/deal_1/bbb.pdf");
      // DB cascade happens AFTER the blob deletes (we lose the storage URL once
      // the rows are gone).
      const deleteFileOrder = mocks.deleteFile.mock.invocationCallOrder;
      const dealDeleteOrder = mocks.dealDelete.mock.invocationCallOrder;
      expect(Math.max(...deleteFileOrder)).toBeLessThan(dealDeleteOrder[0]);
      expect(mocks.dealDelete).toHaveBeenCalledWith({ where: { id: "deal_1" } });
    });

    it("proceeds with DB delete and reports the failure count when one blob delete throws", async () => {
      mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
      mocks.documentFindMany.mockResolvedValue([
        { id: "doc_1", storageUrl: "https://blob.example/a", storagePath: null },
        { id: "doc_2", storageUrl: "https://blob.example/b", storagePath: null },
      ]);
      mocks.deleteFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("blob 410 gone"));

      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const response = await DELETE(new Request("http://localhost/api/deals/deal_1") as never, {
          params: Promise.resolve({ dealId: "deal_1" }),
        });

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.blobDeletionFailures).toBe(1);
        // The DB cascade must still run even if one blob delete fails — we
        // never want a single missing blob to lock the user's DB row.
        expect(mocks.dealDelete).toHaveBeenCalledTimes(1);
        expect(consoleWarn).toHaveBeenCalled();
      } finally {
        consoleWarn.mockRestore();
      }
    });

    it("returns 404 without touching storage when the deal is not owned by the caller", async () => {
      mocks.dealFindFirst.mockResolvedValue(null);

      const response = await DELETE(new Request("http://localhost/api/deals/deal_1") as never, {
        params: Promise.resolve({ dealId: "deal_1" }),
      });

      expect(response.status).toBe(404);
      expect(mocks.deleteFile).not.toHaveBeenCalled();
      expect(mocks.documentFindMany).not.toHaveBeenCalled();
      expect(mocks.dealDelete).not.toHaveBeenCalled();
    });

    it("supprime en transaction les orphelins dealId-scalaire (RGPD) AVANT le deal, LLMCallLog résolu indirectement", async () => {
      mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
      mocks.documentFindMany.mockResolvedValue([]);
      mocks.analysisFindMany.mockResolvedValue([{ id: "an_1" }, { id: "an_2" }]);
      mocks.aiBoardSessionFindMany.mockResolvedValue([{ id: "bs_1" }]);

      const response = await DELETE(new Request("http://localhost/api/deals/deal_1") as never, {
        params: Promise.resolve({ dealId: "deal_1" }),
      });

      expect(response.status).toBe(200);

      // LLMCallLog n'a pas de dealId : résolu via les analyses + sessions board du deal.
      expect(mocks.llmCallLogDeleteMany).toHaveBeenCalledWith({
        where: { OR: [{ analysisId: { in: ["an_1", "an_2"] } }, { boardSessionId: { in: ["bs_1"] } }] },
      });

      // Orphelins à dealId scalaire — CostEvent inclus (absent du plan F1 initial).
      // Le helper partagé requête par `dealId: { in: [...] }` (multi-deal).
      for (const deleteMany of [
        mocks.costEventDeleteMany,
        mocks.costAlertDeleteMany,
        mocks.contextEngineSnapshotDeleteMany,
        mocks.dealChatContextDeleteMany,
        mocks.chatConversationDeleteMany,
        mocks.aiBoardSessionDeleteMany,
      ]) {
        expect(deleteMany).toHaveBeenCalledWith({ where: { dealId: { in: ["deal_1"] } } });
      }

      // Le deal est supprimé EN DERNIER (après tous les orphelins → cascades FK).
      const dealDeleteOrder = mocks.dealDelete.mock.invocationCallOrder[0];
      for (const deleteMany of [
        mocks.llmCallLogDeleteMany,
        mocks.costEventDeleteMany,
        mocks.chatConversationDeleteMany,
        mocks.aiBoardSessionDeleteMany,
      ]) {
        expect(Math.max(...deleteMany.mock.invocationCallOrder)).toBeLessThan(dealDeleteOrder);
      }
      expect(mocks.dealDelete).toHaveBeenCalledWith({ where: { id: "deal_1" } });
    });
  });
});
