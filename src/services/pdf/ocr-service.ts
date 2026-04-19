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

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { openrouter, MODELS } from "../openrouter/client";
import { extractFirstJSON } from "../openrouter/router";
import { getPagesNeedingOCR, analyzeExtractionQuality } from "./quality-analyzer";
import { assessExtractionSemantics, type ExtractionSemanticAssessment } from "./extraction-semantics";
import {
  chooseExtractionTier as chooseExtractionTierFromRouter,
  detectPageSignals as detectPageSignalsFromRouter,
  getHighFidelityVisualPageIndices as getHighFidelityVisualPageIndicesFromRouter,
  getVisualExtractionPlan as getVisualExtractionPlanFromRouter,
  scoreVisualExtractionRisk as scoreVisualExtractionRiskFromRouter,
  type PageSignalFlags,
  type VisualExtractionPlanPage as RoutedVisualExtractionPlanPage,
} from "./page-router";
import { verifySemanticPageExtraction } from "./semantic-verifier";
import {
  buildStructuredOCRResponseFormat,
  DOCUMENT_PAGE_ARTIFACT_V1,
  DOCUMENT_PAGE_ARTIFACT_V2,
  type ArtifactProviderMetadata,
  type ArtifactTransport,
  type ArtifactVerificationMetadata,
  normalizeStructuredOCRPayload,
  OPENROUTER_VLM_PROVIDER_KIND,
  OPENROUTER_VLM_PROVIDER_VERSION,
  STANDARD_OCR_PROMPT_VERSION,
  STRUCTURED_OCR_PROMPT_VERSION,
  STRUCTURED_OCR_SCHEMA_VERSION,
  summarizeStructuredOCREvidence,
  type StructuredOCRPagePayload,
} from "./canonical-artifact";
import { createDefaultPdfProviderStack } from "./providers/router";
import type { StructuredPdfExtractionOutput, StructuredPdfPageResult } from "./providers/types";

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
  pageImageHash?: string;
  cacheHit?: boolean;
  artifact?: DocumentPageArtifact;
}

type VisionPromptContext = {
  nativeText?: string;
  semanticAssessment?: ExtractionSemanticAssessment;
  structuredArtifact?: DocumentPageArtifact;
};

export type ExtractionProgressEvent =
  | { phase: "started"; message?: string }
  | { phase: "native_extracted"; pageCount: number; pagesProcessed: number; message?: string }
  | { phase: "page_processed"; pageNumber: number; page: PageOCRResult; message?: string }
  | { phase: "completed"; pageCount: number; pagesProcessed: number; message?: string }
  | { phase: "failed"; message: string };

export type ExtractionProgressCallback = (event: ExtractionProgressEvent) => void | Promise<void>;

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
  semanticAssessment?: ExtractionSemanticAssessment;
  cacheHit?: boolean;
  artifact?: DocumentPageArtifact;
  pageImageHash?: string;
  error?: string;
}

export interface DocumentPageArtifact {
  version: typeof DOCUMENT_PAGE_ARTIFACT_V1 | typeof DOCUMENT_PAGE_ARTIFACT_V2;
  pageNumber: number;
  label?: string;
  text: string;
  visualBlocks: Array<{
    type: "table" | "chart" | "diagram" | "image" | "text" | "unknown";
    title?: string;
    description: string;
    confidence: "high" | "medium" | "low";
  }>;
  tables: Array<{
    title?: string;
    markdown?: string;
    rows?: string[][];
    confidence: "high" | "medium" | "low";
  }>;
  charts: Array<{
    title?: string;
    chartType?: string;
    description: string;
    series?: string[];
    values?: Array<{ label: string; value: string }>;
    confidence: "high" | "medium" | "low";
  }>;
  unreadableRegions: Array<{
    reason: string;
    severity: "low" | "medium" | "high";
  }>;
  numericClaims: Array<{
    label: string;
    value: string;
    unit?: string;
    sourceText: string;
    confidence: "high" | "medium" | "low";
  }>;
  confidence: "high" | "medium" | "low";
  needsHumanReview: boolean;
  ocrMode?: OCRMode;
  sourceHash?: string;
  provider?: ArtifactProviderMetadata;
  verification?: ArtifactVerificationMetadata;
  semanticAssessment?: ExtractionSemanticAssessment;
}

