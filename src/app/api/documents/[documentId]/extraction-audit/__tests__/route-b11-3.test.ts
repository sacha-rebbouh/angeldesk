/**
 * Phase B11.3 — auth + IDOR + anti-decrypt tests for GET
 * /api/documents/[id]/extraction-audit.
 *
 * This endpoint is the legitimate plaintext OCR audit surface
 * (decrypts extractedText + textPreview + artifact for the audit
 * dialog). Anti-regression: the IDOR guard MUST fire BEFORE any
 * decryption runs, else a cross-tenant doc id would hand back the
 * victim's OCR plaintext.
 *
 * Pattern: same as B11.2 (no new infra).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  safeDecrypt: vi.fn(),
  safeDecryptJsonField: vi.fn(),
  tryDecryptJsonField: vi.fn(),
  handleApiError: vi.fn(),
}));

// B11.3.1 — mock only `requireAuth` on @/lib/auth; the route
// imports `authenticateOrUnauthorized` from @/lib/auth-helpers
// which calls our mocked requireAuth through a real cross-module
// import (vi.mock would NOT propagate a same-module call — hence
// the extraction).
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/encryption", () => ({
  safeDecrypt: mocks.safeDecrypt,
  safeDecryptJsonField: mocks.safeDecryptJsonField,
  tryDecryptJsonField: mocks.tryDecryptJsonField,
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
// Service deps surfaced lazily inside the route (not invoked when
// the doc isn't fetched, so a no-op mock is fine here).
vi.mock("@/services/documents/extraction-runs", () => ({
  calculateArtifactCompleteness: () => ({ score: 100, expectedVisualBlocks: 0, extractedVisualBlocks: 0, missing: [] }),
  getBlockingPageNumbersFromStoredPages: () => [],
}));

const { GET } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeContext(documentId: string = DOC_ID) {
  return { params: Promise.resolve({ documentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockReset();
  mocks.documentFindFirst.mockReset();
  mocks.safeDecrypt.mockReset();
  mocks.safeDecryptJsonField.mockReset();
  mocks.tryDecryptJsonField.mockReset();
  mocks.handleApiError.mockReset();

  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  // Anti-side-effect: ANY decrypt invocation in a non-owner scenario
  // is a real IDOR breach. The mocks throw so the route can't even
  // pretend it didn't notice.
  mocks.safeDecrypt.mockImplementation(() => {
    throw new Error("safeDecrypt called on a non-owned document — IDOR breach");
  });
  mocks.safeDecryptJsonField.mockImplementation(() => {
    throw new Error("safeDecryptJsonField called on a non-owned document — IDOR breach");
  });
  mocks.tryDecryptJsonField.mockImplementation(() => {
    throw new Error("tryDecryptJsonField called on a non-owned document — IDOR breach");
  });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("GET /api/documents/[id]/extraction-audit — B11.3 auth + IDOR + anti-decrypt", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` (anti 500-as-auth-leak)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.handleApiError).not.toHaveBeenCalled();
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
  });

  it("B11.3.1 — 401 explicite quand requireAuth throw `Clerk user not found`", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Clerk user not found"));
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(401);
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth (DB down, etc.) → 500 via handleApiError (l'observabilité reste)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("400 on invalid CUID — never touches DB or decrypt", async () => {
    const res = await GET(
      new NextRequest("https://x/api/documents/not-a-cuid/extraction-audit") as never,
      makeContext("not-a-cuid") as never
    );
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
  });

  it("404 uniform when the doc is not owned — DECRYPT NEVER fires (anti plaintext leak)", async () => {
    // Composite findFirst returns null for cross-tenant doc ids.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(404);
    // The whole point of B11.3 on this surface: no decryption work
    // happens on a cross-tenant fetch.
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
    expect(mocks.safeDecryptJsonField).not.toHaveBeenCalled();
    expect(mocks.tryDecryptJsonField).not.toHaveBeenCalled();
    // Anchor the userId scoping in the composite where.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("404 uniform when the doc does not exist (same shape as not-owned — anti-enumeration)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(404);
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
  });

  it("happy path → 200, safeDecrypt fires for the owned doc's extractedText", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      name: "deck.pdf",
      type: "PITCH_DECK",
      mimeType: "application/pdf",
      processingStatus: "COMPLETED",
      extractionQuality: 90,
      extractionMetrics: null,
      extractionWarnings: null,
      requiresOCR: false,
      ocrProcessed: false,
      extractedText: { alg: "AES-256-GCM", data: "<enc>" },
      extractionRuns: [],
    });
    // Owner path → decryption is legitimate; replace the throw-default
    // with a real return so the response shape resolves.
    mocks.safeDecrypt.mockReset();
    mocks.safeDecrypt.mockReturnValueOnce("decrypted OCR text");

    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/extraction-audit`) as never, makeContext() as never);
    expect(res.status).toBe(200);
    expect(mocks.safeDecrypt).toHaveBeenCalled();
    const body = (await res.json()) as { data: { corpus: { text: string } } };
    expect(body.data.corpus.text).toBe("decrypted OCR text");
  });
});
