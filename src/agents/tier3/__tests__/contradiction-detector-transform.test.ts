/**
 * Tests `buildOutput` Contradiction Detector — invariants Phase A slice A4-bis.
 *
 * Vérifie :
 * - `findings.signalIntensity` dérivé déterministe depuis severity counts
 *   (LLM ignoré — anti-régression round 2 A3 sur riskPosture).
 * - `findings.signalContribution.orientation` cohérent avec signalIntensity.
 * - `alertSignal.recommendation` dérivé déterministe depuis signalIntensity
 *   (compat AgentAlertSignal — debt cross-agent hors A4-bis, shape intact).
 * - `signalContribution.evidenceSolidity: null` en A4-bis (D2 verrouillé).
 * - LLM tente d'injecter `signalIntensity: "low"` avec 3 contradictions
 *   CRITICAL → IGNORÉ par le runtime, valeur dérivée = "critical".
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { contradictionDetector } from "../contradiction-detector";
import type { ContradictionDetectorData, EnrichedAgentContext } from "../../types";

type BuildOutputFn = (data: unknown, context: EnrichedAgentContext) => ContradictionDetectorData;
const buildOutput = (contradictionDetector as unknown as { buildOutput: BuildOutputFn })
  .buildOutput.bind(contradictionDetector);

function makeMockContext(): EnrichedAgentContext {
  return {
    canonicalDeal: { name: "TestCo" },
    previousResults: {},
    baPreferences: {},
  } as unknown as EnrichedAgentContext;
}

function makeContradiction(severity: "CRITICAL" | "HIGH" | "MEDIUM", id?: string): unknown {
  return {
    id: id ?? `CONT-${severity}-${Math.random().toString(36).slice(2, 8)}`,
    type: "DECK_VS_DB",
    severity,
    statement1: { text: "x", location: "deck", source: "deck" },
    statement2: { text: "y", location: "db", source: "funding-db" },
    topic: "Test",
    analysis: "test",
    implication: "test",
    confidenceLevel: 90,
    question: "test?",
    redFlagIfBadAnswer: "x",
  };
}

function makeLLMResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    contradictions: [],
    dataGaps: [],
    consistencyAnalysis: { overallScore: 70, breakdown: [], interpretation: "x" },
    redFlagConvergence: [],
    redFlags: [],
    questions: [],
    narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    ...overrides,
  };
}

describe("buildOutput CD — invariants A4-bis (D1 + D2)", () => {
  describe("Phase A A4-bis — signalIntensity déterministe", () => {
    it("2+ contradictions CRITICAL → signalIntensity: critical", () => {
      const data = makeLLMResponse({
        contradictions: [
          makeContradiction("CRITICAL"),
          makeContradiction("CRITICAL"),
        ],
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalIntensity).toBe("critical");
    });

    it("1 contradiction CRITICAL → signalIntensity: high", () => {
      const data = makeLLMResponse({
        contradictions: [makeContradiction("CRITICAL")],
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalIntensity).toBe("high");
    });

    it("2+ HIGH (0 CRITICAL) → signalIntensity: elevated", () => {
      const data = makeLLMResponse({
        contradictions: [makeContradiction("HIGH"), makeContradiction("HIGH")],
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalIntensity).toBe("elevated");
    });

    it("Aucune contradiction → signalIntensity: low", () => {
      const data = makeLLMResponse({ contradictions: [] });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalIntensity).toBe("low");
    });
  });

  describe("Anti-régression round 2 A3 : LLM ne pilote pas signalIntensity", () => {
    it("LLM tente d'injecter `signalIntensity: low` avec 3 CRITICAL → IGNORÉ, runtime dérive critical", () => {
      const data = makeLLMResponse({
        contradictions: [
          makeContradiction("CRITICAL"),
          makeContradiction("CRITICAL"),
          makeContradiction("CRITICAL"),
        ],
        signalIntensity: "low", // tentative LLM, doit être ignorée
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalIntensity).toBe("critical");
    });

    it("LLM tente d'injecter `signalContribution: { orientation: very_favorable }` avec contradictions critiques → IGNORÉ", () => {
      const data = makeLLMResponse({
        contradictions: [makeContradiction("CRITICAL"), makeContradiction("CRITICAL")],
        signalContribution: { orientation: "very_favorable", evidenceSolidity: null },
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalContribution.orientation).not.toBe("very_favorable");
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
    });
  });

  describe("Phase A A4-bis — alertSignal dérivé déterministe", () => {
    it("signalIntensity: low → alertSignal.recommendation: PROCEED", () => {
      const data = makeLLMResponse({ contradictions: [] });
      const result = buildOutput(data, makeMockContext());
      expect(result.alertSignal.recommendation).toBe("PROCEED");
      expect(result.alertSignal.hasBlocker).toBe(false);
    });

    it("signalIntensity: critical (2 CRITICAL) → alertSignal.recommendation: STOP + hasBlocker true", () => {
      const data = makeLLMResponse({
        contradictions: [makeContradiction("CRITICAL"), makeContradiction("CRITICAL")],
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.alertSignal.recommendation).toBe("STOP");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("LLM dit PROCEED alors que 3 CRITICAL → runtime override STOP", () => {
      const data = makeLLMResponse({
        contradictions: [
          makeContradiction("CRITICAL"),
          makeContradiction("CRITICAL"),
          makeContradiction("CRITICAL"),
        ],
        alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "LLM-override" },
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.alertSignal.recommendation).toBe("STOP");
    });
  });

  describe("Round 2 Codex — justification déterministe (LLM ignoré)", () => {
    it("LLM envoie alertSignal.justification = 'I recommend STOP' → ressort NON dans le justification natif", () => {
      // Anti-régression round 2 : la justification LLM legacy ne doit JAMAIS
      // ressortir dans l'output. Le builder émet une justification déterministe
      // basée sur signalIntensity + counts uniquement.
      const data = makeLLMResponse({
        contradictions: [],
        alertSignal: {
          hasBlocker: true,
          recommendation: "STOP",
          justification: "I recommend STOP — fondateur peu fiable",
        },
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.alertSignal.justification).not.toContain("I recommend STOP");
      expect(result.alertSignal.justification).not.toContain("fondateur peu fiable");
      // La justification émise doit être déterministe (mention de signalIntensity).
      expect(result.alertSignal.justification).toMatch(/Intensité du signal/);
    });

    it("LLM essaie d'imposer hasBlocker=true sans aucune contradiction → IGNORÉ (runtime calcule false)", () => {
      const data = makeLLMResponse({
        contradictions: [],
        alertSignal: { hasBlocker: true, recommendation: "STOP", justification: "x" },
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.alertSignal.hasBlocker).toBe(false);
      expect(result.alertSignal.recommendation).toBe("PROCEED");
    });
  });

  describe("D2 verrouillé : evidenceSolidity reste null en A4-bis", () => {
    it("Aucune contradiction → evidenceSolidity null", () => {
      const data = makeLLMResponse({ contradictions: [] });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
    });

    it("Phase A A6 — 2+ contradictions critiques → evidenceSolidity = contradictory (service Evidence Solidity qualifie depuis severity counts, jamais depuis score)", () => {
      // Note : ce test a changé de comportement entre A4-bis et A6.
      // En A4-bis, evidenceSolidity restait null (service Solidity pas branché).
      // En A6, le branchement déterministe qualifie `contradictory` via
      // selfContradictionsOverride sur les counts CRITICAL/HIGH de CD lui-même.
      // L'anti-fabrication D2 reste verrouillée : le service ne lit jamais
      // score / confidence (cf. source-guard A6).
      const data = makeLLMResponse({
        contradictions: [makeContradiction("CRITICAL"), makeContradiction("CRITICAL")],
      });
      const result = buildOutput(data, makeMockContext());
      expect(result.findings.signalContribution.evidenceSolidity).toBe("contradictory");
      expect(result.findings.signalContribution.evidenceSolidityRationale).toBeTruthy();
    });
  });
});
