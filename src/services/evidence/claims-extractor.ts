/**
 * Phase 6 — Deterministic claims extractor.
 *
 * Extracts VALUATION_CLAIM and METRIC_CLAIM EvidenceSignals from the
 * extractedText of a document. CONSERVATIVE BY DESIGN: when context is
 * ambiguous (no metric label nearby, no year, no currency), skip the match.
 *
 * Codex Phase 6 gates :
 *   1. CA 2025 must never be confused with forecast 2026 (period accuracy).
 *   2. EMAIL source → classification ALWAYS "claim" (founder declarations
 *      are not audited evidence).
 *   3. FINANCIAL_MODEL → default "forecast" unless explicit "actuals" marker.
 *
 * Out of scope for Phase 6 first cut:
 *   - LLM-based extraction (deterministic regex only).
 *   - Cross-document contradiction detection (Phase 7).
 *   - Currency conversion / unit normalisation across signals.
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

export const CLAIMS_EXTRACTOR_VERSION = "claims-extractor@2026-05-18-001";

export type ClaimDerivedFrom = "extracted_text";

export type ClaimClassification = "actual" | "forecast" | "claim";

export interface ClaimsExtractorInput {
  documentName: string;
  documentType: DocumentType;
  /** Decrypted plaintext. Empty/null → no extraction. */
  extractedText: string | null;
  sourceKind: "FILE" | "EMAIL" | "NOTE";
}

export interface ExtractedClaimSignal {
  derivedFrom: ClaimDerivedFrom;
  kind: EvidenceSignalKind; // VALUATION_CLAIM | METRIC_CLAIM
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
export function runClaimsExtractor(input: ClaimsExtractorInput): ExtractedClaimSignal[] {
  const text = input.extractedText ?? "";
  if (!text.trim()) return [];

  const classification = classifyDocument(input);
  const out: ExtractedClaimSignal[] = [];

  // 1. Valuation claims: "valorisation 6M€", "valuation €6M", "pre-money 5M€"
  out.push(...extractValuationClaims(text, classification));

  // 2. Metric claims with explicit year: "CA 2025 = 3M€", "ARR 2026 1.2M€",
  //    "3M€ de CA 2025", "exit 2030 63M€"
  out.push(...extractMetricClaimsWithYear(text, classification, input.sourceKind));

  return dedupe(out);
}

// ============================================================
// Document classification
// ============================================================
function classifyDocument(input: ClaimsExtractorInput): ClaimClassification {
  // Gate Codex 2: emails are claims, never audited.
  if (input.sourceKind === "EMAIL") return "claim";
  // Gate Codex 3: BP / FINANCIAL_MODEL default to forecast (unless overridden
  // per-signal by an explicit "actuals" marker — see below).
  if (input.documentType === "FINANCIAL_MODEL") return "forecast";
  // Bilans / financial statements are typically actuals.
  if (input.documentType === "FINANCIAL_STATEMENTS") return "actual";
  // Pitch decks: founder claims (not audited).
  if (input.documentType === "PITCH_DECK") return "claim";
  // Cap tables / term sheets / others: claim by default (audit-level data needs explicit signal).
  return "claim";
}

const ACTUAL_MARKERS = /\b(réalisé|realise|actuals?|audited|exercice clos)\b/gi;
const FORECAST_MARKERS = /\b(forecast|projection|prévi|previ|budget|projeté|projete|target|objectif)\b/gi;

/**
 * Codex round 20 P1 — marker search is BOUNDED. A `Actuals 2025` header far
 * up in a BP must not contaminate a `CA 2026` claim 2000+ chars later. We cap
 * the look-around to ~one section (600 chars on each side of the claim).
 * Beyond that distance, we treat the marker as "not local" and fall back to
 * the document-level baseClassification.
 *
 * 600 chars ≈ a short paragraph or a sheet header block. Tight enough to
 * prevent cross-section contamination, loose enough to catch a "Actuals 2025"
 * row label that precedes its data row by a few hundred chars.
 */
const MAX_MARKER_DISTANCE = 600;

/**
 * Per-claim classification override using NEAREST-MARKER-WINS (Codex round 19 P1)
 * within a BOUNDED window (Codex round 20 P1).
 *
 * - EMAIL invariant (Gate Codex 2) preserved — EMAIL → "claim" regardless.
 * - Scan the whole doc but ignore matches further than MAX_MARKER_DISTANCE.
 * - If at least one marker is in range: closest wins (actual vs forecast).
 * - Tie OR no marker in range → fall back to baseClassification.
 */
function refineClassification(
  base: ClaimClassification,
  fullText: string,
  claimIndex: number,
  sourceKind: "FILE" | "EMAIL" | "NOTE"
): ClaimClassification {
  if (sourceKind === "EMAIL") return "claim"; // Gate Codex 2 — never override.

  const nearestActual = nearestMarkerDistance(fullText, ACTUAL_MARKERS, claimIndex);
  const nearestForecast = nearestMarkerDistance(fullText, FORECAST_MARKERS, claimIndex);

  const actualInRange = nearestActual <= MAX_MARKER_DISTANCE;
  const forecastInRange = nearestForecast <= MAX_MARKER_DISTANCE;

  if (!actualInRange && !forecastInRange) return base; // nothing local → trust doc-level
  if (actualInRange && !forecastInRange) return "actual";
  if (forecastInRange && !actualInRange) return "forecast";
  // both in range — closest wins
  if (nearestActual < nearestForecast) return "actual";
  if (nearestForecast < nearestActual) return "forecast";
  return base; // exact tie → keep doc-level base classification
}

/**
 * Return the smallest character distance between `claimIndex` and any match
 * of `regex` in `text`. Infinity if no match. Distance is computed from the
 * nearest edge of the match (start or end) to claimIndex.
 */
function nearestMarkerDistance(text: string, regex: RegExp, claimIndex: number): number {
  regex.lastIndex = 0;
  let min = Infinity;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const distance =
      claimIndex < start ? start - claimIndex
      : claimIndex > end ? claimIndex - end
      : 0;
    if (distance < min) min = distance;
  }
  return min;
}

