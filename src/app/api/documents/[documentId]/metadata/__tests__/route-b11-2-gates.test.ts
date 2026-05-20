/**
 * Phase B11.2 — metadata PATCH gates (rate limit + analysis-running).
 *
 * Two new gates land in B11.2:
 *   - 429 rate-limit (30 PATCH/min/user — protects the
 *     Serializable recompute txn from spam).
 *   - 409 `analysis_running` (parity with other corpus-mutation
 *     surfaces: upload/text/ocr/process/retry already refuse while
 *     an analysis is in flight; metadata PATCH was missing this
 *     guard).
 *
 * The existing metadata test file covers the happy path + IDOR
 * uniformised 404. This file isolates the new gates so a regression
 * on either is easy to triage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
  transaction: vi.fn(),
  txDocumentFindUnique: vi.fn(),
  txDocumentUpdateMany: vi.fn(),
  txEvidenceSignalDeleteMany: vi.fn(),
  txEvidenceSignalFindMany: vi.fn(),
  tryDecryptJsonField: vi.fn(),
  runEvidenceForDocument: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
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
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
  isPendingThesisReview: () => false,
}));
vi.mock("@/services/evidence", () => ({
  runEvidenceForDocument: mocks.runEvidenceForDocument,
}));
vi.mock("@/lib/encryption", () => ({
  tryDecryptJsonField: mocks.tryDecryptJsonField,
}));

const { PATCH } = await import("../route");

function makeContext() {
  return { params: Promise.resolve({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa" }) };
}

function makeRequest(body: unknown) {
  return new Request("https://x/api/documents/ck8aaaaaaaaaaaaaaaaaaaaa/metadata", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  mocks.documentFindFirst.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceKind: "FILE",
    type: "PITCH_DECK",
    processingStatus: "COMPLETED",
  });
  mocks.documentFindUnique.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceMetadata: null,
    sourceKind: "FILE",
    type: "PITCH_DECK",
    name: "deck.pdf",
    processingStatus: "COMPLETED",
  });
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) =>
      fn({
        document: {
          findUnique: mocks.txDocumentFindUnique,
          updateMany: mocks.txDocumentUpdateMany,
        },
        evidenceSignal: {
          deleteMany: mocks.txEvidenceSignalDeleteMany,
          findMany: mocks.txEvidenceSignalFindMany,
        },
      })
  );
  mocks.txDocumentFindUnique.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceMetadata: null,
    type: "PITCH_DECK",
    sourceKind: "FILE",
  });
  mocks.txDocumentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txEvidenceSignalDeleteMany.mockResolvedValue({ count: 0 });
  mocks.txEvidenceSignalFindMany.mockResolvedValue([]);
  mocks.runEvidenceForDocument.mockResolvedValue({ status: "ran" });
  mocks.tryDecryptJsonField.mockImplementation((v: unknown) =>
    v === null || v === undefined ? { kind: "absent" } : { kind: "plaintext", value: v as object }
  );
  mocks.handleApiError.mockImplementation(
    (err: unknown) =>
      new Response(JSON.stringify({ error: err instanceof Error ? err.message : "internal" }), {
        status: 500,
      })
  );
});

// ----------------------------------------------------------------
// Rate-limit gate
// ----------------------------------------------------------------

describe("PATCH /api/documents/[id]/metadata — B11.2 rate limit", () => {
  it("429 when rate limit exceeded, BEFORE any DB read or txn", async () => {
    mocks.checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false, resetIn: 42 });

    const res = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(429);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string; retryAfter?: number };
    expect(body.error).toMatch(/Rate limit/i);
    expect(body.retryAfter).toBe(42);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("rate-limit bucket is scoped per-user (`metadata-patch:<userId>`)", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "user_alpha" });
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });

    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    expect(mocks.checkRateLimitDistributed).toHaveBeenCalledWith(
      "metadata-patch:user_alpha",
      expect.objectContaining({ maxRequests: 30, windowMs: 60_000 })
    );
  });
});

// ----------------------------------------------------------------
// Analysis-running gate
// ----------------------------------------------------------------

describe("PATCH /api/documents/[id]/metadata — B11.2 analysis-running gate (corpus-mutation convention)", () => {
  it("409 reason=analysis_running when an analysis is in flight on the deal", async () => {
    mocks.getRunningAnalysisForDeal.mockResolvedValueOnce({
      id: "ana_42",
      thesisId: "thesis_7",
      // analysisType doesn't matter — isPendingThesisReview stub returns false.
    });

    const res = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason?: string; analysisId?: string };
    expect(body.reason).toBe("analysis_running");
    expect(body.analysisId).toBe("ana_42");
    // No mutation, no recompute.
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("getRunningAnalysisForDeal is scoped to THIS deal (anti cross-deal leak)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_specific",
      sourceDate: null,
      sourceKind: "FILE",
      type: "PITCH_DECK",
      processingStatus: "COMPLETED",
    });

    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    expect(mocks.getRunningAnalysisForDeal).toHaveBeenCalledWith("deal_specific");
  });

  it("analysis check fires AFTER the ownership check (non-owners get 404, not analysis 409)", async () => {
    // Order matters: a non-owner probing the metadata route should
    // NOT learn that an analysis is running on a foreign deal.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.getRunningAnalysisForDeal).not.toHaveBeenCalled();
  });
});
