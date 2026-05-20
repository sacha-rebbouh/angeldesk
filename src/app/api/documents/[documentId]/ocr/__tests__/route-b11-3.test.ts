/**
 * Phase B11.3 — auth + IDOR + anti-mutation/cost tests for POST
 * /api/documents/[id]/ocr.
 *
 * Mutation surface — deducts credits, claims PROCESSING, runs OCR.
 * The IDOR guard MUST fire BEFORE any of those side effects.
 * Anti-regression: no PROCESSING claim, no credit deduction, no
 * smartExtract, no PDF download for a cross-tenant doc id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdateMany: vi.fn(),
  documentUpdate: vi.fn(),
  documentFindUnique: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  downloadFile: vi.fn(),
  smartExtract: vi.fn(),
  encryptText: vi.fn(),
  deductCreditAmount: vi.fn(),
  refundCreditAmount: vi.fn(),
  startDocumentExtractionRun: vi.fn(),
  completeDocumentExtractionRun: vi.fn(),
  hasUsableExtractionCorpus: vi.fn(),
  markExtractionRunProgress: vi.fn(),
  recordExtractionPageProgress: vi.fn(),
  summarizeManifestForLegacyMetrics: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/storage", () => ({ downloadFile: mocks.downloadFile }));
vi.mock("@/services/pdf", () => ({ smartExtract: mocks.smartExtract }));
vi.mock("@/lib/encryption", () => ({ encryptText: mocks.encryptText }));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
}));
vi.mock("@/services/credits", () => ({
  // B10.1 — route reads the flag; default OFF (extraction not billed).
  CHARGE_DOCUMENT_EXTRACTION_CREDITS: false,
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: mocks.refundCreditAmount,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  startDocumentExtractionRun: mocks.startDocumentExtractionRun,
  completeDocumentExtractionRun: mocks.completeDocumentExtractionRun,
  hasUsableExtractionCorpus: mocks.hasUsableExtractionCorpus,
  markExtractionRunProgress: mocks.markExtractionRunProgress,
  recordExtractionPageProgress: mocks.recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics: mocks.summarizeManifestForLegacyMetrics,
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      findUnique: mocks.documentFindUnique,
      updateMany: mocks.documentUpdateMany,
      update: mocks.documentUpdate,
    },
  },
}));

const { POST } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";
function makeContext() {
  return { params: Promise.resolve({ documentId: DOC_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  // Anti-side-effect defaults: any of these firing for a non-owner
  // is a real IDOR/cost breach.
  mocks.downloadFile.mockImplementation(() => {
    throw new Error("downloadFile called on a non-owned doc — IDOR breach");
  });
  mocks.smartExtract.mockImplementation(() => {
    throw new Error("smartExtract called on a non-owned doc — IDOR breach");
  });
  mocks.deductCreditAmount.mockImplementation(() => {
    throw new Error("deductCreditAmount called on a non-owned doc — IDOR breach");
  });
  mocks.documentUpdateMany.mockImplementation(() => {
    throw new Error("documentUpdateMany called on a non-owned doc — IDOR breach");
  });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("POST /api/documents/[id]/ocr — B11.3 auth + IDOR + anti-mutation/cost", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — no mutation, no credit, no OCR", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.smartExtract).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth (DB down) → 500 via handleApiError", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("404 uniform when the doc is not owned — NO PROCESSING claim, NO credit deduction, NO OCR run", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(404);
    // The ENTIRE side-effect chain MUST be untouched.
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.startDocumentExtractionRun).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.smartExtract).not.toHaveBeenCalled();
    // Anchor userId scoping.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("404 uniform when the doc does not exist (no enumeration leak vs not-owned)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(404);
  });

  it("409 when an analysis is running on the deal — no OCR mutation", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "h",
      processingStatus: "COMPLETED",
    });
    mocks.getRunningAnalysisForDeal.mockResolvedValueOnce({ id: "ana_1" });
    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(409);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
  });

  it("400 when document is not a PDF (OCR is PDF-only)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storageUrl: "https://blob/x",
      storagePath: null,
      version: 1,
      contentHash: "h",
      processingStatus: "COMPLETED",
    });
    mocks.getRunningAnalysisForDeal.mockResolvedValueOnce(null);
    const res = await POST(new NextRequest(`https://x/api/documents/${DOC_ID}/ocr`, { method: "POST" }) as never, makeContext() as never);
    expect(res.status).toBe(400);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});
