/**
 * Phase B11.2 — IDOR test for GET /api/documents/[id]/download.
 *
 * Pre-B11.2: findFirst then 403 on cross-tenant → enumeration leak.
 * Post-B11.2: composite findFirst returning 404 uniformly + the
 * downloadFile call MUST NEVER fire for non-owners (else we'd ship
 * another tenant's bytes through the response).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  downloadFile: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/storage", () => ({ downloadFile: mocks.downloadFile }));
vi.mock("@/lib/api-error", () => ({
  handleApiError: (err: unknown) => {
    mocks.handleApiError(err);
    return new Response(JSON.stringify({ error: "handled" }), { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findFirst: mocks.documentFindFirst } },
}));

const { GET } = await import("../route");
const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.downloadFile.mockImplementation(() => {
    throw new Error("downloadFile called on a non-owned document — IDOR breach");
  });
});

describe("GET /api/documents/[id]/download — B11.2 IDOR uniformised", () => {
  it("non-owner → 404, downloadFile NEVER called (no bytes shipped)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest(`https://x/api/documents/${DOC_ID}/download`) as never,
      { params: Promise.resolve({ documentId: DOC_ID }) } as never
    );
    expect(res.status).toBe(404);
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("owner with storage → 200 with the bytes + safe Content-Disposition", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      deal: { userId: "user_owner" },
    });
    mocks.downloadFile.mockReset();
    mocks.downloadFile.mockResolvedValueOnce(Buffer.from("PDF-BYTES"));

    const res = await GET(
      new NextRequest(`https://x/api/documents/${DOC_ID}/download`) as never,
      { params: Promise.resolve({ documentId: DOC_ID }) } as never
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="deck\.pdf"$/);
  });

  it("?disposition=inline → inline content-disposition for in-browser preview", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
    });
    mocks.downloadFile.mockReset();
    mocks.downloadFile.mockResolvedValueOnce(Buffer.from("PDF-BYTES"));

    const res = await GET(
      new NextRequest(`https://x/api/documents/${DOC_ID}/download?disposition=inline`) as never,
      { params: Promise.resolve({ documentId: DOC_ID }) } as never
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline;/);
  });

  it("400 on invalid CUID — never touches DB", async () => {
    const res = await GET(
      new NextRequest(`https://x/api/documents/not-a-cuid/download`) as never,
      { params: Promise.resolve({ documentId: "not-a-cuid" }) } as never
    );
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });
});
