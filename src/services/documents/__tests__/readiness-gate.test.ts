import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindMany: vi.fn(),
  analysisFindUnique: vi.fn(),
  runFindMany: vi.fn(),
  loadCorpusSnapshot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findMany: mocks.documentFindMany },
    analysis: { findUnique: mocks.analysisFindUnique },
    documentExtractionRun: { findMany: mocks.runFindMany },
  },
}));

vi.mock("@/services/corpus", () => ({
  loadCorpusSnapshot: mocks.loadCorpusSnapshot,
}));

const {
  assertDealCorpusReady,
  assertAnalysisCorpusReady,
  evaluateDealCorpusReadinessSoft,
  CorpusNotReadyError,
} = await import("../readiness-gate");

function makeCleanDocument() {
  return {
    id: "doc_clean",
    name: "clean.pdf",
    type: "PITCH_DECK",
    mimeType: "application/pdf",
    processingStatus: "COMPLETED",
    extractionQuality: 80,
    extractionRuns: [
      {
        id: "run_clean",
        status: "READY",
        readyForAnalysis: true,
        blockedReason: null,
        overrides: [],
        pages: [
          {
            pageNumber: 1,
            status: "READY",
            charCount: 500,
            qualityScore: 80,
            hasTables: false,
            hasCharts: false,
            hasFinancialKeywords: false,
            hasMarketKeywords: false,
            hasTeamKeywords: false,
            errorMessage: null,
            artifact: { verification: { state: "provider_structured" } },
          },
        ],
      },
    ],
  };
}

function makeToxicDocument() {
  return {
    id: "doc_toxic",
    name: "toxic.pdf",
    type: "PITCH_DECK",
    mimeType: "application/pdf",
    processingStatus: "COMPLETED",
    extractionQuality: 60,
    extractionRuns: [
      {
        id: "run_toxic",
        status: "READY_WITH_WARNINGS",
        readyForAnalysis: true,
        blockedReason: null,
        overrides: [],
        pages: [
          {
            pageNumber: 16,
            status: "READY_WITH_WARNINGS",
            charCount: 500,
            qualityScore: 80,
            hasTables: false,
            hasCharts: false,
            hasFinancialKeywords: false,
            hasMarketKeywords: false,
            hasTeamKeywords: false,
            errorMessage: null,
            artifact: {
              verification: {
                state: "heuristic_fallback",
                evidence: ["legacy_text_fallback"],
              },
            },
          },
        ],
      },
    ],
  };
}

const originalFlag = process.env.EXTRACTION_STRICT_READINESS;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXTRACTION_STRICT_READINESS; // default: ON
});

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.EXTRACTION_STRICT_READINESS;
  } else {
    process.env.EXTRACTION_STRICT_READINESS = originalFlag;
  }
});

describe("assertDealCorpusReady", () => {
  it("no-ops when strict flag is disabled", async () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    await expect(assertDealCorpusReady("deal_1")).resolves.toBeUndefined();
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
  });

  it("passes silently when corpus is clean", async () => {
    mocks.documentFindMany.mockResolvedValue([makeCleanDocument()]);
    await expect(assertDealCorpusReady("deal_1")).resolves.toBeUndefined();
  });

  it("throws CorpusNotReadyError with UNVERIFIED_ARTIFACT on toxic pages", async () => {
    mocks.documentFindMany.mockResolvedValue([makeToxicDocument()]);

    await expect(assertDealCorpusReady("deal_1")).rejects.toMatchObject({
      name: "CorpusNotReadyError",
      reasonCode: "UNVERIFIED_ARTIFACT",
    });
  });

  it("throws MISSING_RUN when no extraction run exists", async () => {
    const doc = makeCleanDocument();
    doc.extractionRuns = [];
    mocks.documentFindMany.mockResolvedValue([doc]);

    await expect(assertDealCorpusReady("deal_1")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
    });
  });
});

