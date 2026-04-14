/**
 * OCR Service for Image-Heavy PDFs
 *
 * Uses pdf-to-img (pure JS, no native bindings) to render PDF pages
 * as images, then sends them to a Vision LLM for text extraction.
 *
 * OPTIMIZED for cost in normal mode, strict in analysis-gating mode:
 * - Selective OCR: Only processes pages with low text content
 * - Uses GPT-4o Mini (cheapest vision model)
 * - Strict callers may explicitly remove page caps for full document coverage
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
  mode?: OCRMode;
}

export type ExtractionTier = 'native_only' | 'standard_ocr' | 'high_fidelity' | 'supreme';

export interface ExtractionPageManifest {
  pageNumber: number;
  status: 'ready' | 'ready_with_warnings' | 'needs_review' | 'failed' | 'skipped';
  method: 'native_text' | 'ocr' | 'hybrid' | 'skipped';
  charCount: number;
  wordCount: number;
  qualityScore: number;
  hasTables: boolean;
  hasCharts: boolean;
  hasFinancialKeywords: boolean;
  hasTeamKeywords: boolean;
  hasMarketKeywords: boolean;
  requiresOCR: boolean;
  ocrProcessed: boolean;
  extractionTier: ExtractionTier;
  visualRiskScore: number;
  visualRiskReasons: string[];
  error?: string;
}

export interface ExtractionManifest {
  version: "strict-pdf-v1";
  status: 'ready' | 'ready_with_warnings' | 'needs_review' | 'failed';
  pageCount: number;
  pagesProcessed: number;
  pagesSucceeded: number;
  pagesFailed: number;
  pagesSkipped: number;
  coverageRatio: number;
  textPages: number;
  ocrPages: number;
  hybridPages: number;
  failedPages: number[];
  skippedPages: number[];
  criticalPages: number[];
  hardBlockers: Array<{ code: string; message: string; pageNumber?: number }>;
  creditEstimate: ExtractionCreditEstimate;
  pages: ExtractionPageManifest[];
  completedAt: string;
}

export interface ExtractionCreditEstimate {
  estimatedCredits: number;
  estimatedUsd: number;
  pagesByTier: Record<ExtractionTier, number>;
  unitCredits: Record<ExtractionTier, number>;
  unitUsd: Record<ExtractionTier, number>;
}

// Use GPT-4o Mini for OCR - cheapest with vision + data privacy
const OCR_MODEL = MODELS.GPT4O_MINI;
const OCR_HIGH_FIDELITY_MODEL = MODELS.GPT4O;

const OCR_REQUEST_TIMEOUT_MS = 90_000;
const OCR_MAX_RETRIES = 1;
const OCR_RETRY_BASE_DELAY_MS = 750;

// Maximum pages to OCR (cost control) - increased from 20 for better coverage
const MAX_PAGES_TO_OCR = 30;

/** Dynamic OCR page limit based on document type */
export function getMaxOCRPages(documentType?: string): number {
  switch (documentType) {
    case 'FINANCIAL_MODEL':
    case 'FINANCIAL_STATEMENTS':
      return 40;
    case 'PITCH_DECK':
      return 30;
    default:
      return MAX_PAGES_TO_OCR;
  }
}

// Batch size for parallel processing
const BATCH_SIZE = 3;

// Cost per page estimate (GPT-4o Mini vision)
const ESTIMATED_INPUT_TOKENS = 800;  // Image ~800 tokens
const ESTIMATED_OUTPUT_TOKENS = 300; // Text output ~300 tokens

const COST_PER_PAGE = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_MODEL.inputCost +
                      (ESTIMATED_OUTPUT_TOKENS / 1000) * OCR_MODEL.outputCost;

const HIGH_FIDELITY_COST_PER_PAGE = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_HIGH_FIDELITY_MODEL.inputCost +
                                    (1200 / 1000) * OCR_HIGH_FIDELITY_MODEL.outputCost;

const SUPREME_COST_PER_PAGE = (ESTIMATED_INPUT_TOKENS / 1000) * OCR_HIGH_FIDELITY_MODEL.inputCost +
                              (3000 / 1000) * OCR_HIGH_FIDELITY_MODEL.outputCost;

const EXTRACTION_CREDIT_UNITS: Record<ExtractionTier, number> = {
  native_only: 0,
  standard_ocr: 0,
  high_fidelity: 1,
  supreme: 2,
};

