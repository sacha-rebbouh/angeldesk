import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const { getPdfPageCountMock } = vi.hoisted(() => ({
  getPdfPageCountMock: vi.fn(),
}));

vi.mock("@/services/pdf/extractor", () => ({
  getPdfPageCount: getPdfPageCountMock,
}));

import {
  createGoogleDocumentAiStructuredExtractionProvider,
  GOOGLE_DOCUMENT_AI_PROVIDER_ID,
  isGoogleDocumentAiAuthConfigured,
  normalizeGoogleDocumentAiResponse,
} from "../providers";

describe("GoogleDocumentAiStructuredExtractionProvider", () => {
  it("chunks PDFs beyond 15 pages into multiple online requests and reconciles the pages", async () => {
    getPdfPageCountMock.mockResolvedValue(57);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk one",
            pages: [
              {
                pageNumber: 1,
                confidence: 0.91,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
              {
                pageNumber: 15,
                confidence: 0.88,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk two",
            pages: [
              {
                pageNumber: 16,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
              {
                pageNumber: 30,
                confidence: 0.89,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk three",
            pages: [
              {
                pageNumber: 31,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
              {
                pageNumber: 45,
                confidence: 0.87,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "9" }] } },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk four",
            pages: [
              {
                pageNumber: 46,
                confidence: 0.88,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "10" }] } },
              },
              {
                pageNumber: 57,
                confidence: 0.87,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "10" }] } },
              },
            ],
          },
        }),
      });

    const provider = createGoogleDocumentAiStructuredExtractionProvider({
      processorName: "projects/test/locations/europe-west2/processors/456",
      accessToken: "bearer-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.extractFromBuffer({
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body))).toMatchObject({
      imagelessMode: true,
      processOptions: {
        individualPageSelector: {
          pages: Array.from({ length: 15 }, (_, index) => index + 1),
        },
      },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit)?.body))).toMatchObject({
      imagelessMode: true,
      processOptions: {
        individualPageSelector: {
          pages: Array.from({ length: 15 }, (_, index) => index + 16),
        },
      },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit)?.body))).toMatchObject({
      imagelessMode: true,
      processOptions: {
        individualPageSelector: {
          pages: Array.from({ length: 15 }, (_, index) => index + 31),
        },
      },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit)?.body))).toMatchObject({
      imagelessMode: true,
      processOptions: {
        individualPageSelector: {
          pages: Array.from({ length: 12 }, (_, index) => index + 46),
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.pageCount).toBe(8);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 15, 16, 30, 31, 45, 46, 57]);
  });

  it("recursively splits a chunk when Google times out on a larger page range", async () => {
    getPdfPageCountMock.mockResolvedValue(20);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({
          error: {
            code: 503,
            message: "Request deadline exceeded.",
            status: "UNAVAILABLE",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk A",
            pages: [
              {
                pageNumber: 1,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
              {
                pageNumber: 8,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk B",
            pages: [
              {
                pageNumber: 9,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
              {
                pageNumber: 15,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Chunk C",
            pages: [
              {
                pageNumber: 16,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
              {
                pageNumber: 20,
                confidence: 0.9,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "7" }] } },
              },
            ],
          },
        }),
      });

    const provider = createGoogleDocumentAiStructuredExtractionProvider({
      processorName: "projects/test/locations/europe-west2/processors/456",
      accessToken: "bearer-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.extractFromBuffer({
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body))).toMatchObject({
      processOptions: { individualPageSelector: { pages: Array.from({ length: 15 }, (_, index) => index + 1) } },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit)?.body))).toMatchObject({
      processOptions: { individualPageSelector: { pages: Array.from({ length: 8 }, (_, index) => index + 1) } },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit)?.body))).toMatchObject({
      processOptions: { individualPageSelector: { pages: Array.from({ length: 7 }, (_, index) => index + 9) } },
    });
    expect(result.success).toBe(true);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 8, 9, 15, 16, 20]);
  });

  it("normalizes document text anchors and tables into structured page results", () => {
    const payload = {
      document: {
        text: "Revenue bridge\nRevenue\n120\nEBITDA\n45",
        pages: [
          {
            pageNumber: 1,
            confidence: 0.92,
            layout: {
              textAnchor: {
                textSegments: [{ startIndex: "0", endIndex: "36" }],
              },
            },
            tables: [
              {
                layout: { confidence: 0.88 },
                bodyRows: [
                  {
                    cells: [
                      { layout: { textAnchor: { textSegments: [{ startIndex: "15", endIndex: "22" }] } } },
                      { layout: { textAnchor: { textSegments: [{ startIndex: "23", endIndex: "26" }] } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = normalizeGoogleDocumentAiResponse(payload);

    expect(result.provider.id).toBe(GOOGLE_DOCUMENT_AI_PROVIDER_ID);
    expect(result.success).toBe(true);
    expect(result.pageCount).toBe(1);
    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      confidence: "high",
    });
    expect(result.pages[0].tables[0].rows).toEqual([["Revenue", "120"]]);
    expect(result.pages[0].visualBlocks[0]?.type).toBe("table");
  });

  it("throws a clear configuration error when credentials are missing", async () => {
    getPdfPageCountMock.mockReset();
    const provider = createGoogleDocumentAiStructuredExtractionProvider({
      processorName: undefined,
      accessToken: undefined,
    });

    await expect(provider.extractFromBuffer({ buffer: Buffer.from("pdf") })).rejects.toThrow(
      "Google Document AI is not configured"
    );
  });

  it("mints an access token from a service account and calls Document AI without a bearer env token", async () => {
    getPdfPageCountMock.mockResolvedValue(1);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "service-account-token", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: {
            text: "Revenue 120",
            pages: [
              {
                pageNumber: 1,
                confidence: 0.91,
                layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "11" }] } },
              },
            ],
          },
        }),
      });

    const provider = createGoogleDocumentAiStructuredExtractionProvider({
      processorName: "projects/test/locations/eu/processors/123",
      serviceAccountJson: JSON.stringify({
        client_email: "doc-ai@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        token_uri: "https://oauth2.googleapis.com/token",
      }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.extractFromBuffer({ buffer: Buffer.from("pdf") });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://eu-documentai.googleapis.com/v1/projects/test/locations/eu/processors/123:process");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit)?.headers).toMatchObject({
      Authorization: "Bearer service-account-token",
    });
  });

  it("uses the exact processor location for regional endpoints", async () => {
    getPdfPageCountMock.mockResolvedValue(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ document: { text: "", pages: [] } }),
      });

    const provider = createGoogleDocumentAiStructuredExtractionProvider({
      processorName: "projects/test/locations/europe-west2/processors/456",
      accessToken: "bearer-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.extractFromBuffer({ buffer: Buffer.from("pdf") });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://europe-west2-documentai.googleapis.com/v1/projects/test/locations/europe-west2/processors/456:process"
    );
  });

  it("detects service account auth configuration without an access token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    await expect(isGoogleDocumentAiAuthConfigured({
      serviceAccountJson: JSON.stringify({
        client_email: "doc-ai@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      }),
    })).resolves.toBe(true);
  });
});
