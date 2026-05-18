/**
 * Phase 5.1 — Evidence prelude formatter.
 *
 * Pure functions that turn a DocumentEvidenceContext into the markdown blocks
 * injected by base-agent.ts. No DB calls, no side effects.
 *
 * Two surfaces:
 *  - `formatGlobalEvidenceHeader(today)` — once per agent prompt, at the top
 *    of the deal context. Gives the agent an explicit "Nous sommes le …"
 *    reference (Codex Phase 5 gate).
 *  - `formatDocumentEvidencePrelude(ctx)` — once per document, injected after
 *    the existing "### name (kind, type) — produit le X, importé le Y" line.
 *
 * Output language: French (matches the rest of the deal context prelude).
 */
import type {
  ContradictionFinding,
  DetectedAttachment,
  DocumentEvidenceContext,
  EvidenceHealthReport,
  EvidenceHealthSeverity,
  MissingEvidenceFinding,
  ResolvedClaim,
  ResolvedDate,
  ResolvedPeriod,
  StaleWarning,
} from "@/services/evidence";
import { sanitizeForLLM } from "@/lib/sanitize";

const MAX_EVIDENCE_QUOTE = 200;

export function formatGlobalEvidenceHeader(today: Date): string {
  return `## Référence temporelle
**Nous sommes le ${formatFrDate(today)}.** Utilise cette date comme référence pour évaluer la fraîcheur des documents, les périodes de forecast vs actuals, et les claims financiers datés.`;
}

/**
 * Phase 7 — Global evidence-health block.
 *
 * Rendered once per agent prompt, right after the global temporal header.
 * Surfaces:
 *   - Contradictions across documents (same metric/year, different amounts).
 *   - Missing evidence (no cap table asOf, no FINANCIAL_STATEMENTS, etc.).
 *   - Freshness rollup (counts of stale signals).
 *
 * Positioning rule (CLAUDE.md): analytical tone, never prescriptive. The
 * block describes signals — the BA decides what to do with them.
 *
 * Returns an empty string if there is nothing to flag (avoid noise sections).
 */
export function formatGlobalEvidenceHealth(report: EvidenceHealthReport): string {
  const sections: string[] = [];

  if (report.contradictions.length > 0) {
    const lines: string[] = [];
    lines.push(`### Contradictions détectées (${report.contradictions.length})`);
    for (const c of report.contradictions) {
      lines.push(`- ${formatSeverityBadge(c.severity)} **${formatContradictionSubject(c.subject, c.year)}** — ${c.reason}`);
    }
    sections.push(lines.join("\n"));
  }

  if (report.missing.length > 0) {
    const lines: string[] = [];
    lines.push(`### Évidences manquantes (${report.missing.length})`);
    for (const m of report.missing) {
      lines.push(`- ${formatSeverityBadge(m.severity)} ${m.message}`);
    }
    sections.push(lines.join("\n"));
  }

  if (report.freshness.total > 0) {
    const lines: string[] = [];
    lines.push(`### Fraîcheur (${report.freshness.total} ${report.freshness.total > 1 ? "signaux dépassés" : "signal dépassé"})`);
    const counts = report.freshness.countsByKind;
    if (counts.cap_table_stale > 0) lines.push(`- Cap table périmée : ${counts.cap_table_stale} doc${counts.cap_table_stale > 1 ? "s" : ""}`);
    if (counts.balance_sheet_stale > 0) lines.push(`- Bilan périmé : ${counts.balance_sheet_stale} doc${counts.balance_sheet_stale > 1 ? "s" : ""}`);
    if (counts.forecast_now_historical > 0) lines.push(`- Forecast déjà entamé (devenu historique) : ${counts.forecast_now_historical} doc${counts.forecast_now_historical > 1 ? "s" : ""}`);
    sections.push(lines.join("\n"));
  }

  if (sections.length === 0) return "";

  return `## Évidence — état de santé du dossier\n\n${sections.join("\n\n")}`;
}

function formatSeverityBadge(severity: EvidenceHealthSeverity): string {
  return `[${severity}]`;
}

function formatContradictionSubject(subject: string, year: number | null): string {
  const yearLabel = year !== null ? ` ${year}` : "";
  if (subject === "VALUATION") return `Valorisation${yearLabel}`;
  return `${subject}${yearLabel}`;
}

// Re-exported for tests so callers can build minimal fixtures.
export type { ContradictionFinding, EvidenceHealthReport, MissingEvidenceFinding };

export function formatDocumentEvidencePrelude(ctx: DocumentEvidenceContext): string {
  const lines: string[] = [];

  if (ctx.asOf) {
    lines.push(formatAsOfLine(ctx.asOf));
  }
  if (ctx.documentDate && !ctx.asOf) {
    // Don't duplicate when both are present — asOf is more specific.
    lines.push(formatDocumentDateLine(ctx.documentDate));
  }
  if (ctx.forecast) {
    lines.push(formatForecastLine(ctx.forecast));
  }
  for (const actual of ctx.actuals) {
    lines.push(formatActualLine(actual));
  }
  for (const attachment of ctx.detectedAttachments) {
    lines.push(formatAttachmentLine(attachment));
  }
  for (const claim of ctx.claims) {
    lines.push(formatClaimLine(claim));
  }
  for (const warning of ctx.staleWarnings) {
    lines.push(formatWarningLine(warning));
  }

  if (lines.length === 0) return "";

  return lines.join("\n");
}