const EXTRACTION_USD_UNITS: Record<ExtractionTier, number> = {
  native_only: 0,
  standard_ocr: COST_PER_PAGE,
  high_fidelity: HIGH_FIDELITY_COST_PER_PAGE,
  supreme: SUPREME_COST_PER_PAGE,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOpenRouterError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }

    if (/timeout|timed out|fetch failed/i.test(error.message)) {
      return true;
    }
  }

  const typedError = error as { status?: number; code?: string } | null;
  if (!typedError) {
    return false;
  }

  if (typeof typedError.status === "number") {
    return typedError.status === 429 || typedError.status >= 500;
  }

  if (typeof typedError.code === "string") {
    return ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(typedError.code);
  }

  return false;
}

export type OCRMode = "standard" | "high_fidelity" | "supreme";

function buildOCRPrompt(mode: OCRMode): string {
  if (mode === "supreme") {
    return `You are performing supreme-quality investment document OCR for a visually dense PDF page.

Your job is to preserve decision-critical information, not to summarize.

Rules:
- Identify every visual block on the page: tables, bar charts, line charts, area charts, scatter/bubble charts, pie/donut charts, heatmaps, waterfall charts, cohort tables, funnels, timelines, roadmaps, org charts, flowcharts, cap tables, KPI cards, maps, screenshots, footnotes and sources.
- For each visual block, extract title, type, axes, legends, colors/series, row/column labels, periods, units, values, visible annotations and footnotes.
- For stacked/grouped charts, extract each segment or group when visible and preserve the color/legend mapping.
- For dense tables, reconstruct a markdown table. If a cell is not readable, write [UNREADABLE] in that cell.
- Preserve page reading order and keep independent visual blocks separate.
- Do not invent numbers, labels, currencies, percentages, names, periods or sources.
- If exact chart values are not printed and cannot be read from the axis, describe the trend and mark values as [UNREADABLE].

Output format:
## Page text
<all visible non-visual text>

## Visual inventory
- Count:
- Blocks:

## Visual blocks
### Block 1: <title/location>
- Type:
- Analytical importance:
- Labels / legend:
- Values:
- Notes / source:
- Extraction confidence: high | medium | low

Repeat for every visual block.`;
  }

  if (mode === "high_fidelity") {
    return `You are doing high-stakes investment document OCR.

Extract every visible piece of useful information from this PDF page for investment due diligence.

Rules:
- Preserve headings, bullets, labels, footnotes and small text.
- Reconstruct tables as markdown tables when possible.
- For every chart, identify the chart title, chart type, axis labels, legend labels, visible values, trend direction, annotations and any caption.
- For bar charts, extract each visible bar label and value. If bars are stacked, extract each visible segment, color/legend mapping, and total when visible.
- For line charts, extract each visible series, period label and value when visible.
- For diagrams, preserve nodes, arrows, formulas, inputs and outputs in reading order.
- Keep separate sections for each visual block on the page instead of merging all text into one paragraph.
- If a chart/table is visual and exact values are not readable, describe what is visibly knowable and explicitly mark unreadable values as [UNREADABLE].
- Do not summarize away numbers.
- Do not invent missing numbers, names, dates, percentages, currencies, or labels.
- If the page is mostly decorative and contains no decision-useful content, output the visible text and then [NO_DECISION_USEFUL_CONTENT].

Output format:
## Page text
<all visible normal text>

## Visual blocks
### Visual 1: <title or location>
- Type:
- Labels:
- Values:
- Notes:

Repeat for every chart, table, diagram or KPI block.`;
  }

  return `Extract ALL text from this slide. Include:
- Headings and titles
- Body text and bullet points
- Numbers, metrics, data points
- Chart/graph labels and values
- Diagram text

Output clean text only, no commentary.`;
}

async function generateOCRText(dataUrl: string, mode: OCRMode): Promise<string> {
  let lastError: unknown = null;
  const model = mode === "standard" ? OCR_MODEL : OCR_HIGH_FIDELITY_MODEL;

  for (let attempt = 0; attempt <= OCR_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OCR_REQUEST_TIMEOUT_MS);

    try {
      const response = await openrouter.chat.completions.create(
        {
          model: model.id,
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
                  text: buildOCRPrompt(mode)
                }
              ]
            }
          ],
          max_tokens: mode === "supreme" ? 6500 : mode === "high_fidelity" ? 4500 : 1600,
          temperature: 0
        },
        {
          signal: controller.signal,
          maxRetries: 0
        }
      );

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      lastError = error;

      if (attempt === OCR_MAX_RETRIES || !isRetryableOpenRouterError(error)) {
        throw error;
      }

      await sleep(OCR_RETRY_BASE_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown OCR error");
}

/**
 * Render only selected PDF pages and OCR them in small batches.
 */
