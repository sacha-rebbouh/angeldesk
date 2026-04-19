import {
  createAzureDocumentIntelligenceStructuredExtractionProvider,
  AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR,
} from "./azure-document-intelligence-provider";
import {
  createGoogleDocumentAiStructuredExtractionProvider,
  GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR,
  isGoogleDocumentAiAuthConfigured,
} from "./google-document-ai-provider";
import {
  createPdfJsNativeExtractionProvider,
  PDFJS_NATIVE_PROVIDER_DESCRIPTOR,
} from "./native-pdf-provider";
import {
  createOpenRouterVlmPageOcrProvider,
  OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR,
} from "./openrouter-vlm-ocr-provider";
import type {
  NativePdfExtractionProvider,
  PdfProviderDescriptor,
  StructuredPdfExtractionProvider,
  VlmPageOcrProvider,
} from "./types";

export interface PdfProviderStack {
  native: NativePdfExtractionProvider;
  pageOcr: VlmPageOcrProvider;
  structuredPrimary?: StructuredPdfExtractionProvider;
  structuredFallback?: StructuredPdfExtractionProvider;
}

export async function isGoogleDocumentAiConfigured(): Promise<boolean> {
  if (!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME) {
    return false;
  }
  return isGoogleDocumentAiAuthConfigured();
}

export function isAzureDocumentIntelligenceConfigured(): boolean {
  return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY);
}

export function listConfiguredPdfProviders(): PdfProviderDescriptor[] {
  const googleConfigured =
    Boolean(process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME) &&
    Boolean(
      process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_BASE64 ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_FILE ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (process.env.GOOGLE_DOCUMENT_AI_CLIENT_EMAIL && process.env.GOOGLE_DOCUMENT_AI_PRIVATE_KEY) ||
      process.env.GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH === "true"
    );
  return [
    PDFJS_NATIVE_PROVIDER_DESCRIPTOR,
    OPENROUTER_VLM_PAGE_OCR_PROVIDER_DESCRIPTOR,
    ...(googleConfigured ? [GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR] : []),
    ...(isAzureDocumentIntelligenceConfigured() ? [AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR] : []),
  ];
}

export function createDefaultPdfProviderStack(): PdfProviderStack {
  const googleConfigured =
    Boolean(process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME) &&
    Boolean(
      process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_BASE64 ||
      process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_FILE ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (process.env.GOOGLE_DOCUMENT_AI_CLIENT_EMAIL && process.env.GOOGLE_DOCUMENT_AI_PRIVATE_KEY) ||
      process.env.GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH === "true"
    );
  return {
    native: createPdfJsNativeExtractionProvider(),
    pageOcr: createOpenRouterVlmPageOcrProvider(),
    structuredPrimary: googleConfigured
      ? createGoogleDocumentAiStructuredExtractionProvider()
      : undefined,
    structuredFallback: isAzureDocumentIntelligenceConfigured()
      ? createAzureDocumentIntelligenceStructuredExtractionProvider()
      : undefined,
  };
}
