/**
 * OCR Service for Image-Heavy PDFs
 *
 * Uses pdf-to-img (pure JS, no native bindings) to render PDF pages
 * as images, then sends them to a Vision LLM for text extraction.
 *
 * OPTIMIZED for cost:
 * - Selective OCR: Only processes pages with low text content
 * - Uses GPT-4o Mini (cheapest vision model)
 * - Max 20 pages per document
 *
 * Serverless-compatible: No @napi-rs/canvas or native dependencies.
 */

import { openrouter, MODELS } from "../openrouter/client";
import { getPagesNeedingOCR, analyzeExtractionQuality } from "./quality-analyzer";

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

// Use GPT-4o Mini for OCR - cheapest with vision + data privacy
const OCR_MODEL = MODELS.GPT4O_MINI;

// Maximum pages to OCR (cost control)
const MAX_PAGES_TO_OCR = 20;

// Batch size for parallel processing
const BATCH_SIZE = 3;

// Cost per page estimate (GPT-4o Mini vision)
const ESTIMATED_INPUT_TOKENS = 800;  // Image ~800 tokens
const ESTIMATED_OUTPUT_TOKENS = 300; // Text output ~300 tokens

const COST_PER_PAGE = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_MODEL.inputCost +
                      (ESTIMATED_OUTPUT_TOKENS / 1000) * OCR_MODEL.outputCost;

/**
 * Convert PDF buffer to per-page PNG images using pdf-to-img (pure JS).
 */
async function pdfToImages(buffer: Buffer): Promise<Map<number, Buffer>> {
  const { pdf } = await import("pdf-to-img");
  const images = new Map<number, Buffer>();
  let pageNum = 1;
  for await (const image of await pdf(buffer, { scale: 1.5 })) {
    images.set(pageNum, Buffer.from(image));
    pageNum++;
  }
  return images;
}

/**
 * Selective OCR - only process specific pages
 */
export async function selectiveOCR(
  buffer: Buffer,
  pageIndices: number[],  // 0-indexed page numbers to process
  existingText?: string
): Promise<OCRResult> {
  const startTime = Date.now();
  let totalCost = 0;

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
    // Render all pages as images
    const allImages = await pdfToImages(buffer);

    const pageResults: PageOCRResult[] = [];

    // Process pages in batches
    for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
      const batch = pagesToProcess.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(pageIdx => {
        const pageNum = pageIdx + 1; // convert 0-indexed to 1-indexed
        const imageBuffer = allImages.get(pageNum);
        if (!imageBuffer) {
          return Promise.resolve<PageOCRResult>({
            pageNumber: pageNum,
            text: "",
            confidence: 'low',
            hasCharts: false,
            hasImages: false,
            processingTimeMs: 0,
            cost: 0
          });
        }
        return processPageImage(imageBuffer, pageNum);
      });

      const batchResults = await Promise.all(batchPromises);
      pageResults.push(...batchResults);
      totalCost += batchResults.reduce((sum, r) => sum + r.cost, 0);
    }

    // Build final text: merge existing text with OCR results
    let finalText = existingText || "";

    const sortedResults = [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber);

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
  try {
    const allImages = await pdfToImages(buffer);
    const allPages = Array.from({ length: allImages.size }, (_, i) => i);
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
 * Process a single page image with Vision OCR
 */
async function processPageImage(
  imageBuffer: Buffer,
  pageNumber: number
): Promise<PageOCRResult> {
  const pageStart = Date.now();

  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

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

    const hasCharts = /chart|graph|%|\d+[KMB]|\$\d/i.test(extractedText);
    const hasImages = /logo|image|photo|diagram/i.test(extractedText);

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
      cost: COST_PER_PAGE
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
      cost: COST_PER_PAGE
    };
  }
}

/**
 * Smart extraction: Regular extraction + selective OCR for low-content pages
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
  let regularResult;
  try {
    const { extractTextFromPDF } = await import("./extractor");
    regularResult = await extractTextFromPDF(buffer);
  } catch (extractError) {
    console.warn("[smartExtract] Text extraction threw, treating as failure:", extractError instanceof Error ? extractError.message : extractError);
    regularResult = { success: false as const, text: "", pageCount: 0, info: {} };
  }

  if (!regularResult.success) {
    if (autoOCR) {
      try {
        const ocrResult = await extractTextWithOCR(buffer);
        const ocrQuality = ocrResult.success
          ? analyzeExtractionQuality(ocrResult.text, ocrResult.pagesProcessed || 1).metrics.qualityScore
          : 0;
        return {
          text: ocrResult.text,
          method: 'ocr',
          quality: ocrQuality,
          ocrResult,
          pagesOCRd: ocrResult.pagesProcessed,
          estimatedCost: ocrResult.totalCost
        };
      } catch (ocrError) {
        console.error("[smartExtract] OCR also failed:", ocrError instanceof Error ? ocrError.message : ocrError);
      }
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

  if (qualityScore >= qualityThreshold) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

  if (!autoOCR) {
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0
    };
  }

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

  // Re-analyze quality on the combined text (original + OCR)
  const totalPages = (regularResult.quality?.metrics.pageContentDistribution ?? []).length || 1;
  const reanalyzed = analyzeExtractionQuality(ocrResult.text, totalPages);
  const newQuality = Math.max(reanalyzed.metrics.qualityScore, qualityScore);

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
  return {
    cost: pagesWillProcess * COST_PER_PAGE,
    pagesWillProcess
  };
}