async function processSelectedPdfPages(
  buffer: Buffer,
  pagesToProcess: number[],
  options: { mode?: OCRMode; scale?: number } = {}
): Promise<PageOCRResult[]> {
  const { pdf } = await import("pdf-to-img");
  const targetPages = new Set(pagesToProcess.map(pageIdx => pageIdx + 1));
  const mode = options.mode ?? "standard";
  const scale = options.scale ?? 1.5;
  const pageResults: PageOCRResult[] = [];
  let batch: Array<{ pageNum: number; imageBuffer: Buffer }> = [];
  let pageNum = 1;

  for await (const image of await pdf(buffer, { scale })) {
    if (targetPages.has(pageNum)) {
      batch.push({ pageNum, imageBuffer: Buffer.from(image) });

      if (batch.length >= BATCH_SIZE) {
        pageResults.push(...await Promise.all(
          batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
        ));
        batch = [];
      }

      if (pageResults.length + batch.length >= targetPages.size) {
        break;
      }
    }

    pageNum++;
  }

  if (batch.length > 0) {
    pageResults.push(...await Promise.all(
      batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
    ));
  }

  return pageResults;
}

async function processAllPdfPages(buffer: Buffer, options: { mode?: OCRMode; scale?: number } = {}): Promise<PageOCRResult[]> {
  const { pdf } = await import("pdf-to-img");
  const mode = options.mode ?? "standard";
  const scale = options.scale ?? 1.5;
  const pageResults: PageOCRResult[] = [];
  let batch: Array<{ pageNum: number; imageBuffer: Buffer }> = [];
  let pageNum = 1;

  for await (const image of await pdf(buffer, { scale })) {
    batch.push({ pageNum, imageBuffer: Buffer.from(image) });

    if (batch.length >= BATCH_SIZE) {
      pageResults.push(...await Promise.all(
        batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
      ));
      batch = [];
    }

    pageNum++;
  }

  if (batch.length > 0) {
    pageResults.push(...await Promise.all(
      batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
    ));
  }

  return pageResults;
}

/**
 * Selective OCR - only process specific pages
 */
export async function selectiveOCR(
  buffer: Buffer,
  pageIndices: number[],  // 0-indexed page numbers to process
  existingText?: string,
  options: { maxPages?: number; mode?: OCRMode; scale?: number } = {}
): Promise<OCRResult> {
  const startTime = Date.now();
  let totalCost = 0;

  const maxPages = options.maxPages ?? MAX_PAGES_TO_OCR;
  const pagesToProcess = Number.isFinite(maxPages)
    ? pageIndices.slice(0, maxPages)
    : pageIndices;
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
    const pageResults = await processSelectedPdfPages(buffer, pagesToProcess, {
      mode: options.mode,
      scale: options.scale,
    });
    totalCost += pageResults.reduce((sum, r) => sum + r.cost, 0);

    const sortedResults = [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber);
    const finalText = composeOCRText(existingText, sortedResults);

    return {
      success: true,
      text: finalText,
      pageResults: sortedResults,
      pagesProcessed: sortedResults.length,
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

export async function retryPdfPageOCR(
  buffer: Buffer,
  pageNumber: number,
  mode: Extract<OCRMode, "high_fidelity" | "supreme"> = "supreme"
): Promise<PageOCRResult> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("Invalid page number");
  }

  const results = await processSelectedPdfPages(buffer, [pageNumber - 1], {
    mode,
    scale: mode === "supreme" ? 3 : 2.5,
  });
  const result = results[0];
  if (!result) {
    throw new Error(`Page ${pageNumber} could not be rendered for OCR retry`);
  }
  return result;
}

/**
 * Full OCR - process all pages (expensive, use sparingly)
 */
export async function extractTextWithOCR(buffer: Buffer, options: { maxPages?: number } = {}): Promise<OCRResult> {
  try {
    if (options.maxPages !== undefined && !Number.isFinite(options.maxPages)) {
      const startTime = Date.now();
      const pageResults = await processAllPdfPages(buffer);
      const sortedResults = [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber);
      const text = composeOCRText(undefined, sortedResults);

      return {
        success: sortedResults.length > 0,
        text,
        pageResults: sortedResults,
        pagesProcessed: sortedResults.length,
        pagesSkipped: 0,
        totalCost: sortedResults.reduce((sum, result) => sum + result.cost, 0),
        processingTimeMs: Date.now() - startTime,
      };
    }

    const pageLimit = options.maxPages ?? MAX_PAGES_TO_OCR;
    const allPages = Array.from({ length: pageLimit }, (_, i) => i);
    return selectiveOCR(buffer, allPages, undefined, { maxPages: pageLimit });
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
  pageNumber: number,
  mode: OCRMode = "standard"
): Promise<PageOCRResult> {
  const pageStart = Date.now();

  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    const extractedText = await generateOCRText(dataUrl, mode);

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
      cost: mode === "supreme"
        ? SUPREME_COST_PER_PAGE
        : mode === "high_fidelity"
          ? HIGH_FIDELITY_COST_PER_PAGE
          : COST_PER_PAGE,
      mode,
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
      cost: mode === "supreme"
        ? SUPREME_COST_PER_PAGE
        : mode === "high_fidelity"
          ? HIGH_FIDELITY_COST_PER_PAGE
          : COST_PER_PAGE,
      mode,
    };
  }
}

