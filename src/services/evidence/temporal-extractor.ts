/**
 * Phase 2 — Deterministic temporal extractor for EvidenceSignal.
 *
 * Pure functions (no DB). Given a document's metadata + decrypted extractedText,
 * returns a list of ExtractedTemporalSignal candidates. The caller maps each
 * candidate to scope key + extractionRunId and persists via createEvidenceSignal.
 *
 * Discipline (Codex round 6):
 *  - parserDebug.regex contains the STATIC regex pattern only, never matched text.
 *  - matched text always goes in evidenceText (which gets encrypted by
 *    createEvidenceSignal). evidenceText is capped at 280 chars (audit gate).
 *  - no Document mutation here — only signal candidates.
 *
 * Anti-naïveté (Codex Phase 2 gate):
 *  - multi-year decks without a clear footer date do NOT receive DOCUMENT_DATE.
 *  - filename-only signals are MEDIUM confidence; OCR-derived are HIGH.
 *    Both can co-exist as distinct rows; the read-path (Phase 5) picks.
 */

import { createHash } from "crypto";
import type {
  DocumentType,
  EvidenceSignalConfidence,
  EvidenceSignalKind,
  EvidenceSignalMethod,
  EvidenceSignalPrecision,
} from "@prisma/client";
import type { EvidenceSignalMetadata } from "@/services/evidence-signals/metadata-schema";

export const TEMPORAL_EXTRACTOR_VERSION = "temporal-extractor@2026-05-18-001";

export type DerivedFrom = "extracted_text" | "filename" | "source_metadata";

export interface TemporalExtractorInput {
  documentName: string;
  documentType: DocumentType;
  mimeType: string | null;
  /** Decrypted plaintext; caller is responsible for safeDecrypt. */
  extractedText: string | null;
  sourceKind: "FILE" | "EMAIL" | "NOTE";
  /** Already-validated email metadata from email-source-inference, or null. */
  sourceMetadata: unknown;
  /** Pre-existing Document.sourceDate (e.g. set by email inference). */
  documentSourceDate: Date | null;
}

export interface ExtractedTemporalSignal {
  derivedFrom: DerivedFrom;
  kind: EvidenceSignalKind;
  valueJson: Record<string, unknown>;
  evidenceText: string | null;
  pageNumber: number | null;
  sheetName: string | null;
  charOffset: number | null;
  dateStart: Date | null;
  dateEnd: Date | null;
  asOfDate: Date | null;
  reportedAt: Date | null;
  precision: EvidenceSignalPrecision;
  confidence: EvidenceSignalConfidence;
  sourceMethod: EvidenceSignalMethod;
  sourceTextHash: string | null;
  metadata: EvidenceSignalMetadata | null;
}

// ============================================================
// Public entry point
// ============================================================
export function runTemporalExtractor(input: TemporalExtractorInput): ExtractedTemporalSignal[] {
  const signals: ExtractedTemporalSignal[] = [];
  const text = input.extractedText ?? "";

  // 1. EMAIL_SENT_AT — mirror existing Document.sourceDate when sourceKind=EMAIL
  signals.push(...extractEmailSentAt(input));

  // 2. CAP_TABLE_AS_OF — "Table de capitalisation à jour au DD/MM/YYYY"
  if (text) signals.push(...extractCapTableAsOf(text, input.documentType));

  // 3. BALANCE_SHEET_AS_OF + FINANCIAL_PERIOD_ACTUAL (FR bilan)
  if (text) signals.push(...extractFrenchBilan(text, input.documentType));

  // 4. FINANCIAL_PERIOD_ACTUAL (EN P&L)
  if (text) signals.push(...extractEnglishProfitAndLoss(text, input.documentType));

  // 5. FINANCIAL_PERIOD_FORECAST — 4+ consecutive years in column header
  if (text) signals.push(...extractFinancialForecast(text, input.documentType));

  // 6. DOCUMENT_DATE deck footer — "<Company> Confidential – Month YYYY"
  if (text) signals.push(...extractDocumentDateFromFooter(text));

  // 7. DOCUMENT_DATE filename — only if unambiguous AND no HIGH-confidence
  //    document date was already produced (anti-naïveté).
  const hasHighConfidenceDocDate = signals.some(
    (s) => s.kind === "DOCUMENT_DATE" && s.confidence === "HIGH"
  );
  if (!hasHighConfidenceDocDate) {
    signals.push(...extractDocumentDateFromFilename(input.documentName, text, input.documentType));
  }

  return signals;
}

