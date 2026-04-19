import { describe, expect, it } from "vitest";

import type { ThesisExtractorOutput } from "@/agents/thesis/types";
import { normalizeThesisEvaluation } from "../normalization";

function makeOutput(overrides: Partial<ThesisExtractorOutput> = {}): ThesisExtractorOutput {
  return {
    reformulated: "Thèse test",
    problem: "Problème",
    solution: "Solution",
    whyNow: "Why now",
    moat: null,
    pathToExit: null,
    verdict: "favorable",
    confidence: 78,
    loadBearing: [],
    alerts: [],
    ycLens: {
      framework: "yc",
      verdict: "favorable",
      confidence: 80,
      question: "YC?",
      claims: [{ claim: "PMF plausible", derivedFrom: "deck", status: "supported" }],
      failures: [],
      strengths: ["Distribution crédible"],
      summary: "La thèse produit est crédible.",
    },
    thielLens: {
      framework: "thiel",
      verdict: "favorable",
      confidence: 78,
      question: "Thiel?",
      claims: [{ claim: "Angle différenciant", derivedFrom: "deck", status: "supported" }],
      failures: [],
      strengths: ["Différenciation réelle"],
      summary: "L'avantage compétitif paraît réel.",
    },
    angelDeskLens: {
      framework: "angel-desk",
      verdict: "contrasted",
      confidence: 76,
      question: "AD?",
      claims: [
        { claim: "[INVESTOR PROFILE FIT] Adapté à un family office plus qu'à un BA solo", derivedFrom: "ticket", status: "supported" },
        { claim: "[DEAL ACCESSIBILITY] Ticket minimum de 500k", derivedFrom: "terms", status: "supported" },
      ],
      failures: [
        "[INVESTOR PROFILE FIT] Hors mandat pour un BA solo",
        "[DEAL ACCESSIBILITY] Ticket minimum incompatible avec la plupart des BA",
      ],
      strengths: ["[THESIS QUALITY] Le besoin client est avéré"],
      summary: "Bonne société, mais fit investisseur et accessibilité limités.",
    },
    sourceDocumentIds: [],
    sourceHash: "hash",
    ...overrides,
  };
}

describe("normalizeThesisEvaluation", () => {
  it("produit toujours les 3 axes canoniques", () => {
    const evaluation = normalizeThesisEvaluation(makeOutput());

    expect(evaluation.thesisQuality.key).toBe("thesis_quality");
    expect(evaluation.investorProfileFit.key).toBe("investor_profile_fit");
    expect(evaluation.dealAccessibility.key).toBe("deal_accessibility");
  });

  it("ne degrade pas thesisQuality sur un simple mismatch investisseur", () => {
    const evaluation = normalizeThesisEvaluation(makeOutput());

    expect(evaluation.thesisQuality.verdict).toBe("favorable");
    expect(evaluation.investorProfileFit.failures).toContain("Hors mandat pour un BA solo");
    expect(evaluation.dealAccessibility.failures).toContain("Ticket minimum incompatible avec la plupart des BA");
  });

  it("degrade thesisQuality quand les signaux de qualité intrinsèque sont eux-mêmes fragiles", () => {
    const evaluation = normalizeThesisEvaluation(
      makeOutput({
        verdict: "vigilance",
        ycLens: {
          framework: "yc",
          verdict: "vigilance",
          confidence: 75,
          question: "YC?",
          claims: [{ claim: "[THESIS QUALITY] PMF non démontré", derivedFrom: "deck", status: "contradicted" }],
          failures: ["[THESIS QUALITY] Adoption insuffisamment prouvée"],
          strengths: [],
          summary: "Le PMF reste trop fragile.",
        },
      })
    );

    expect(evaluation.thesisQuality.verdict).toBe("vigilance");
    expect(evaluation.thesisQuality.failures).toContain("Adoption insuffisamment prouvée");
  });

  it("retombe sur des résumés sûrs si les tags explicites manquent", () => {
    const evaluation = normalizeThesisEvaluation(
      makeOutput({
        angelDeskLens: {
          framework: "angel-desk",
          verdict: "contrasted",
          confidence: 60,
          question: "AD?",
          claims: [{ claim: "Ticket minimum élevé pour ce tour", derivedFrom: "term sheet", status: "supported" }],
          failures: ["Ticket minimum élevé pour ce tour"],
          strengths: [],
          summary: "L'accès au deal est sélectif.",
        },
      })
    );

    expect(evaluation.dealAccessibility.claims[0]).toContain("Ticket minimum");
    expect(evaluation.investorProfileFit.summary.length).toBeGreaterThan(0);
  });
});
