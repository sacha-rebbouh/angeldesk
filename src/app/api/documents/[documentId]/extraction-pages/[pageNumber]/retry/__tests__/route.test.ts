import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateMany: vi.fn(),
  pageUpdate: vi.fn(),
  runUpdate: vi.fn(),
  transaction: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  selectiveOCR: vi.fn(),
  refreshRunExtractionStats: vi.fn(),
  downloadFile: vi.fn(),
  safeDecrypt: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/encryption", () => ({
  encryptText: (text: string) => text,
  safeDecrypt: mocks.safeDecrypt,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      update: mocks.documentUpdate,
      updateMany: mocks.documentUpdateMany,
    },
    documentExtractionPage: {
      update: mocks.pageUpdate,
    },
    documentExtractionRun: {
      update: mocks.runUpdate,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
}));
vi.mock("@/services/credits", () => ({
  // B10.1 — route reads the flag; default OFF (extraction not billed).
  CHARGE_DOCUMENT_EXTRACTION_CREDITS: false,
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
}));
vi.mock("@/services/pdf", () => ({
  detectPageSignals: () => ({
    hasTables: false,
    hasCharts: false,
    hasFinancialKeywords: false,
    hasMarketKeywords: false,
    hasTeamKeywords: false,
  }),
  selectiveOCR: mocks.selectiveOCR,
}));
vi.mock("@/services/pdf/extraction-semantics", () => ({
  assessExtractionSemantics: () => ({
    semanticSufficiency: "insufficient",
    shouldBlockIfStructureMissing: false,
    canDegradeToWarning: false,
    analyticalValueScore: 0,
  }),
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  buildDocumentPageArtifact: () => ({ unreadableRegions: [], version: 1 }),
  calculateArtifactCompleteness: () => ({ score: 0 }),
  hashExtractedCorpus: () => "hash",
  refreshRunExtractionStats: mocks.refreshRunExtractionStats,
  encryptExtractionPagePayload: (payload: { artifact: unknown; textPreview: string }) => ({
    artifact: payload.artifact,
    textPreview: payload.textPreview,
  }),
}));
vi.mock("@/services/storage", () => ({
  downloadFile: mocks.downloadFile,
}));

const { POST } = await import("../route");