export interface ExtractionManifest {
  version: "strict-pdf-v1" | "strict-document-v1";
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
  cachedPages: number;
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
const STRUCTURED_PROVIDER_COST_PER_PAGE: Partial<Record<ArtifactProviderMetadata["kind"], number>> = {
  "google-document-ai": 0.01,
  "azure-document-intelligence": 0.015,
};
const OCR_REFUSAL_RE =
  /\b(i['’]?(?:m| am) unable to|i cannot|i can'?t|unable to perform ocr|unable to extract|unable to read|cannot perform ocr|cannot extract text|let me know how i can assist|however, i can help guide you)\b/i;

function buildOpenRouterProviderMetadata(params: {
  modelId: string;
  mode: OCRMode;
  transport: ArtifactTransport;
  promptVersion: string;
  schemaVersion?: string;
}): ArtifactProviderMetadata {
  return {
    kind: OPENROUTER_VLM_PROVIDER_KIND,
    modelId: params.modelId,
    mode: params.mode,
    providerVersion: OPENROUTER_VLM_PROVIDER_VERSION,
    promptVersion: params.promptVersion,
    schemaVersion: params.schemaVersion,
    transport: params.transport,
  };
}

function buildStructuredProviderMetadata(params: {
  kind: Extract<ArtifactProviderMetadata["kind"], "google-document-ai" | "azure-document-intelligence">;
  mode: OCRMode;
}): ArtifactProviderMetadata {
  return {
    kind: params.kind,
    mode: params.mode,
    providerVersion: "structured-layout-v1",
    transport: "provider_structured",
  };
}

function getExpectedProviderContract(mode: OCRMode) {
  return {
    kind: OPENROUTER_VLM_PROVIDER_KIND,
    providerVersion: OPENROUTER_VLM_PROVIDER_VERSION,
    promptVersion: mode === "standard" ? STANDARD_OCR_PROMPT_VERSION : STRUCTURED_OCR_PROMPT_VERSION,
    schemaVersion: mode === "standard" ? undefined : STRUCTURED_OCR_SCHEMA_VERSION,
  } as const;
}

function isArtifactReusableForMode(artifact: DocumentPageArtifact, requestedMode: OCRMode): boolean {
  const artifactMode = artifact.ocrMode;
  if (!artifactMode || !isCachedOCRModeReusable(artifactMode, requestedMode)) {
    return false;
  }

  if (requestedMode === "standard") {
    return (
      !artifact.provider ||
      (
        artifact.provider.kind === OPENROUTER_VLM_PROVIDER_KIND &&
        artifact.provider.providerVersion === OPENROUTER_VLM_PROVIDER_VERSION
      )
    );
  }

  if (!artifact.provider) {
    return false;
  }

  const expected = getExpectedProviderContract(requestedMode);
  return (
    artifact.provider.kind === expected.kind &&
    artifact.provider.providerVersion === expected.providerVersion &&
    artifact.provider.promptVersion === expected.promptVersion &&
    artifact.provider.schemaVersion === expected.schemaVersion
  );
}

export function sanitizeVisionOCRText(text: string): { text: string; refusalLike: boolean } {
  const refusalLike = OCR_REFUSAL_RE.test(text);
  return {
    text: refusalLike ? "" : text.trim(),
    refusalLike,
  };
}

export function shouldLowConfidencePageRequireReview(params: {
  confidence: "high" | "medium" | "low" | undefined;
  semanticAssessment: Pick<
    ExtractionSemanticAssessment,
    "semanticSufficiency" | "canDegradeToWarning" | "structureDependency"
  >;
}): boolean {
  if (params.confidence !== "low") return false;

  return (
    params.semanticAssessment.semanticSufficiency === "insufficient" ||
    (
      params.semanticAssessment.semanticSufficiency !== "sufficient" &&
      !params.semanticAssessment.canDegradeToWarning &&
      (
        params.semanticAssessment.structureDependency === "high" ||
        params.semanticAssessment.structureDependency === "critical"
      )
    )
  );
}

export function isLowInformationWarningOnlyPage(
  semanticAssessment: Pick<
    ExtractionSemanticAssessment,
    "pageClass" | "semanticSufficiency" | "structureDependency" | "analyticalValueScore"
  >
): boolean {
  return (
    LOW_INFORMATION_WARNING_ONLY_CLASSES.has(semanticAssessment.pageClass) &&
    semanticAssessment.semanticSufficiency === "sufficient" &&
    semanticAssessment.structureDependency === "low" &&
    (semanticAssessment.analyticalValueScore ?? 100) <= 25
  );
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

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

const OCR_MODE_RANK: Record<OCRMode, number> = {
  standard: 0,
  high_fidelity: 1,
  supreme: 2,
};

const LOW_INFORMATION_WARNING_ONLY_CLASSES = new Set([
  "cover_page",
  "table_of_contents",
  "section_divider",
  "closing_contact",
  "branding_transition",
  "decorative",
]);

export function isCachedOCRModeReusable(
  cachedMode: OCRMode | undefined,
  requestedMode: OCRMode
): boolean {
  if (!cachedMode) return false;
  return OCR_MODE_RANK[cachedMode] >= OCR_MODE_RANK[requestedMode];
}

function buildOCRPrompt(mode: OCRMode): string {
  return `Extract ALL text from this slide. Include:
- Headings and titles
- Body text and bullet points
- Numbers, metrics, data points
- Chart/graph labels and values
- Diagram text

Output clean text only, no commentary.`;
}

function summarizeArtifactForVisionPrompt(artifact: DocumentPageArtifact): string {
  const sections: string[] = [];

  if (artifact.tables.length > 0) {
    const tableSummary = artifact.tables
      .slice(0, 2)
      .map((table, index) => table.markdown?.slice(0, 1200) ?? `table_${index + 1}`)
      .join("\n\n");
    sections.push(`Structured tables already extracted:\n${tableSummary}`);
  }

  if (artifact.numericClaims.length > 0) {
    const numericSummary = artifact.numericClaims
      .slice(0, 20)
      .map((claim) => `- ${claim.label}: ${claim.value}`)
      .join("\n");
    sections.push(`Grounded numeric claims already extracted:\n${numericSummary}`);
  }

  if (artifact.visualBlocks.length > 0) {
    const blockSummary = artifact.visualBlocks
      .slice(0, 10)
      .map((block) => `- ${block.type}: ${block.title ?? block.description}`.slice(0, 180))
      .join("\n");
    sections.push(`Visual blocks already identified:\n${blockSummary}`);
  }

  if (artifact.unreadableRegions.length > 0) {
    const unreadableSummary = artifact.unreadableRegions
      .slice(0, 10)
      .map((region) => `- ${region.severity}: ${region.reason}`.slice(0, 180))
      .join("\n");
    sections.push(`Known unreadable regions:\n${unreadableSummary}`);
  }

  return sections.join("\n\n").trim();
}

function buildStructuredOCRPrompt(
  mode: Extract<OCRMode, "high_fidelity" | "supreme">,
  context?: VisionPromptContext
): string {
  const level = mode === "supreme" ? "supreme-quality" : "high-fidelity";
  const contextSections: string[] = [];

  if (context?.semanticAssessment) {
    contextSections.push(
      `Page semantic assessment:\n- class: ${context.semanticAssessment.pageClass}\n- sufficiency: ${context.semanticAssessment.semanticSufficiency}\n- structure dependency: ${context.semanticAssessment.structureDependency}\n- analytical value: ${context.semanticAssessment.analyticalValueScore ?? "unknown"}`
    );
  }

  if (context?.nativeText?.trim()) {
    contextSections.push(`Native extracted text excerpt:\n${context.nativeText.trim().slice(0, 1800)}`);
  }

  if (context?.structuredArtifact) {
    const structuredSummary = summarizeArtifactForVisionPrompt(context.structuredArtifact);
    if (structuredSummary) {
      contextSections.push(structuredSummary);
    }
  }

  const contextBlock = contextSections.length > 0
    ? `\n\nExisting extraction evidence from native/layout engines is provided below. Treat it as grounded evidence to preserve and improve, not as disposable draft OCR.\n- Keep already-grounded labels and values unless the image clearly contradicts them.\n- Use the image to complete missing chart semantics, missing headers, legends, axes, and unreadable regions.\n- Do not drop structured evidence that is already present.\n\n${contextSections.join("\n\n")}`
    : "";

  return `You are performing ${level} OCR for a single investment-document PDF page.

Return JSON only that matches the schema exactly.

Rules:
- Preserve all visible normal text in pageText, in reading order.
- Preserve headings, bullets, labels, footnotes, captions, and small text.
- Reconstruct tables as markdown when readable, and rows when available.
- For charts, capture title, chart type, labels, legends, visible values, periods, units, and trend descriptions.
- For diagrams, preserve nodes, arrows, formulas, inputs, and outputs.
- Never invent values, labels, periods, currencies, percentages, or sources.
- If something is present but not readable, record it in unreadableRegions and use [UNREADABLE] where needed.
- Set needsHumanReview to true whenever decision-critical structure or values are incomplete.${contextBlock}`;
}

async function generateOCRCompletion(params: {
  dataUrl: string;
  mode: OCRMode;
  prompt: string;
  responseFormat?: { type: "json_object" } | ReturnType<typeof buildStructuredOCRResponseFormat>;
}): Promise<{ content: string; modelId: string }> {
  let lastError: unknown = null;
  const model = params.mode === "standard" ? OCR_MODEL : OCR_HIGH_FIDELITY_MODEL;

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
                  image_url: { url: params.dataUrl }
                },
                {
                  type: "text",
                  text: params.prompt
                }
              ]
            }
          ],
          max_tokens: params.mode === "supreme" ? 6500 : params.mode === "high_fidelity" ? 4500 : 1600,
          temperature: 0,
          ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
        },
        {
          signal: controller.signal,
          maxRetries: 0
        }
      );

      return {
        content: response.choices[0]?.message?.content || "",
        modelId: model.id,
      };
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

async function generateOCRText(dataUrl: string, mode: OCRMode): Promise<{ text: string; modelId: string }> {
  const response = await generateOCRCompletion({
    dataUrl,
    mode,
    prompt: buildOCRPrompt(mode),
  });
  return {
    text: response.content,
    modelId: response.modelId,
  };
}

function parseStructuredOCRPayload(content: string): StructuredOCRPagePayload | null {
  try {
    const parsed = JSON.parse(extractFirstJSON(content));
    return normalizeStructuredOCRPayload(parsed);
  } catch {
    return null;
  }
}