// ============================================================
// Extractor #1 — EMAIL_SENT_AT
// ============================================================
function extractEmailSentAt(input: TemporalExtractorInput): ExtractedTemporalSignal[] {
  if (input.sourceKind !== "EMAIL" || !input.documentSourceDate) return [];

  const meta = input.sourceMetadata && typeof input.sourceMetadata === "object"
    ? (input.sourceMetadata as { threadMessages?: unknown[] })
    : null;

  const valueJson: Record<string, unknown> = {
    sentAt: input.documentSourceDate.toISOString(),
    source: "email-source-inference",
  };
  if (Array.isArray(meta?.threadMessages)) {
    valueJson.threadMessageCount = meta.threadMessages.length;
  }

  return [
    {
      derivedFrom: "source_metadata",
      kind: "EMAIL_SENT_AT",
      valueJson,
      evidenceText: null,
      pageNumber: null,
      sheetName: null,
      charOffset: null,
      dateStart: null,
      dateEnd: null,
      asOfDate: null,
      reportedAt: input.documentSourceDate,
      precision: "DAY",
      confidence: "HIGH",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: null,
      metadata: null,
    },
  ];
}

// ============================================================
// Extractor #2 — CAP_TABLE_AS_OF
// ============================================================
// `u` flag + non-`\b` before `à` because JS word boundary doesn't recognize
// accented letters as word characters in non-Unicode mode.
const CAP_TABLE_AS_OF_PATTERN = /(?:Table\s+de\s+capitalisation|cap(?:[\s.])?\s*table)[^\n]{0,80}?(?:à|a)\s+jour\s+au\s+(\d{1,2})[\s./-](\d{1,2}|[A-Za-zéûôî]{3,12})[\s./-](\d{2,4})/iu;
const CAP_TABLE_AS_OF_PATTERN_ID = "cap-table-as-of-fr";

function extractCapTableAsOf(text: string, documentType: DocumentType): ExtractedTemporalSignal[] {
  const eligible = documentType === "CAP_TABLE" || /\btable\s+de\s+capitalisation\b|\bcap\s*table\b/i.test(text);
  if (!eligible) return [];

  const match = text.match(CAP_TABLE_AS_OF_PATTERN);
  if (!match || match.index === undefined) return [];

  const [whole, day, monthRaw, yearRaw] = match;
  const date = parseDate(day, monthRaw, yearRaw);
  if (!date) return [];

  const evidence = clipEvidence(text, match.index, whole.length);

  return [
    {
      derivedFrom: "extracted_text",
      kind: "CAP_TABLE_AS_OF",
      valueJson: {
        asOf: date.toISOString().slice(0, 10),
      },
      evidenceText: evidence,
      pageNumber: null,
      sheetName: null,
      charOffset: match.index,
      dateStart: null,
      dateEnd: null,
      asOfDate: date,
      reportedAt: null,
      precision: "DAY",
      confidence: "HIGH",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(evidence),
      metadata: {
        parserDebug: {
          patternId: CAP_TABLE_AS_OF_PATTERN_ID,
          matchCount: 1,
        },
      },
    },
  ];
}

// ============================================================
// Extractor #3 — BALANCE_SHEET_AS_OF + FINANCIAL_PERIOD_ACTUAL (FR)
// ============================================================
const PERIODE_DU_PATTERN = /Période\s+du\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+au\s+(\d{1,2}\/\d{1,2}\/\d{4})/i;
const PERIODE_DU_PATTERN_ID = "fr-bilan-periode-du-au";
// The closing date is often on the next line after "Exercice clos le", separated
// by header tokens like "Exercice précédent". Allow up to 80 chars including newlines.
const EXERCICE_CLOS_PATTERN = /Exercice\s+clos\s+le[\s\S]{0,80}?(\d{1,2}\/\d{1,2}\/\d{4})/i;
const EXERCICE_CLOS_PATTERN_ID = "fr-bilan-exercice-clos";

