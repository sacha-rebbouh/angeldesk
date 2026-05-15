import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateMany: vi.fn(),
  pageUpdate: vi.fn(),
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
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
}));
vi.mock("@/services/credits", () => ({
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
    mocks.documentUpdate.mockResolvedValue(undefined);
    mocks.refreshRunExtractionStats.mockResolvedValue({ readyForAnalysis: false, status: "BLOCKED" });
  });

  it("refunds the 2 credits charged when the supreme OCR retry returns no usable text (422)", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: true,
      pageResults: [{ pageNumber: 3, text: "   ", confidence: "low", mode: "supreme" }],
      totalCost: 0.05,
    });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    expect(response.status).toBe(422);

    const payload = await response.json();
    expect(payload).toMatchObject({ refundedCredits: 2, refundFailed: false });
    expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_SUPREME_PAGE",
      2,
      expect.objectContaining({
        dealId: "deal_1",
        documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
        pageNumber: 3,
        idempotencyKey: expect.stringMatching(/^extraction:refund:supreme-page:/),
      })
    );
  });

  it("reports refundedCredits=0 + refundFailed=true when the credits service returns { success: false }", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: true,
      pageResults: [{ pageNumber: 3, text: "   ", confidence: "low", mode: "supreme" }],
      totalCost: 0.05,
    });
    mocks.refundCreditAmount.mockResolvedValue({ success: false, error: "credits provider down" });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(new Request("https://x") as never, makeContext() as never);
      expect(response.status).toBe(422);

      const payload = await response.json();
      expect(payload.refundedCredits).toBe(0);
      expect(payload.refundFailed).toBe(true);
      expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports refundedCredits=0 + refundFailed=true when the credits service throws", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: true,
      pageResults: [{ pageNumber: 3, text: "   ", confidence: "low", mode: "supreme" }],
      totalCost: 0.05,
    });
    mocks.refundCreditAmount.mockRejectedValue(new Error("network unreachable"));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(new Request("https://x") as never, makeContext() as never);
      expect(response.status).toBe(422);

      const payload = await response.json();
      expect(payload.refundedCredits).toBe(0);
      expect(payload.refundFailed).toBe(true);
      expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("refunds when selectiveOCR returns a hard failure (no text at all)", async () => {
    mocks.selectiveOCR.mockResolvedValue({
      success: false,
      error: "OCR backend timed out",
      pageResults: [],
      totalCost: 0,
    });

    const response = await POST(new Request("https://x") as never, makeContext() as never);
    expect(response.status).toBe(422);

    expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
    expect(mocks.refundCreditAmount).toHaveBeenCalledWith(
      "user_1",
      "EXTRACTION_SUPREME_PAGE",
      2,
      expect.objectContaining({ pageNumber: 3 })
    );
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
    // reasons, hence 422 + refund).
    expect(response.status).toBe(422);
    expect(mocks.downloadFile).toHaveBeenCalledWith("deals/deal_1/legacy-path.pdf");
    expect(mocks.refundCreditAmount).toHaveBeenCalledTimes(1);
  });
});
