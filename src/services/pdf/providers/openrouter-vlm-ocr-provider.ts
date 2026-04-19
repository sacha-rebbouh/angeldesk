import type { OCRMode, PageOCRResult } from "@/services/pdf/ocr-service";

import type {
  PdfProviderDescriptor,
  VlmPageArtifactOcrOutput,
  VlmPageOcrProvider,
  VlmPageOcrRequest,
  VlmPageTextOcrOutput,
} from "./types";

export const OPENROUTER_VLM_PAGE_OCR_PROVIDER_ID = "openrouter-vlm-page-ocr";

export const OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR: PdfProviderDescriptor = {
  id: OPENROUTER_VLM_PAGE_OCR_PROVIDER_ID,
  label: "OpenRouter VLM Page OCR",
  kind: "page_ocr",
};

function normalizeArtifactResult(raw: PageOCRResult): VlmPageArtifactOcrOutput {
  return {
    provider: OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR,
    pageNumber: raw.pageNumber,
    text: raw.text,
    confidence: raw.confidence,
    hasCharts: raw.hasCharts,
    hasImages: raw.hasImages,
    processingTimeMs: raw.processingTimeMs,
    cost: raw.cost,
    mode: raw.mode ?? "high_fidelity",
    artifact: raw.artifact,
    cacheHit: "cacheHit" in raw ? (raw as PageOCRResult & { cacheHit?: boolean }).cacheHit : undefined,
    raw,
  };
}

export class OpenRouterVlmPageOcrProvider implements VlmPageOcrProvider {
  readonly descriptor = OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR;

  async extractText(request: VlmPageOcrRequest): Promise<VlmPageTextOcrOutput> {
    const { processImageOCR } = await import("@/services/pdf/ocr-service");
    const raw = await processImageOCR(request.imageBuffer, request.format);
    return {
      provider: OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR,
      pageNumber: request.pageNumber ?? 1,
      text: raw.text,
      confidence: raw.confidence,
      cost: raw.cost,
      mode: "standard",
      raw,
    };
  }

  async extractArtifact(request: VlmPageOcrRequest): Promise<VlmPageArtifactOcrOutput> {
    const { processImageArtifactOCR } = await import("@/services/pdf/ocr-service");
    const raw = await processImageArtifactOCR(
      request.imageBuffer,
      request.format,
      request.pageNumber ?? 1,
      request.mode ?? "high_fidelity"
    );
    return normalizeArtifactResult(raw);
  }
}

export function createOpenRouterVlmPageOcrProvider(): VlmPageOcrProvider {
  return new OpenRouterVlmPageOcrProvider();
}

export function getDefaultOpenRouterArtifactMode(): OCRMode {
  return "high_fidelity";
}
