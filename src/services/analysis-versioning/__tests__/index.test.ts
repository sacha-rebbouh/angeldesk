import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCorpusSnapshotDocumentIdsMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCorpusSnapshotDocumentIdsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    deal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: getCorpusSnapshotDocumentIdsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getAnalysesStaleness,
  getAnalysisStaleness,
  getUnanalyzedDocuments,
} from "@/services/analysis-versioning";

describe("analysis-versioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers canonical document relations over legacy analysis.documentIds", async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue({
      id: "analysis_joined",
      dealId: "deal_1",
      corpusSnapshotId: null,
      documentIds: ["doc_legacy"],
      documents: [{ documentId: "doc_joined" }],
    } as never);
    vi.mocked(prisma.deal.findUnique).mockResolvedValue({
      id: "deal_1",
      documents: [
        { id: "doc_new", name: "New doc", uploadedAt: new Date("2026-04-12T00:00:00.000Z") },
        { id: "doc_joined", name: "Joined doc", uploadedAt: new Date("2026-04-11T00:00:00.000Z") },
      ],
    } as never);

    const result = await getAnalysisStaleness("analysis_joined");

    expect(result).toMatchObject({
      analyzedDocumentIds: ["doc_joined"],
      currentDocumentIds: ["doc_new", "doc_joined"],
      newDocumentIds: ["doc_new"],
      removedDocumentIds: [],
      newDocumentCount: 1,
      message: "1 nouveau document non analysé",
    });
    expect(getCorpusSnapshotDocumentIdsMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("uses a restricted legacy fallback only for current deal documents in batch mode", async () => {
    vi.mocked(prisma.analysis.findMany).mockResolvedValue([
      {
        id: "analysis_legacy",
        dealId: "deal_1",
        corpusSnapshotId: null,
        documentIds: ["doc_current", "doc_orphan"],
        documents: [],
      },
    ] as never);
    vi.mocked(prisma.deal.findMany).mockResolvedValue([
      {
        id: "deal_1",
        documents: [{ id: "doc_current" }, { id: "doc_new" }],
      },
    ] as never);

    const results = await getAnalysesStaleness(["analysis_legacy"]);

    expect(results.get("analysis_legacy")).toMatchObject({
      analyzedDocumentIds: ["doc_current"],
      currentDocumentIds: ["doc_current", "doc_new"],
      newDocumentIds: ["doc_new"],
      removedDocumentIds: [],
      newDocumentCount: 1,
      message: "1 nouveau document non analysé",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: "analysis_legacy",
        dealId: "deal_1",
        legacyDocumentCount: 2,
        reconciledDocumentCount: 1,
        scope: "AnalysisVersioning.getAnalysesStaleness",
      }),
      "Using restricted legacy analysis.documentIds fallback"
    );
  });

  it("treats unresolved snapshot-backed scope as empty instead of reviving legacy documentIds", async () => {
    const currentDocuments = [
      { id: "doc_b", name: "Doc B", type: "MEMO", uploadedAt: new Date("2026-04-12T00:00:00.000Z") },
      { id: "doc_a", name: "Doc A", type: "DECK", uploadedAt: new Date("2026-04-11T00:00:00.000Z") },
    ];

    vi.mocked(prisma.analysis.findFirst).mockResolvedValue({
      id: "analysis_snapshot",
      dealId: "deal_1",
      corpusSnapshotId: "snap_1",
      documentIds: ["doc_a"],
      documents: [],
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue(currentDocuments as never);
    getCorpusSnapshotDocumentIdsMock.mockResolvedValue([]);

    const result = await getUnanalyzedDocuments("deal_1");

    expect(result).toEqual(currentDocuments);
    expect(getCorpusSnapshotDocumentIdsMock).toHaveBeenCalledWith("snap_1");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: "analysis_snapshot",
        dealId: "deal_1",
        corpusSnapshotId: "snap_1",
        legacyDocumentCount: 1,
        scope: "AnalysisVersioning.getUnanalyzedDocuments",
      }),
      "Ignoring legacy analysis.documentIds fallback because canonical snapshot scope is unavailable"
    );
  });
});