function composeOCRText(existingText: string | undefined, pageResults: PageOCRResult[]): string {
  const sortedResults = [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber);
  const ocrText = sortedResults
    .filter((result) => result.text.length > 0)
    .map((result) => `[Page ${result.pageNumber} - ${formatOCRModeLabel(result.mode)}]\n${result.text}`)
    .join("\n\n");

  if (!ocrText) return existingText || "";
  return existingText ? `${existingText}\n\n--- OCR Extracted Content ---\n\n${ocrText}` : ocrText;
}

function formatOCRModeLabel(mode: OCRMode | undefined): string {
  if (mode === "supreme") return "Supreme OCR";
  if (mode === "high_fidelity") return "High-fidelity OCR";
  return "OCR";
}

function mergeOCRResults(params: {
  original: OCRResult;
  retry: OCRResult;
  existingText: string;
}): OCRResult {
  const resultsByPage = new Map<number, PageOCRResult>();
  for (const result of params.original.pageResults) {
    resultsByPage.set(result.pageNumber, result);
  }

  for (const retryResult of params.retry.pageResults) {
    const existing = resultsByPage.get(retryResult.pageNumber);
    if (!existing || retryResult.text.length >= existing.text.length || retryResult.confidence !== "low") {
      resultsByPage.set(retryResult.pageNumber, retryResult);
    }
  }

  const pageResults = [...resultsByPage.values()].sort((a, b) => a.pageNumber - b.pageNumber);
  return {
    success: params.original.success || params.retry.success,
    text: composeOCRText(params.existingText, pageResults),
    pageResults,
    pagesProcessed: pageResults.length,
    pagesSkipped: params.original.pagesSkipped + params.retry.pagesSkipped,
    totalCost: params.original.totalCost + params.retry.totalCost,
    processingTimeMs: params.original.processingTimeMs + params.retry.processingTimeMs,
    error: params.retry.error ?? params.original.error,
  };
}

async function runVisualOCRPlan(
  buffer: Buffer,
  pageIndices: number[],
  existingText: string | undefined,
  visualPlan: VisualExtractionPlanPage[]
): Promise<OCRResult> {
  const uniquePages = [...new Set(pageIndices)];
  const supremePages = uniquePages.filter((pageIndex) => (
    visualPlan.find((page) => page.pageIndex === pageIndex)?.tier === "supreme"
  ));
  const highFidelityPages = uniquePages.filter((pageIndex) => !supremePages.includes(pageIndex));

  const emptyResult: OCRResult = {
    success: true,
    text: existingText ?? "",
    pageResults: [],
    pagesProcessed: 0,
    pagesSkipped: 0,
    totalCost: 0,
    processingTimeMs: 0,
  };

  const results: OCRResult[] = [];
  if (highFidelityPages.length > 0) {
    results.push(await selectiveOCR(buffer, highFidelityPages, existingText, {
      maxPages: Number.POSITIVE_INFINITY,
      mode: "high_fidelity",
      scale: 2.5,
    }));
  }
  if (supremePages.length > 0) {
    results.push(await selectiveOCR(buffer, supremePages, existingText, {
      maxPages: Number.POSITIVE_INFINITY,
      mode: "supreme",
      scale: 3,
    }));
  }

  return results.reduce((combined, current) => mergeOCRResults({
    original: combined,
    retry: current,
    existingText: existingText ?? "",
  }), emptyResult);
}

/**
 * Process a standalone image (JPEG/PNG) with Vision OCR.
 * Reuses the same Vision LLM pipeline as PDF page OCR.
 */
