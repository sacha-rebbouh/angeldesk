import type { DocumentPageArtifact } from "@/services/pdf";

import type {
  PdfProviderDescriptor,
  StructuredPdfExtractionOutput,
  StructuredPdfExtractionProvider,
  StructuredPdfExtractionRequest,
  StructuredPdfPageResult,
} from "./types";

export const AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_ID = "azure-document-intelligence";

export const AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR: PdfProviderDescriptor = {
  id: AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_ID,
  label: "Azure Document Intelligence",
  kind: "structured_layout",
};

type AzureSpan = { offset?: number; length?: number };
type AzureBoundingRegion = { pageNumber?: number };
type AzureTableCell = {
  content?: string;
  rowIndex?: number;
  columnIndex?: number;
  kind?: string;
};

type AzurePage = {
  pageNumber?: number;
  words?: Array<{ confidence?: number }>;
  spans?: AzureSpan[];
};

type AzureTable = {
  boundingRegions?: AzureBoundingRegion[];
  rowCount?: number;
  columnCount?: number;
  cells?: AzureTableCell[];
};

type AzureAnalyzeResult = {
  content?: string;
  pages?: AzurePage[];
  tables?: AzureTable[];
};

type AzureAnalyzeResponse = {
  status?: string;
  analyzeResult?: AzureAnalyzeResult;
};

function parseAzureConfidence(values: number[]): "high" | "medium" | "low" {
  if (values.length === 0) return "medium";
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg >= 0.85) return "high";
  if (avg >= 0.6) return "medium";
  return "low";
}

function resolveAzureSpans(content: string, spans: AzureSpan[] | undefined): string {
  if (!spans || spans.length === 0) return "";
  return spans
    .map((span) => {
      const offset = span.offset ?? 0;
      const length = span.length ?? 0;
      return length > 0 ? content.slice(offset, offset + length) : "";
    })
    .join("")
    .trim();
}

function normalizeAzureTable(table: AzureTable): StructuredPdfPageResult["tables"][number] {
  const rowCount = table.rowCount ?? 0;
  const columnCount = table.columnCount ?? 0;
  const rows = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ""));

  for (const cell of table.cells ?? []) {
    const rowIndex = cell.rowIndex ?? 0;
    const columnIndex = cell.columnIndex ?? 0;
    if (rows[rowIndex] && typeof rows[rowIndex][columnIndex] !== "undefined") {
      rows[rowIndex][columnIndex] = cell.content ?? "";
    }
  }

  return {
    markdown: rows.map((row) => `| ${row.join(" | ")} |`).join("\n") || undefined,
    rows,
    confidence: "medium",
  };
}

function extractAzureNumericClaims(text: string, confidence: "high" | "medium" | "low"): StructuredPdfPageResult["numericClaims"] {
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

export function normalizeAzureDocumentIntelligenceResponse(payload: AzureAnalyzeResponse): StructuredPdfExtractionOutput {
  const analyzeResult = payload.analyzeResult ?? {};
  const content = analyzeResult.content ?? "";
  const tablesByPage = new Map<number, StructuredPdfPageResult["tables"]>();

  for (const table of analyzeResult.tables ?? []) {
    const pageNumber = table.boundingRegions?.[0]?.pageNumber ?? 1;
    const normalizedTable = normalizeAzureTable(table);
    tablesByPage.set(pageNumber, [...(tablesByPage.get(pageNumber) ?? []), normalizedTable]);
  }

  const pages = (analyzeResult.pages ?? []).map<StructuredPdfPageResult>((page, index) => {
    const pageNumber = page.pageNumber ?? index + 1;
    const text = resolveAzureSpans(content, page.spans);
    const confidence = parseAzureConfidence((page.words ?? []).map((word) => word.confidence ?? 0));
    const tables = tablesByPage.get(pageNumber) ?? [];
    const visualBlocks: DocumentPageArtifact["visualBlocks"] = [];
    if (tables.length > 0) {
      visualBlocks.push({
        type: "table",
        description: `Azure extracted ${tables.length} table${tables.length > 1 ? "s" : ""} from the page.`,
        confidence,
      });
    }

    const unreadableRegions: DocumentPageArtifact["unreadableRegions"] = confidence === "low"
      ? [{ reason: "Azure Document Intelligence reported low word confidence.", severity: "medium" }]
      : [];

    return {
      pageNumber,
      text,
      confidence,
      visualBlocks,
      tables,
      charts: [],
      unreadableRegions,
      numericClaims: extractAzureNumericClaims(text, confidence),
      providerPageId: String(pageNumber),
      raw: page,
    };
  });

  return {
    provider: AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR,
    success: pages.length > 0,
    pageCount: pages.length,
    pages,
    raw: payload,
    error: pages.length === 0 ? "Azure Document Intelligence returned no pages" : undefined,
  };
}

export class AzureDocumentIntelligenceStructuredExtractionProvider implements StructuredPdfExtractionProvider {
  readonly descriptor = AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly options: {
      endpoint?: string;
      apiKey?: string;
      modelId?: string;
      apiVersion?: string;
      pollIntervalMs?: number;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async extractFromBuffer(request: StructuredPdfExtractionRequest): Promise<StructuredPdfExtractionOutput> {
    const endpoint = (this.options.endpoint ?? process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT)?.replace(/\/$/, "");
    const apiKey = this.options.apiKey ?? process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
    const modelId = this.options.modelId ?? process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? "prebuilt-layout";
    const apiVersion = this.options.apiVersion ?? process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";

    if (!endpoint || !apiKey) {
      throw new Error("Azure Document Intelligence is not configured. Missing endpoint or API key.");
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const submitResponse = await fetchImpl(
      `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
          "Content-Type": request.mimeType ?? "application/pdf",
        },
        body: new Uint8Array(request.buffer),
      },
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Azure Document Intelligence failed: ${submitResponse.status} ${errorText}`);
    }

    const operationLocation = submitResponse.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Azure Document Intelligence did not return an operation-location header.");
    }

    const pollIntervalMs = this.options.pollIntervalMs ?? 500;
    for (let attempt = 0; attempt < 20; attempt++) {
      const pollResponse = await fetchImpl(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      });
      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        throw new Error(`Azure Document Intelligence poll failed: ${pollResponse.status} ${errorText}`);
      }
      const payload = await pollResponse.json() as AzureAnalyzeResponse;
      if (payload.status === "succeeded") {
        return normalizeAzureDocumentIntelligenceResponse(payload);
      }
      if (payload.status === "failed") {
        throw new Error("Azure Document Intelligence analysis failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("Azure Document Intelligence polling timed out.");
  }
}

export function createAzureDocumentIntelligenceStructuredExtractionProvider(
  options?: ConstructorParameters<typeof AzureDocumentIntelligenceStructuredExtractionProvider>[0]
): StructuredPdfExtractionProvider {
  return new AzureDocumentIntelligenceStructuredExtractionProvider(options);
}
