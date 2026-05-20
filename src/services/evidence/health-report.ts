/**
 * Phase 7 — Evidence health report.
 *
 * Pure aggregator over the per-doc DocumentEvidenceContext map produced by
 * buildDealEvidenceContext. Emits three deal-level findings:
 *
 *   1. CONTRADICTIONS — same (kind, metric, year) claimed with materially
 *      different amounts across documents. Severity escalates when an
 *      `actual` signal contradicts a `claim`/`forecast`.
 *   2. MISSING EVIDENCE — expected signals absent (no CAP_TABLE_AS_OF on a
 *      cap table doc, no FINANCIAL_STATEMENTS in the corpus, FINANCIAL_MODEL
 *      doc without any FINANCIAL_PERIOD_FORECAST signal, PITCH_DECK with no
 *      DOCUMENT_DATE).
 *   3. FRESHNESS rollup — count of stale warnings across the deal.
 *
 * Positioning rule (CLAUDE.md): findings describe SIGNALS, never decisions.
 * Severity LOW/MEDIUM/HIGH is analytical, not prescriptive — no "PASS / NO_GO".
 *
 * Conservative by design (Codex pattern): when in doubt about whether a
 * mismatch is significant, lean toward NOT raising a contradiction. False
 * positives in an evidence-health block are particularly costly because they
 * teach the agent to discount the block.
 */
import type { DocumentType } from "@prisma/client";
import type {
  DocumentEvidenceContext,
  ResolvedClaim,
  StaleWarningKind,
} from "./build-evidence-context";

export type EvidenceHealthSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ContradictionKind =
  | "VALUATION_MISMATCH"
  | "METRIC_MISMATCH"
  | "CURRENCY_MISMATCH";

export interface ContradictionSignalRef {
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  classification: "actual" | "forecast" | "claim";
  amount: number;
  currency: "EUR" | "USD" | "GBP" | null;
  signalId: string;
}

export interface ContradictionFinding {
  kind: ContradictionKind;
  /** "VALUATION" for valuation claims, else metric label (e.g. "CA", "ARR"). */
  subject: string;
  year: number | null;
  severity: EvidenceHealthSeverity;
  /** French human-readable reason — analytical tone, no prescription. */
  reason: string;
  /** Min/max spread ratio (max/min). Null for CURRENCY_MISMATCH (n/a). */
  spreadRatio: number | null;
  signals: ContradictionSignalRef[];
}

export type MissingEvidenceKind =
  | "NO_CAP_TABLE_AS_OF"
  | "NO_FINANCIAL_STATEMENTS"
  | "NO_FORECAST_PERIOD"
  | "NO_PITCH_DECK_DATE";

export interface MissingEvidenceFinding {
  kind: MissingEvidenceKind;
  severity: EvidenceHealthSeverity;
  /** French human-readable message — analytical tone. */
  message: string;
  /** Documents impacted (e.g. cap table docs without asOf). */
  affectedDocumentIds: string[];
}

export interface FreshnessRollup {
  /** Count per warning kind across all documents. */
  countsByKind: Record<StaleWarningKind, number>;
  /** Total stale warnings. */
  total: number;
}

export interface EvidenceHealthReport {
  contradictions: ContradictionFinding[];
  missing: MissingEvidenceFinding[];
  freshness: FreshnessRollup;
}

/**
 * Per-document pre-aggregation surfaced by the API alongside the full report.
 * Consumed by per-doc badges in the documents-tab so the frontend never
 * recomputes the relationship between findings and individual documents.
 *
 * Codex round 24 P1 — entries carry their severity. The badge logic in
 * `evidence-health-badge.tsx` must reflect the REAL max severity (e.g. a
 * `cap_table_stale high` finding must render red, not amber; a
 * `NO_PITCH_DECK_DATE low` must render slate, not amber). Previously the
 * summary only listed kinds, forcing the badge to default everything to
 * MEDIUM — masking both HIGHs and LOWs.
 */
export interface DocumentHealthMissingEntry {
  kind: MissingEvidenceKind;
  severity: EvidenceHealthSeverity;
}

export interface DocumentHealthFreshnessEntry {
  kind: import("./build-evidence-context").StaleWarningKind;
  /** Severity from StaleWarning, normalised to uppercase to match the rest of the bundle. */
  severity: EvidenceHealthSeverity;
}

