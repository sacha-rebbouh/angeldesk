/**
 * Phase 8 — Route handler tests for GET /api/deals/[dealId]/evidence-health.
 *
 * Covers:
 *   - Unauth → 401 propagated via requireAuth throw
 *   - Invalid CUID → 400
 *   - Deal not owned → 404
 *   - Happy path → 200 with { data: { report, byDocument } }
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  isValidCuid: vi.fn(),
  buildDealEvidenceContext: vi.fn(),
  buildEvidenceHealthBundle: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({ isValidCuid: mocks.isValidCuid }));
vi.mock("@/lib/prisma", () => ({
  prisma: { deal: { findFirst: mocks.dealFindFirst } },
}));
vi.mock("@/services/evidence", () => ({
  buildDealEvidenceContext: mocks.buildDealEvidenceContext,
  buildEvidenceHealthBundle: mocks.buildEvidenceHealthBundle,
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));

const { GET } = await import("../evidence-health/route");

function makeReq(): NextRequest {
  return new NextRequest("https://example.test/api/deals/abc/evidence-health");
}

describe("GET /api/deals/[dealId]/evidence-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
  });

  it("invalid CUID → 400", async () => {
    mocks.isValidCuid.mockReturnValue(false);
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "not-a-cuid" }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid deal ID/);
  });

  it("deal not owned → 404 (IDOR protection)", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "clxxxxxxxxx00000xxxxxxxxx" }) });
    expect(res.status).toBe(404);
    // Verify the WHERE clause includes userId scoping (security guarantee)
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" }),
      })
    );
  });

  it("happy path → 200 with { data: { report, byDocument } }", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    const fakeCtx = { d1: { documentId: "d1" } };
    mocks.buildDealEvidenceContext.mockResolvedValue(fakeCtx);
    const fakeBundle = {
      report: { contradictions: [], missing: [], freshness: { countsByKind: {}, total: 0 } },
      byDocument: { d1: { contradictionCount: 0, highestContradictionSeverity: null, missing: [], freshness: [] } },
    };
    mocks.buildEvidenceHealthBundle.mockReturnValue(fakeBundle);

    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof fakeBundle };
    expect(body.data).toEqual(fakeBundle);
    // Verify the pipeline composition: buildEvidenceHealthBundle was fed the context.
    expect(mocks.buildEvidenceHealthBundle).toHaveBeenCalledWith(fakeCtx);
  });

  it("Codex round 24 P2 — unauthenticated requireAuth('Unauthorized') → 401 explicite", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    // handleApiError must NOT be invoked for auth errors — direct 401 path.
    expect(mocks.handleApiError).not.toHaveBeenCalled();
  });

  it("Codex round 24 P2 — Clerk user not found → 401 explicite (pas 500)", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Clerk user not found"));
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    expect(res.status).toBe(401);
  });

  it("erreur non-auth lors de requireAuth → 500 via handleApiError (DB down, etc.)", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("ECONNREFUSED postgres"));
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });
});
