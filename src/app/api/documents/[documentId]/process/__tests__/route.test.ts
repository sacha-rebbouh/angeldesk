import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.1 route test for the refactored /api/documents/[documentId]/process.
// Goal: prove that the route now (a) claims PROCESSING, (b) deducts credits
// up-front, (c) enqueues the Inngest event keyed by extractionRunId, and
// (d) returns 202 WITHOUT running smartExtract inline. Failures pre-enqueue
// must refund + revert PROCESSING.

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  // B11.2 — composite ownership lookup uses findFirst now (404
  // uniform on cross-tenant / missing); the post-`updateMany` status
  // re-read still uses findUnique on a known-owned row.
  documentFindFirst: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
  // B3.3.1 — server-side staleness check for PENDING uses the latest run's
  // startedAt as the reference timestamp.
  documentExtractionRunFindFirst: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  startDocumentExtractionRun: vi.fn(),
  terminalizeExtractionRunAsFailed: vi.fn(),
  inngestSend: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      findUnique: mocks.documentFindUnique,
      updateMany: mocks.documentUpdateMany,
    },
    documentExtractionRun: {
      findFirst: mocks.documentExtractionRunFindFirst,
    },
  },
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
}));
vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
  // B10.1 — route reads the flag to gate extraction billing. Tests
  // exercise the OFF case (default product state). A future test
  // can override per-spec with `vi.doMock(..., { CHARGE...: true })`.
  CHARGE_DOCUMENT_EXTRACTION_CREDITS: false,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  startDocumentExtractionRun: mocks.startDocumentExtractionRun,
  terminalizeExtractionRunAsFailed: mocks.terminalizeExtractionRunAsFailed,
}));
vi.mock("@/lib/inngest-client", () => ({
  inngest: { send: mocks.inngestSend },
}));

const { POST } = await import("../route");

function makeContext() {
  return { params: Promise.resolve({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_1" });
  mocks.documentFindFirst.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    name: "deck.pdf",
    mimeType: "application/pdf",
    storageUrl: "https://blob/x",
    storagePath: null,
    version: 1,
    contentHash: "hash",
    processingStatus: "COMPLETED",
    extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
  });
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  // Default: no prior run. The PENDING staleness path is only taken when
  // the document's status is PENDING; default fixture is COMPLETED so
  // this mock is irrelevant for non-PENDING tests.
  mocks.documentExtractionRunFindFirst.mockResolvedValue(null);
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  mocks.deductCreditAmount.mockResolvedValue({ success: true });
  mocks.refundCreditAmount.mockResolvedValue({ success: true });
  mocks.startDocumentExtractionRun.mockResolvedValue({ id: "run_new" });
  mocks.terminalizeExtractionRunAsFailed.mockResolvedValue(1);
  mocks.inngestSend.mockResolvedValue({});
  mocks.handleApiError.mockImplementation(
    (error: unknown) =>
      new Response(JSON.stringify({ error: error instanceof Error ? error.message : "internal" }), {
        status: 500,
      })
  );
});

