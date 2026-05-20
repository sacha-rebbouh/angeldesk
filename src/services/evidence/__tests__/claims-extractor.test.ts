/**
 * Phase 6 — Unit tests for the deterministic claims extractor.
 *
 * Codex Phase 6 gates :
 *   1. CA 2025 must never be confused with forecast 2026 → period accuracy.
 *   2. EMAIL → classification "claim", NEVER "actual"/"forecast".
 *   3. FINANCIAL_MODEL → default "forecast" unless explicit "actuals" marker.
 */
import { describe, expect, it } from "vitest";
import { runClaimsExtractor, CLAIMS_EXTRACTOR_VERSION } from "../claims-extractor";

const baseInput = {
  documentName: "Test.pdf",
  documentType: "OTHER" as const,
  extractedText: null as string | null,
  sourceKind: "FILE" as const,
};

describe("runClaimsExtractor — VALUATION_CLAIM", () => {
  it("extrait 'valorisation 6M€' (deck/email founder)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Tour de table 2026. Notre valorisation est de 6M€ pre-money.",
    });
    const val = signals.find((s) => s.kind === "VALUATION_CLAIM");
    expect(val).toBeDefined();
    expect(val!.valueJson.amount).toBe(6_000_000);
    expect(val!.valueJson.currency).toBe("EUR");
    expect(val!.valueJson.classification).toBe("claim"); // PITCH_DECK → claim
  });

  it("extrait 'exit 2030 = 63M€' comme VALUATION_CLAIM avec period", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "FINANCIAL_MODEL",
      extractedText: "Projection: exit 2030 = 63M€",
    });
    const exit = signals.find(
      (s) => s.kind === "VALUATION_CLAIM" && s.valueJson.metric === "EXIT"
    );
    expect(exit).toBeDefined();
    expect(exit!.valueJson.amount).toBe(63_000_000);
    expect(exit!.valueJson.year).toBe(2030);
    expect(exit!.valueJson.classification).toBe("forecast"); // FINANCIAL_MODEL default
  });
});

describe("runClaimsExtractor — METRIC_CLAIM avec year", () => {
  it("Gate Codex 1 — 'CA 2025 = 3M€' → period 2025-01-01 → 2025-12-31, PAS forecast 2026", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Traction: CA 2025 = 3M€. Forecast 2026: 7M€.",
    });
    const ca2025 = signals.find(
      (s) => s.kind === "METRIC_CLAIM" && s.valueJson.metric === "CA" && s.valueJson.year === 2025
    );
    expect(ca2025).toBeDefined();
    expect(ca2025!.dateStart?.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(ca2025!.dateEnd?.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(ca2025!.valueJson.amount).toBe(3_000_000);
    // Et "Forecast 2026" doit être détecté séparément avec year=2026, pas confondu :
    const ca2026 = signals.find(
      (s) => s.kind === "METRIC_CLAIM" && s.valueJson.metric === "CA" && s.valueJson.year === 2026
    );
    // ("Forecast 2026: 7M€" matches CA 2026 via Pattern C? Le mot "Forecast" n'est pas dans
    // METRIC_LABEL_MAP — donc rien. Mais le test ci-dessus garantit que ca2025 reste correct.)
    expect(ca2026).toBeUndefined();
  });

  it("'3M€ de CA 2025' (Pattern B amount-de-metric-year)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Nous avons généré 3M€ de CA 2025.",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca).toBeDefined();
    expect(ca!.valueJson.amount).toBe(3_000_000);
    expect(ca!.valueJson.year).toBe(2025);
  });

  it("'3M€ CA 2025' (Pattern C amount-metric-year)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Co-invest VC, marketplace impact 3M€ CA 2025, rentable",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2025);
    expect(ca).toBeDefined();
    expect(ca!.valueJson.amount).toBe(3_000_000);
  });

  it("EXIT metric → kind VALUATION_CLAIM (pas METRIC_CLAIM)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Strategie de sortie: exit 2030 = 63M€.",
    });
    const exit = signals.find((s) => s.valueJson.metric === "EXIT");
    expect(exit?.kind).toBe("VALUATION_CLAIM");
  });
});

