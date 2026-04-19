import { beforeEach, describe, expect, it, vi } from "vitest";

const extractTextFromPDFMock = vi.fn();
const extractTextFromPDFUrlMock = vi.fn();

vi.mock("../extractor", () => ({
  extractTextFromPDF: extractTextFromPDFMock,
  extractTextFromPDFUrl: extractTextFromPDFUrlMock,
}));

describe("PdfJsNativeExtractionProvider", () => {
  beforeEach(() => {
    extractTextFromPDFMock.mockReset();
    extractTextFromPDFUrlMock.mockReset();
  });

  it("delegates buffer extraction to the current pdfjs extractor and normalizes the result", async () => {
    extractTextFromPDFMock.mockResolvedValue({
      success: true,
      text: "[Page 1 - Native PDF text]\nRevenue 10",
      pageTexts: ["[Page 1 - Native PDF text]\nRevenue 10"],
      pageCount: 1,
      info: { title: "Memo", author: "Analyst", creationDate: "D:20260419" },
      quality: {
        metrics: {
          qualityScore: 88,
          totalWords: 2,
          avgWordsPerPage: 2,
          pageContentDistribution: [10],
          emptyPages: 0,
          lowContentPages: 0,
          garbageCharRatio: 0,
          fragmentedTextRatio: 0,
          repetitionScore: 0,
          keywordMatchCount: 1,
        },
        warnings: [],
        isUsable: true,
        requiresOCR: false,
        summary: "Good extraction",
      },
    });

    const { createPdfJsNativeExtractionProvider, PDFJS_NATIVE_PROVIDER_ID } = await import("../providers");
    const provider = createPdfJsNativeExtractionProvider();
    const result = await provider.extractFromBuffer({ buffer: Buffer.from("pdf") });

    expect(extractTextFromPDFMock).toHaveBeenCalledWith(Buffer.from("pdf"));
    expect(result.provider.id).toBe(PDFJS_NATIVE_PROVIDER_ID);
    expect(result.metadata).toEqual({
      title: "Memo",
      author: "Analyst",
      creationDate: "D:20260419",
    });
    expect(result.quality?.score).toBe(88);
    expect(result.pageCount).toBe(1);
    expect(result.raw.text).toContain("Revenue 10");
  });

  it("delegates URL extraction when available", async () => {
    extractTextFromPDFUrlMock.mockResolvedValue({
      success: false,
      text: "",
      pageTexts: [],
      pageCount: 0,
      info: {},
      error: "download failed",
    });

    const { createPdfJsNativeExtractionProvider } = await import("../providers");
    const provider = createPdfJsNativeExtractionProvider();
    const result = await provider.extractFromUrl!({ url: "https://example.com/doc.pdf" });

    expect(extractTextFromPDFUrlMock).toHaveBeenCalledWith("https://example.com/doc.pdf");
    expect(result.success).toBe(false);
    expect(result.error).toBe("download failed");
  });
});
