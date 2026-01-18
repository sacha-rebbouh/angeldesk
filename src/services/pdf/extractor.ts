import { extractText, getDocumentProxy } from "unpdf";

export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  info: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
  success: boolean;
  error?: string;
}

/**
 * Extract text content from a PDF buffer
 */
export async function extractTextFromPDF(
  buffer: Buffer
): Promise<PDFExtractionResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    // Get metadata if available
    const metadata = await pdf.getMetadata().catch(() => null);

    // Clean up extracted text
    const cleanedText = cleanExtractedText(
      typeof text === "string" ? text : text.join("\n")
    );

    return {
      text: cleanedText,
      pageCount: totalPages,
      info: {
        title: metadata?.info?.Title as string | undefined,
        author: metadata?.info?.Author as string | undefined,
        creationDate: metadata?.info?.CreationDate as string | undefined,
      },
      success: true,
    };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return {
      text: "",
      pageCount: 0,
      info: {},
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extract text from a PDF URL (Vercel Blob or any public URL)
 */
export async function extractTextFromPDFUrl(
  url: string
): Promise<PDFExtractionResult> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        text: "",
        pageCount: 0,
        info: {},
        success: false,
        error: `Failed to fetch PDF: ${response.status} ${response.statusText}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return extractTextFromPDF(buffer);
  } catch (error) {
    console.error("PDF URL fetch error:", error);
    return {
      text: "",
      pageCount: 0,
      info: {},
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Clean extracted text:
 * - Remove excessive whitespace
 * - Normalize line breaks
 * - Remove control characters
 */
function cleanExtractedText(text: string): string {
  return (
    text
      // Remove null bytes and control characters (except newlines)
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize different types of whitespace
      .replace(/[ \t]+/g, " ")
      // Remove lines that are just whitespace
      .replace(/^\s+$/gm, "")
      // Collapse multiple newlines into max 2
      .replace(/\n{3,}/g, "\n\n")
      // Trim start and end
      .trim()
  );
}
