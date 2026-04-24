import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  documentFindFirst: vi.fn(),
  assertDealCorpusReady: vi.fn(),
  extractTermsFromDocument: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    document: { findFirst: mocks.documentFindFirst },
  },
}));

vi.mock("@/lib/encryption", () => ({
  safeDecrypt: (value: string) => value,
}));

vi.mock("@/services/term-sheet-extractor", () => ({
  extractTermsFromDocument: mocks.extractTermsFromDocument,
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertDealCorpusReady: mocks.assertDealCorpusReady,
  };
});

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { POST } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildPostRequest(body: unknown) {
  return new Request("http://localhost/api/deals/deal_1/terms/extract", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/deals/[dealId]/terms/extract - ARC-LIGHT gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "clmdeal00000000000000000" });
    mocks.documentFindFirst.mockResolvedValue({
      id: "clmdoc000000000000000000",
      name: "termsheet.pdf",
      type: "TERM_SHEET",
      extractedText: "encrypted",
    });
  });

  it("returns 409 with reasonCode on toxic corpus; LLM is never called", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", null)
    );

    const response = await POST(
      buildPostRequest({ documentId: "clmdoc000000000000000000" }),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("UNVERIFIED_ARTIFACT");
    expect(mocks.extractTermsFromDocument).not.toHaveBeenCalled();
  });

  it("passes through to extractor when gate allows", async () => {
    mocks.assertDealCorpusReady.mockResolvedValue(undefined);
    mocks.extractTermsFromDocument.mockResolvedValue({
      confidence: "high",
      suggestions: [],
    });

    const response = await POST(
      buildPostRequest({ documentId: "clmdoc000000000000000000" }),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(mocks.assertDealCorpusReady).toHaveBeenCalledWith("clmdeal00000000000000000");
    expect(response.status).toBe(200);
    expect(mocks.extractTermsFromDocument).toHaveBeenCalled();
  });
});
