/**
 * Phase 2 — Tests for the deterministic temporal extractor.
 *
 * Samples are real OCR excerpts gathered during the Phase 0 audit
 * (docs-private/evidence-engine-audit.md) for Avekapeti, FurLove, E4N.
 */
import { describe, expect, it } from "vitest";
import { runTemporalExtractor } from "../temporal-extractor";

const baseInput = {
  documentName: "test.pdf",
  documentType: "OTHER" as const,
  mimeType: "application/pdf",
  extractedText: null as string | null,
  sourceKind: "FILE" as const,
  sourceMetadata: null,
  documentSourceDate: null as Date | null,
};

describe("runTemporalExtractor — CAP_TABLE_AS_OF (Avekapeti gate Codex a)", () => {
  const avekapetiCapTableText = `Assesseurs
Nombre d'actions
Pourcentage du capital
Madame Fatima BILKIBER MIRANI
166 511
33,03%
196 757
35,12%
100% Table de capitalisation à jour au 18/09/2024
  0% Table de capitalisation à jour au 18/09/2024`;

  it("extrait CAP_TABLE_AS_OF=2024-09-18 avec HIGH confidence sur cap table Avekapeti", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Table de capi Septembre 2024 signeģe.png",
      documentType: "CAP_TABLE",
      mimeType: "image/png",
      extractedText: avekapetiCapTableText,
    });
    const capTable = signals.find((s) => s.kind === "CAP_TABLE_AS_OF");
    expect(capTable).toBeDefined();
    expect(capTable!.confidence).toBe("HIGH");
    expect(capTable!.precision).toBe("DAY");
    expect(capTable!.asOfDate?.toISOString().slice(0, 10)).toBe("2024-09-18");
    expect(capTable!.evidenceText).toContain("à jour au 18/09/2024");
    expect(capTable!.derivedFrom).toBe("extracted_text");
    // parserDebug.regex discipline — patternId only, not the matched text.
    expect(capTable!.metadata?.parserDebug?.patternId).toBe("cap-table-as-of-fr");
    expect((capTable!.metadata?.parserDebug as Record<string, unknown>)?.regex).toBeUndefined();
  });

  it("ne déclenche PAS sur un doc OTHER sans mention 'Table de capitalisation'", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentType: "OTHER",
      extractedText: "Random text à jour au 01/01/2024 sans contexte cap table",
    });
    expect(signals.find((s) => s.kind === "CAP_TABLE_AS_OF")).toBeUndefined();
  });
});

describe("runTemporalExtractor — DOCUMENT_DATE deck footer (gate Codex E4N/NETGEM)", () => {
  it("extrait DOCUMENT_DATE=2026-03 depuis 'e4n Confidential – March 2026' (HIGH)", () => {
    const e4nDeck = `Page 1
e4n.
Engineered for what's next.
Bobby Demri
e4n Confidential – March 2026
Page 2
About e4n
2 e4n Confidential – March 2026
Page 3
The IT Managed Services Industry
3 e4n Confidential – March 2026`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "e4n - Confidential Presentation_BD.pdf",
      documentType: "PITCH_DECK",
      extractedText: e4nDeck,
    });
    const docDate = signals.find((s) => s.kind === "DOCUMENT_DATE" && s.confidence === "HIGH");
    expect(docDate).toBeDefined();
    expect(docDate!.asOfDate?.toISOString().slice(0, 7)).toBe("2026-03");
    expect(docDate!.precision).toBe("MONTH");
    expect(docDate!.derivedFrom).toBe("extracted_text");
    expect((docDate!.valueJson as { footerHits: number }).footerHits).toBeGreaterThanOrEqual(3);
  });

  it("extrait DOCUMENT_DATE=2026-04 depuis 'Confidentiel NETGEM - Avril 2026'", () => {
    const onepager = `ECLAIR "RE-VAL"
Transformer les catalogues cinématographique en vecteur de croissance
[...]
nus de confiance. Confidentiel NETGEM - Avril 2026`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "One-pager RE-VAL.pdf",
      documentType: "PITCH_DECK",
      extractedText: onepager,
    });
    const docDate = signals.find((s) => s.kind === "DOCUMENT_DATE");
    expect(docDate?.asOfDate?.toISOString().slice(0, 7)).toBe("2026-04");
  });
});

