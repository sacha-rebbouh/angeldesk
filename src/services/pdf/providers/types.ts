import type {
  DocumentPageArtifact,
  ExtractionQualityMetrics,
  ExtractionWarning,
  OCRMode,
  PageOCRResult,
  PDFExtractionResult,
} from "@/services/pdf";

export type PdfProviderKind = "native_text" | "page_ocr";
export type StructuredPdfProviderKind = PdfProviderKind | "structured_layout";

export interface PdfProviderDescriptor {
  id: string;
  label: string;
  kind: StructuredPdfProviderKind;
}

export interface NativePdfExtractionRequest {
  buffer: Buffer;
  sourceName?: string;
}

export interface NativePdfUrlExtractionRequest {
  url: string;
  sourceName?: string;
}

export interface NativePdfExtractionOutput {
  provider: PdfProviderDescriptor;
  success: boolean;
  text: string;
  pageTexts: string[];
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
  quality?: {
    score: number;
    metrics: ExtractionQualityMetrics;
    warnings: ExtractionWarning[];
  };
  error?: string;
  raw: PDFExtractionResult;
}

export interface NativePdfExtractionProvider {
  readonly descriptor: PdfProviderDescriptor;
  extractFromBuffer(request: NativePdfExtractionRequest): Promise<NativePdfExtractionOutput>;
  extractFromUrl?(request: NativePdfUrlExtractionRequest): Promise<NativePdfExtractionOutput>;
}

export interface VlmPageOcrRequest {
  imageBuffer: Buffer;
  format: "jpeg" | "png";
  pageNumber?: number;
  mode?: OCRMode;
  sourceName?: string;
}

export interface VlmPageTextOcrOutput {
  provider: PdfProviderDescriptor;
  pageNumber: number;
  text: string;
  confidence: "high" | "medium" | "low";
  cost: number;
  mode: Extract<OCRMode, "standard">;
  raw: {
    text: string;
    confidence: "high" | "medium" | "low";
    cost: number;
  };
}

export interface VlmPageArtifactOcrOutput {
  provider: PdfProviderDescriptor;
  pageNumber: number;
  text: string;
  confidence: "high" | "medium" | "low";
  hasCharts: boolean;
  hasImages: boolean;
  processingTimeMs: number;
  cost: number;
  mode: OCRMode;
  artifact?: DocumentPageArtifact;
  cacheHit?: boolean;
  raw: PageOCRResult;
}

export interface VlmPageOcrProvider {
  readonly descriptor: PdfProviderDescriptor;
  extractText(request: VlmPageOcrRequest): Promise<VlmPageTextOcrOutput>;
  extractArtifact(request: VlmPageOcrRequest): Promise<VlmPageArtifactOcrOutput>;
}

export interface StructuredPdfExtractionRequest {
  buffer: Buffer;
  mimeType?: string;
  sourceName?: string;
}

export interface StructuredPdfPageResult {
  pageNumber: number;
  text: string;
  confidence: "high" | "medium" | "low";
  visualBlocks: NonNullable<DocumentPageArtifact["visualBlocks"]>;
  tables: NonNullable<DocumentPageArtifact["tables"]>;
  charts: NonNullable<DocumentPageArtifact["charts"]>;
  unreadableRegions: NonNullable<DocumentPageArtifact["unreadableRegions"]>;
  numericClaims: NonNullable<DocumentPageArtifact["numericClaims"]>;
  providerPageId?: string;
  raw?: unknown;
}

export interface StructuredPdfExtractionOutput {
  provider: PdfProviderDescriptor;
  success: boolean;
  pageCount: number;
  pages: StructuredPdfPageResult[];
  raw: unknown;
  error?: string;
}

export interface StructuredPdfExtractionProvider {
  readonly descriptor: PdfProviderDescriptor;
  extractFromBuffer(request: StructuredPdfExtractionRequest): Promise<StructuredPdfExtractionOutput>;
}