export async function processImageOCR(
  imageBuffer: Buffer,
  format: "jpeg" | "png"
): Promise<{ text: string; confidence: "high" | "medium" | "low"; cost: number }> {
  const base64Image = imageBuffer.toString("base64");
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const text = (await generateOCRText(dataUrl, "standard")).trim();
  let confidence: "high" | "medium" | "low" = "medium";
  if (text.length > 200) confidence = "high";
  else if (text.length < 30) confidence = "low";

  return { text, confidence, cost: COST_PER_PAGE };
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
    strict?: boolean;
  } = {}
): Promise<{
  text: string;
  method: 'text' | 'ocr' | 'hybrid';
  quality: number;
  ocrResult?: OCRResult;
  pagesOCRd: number;
  estimatedCost: number;
  manifest: ExtractionManifest;
}> {
  const {
    qualityThreshold = 40,
    maxOCRPages = MAX_PAGES_TO_OCR,
    autoOCR = true,
    strict = false
  } = options;

  // First try regular text extraction
  let regularResult;
  try {
    const { extractTextFromPDF } = await import("./extractor");
    regularResult = await extractTextFromPDF(buffer);
  } catch (extractError) {
    console.warn("[smartExtract] Text extraction threw, treating as failure:", extractError instanceof Error ? extractError.message : extractError);
    regularResult = { success: false as const, text: "", pageTexts: [], pageCount: 0, info: {} };
  }

  if (!regularResult.success) {
    if (autoOCR) {
      try {
        const ocrResult = await extractTextWithOCR(buffer, { maxPages: strict ? Number.POSITIVE_INFINITY : maxOCRPages });
        const ocrQuality = ocrResult.success
          ? analyzeExtractionQuality(ocrResult.text, ocrResult.pagesProcessed || 1).metrics.qualityScore
          : 0;
        const manifest = buildExtractionManifest({
          pageCount: ocrResult.pagesProcessed,
          pageTexts: [],
          ocrResult,
          method: 'ocr',
          qualityScore: ocrQuality,
          pagesRequestedForOCR: ocrResult.pageResults.map((page) => page.pageNumber - 1),
        });
        return {
          text: ocrResult.text,
          method: 'ocr',
          quality: ocrQuality,
          ocrResult,
          pagesOCRd: ocrResult.pagesProcessed,
          estimatedCost: ocrResult.totalCost,
          manifest
        };
      } catch (ocrError) {
        console.error("[smartExtract] OCR also failed:", ocrError instanceof Error ? ocrError.message : ocrError);
      }
    }
    const manifest = buildExtractionManifest({
      pageCount: 0,
      pageTexts: [],
      method: 'text',
      qualityScore: 0,
      pagesRequestedForOCR: [],
      hardBlockers: [{ code: "PDF_EXTRACTION_FAILED", message: "Native PDF text extraction and OCR failed" }],
    });
    return {
      text: "",
      method: 'text',
      quality: 0,
      pagesOCRd: 0,
      estimatedCost: 0,
      manifest
    };
  }

  const qualityScore = regularResult.quality?.metrics.qualityScore ?? 0;
  const pageDistribution = regularResult.pageTexts?.length
    ? regularResult.pageTexts.map((pageText) => pageText.length)
    : regularResult.quality?.metrics.pageContentDistribution ?? [];

  if (qualityScore >= qualityThreshold && !strict) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      pagesRequestedForOCR: [],
    });
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0,
      manifest
    };
  }

  if (!autoOCR) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      pagesRequestedForOCR: [],
    });
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0,
      manifest
    };
  }

  const pagesToOCR = getPagesNeedingOCR(
    pageDistribution,
    maxOCRPages,
    regularResult.text  // Pass existing text for keyword-based prioritization
  );

  if (pagesToOCR.length === 0) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      pagesRequestedForOCR: [],
    });

    if (strict) {
      const visualPlan = getVisualExtractionPlan(regularResult.pageTexts ?? []);
      const highFidelityPages = visualPlan
        .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
        .map((page) => page.pageIndex);

      if (highFidelityPages.length > 0) {
        const ocrResult = await runVisualOCRPlan(buffer, highFidelityPages, regularResult.text, visualPlan);
        const hybridManifest = buildExtractionManifest({
          pageCount: regularResult.pageCount,
          pageTexts: regularResult.pageTexts ?? [],
          method: "hybrid",
          qualityScore,
          ocrResult,
          pagesRequestedForOCR: highFidelityPages,
        });
        return {
          text: ocrResult.text,
          method: "hybrid",
          quality: qualityScore,
          ocrResult,
          pagesOCRd: ocrResult.pagesProcessed,
          estimatedCost: ocrResult.totalCost,
          manifest: hybridManifest,
        };
      }
    }

    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: 0,
      manifest
    };
  }

  let ocrResult = await selectiveOCR(buffer, pagesToOCR, regularResult.text, { maxPages: maxOCRPages });

  if (!ocrResult.success || ocrResult.pagesProcessed === 0) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      ocrResult,
      pagesRequestedForOCR: pagesToOCR,
    });
    return {
      text: regularResult.text,
      method: 'text',
      quality: qualityScore,
      pagesOCRd: 0,
      estimatedCost: ocrResult.totalCost,
      manifest
    };
  }

  // Re-analyze quality on the combined text (original + OCR)
  const totalPages = (regularResult.quality?.metrics.pageContentDistribution ?? []).length || 1;
  const reanalyzed = analyzeExtractionQuality(ocrResult.text, totalPages);
  const newQuality = Math.max(reanalyzed.metrics.qualityScore, qualityScore);
  let manifest = buildExtractionManifest({
    pageCount: regularResult.pageCount,
    pageTexts: regularResult.pageTexts ?? [],
    method: 'hybrid',
    qualityScore: newQuality,
    ocrResult,
    pagesRequestedForOCR: pagesToOCR,
  });

  if (strict) {
    const visualPlan = getVisualExtractionPlan(regularResult.pageTexts ?? []);
    const highFidelityCandidatePages = visualPlan
      .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
      .map((page) => page.pageIndex);
    const secondPassPages = [...new Set([
      ...highFidelityCandidatePages,
      ...(
      manifest.pages
        .filter((page) => (
          page.status === "needs_review" ||
          page.status === "failed"
        ))
        .map((page) => page.pageNumber - 1)
      ),
    ])];

    if (secondPassPages.length > 0) {
      const secondPass = await runVisualOCRPlan(buffer, secondPassPages, undefined, visualPlan);
      ocrResult = mergeOCRResults({
        original: ocrResult,
        retry: secondPass,
        existingText: regularResult.text,
      });
      manifest = buildExtractionManifest({
        pageCount: regularResult.pageCount,
        pageTexts: regularResult.pageTexts ?? [],
        method: "hybrid",
        qualityScore: newQuality,
        ocrResult,
        pagesRequestedForOCR: [...new Set([...pagesToOCR, ...secondPassPages])],
      });
    }
  }

  return {
    text: ocrResult.text,
    method: 'hybrid',
    quality: newQuality,
    ocrResult,
    pagesOCRd: ocrResult.pagesProcessed,
    estimatedCost: ocrResult.totalCost,
    manifest
  };
}

