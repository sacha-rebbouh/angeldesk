import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindFirst: vi.fn(),
  thesisFindFirst: vi.fn(),
  thesisGetLatest: vi.fn(),
  thesisGetHistory: vi.fn(),
  thesisGetById: vi.fn(),
  normalizeThesisEvaluation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    analysis: {
      findFirst: mocks.analysisFindFirst,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.thesisGetLatest,
    getHistory: mocks.thesisGetHistory,
    getById: mocks.thesisGetById,
  },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: mocks.normalizeThesisEvaluation,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { GET } = await import("../route");

const latestThesis = {
  id: "thesis_latest",
  dealId: "deal_1",
  version: 3,
  isLatest: true,
  reformulated: "Latest thesis",
  problem: "Problem",
  solution: "Solution",
  whyNow: "Why now",
  moat: null,
  pathToExit: null,
  verdict: "favorable",
  confidence: 85,
  ycLens: {},
  thielLens: {},
  angelDeskLens: {},
  loadBearing: [],
  alerts: [],
  decision: null,
  corpusSnapshotId: "snap_latest",
  createdAt: new Date("2026-04-20T10:00:00Z"),
};

describe("GET /api/deals/[dealId]/thesis analysis-specific resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    mocks.thesisGetLatest.mockResolvedValue(latestThesis);
    mocks.thesisGetHistory.mockResolvedValue([latestThesis]);
    mocks.normalizeThesisEvaluation.mockReturnValue({
      thesisQuality: { verdict: "favorable", summary: "Aligned" },
      investorProfileFit: { verdict: "favorable", summary: "Aligned" },
      dealAccessibility: { verdict: "favorable", summary: "Aligned" },
    });
    mocks.analysisFindFirst.mockResolvedValue({
      id: "analysis_1",
      thesisId: null,
      thesisBypass: false,
      corpusSnapshotId: "snap_analysis",
      createdAt: new Date("2026-04-20T11:00:00Z"),
    });
  });

  it("resolves the thesis by corpus snapshot when the analysis has no thesisId", async () => {
    const snapshotThesis = {
      ...latestThesis,
      id: "thesis_snapshot",
      corpusSnapshotId: "snap_analysis",
      reformulated: "Snapshot thesis",
    };

    mocks.thesisGetById.mockResolvedValue(null);
    mocks.thesisFindFirst.mockResolvedValue(snapshotThesis);

    const response = await GET(
      new Request("http://localhost/api/deals/deal_1/thesis?analysisId=analysis_1"),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.thesis.id).toBe("thesis_snapshot");
    expect(payload.data.thesis.reformulated).toBe("Snapshot thesis");
  });

  it("does not fall back to the latest thesis when the requested analysis has no aligned thesis", async () => {
    mocks.thesisGetById.mockResolvedValue(null);
    mocks.thesisFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/deals/deal_1/thesis?analysisId=analysis_1"),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.thesis).toBeNull();
    expect(payload.data.history).toEqual([]);
  });
});
