import {
  extractTextFromPDF,
  extractTextFromPDFUrl,
  type PDFExtractionResult,
} from "@/services/pdf/extractor";

import type {
  NativePdfExtractionOutput,
  NativePdfExtractionProvider,
  NativePdfExtractionRequest,
  NativePdfUrlExtractionRequest,
  PdfProviderDescriptor,
} from "./types";

export const PDFJS_NATIVE_PROVIDER_ID = "pdfjs-native";

export const PDFJS_NATIVE_PROVIDER_DESCRIPTOR: PdfProviderDescriptor = {
  id: PDFJS_NATIVE_PROVIDER_ID,
  label: "PDF.js Native Text Extraction",
  kind: "native_text",
};

function normalizeNativeResult(raw: PDFExtractionResult): NativePdfExtractionOutput {
  return {
    provider: PDFJS_NATIVE_PROVIDER_DESCRIPTOR,
    success: raw.success,
    text: raw.text,
    pageTexts: raw.pageTexts,
    pageCount: raw.pageCount,
    metadata: {
      title: raw.info.title,
      author: raw.info.author,
      creationDate: raw.info.creationDate,
    },
    quality: raw.quality
      ? {
          score: raw.quality.metrics.qualityScore,
          metrics: raw.quality.metrics,
          warnings: raw.quality.warnings,
        }
      : undefined,
    error: raw.error,
    raw,
  };
}

export class PdfJsNativeExtractionProvider implements NativePdfExtractionProvider {
  readonly descriptor = PDFJS_NATIVE_PROVIDER_DESCRIPTOR;

  async extractFromBuffer(request: NativePdfExtractionRequest): Promise<NativePdfExtractionOutput> {
    const result = await extractTextFromPDF(request.buffer);
    return normalizeNativeResult(result);
  }

  async extractFromUrl(request: NativePdfUrlExtractionRequest): Promise<NativePdfExtractionOutput> {
    const result = await extractTextFromPDFUrl(request.url);
    return normalizeNativeResult(result);
  }
}

export function createPdfJsNativeExtractionProvider(): NativePdfExtractionProvider {
  return new PdfJsNativeExtractionProvider();
}