export interface DocumentHealthSummary {
  contradictionCount: number;
  /** HIGH > MEDIUM > LOW. `null` if the doc has no contradictions. */
  highestContradictionSeverity: EvidenceHealthSeverity | null;
  /** MissingEvidenceFinding entries affecting this doc, with the finding's real severity. */
  missing: DocumentHealthMissingEntry[];
  /** StaleWarning entries raised on this doc, with the warning's real severity. */
  freshness: DocumentHealthFreshnessEntry[];
  /**
   * Phase B8.1 — document identity surfaced for action mapping. The
   * EvidenceHealthPanel needs name + type to route signals to the
   * correct UI (metadata dialog pre-fill, drill-down). Carrying the
   * fields on the bundle avoids a second round-trip per signal.
   * Optional for backward-compat with consumers built before B8.1.
   */
  documentName?: string;
  documentType?: DocumentType;
}

export interface EvidenceHealthBundle {
  report: EvidenceHealthReport;
  byDocument: Record<string, DocumentHealthSummary>;
}

// ============================================================
// Tunables
// ============================================================

/**
 * Min spread (max/min) before a numeric mismatch is reported. 1.2 = 20% gap.
 * Below that, treated as rounding/unit noise. Conservative: any tighter and
 * we'd flood reports with k€ vs M€ rounding artefacts; any looser and we'd
 * miss meaningful disputes (e.g. 1.5M€ vs 2M€ revenue = 33%).
 */
const NUMERIC_MISMATCH_RATIO_THRESHOLD = 1.2;

// ============================================================
// Public entry point
// ============================================================
export function buildEvidenceHealthReport(
  docContexts: Record<string, DocumentEvidenceContext>
): EvidenceHealthReport {
  const docs = Object.values(docContexts);
  return {
    contradictions: detectContradictions(docs),
    missing: detectMissingEvidence(docs),
    freshness: rollupFreshness(docs),
  };
}

/**
 * Phase 8 — combine the deal-level report with a per-document pre-aggregation
 * so the API can return both in a single payload. Single source of truth for
 * the per-doc badges in the frontend.
 *
 * Per-doc summary derivation:
 *  - contradictions → walk report.contradictions and tally per documentId
 *    referenced in the `signals[]` array.
 *  - missing → walk report.missing.affectedDocumentIds (deal-level findings
 *    like NO_FINANCIAL_STATEMENTS with no specific affected doc are not
 *    attached to any per-doc bucket — they live in the report-level surface).
 *  - freshness → directly from each doc's staleWarnings (already per-doc).
 */
export function buildEvidenceHealthBundle(
  docContexts: Record<string, DocumentEvidenceContext>
): EvidenceHealthBundle {
  const report = buildEvidenceHealthReport(docContexts);
  return {
    report,
    byDocument: buildPerDocumentSummary(docContexts, report),
  };
}

function buildPerDocumentSummary(
  docContexts: Record<string, DocumentEvidenceContext>,
  report: EvidenceHealthReport
): Record<string, DocumentHealthSummary> {
  const out: Record<string, DocumentHealthSummary> = {};

  // Initialize one bucket per known document. B8.1 — carry name + type so
  // the EvidenceHealthPanel can build per-signal actions (open metadata
  // dialog, drill-down to doc) without a second round-trip per signal.
  for (const [docId, ctx] of Object.entries(docContexts)) {
    out[docId] = {
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [],
      freshness: [],
      documentName: ctx.documentName,
      documentType: ctx.documentType,
    };
  }

  // 1. Tally contradictions per doc, tracking the highest severity seen.
  for (const c of report.contradictions) {
    const touchedDocs = new Set<string>();
    for (const s of c.signals) touchedDocs.add(s.documentId);
    for (const docId of touchedDocs) {
      const bucket = out[docId];
      if (!bucket) continue; // signal references a doc not in the map (defensive)
      bucket.contradictionCount += 1;
      if (
        bucket.highestContradictionSeverity === null ||
        severityRank(c.severity) > severityRank(bucket.highestContradictionSeverity)
      ) {
        bucket.highestContradictionSeverity = c.severity;
      }
    }
  }

  // 2. Project missing findings onto their affected docs (skip deal-level findings).
  // Per kind: keep the highest severity if a doc is referenced multiple times
  // (defensive — current detectors emit at most one finding per kind, but the
  // summary contract should be safe against duplicates).
  for (const m of report.missing) {
    if (m.affectedDocumentIds.length === 0) continue;
    for (const docId of m.affectedDocumentIds) {
      const bucket = out[docId];
      if (!bucket) continue;
      const existing = bucket.missing.find((e) => e.kind === m.kind);
      if (existing) {
        if (severityRank(m.severity) > severityRank(existing.severity)) existing.severity = m.severity;
      } else {
        bucket.missing.push({ kind: m.kind, severity: m.severity });
      }
    }
  }

  // 3. Freshness — copy each doc's staleWarning per kind, normalising severity
  // from StaleWarning's lowercase ("low"|"medium"|"high") to the bundle's
  // uppercase ("LOW"|"MEDIUM"|"HIGH"). Per kind: keep the highest severity.
  for (const [docId, ctx] of Object.entries(docContexts)) {
    const bucket = out[docId];
    if (!bucket) continue;
    for (const w of ctx.staleWarnings) {
      const sev = normaliseStaleSeverity(w.severity);
      const existing = bucket.freshness.find((e) => e.kind === w.kind);
      if (existing) {
        if (severityRank(sev) > severityRank(existing.severity)) existing.severity = sev;
      } else {
        bucket.freshness.push({ kind: w.kind, severity: sev });
      }
    }
  }

  return out;
}