describe("Gate Codex 2 — EMAIL source = claim, jamais actual/forecast", () => {
  it("email avec '3M€ CA 2025' → classification = claim (founder declaration)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "Mail.pdf",
      documentType: "OTHER",
      sourceKind: "EMAIL",
      extractedText: "Co-invest VC, marketplace impact 3M€ CA 2025, rentable",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca?.valueJson.classification).toBe("claim");
  });

  it("Gate critique — email mentionnant 'réalisé' NE PEUT PAS upgrader en actual", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "Mail.pdf",
      documentType: "OTHER",
      sourceKind: "EMAIL",
      extractedText: "Nous avons réalisé 3M€ de CA 2025, et c'est audité par notre commissaire.",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca).toBeDefined();
    // EMAIL → claim, même avec "réalisé" / "audité" dans le contexte.
    expect(ca!.valueJson.classification).toBe("claim");
  });
});

describe("Gate Codex 3 — FINANCIAL_MODEL = forecast par défaut", () => {
  it("BP avec '3M€ CA 2026' → classification forecast", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "BP.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: "Compte de résultat prévisionnel: 3M€ CA 2026.",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca?.valueJson.classification).toBe("forecast");
  });

  it("BP avec 'feuille Actuals: réalisé 2.5M€ CA 2025' → upgrade vers actual via window 'réalisé'", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "BP.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: "Sheet Actuals 2025 — réalisé: 2.5M€ CA 2025 (audited).",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca?.valueJson.classification).toBe("actual");
  });

  it("Codex round 19 P1 — BP mixte 'Actuals 2025 / Forecast 2026' : chaque CA classé selon le marqueur LE PLUS PROCHE", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "BP-mixed.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: "Actuals 2025: CA 2025 = 1M€. Forecast 2026: CA 2026 = 3M€.",
    });
    const ca2025 = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2025);
    const ca2026 = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2026);
    expect(ca2025).toBeDefined();
    expect(ca2026).toBeDefined();
    expect(ca2025!.valueJson.classification).toBe("actual"); // closest marker is "Actuals 2025"
    expect(ca2026!.valueJson.classification).toBe("forecast"); // closest marker is "Forecast 2026"
  });

  it("Codex round 20 P1 — marker 'Actuals 2025' LOIN d'un claim 2026 NE contamine PAS : fallback baseClassification", () => {
    // Repro Codex round 20 : un seul "Actuals 2025" tout en haut du BP ne doit
    // pas faire basculer un "CA 2026" beaucoup plus bas en "actual".
    // Sans marker local, on retombe sur baseClassification du doc (forecast pour FINANCIAL_MODEL).
    const filler = "lorem ipsum ".repeat(200); // ~2400 chars sans aucun marker
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "BP-far.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: `Actuals 2025: CA 2025 = 1M€. ${filler} CA 2026 = 3M€.`,
    });
    const ca2025 = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2025);
    const ca2026 = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2026);
    expect(ca2025).toBeDefined();
    expect(ca2026).toBeDefined();
    // Le CA 2025 reste actual : "Actuals" est juste à côté.
    expect(ca2025!.valueJson.classification).toBe("actual");
    // Le CA 2026 est trop loin de tout marker → fallback baseClassification = forecast.
    expect(ca2026!.valueJson.classification).toBe("forecast");
  });

  it("Codex round 20 P1 — aucun marker dans tout le doc → baseClassification s'applique", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "BP-no-marker.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: "Tableau financier brut. CA 2026 = 3M€. EBITDA 2026 = 500k€.",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2026);
    expect(ca?.valueJson.classification).toBe("forecast"); // base FINANCIAL_MODEL
  });
});

describe("runClaimsExtractor — FINANCIAL_STATEMENTS = actual par défaut", () => {
  it("Bilan: '3M€ CA 2025' → classification actual", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentName: "Bilan.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: "Exercice clos 31/12/2025. 3M€ CA 2025.",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca?.valueJson.classification).toBe("actual");
  });
});

