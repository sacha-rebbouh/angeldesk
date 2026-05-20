/**
 * Phase B11.3 — auth + IDOR + anti-token tests for POST
 * /api/documents/upload/client.
 *
 * Token-issuing surface — calls Vercel's `handleUpload` which
 * invokes the route's `onBeforeGenerateToken` callback. We mock
 * `handleUpload` to drive the callback directly; this lets us
 * verify the callback's IDOR + analysis-running + tenant-isolation
 * gates without spinning up a real Vercel Blob client.
 *
 * The callback throws `ClientUploadTokenError(status, message)` —
 * the route catches it and returns the matching JSON response.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  handleUpload: vi.fn(),
  dealFindFirst: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
  isPendingThesisReview: () => false,
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

const { POST } = await import("../route");

const DEAL_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeRequest(body: unknown = {}) {
  return new Request("https://x/api/documents/upload/client", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "rw_test_token");
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("POST /api/documents/upload/client — B11.3 auth + IDOR + anti-token", () => {
  it("501 when BLOB_READ_WRITE_TOKEN is not configured (env gate before auth)", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(501);
    // requireAuth not even called — env gate is first.
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — handleUpload jamais appelé (no token issued)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.handleUpload).not.toHaveBeenCalled();
    expect(mocks.checkRateLimitDistributed).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth → 500 via handleApiError (handleUpload jamais appelé)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
    expect(mocks.handleUpload).not.toHaveBeenCalled();
  });

  it("429 when rate limit exceeded — handleUpload (token issuer) NEVER fires", async () => {
    mocks.checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false, resetIn: 12 });
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(429);
    expect(mocks.handleUpload).not.toHaveBeenCalled();
    expect(res.headers.get("Retry-After")).toBe("12");
  });

  it("onBeforeGenerateToken: 404 when the deal is not owned by the caller — NO token issued", async () => {
    // Drive the callback path. handleUpload's onBeforeGenerateToken
    // is invoked by Vercel infra; we capture and call it directly.
    type Callback = (pathname: string, clientPayload: string) => Promise<unknown>;
    let capturedCallback: Callback | null = null;
    mocks.handleUpload.mockImplementationOnce(async (args: { onBeforeGenerateToken: Callback }) => {
      capturedCallback = args.onBeforeGenerateToken;
      return { kind: "test" };
    });
    mocks.dealFindFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }) as never);
    expect(res.status).toBe(200); // handleUpload returned success in this branch
    // Now drive the captured callback like Vercel would, with a valid
    // pathname + a JSON payload claiming a deal id.
    const payload = JSON.stringify({
      dealId: DEAL_ID,
      fileName: "deck.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    if (!capturedCallback) throw new Error("onBeforeGenerateToken was never captured");
    const cb = capturedCallback as Callback;
    await expect(
      cb(`tmp/document-uploads/${DEAL_ID}/abc`, payload)
    ).rejects.toMatchObject({
      name: "ClientUploadTokenError",
      status: 404,
    });
    // Anchor the userId scoping on the deal lookup.
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DEAL_ID,
          userId: "user_owner",
        }),
      })
    );
  });

  it("onBeforeGenerateToken: 400 when pathname is outside the declared deal's namespace (cross-tenant blob hijack guard)", async () => {
    type Callback = (pathname: string, clientPayload: string) => Promise<unknown>;
    let capturedCallback: Callback | null = null;
    mocks.handleUpload.mockImplementationOnce(async (args: { onBeforeGenerateToken: Callback }) => {
      capturedCallback = args.onBeforeGenerateToken;
      return {};
    });

    await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }) as never);

    const payload = JSON.stringify({
      dealId: DEAL_ID,
      fileName: "deck.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    // Caller declares dealId=DEAL_ID but asks for a token on a
    // DIFFERENT deal's pathname. MUST reject before the deal lookup
    // (the lookup would otherwise pass since the user DOES own
    // DEAL_ID — the breach is on the pathname mismatch).
    if (!capturedCallback) throw new Error("onBeforeGenerateToken was never captured");
    const cb = capturedCallback as Callback;
    await expect(
      cb("tmp/document-uploads/cc-victim-deal-xxxxxxxxxxxxx/abc", payload)
    ).rejects.toMatchObject({
      name: "ClientUploadTokenError",
      status: 400,
    });
    // Deal lookup MUST NOT have fired (pathname check is upstream).
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("onBeforeGenerateToken: 400 when pathname is not inside the tmp/document-uploads/ namespace", async () => {
    type Callback = (pathname: string, clientPayload: string) => Promise<unknown>;
    let capturedCallback: Callback | null = null;
    mocks.handleUpload.mockImplementationOnce(async (args: { onBeforeGenerateToken: Callback }) => {
      capturedCallback = args.onBeforeGenerateToken;
      return {};
    });
    await POST(makeRequest({}) as never);
    const payload = JSON.stringify({
      dealId: DEAL_ID,
      fileName: "deck.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    if (!capturedCallback) throw new Error("onBeforeGenerateToken was never captured");
    const cb = capturedCallback as Callback;
    await expect(
      cb("etc/passwd", payload)
    ).rejects.toMatchObject({ status: 400 });
  });
});
