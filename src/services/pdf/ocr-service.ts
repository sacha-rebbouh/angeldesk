/**
 * OCR Service for Image-Heavy PDFs
 *
 * Uses Vision LLMs to extract text from PDF pages that contain
 * images, charts, or non-selectable text.
 *
 * OPTIMIZED for cost:
 * - Selective OCR: Only processes pages with low text content
 * - Uses Claude Haiku (cheapest vision model)
 * - Max 20 pages per document
 *
 * NOTE: Requires 'canvas' package for image rendering.
 * Install with: npm install canvas
 */

import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { openrouter, MODELS } from "../openrouter/client";
import { getPagesNeedingOCR } from "./quality-analyzer";

// Check if canvas is available
let canvasAvailable = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let canvasModule: any = null;

async function checkCanvasAvailability(): Promise<boolean> {
  if (canvasAvailable) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    canvasModule = require("canvas");
    canvasAvailable = true;
    return true;
  } catch {
    console.warn("Canvas not available - OCR features disabled. Install with: npm install canvas");
    return false;
  }
}

export interface OCRResult {
  success: boolean;
  text: string;
  pageResults: PageOCRResult[];
  pagesProcessed: number;
  pagesSkipped: number;
  totalCost: number;
  processingTimeMs: number;
  error?: string;
}

export interface PageOCRResult {
  pageNumber: number;
  text: string;
  confidence: 'high' | 'medium' | 'low';
  hasCharts: boolean;
  hasImages: boolean;
  processingTimeMs: number;
  cost: number;
}

// Use Haiku for OCR - cheapest vision model with good quality
const OCR_MODEL = MODELS.HAIKU;

// Maximum pages to OCR (cost control)
const MAX_PAGES_TO_OCR = 20;

// Batch size for parallel processing
const BATCH_SIZE = 3;

// Cost per page estimate (Haiku vision)
const ESTIMATED_INPUT_TOKENS = 800;  // Image ~800 tokens
const ESTIMATED_OUTPUT_TOKENS = 300; // Text output ~300 tokens

/**
 * Selective OCR - only process specific pages
 * This is the main function to use for cost-efficient OCR
 */
export async function selectiveOCR(
  buffer: Buffer,
  pageIndices: number[],  // 0-indexed page numbers to process
  existingText?: string
): Promise<OCRResult> {
  const startTime = Date.now();
  let totalCost = 0;

  // Check canvas availability
  const hasCanvas = await checkCanvasAvailability();
  if (!hasCanvas) {
    return {
      success: false,
      text: existingText || "",
      pageResults: [],
      pagesProcessed: 0,
      pagesSkipped: pageIndices.length,
      totalCost: 0,
      processingTimeMs: Date.now() - startTime,
      error: "OCR unavailable: canvas package not installed"
    };
  }

  // Limit pages
  const pagesToProcess = pageIndices.slice(0, MAX_PAGES_TO_OCR);
  const pagesSkipped = pageIndices.length - pagesToProcess.length;

  if (pagesToProcess.length === 0) {
    return {
      success: true,
      text: existingText || "",
      pageResults: [],
      pagesProcessed: 0,
      pagesSkipped: 0,
      totalCost: 0,
      processingTimeMs: Date.now() - startTime
    };
  }

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const pageResults: PageOCRResult[] = [];

    // Process pages in batches
    for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
      const batch = pagesToProcess.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(pageIdx =>
        processPage(pdf, pageIdx + 1) // unpdf uses 1-indexed pages
      );

      const batchResults = await Promise.all(batchPromises);
      pageResults.push(...batchResults);
      totalCost += batchResults.reduce((sum, r) => sum + r.cost, 0);
    }

    // Build final text: merge existing text with OCR results
    let finalText = existingText || "";

    // Sort results by page number
    const sortedResults = [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber);

    // Append OCR text
    if (sortedResults.length > 0) {
      const ocrText = sortedResults
        .filter(r => r.text.length > 0)
        .map(r => `[Page ${r.pageNumber} - OCR]\n${r.text}`)
        .join('\n\n');

      if (ocrText) {
        finalText = finalText
          ? `${finalText}\n\n--- OCR Extracted Content ---\n\n${ocrText}`
          : ocrText;
      }
    }

    return {
      success: true,
      text: finalText,
      pageResults: sortedResults,
      pagesProcessed: pagesToProcess.length,
      pagesSkipped,
      totalCost,
      processingTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.error("Selective OCR error:", error);
    return {
      success: false,
      text: existingText || "",
      pageResults: [],
      pagesProcessed: 0,
      pagesSkipped: pageIndices.length,
      totalCost,
      processingTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown OCR error"
    };
  }
}

/**
 * Full OCR - process all pages (expensive, use sparingly)
 */