function extractFrenchBilan(text: string, documentType: DocumentType): ExtractedTemporalSignal[] {
  if (documentType !== "FINANCIAL_STATEMENTS" && documentType !== "OTHER") return [];

  const out: ExtractedTemporalSignal[] = [];

  const period = text.match(PERIODE_DU_PATTERN);
  if (period && period.index !== undefined) {
    const start = parseDmy(period[1]);
    const end = parseDmy(period[2]);
    if (start && end) {
      const evidence = clipEvidence(text, period.index, period[0].length);
      out.push({
        derivedFrom: "extracted_text",
        kind: "FINANCIAL_PERIOD_ACTUAL",
        valueJson: {
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
          yearsCovered: yearsBetween(start, end),
        },
        evidenceText: evidence,
        pageNumber: null,
        sheetName: null,
        charOffset: period.index,
        dateStart: start,
        dateEnd: end,
        asOfDate: null,
        reportedAt: null,
        precision: "RANGE",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
        sourceTextHash: sha256(evidence),
        metadata: { parserDebug: { patternId: PERIODE_DU_PATTERN_ID, matchCount: 1 } },
      });
    }
  }

  const closure = text.match(EXERCICE_CLOS_PATTERN);
  if (closure && closure.index !== undefined) {
    const asOf = parseDmy(closure[1]);
    if (asOf) {
      const evidence = clipEvidence(text, closure.index, closure[0].length);
      out.push({
        derivedFrom: "extracted_text",
        kind: "BALANCE_SHEET_AS_OF",
        valueJson: { asOf: asOf.toISOString().slice(0, 10) },
        evidenceText: evidence,
        pageNumber: null,
        sheetName: null,
        charOffset: closure.index,
        dateStart: null,
        dateEnd: null,
        asOfDate: asOf,
        reportedAt: null,
        precision: "DAY",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
        sourceTextHash: sha256(evidence),
        metadata: { parserDebug: { patternId: EXERCICE_CLOS_PATTERN_ID, matchCount: 1 } },
      });
    }
  }

  return out;
}

// ============================================================
// Extractor #4 — FINANCIAL_PERIOD_ACTUAL (EN P&L)
// ============================================================
const EN_PL_PATTERN = /For\s+the\s+(\d{1,2})\s+months?\s+ended\s+(\d{1,2})?\s*([A-Za-z]+)\s+(\d{4})/i;
const EN_PL_PATTERN_ID = "en-pl-for-the-x-months-ended";

function extractEnglishProfitAndLoss(text: string, documentType: DocumentType): ExtractedTemporalSignal[] {
  if (documentType !== "FINANCIAL_STATEMENTS" && documentType !== "OTHER") return [];

  const match = text.match(EN_PL_PATTERN);
  if (!match || match.index === undefined) return [];

  const [whole, monthsRaw, dayRaw, monthName, yearRaw] = match;
  const months = Number(monthsRaw);
  const end = parseDate(dayRaw ?? "31", monthName, yearRaw);
  if (!end || months <= 0 || months > 24) return [];

  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months + 1, 1));
  const evidence = clipEvidence(text, match.index, whole.length);

  return [
    {
      derivedFrom: "extracted_text",
      kind: "FINANCIAL_PERIOD_ACTUAL",
      valueJson: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        yearsCovered: yearsBetween(start, end),
        monthsCovered: months,
      },
      evidenceText: evidence,
      pageNumber: null,
      sheetName: null,
      charOffset: match.index,
      dateStart: start,
      dateEnd: end,
      asOfDate: null,
      reportedAt: null,
      precision: "RANGE",
      confidence: "HIGH",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(evidence),
      metadata: { parserDebug: { patternId: EN_PL_PATTERN_ID, matchCount: 1 } },
    },
  ];
}

// ============================================================
// Extractor #5 — FINANCIAL_PERIOD_FORECAST (multi-year column header)
// ============================================================
// Bare-years pattern: "2026 2027 2028 2029 2030" — ambiguous outside a financial
// context (could be a roadmap, milestones, history). Requires financial context
// (cf. Codex round 7 P1 fix).
const FORECAST_PATTERN_BARE_YEARS = /\b(20\d{2})\s+(20\d{2})\s+(20\d{2})\s+(20\d{2})(?:\s+(20\d{2}))?\b/g;
// "Dec-26 Dec-27..." and "FY2026 FY2027..." are inherently financial markers,
// the prefix makes the intent unambiguous → no extra context check needed.
const FORECAST_PATTERN_DECYY = /\bDec-(\d{2})\s+Dec-(\d{2})\s+Dec-(\d{2})\s+Dec-(\d{2})(?:\s+Dec-(\d{2}))?\b/g;
const FORECAST_PATTERN_FYYYYY = /\bFY(20\d{2})\s+FY(20\d{2})\s+FY(20\d{2})\s+FY(20\d{2})(?:\s+FY(20\d{2}))?\b/g;
const FORECAST_PATTERN_ID = "multi-year-column-header";

