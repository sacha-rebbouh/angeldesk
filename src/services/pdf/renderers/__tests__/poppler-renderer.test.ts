import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { PopplerRenderer } from "../poppler-renderer";

const E4N_PDF = process.env.ARC_LIGHT_E2E_PDF_PATH ?? "";

// End-to-end test: only runs locally when ARC_LIGHT_E2E_PDF_PATH points to a PDF AND either
// POPPLER_BIN is set OR a system pdftoppm exists on PATH. Skipped in CI.
const canRunE2e = E4N_PDF.length > 0 && existsSync(E4N_PDF);

describe("PopplerRenderer (binary resolution)", () => {
  const originalPoppler = process.env.POPPLER_BIN;

  beforeEach(() => {
    delete process.env.POPPLER_BIN;
  });

  afterEach(() => {
    if (originalPoppler === undefined) delete process.env.POPPLER_BIN;
    else process.env.POPPLER_BIN = originalPoppler;
  });

  it("throws explicitly when no binary can be located", async () => {
    // Point the cwd at a temp dir with no bundle AND shadow PATH so `which`
    // returns no binary.
    const renderer = new PopplerRenderer({ cwd: "/tmp/arc-light-no-bin" });
    // Force system lookup to fail by pointing PATH at an empty dir. Do not
    // globally mutate process.env.PATH, scope the mutation to this test.
    const originalPath = process.env.PATH;
    process.env.PATH = "/var/empty";
    try {
      await expect(renderer.renderPage(Buffer.from("not a real pdf"), 1)).rejects.toThrow(
        /pdftoppm not found/
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects pageNumber < 1 before spawning anything", async () => {
    const renderer = new PopplerRenderer();
    await expect(renderer.renderPage(Buffer.from(""), 0)).rejects.toThrow(/invalid pageNumber/);
    await expect(renderer.renderPage(Buffer.from(""), -3)).rejects.toThrow(/invalid pageNumber/);
  });

  it("rejects non-integer pageNumber", async () => {
    const renderer = new PopplerRenderer();
    await expect(renderer.renderPage(Buffer.from(""), 1.5)).rejects.toThrow(/invalid pageNumber/);
  });
});

describe.skipIf(!canRunE2e)("PopplerRenderer (e2e on e4n)", () => {
  it(
    "renders e4n page 16 to a PNG with non-trivial size",
    async () => {
      const pdf = await readFile(E4N_PDF);
      const renderer = new PopplerRenderer();
      const rendered = await renderer.renderPage(pdf, 16, { dpi: 200 });
      expect(rendered.pageNumber).toBe(16);
      expect(rendered.bytes).toBeGreaterThan(20_000);
      expect(rendered.pngBuffer.slice(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
      expect(rendered.renderLatencyMs).toBeGreaterThan(0);
    },
    30_000
  );

  it(
    "renders pages 16/21/31 in batch preserving order",
    async () => {
      const pdf = await readFile(E4N_PDF);
      const renderer = new PopplerRenderer();
      const pages = await renderer.renderPages(pdf, [16, 21, 31], { dpi: 200 });
      expect(pages.map((p) => p.pageNumber)).toEqual([16, 21, 31]);
      for (const p of pages) {
        expect(p.bytes).toBeGreaterThan(20_000);
      }
    },
    90_000
  );
});
