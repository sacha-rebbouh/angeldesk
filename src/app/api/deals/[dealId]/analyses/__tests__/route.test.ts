import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  thesisFindFirst: vi.fn(),
  loadResults: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    analysis: {
      findFirst: mocks.analysisFindFirst,
      findMany: mocks.analysisFindMany,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { GET } = await import("../route");

function makeNextRequest(url: string): Request & { nextUrl: URL } {
  const request = new Request(url) as Request & { nextUrl: URL };
  request.nextUrl = new URL(url);
  return request;
}

describe("GET /api/deals/[dealId]/analyses", () => {
  const dealId = "ck12345678901234567890123";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.analysisFindMany.mockResolvedValue([]);
    mocks.thesisFindFirst.mockResolvedValue(null);
    mocks.loadResults.mockResolvedValue(null);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );
  });

  it("returns the latest active analysis before any canonical completed fallback", async () => {
    mocks.analysisFindFirst
      .mockResolvedValueOnce({
        id: "analysis_running",
        status: "RUNNING",
        type: "FULL_DD",
        mode: "full_analysis",
        thesisId: "thesis_1",
        thesisBypass: false,
        corpusSnapshotId: "snapshot_running",
        completedAgents: 2,
        totalAgents: 16,
        summary: null,
        totalCost: null,
        totalTimeMs: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
      });

    const response = await GET(
      makeNextRequest(`http://localhost/api/deals/${dealId}/analyses`) as never,
      { params: Promise.resolve({ dealId }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("analysis_running");
    expect(mocks.analysisFindMany).not.toHaveBeenCalled();
  });

  it("returns the canonical completed analysis aligned to the latest thesis when no active run exists", async () => {
    mocks.analysisFindFirst.mockResolvedValueOnce(null);
    mocks.thesisFindFirst.mockResolvedValue({
      id: "thesis_latest",
      corpusSnapshotId: "snapshot_canonical",
    });
    mocks.analysisFindMany.mockResolvedValue([
      {
        id: "analysis_old",
        dealId: "deal_1",
        status: "COMPLETED",
        type: "FULL_DD",
        mode: "full_analysis",
        thesisId: "thesis_old",
        thesisBypass: false,
        corpusSnapshotId: "snapshot_old",
        completedAgents: 16,
        totalAgents: 16,
        summary: "old",
        totalCost: null,
        totalTimeMs: 1000,
        startedAt: new Date("2026-04-19T10:00:00.000Z"),
        completedAt: new Date("2026-04-19T10:10:00.000Z"),
        createdAt: new Date("2026-04-19T10:00:00.000Z"),
      },
      {
        id: "analysis_canonical",
        dealId: "deal_1",
        status: "COMPLETED",
        type: "FULL_DD",
        mode: "full_analysis",
        thesisId: null,
        thesisBypass: false,
        corpusSnapshotId: "snapshot_canonical",
        completedAgents: 16,
        totalAgents: 16,
        summary: "canonical",
        totalCost: null,
        totalTimeMs: 1000,
        startedAt: new Date("2026-04-20T10:00:00.000Z"),
        completedAt: new Date("2026-04-20T10:10:00.000Z"),
        createdAt: new Date("2026-04-20T10:00:00.000Z"),
      },
    ]);

    const response = await GET(
      makeNextRequest(`http://localhost/api/deals/${dealId}/analyses`) as never,
      { params: Promise.resolve({ dealId }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("analysis_canonical");
  });
});