async function generateStructuredOCRPayload(
  dataUrl: string,
  mode: Extract<OCRMode, "high_fidelity" | "supreme">,
  context?: VisionPromptContext
): Promise<{
  payload: StructuredOCRPagePayload;
  modelId: string;
  transport: ArtifactTransport;
}> {
  const prompt = buildStructuredOCRPrompt(mode, context);
  const schemaResponse = await generateOCRCompletion({
    dataUrl,
    mode,
    prompt,
    responseFormat: buildStructuredOCRResponseFormat(`pdf_page_${mode}_ocr`),
  });
  const schemaPayload = parseStructuredOCRPayload(schemaResponse.content);
  if (schemaPayload) {
    return {
      payload: schemaPayload,
      modelId: schemaResponse.modelId,
      transport: "json_schema",
    };
  }

  const jsonObjectResponse = await generateOCRCompletion({
    dataUrl,
    mode,
    prompt: `${prompt}\n\nReturn a single JSON object only.`,
    responseFormat: { type: "json_object" },
  });
  const jsonObjectPayload = parseStructuredOCRPayload(jsonObjectResponse.content);
  if (jsonObjectPayload) {
    return {
      payload: jsonObjectPayload,
      modelId: jsonObjectResponse.modelId,
      transport: "json_object",
    };
  }

  throw new Error(`Structured OCR response could not be parsed for ${mode}`);
}

function deriveStructuredOCRConfidence(payload: StructuredOCRPagePayload): "high" | "medium" | "low" {
  const pageTextLength = payload.pageText.trim().length;
  const highUnreadableCount = payload.unreadableRegions.filter((region) => region.severity === "high").length;
  const lowConfidenceBlocks = payload.visualBlocks.filter((block) => block.confidence === "low").length;
  const lowConfidenceClaims = payload.numericClaims.filter((claim) => claim.confidence === "low").length;
  const structuredEvidenceCount = payload.tables.length + payload.charts.length + payload.numericClaims.length;

  if (pageTextLength < 40 || highUnreadableCount > 0) {
    return "low";
  }

  if (
    pageTextLength >= 160 &&
    structuredEvidenceCount >= 2 &&
    lowConfidenceBlocks === 0 &&
    lowConfidenceClaims <= 1 &&
    !payload.needsHumanReview
  ) {
    return "high";
  }

  return "medium";
}

/**
 * Render only selected PDF pages and OCR them in small batches.
 */
async function processSelectedPdfPages(
  buffer: Buffer,
  pagesToProcess: number[],
  options: {
    mode?: OCRMode;
    scale?: number;
    onProgress?: ExtractionProgressCallback;
    pageContexts?: Map<number, VisionPromptContext>;
  } = {}
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
        const processedBatch = await Promise.all(
          batch.map(({ pageNum, imageBuffer }) => processPageImage(
            imageBuffer,
            pageNum,
            mode,
            options.pageContexts?.get(pageNum)
          ))
        );
        pageResults.push(...processedBatch);
        await notifyProcessedPages(processedBatch, options.onProgress);
        batch = [];
      }

      if (pageResults.length + batch.length >= targetPages.size) {
        break;
      }
    }

    pageNum++;
  }

  if (batch.length > 0) {
    const processedBatch = await Promise.all(
      batch.map(({ pageNum, imageBuffer }) => processPageImage(
        imageBuffer,
        pageNum,
        mode,
        options.pageContexts?.get(pageNum)
      ))
    );
    pageResults.push(...processedBatch);
    await notifyProcessedPages(processedBatch, options.onProgress);
  }

  return pageResults;
}

