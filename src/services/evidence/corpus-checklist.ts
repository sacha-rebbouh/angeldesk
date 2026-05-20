/**
 * Phase B8.3 — Copy/share corpus checklist.
 *
 * Turns an `EvidenceHealthBundle` into a copy-pastable checklist the
 * BA can drop into an email to the founder, a Notion note, or a
 * Slack message. Pure function; no React, no I/O, no clipboard. The
 * panel (`evidence-health-panel.tsx`) handles the UI side.
 *
 * Two formats:
 *   - `buildCorpusChecklistMarkdown`  → Markdown with headings + bullets.
 *     Renders cleanly in Notion, GitHub, most email clients that
 *     support markdown.
 *   - `buildCorpusChecklistPlainText` → Same data, indentation-only
 *     for clipboards that don't render markdown (terminal, basic
 *     email clients). Safe fallback.
 *
 * Tone (CLAUDE.md positioning rule):
 *   Each line describes a SIGNAL or suggests an inspection action. No
 *   "rejeter", "ne pas investir", "PASS". The action verbs are
 *   neutral: "Renseigner", "Ajouter", "Comparer", "Vérifier".
 *
 * Stable ordering:
 *   Each section is HIGH → MEDIUM → LOW, then alphabetical by subject
 *   / kind so two runs on the same bundle produce identical output
 *   (good for diffing the checklist over time).
 */
import type { StaleWarningKind } from "./build-evidence-context";
import type {
  ContradictionFinding,
  ContradictionKind,
  DocumentHealthSummary,
  EvidenceHealthBundle,
  EvidenceHealthSeverity,
  MissingEvidenceFinding,
  MissingEvidenceKind,
} from "./health-report";

// ============================================================
// Labels — analytical tone only
// ============================================================

const SEVERITY_TAG: Record<EvidenceHealthSeverity, string> = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

const MISSING_LABEL: Record<MissingEvidenceKind, string> = {
  NO_CAP_TABLE_AS_OF: "Cap table sans date d’arrêté",
  NO_FINANCIAL_STATEMENTS: "Aucun document de type FINANCIAL_STATEMENTS",
  NO_FORECAST_PERIOD: "Modèle financier sans période prévisionnelle",
  NO_PITCH_DECK_DATE: "Pitch deck sans date détectée",
};

const FRESHNESS_LABEL: Record<StaleWarningKind, string> = {
  cap_table_stale: "Cap table périmée",
  balance_sheet_stale: "Bilan périmé",
  forecast_now_historical: "Forecast déjà entamé",
};

const CONTRADICTION_PREFIX: Record<ContradictionKind, string> = {
  VALUATION_MISMATCH: "Valorisation",
  METRIC_MISMATCH: "Métrique",
  CURRENCY_MISMATCH: "Devise",
};

// Per missing-kind action hint. Kept short — the BA will append context
// when they paste the checklist into their workflow. Each verb is
// neutral (no order, no "rejeter").
const MISSING_ACTION_HINT: Record<MissingEvidenceKind, string> = {
  NO_CAP_TABLE_AS_OF: "Renseigner la date d’arrêté ou ajouter une cap table datée.",
  NO_FINANCIAL_STATEMENTS: "Ajouter un bilan ou compte de résultat audité.",
  NO_FORECAST_PERIOD: "Vérifier que le modèle financier expose une période prévisionnelle datée, ou en ajouter une.",
  NO_PITCH_DECK_DATE: "Renseigner la date du pitch deck dans le metadata editor.",
};

const FRESHNESS_ACTION_HINT: Record<StaleWarningKind, string> = {
  cap_table_stale: "Demander une cap table récente.",
  balance_sheet_stale: "Demander un bilan récent.",
  forecast_now_historical: "Demander des actuals / YTD pour combler la fenêtre prévisionnelle déjà passée.",
};

// ============================================================
// Public API
// ============================================================

export interface BuildCorpusChecklistOptions {
  /**
   * Optional generation timestamp — when omitted, the function uses
   * `new Date()`. Tests pass an explicit Date for deterministic
   * snapshots; production omits it.
   */
  now?: Date;
  /**
   * Optional deal name to surface in the header. The panel knows it;
   * the builder stays pure so the function signature carries it via
   * options instead of grabbing window/document state.
   */
  dealName?: string;
}

