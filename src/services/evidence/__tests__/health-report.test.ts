/**
 * Phase 7 — Unit tests for the evidence-health aggregator.
 *
 * Coverage:
 *   - Contradictions: HIGH (actual vs claim), MEDIUM (claim vs claim),
 *     LOW (currency mismatch), no-finding (within tolerance), VALUATION.
 *   - Missing evidence: cap table without asOf, no cap table at all,
 *     no FINANCIAL_STATEMENTS, FINANCIAL_MODEL without forecast,
 *     undated PITCH_DECKs.
 *   - Freshness rollup: counts by kind.
 *   - Ordering: HIGH first then MEDIUM then LOW.
 *
 * Positioning rule (CLAUDE.md): findings describe SIGNALS analytically,
 * never prescribe. Tests assert tone via absence of forbidden tokens.
 */
import { describe, expect, it } from "vitest";
import { buildEvidenceHealthBundle, buildEvidenceHealthReport } from "../health-report";
import type {
  DocumentEvidenceContext,
  ResolvedClaim,
} from "../build-evidence-context";

function mkDoc(over: Partial<DocumentEvidenceContext> & {
  documentId: string;
  documentName: string;
  documentType: DocumentEvidenceContext["documentType"];
}): DocumentEvidenceContext {
  return {
    documentDate: null,
    asOf: null,
    forecast: null,
    actuals: [],
    manualParent: null,
    detectedAttachments: [],
    claims: [],
    staleWarnings: [],
    ...over,
  } as DocumentEvidenceContext;
}

