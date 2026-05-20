/**
 * Phase B8.3 — Pure builder tests for `buildCorpusChecklist*`.
 *
 * The builder turns an `EvidenceHealthBundle` into a copy-pastable
 * checklist. Tests assert:
 *
 *   - Empty bundle → "Aucun signal" line (no spurious sections).
 *   - Each section present iff at least one finding exists.
 *   - Stable ordering HIGH > MEDIUM > LOW, then alphabetical.
 *   - Per-item: severity tag + label + reason + action hint.
 *   - Tone analytical (CLAUDE.md positioning rule — no GO/NO_GO/PASS/
 *     INVESTIR/REJETER).
 *   - Date formatting deterministic (UTC, fixed precision).
 *   - Markdown vs plain-text divergence: ## headings → uppercase + dashes,
 *     **bold** stripped.
 */
import { describe, expect, it } from "vitest";

import {
  buildCorpusChecklistMarkdown,
  buildCorpusChecklistPlainText,
  type EvidenceHealthBundle,
  type ContradictionFinding,
  type DocumentHealthSummary,
  type MissingEvidenceFinding,
} from "@/services/evidence";

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

const NOW = new Date("2026-05-19T08:30:00Z");

function makeSummary(name: string, freshness: DocumentHealthSummary["freshness"] = []): DocumentHealthSummary {
  return {
    contradictionCount: 0,
    highestContradictionSeverity: null,
    missing: [],
    freshness,
    documentName: name,
    documentType: "PITCH_DECK",
  };
}

function makeBundle(overrides: Partial<EvidenceHealthBundle> = {}): EvidenceHealthBundle {
  return {
    report: {
      contradictions: [],
      missing: [],
      freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      ...overrides.report,
    },
    byDocument: overrides.byDocument ?? {},
  };
}

function makeContradiction(
  partial: Partial<ContradictionFinding> & { subject: string }
): ContradictionFinding {
  return {
    kind: "METRIC_MISMATCH",
    year: 2025,
    severity: "HIGH",
    reason: "reason text",
    spreadRatio: 1.5,
    signals: [
      {
        documentId: "d_a",
        documentName: "a.pdf",
        documentType: "PITCH_DECK",
        classification: "claim",
        amount: 1_000_000,
        currency: "EUR",
        signalId: "s_a",
      },
      {
        documentId: "d_b",
        documentName: "b.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        classification: "actual",
        amount: 2_000_000,
        currency: "EUR",
        signalId: "s_b",
      },
    ],
    ...partial,
  };
}

function makeMissing(
  partial: Partial<MissingEvidenceFinding> & { kind: MissingEvidenceFinding["kind"] }
): MissingEvidenceFinding {
  return {
    severity: "MEDIUM",
    message: "msg",
    affectedDocumentIds: [],
    ...partial,
  };
}

// ----------------------------------------------------------------
// Empty bundle
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — empty bundle", () => {
  it("returns the header + 'Aucun signal' line and no section headings", () => {
    const md = buildCorpusChecklistMarkdown(makeBundle(), { now: NOW });
    expect(md).toMatch(/^\*\*Contrôle du corpus\*\* \(généré 2026-05-19 08:30 UTC\)/);
    expect(md).toMatch(/Aucun signal à reporter/);
    expect(md).not.toContain("## Contradictions");
    expect(md).not.toContain("## Pièces");
    expect(md).not.toContain("## Fraîcheur");
  });

  it("honours `dealName` in the header when provided", () => {
    const md = buildCorpusChecklistMarkdown(makeBundle(), { now: NOW, dealName: "Acme" });
    expect(md).toMatch(/^\*\*Contrôle du corpus — Acme\*\*/);
  });
});

// ----------------------------------------------------------------
// Sections present iff findings exist
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — section presence", () => {
  it("renders the contradiction section only when contradictions are present", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [makeContradiction({ subject: "CA" })],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toContain("## Contradictions détectées (1)");
    expect(md).not.toContain("## Pièces");
    expect(md).not.toContain("## Fraîcheur");
  });

  it("renders the missing section only when missing findings are present", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [],
        missing: [makeMissing({ kind: "NO_FINANCIAL_STATEMENTS" })],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toContain("## Pièces ou repères manquants (1)");
    expect(md).toContain("Aucun document de type FINANCIAL_STATEMENTS");
  });

  it("renders the freshness section only when freshness entries exist on byDocument", () => {
    const bundle = makeBundle({
      byDocument: {
        d_a: makeSummary("captable.xlsx", [{ kind: "cap_table_stale", severity: "HIGH" }]),
      },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toContain("## Fraîcheur (1)");
    expect(md).toMatch(/\[HIGH\] Cap table périmée : captable\.xlsx/);
  });
});

