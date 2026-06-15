/**
 * Tests `buildOutput` Conditions Analyst — invariants Phase A slice A4-bis.
 *
 * Vérifie :
 * - `findings.signalIntensity` dérivé déterministe depuis severity red flags
 *   + score conditions (LLM ignoré).
 * - `findings.signalContribution.orientation` cohérent avec signalIntensity.
 * - `alertSignal.recommendation` dérivé déterministe.
 * - `signalContribution.evidenceSolidity: null` en A4-bis (D2 verrouillé).
 * - Anti-régression LLM-driven sur signalContribution.
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { conditionsAnalyst } from "../conditions-analyst";
import type { ConditionsAnalystData, EnrichedAgentContext } from "../../types";

type BuildOutputFn = (
  data: unknown,
  termsSource: "form" | "term_sheet" | "deck",
  context: EnrichedAgentContext,
) => ConditionsAnalystData;
const buildOutput = (conditionsAnalyst as unknown as { buildOutput: BuildOutputFn })
  .buildOutput.bind(conditionsAnalyst);

function makeMockContext(): EnrichedAgentContext {
  return {
    canonicalDeal: { name: "TestCo", stage: "SEED" },
    previousResults: {},
    baPreferences: {},
  } as unknown as EnrichedAgentContext;
}

function makeLLMResponse(score: number, redFlagsCount: { critical?: number; high?: number; medium?: number } = {}): unknown {
  const redFlags: unknown[] = [];
  const sevList: Array<"CRITICAL" | "HIGH" | "MEDIUM"> = [
    ...Array(redFlagsCount.critical ?? 0).fill("CRITICAL"),
    ...Array(redFlagsCount.high ?? 0).fill("HIGH"),
    ...Array(redFlagsCount.medium ?? 0).fill("MEDIUM"),
  ];
  for (let i = 0; i < sevList.length; i++) {
    redFlags.push({
      id: `rf-${i + 1}`,
      category: "conditions",
      severity: sevList[i],
      title: `Red flag ${i + 1}`,
      description: "x",
      evidence: "e",
      impact: "x",
      question: "?",
    });
  }
  return {
    score: { value: score, breakdown: [] },
    findings: {
      termsSource: "form",
      valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
      instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
      protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
      governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
      crossReferenceInsights: [],
      negotiationAdvice: [],
    },
    redFlags,
    questions: [],
    narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
  };
}

describe("buildOutput CA — invariants A4-bis (D1 + D2)", () => {
  describe("Phase A A4-bis — signalIntensity déterministe", () => {
    it("1+ red flag CRITICAL → signalIntensity: critical", () => {
      const data = makeLLMResponse(70, { critical: 1 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("critical");
    });

    it("2+ red flags HIGH (0 CRITICAL) → signalIntensity: high", () => {
      const data = makeLLMResponse(70, { high: 2 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("high");
    });

    it("P2 — score < 40 (sans red flag) → signalIntensity: low (le score N'escalade PLUS)", () => {
      const data = makeLLMResponse(30);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("low");
    });

    it("1 red flag HIGH (0 CRITICAL) → signalIntensity: elevated", () => {
      const data = makeLLMResponse(75, { high: 1 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("elevated");
    });

    it("P2 — score 50 (sans red flag) → signalIntensity: low (le score est ignoré)", () => {
      const data = makeLLMResponse(50);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("low");
    });

    it("score haut + aucun red flag → signalIntensity: low", () => {
      const data = makeLLMResponse(85);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("low");
    });
  });

  describe("P2 — signalContribution.orientation déterministe SANS score", () => {
    it("low intensity (aucun red flag) → favorable — score haut IGNORÉ (plus de very_favorable)", () => {
      const data = makeLLMResponse(90);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("favorable");
    });

    it("low intensity → favorable quel que soit le score (90 et 30 donnent la même orientation)", () => {
      const high = buildOutput(makeLLMResponse(90), "form", makeMockContext());
      const low = buildOutput(makeLLMResponse(30), "form", makeMockContext());
      expect(high.findings.signalContribution.orientation).toBe("favorable");
      expect(low.findings.signalContribution.orientation).toBe("favorable");
    });

    it("1 CRITICAL → alert_dominant (red flag pilote, pas le score)", () => {
      const data = makeLLMResponse(60, { critical: 1 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
    });
  });

  describe("Anti-régression round 2 A3 : LLM ne pilote pas signalIntensity", () => {
    it("LLM tente signalIntensity: low avec 1 CRITICAL → IGNORÉ, runtime dérive critical", () => {
      const data = makeLLMResponse(70, { critical: 1 });
      // injection LLM tentative
      (data as Record<string, unknown>).signalIntensity = "low";
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalIntensity).toBe("critical");
    });

    it("LLM tente signalContribution.orientation: very_favorable avec score 30 → IGNORÉ", () => {
      const data = makeLLMResponse(30);
      (data as Record<string, unknown>).signalContribution = { orientation: "very_favorable", evidenceSolidity: null };
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalContribution.orientation).not.toBe("very_favorable");
    });
  });

  describe("Phase A A4-bis — alertSignal dérivé déterministe", () => {
    it("score 90 + 0 red flag → alertSignal.recommendation: PROCEED", () => {
      const data = makeLLMResponse(90);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.alertSignal.recommendation).toBe("PROCEED");
      expect(result.alertSignal.hasBlocker).toBe(false);
    });

    it("1 red flag CRITICAL → alertSignal.recommendation: STOP + hasBlocker true", () => {
      const data = makeLLMResponse(70, { critical: 1 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.alertSignal.recommendation).toBe("STOP");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("P2 — score < 40 sans red flag → PROCEED (recommendation pilotée par red flags, plus par le score)", () => {
      // P2 : signalIntensity ne dérive plus du score → alertSignal.recommendation
      // (dérivé de l'intensité) n'escalade plus sur un score bas sans red flag.
      const data = makeLLMResponse(30);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.alertSignal.recommendation).toBe("PROCEED");
    });

    it("1 red flag HIGH → INVESTIGATE_FURTHER (escalade par red flag)", () => {
      const data = makeLLMResponse(70, { high: 2 });
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.alertSignal.recommendation).toBe("INVESTIGATE_FURTHER");
    });
  });

  describe("D2 verrouillé : evidenceSolidity reste null en A4-bis", () => {
    it("score haut → evidenceSolidity null (pas de mapping depuis score)", () => {
      const data = makeLLMResponse(95);
      const result = buildOutput(data, "form", makeMockContext());
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("Phase A A6 round 2 — fallback buildNoConditionsResult branché service Evidence Solidity", () => {
    type BuildNoConditionsFn = (context: EnrichedAgentContext) => ConditionsAnalystData;
    const buildNoConditionsResult = (conditionsAnalyst as unknown as { buildNoConditionsResult: BuildNoConditionsFn })
      .buildNoConditionsResult.bind(conditionsAnalyst);

    it("Contexte minimal sans ledger/contradictions → evidenceSolidity null", () => {
      const result = buildNoConditionsResult(makeMockContext());
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
      expect(result.findings.signalContribution.orientation).toBe("vigilance");
    });

    it("Contexte avec 3 contradictions CRITICAL → evidenceSolidity = contradictory (fallback aussi branché A6)", () => {
      const context = {
        ...makeMockContext(),
        previousResults: {
          "contradiction-detector": {
            agentName: "contradiction-detector",
            success: true,
            executionTimeMs: 100,
            cost: 0.01,
            data: {
              findings: {
                contradictions: [
                  { id: "c1", severity: "CRITICAL" },
                  { id: "c2", severity: "CRITICAL" },
                  { id: "c3", severity: "CRITICAL" },
                ],
              },
            },
          },
        },
      } as unknown as EnrichedAgentContext;
      const result = buildNoConditionsResult(context);
      expect(result.findings.signalContribution.evidenceSolidity).toBe("contradictory");
      expect(result.findings.signalContribution.evidenceSolidityRationale).toBeTruthy();
    });

    it("Contexte avec ledger insufficient (factCount=0) → evidenceSolidity = insufficient", () => {
      const context = {
        ...makeMockContext(),
        evidenceLedger: {
          generatedAt: new Date().toISOString(),
          coverage: {
            factCount: 0,
            documentArtifactCount: 0,
            visualArtifactCount: 0,
            numericClaimCount: 0,
            extractionWarningCount: 0,
            externalSourceIssueCount: 0,
            lowReliabilityFactCount: 0,
          },
          items: [],
          warnings: [],
        },
      } as unknown as EnrichedAgentContext;
      const result = buildNoConditionsResult(context);
      expect(result.findings.signalContribution.evidenceSolidity).toBe("insufficient");
    });
  });
});
