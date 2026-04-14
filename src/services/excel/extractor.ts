/**
 * Excel Extractor Service
 *
 * Extracts text content from Excel files (.xlsx, .xls)
 * Uses SheetJS (xlsx) for parsing.
 *
 * For financial models, also provides structured data extraction.
 */

import * as XLSX from "xlsx";

const MAX_PROMPT_TEXT_PER_WORKBOOK = 120_000;
const MAX_CHARS_PER_SHEET = 6_000;

export interface ExcelExtractionResult {
  success: boolean;
  text: string;
  sheets: SheetData[];
  metadata: {
    sheetCount: number;
    totalRows: number;
    totalCells: number;
    hasFormulas: boolean;
    formulaCount: number;
    hasCharts: boolean;
  };
  error?: string;
}

export interface SheetData {
  name: string;
  classification: SheetClassification;
  hidden: boolean;
  includedInPrompt: boolean;
  truncated: boolean;
  rowCount: number;
  columnCount: number;
  data: string[][]; // Raw cell values as strings
  headers?: string[]; // First row if detected as headers
  textContent: string; // Formatted text representation
  formulaCount: number;
}

export type SheetClassification =
  | "ASSUMPTIONS"
  | "PNL"
  | "CASHFLOW"
  | "CAPTABLE"
  | "CALCULATIONS"
  | "TIMESERIES"
  | "OTHER";

/**
 * Extract text content from an Excel buffer
 */
export function extractFromExcel(buffer: Buffer): ExcelExtractionResult {
  try {
    // Parse the workbook
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,
      cellNF: false,
      cellStyles: false, // Skip styles for performance
    });

    const sheets: SheetData[] = [];
    let totalRows = 0;
    let totalCells = 0;
    const hasFormulas = false;
    const formulaCount = 0;
    const textParts: string[] = [];

    textParts.push(`=== FINANCIAL MODEL EXCEL ===`);
    textParts.push(`Total: ${workbook.SheetNames.length} feuilles`);
    textParts.push(`Budget prompt: ${MAX_PROMPT_TEXT_PER_WORKBOOK} caracteres max | ${MAX_CHARS_PER_SHEET} caracteres max par feuille`);
    textParts.push("");
    textParts.push("== TABLE DES MATIERES ==");

    const parsedSheets: SheetData[] = [];

    // Process each sheet
    for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
      const worksheet = workbook.Sheets[sheetName];
      const hidden = Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden);

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

      // Formulas are intentionally not extracted into prompt text. The xlsx file
      // remains the audit source of truth; values are enough for LLM analysis.
      for (const cellAddress in worksheet) {
        if (cellAddress[0] === "!") continue;
        const cell = worksheet[cellAddress];
        if (cell.v !== undefined) totalCells++;
      }

      const classification = classifySheet(sheetName, data);
      const includedInPrompt = !hidden && classification !== "CALCULATIONS";
      const sheetText = includedInPrompt
        ? formatSheetForLLM({
          name: sheetName,
          classification,
          hidden,
          includedInPrompt,
          truncated: false,
          rowCount,
          columnCount,
          data,
          headers,
          textContent: "",
          formulaCount: 0,
        }, MAX_CHARS_PER_SHEET)
        : `\n=== FEUILLE: ${sheetName} ===\nClassification: ${classification} | Dimensions: ${rowCount} lignes x ${columnCount} colonnes\n[Feuille exclue du prompt: ${hidden ? "hidden sheet" : "calculation/helper sheet"}]\n`;

      parsedSheets.push({
        name: sheetName,
        classification,
        hidden,
        includedInPrompt,
        truncated: sheetText.length >= MAX_CHARS_PER_SHEET,
        rowCount,
        columnCount,
        data,
        headers,
        textContent: sheetText,
        formulaCount: 0,
      });

      totalRows += rowCount;
    }

    for (const [index, sheet] of parsedSheets.entries()) {
      textParts.push(`${index + 1}. [${sheet.name}] - ${sheet.classification} - ${sheet.rowCount} lignes x ${sheet.columnCount} colonnes${sheet.hidden ? " - HIDDEN" : ""}${sheet.includedInPrompt ? "" : " - STUB_ONLY"}`);
    }
    textParts.push("");
    textParts.push("IMPORTANT: Les formules ne sont pas dumpées dans le prompt. Les valeurs calculées sont extraites; le fichier Excel original reste la source d'audit.");
    textParts.push("");

    for (const sheet of parsedSheets) {
      if (textParts.join("\n").length >= MAX_PROMPT_TEXT_PER_WORKBOOK) break;
      textParts.push(sheet.textContent);
    }

    sheets.push(...parsedSheets);

    // Combine all text
    const combinedText = textParts.join("\n");
    const fullText = combinedText.length > MAX_PROMPT_TEXT_PER_WORKBOOK
      ? `${combinedText.slice(0, MAX_PROMPT_TEXT_PER_WORKBOOK - 180)}\n\n[TRONQUE: workbook promptText borne a ${MAX_PROMPT_TEXT_PER_WORKBOOK} caracteres. Le fichier Excel original reste disponible pour audit.]`
      : combinedText;

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
        formulaCount,
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
        formulaCount: 0,
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

function classifySheet(sheetName: string, data: string[][]): SheetClassification {
  const normalizedName = normalizeForClassification(sheetName);
  if (/assumpt|hypoth|input/.test(normalizedName)) return "ASSUMPTIONS";
  if (/p.?n?.?l|profit|loss|income/.test(normalizedName)) return "PNL";
  if (/cash.?flow|tresor/.test(normalizedName)) return "CASHFLOW";
  if (/cap.?table|sharehold/.test(normalizedName)) return "CAPTABLE";
  if (/calc|aux|helper|work/.test(normalizedName)) return "CALCULATIONS";

  const firstRows = data.slice(0, 8);
  const dateColumnCount = Math.max(0, ...firstRows.map((row) => detectDateColumns(row).length));
  if (dateColumnCount > 6) return "TIMESERIES";

  const sample = normalizeForClassification(firstRows.flat().join(" "));
  if (/assumpt|hypoth|input/.test(sample)) return "ASSUMPTIONS";
  if (/revenue|ebitda|gross margin|profit|loss|income|pnl/.test(sample)) return "PNL";
  if (/cash flow|cashflow|runway|burn|tresor/.test(sample)) return "CASHFLOW";
  if (/cap table|sharehold|dilution|option pool|esop/.test(sample)) return "CAPTABLE";
  return "OTHER";
}

function normalizeForClassification(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

  let output = `\n=== FEUILLE: ${name} ===\n`;
  output += `Classification: ${sheet.classification} | Dimensions: ${sheet.rowCount} lignes x ${sheet.columnCount} colonnes\n`;

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
    const values: string[] = [];

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
