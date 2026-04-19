/**
 * Excel Service
 *
 * Provides Excel file parsing and text extraction.
 */

export {
  extractFromExcel,
  summarizeForLLM,
  type ExcelExtractionResult,
  type SheetData,
  type FinancialMetrics,
  type WorkbookAuditSummary,
  type SheetAuditSummary,
  type FormulaSample,
} from "./extractor";

export {
  buildExcelModelIntelligence,
  type ExcelModelIntelligence,
} from "./model-intelligence";

export {
  runExcelFinancialAudit,
  type ExcelFinancialAudit,
} from "./financial-audit";

export {
  generateExcelAnalystReport,
  generateExcelAnalystReportForModel,
  buildExcelAnalystPrompt,
  EXCEL_ANALYST_MODEL_CHAIN,
  type ExcelAnalystReport,
} from "./analyst";
