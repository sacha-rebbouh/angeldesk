import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { DocumentPageArtifact } from "@/services/pdf";
import { getPdfPageCount } from "@/services/pdf/extractor";

import type {
  PdfProviderDescriptor,
  StructuredPdfExtractionOutput,
  StructuredPdfExtractionProvider,
  StructuredPdfExtractionRequest,
  StructuredPdfPageResult,
} from "./types";

export const GOOGLE_DOCUMENT_AI_PROVIDER_ID = "google-document-ai";

export const GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR: PdfProviderDescriptor = {
  id: GOOGLE_DOCUMENT_AI_PROVIDER_ID,
  label: "Google Document AI",
  kind: "structured_layout",
};

const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GOOGLE_TOKEN_SKEW_MS = 60_000;
const GOOGLE_SYNC_PAGE_LIMIT = 15;
const GOOGLE_CHUNK_RETRY_DELAY_MS = 750;

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedGoogleAccessToken = {
  accessToken: string;
  expiresAt: number;
};

const googleAccessTokenCache = new Map<string, CachedGoogleAccessToken>();

type GoogleTextAnchor = {
  textSegments?: Array<{ startIndex?: string; endIndex?: string }>;
};

type GoogleLayout = {
  textAnchor?: GoogleTextAnchor;
  confidence?: number;
};

type GoogleTableCell = { layout?: GoogleLayout };
type GoogleTableRow = { cells?: GoogleTableCell[] };
type GoogleTable = {
  layout?: GoogleLayout;
  headerRows?: GoogleTableRow[];
  bodyRows?: GoogleTableRow[];
};

type GooglePage = {
  pageNumber?: number;
  layout?: GoogleLayout;
  confidence?: number;
  tables?: GoogleTable[];
};

type GoogleDocumentAiResponse = {
  document?: {
    text?: string;
    pages?: GooglePage[];
  };
};

type GoogleProcessRequestBody = {
  imagelessMode?: boolean;
  processOptions?: {
    individualPageSelector?: {
      pages: number[];
    };
  };
  rawDocument: {
    mimeType: string;
    content: string;
  };
};

function extractProcessorLocation(processorName: string): string | null {
  const match = processorName.match(/\/locations\/([^/]+)\//);
  return match?.[1] ?? null;
}

function resolveGoogleDocumentAiApiBaseUrl(params: {
  processorName: string;
  apiBaseUrl?: string;
}): string {
  if (params.apiBaseUrl) {
    return params.apiBaseUrl.replace(/\/$/, "");
  }

  const location = extractProcessorLocation(params.processorName);
  if (!location) {
    return "https://documentai.googleapis.com/v1";
  }

  return `https://${location}-documentai.googleapis.com/v1`;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function buildGoogleJwtAssertion(params: {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  nowSeconds: number;
}): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: params.clientEmail,
    sub: params.clientEmail,
    aud: params.tokenUri,
    scope: GOOGLE_OAUTH_SCOPE,
    iat: params.nowSeconds,
    exp: params.nowSeconds + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(params.privateKey));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function loadGoogleServiceAccountCredentials(options: {
  serviceAccountJson?: string;
  serviceAccountBase64?: string;
  serviceAccountFilePath?: string;
  clientEmail?: string;
  privateKey?: string;
  tokenUri?: string;
} = {}): Promise<GoogleServiceAccountCredentials | null> {
  const explicitJson = options.serviceAccountJson ?? process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON;
  const explicitBase64 = options.serviceAccountBase64 ?? process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_BASE64;
  const explicitFilePath =
    options.serviceAccountFilePath ??
    process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_FILE ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  let rawJson: string | null = null;

  if (explicitJson) {
    rawJson = explicitJson;
  } else if (explicitBase64) {
    rawJson = Buffer.from(explicitBase64, "base64").toString("utf8");
  } else if (explicitFilePath) {
    rawJson = await readFile(explicitFilePath, "utf8");
  }

  if (rawJson) {
    const parsed = JSON.parse(rawJson) as Partial<GoogleServiceAccountCredentials>;
    if (parsed.client_email && parsed.private_key) {
      return {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key),
        token_uri: parsed.token_uri ?? options.tokenUri ?? process.env.GOOGLE_DOCUMENT_AI_TOKEN_URI ?? GOOGLE_DEFAULT_TOKEN_URI,
      };
    }
  }

  const clientEmail = options.clientEmail ?? process.env.GOOGLE_DOCUMENT_AI_CLIENT_EMAIL;
  const privateKey = options.privateKey ?? process.env.GOOGLE_DOCUMENT_AI_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey),
      token_uri: options.tokenUri ?? process.env.GOOGLE_DOCUMENT_AI_TOKEN_URI ?? GOOGLE_DEFAULT_TOKEN_URI,
    };
  }

  return null;
}

