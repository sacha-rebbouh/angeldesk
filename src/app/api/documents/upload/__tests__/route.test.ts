import { beforeEach, describe, expect, it, vi } from "vitest";

// Heavy route → many mocks. The goal is NOT to exercise the full happy path
// here (that's a Phase 5 golden) but to lock in the four post-Phase-2 safety
// properties Codex flagged as P1/P0:
//   1. blobUrl mismatch with blobPathname → 400, no deleteFile (cleanup not
//      armed before binding is proven).
//   2. Unowned deal → 404 without fetching the temp blob and without
//      deleting it.
//   3. Cleanup of the temp blob fires for failures AFTER ownership is
//      proven (MIME rejection covers the post-arming surface).
//   4. Cleanup of the FINAL blob fires when `uploadFile` succeeds and a
//      later DB step throws.

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  dealFindFirst: vi.fn(),
  documentFindFirst: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateMany: vi.fn(),
  thesisFindFirst: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  isPendingThesisReview: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  handleApiError: vi.fn(),
  checkDuplicateDocument: vi.fn(),
  computeContentHash: vi.fn(),
  encryptText: vi.fn(),
  isValidDocumentSignature: vi.fn(),
  reuseCompletedExtractionForContentHash: vi.fn(),
  setDocumentExtractionProgress: vi.fn(),
  buildProgressSnapshot: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  startDocumentExtractionRun: vi.fn(),
  terminalizeExtractionRunAsFailed: vi.fn(),
  estimatePdfExtractionCost: vi.fn(),
  inngestSend: vi.fn(),
  documentFindUnique: vi.fn(),
  promoteDocumentVersion: vi.fn(),
  acquireDocumentLineageLock: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({ checkRateLimitDistributed: mocks.rateLimit }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/encryption", () => ({ encryptText: mocks.encryptText }));
vi.mock("@/lib/file-signatures", () => ({ isValidDocumentSignature: mocks.isValidDocumentSignature }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    document: {
      findFirst: mocks.documentFindFirst,
      findUnique: mocks.documentFindUnique,
      create: mocks.documentCreate,
      update: mocks.documentUpdate,
      updateMany: mocks.documentUpdateMany,
    },
    thesis: { findFirst: mocks.thesisFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/services/storage", () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
}));
vi.mock("@/services/document-hash", () => ({
  computeContentHash: mocks.computeContentHash,
  checkDuplicateDocument: mocks.checkDuplicateDocument,
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
  isPendingThesisReview: mocks.isPendingThesisReview,
}));
vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  buildStructuredDocumentManifest: vi.fn(),
  recordDocumentExtractionRun: vi.fn(),
  summarizeManifestForLegacyMetrics: vi.fn(() => ({})),
  startDocumentExtractionRun: mocks.startDocumentExtractionRun,
  terminalizeExtractionRunAsFailed: mocks.terminalizeExtractionRunAsFailed,
  promoteDocumentVersion: mocks.promoteDocumentVersion,
  acquireDocumentLineageLock: mocks.acquireDocumentLineageLock,
  hasUsableExtractionCorpus: (text: string | null | undefined) =>
    typeof text === "string" && text.trim().length > 0,
}));
vi.mock("@/services/documents/extraction-progress", () => ({
  buildProgressSnapshot: mocks.buildProgressSnapshot,
  setDocumentExtractionProgress: mocks.setDocumentExtractionProgress,
}));
vi.mock("@/services/documents/extraction-reuse", () => ({
  reuseCompletedExtractionForContentHash: mocks.reuseCompletedExtractionForContentHash,
}));
vi.mock("@/services/pdf", () => ({
  estimatePdfExtractionCost: mocks.estimatePdfExtractionCost,
}));
vi.mock("@/lib/inngest", () => ({
  inngest: { send: mocks.inngestSend },
}));

const { POST } = await import("../route");

const userId = "ckuser0000000000000000000a";
const dealId = "ckdeal000000000000000000aa";

function blobBody(overrides: Record<string, unknown> = {}) {
  return {
    uploadSource: "blob",
    dealId,
    type: "OTHER",
    file: {
      name: "deck.pdf",
      type: "application/pdf",
      size: 1024,
      blobUrl: `https://store.public.blob.vercel-storage.com/tmp/document-uploads/${dealId}/abc.enc`,
      blobPathname: `tmp/document-uploads/${dealId}/abc.enc`,
      encryption: {
        algorithm: "AES-256-GCM",
        key: "a".repeat(64),
        iv: "b".repeat(24),
      },
    },
    ...overrides,
  };
}

function buildJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/documents/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: userId });
  mocks.rateLimit.mockResolvedValue({ allowed: true, resetIn: 60 });
  mocks.dealFindFirst.mockResolvedValue(null);
  mocks.documentFindFirst.mockResolvedValue(null);
  mocks.documentCreate.mockResolvedValue({
    id: "doc_1",
    dealId,
    name: "deck.pdf",
    storageUrl: "https://store.public.blob.vercel-storage.com/deals/x/y.pdf",
    storagePath: "deals/x/y.pdf",
    processingStatus: "PENDING",
  });
  mocks.documentUpdate.mockResolvedValue({});
  mocks.documentUpdateMany.mockResolvedValue({ count: 0 });
  mocks.thesisFindFirst.mockResolvedValue(null);
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  mocks.isPendingThesisReview.mockReturnValue(false);
  mocks.uploadFile.mockResolvedValue({
    url: "https://store.public.blob.vercel-storage.com/deals/x/y.pdf",
    pathname: "deals/x/y.pdf",
  });
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.handleApiError.mockImplementation((error: unknown) => {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "internal" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  });
  mocks.checkDuplicateDocument.mockResolvedValue({ isDuplicate: false });
  mocks.computeContentHash.mockReturnValue("hash");
  mocks.encryptText.mockReturnValue("encrypted");
  mocks.isValidDocumentSignature.mockResolvedValue(true);
  mocks.reuseCompletedExtractionForContentHash.mockResolvedValue(null);
  mocks.setDocumentExtractionProgress.mockResolvedValue(undefined);
  mocks.buildProgressSnapshot.mockImplementation((arg: unknown) => arg);
  mocks.deductCreditAmount.mockResolvedValue({ success: true });
  mocks.refundCreditAmount.mockResolvedValue({ success: true });
  mocks.startDocumentExtractionRun.mockResolvedValue({ id: "run_pdf_1" });
  mocks.terminalizeExtractionRunAsFailed.mockResolvedValue(1);
  mocks.estimatePdfExtractionCost.mockResolvedValue({ estimatedCredits: 4, pageCount: 4 });
  mocks.inngestSend.mockResolvedValue({ ids: [] });
  mocks.promoteDocumentVersion.mockResolvedValue(undefined);
  mocks.acquireDocumentLineageLock.mockResolvedValue(undefined);
  // Phase 4.3: version assignment + row creation run inside a per-lineage
  // locked transaction. The tx client surfaces the lineage read + create.
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) =>
      fn({
        document: { findFirst: mocks.documentFindFirst, create: mocks.documentCreate },
      })
  );
  // The route re-reads the document for the response after enqueue.
  mocks.documentFindUnique.mockResolvedValue({
    id: "doc_1",
    dealId,
    name: "deck.pdf",
    storageUrl: "https://store.public.blob.vercel-storage.com/deals/x/y.pdf",
    storagePath: "deals/x/y.pdf",
    processingStatus: "PROCESSING",
  });
});

// Minimal multipart PDF request — enough bytes that the %PDF signature is
// present; isValidDocumentSignature is mocked to true anyway.
function buildPdfMultipartRequest(): Request {
  const formData = new FormData();
  formData.append(
    "file",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], "deck.pdf", {
      type: "application/pdf",
    })
  );
  formData.append("dealId", dealId);
  formData.append("type", "PITCH_DECK");
  return new Request("http://localhost/api/documents/upload", {
    method: "POST",
    body: formData,
    headers: { "content-length": "1024" },
  });
}

describe("POST /api/documents/upload — Phase 4.2 durable PDF hand-off", () => {
  beforeEach(() => {
    mocks.dealFindFirst.mockResolvedValue({ id: dealId, userId });
  });

  it("enqueues a durable document/extraction.run event for a PDF and does NOT extract inline", async () => {
    const response = await POST(buildPdfMultipartRequest() as never);

    expect(response.status).toBe(201);
    expect(mocks.startDocumentExtractionRun).toHaveBeenCalledTimes(1);
    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);

    const event = mocks.inngestSend.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      id: "document-extraction:run_pdf_1",
      name: "document/extraction.run",
      data: expect.objectContaining({
        documentId: "doc_1",
        extractionRunId: "run_pdf_1",
        userId,
        dealId,
        reason: "upload",
        creditAction: "EXTRACTION_HIGH_PAGE",
        chargedCredits: 4,
        reconcileCredits: true,
        dispatchRefundKey: expect.stringMatching(/^extraction:refund:pdf-fail:/),
      }),
    });

    // The response signals a pending extraction — no inline result.
    const payload = await response.json();
    expect(payload.extraction).toMatchObject({ pending: true });
  });

  it("pre-charges the worst-case estimate BEFORE enqueueing", async () => {
    await POST(buildPdfMultipartRequest() as never);

    expect(mocks.deductCreditAmount).toHaveBeenCalledWith(
      userId,
      "EXTRACTION_HIGH_PAGE",
      4,
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^extraction:pre:pdf:/) })
    );
    const deductOrder = mocks.deductCreditAmount.mock.invocationCallOrder[0];
    const sendOrder = mocks.inngestSend.mock.invocationCallOrder[0];
    expect(deductOrder).toBeLessThan(sendOrder);
  });

  it("returns 402 and never enqueues when the PDF pre-charge fails", async () => {
    mocks.deductCreditAmount.mockResolvedValue({ success: false, error: "Insufficient credits" });

    const response = await POST(buildPdfMultipartRequest() as never);
    expect(response.status).toBe(402);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.startDocumentExtractionRun).not.toHaveBeenCalled();
  });

  it("returns 5xx (NOT a success 201) + refunds + terminalizes the orphan run when inngest.send throws", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("Inngest unreachable"));

    const response = await POST(buildPdfMultipartRequest() as never);
    // Codex P2: an enqueue failure means NO extraction will ever run. The
    // route must NOT fall through to a success 201 (that regresses the
    // Phase 1 rule "failed upload → no success toast"). It throws an
    // UploadRequestError(503) the client surfaces as an error.
    expect(response.status).toBe(503);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      userId,
      "EXTRACTION_HIGH_PAGE",
      4,
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^extraction:refund:pdf-fail:/) })
    );
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_pdf_1",
      expect.stringContaining("Inngest unreachable")
    );
    // The orphan run's document is flipped FAILED via the guarded updateMany.
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc_1", processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
    );
  });
});

