import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.1 route test for the refactored /api/documents/[documentId]/process.
// Goal: prove that the route now (a) claims PROCESSING, (b) deducts credits
// up-front, (c) enqueues the Inngest event keyed by extractionRunId, and
// (d) returns 202 WITHOUT running smartExtract inline. Failures pre-enqueue
// must refund + revert PROCESSING.

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
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
      findUnique: mocks.documentFindUnique,
      updateMany: mocks.documentUpdateMany,
    },
  },
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
}));
vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  startDocumentExtractionRun: mocks.startDocumentExtractionRun,
  terminalizeExtractionRunAsFailed: mocks.terminalizeExtractionRunAsFailed,
}));
vi.mock("@/lib/inngest", () => ({
  inngest: { send: mocks.inngestSend },
}));

const { POST } = await import("../route");

function makeContext() {
  return { params: Promise.resolve({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_1" });
  mocks.documentFindUnique.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    name: "deck.pdf",
    mimeType: "application/pdf",
    storageUrl: "https://blob/x",
    storagePath: null,
    version: 1,
    contentHash: "hash",
    processingStatus: "COMPLETED",
    deal: { userId: "user_1" },
    extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
  });
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
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

describe("POST /api/documents/[documentId]/process — Phase 4.1 durable hand-off", () => {
  it("returns 202 with extractionRunId and does NOT run smartExtract inline", async () => {
    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toMatchObject({
      data: {
        documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
        extractionRunId: "run_new",
        processingStatus: "PROCESSING",
      },
      creditsCharged: 5,
    });
  });

  it("enqueues the Inngest event with a deterministic id keyed by extractionRunId", async () => {
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
        chargedCredits: 5,
        dispatchRefundKey: expect.stringMatching(/^extraction:refund:reprocess:/),
      }),
    });
  });

  it("deducts credits BEFORE enqueueing so the Inngest function can refund authoritatively", async () => {
    await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);

    expect(mocks.deductCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_HIGH_PAGE",
      5,
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^extraction:reprocess:/),
      })
    );

    // Ordering: deduct must precede send.
    const deductOrder = mocks.deductCreditAmount.mock.invocationCallOrder[0];
    const sendOrder = mocks.inngestSend.mock.invocationCallOrder[0];
    expect(deductOrder).toBeLessThan(sendOrder);
  });

  it("returns 402 + reverts PROCESSING when credit deduction fails (no Inngest send)", async () => {
    mocks.deductCreditAmount.mockResolvedValue({ success: false, error: "Insufficient credits" });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(402);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).toHaveBeenCalledTimes(2);
    // The second updateMany reverts PROCESSING back to the original status.
    const revertCall = mocks.documentUpdateMany.mock.calls[1]?.[0];
    expect(revertCall).toMatchObject({
      where: expect.objectContaining({ processingStatus: "PROCESSING" }),
      data: expect.objectContaining({ processingStatus: "COMPLETED" }),
    });
  });

  it("rejects with 409 if PROCESSING is already claimed (race-condition guard)", async () => {
    mocks.documentUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.documentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "hash",
      processingStatus: "PROCESSING",
      deal: { userId: "user_1" },
      extractionRuns: [{ summaryMetrics: { creditEstimate: { estimatedCredits: 5 } } }],
    });
    mocks.documentFindUnique.mockResolvedValueOnce({ processingStatus: "PROCESSING" });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(409);
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("refunds + reverts PROCESSING + terminalizes the orphan run when inngest.send throws", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("Inngest unreachable"));

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(500);
    expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_HIGH_PAGE",
      5,
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^extraction:refund:reprocess:/),
      })
    );
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
    mocks.documentFindUnique.mockResolvedValue({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "image.png",
      mimeType: "image/png",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "hash",
      processingStatus: "COMPLETED",
      deal: { userId: "user_1" },
      extractionRuns: [{ summaryMetrics: {} }],
    });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(400);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("rejects 403 when the document belongs to another user", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "hash",
      processingStatus: "COMPLETED",
      deal: { userId: "other_user" },
      extractionRuns: [{ summaryMetrics: {} }],
    });

    const response = await POST(new Request("https://x", { method: "POST" }) as never, makeContext() as never);
    expect(response.status).toBe(403);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });
});