// Financial keyword vocabulary checked in a ±CONTEXT_WINDOW char window around
// a bare-years match. Matches if ANY token is present (case-insensitive).
const FORECAST_CONTEXT_KEYWORDS = [
  // English
  "revenue", "revenues", "arr", "mrr", "ebitda", "ebit", "forecast",
  "p&l", "p l", "fy", "budget", "sales", "income", "profit", "loss",
  "cash flow", "burn", "runway", "opex", "capex", "valuation",
  "cogs", "gross margin", "net income", "operating", "projection",
  // French
  "chiffre d'affaires", "ca ht", "ca total", "ca ", "bénéfice", "benefice",
  "charges", "produits", "prévi", "previ", "résultat", "resultat",
  "exercice", "trésorerie", "tresorerie", "marge", "rentabilité",
  "rentabilite", "compte de résultat", "compte de resultat",
] as const;
const FORECAST_CONTEXT_WINDOW = 120;

function hasFinancialContext(text: string, matchIndex: number, matchLength: number): boolean {
  const start = Math.max(0, matchIndex - FORECAST_CONTEXT_WINDOW);
  const end = Math.min(text.length, matchIndex + matchLength + FORECAST_CONTEXT_WINDOW);
  const window = text.slice(start, end).toLowerCase();
  return FORECAST_CONTEXT_KEYWORDS.some((kw) => window.includes(kw));
}

function isFinancialDocType(documentType: DocumentType): boolean {
  return documentType === "FINANCIAL_MODEL" || documentType === "FINANCIAL_STATEMENTS";
}

function extractFinancialForecast(text: string, documentType: DocumentType): ExtractedTemporalSignal[] {
  const candidates = new Map<string, { years: number[]; index: number; whole: string; permissive: boolean }>();

  // Permissive patterns: prefix encodes financial intent.
  for (const re of [FORECAST_PATTERN_DECYY, FORECAST_PATTERN_FYYYYY]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const years = parseForecastYears(m);
      if (!years) continue;
      const key = years.join("-");
      if (!candidates.has(key)) {
        candidates.set(key, { years, index: m.index, whole: m[0], permissive: true });
      }
    }
  }

  // Ambiguous bare-years pattern: gated by doc type OR nearby financial keyword.
  FORECAST_PATTERN_BARE_YEARS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FORECAST_PATTERN_BARE_YEARS.exec(text)) !== null) {
    const years = parseForecastYears(m);
    if (!years) continue;
    const key = years.join("-");
    if (candidates.has(key)) continue; // already covered by a permissive variant
    const allow = isFinancialDocType(documentType) || hasFinancialContext(text, m.index, m[0].length);
    if (!allow) continue;
    candidates.set(key, { years, index: m.index, whole: m[0], permissive: false });
  }

  if (candidates.size === 0) return [];

  const out: ExtractedTemporalSignal[] = [];
  for (const { years, index, whole } of candidates.values()) {
    const start = new Date(Date.UTC(years[0], 0, 1));
    const end = new Date(Date.UTC(years[years.length - 1], 11, 31));
    const evidence = clipEvidence(text, index, whole.length);
    out.push({
      derivedFrom: "extracted_text",
      kind: "FINANCIAL_PERIOD_FORECAST",
      valueJson: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        yearsCovered: years,
      },
      evidenceText: evidence,
      pageNumber: null,
      sheetName: null,
      charOffset: index,
      dateStart: start,
      dateEnd: end,
      asOfDate: null,
      reportedAt: null,
      precision: "RANGE",
      confidence: "HIGH",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(evidence),
      metadata: { parserDebug: { patternId: FORECAST_PATTERN_ID, matchCount: years.length } },
    });
  }
  return out;
}

