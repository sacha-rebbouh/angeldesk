/**
 * Phase B11.3 — auth + IDOR tests for GET
 * /api/documents/upload/progress/[progressId].
 *
 * Progress lookup keyed by UUID (NOT CUID). Ownership is via the
 * stored `progress.userId === user.id` check (the progress row
 * carries the owner-at-write-time userId — set when the upload
 * starts). A stranger guessing a UUID gets 403 here, but the
 * payload data is NEVER returned.
 *
 * (Note: this route uses 403 vs 404 distinct because the progress
 * row is keyed by an opaque UUID, not enumerable by tenant. The
 * disclosure surface is much smaller than for document ids.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getDocumentExtractionProgress: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/documents/extraction-progress", () => ({
  getDocumentExtractionProgress: mocks.getDocumentExtractionProgress,
}));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));

const { GET } = await import("../route");

// Valid v4 UUID — the route uses `z.string().uuid()` which is
// strict about the version + variant nibbles. A non-v4 UUID is
// rejected with 400 (the zod uuid validator enforces RFC 4122).
const VALID_UUID = "12345678-1234-4234-9234-123456789012";

function makeContext(id: string = VALID_UUID) {
  return { params: Promise.resolve({ progressId: id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("GET /api/documents/upload/progress/[id] — B11.3 auth + IDOR", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — service jamais appelé", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(
      new NextRequest(`https://x/api/documents/upload/progress/${VALID_UUID}`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.getDocumentExtractionProgress).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth → 500 via handleApiError", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await GET(
      new NextRequest(`https://x/api/documents/upload/progress/${VALID_UUID}`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("400 on invalid UUID format — service never called", async () => {
    const res = await GET(
      new NextRequest("https://x/api/documents/upload/progress/not-a-uuid") as never,
      makeContext("not-a-uuid") as never
    );
    expect(res.status).toBe(400);
    expect(mocks.getDocumentExtractionProgress).not.toHaveBeenCalled();
  });

  it("returns `{ data: null }` when progress row not found (UUID space is large; not-found is opaque)", async () => {
    mocks.getDocumentExtractionProgress.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest(`https://x/api/documents/upload/progress/${VALID_UUID}`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toBeNull();
  });

  it("403 + NO PAYLOAD LEAK when progress.userId !== requesting user", async () => {
    mocks.getDocumentExtractionProgress.mockResolvedValueOnce({
      id: VALID_UUID,
      userId: "user_attacker_target",
      // The data payload is sensitive (extraction stats per page).
      // The response MUST NOT contain it on a 403.
      pagesProcessed: 3,
      pageCount: 10,
    });
    const res = await GET(
      new NextRequest(`https://x/api/documents/upload/progress/${VALID_UUID}`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data?: unknown; error?: string };
    expect(body.data).toBeUndefined();
    expect(body.error).toBe("Unauthorized");
  });

  it("happy path → 200 with the progress payload for the owner", async () => {
    mocks.getDocumentExtractionProgress.mockResolvedValueOnce({
      id: VALID_UUID,
      userId: "user_owner",
      pagesProcessed: 5,
      pageCount: 10,
    });
    const res = await GET(
      new NextRequest(`https://x/api/documents/upload/progress/${VALID_UUID}`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { pagesProcessed: number } };
    expect(body.data.pagesProcessed).toBe(5);
  });
});