describe("runClaimsExtractor — currency + amount parsing", () => {
  it("parses k€ correctement: '405k€' → 405000 EUR", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "MRR 2026 = 405k€",
    });
    const mrr = signals.find((s) => s.valueJson.metric === "MRR");
    expect(mrr?.valueJson.amount).toBe(405_000);
    expect(mrr?.valueJson.currency).toBe("EUR");
  });

  it("parses $ correctement: '$1.5M' → 1500000 USD", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "ARR 2025 = $1.5M",
    });
    const arr = signals.find((s) => s.valueJson.metric === "ARR");
    expect(arr?.valueJson.amount).toBe(1_500_000);
    expect(arr?.valueJson.currency).toBe("USD");
  });

  it("decimal comma FR: '3,5M€' → 3500000", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "CA 2025 = 3,5M€",
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca?.valueJson.amount).toBe(3_500_000);
  });

  it("Codex round 19 P1 — GBP currency parsée correctement, JAMAIS default à EUR", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "ARR 2025 = £1.5M",
    });
    const arr = signals.find((s) => s.valueJson.metric === "ARR");
    expect(arr?.valueJson.amount).toBe(1_500_000);
    expect(arr?.valueJson.currency).toBe("GBP"); // NOT "EUR", NOT null
  });

  it("Codex round 19 P1 — amount sans symbole → currency=null (NEVER default to EUR)", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "ARR 2025 = 1.5M",
    });
    const arr = signals.find((s) => s.valueJson.metric === "ARR");
    expect(arr?.valueJson.amount).toBe(1_500_000);
    expect(arr?.valueJson.currency).toBeNull();
  });

  it("Codex round 19 P1 — GBP avec valuation 'valorisation £6M'", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Our valuation is £6M pre-money",
    });
    const val = signals.find((s) => s.kind === "VALUATION_CLAIM");
    expect(val?.valueJson.amount).toBe(6_000_000);
    expect(val?.valueJson.currency).toBe("GBP");
  });
});

describe("runClaimsExtractor — dédup", () => {
  it("le même claim mentionné 2 fois → 1 signal", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "Notre CA 2025 = 3M€. Voir aussi: CA 2025 = 3M€ confirmé.",
    });
    const cas = signals.filter((s) => s.valueJson.metric === "CA" && s.valueJson.year === 2025);
    expect(cas).toHaveLength(1);
  });

  it("2 claims sur le même metric mais années différentes → 2 signals", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "CA 2024 = 2M€. CA 2025 = 3M€.",
    });
    const cas = signals.filter((s) => s.valueJson.metric === "CA");
    expect(cas).toHaveLength(2);
    expect(cas.find((s) => s.valueJson.year === 2024)?.valueJson.amount).toBe(2_000_000);
    expect(cas.find((s) => s.valueJson.year === 2025)?.valueJson.amount).toBe(3_000_000);
  });
});

describe("runClaimsExtractor — empty / no claims", () => {
  it("text vide → []", () => {
    expect(runClaimsExtractor({ ...baseInput, extractedText: null })).toEqual([]);
    expect(runClaimsExtractor({ ...baseInput, extractedText: "" })).toEqual([]);
    expect(runClaimsExtractor({ ...baseInput, extractedText: "   " })).toEqual([]);
  });

  it("text sans montants/metrics → []", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      extractedText: "Bonjour, voici un email sans chiffre. Bien à vous.",
    });
    expect(signals).toEqual([]);
  });
});

describe("runClaimsExtractor — extractorVersion + metadata", () => {
  it("expose CLAIMS_EXTRACTOR_VERSION (utilisé dans signalHash)", () => {
    expect(CLAIMS_EXTRACTOR_VERSION).toMatch(/^claims-extractor@\d{4}-\d{2}-\d{2}/);
  });

  it("evidenceText court (≤280) + parserDebug patternId présent", () => {
    const signals = runClaimsExtractor({
      ...baseInput,
      documentType: "PITCH_DECK",
      extractedText: "x".repeat(500) + " CA 2025 = 3M€ " + "y".repeat(500),
    });
    const ca = signals.find((s) => s.valueJson.metric === "CA");
    expect(ca!.evidenceText!.length).toBeLessThanOrEqual(280);
    expect(ca!.metadata?.parserDebug?.patternId).toBeTruthy();
  });
});
