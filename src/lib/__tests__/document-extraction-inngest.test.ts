import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.1 — verify the Inngest function `documentExtractionFunction`
// wraps the pipeline with the right idempotency/compensation contract.
// We don't spin up an Inngest dev-server; instead we exercise the
// function's user-provided handler directly with a fake `step` runner.

const mocks = vi.hoisted(() => ({
  runDocumentExtractionPipeline: vi.fn(),
  refundCreditAmount: vi.fn(),
  deductCreditAmount: vi.fn(),
  documentUpdateMany: vi.fn(),
  terminalizeExtractionRunAsFailed: vi.fn(),
  thesisGetLatest: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@/services/documents/extraction-pipeline", () => ({
  runDocumentExtractionPipeline: mocks.runDocumentExtractionPipeline,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  terminalizeExtractionRunAsFailed: mocks.terminalizeExtractionRunAsFailed,
}));
vi.mock("@/services/credits", () => ({
  // B10.1 — worker reads the flag to short-circuit reconcile/top-up.
  // Default OFF (extraction not billed). The 3 reconcile tests below
  // are skipped here as historical (kept around the flag for the
  // future flip — see the new B10.1 test that anchors the no-op).
  CHARGE_DOCUMENT_EXTRACTION_CREDITS: false,
  refundCreditAmount: mocks.refundCreditAmount,
  deductCreditAmount: mocks.deductCreditAmount,
}));
vi.mock("@/services/thesis", () => ({
  thesisService: { getLatest: mocks.thesisGetLatest },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { updateMany: mocks.documentUpdateMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    info: mocks.loggerInfo,
  },
}));

