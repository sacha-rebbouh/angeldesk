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
const MAX_FORMULA_SAMPLES_PER_SHEET = 12;
const MAX_KEY_METRICS_PER_SHEET = 16;

export interface FormulaSample {
  cell: string;
  formula: string;
  value: string;
  precedentRefs: string[];
}

export interface SheetAuditSummary {
  role: SheetRole;
  formulaDensity: number;
  nonEmptyCellCount: number;
  inputCellCount: number;
  formulaCellCount: number;
  hardcodedNumericCount: number;
  dateColumnCount: number;
  keyMetricLabels: string[];
  formulaSamples: FormulaSample[];
  warningFlags: string[];
}

export interface WorkbookAuditSummary {
  hiddenSheets: string[];
  assumptionSheets: string[];
  outputSheets: string[];
  calcSheets: string[];
  criticalSheets: string[];
  formulaHeavySheets: string[];
  warningFlags: string[];
}

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
    hiddenSheetCount: number;
  };
  workbookAudit: WorkbookAuditSummary;
  error?: string;
}

export interface SheetData {
  name: string;
  classification: SheetClassification;
  role: SheetRole;
  hidden: boolean;
  includedInPrompt: boolean;
  truncated: boolean;
  rowCount: number;
  columnCount: number;
  data: string[][]; // Raw cell values as strings
  headers?: string[]; // First row if detected as headers
  textContent: string; // Formatted text representation
  formulaCount: number;
  audit: SheetAuditSummary;
}

export type SheetClassification =
  | "ASSUMPTIONS"
  | "PNL"
  | "CASHFLOW"
  | "CAPTABLE"
  | "CALCULATIONS"
  | "TIMESERIES"
  | "OTHER";

export type SheetRole =
  | "INPUTS"
  | "CALC_ENGINE"
  | "OUTPUTS"
  | "SUPPORTING_DATA"
  | "LEGAL"
  | "UNKNOWN";

/**
 * Extract text content from an Excel buffer
 */
