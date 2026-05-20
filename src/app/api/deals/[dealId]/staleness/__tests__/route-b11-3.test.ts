/**
 * Phase B11.3 — auth + IDOR + anti-staleness-read tests for GET
 * /api/deals/[dealId]/staleness.
 *
 * Pure read on the deal's latest-analysis staleness. The IDOR guard
 * MUST fire BEFORE the staleness service runs, else a stranger could
 * probe deal ids and learn which deals have stale analyses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  isValidCuid: vi.fn(),
  getLatestAnalysisStaleness: vi.fn(),
  getUnanalyzedDocuments: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({ isValidCuid: mocks.isValidCuid }));
vi.mock("@/services/analysis-versioning", () => ({
  getLatestAnalysisStaleness: mocks.getLatestAnalysisStaleness,
  getUnanalyzedDocuments: mocks.getUnanalyzedDocuments,
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { deal: { findFirst: mocks.dealFindFirst } },
}));

const { GET } = await import("../route");

const DEAL_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeContext(dealId: string = DEAL_ID) {
  return { params: Promise.resolve({ dealId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.isValidCuid.mockReturnValue(true);
  // Anti-side-effect: staleness service MUST NOT run for non-owners.
  mocks.getLatestAnalysisStaleness.mockImplementation(() => {
    throw new Error("getLatestAnalysisStaleness called on a non-owned deal — IDOR breach");
  });
  mocks.getUnanalyzedDocuments.mockImplementation(() => {
    throw new Error("getUnanalyzedDocuments called on a non-owned deal — IDOR breach");
  });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("GET /api/deals/[id]/staleness — B11.3 auth + IDOR + anti-staleness-read", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — staleness service jamais appelé", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(
      new NextRequest(`https://x/api/deals/${DEAL_ID}/staleness`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.getLatestAnalysisStaleness).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth → 500 via handleApiError", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await GET(
      new NextRequest(`https://x/api/deals/${DEAL_ID}/staleness`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("400 on invalid CUID — staleness service never called", async () => {
    mocks.isValidCuid.mockReturnValueOnce(false);
    const res = await GET(
      new NextRequest("https://x/api/deals/not-a-cuid/staleness") as never,
      makeContext("not-a-cuid") as never
    );
    expect(res.status).toBe(400);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.getLatestAnalysisStaleness).not.toHaveBeenCalled();
  });

  it("404 uniform when the deal is not owned — staleness service NEVER fires (no info leak)", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce(null);

    const res = await GET(
      new NextRequest(`https://x/api/deals/${DEAL_ID}/staleness`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.getLatestAnalysisStaleness).not.toHaveBeenCalled();
    expect(mocks.getUnanalyzedDocuments).not.toHaveBeenCalled();
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DEAL_ID,
          userId: "user_owner",
        }),
      })
    );
  });

  it("happy path with no analysis → 200 with `hasAnalysis: false`", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce({ id: DEAL_ID });
    mocks.getLatestAnalysisStaleness.mockReset();
    mocks.getLatestAnalysisStaleness.mockResolvedValueOnce(null);

    const res = await GET(
      new NextRequest(`https://x/api/deals/${DEAL_ID}/staleness`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasAnalysis: boolean; staleness: unknown };
    expect(body.hasAnalysis).toBe(false);
    expect(body.staleness).toBeNull();
  });

  it("happy path with stale analysis → 200 + getUnanalyzedDocuments called only when isStale=true", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce({ id: DEAL_ID });
    mocks.getLatestAnalysisStaleness.mockReset();
    mocks.getLatestAnalysisStaleness.mockResolvedValueOnce({
      isStale: true,
      newDocumentCount: 2,
      message: "2 new docs since last analysis",
      analyzedDocumentIds: ["d1"],
      analysisId: "ana_1",
      analysisType: "FULL",
    });
    mocks.getUnanalyzedDocuments.mockReset();
    mocks.getUnanalyzedDocuments.mockResolvedValueOnce([
      { id: "d_new", name: "x.pdf", type: "PITCH_DECK", createdAt: "2026-05-19T00:00:00Z" },
    ]);

    const res = await GET(
      new NextRequest(`https://x/api/deals/${DEAL_ID}/staleness`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    expect(mocks.getUnanalyzedDocuments).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      hasAnalysis: boolean;
      staleness: { isStale: boolean };
      unanalyzedDocuments: unknown[];
    };
    expect(body.hasAnalysis).toBe(true);
    expect(body.staleness.isStale).toBe(true);
    expect(body.unanalyzedDocuments).toHaveLength(1);
  });
});