// We don't want the rest of inngest.ts (cleaner, sourcer, etc.) to run
// real imports during this test — stub their service deps so the module
// loads quickly. Inngest itself is real (we only call the handler).
vi.mock("@/agents/maintenance/db-cleaner", () => ({ runCleaner: vi.fn() }));
vi.mock("@/agents/maintenance/db-sourcer", () => ({
  LEGACY_SOURCES: [],
  PAGINATED_SOURCES: [],
  processLegacySource: vi.fn(),
  processPaginatedSource: vi.fn(),
  finalizeSourcerRun: vi.fn(),
}));
vi.mock("@/agents/maintenance/db-completer", () => ({
  processCompleterBatch: vi.fn(),
  finalizeCompleterRun: vi.fn(),
  emptyBatchStats: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({
  notifyAgentCompleted: vi.fn(),
  notifyAgentFailed: vi.fn(),
}));

const { documentExtractionFunction, inngest } = await import("../inngest");

type StepLike = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

// Pull the user-provided handler from the Inngest function. Inngest's
// public surface stores it on `.fn`; falling back via `as never` lets us
// stay decoupled from the SDK's internal typing.
function invokeHandler(event: Record<string, unknown>): Promise<unknown> {
  const handler = (documentExtractionFunction as unknown as {
    fn: (input: { event: { data: unknown }; step: StepLike }) => Promise<unknown>;
  }).fn;
  const step: StepLike = {
    run: async (_name, fn) => fn(),
  };
  return handler({ event: { data: event }, step });
}

// Spy on the real inngest client's send — the thesis re-extract trigger
// calls `inngest.send(...)` from inside the function.
const inngestSendSpy = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

beforeEach(() => {
  vi.clearAllMocks();
  // updateMany returns a Promise-like object that supports `.catch` (the
  // Inngest function relies on `await prisma.document.updateMany(...).catch(...)`).
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.terminalizeExtractionRunAsFailed.mockResolvedValue(1);
  mocks.thesisGetLatest.mockResolvedValue(null);
  inngestSendSpy.mockResolvedValue({ ids: [] } as never);
});

describe("documentExtractionFunction — happy path", () => {
  it("calls runDocumentExtractionPipeline and returns its result on success", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue({
      status: "COMPLETED",
      textLength: 1200,
      pageCount: 8,
      quality: 85,
      warnings: [],
      requiresOCR: false,
      ocrApplied: true,
      extractionRunId: "run_1",
    });

    const result = await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "reprocess",
      chargedCredits: 0,
    });

    expect(mocks.runDocumentExtractionPipeline).toHaveBeenCalledWith({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });
    expect(result).toMatchObject({ status: "COMPLETED", extractionRunId: "run_1" });
    // Compensation must NOT have run.
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("documentExtractionFunction — compensation on failure", () => {
  it("B10.1 — skips compensation refund when CHARGE_DOCUMENT_EXTRACTION_CREDITS is false, still terminalizes the run + document FAILED", async () => {
    // Pre-B10.1 contract: pipeline throw → compensate-failed-extraction
    // calls refundCreditAmount with the dispatchRefundKey.
    //
    // Post-B10.1 strict contract: while extraction is non-billable, the
    // refund is gated — even if the event carries non-zero chargedCredits
    // (which only happens for legacy in-flight events from before the
    // flag flip), the refund MUST NOT fire. Otherwise we'd produce a
    // phantom credit (refund without a matching deduct).
    //
    // The terminalization + document FAILED side effects still must
    // happen — those are about state recovery, not money movement.
    mocks.runDocumentExtractionPipeline.mockRejectedValue(new Error("pipeline boom"));
    mocks.refundCreditAmount.mockResolvedValue({ success: true });

    await expect(
      invokeHandler({
        documentId: "doc_1",
        extractionRunId: "run_1",
        userId: "user_1",
        dealId: "deal_1",
        reason: "reprocess",
        creditAction: "EXTRACTION_HIGH_PAGE",
        chargedCredits: 5,
        dispatchRefundKey: "extraction:refund:reprocess:abc",
      })
    ).rejects.toThrow("pipeline boom");

    // STRICT CONTRACT — no refund call while flag is off.
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();

    // State recovery still happens.
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_1",
      expect.any(String)
    );
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc_1", processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
    );
  });

  it("skips refund entirely when chargedCredits is 0 / undefined", async () => {
    mocks.runDocumentExtractionPipeline.mockRejectedValue(new Error("boom"));

    await expect(
      invokeHandler({
        documentId: "doc_1",
        extractionRunId: "run_1",
        userId: "user_1",
        dealId: "deal_1",
        reason: "upload",
        chargedCredits: 0,
      })
    ).rejects.toThrow("boom");

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).toHaveBeenCalled();
  });
});

describe("documentExtractionFunction — Phase 4.2 credit reconciliation", () => {
  function successResult(actualCredits: number) {
    return {
      status: "COMPLETED",
      textLength: 100,
      pageCount: 4,
      quality: 80,
      warnings: [],
      requiresOCR: false,
      ocrApplied: false,
      extractionRunId: "run_1",
      actualCredits,
    };
  }

  it("B10.1 — does NOT refund the over-estimate when flag is off (no pre-charge to reconcile)", async () => {
    // Pre-B10.1 this fired a partial refund of `chargedCredits - actualCredits`.
    // With CHARGE_DOCUMENT_EXTRACTION_CREDITS=false, the worker
    // hard-skips the reconcile branch — even if the upload-time
    // payload somehow carries non-zero chargedCredits (it won't, the
    // route also skips the deduct), the worker won't move credits.
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(3));

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      reconcileCredits: true,
    });

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("B10.1 — does NOT top-up the delta when flag is off (no ghost charge from worker)", async () => {
    // Pre-B10.1: actualCredits > chargedCredits → worker charged the
    // delta. With flag off the worker MUST not add charges even if
    // the pipeline returns a higher actualCredits — the user's
    // balance is sacred while extraction is non-billable.
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(12));

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 8,
      reconcileCredits: true,
    });

    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("does nothing when actualCredits === chargedCredits (legacy no-op path, still no-op with flag off)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(5));

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 5,
      reconcileCredits: true,
    });

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("does NOT reconcile when reconcileCredits is absent (the /process flow)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(2));

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "reprocess",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 9,
      // reconcileCredits omitted
    });

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("B10.1 — reconciliation refund is never attempted while flag is off (no provider error path either)", async () => {
    // Pre-B10.1: refund.success === false → logger.error. With flag
    // off the refund is never attempted, so there's no provider
    // error to log either.
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(1));
    mocks.refundCreditAmount.mockResolvedValue({ success: false, error: "provider down" });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 6,
      reconcileCredits: true,
    });

    // No refund attempt → no provider failure to log.
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });
});

