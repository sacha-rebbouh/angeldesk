import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  isValidCuid: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  getLatest: vi.fn(),
  beginRebuttalAttempt: vi.fn(),
  cancelRebuttalAttempt: vi.fn(),
  finalizeRebuttalAttempt: vi.fn(),
  revertRebuttalAttempt: vi.fn(),
  judgeRun: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  inngestSend: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    analysis: {
      findMany: mocks.analysisFindMany,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.getLatest,
    beginRebuttalAttempt: mocks.beginRebuttalAttempt,
    cancelRebuttalAttempt: mocks.cancelRebuttalAttempt,
    finalizeRebuttalAttempt: mocks.finalizeRebuttalAttempt,
    revertRebuttalAttempt: mocks.revertRebuttalAttempt,
  },
}));

vi.mock("@/agents/thesis/rebuttal-judge", () => ({
  thesisRebuttalJudgeAgent: {
    run: mocks.judgeRun,
  },
}));

vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

const jsonError = (message: string, status = 500) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const { POST } = await import("../route");

describe("POST /api/deals/[dealId]/thesis/rebuttal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true, resetIn: 0 });
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      name: "Deal test",
      sector: "deeptech",
      stage: "seed",
    });
    mocks.analysisFindMany.mockResolvedValue([{ id: "analysis_1" }]);
    mocks.getLatest.mockResolvedValue({
      id: "thesis_1",
      reformulated: "These",
      problem: "Probleme",
      solution: "Solution",
      whyNow: "Why now",
      moat: null,
      pathToExit: null,
      verdict: "vigilance",
      confidence: 52,
      loadBearing: [],
      alerts: [],
      ycLens: {},
      thielLens: {},
      angelDeskLens: {},
      sourceDocumentIds: [],
      sourceHash: "hash_1",
      rebuttalCount: 0,
      decision: null,
    });
    mocks.beginRebuttalAttempt.mockResolvedValue({
      status: "accepted",
      thesis: {
        id: "thesis_1",
        rebuttalCount: 1,
        rebuttalText: "Un rebuttal suffisamment long pour etre valide.",
        decision: "contest",
      },
    });
    mocks.cancelRebuttalAttempt.mockResolvedValue(undefined);
    mocks.finalizeRebuttalAttempt.mockResolvedValue({
      status: "finalized",
      thesis: { id: "thesis_1" },
    });
    mocks.revertRebuttalAttempt.mockResolvedValue({
      id: "thesis_1",
    });
    mocks.deductCreditAmount.mockResolvedValue({ success: true });
    mocks.judgeRun.mockResolvedValue({
      success: true,
      data: {
        verdict: "valid",
        reasoning: "Argument factuel recevable",
        regenerate: true,
      },
    });
    mocks.refundCreditAmount.mockResolvedValue({ success: true });
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      jsonError(error instanceof Error ? error.message : "unexpected")
    );
  });

  it("n'essaie pas de debiter si le cap de rebuttal est deja atteint", async () => {
    mocks.beginRebuttalAttempt.mockResolvedValue({
      status: "cap_reached",
      thesis: {
        id: "thesis_1",
        rebuttalCount: 3,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Un rebuttal suffisamment long pour etre valide." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Limite de rebuttals atteinte");
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.judgeRun).not.toHaveBeenCalled();
  });

  it("retourne le verdict existant pour un duplicate sans recharger ni relancer le judge", async () => {
    mocks.beginRebuttalAttempt.mockResolvedValue({
      status: "duplicate",
      thesis: {
        id: "thesis_1",
        rebuttalVerdict: "valid",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Un rebuttal suffisamment long pour etre valide." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      data: {
        verdict: "valid",
        reasoning: null,
        regenerate: true,
        creditsCharged: 0,
        thesisId: "thesis_1",
      },
    });
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.judgeRun).not.toHaveBeenCalled();
    expect(mocks.finalizeRebuttalAttempt).not.toHaveBeenCalled();
  });

  it("refuse un etat corrompu si plusieurs analyses paused existent pour la meme these", async () => {
    mocks.analysisFindMany.mockResolvedValue([{ id: "analysis_1" }, { id: "analysis_2" }]);

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Un rebuttal suffisamment long pour etre valide." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("multiple paused analyses");
    expect(mocks.beginRebuttalAttempt).not.toHaveBeenCalled();
  });

  it("revertit et rembourse si le dispatch du reextract echoue apres verdict valid", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("queue down"));

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Un rebuttal suffisamment long pour etre valide." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    expect(response.status).toBe(500);
    expect(mocks.finalizeRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: "Un rebuttal suffisamment long pour etre valide.",
      verdict: "valid",
    });
    expect(mocks.revertRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: "Un rebuttal suffisamment long pour etre valide.",
      expectedVerdict: "valid",
    });
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "THESIS_REBUTTAL",
      1,
      expect.objectContaining({
        dealId: "deal_1",
      })
    );
  });
});
