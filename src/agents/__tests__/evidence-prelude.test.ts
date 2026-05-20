/**
 * Phase 5.1 — Unit tests for the evidence prelude formatter (pure).
 */
import { describe, expect, it } from "vitest";
import type { DocumentEvidenceContext } from "@/services/evidence";
import {
  formatDocumentEvidencePrelude,
  formatGlobalEvidenceHeader,
  formatGlobalEvidenceHealth,
} from "../evidence-prelude";
import type { EvidenceHealthReport } from "@/services/evidence";

const baseCtx: DocumentEvidenceContext = {
  documentId: "doc_1",
  documentName: "Test.pdf",
  documentType: "OTHER",
  documentDate: null,
  asOf: null,
  forecast: null,
  actuals: [],
  manualParent: null,
  detectedAttachments: [],
  claims: [],
  staleWarnings: [],
};

describe("formatGlobalEvidenceHeader (Codex Phase 5 gate)", () => {
  it("rendu explicite 'Nous sommes le DD/MM/YYYY' (date FR)", () => {
    const today = new Date("2026-05-18T12:00:00Z");
    const out = formatGlobalEvidenceHeader(today);
    expect(out).toContain("## Référence temporelle");
    expect(out).toContain("Nous sommes le 18/05/2026.");
    expect(out).toMatch(/utilise cette date comme référence/i);
  });

  it("date 2024-09-18 → '18/09/2024' (format FR DD/MM/YYYY)", () => {
    const out = formatGlobalEvidenceHeader(new Date("2024-09-18T00:00:00Z"));
    expect(out).toContain("18/09/2024");
  });
});

describe("formatDocumentEvidencePrelude — cap table Avekapeti", () => {
  it("rendu asOf CAP_TABLE_AS_OF + warning stale", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "CAP_TABLE",
      asOf: {
        date: new Date("2024-09-18T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        signalScopeKey: "run:cabc12345678",
        evidenceText: "Table de capitalisation à jour au 18/09/2024",
        signalId: "sig_1",
        signalKind: "CAP_TABLE_AS_OF",
      },
      staleWarnings: [
        {
          kind: "cap_table_stale",
          severity: "medium",
          message: "Cap table is 19 months old (as of 2024-09-18). Request the latest cap table before relying on this.",
          ageDays: 580,
        },
      ],
    });
    expect(out).toContain("Cap table à jour au 18/09/2024");
    expect(out).toContain("confiance HIGH");
    expect(out).toContain("OCR extrait");
    expect(out).toContain(`citation: "Table de capitalisation à jour au 18/09/2024"`);
    expect(out).toContain("⚠️");
    expect(out).toContain("19 months old");
  });
});

describe("formatDocumentEvidencePrelude — bilan FurLove", () => {
  it("rendu BALANCE_SHEET_AS_OF + FINANCIAL_PERIOD_ACTUAL", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "FINANCIAL_STATEMENTS",
      asOf: {
        date: new Date("2025-12-31T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        signalScopeKey: "run:cabc12345678",
        evidenceText: "Exercice clos le 31/12/2025",
        signalId: "sig_2",
        signalKind: "BALANCE_SHEET_AS_OF",
      },
      actuals: [{
        start: new Date("2025-01-01T00:00:00Z"),
        end: new Date("2025-12-31T00:00:00Z"),
        yearsCovered: [2025],
        confidence: "HIGH",
        signalId: "sig_3",
      }],
    });
    expect(out).toContain("Bilan arrêté au 31/12/2025");
    expect(out).toContain("Période ACTUALS 2025");
    expect(out).toContain("du 01/01/2025 au 31/12/2025");
  });
});

