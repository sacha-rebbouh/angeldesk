/**
 * PdfRenderer factory (ARC-LIGHT Phase 2).
 *
 * Selected by EXTRACTION_RENDERER:
 *  - "poppler" (default)  -> PopplerRenderer
 *  - "pdfjs-legacy"       -> PdfToImgRenderer (explicit rollback path)
 *
 * Any other value throws synchronously at factory time. The design refuses
 * silent fallbacks so a misconfigured runtime fails loudly instead of shipping
 * gibberish-rendering pages to downstream OCR.
 */

import { createPdfToImgRenderer, PdfToImgRenderer } from "./pdf-to-img-renderer";
import { createPopplerRenderer, PopplerRenderer } from "./poppler-renderer";
import type { PdfRenderer, PdfRendererId } from "./types";

export type { PdfRenderer, PdfRendererId, RenderOptions, RenderedPage } from "./types";
export { PopplerRenderer, createPopplerRenderer } from "./poppler-renderer";
export { PdfToImgRenderer, createPdfToImgRenderer } from "./pdf-to-img-renderer";

const VALID_IDS: readonly PdfRendererId[] = ["poppler", "pdfjs-legacy"] as const;

export function readExtractionRendererId(): PdfRendererId {
  const raw = process.env.EXTRACTION_RENDERER?.trim();
  if (!raw) return "poppler";
  if (raw === "poppler" || raw === "pdfjs-legacy") return raw;
  throw new Error(
    `[renderer-factory] Invalid EXTRACTION_RENDERER="${raw}". Allowed values: ${VALID_IDS.join(", ")}. ` +
      "Silent fallback is disabled on purpose - set a valid value or unset to default to poppler."
  );
}

export function createRenderer(): PdfRenderer {
  const id = readExtractionRendererId();
  switch (id) {
    case "poppler":
      return createPopplerRenderer();
    case "pdfjs-legacy":
      return createPdfToImgRenderer();
  }
}

/**
 * Convenience: explicit selection, bypasses env var. Used in tests.
 */
export function createRendererById(id: PdfRendererId): PdfRenderer {
  switch (id) {
    case "poppler":
      return createPopplerRenderer();
    case "pdfjs-legacy":
      return createPdfToImgRenderer();
  }
}