describe("documentExtractionFunction — Phase 4.2 thesis re-extract trigger", () => {
  function successResult() {
    return {
      status: "COMPLETED",
      textLength: 100,
      pageCount: 4,
      quality: 80,
      warnings: [],
      requiresOCR: false,
      ocrApplied: false,
      extractionRunId: "run_1",
      actualCredits: 0,
    };
  }

  it("triggers analysis/thesis.reextract on a successful upload when a thesis exists", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult());
    mocks.thesisGetLatest.mockResolvedValue({ id: "thesis_1" });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
    });

    const thesisEvents = inngestSendSpy.mock.calls.filter(
      (call) => (call[0] as { name?: string }).name === "analysis/thesis.reextract"
    );
    expect(thesisEvents).toHaveLength(1);
    expect(thesisEvents[0]?.[0]).toMatchObject({
      name: "analysis/thesis.reextract",
      data: expect.objectContaining({
        dealId: "deal_1",
        triggeredByDocumentId: "doc_1",
        previousThesisId: "thesis_1",
      }),
    });
  });

  it("does NOT trigger thesis re-extract when no thesis exists", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult());
    mocks.thesisGetLatest.mockResolvedValue(null);

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
    });

    const thesisEvents = inngestSendSpy.mock.calls.filter(
      (call) => (call[0] as { name?: string }).name === "analysis/thesis.reextract"
    );
    expect(thesisEvents).toHaveLength(0);
  });

  it("does NOT trigger thesis re-extract for reason !== 'upload' (reprocess / page-retry)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult());
    mocks.thesisGetLatest.mockResolvedValue({ id: "thesis_1" });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_1",
      userId: "user_1",
      dealId: "deal_1",
      reason: "reprocess",
    });

    expect(mocks.thesisGetLatest).not.toHaveBeenCalled();
  });
});