async function fetchGoogleMetadataAccessToken(fetchImpl: typeof fetch): Promise<CachedGoogleAccessToken> {
  const response = await fetchImpl(GOOGLE_METADATA_TOKEN_URL, {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google metadata token fetch failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Google metadata token response did not include an access_token.");
  }

  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max((payload.expires_in ?? 3600) * 1000 - GOOGLE_TOKEN_SKEW_MS, 60_000),
  };
}

async function mintGoogleServiceAccountAccessToken(
  credentials: GoogleServiceAccountCredentials,
  fetchImpl: typeof fetch
): Promise<CachedGoogleAccessToken> {
  const cacheKey = `${credentials.client_email}:${credentials.token_uri ?? GOOGLE_DEFAULT_TOKEN_URI}`;
  const cached = googleAccessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const tokenUri = credentials.token_uri ?? GOOGLE_DEFAULT_TOKEN_URI;
  const assertion = buildGoogleJwtAssertion({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    tokenUri,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  const response = await fetchImpl(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth token mint failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Google OAuth token response did not include an access_token.");
  }

  const token = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max((payload.expires_in ?? 3600) * 1000 - GOOGLE_TOKEN_SKEW_MS, 60_000),
  };
  googleAccessTokenCache.set(cacheKey, token);
  return token;
}

export async function isGoogleDocumentAiAuthConfigured(options: {
  accessToken?: string;
  serviceAccountJson?: string;
  serviceAccountBase64?: string;
  serviceAccountFilePath?: string;
  clientEmail?: string;
  privateKey?: string;
  useMetadataAuth?: boolean;
} = {}): Promise<boolean> {
  if (options.accessToken ?? process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN) {
    return true;
  }
  if (options.useMetadataAuth ?? process.env.GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH === "true") {
    return true;
  }
  const credentials = await loadGoogleServiceAccountCredentials(options);
  return Boolean(credentials);
}

function parseGoogleConfidence(value: unknown): "high" | "medium" | "low" {
  if (typeof value !== "number") return "medium";
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

function resolveGoogleTextAnchor(fullText: string, anchor?: GoogleTextAnchor): string {
  if (!anchor?.textSegments || anchor.textSegments.length === 0) return "";
  return anchor.textSegments
    .map((segment) => {
      const start = Number(segment.startIndex ?? "0");
      const end = Number(segment.endIndex ?? "0");
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
      return fullText.slice(start, end);
    })
    .join("")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function normalizeGoogleTable(fullText: string, table: GoogleTable): StructuredPdfPageResult["tables"][number] {
  const rows = [
    ...(table.headerRows ?? []),
    ...(table.bodyRows ?? []),
  ].map((row) => (row.cells ?? []).map((cell) => resolveGoogleTextAnchor(fullText, cell.layout?.textAnchor)));

  return {
    markdown: rows.map((row) => `| ${row.join(" | ")} |`).join("\n") || undefined,
    rows,
    confidence: parseGoogleConfidence(table.layout?.confidence),
  };
}

function extractGoogleNumericClaims(text: string, confidence: "high" | "medium" | "low"): StructuredPdfPageResult["numericClaims"] {
  const claims: StructuredPdfPageResult["numericClaims"] = [];
  const pattern = /([A-Za-z][A-Za-z0-9 /&().-]{0,48}?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?)/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[1]?.trim();
    const value = match[2]?.trim();
    if (!label || !value) continue;
    claims.push({
      label,
      value,
      unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
      sourceText: match[0].slice(0, 180),
      confidence,
    });
    if (claims.length >= 40) break;
  }
  return claims;
}

export function normalizeGoogleDocumentAiResponse(payload: GoogleDocumentAiResponse): StructuredPdfExtractionOutput {
  const fullText = payload.document?.text ?? "";
  const pages = (payload.document?.pages ?? []).map<StructuredPdfPageResult>((page, index) => {
    const text = resolveGoogleTextAnchor(fullText, page.layout?.textAnchor);
    const confidence = parseGoogleConfidence(page.confidence ?? page.layout?.confidence);
    const tables = (page.tables ?? []).map((table) => normalizeGoogleTable(fullText, table));

    const visualBlocks: DocumentPageArtifact["visualBlocks"] = [];
    if (tables.length > 0) {
      visualBlocks.push({
        type: "table",
        description: `Document AI extracted ${tables.length} table${tables.length > 1 ? "s" : ""} from the page.`,
        confidence,
      });
    }

    const unreadableRegions: DocumentPageArtifact["unreadableRegions"] = confidence === "low"
      ? [{ reason: "Document AI reported low page confidence.", severity: "medium" }]
      : [];

    return {
      pageNumber: page.pageNumber ?? index + 1,
      text,
      confidence,
      visualBlocks,
      tables,
      charts: [],
      unreadableRegions,
      numericClaims: extractGoogleNumericClaims(text, confidence),
      providerPageId: page.pageNumber ? String(page.pageNumber) : undefined,
      raw: page,
    };
  });

  return {
    provider: GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR,
    success: pages.length > 0,
    pageCount: pages.length,
    pages,
    raw: payload,
    error: pages.length === 0 ? "Google Document AI returned no pages" : undefined,
  };
}

function buildGoogleProcessRequestBody(params: {
  buffer: Buffer;
  mimeType: string;
  pageNumbers?: number[];
}): GoogleProcessRequestBody {
  return {
    imagelessMode: true,
    ...(params.pageNumbers && params.pageNumbers.length > 0
      ? {
          processOptions: {
            individualPageSelector: {
              pages: params.pageNumbers,
            },
          },
        }
      : {}),
    rawDocument: {
      mimeType: params.mimeType,
      content: params.buffer.toString("base64"),
    },
  };
}

async function processGoogleDocumentAiChunk(params: {
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
  processorName: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
  pageNumbers?: number[];
}): Promise<StructuredPdfExtractionOutput> {
  const response = await params.fetchImpl(`${params.apiBaseUrl}/${params.processorName}:process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildGoogleProcessRequestBody({
        buffer: params.buffer,
        mimeType: params.mimeType,
        pageNumbers: params.pageNumbers,
      })
    ),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Document AI failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as GoogleDocumentAiResponse;
  return normalizeGoogleDocumentAiResponse(payload);
}

function chunkPageNumbers(pageCount: number, chunkSize = GOOGLE_SYNC_PAGE_LIMIT): number[][] {
  const chunks: number[][] = [];
  for (let start = 1; start <= pageCount; start += chunkSize) {
    const end = Math.min(pageCount, start + chunkSize - 1);
    chunks.push(Array.from({ length: end - start + 1 }, (_, index) => start + index));
  }
  return chunks;
}

function chunkPageNumbersFromList(pageNumbers: number[]): number[][] {
  const midpoint = Math.ceil(pageNumbers.length / 2);
  return [pageNumbers.slice(0, midpoint), pageNumbers.slice(midpoint)].filter((chunk) => chunk.length > 0);
}

function shouldRetryGoogleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b503\b|UNAVAILABLE|deadline exceeded|timed out/i.test(message);
}

function shouldSplitGoogleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b503\b|UNAVAILABLE|deadline exceeded|timed out|At most \d+ pages|PAGE_LIMIT_EXCEEDED|Document pages exceed the limit/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeGoogleStructuredOutputs(outputs: StructuredPdfExtractionOutput[]): StructuredPdfExtractionOutput {
  const pages = outputs
    .flatMap((output) => output.pages)
    .sort((left, right) => left.pageNumber - right.pageNumber);

  return {
    provider: GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR,
    success: pages.length > 0,
    pageCount: pages.length,
    pages,
    raw: outputs.map((output) => output.raw),
    error: pages.length === 0 ? "Google Document AI returned no pages" : undefined,
  };
}

async function processGoogleDocumentAiChunkWithFallback(params: {
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
  processorName: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
  pageNumbers: number[];
  retryAttempt?: number;
}): Promise<StructuredPdfExtractionOutput[]> {
  try {
    const output = await processGoogleDocumentAiChunk({
      fetchImpl: params.fetchImpl,
      apiBaseUrl: params.apiBaseUrl,
      processorName: params.processorName,
      accessToken: params.accessToken,
      buffer: params.buffer,
      mimeType: params.mimeType,
      pageNumbers: params.pageNumbers,
    });
    return [output];
  } catch (error) {
    if (params.pageNumbers.length > 1 && shouldSplitGoogleChunk(error)) {
      const subChunks = chunkPageNumbersFromList(params.pageNumbers);
      const results: StructuredPdfExtractionOutput[] = [];
      for (const subChunk of subChunks) {
        const subResults = await processGoogleDocumentAiChunkWithFallback({
          ...params,
          pageNumbers: subChunk,
          retryAttempt: 0,
        });
        results.push(...subResults);
      }
      return results;
    }

    const retryAttempt = params.retryAttempt ?? 0;
    if (shouldRetryGoogleChunk(error) && retryAttempt < 1) {
      await sleep(GOOGLE_CHUNK_RETRY_DELAY_MS * (retryAttempt + 1));
      return processGoogleDocumentAiChunkWithFallback({
        ...params,
        retryAttempt: retryAttempt + 1,
      });
    }

    throw error;
  }
}

export class GoogleDocumentAiStructuredExtractionProvider implements StructuredPdfExtractionProvider {
  readonly descriptor = GOOGLE_DOCUMENT_AI_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly options: {
      processorName?: string;
      accessToken?: string;
      serviceAccountJson?: string;
      serviceAccountBase64?: string;
      serviceAccountFilePath?: string;
      clientEmail?: string;
      privateKey?: string;
      tokenUri?: string;
      useMetadataAuth?: boolean;
      apiBaseUrl?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async extractFromBuffer(request: StructuredPdfExtractionRequest): Promise<StructuredPdfExtractionOutput> {
    const processorName = this.options.processorName ?? process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME;
    if (!processorName) {
      throw new Error("Google Document AI is not configured. Missing processor name.");
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const explicitAccessToken = this.options.accessToken ?? process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN;
    const useMetadataAuth = this.options.useMetadataAuth ?? process.env.GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH === "true";
    let accessToken = explicitAccessToken;

    if (!accessToken) {
      const credentials = await loadGoogleServiceAccountCredentials({
        serviceAccountJson: this.options.serviceAccountJson,
        serviceAccountBase64: this.options.serviceAccountBase64,
        serviceAccountFilePath: this.options.serviceAccountFilePath,
        clientEmail: this.options.clientEmail,
        privateKey: this.options.privateKey,
        tokenUri: this.options.tokenUri,
      });

      if (credentials) {
        accessToken = (await mintGoogleServiceAccountAccessToken(credentials, fetchImpl)).accessToken;
      } else if (useMetadataAuth) {
        accessToken = (await fetchGoogleMetadataAccessToken(fetchImpl)).accessToken;
      }
    }

    if (!accessToken) {
      throw new Error(
        "Google Document AI is not configured. Set GOOGLE_DOCUMENT_AI_ACCESS_TOKEN, service account credentials, or metadata auth."
      );
    }

    const apiBaseUrl = resolveGoogleDocumentAiApiBaseUrl({
      processorName,
      apiBaseUrl: this.options.apiBaseUrl,
    });

    const mimeType = request.mimeType ?? "application/pdf";
    if (mimeType !== "application/pdf") {
      return processGoogleDocumentAiChunk({
        fetchImpl,
        apiBaseUrl,
        processorName,
        accessToken,
        buffer: request.buffer,
        mimeType,
      });
    }

    const pageCount = await getPdfPageCount(request.buffer);
    if (pageCount === 0 || pageCount <= GOOGLE_SYNC_PAGE_LIMIT) {
      return processGoogleDocumentAiChunk({
        fetchImpl,
        apiBaseUrl,
        processorName,
        accessToken,
        buffer: request.buffer,
        mimeType,
      });
    }

    const pageChunks = chunkPageNumbers(pageCount, GOOGLE_SYNC_PAGE_LIMIT);
    const outputs: StructuredPdfExtractionOutput[] = [];
    for (const pageNumbers of pageChunks) {
      outputs.push(...await processGoogleDocumentAiChunkWithFallback({
        fetchImpl,
        apiBaseUrl,
        processorName,
        accessToken,
        buffer: request.buffer,
        mimeType,
        pageNumbers,
      }));
    }

    return mergeGoogleStructuredOutputs(outputs);
  }
}

export function createGoogleDocumentAiStructuredExtractionProvider(
  options?: ConstructorParameters<typeof GoogleDocumentAiStructuredExtractionProvider>[0]
): StructuredPdfExtractionProvider {
  return new GoogleDocumentAiStructuredExtractionProvider(options);
}
