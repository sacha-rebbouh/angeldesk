/**
 * Excel Extractor Service
 *
 * Extracts text content from Excel files (.xlsx, .xls)
 * Uses SheetJS (xlsx) for parsing.
 *
 * For financial models, also provides structured data extraction.
 */

import * as XLSX from "xlsx";

export interface ExcelExtractionResult {
  success: boolean;
  text: string;
  sheets: SheetData[];
  metadata: {
    sheetCount: number;
    totalRows: number;
    totalCells: number;
    hasFormulas: boolean;
    hasCharts: boolean;
  };
  error?: string;
}

export interface SheetData {
  name: string;
  rowCount: number;
  columnCount: number;
  data: string[][]; // Raw cell values as strings
  headers?: string[]; // First row if detected as headers
  textContent: string; // Formatted text representation
}

/**
 * Extract text content from an Excel buffer
 */
export function extractFromExcel(buffer: Buffer): ExcelExtractionResult {
  try {
    // Parse the workbook
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellNF: true,
      cellStyles: false, // Skip styles for performance
    });

    const sheets: SheetData[] = [];
    let totalRows = 0;
    let totalCells = 0;
    let hasFormulas = false;
    let textParts: string[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Get range
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
      const rowCount = range.e.r - range.s.r + 1;
      const columnCount = range.e.c - range.s.c + 1;

      // Convert to array of arrays
      const data: string[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as string[][];

      // Detect headers (first row with content)
      const headers = data.length > 0 ? data[0].map(String) : undefined;

      // Check for formulas
      for (const cellAddress in worksheet) {
        if (cellAddress[0] === "!") continue;
        const cell = worksheet[cellAddress];
        if (cell.f) hasFormulas = true;
        if (cell.v !== undefined) totalCells++;
      }

      // Build text representation of the sheet
      let sheetText = `\n=== FEUILLE: ${sheetName} ===\n`;

      // Format as table-like text
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.some((cell) => cell !== "")) {
          // Skip empty rows
          const rowText = row
            .map((cell) => String(cell).trim())
            .filter((cell) => cell !== "")
            .join(" | ");
          if (rowText) {
            sheetText += rowText + "\n";
          }
        }
      }

      sheets.push({
        name: sheetName,
        rowCount,
        columnCount,
        data,
        headers,
        textContent: sheetText,
      });

      totalRows += rowCount;
      textParts.push(sheetText);
    }

    // Combine all text
    const fullText = textParts.join("\n");

    // Check for charts (SheetJS doesn't extract chart data, but we can detect presence)
    // Charts are stored in the workbook but not easily accessible
    const hasCharts = false; // Would need deeper parsing

    return {
      success: true,
      text: fullText,
      sheets,
      metadata: {
        sheetCount: workbook.SheetNames.length,
        totalRows,
        totalCells,
        hasFormulas,
        hasCharts,
      },
    };
  } catch (error) {
    console.error("[ExcelExtractor] Error:", error);
    return {
      success: false,
      text: "",
      sheets: [],
      metadata: {
        sheetCount: 0,
        totalRows: 0,
        totalCells: 0,
        hasFormulas: false,
        hasCharts: false,
      },
      error: error instanceof Error ? error.message : "Unknown error parsing Excel file",
    };
  }
}

/**
 * Extract financial metrics from an Excel file (for financial models)
 * Uses LLM to understand the structure and extract key metrics
 */
export interface FinancialMetrics {
  revenue?: { current?: number; projected?: number[]; currency?: string };
  costs?: { current?: number; projected?: number[]; currency?: string };
  ebitda?: { current?: number; projected?: number[]; currency?: string };
  cashflow?: { current?: number; projected?: number[]; currency?: string };
  headcount?: { current?: number; projected?: number[] };
  runway?: number; // months
  burnRate?: number;
  assumptions?: Record<string, string>;
  years?: string[];
}

/**
 * Summarize Excel content for LLM analysis
 * Returns a condensed, LLM-readable version with smart formatting
 *
 * IMPORTANT: Processes ALL sheets - never truncates sheets silently
 */