// ============================================================
// B3.3.3 fix-up #2 — SUPERSEDED sentinel must not fire success side effects
// ============================================================
describe("documentExtractionFunction — Codex B3.3.3 fix-up #2 SUPERSEDED sentinel", () => {
  function supersededResult() {
    // The exact shape returned by extraction-pipeline.ts when the monotonic
    // guard rejects a late finalize (RunAlreadyTerminalError swallowed).
    return {
      status: "SUPERSEDED" as const,
      textLength: 1234,
      pageCount: 5,
      quality: 80,
      warnings: [],
      requiresOCR: false,
      ocrApplied: false,
      extractionRunId: "run_old_killed",
      actualCredits: 0,
    };
  }

  it("Codex B3.3.3 P1 — reason='upload' + existing thesis + SUPERSEDED → NO analysis/thesis.reextract event (the new run will trigger it when it completes)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());
    mocks.thesisGetLatest.mockResolvedValue({ id: "thesis_existing" });
    mocks.refundCreditAmount.mockResolvedValue({ success: true });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      dispatchRefundKey: "extraction:refund:upload:abc",
      reconcileCredits: true,
    });

    // CRITICAL: no thesis re-extract event. The new run owns the document
    // and will fire its own thesis trigger when IT completes. Firing here
    // would be a duplicate (worse: with wrong provenance — the late event
    // would name an extractionRunId that produced no new content).
    const thesisEvents = inngestSendSpy.mock.calls.filter(
      (call) => (call[0] as { name?: string }).name === "analysis/thesis.reextract"
    );
    expect(thesisEvents).toHaveLength(0);
    // thesisGetLatest must not even be queried (the gate sits before it).
    expect(mocks.thesisGetLatest).not.toHaveBeenCalled();
  });

  it("Codex B3.3.3 P1 — SUPERSEDED + reconcileCredits=true does NOT compute a delta/refund based on actualCredits=0 (would mis-attribute the refund)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());
    mocks.refundCreditAmount.mockResolvedValue({ success: true });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      dispatchRefundKey: "extraction:refund:upload:abc",
      reconcileCredits: true,
    });

    // The reconciliation refund (idempotencyKey `extraction:reconcile-refund:*`)
    // must NEVER fire on SUPERSEDED — the actualCredits=0 sentinel would
    // compute "refund 10" with the wrong idempotency key + description, and
    // would conflict with the SUPERSEDED compensation refund below.
    const reconcileCall = mocks.refundCreditAmount.mock.calls.find(
      (call) => (call[3] as { idempotencyKey?: string }).idempotencyKey?.startsWith("extraction:reconcile-refund:")
    );
    expect(reconcileCall).toBeUndefined();
    // And no delta charge (actualCredits < charged would not trigger delta
    // anyway, but assert the deduct path is silent).
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("B10.1 — SUPERSEDED skips compensate-superseded-extraction refund when CHARGE_DOCUMENT_EXTRACTION_CREDITS is false (no phantom credit)", async () => {
    // Pre-B10.1 contract (when extraction was billable): compensate-
    // superseded-extraction calls refundCreditAmount with the upload-
    // time dispatchRefundKey to give the user back the 10 credits they
    // paid at upload (the NEW run paid separately for itself).
    //
    // Post-B10.1: the upload-time deduct never happens, so there is
    // nothing to refund. Even if a stale event carries non-zero
    // chargedCredits, the strict contract on the flag prevents the
    // refund call — otherwise we'd be CREATING credit (refund without
    // a matching deduct on the user's tab in our ledger).
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());
    mocks.refundCreditAmount.mockResolvedValue({ success: true });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      dispatchRefundKey: "extraction:refund:upload:abc",
    });

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("Codex B3.3.3 P1 — SUPERSEDED does NOT terminalize the run NOR flip the document FAILED (run already terminal + document belongs to the new run)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      dispatchRefundKey: "extraction:refund:upload:abc",
    });

    // Critical no-touch invariants — the global catch's
    // `compensate-failed-extraction` MUST NOT fire (no throw on SUPERSEDED).
    expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("Codex B3.3.3 P1 — SUPERSEDED returns the sentinel result (no throw — Inngest sees a clean completion)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());

    const result = await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 10,
      dispatchRefundKey: "extraction:refund:upload:abc",
    });
    expect(result).toMatchObject({ status: "SUPERSEDED", extractionRunId: "run_old_killed" });
  });

  it("Codex B3.3.3 P1 — SUPERSEDED with chargedCredits=0 → no refund attempt (nothing to give back)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "upload",
      chargedCredits: 0,
    });

    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("Codex B3.3.3 P1 — SUPERSEDED for reason='reprocess' also blocks all success side effects (defense in depth — /process flow can also race)", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(supersededResult());
    mocks.thesisGetLatest.mockResolvedValue({ id: "thesis_existing" });

    await invokeHandler({
      documentId: "doc_1",
      extractionRunId: "run_old_killed",
      userId: "user_1",
      dealId: "deal_1",
      reason: "reprocess",
      creditAction: "EXTRACTION_HIGH_PAGE",
      chargedCredits: 5,
      dispatchRefundKey: "extraction:refund:reprocess:xyz",
    });

    // reason=reprocess doesn't fire thesis trigger anyway (existing
    // contract), but the gate on COMPLETED is an extra layer of defense.
    expect(mocks.thesisGetLatest).not.toHaveBeenCalled();
    expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});
