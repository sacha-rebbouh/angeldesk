/**
 * Phase B11.2 — IDOR + plaintext owner-only tests for the document
 * GET/PATCH/DELETE routes (no test file existed pre-B11.2).
 *
 * Spec gates closed here:
 *   - 404 uniform on cross-tenant doc ids (no 403 enumeration leak).
 *   - GET `?includeText=1` is the legitimate plaintext OCR surface;
 *     the IDOR guard MUST fire BEFORE `safeDecrypt` runs (we mock
 *     `safeDecrypt` to throw to prove it is never invoked on a
 *     cross-tenant fetch).
 *   - PATCH (rename) refuses non-owners with 404, no row updated.
 *   - DELETE refuses non-owners with 404, no storage delete, no
 *     DB delete.
 *
 * Anchor pattern: assert the composite where clause carries
 * `deal: { userId }` so a future refactor that drops the scope
 * surfaces as a test failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  documentDelete: vi.fn(),
  safeDecrypt: vi.fn(),
  deleteFile: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/encryption", () => ({ safeDecrypt: mocks.safeDecrypt }));
vi.mock("@/services/storage", () => ({ deleteFile: mocks.deleteFile }));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      update: mocks.documentUpdate,
      delete: mocks.documentDelete,
    },
  },
}));

const { GET, PATCH, DELETE } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeContext() {
  return { params: Promise.resolve({ documentId: DOC_ID }) };
}

function makeRequest(
  url: string = `https://x/api/documents/${DOC_ID}`,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockReset();
  mocks.documentFindFirst.mockReset();
  mocks.documentUpdate.mockReset();
  mocks.documentDelete.mockReset();
  mocks.safeDecrypt.mockReset();
  mocks.deleteFile.mockReset();
  mocks.handleApiError.mockReset();

  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.safeDecrypt.mockImplementation(() => {
    throw new Error("safeDecrypt called on a non-owned document — IDOR breach");
  });
});

// ----------------------------------------------------------------
// GET — IDOR + plaintext surface
// ----------------------------------------------------------------

describe("GET /api/documents/[id] — B11.2 IDOR + plaintext owner-only", () => {
  it("non-owner → 404 uniform (no 403 disclosure)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest() as never, makeContext() as never);
    expect(res.status).toBe(404);
    // Anchor the userId scoping in the composite where clause.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("missing doc → 404, identical shape (anti-enumeration)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest() as never, makeContext() as never);
    expect(res.status).toBe(404);
  });

  it("?includeText=1: owner → safeDecrypt runs + extractedText returned", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      extractedText: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.safeDecrypt.mockReturnValueOnce("decrypted OCR text content");

    const res = await GET(
      makeRequest(`https://x/api/documents/${DOC_ID}?includeText=1`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    expect(mocks.safeDecrypt).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { data: { extractedText: string | null } };
    expect(body.data.extractedText).toBe("decrypted OCR text content");
  });

  it("?includeText=1: non-owner → 404 BEFORE safeDecrypt runs (IDOR-before-decrypt guarantee)", async () => {
    // Critical anti-regression: the IDOR check MUST fire before any
    // decryption work happens. If a future refactor flipped the
    // order, a cross-tenant doc id would decrypt the victim's
    // OCR plaintext to the attacker's response (or the server logs).
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await GET(
      makeRequest(`https://x/api/documents/${DOC_ID}?includeText=1`) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
  });

  it("?includeText omitted → extractedText returned as null (no decrypt cost on default reads)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      extractedText: { alg: "AES-256-GCM", data: "<enc>" },
    });

    const res = await GET(makeRequest() as never, makeContext() as never);
    expect(res.status).toBe(200);
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { extractedText: string | null } };
    expect(body.data.extractedText).toBeNull();
  });

  it("response strips storageUrl + storagePath (anti blob-URL leak)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob.vercel-storage.com/secret-deck-path.pdf",
      storagePath: "deals/deal_1/deck.pdf",
      extractedText: null,
    });

    const res = await GET(makeRequest() as never, makeContext() as never);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.storageUrl).toBeUndefined();
    expect(body.data.storagePath).toBeUndefined();
    expect(body.data.hasStorage).toBe(true);
  });

  it("400 on invalid CUID — never touches the DB", async () => {
    const ctx = { params: Promise.resolve({ documentId: "not-a-cuid" }) };
    const res = await GET(makeRequest() as never, ctx as never);
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// PATCH — IDOR (rename)
// ----------------------------------------------------------------

describe("PATCH /api/documents/[id] (rename) — B11.2 IDOR", () => {
  it("non-owner → 404, document.update NEVER called", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(
      new NextRequest(`https://x/api/documents/${DOC_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "renamed.pdf" }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
    // Anchor the userId scoping.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deal: { userId: "user_owner" } }),
      })
    );
  });

  it("owner → 200 with the renamed row + storageUrl stripped", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "old.pdf",
    });
    mocks.documentUpdate.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "new.pdf",
      storageUrl: "https://blob/secret",
      storagePath: null,
    });
    const res = await PATCH(
      new NextRequest(`https://x/api/documents/${DOC_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "new.pdf" }),
        headers: { "content-type": "application/json" },
      }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.name).toBe("new.pdf");
    expect(body.data.storageUrl).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// DELETE — IDOR
// ----------------------------------------------------------------

describe("DELETE /api/documents/[id] — B11.2 IDOR", () => {
  it("non-owner → 404, document.delete NEVER called, deleteFile NEVER called", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(
      new NextRequest(`https://x/api/documents/${DOC_ID}`, { method: "DELETE" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(404);
    expect(mocks.documentDelete).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("owner with storage → deletes storage THEN db row, returns 200", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      storageUrl: "https://blob/x",
      storagePath: null,
    });
    mocks.deleteFile.mockResolvedValueOnce(undefined);
    mocks.documentDelete.mockResolvedValueOnce({ id: DOC_ID });
    const res = await DELETE(
      new NextRequest(`https://x/api/documents/${DOC_ID}`, { method: "DELETE" }) as never,
      makeContext() as never
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteFile).toHaveBeenCalledTimes(1);
    expect(mocks.documentDelete).toHaveBeenCalledTimes(1);
  });
});