async function processAllPdfPages(buffer: Buffer, options: { mode?: OCRMode; scale?: number; onProgress?: ExtractionProgressCallback } = {}): Promise<PageOCRResult[]> {
  const { pdf } = await import("pdf-to-img");
  const mode = options.mode ?? "standard";
  const scale = options.scale ?? 1.5;
  const pageResults: PageOCRResult[] = [];
  let batch: Array<{ pageNum: number; imageBuffer: Buffer }> = [];
  let pageNum = 1;

  for await (const image of await pdf(buffer, { scale })) {
    batch.push({ pageNum, imageBuffer: Buffer.from(image) });

    if (batch.length >= BATCH_SIZE) {
      const processedBatch = await Promise.all(
        batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
      );
      pageResults.push(...processedBatch);
      await notifyProcessedPages(processedBatch, options.onProgress);
      batch = [];
    }

    pageNum++;
  }

  if (batch.length > 0) {
    const processedBatch = await Promise.all(
      batch.map(({ pageNum, imageBuffer }) => processPageImage(imageBuffer, pageNum, mode))
    );
    pageResults.push(...processedBatch);
    await notifyProcessedPages(processedBatch, options.onProgress);
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
  options: {
    maxPages?: number;
    mode?: OCRMode;
    scale?: number;
    onProgress?: ExtractionProgressCallback;
    pageContexts?: Map<number, VisionPromptContext>;
  } = {}
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
      onProgress: options.onProgress,
      pageContexts: options.pageContexts,
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
export async function extractTextWithOCR(
  buffer: Buffer,
  options: { maxPages?: number; onProgress?: ExtractionProgressCallback } = {}
): Promise<OCRResult> {
  try {
    if (options.maxPages !== undefined && !Number.isFinite(options.maxPages)) {
      const startTime = Date.now();
      const pageResults = await processAllPdfPages(buffer, { onProgress: options.onProgress });
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
    return selectiveOCR(buffer, allPages, undefined, { maxPages: pageLimit, onProgress: options.onProgress });
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

async function getCachedOCRPageResult(params: {
  pageImageHash: string;
  pageNumber: number;
  mode: OCRMode;
}): Promise<PageOCRResult | null> {
  const cachedPages = await prisma.documentExtractionPage.findMany({
    where: {
      pageImageHash: params.pageImageHash,
      ocrProcessed: true,
      artifactVersion: {
        in: [DOCUMENT_PAGE_ARTIFACT_V1, DOCUMENT_PAGE_ARTIFACT_V2],
      },
      status: {
        in: ["READY", "READY_WITH_WARNINGS", "NEEDS_REVIEW"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 8,
    select: {
      createdAt: true,
      confidence: true,
      hasCharts: true,
      artifact: true,
    },
  });

  if (cachedPages.length === 0) return null;

  const candidate = cachedPages
    .flatMap((cachedPage) => {
      const artifact = normalizeDocumentPageArtifact(cachedPage.artifact);
      const artifactMode = artifact?.ocrMode;
      if (!artifact || !artifactMode || !isArtifactReusableForMode(artifact, params.mode)) {
        return [];
      }

      const sanitized = sanitizeVisionOCRText(artifact.text);
      if (sanitized.text.trim().length === 0) {
        return [];
      }

      return [{
        confidence: cachedPage.confidence,
        hasCharts: cachedPage.hasCharts,
        createdAt: cachedPage.createdAt,
        artifact: {
          ...artifact,
          text: sanitized.text.trim(),
        },
        mode: artifactMode,
        rank: OCR_MODE_RANK[artifactMode],
      }];
    })
    .sort((left, right) => {
      if (right.rank !== left.rank) return right.rank - left.rank;
      return right.createdAt.getTime() - left.createdAt.getTime();
    })[0];

  if (!candidate) {
    return null;
  }

  return {
    pageNumber: params.pageNumber,
    text: candidate.artifact.text,
    confidence: normalizeConfidence(candidate.confidence),
    hasCharts: candidate.hasCharts || candidate.artifact.charts.length > 0,
    hasImages: candidate.artifact.visualBlocks.some((block) => block.type === "image" || block.type === "diagram"),
    processingTimeMs: 0,
    cost: 0,
    mode: candidate.mode,
    pageImageHash: params.pageImageHash,
    cacheHit: true,
    artifact: candidate.artifact,
  };
}

/**
 * Process a single page image with Vision OCR
 */
async function processPageImage(
  imageBuffer: Buffer,
  pageNumber: number,
  mode: OCRMode = "standard",
  context?: VisionPromptContext
): Promise<PageOCRResult> {
  const pageStart = Date.now();
  const pageImageHash = hashBuffer(imageBuffer);

  try {
    const cached = await getCachedOCRPageResult({
      pageImageHash,
      pageNumber,
      mode,
    });
    if (cached) {
      return {
        ...cached,
        processingTimeMs: Date.now() - pageStart,
        pageImageHash,
        cacheHit: true,
      };
    }

    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    let text = "";
    let hasCharts = false;
    let hasImages = false;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let artifact: DocumentPageArtifact | undefined;

    if (mode === "standard") {
      const extracted = await generateOCRText(dataUrl, mode);
      const { text: sanitizedText, refusalLike: refusalLikeResponse } = sanitizeVisionOCRText(extracted.text);
      text = sanitizedText;
      hasCharts = sanitizedText.length > 0 && detectPageSignals(sanitizedText).hasCharts;
      hasImages = /logo|image|photo|diagram/i.test(sanitizedText);

      if (refusalLikeResponse) {
        confidence = 'low';
      } else if (sanitizedText.length > 150) {
        confidence = 'high';
      } else if (sanitizedText.length < 30) {
        confidence = 'low';
      }

      artifact = sanitizedText.length > 0 ? buildArtifactFromOCRText(pageNumber, sanitizedText, confidence, mode, {
        provider: buildOpenRouterProviderMetadata({
          modelId: extracted.modelId,
          mode,
          transport: "legacy_text",
          promptVersion: STANDARD_OCR_PROMPT_VERSION,
        }),
        verification: {
          state: "unverified",
          evidence: ["text_only_ocr"],
          issues: refusalLikeResponse ? ["provider_refusal_like_response_filtered"] : undefined,
        },
      }) : undefined;
    } else {
      try {
        const structured = await generateStructuredOCRPayload(dataUrl, mode, context);
        confidence = deriveStructuredOCRConfidence(structured.payload);
        artifact = buildArtifactFromStructuredOCRPayload({
          pageNumber,
          payload: structured.payload,
          confidence,
          mode,
          provider: buildOpenRouterProviderMetadata({
            modelId: structured.modelId,
            mode,
            transport: structured.transport,
            promptVersion: STRUCTURED_OCR_PROMPT_VERSION,
            schemaVersion: STRUCTURED_OCR_SCHEMA_VERSION,
          }),
        });
        text = artifact.text;
        hasCharts = artifact.charts.length > 0 || artifact.visualBlocks.some((block) => (
          block.type === "chart" || block.type === "diagram"
        ));
        hasImages = artifact.visualBlocks.some((block) => block.type === "image" || block.type === "diagram");
      } catch (structuredError) {
        const extracted = await generateOCRText(dataUrl, mode);
        const { text: sanitizedText, refusalLike: refusalLikeResponse } = sanitizeVisionOCRText(extracted.text);
        text = sanitizedText;
        hasCharts = sanitizedText.length > 0 && detectPageSignals(sanitizedText).hasCharts;
        hasImages = /logo|image|photo|diagram/i.test(sanitizedText);

        if (refusalLikeResponse) {
          confidence = 'low';
        } else if (sanitizedText.length > 150) {
          confidence = 'high';
        } else if (sanitizedText.length < 30) {
          confidence = 'low';
        }

        artifact = sanitizedText.length > 0 ? buildArtifactFromOCRText(pageNumber, sanitizedText, confidence, mode, {
          provider: buildOpenRouterProviderMetadata({
            modelId: extracted.modelId,
            mode,
            transport: "legacy_text",
            promptVersion: STRUCTURED_OCR_PROMPT_VERSION,
            schemaVersion: STRUCTURED_OCR_SCHEMA_VERSION,
          }),
          verification: {
            state: "heuristic_fallback",
            evidence: ["legacy_text_fallback"],
            issues: [
              structuredError instanceof Error
                ? `structured_ocr_failed:${structuredError.message}`
                : "structured_ocr_failed",
              ...(refusalLikeResponse ? ["provider_refusal_like_response_filtered"] : []),
            ],
          },
        }) : undefined;
      }
    }

    return {
      pageNumber,
      text,
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
      pageImageHash,
      cacheHit: false,
      artifact,
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
      pageImageHash,
      cacheHit: false,
    };
  }
}

async function notifyProcessedPages(
  pages: PageOCRResult[],
  onProgress: ExtractionProgressCallback | undefined
) {
  if (!onProgress) return;
  for (const page of pages) {
    await onProgress({
      phase: "page_processed",
      pageNumber: page.pageNumber,
      page,
      message: `Page ${page.pageNumber} OCR processed`,
    });
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

function buildArtifactFromOCRText(
  pageNumber: number,
  text: string,
  fallbackConfidence: "high" | "medium" | "low",
  mode: OCRMode = "standard",
  metadata?: {
    provider?: ArtifactProviderMetadata;
    verification?: ArtifactVerificationMetadata;
    version?: typeof DOCUMENT_PAGE_ARTIFACT_V1 | typeof DOCUMENT_PAGE_ARTIFACT_V2;
  }
): DocumentPageArtifact {
  const parsed = parseArtifactJson(text);
  const visualBlocks = parsed?.visualBlocks ?? inferVisualBlocks(text, fallbackConfidence);
  const tables = parsed?.tables ?? inferTables(text, fallbackConfidence);
  const charts = parsed?.charts ?? inferCharts(text, fallbackConfidence);
  const unreadableRegions = parsed?.unreadableRegions ?? inferUnreadableRegions(text);
  if (!parsed && mode !== "standard" && visualBlocks.some((block) => block.type === "table" || block.type === "chart")) {
    unreadableRegions.push({
      reason: "High-fidelity OCR did not return the required ARTIFACT_JSON for visual content.",
      severity: "high",
    });
  }
  const numericClaims = parsed?.numericClaims ?? inferNumericClaims(text, fallbackConfidence);
  const needsHumanReview = parsed?.needsHumanReview ?? (
    unreadableRegions.length > 0 ||
    (charts.length > 0 && numericClaims.length === 0 && /\b(chart|graph|axis|legend|bar|line)\b/i.test(text))
  );

  return {
    version: metadata?.version ?? DOCUMENT_PAGE_ARTIFACT_V1,
    pageNumber,
    text,
    visualBlocks,
    tables,
    charts,
    unreadableRegions,
    numericClaims,
    confidence: fallbackConfidence,
    needsHumanReview,
    ocrMode: mode,
    sourceHash: hashText(text),
    provider: metadata?.provider,
    verification: metadata?.verification,
  };
}

function buildArtifactFromStructuredOCRPayload(params: {
  pageNumber: number;
  payload: StructuredOCRPagePayload;
  confidence: "high" | "medium" | "low";
  mode: Extract<OCRMode, "high_fidelity" | "supreme">;
  provider: ArtifactProviderMetadata;
  verificationState?: ArtifactVerificationMetadata["state"];
  verificationIssues?: string[];
}): DocumentPageArtifact {
  const pageText = params.payload.pageText.trim();
  return {
    version: DOCUMENT_PAGE_ARTIFACT_V2,
    pageNumber: params.pageNumber,
    text: pageText,
    visualBlocks: params.payload.visualBlocks.map((block) => ({
      type: block.type,
      title: block.title ?? undefined,
      description: block.description,
      confidence: block.confidence,
    })),
    tables: params.payload.tables.map((table) => ({
      title: table.title ?? undefined,
      markdown: table.markdown ?? undefined,
      rows: table.rows,
      confidence: table.confidence,
    })),
    charts: params.payload.charts.map((chart) => ({
      title: chart.title ?? undefined,
      chartType: chart.chartType ?? undefined,
      description: chart.description,
      series: chart.series,
      values: chart.values,
      confidence: chart.confidence,
    })),
    unreadableRegions: params.payload.unreadableRegions.map((region) => ({
      reason: region.reason,
      severity: region.severity,
    })),
    numericClaims: params.payload.numericClaims.map((claim) => ({
      label: claim.label,
      value: claim.value,
      unit: claim.unit ?? undefined,
      sourceText: claim.sourceText,
      confidence: claim.confidence,
    })),
    confidence: params.confidence,
    needsHumanReview: params.payload.needsHumanReview,
    ocrMode: params.mode,
    sourceHash: hashText(pageText),
    provider: params.provider,
    verification: {
      state: params.verificationState ?? "provider_structured",
      evidence: summarizeStructuredOCREvidence(params.payload),
      issues: params.verificationIssues,
    },
  };
}

function buildArtifactFromStructuredProviderPage(params: {
  pageNumber: number;
  page: StructuredPdfPageResult;
  mode: OCRMode;
  provider: ArtifactProviderMetadata;
}): DocumentPageArtifact {
  const pageText = params.page.text.trim();
  return {
    version: DOCUMENT_PAGE_ARTIFACT_V2,
    pageNumber: params.pageNumber,
    text: pageText,
    visualBlocks: params.page.visualBlocks,
    tables: params.page.tables,
    charts: params.page.charts,
    unreadableRegions: params.page.unreadableRegions,
    numericClaims: params.page.numericClaims,
    confidence: params.page.confidence,
    needsHumanReview: params.page.unreadableRegions.some((region) => region.severity === "high"),
    ocrMode: params.mode,
    sourceHash: hashText(pageText),
    provider: params.provider,
    verification: {
      state: "provider_structured",
      evidence: [
        `provider:${params.provider.kind}`,
        ...(params.page.tables.length > 0 ? [`tables:${params.page.tables.length}`] : []),
        ...(params.page.numericClaims.length > 0 ? [`numeric_claims:${params.page.numericClaims.length}`] : []),
      ],
    },
  };
}

type ParsedArtifact = Pick<
  DocumentPageArtifact,
  "visualBlocks" | "tables" | "charts" | "unreadableRegions" | "numericClaims" | "needsHumanReview"
>;

function parseArtifactJson(text: string): ParsedArtifact | null {
  const match = text.match(/ARTIFACT_JSON[\s\S]*?```json\s*([\s\S]*?)```/i)
    ?? text.match(/```\s*json\s*([\s\S]*?"visualBlocks"[\s\S]*?)```/i);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<ParsedArtifact>;
    return {
      visualBlocks: normalizeVisualBlocks(parsed.visualBlocks),
      tables: normalizeTables(parsed.tables),
      charts: normalizeCharts(parsed.charts),
      unreadableRegions: normalizeUnreadableRegions(parsed.unreadableRegions),
      numericClaims: normalizeNumericClaims(parsed.numericClaims),
      needsHumanReview: Boolean(parsed.needsHumanReview),
    };
  } catch {
    return null;
  }
}

function inferVisualBlocks(text: string, confidence: "high" | "medium" | "low"): DocumentPageArtifact["visualBlocks"] {
  const blocks: DocumentPageArtifact["visualBlocks"] = [];
  if (/\|.+\||\btable\b|\bcohort\b/i.test(text)) {
    blocks.push({ type: "table", description: "Table-like content detected in OCR output.", confidence });
  }
  if (/\b(chart|graph|axis|legend|bar|line|waterfall|heatmap|scatter|donut|pie)\b/i.test(text)) {
    blocks.push({ type: "chart", description: "Chart-like content detected in OCR output.", confidence });
  }
  if (/\b(diagram|flow|arrow|node|roadmap|timeline)\b/i.test(text)) {
    blocks.push({ type: "diagram", description: "Diagram-like content detected in OCR output.", confidence });
  }
  return blocks;
}

function inferTables(text: string, confidence: "high" | "medium" | "low"): DocumentPageArtifact["tables"] {
  if (!/\|/.test(text)) return [];
  const lines = text.split("\n").filter((line) => line.includes("|"));
  if (lines.length === 0) return [];
  return [{ markdown: lines.join("\n"), confidence }];
}

function inferCharts(text: string, confidence: "high" | "medium" | "low"): DocumentPageArtifact["charts"] {
  if (!/\b(chart|graph|axis|legend|bar|line|waterfall|heatmap|scatter|donut|pie)\b/i.test(text)) return [];
  const series = [...new Set((text.match(/\b[A-Z][A-Za-z0-9 &/%.-]{2,30}\b/g) ?? []).slice(0, 8))];
  return [{
    chartType: inferChartType(text),
    description: "Chart content detected. Review numeric claims and unreadable regions for analytical reliability.",
    series,
    values: inferNumericClaims(text, confidence).slice(0, 20).map((claim) => ({ label: claim.label, value: claim.value })),
    confidence,
  }];
}

function inferChartType(text: string): string | undefined {
  if (/stacked/i.test(text)) return "stacked";
  if (/waterfall/i.test(text)) return "waterfall";
  if (/heatmap/i.test(text)) return "heatmap";
  if (/scatter|bubble/i.test(text)) return "scatter";
  if (/line/i.test(text)) return "line";
  if (/bar|histogram/i.test(text)) return "bar";
  if (/pie|donut/i.test(text)) return "pie";
  return undefined;
}

function inferUnreadableRegions(text: string): DocumentPageArtifact["unreadableRegions"] {
  const regions: DocumentPageArtifact["unreadableRegions"] = [];
  const unreadableCount = (text.match(/\[UNREADABLE\]/gi) ?? []).length;
  if (unreadableCount > 0) {
    regions.push({ reason: `${unreadableCount} unreadable value(s) explicitly marked by OCR.`, severity: unreadableCount > 5 ? "high" : "medium" });
  }
  if (/cannot be read|not readable|illegible/i.test(text)) {
    regions.push({ reason: "OCR reported unreadable visual content.", severity: "high" });
  }
  return regions;
}

function inferNumericClaims(text: string, confidence: "high" | "medium" | "low"): DocumentPageArtifact["numericClaims"] {
  const claims: DocumentPageArtifact["numericClaims"] = [];
  const pattern = /([A-Za-z][A-Za-z0-9 /&().-]{0,48}?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?)/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[1]?.trim().replace(/^[^\w]+/, "");
    const value = match[2]?.trim();
    if (!label || !value || label.length < 2) continue;
    claims.push({
      label,
      value,
      unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
      sourceText: match[0].slice(0, 180),
      confidence,
    });
    if (claims.length >= 60) break;
  }
  if (claims.length === 0 && /\d/.test(text)) {
    for (const match of text.matchAll(/-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?/g)) {
      const value = match[0].trim();
      claims.push({
        label: "numeric_value",
        value,
        unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
        sourceText: value,
        confidence,
      });
      if (claims.length >= 60) break;
    }
  }
  return claims;
}

function normalizeVisualBlocks(value: unknown): DocumentPageArtifact["visualBlocks"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" && ["table", "chart", "diagram", "image", "text", "unknown"].includes(record.type)
      ? record.type as DocumentPageArtifact["visualBlocks"][number]["type"]
      : "unknown";
    return [{
      type,
      title: typeof record.title === "string" ? record.title : undefined,
      description: typeof record.description === "string" ? record.description : "",
      confidence: normalizeConfidence(record.confidence),
    }];
  });
}

function normalizeTables(value: unknown): DocumentPageArtifact["tables"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      title: typeof record.title === "string" ? record.title : undefined,
      markdown: typeof record.markdown === "string" ? record.markdown : undefined,
      rows: Array.isArray(record.rows) ? record.rows.filter(Array.isArray).map((row) => row.map(String)) : undefined,
      confidence: normalizeConfidence(record.confidence),
    }];
  });
}

function normalizeCharts(value: unknown): DocumentPageArtifact["charts"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      title: typeof record.title === "string" ? record.title : undefined,
      chartType: typeof record.chartType === "string" ? record.chartType : undefined,
      description: typeof record.description === "string" ? record.description : "",
      series: Array.isArray(record.series) ? record.series.map(String) : undefined,
      values: Array.isArray(record.values)
        ? record.values.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const valueRecord = entry as Record<string, unknown>;
            return [{ label: String(valueRecord.label ?? ""), value: String(valueRecord.value ?? "") }];
          })
        : undefined,
      confidence: normalizeConfidence(record.confidence),
    }];
  });
}