describe("assertAnalysisCorpusReady (snapshot-aware)", () => {
  it("no-ops when strict flag is disabled", async () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).resolves.toBeUndefined();
    expect(mocks.analysisFindUnique).not.toHaveBeenCalled();
  });

  it("falls back to assertDealCorpusReady when analysisId is null", async () => {
    mocks.documentFindMany.mockResolvedValue([makeCleanDocument()]);
    await expect(assertAnalysisCorpusReady("deal_1", null)).resolves.toBeUndefined();
    expect(mocks.analysisFindUnique).not.toHaveBeenCalled();
    expect(mocks.documentFindMany).toHaveBeenCalled();
  });

  it("throws MISSING_RUN when analysis is unknown", async () => {
    mocks.analysisFindUnique.mockResolvedValue(null);
    await expect(assertAnalysisCorpusReady("deal_1", "analysis_ghost")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
    });
  });

  it("throws MISSING_RUN when analysis belongs to a different deal", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_OTHER",
      corpusSnapshotId: "snap_1",
    });
    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
    });
  });

  it("fails closed when an analysis-specific gate has no corpusSnapshotId", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: null,
    });
    mocks.documentFindMany.mockResolvedValue([makeCleanDocument()]);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
    });
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
    expect(mocks.loadCorpusSnapshot).not.toHaveBeenCalled();
  });

  it("throws MISSING_RUN when snapshot cannot be loaded", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_missing",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue(null);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
      snapshotDetail: { snapshotId: "snap_missing" },
    });
  });

  it("FAIL-CLOSED: throws MISSING_RUN when snapshot has zero extractionRunIds (no silent pass on legacy)", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_legacy",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue({
      id: "snap_legacy",
      dealId: "deal_1",
      sourceHash: "h",
      createdAt: new Date(),
      documentIds: ["doc_1"],
      extractionRunIds: [],
    });

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "MISSING_RUN",
      snapshotDetail: { snapshotId: "snap_legacy" },
    });
    // Must NOT query runs when the snapshot has nothing to verify
    expect(mocks.runFindMany).not.toHaveBeenCalled();
  });

  it("throws SNAPSHOT_TOXIC when snapshot references runs missing from Prisma", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_1",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "h",
      createdAt: new Date(),
      documentIds: ["doc_1", "doc_2"],
      extractionRunIds: ["run_1", "run_2", "run_3"],
    });
    // Prisma returns only 2 of 3 runs - snapshot is inconsistent
    mocks.runFindMany.mockResolvedValue([
      {
        id: "run_1",
        readyForAnalysis: true,
        pages: [{ pageNumber: 1, artifact: { verification: { state: "provider_structured" } } }],
      },
      {
        id: "run_2",
        readyForAnalysis: true,
        pages: [{ pageNumber: 1, artifact: { verification: { state: "provider_structured" } } }],
      },
    ]);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "SNAPSHOT_TOXIC",
      snapshotDetail: {
        snapshotId: "snap_1",
        missingRunIds: ["run_3"],
      },
    });
  });

  it("throws SNAPSHOT_TOXIC when a referenced run has readyForAnalysis=false", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_1",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "h",
      createdAt: new Date(),
      documentIds: ["doc_1"],
      extractionRunIds: ["run_1"],
    });
    mocks.runFindMany.mockResolvedValue([
      { id: "run_1", readyForAnalysis: false, pages: [] },
    ]);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "SNAPSHOT_TOXIC",
      snapshotDetail: { toxicRunIds: ["run_1"] },
    });
  });

  it("throws SNAPSHOT_TOXIC when a referenced run has a toxic page", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_1",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "h",
      createdAt: new Date(),
      documentIds: ["doc_1"],
      extractionRunIds: ["run_1"],
    });
    mocks.runFindMany.mockResolvedValue([
      {
        id: "run_1",
        readyForAnalysis: true,
        pages: [
          { pageNumber: 1, artifact: { verification: { state: "provider_structured" } } },
          { pageNumber: 16, artifact: { verification: { state: "heuristic_fallback" } } },
        ],
      },
    ]);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).rejects.toMatchObject({
      reasonCode: "SNAPSHOT_TOXIC",
      snapshotDetail: { toxicRunIds: ["run_1"], missingRunIds: [] },
    });
  });

  it("passes silently when every referenced run is clean", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_1",
      dealId: "deal_1",
      corpusSnapshotId: "snap_1",
    });
    mocks.loadCorpusSnapshot.mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "h",
      createdAt: new Date(),
      documentIds: ["doc_1"],
      extractionRunIds: ["run_1"],
    });
    mocks.runFindMany.mockResolvedValue([
      {
        id: "run_1",
        readyForAnalysis: true,
        pages: [
          { pageNumber: 1, artifact: { verification: { state: "provider_structured" } } },
        ],
      },
    ]);

    await expect(assertAnalysisCorpusReady("deal_1", "analysis_1")).resolves.toBeUndefined();
  });
});

describe("evaluateDealCorpusReadinessSoft", () => {
  it("returns ready=true when flag is disabled", async () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    const result = await evaluateDealCorpusReadinessSoft("deal_1");
    expect(result).toEqual({ ready: true, reasonCode: null, readiness: null });
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
  });

  it("returns ready=true with readiness payload when corpus is clean", async () => {
    mocks.documentFindMany.mockResolvedValue([makeCleanDocument()]);
    const result = await evaluateDealCorpusReadinessSoft("deal_1");
    expect(result.ready).toBe(true);
    expect(result.reasonCode).toBeNull();
    expect(result.readiness?.ready).toBe(true);
  });

  it("returns ready=false with reasonCode when corpus is toxic - never throws", async () => {
    mocks.documentFindMany.mockResolvedValue([makeToxicDocument()]);
    const result = await evaluateDealCorpusReadinessSoft("deal_1");
    expect(result.ready).toBe(false);
    expect(result.reasonCode).toBe("UNVERIFIED_ARTIFACT");
    expect(result.readiness?.ready).toBe(false);
  });

  it("returns ready=false with MISSING_RUN when evaluate throws unexpectedly", async () => {
    mocks.documentFindMany.mockRejectedValue(new Error("db down"));
    const result = await evaluateDealCorpusReadinessSoft("deal_1");
    expect(result).toEqual({ ready: false, reasonCode: "MISSING_RUN", readiness: null });
  });
});

describe("CorpusNotReadyError", () => {
  it("has a non-generic name and carries reasonCode", () => {
    const error = new CorpusNotReadyError("MISSING_RUN", null);
    expect(error.name).toBe("CorpusNotReadyError");
    expect(error.reasonCode).toBe("MISSING_RUN");
    expect(error instanceof Error).toBe(true);
  });
});
