import { describe, expect, it } from "vitest";

import { buildDealSummary, compressBoardContext, extractAgentSummary } from "../context-compressor";
import type { BoardInput } from "../types";

function makeBoardInput(): BoardInput {
  return {
    dealId: "deal_1",
    dealName: "Deal Test",
    companyName: "Acme",
    thesis: {
      id: "thesis_1",
      reformulated: "Acme transforme un workflow critique avec une distribution bottom-up.",
      problem: "Le workflow actuel est lent.",
      solution: "Un outil plus rapide.",
      whyNow: "Les budgets repartent.",
      moat: null,
      pathToExit: null,
      verdict: "vigilance",
      confidence: 62,
      loadBearing: [
        {
          id: "lb_1",
          statement: "Les equipes convertissent sans cycle enterprise lourd.",
          status: "speculative",
          impact: "Le go-to-market ralentit fortement.",
          validationPath: "Verifier les cohortes.",
        },
      ],
      alerts: [],
      ycLens: { verdict: "vigilance" },
      thielLens: { verdict: "vigilance" },
      angelDeskLens: { verdict: "contrasted" },
      evaluationAxes: {
        thesisQuality: { verdict: "vigilance", summary: "La these reste fragile." },
        investorProfileFit: { verdict: "contrasted", summary: "Le profil investisseur est mixte." },
        dealAccessibility: { verdict: "favorable", summary: "Le ticket reste accessible." },
      },
    },
    documents: [],
    enrichedData: null,
    agentOutputs: {
      tier3: {
        memoGenerator: {
          investmentThesis: "Memo prioritaire",
          keyRisks: ["Risque 1"],
        },
        devilsAdvocate: {
          criticalRedFlags: ["Risque existentiel"],
        },
        synthesisDealScorer: {
          overallScore: 81,
          verdict: "favorable",
        },
      },
      tier1: {
        marketIntelligence: {
          verdict: "contrasted",
          score: 48,
          findings: ["Le marche reste encombre"],
          redFlags: ["Pression concurrentielle"],
        },
      },
    },
    sources: [],
  };
}

describe("context-compressor", () => {
  it("puts memo and risk syntheses before score cues in compressed board context", () => {
    const context = compressBoardContext(makeBoardInput());

    expect(context.indexOf("### Memo d'Investissement")).toBeGreaterThan(-1);
    expect(context.indexOf("### Signal quantitatif secondaire")).toBeGreaterThan(-1);
    expect(context.indexOf("### Memo d'Investissement")).toBeLessThan(
      context.indexOf("### Signal quantitatif secondaire")
    );
  });

  it("surfaces fragile load-bearing assumptions in the short deal summary", () => {
    const summary = buildDealSummary(makeBoardInput());

    expect(summary).toContain("Hypothese porteuse fragile");
    expect(summary).toContain("convertissent sans cycle enterprise lourd");
  });

  it("keeps score as a secondary signal in tier-1 agent summaries", () => {
    const summary = extractAgentSummary({
      verdict: "contrasted",
      score: 48,
      findings: ["Le marche reste encombre"],
      redFlags: ["Pression concurrentielle"],
    });

    expect(summary).toContain("Le marche reste encombre");
    expect(summary).toContain("Red flags: Pression concurrentielle");
    expect(summary).toContain("Signal quantitatif secondaire: 48");
    expect(summary.indexOf("Le marche reste encombre")).toBeLessThan(
      summary.indexOf("Signal quantitatif secondaire: 48")
    );
  });
});
