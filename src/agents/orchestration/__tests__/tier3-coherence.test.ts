import { describe, it, expect } from "vitest";
import {
  applyTier3Coherence,
  injectCoherenceIntoContext,
  type CoherenceResult,
} from "../tier3-coherence";
import type { AgentResult, ScenarioV2 } from "../../types";

// ============================================================================
// HELPERS
// ============================================================================

function makeScenario(
  name: ScenarioV2["name"],
  probability: number,
  multiple: number
): ScenarioV2 {
  return {
    name,
    description: `${name} scenario`,
    probability: { value: probability, rationale: "test", source: "test" },
    assumptions: [],
    metrics: [],
    exitOutcome: {
      type: "acquisition_strategic",
      typeRationale: "test",
      timing: "5 ans",
      timingSource: "test",
      exitValuation: 10_000_000,
      exitValuationCalculation: "test",
      exitMultiple: multiple,
      exitMultipleSource: "test",
    },
    investorReturn: {
      initialInvestment: 100_000,
      initialInvestmentSource: "test",
      ownershipAtEntry: 5,
      ownershipCalculation: "test",
      dilutionToExit: 50,
      dilutionSource: "test",
      ownershipAtExit: 2.5,
      ownershipAtExitCalculation: "test",
      grossProceeds: multiple * 100_000,
      proceedsCalculation: "test",
      multiple,
      multipleCalculation: `${multiple}x`,
      irr: 30,
      irrCalculation: "test",
      holdingPeriodYears: 5,
    },
    keyRisks: [],
    keyDrivers: [],
  };
}

function makeScenarioModelerResult(scenarios: ScenarioV2[]): AgentResult {
  return {
    agentName: "scenario-modeler",
    success: true,
    executionTimeMs: 1000,
    cost: 0.01,
    data: {
      meta: { agentName: "scenario-modeler", analysisDate: new Date().toISOString(), dataCompleteness: "complete", confidenceLevel: 80, limitations: [] },
      score: { value: 60, grade: "C", breakdown: [] },
      findings: {
        scenarios,
        sensitivityAnalysis: [],
        basedOnComparables: [],
        breakEvenAnalysis: { monthsToBreakeven: 24, breakEvenCalculation: "test", requiredGrowthRate: 50, growthRateSource: "test", burnUntilBreakeven: 500000, burnCalculation: "test", achievability: "CHALLENGING", achievabilityRationale: "test" },
        probabilityWeightedOutcome: { expectedMultiple: 5, expectedMultipleCalculation: "test", expectedIRR: 30, expectedIRRCalculation: "test", riskAdjustedAssessment: "test" },
        mostLikelyScenario: "BASE" as const,
        mostLikelyRationale: "test",
      },
      dbCrossReference: { claims: [], uncheckedClaims: [] },
      redFlags: [],
      questions: [],
      alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "test" },
      narrative: { oneLiner: "test", summary: "test", keyInsights: [], forNegotiation: [] },
    },
  } as unknown as AgentResult;
}

function makeDevilsAdvocateResult(scepticism: number): AgentResult {
  return {
    agentName: "devils-advocate",
    success: true,
    executionTimeMs: 1000,
    cost: 0.01,
    data: {
      meta: { agentName: "devils-advocate", analysisDate: new Date().toISOString(), dataCompleteness: "complete", confidenceLevel: 80, limitations: [] },
      score: { value: scepticism, grade: "C", breakdown: [] },
      findings: {
        counterArguments: [],
        worstCaseScenario: {},
        killReasons: [],
        blindSpots: [],
        alternativeNarratives: [],
        skepticismAssessment: {
          score: scepticism,
          scoreBreakdown: [],
          verdict: scepticism > 70 ? "VERY_SKEPTICAL" : "CAUTIOUS",
          verdictRationale: "test",
        },
        concernsSummary: { absolute: [], conditional: [], serious: [], minor: [] },
        positiveClaimsChallenged: [],
      },
      dbCrossReference: { claims: [], uncheckedClaims: [] },
      redFlags: [],
      questions: [],
      alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "test" },
      narrative: { oneLiner: "test", summary: "test", keyInsights: [], forNegotiation: [] },
    },
  } as unknown as AgentResult;
}

function makeT1Result(agentName: string, score: number): AgentResult {
  return {
    agentName,
    success: true,
    executionTimeMs: 500,
    cost: 0.005,
    data: {
      score: { value: score, grade: "C", breakdown: [] },
      findings: {},
      redFlags: [],
    },
  } as unknown as AgentResult;
}

function makeContradictionDetectorResult(criticalCount: number): AgentResult {
  const redFlags = Array.from({ length: criticalCount }, (_, i) => ({
    severity: "CRITICAL",
    title: `Critical red flag ${i + 1}`,
    description: "test",
  }));

  return {
    agentName: "contradiction-detector",
    success: true,
    executionTimeMs: 500,
    cost: 0.005,
    data: {
      redFlags,
      contradictions: [],
      consistencyScore: 50,
    },
  } as unknown as AgentResult;
}

