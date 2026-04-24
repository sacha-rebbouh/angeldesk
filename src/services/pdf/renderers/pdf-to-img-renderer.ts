/**
 * Legacy pdf-to-img renderer (ARC-LIGHT Phase 2).
 *
 * Wraps the pre-ARC-LIGHT pdfjs-dist + canvas rasterization path behind the
 * PdfRenderer interface. Kept ONLY for explicit rollback via the environment
 * variable EXTRACTION_RENDERER=pdfjs-legacy. It reproduces the broken behavior
 * that originally rendered e4n page 16 as gibberish; never pick it silently.
 */

import type { PdfRenderer, RenderedPage, RenderOptions } from "./types";

const DEFAULT_DPI = 200;
const DPI_TO_SCALE = 1 / 72; // pdf-to-img scale is relative to 72 DPI units.

export class PdfToImgRenderer implements PdfRenderer {
  public readonly id = "pdfjs-legacy" as const;

  async renderPage(
    buffer: Buffer,
    pageNumber: number,
    options: RenderOptions = {}
  ): Promise<RenderedPage> {
    const dpi = options.dpi ?? DEFAULT_DPI;
    const scale = dpi * DPI_TO_SCALE;

    const start = Date.now();
    // Dynamic import keeps pdf-to-img out of the hot path in production when
    // the poppler renderer is selected. It also matches the pattern used by
    // ocr-service.ts prior to ARC-LIGHT.
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(buffer, { scale });

    if (pageNumber < 1 || pageNumber > doc.length) {
      throw new Error(
        `[PdfToImgRenderer] pageNumber ${pageNumber} out of range (doc has ${doc.length} pages)`
      );
    }

    const pngBuffer = Buffer.from(await doc.getPage(pageNumber));
    return {
      pageNumber,
      pngBuffer,
      bytes: pngBuffer.length,
      renderLatencyMs: Date.now() - start,
    };
  }

  async renderPages(
    buffer: Buffer,
    pageNumbers: number[],
    options: RenderOptions = {}
  ): Promise<RenderedPage[]> {
    const dpi = options.dpi ?? DEFAULT_DPI;
    const scale = dpi * DPI_TO_SCALE;
    const targets = new Set(pageNumbers);
    const start = Date.now();

    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(buffer, { scale });

    const results: RenderedPage[] = [];
    let pageNum = 0;
    for await (const image of doc) {
      pageNum += 1;
      if (!targets.has(pageNum)) continue;
      const pngBuffer = Buffer.from(image);
      results.push({
        pageNumber: pageNum,
        pngBuffer,
        bytes: pngBuffer.length,
        // Streaming doesn't yield per-page latency; attribute the elapsed
        // aggregate time divided evenly as a coarse metric.
        renderLatencyMs: Math.round((Date.now() - start) / Math.max(1, results.length + 1)),
      });
      if (results.length === targets.size) break;
    }

    // Keep caller-specified ordering.
    const byPage = new Map(results.map((r) => [r.pageNumber, r]));
    return pageNumbers
      .map((p) => byPage.get(p))
      .filter((r): r is RenderedPage => Boolean(r));
  }
}

export function createPdfToImgRenderer(): PdfToImgRenderer {
  return new PdfToImgRenderer();
}
