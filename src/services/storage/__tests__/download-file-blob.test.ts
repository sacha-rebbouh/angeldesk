import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 (Codex P1) — `downloadFile` in Vercel Blob mode must accept a
// PATHNAME (legacy `storagePath`-only rows) and not just a URL. Passing the
// pathname directly to `fetch()` throws "Invalid URL". The fix resolves the
// pathname to its current blob URL via `@vercel/blob.head()` first.

const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: vi.fn(),
  head: mocks.head,
}));

// The module reads `BLOB_READ_WRITE_TOKEN` at LOAD time to pick the Blob
// branch — set it BEFORE the dynamic import (a `beforeAll` would run AFTER
// the top-level `await import`, so the constant would already be `false`).
const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN = "blob-token-for-tests";
vi.stubGlobal("fetch", mocks.fetch);

afterAll(() => {
  if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  vi.unstubAllGlobals();
});

const { downloadFile } = await import("../index");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([0xab, 0xcd, 0xef]), { status: 200 })
  );
});

describe("downloadFile — Blob mode storagePath fallback", () => {
  it("resolves a PATHNAME via @vercel/blob.head() before fetching", async () => {
    mocks.head.mockResolvedValue({
      url: "https://blob.vercel-storage.com/deals/dx/abc.pdf",
      pathname: "deals/dx/abc.pdf",
    });

    const buf = await downloadFile("deals/dx/abc.pdf");

    expect(mocks.head).toHaveBeenCalledWith("deals/dx/abc.pdf");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://blob.vercel-storage.com/deals/dx/abc.pdf"
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(3);
  });

  it("does NOT call head() when the input is already an absolute URL — fetches directly", async () => {
    await downloadFile("https://blob.vercel-storage.com/deals/dx/abc.pdf");

    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://blob.vercel-storage.com/deals/dx/abc.pdf"
    );
  });

  it("accepts http:// URLs (not just https://) without resolving", async () => {
    await downloadFile("http://localhost:3000/some/blob.pdf");

    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith("http://localhost:3000/some/blob.pdf");
  });

  it("propagates a non-OK fetch as an error (no silent fallback)", async () => {
    mocks.fetch.mockResolvedValue(new Response("not found", { status: 404 }));
    mocks.head.mockResolvedValue({ url: "https://blob/x", pathname: "x" });

    await expect(downloadFile("deals/dx/missing.pdf")).rejects.toThrow(
      /Failed to download from blob: 404/
    );
  });
});