function buildResults(options: {
  scepticism?: number;
  scenarios?: ScenarioV2[];
  t1Score?: number;
  criticalRedFlags?: number;
}): Record<string, AgentResult> {
  const results: Record<string, AgentResult> = {};

  const scenarios = options.scenarios ?? [
    makeScenario("CATASTROPHIC", 10, 0),
    makeScenario("BEAR", 20, 0.5),
    makeScenario("BASE", 40, 4.5),
    makeScenario("BULL", 30, 15.8),
  ];

  results["scenario-modeler"] = makeScenarioModelerResult(scenarios);

  if (options.scepticism !== undefined) {
    results["devils-advocate"] = makeDevilsAdvocateResult(options.scepticism);
  }

  if (options.t1Score !== undefined) {
    const t1Agents = [
      "financial-auditor", "deck-forensics", "team-investigator",
      "market-intelligence", "competitive-intel", "exit-strategist",
      "tech-stack-dd", "tech-ops-dd", "legal-regulatory",
      "gtm-analyst", "customer-intel", "cap-table-auditor",
    ];
    for (const a of t1Agents) {
      results[a] = makeT1Result(a, options.t1Score);
    }
  }

  if (options.criticalRedFlags !== undefined) {
    results["contradiction-detector"] = makeContradictionDetectorResult(options.criticalRedFlags);
  }

  return results;
}

// ============================================================================
// TESTS
// ============================================================================

