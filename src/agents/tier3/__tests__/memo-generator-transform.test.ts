/**
 * Tests `normalizeResponse` — invariants runtime Phase A slice A4 (D1 + D2)
 *
 * Vérifie le comportement de l'adapter Memo Generator qui :
 * - Émet `signalProfile: Tier3SignalContribution` avec orientation cohérente
 *   avec `executiveSummary.recommendation` (source de vérité doctrinale).
 * - Émet `criticalRisks: CriticalRiskRef[]` natif (D1 — pas d'alias `killReasons`).
 * - Conserve `keyRisks` historique (sémantique mitigation propre, pas un alias).
 * - Maintient `signalProfile.evidenceSolidity: null` en A4 (D2 verrouillé).
 *
 * `normalizeResponse` est `private`. Pour le tester, on cast l'agent en
 * `Record<string, unknown>` et on appelle la méthode via cast explicite.
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { memoGenerator } from "../memo-generator";
import type { MemoGeneratorData, EnrichedAgentContext } from "../../types";

type NormalizeResponseFn = (
  data: unknown,
  deal: EnrichedAgentContext["deal"],
  consolidatedRedFlags: unknown[],
  consolidatedQuestions: unknown[],
) => MemoGeneratorData;
const normalizeResponse = (memoGenerator as unknown as { normalizeResponse: NormalizeResponseFn })
  .normalizeResponse.bind(memoGenerator);

const stubDeal = {
  name: "TestCo",
  description: "Test description",
  valuationPre: 5_000_000,
  amountRequested: 1_000_000,
} as unknown as EnrichedAgentContext["deal"];

function makeLLMResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    meta: { dataCompleteness: "complete", confidenceLevel: 75, limitations: [] },
    score: { value: 65, grade: "C", breakdown: [] },
    executiveSummary: {
      oneLiner: "Test deal",
      recommendation: "contrasted",
      verdict: "Test verdict",
      keyStrengths: ["s1", "s2"],
      keyRisks: ["r1"],
    },
    companyOverview: { description: "x", problem: "p", solution: "s", businessModel: "b", traction: "t", stage: "Seed" },
    investmentHighlights: [],
    keyRisks: [],
    financialSummary: { currentMetrics: {}, projections: { realistic: true, concerns: [] }, valuationAssessment: { proposed: "5M", percentile: "P50", verdict: "FAIR", benchmarkComparables: [] } },
    teamAssessment: { overallScore: 70, founders: [], gaps: [], verdict: "x" },
    marketOpportunity: { tam: "x", sam: "x", som: "x", timing: "GOOD", trend: "x", verdict: "x" },
    competitiveLandscape: { competitors: [], differentiation: "x", moatStrength: 50, verdict: "x" },
    termsAnalysis: [],
    dealStructure: { valuation: "x", roundSize: "x", keyTerms: [], negotiationPoints: [] },
    investmentThesis: { bull: [], bear: [], keyAssumptions: [], thesis: "x" },
    nextSteps: [],
    questionsForFounder: [],
    narrative: { summary: "x", keyInsights: [], forNegotiation: [] },
    alertSignal: { hasBlocker: false, recommendation: "contrasted", justification: "x" },
    ...overrides,
  };
}

describe("normalizeResponse Memo — invariants A4 (D1 + D2)", () => {
  describe("Phase A A4 — signalProfile natif", () => {
    it("emis avec orientation = executiveSummary.recommendation (source de vérité)", () => {
      const data = makeLLMResponse({
        executiveSummary: {
          oneLiner: "x", recommendation: "favorable", verdict: "x",
          keyStrengths: [], keyRisks: [],
        },
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.signalProfile.orientation).toBe("favorable");
    });

    it("orientation = vigilance quand LLM produit vigilance", () => {
      const data = makeLLMResponse({
        executiveSummary: {
          oneLiner: "x", recommendation: "vigilance", verdict: "x",
          keyStrengths: [], keyRisks: [],
        },
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.signalProfile.orientation).toBe("vigilance");
    });

    it("LLM recommendation invalide → fallback contrasted", () => {
      const data = makeLLMResponse({
        executiveSummary: {
          oneLiner: "x", recommendation: "INVALID", verdict: "x",
          keyStrengths: [], keyRisks: [],
        },
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.signalProfile.orientation).toBe("contrasted");
      expect(result.executiveSummary.recommendation).toBe("contrasted");
    });
  });

  describe("D2 verrouillé : evidenceSolidity reste null en A4", () => {
    it("signalProfile.evidenceSolidity = null même avec score high + LLM rationale", () => {
      const data = makeLLMResponse({
        score: { value: 95, grade: "A", breakdown: [] },
        signalProfile: { orientation: "very_favorable", rationale: "rationale text" },
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.signalProfile.evidenceSolidity).toBeNull();
    });

    it("evidenceSolidity reste null avec 0 risque (jamais fabriqué)", () => {
      const data = makeLLMResponse({});
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.signalProfile.evidenceSolidity).toBeNull();
    });
  });

  describe("Phase A A4 — criticalRisks natif (D1)", () => {
    it("LLM fournit criticalRisks[] natif → emis tel quel avec severity contrainte CRITICAL/HIGH/MEDIUM", () => {
      const data = makeLLMResponse({
        criticalRisks: [
          { riskId: "cr-1", severity: "CRITICAL", description: "Risk 1", evidence: "e1", source: "agent1" },
          { riskId: "cr-2", severity: "HIGH", description: "Risk 2" },
        ],
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.criticalRisks).toHaveLength(2);
      expect(result.criticalRisks[0].severity).toBe("CRITICAL");
      expect(result.criticalRisks[0].description).toBe("Risk 1");
      expect(result.criticalRisks[1].severity).toBe("HIGH");
    });

    it("LLM fournit severity invalide → MEDIUM par défaut conservateur", () => {
      const data = makeLLMResponse({
        criticalRisks: [
          { riskId: "cr-1", severity: "INVALID_SEV", description: "x" },
        ],
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.criticalRisks[0].severity).toBe("MEDIUM");
    });

    it("LLM ne fournit pas criticalRisks → fallback dérivation depuis consolidatedRedFlags critical/high", () => {
      const data = makeLLMResponse({});
      const consolidatedRedFlags = [
        { id: "rf-1", category: "team", severity: "CRITICAL" as const, title: "RF1", source: "agent1", evidence: "e1", impact: "i1" },
        { id: "rf-2", category: "market", severity: "HIGH" as const, title: "RF2", source: "agent2", evidence: "e2", impact: "i2" },
        { id: "rf-3", category: "other", severity: "MEDIUM" as const, title: "RF3", source: "agent3", evidence: "e3", impact: "i3" },
      ];
      const result = normalizeResponse(data, stubDeal, consolidatedRedFlags, []);
      expect(result.criticalRisks).toHaveLength(2); // CRITICAL + HIGH only
      expect(result.criticalRisks[0].severity).toBe("CRITICAL");
      expect(result.criticalRisks[1].severity).toBe("HIGH");
    });

    it("criticalRisks filtre les entrées sans description", () => {
      const data = makeLLMResponse({
        criticalRisks: [
          { riskId: "cr-1", severity: "CRITICAL", description: "Valid" },
          { riskId: "cr-2", severity: "HIGH", description: "" }, // empty
          { riskId: "cr-3", severity: "MEDIUM" }, // missing
        ],
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result.criticalRisks).toHaveLength(1);
      expect(result.criticalRisks[0].description).toBe("Valid");
    });
  });

  describe("D1 verrouillé : output sérialisé ne contient pas d'alias legacy `killReasons`", () => {
    it("Output JSON.stringify ne contient PAS `killReasons` natif", () => {
      const data = makeLLMResponse({
        criticalRisks: [
          { riskId: "cr-1", severity: "CRITICAL", description: "Test" },
        ],
      });
      const result = normalizeResponse(data, stubDeal, [], []);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("killReasons");
      expect(serialized).not.toContain("dealBreakerLevel");
    });

    it("Output expose `signalProfile` + `criticalRisks` + `keyRisks` (3 champs distincts conservés)", () => {
      const data = makeLLMResponse({});
      const result = normalizeResponse(data, stubDeal, [], []);
      expect(result).toHaveProperty("signalProfile");
      expect(result).toHaveProperty("criticalRisks");
      expect(result).toHaveProperty("keyRisks"); // sémantique mitigation conservée
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 5 (Option B) — filet déterministe `buildDeterministicFallback`
// ---------------------------------------------------------------------------
type FallbackFn = (
  deal: unknown,
  consolidatedRedFlags: unknown[],
  consolidatedQuestions: unknown[],
  context: unknown,
) => MemoGeneratorData;
const buildDeterministicFallback = (
  memoGenerator as unknown as { buildDeterministicFallback: FallbackFn }
).buildDeterministicFallback.bind(memoGenerator);

const fallbackRedFlags = [
  { id: "rf-1", category: "team", severity: "CRITICAL", title: "Fondateur non vérifié", source: "team-investigator", evidence: "e1", impact: "i1" },
  { id: "rf-2", category: "financials", severity: "HIGH", title: "Valorisation agressive", source: "financial-auditor", evidence: "e2", impact: "i2" },
  { id: "rf-3", category: "market", severity: "MEDIUM", title: "TAM à confirmer", source: "market-intelligence", evidence: "e3", impact: "i3" },
];
const fallbackQuestions = [
  { priority: "CRITICAL", category: "team", question: "Pouvez-vous fournir le CV vérifiable du fondateur ?", context: "x", source: "team-investigator" },
];

describe("buildDeterministicFallback Memo — filet Option B (Phase 5)", () => {
  it("reconstruit un MemoGeneratorData COMPLET et exploitable depuis les données consolidées", () => {
    const result = buildDeterministicFallback(stubDeal, fallbackRedFlags, fallbackQuestions, { previousResults: {} });
    // contrat natif présent et cohérent
    expect(result.signalProfile.orientation).toBe(result.executiveSummary.recommendation);
    expect(result.signalProfile.evidenceSolidity).toBeNull();
    expect(Array.isArray(result.criticalRisks)).toBe(true);
    expect(result.criticalRisks.length).toBe(2); // CRITICAL + HIGH (pas le MEDIUM)
    // keyRisks enrichis (severity/category/source conservés)
    expect(result.keyRisks.length).toBe(3);
    expect(result.keyRisks[0].severity).toBe("CRITICAL");
    expect(result.keyRisks[0].source).toBe("team-investigator");
    expect(result.keyRisks[0].category).toBe("team");
    // pas de positif fabriqué sans synthèse LLM
    expect(result.investmentHighlights).toEqual([]);
    // nextSteps dérivés des questions consolidées
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.nextSteps[0]).toContain("CV vérifiable");
    // dueDiligence : question CRITICAL en outstanding
    expect(result.dueDiligenceFindings.outstanding.length).toBeGreaterThan(0);
  });

  it("orientation CONSERVATRICE en l'absence de scorer : ≥1 CRITICAL → vigilance/alert (jamais favorable)", () => {
    const oneCritical = [fallbackRedFlags[0]];
    const result = buildDeterministicFallback(stubDeal, oneCritical, [], { previousResults: {} });
    expect(["vigilance", "alert_dominant"]).toContain(result.executiveSummary.recommendation);
    const twoCritical = [fallbackRedFlags[0], { ...fallbackRedFlags[0], id: "rf-x" }];
    const alert = buildDeterministicFallback(stubDeal, twoCritical, [], { previousResults: {} });
    expect(alert.executiveSummary.recommendation).toBe("alert_dominant");
  });

  it("orientation = verdict CANONIQUE du synthesis-deal-scorer quand disponible (cohérence ScoreBadge)", () => {
    const context = { previousResults: { "synthesis-deal-scorer": { success: true, data: { verdict: "favorable" } } } };
    const result = buildDeterministicFallback(stubDeal, [], [], context);
    expect(result.executiveSummary.recommendation).toBe("favorable");
    expect(result.signalProfile.orientation).toBe("favorable");
  });

  it("verdict scorer INVALIDE → retombe sur la dérivation conservatrice", () => {
    const context = { previousResults: { "synthesis-deal-scorer": { success: true, data: { verdict: "GARBAGE" } } } };
    const result = buildDeterministicFallback(stubDeal, [], [], context);
    expect(result.executiveSummary.recommendation).toBe("contrasted"); // 0 red flag → neutre
  });
});