function normalizeUnreadableRegions(value: unknown): DocumentPageArtifact["unreadableRegions"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      reason: typeof record.reason === "string" ? record.reason : "Unreadable region",
      severity: normalizeSeverity(record.severity),
    }];
  });
}

function normalizeNumericClaims(value: unknown): DocumentPageArtifact["numericClaims"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      label: String(record.label ?? ""),
      value: String(record.value ?? ""),
      unit: typeof record.unit === "string" ? record.unit : undefined,
      sourceText: String(record.sourceText ?? record.value ?? ""),
      confidence: normalizeConfidence(record.confidence),
    }];
  }).filter((claim) => claim.label && claim.value);
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeArtifactProvider(value: unknown): ArtifactProviderMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.kind !== OPENROUTER_VLM_PROVIDER_KIND &&
    record.kind !== "google-document-ai" &&
    record.kind !== "azure-document-intelligence" &&
    record.kind !== "native"
  ) {
    return undefined;
  }

  return {
    kind: record.kind,
    modelId: typeof record.modelId === "string" ? record.modelId : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
    providerVersion: typeof record.providerVersion === "string" ? record.providerVersion : undefined,
    schemaVersion: typeof record.schemaVersion === "string" ? record.schemaVersion : undefined,
    promptVersion: typeof record.promptVersion === "string" ? record.promptVersion : undefined,
    transport:
      record.transport === "legacy_text" ||
      record.transport === "json_object" ||
      record.transport === "json_schema" ||
      record.transport === "provider_structured"
        ? record.transport
        : undefined,
  };
}