export function summarizeForLLM(result: ExcelExtractionResult, maxChars: number = 50000): string {
  if (!result.success) return "";

  // First, build a TABLE OF CONTENTS so LLM knows what sheets exist
  let summary = `=== FINANCIAL MODEL EXCEL ===\n`;
  summary += `Total: ${result.metadata.sheetCount} feuilles | ${result.metadata.totalCells} cellules | Formules: ${result.metadata.hasFormulas ? "Oui" : "Non"}\n\n`;

  // TABLE OF CONTENTS - always include ALL sheet names
  summary += `== TABLE DES MATIERES ==\n`;
  for (let i = 0; i < result.sheets.length; i++) {
    const sheet = result.sheets[i];
    const preview = getSheetPreview(sheet);
    summary += `${i + 1}. [${sheet.name}] - ${sheet.rowCount} lignes - ${preview}\n`;
  }
  summary += `\n⚠️ IMPORTANT: Tu DOIS analyser CHAQUE onglet ci-dessus. Ne saute aucun onglet.\n\n`;

  // Calculate chars per sheet to ensure all sheets get space
  const headerLength = summary.length;
  const availableChars = maxChars - headerLength;
  const charsPerSheet = Math.floor(availableChars / result.sheets.length);

  // Process EACH sheet - never skip any
  for (const sheet of result.sheets) {
    const sheetSummary = formatSheetForLLM(sheet, Math.max(charsPerSheet, 2000));
    if (sheetSummary) {
      summary += sheetSummary + "\n";
    }
  }

  // If we exceed maxChars, truncate but add a warning
  if (summary.length > maxChars) {
    const truncatedSummary = summary.substring(0, maxChars - 100);
    return truncatedSummary + `\n\n[... TRONQUÉ - ${result.metadata.sheetCount} onglets présents, analyser chacun ...]`;
  }

  return summary;
}

/**
 * Get a brief preview of what a sheet contains
 */
function getSheetPreview(sheet: SheetData): string {
  const { data } = sheet;
  if (data.length === 0) return "Vide";

  // Look for keywords in first few rows to describe content
  const keywords: string[] = [];
  const financialKeywords = ["revenue", "arr", "mrr", "cost", "burn", "ebitda", "profit", "loss", "cash", "capex"];
  const projectionKeywords = ["projection", "forecast", "budget", "plan", "target", "objectif"];
  const assumptionKeywords = ["assumption", "hypothèse", "hypothesis", "paramètre"];

  const textContent = data.slice(0, 10).flat().join(" ").toLowerCase();

  if (financialKeywords.some(k => textContent.includes(k))) keywords.push("Données financières");
  if (projectionKeywords.some(k => textContent.includes(k))) keywords.push("Projections");
  if (assumptionKeywords.some(k => textContent.includes(k))) keywords.push("Hypothèses");

  // Check for dates/years
  const hasYears = /20\d{2}/.test(textContent);
  if (hasYears) keywords.push("Timeline");

  return keywords.length > 0 ? keywords.join(", ") : "Données";
}

/**
 * Format a single sheet for LLM readability
 * Detects financial data and formats it vertically
 *
 * @param maxChars - Max chars for this sheet (ensures fair distribution across sheets)
 */
function formatSheetForLLM(sheet: SheetData, maxChars: number = 5000): string {
  const { name, data } = sheet;

  if (data.length === 0) return `\n--- ${name.toUpperCase()} --- (Vide)\n`;

  let output = `\n--- ${name.toUpperCase()} ---\n`;

  // Detect if this looks like a financial table (many date columns)
  const firstRow = data[0] || [];
  const dateColumns = detectDateColumns(firstRow);

  // If we have many date columns, this is likely a time-series financial table
  // Format it vertically for readability
  if (dateColumns.length > 6) {
    output += formatFinancialTable(data, dateColumns);
  } else {
    // Regular table - format as key-value pairs
    output += formatRegularTable(data);
  }

  // Ensure we don't exceed maxChars for this sheet
  if (output.length > maxChars) {
    return output.substring(0, maxChars - 50) + `\n[... ${name}: suite tronquée ...]\n`;
  }

  return output;
}

/**
 * Detect columns that look like dates or periods
 */
function detectDateColumns(row: string[]): number[] {
  const datePatterns = [
    /^\d{1,2}[-\/]\w{3}[-\/]\d{2,4}$/, // 30-Jul-18, 01/Jan/2020
    /^\d{4}$/, // 2019, 2020
    /^[1-4]Q\d{2,4}$/, // 1Q19, 4Q2021
    /^Q[1-4][-\s]?\d{2,4}$/, // Q1 2021
    /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/, // 01/01/2020
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i, // Jan 2020
  ];

  const indices: number[] = [];
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i]).trim();
    if (datePatterns.some(p => p.test(cell))) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Format a financial table with many date columns
 * Groups by year and shows key metrics vertically
 */