function parseForecastYears(m: RegExpExecArray): number[] | null {
  const years: number[] = [];
  for (const part of m.slice(1)) {
    if (!part) continue;
    const n = Number(part.length === 2 ? `20${part}` : part);
    if (!Number.isFinite(n) || n < 2000 || n > 2099) continue;
    years.push(n);
  }
  if (years.length < 4) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const consecutive = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1);
  return consecutive ? sorted : null;
}

// ============================================================
// Extractor #6 — DOCUMENT_DATE from deck/doc footer
// ============================================================
// Allow an optional company name between "Confidential" and the separator.
// Examples covered: "e4n Confidential – March 2026" (no company between),
// "Confidentiel NETGEM - Avril 2026" (company between).
const FOOTER_PATTERN = /(?:Confidentiel|Confidential)(?:\s+[A-Z][\w-]*){0,3}?\s*[–\-—]\s*([A-Za-zéûôîàïè]+)\s+(\d{4})\b/gi;
const FOOTER_PATTERN_ID = "doc-footer-confidential-month-year";

function extractDocumentDateFromFooter(text: string): ExtractedTemporalSignal[] {
  FOOTER_PATTERN.lastIndex = 0;
  const counts = new Map<string, { date: Date; index: number; whole: string; hits: number }>();

  let m: RegExpExecArray | null;
  while ((m = FOOTER_PATTERN.exec(text)) !== null) {
    const date = parseMonthYear(m[1], m[2]);
    if (!date) continue;
    const key = date.toISOString().slice(0, 7);
    const existing = counts.get(key);
    if (existing) {
      existing.hits += 1;
    } else {
      counts.set(key, { date, index: m.index, whole: m[0], hits: 1 });
    }
  }

  if (counts.size === 0) return [];

  return [...counts.values()].map(({ date, index, whole, hits }) => ({
    derivedFrom: "extracted_text" as DerivedFrom,
    kind: "DOCUMENT_DATE" as EvidenceSignalKind,
    valueJson: {
      role: "document_date",
      source: "footer",
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      footerHits: hits,
    },
    evidenceText: clipEvidence(text, index, whole.length),
    pageNumber: null,
    sheetName: null,
    charOffset: index,
    dateStart: null,
    dateEnd: null,
    asOfDate: date,
    reportedAt: null,
    precision: "MONTH" as EvidenceSignalPrecision,
    confidence: "HIGH" as EvidenceSignalConfidence,
    sourceMethod: "DETERMINISTIC" as EvidenceSignalMethod,
    sourceTextHash: sha256(clipEvidence(text, index, whole.length)),
    metadata: { parserDebug: { patternId: FOOTER_PATTERN_ID, matchCount: hits } },
  }));
}

// ============================================================
// Extractor #7 — DOCUMENT_DATE from filename (anti-naïveté guard)
// ============================================================
const FILENAME_MONTH_YEAR_PATTERN = /\b([A-Za-zéûôîàïè]{3,12}|\d{1,2})[\s_-]+(20\d{2})\b/gi;
const FILENAME_PATTERN_ID = "filename-month-year";