// ============================================================
// Valuation extractor
// ============================================================
const VALUATION_PATTERN = /\b(valorisation|valuation|pre[\s-]?money|post[\s-]?money)[^\n\d]{0,40}?(€?\$?£?\s*\d[\d,. ]*(?:[KkMmGgBb]\s*€?|\s*€|\s*EUR|\s*USD)?)/gi;
const VALUATION_PATTERN_ID = "valuation-amount";

function extractValuationClaims(text: string, classification: ClaimClassification): ExtractedClaimSignal[] {
  const out: ExtractedClaimSignal[] = [];
  VALUATION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VALUATION_PATTERN.exec(text)) !== null) {
    const amount = parseAmount(m[2]);
    if (!amount) continue;
    const matchIndex = m.index ?? 0;
    const evidence = clipEvidence(text, matchIndex, m[0].length);
    out.push({
      derivedFrom: "extracted_text",
      kind: "VALUATION_CLAIM",
      valueJson: {
        amount: amount.value,
        currency: amount.currency,
        classification,
        label: m[1].toLowerCase(),
      },
      evidenceText: evidence,
      pageNumber: null,
      sheetName: null,
      charOffset: matchIndex,
      dateStart: null,
      dateEnd: null,
      asOfDate: null,
      reportedAt: null,
      precision: "UNKNOWN",
      confidence: "MEDIUM",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(evidence),
      metadata: {
        parserDebug: { patternId: VALUATION_PATTERN_ID, matchCount: 1 },
      },
    });
  }
  return out;
}

// ============================================================
// Metric claims extractor (with year context)
// ============================================================
const METRIC_LABEL_MAP: Record<string, string> = {
  "ca": "CA",
  "chiffre d'affaires": "CA",
  "revenue": "REVENUE",
  "revenues": "REVENUE",
  "sales": "REVENUE",
  "arr": "ARR",
  "mrr": "MRR",
  "ebitda": "EBITDA",
  "marge brute": "GROSS_MARGIN",
  "gross margin": "GROSS_MARGIN",
  "ticket": "TICKET",
  "ticket minimum": "TICKET_MIN",
  "minimum ticket": "TICKET_MIN",
  "exit": "EXIT",
  "exit value": "EXIT",
  "valuation exit": "EXIT",
};