describe("formatDocumentEvidencePrelude — BP forecast (Codex Phase 5 gate)", () => {
  it("rendu FINANCIAL_PERIOD_FORECAST avec mention 'PROJECTIONS, ne pas traiter comme réalisés'", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "FINANCIAL_MODEL",
      forecast: {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2030-12-31T00:00:00Z"),
        yearsCovered: [2026, 2027, 2028, 2029, 2030],
        confidence: "HIGH",
        signalId: "sig_4",
      },
    });
    expect(out).toContain("Période prévisionnelle 2026, 2027, 2028, 2029, 2030");
    expect(out).toContain("PROJECTIONS");
    expect(out).toMatch(/ne pas les traiter comme réalisés/i);
  });

  it("rendu warning forecast_now_historical (Phase 5 gate — require YTD)", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "FINANCIAL_MODEL",
      forecast: {
        start: new Date("2025-01-01T00:00:00Z"),
        end: new Date("2026-12-31T00:00:00Z"),
        yearsCovered: [2025, 2026],
        confidence: "HIGH",
        signalId: "sig_5",
      },
      staleWarnings: [{
        kind: "forecast_now_historical",
        severity: "medium",
        message: "Forecast period starting 2025-01-01 is now in progress / past (today: 2026-05-18). Require Year-to-Date actuals for 2025, 2026 — do NOT treat the forecast values as realised.",
      }],
    });
    expect(out).toContain("Période prévisionnelle 2025, 2026");
    expect(out).toContain("Year-to-Date actuals");
    expect(out).toContain("do NOT treat the forecast values as realised");
  });
});

describe("formatDocumentEvidencePrelude — attachment relation (Codex round 13 P1)", () => {
  it("rendu 'Transmis par email: Mail.pdf le 22/04/2026'", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "CAP_TABLE",
      detectedAttachments: [{
        emailDocId: "doc_email_1",
        emailDocName: "Mail.pdf",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
        matchMethod: "exact",
        signalId: "sig_att_1",
      }],
    });
    expect(out).toContain("Transmis par email");
    expect(out).toContain("Mail.pdf");
    expect(out).toContain("22/04/2026");
  });

  it("rendu pour normalized match: '(match approximatif)' annoté", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      detectedAttachments: [{
        emailDocId: "doc_email_1",
        emailDocName: "Mail.pdf",
        emailSourceDate: null,
        matchMethod: "normalized",
        signalId: "sig_att_2",
      }],
    });
    expect(out).toContain("(match approximatif)");
  });

  it("rendu fallback quand emailDocName est null", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      detectedAttachments: [{
        emailDocId: "doc_email_long_id_1234567890",
        emailDocName: null,
        emailSourceDate: null,
        matchMethod: "exact",
        signalId: "sig_att_3",
      }],
    });
    expect(out).toContain("email doc_emai…");
  });
});