describe("POST /api/documents/[documentId]/process — Phase 4.1 durable hand-off (B10.1: extraction not billed)", () => {
  it("returns 202 with extractionRunId — creditsCharged=0 while CHARGE_DOCUMENT_EXTRACTION_CREDITS is false", async () => {
    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toMatchObject({
      data: {
        documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
        extractionRunId: "run_new",
        processingStatus: "PROCESSING",
      },
      // B10.1 — extraction is free; the response anchors 0 so any
      // future re-enable (flag flip) breaks the test loudly.
      creditsCharged: 0,
    });
  });

  it("Inngest event carries chargedCredits=0 — the worker's reconcile branch is a no-op", async () => {
    await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);

    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
    const event = mocks.inngestSend.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      id: "document-extraction:run_new",
      name: "document/extraction.run",
      data: expect.objectContaining({
        documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
        extractionRunId: "run_new",
        userId: "user_1",
        dealId: "deal_1",
        reason: "reprocess",
        creditAction: "EXTRACTION_HIGH_PAGE",
        // B10.1 — payload carries 0, so the worker's reconcile +
        // top-up + refund paths (all gated on chargedCredits > 0)
        // are guaranteed no-ops.
        chargedCredits: 0,
      }),
    });
  });

  it("B10.1 — does NOT call deductCreditAmount while the flag is false (ledger conservation)", async () => {
    await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);

    // Spec gate: the user's balance MUST NOT be touched by the
    // reprocess flow while extraction is non-billable.
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("rejects with 409 if PROCESSING is already claimed (race-condition guard)", async () => {
    mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "hash",
      processingStatus: "PROCESSING",
      extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
    });
    mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "PROCESSING" });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(409);
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("B10.1 — when inngest.send throws: NO refund (no charge), but PROCESSING reverts + orphan run terminalizes", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("Inngest unreachable"));

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(500);
    // B10.1 — no charge was taken, so the catch-block refund is a
    // hard no-op (refund gated on chargedCredits > 0). This anchors
    // "no ghost credit creation" — the user's balance was never
    // moved in either direction.
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    // The non-credit compensations stay intact:
    // PROCESSING claim reverted to the original status (COMPLETED here).
    const revertCalls = mocks.documentUpdateMany.mock.calls;
    const lastCall = revertCalls[revertCalls.length - 1]?.[0];
    expect(lastCall).toMatchObject({
      data: expect.objectContaining({ processingStatus: "COMPLETED" }),
    });
    // P1.3: the run created by startDocumentExtractionRun would otherwise
    // be orphaned in PROCESSING — the catch must terminalize it.
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_new",
      expect.stringContaining("Inngest unreachable")
    );
  });

  it("does NOT terminalize the run when inngest.send succeeds (run is owned by the function)", async () => {
    await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    // Happy path: the event landed, the Inngest function owns the run.
    expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
  });

  it("rejects non-PDF documents with 400 (durable pipeline is PDF-only for now)", async () => {
    mocks.documentFindFirst.mockResolvedValue({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "image.png",
      mimeType: "image/png",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "hash",
      processingStatus: "COMPLETED",
      extractionRuns: [{ summaryMetrics: {} }],
    });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(400);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("B11.2 — IDOR uniformised to 404 when the document belongs to another user (composite where returns null)", async () => {
    // Pre-B11.2 the route returned 403 here, leaking the existence
    // of the doc id to non-owners. With composite `findFirst`, the
    // unowned doc looks identical to a missing one.
    mocks.documentFindFirst.mockResolvedValue(null);

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(404);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    // Anchor the userId scoping in the where clause.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deal: { userId: "user_1" },
        }),
      })
    );
  });

  // ============================================================
  // B3.3.1 — server-side staleness contract (Codex P1/P2)
  // ============================================================
  describe("PENDING staleness gate", () => {
    function makePendingDoc(latestRunStartedAt: Date | null, uploadedAt: Date) {
      // `latestRunStartedAt` is used by tests to set up
      // `documentExtractionRunFindFirst`, not by the doc fixture
      // itself — kept here for call-site readability.
      void latestRunStartedAt;
      return {
        id: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        version: 1,
        contentHash: "hash",
        processingStatus: "PENDING",
        uploadedAt,
        // B11.2 — `deal.userId` was selected pre-fix-up for the
        // ownership check; the route now scopes via composite
        // where, so the fixture does NOT need to embed it. Tests
        // that exercise the userId WHERE filter assert it directly
        // on `documentFindFirst.toHaveBeenCalledWith(...)`.
        extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
      };
    }

    it("Codex B3.3.1 P1/P2 — PENDING frais (run startedAt 10s ago) → 409 reason=not_stale, pas de credit deducted, terminalize NOT called", async () => {
      const tenSecondsAgo = new Date(Date.now() - 10_000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(tenSecondsAgo, tenSecondsAgo));
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "fresh_run",
        startedAt: tenSecondsAgo,
        status: "PENDING",
      });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason).toBe("not_stale");
      expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
      // B3.3.2 — fresh PENDING must NOT terminalize the in-flight run.
      expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
    });

    it("Codex B3.3.1 P1 — PENDING stale (run startedAt > 2 min ago) → proceed (PROCESSING claim + credit + Inngest)", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(fiveMinutesAgo, fiveMinutesAgo));
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "old_run",
        startedAt: fiveMinutesAgo,
        status: "PENDING",
      });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      // 202 Accepted (or similar success) — the route proceeds to enqueue.
      expect(response.status).toBeLessThan(300);
      expect(mocks.documentUpdateMany).toHaveBeenCalled();
      expect(mocks.startDocumentExtractionRun).toHaveBeenCalled();
      expect(mocks.inngestSend).toHaveBeenCalled();
    });

    it("Codex B3.3.2 P1 — PENDING stale avec run existant ne laisse jamais deux runs live (terminalize old BEFORE new)", async () => {
      // Critical: the late-arriving Inngest event for the old run must
      // not spawn a second concurrent extraction. The server MUST
      // terminalize the old run (idempotent) before creating the new one.
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(fiveMinutesAgo, fiveMinutesAgo));
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "old_run_42",
        startedAt: fiveMinutesAgo,
        status: "PENDING",
      });

      await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);

      // terminalize was called with the OLD run id (not the new one).
      expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
        "old_run_42",
        expect.stringMatching(/Superseded by stale-retry/)
      );
      // ...and BEFORE startDocumentExtractionRun (ordering matters: the
      // late Inngest event for old_run_42 would otherwise race with the
      // new run).
      const terminalizeOrder = mocks.terminalizeExtractionRunAsFailed.mock.invocationCallOrder[0];
      const startOrder = mocks.startDocumentExtractionRun.mock.invocationCallOrder[0];
      expect(terminalizeOrder).toBeLessThan(startOrder);
    });

    it("Codex B3.3.2 P1 — PENDING stale sans run existant → ne tente PAS de terminalize (no-op)", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(null, fiveMinutesAgo));
      mocks.documentExtractionRunFindFirst.mockResolvedValue(null);

      await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
      expect(mocks.startDocumentExtractionRun).toHaveBeenCalled();
    });

    it("Codex B3.3.1 P2 — pas de latest run mais uploadedAt > 2 min → proceed (fallback to uploadedAt)", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(null, fiveMinutesAgo));
      mocks.documentExtractionRunFindFirst.mockResolvedValue(null);

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBeLessThan(300);
      expect(mocks.documentUpdateMany).toHaveBeenCalled();
    });

    it("Codex B3.3.1 P2 — vieux uploadedAt mais latest run startedAt RÉCENT → 409 not_stale (timestamp source = run, pas uploadedAt)", async () => {
      // The whole point of Codex P2: a doc uploaded 30 days ago but whose
      // current run started 10 seconds ago is NOT stale. uploadedAt alone
      // would have wrongly classified it as 30-days-stale.
      const oldUploadedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const tenSecondsAgo = new Date(Date.now() - 10_000);
      mocks.documentFindFirst.mockResolvedValue(makePendingDoc(tenSecondsAgo, oldUploadedAt));
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "recent_run",
        startedAt: tenSecondsAgo,
        status: "PENDING",
      });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason).toBe("not_stale");
    });

    it("Codex B3.3.1 P1 — FAILED contourne la staleness gate (existing retry path)", async () => {
      const failedDoc = {
        ...makePendingDoc(new Date(), new Date()),
        processingStatus: "FAILED",
      };
      mocks.documentFindFirst.mockResolvedValue(failedDoc);
      // findFirst should NOT be called for FAILED (early return path).
      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBeLessThan(300);
      expect(mocks.documentExtractionRunFindFirst).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // B3.3.2 — 409 disambiguation: each refusal carries a `reason`
  // ============================================================
  describe("409 reasons (Codex B3.3.2 P1)", () => {
    it("analysis-in-progress → 409 reason=analysis_running (client distinguishes from already_processing)", async () => {
      mocks.getRunningAnalysisForDeal.mockResolvedValue({ id: "ana_1", thesisId: "thesis_1" });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string; analysisId?: string };
      expect(body.reason).toBe("analysis_running");
      expect(body.analysisId).toBe("ana_1");
    });

    it("atomic claim fail with status=PROCESSING → 409 reason=already_processing (client treats as success)", async () => {
      mocks.documentFindFirst.mockResolvedValueOnce({
        id: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        version: 1,
        contentHash: "hash",
        // start as FAILED so the PENDING staleness gate is bypassed.
        processingStatus: "FAILED",
        uploadedAt: new Date(),
        extractionRuns: [{ summaryMetrics: {} }],
      });
      // First updateMany loses the race.
      mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
      // Refetch reveals PROCESSING.
      mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "PROCESSING" });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string; currentStatus?: string };
      expect(body.reason).toBe("already_processing");
      expect(body.currentStatus).toBe("PROCESSING");
    });

    it("Codex B3.3.3 P1 — PENDING stale + terminalize succeeds + claim race lost → 409 reason=stale_retry_race (NOT already_processing)", async () => {
      // Repro: doc is PENDING stale → we terminalize the latest live run →
      // the claim updateMany loses to a concurrent writer that flipped the
      // doc to PROCESSING. Without disambiguation, the client would treat
      // the 409 as success ("already processing") — but we just killed the
      // run that was actually doing the work. The reason MUST be
      // `stale_retry_race` so the client surfaces an error toast + reverts.
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValueOnce({
        id: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        version: 1,
        contentHash: "hash",
        processingStatus: "PENDING",
        uploadedAt: fiveMinutesAgo,
        extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
      });
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "old_run_killed",
        startedAt: fiveMinutesAgo,
        status: "PROCESSING",
      });
      // terminalize succeeds (count > 0) — flag flips to terminalizedStaleRun=true.
      mocks.terminalizeExtractionRunAsFailed.mockResolvedValueOnce(1);
      // Claim race lost.
      mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
      // Refetch reveals PROCESSING (someone else won the claim race).
      mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "PROCESSING" });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string; currentStatus?: string };
      // Critical: reason MUST be stale_retry_race, NOT already_processing.
      expect(body.reason).toBe("stale_retry_race");
      expect(body.currentStatus).toBe("PROCESSING");
      // No credits deducted (claim failed before deduct).
      expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
    });

    it("Codex B3.3.3 P1 — PENDING stale but terminalize is no-op (count=0) + claim lost → reason=already_processing (we didn't kill anything)", async () => {
      // Edge: we tried to terminalize but the row had already settled
      // between the findFirst and the terminalize call (idempotent no-op).
      // In that case we did NOT actually kill a working run, so the normal
      // `already_processing` (success) semantic applies.
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mocks.documentFindFirst.mockResolvedValueOnce({
        id: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        version: 1,
        contentHash: "hash",
        processingStatus: "PENDING",
        uploadedAt: fiveMinutesAgo,
        extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
      });
      mocks.documentExtractionRunFindFirst.mockResolvedValue({
        id: "already_terminal_run",
        startedAt: fiveMinutesAgo,
        status: "PROCESSING",
      });
      // terminalize is a no-op (row already terminal) — count=0.
      mocks.terminalizeExtractionRunAsFailed.mockResolvedValueOnce(0);
      mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
      mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "PROCESSING" });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string };
      // No actual kill happened → fall back to the normal success path.
      expect(body.reason).toBe("already_processing");
    });

    it("atomic claim fail with status=COMPLETED → 409 reason=wrong_status (client MUST revert)", async () => {
      mocks.documentFindFirst.mockResolvedValueOnce({
        id: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        version: 1,
        contentHash: "hash",
        processingStatus: "FAILED",
        uploadedAt: new Date(),
        extractionRuns: [{ summaryMetrics: {} }],
      });
      mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
      mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "COMPLETED" });

      const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string; currentStatus?: string };
      expect(body.reason).toBe("wrong_status");
      expect(body.currentStatus).toBe("COMPLETED");
    });
  });
});