describe("runTemporalExtractor — FINANCIAL_PERIOD_FORECAST (gate Codex E4N / FurLove + r7 P1 financial context)", () => {
  it("extrait 2026-2030 depuis 'Revenue 2026 2027 2028 2029 2030' (FurLove)", () => {
    const furLoveForecast = `Revenue
Revenue 2026 2027 2028 2029 2030
B2B - vets, pharm, retail $198.098 $441.732 $793.289 $1.424.634 $1.960.867
B2C Ecommerce $459.558 $1.256.663 $2.955.340 $5.811.796 $...`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Fur-Love-2026-2030-Sept-2025-Capital-raise.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: furLoveForecast,
    });
    const forecast = signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST");
    expect(forecast).toBeDefined();
    expect(forecast!.dateStart?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(forecast!.dateEnd?.toISOString().slice(0, 10)).toBe("2030-12-31");
    expect((forecast!.valueJson as { yearsCovered: number[] }).yearsCovered).toEqual([
      2026, 2027, 2028, 2029, 2030,
    ]);
    expect(forecast!.confidence).toBe("HIGH");
  });

  it("Codex round 7 P1 — REJETTE 'Company roadmap / Milestones 2022 2023 2024 2025' sur un PITCH_DECK (pas de contexte financier)", () => {
    const roadmap = `Company roadmap
Milestones 2022 2023 2024 2025
Launch product, hire team, expand to EU, raise Series A`;
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Company-Roadmap.pdf",
      documentType: "PITCH_DECK",
      extractedText: roadmap,
    });
    expect(signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST")).toBeUndefined();
  });

  it("Codex round 7 P1 — ACCEPTE 'Revenue 2022 2023 2024 2025' sur PITCH_DECK (financial context via 'Revenue')", () => {
    const text = `Traction
Revenue 2022 2023 2024 2025
0.5M 1.2M 3M 7M`;
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Traction-Deck.pdf",
      documentType: "PITCH_DECK",
      extractedText: text,
    });
    const forecast = signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST");
    expect(forecast).toBeDefined();
    expect((forecast!.valueJson as { yearsCovered: number[] }).yearsCovered).toEqual([2022, 2023, 2024, 2025]);
  });

  it("Codex round 7 P1 — ACCEPTE bare years sur FINANCIAL_MODEL même sans keyword proche", () => {
    const text = `Worksheet
2022 2023 2024 2025
some numbers`;
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Model.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: text,
    });
    expect(signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST")).toBeDefined();
  });

  it("Codex round 7 P1 — ACCEPTE 'CA HT 2022 2023 2024 2025' sur PITCH_DECK (keyword FR)", () => {
    const text = `Trajectoire commerciale
CA HT 2022 2023 2024 2025
0.8M€ 1.5M€ 3M€ 6M€`;
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Trajectoire.pdf",
      documentType: "PITCH_DECK",
      extractedText: text,
    });
    expect(signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST")).toBeDefined();
  });

  it("extrait 2026-2030 depuis 'Dec-26 Dec-27 Dec-28 Dec-29 Dec-30' (E4N Model Output, OTHER doc) — Dec-YY est permissive", () => {
    const e4nModel = `Model Output – Base Case
Dec-26 Dec-27 Dec-28 Dec-29 Dec-30
$m, Dec FYE FY2026 FY2027 FY2028 FY2029 FY2030`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentType: "OTHER",
      extractedText: e4nModel,
    });
    const forecasts = signals.filter((s) => s.kind === "FINANCIAL_PERIOD_FORECAST");
    expect(forecasts.length).toBeGreaterThanOrEqual(1);
    // 2026-2030 is matched by both patterns (Dec-YY + FYYYYY) but dedup'd by year-key.
    const years = (forecasts[0].valueJson as { yearsCovered: number[] }).yearsCovered;
    expect(years).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("ne déclenche PAS sur BP Avekapeti 2025-2026 monthly (seulement 2 années consécutives)", () => {
    const avekapetiBP = `[COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2025: février 2025 | mars 2025 | avril 2025 | mai 2025 | juin 2025
[COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2026: février 2026 | mars 2026 | avril 2026 | mai 2026 | juin 2026`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "BP Avekapeti 2026 VF.xlsx",
      documentType: "FINANCIAL_MODEL",
      extractedText: avekapetiBP,
    });
    expect(signals.find((s) => s.kind === "FINANCIAL_PERIOD_FORECAST")).toBeUndefined();
  });
});

