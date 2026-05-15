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
  it("refunds credits with the dispatchRefundKey and marks document FAILED when pipeline throws", async () => {
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

    expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_HIGH_PAGE",
      5,
      expect.objectContaining({
        idempotencyKey: "extraction:refund:reprocess:abc",
        documentExtractionRunId: "run_1",
      })
    );
    // P1.1: compensation must terminalize the RUN too, not just the
    // document — defensively, in case the pipeline crashed before its own
    // catch ran.
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

  it("logs without throwing when the refund itself fails (user must not stay un-debited silently)", async () => {
    mocks.runDocumentExtractionPipeline.mockRejectedValue(new Error("pipeline boom"));
    mocks.refundCreditAmount.mockResolvedValue({ success: false, error: "credits provider down" });

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

    expect(mocks.loggerError).toHaveBeenCalled();
    // Document still marked FAILED so the UI does not show PROCESSING forever.
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it("refunds the over-estimate when actualCredits < chargedCredits", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(3));
    mocks.refundCreditAmount.mockResolvedValue({ success: true });

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

    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_HIGH_PAGE",
      7,
      expect.objectContaining({
        idempotencyKey: "extraction:reconcile-refund:run_1",
      })
    );
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("charges the delta when actualCredits > chargedCredits", async () => {
    mocks.runDocumentExtractionPipeline.mockResolvedValue(successResult(12));
    mocks.deductCreditAmount.mockResolvedValue({ success: true });

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

    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_HIGH_PAGE",
      4,
      expect.objectContaining({ idempotencyKey: "extraction:delta:run_1" })
    );
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("does nothing when actualCredits === chargedCredits", async () => {
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

  it("logs (does not throw) when the reconciliation refund fails", async () => {
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

    expect(mocks.loggerError).toHaveBeenCalled();
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
