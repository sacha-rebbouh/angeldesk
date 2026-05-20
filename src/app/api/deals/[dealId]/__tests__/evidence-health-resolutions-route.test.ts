/**
 * Phase B9.2 — Route handler tests for the resolutions API.
 *
 *   POST   /api/deals/[dealId]/evidence-health/resolutions
 *   DELETE /api/deals/[dealId]/evidence-health/resolutions
 *
 * Spec gates:
 *   - 401 on unauth (explicit contract, not generic 500).
 *   - 400 on invalid dealId / signalKey / action enum.
 *   - 404 on deal not owned (IDOR scoping enforced by the WHERE
 *     clause; tests assert the userId filter is present).
 *   - POST upserts on (dealId, signalKey): a second POST with a
 *     different action UPDATES the existing row (no duplicate).
 *   - DELETE is idempotent: missing row returns 200 with
 *     `{ deleted: false }`.
 *   - signalKey validation goes through parseSignalKey: unknown kinds
 *     (`missing:NOT_A_REAL_KIND`) are rejected with 400 BEFORE any
 *     DB write.
 *   - Reason > 1000 chars rejected (matches the DB cap annotation).
 *   - Rate limiting: a single user hitting > 30 POSTs/min → 429.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  resolutionUpsert: vi.fn(),
  resolutionDelete: vi.fn(),
  isValidCuid: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  handleApiError: vi.fn(),
  // B9.2.1 — bundle-binding fix-up. The POST handler now reads the
  // active bundle to reject `signal_not_active` keys before writing.
  buildDealEvidenceContext: vi.fn(),
  buildEvidenceHealthBundle: vi.fn(),
  enumerateBundleSignalKeys: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    evidenceSignalResolution: {
      upsert: mocks.resolutionUpsert,
      delete: mocks.resolutionDelete,
    },
  },
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
// `@/services/evidence` is mocked SELECTIVELY: keep the REAL
// `isValidSignalKey` (so the route's Zod refine matches what the
// pure helper accepts) but stub the bundle pipeline so each test
// controls which keys are "active". signal-identity tests already
// cover the helper contract; this route test exercises the wiring.
vi.mock("@/services/evidence", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/evidence")>();
  return {
    ...real,
    buildDealEvidenceContext: mocks.buildDealEvidenceContext,
    buildEvidenceHealthBundle: mocks.buildEvidenceHealthBundle,
    enumerateBundleSignalKeys: mocks.enumerateBundleSignalKeys,
  };
});

const { POST, DELETE } = await import("../evidence-health/resolutions/route");

const DEAL_ID = "clxxxxxxxxx00000xxxxxxxxx";
const USER_ID = "user_owner";
const VALID_KEY = "freshness:cap_table_stale:doc_42";

function makeReq(method: string, body?: unknown): NextRequest {
  return new NextRequest("https://example.test/api/deals/abc/evidence-health/resolutions", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  // mockReset (not clearAllMocks) so mockResolvedValueOnce queues
  // from a previous test never leak between cases — same pattern as
  // the B5/B6/B7 route tests.
  mocks.requireAuth.mockReset();
  mocks.dealFindFirst.mockReset();
  mocks.resolutionUpsert.mockReset();
  mocks.resolutionDelete.mockReset();
  mocks.isValidCuid.mockReset();
  mocks.checkRateLimitDistributed.mockReset();
  mocks.handleApiError.mockReset();
  mocks.buildDealEvidenceContext.mockReset();
  mocks.buildEvidenceHealthBundle.mockReset();
  mocks.enumerateBundleSignalKeys.mockReset();

  mocks.requireAuth.mockResolvedValue({ id: USER_ID });
  mocks.isValidCuid.mockReturnValue(true);
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  // Bundle pipeline default: the canonical VALID_KEY is "active" so
  // tests that don't care about the bundle-binding still upsert
  // happily. Tests that exercise the 409 path override the enum.
  mocks.buildDealEvidenceContext.mockResolvedValue({});
  mocks.buildEvidenceHealthBundle.mockReturnValue({
    report: { contradictions: [], missing: [], freshness: { countsByKind: {}, total: 0 } },
    byDocument: {},
  });
  mocks.enumerateBundleSignalKeys.mockReturnValue(new Set<string>([VALID_KEY]));
});

// ----------------------------------------------------------------
// Auth / shape gates
// ----------------------------------------------------------------

describe("auth + shape gates (POST + DELETE share them)", () => {
  it("unauth → 401 (explicit contract, not 500)", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("invalid CUID → 400 BEFORE touching the DB", async () => {
    mocks.isValidCuid.mockReturnValue(false);
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: "not-a-cuid" }),
    });
    expect(res.status).toBe(400);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.resolutionUpsert).not.toHaveBeenCalled();
  });

  it("rate-limit exceeded → 429 BEFORE touching the DB", async () => {
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: false });
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(429);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("invalid JSON body → 400", async () => {
    const req = new NextRequest("https://example.test/api/deals/abc/evidence-health/resolutions", {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------
// POST — validation + IDOR + upsert
// ----------------------------------------------------------------

describe("POST — body validation", () => {
  it("rejects missing signalKey", async () => {
    const res = await POST(makeReq("POST", { action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid signalKey (unknown kind → parseSignalKey null)", async () => {
    // Codex B9.1.1 P2 anti-tombstone: the route MUST reject before any
    // DB write. We use a real-shape but unknown-kind key.
    const res = await POST(makeReq("POST", { signalKey: "missing:NOT_A_REAL_KIND", action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.resolutionUpsert).not.toHaveBeenCalled();
  });

  it("rejects invalid action enum (only RESOLVED | IGNORED accepted)", async () => {
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "DELETED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects reason > 1000 chars (matches DB cap)", async () => {
    const res = await POST(
      makeReq("POST", { signalKey: VALID_KEY, action: "IGNORED", reason: "x".repeat(1001) }),
      { params: Promise.resolve({ dealId: DEAL_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("accepts reason = null (optional)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED", reason: null }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts reason omitted (optional)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ----------------------------------------------------------------
// B9.3.1 (Codex B9.3 P2) — server-side reason normalisation
// ----------------------------------------------------------------

describe("POST — server-side reason trim (B9.3.1, Codex B9.3 P2)", () => {
  it("RED test: whitespace-only reason ('   ') is stored as null (not '   ')", async () => {
    // Pre-fix: the UI trim was the only safeguard. A direct API
    // caller could persist `"   "` and the partition would still
    // surface a "reason" badge with empty content.
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED", reason: "   " }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: null }),
        update: expect.objectContaining({ reason: null }),
      })
    );
  });

  it("padded reason ('  hello  ') is trimmed to 'hello' before persistence", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "IGNORED",
      reason: "hello",
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "IGNORED", reason: "  hello  " }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "hello" }),
        update: expect.objectContaining({ reason: "hello" }),
      })
    );
  });

  it("non-whitespace reason is preserved verbatim", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: "uploaded the cap table",
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(
      makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED", reason: "uploaded the cap table" }),
      { params: Promise.resolve({ dealId: DEAL_ID }) }
    );
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "uploaded the cap table" }),
      })
    );
  });

  it("explicit null reason is preserved as null (no surprise transformation)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED", reason: null }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: null }),
      })
    );
  });
});

describe("POST — IDOR scoping (Codex P1 — deal-scoped)", () => {
  it("deal not owned by caller → 404 (NEVER 200, NEVER reveals existence)", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.resolutionUpsert).not.toHaveBeenCalled();
    // Anchor the IDOR filter: the WHERE clause MUST scope by userId.
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DEAL_ID, userId: USER_ID }),
      })
    );
  });

  it("cross-deal: even with a valid signalKey, upsert is scoped to the URL's dealId (composite unique)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    // The composite unique tuple MUST carry the URL's dealId. A
    // crafted client cannot redirect the write to a different deal.
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dealId_signalKey: expect.objectContaining({ dealId: DEAL_ID }),
        }),
      })
    );
  });
});

// ----------------------------------------------------------------
// B9.2.1 (Codex B9.2 P1) — POST binds to the active bundle
// ----------------------------------------------------------------

describe("POST — active-bundle binding (B9.2.1, Codex B9.2 P1)", () => {
  it("RED test: syntactically valid signalKey ABSENT from the bundle → 409 signal_not_active, NO upsert", async () => {
    // Pre-fix: the route would happily write a tombstone here, and
    // when the freshness signal eventually fired the partition
    // filter would silently mask it forever.
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.enumerateBundleSignalKeys.mockReturnValue(new Set<string>()); // no active signals
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("signal_not_active");
    expect(mocks.resolutionUpsert).not.toHaveBeenCalled();
  });

  it("signalKey present in bundle → upsert proceeds, 200", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.enumerateBundleSignalKeys.mockReturnValue(new Set<string>([VALID_KEY]));
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.resolutionUpsert).toHaveBeenCalledTimes(1);
  });

  it("bundle is built AFTER ownership check (no work for non-owners)", async () => {
    // Defensive cost guard: the bundle pipeline is non-trivial. A
    // non-owner must 404 BEFORE we pay the bundle cost.
    mocks.dealFindFirst.mockResolvedValue(null);
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.buildDealEvidenceContext).not.toHaveBeenCalled();
    expect(mocks.buildEvidenceHealthBundle).not.toHaveBeenCalled();
    expect(mocks.enumerateBundleSignalKeys).not.toHaveBeenCalled();
  });

  it("bundle pipeline is called with the URL's dealId (anti-cross-deal binding)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.enumerateBundleSignalKeys.mockReturnValue(new Set<string>([VALID_KEY]));
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.buildDealEvidenceContext).toHaveBeenCalledWith(
      expect.anything(),
      DEAL_ID
    );
  });
});

describe("DELETE — exempt from bundle binding (idempotent un-resolve)", () => {
  it("DELETE does NOT call the bundle pipeline (un-resolution doesn't require an active signal)", async () => {
    // The BA might un-resolve a row whose underlying signal has
    // already disappeared (e.g. the cap table was added, the
    // freshness signal cleared). That should still work — un-resolve
    // is a pure DB delete with no semantic gate.
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionDelete.mockResolvedValue({ id: "res_1" });
    await DELETE(makeReq("DELETE", { signalKey: VALID_KEY }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(mocks.buildDealEvidenceContext).not.toHaveBeenCalled();
    expect(mocks.enumerateBundleSignalKeys).not.toHaveBeenCalled();
  });
});

describe("POST — happy path", () => {
  it("creates a new resolution → 200 with the row data", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    const row = {
      signalKey: VALID_KEY,
      action: "RESOLVED",
      reason: "uploaded the cap table",
      userId: USER_ID,
      createdAt: new Date("2026-05-19T08:00:00Z"),
      updatedAt: new Date("2026-05-19T08:00:00Z"),
    };
    mocks.resolutionUpsert.mockResolvedValue(row);
    const res = await POST(
      makeReq("POST", { signalKey: VALID_KEY, action: "RESOLVED", reason: "uploaded the cap table" }),
      { params: Promise.resolve({ dealId: DEAL_ID }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { signalKey: string; action: string; reason: string } };
    expect(body.data.signalKey).toBe(VALID_KEY);
    expect(body.data.action).toBe("RESOLVED");
    expect(body.data.reason).toBe("uploaded the cap table");
  });

  it("upsert flow: action toggle (RESOLVED → IGNORED) replaces the row, no duplicate", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionUpsert.mockResolvedValue({
      signalKey: VALID_KEY,
      action: "IGNORED",
      reason: null,
      userId: USER_ID,
      createdAt: new Date("2026-05-18T00:00:00Z"),
      updatedAt: new Date("2026-05-19T00:00:00Z"),
    });
    await POST(makeReq("POST", { signalKey: VALID_KEY, action: "IGNORED" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    // The upsert call MUST have an UPDATE branch — the unique
    // (dealId, signalKey) is what drives the idempotency.
    expect(mocks.resolutionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dealId_signalKey: { dealId: DEAL_ID, signalKey: VALID_KEY } },
        create: expect.objectContaining({ action: "IGNORED", userId: USER_ID }),
        update: expect.objectContaining({ action: "IGNORED", userId: USER_ID }),
      })
    );
  });
});

// ----------------------------------------------------------------
// DELETE — un-resolve + idempotency
// ----------------------------------------------------------------

describe("DELETE — validation + IDOR + idempotency", () => {
  it("invalid signalKey → 400 BEFORE touching the DB", async () => {
    const res = await DELETE(makeReq("DELETE", { signalKey: "freshness:whatever:doc_x" }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.resolutionDelete).not.toHaveBeenCalled();
  });

  it("deal not owned → 404 (IDOR — userId filter)", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE", { signalKey: VALID_KEY }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.resolutionDelete).not.toHaveBeenCalled();
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DEAL_ID, userId: USER_ID }),
      })
    );
  });

  it("delete existing row → 200 { deleted: true }", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionDelete.mockResolvedValue({ id: "res_1" });
    const res = await DELETE(makeReq("DELETE", { signalKey: VALID_KEY }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(body.data.deleted).toBe(true);
    // Delete query MUST carry the dealId scope — anti-IDOR even on
    // delete (a leaked signalKey from another deal CANNOT be erased
    // here because the composite where requires THIS dealId).
    expect(mocks.resolutionDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dealId_signalKey: { dealId: DEAL_ID, signalKey: VALID_KEY } },
      })
    );
  });

  it("idempotent: deleting a missing row → 200 { deleted: false } (NOT 404, NOT 500)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    // Prisma's P2025 = record not found on delete.
    mocks.resolutionDelete.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    const res = await DELETE(makeReq("DELETE", { signalKey: VALID_KEY }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(body.data.deleted).toBe(false);
  });

  it("non-P2025 DB error → 500 (handleApiError)", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: DEAL_ID });
    mocks.resolutionDelete.mockRejectedValue(new Error("connection lost"));
    const res = await DELETE(makeReq("DELETE", { signalKey: VALID_KEY }), {
      params: Promise.resolve({ dealId: DEAL_ID }),
    });
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });
});
