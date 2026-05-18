/**
 * Phase 5.0 — Evidence context builder.
 *
 * Aggregates EvidenceSignal rows for a deal and produces a typed structure
 * indexed by documentId that the agent prelude (Phase 5.1) can render.
 *
 * What this service does:
 *   - Pull all relevant signals for the deal in ONE query (avoid N+1 in agents).
 *   - Pick the BEST signal per (documentId, "promotion role"):
 *       * documentDate ← DOCUMENT_DATE (HIGH > MEDIUM, scope run:* > source_metadata > filename)
 *       * asOf        ← CAP_TABLE_AS_OF or BALANCE_SHEET_AS_OF (HIGH only)
 *       * forecast    ← latest FINANCIAL_PERIOD_FORECAST (max dateEnd)
 *       * actuals     ← all FINANCIAL_PERIOD_ACTUAL (full list)
 *   - Resolve ATTACHMENT_RELATION signals (auto-detected parent emails) and
 *     join the email's name for display.
 *   - Compute stale warnings (cap_table_stale > 12mo, balance_sheet_stale > 18mo,
 *     forecast_now_historical when dateStart < today).
 *
 * Codex round 13 P1 contract:
 *   - The auto-detected parent (ATTACHMENT_RELATION) lives ALONGSIDE the
 *     manually-set Document.corpusParentDocumentId. We expose BOTH so the
 *     Phase 5 prelude can surface them without mutating the lineage key.
 */
import { Prisma } from "@prisma/client";
import type {
  DocumentType,
  EvidenceSignal,
  EvidenceSignalConfidence,
  EvidenceSignalKind,
  EvidenceSignalPrecision,
  PrismaClient,
} from "@prisma/client";
import { safeDecrypt, safeDecryptJsonField } from "@/lib/encryption";

export interface ResolvedDate {
  date: Date;
  precision: EvidenceSignalPrecision;
  confidence: EvidenceSignalConfidence;
  /** "run:<id>" | "source_metadata" | "filename" | "human:<id>" | "import:<batch>" */
  signalScopeKey: string;
  /** Decrypted evidence text snippet (may be null if signal had none). */
  evidenceText: string | null;
  signalId: string;
  signalKind: EvidenceSignalKind;
}

export interface ResolvedPeriod {
  start: Date;
  end: Date;
  yearsCovered: number[];
  confidence: EvidenceSignalConfidence;
  signalId: string;
}

export interface DetectedAttachment {
  emailDocId: string;
  emailDocName: string | null;
  emailSourceDate: Date | null;
  matchMethod: "exact" | "normalized";
  signalId: string;
}

export interface ResolvedClaim {
  kind: "VALUATION_CLAIM" | "METRIC_CLAIM";
  metric: string | null;
  amount: number;
  /** Codex round 19 P1 — GBP supported end-to-end. `null` only when no
   *  recognised symbol was present; the prelude renders that as "devise
   *  inconnue" (NEVER silently defaults to €). */
  currency: "EUR" | "USD" | "GBP" | null;
  classification: "actual" | "forecast" | "claim";
  year: number | null;
  dateStart: Date | null;
  dateEnd: Date | null;
  evidenceText: string | null;
  confidence: EvidenceSignalConfidence;
  signalId: string;
}

export type StaleWarningKind =
  | "cap_table_stale"
  | "balance_sheet_stale"
  | "forecast_now_historical";

export interface StaleWarning {
  kind: StaleWarningKind;
  message: string;
  severity: "low" | "medium" | "high";
  ageDays?: number;
}

export interface DocumentEvidenceContext {
  documentId: string;
  documentName: string;
  documentType: DocumentType;

  // Temporal markers (best-pick)
  documentDate: ResolvedDate | null;
  asOf: ResolvedDate | null;
  forecast: ResolvedPeriod | null;
  actuals: ResolvedPeriod[];

  // Provenance — Phase 5 surfaces BOTH the manual parent and the auto-detected ones
  manualParent: { id: string; name: string } | null;
  detectedAttachments: DetectedAttachment[];

  // Phase 6: financial claims surfaced from the doc
  claims: ResolvedClaim[];