export function buildCorpusChecklistMarkdown(
  bundle: EvidenceHealthBundle,
  options: BuildCorpusChecklistOptions = {}
): string {
  const now = options.now ?? new Date();
  const lines: string[] = [];

  // Header — dated + (optionally) named so the BA knows what they
  // pasted into the email.
  const dateLabel = formatDate(now);
  const title = options.dealName
    ? `**Contrôle du corpus — ${options.dealName}** (généré ${dateLabel})`
    : `**Contrôle du corpus** (généré ${dateLabel})`;
  lines.push(title, "");

  const { report, byDocument } = bundle;
  const total =
    report.contradictions.length + report.missing.length + sumFreshness(byDocument);

  if (total === 0) {
    lines.push("_Aucun signal à reporter sur le corpus actuel._");
    return lines.join("\n");
  }

  // 1. Contradictions
  if (report.contradictions.length > 0) {
    lines.push(`## Contradictions détectées (${report.contradictions.length})`);
    const sorted = [...report.contradictions].sort(compareContradictionForChecklist);
    for (const c of sorted) {
      lines.push(`- ${formatContradiction(c)}`);
    }
    lines.push("");
  }

  // 2. Missing
  if (report.missing.length > 0) {
    lines.push(`## Pièces ou repères manquants (${report.missing.length})`);
    const sorted = [...report.missing].sort(compareMissingForChecklist);
    for (const m of sorted) {
      lines.push(`- ${formatMissing(m, byDocument)}`);
    }
    lines.push("");
  }

  // 3. Freshness
  const freshness = flattenFreshness(byDocument);
  if (freshness.length > 0) {
    lines.push(`## Fraîcheur (${freshness.length})`);
    for (const f of freshness) {
      lines.push(`- ${formatFreshness(f)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildCorpusChecklistPlainText(
  bundle: EvidenceHealthBundle,
  options: BuildCorpusChecklistOptions = {}
): string {
  // Reuses the markdown builder, then strips the **bold** and ##
  // heading markers so the output is readable in clipboards that
  // render text-only (terminal, some lightweight email clients).
  // Heading hierarchy is preserved via uppercase + underline.
  const md = buildCorpusChecklistMarkdown(bundle, options);
  const transformed: string[] = [];
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      const heading = line.slice(3);
      transformed.push(heading);
      transformed.push("-".repeat(heading.length));
      continue;
    }
    transformed.push(line.replace(/\*\*/g, "").replace(/^_(.+)_$/, "$1"));
  }
  return transformed.join("\n").trimEnd();
}

// ============================================================
// Formatting
// ============================================================

function formatContradiction(c: ContradictionFinding): string {
  const yearLabel = c.year !== null ? ` ${c.year}` : " (non datée)";
  const prefix = CONTRADICTION_PREFIX[c.kind];
  const subject = c.subject === "VALUATION" ? "Valorisation" : c.subject;
  const docs = uniqueDocNames(c);
  const docList = docs.length > 0 ? ` — Documents concernés : ${docs.join(", ")}.` : "";
  // The contradiction's `reason` is already a French analytical sentence
  // built by `health-report.ts:buildContradictionReason`. Pass it
  // through verbatim — recomposing it would risk drift between the
  // panel's display and the checklist.
  return `[${SEVERITY_TAG[c.severity]}] ${prefix} — ${subject}${yearLabel}. ${c.reason}${docList}`;
}

function formatMissing(
  m: MissingEvidenceFinding,
  byDocument: Record<string, DocumentHealthSummary>
): string {
  const label = MISSING_LABEL[m.kind] ?? m.kind;
  const docs = m.affectedDocumentIds
    .map((id) => byDocument[id]?.documentName)
    .filter((name): name is string => Boolean(name));
  const docContext = docs.length > 0 ? ` — Documents concernés : ${docs.join(", ")}.` : "";
  const hint = MISSING_ACTION_HINT[m.kind] ?? "";
  const action = hint ? ` → ${hint}` : "";
  return `[${SEVERITY_TAG[m.severity]}] ${label}.${docContext}${action}`;
}

interface FreshnessEntryFlat {
  documentId: string;
  documentName: string;
  kind: StaleWarningKind;
  severity: EvidenceHealthSeverity;
}

function formatFreshness(entry: FreshnessEntryFlat): string {
  const label = FRESHNESS_LABEL[entry.kind] ?? entry.kind;
  const hint = FRESHNESS_ACTION_HINT[entry.kind] ?? "";
  const action = hint ? ` → ${hint}` : "";
  return `[${SEVERITY_TAG[entry.severity]}] ${label} : ${entry.documentName}.${action}`;
}

// ============================================================
// Helpers
// ============================================================

function uniqueDocNames(c: ContradictionFinding): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sig of c.signals) {
    if (seen.has(sig.documentId)) continue;
    seen.add(sig.documentId);
    out.push(sig.documentName);
  }
  return out;
}

function sumFreshness(byDocument: Record<string, DocumentHealthSummary>): number {
  let total = 0;
  for (const summary of Object.values(byDocument)) total += summary.freshness.length;
  return total;
}

function flattenFreshness(
  byDocument: Record<string, DocumentHealthSummary>
): FreshnessEntryFlat[] {
  const out: FreshnessEntryFlat[] = [];
  for (const [docId, summary] of Object.entries(byDocument)) {
    for (const f of summary.freshness) {
      out.push({
        documentId: docId,
        documentName: summary.documentName ?? "Document",
        kind: f.kind,
        severity: f.severity,
      });
    }
  }
  out.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    return a.documentName.localeCompare(b.documentName);
  });
  return out;
}

function severityRank(s: EvidenceHealthSeverity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

function compareContradictionForChecklist(
  a: ContradictionFinding,
  b: ContradictionFinding
): number {
  const sev = severityRank(b.severity) - severityRank(a.severity);
  if (sev !== 0) return sev;
  const subj = a.subject.localeCompare(b.subject);
  if (subj !== 0) return subj;
  return (a.year ?? 0) - (b.year ?? 0);
}

function compareMissingForChecklist(
  a: MissingEvidenceFinding,
  b: MissingEvidenceFinding
): number {
  const sev = severityRank(b.severity) - severityRank(a.severity);
  if (sev !== 0) return sev;
  return a.kind.localeCompare(b.kind);
}

function formatDate(d: Date): string {
  // YYYY-MM-DD HH:mm in UTC so two runs in different timezones produce
  // identical checklists. The panel passes `new Date()` from the
  // user's browser; UTC normalises the surface so a checklist shared
  // across teams is unambiguous.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}
