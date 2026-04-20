import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureCorpusSnapshotForDealMock } = vi.hoisted(() => ({
  ensureCorpusSnapshotForDealMock: vi.fn(),
}));

vi.mock("@/services/corpus", async () => {
  const actual = await vi.importActual<typeof import("@/services/corpus/index")>("@/services/corpus/index");
  return {
    ...actual,
    ensureCorpusSnapshotForDeal: ensureCorpusSnapshotForDealMock,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    thesis: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    deal: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  backfillCorpusSnapshots,
  listCorpusBackfillCandidates,
} from "@/services/corpus/backfill";

describe("corpus backfill service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists grouped deal candidates with missing analysis/thesis counts", async () => {
    vi.mocked(prisma.analysis.findMany).mockResolvedValue([
      { id: "analysis_1", dealId: "deal_1", createdAt: new Date("2026-03-10T00:00:00.000Z") },
      { id: "analysis_2", dealId: "deal_1", createdAt: new Date("2026-03-11T00:00:00.000Z") },
    ] as never);
    vi.mocked(prisma.thesis.findMany).mockResolvedValue([
      { id: "thesis_1", dealId: "deal_1", createdAt: new Date("2026-03-12T00:00:00.000Z") },
    ] as never);
    vi.mocked(prisma.deal.findMany).mockResolvedValue([
      {
        id: "deal_1",
        name: "Deal One",
        companyName: "Acme",
        sector: "SaaS",
        stage: "SEED",
        userId: "user_1",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-15T00:00:00.000Z"),
        _count: { documents: 4 },
        documents: [{ id: "doc_a" }, { id: "doc_b" }, { id: "doc_c" }],
      },
    ] as never);

    const candidates = await listCorpusBackfillCandidates();

    expect(candidates).toEqual([
      {
        id: "deal_1",
        name: "Deal One",
        dealId: "deal_1",
        dealName: "Deal One",
        companyName: "Acme",
        sector: "SaaS",
        stage: "SEED",
        userId: "user_1",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        documentCount: 4,
        processedDocumentCount: 3,
        eligible: true,
        reasons: [],
        missingAnalyses: 2,
        missingTheses: 1,
        latestMissingAnalysisAt: "2026-03-11T00:00:00.000Z",
        latestMissingThesisAt: "2026-03-12T00:00:00.000Z",
      },
    ]);
  });

  it("backfills analysis and thesis rows onto canonical snapshots", async () => {
    vi.mocked(prisma.analysis.findMany).mockResolvedValue([
      {
        id: "analysis_1",
        dealId: "deal_1",
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        mode: "full_analysis",
        status: "COMPLETED",
        documentIds: ["doc_1", "doc_2"],
        documents: [{ documentId: "doc_2" }, { documentId: "doc_3" }],
      },
    ] as never);
    vi.mocked(prisma.thesis.findMany).mockResolvedValue([
      {
        id: "thesis_1",
        dealId: "deal_1",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        isLatest: true,
        verdict: "favorable",
        sourceDocumentIds: [],
        analyses: [
          {
            id: "analysis_linked",
            corpusSnapshotId: "snap_existing",
            documentIds: ["doc_5"],
            documents: [{ documentId: "doc_5" }],
          },
        ],
      },
    ] as never);
    ensureCorpusSnapshotForDealMock.mockResolvedValue({
      id: "snap_analysis",
      dealId: "deal_1",
      sourceHash: "hash",
      documentIds: ["doc_1", "doc_2", "doc_3"],
      extractionRunIds: [],
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
    });

    const result = await backfillCorpusSnapshots({ dryRun: false });

    expect(ensureCorpusSnapshotForDealMock).toHaveBeenCalledWith({
      dealId: "deal_1",
      documentIds: ["doc_2", "doc_3", "doc_1"],
    });
    expect(prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: "analysis_1" },
      data: { corpusSnapshotId: "snap_analysis" },
    });
    expect(prisma.thesis.update).toHaveBeenCalledWith({
      where: { id: "thesis_1" },
      data: { corpusSnapshotId: "snap_existing" },
    });
    expect(result.updatedAnalyses).toBe(1);
    expect(result.updatedTheses).toBe(1);
    expect(result.skippedAnalyses).toBe(0);
    expect(result.skippedTheses).toBe(0);
  });

  it("skips legacy thesis rows that cannot be safely paired to an existing analysis snapshot", async () => {
    vi.mocked(prisma.analysis.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.thesis.findMany).mockResolvedValue([
      {
        id: "thesis_legacy",
        dealId: "deal_1",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        isLatest: true,
        verdict: "favorable",
        sourceDocumentIds: ["doc_1", "doc_2"],
        analyses: [
          {
            id: "analysis_legacy",
            corpusSnapshotId: null,
            documentIds: ["doc_1", "doc_2"],
            documents: [{ documentId: "doc_1" }, { documentId: "doc_2" }],
          },
        ],
      },
    ] as never);

    const result = await backfillCorpusSnapshots({ dryRun: false });

    expect(ensureCorpusSnapshotForDealMock).not.toHaveBeenCalled();
    expect(prisma.thesis.update).not.toHaveBeenCalled();
    expect(result.updatedTheses).toBe(0);
    expect(result.skippedTheses).toBe(1);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        id: "thesis_legacy",
        kind: "thesis",
        status: "skipped_no_snapshot",
      })
    );
  });
});