function extractDocumentDateFromFilename(
  documentName: string,
  text: string,
  documentType: DocumentType
): ExtractedTemporalSignal[] {
  const candidates: Array<{ date: Date; raw: string }> = [];
  let m: RegExpExecArray | null;
  FILENAME_MONTH_YEAR_PATTERN.lastIndex = 0;
  while ((m = FILENAME_MONTH_YEAR_PATTERN.exec(documentName)) !== null) {
    const date = parseMonthYear(m[1], m[2]);
    if (date) candidates.push({ date, raw: m[0] });
  }

  // Anti-naïveté (clarified Codex round 7 P2):
  //
  // "Ambiguous" here = MULTIPLE distinct MONTH-YEAR pairs detected in the filename.
  // Bare years (e.g. "2026", "2030") are NOT counted as candidates because they
  // typically encode forecast periods (handled by extractFinancialForecast on the
  // OCR text), not the document's own date.
  //
  // Examples covered:
  //   "Fur-Love-2026-2030-Sept-2025-Capital-raise" → ONE month-year ("Sept-2025"),
  //       emit DOCUMENT_DATE=2025-09 MEDIUM. The "2026-2030" bare years are
  //       handled separately as FINANCIAL_PERIOD_FORECAST on the text.
  //   "Fur-Love-Sept-2025-and-Oct-2026" → TWO month-year pairs (Sept-2025,
  //       Oct-2026), genuinely ambiguous → emit nothing.
  const uniqueYears = new Set(candidates.map((c) => c.date.getUTCFullYear()));
  if (uniqueYears.size > 1) return [];
  if (candidates.length === 0) return [];

  // Anti-naïveté for PITCH_DECK: if extractedText mentions many distinct years,
  // a single month-year in the filename is too weak to call it the doc date.
  if (documentType === "PITCH_DECK" && countDistinctYears(text) > 3) return [];

  const { date, raw } = candidates[0];
  return [
    {
      derivedFrom: "filename",
      kind: "DOCUMENT_DATE",
      valueJson: {
        role: "document_date",
        source: "filename",
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        raw,
      },
      evidenceText: documentName.slice(0, 280),
      pageNumber: null,
      sheetName: null,
      charOffset: null,
      dateStart: null,
      dateEnd: null,
      asOfDate: date,
      reportedAt: null,
      precision: "MONTH",
      confidence: "MEDIUM",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(documentName),
      metadata: { parserDebug: { patternId: FILENAME_PATTERN_ID, matchCount: candidates.length } },
    },
  ];
}

// ============================================================
// Helpers — date parsing
// ============================================================
const FR_MONTHS: Record<string, number> = {
  janvier: 0, janv: 0, jan: 0,
  février: 1, fevrier: 1, fev: 1, fév: 1, févr: 1, fevr: 1,
  mars: 2, mar: 2,
  avril: 3, avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6, juil: 6, jul: 6,
  août: 7, aout: 7,
  septembre: 8, sept: 8, sep: 8,
  octobre: 9, oct: 9,
  novembre: 10, nov: 10,
  décembre: 11, decembre: 11, déc: 11, dec: 11,
};

const EN_MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function parseDate(day: string | undefined, monthRaw: string | undefined, yearRaw: string | undefined): Date | null {
  const year = normalizeYear(yearRaw);
  const month = parseMonthToken(monthRaw);
  const dayNum = Number(day ?? "1");
  if (year == null || month == null || !Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return null;
  const d = new Date(Date.UTC(year, month, dayNum));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) return null;
  return d;
}

function parseDmy(slash: string): Date | null {
  const parts = slash.split("/");
  if (parts.length !== 3) return null;
  return parseDate(parts[0], parts[1], parts[2]);
}

function parseMonthYear(monthRaw: string, yearRaw: string): Date | null {
  const month = parseMonthToken(monthRaw);
  const year = normalizeYear(yearRaw);
  if (month == null || year == null) return null;
  return new Date(Date.UTC(year, month, 1));
}

function parseMonthToken(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return n >= 1 && n <= 12 ? n - 1 : null;
  }
  const normalized = token.toLowerCase().normalize("NFC").replace(/\.$/, "");
  if (normalized in FR_MONTHS) return FR_MONTHS[normalized];
  if (normalized in EN_MONTHS) return EN_MONTHS[normalized];
  // try removing trailing accents that may bleed into next token
  const stripped = normalized.replace(/[^a-zéûôîàïè]/g, "");
  if (stripped in FR_MONTHS) return FR_MONTHS[stripped];
  if (stripped in EN_MONTHS) return EN_MONTHS[stripped];
  return null;
}

function normalizeYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) return Number(trimmed);
  if (/^\d{2}$/.test(trimmed)) {
    const n = Number(trimmed);
    return n >= 50 ? 1900 + n : 2000 + n;
  }
  return null;
}

function yearsBetween(start: Date, end: Date): number[] {
  const out: number[] = [];
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y += 1) out.push(y);
  return out;
}

function countDistinctYears(text: string): number {
  const matches = text.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!matches) return 0;
  return new Set(matches).size;
}

// ============================================================
// Helpers — evidence clipping + hashing
// ============================================================
const EVIDENCE_MAX_CHARS = 280;
const EVIDENCE_CONTEXT_CHARS = 40;

function clipEvidence(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - EVIDENCE_CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + matchLength + EVIDENCE_CONTEXT_CHARS);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, EVIDENCE_MAX_CHARS);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