function mkClaim(over: Partial<ResolvedClaim> & {
  metric: string | null;
  amount: number;
  classification: "actual" | "forecast" | "claim";
}): ResolvedClaim {
  return {
    kind: "METRIC_CLAIM",
    currency: "EUR",
    year: 2025,
    dateStart: new Date("2025-01-01T00:00:00Z"),
    dateEnd: new Date("2025-12-31T00:00:00Z"),
    evidenceText: null,
    confidence: "HIGH",
    signalId: `sig-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  } as ResolvedClaim;
}

// ============================================================
// Contradictions
// ============================================================
describe("buildEvidenceHealthReport — contradictions", () => {
  it("HIGH severity quand actual (bilan) contredit claim (deck) avec >20% d'écart", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck Avekapeti.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "CA", amount: 3_000_000, classification: "claim" })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan 2025.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 1_800_000, classification: "actual" })],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(1);
    const c = report.contradictions[0];
    expect(c.kind).toBe("METRIC_MISMATCH");
    expect(c.subject).toBe("CA");
    expect(c.year).toBe(2025);
    expect(c.severity).toBe("HIGH"); // actual vs claim
    expect(c.spreadRatio).toBeGreaterThan(1.2);
    expect(c.signals).toHaveLength(2);
    // Tone analytical, never prescriptive.
    expect(c.reason).not.toMatch(/(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i);
  });

  it("MEDIUM severity quand claim vs forecast contradictoires (aucun actual)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "ARR", amount: 1_500_000, classification: "claim" })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "BP.xlsx",
        documentType: "FINANCIAL_MODEL",
        claims: [mkClaim({ metric: "ARR", amount: 3_000_000, classification: "forecast" })],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(1);
    expect(report.contradictions[0].severity).toBe("MEDIUM");
  });

  it("aucune contradiction si écart < 20% (rounding-noise tolerance)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "CA", amount: 2_000_000, classification: "claim" })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 2_200_000, classification: "actual" })], // 10% diff
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(0);
  });

  it("CURRENCY_MISMATCH LOW si même claim en EUR et GBP (comparaison non significative)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck FR.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "ARR", amount: 1_000_000, currency: "EUR", classification: "claim" })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Deck UK.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "ARR", amount: 1_000_000, currency: "GBP", classification: "claim" })],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(1);
    const c = report.contradictions[0];
    expect(c.kind).toBe("CURRENCY_MISMATCH");
    expect(c.severity).toBe("LOW");
    expect(c.spreadRatio).toBeNull();
  });

  it("VALUATION_MISMATCH HIGH si actual (term sheet) contredit claim (deck) sur valorisation", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [
          mkClaim({
            kind: "VALUATION_CLAIM",
            metric: null,
            amount: 5_000_000,
            year: 2026,
            classification: "claim",
          }),
        ],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "TermSheet.pdf",
        documentType: "TERM_SHEET",
        claims: [
          mkClaim({
            kind: "VALUATION_CLAIM",
            metric: null,
            amount: 8_000_000,
            year: 2026,
            classification: "actual",
          }),
        ],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    const v = report.contradictions.find((c) => c.kind === "VALUATION_MISMATCH");
    expect(v).toBeDefined();
    expect(v!.subject).toBe("VALUATION");
    expect(v!.severity).toBe("HIGH");
  });

  it("ignore METRIC_CLAIM sans year (CA sans year est trop ambigu pour grouper)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "CA", amount: 1_000_000, year: null, classification: "claim" })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 5_000_000, year: null, classification: "actual" })],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(0);
  });

  it("Codex round 22 P1 — VALUATION_CLAIM sans year DOIT être groupée (extractor Phase 6 émet year=null)", () => {
    // L'extractor Phase 6 émet les valuations classiques ("valorisation 5M€")
    // avec year=null. Sans ce groupement, une divergence majeure de valo entre
    // deck et term sheet passe sous le radar. Le health layer DOIT l'attraper.
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [
          mkClaim({
            kind: "VALUATION_CLAIM",
            metric: null,
            amount: 5_000_000,
            year: null,
            dateStart: null,
            dateEnd: null,
            classification: "claim",
          }),
        ],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "TermSheet.pdf",
        documentType: "TERM_SHEET",
        claims: [
          mkClaim({
            kind: "VALUATION_CLAIM",
            metric: null,
            amount: 8_000_000,
            year: null,
            dateStart: null,
            dateEnd: null,
            classification: "actual",
          }),
        ],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    const v = report.contradictions.find((c) => c.kind === "VALUATION_MISMATCH");
    expect(v).toBeDefined();
    expect(v!.subject).toBe("VALUATION");
    expect(v!.year).toBeNull(); // undated
    expect(v!.severity).toBe("HIGH"); // actual term sheet contradicts deck claim
    expect(v!.signals).toHaveLength(2);
  });

  it("dédup intra-doc : même claim émise 2 fois sur le même doc ≠ contradiction", () => {
    // En pratique le dédup est fait par l'extractor, mais on défend la fonction
    // contre le cas où on lui passe 2 entrées identiques.
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [
          mkClaim({ metric: "CA", amount: 3_000_000, classification: "claim", signalId: "s1" }),
          mkClaim({ metric: "CA", amount: 3_000_000, classification: "claim", signalId: "s2" }),
        ],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions).toHaveLength(0);
  });

  it("ordre stable : HIGH avant MEDIUM avant LOW", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [
          mkClaim({ metric: "CA", amount: 1_000_000, classification: "claim", year: 2025 }),
          mkClaim({ metric: "ARR", amount: 1_000_000, currency: "EUR", classification: "claim", year: 2025 }),
        ],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 2_000_000, classification: "actual", year: 2025 })], // HIGH
      }),
      d3: mkDoc({
        documentId: "d3",
        documentName: "BP.xlsx",
        documentType: "FINANCIAL_MODEL",
        claims: [mkClaim({ metric: "ARR", amount: 3_000_000, currency: "GBP", classification: "forecast", year: 2025 })], // LOW (currency)
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.contradictions[0].severity).toBe("HIGH");
    expect(report.contradictions[report.contradictions.length - 1].severity).toBe("LOW");
  });
});

// ============================================================
// Missing evidence
// ============================================================
describe("buildEvidenceHealthReport — missing evidence", () => {
  it("HIGH si cap table présente mais sans asOf détecté", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "CapTable.xlsx",
        documentType: "CAP_TABLE",
        asOf: null,
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_CAP_TABLE_AS_OF");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("HIGH");
    expect(f!.affectedDocumentIds).toEqual(["d1"]);
  });

  it("MEDIUM si aucune cap table n'a été uploadée du tout", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck.pdf", documentType: "PITCH_DECK" }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_CAP_TABLE_AS_OF");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("MEDIUM");
    expect(f!.affectedDocumentIds).toEqual([]);
  });

  it("pas de finding si cap table a un CAP_TABLE_AS_OF valide", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "CapTable.xlsx",
        documentType: "CAP_TABLE",
        asOf: {
          date: new Date("2025-09-30T00:00:00Z"),
          precision: "DAY",
          confidence: "HIGH",
          signalScopeKey: "run:r1",
          evidenceText: null,
          signalId: "s1",
          signalKind: "CAP_TABLE_AS_OF",
        },
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.missing.find((x) => x.kind === "NO_CAP_TABLE_AS_OF")).toBeUndefined();
  });

  it("MEDIUM si aucun FINANCIAL_STATEMENTS dans le corpus", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck.pdf", documentType: "PITCH_DECK" }),
      d2: mkDoc({ documentId: "d2", documentName: "BP.xlsx", documentType: "FINANCIAL_MODEL" }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_FINANCIAL_STATEMENTS");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("MEDIUM");
  });

  it("MEDIUM si TOUS les FINANCIAL_MODEL n'ont pas de forecast period", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "BP.xlsx", documentType: "FINANCIAL_MODEL", forecast: null }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_FORECAST_PERIOD");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("MEDIUM");
    expect(f!.affectedDocumentIds).toEqual(["d1"]);
  });

  it("Codex round 22 P2 — LOW si PARTIEL (un BP a un forecast, l'autre non) → finding ciblé, pas masqué", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      good: mkDoc({
        documentId: "good",
        documentName: "BP-2026.xlsx",
        documentType: "FINANCIAL_MODEL",
        forecast: {
          start: new Date("2026-01-01T00:00:00Z"),
          end: new Date("2026-12-31T00:00:00Z"),
          yearsCovered: [2026],
          confidence: "HIGH",
          signalId: "sig-fcst",
        },
      }),
      bad: mkDoc({ documentId: "bad", documentName: "BP-old.xlsx", documentType: "FINANCIAL_MODEL", forecast: null }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_FORECAST_PERIOD");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("LOW"); // partial — strictly less alarming than full miss
    expect(f!.affectedDocumentIds).toEqual(["bad"]); // only the broken doc
    expect(f!.message).toMatch(/1 sur 2/);
  });

  it("aucun finding NO_FORECAST_PERIOD si tous les FINANCIAL_MODEL ont leur forecast", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "BP.xlsx",
        documentType: "FINANCIAL_MODEL",
        forecast: {
          start: new Date("2026-01-01T00:00:00Z"),
          end: new Date("2026-12-31T00:00:00Z"),
          yearsCovered: [2026],
          confidence: "HIGH",
          signalId: "sig-fcst",
        },
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.missing.find((x) => x.kind === "NO_FORECAST_PERIOD")).toBeUndefined();
  });

  it("LOW si pitch decks sans date détectée — message indique le nombre", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck v1.pdf", documentType: "PITCH_DECK" }),
      d2: mkDoc({ documentId: "d2", documentName: "Deck v2.pdf", documentType: "PITCH_DECK" }),
    };
    const report = buildEvidenceHealthReport(docs);
    const f = report.missing.find((x) => x.kind === "NO_PITCH_DECK_DATE");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("LOW");
    expect(f!.affectedDocumentIds).toEqual(["d1", "d2"]);
    expect(f!.message).toContain("2 pitch decks");
  });

  it("tone analytique : aucun finding ne prescrit ('rejet', 'pass', 'investir')", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "CT.xlsx", documentType: "CAP_TABLE" }),
    };
    const report = buildEvidenceHealthReport(docs);
    for (const f of report.missing) {
      expect(f.message).not.toMatch(/(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i);
    }
  });
});

// ============================================================
// Freshness rollup
// ============================================================
describe("buildEvidenceHealthReport — freshness rollup", () => {
  it("compte staleWarnings par kind sur tous les docs", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "CT.xlsx",
        documentType: "CAP_TABLE",
        staleWarnings: [{ kind: "cap_table_stale", severity: "medium", message: "x" }],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        staleWarnings: [{ kind: "balance_sheet_stale", severity: "high", message: "y" }],
      }),
      d3: mkDoc({
        documentId: "d3",
        documentName: "BP.xlsx",
        documentType: "FINANCIAL_MODEL",
        staleWarnings: [
          { kind: "forecast_now_historical", severity: "medium", message: "z" },
          { kind: "forecast_now_historical", severity: "medium", message: "z2" },
        ],
      }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.freshness.total).toBe(4);
    expect(report.freshness.countsByKind.cap_table_stale).toBe(1);
    expect(report.freshness.countsByKind.balance_sheet_stale).toBe(1);
    expect(report.freshness.countsByKind.forecast_now_historical).toBe(2);
  });

  it("zéro warnings → total=0, counts vides", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck.pdf", documentType: "PITCH_DECK" }),
    };
    const report = buildEvidenceHealthReport(docs);
    expect(report.freshness.total).toBe(0);
    expect(report.freshness.countsByKind.cap_table_stale).toBe(0);
  });
});

describe("buildEvidenceHealthReport — empty deal", () => {
  it("corpus vide → report vide (pas de missing pour 'no decks'), pas de crash", () => {
    const report = buildEvidenceHealthReport({});
    expect(report.contradictions).toEqual([]);
    // Avec 0 doc, on n'a pas de cap table, donc on doit avoir NO_CAP_TABLE_AS_OF MEDIUM
    // et NO_FINANCIAL_STATEMENTS MEDIUM (pas de doc du tout ≈ corpus incomplet).
    expect(report.missing.find((x) => x.kind === "NO_CAP_TABLE_AS_OF")?.severity).toBe("MEDIUM");
    expect(report.missing.find((x) => x.kind === "NO_FINANCIAL_STATEMENTS")?.severity).toBe("MEDIUM");
    expect(report.freshness.total).toBe(0);
  });
});

// ============================================================
// Phase 8 — buildEvidenceHealthBundle (report + byDocument)
// ============================================================
describe("buildEvidenceHealthBundle — per-document summary", () => {
  it("contradictions : tally + highest severity par doc impliqué", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "CA", amount: 3_000_000, classification: "claim", year: 2025 })],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 1_800_000, classification: "actual", year: 2025 })],
      }),
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.byDocument.d1.contradictionCount).toBe(1);
    expect(bundle.byDocument.d2.contradictionCount).toBe(1);
    expect(bundle.byDocument.d1.highestContradictionSeverity).toBe("HIGH"); // actual vs claim
    expect(bundle.byDocument.d2.highestContradictionSeverity).toBe("HIGH");
  });

  it("contradiction HIGH + LOW sur même doc → highestContradictionSeverity = HIGH", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Deck.pdf",
        documentType: "PITCH_DECK",
        claims: [
          mkClaim({ metric: "CA", amount: 1_000_000, classification: "claim", year: 2025 }),
          mkClaim({ metric: "ARR", amount: 1_000_000, currency: "EUR", classification: "claim", year: 2025 }),
        ],
      }),
      d2: mkDoc({
        documentId: "d2",
        documentName: "Bilan.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        claims: [mkClaim({ metric: "CA", amount: 2_000_000, classification: "actual", year: 2025 })], // HIGH
      }),
      d3: mkDoc({
        documentId: "d3",
        documentName: "Deck-UK.pdf",
        documentType: "PITCH_DECK",
        claims: [mkClaim({ metric: "ARR", amount: 1_000_000, currency: "GBP", classification: "claim", year: 2025 })], // LOW currency
      }),
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.byDocument.d1.contradictionCount).toBe(2); // CA + ARR
    expect(bundle.byDocument.d1.highestContradictionSeverity).toBe("HIGH");
    expect(bundle.byDocument.d3.highestContradictionSeverity).toBe("LOW");
  });

  it("missing : projeté uniquement sur docs affectés avec sévérité (NO_FINANCIAL_STATEMENTS deal-level ignoré)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck.pdf", documentType: "PITCH_DECK" }), // → NO_PITCH_DECK_DATE LOW
      d2: mkDoc({ documentId: "d2", documentName: "CT.xlsx", documentType: "CAP_TABLE", asOf: null }), // → NO_CAP_TABLE_AS_OF HIGH
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.byDocument.d1.missing).toEqual([{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }]);
    expect(bundle.byDocument.d2.missing).toEqual([{ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH" }]);
    // NO_FINANCIAL_STATEMENTS is deal-level (affectedDocumentIds=[]), should NOT appear in byDocument
    expect(bundle.byDocument.d1.missing.map((m) => m.kind)).not.toContain("NO_FINANCIAL_STATEMENTS");
  });

  it("freshness : copie staleWarnings avec sévérité normalisée + dédup en max-severity (Codex round 24 P1)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "CT.xlsx",
        documentType: "CAP_TABLE",
        staleWarnings: [
          { kind: "cap_table_stale", severity: "medium", message: "x" },
          { kind: "cap_table_stale", severity: "high", message: "x2" }, // dédup → keep HIGH (la plus grave)
        ],
      }),
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.byDocument.d1.freshness).toEqual([{ kind: "cap_table_stale", severity: "HIGH" }]);
  });

  it("doc sans aucun finding → bucket vide (counts à 0, arrays vides)", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({
        documentId: "d1",
        documentName: "Bilan-récent.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        documentDate: {
          date: new Date("2026-03-01T00:00:00Z"),
          precision: "MONTH",
          confidence: "HIGH",
          signalScopeKey: "run:r1",
          evidenceText: null,
          signalId: "sig",
          signalKind: "DOCUMENT_DATE",
        },
      }),
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.byDocument.d1.contradictionCount).toBe(0);
    expect(bundle.byDocument.d1.highestContradictionSeverity).toBeNull();
    expect(bundle.byDocument.d1.missing).toEqual([]);
    expect(bundle.byDocument.d1.freshness).toEqual([]);
  });

  it("bundle inclut report + byDocument, byDocument une entrée par doc", () => {
    const docs: Record<string, DocumentEvidenceContext> = {
      d1: mkDoc({ documentId: "d1", documentName: "Deck.pdf", documentType: "PITCH_DECK" }),
      d2: mkDoc({ documentId: "d2", documentName: "Bilan.pdf", documentType: "FINANCIAL_STATEMENTS" }),
    };
    const bundle = buildEvidenceHealthBundle(docs);
    expect(bundle.report).toBeDefined();
    expect(Object.keys(bundle.byDocument).sort()).toEqual(["d1", "d2"]);
  });
});