function normaliseStaleSeverity(severity: "low" | "medium" | "high"): EvidenceHealthSeverity {
  if (severity === "high") return "HIGH";
  if (severity === "medium") return "MEDIUM";
  return "LOW";
}

// ============================================================
// 1. Contradictions
// ============================================================

interface ClaimWithDoc {
  claim: ResolvedClaim;
  doc: DocumentEvidenceContext;
}

function detectContradictions(docs: DocumentEvidenceContext[]): ContradictionFinding[] {
  // Flatten all claims with their owning doc.
  const flat: ClaimWithDoc[] = [];
  for (const doc of docs) {
    for (const claim of doc.claims) flat.push({ claim, doc });
  }

  // Group by (kind, subject, year).
  // - METRIC_CLAIM without year is dropped: "CA = 3M€" with no year is too
  //   ambiguous to compare against another year-less "CA" claim (could be
  //   different fiscal years entirely).
  // - VALUATION_CLAIM without year is KEPT and grouped under "undated"
  //   (Codex round 22 P1). The Phase 6 extractor emits classic valuations
  //   like "valorisation 5M€" with year=null; without this special-case, a
  //   deck-vs-term-sheet valuation discrepancy (the canonical contradiction
  //   we MUST catch) would never surface.
  const groups = new Map<string, ClaimWithDoc[]>();
  for (const item of flat) {
    const { kind, metric, year } = item.claim;
    if (kind === "METRIC_CLAIM" && year === null) continue;
    const subject = kind === "VALUATION_CLAIM" ? "VALUATION" : (metric ?? "UNKNOWN");
    const yearKey = year !== null ? String(year) : "undated";
    const key = `${kind}|${subject}|${yearKey}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const out: ContradictionFinding[] = [];
  for (const [key, items] of groups.entries()) {
    if (items.length < 2) continue;
    const [kindStr, subject, yearStr] = key.split("|");
    const year = yearStr === "undated" ? null : Number(yearStr);
    const kind = kindStr as "VALUATION_CLAIM" | "METRIC_CLAIM";

    // De-dup the same exact (documentId, amount) pair so two extractor passes
    // emitting the same claim from the same doc don't show as "contradiction
    // within the same doc".
    const seen = new Set<string>();
    const unique: ClaimWithDoc[] = [];
    for (const it of items) {
      const k = `${it.doc.documentId}|${it.claim.amount}|${it.claim.currency ?? "?"}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(it);
    }
    if (unique.length < 2) continue;

    // Currency mismatch first — if we have GBP and EUR for the same claim,
    // surface it before any amount comparison (amounts in different currencies
    // are not numerically comparable).
    const currencies = new Set(unique.map((it) => it.claim.currency).filter((c): c is "EUR" | "USD" | "GBP" => c !== null));
    if (currencies.size > 1) {
      const yearLabel = year !== null ? ` ${year}` : " (non datée)";
      out.push({
        kind: "CURRENCY_MISMATCH",
        subject,
        year,
        severity: "LOW",
        spreadRatio: null,
        reason: `Devises différentes pour ${formatSubject(subject)}${yearLabel} : ${Array.from(currencies).join(", ")}. Comparaison numérique non significative tant que les unités ne sont pas normalisées.`,
        signals: unique.map(toSignalRef),
      });
      continue; // don't report numeric mismatch on top of currency mismatch
    }

    // Numeric mismatch — compute max/min across SAME-currency (or all-null) signals.
    const amounts = unique.map((it) => it.claim.amount);
    const max = Math.max(...amounts);
    const min = Math.min(...amounts);
    if (min <= 0) continue; // defensive: avoid div-by-zero
    const ratio = max / min;
    if (ratio < NUMERIC_MISMATCH_RATIO_THRESHOLD) continue;

    const hasActual = unique.some((it) => it.claim.classification === "actual");
    const hasNonActual = unique.some((it) => it.claim.classification !== "actual");
    // HIGH when an audited actual contradicts a non-actual (founder claim or
    // forecast). The agent should challenge the non-actual side hard.
    const severity: EvidenceHealthSeverity =
      hasActual && hasNonActual ? "HIGH" : "MEDIUM";

    const contradictionKind: ContradictionKind =
      kind === "VALUATION_CLAIM" ? "VALUATION_MISMATCH" : "METRIC_MISMATCH";

    out.push({
      kind: contradictionKind,
      subject,
      year,
      severity,
      spreadRatio: ratio,
      reason: buildContradictionReason({ subject, year, unique, ratio, hasActual }),
      signals: unique.map(toSignalRef),
    });
  }

  // Stable order: HIGH first, then MEDIUM, then LOW; within severity by subject+year asc.
  out.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    const subj = a.subject.localeCompare(b.subject);
    if (subj !== 0) return subj;
    return (a.year ?? 0) - (b.year ?? 0);
  });
  return out;
}

