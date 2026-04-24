import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  assertFeatureAccess: vi.fn(),
  analysisFindFirst: vi.fn(),
  assertAnalysisCorpusReady: vi.fn(),
  loadResults: vi.fn(),
  generateNegotiationStrategy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: { findFirst: mocks.analysisFindFirst },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/negotiation/strategist", () => ({
  generateNegotiationStrategy: mocks.generateNegotiationStrategy,
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: vi.fn(),
    resolveSourceScope: vi.fn(),
  },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: vi.fn(),
}));

vi.mock("@/services/credits/feature-access", () => ({
  assertFeatureAccess: mocks.assertFeatureAccess,
  FeatureAccessError: class FeatureAccessError extends Error {},
  serializeFeatureAccessError: vi.fn(),
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertAnalysisCorpusReady: mocks.assertAnalysisCorpusReady,
  };
});

const { POST } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildPostRequest(body: unknown) {
  return new Request("http://localhost/api/negotiation/generate", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/negotiation/generate - ARC-LIGHT snapshot-aware gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.assertFeatureAccess.mockResolvedValue(undefined);
    mocks.analysisFindFirst.mockResolvedValue({
      id: "clmanalysis000000000000000",
      thesisId: "thesis_1",
      thesisBypass: false,
      negotiationStrategy: null,
    });
  });

  it("returns 409 with SNAPSHOT_TOXIC and never loads results nor generates strategy", async () => {
    mocks.assertAnalysisCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("SNAPSHOT_TOXIC", null, {
        snapshotId: "snap_1",
        toxicRunIds: ["run_1"],
        missingRunIds: [],
      })
    );

    const response = await POST(
      buildPostRequest({
        dealId: "clmdeal00000000000000000",
        analysisId: "clmanalysis000000000000000",
      })
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("SNAPSHOT_TOXIC");
    expect(payload.snapshotDetail).toMatchObject({
      snapshotId: "snap_1",
      toxicRunIds: ["run_1"],
    });

    expect(mocks.loadResults).not.toHaveBeenCalled();
    expect(mocks.generateNegotiationStrategy).not.toHaveBeenCalled();
  });

  it("invokes the gate with both dealId and analysisId", async () => {
    mocks.assertAnalysisCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("SNAPSHOT_TOXIC", null)
    );

    await POST(
      buildPostRequest({
        dealId: "clmdeal00000000000000000",
        analysisId: "clmanalysis000000000000000",
      })
    );

    expect(mocks.assertAnalysisCorpusReady).toHaveBeenCalledWith(
      "clmdeal00000000000000000",
      "clmanalysis000000000000000"
    );
  });
});
