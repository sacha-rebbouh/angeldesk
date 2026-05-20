/**
 * Phase B11.3 — auth + IDOR + anti-render tests for GET
 * /api/documents/[id]/preview-pages/[page].
 *
 * Render surface (PDF rasterization). The IDOR guard MUST fire
 * BEFORE the PDF is downloaded or rendered — else a cross-tenant
 * doc id would let an attacker pay the render cost on the victim's
 * content (and the rendered PNG would land in the response).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  downloadFile: vi.fn(),
  getPdfPageCount: vi.fn(),
  createRenderer: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/storage", () => ({ downloadFile: mocks.downloadFile }));
vi.mock("@/services/pdf/extractor", () => ({ getPdfPageCount: mocks.getPdfPageCount }));
vi.mock("@/services/pdf/renderers", () => ({ createRenderer: mocks.createRenderer }));
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
const PAGE = "3";

function makeContext(documentId: string = DOC_ID, pageNumber: string = PAGE) {
  return { params: Promise.resolve({ documentId, pageNumber }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockReset();
  mocks.documentFindFirst.mockReset();
  mocks.downloadFile.mockReset();
  mocks.getPdfPageCount.mockReset();
  mocks.createRenderer.mockReset();
  mocks.handleApiError.mockReset();

  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  // Anti-side-effect for non-owners: downloadFile + render must
  // never run. Default throws so any unguarded path surfaces in
  // the assertion above the response status check.
  mocks.downloadFile.mockImplementation(() => {
    throw new Error("downloadFile called on a non-owned PDF — IDOR breach");
  });
  mocks.createRenderer.mockImplementation(() => {
    throw new Error("createRenderer called on a non-owned PDF — IDOR breach");
  });
  mocks.handleApiError.mockImplementation(
    () => new Response(JSON.stringify({ error: "handled" }), { status: 500 })
  );
});

describe("GET /api/documents/[id]/preview-pages/[page] — B11.3 auth + IDOR + anti-render", () => {
  it("B11.3.1 — 401 explicite quand requireAuth throw `Unauthorized` — no render", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/${PAGE}`) as never, makeContext() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.createRenderer).not.toHaveBeenCalled();
  });

  it("B11.3.1 — autres erreurs auth (DB down) → 500 via handleApiError", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("ECONNREFUSED postgres"));
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/${PAGE}`) as never, makeContext() as never);
    expect(res.status).toBe(500);
    expect(mocks.handleApiError).toHaveBeenCalled();
  });

  it("400 on invalid CUID — never touches DB or render", async () => {
    const res = await GET(
      new NextRequest(`https://x/api/documents/not-a-cuid/preview-pages/${PAGE}`) as never,
      makeContext("not-a-cuid") as never
    );
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it("400 on invalid page number — never touches DB or render", async () => {
    const res = await GET(
      new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/-1`) as never,
      makeContext(DOC_ID, "-1") as never
    );
    expect(res.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it("404 uniform when the doc is not owned — RENDER NEVER fires (no PDF download, no rasterization)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/${PAGE}`) as never, makeContext() as never);
    expect(res.status).toBe(404);
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.createRenderer).not.toHaveBeenCalled();
    expect(mocks.getPdfPageCount).not.toHaveBeenCalled();
    // Anchor userId scoping.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("400 when document is not a PDF (preview is PDF-only)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      name: "spreadsheet.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storageUrl: "https://blob/x",
      storagePath: null,
    });
    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/${PAGE}`) as never, makeContext() as never);
    expect(res.status).toBe(400);
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it("happy path → 200 PNG bytes for an owned PDF in-range", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      name: "deck.pdf",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
    });
    mocks.downloadFile.mockReset();
    mocks.downloadFile.mockResolvedValueOnce(Buffer.from("PDF-BYTES"));
    mocks.getPdfPageCount.mockResolvedValueOnce(10);
    mocks.createRenderer.mockReset();
    mocks.createRenderer.mockReturnValueOnce({
      renderPage: vi.fn().mockResolvedValueOnce({ pngBuffer: Buffer.from("PNG"), bytes: 3 }),
    });

    const res = await GET(new NextRequest(`https://x/api/documents/${DOC_ID}/preview-pages/${PAGE}`) as never, makeContext() as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
