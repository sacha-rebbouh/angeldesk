import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  analysisCount: vi.fn(),
  analysisFindFirst: vi.fn(),
  analysisUpdate: vi.fn(),
  dealUpdate: vi.fn(),
  dealFindFirst: vi.fn(),
  thesisFindFirst: vi.fn(),
  recordDealAnalysis: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  evaluateDealDocumentReadiness: vi.fn(),
  inngestSend: vi.fn(),
  refundCredits: vi.fn(),
  getActionForAnalysisType: vi.fn(),
  reserveFullAnalysisDispatch: vi.fn(),
  claimFailedAnalysisResume: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      count: mocks.analysisCount,
      findFirst: mocks.analysisFindFirst,
      update: mocks.analysisUpdate,
    },
    deal: {
      findFirst: mocks.dealFindFirst,
      update: mocks.dealUpdate,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/agents", () => ({
  orchestrator: {},
}));

vi.mock("@/services/deal-limits", () => ({
  recordDealAnalysis: mocks.recordDealAnalysis,
  getUsageStatus: vi.fn(),
}));

vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
  refundCredits: mocks.refundCredits,
  getActionForAnalysisType: mocks.getActionForAnalysisType,
  CREDIT_COSTS: {
    DEEP_DIVE: 5,
  },
}));

vi.mock("@/services/documents/extraction-runs", () => ({
  evaluateDealDocumentReadiness: mocks.evaluateDealDocumentReadiness,
}));

vi.mock("@/services/analysis/guards", () => ({
  reserveFullAnalysisDispatch: mocks.reserveFullAnalysisDispatch,
  claimFailedAnalysisResume: mocks.claimFailedAnalysisResume,
}));

