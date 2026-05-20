/**
 * Phase B11.3 — auth + IDOR + anti-mutation tests for POST
 * /api/documents/[id]/extraction-decision.
 *
 * Mutation surface — creates an extraction override. The IDOR guard
 * MUST fire BEFORE `createExtractionOverride` so a cross-tenant
 * caller can't tag arbitrary runs as bypass / exclude.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  isValidCuid: vi.fn(),
  createExtractionOverride: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({ isValidCuid: mocks.isValidCuid }));
vi.mock("@/services/documents/extraction-runs", () => ({
  createExtractionOverride: mocks.createExtractionOverride,
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findFirst: mocks.documentFindFirst } },
}));

const { POST } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";
const RUN_ID = "ckbbbbbbbbbbbbbbbbbbbbbb";

function makeContext() {
  return { params: Promise.resolve({ documentId: DOC_ID }) };
}

function makeRequest(body: unknown) {
  return new Request(`https://x/api/documents/${DOC_ID}/extraction-decision`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.isValidCuid.mockReturnValue(true);
  mocks.createExtractionOverride.mockImplementation(() => {
    throw new Error("createExtractionOverride called on a non-owned doc — IDOR breach");
  });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("POST /api/documents/[id]/extraction-decision — B11.3 auth + IDOR + anti-mutation", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — no override created", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "BYPASS_PAGE", reason: "long enough reason text" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.createExtractionOverride).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth → 500 via handleApiError", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "BYPASS_PAGE", reason: "long enough reason text" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("400 on invalid CUID — no override created", async () => {
    mocks.isValidCuid.mockReturnValueOnce(false);
    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "BYPASS_PAGE", reason: "long enough reason text" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.createExtractionOverride).not.toHaveBeenCalled();
  });

  it("400 on invalid body (missing runId / short reason / unknown action) — no override created", async () => {
    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "BYPASS_PAGE", reason: "too short" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(400);
    expect(mocks.createExtractionOverride).not.toHaveBeenCalled();
  });

  it("404 uniform when the doc is not owned — no override created", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "EXCLUDE_PAGE", reason: "concrete reason text here" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.createExtractionOverride).not.toHaveBeenCalled();
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("404 when the run id does not belong to this document — no override created", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      extractionRuns: [], // no run with matching id
    });
    const res = await POST(
      makeRequest({ runId: RUN_ID, action: "BYPASS_PAGE", reason: "concrete reason text here" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.createExtractionOverride).not.toHaveBeenCalled();
  });

  it("happy path → 200 with the override row, scoped to owned doc + run", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      extractionRuns: [{ id: RUN_ID, pages: [{ pageNumber: 1 }] }],
    });
    mocks.createExtractionOverride.mockReset();
    mocks.createExtractionOverride.mockResolvedValueOnce({ id: "ov_1" });

    const res = await POST(
      makeRequest({
        runId: RUN_ID,
        action: "BYPASS_PAGE",
        pageNumber: 1,
        reason: "deliberate bypass for blank header page",
      }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    expect(mocks.createExtractionOverride).toHaveBeenCalledTimes(1);
  });
});
