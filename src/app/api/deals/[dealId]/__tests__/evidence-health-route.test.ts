/**
 * Phase 8 — Route handler tests for GET /api/deals/[dealId]/evidence-health.
 *
 * Covers:
 *   - Unauth → 401 propagated via requireAuth throw
 *   - Invalid CUID → 400
 *   - Deal not owned → 404
 *   - Happy path → 200 with { data: { report, byDocument, resolved, ignored } }
 *
 * Phase B9.3 — the route now applies `partitionBundleByResolutions`
 * server-side so the bundle returned is the ACTIVE subset and the
 * payload carries resolved/ignored entries.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  resolutionFindMany: vi.fn(),
  isValidCuid: vi.fn(),
  buildDealEvidenceContext: vi.fn(),
  buildEvidenceHealthBundle: vi.fn(),
  partitionBundleByResolutions: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({ isValidCuid: mocks.isValidCuid }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    evidenceSignalResolution: { findMany: mocks.resolutionFindMany },
  },
}));
vi.mock("@/services/evidence", () => ({
  buildDealEvidenceContext: mocks.buildDealEvidenceContext,
  buildEvidenceHealthBundle: mocks.buildEvidenceHealthBundle,
  partitionBundleByResolutions: mocks.partitionBundleByResolutions,
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
    mocks.resolutionFindMany.mockResolvedValue([]);
    // Default partition pass-through: no resolutions → active bundle = input bundle.
    mocks.partitionBundleByResolutions.mockImplementation((bundle: unknown) => ({
      active: bundle,
      resolved: [],
      ignored: [],
    }));
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

  it("happy path → 200 with { data: { report, byDocument, resolved, ignored } } (B9.3 partition applied)", async () => {
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
    const body = (await res.json()) as {
      data: { report: unknown; byDocument: unknown; resolved: unknown[]; ignored: unknown[] };
    };
    // B9.3 — the route returns the ACTIVE bundle at the top level
    // (report / byDocument) plus the user's overlay (resolved /
    // ignored). With no resolutions, the pass-through partition mock
    // returns the input bundle as active.
    expect(body.data.report).toEqual(fakeBundle.report);
    expect(body.data.byDocument).toEqual(fakeBundle.byDocument);
    expect(body.data.resolved).toEqual([]);
    expect(body.data.ignored).toEqual([]);
    // Verify the pipeline composition: buildEvidenceHealthBundle was fed the context.
    expect(mocks.buildEvidenceHealthBundle).toHaveBeenCalledWith(fakeCtx);
    // B9.3 — partition was called with the bundle + the loaded resolutions.
    expect(mocks.partitionBundleByResolutions).toHaveBeenCalledWith(fakeBundle, []);
  });

  it("B9.3 — loads resolutions scoped to dealId (IDOR-safe — no userId filter needed; FK enforces)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    mocks.buildDealEvidenceContext.mockResolvedValue({});
    mocks.buildEvidenceHealthBundle.mockReturnValue({
      report: { contradictions: [], missing: [], freshness: { countsByKind: {}, total: 0 } },
      byDocument: {},
    });
    await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    // The route MUST scope the resolutions read by dealId — a leaked
    // signalKey from another deal CANNOT pollute this read because
    // the composite unique keys resolution rows under THIS deal.
    expect(mocks.resolutionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dealId: "deal_1" } })
    );
  });

  it("B9.3 — resolved/ignored entries from partition are surfaced to the client", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    mocks.buildDealEvidenceContext.mockResolvedValue({});
    mocks.buildEvidenceHealthBundle.mockReturnValue({
      report: { contradictions: [], missing: [], freshness: { countsByKind: {}, total: 0 } },
      byDocument: {},
    });
    const fakeResolved = [{ kind: "freshness", signalKey: "freshness:cap_table_stale:d_a", action: "RESOLVED" }];
    const fakeIgnored = [{ kind: "contradiction", signalKey: "contradiction:METRIC_MISMATCH:CA:2025:abc", action: "IGNORED" }];
    mocks.partitionBundleByResolutions.mockReturnValue({
      active: {
        report: { contradictions: [], missing: [], freshness: { countsByKind: {}, total: 0 } },
        byDocument: {},
      },
      resolved: fakeResolved,
      ignored: fakeIgnored,
    });
    const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
    const body = (await res.json()) as {
      data: { resolved: typeof fakeResolved; ignored: typeof fakeIgnored };
    };
    expect(body.data.resolved).toEqual(fakeResolved);
    expect(body.data.ignored).toEqual(fakeIgnored);
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

  // ============================================================
  // B13 P1 — EvidenceSignalResolution migration pending
  // ============================================================
  describe("B13 P1 — graceful fallback when EvidenceSignalResolution table is missing (P2021)", () => {
    it("`P2021` from resolution findMany → 200 with empty resolved/ignored, panel renders active signals", async () => {
      // The B12.1.1 audit caught this: if the EvidenceSignalResolution
      // migration hasn't been applied yet, the whole panel breaks even
      // for users with no resolutions. The route must render the
      // active bundle while swallowing only the specific table-missing
      // code.
      const p2021Error = Object.assign(
        new Error("The table EvidenceSignalResolution does not exist in the current database."),
        { code: "P2021" }
      );
      mocks.resolutionFindMany.mockRejectedValueOnce(p2021Error);

      const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { resolved: unknown[]; ignored: unknown[]; report: unknown; byDocument: unknown };
      };
      // Overlay is empty (no rows could be loaded), but the active
      // bundle is still shipped so the panel renders.
      expect(body.data.resolved).toEqual([]);
      expect(body.data.ignored).toEqual([]);
      expect(body.data.report).toBeDefined();
      expect(body.data.byDocument).toBeDefined();
      // Sanity: handleApiError NEVER fires (we don't bubble up).
      expect(mocks.handleApiError).not.toHaveBeenCalled();
    });

    it("a DB error WITHOUT P2021 code (e.g. connection lost) bubbles up to 500 — we do NOT swallow", async () => {
      // The graceful fallback must be SCOPED to the migration-pending
      // case. Real DB errors (network drop, auth failure) must still
      // 500 so ops gets paged.
      const connectionError = Object.assign(new Error("Connection lost"), { code: "P1001" });
      mocks.resolutionFindMany.mockRejectedValueOnce(connectionError);

      const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
      expect(res.status).toBe(500);
      expect(mocks.handleApiError).toHaveBeenCalled();
    });

    it("a non-Prisma error from resolution findMany also bubbles up (defense)", async () => {
      // No `code` property at all = not Prisma. Treat as a real bug
      // surface, not migration-pending.
      mocks.resolutionFindMany.mockRejectedValueOnce(new Error("unexpected boom"));

      const res = await GET(makeReq(), { params: Promise.resolve({ dealId: "deal_1" }) });
      expect(res.status).toBe(500);
      expect(mocks.handleApiError).toHaveBeenCalled();
    });
  });
});