vi.mock("@/lib/inngest-client", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { POST } = await import("../route");

describe("POST /api/analyze thesis-first contract", () => {
  beforeEach(() => {
    mocks.requireAuth.mockReset();
    mocks.analysisCount.mockReset();
    mocks.analysisFindFirst.mockReset();
    mocks.analysisUpdate.mockReset();
    mocks.dealUpdate.mockReset();
    mocks.dealFindFirst.mockReset();
    mocks.thesisFindFirst.mockReset();
    mocks.recordDealAnalysis.mockReset();
    mocks.deductCreditAmount.mockReset();
    mocks.refundCreditAmount.mockReset();
    mocks.evaluateDealDocumentReadiness.mockReset();
    mocks.inngestSend.mockReset();
    mocks.refundCredits.mockReset();
    mocks.getActionForAnalysisType.mockReset();
    mocks.reserveFullAnalysisDispatch.mockReset();
    mocks.claimFailedAnalysisResume.mockReset();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.analysisCount.mockResolvedValue(0);
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.analysisUpdate.mockResolvedValue(undefined);
    mocks.dealUpdate.mockResolvedValue(undefined);
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
    mocks.thesisFindFirst.mockResolvedValue(null);
    mocks.recordDealAnalysis.mockResolvedValue({ success: true, remainingDeals: 4 });
    mocks.deductCreditAmount.mockResolvedValue({ success: true, balanceAfter: 4 });
    mocks.refundCreditAmount.mockResolvedValue({ success: true, balanceAfter: 7 });
    mocks.evaluateDealDocumentReadiness.mockResolvedValue({ ready: true });
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.getActionForAnalysisType.mockReturnValue("DEEP_DIVE");
    mocks.reserveFullAnalysisDispatch.mockResolvedValue({ kind: "reserved" });
    mocks.claimFailedAnalysisResume.mockResolvedValue(true);
  });

  it("refuse publiquement full_dd et indique le remplacement thesis-first", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "deal_legacy",
        type: "full_dd",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      retiredType: "full_dd",
      replacement: "full_analysis",
    });
    expect(String(payload.error)).toContain("Legacy analysis type 'full_dd' is no longer accepted");
    expect(String(payload.error)).toContain("thesis-first Deep Dive flow");
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("ne considere comme resumable qu'un run full_analysis aligne a la these active", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active" });
    mocks.analysisFindFirst.mockResolvedValueOnce(null); // resumable lookup

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    await POST(request as never);

    expect(mocks.analysisFindFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        dealId: "cm1234567890123456789012",
        mode: "full_analysis",
        thesisId: "thesis_active",
      }),
    }));
  });

  it("refuse de relancer un deep dive quand une analyse est deja en cours (gate thèse retiré)", async () => {
    mocks.analysisFindFirst.mockResolvedValueOnce(null); // resumable lookup
    mocks.reserveFullAnalysisDispatch.mockResolvedValue({
      kind: "running",
      analysisId: "analysis_running",
      thesisId: "thesis_active",
    });

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("already running");
    expect(mocks.recordDealAnalysis).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("returns queued without a second debit when another dispatch is already pending", async () => {
    mocks.analysisFindFirst.mockResolvedValueOnce(null);
    mocks.reserveFullAnalysisDispatch.mockResolvedValue({
      kind: "pending_dispatch",
    });

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      status: "QUEUED",
      dealId: "cm1234567890123456789012",
    });
    expect(mocks.recordDealAnalysis).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("ne propose PAS de resume legacy sans checkpoint legacy réel (ex. analyse stepwise-only) — Phase D", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_resumable",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_1",
        refundedAt: null,
        refundAmount: null,
        // L'include filtre les STEPWISE:* → une analyse stepwise-only ressort SANS checkpoint legacy.
        checkpoints: [],
        completedAgents: 3,
        totalAgents: 20,
      })
      .mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    await response.json();

    // canResume=false (pas de checkpoint legacy) → le resume legacy, qui throwerait sans
    // checkpoint, n'est PAS tenté ; on retombe sur un dispatch frais.
    expect(mocks.claimFailedAnalysisResume).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "analysis/deal.resume" })
    );
  });

  it("re-debite seulement le montant rembourse sur un resume partiellement rembourse et reset refundedAt", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_resumable",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_1",
        refundedAt: new Date("2026-04-20T10:00:00.000Z"),
        refundAmount: 3,
        checkpoints: [{ id: "cp_1" }],
        completedAgents: 3,
        totalAgents: 20,
      })
      .mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      status: "RESUMING",
      resumedFrom: "analysis_resumable",
    });
    expect(mocks.recordDealAnalysis).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      3,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
        description: "Reprise full_analysis apres remboursement (3 credits)",
        idempotencyKey: expect.stringContaining("resume:user_1:analysis_resumable:"),
      })
    );
    expect(mocks.claimFailedAnalysisResume).toHaveBeenCalledWith("analysis_resumable", "cm1234567890123456789012");
    expect(mocks.analysisUpdate).toHaveBeenCalledWith({
      where: { id: "analysis_resumable" },
      data: expect.objectContaining({
        refundedAt: null,
        refundAmount: null,
      }),
    });
    expect(mocks.inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analysis/deal.resume",
        data: expect.objectContaining({
          analysisId: "analysis_resumable",
          dealId: "cm1234567890123456789012",
          userId: "user_1",
          resumeRefundKey: expect.stringContaining("refund:resume:analysis_resumable:"),
          resumeRefundAmount: 3,
        }),
      })
    );
  });

  it("G — flag stepwise ON : ne reprend PAS un FAILED legacy (chemin thin) → laisse partir un run frais", async () => {
    const prev = process.env.DEEP_DIVE_STEPWISE;
    process.env.DEEP_DIVE_STEPWISE = "1";
    try {
      mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
      // Un FAILED legacy PARFAITEMENT resumable (thèse alignée + checkpoint legacy + récent) :
      // sans le guard G il serait repris via _resumeAnalysisImpl (thin). Avec flag ON → ignoré.
      mocks.analysisFindFirst
        .mockResolvedValueOnce({
          id: "analysis_resumable",
          mode: "full_analysis",
          thesisId: "thesis_active",
          corpusSnapshotId: "snap_1",
          refundedAt: null,
          refundAmount: null,
          checkpoints: [{ id: "cp_1" }],
          completedAgents: 3,
          totalAgents: 20,
        })
        .mockResolvedValueOnce(null);

      const request = new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ dealId: "cm1234567890123456789012", type: "full_analysis" }),
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request as never);
      const payload = await response.json();

      // Le resume legacy n'est PAS pris : pas de claim, pas d'event resume, pas de statut RESUMING.
      expect(mocks.claimFailedAnalysisResume).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: "analysis/deal.resume" })
      );
      expect(payload.data?.status).not.toBe("RESUMING");
      // ... et un run FRAIS stepwise part à la place (dispatch durable complet).
      expect(mocks.inngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "analysis/deal.analyze",
          data: expect.objectContaining({ stepwise: true }),
        })
      );
    } finally {
      if (prev === undefined) delete process.env.DEEP_DIVE_STEPWISE;
      else process.env.DEEP_DIVE_STEPWISE = prev;
    }
  });

  it("fallback legacy: re-debite le plein tarif si refundedAt existe sans refundAmount", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_resumable",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_1",
        refundedAt: new Date("2026-04-20T10:00:00.000Z"),
        refundAmount: null,
        checkpoints: [{ id: "cp_1" }],
        completedAgents: 3,
        totalAgents: 20,
      })
      .mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      5,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
      })
    );
  });

  it("cappe le re-debit resume au plein tarif si refundAmount historique est invalide", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_resumable",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_1",
        refundedAt: new Date("2026-04-20T10:00:00.000Z"),
        refundAmount: 99,
        checkpoints: [{ id: "cp_1" }],
        completedAgents: 3,
        totalAgents: 20,
      })
      .mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      5,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
      })
    );
  });

  it("echoue proprement sans reset refundedAt si le re-debit partiel est refuse", async () => {
    const refundedAt = new Date("2026-04-20T10:00:00.000Z");
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_resumable",
        mode: "full_analysis",
        thesisId: "thesis_active",
        corpusSnapshotId: "snap_1",
        refundedAt,
        refundAmount: 3,
        checkpoints: [{ id: "cp_1" }],
        completedAgents: 3,
        totalAgents: 20,
      })
      .mockResolvedValueOnce(null);
    mocks.deductCreditAmount.mockResolvedValue({ success: false, balanceAfter: 1, error: "Crédits insuffisants" });

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({ error: "Credits insuffisants pour la reprise" });
    expect(mocks.analysisUpdate).toHaveBeenCalledWith({
      where: { id: "analysis_resumable" },
      data: expect.objectContaining({
        status: "FAILED",
        refundedAt,
        refundAmount: 3,
      }),
    });
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("rembourse seulement le montant partiel re-debite si le dispatch Inngest echoue", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst.mockResolvedValueOnce({
      id: "analysis_resumable",
      mode: "full_analysis",
      thesisId: "thesis_active",
      corpusSnapshotId: "snap_1",
      refundedAt: new Date("2026-04-20T10:00:00.000Z"),
      refundAmount: 3,
      checkpoints: [{ id: "cp_1" }],
      completedAgents: 3,
      totalAgents: 20,
    }).mockResolvedValueOnce(null);
    mocks.inngestSend.mockRejectedValue(new Error("queue down"));

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      error: "Failed to schedule analysis resume",
    });
    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      3,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
      })
    );
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      3,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
        idempotencyKey: expect.stringContaining("refund:resume:analysis_resumable:"),
      })
    );
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.analysisUpdate).toHaveBeenLastCalledWith({
      where: { id: "analysis_resumable" },
      data: expect.objectContaining({
        status: "FAILED",
        refundAmount: 3,
      }),
    });
  });

  it("legacy dispatch failure rembourse le plein tarif si refundAmount absent", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst.mockResolvedValueOnce({
      id: "analysis_resumable",
      mode: "full_analysis",
      thesisId: "thesis_active",
      corpusSnapshotId: "snap_1",
      refundedAt: new Date("2026-04-20T10:00:00.000Z"),
      refundAmount: null,
      checkpoints: [{ id: "cp_1" }],
      completedAgents: 3,
      totalAgents: 20,
    }).mockResolvedValueOnce(null);
    mocks.inngestSend.mockRejectedValue(new Error("queue down"));

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(502);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "DEEP_DIVE",
      5,
      expect.objectContaining({
        dealId: "cm1234567890123456789012",
      })
    );
  });

  it("does not re-debit or re-dispatch when another request already claimed the same resumable analysis", async () => {
    mocks.thesisFindFirst.mockResolvedValue({ id: "thesis_active", corpusSnapshotId: "snap_1" });
    mocks.analysisFindFirst.mockResolvedValueOnce({
      id: "analysis_resumable",
      mode: "full_analysis",
      thesisId: "thesis_active",
      corpusSnapshotId: "snap_1",
      refundedAt: new Date("2026-04-20T10:00:00.000Z"),
      refundAmount: 5,
      checkpoints: [{ id: "cp_1" }],
      completedAgents: 3,
      totalAgents: 20,
    });
    mocks.claimFailedAnalysisResume.mockResolvedValue(false);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      status: "RESUMING",
      resumedFrom: "analysis_resumable",
    });
    expect(mocks.recordDealAnalysis).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("passes a stable idempotency key when charging a new full analysis", async () => {
    mocks.analysisFindFirst.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        dealId: "cm1234567890123456789012",
        type: "full_analysis",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.recordDealAnalysis).toHaveBeenCalledWith(
      "user_1",
      3,
      "cm1234567890123456789012",
      "full_analysis",
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("dd:cm1234567890123456789012:"),
      })
    );
  });
});