function formatFinancialTable(data: string[][], dateColumns: number[]): string {
  let output = "";

  // Find year columns (annual totals) - look for cells with just a year or annual indicators
  const yearPattern = /^(20\d{2}|FY\d{2,4}|\d{4}|Y\d+)$/;
  const annualColumns: number[] = [];

  const firstRow = data[0] || [];
  for (let i = 0; i < firstRow.length; i++) {
    const cell = String(firstRow[i]).trim();
    if (yearPattern.test(cell) || cell.includes("TOTAL") || cell.includes("Annual")) {
      annualColumns.push(i);
    }
  }

  // If we found annual columns, use those; otherwise use last few date columns
  const columnsToShow = annualColumns.length > 0
    ? annualColumns.slice(-5)
    : dateColumns.slice(-5);

  // Get headers for these columns
  const headers = columnsToShow.map(i => String(firstRow[i] || `Col${i}`).trim());

  // Keywords that indicate important financial metrics
  const importantMetrics = [
    "revenue", "total", "arr", "mrr", "gross", "net", "ebitda", "profit", "loss",
    "cost", "expense", "burn", "runway", "cash", "capex", "opex", "margin",
    "headcount", "employees", "fte", "growth", "churn", "cac", "ltv", "arpu"
  ];

  // Process each row
  for (let rowIdx = 1; rowIdx < data.length && rowIdx < 100; rowIdx++) {
    const row = data[rowIdx];
    if (!row || row.length === 0) continue;

    // Get the row label (first non-empty cell)
    let label = "";
    for (let i = 0; i < Math.min(5, row.length); i++) {
      const cell = String(row[i] || "").trim();
      if (cell && !isNumericValue(cell)) {
        label = cell;
        break;
      }
    }

    if (!label) continue;

    // Check if this is an important metric
    const labelLower = label.toLowerCase();
    const isImportant = importantMetrics.some(m => labelLower.includes(m));

    // Get values for the columns we want to show
    const values = columnsToShow.map(colIdx => {
      const val = row[colIdx];
      return formatCellValue(val);
    }).filter(v => v !== "");

    if (values.length === 0) continue;

    // Format output
    if (isImportant) {
      output += `\n**${label}**\n`;
      for (let i = 0; i < values.length && i < headers.length; i++) {
        output += `  ${headers[i]}: ${values[i]}\n`;
      }
    } else if (values.some(v => v !== "-" && v !== "0" && v !== "")) {
      // Only show non-empty rows
      output += `${label}: ${values.join(" → ")}\n`;
    }
  }

  return output;
}

/**
 * Format a regular table as key-value pairs
 */
function formatRegularTable(data: string[][]): string {
  let output = "";

  for (let rowIdx = 0; rowIdx < data.length && rowIdx < 50; rowIdx++) {
    const row = data[rowIdx];
    if (!row || row.length === 0) continue;

    // Find label and value
    let label = "";
    let values: string[] = [];

    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] || "").trim();
      if (!cell) continue;

      if (!label && !isNumericValue(cell)) {
        label = cell;
      } else if (cell) {
        values.push(formatCellValue(cell));
      }
    }

    if (label && values.length > 0) {
      output += `${label}: ${values.slice(0, 5).join(" | ")}\n`;
    } else if (label) {
      output += `\n[${label}]\n`;
    }
  }

  return output;
}

/**
 * Check if a value looks numeric (including currency)
 */
function isNumericValue(val: string): boolean {
  if (!val) return false;
  const cleaned = val.replace(/[€$£,\s%]/g, "").replace(/[()]/g, "-");
  return !isNaN(parseFloat(cleaned)) || cleaned === "-";
}

/**
 * Format a cell value for display
 */
function formatCellValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";

  const str = String(val).trim();
  if (str === "0" || str === "-   €" || str === "-  €" || str === "- €") return "-";

  // Clean up number formatting
  if (str.includes("€")) {
    return str.replace(/\s+/g, " ");
  }

  return str;
}