describe("Phase 6 — formatDocumentEvidencePrelude — claims rendering", () => {
  it("METRIC_CLAIM CA 2025 = 3M€ → ligne avec classification claim explicite", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM",
        metric: "CA",
        amount: 3_000_000,
        currency: "EUR",
        classification: "claim",
        year: 2025,
        dateStart: new Date("2025-01-01"),
        dateEnd: new Date("2025-12-31"),
        evidenceText: "3M€ de CA 2025",
        confidence: "HIGH",
        signalId: "sig_claim_1",
      }],
    });
    expect(out).toContain("CA 2025");
    expect(out).toContain("3.00M€");
    expect(out).toContain("[CLAIM founder — déclaration non auditée, à vérifier]");
  });

  it("METRIC_CLAIM classification actual → étiquette '[ACTUAL — donnée historique réalisée]'", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM", metric: "CA", amount: 2_500_000, currency: "EUR",
        classification: "actual", year: 2025,
        dateStart: new Date("2025-01-01"), dateEnd: new Date("2025-12-31"),
        evidenceText: null, confidence: "HIGH", signalId: "sig",
      }],
    });
    expect(out).toContain("[ACTUAL — donnée historique réalisée]");
  });

  it("METRIC_CLAIM classification forecast → étiquette '[FORECAST — projection, ne pas traiter comme réalisé]'", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM", metric: "ARR", amount: 1_200_000, currency: "EUR",
        classification: "forecast", year: 2026,
        dateStart: new Date("2026-01-01"), dateEnd: new Date("2026-12-31"),
        evidenceText: null, confidence: "HIGH", signalId: "sig",
      }],
    });
    expect(out).toContain("[FORECAST — projection, ne pas traiter comme réalisé]");
  });

  it("VALUATION_CLAIM → label 'Valorisation' par défaut, montant formaté", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "VALUATION_CLAIM", metric: null, amount: 6_000_000, currency: "EUR",
        classification: "claim", year: null,
        dateStart: null, dateEnd: null,
        evidenceText: null, confidence: "MEDIUM", signalId: "sig_val",
      }],
    });
    expect(out).toContain("Valorisation");
    expect(out).toContain("6.00M€");
  });

  it("Codex round 19 P1 — GBP currency rendue avec '£', jamais defaultée à €", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM", metric: "ARR", amount: 1_500_000, currency: "GBP",
        classification: "claim", year: 2025,
        dateStart: null, dateEnd: null, evidenceText: null,
        confidence: "HIGH", signalId: "sig_gbp",
      }],
    });
    expect(out).toContain("£");
    expect(out).not.toContain("1.50M€"); // negative — must not silently render as EUR
  });

  it("Codex round 19 P1 — currency null rendue explicitement '(devise inconnue)' (jamais €)", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM", metric: "ARR", amount: 1_500_000, currency: null,
        classification: "claim", year: 2025,
        dateStart: null, dateEnd: null, evidenceText: null,
        confidence: "MEDIUM", signalId: "sig_unknown",
      }],
    });
    expect(out).toContain("devise inconnue");
    expect(out).not.toContain("1.50M€"); // negative — must not silently render as EUR
  });

  it("Codex round 19 P2 — claim avec evidenceText surface la citation pour grounding", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      claims: [{
        kind: "METRIC_CLAIM", metric: "CA", amount: 3_000_000, currency: "EUR",
        classification: "claim", year: 2025,
        dateStart: null, dateEnd: null,
        evidenceText: "Co-invest VC, marketplace impact 3M€ CA 2025, rentable",
        confidence: "HIGH", signalId: "sig_evidence",
      }],
    });
    expect(out).toContain(`citation: "Co-invest VC, marketplace impact 3M€ CA 2025, rentable"`);
  });
});

describe("formatDocumentEvidencePrelude — empty (no signals)", () => {
  it("retourne string vide quand aucune evidence", () => {
    const out = formatDocumentEvidencePrelude(baseCtx);
    expect(out).toBe("");
  });
});

describe("formatDocumentEvidencePrelude — disambiguation asOf vs documentDate", () => {
  it("affiche asOf seul quand asOf + documentDate présents (asOf est plus spécifique)", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "CAP_TABLE",
      asOf: {
        date: new Date("2024-09-18T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        signalScopeKey: "run:c1",
        evidenceText: null,
        signalId: "sig_asof",
        signalKind: "CAP_TABLE_AS_OF",
      },
      documentDate: {
        date: new Date("2024-09-01T00:00:00Z"),
        precision: "MONTH",
        confidence: "MEDIUM",
        signalScopeKey: "filename",
        evidenceText: null,
        signalId: "sig_doc",
        signalKind: "DOCUMENT_DATE",
      },
    });
    expect(out).toContain("Cap table à jour au 18/09/2024");
    expect(out).not.toContain("Document daté du 01/09/2024");
  });

  it("affiche documentDate seul quand asOf est absent", () => {
    const out = formatDocumentEvidencePrelude({
      ...baseCtx,
      documentType: "PITCH_DECK",
      documentDate: {
        date: new Date("2026-03-01T00:00:00Z"),
        precision: "MONTH",
        confidence: "HIGH",
        signalScopeKey: "run:c1",
        evidenceText: null,
        signalId: "sig_doc",
        signalKind: "DOCUMENT_DATE",
      },
    });
    expect(out).toContain("Document daté du 01/03/2026");
  });
});

