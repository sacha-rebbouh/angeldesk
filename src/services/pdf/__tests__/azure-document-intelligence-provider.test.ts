import { describe, expect, it } from "vitest";

import {
  AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_ID,
  createAzureDocumentIntelligenceStructuredExtractionProvider,
  normalizeAzureDocumentIntelligenceResponse,
} from "../providers";

describe("AzureDocumentIntelligenceStructuredExtractionProvider", () => {
  it("normalizes analyze results into structured page results", () => {
    const payload = {
      status: "succeeded",
      analyzeResult: {
        content: "Metric 2025 Revenue 120",
        pages: [
          {
            pageNumber: 1,
            spans: [{ offset: 0, length: 23 }],
            words: [{ confidence: 0.95 }, { confidence: 0.91 }],
          },
        ],
        tables: [
          {
            boundingRegions: [{ pageNumber: 1 }],
            rowCount: 1,
            columnCount: 2,
            cells: [
              { rowIndex: 0, columnIndex: 0, content: "Revenue" },
              { rowIndex: 0, columnIndex: 1, content: "120" },
            ],
          },
        ],
      },
    };

    const result = normalizeAzureDocumentIntelligenceResponse(payload);

    expect(result.provider.id).toBe(AZURE_DOCUMENT_INTELLIGENCE_PROVIDER_ID);
    expect(result.success).toBe(true);
    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      confidence: "high",
    });
    expect(result.pages[0].tables[0].rows).toEqual([["Revenue", "120"]]);
    expect(result.pages[0].visualBlocks[0]?.type).toBe("table");
  });

  it("throws a clear configuration error when endpoint or key is missing", async () => {
    const provider = createAzureDocumentIntelligenceStructuredExtractionProvider({
      endpoint: undefined,
      apiKey: undefined,
    });

    await expect(provider.extractFromBuffer({ buffer: Buffer.from("pdf") })).rejects.toThrow(
      "Azure Document Intelligence is not configured"
    );
  });
});
