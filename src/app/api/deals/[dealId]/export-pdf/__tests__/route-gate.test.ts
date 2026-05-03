import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  analysisFindFirst: vi.fn(),
  thesisFindFirst: vi.fn(),
  thesisGetLatest: vi.fn(),
  thesisGetById: vi.fn(),
  loadResults: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  factEventFindMany: vi.fn(),
  generateAnalysisPdf: vi.fn(),
  assertAnalysisCorpusReady: vi.fn(),
  pickCanonicalAnalysis: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/sanitize", () => ({ isValidCuid: vi.fn(() => true) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    analysis: {
      findFirst: mocks.analysisFindFirst,
      findMany: mocks.analysisFindMany,
    },
    thesis: { findFirst: mocks.thesisFindFirst },
    factEvent: { findMany: mocks.factEventFindMany },
  },
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getById: mocks.thesisGetById,
    getLatest: mocks.thesisGetLatest,
  },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: vi.fn(),
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  pickCanonicalAnalysis: mocks.pickCanonicalAnalysis,
}));

vi.mock("@/lib/pdf/generate-analysis-pdf", () => ({
  generateAnalysisPdf: mocks.generateAnalysisPdf,
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertAnalysisCorpusReady: mocks.assertAnalysisCorpusReady,
  };
});

const { GET } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildGetRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/deals/[dealId]/export-pdf - ARC-LIGHT snapshot-aware gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({
      id: "clmdeal00000000000000000",
      companyName: "Acme",
      sector: null,
      stage: null,
      founderEmail: null,
      userId: "user_1",
      createdAt: new Date(),
      status: "ACTIVE",
      thesis: null,
      documents: [],
    });
    mocks.analysisFindMany.mockResolvedValue([]);
    mocks.analysisFindFirst.mockResolvedValue({
      id: "clmanalysis000000000000000",
      dealId: "clmdeal00000000000000000",
      thesisId: "thesis_1",
      corpusSnapshotId: "snap_1",
      completedAt: new Date(),
      createdAt: new Date(),
      status: "COMPLETED",
    });
    mocks.thesisGetLatest.mockResolvedValue(null);
    mocks.pickCanonicalAnalysis.mockReturnValue({
      id: "clmanalysis000000000000000",
      corpusSnapshotId: "snap_1",
    });
  });

  it("returns 409 with SNAPSHOT_TOXIC and never loads results nor generates PDF", async () => {
    mocks.assertAnalysisCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("SNAPSHOT_TOXIC", null, {
        snapshotId: "snap_1",
        toxicRunIds: ["run_1"],
        missingRunIds: [],
      })
    );

    const response = await GET(
      buildGetRequest(
        "http://localhost/api/deals/clmdeal00000000000000000/export-pdf?analysisId=clmanalysis000000000000000"
      ),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("SNAPSHOT_TOXIC");

    expect(mocks.loadResults).not.toHaveBeenCalled();
    expect(mocks.generateAnalysisPdf).not.toHaveBeenCalled();
  });

  it("invokes the snapshot-aware gate with the resolved analysisMeta.id", async () => {
    mocks.assertAnalysisCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("SNAPSHOT_TOXIC", null)
    );

    await GET(
      buildGetRequest(
        "http://localhost/api/deals/clmdeal00000000000000000/export-pdf?analysisId=clmanalysis000000000000000"
      ),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(mocks.assertAnalysisCorpusReady).toHaveBeenCalledWith(
      "clmdeal00000000000000000",
      "clmanalysis000000000000000"
    );
  });
});
