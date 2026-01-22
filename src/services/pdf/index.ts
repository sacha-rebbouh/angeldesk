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
  type OCRResult,
  type PageOCRResult
} from "./ocr-service";

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
