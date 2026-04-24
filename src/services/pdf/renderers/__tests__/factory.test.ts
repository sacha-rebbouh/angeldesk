import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createRenderer,
  createRendererById,
  readExtractionRendererId,
  PopplerRenderer,
  PdfToImgRenderer,
} from "../index";

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
    it("yields a PopplerRenderer by default", () => {
      const renderer = createRenderer();
      expect(renderer).toBeInstanceOf(PopplerRenderer);
      expect(renderer.id).toBe("poppler");
    });

    it("yields a PdfToImgRenderer when pdfjs-legacy selected", () => {
      process.env.EXTRACTION_RENDERER = "pdfjs-legacy";
      const renderer = createRenderer();
      expect(renderer).toBeInstanceOf(PdfToImgRenderer);
      expect(renderer.id).toBe("pdfjs-legacy");
    });

    it("throws on invalid env rather than falling back silently", () => {
      process.env.EXTRACTION_RENDERER = "mupdf";
      expect(() => createRenderer()).toThrow(/Invalid EXTRACTION_RENDERER/);
    });
  });

  describe("createRendererById", () => {
    it("explicitly selects poppler regardless of env", () => {
      process.env.EXTRACTION_RENDERER = "pdfjs-legacy";
      const renderer = createRendererById("poppler");
      expect(renderer.id).toBe("poppler");
    });

    it("explicitly selects pdfjs-legacy regardless of env", () => {
      process.env.EXTRACTION_RENDERER = "poppler";
      const renderer = createRendererById("pdfjs-legacy");
      expect(renderer.id).toBe("pdfjs-legacy");
    });
  });
});