describe("runTemporalExtractor — FRENCH BILAN (FurLove bilan)", () => {
  const furLoveBilan = `FUR LOVE page 1
BILAN ACTIF
Période du 01/01/2025 au 31/12/2025 Présenté en Euros
Exercice clos le        Exercice précédent
ACTIF 31/12/2025 31/12/2024
(12 mois) (12 mois)`;

  it("extrait FINANCIAL_PERIOD_ACTUAL=2025-01-01→2025-12-31 depuis 'Période du'", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "bilan_et_resultat - fur love.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: furLoveBilan,
    });
    const period = signals.find((s) => s.kind === "FINANCIAL_PERIOD_ACTUAL");
    expect(period).toBeDefined();
    expect(period!.dateStart?.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(period!.dateEnd?.toISOString().slice(0, 10)).toBe("2025-12-31");
    expect((period!.valueJson as { yearsCovered: number[] }).yearsCovered).toEqual([2025]);
  });

  it("extrait BALANCE_SHEET_AS_OF=2025-12-31 depuis 'Exercice clos le ... 31/12/2025'", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "bilan_et_resultat - fur love.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: furLoveBilan,
    });
    const asOf = signals.find((s) => s.kind === "BALANCE_SHEET_AS_OF");
    expect(asOf).toBeDefined();
    expect(asOf!.asOfDate?.toISOString().slice(0, 10)).toBe("2025-12-31");
  });
});

describe("runTemporalExtractor — ENGLISH P&L (FurLove Fur Love Limited)", () => {
  it("extrait FINANCIAL_PERIOD_ACTUAL depuis 'For the 12 months ended 31 December 2025'", () => {
    const text = `Profit and Loss
Fur Love Limited
For the 12 months ended 31 December 2025
JAN-DEC 2025
Trading Income`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Fur_Love_Limited_-_Profit_and_Loss.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: text,
    });
    const period = signals.find((s) => s.kind === "FINANCIAL_PERIOD_ACTUAL");
    expect(period).toBeDefined();
    expect(period!.dateStart?.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(period!.dateEnd?.toISOString().slice(0, 10)).toBe("2025-12-31");
  });
});

describe("runTemporalExtractor — DOCUMENT_DATE from filename (anti-naïveté gate)", () => {
  it("extrait 'Sept-2025' du filename FurLove (FINANCIAL_STATEMENTS, single year)", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Fur-Love-2026-2030-Sept-2025-Capital-raise-for-ARR-_1M (5).pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: "",
    });
    const docDate = signals.find((s) => s.kind === "DOCUMENT_DATE");
    expect(docDate).toBeDefined();
    expect(docDate!.confidence).toBe("MEDIUM"); // filename is MEDIUM, not HIGH
    expect(docDate!.derivedFrom).toBe("filename");
    expect(docDate!.asOfDate?.toISOString().slice(0, 7)).toBe("2025-09");
  });

  it("NE déclenche PAS sur deck Avekapeti (12 années dans le texte → anti-naïveté)", () => {
    const avekapetiDeckText = `La market place de traiteur BtoB 3.0
2013 LE MARCHÉ DU CATERING
2019 croissance 2020 2021 2022 2023 2024 2025 2026 2027 2028 2029`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Deck_Septembre 2024 Avekapeti.pdf", // filename suggérerait 2024
      documentType: "PITCH_DECK",
      extractedText: avekapetiDeckText,
    });
    expect(signals.find((s) => s.kind === "DOCUMENT_DATE")).toBeUndefined();
  });

  it("NE déclenche PAS si filename a plusieurs années (ambiguïté)", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Fur-Love-Sept-2025-and-Oct-2026.pdf",
      documentType: "FINANCIAL_STATEMENTS",
      extractedText: "",
    });
    expect(signals.find((s) => s.kind === "DOCUMENT_DATE")).toBeUndefined();
  });

  it("gate Codex: filename ne shadow PAS une DOCUMENT_DATE HIGH du footer", () => {
    // Both filename "Mars 2026" AND footer "Confidential – March 2026" present.
    // Anti-naïveté: skip filename emission if a HIGH footer signal already exists.
    const text = `Some content
e4n Confidential – March 2026
More content`;
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Doc-Mars-2026.pdf",
      documentType: "PITCH_DECK",
      extractedText: text,
    });
    const docDates = signals.filter((s) => s.kind === "DOCUMENT_DATE");
    expect(docDates.length).toBe(1);
    expect(docDates[0].confidence).toBe("HIGH");
    expect(docDates[0].derivedFrom).toBe("extracted_text");
  });
});