describe("POST /api/documents/upload — Phase 4.3 candidate versioning", () => {
  beforeEach(() => {
    mocks.dealFindFirst.mockResolvedValue({ id: dealId, userId });
  });

  it("creates a brand-new document as isLatest: true (no prior version to preserve)", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);

    await POST(buildPdfMultipartRequest() as never);

    expect(mocks.documentCreate).toHaveBeenCalledTimes(1);
    const data = mocks.documentCreate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ version: 1, isLatest: true });
    expect(data.parentDocumentId).toBeUndefined();
  });

  it("creates a re-uploaded version as a CANDIDATE (isLatest: false) and does NOT eagerly demote the old version", async () => {
    // Same filename + deal already has a prior version → the new upload is
    // a candidate. The old version stays the lineage's isLatest until the
    // new extraction reaches COMPLETED (promotion happens in the pipeline).
    mocks.documentFindFirst.mockResolvedValue({ id: "doc_old", version: 2 });

    await POST(buildPdfMultipartRequest() as never);

    const data = mocks.documentCreate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      version: 3,
      parentDocumentId: "doc_old",
      isLatest: false,
    });
    // The OLD version must NOT be touched at upload time — no eager demote.
    const demotedOld = mocks.documentUpdate.mock.calls.some(
      (call) => call?.[0]?.where?.id === "doc_old"
    );
    expect(demotedOld).toBe(false);
  });

  it("assigns the version + creates the row inside a per-lineage locked transaction", async () => {
    // Codex Phase 4.3 P1 / concurrency note: two concurrent uploads of the
    // same filename must not both compute the same version or both land
    // isLatest. The lock + read + create run inside one $transaction.
    mocks.documentFindFirst.mockResolvedValue({ id: "doc_old", version: 2 });

    await POST(buildPdfMultipartRequest() as never);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.acquireDocumentLineageLock).toHaveBeenCalledTimes(1);
    // The lock is scoped to the lineage tuple (dealId, name, corpusParent).
    expect(mocks.acquireDocumentLineageLock.mock.calls[0]?.[1]).toEqual({
      dealId,
      name: "deck.pdf",
      corpusParentDocumentId: null,
    });
    // The lineage read is MAX(version) over the whole lineage — not just the
    // current isLatest row — so two in-flight candidates get distinct
    // version numbers.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dealId, name: "deck.pdf", corpusParentDocumentId: null },
        orderBy: { version: "desc" },
      })
    );
    // Lock acquired before the lineage read.
    expect(mocks.acquireDocumentLineageLock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.documentFindFirst.mock.invocationCallOrder[0]
    );
  });
});