// ----------------------------------------------------------------
// Ordering (HIGH > MEDIUM > LOW)
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — stable ordering", () => {
  it("sorts contradictions HIGH first, then alphabetical by subject", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [
          makeContradiction({ subject: "ARR", severity: "LOW" }),
          makeContradiction({ subject: "CA", severity: "HIGH" }),
          makeContradiction({ subject: "MRR", severity: "MEDIUM" }),
        ],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    const ca = md.indexOf("Métrique — CA");
    const mrr = md.indexOf("Métrique — MRR");
    const arr = md.indexOf("Métrique — ARR");
    expect(ca).toBeGreaterThan(-1);
    expect(mrr).toBeGreaterThan(-1);
    expect(arr).toBeGreaterThan(-1);
    expect(ca).toBeLessThan(mrr);
    expect(mrr).toBeLessThan(arr);
  });

  it("sorts freshness entries HIGH first, then alphabetical by documentName", () => {
    const bundle = makeBundle({
      byDocument: {
        z: makeSummary("Z-doc", [{ kind: "balance_sheet_stale", severity: "LOW" }]),
        a: makeSummary("A-doc", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        b: makeSummary("B-doc", [{ kind: "forecast_now_historical", severity: "MEDIUM" }]),
      },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    const a = md.indexOf("A-doc");
    const b = md.indexOf("B-doc");
    const z = md.indexOf("Z-doc");
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(z);
  });
});

// ----------------------------------------------------------------
// Per-item formatting + action hints
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — per-item formatting", () => {
  it("contradiction line carries severity tag + kind prefix + subject + reason + doc list", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [makeContradiction({ subject: "CA" })],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toMatch(/\[HIGH\] Métrique — CA 2025\. reason text — Documents concernés : a\.pdf, b\.pdf\./);
  });

  it("contradiction without year → '(non datée)' label", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [makeContradiction({ subject: "CA", year: null })],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    });
    expect(buildCorpusChecklistMarkdown(bundle, { now: NOW })).toContain("CA (non datée)");
  });

  it("missing line carries severity + label + action hint", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [],
        missing: [makeMissing({ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH", affectedDocumentIds: ["d_a"] })],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("captable.xlsx") },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toMatch(/\[HIGH\] Cap table sans date d['’]arrêté\./);
    expect(md).toMatch(/Documents concernés : captable\.xlsx/);
    expect(md).toMatch(/→ Renseigner la date d['’]arrêté ou ajouter une cap table datée\./);
  });

  it("freshness line carries severity + label + docname + action hint", () => {
    const bundle = makeBundle({
      byDocument: {
        d_a: makeSummary("model.xlsx", [{ kind: "forecast_now_historical", severity: "HIGH" }]),
      },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    expect(md).toMatch(/\[HIGH\] Forecast déjà entamé : model\.xlsx\./);
    expect(md).toMatch(/→ Demander des actuals \/ YTD/);
  });
});

// ----------------------------------------------------------------
// Tone — CLAUDE.md positioning rule
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — analytical tone", () => {
  it("never emits GO/NO_GO/PASS/INVESTIR/REJETER (positioning rule)", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [makeContradiction({ subject: "Valorisation", year: 2025, severity: "HIGH" })],
        missing: [
          makeMissing({ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH", affectedDocumentIds: ["d_a"] }),
          makeMissing({ kind: "NO_FINANCIAL_STATEMENTS", severity: "MEDIUM" }),
          makeMissing({ kind: "NO_FORECAST_PERIOD", severity: "LOW", affectedDocumentIds: ["d_a"] }),
          makeMissing({ kind: "NO_PITCH_DECK_DATE", severity: "LOW", affectedDocumentIds: ["d_b"] }),
        ],
        freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 1, forecast_now_historical: 1 }, total: 3 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        d_b: makeSummary("b.pdf", [{ kind: "balance_sheet_stale", severity: "MEDIUM" }]),
        d_c: makeSummary("c.xlsx", [{ kind: "forecast_now_historical", severity: "MEDIUM" }]),
      },
    });
    const md = buildCorpusChecklistMarkdown(bundle, { now: NOW });
    // Pattern aligned with evidence-health-badge.test.ts so we catch
    // the same prescriptive vocabulary the rest of the codebase
    // already polices. We deliberately do NOT block bare "pass"
    // because legitimate French words ("passée" = elapsed) collide
    // with it; the banned forms in CLAUDE.md are the verdict labels
    // (`STRONG_PASS`, `WEAK_PASS`, `CONDITIONAL_PASS`) and the
    // imperative verbs (`rejeter`, `investir`, `fuyez`), not the
    // generic past-participle.
    expect(md).not.toMatch(
      /(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i
    );
  });
});

// ----------------------------------------------------------------
// Plain-text variant
// ----------------------------------------------------------------

describe("buildCorpusChecklistPlainText", () => {
  it("strips **bold** + transforms ## headings to uppercase + underline", () => {
    const bundle = makeBundle({
      report: {
        contradictions: [makeContradiction({ subject: "CA", severity: "HIGH" })],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    });
    const txt = buildCorpusChecklistPlainText(bundle, { now: NOW });
    expect(txt).not.toMatch(/\*\*/);
    expect(txt).toContain("Contrôle du corpus");
    expect(txt).toContain("Contradictions détectées (1)");
    expect(txt).toMatch(/Contradictions détectées \(1\)\n-+/);
  });

  it("empty bundle → italic-stripped 'Aucun signal' line", () => {
    const txt = buildCorpusChecklistPlainText(makeBundle(), { now: NOW });
    // `_..._` markdown italics stripped to plain
    expect(txt).toContain("Aucun signal à reporter sur le corpus actuel.");
    expect(txt).not.toMatch(/_Aucun/);
  });
});

// ----------------------------------------------------------------
// Date determinism
// ----------------------------------------------------------------

describe("buildCorpusChecklistMarkdown — UTC date formatting", () => {
  it("formats `now` as YYYY-MM-DD HH:mm UTC so two timezones produce the same output", () => {
    const md1 = buildCorpusChecklistMarkdown(makeBundle(), { now: new Date("2026-12-31T23:59:30Z") });
    expect(md1).toContain("2026-12-31 23:59 UTC");
  });

  it("defaults to `new Date()` when no `now` is provided (smoke test for omitted option)", () => {
    const md = buildCorpusChecklistMarkdown(makeBundle());
    expect(md).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  });
});