// Build the metric union — sorted longest-first so "ticket minimum" wins over "ticket".
const METRIC_LABEL_KEYS = Object.keys(METRIC_LABEL_MAP).sort((a, b) => b.length - a.length);
const METRIC_LABEL_UNION = METRIC_LABEL_KEYS.map(escapeRegex).join("|");

// Pattern A: <Metric> <Year> = <Amount>  →  e.g. "CA 2025 = 3M€"
//                                            "ARR 2026 1.2M€"
const METRIC_YEAR_AMOUNT_PATTERN = new RegExp(
  `\\b(${METRIC_LABEL_UNION})\\b(?:\\s*=)?\\s*(20\\d{2})\\s*[=:.,]?\\s*` +
    `(€?\\$?£?\\s*\\d[\\d,. ]*(?:[KkMmGgBb]\\s*€?|\\s*€|\\s*EUR|\\s*USD)?)`,
  "gi"
);
const METRIC_YEAR_AMOUNT_PATTERN_ID = "metric-year-amount";

// Pattern B: <Amount> de <Metric> <Year>  →  e.g. "3M€ de CA 2025"
//                                              "405k€ de CA en mars 2025"
const AMOUNT_DE_METRIC_YEAR_PATTERN = new RegExp(
  `(€?\\$?£?\\s*\\d[\\d,. ]*(?:[KkMmGgBb]\\s*€?|\\s*€|\\s*EUR|\\s*USD)?)\\s+(?:de|of|d'|d)\\s+` +
    `(${METRIC_LABEL_UNION})(?:\\s+(?:en|in))?\\s*(20\\d{2})?`,
  "gi"
);
const AMOUNT_DE_METRIC_YEAR_PATTERN_ID = "amount-de-metric-year";

// Pattern C: <Amount> <Metric> <Year>  →  e.g. "3M€ CA 2025", "63M€ exit 2030"
const AMOUNT_METRIC_YEAR_PATTERN = new RegExp(
  `(€?\\$?£?\\s*\\d[\\d,. ]*(?:[KkMmGgBb]\\s*€?|\\s*€|\\s*EUR|\\s*USD)?)\\s+(${METRIC_LABEL_UNION})\\s+(20\\d{2})\\b`,
  "gi"
);
const AMOUNT_METRIC_YEAR_PATTERN_ID = "amount-metric-year";

function extractMetricClaimsWithYear(
  text: string,
  baseClassification: ClaimClassification,
  sourceKind: "FILE" | "EMAIL" | "NOTE"
): ExtractedClaimSignal[] {
  const out: ExtractedClaimSignal[] = [];

  const tryEmit = (
    label: string,
    yearRaw: string | null,
    amountRaw: string,
    matchIndex: number,
    matchLength: number,
    patternId: string
  ): void => {
    const amount = parseAmount(amountRaw);
    if (!amount) return;
    const year = yearRaw ? Number(yearRaw) : null;
    const metric = METRIC_LABEL_MAP[label.toLowerCase()] ?? label.toUpperCase();
    const evidence = clipEvidence(text, matchIndex, matchLength);
    // Codex round 19 P1 — pass the FULL text + claim position so the
    // nearest-marker-wins rule can find the closest actual/forecast hint
    // (mixed BPs have both markers in the ±120 window of a single claim).
    const classification = refineClassification(baseClassification, text, matchIndex, sourceKind);
    const kind: EvidenceSignalKind = metric === "EXIT" ? "VALUATION_CLAIM" : "METRIC_CLAIM";
    const period = year
      ? { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) }
      : null;

    out.push({
      derivedFrom: "extracted_text",
      kind,
      valueJson: {
        metric,
        amount: amount.value,
        currency: amount.currency,
        classification,
        ...(year ? { year } : {}),
      },
      evidenceText: evidence,
      pageNumber: null,
      sheetName: null,
      charOffset: matchIndex,
      dateStart: period?.start ?? null,
      dateEnd: period?.end ?? null,
      asOfDate: null,
      reportedAt: null,
      precision: year ? "YEAR" : "UNKNOWN",
      confidence: year ? "HIGH" : "MEDIUM",
      sourceMethod: "DETERMINISTIC",
      sourceTextHash: sha256(evidence),
      metadata: { parserDebug: { patternId, matchCount: 1 } },
    });
  };

  // Pattern A
  METRIC_YEAR_AMOUNT_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METRIC_YEAR_AMOUNT_PATTERN.exec(text)) !== null) {
    tryEmit(m[1], m[2], m[3], m.index ?? 0, m[0].length, METRIC_YEAR_AMOUNT_PATTERN_ID);
  }

  // Pattern B — "3M€ de CA 2025"
  AMOUNT_DE_METRIC_YEAR_PATTERN.lastIndex = 0;
  while ((m = AMOUNT_DE_METRIC_YEAR_PATTERN.exec(text)) !== null) {
    const yearRaw = m[3] ?? null;
    // Skip if no year AND the metric doesn't naturally lack one (CA without year is too ambiguous).
    if (!yearRaw) continue;
    tryEmit(m[2], yearRaw, m[1], m.index ?? 0, m[0].length, AMOUNT_DE_METRIC_YEAR_PATTERN_ID);
  }

  // Pattern C — "3M€ CA 2025"
  AMOUNT_METRIC_YEAR_PATTERN.lastIndex = 0;
  while ((m = AMOUNT_METRIC_YEAR_PATTERN.exec(text)) !== null) {
    tryEmit(m[2], m[3], m[1], m.index ?? 0, m[0].length, AMOUNT_METRIC_YEAR_PATTERN_ID);
  }

  // Pass classification through to refineClassification (per-claim window check).
  // We re-run with sourceKind context applied at the caller's discretion.
  return out;
}