describe("runTemporalExtractor — EMAIL_SENT_AT mirror (Avekapeti emails)", () => {
  it("mirror Document.sourceDate depuis sourceKind=EMAIL avec sourceMetadata.threadMessages", () => {
    const sent = new Date("2026-04-22T01:03:00Z");
    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Mail.pdf",
      documentType: "OTHER",
      sourceKind: "EMAIL",
      documentSourceDate: sent,
      sourceMetadata: {
        confidence: "high",
        threadMessageCount: 2,
        threadMessages: [
          { from: "Eryck Rebbouh <erebbouh@hotmail.com>", sentAt: "2026-04-22T01:03:00.000Z", subject: "Tr : Re : Avekapeti" },
          { from: "Fati Mrani <fati.mrani@avekapeti.co>", sentAt: "2026-04-06T16:10:00.000Z", subject: "Re : Avekapeti" },
        ],
      },
    });
    const emailSig = signals.find((s) => s.kind === "EMAIL_SENT_AT");
    expect(emailSig).toBeDefined();
    expect(emailSig!.reportedAt?.toISOString()).toBe(sent.toISOString());
    expect(emailSig!.confidence).toBe("HIGH");
    expect(emailSig!.derivedFrom).toBe("source_metadata");
    expect((emailSig!.valueJson as { threadMessageCount: number }).threadMessageCount).toBe(2);
  });

  it("NE mirror PAS un FILE même avec sourceDate set", () => {
    const signals = runTemporalExtractor({
      ...baseInput,
      sourceKind: "FILE",
      documentSourceDate: new Date("2026-04-22T01:03:00Z"),
    });
    expect(signals.find((s) => s.kind === "EMAIL_SENT_AT")).toBeUndefined();
  });
});

describe("runTemporalExtractor — Discipline parserDebug (Codex round 6)", () => {
  it("metadata.parserDebug ne contient JAMAIS le matched text, seulement patternId/matchCount", () => {
    const text = "Table de capitalisation à jour au 18/09/2024";
    const signals = runTemporalExtractor({
      ...baseInput,
      documentType: "CAP_TABLE",
      extractedText: text,
    });
    for (const sig of signals) {
      const debug = sig.metadata?.parserDebug as Record<string, unknown> | undefined;
      if (!debug) continue;
      // Forbidden fields:
      expect(debug.notes).toBeUndefined();
      // Allowed fields:
      const allowedKeys = new Set(["regex", "patternId", "matchCount", "pageSpan", "timingMs"]);
      for (const key of Object.keys(debug)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      // patternId is a slug, not free text:
      if (debug.patternId) {
        expect(debug.patternId).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    }
  });

  it("evidenceText contient un extrait court (≤ 280 chars)", () => {
    const longText = "x".repeat(500) + "Table de capitalisation à jour au 18/09/2024" + "y".repeat(500);
    const signals = runTemporalExtractor({
      ...baseInput,
      documentType: "CAP_TABLE",
      extractedText: longText,
    });
    const capTable = signals.find((s) => s.kind === "CAP_TABLE_AS_OF");
    expect(capTable!.evidenceText!.length).toBeLessThanOrEqual(280);
    expect(capTable!.evidenceText).toContain("18/09/2024");
  });
});

describe("runTemporalExtractor — bouquet realiste (Avekapeti emails)", () => {
  it("emails Avekapeti → uniquement EMAIL_SENT_AT (pas de fausse extraction)", () => {
    const mailText = `17/05/2026 15:01 Gmail - Tr : Tr : Re : Avekapeti
Sacha Rebbouh <sacha.rebbouh@gmail.com>
Tr : Tr : Re : Avekapeti
1 message
Eryck Rebbouh <erebbouh@hotmail.com> Wed, Apr 22, 2026
Envoyé : mercredi 22 avril 2026 01:03
us avons réalisé 405k€ de CA vs 270k en mars 2025`;

    const signals = runTemporalExtractor({
      ...baseInput,
      documentName: "Mail.pdf",
      documentType: "OTHER",
      sourceKind: "EMAIL",
      documentSourceDate: new Date("2026-04-22T01:03:00Z"),
      sourceMetadata: { threadMessages: [{}, {}] },
      extractedText: mailText,
    });

    const kinds = signals.map((s) => s.kind);
    expect(kinds).toContain("EMAIL_SENT_AT");
    // No false positives on bilan / forecast / cap table:
    expect(kinds).not.toContain("CAP_TABLE_AS_OF");
    expect(kinds).not.toContain("BALANCE_SHEET_AS_OF");
    expect(kinds).not.toContain("FINANCIAL_PERIOD_FORECAST");
    expect(kinds).not.toContain("FINANCIAL_PERIOD_ACTUAL");
  });
});