function buildExtractionManifest(params: {
  pageCount: number;
  pageTexts: string[];
  method: 'text' | 'ocr' | 'hybrid';
  qualityScore: number;
  pagesRequestedForOCR: number[];
  ocrResult?: OCRResult;
  hardBlockers?: Array<{ code: string; message: string; pageNumber?: number }>;
}): ExtractionManifest {
  const ocrByPage = new Map(
    (params.ocrResult?.pageResults ?? []).map((page) => [page.pageNumber, page])
  );
  const requestedOCRPages = new Set(params.pagesRequestedForOCR.map((idx) => idx + 1));
  const hardBlockers = [...(params.hardBlockers ?? [])];
  const pages: ExtractionPageManifest[] = [];
  const pageCount = Math.max(params.pageCount, params.pageTexts.length, ocrByPage.size);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const nativeText = params.pageTexts[pageNumber - 1] ?? "";
    const ocr = ocrByPage.get(pageNumber);
    const combinedText = `${nativeText}\n${ocr?.text ?? ""}`.trim();
    const charCount = combinedText.length;
    const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
    const isEdgePage = pageNumber === 1 || pageNumber === pageCount;
    const flags = detectPageSignals(combinedText, { isEdgePage });
    const nativeFlags = detectPageSignals(nativeText, { isEdgePage });
    const visualRisk = scoreVisualExtractionRisk(nativeText || combinedText, nativeFlags);
    const plannedTier = chooseExtractionTier(nativeText, nativeFlags, visualRisk.score);
    const requiresOCR = nativeText.length < 300 || flags.hasTables || flags.hasCharts;
    const ocrRequested = requestedOCRPages.has(pageNumber);
    const ocrProcessed = Boolean(ocr);
    const extractionTier = ocr?.mode === "supreme"
      ? "supreme"
      : ocr?.mode === "high_fidelity"
        ? "high_fidelity"
        : ocrProcessed
          ? "standard_ocr"
          : plannedTier;
    const qualityScore = scorePageQuality(charCount, flags);
    const hasDomainCriticalSignals = flags.hasFinancialKeywords || flags.hasTeamKeywords || flags.hasMarketKeywords;
    const hasVisualExtractionRisk = flags.hasTables || flags.hasCharts;

    let status: ExtractionPageManifest["status"] = "ready";
    let method: ExtractionPageManifest["method"] = ocrProcessed
      ? (nativeText.length > 0 ? "hybrid" : "ocr")
      : "native_text";
    let error: string | undefined;

    if (ocrRequested && !ocrProcessed) {
      status = hasDomainCriticalSignals ? "failed" : "needs_review";
      method = "skipped";
      error = "OCR was required but did not complete for this page";
    } else if (charCount < 40) {
      status = hasDomainCriticalSignals ? "failed" : "needs_review";
      error = "Very little text was extracted from this page";
    } else if (qualityScore < 55 || ocr?.confidence === "low") {
      status = hasDomainCriticalSignals || (hasVisualExtractionRisk && !ocrProcessed)
        ? "needs_review"
        : "ready_with_warnings";
      error = ocr?.confidence === "low"
        ? "OCR confidence is low"
        : hasVisualExtractionRisk
          ? "Visual/table-like page extracted with limited text"
          : "Low page extraction quality";
    }

    if (status === "failed" && hasDomainCriticalSignals) {
      hardBlockers.push({
        code: "CRITICAL_PAGE_UNREADABLE",
        pageNumber,
        message: `Page ${pageNumber} is critical and could not be extracted reliably`,
      });
    }

    pages.push({
      pageNumber,
      status,
      method,
      charCount,
      wordCount,
      qualityScore,
      ...flags,
      requiresOCR,
      ocrProcessed,
      extractionTier,
      visualRiskScore: visualRisk.score,
      visualRiskReasons: visualRisk.reasons,
      error,
    });
  }

  const failedPages = pages.filter((page) => page.status === "failed").map((page) => page.pageNumber);
  const skippedPages = pages.filter((page) => page.status === "skipped").map((page) => page.pageNumber);
  const criticalPages = pages
    .filter((page) => page.hasFinancialKeywords || page.hasTeamKeywords || page.hasMarketKeywords || page.hasTables)
    .map((page) => page.pageNumber);
  const pagesSucceeded = pages.filter((page) => page.status === "ready" || page.status === "ready_with_warnings").length;
  const pagesFailed = failedPages.length;
  const pagesSkipped = skippedPages.length;
  const pagesProcessed = pages.length - pagesSkipped;
  const coverageRatio = pageCount > 0 ? pagesProcessed / pageCount : 0;

  let status: ExtractionManifest["status"] = "ready";
  if (hardBlockers.length > 0 || coverageRatio < 1) {
    status = "failed";
  } else if (pages.some((page) => page.status === "needs_review")) {
    status = "needs_review";
  } else if (pages.some((page) => page.status === "ready_with_warnings")) {
    status = "ready_with_warnings";
  }

  return {
    version: "strict-pdf-v1",
    status,
    pageCount,
    pagesProcessed,
    pagesSucceeded,
    pagesFailed,
    pagesSkipped,
    coverageRatio,
    textPages: pages.filter((page) => page.method === "native_text").length,
    ocrPages: pages.filter((page) => page.method === "ocr").length,
    hybridPages: pages.filter((page) => page.method === "hybrid").length,
    failedPages,
    skippedPages,
    criticalPages,
    hardBlockers,
    creditEstimate: estimateExtractionCredits(pages),
    pages,
    completedAt: new Date().toISOString(),
  };
}

