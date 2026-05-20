/**
 * Phase B11.2 — rate limit guard tests for the attachments mutation
 * surface (POST + DELETE).
 *
 * POST + DELETE share a single bucket `attachments-mutation:<userId>`
 * so a single user can't hammer both surfaces in parallel and
 * bypass the cap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  evidenceSignalFindFirst: vi.fn(),
  evidenceSignalFindMany: vi.fn(),
  evidenceSignalDeleteMany: vi.fn(),
  createEvidenceSignal: vi.fn(),
  tryDecryptJsonField: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findFirst: mocks.documentFindFirst, findUnique: vi.fn(), findMany: vi.fn() },
    evidenceSignal: {
      findFirst: mocks.evidenceSignalFindFirst,
      findMany: mocks.evidenceSignalFindMany,
      deleteMany: mocks.evidenceSignalDeleteMany,
    },
  },
}));
vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@/lib/encryption", () => ({
  tryDecryptJsonField: mocks.tryDecryptJsonField,
}));
vi.mock("@/services/evidence-signals/create-signal", () => ({
  createEvidenceSignal: mocks.createEvidenceSignal,
}));

const { POST, DELETE } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";
const EMAIL_ID = "ckbbbbbbbbbbbbbbbbbbbbbb";

function makeContext() {
  return { params: Promise.resolve({ documentId: DOC_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  mocks.tryDecryptJsonField.mockReturnValue({ kind: "absent" });
});

describe("POST + DELETE /api/documents/[id]/attachments — B11.2 rate limit", () => {
  it("POST → 429 when rate limit exceeded, BEFORE any DB lookup", async () => {
    mocks.checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false, resetIn: 30 });

    const res = await POST(
      new Request("https://x/api/documents/x/attachments", {
        method: "POST",
        body: JSON.stringify({ emailDocumentId: EMAIL_ID }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(429);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("DELETE → 429 when rate limit exceeded, BEFORE any DB lookup", async () => {
    mocks.checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false, resetIn: 15 });

    const res = await DELETE(
      new Request("https://x/api/documents/x/attachments", {
        method: "DELETE",
        body: JSON.stringify({ signalId: "ck1234567890abcdefghijkl" }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(429);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.evidenceSignalFindFirst).not.toHaveBeenCalled();
    expect(res.headers.get("Retry-After")).toBe("15");
  });

  it("POST and DELETE share the same rate-limit bucket `attachments-mutation:<userId>`", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "user_alpha" });
    mocks.documentFindFirst.mockResolvedValue(null); // 404 short-circuit (we don't care about the rest)

    await POST(
      new Request("https://x/api/documents/x/attachments", {
        method: "POST",
        body: JSON.stringify({ emailDocumentId: EMAIL_ID }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );
    await DELETE(
      new Request("https://x/api/documents/x/attachments", {
        method: "DELETE",
        body: JSON.stringify({ signalId: "ck1234567890abcdefghijkl" }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );

    // Two calls to the rate limiter, BOTH with the shared key.
    expect(mocks.checkRateLimitDistributed).toHaveBeenCalledTimes(2);
    for (const call of mocks.checkRateLimitDistributed.mock.calls) {
      expect(call[0]).toBe("attachments-mutation:user_alpha");
      expect(call[1]).toMatchObject({ maxRequests: 30, windowMs: 60_000 });
    }
  });
});
