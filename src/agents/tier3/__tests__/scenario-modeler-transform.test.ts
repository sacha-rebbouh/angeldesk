/**
 * Tests `normalizeResponse` — invariants runtime Phase A slice A4 (D1 + D2)
 *
 * Vérifie le comportement de l'adapter Scenario Modeler qui :
 * - Émet `dominantScenario` natif (renommage de l'ancien `mostLikelyScenario`).
 * - Émet `signalContribution: Tier3SignalContribution` dérivé DÉTERMINISTE
 *   depuis les probabilités scenarios. Le LLM ne peut PAS piloter
 *   l'orientation (anti-régression round 2 A3 sur `riskPosture`).
 * - Maintient `signalContribution.evidenceSolidity: null` en A4 (D2 verrouillé).
 * - Parser tolérant : `data.mostLikelyScenario` legacy lu en lecture seule
 *   si le LLM dégradé ne produit pas `data.dominantScenario`.
 *
 * `normalizeResponse` est `private`. Cast pour invocation.
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { scenarioModeler } from "../scenario-modeler";
import type { ScenarioModelerData, EnrichedAgentContext } from "../../types";

type NormalizeResponseFn = (data: unknown, context: EnrichedAgentContext) => ScenarioModelerData;
const normalizeResponse = (scenarioModeler as unknown as { normalizeResponse: NormalizeResponseFn })
  .normalizeResponse.bind(scenarioModeler);

function makeMockContext(): EnrichedAgentContext {
  return {
    canonicalDeal: { name: "TestCo", arr: 100000, valuationPre: 5_000_000, amountRequested: 1_000_000, stage: "Seed" },
    previousResults: {},
    baPreferences: {},
  } as unknown as EnrichedAgentContext;
}

function makeScenario(name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC", probability: number): unknown {
  return {
    name,
    description: `${name} scenario`,
    probability: { value: probability, rationale: "test", source: "test" },
    assumptions: [],
    metrics: [],
    exitOutcome: {
      type: "acquisition_strategic",
      typeRationale: "test",
      timing: "5y",
      timingSource: "test",
      exitValuation: 10_000_000,
      exitValuationCalculation: "test",
      exitMultiple: 5,
      exitMultipleSource: "test",
    },
    investorReturn: {
      initialInvestment: 100_000,
      initialInvestmentSource: "test",
      ownershipAtEntry: 1,
      ownershipCalculation: "test",
      dilutionToExit: 0.3,
      dilutionSource: "test",
      ownershipAtExit: 0.7,
      ownershipAtExitCalculation: "test",
      grossProceeds: 70_000,
      proceedsCalculation: "test",
      multiple: 0.7,
      multipleCalculation: "test",
      irr: -5,
      irrCalculation: "test",
      holdingPeriodYears: 5,
    },
    keyRisks: [],
    keyDrivers: [],
  };
}

function makeLLMResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    meta: { dataCompleteness: "complete", confidenceLevel: 70, limitations: [] },
    score: { value: 60, grade: "C", breakdown: [] },
    scenarios: [
      makeScenario("BASE", 50),
      makeScenario("BULL", 20),
      makeScenario("BEAR", 20),
      makeScenario("CATASTROPHIC", 10),
    ],
    sensitivityAnalysis: [],
    basedOnComparables: [],
    breakEvenAnalysis: { monthsToBreakeven: 24, breakEvenCalculation: "test", requiredGrowthRate: 50, growthRateSource: "test", burnUntilBreakeven: 500_000, burnCalculation: "test", achievability: "CHALLENGING", achievabilityRationale: "test" },
    probabilityWeightedOutcome: { expectedMultiple: 3, expectedMultipleCalculation: "test", expectedIRR: 15, expectedIRRCalculation: "test", riskAdjustedAssessment: "test" },
    dominantScenario: "BASE",
    dominantScenarioRationale: "test rationale",
    redFlags: [],
    questions: [],
    alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "x" },
    narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    dbCrossReference: { claims: [], uncheckedClaims: [] },
    ...overrides,
  };
}

describe("normalizeResponse Scenario — invariants A4 (D1 + D2)", () => {
  describe("Phase A A4 — dominantScenario natif (D1)", () => {
    it("dominantScenario lu depuis le LLM en priorité", () => {
      const data = makeLLMResponse({ dominantScenario: "BULL" });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.dominantScenario).toBe("BULL");
      expect(result.findings.dominantScenarioRationale).toBe("test rationale");
    });

    it("Parser tolérant : mostLikelyScenario legacy lu si dominantScenario absent", () => {
      // Retire aussi dominantScenarioRationale du fixture pour tester la
      // priorité 2 sur le rationale (sinon le fallback rationale ne s'active pas).
      const data = makeLLMResponse({
        dominantScenario: undefined,
        dominantScenarioRationale: undefined,
        mostLikelyScenario: "BEAR",
        mostLikelyRationale: "legacy rationale",
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.dominantScenario).toBe("BEAR");
      expect(result.findings.dominantScenarioRationale).toBe("legacy rationale");
    });

    it("Fallback BASE si aucune source", () => {
      const data = makeLLMResponse({ dominantScenario: undefined, mostLikelyScenario: undefined });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.dominantScenario).toBe("BASE");
    });
  });

  describe("Round 2 A3 anti-régression : signalContribution déterministe runtime-derived", () => {
    it("3 CRITICAL (P_cat >= 25) → orientation: alert_dominant (LLM ignoré)", () => {
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 20),
          makeScenario("BULL", 10),
          makeScenario("BEAR", 30),
          makeScenario("CATASTROPHIC", 40), // pCat >= 25
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
    });

    it("P_neg >= 50 (BEAR+CATASTROPHIC) → orientation: vigilance", () => {
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 30),
          makeScenario("BULL", 10),
          makeScenario("BEAR", 40),
          makeScenario("CATASTROPHIC", 20), // pCat < 25, pNeg = 60 >= 50
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("vigilance");
    });

    it("P_pos >= 65 && BULL > BASE → orientation: favorable", () => {
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 25),
          makeScenario("BULL", 45), // BULL > BASE, pPos = 70 >= 65
          makeScenario("BEAR", 20),
          makeScenario("CATASTROPHIC", 10),
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("favorable");
    });

    it("P_pos >= 50 mais BULL <= BASE → orientation: contrasted (pas favorable)", () => {
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 50), // BASE > BULL
          makeScenario("BULL", 20),
          makeScenario("BEAR", 20),
          makeScenario("CATASTROPHIC", 10),
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("contrasted");
    });

    it("Anti-régression Codex round 2 : LLM essaie de fournir signalContribution → IGNORÉ par le runtime", () => {
      // Le LLM tente d'injecter `signalContribution: { orientation: "very_favorable" }`.
      // Le runtime DÉRIVE depuis les probabilités scenarios uniquement et IGNORE
      // toute valeur LLM sur ce champ — anti-régression round 2 A3.
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 30),
          makeScenario("BULL", 10),
          makeScenario("BEAR", 30),
          makeScenario("CATASTROPHIC", 30), // pCat = 30 >= 25 → alert_dominant attendu
        ],
        signalContribution: { orientation: "very_favorable", evidenceSolidity: null }, // LLM tentative
      });
      const result = normalizeResponse(data, makeMockContext());
      // Le runtime IGNORE la valeur LLM et dérive depuis les probabilités.
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
      expect(result.findings.signalContribution.orientation).not.toBe("very_favorable");
    });

    it("Scenario n'émet jamais `very_favorable` (biais contradicteur structurel)", () => {
      // Même avec 100% BULL probability, le runtime émet `favorable` au max,
      // pas `very_favorable` (cohérence avec biais DA).
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 0),
          makeScenario("BULL", 100), // BULL > BASE, pPos = 100 >= 65
          makeScenario("BEAR", 0),
          makeScenario("CATASTROPHIC", 0),
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("favorable");
      expect(result.findings.signalContribution.orientation).not.toBe("very_favorable");
    });
  });

  describe("D2 verrouillé : evidenceSolidity reste null en A4", () => {
    it("signalContribution.evidenceSolidity = null avec probabilities BULL fortes (pas de mapping depuis score)", () => {
      const data = makeLLMResponse({
        scenarios: [
          makeScenario("BASE", 30),
          makeScenario("BULL", 60),
          makeScenario("BEAR", 5),
          makeScenario("CATASTROPHIC", 5),
        ],
      });
      const result = normalizeResponse(data, makeMockContext());
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("D1 verrouillé : output sérialisé ne contient pas `mostLikelyScenario` natif", () => {
    it("Output JSON.stringify ne contient PAS `mostLikelyScenario` (renommé en dominantScenario)", () => {
      const data = makeLLMResponse({
        mostLikelyScenario: "BEAR",
        dominantScenario: undefined,
      });
      const result = normalizeResponse(data, makeMockContext());
      const serialized = JSON.stringify(result);
      // Le runtime utilise le parser tolérant pour LIRE mostLikelyScenario mais
      // ne le ré-émet PAS sous l'ancien nom dans le contrat natif.
      expect(serialized).not.toContain("mostLikelyScenario");
      expect(serialized).toContain("dominantScenario");
    });
  });
});
