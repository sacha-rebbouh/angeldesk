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

import type { PdfRenderer, PdfRendererId } from "./types";

export type { PdfRenderer, PdfRendererId, RenderOptions, RenderedPage } from "./types";
export type { PopplerRenderer } from "./poppler-renderer";
export type { PdfToImgRenderer } from "./pdf-to-img-renderer";

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

export async function createRenderer(): Promise<PdfRenderer> {
  const id = readExtractionRendererId();
  return createRendererById(id);
}

/**
 * Convenience: explicit selection, bypasses env var. Used in tests.
 */
export async function createRendererById(id: PdfRendererId): Promise<PdfRenderer> {
  switch (id) {
    case "poppler": {
      const { createPopplerRenderer } = await import("./poppler-renderer");
      return createPopplerRenderer();
    }
    case "pdfjs-legacy": {
      const { createPdfToImgRenderer } = await import("./pdf-to-img-renderer");
      return createPdfToImgRenderer();
    }
  }
}
