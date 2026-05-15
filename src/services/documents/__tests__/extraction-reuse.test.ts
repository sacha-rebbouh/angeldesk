import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));

const { reuseCompletedExtractionForContentHash } = await import("../extraction-reuse");

describe("reuseCompletedExtractionForContentHash — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the source document lookup to the current user's deals", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);

    const result = await reuseCompletedExtractionForContentHash({
      targetDocumentId: "doc_target",
      targetDocumentVersion: 1,
      contentHash: "hash_shared",
      userId: "user_current",
    });

    expect(result).toBeNull();
    expect(mocks.documentFindFirst).toHaveBeenCalledTimes(1);

    const call = mocks.documentFindFirst.mock.calls[0]?.[0] as
      | { where: Record<string, unknown> }
      | undefined;
    expect(call).toBeDefined();
    expect(call!.where).toMatchObject({
      contentHash: "hash_shared",
      deal: { userId: "user_current" },
    });
  });

  it("does not reuse a foreign-tenant extraction when only that tenant has the matching hash", async () => {
    // Simulating Prisma's behaviour: findFirst returns null because the source
    // document, owned by user_other, is filtered out by `deal.userId = user_current`.
    mocks.documentFindFirst.mockResolvedValue(null);

    const result = await reuseCompletedExtractionForContentHash({
      targetDocumentId: "doc_target",
      targetDocumentVersion: 1,
      contentHash: "hash_shared",
      userId: "user_current",
    });

    expect(result).toBeNull();
    // The transaction (clone of extraction artifacts) must not have run when
    // the only matching document belongs to a different tenant.
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("only allows reuse when the source document is owned by the same user", async () => {
    // findFirst returns a document because deal.userId matched user_current.
    mocks.documentFindFirst.mockResolvedValue({
      id: "doc_source",
      extractedText: "encrypted-blob",
      extractionQuality: 90,
      extractionMetrics: { pagesOCRd: 3, ocrCost: 0.12 },
      extractionWarnings: [],
      requiresOCR: false,
      ocrProcessed: true,
      extractionRuns: [
        {
          id: "run_source",
          status: "READY",
          pageCount: 5,
          pagesProcessed: 5,
          pagesSucceeded: 5,
          pagesFailed: 0,
          pagesSkipped: 0,
          coverageRatio: 1,
          qualityScore: 90,
          readyForAnalysis: true,
          blockedReason: null,
          extractionVersion: 1,
          pipelineVersion: "v1",
          corpusTextHash: null,
          summaryMetrics: {},
          warnings: null,
          completedAt: new Date("2026-05-01T00:00:00.000Z"),
          startedAt: new Date("2026-05-01T00:00:00.000Z"),
          pages: [],
        },
      ],
    });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        // Phase 4.3: `promoteDocumentVersionTx` takes a per-lineage advisory
        // lock via `$executeRaw` before its check-then-act.
        $executeRaw: vi.fn().mockResolvedValue(1),
        documentExtractionRun: {
          create: vi.fn().mockResolvedValue({ id: "run_clone", pageCount: 5, pagesProcessed: 5 }),
        },
        document: {
          update: vi.fn().mockResolvedValue(undefined),
          // Phase 4.3: the reuse transaction promotes the target document's
          // candidate version. `findUnique` returns a COMPLETED single
          // version → `promoteDocumentVersionTx` is a harmless no-op.
          findUnique: vi.fn().mockResolvedValue({
            id: "doc_target",
            dealId: "deal_target",
            name: "file.pdf",
            corpusParentDocumentId: null,
            version: 1,
            processingStatus: "COMPLETED",
          }),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    });

    const result = await reuseCompletedExtractionForContentHash({
      targetDocumentId: "doc_target",
      targetDocumentVersion: 1,
      contentHash: "hash_shared",
      userId: "user_current",
    });

    expect(result).not.toBeNull();
    expect(result?.pageCount).toBe(5);
    expect(result?.pagesProcessed).toBe(5);
    // Confirms the scope was applied even on the happy path.
    const call = mocks.documentFindFirst.mock.calls[0]?.[0] as
      | { where: Record<string, unknown> }
      | undefined;
    expect(call!.where).toMatchObject({ deal: { userId: "user_current" } });
  });
});