function normalizeArtifactVerification(value: unknown): ArtifactVerificationMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.state !== "unverified" &&
    record.state !== "provider_structured" &&
    record.state !== "heuristic_fallback" &&
    record.state !== "parse_failed"
  ) {
    return undefined;
  }

  return {
    state: record.state,
    evidence: Array.isArray(record.evidence) ? record.evidence.map(String) : [],
    issues: Array.isArray(record.issues) ? record.issues.map(String) : undefined,
  };
}

function normalizeDocumentPageArtifact(value: Prisma.JsonValue | null): DocumentPageArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    (record.version !== DOCUMENT_PAGE_ARTIFACT_V1 && record.version !== DOCUMENT_PAGE_ARTIFACT_V2) ||
    typeof record.pageNumber !== "number" ||
    typeof record.text !== "string"
  ) {
    return null;
  }

  return {
    version: record.version,
    pageNumber: record.pageNumber,
    label: typeof record.label === "string" ? record.label : undefined,
    text: record.text,
    visualBlocks: normalizeVisualBlocks(record.visualBlocks),
    tables: normalizeTables(record.tables),
    charts: normalizeCharts(record.charts),
    unreadableRegions: normalizeUnreadableRegions(record.unreadableRegions),
    numericClaims: normalizeNumericClaims(record.numericClaims),
    confidence: normalizeConfidence(record.confidence),
    needsHumanReview: Boolean(record.needsHumanReview),
    ocrMode: record.ocrMode === "standard" || record.ocrMode === "high_fidelity" || record.ocrMode === "supreme"
      ? record.ocrMode
      : undefined,
    sourceHash: typeof record.sourceHash === "string" ? record.sourceHash : undefined,
    provider: normalizeArtifactProvider(record.provider),
    verification: normalizeArtifactVerification(record.verification),
    semanticAssessment: record.semanticAssessment && typeof record.semanticAssessment === "object" && !Array.isArray(record.semanticAssessment)
      ? record.semanticAssessment as ExtractionSemanticAssessment
      : undefined,
  };
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
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

async function extractStructuredProviderOutput(buffer: Buffer): Promise<StructuredPdfExtractionOutput | null> {
  const providerStack = createDefaultPdfProviderStack();
  const providers = [providerStack.structuredPrimary, providerStack.structuredFallback].filter(
    (provider): provider is NonNullable<typeof provider> => Boolean(provider)
  );

  if (providers.length === 0) {
    return null;
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const output = await provider.extractFromBuffer({
        buffer,
        mimeType: "application/pdf",
      });
      if (output.success && output.pages.length > 0) {
        return output;
      }
      lastError = new Error(output.error ?? `${provider.descriptor.label} returned no pages`);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const message = lastError instanceof Error ? lastError.message : "Structured provider extraction failed";
    console.warn("[pdf] Structured provider extraction failed, falling back to VLM OCR:", message);
  }

  return null;
}

async function runStructuredProviderPlan(
  buffer: Buffer,
  pageIndices: number[],
  existingText: string | undefined,
  pageTexts: string[],
  visualPlan: RoutedVisualExtractionPlanPage[],
  onProgress?: ExtractionProgressCallback
): Promise<{
  ocrResult: OCRResult;
  escalationPageIndices: number[];
  pageContexts: Map<number, VisionPromptContext>;
} | null> {
  const selectedPageIndices = [...new Set(pageIndices)].sort((left, right) => left - right);
  if (selectedPageIndices.length === 0) {
    return null;
  }

  const startedAt = Date.now();
  const structuredOutput = await extractStructuredProviderOutput(buffer);
  if (!structuredOutput) {
    return null;
  }

  const providerKind = structuredOutput.provider.id === "google-document-ai"
    ? "google-document-ai"
    : structuredOutput.provider.id === "azure-document-intelligence"
      ? "azure-document-intelligence"
      : null;
  if (!providerKind) {
    return null;
  }

  const pageMap = new Map(structuredOutput.pages.map((page) => [page.pageNumber, page]));
  const providerTotalCost =
    (STRUCTURED_PROVIDER_COST_PER_PAGE[providerKind] ?? 0) *
    Math.max(structuredOutput.pageCount, structuredOutput.pages.length);
  const pageCost = selectedPageIndices.length > 0
    ? providerTotalCost / selectedPageIndices.length
    : 0;
  const escalationPageIndices: number[] = [];
  const pageContexts = new Map<number, VisionPromptContext>();
  const pageResults: PageOCRResult[] = [];

  for (const pageIndex of selectedPageIndices) {
    const pageNumber = pageIndex + 1;
    const providerPage = pageMap.get(pageNumber);
    if (!providerPage) {
      continue;
    }
    const plannedTier = visualPlan.find((page) => page.pageIndex === pageIndex)?.tier ?? "high_fidelity";
    const mode: OCRMode = plannedTier === "supreme" ? "supreme" : "high_fidelity";
    const providerMetadata = buildStructuredProviderMetadata({
      kind: providerKind,
      mode,
    });
    const artifact = buildArtifactFromStructuredProviderPage({
      pageNumber,
      page: providerPage,
      mode,
      provider: providerMetadata,
    });
    const nativeText = pageTexts[pageIndex] ?? "";
    const combinedText = `${nativeText}\n${artifact.text}`.trim();
    const flags = detectPageSignalsFromRouter(combinedText, {
      isEdgePage: pageIndex === 0 || pageIndex === pageTexts.length - 1,
    });
    const semanticAssessment = assessExtractionSemantics({
      pageNumber,
      text: combinedText,
      nativeText,
      charCount: combinedText.length,
      wordCount: combinedText.split(/\s+/).filter(Boolean).length,
      hasTables: flags.hasTables,
      hasCharts: flags.hasCharts,
      hasFinancialKeywords: flags.hasFinancialKeywords,
      hasTeamKeywords: flags.hasTeamKeywords,
      hasMarketKeywords: flags.hasMarketKeywords,
      artifact,
      isEdgePage: pageIndex === 0 || pageIndex === pageTexts.length - 1,
    });
    const verification = verifySemanticPageExtraction({
      nativeText,
      combinedText,
      flags,
      artifact,
      semanticAssessment,
    });
    artifact.semanticAssessment = semanticAssessment;
    artifact.verification = verification.verification;
    pageContexts.set(pageNumber, {
      nativeText,
      semanticAssessment,
      structuredArtifact: artifact,
    });
    if (verification.shouldEscalateToVision) {
      escalationPageIndices.push(pageIndex);
    }

    pageResults.push({
      pageNumber,
      text: artifact.text,
      confidence: providerPage.confidence,
      hasCharts: flags.hasCharts || artifact.charts.length > 0,
      hasImages: artifact.visualBlocks.some((block) => block.type === "image" || block.type === "diagram"),
      processingTimeMs: Date.now() - startedAt,
      cost: pageCost,
      mode,
      pageImageHash: undefined,
      cacheHit: false,
      artifact,
    });
  }

  const sortedResults = pageResults.sort((left, right) => left.pageNumber - right.pageNumber);
  const ocrResult: OCRResult = {
    success: sortedResults.length > 0,
    text: composeOCRText(existingText, sortedResults),
    pageResults: sortedResults,
    pagesProcessed: sortedResults.length,
    pagesSkipped: 0,
    totalCost: providerTotalCost,
    processingTimeMs: Date.now() - startedAt,
    error: sortedResults.length === 0 ? structuredOutput.error ?? "Structured provider returned no selected pages" : undefined,
  };

  await notifyProcessedPages(sortedResults, onProgress);
  return {
    ocrResult,
    escalationPageIndices: [...new Set(escalationPageIndices)],
    pageContexts,
  };
}

