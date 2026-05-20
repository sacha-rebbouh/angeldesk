import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createRenderer,
  createRendererById,
  readExtractionRendererId,
} from "../index";
import { PdfToImgRenderer } from "../pdf-to-img-renderer";
import { PopplerRenderer } from "../poppler-renderer";

describe("renderer factory", () => {
  const original = process.env.EXTRACTION_RENDERER;

  beforeEach(() => {
    delete process.env.EXTRACTION_RENDERER;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.EXTRACTION_RENDERER;
    else process.env.EXTRACTION_RENDERER = original;
  });

  describe("readExtractionRendererId", () => {
    it("defaults to 'poppler' when env unset", () => {
      expect(readExtractionRendererId()).toBe("poppler");
    });

    it("returns 'poppler' when explicitly set", () => {
      process.env.EXTRACTION_RENDERER = "poppler";
      expect(readExtractionRendererId()).toBe("poppler");
    });

    it("returns 'pdfjs-legacy' when explicitly set", () => {
      process.env.EXTRACTION_RENDERER = "pdfjs-legacy";
      expect(readExtractionRendererId()).toBe("pdfjs-legacy");
    });

    it("throws loudly on unknown value (no silent fallback)", () => {
      process.env.EXTRACTION_RENDERER = "mupdf";
      expect(() => readExtractionRendererId()).toThrow(/Invalid EXTRACTION_RENDERER/);
    });

    it("throws on empty truthy garbage", () => {
      process.env.EXTRACTION_RENDERER = "   poppler_silly   ";
      expect(() => readExtractionRendererId()).toThrow(/Invalid EXTRACTION_RENDERER/);
    });

    it("trims whitespace around valid values", () => {
      process.env.EXTRACTION_RENDERER = " poppler ";
      // Trim is applied BEFORE validation, so " poppler " becomes valid.
      // This matches intent: ops tools sometimes add surrounding space.
      expect(readExtractionRendererId()).toBe("poppler");
    });
  });

  describe("createRenderer", () => {
    it("yields a PopplerRenderer by default", async () => {
      const renderer = await createRenderer();
      expect(renderer).toBeInstanceOf(PopplerRenderer);
      expect(renderer.id).toBe("poppler");
    });

    it("yields a PdfToImgRenderer when pdfjs-legacy selected", async () => {
      process.env.EXTRACTION_RENDERER = "pdfjs-legacy";
      const renderer = await createRenderer();
      expect(renderer).toBeInstanceOf(PdfToImgRenderer);
      expect(renderer.id).toBe("pdfjs-legacy");
    });

    it("throws on invalid env rather than falling back silently", async () => {
      process.env.EXTRACTION_RENDERER = "mupdf";
      await expect(createRenderer()).rejects.toThrow(/Invalid EXTRACTION_RENDERER/);
    });
  });

  describe("createRendererById", () => {
    it("explicitly selects poppler regardless of env", async () => {
      process.env.EXTRACTION_RENDERER = "pdfjs-legacy";
      const renderer = await createRendererById("poppler");
      expect(renderer.id).toBe("poppler");
    });

    it("explicitly selects pdfjs-legacy regardless of env", async () => {
      process.env.EXTRACTION_RENDERER = "poppler";
      const renderer = await createRendererById("pdfjs-legacy");
      expect(renderer.id).toBe("pdfjs-legacy");
    });
  });
});
