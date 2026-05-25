import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 (Codex P1) — `downloadFile` in Vercel Blob mode must accept a
// PATHNAME (legacy `storagePath`-only rows) and not just a URL. Passing the
// pathname directly to `fetch()` throws "Invalid URL". The fix resolves the
// pathname to its current blob URL via `@vercel/blob.head()` first.

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  head: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
  head: mocks.head,
}));

const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
const previousVercel = process.env.VERCEL;
const previousVercelEnv = process.env.VERCEL_ENV;
process.env.BLOB_READ_WRITE_TOKEN = "blob-token-for-tests";
vi.stubGlobal("fetch", mocks.fetch);

afterAll(() => {
  if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
  vi.unstubAllGlobals();
});

const { downloadFile, uploadFile, storageConfig } = await import("../index");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "blob-token-for-tests";
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([0xab, 0xcd, 0xef]), { status: 200 })
  );
  mocks.put.mockResolvedValue({
    url: "https://blob.vercel-storage.com/deals/dx/uploaded.pdf",
    pathname: "deals/dx/uploaded.pdf",
  });
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

  it("chooses Blob storage at call time when the token is present after module import", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(storageConfig.isConfigured).toBe(false);

    process.env.BLOB_READ_WRITE_TOKEN = "blob-token-for-tests";
    const result = await uploadFile("deals/dx/uploaded.pdf", Buffer.from("pdf"));

    expect(mocks.put).toHaveBeenCalledWith(
      "deals/dx/uploaded.pdf",
      expect.any(Buffer),
      { access: "public" }
    );
    expect(result).toEqual({
      url: "https://blob.vercel-storage.com/deals/dx/uploaded.pdf",
      pathname: "deals/dx/uploaded.pdf",
    });
  });

  it("passes allowOverwrite to Blob only when requested", async () => {
    await uploadFile("analysis-results/a1.json", Buffer.from("{}"), {
      access: "public",
      allowOverwrite: true,
    });

    expect(mocks.put).toHaveBeenCalledWith(
      "analysis-results/a1.json",
      expect.any(Buffer),
      { access: "public", allowOverwrite: true }
    );
  });

  it("refuses local filesystem fallback on Vercel when the Blob token is missing", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL = "1";

    await expect(
      uploadFile("deals/dx/local-leak.pdf", Buffer.from("pdf"))
    ).rejects.toThrow(/BLOB_READ_WRITE_TOKEN is required/);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