function detectPageSignals(text: string, options: { isEdgePage?: boolean } = {}): Pick<
  ExtractionPageManifest,
  "hasTables" | "hasCharts" | "hasFinancialKeywords" | "hasTeamKeywords" | "hasMarketKeywords"
> {
  const lower = text.toLowerCase();
  const numberMatches = text.match(/\d+([.,]\d+)?\s?(%|€|eur|k€|m€|m|k|x)?/gi) ?? [];
  const hasTables = /\|/.test(text) || (!options.isEdgePage && numberMatches.length >= 8);
  const hasCharts = /chart|graph|diagram|courbe|graphique|histogram|axis|axe/i.test(text);
  const hasFinancialKeywords = /\b(arr|mrr|revenue|ca|chiffre d'affaires|burn|runway|ebitda|gross margin|marge|ltv|cac|churn|nrr|valuation|valorisation|cap table|dilution|funding|levée|levee|pré-money|pre-money|post-money)\b/i.test(lower);
  const hasTeamKeywords = /\b(team|équipe|equipe|founder|fondateur|ceo|cto|coo|cfo|advisor|conseiller|linkedin)\b/i.test(lower);
  const hasMarketKeywords = /\b(tam|sam|som|market|marché|marche|cagr|segmentation|concurrence|competition|competitor)\b/i.test(lower);

  return { hasTables, hasCharts, hasFinancialKeywords, hasTeamKeywords, hasMarketKeywords };
}

function scorePageQuality(charCount: number, flags: ReturnType<typeof detectPageSignals>): number {
  let score = charCount >= 700 ? 90 : charCount >= 300 ? 75 : charCount >= 120 ? 55 : charCount >= 40 ? 35 : 10;
  if ((flags.hasTables || flags.hasCharts) && charCount < 300) score -= 20;
  if ((flags.hasFinancialKeywords || flags.hasTeamKeywords || flags.hasMarketKeywords) && charCount < 120) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function estimateExtractionCredits(pages: ExtractionPageManifest[]): ExtractionCreditEstimate {
  const pagesByTier: Record<ExtractionTier, number> = {
    native_only: 0,
    standard_ocr: 0,
    high_fidelity: 0,
    supreme: 0,
  };

  for (const page of pages) {
    pagesByTier[page.extractionTier] += 1;
  }

  const estimatedCredits = Object.entries(pagesByTier).reduce(
    (sum, [tier, count]) => sum + EXTRACTION_CREDIT_UNITS[tier as ExtractionTier] * count,
    0
  );
  const estimatedUsd = Object.entries(pagesByTier).reduce(
    (sum, [tier, count]) => sum + EXTRACTION_USD_UNITS[tier as ExtractionTier] * count,
    0
  );

  return {
    estimatedCredits,
    estimatedUsd,
    pagesByTier,
    unitCredits: EXTRACTION_CREDIT_UNITS,
    unitUsd: EXTRACTION_USD_UNITS,
  };
}

export function getHighFidelityVisualPageIndices(pageTexts: string[]): number[] {
  return getVisualExtractionPlan(pageTexts)
    .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
    .map((page) => page.pageIndex);
}

interface VisualExtractionPlanPage {
  pageIndex: number;
  pageNumber: number;
  tier: ExtractionTier;
  visualRiskScore: number;
  visualRiskReasons: string[];
}

export function getVisualExtractionPlan(pageTexts: string[]): VisualExtractionPlanPage[] {
  const pageCount = pageTexts.length;
  return pageTexts.map((nativeText, index) => {
    const flags = detectPageSignals(nativeText, {
      isEdgePage: index === 0 || index === pageCount - 1,
    });
    const risk = scoreVisualExtractionRisk(nativeText, flags);
    return {
      pageIndex: index,
      pageNumber: index + 1,
      tier: chooseExtractionTier(nativeText, flags, risk.score),
      visualRiskScore: risk.score,
      visualRiskReasons: risk.reasons,
    };
  });
}

function chooseExtractionTier(
  nativeText: string,
  flags: ReturnType<typeof detectPageSignals>,
  visualRiskScore: number
): ExtractionTier {
  if (nativeText.length < 80) return "standard_ocr";
  if (visualRiskScore >= 85) return "supreme";
  if (visualRiskScore >= 55) return "high_fidelity";
  if (nativeText.length < 300 || flags.hasTables || flags.hasCharts) return "standard_ocr";
  return "native_only";
}

function scoreVisualExtractionRisk(
  text: string,
  flags: ReturnType<typeof detectPageSignals>
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const numberMatches = text.match(/\d+([.,]\d+)?\s?(%|€|eur|k€|m€|m|k|x)?/gi) ?? [];
  const percentMatches = text.match(/\d+([.,]\d+)?\s?%/g) ?? [];
  const chartLanguageMatches = text.match(
    /\b(chart|graph|bar|axis|legend|margin|growth|rate|revenue|customer|expense|breakdown|cagr|nri|cohort|churn|retained|market|waterfall|cohort|funnel|roadmap|timeline|benchmark)\b/gi
  ) ?? [];
  const multiVisualHints = text.match(/\b(table|chart|graph|figure|diagram|source|legend|commentary)\b/gi) ?? [];

  if (flags.hasTables) {
    score += 25;
    reasons.push("table-like numeric structure");
  }
  if (flags.hasCharts) {
    score += 25;
    reasons.push("chart or diagram language");
  }
  if (flags.hasFinancialKeywords || flags.hasMarketKeywords) {
    score += 20;
    reasons.push("investment-critical finance/market content");
  }
  if (numberMatches.length >= 25) {
    score += 30;
    reasons.push("very high numeric density");
  } else if (numberMatches.length >= 10) {
    score += 18;
    reasons.push("high numeric density");
  }
  if (percentMatches.length >= 8) {
    score += 20;
    reasons.push("many percentages");
  }
  if (chartLanguageMatches.length >= 8) {
    score += 18;
    reasons.push("multiple chart/metric labels");
  }
  if (multiVisualHints.length >= 6) {
    score += 12;
    reasons.push("multiple visual block hints");
  }

  return { score: Math.min(100, score), reasons };
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