export async function extractTextWithOCR(buffer: Buffer): Promise<OCRResult> {
  const hasCanvas = await checkCanvasAvailability();
  if (!hasCanvas) {
    return {
      success: false,
      text: "",
      pageResults: [],
      pagesProcessed: 0,
      pagesSkipped: 0,
      totalCost: 0,
      processingTimeMs: 0,
      error: "OCR unavailable: canvas package not installed"
    };
  }

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const allPages = Array.from({ length: pdf.numPages }, (_, i) => i);
    return selectiveOCR(buffer, allPages);
  } catch (error) {
    return {
      success: false,
      text: "",
      pageResults: [],
      pagesProcessed: 0,
      pagesSkipped: 0,
      totalCost: 0,
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Process a single page with Vision OCR
 */
async function processPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number  // 1-indexed
): Promise<PageOCRResult> {
  const pageStart = Date.now();
  const costPerPage = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_MODEL.inputCost +
                      (ESTIMATED_OUTPUT_TOKENS / 1000) * OCR_MODEL.outputCost;

  try {
    if (!canvasModule) {
      throw new Error("Canvas not available");
    }

    // Render page as PNG image
    const imageResult = await renderPageAsImage(pdf, pageNumber, {
      canvasImport: () => Promise.resolve(canvasModule),
      scale: 1.5,
    });

    if (!imageResult) {
      return {
        pageNumber,
        text: "",
        confidence: 'low',
        hasCharts: false,
        hasImages: false,
        processingTimeMs: Date.now() - pageStart,
        cost: 0
      };
    }

    // Convert to base64
    const base64Image = Buffer.from(imageResult).toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    // Call Vision API with Haiku
    const response = await openrouter.chat.completions.create({
      model: OCR_MODEL.id,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl }
            },
            {
              type: "text",
              text: `Extract ALL text from this slide. Include:
- Headings and titles
- Body text and bullet points
- Numbers, metrics, data points
- Chart/graph labels and values
- Diagram text

Output clean text only, no commentary.`
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0
    });

    const extractedText = response.choices[0]?.message?.content || "";

    // Detect content types
    const hasCharts = /chart|graph|%|\d+[KMB]|\$\d/i.test(extractedText);
    const hasImages = /logo|image|photo|diagram/i.test(extractedText);

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (extractedText.length > 150) {
      confidence = 'high';
    } else if (extractedText.length < 30) {
      confidence = 'low';
    }

    return {
      pageNumber,
      text: extractedText.trim(),
      confidence,
      hasCharts,
      hasImages,
      processingTimeMs: Date.now() - pageStart,
      cost: costPerPage
    };
  } catch (error) {
    console.error(`OCR error on page ${pageNumber}:`, error);
    return {
      pageNumber,
      text: "",
      confidence: 'low',
      hasCharts: false,
      hasImages: false,
      processingTimeMs: Date.now() - pageStart,
      cost: costPerPage // Still charge for failed attempt
    };
  }
}

/**
 * Smart extraction: Regular extraction + selective OCR for low-content pages
 * This is the recommended function for automatic processing
 */
export async function smartExtract(
  buffer: Buffer,
  options: {
    qualityThreshold?: number;
    maxOCRPages?: number;
    autoOCR?: boolean;
  } = {}
): Promise<{
  text: string;
  method: 'text' | 'ocr' | 'hybrid';
  quality: number;
  ocrResult?: OCRResult;
  pagesOCRd: number;
  estimatedCost: number;
}> {
  const {
    qualityThreshold = 40,
    maxOCRPages = MAX_PAGES_TO_OCR,
    autoOCR = true
  } = options;

  // First try regular text extraction
  const { extractTextFromPDF } = await import("./extractor");
  const regularResult = await extractTextFromPDF(buffer);

  if (!regularResult.success) {
    // Complete failure - try full OCR if enabled
    if (autoOCR) {
      const ocrResult = await extractTextWithOCR(buffer);
      return {
        text: ocrResult.text,
        method: 'ocr',
        quality: ocrResult.success ? 60 : 0,
        ocrResult,
        pagesOCRd: ocrResult.pagesProcessed,
        estimatedCost: ocrResult.totalCost
      };
    }
    return {
      text: "",
      method: 'text',
      quality: 0,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

  const qualityScore = regularResult.quality?.metrics.qualityScore ?? 0;
  const pageDistribution = regularResult.quality?.metrics.pageContentDistribution ?? [];

  // Good quality - no OCR needed
  if (qualityScore >= qualityThreshold) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

  // Poor quality - do selective OCR if enabled
  if (!autoOCR) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

  // Get pages that need OCR (limited)
  const pagesToOCR = getPagesNeedingOCR(pageDistribution, maxOCRPages);

  if (pagesToOCR.length === 0) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

  // Run selective OCR
  const ocrResult = await selectiveOCR(buffer, pagesToOCR, regularResult.text);

  if (!ocrResult.success || ocrResult.pagesProcessed === 0) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: ocrResult.totalCost
    };
  }

  // Calculate improved quality score
  const ocrBonus = Math.min(ocrResult.pagesProcessed * 2, 20);
  const newQuality = Math.min(qualityScore + ocrBonus, 75);

  return {
    text: ocrResult.text,
    method: 'hybrid',
    quality: newQuality,
    ocrResult,
    pagesOCRd: ocrResult.pagesProcessed,
    estimatedCost: ocrResult.totalCost
  };
}

/**
 * Estimate OCR cost without running OCR
 */
export function estimateOCRCost(pageCount: number): {
  cost: number;
  pagesWillProcess: number;
} {
  const pagesWillProcess = Math.min(pageCount, MAX_PAGES_TO_OCR);
  const costPerPage = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_MODEL.inputCost +
                      (ESTIMATED_OUTPUT_TOKENS / 1000) * OCR_MODEL.outputCost;
  return {
    cost: pagesWillProcess * costPerPage,
    pagesWillProcess
  };
}