// ============================================================
// Per-section formatters
// ============================================================
function formatAsOfLine(asOf: ResolvedDate): string {
  const kindLabel = asOf.signalKind === "CAP_TABLE_AS_OF" ? "Cap table à jour au" : "Bilan arrêté au";
  const evidence = asOf.evidenceText
    ? ` _(citation: "${truncate(asOf.evidenceText, MAX_EVIDENCE_QUOTE)}")_`
    : "";
  return `[**${kindLabel} ${formatFrDate(asOf.date)}** — confiance ${asOf.confidence}, source ${describeSource(asOf.signalScopeKey)}]${evidence}`;
}

function formatDocumentDateLine(date: ResolvedDate): string {
  return `[**Document daté du ${formatFrDate(date.date)}** — confiance ${date.confidence}, source ${describeSource(date.signalScopeKey)}]`;
}

function formatForecastLine(period: ResolvedPeriod): string {
  const years = period.yearsCovered.length > 0
    ? period.yearsCovered.join(", ")
    : `${period.start.getUTCFullYear()}–${period.end.getUTCFullYear()}`;
  return `[**Période prévisionnelle ${years}** (du ${formatFrDate(period.start)} au ${formatFrDate(period.end)}) — confiance ${period.confidence}. Ces chiffres sont des PROJECTIONS, ne pas les traiter comme réalisés.]`;
}

function formatActualLine(period: ResolvedPeriod): string {
  const years = period.yearsCovered.length > 0
    ? period.yearsCovered.join(", ")
    : `${period.start.getUTCFullYear()}–${period.end.getUTCFullYear()}`;
  return `[Période ACTUALS ${years} (du ${formatFrDate(period.start)} au ${formatFrDate(period.end)}) — confiance ${period.confidence}.]`;
}

function formatAttachmentLine(att: DetectedAttachment): string {
  const sentLabel = att.emailSourceDate ? ` le ${formatFrDate(att.emailSourceDate)}` : "";
  const parentLabel = att.emailDocName
    ? sanitizeForLLM(att.emailDocName, { maxLength: 200, preserveNewlines: false })
    : `email ${att.emailDocId.slice(0, 8)}…`;
  const matchHint = att.matchMethod === "exact" ? "" : ` (match approximatif)`;
  return `[**Transmis par email** : ${parentLabel}${sentLabel}${matchHint}]`;
}

function formatClaimLine(claim: ResolvedClaim): string {
  const amountLabel = formatAmount(claim.amount, claim.currency);
  const metricLabel = claim.metric ?? (claim.kind === "VALUATION_CLAIM" ? "Valorisation" : "Métrique");
  const yearLabel = claim.year ? ` ${claim.year}` : "";
  // Phase 6 Codex Gate 2: surface the classification explicitly so the agent
  // never reads an EMAIL founder claim as audited evidence.
  const classificationTag =
    claim.classification === "actual"
      ? "[ACTUAL — donnée historique réalisée]"
      : claim.classification === "forecast"
        ? "[FORECAST — projection, ne pas traiter comme réalisé]"
        : "[CLAIM founder — déclaration non auditée, à vérifier]";
  // Codex round 19 P2 — include a short citation so the agent can ground the
  // claim against its source text, same pattern as the asOf line.
  const citation = claim.evidenceText
    ? ` _(citation: "${truncate(claim.evidenceText, MAX_EVIDENCE_QUOTE)}")_`
    : "";
  return `[**${metricLabel}${yearLabel}** : ${amountLabel}] ${classificationTag}${citation}`;
}

/**
 * Codex round 19 P1 — currency NEVER silently defaults to €. GBP supported
 * end-to-end via the £ sign; `null` currency is surfaced explicitly as
 * "devise inconnue" so the agent doesn't treat an unannotated amount as €.
 */
function formatAmount(amount: number, currency: "EUR" | "USD" | "GBP" | null): string {
  const sign =
    currency === "USD" ? "$"
    : currency === "GBP" ? "£"
    : currency === "EUR" ? "€"
    : null;
  const suffix = sign ?? " (devise inconnue)";
  const before = sign ?? "";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}G${before}${sign ? "" : suffix}`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M${before}${sign ? "" : suffix}`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k${before}${sign ? "" : suffix}`;
  return `${amount}${before}${sign ? "" : suffix}`;
}

function formatWarningLine(warning: StaleWarning): string {
  const icon = warning.severity === "high" ? "🛑" : warning.severity === "medium" ? "⚠️" : "ℹ️";
  return `${icon} ${warning.message}`;
}

// ============================================================
// Helpers
// ============================================================
function formatFrDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function describeSource(scopeKey: string): string {
  if (scopeKey.startsWith("run:")) return "OCR extrait";
  if (scopeKey === "source_metadata") return "metadata email";
  if (scopeKey === "filename") return "filename";
  if (scopeKey.startsWith("human:")) return "saisie manuelle";
  if (scopeKey.startsWith("import:")) return "import";
  return scopeKey;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + "…";
}