describe("applyTier3Coherence", () => {
  it("returns no adjustments when coherence is already good", () => {
    const results = buildResults({ scepticism: 30 });
    const coherence = applyTier3Coherence(results);

    expect(coherence.adjusted).toBe(false);
    expect(coherence.adjustments).toHaveLength(0);
    expect(coherence.coherenceScore).toBe(100);
  });

  it("returns no-op when scenario-modeler failed", () => {
    const results: Record<string, AgentResult> = {
      "scenario-modeler": {
        agentName: "scenario-modeler",
        success: false,
        executionTimeMs: 0,
        cost: 0,
        error: "Failed",
      },
      "devils-advocate": makeDevilsAdvocateResult(88),
    };

    const coherence = applyTier3Coherence(results);
    expect(coherence.adjusted).toBe(false);
    expect(coherence.coherenceScore).toBe(0);
    expect(coherence.warnings).toContain("scenario-modeler n'a pas produit de scénarios — cohérence impossible");
  });

  it("works without devils-advocate (partial coherence)", () => {
    const results: Record<string, AgentResult> = {
      "scenario-modeler": makeScenarioModelerResult([
        makeScenario("CATASTROPHIC", 10, 0),
        makeScenario("BEAR", 20, 0.5),
        makeScenario("BASE", 40, 4.5),
        makeScenario("BULL", 30, 15.8),
      ]),
    };

    const coherence = applyTier3Coherence(results);
    expect(coherence.warnings.some(w => w.includes("scepticisme"))).toBe(true);
  });

  describe("scepticism-based redistribution", () => {
    it("redistributes probabilities when scepticism > 50", () => {
      const results = buildResults({ scepticism: 65 });
      const coherence = applyTier3Coherence(results);

      expect(coherence.adjusted).toBe(true);

      const catScenario = coherence.adjustedScenarios.find(s => s.name === "CATASTROPHIC");
      const bullScenario = coherence.adjustedScenarios.find(s => s.name === "BULL");

      expect(catScenario!.probability.value).toBeGreaterThan(10);
      expect(bullScenario!.probability.value).toBeLessThan(30);
    });

    it("caps BASE probability at 20% when scepticism > 70", () => {
      const results = buildResults({ scepticism: 75 });
      const coherence = applyTier3Coherence(results);

      const baseScenario = coherence.adjustedScenarios.find(s => s.name === "BASE");
      expect(baseScenario!.probability.value).toBeLessThanOrEqual(20);
    });

    it("caps BULL probability < 5% when scepticism > 80", () => {
      const results = buildResults({ scepticism: 85 });
      const coherence = applyTier3Coherence(results);

      const bullScenario = coherence.adjustedScenarios.find(s => s.name === "BULL");
      expect(bullScenario!.probability.value).toBeLessThan(5);
    });

    it("ensures CATASTROPHIC > 60% when scepticism > 90", () => {
      const results = buildResults({ scepticism: 92 });
      const coherence = applyTier3Coherence(results);

      const catScenario = coherence.adjustedScenarios.find(s => s.name === "CATASTROPHIC");
      expect(catScenario!.probability.value).toBeGreaterThan(60);
    });
  });

  describe("probability normalization", () => {
    it("probabilities always sum to 100", () => {
      for (const scepticism of [55, 65, 75, 85, 92]) {
        const results = buildResults({ scepticism });
        const coherence = applyTier3Coherence(results);

        const sum = coherence.adjustedScenarios.reduce(
          (s, sc) => s + sc.probability.value, 0
        );
        expect(sum).toBe(100);
      }
    });

    it("no probability is negative", () => {
      const results = buildResults({ scepticism: 95 });
      const coherence = applyTier3Coherence(results);

      for (const s of coherence.adjustedScenarios) {
        expect(s.probability.value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("T1 average score rules", () => {
    it("makes CATASTROPHIC dominant when T1 avg < 40", () => {
      const results = buildResults({ scepticism: 50, t1Score: 30 });
      const coherence = applyTier3Coherence(results);

      const catScenario = coherence.adjustedScenarios.find(s => s.name === "CATASTROPHIC");
      const bullScenario = coherence.adjustedScenarios.find(s => s.name === "BULL");

      expect(catScenario!.probability.value).toBeGreaterThanOrEqual(40);
      expect(bullScenario!.probability.value).toBeLessThanOrEqual(5);
    });
  });

  describe("critical red flags", () => {
    it("boosts CATASTROPHIC when > 3 critical red flags", () => {
      const results = buildResults({ scepticism: 50, criticalRedFlags: 5 });
      const coherence = applyTier3Coherence(results);

      const catAdj = coherence.adjustments.find(a => a.rule === "CRITICAL_RF_>3");
      expect(catAdj).toBeDefined();
    });
  });

  describe("multiple capping", () => {
    it("caps multiples when scepticism > 60", () => {
      const results = buildResults({ scepticism: 80 });
      const coherence = applyTier3Coherence(results);

      const bullScenario = coherence.adjustedScenarios.find(s => s.name === "BULL");
      expect(bullScenario!.investorReturn.multiple).toBeLessThan(15.8);
    });
  });

  describe("adjusted/reliable flags", () => {
    it("marks adjusted scenarios correctly", () => {
      const results = buildResults({ scepticism: 75 });
      const coherence = applyTier3Coherence(results);

      for (const s of coherence.adjustedScenarios) {
        if (s.adjusted) {
          expect(s.originalProbability).toBeDefined();
        }
      }
    });

    it("marks BULL/BASE as unreliable with high scepticism", () => {
      const results = buildResults({ scepticism: 75 });
      const coherence = applyTier3Coherence(results);

      const bullScenario = coherence.adjustedScenarios.find(s => s.name === "BULL");
      expect(bullScenario!.reliable).toBe(false);

      const catScenario = coherence.adjustedScenarios.find(s => s.name === "CATASTROPHIC");
      expect(catScenario!.reliable).toBe(true);
    });
  });

  describe("coherence score", () => {
    it("gives low coherence score for absurd scenarios (Antiopea case)", () => {
      // NO_GO deal (scepticism 88) but BULL 30% and BASE 40% with 4.5x
      const results = buildResults({ scepticism: 88 });
      const coherence = applyTier3Coherence(results);

      expect(coherence.coherenceScore).toBeLessThanOrEqual(50);
    });

    it("gives high coherence score for well-aligned scenarios", () => {
      const scenarios = [
        makeScenario("CATASTROPHIC", 60, 0),
        makeScenario("BEAR", 25, 0.3),
        makeScenario("BASE", 10, 1.5),
        makeScenario("BULL", 5, 3),
      ];
      const results = buildResults({ scepticism: 85, scenarios });
      const coherence = applyTier3Coherence(results);

      expect(coherence.coherenceScore).toBeGreaterThan(70);
    });
  });

  describe("expected multiple recalculation", () => {
    it("recalculates expected multiple after adjustments", () => {
      const results = buildResults({ scepticism: 80 });
      const coherence = applyTier3Coherence(results);

      // With high scepticism, expected multiple should be much lower
      expect(coherence.adjustedProbabilityWeightedOutcome.expectedMultiple).toBeLessThan(5);
      expect(coherence.adjustedProbabilityWeightedOutcome.reliable).toBe(false);
    });
  });
});

describe("injectCoherenceIntoContext", () => {
  it("modifies scenario-modeler result in-place", () => {
    const results = buildResults({ scepticism: 80 });
    const coherence = applyTier3Coherence(results);

    injectCoherenceIntoContext(results, coherence);

    const smData = (results["scenario-modeler"] as unknown as { data: { findings: { scenarios: unknown[] } } }).data;
    expect(smData.findings.scenarios).toBe(coherence.adjustedScenarios);
  });

  it("does nothing when not adjusted", () => {
    const results = buildResults({ scepticism: 30 });
    const coherence = applyTier3Coherence(results);

    const originalScenarios = (results["scenario-modeler"] as unknown as { data: { findings: { scenarios: unknown[] } } }).data.findings.scenarios;
    injectCoherenceIntoContext(results, coherence);
    const afterScenarios = (results["scenario-modeler"] as unknown as { data: { findings: { scenarios: unknown[] } } }).data.findings.scenarios;

    expect(afterScenarios).toBe(originalScenarios);
  });

  it("tags result with coherenceApplied metadata", () => {
    const results = buildResults({ scepticism: 80 });
    const coherence = applyTier3Coherence(results);
    injectCoherenceIntoContext(results, coherence);

    const sm = results["scenario-modeler"] as unknown as { coherenceApplied?: boolean; coherenceScore?: number };
    expect(sm.coherenceApplied).toBe(true);
    expect(sm.coherenceScore).toBeDefined();
  });
});