async function runVisualOCRPlan(
  buffer: Buffer,
  pageIndices: number[],
  existingText: string | undefined,
  visualPlan: RoutedVisualExtractionPlanPage[],
  onProgress?: ExtractionProgressCallback,
  pageContexts?: Map<number, VisionPromptContext>
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
      onProgress,
      pageContexts,
    }));
  }
  if (supremePages.length > 0) {
    results.push(await selectiveOCR(buffer, supremePages, existingText, {
      maxPages: Number.POSITIVE_INFINITY,
      mode: "supreme",
      scale: 3,
      onProgress,
      pageContexts,
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
  const { text: rawText } = await generateOCRText(dataUrl, "standard");
  const text = rawText.trim();
  let confidence: "high" | "medium" | "low" = "medium";
  if (text.length > 200) confidence = "high";
  else if (text.length < 30) confidence = "low";

  return { text, confidence, cost: COST_PER_PAGE };
}

export async function processImageArtifactOCR(
  imageBuffer: Buffer,
  format: "jpeg" | "png",
  pageNumber = 1,
  mode: OCRMode = "high_fidelity",
  context?: VisionPromptContext
): Promise<PageOCRResult> {
  const normalizedBuffer = format === "png"
    ? imageBuffer
    : imageBuffer;
  return processPageImage(normalizedBuffer, pageNumber, mode, context);
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
    onProgress?: ExtractionProgressCallback;
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
    strict = false,
    onProgress
  } = options;

  await onProgress?.({ phase: "started", message: "Document extraction started" });

  // First try regular text extraction
  let regularResult;
  try {
    const { createPdfJsNativeExtractionProvider } = await import("./providers/native-pdf-provider");
    const provider = createPdfJsNativeExtractionProvider();
    const nativeResult = await provider.extractFromBuffer({ buffer });
    regularResult = nativeResult.raw;
  } catch (extractError) {
    console.warn("[smartExtract] Text extraction threw, treating as failure:", extractError instanceof Error ? extractError.message : extractError);
    regularResult = { success: false as const, text: "", pageTexts: [], pageCount: 0, info: {} };
  }

  await onProgress?.({
    phase: "native_extracted",
    pageCount: regularResult.pageCount,
    pagesProcessed: regularResult.pageTexts?.length ?? 0,
    message: regularResult.success ? "Native PDF text extracted" : "Native PDF extraction failed",
  });

  if (!regularResult.success) {
    if (autoOCR) {
      try {
        const ocrResult = await extractTextWithOCR(buffer, {
          maxPages: strict ? Number.POSITIVE_INFINITY : maxOCRPages,
          onProgress,
        });
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
        await onProgress?.({
          phase: "completed",
          pageCount: manifest.pageCount,
          pagesProcessed: manifest.pagesProcessed,
          message: "OCR extraction completed",
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
        const message = ocrError instanceof Error ? ocrError.message : String(ocrError);
        console.error("[smartExtract] OCR also failed:", message);
        await onProgress?.({ phase: "failed", message });
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
    await onProgress?.({
      phase: "failed",
      message: "Native PDF text extraction and OCR failed",
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
  const visualPlan = getVisualExtractionPlanFromRouter(regularResult.pageTexts ?? []);

  if (qualityScore >= qualityThreshold && !strict) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      pagesRequestedForOCR: [],
    });
    await onProgress?.({
      phase: "completed",
      pageCount: manifest.pageCount,
      pagesProcessed: manifest.pagesProcessed,
      message: "Native extraction completed",
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
    await onProgress?.({
      phase: "completed",
      pageCount: manifest.pageCount,
      pagesProcessed: manifest.pagesProcessed,
      message: "Native extraction completed",
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
    regularResult.pageTexts ?? regularResult.text
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
      const highFidelityPages = visualPlan
        .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
        .map((page) => page.pageIndex);

      if (highFidelityPages.length > 0) {
        const structured = await runStructuredProviderPlan(
          buffer,
          highFidelityPages,
          regularResult.text,
          regularResult.pageTexts ?? [],
          visualPlan,
          onProgress
        );
        const ocrResult = structured?.ocrResult ?? await runVisualOCRPlan(
          buffer,
          highFidelityPages,
          regularResult.text,
          visualPlan,
          onProgress
        );
        const escalationPages = structured?.escalationPageIndices ?? [];
        const fallbackPages = [...new Set(escalationPages.filter((pageIndex) => visualPlan[pageIndex]?.tier === "supreme"))];
        const finalOcrResult = fallbackPages.length > 0
          ? mergeOCRResults({
              original: ocrResult,
              retry: await runVisualOCRPlan(
                buffer,
                fallbackPages,
                regularResult.text,
                visualPlan,
                onProgress,
                structured?.pageContexts
              ),
              existingText: regularResult.text,
            })
          : ocrResult;
        const hybridManifest = buildExtractionManifest({
          pageCount: regularResult.pageCount,
          pageTexts: regularResult.pageTexts ?? [],
          method: "hybrid",
          qualityScore,
          ocrResult: finalOcrResult,
          pagesRequestedForOCR: highFidelityPages,
        });
        await onProgress?.({
          phase: "completed",
          pageCount: hybridManifest.pageCount,
          pagesProcessed: hybridManifest.pagesProcessed,
          message: "Hybrid visual extraction completed",
        });
        return {
          text: finalOcrResult.text,
          method: "hybrid",
          quality: qualityScore,
          ocrResult: finalOcrResult,
          pagesOCRd: finalOcrResult.pagesProcessed,
          estimatedCost: finalOcrResult.totalCost,
          manifest: hybridManifest,
        };
      }
    }

    await onProgress?.({
      phase: "completed",
      pageCount: manifest.pageCount,
      pagesProcessed: manifest.pagesProcessed,
      message: "Native extraction completed",
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

  const structuredFirstPass = await runStructuredProviderPlan(
    buffer,
    pagesToOCR,
    regularResult.text,
    regularResult.pageTexts ?? [],
    visualPlan,
    onProgress
  );

  let ocrResult = structuredFirstPass?.ocrResult ?? await selectiveOCR(buffer, pagesToOCR, regularResult.text, {
    maxPages: maxOCRPages,
    onProgress,
  });

  if (!ocrResult.success || ocrResult.pagesProcessed === 0) {
    const manifest = buildExtractionManifest({
      pageCount: regularResult.pageCount,
      pageTexts: regularResult.pageTexts ?? [],
      method: 'text',
      qualityScore,
      ocrResult,
      pagesRequestedForOCR: pagesToOCR,
    });
    await onProgress?.({
      phase: "completed",
      pageCount: manifest.pageCount,
      pagesProcessed: manifest.pagesProcessed,
      message: "Extraction completed with OCR warnings",
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
    const highFidelityCandidatePages = visualPlan
      .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
      .map((page) => page.pageIndex);
    const reviewDrivenPages = manifest.pages
      .filter((page) => (
        page.status === "needs_review" ||
        page.status === "failed"
      ))
      .map((page) => page.pageNumber - 1);
    const secondPassPages = structuredFirstPass
      ? [...new Set([
          ...(structuredFirstPass.escalationPageIndices ?? []),
          ...reviewDrivenPages,
        ])]
      : [...new Set([
          ...highFidelityCandidatePages,
          ...reviewDrivenPages,
        ])];

    if (secondPassPages.length > 0) {
      const secondPass = await runVisualOCRPlan(
        buffer,
        secondPassPages,
        undefined,
        visualPlan,
        onProgress,
        structuredFirstPass?.pageContexts
      );
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

  await onProgress?.({
    phase: "completed",
    pageCount: manifest.pageCount,
    pagesProcessed: manifest.pagesProcessed,
    message: "Hybrid extraction completed",
  });
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
    const flags = detectPageSignalsFromRouter(combinedText, { isEdgePage });
    const nativeFlags = detectPageSignalsFromRouter(nativeText, { isEdgePage });
    const visualRisk = scoreVisualExtractionRiskFromRouter(nativeText || combinedText, nativeFlags);
    const plannedTier = chooseExtractionTierFromRouter(nativeText, nativeFlags, visualRisk.score);
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
    const hasBlockingCriticalSignals =
      flags.hasFinancialKeywords || flags.hasMarketKeywords || flags.hasTables || flags.hasCharts;
    const hasVisualExtractionRisk = flags.hasTables || flags.hasCharts;
    const pageArtifact = ocr?.artifact ?? buildArtifactFromOCRText(pageNumber, combinedText, qualityScore >= 75 ? "high" : qualityScore >= 45 ? "medium" : "low");
    const semanticAssessment = assessExtractionSemantics({
      pageNumber,
      text: combinedText,
      nativeText,
      charCount,
      wordCount,
      hasTables: flags.hasTables,
      hasCharts: flags.hasCharts,
      hasFinancialKeywords: flags.hasFinancialKeywords,
      hasTeamKeywords: flags.hasTeamKeywords,
      hasMarketKeywords: flags.hasMarketKeywords,
      artifact: pageArtifact,
      isEdgePage,
    });
    pageArtifact.semanticAssessment = semanticAssessment;
    const verification = verifySemanticPageExtraction({
      nativeText,
      combinedText,
      flags,
      artifact: pageArtifact,
      semanticAssessment,
    });
    pageArtifact.verification = verification.verification;
    const lowConfidenceNeedsReview = shouldLowConfidencePageRequireReview({
      confidence: ocr?.confidence,
      semanticAssessment,
    });
    const lowInformationWarningOnly = isLowInformationWarningOnlyPage(semanticAssessment);
    const lowQualityNeedsReview =
      semanticAssessment.semanticSufficiency === "insufficient" ||
      (!lowInformationWarningOnly && hasBlockingCriticalSignals) ||
      (!lowInformationWarningOnly && hasVisualExtractionRisk && !ocrProcessed);

    let status: ExtractionPageManifest["status"] = "ready";
    let method: ExtractionPageManifest["method"] = ocrProcessed
      ? (nativeText.length > 0 ? "hybrid" : "ocr")
      : "native_text";
    let error: string | undefined;

    if (ocrRequested && !ocrProcessed) {
      status = hasBlockingCriticalSignals ? "failed" : "needs_review";
      method = "skipped";
      error = "OCR was required but did not complete for this page";
    } else if (charCount < 40) {
      status = lowInformationWarningOnly
        ? "ready_with_warnings"
        : hasBlockingCriticalSignals
          ? "failed"
          : "needs_review";
      error = lowInformationWarningOnly
        ? "Very little text was extracted, but the page appears low-information and non-blocking"
        : "Very little text was extracted from this page";
    } else if (qualityScore < 55 || ocr?.confidence === "low") {
      const shouldReview = ocr?.confidence === "low" ? lowConfidenceNeedsReview : lowQualityNeedsReview;
      status = shouldReview ? "needs_review" : "ready_with_warnings";
      error = ocr?.confidence === "low"
        ? shouldReview
          ? "OCR confidence is low"
          : "OCR confidence is low, but semantic coverage appears sufficient"
        : hasVisualExtractionRisk
          ? "Visual/table-like page extracted with limited text"
          : "Low page extraction quality";
    }
    const hasIncompleteStructuredVisual = verification.missing.length > 0 || verification.requiresVisualReview;
    if ((status === "ready" || status === "ready_with_warnings") && hasIncompleteStructuredVisual) {
      const shouldBlockForStructuredGap =
        verification.requiresVisualReview ||
        semanticAssessment.semanticSufficiency === "insufficient" ||
        (semanticAssessment.shouldBlockIfStructureMissing &&
          !semanticAssessment.canDegradeToWarning &&
          semanticAssessment.semanticSufficiency !== "sufficient");

      status = shouldBlockForStructuredGap ? "needs_review" : "ready_with_warnings";
      error = shouldBlockForStructuredGap
        ? "Structured extraction does not yet preserve the page's decision-critical semantics"
        : "Structured extraction is partial, but semantic coverage appears sufficient";
    }

    if (status === "failed" && hasBlockingCriticalSignals) {
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
      semanticAssessment,
      cacheHit: ocr?.cacheHit ?? false,
      artifact: pageArtifact,
      pageImageHash: ocr?.pageImageHash,
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

export function detectPageSignals(text: string, options: { isEdgePage?: boolean } = {}): Pick<
  ExtractionPageManifest,
  "hasTables" | "hasCharts" | "hasFinancialKeywords" | "hasTeamKeywords" | "hasMarketKeywords"
> {
  return detectPageSignalsFromRouter(text, options);
}

function scorePageQuality(charCount: number, flags: PageSignalFlags): number {
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
  let cachedPages = 0;

  for (const page of pages) {
    if (page.cacheHit) {
      cachedPages += 1;
      continue;
    }
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
    cachedPages,
  };
}

export function getHighFidelityVisualPageIndices(pageTexts: string[]): number[] {
  return getHighFidelityVisualPageIndicesFromRouter(pageTexts);
}

type VisualExtractionPlanPage = RoutedVisualExtractionPlanPage;

export function getVisualExtractionPlan(pageTexts: string[]): VisualExtractionPlanPage[] {
  return getVisualExtractionPlanFromRouter(pageTexts);
}

function chooseExtractionTier(
  nativeText: string,
  flags: PageSignalFlags,
  visualRiskScore: number
): ExtractionTier {
  return chooseExtractionTierFromRouter(nativeText, flags, visualRiskScore);
}

function scoreVisualExtractionRisk(
  text: string,
  flags: PageSignalFlags
): { score: number; reasons: string[] } {
  return scoreVisualExtractionRiskFromRouter(text, flags);
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
