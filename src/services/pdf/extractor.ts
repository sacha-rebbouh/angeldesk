import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";

// Point to the actual worker file for Node.js/serverless environments
GlobalWorkerOptions.workerSrc = path.resolve(
  process.cwd(),
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
);
import {
  analyzeExtractionQuality,
  QualityAnalysisResult,
  ExtractionQualityMetrics,
  ExtractionWarning
} from "./quality-analyzer";

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

  // Quality analysis (new)
  quality?: QualityAnalysisResult;
}

export type { ExtractionQualityMetrics, ExtractionWarning };

interface PDFMetadataInfo {
  Title?: string;
  Author?: string;
  CreationDate?: string;
  [key: string]: unknown;
}

/**
 * Extract text content from a PDF buffer
 */
export async function extractTextFromPDF(
  buffer: Buffer
): Promise<PDFExtractionResult> {
  try {
    const loadingTask = getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const totalPages = pdf.numPages;

    // Extract text from all pages
    const pageTexts: string[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => "str" in item && typeof (item as Record<string, unknown>).str === "string")
        .map((item) => (item as { str: string }).str)
        .join(" ");
      pageTexts.push(pageText);
    }

    // Get metadata if available
    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as PDFMetadataInfo | undefined;

    const textContent = pageTexts.join("\n");

    // Clean up extracted text
    const cleanedText = cleanExtractedText(textContent);

    // Analyze extraction quality
    const quality = analyzeExtractionQuality(cleanedText, totalPages);

    // Log quality issues for debugging
    if (quality.warnings.length > 0) {
      console.warn(`PDF extraction quality issues (${quality.metrics.qualityScore}%):`,
        quality.warnings.map(w => w.message).join('; ')
      );
    }

    return {
      text: cleanedText,
      pageCount: totalPages,
      info: {
        title: info?.Title,
        author: info?.Author,
        creationDate: info?.CreationDate,
      },
      success: true,
      quality,
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
