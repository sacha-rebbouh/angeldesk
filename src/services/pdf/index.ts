/**
 * PDF Processing Service
 *
 * Exports all PDF-related functionality:
 * - Text extraction (unpdf)
 * - Quality analysis
 * - OCR fallback (optional, requires canvas)
 */

export {
  extractTextFromPDF,
  extractTextFromPDFUrl,
  getPdfPageCount,
  estimatePdfExtractionCost,
  type PDFExtractionResult,
  type ExtractionQualityMetrics,
  type ExtractionWarning
} from "./extractor";

export {
  analyzeExtractionQuality,
  quickOCRCheck,
  type QualityAnalysisResult
} from "./quality-analyzer";

export {
  extractTextWithOCR,
  selectiveOCR,
  smartExtract,
  estimateOCRCost,
  processImageOCR,
  detectPageSignals,
  type OCRResult,
  type PageOCRResult,
  type ExtractionManifest,
  type ExtractionPageManifest,
  type DocumentPageArtifact,
  type ExtractionCreditEstimate,
  type ExtractionTier,
  type OCRMode
} from "./ocr-service";

export {
  DOCUMENT_PAGE_ARTIFACT_V1,
  DOCUMENT_PAGE_ARTIFACT_V2,
  OPENROUTER_VLM_PROVIDER_KIND,
  OPENROUTER_VLM_PROVIDER_VERSION,
  STANDARD_OCR_PROMPT_VERSION,
  STRUCTURED_OCR_PROMPT_VERSION,
  STRUCTURED_OCR_SCHEMA_VERSION,
  buildStructuredOCRResponseFormat,
  normalizeStructuredOCRPayload,
  summarizeStructuredOCREvidence,
  type ArtifactProviderMetadata,
  type ArtifactTransport,
  type ArtifactVerificationMetadata,
  type ArtifactVerificationState,
  type DocumentPageArtifactVersion,
  type StructuredOCRChart,
  type StructuredOCRNumericClaim,
  type StructuredOCRPagePayload,
  type StructuredOCRTable,
  type StructuredOCRUnreadableRegion,
  type StructuredOCRVisualBlock,
} from "./canonical-artifact";

export * from "./providers";
export * from "./page-router";
export * from "./semantic-verifier";

export {
  getPagesNeedingOCR,
  estimateOCRCost as estimateOCRCostFromPages
} from "./quality-analyzer";

/**
 * Check if OCR is available (requires canvas package)
 */
export async function isOCRAvailable(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("canvas");
    return true;
  } catch {
    return false;
  }
}