function makeContext() {
  return {
    params: Promise.resolve({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa", pageNumber: "3" }),
  };
}

describe("POST /api/documents/[documentId]/extraction-pages/[pageNumber]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
    mocks.documentFindFirst.mockResolvedValue({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "blob:url",
      processingStatus: "COMPLETED",
      extractedText: "encrypted-corpus",
      extractionMetrics: {},
      extractionWarnings: [],
      requiresOCR: true,
      ocrProcessed: false,
      version: 1,
      contentHash: "hash",
      extractionRuns: [
        {
          id: "run_1",
          pageCount: 10,
          pages: [
            {
              pageNumber: 3,
              status: "FAILED",
              hasTables: false,
              hasCharts: false,
              artifact: null,
            },
          ],
          overrides: [],
          summaryMetrics: {},
          warnings: [],
          status: "BLOCKED",
          readyForAnalysis: false,
        },
      ],
    });
    mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deductCreditAmount.mockResolvedValue({ success: true });
    mocks.refundCreditAmount.mockResolvedValue({ success: true });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
    mocks.safeDecrypt.mockReturnValue("existing corpus");
    mocks.pageUpdate.mockResolvedValue(undefined);
    mocks.runUpdate.mockResolvedValue(undefined);
    mocks.documentUpdate.mockResolvedValue(undefined);
    mocks.transaction.mockResolvedValue([undefined, undefined, undefined]);
    mocks.refreshRunExtractionStats.mockResolvedValue({ readyForAnalysis: false, status: "BLOCKED" });
  });

  it("B10.1 — supreme OCR retry returns 422 with refundedCredits=0 (no charge to refund while extraction is non-billable)", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: true,
      pageResults: [{ pageNumber: 3, text: "   ", confidence: "low", mode: "supreme" }],
      totalCost: 0.05,
    });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    expect(response.status).toBe(422);

    const payload = await response.json();
    // B10.1 — no pre-charge happened, so the refund path is a no-op.
    // Anchors "no ghost credit creation": balance never moves on a
    // 422 retry result while CHARGE_DOCUMENT_EXTRACTION_CREDITS is false.
    expect(payload).toMatchObject({ refundedCredits: 0, refundFailed: false });
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("B10.1 — hard failure from selectiveOCR also yields no refund (no charge to refund)", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: false,
      error: "OCR backend timed out",
      pageResults: [],
      totalCost: 0,
    });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    expect(response.status).toBe(422);

    // Same gate as the 422-empty-text case: extraction was free, so
    // there's nothing to refund. Both deduct and refund stay
    // untouched — ledger conservation.
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });

  it("B10.1 — successful supreme OCR retry persists creditsCharged=0 and omits creditAction (no charge happened)", async () => {
    // Anchor for the audit-flagged P1: response payload + the
    // extractionMetrics.lastPageRetry blob must both reflect the real
    // charge (0 while CHARGE_DOCUMENT_EXTRACTION_CREDITS is false),
    // not a hardcoded `2`. Without this, the user would see
    // "2 credits charged" in the UI while their balance never moved
    // — a worse bug than just billing them.
    mocks.selectiveOCR.mockResolvedValue({
      success: true,
      pageResults: [
        {
          pageNumber: 3,
          text: "Some recovered text after a targeted supreme OCR retry. ".repeat(20),
          confidence: "medium",
          mode: "supreme",
        },
      ],
      totalCost: 0.07,
    });
    mocks.refreshRunExtractionStats.mockResolvedValue({ readyForAnalysis: false, status: "BLOCKED" });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { data: { creditsCharged: number } };
    expect(payload.data.creditsCharged).toBe(0);
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();

    // Persisted metrics blob must mirror the response: 0 charge, no
    // creditAction (otherwise downstream observers would see a phantom
    // EXTRACTION_SUPREME_PAGE op). prisma.document.update is invoked
    // inside the $transaction([...]) array — the vi.fn() captures the
    // exact args before they're handed to the transaction wrapper.
    const docUpdateCall = mocks.documentUpdate.mock.calls.find((call) => {
      const arg = call[0] as { data?: { extractionMetrics?: unknown } } | undefined;
      return Boolean(arg?.data && "extractionMetrics" in arg.data);
    });
    expect(docUpdateCall).toBeDefined();
    const lastPageRetry = (
      docUpdateCall?.[0] as {
        data: { extractionMetrics: { lastPageRetry: Record<string, unknown> } };
      }
    ).data.extractionMetrics.lastPageRetry;
    expect(lastPageRetry.creditsCharged).toBe(0);
    expect(lastPageRetry).not.toHaveProperty("creditAction");
  });

  it("downloads using storagePath when storageUrl is null (legacy / local-dev row)", async () => {
    // Simulate a row that only carries storagePath (storageUrl null). The
    // schema permits this and download/delete already fall back to it; the
    // retry route must do the same instead of bouncing the user with
    // "Document has no storage URL".
    mocks.documentFindFirst.mockResolvedValue({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: null,
      storagePath: "deals/deal_1/legacy-path.pdf",
      processingStatus: "COMPLETED",
      extractedText: "encrypted-corpus",
      extractionMetrics: {},
      extractionWarnings: [],
      requiresOCR: true,
      ocrProcessed: false,
      version: 1,
      contentHash: "hash",
      extractionRuns: [
        {
          id: "run_1",
          pageCount: 10,
          pages: [
            { pageNumber: 3, status: "FAILED", hasTables: false, hasCharts: false, artifact: null },
          ],
          overrides: [],
          summaryMetrics: {},
          warnings: [],
          status: "BLOCKED",
          readyForAnalysis: false,
        },
      ],
    });
    mocks.selectiveOCR.mockResolvedValue({
      success: false,
      error: "OCR backend timed out",
      pageResults: [],
      totalCost: 0,
    });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    // We do NOT 400 with "Document has no storage URL" — we fall through
    // and let the downstream OCR call run (which fails here for unrelated
    // reasons, hence 422). B10.1: no refund because no charge.
    expect(response.status).toBe(422);
    expect(mocks.downloadFile).toHaveBeenCalledWith("deals/deal_1/legacy-path.pdf");
    expect(mocks.refundCreditAmount).not.toHaveBeenCalled();
  });
});