// ============================================================
// Phase 7 — formatGlobalEvidenceHealth
// ============================================================
const EMPTY_REPORT: EvidenceHealthReport = {
  contradictions: [],
  missing: [],
  freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
};

describe("Phase 7 — formatGlobalEvidenceHealth", () => {
  it("report vide → string vide (pas de section bruit)", () => {
    expect(formatGlobalEvidenceHealth(EMPTY_REPORT)).toBe("");
  });

  it("contradictions HIGH/MEDIUM rendues avec badge sévérité et subject+year", () => {
    const out = formatGlobalEvidenceHealth({
      ...EMPTY_REPORT,
      contradictions: [
        {
          kind: "METRIC_MISMATCH",
          subject: "CA",
          year: 2025,
          severity: "HIGH",
          spreadRatio: 1.67,
          reason: "CA 2025 : 3.00M€ (Deck, claim) vs 1.80M€ (Bilan, actual). Écart relatif max ~67%.",
          signals: [],
        },
      ],
    });
    expect(out).toContain("## Évidence — état de santé du dossier");
    expect(out).toContain("### Contradictions détectées (1)");
    expect(out).toContain("[HIGH]");
    expect(out).toContain("CA 2025");
  });

  it("missing evidence rendues avec badge sévérité et message", () => {
    const out = formatGlobalEvidenceHealth({
      ...EMPTY_REPORT,
      missing: [
        {
          kind: "NO_CAP_TABLE_AS_OF",
          severity: "HIGH",
          message: "Cap table présente mais sans date d'arrêté détectée.",
          affectedDocumentIds: ["d1"],
        },
      ],
    });
    expect(out).toContain("### Évidences manquantes (1)");
    expect(out).toContain("[HIGH]");
    expect(out).toContain("Cap table présente mais sans date");
  });

  it("freshness rollup rendu uniquement si total > 0", () => {
    const noFresh = formatGlobalEvidenceHealth({
      ...EMPTY_REPORT,
      missing: [{ kind: "NO_FINANCIAL_STATEMENTS", severity: "MEDIUM", message: "x", affectedDocumentIds: [] }],
    });
    expect(noFresh).not.toContain("### Fraîcheur");

    const withFresh = formatGlobalEvidenceHealth({
      contradictions: [],
      missing: [],
      freshness: { countsByKind: { cap_table_stale: 2, balance_sheet_stale: 1, forecast_now_historical: 0 }, total: 3 },
    });
    expect(withFresh).toContain("### Fraîcheur (3 signaux dépassés)");
    expect(withFresh).toContain("Cap table périmée : 2 docs");
    expect(withFresh).toContain("Bilan périmé : 1 doc");
    expect(withFresh).not.toContain("Forecast déjà entamé");
  });

  it("tone analytique : aucun mot prescriptif dans le rendu", () => {
    const out = formatGlobalEvidenceHealth({
      contradictions: [
        {
          kind: "METRIC_MISMATCH",
          subject: "CA",
          year: 2025,
          severity: "HIGH",
          spreadRatio: 1.67,
          reason: "CA 2025 : écart 67%.",
          signals: [],
        },
      ],
      missing: [{ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH", message: "Cap table sans date.", affectedDocumentIds: [] }],
      freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 1 },
    });
    // Specific prescriptive verbs/labels — broad "pass" would hit "dépassé" (false positive).
    expect(out).not.toMatch(/(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i);
  });

  it("Valorisation : subject 'VALUATION' rendu 'Valorisation'", () => {
    const out = formatGlobalEvidenceHealth({
      ...EMPTY_REPORT,
      contradictions: [
        {
          kind: "VALUATION_MISMATCH",
          subject: "VALUATION",
          year: 2026,
          severity: "HIGH",
          spreadRatio: 1.6,
          reason: "Valorisation 2026 écart 60%.",
          signals: [],
        },
      ],
    });
    expect(out).toContain("Valorisation 2026");
  });
});
