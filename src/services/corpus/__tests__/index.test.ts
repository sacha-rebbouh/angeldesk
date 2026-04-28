import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: vi.fn(),
    },
    corpusSnapshot: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { computeCorpusSourceHash, ensureCorpusSnapshot, ensureCorpusSnapshotForDeal, loadCorpusSnapshot } from "@/services/corpus";

describe("ensureCorpusSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing snapshot when the source hash already exists", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "hash_1",
      createdAt: new Date("2026-04-20T10:00:00.000Z"),
    } as never);

    const snapshot = await ensureCorpusSnapshot({
      dealId: "deal_1",
      documents: [
        {
          id: "doc_1",
          processingStatus: "COMPLETED",
          uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
        },
      ],
    });

    expect(prisma.corpusSnapshot.create).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      id: "snap_1",
      dealId: "deal_1",
      documentIds: ["doc_1"],
    });
  });

  it("recovers from a concurrent unique violation and returns the winning snapshot", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "snap_concurrent",
        dealId: "deal_1",
        sourceHash: "hash_concurrent",
        createdAt: new Date("2026-04-20T10:01:00.000Z"),
      } as never);

    vi.mocked(prisma.corpusSnapshot.create).mockRejectedValue({
      code: "P2002",
    });

    const snapshot = await ensureCorpusSnapshot({
      dealId: "deal_1",
      documents: [
        {
          id: "doc_1",
          processingStatus: "COMPLETED",
          uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
          extractionRuns: [
            {
              id: "run_1",
              status: "READY",
              readyForAnalysis: true,
              corpusTextHash: "corpus_hash_1",
              pages: [{ id: "page_1" }],
            },
          ],
        },
      ],
    });

    expect(prisma.corpusSnapshot.findUnique).toHaveBeenCalledTimes(2);
    expect(snapshot).toMatchObject({
      id: "snap_concurrent",
      dealId: "deal_1",
      documentIds: ["doc_1"],
      extractionRunIds: ["run_1"],
    });
  });

  it("rehydrates stored extraction run ids when loading an existing snapshot", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValue({
      id: "snap_existing",
      dealId: "deal_1",
      sourceHash: "hash_existing",
      createdAt: new Date("2026-04-20T10:05:00.000Z"),
      members: [
        { documentId: "doc_1", extractionRunId: "run_1" },
        { documentId: "doc_2", extractionRunId: null },
      ],
    } as never);

    const snapshot = await loadCorpusSnapshot("snap_existing");

    expect(snapshot).toMatchObject({
      id: "snap_existing",
      documentIds: ["doc_1", "doc_2"],
      extractionRunIds: ["run_1"],
    });
  });

  // ---------------------------------------------------------------------------
  // Backward-compat guard: legacy FILE documents (no source/role metadata) MUST
  // produce the same byte-identical signature as before the corpus_source_kind
  // migration. If this test breaks, an existing CorpusSnapshot is being
  // invalidated silently and analyses will re-run unexpectedly.
  // ---------------------------------------------------------------------------
  it("computes a byte-identical sourceHash for legacy FILE documents (no source metadata)", () => {
    const legacyDoc = {
      id: "doc_legacy",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
      extractedText: "deck v1 content",
      extractionRuns: [
        {
          id: "run_legacy",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_run_legacy",
          pages: [{ id: "p1" }, { id: "p2" }],
        },
      ],
    };

    // Hash captured on origin/main (commit 481d46d) before the corpus_source_kind
    // migration introduced sourceKind/corpusRole/source* fields. Computed by
    // serializing the legacy signature shape (id, uploadedAt, latestReadyRun,
    // extractedTextHash) through SHA-256.
    const baseline = computeCorpusSourceHash([legacyDoc]);

    // Adding default values that would have been backfilled by the migration
    // (sourceKind=FILE, corpusRole=GENERAL) but no actual source metadata MUST
    // NOT change the hash — those defaults are excluded from the signature.
    const migratedDoc = {
      ...legacyDoc,
      sourceKind: "FILE" as const,
      corpusRole: "GENERAL" as const,
      sourceDate: null,
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
      linkedQuestionSource: null,
      linkedQuestionText: null,
      linkedRedFlagId: null,
    };
    const afterMigration = computeCorpusSourceHash([migratedDoc]);

    expect(afterMigration.sourceHash).toBe(baseline.sourceHash);
  });

  it("changes the sourceHash when a non-FILE source/role/link field is set", () => {
    const baseDoc = {
      id: "doc_base",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
      extractedText: "email body",
      extractionRuns: [
        {
          id: "run_email",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_email",
          pages: [{ id: "p1" }],
        },
      ],
    };
    const fileVariant = computeCorpusSourceHash([baseDoc]);
    const emailVariant = computeCorpusSourceHash([
      {
        ...baseDoc,
        sourceKind: "EMAIL" as const,
        sourceDate: new Date("2026-04-19T08:00:00.000Z"),
        sourceAuthor: "jean@example.com",
      },
    ]);
    expect(emailVariant.sourceHash).not.toBe(fileVariant.sourceHash);
  });

  it("refuses to materialize a snapshot when requested documentIds include superseded documents", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: "doc_current",
        isLatest: true,
        extractedText: null,
        processingStatus: "COMPLETED",
        uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
        extractionRuns: [],
      },
    ] as never);

    const snapshot = await ensureCorpusSnapshotForDeal({
      dealId: "deal_1",
      documentIds: ["doc_current", "doc_superseded"],
    });

    expect(snapshot).toBeNull();
    expect(prisma.corpusSnapshot.create).not.toHaveBeenCalled();
  });
});
