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
import { ensureCorpusSnapshot, ensureCorpusSnapshotForDeal, loadCorpusSnapshot } from "@/services/corpus";

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