describe("POST /api/documents/upload — Phase 2 safety properties", () => {
  describe("P1: cleanup is a controlled primitive", () => {
    it("rejects with 400 when blobUrl pathname does not match blobPathname (no deleteFile)", async () => {
      const body = blobBody({
        file: {
          name: "deck.pdf",
          type: "application/pdf",
          size: 1024,
          blobUrl: "https://store.public.blob.vercel-storage.com/tmp/document-uploads/OTHER_DEAL/abc.enc",
          blobPathname: `tmp/document-uploads/${dealId}/abc.enc`,
          encryption: {
            algorithm: "AES-256-GCM",
            key: "a".repeat(64),
            iv: "b".repeat(24),
          },
        },
      });

      const response = await POST(buildJsonRequest(body) as never);

      expect(response.status).toBe(400);
      // Critical: cleanup must NOT have run. The bound blob was never proven
      // to belong to this caller, so calling deleteFile on it would have
      // turned this endpoint into a remote delete primitive.
      expect(mocks.deleteFile).not.toHaveBeenCalled();
      // We never reached deal ownership either.
      expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    });

    it("rejects with 400 when blobPathname's dealId segment does not match the body dealId", async () => {
      const body = blobBody({
        file: {
          name: "deck.pdf",
          type: "application/pdf",
          size: 1024,
          // URL/pathname binding holds (they both point at OTHER_DEAL) but
          // the body dealId differs from the pathname segment. We must not
          // accept and we must not delete.
          blobUrl: "https://store.public.blob.vercel-storage.com/tmp/document-uploads/cknotmine000000000000000aa/foreign.enc",
          blobPathname: "tmp/document-uploads/cknotmine000000000000000aa/foreign.enc",
          encryption: {
            algorithm: "AES-256-GCM",
            key: "a".repeat(64),
            iv: "b".repeat(24),
          },
        },
      });

      const response = await POST(buildJsonRequest(body) as never);

      expect(response.status).toBe(400);
      expect(mocks.deleteFile).not.toHaveBeenCalled();
      // Ownership lookup still must not run — pathname-vs-dealId is a
      // pre-DB gate.
      expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    });

    it("returns 404 for an unowned deal without fetching or deleting the temp blob", async () => {
      mocks.dealFindFirst.mockResolvedValue(null);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw new Error("fetch must not be called before ownership");
      });

      try {
        const response = await POST(buildJsonRequest(blobBody()) as never);
        expect(response.status).toBe(404);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(mocks.deleteFile).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("P1: cleanup of temp blob AFTER ownership", () => {
    it("deletes the temp blob when the deal is owned but MIME is rejected", async () => {
      mocks.dealFindFirst.mockResolvedValue({ id: dealId, userId });

      // Switch to an unsupported MIME type. The blob URL/pathname stays
      // bound and inside our namespace, so once ownership is proven the
      // temp blob is OURS — cleanup is safe and required.
      const body = blobBody({
        file: {
          name: "deck.exe",
          type: "application/x-msdownload",
          size: 1024,
          blobUrl: `https://store.public.blob.vercel-storage.com/tmp/document-uploads/${dealId}/abc.enc`,
          blobPathname: `tmp/document-uploads/${dealId}/abc.enc`,
          encryption: {
            algorithm: "AES-256-GCM",
            key: "a".repeat(64),
            iv: "b".repeat(24),
          },
        },
      });

      // fetch must NOT run: MIME check happens before fetchBuffer().
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw new Error("fetch should not run when MIME is invalid");
      });

      try {
        const response = await POST(buildJsonRequest(body) as never);
        expect(response.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
        // Cleanup fired exactly once on the bound temp blob URL.
        expect(mocks.deleteFile).toHaveBeenCalledTimes(1);
        expect(mocks.deleteFile).toHaveBeenCalledWith(body.file.blobUrl);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("P1: cleanup of FINAL blob when DB commit fails", () => {
    it("deletes the final blob when uploadFile succeeds but document.create throws", async () => {
      // Multipart path — no temp blob, no fetch. Keeps the test focused on
      // the final-blob cleanup hook.
      const formData = new FormData();
      formData.append(
        "file",
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "deck.pdf", {
          type: "application/pdf",
        })
      );
      formData.append("dealId", dealId);
      formData.append("type", "OTHER");

      mocks.dealFindFirst.mockResolvedValue({ id: dealId, userId });
      mocks.uploadFile.mockResolvedValue({
        url: "https://store.public.blob.vercel-storage.com/deals/x/final.pdf",
        pathname: "deals/x/final.pdf",
      });
      mocks.documentCreate.mockRejectedValue(new Error("simulated DB outage"));

      const request = new Request("http://localhost/api/documents/upload", {
        method: "POST",
        body: formData,
        // Node's Request constructor does not autofill content-length for
        // FormData bodies. The route enforces a Content-Length header as a
        // pre-formData size cap, so we surface a safe value (the actual
        // body is small enough; we only need to clear the 411 gate).
        headers: { "content-length": "1024" },
      });
      const response = await POST(request as never);

      expect(response.status).toBe(500);
      // The final blob (created by uploadFile) must have been deleted by
      // the catch path. The temp-blob cleanup is a no-op on the multipart
      // path, so the single deleteFile call we expect is for the FINAL blob.
      expect(mocks.deleteFile).toHaveBeenCalledTimes(1);
      expect(mocks.deleteFile).toHaveBeenCalledWith(
        "https://store.public.blob.vercel-storage.com/deals/x/final.pdf"
      );
    });
  });
});