function buildContradictionReason(params: {
  subject: string;
  year: number | null;
  unique: ClaimWithDoc[];
  ratio: number;
  hasActual: boolean;
}): string {
  const variants = params.unique
    .map((it) => {
      const amt = formatAmount(it.claim.amount, it.claim.currency);
      const tag =
        it.claim.classification === "actual" ? "actual"
        : it.claim.classification === "forecast" ? "forecast"
        : "claim";
      return `${amt} (${it.doc.documentName}, ${tag})`;
    })
    .join(" vs ");
  const pct = Math.round((params.ratio - 1) * 100);
  const actualNote = params.hasActual
    ? " Au moins un signal est marqué actual — l'écart porte sur des données présentées comme réalisées vs revendiquées/projetées."
    : "";
  const yearLabel = params.year !== null ? ` ${params.year}` : " (non datée)";
  return `${formatSubject(params.subject)}${yearLabel} : ${variants}. Écart relatif max ~${pct}%.${actualNote}`;
}

// ============================================================
// 2. Missing evidence
// ============================================================

function detectMissingEvidence(docs: DocumentEvidenceContext[]): MissingEvidenceFinding[] {
  const out: MissingEvidenceFinding[] = [];

  // (a) Cap table missing asOf.
  const capTableDocs = docs.filter((d) => d.documentType === "CAP_TABLE");
  const capTablesWithAsOf = capTableDocs.filter(
    (d) => d.asOf !== null && d.asOf.signalKind === "CAP_TABLE_AS_OF"
  );
  if (capTableDocs.length > 0 && capTablesWithAsOf.length === 0) {
    const capTablesMissingAsOf = capTableDocs.filter(
      (d) => d.asOf === null || d.asOf.signalKind !== "CAP_TABLE_AS_OF"
    );
    out.push({
      kind: "NO_CAP_TABLE_AS_OF",
      severity: "HIGH",
      message:
        "Cap table présente mais sans date d'arrêté détectée. Sans \"as of\" daté, la répartition capitalistique ne peut pas être qualifiée à un instant T.",
      affectedDocumentIds: capTablesMissingAsOf.map((d) => d.documentId),
    });
  }
  if (capTableDocs.length === 0) {
    out.push({
      kind: "NO_CAP_TABLE_AS_OF",
      severity: "MEDIUM",
      message:
        "Aucune cap table n'a été uploadée pour ce deal. La répartition au capital ne peut pas être vérifiée.",
      affectedDocumentIds: [],
    });
  }

  // (b) No financial statements.
  const fsDocs = docs.filter((d) => d.documentType === "FINANCIAL_STATEMENTS");
  if (fsDocs.length === 0) {
    out.push({
      kind: "NO_FINANCIAL_STATEMENTS",
      severity: "MEDIUM",
      message:
        "Aucun document FINANCIAL_STATEMENTS (bilan, compte de résultat audité) n'a été uploadé. Les chiffres réalisés ne peuvent pas être recoupés contre une source auditée.",
      affectedDocumentIds: [],
    });
  }

  // (c) FINANCIAL_MODEL doc(s) without any forecast period extracted.
  // Codex round 22 P2 — emit as soon as AT LEAST ONE financial model is
  // missing its forecast. Severity escalates:
  //   - MEDIUM if all models miss (the deal has no forecast horizon at all)
  //   - LOW if partial (some models OK, some not — the BA still needs to
  //     know which specific doc is unusable for forecast queries).
  const fmDocs = docs.filter((d) => d.documentType === "FINANCIAL_MODEL");
  const fmDocsMissingForecast = fmDocs.filter((d) => d.forecast === null);
  if (fmDocsMissingForecast.length > 0) {
    const isFullMiss = fmDocsMissingForecast.length === fmDocs.length;
    const severity: EvidenceHealthSeverity = isFullMiss ? "MEDIUM" : "LOW";
    const partialNote = isFullMiss
      ? ""
      : ` ${fmDocsMissingForecast.length} sur ${fmDocs.length} modèles financiers concernés.`;
    out.push({
      kind: "NO_FORECAST_PERIOD",
      severity,
      message: `Modèle financier présent mais aucune période prévisionnelle datée n'a été extraite.${partialNote} L'horizon de projection ne peut pas être borné pour ${isFullMiss ? "ce deal" : "le(s) modèle(s) concerné(s)"}.`,
      affectedDocumentIds: fmDocsMissingForecast.map((d) => d.documentId),
    });
  }

  // (d) PITCH_DECK without documentDate (one finding aggregating all undated decks).
  const undatedDecks = docs.filter(
    (d) => d.documentType === "PITCH_DECK" && d.documentDate === null && d.asOf === null
  );
  if (undatedDecks.length > 0) {
    out.push({
      kind: "NO_PITCH_DECK_DATE",
      severity: "LOW",
      message: `${undatedDecks.length} pitch deck${undatedDecks.length > 1 ? "s" : ""} sans date détectée. La fraîcheur des chiffres présentés ne peut pas être qualifiée.`,
      affectedDocumentIds: undatedDecks.map((d) => d.documentId),
    });
  }

  // Stable order — HIGH first.
  out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return out;
}

