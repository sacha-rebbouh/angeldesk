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
  pageTexts: string[];
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

    // Extract text from all pages using spatial layout reconstruction
    const pageTexts: string[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = reconstructTextFromItems(content.items);
      pageTexts.push(pageText);
    }

    // Get metadata if available
    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as PDFMetadataInfo | undefined;

    // Clean each page independently and preserve page boundaries. Downstream
    // strict extraction depends on this to prove page-level coverage.
    const cleanedPageTexts = pageTexts.map((pageText, index) =>
      `[Page ${index + 1} - Native PDF text]\n${cleanExtractedText(pageText)}`
    );
    const cleanedText = cleanedPageTexts.join("\n\f\n");

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
      pageTexts: cleanedPageTexts,
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
      pageTexts: [],
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
        pageTexts: [],
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
      pageTexts: [],
      pageCount: 0,
      info: {},
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface TextItemWithTransform {
  str: string;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, x, y]
  width: number;
  height: number;
  hasEOL?: boolean;
}

/**
 * Reconstruct readable text from pdfjs-dist text items using spatial positions.
 * Keynote/Apple PDFs fragment text into many tiny pieces — naive .join(" ")
 * produces gibberish. This uses (x, y) coordinates to detect line breaks
 * and word boundaries.
 */
function reconstructTextFromItems(items: unknown[]): string {
  // Filter to valid text items with transform data
  const textItems: TextItemWithTransform[] = items.filter((item): item is TextItemWithTransform => {
    const t = item as Record<string, unknown>;
    return typeof t.str === "string" && Array.isArray(t.transform) && t.transform.length >= 6;
  });

  if (textItems.length === 0) return "";

  // Sort by Y descending (PDF Y=0 is bottom), then X ascending
  textItems.sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > 2) return yDiff; // Different lines (2pt tolerance)
    return a.transform[4] - b.transform[4]; // Same line: left to right
  });

  const lines: string[] = [];
  let currentLine = "";
  let prevY = textItems[0].transform[5];
  let prevX = textItems[0].transform[4];
  let prevWidth = 0;

  for (const item of textItems) {
    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 12;
    const lineThreshold = fontSize * 0.6; // Y gap > 60% of font size = new line

    if (Math.abs(prevY - y) > lineThreshold) {
      // New line detected
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = item.str;
    } else {
      // Same line — check horizontal gap for word boundary
      const expectedX = prevX + prevWidth;
      const gap = x - expectedX;
      const spaceWidth = fontSize * 0.25;

      if (currentLine.length > 0 && gap > spaceWidth) {
        // Significant gap → insert space (if not already ending with one)
        if (!currentLine.endsWith(" ") && !item.str.startsWith(" ")) {
          currentLine += " ";
        }
      } else if (currentLine.length > 0 && gap < -spaceWidth * 2) {
        // Large negative gap → probably overlapping/new section, add space
        if (!currentLine.endsWith(" ")) currentLine += " ";
      }
      currentLine += item.str;
    }

    prevY = y;
    prevX = x;
    prevWidth = item.width || (item.str.length * fontSize * 0.5);
  }

  // Don't forget last line
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines.join("\n");
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