// ============================================================
// Helpers
// ============================================================
/**
 * Codex round 19 P1 — `currency` must NEVER silently default. The regex
 * accepts £ as a candidate currency symbol; if we returned `null`, the
 * prelude's formatAmount() would render `£1.5M` as `1.50M€` (default to €).
 * Three valid currencies returned: EUR, USD, GBP. `null` ONLY when no
 * recognised symbol is present — and the prelude must render that as
 * "devise inconnue" (NOT €).
 */
export type ClaimCurrency = "EUR" | "USD" | "GBP";

function parseAmount(raw: string | undefined): { value: number; currency: ClaimCurrency | null } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Pull the numeric portion + multiplier letter.
  const m = cleaned.match(/(\d[\d.,]*)\s*([KkMmGgBb])?/);
  if (!m) return null;
  let num = Number(m[1].replace(/[ ,]/g, ""));
  if (m[1].includes(",") && !m[1].includes(".")) {
    // French decimal comma: "3,5" → 3.5
    num = Number(m[1].replace(/[ ]/g, "").replace(",", "."));
  }
  if (!Number.isFinite(num)) return null;
  const multiplier = m[2]?.toLowerCase();
  if (multiplier === "k") num *= 1_000;
  if (multiplier === "m") num *= 1_000_000;
  if (multiplier === "g" || multiplier === "b") num *= 1_000_000_000;

  let currency: ClaimCurrency | null = null;
  if (cleaned.includes("€") || /\bEUR\b/.test(cleaned)) currency = "EUR";
  else if (cleaned.includes("$") || /\bUSD\b/.test(cleaned)) currency = "USD";
  else if (cleaned.includes("£") || /\bGBP\b/.test(cleaned)) currency = "GBP";

  return { value: num, currency };
}

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deduplicate signals with the same (kind, metric, year, amount, currency,
 * classification). Keeps the first occurrence (lowest charOffset).
 */
function dedupe(signals: ExtractedClaimSignal[]): ExtractedClaimSignal[] {
  const seen = new Set<string>();
  const out: ExtractedClaimSignal[] = [];
  for (const s of signals.slice().sort((a, b) => (a.charOffset ?? 0) - (b.charOffset ?? 0))) {
    const v = s.valueJson;
    const key = [
      s.kind,
      (v.metric as string | undefined) ?? "",
      (v.year as number | undefined) ?? "",
      v.amount,
      (v.currency as string | undefined) ?? "",
      (v.classification as string | undefined) ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
