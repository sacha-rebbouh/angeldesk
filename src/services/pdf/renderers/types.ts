/**
 * PDF renderer abstraction (ARC-LIGHT Phase 2).
 *
 * A PdfRenderer rasterizes PDF pages to PNG buffers. Two implementations:
 *  - Poppler (primary): subprocess call to the vendored pdftoppm binary.
 *  - pdf-to-img (legacy): the broken pdfjs-dist + canvas path, kept behind
 *    EXTRACTION_RENDERER=pdfjs-legacy for rollback only.
 */

export type PdfRendererId = "poppler" | "pdfjs-legacy";

export interface RenderOptions {
  /**
   * Target render resolution in dots per inch. Spike validated 200 DPI as the
   * minimum that produces OCR-lisible output on the e4n deck across pages
   * 16 / 21 / 31.
   */
  dpi?: number;
}

export interface RenderedPage {
  pageNumber: number;
  pngBuffer: Buffer;
  bytes: number;
  renderLatencyMs: number;
}

export interface PdfRenderer {
  readonly id: PdfRendererId;
  /**
   * Render one page of the PDF. Returns the PNG buffer plus metrics.
   */
  renderPage(buffer: Buffer, pageNumber: number, options?: RenderOptions): Promise<RenderedPage>;
  /**
   * Render a batch of pages. Implementations MAY parallelize or stream,
   * but must preserve per-page ordering in the returned array.
   */
  renderPages(buffer: Buffer, pageNumbers: number[], options?: RenderOptions): Promise<RenderedPage[]>;
}