  // Computed
  staleWarnings: StaleWarning[];
}

export interface BuildDealEvidenceContextOptions {
  /** Defaults to new Date(). Pass explicitly for deterministic tests. */
  today?: Date;
  /** Cap table stale threshold (months). Default 12. */
  capTableStaleMonths?: number;
  /** Balance sheet stale threshold (months). Default 18. */
  balanceSheetStaleMonths?: number;
}

const PRECISION_RANK: Record<EvidenceSignalPrecision, number> = {
  DAY: 3,
  MONTH: 2,
  YEAR: 1,
  RANGE: 1,
  UNKNOWN: 0,
};

const CONFIDENCE_RANK: Record<EvidenceSignalConfidence, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SCOPE_RANK = (scope: string): number => {
  if (scope.startsWith("run:")) return 4;
  if (scope === "source_metadata") return 3;
  if (scope.startsWith("human:")) return 2;
  if (scope === "filename") return 1;
  return 0; // import:* and unknown
};

export async function buildDealEvidenceContext(
  prisma: PrismaClient | Prisma.TransactionClient,
  dealId: string,
  options: BuildDealEvidenceContextOptions = {}
): Promise<Record<string, DocumentEvidenceContext>> {
  const today = options.today ?? new Date();
  const capTableStaleMonths = options.capTableStaleMonths ?? 12;
  const balanceSheetStaleMonths = options.balanceSheetStaleMonths ?? 18;

  // Single round-trip per deal: docs + signals + latest-run-per-doc.
  // The latest-run map is required so we can filter run:<oldRunId> signals
  // out of the picker (Codex round 16 P1) — see filterSignalsToLatestRun.
  const [docs, signals, latestRunRows] = await Promise.all([
    prisma.document.findMany({
      where: { dealId },
      select: {
        id: true,
        name: true,
        type: true,
        corpusParentDocumentId: true,
      },
    }),
    prisma.evidenceSignal.findMany({
      where: {
        dealId,
        kind: {
          in: [
            "DOCUMENT_DATE",
            "CAP_TABLE_AS_OF",
            "BALANCE_SHEET_AS_OF",
            "FINANCIAL_PERIOD_FORECAST",
            "FINANCIAL_PERIOD_ACTUAL",
            "ATTACHMENT_RELATION",
            // Phase 6
            "VALUATION_CLAIM",
            "METRIC_CLAIM",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Latest terminal-success run per document in the deal. Used to filter
    // signals scoped to an older `run:*` to avoid serving stale OCR evidence
    // after a re-extraction (Codex round 16 P1).
    prisma.$queryRaw<Array<{ documentId: string; id: string }>>`
      SELECT DISTINCT ON ("documentId") "documentId", "id"
      FROM "DocumentExtractionRun"
      WHERE "documentId" IN (
        SELECT "id" FROM "Document" WHERE "dealId" = ${dealId}
      )
      AND "status" IN ('READY', 'READY_WITH_WARNINGS', 'BLOCKED')
      ORDER BY "documentId", "startedAt" DESC
    `,
  ]);

  const latestRunByDoc = new Map<string, string>();
  for (const row of latestRunRows) latestRunByDoc.set(row.documentId, row.id);

  const docById = new Map<string, { id: string; name: string; type: DocumentType; corpusParentDocumentId: string | null }>();
  for (const d of docs) docById.set(d.id, d);

  // Phase 5.2 (Codex round 16 P1) — drop signals scoped to an OLD extraction
  // run before any other filter. After a re-OCR, run:<R1> signals become
  // stale and an old HIGH must NOT beat the latest run's MEDIUM in the
  // picker. Non-run scopes (filename, source_metadata, human, import) are
  // unaffected.
  const runFilteredSignals = filterSignalsToLatestRun(signals, latestRunByDoc);

  // Phase 5.1 (Codex round 15 P1, deferred from Phase 1 §3.12) — keep only
  // signals from the LATEST extractor version per
  // (documentId, signalScopeKey, kind) group. After a parser upgrade, an old
  // v1 signal must NOT be able to beat the new v2 signal on confidence/
  // precision/scope tiebreakers. Strict version-wins-all rule.
  const filteredSignals = keepLatestExtractorVersionPerScope(runFilteredSignals);

  // Group signals by documentId.
  const signalsByDocId = new Map<string, EvidenceSignal[]>();
  for (const s of filteredSignals) {
    const list = signalsByDocId.get(s.documentId);
    if (list) list.push(s);
    else signalsByDocId.set(s.documentId, [s]);
  }

  const out: Record<string, DocumentEvidenceContext> = {};
  for (const doc of docs) {
    const docSignals = signalsByDocId.get(doc.id) ?? [];

    const manualParent = doc.corpusParentDocumentId
      ? (() => {
          const parent = docById.get(doc.corpusParentDocumentId!);
          return parent ? { id: parent.id, name: parent.name } : null;
        })()
      : null;

    const documentDate = pickBestDateSignal(docSignals, ["DOCUMENT_DATE"]);
    const asOf = pickBestDateSignal(docSignals, ["CAP_TABLE_AS_OF", "BALANCE_SHEET_AS_OF"]);
    const forecast = pickBestPeriodSignal(docSignals, ["FINANCIAL_PERIOD_FORECAST"]);
    const actuals = collectPeriodSignals(docSignals, ["FINANCIAL_PERIOD_ACTUAL"]);
    const detectedAttachments = collectAttachmentSignals(docSignals, docById);
    const claims = collectClaimSignals(docSignals);
    const staleWarnings = computeStaleWarnings({
      doc,
      asOf,
      forecast,
      today,
      capTableStaleMonths,
      balanceSheetStaleMonths,
    });

    out[doc.id] = {
      documentId: doc.id,
      documentName: doc.name,
      documentType: doc.type,
      documentDate,
      asOf,
      forecast,
      actuals,
      manualParent,
      detectedAttachments,
      claims,
      staleWarnings,
    };
  }

  return out;
}

// ============================================================
// Pickers
// ============================================================

function pickBestDateSignal(
  signals: EvidenceSignal[],
  kinds: EvidenceSignalKind[]
): ResolvedDate | null {
  const eligible = signals.filter((s) => kinds.includes(s.kind) && s.asOfDate !== null);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const conf = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (conf !== 0) return conf;
    const prec = (PRECISION_RANK[b.precision] ?? 0) - (PRECISION_RANK[a.precision] ?? 0);
    if (prec !== 0) return prec;
    const scope = SCOPE_RANK(b.signalScopeKey) - SCOPE_RANK(a.signalScopeKey);
    if (scope !== 0) return scope;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const best = eligible[0];
  return {
    date: best.asOfDate!,
    precision: best.precision,
    confidence: best.confidence,
    signalScopeKey: best.signalScopeKey,
    evidenceText: best.evidenceText ? safeDecrypt(best.evidenceText) : null,
    signalId: best.id,
    signalKind: best.kind,
  };
}

function pickBestPeriodSignal(
  signals: EvidenceSignal[],
  kinds: EvidenceSignalKind[]
): ResolvedPeriod | null {
  const eligible = signals.filter((s) => kinds.includes(s.kind) && s.dateStart !== null && s.dateEnd !== null);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const conf = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (conf !== 0) return conf;
    return (b.dateEnd?.getTime() ?? 0) - (a.dateEnd?.getTime() ?? 0);
  });
  const best = eligible[0];
  const decoded = safeDecryptJsonField<{ yearsCovered?: unknown }>(best.valueJson);
  const years = Array.isArray(decoded?.yearsCovered)
    ? (decoded!.yearsCovered as unknown[]).filter((y): y is number => typeof y === "number")
    : [];
  return {
    start: best.dateStart!,
    end: best.dateEnd!,
    yearsCovered: years,
    confidence: best.confidence,
    signalId: best.id,
  };
}

function collectPeriodSignals(
  signals: EvidenceSignal[],
  kinds: EvidenceSignalKind[]
): ResolvedPeriod[] {
  const eligible = signals.filter((s) => kinds.includes(s.kind) && s.dateStart !== null && s.dateEnd !== null);
  eligible.sort((a, b) => (a.dateStart?.getTime() ?? 0) - (b.dateStart?.getTime() ?? 0));
  return eligible.map((s) => {
    const decoded = safeDecryptJsonField<{ yearsCovered?: unknown }>(s.valueJson);
    const years = Array.isArray(decoded?.yearsCovered)
      ? (decoded!.yearsCovered as unknown[]).filter((y): y is number => typeof y === "number")
      : [];
    return {
      start: s.dateStart!,
      end: s.dateEnd!,
      yearsCovered: years,
      confidence: s.confidence,
      signalId: s.id,
    };
  });
}

function collectClaimSignals(signals: EvidenceSignal[]): ResolvedClaim[] {
  const eligible = signals.filter(
    (s) => s.kind === "VALUATION_CLAIM" || s.kind === "METRIC_CLAIM"
  );
  const out: ResolvedClaim[] = [];
  for (const s of eligible) {
    const decoded = safeDecryptJsonField<{
      metric?: unknown;
      amount?: unknown;
      currency?: unknown;
      classification?: unknown;
      year?: unknown;
    }>(s.valueJson);
    if (!decoded || typeof decoded.amount !== "number") continue;
    out.push({
      kind: s.kind as "VALUATION_CLAIM" | "METRIC_CLAIM",
      metric: typeof decoded.metric === "string" ? decoded.metric : null,
      amount: decoded.amount,
      currency:
        decoded.currency === "EUR" || decoded.currency === "USD" || decoded.currency === "GBP"
          ? decoded.currency
          : null,
      classification:
        decoded.classification === "actual" ||
        decoded.classification === "forecast" ||
        decoded.classification === "claim"
          ? decoded.classification
          : "claim",
      year: typeof decoded.year === "number" ? decoded.year : null,
      dateStart: s.dateStart,
      dateEnd: s.dateEnd,
      evidenceText: s.evidenceText ? safeDecrypt(s.evidenceText) : null,
      confidence: s.confidence,
      signalId: s.id,
    });
  }
  // Sort by year desc (most recent first), then by amount desc.
  out.sort((a, b) => {
    const yearCmp = (b.year ?? 0) - (a.year ?? 0);
    if (yearCmp !== 0) return yearCmp;
    return b.amount - a.amount;
  });
  return out;
}

function collectAttachmentSignals(
  signals: EvidenceSignal[],
  docById: Map<string, { id: string; name: string }>
): DetectedAttachment[] {
  const eligible = signals.filter((s) => s.kind === "ATTACHMENT_RELATION");
  const out: DetectedAttachment[] = [];
  for (const s of eligible) {
    const decoded = safeDecryptJsonField<{
      emailDocId?: string;
      matchMethod?: string;
      emailSourceDate?: string;
    }>(s.valueJson);
    if (!decoded?.emailDocId) continue;
    const email = docById.get(decoded.emailDocId);
    out.push({
      emailDocId: decoded.emailDocId,
      emailDocName: email?.name ?? null,
      emailSourceDate: decoded.emailSourceDate ? new Date(decoded.emailSourceDate) : (s.reportedAt ?? null),
      matchMethod: decoded.matchMethod === "exact" ? "exact" : "normalized",
      signalId: s.id,
    });
  }
  return out;
}

// ============================================================
// Stale warnings
// ============================================================

function computeStaleWarnings(params: {
  doc: { id: string; type: DocumentType };
  asOf: ResolvedDate | null;
  forecast: ResolvedPeriod | null;
  today: Date;
  capTableStaleMonths: number;
  balanceSheetStaleMonths: number;
}): StaleWarning[] {
  const out: StaleWarning[] = [];

  if (params.asOf) {
    const ageDays = Math.floor((params.today.getTime() - params.asOf.date.getTime()) / (1000 * 60 * 60 * 24));
    if (params.asOf.signalKind === "CAP_TABLE_AS_OF") {
      const thresholdDays = params.capTableStaleMonths * 30;
      if (ageDays > thresholdDays) {
        out.push({
          kind: "cap_table_stale",
          severity: ageDays > thresholdDays * 1.5 ? "high" : "medium",
          message: `Cap table is ${Math.round(ageDays / 30)} months old (as of ${formatYmd(params.asOf.date)}). Request the latest cap table before relying on this.`,
          ageDays,
        });
      }
    }
    if (params.asOf.signalKind === "BALANCE_SHEET_AS_OF") {
      const thresholdDays = params.balanceSheetStaleMonths * 30;
      if (ageDays > thresholdDays) {
        out.push({
          kind: "balance_sheet_stale",
          severity: ageDays > thresholdDays * 1.5 ? "high" : "medium",
          message: `Balance sheet is ${Math.round(ageDays / 30)} months old (closed ${formatYmd(params.asOf.date)}). Request more recent statements.`,
          ageDays,
        });
      }
    }
  }

  if (params.forecast) {
    // A forecast whose start date is before today means the year is now historical
    // → require year-to-date actuals, not forecast values.
    if (params.forecast.start.getTime() <= params.today.getTime()) {
      const startedYears = params.forecast.yearsCovered.filter(
        (y) => new Date(Date.UTC(y, 0, 1)).getTime() <= params.today.getTime()
      );
      if (startedYears.length > 0) {
        out.push({
          kind: "forecast_now_historical",
          severity: "medium",
          message: `Forecast period starting ${formatYmd(params.forecast.start)} is now in progress / past (today: ${formatYmd(params.today)}). Require Year-to-Date actuals for ${startedYears.join(", ")} — do NOT treat the forecast values as realised.`,
        });
      }
    }
  }

  return out;
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Codex round 16 P1 — drop signals scoped to an OLD extraction run.
 *
 * For each signal whose `signalScopeKey` starts with `run:`, check whether
 * the referenced run is the latest terminal-success run for its document.
 * If not, drop the signal: it carries stale OCR evidence superseded by a
 * newer re-extraction.
 *
 * Signals with non-run scopes (`filename`, `source_metadata`, `human:*`,
 * `import:*`) survive unconditionally — they are not tied to a specific run.
 *
 * If the document has no run in `latestRunByDoc` (e.g. no extraction yet),
 * we conservatively keep run:* signals so we never accidentally hide
 * everything when the latest-run lookup fails partially.
 */
function filterSignalsToLatestRun(
  signals: EvidenceSignal[],
  latestRunByDoc: Map<string, string>
): EvidenceSignal[] {
  const out: EvidenceSignal[] = [];
  for (const s of signals) {
    if (!s.signalScopeKey.startsWith("run:")) {
      out.push(s);
      continue;
    }
    const latestRunId = latestRunByDoc.get(s.documentId);
    if (!latestRunId) {
      // No known latest run for this doc — keep the signal to avoid hiding all
      // evidence due to a partial lookup miss.
      out.push(s);
      continue;
    }
    const signalRunId = s.signalScopeKey.slice("run:".length);
    if (signalRunId === latestRunId) out.push(s);
    // else: stale, drop.
  }
  return out;
}

/**
 * Group by (documentId, signalScopeKey, kind), find MAX(extractorVersion) per
 * group (string sort — versions follow ISO-style `module@2026-05-18-001`),
 * keep only the rows whose extractorVersion equals the group's max.
 *
 * Why string sort works:
 *   - within a single kind, the producing module is constant (only the
 *     temporal-extractor emits CAP_TABLE_AS_OF, only the attachment-linker
 *     emits ATTACHMENT_RELATION, etc.). So `extractorVersion` strings within
 *     a group share the same `<module>@` prefix; the suffix is a date+counter
 *     that sorts lexicographically.
 *   - if a future kind ever has multiple producers, this assumption breaks
 *     and we'd need a real semver comparator. Documented for the audit trail.
 */
function keepLatestExtractorVersionPerScope(signals: EvidenceSignal[]): EvidenceSignal[] {
  const groups = new Map<string, EvidenceSignal[]>();
  for (const s of signals) {
    const key = `${s.documentId}|${s.signalScopeKey}|${s.kind}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const out: EvidenceSignal[] = [];
  for (const list of groups.values()) {
    let max = list[0].extractorVersion;
    for (const s of list) {
      if (s.extractorVersion.localeCompare(max) > 0) max = s.extractorVersion;
    }
    for (const s of list) {
      if (s.extractorVersion === max) out.push(s);
    }
  }
  return out;
}