export function extractFromExcel(buffer: Buffer): ExcelExtractionResult {
  try {
    // Parse the workbook
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellNF: false,
      cellStyles: false, // Skip styles for performance
    });

    const sheets: SheetData[] = [];
    let totalRows = 0;
    let totalCells = 0;
    let formulaCount = 0;
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

      const classification = classifySheet(sheetName, data);
      const role = inferSheetRole(sheetName, classification, data);
      const audit = buildSheetAudit({
        sheetName,
        classification,
        role,
        worksheet,
        data,
      });
      totalCells += audit.nonEmptyCellCount;
      formulaCount += audit.formulaCellCount;
      const includedInPrompt = !hidden && classification !== "CALCULATIONS";
      const sheetText = includedInPrompt
        ? formatSheetForLLM({
          name: sheetName,
          classification,
          role,
          hidden,
          includedInPrompt,
          truncated: false,
          rowCount,
          columnCount,
          data,
          headers,
          textContent: "",
          formulaCount: audit.formulaCellCount,
          audit,
        }, MAX_CHARS_PER_SHEET)
        : `\n=== FEUILLE: ${sheetName} ===\nClassification: ${classification} | Dimensions: ${rowCount} lignes x ${columnCount} colonnes\n[Feuille exclue du prompt: ${hidden ? "hidden sheet" : "calculation/helper sheet"}]\n`;

      parsedSheets.push({
        name: sheetName,
        classification,
        role,
        hidden,
        includedInPrompt,
        truncated: sheetText.length >= MAX_CHARS_PER_SHEET,
        rowCount,
        columnCount,
        data,
        headers,
        textContent: sheetText,
        formulaCount: audit.formulaCellCount,
        audit,
      });

      totalRows += rowCount;
    }

    const workbookAudit = buildWorkbookAudit(parsedSheets);

    for (const [index, sheet] of parsedSheets.entries()) {
      textParts.push(`${index + 1}. [${sheet.name}] - ${sheet.classification} / ${sheet.role} - ${sheet.rowCount} lignes x ${sheet.columnCount} colonnes${sheet.hidden ? " - HIDDEN" : ""}${sheet.includedInPrompt ? "" : " - STUB_ONLY"}`);
    }
    textParts.push("");
    textParts.push(`Formules detectees: ${formulaCount} | Feuilles cachees: ${workbookAudit.hiddenSheets.length}`);
    if (workbookAudit.warningFlags.length > 0) {
      textParts.push(`Signaux workbook: ${workbookAudit.warningFlags.join(" | ")}`);
    }
    textParts.push("IMPORTANT: Les formules ne sont pas dumpées intégralement dans le prompt. Les valeurs calculées, échantillons de lineage et signaux d'audit sont extraits; le fichier Excel original reste la source d'audit.");
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
        hasFormulas: formulaCount > 0,
        formulaCount,
        hasCharts,
        hiddenSheetCount: workbookAudit.hiddenSheets.length,
      },
      workbookAudit,
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
        hiddenSheetCount: 0,
      },
      workbookAudit: {
        hiddenSheets: [],
        assumptionSheets: [],
        outputSheets: [],
        calcSheets: [],
        criticalSheets: [],
        formulaHeavySheets: [],
        warningFlags: [],
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

function inferSheetRole(sheetName: string, classification: SheetClassification, data: string[][]): SheetRole {
  const normalizedName = normalizeForClassification(sheetName);
  const sample = normalizeForClassification(data.slice(0, 12).flat().join(" "));
  const annualSummaryLike = looksLikeCompactAnnualSummarySheet(data);
  const operationalTimeseriesLike = looksLikeOperationalTimeseriesSheet(data);

  if (/confidential|disclaimer|non-reliance/.test(normalizedName)) return "LEGAL";
  if (/output|overview|summary|pptx/.test(normalizedName)) return "OUTPUTS";
  if (annualSummaryLike) return "OUTPUTS";
  if (classification === "ASSUMPTIONS" || /driver|input/.test(normalizedName)) return "INPUTS";
  if (classification === "CALCULATIONS" || /^p\d+$/.test(normalizedName) || /^uw$/.test(normalizedName)) return "CALC_ENGINE";
  if (operationalTimeseriesLike) return "CALC_ENGINE";
  if (classification === "PNL" || classification === "CASHFLOW" || classification === "TIMESERIES") {
    if (/overview|output|metric|kpi|return|uses|sources/.test(sample)) return "OUTPUTS";
    return "CALC_ENGINE";
  }
  if (classification === "CAPTABLE") return "OUTPUTS";
  if (/historical|comp|benchmark|budget|cost/.test(normalizedName)) return "SUPPORTING_DATA";
  return "UNKNOWN";
}

function buildSheetAudit(params: {
  sheetName: string;
  classification: SheetClassification;
  role: SheetRole;
  worksheet: XLSX.WorkSheet;
  data: string[][];
}): SheetAuditSummary {
  let nonEmptyCellCount = 0;
  let formulaCellCount = 0;
  let inputCellCount = 0;
  let hardcodedNumericCount = 0;
  const formulaSamples: FormulaSample[] = [];

  for (const cellAddress in params.worksheet) {
    if (cellAddress[0] === "!") continue;
    const cell = params.worksheet[cellAddress] as XLSX.CellObject | undefined;
    if (!cell || (cell.v == null && cell.w == null && cell.f == null)) continue;
    nonEmptyCellCount++;

    const displayValue = formatCellValue(cell.w ?? cell.v ?? "");
    if (typeof cell.f === "string" && cell.f.trim().length > 0) {
      formulaCellCount++;
      if (formulaSamples.length < MAX_FORMULA_SAMPLES_PER_SHEET) {
        formulaSamples.push({
          cell: cellAddress,
          formula: cell.f,
          value: displayValue,
          precedentRefs: extractFormulaRefs(cell.f),
        });
      }
    } else {
      inputCellCount++;
      if (isNumericValue(displayValue)) {
        hardcodedNumericCount++;
      }
    }
  }

  const dateColumnCount = Math.max(0, ...params.data.slice(0, 12).map((row) => detectDateColumns(row).length));
  const keyMetricLabels = extractKeyMetricLabels(params.data);
  const formulaDensity = nonEmptyCellCount > 0 ? formulaCellCount / nonEmptyCellCount : 0;
  const warningFlags: string[] = [];

  if (formulaDensity >= 0.7) warningFlags.push("formula_heavy");
  if (hardcodedNumericCount >= 100 && params.role !== "INPUTS") warningFlags.push("hardcoded_numeric_load");
  if (params.role === "OUTPUTS" && formulaCellCount < 10 && hardcodedNumericCount > 20) warningFlags.push("output_sheet_hardcoded");
  if (params.role === "INPUTS" && hardcodedNumericCount < 10) warningFlags.push("few_manual_drivers_detected");
  if (params.classification === "TIMESERIES" && dateColumnCount < 4) warningFlags.push("weak_timeseries_header_detection");

  return {
    role: params.role,
    formulaDensity,
    nonEmptyCellCount,
    inputCellCount,
    formulaCellCount,
    hardcodedNumericCount,
    dateColumnCount,
    keyMetricLabels,
    formulaSamples,
    warningFlags,
  };
}

function buildWorkbookAudit(sheets: SheetData[]): WorkbookAuditSummary {
  const hiddenSheets = sheets.filter((sheet) => sheet.hidden).map((sheet) => sheet.name);
  const assumptionSheets = sheets.filter((sheet) => sheet.role === "INPUTS").map((sheet) => sheet.name);
  const outputSheets = sheets.filter((sheet) => sheet.role === "OUTPUTS").map((sheet) => sheet.name);
  const calcSheets = sheets.filter((sheet) => sheet.role === "CALC_ENGINE").map((sheet) => sheet.name);
  const criticalSheets = sheets
    .filter((sheet) => sheet.role === "INPUTS" || sheet.role === "OUTPUTS" || /uw/i.test(sheet.name))
    .map((sheet) => sheet.name);
  const formulaHeavySheets = sheets
    .filter((sheet) => sheet.audit.formulaDensity >= 0.7)
    .map((sheet) => sheet.name);
  const warningFlags: string[] = [];

  if (assumptionSheets.length === 0) warningFlags.push("no_assumption_sheet_detected");
  if (outputSheets.length === 0) warningFlags.push("no_output_sheet_detected");
  if (hiddenSheets.some((name) => criticalSheets.includes(name))) warningFlags.push("hidden_critical_sheet");
  if (formulaHeavySheets.length >= Math.max(3, Math.ceil(sheets.length / 3))) warningFlags.push("model_is_formula_dense");

  return {
    hiddenSheets,
    assumptionSheets,
    outputSheets,
    calcSheets,
    criticalSheets,
    formulaHeavySheets,
    warningFlags,
  };
}

function normalizeForClassification(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLikeCompactAnnualSummarySheet(data: string[][]): boolean {
  const sampleRows = data.slice(0, 24);
  const annualHeaderRows = sampleRows.filter((row) => countAnnualSummaryHeaders(row) >= 4).length;
  const kpiRows = sampleRows.filter((row) => isSummaryKpiRow(row)).length;
  const majorKpiRows = sampleRows.filter((row) => {
    const label = extractPrimaryTextLabel(row);
    return /\b(total revenue|revenue|sales|ebitda|cash flow|profit|arr|mrr|valuation|irr|moic)\b/i.test(label);
  }).length;
  const totalRows = sampleRows.filter((row) => row.some((cell) => /\btotal\b/i.test(String(cell ?? "").trim()))).length;

  return annualHeaderRows >= 1 && kpiRows >= 4 && majorKpiRows >= 2 && totalRows >= 1;
}

function looksLikeOperationalTimeseriesSheet(data: string[][]): boolean {
  const sampleRows = data.slice(0, 24);
  const monthlyHeaderRows = sampleRows.filter((row) => detectDateColumns(row).length >= 4).length;
  const metricRows = sampleRows.filter((row) => {
    const label = extractPrimaryTextLabel(row);
    if (!label) return false;
    const numericCells = row.filter((cell) => /\$|€|£|%|-?\d/.test(String(cell ?? "").trim())).length;
    return numericCells >= 4;
  }).length;

  return monthlyHeaderRows >= 1 && metricRows >= 4;
}

function countAnnualSummaryHeaders(row: string[]): number {
  return row.filter((cell) => {
    const trimmed = String(cell ?? "").trim();
    return /^(20\d{2}|fy\d{2,4}|total)$/i.test(trimmed);
  }).length;
}

function isSummaryKpiRow(row: string[]): boolean {
  const label = extractPrimaryTextLabel(row);
  if (!label) return false;
  if (!/\b(revenue|sales|ebitda|cash flow|profit|income|arr|mrr|cost|opex|capex|debt|equity|valuation|irr|moic|margin)\b/i.test(label)) {
    return false;
  }

  const numericCells = row.filter((cell) => {
    const trimmed = String(cell ?? "").trim();
    return /\$|€|£|%|-?\d/.test(trimmed);
  }).length;

  return numericCells >= 3;
}

function extractPrimaryTextLabel(row: string[]): string {
  for (const cell of row.slice(0, 4)) {
    const trimmed = String(cell ?? "").trim();
    if (!trimmed) continue;
    if (/^\$?-?\d[\d,]*(?:\.\d+)?%?$/.test(trimmed)) continue;
    return trimmed;
  }
  return "";
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
  output += `Classification: ${sheet.classification} | Role: ${sheet.role} | Dimensions: ${sheet.rowCount} lignes x ${sheet.columnCount} colonnes\n`;
  output += `Audit: ${sheet.audit.nonEmptyCellCount} cellules non vides | ${sheet.audit.formulaCellCount} formules | ${sheet.audit.inputCellCount} cellules manuelles | densite formules ${(sheet.audit.formulaDensity * 100).toFixed(1)}%\n`;
  if (sheet.audit.keyMetricLabels.length > 0) {
    output += `Lignes clefs: ${sheet.audit.keyMetricLabels.join(" | ")}\n`;
  }
  if (sheet.audit.warningFlags.length > 0) {
    output += `Points de vigilance: ${sheet.audit.warningFlags.join(" | ")}\n`;
  }
  if (sheet.audit.formulaSamples.length > 0) {
    output += "Lineage (echantillon):\n";
    for (const sample of sheet.audit.formulaSamples.slice(0, 4)) {
      output += `- ${sample.cell}: =${sample.formula} => ${sample.value}${sample.precedentRefs.length > 0 ? ` | refs: ${sample.precedentRefs.slice(0, 6).join(", ")}` : ""}\n`;
    }
  }

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

export function summarizeForLLM(result: ExcelExtractionResult, maxChars: number = 50_000): string {
  return result.text.length <= maxChars
    ? result.text
    : `${result.text.slice(0, maxChars - 120)}\n\n[TRONQUE: resume workbook borne a ${maxChars} caracteres pour le prompt.]`;
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

function extractKeyMetricLabels(data: string[][]): string[] {
  const keywords = [
    "revenue", "ebitda", "cash", "irr", "moic", "ltv", "ltc", "yield", "occupancy",
    "rent", "capex", "opex", "debt", "equity", "exit", "entry", "margin", "valuation",
    "sources", "uses", "stabilized", "niy", "yoc"
  ];
  const labels: string[] = [];
  for (const row of data.slice(0, 160)) {
    for (const cell of row.slice(0, 4)) {
      const text = String(cell ?? "").trim();
      if (!text) continue;
      const lower = normalizeForClassification(text);
      if (keywords.some((keyword) => lower.includes(keyword)) && !labels.includes(text)) {
        labels.push(text);
        if (labels.length >= MAX_KEY_METRICS_PER_SHEET) return labels;
      }
    }
  }
  return labels;
}

function extractFormulaRefs(formula: string): string[] {
  const refs = formula.match(/(?:'[^']+'|[A-Za-z0-9_]+)?!?[$]?[A-Z]{1,3}[$]?\d+(?::[$]?[A-Z]{1,3}[$]?\d+)?/g) ?? [];
  return Array.from(new Set(refs)).slice(0, 12);
}
