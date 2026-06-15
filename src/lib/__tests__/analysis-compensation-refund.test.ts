import { beforeEach, describe, expect, it, vi } from "vitest";

// F5 — Guard billing COMPORTEMENTAL (remplace le guard regex source-string
// `route-resume-billing-guards.test.ts`). Vérifie que la compensation d'une
// analyse échouée rembourse le montant EXPLICITE quand il est fourni (resume
// partiellement remboursé) au lieu du prix plein — sinon double-refund.

const mocks = vi.hoisted(() => ({
  refundCredits: vi.fn(),
  refundCreditAmount: vi.fn(),
  getActionForAnalysisType: vi.fn(),
  analysisUpdate: vi.fn(),
  analysisFindFirst: vi.fn(),
  dealUpdate: vi.fn(),
}));

vi.mock("@/services/credits", () => ({
  refundCredits: mocks.refundCredits,
  refundCreditAmount: mocks.refundCreditAmount,
  getActionForAnalysisType: mocks.getActionForAnalysisType,
  CREDIT_COSTS: { DEEP_DIVE: 5 },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: { update: mocks.analysisUpdate, findFirst: mocks.analysisFindFirst },
    deal: { update: mocks.dealUpdate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { compensateFailedAnalysis } = await import("../analysis-compensation");

describe("compensateFailedAnalysis — remboursement billing (F5, ex-guard regex)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionForAnalysisType.mockReturnValue("DEEP_DIVE");
    mocks.refundCreditAmount.mockResolvedValue({ success: true });
    mocks.refundCredits.mockResolvedValue({ success: true });
    mocks.analysisUpdate.mockResolvedValue({});
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.dealUpdate.mockResolvedValue({});
  });

  it("rembourse le montant EXPLICITE (refundAmount) au lieu du prix plein, et marque refundAmount sur l'analyse", async () => {
    await compensateFailedAnalysis({
      analysisId: "an_1",
      userId: "user_1",
      dealId: "deal_1",
      type: "full_analysis",
      refundIdempotencyKey: "refund:resume:an_1:k",
      refundAmount: 3,
    });

    // Refund du montant exact (3), via le chemin par-montant — PAS le refund plein.
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      3,
      expect.objectContaining({ dealId: "deal_1", idempotencyKey: "refund:resume:an_1:k" })
    );
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    // L'analyse est marquée avec le montant remboursé exact (pas CREDIT_COSTS).
    expect(mocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "an_1" },
        data: expect.objectContaining({ refundAmount: 3 }),
      })
    );
  });

  it("rembourse le prix PLEIN (CREDIT_COSTS via refundCredits) quand refundAmount est absent", async () => {
    await compensateFailedAnalysis({
      analysisId: "an_2",
      userId: "user_1",
      dealId: "deal_1",
      type: "full_analysis",
    });

    expect(mocks.refundCredits).toHaveBeenCalledWith("user_1", "DEEP_DIVE", "deal_1", expect.any(Object));
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    // refundAmount tombe sur CREDIT_COSTS[action] = 5.
    expect(mocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundAmount: 5 }) })
    );
  });

  it("ignore un refundAmount <= 0 et bascule sur le refund plein", async () => {
    await compensateFailedAnalysis({
      analysisId: "an_3",
      userId: "user_1",
      dealId: "deal_1",
      type: "full_analysis",
      refundAmount: 0,
    });
    expect(mocks.refundCredits).toHaveBeenCalled();
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });
});