// ============================================================
// 3. Freshness rollup
// ============================================================

function rollupFreshness(docs: DocumentEvidenceContext[]): FreshnessRollup {
  const counts: Record<StaleWarningKind, number> = {
    cap_table_stale: 0,
    balance_sheet_stale: 0,
    forecast_now_historical: 0,
  };
  let total = 0;
  for (const doc of docs) {
    for (const w of doc.staleWarnings) {
      counts[w.kind] = (counts[w.kind] ?? 0) + 1;
      total += 1;
    }
  }
  return { countsByKind: counts, total };
}

// ============================================================
// Helpers
// ============================================================
function severityRank(s: EvidenceHealthSeverity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

function toSignalRef(item: ClaimWithDoc): ContradictionSignalRef {
  return {
    documentId: item.doc.documentId,
    documentName: item.doc.documentName,
    documentType: item.doc.documentType,
    classification: item.claim.classification,
    amount: item.claim.amount,
    currency: item.claim.currency,
    signalId: item.claim.signalId,
  };
}

function formatSubject(subject: string): string {
  if (subject === "VALUATION") return "Valorisation";
  return subject;
}

/**
 * Mirror of evidence-prelude.formatAmount for the contradiction reason text.
 * Kept in-module to keep health-report.ts self-contained (it is consumed by
 * the prelude AND by tests that should not depend on the prelude formatter).
 */
function formatAmount(amount: number, currency: "EUR" | "USD" | "GBP" | null): string {
  const sign =
    currency === "USD" ? "$"
    : currency === "GBP" ? "£"
    : currency === "EUR" ? "€"
    : null;
  const suffix = sign ?? " (devise inconnue)";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}G${sign ?? ""}${sign ? "" : suffix}`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M${sign ?? ""}${sign ? "" : suffix}`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k${sign ?? ""}${sign ? "" : suffix}`;
  return `${amount}${sign ?? ""}${sign ? "" : suffix}`;
}
