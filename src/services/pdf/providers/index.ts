export {
  createPdfJsNativeExtractionProvider,
  PdfJsNativeExtractionProvider,
  PDFJS_NATIVE_PROVIDER_DESCRIPTOR,
  PDFJS_NATIVE_PROVIDER_ID,
} from "./native-pdf-provider";

export {
  createGoogleDocumentAiStructuredExtractionProvider,
  GoogleDocumentAiStructuredExtractionProvider,
  GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR,
  GOOGLE_DOCUMENT_AI_PROVIDER_ID,
  isGoogleDocumentAiAuthConfigured,
  normalizeGoogleDocumentAiResponse,
} from "./google-document-ai-provider";

export {
  createAzureDocumentIntelligenceStructuredExtractionProvider,
  AzureDocumentIntelligenceStructuredExtractionProvider,
  AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR,
  AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_ID,
  normalizeAzureDocumentIntelligenceResponse,
} from "./azure-document-intelligence-provider";

export {
  createOpenRouterVlmPageOcrProvider,
  getDefaultOpenRouterArtifactMode,
  OpenRouterVlmPageOcrProvider,
  OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR,
  OPENROUTER_VLM_PAGE_OCR_PROVIDER_ID,
} from "./openrouter-vlm-ocr-provider";

export {
  createDefaultPdfProviderStack,
  isAzureDocumentIntelligenceConfigured,
  isGoogleDocumentAiConfigured,
  listConfiguredPdfProviders,
  type PdfProviderStack,
} from "./router";

export type {
  NativePdfExtractionOutput,
  NativePdfExtractionProvider,
  NativePdfExtractionRequest,
  NativePdfUrlExtractionRequest,
  PdfProviderDescriptor,
  PdfProviderKind,
  StructuredPdfProviderKind,
  StructuredPdfExtractionOutput,
  StructuredPdfExtractionProvider,
  StructuredPdfExtractionRequest,
  StructuredPdfPageResult,
  VlmPageArtifactOcrOutput,
  VlmPageOcrProvider,
  VlmPageOcrRequest,
  VlmPageTextOcrOutput,
} from "./types";
