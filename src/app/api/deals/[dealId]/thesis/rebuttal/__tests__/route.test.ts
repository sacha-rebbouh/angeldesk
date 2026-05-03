import { beforeEach, describe, expect, it, vi } from "vitest";

const STRUCTURED_REBUTTAL =
  "Le moat est mal reformule: slide 14 montre que l'avantage defensif vient du brevet clinique, pas d'un effet reseau. Merci de corriger la section moat.";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  isValidCuid: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  getLatest: vi.fn(),
  resolveSourceScope: vi.fn(),
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

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
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
    resolveSourceScope: mocks.resolveSourceScope,
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
    mocks.getCurrentFactsFromView.mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "company.name",
        category: "OTHER",
        currentValue: "Canonical Deal",
        currentDisplayValue: "Canonical Deal",
        currentSource: "PITCH_DECK",
        currentConfidence: 90,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-20T09:00:00Z"),
        lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "other.sector",
        category: "OTHER",
        currentValue: "healthtech",
        currentDisplayValue: "Healthtech",
        currentSource: "PITCH_DECK",
        currentConfidence: 88,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-20T09:00:00Z"),
        lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "product.stage",
        category: "PRODUCT",
        currentValue: "series_a",
        currentDisplayValue: "Series A",
        currentSource: "PITCH_DECK",
        currentConfidence: 84,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-20T09:00:00Z"),
        lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
      },
    ]);
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
    mocks.resolveSourceScope.mockImplementation(async (thesis: { sourceDocumentIds?: string[]; sourceHash?: string; corpusSnapshotId?: string | null }) => ({
      corpusSnapshotId: thesis.corpusSnapshotId ?? null,
      sourceDocumentIds: thesis.sourceDocumentIds ?? [],
      sourceHash: thesis.sourceHash ?? "hash_1",
      isCanonicalSnapshot: !!thesis.corpusSnapshotId,
    }));
    mocks.beginRebuttalAttempt.mockResolvedValue({
      status: "accepted",
      thesis: {
        id: "thesis_1",
        rebuttalCount: 1,
        rebuttalText: STRUCTURED_REBUTTAL,
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
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
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
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
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
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("multiple paused analyses");
    expect(mocks.beginRebuttalAttempt).not.toHaveBeenCalled();
  });

  it("rejects verdict-only rebuttals before reserving, charging, or calling the judge", async () => {
    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({
          rebuttalText: "Je conteste votre verdict vigilance, je ne suis pas d'accord et je veux continuer.",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      code: "REBUTTAL_NOT_SPECIFIC",
    });
    expect(String(payload.error)).toContain("verdict");
    expect(mocks.beginRebuttalAttempt).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.judgeRun).not.toHaveBeenCalled();
  });

  it("revertit et rembourse si le dispatch du reextract echoue apres verdict valid", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("queue down"));

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    expect(response.status).toBe(500);
    expect(mocks.finalizeRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: STRUCTURED_REBUTTAL,
      verdict: "valid",
    });
    expect(mocks.revertRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: STRUCTURED_REBUTTAL,
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

  it("prefers canonical facts for the rebuttal judge input", async () => {
    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.judgeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        deal: {
          id: "deal_1",
          name: "Canonical Deal",
          sector: "healthtech",
          stage: "series_a",
        },
        rebuttalInput: expect.objectContaining({
          dealName: "Canonical Deal",
          dealSector: "healthtech",
          dealStage: "series_a",
        }),
      })
    );
  });

  it("downgrades a primary valid rebuttal when the independent confirmation rejects it", async () => {
    mocks.judgeRun
      .mockResolvedValueOnce({
        success: true,
        data: {
          verdict: "valid",
          reasoning: "Le signal primaire voit une correction plausible.",
          regenerate: true,
          adjustedElements: { moat: "A revoir" },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          verdict: "rejected",
          reasoning: "La contre-evaluation ne voit pas de preuve assez precise.",
          regenerate: false,
        },
      });

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Le moat n'est pas l'effet reseau mais le brevet cite slide 14." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      verdict: "rejected",
      regenerate: false,
      creditsCharged: 1,
    });
    expect(String(payload.data.reasoning)).toContain("contre-evaluation");
    expect(mocks.judgeRun).toHaveBeenCalledTimes(2);
    expect(mocks.finalizeRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: "Le moat n'est pas l'effet reseau mais le brevet cite slide 14.",
      verdict: "rejected",
    });
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("refunds and returns 503 when the confirmation judge is unavailable after a primary valid verdict", async () => {
    mocks.judgeRun
      .mockResolvedValueOnce({
        success: true,
        data: {
          verdict: "valid",
          reasoning: "Le rebuttal est plausible.",
          regenerate: true,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "confirmation unavailable",
      });

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: "Le why now est faux: le regulation trigger est documente page 9." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "Verification croisee du rebuttal temporairement indisponible. Votre credit a ete rembourse, vous pouvez reessayer.",
      retryable: true,
      refundedCredits: 1,
    });
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "THESIS_REBUTTAL",
      1,
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("thesis:rebuttal-refund:thesis_1:"),
      })
    );
    expect(mocks.cancelRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: "Le why now est faux: le regulation trigger est documente page 9.",
    });
    expect(mocks.finalizeRebuttalAttempt).not.toHaveBeenCalled();
  });

  it("returns 503 retryable and refunds when the judge returns success=false", async () => {
    mocks.judgeRun.mockResolvedValue({
      success: false,
      error: "All models exhausted",
    });

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/rebuttal", {
        method: "POST",
        body: JSON.stringify({ rebuttalText: STRUCTURED_REBUTTAL }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(payload).toEqual({
      error: "Juge temporairement indisponible. Votre crédit a été remboursé, vous pouvez réessayer.",
      retryable: true,
      refundedCredits: 1,
    });
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "THESIS_REBUTTAL",
      1,
      expect.objectContaining({
        dealId: "deal_1",
      })
    );
    expect(mocks.cancelRebuttalAttempt).toHaveBeenCalledWith({
      thesisId: "thesis_1",
      rebuttalText: STRUCTURED_REBUTTAL,
    });
  });
});
