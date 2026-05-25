/**
 * Tests `normalizeResponse` — invariants runtime Phase A slice A3 (D1 + D2)
 *
 * Vérifie le comportement de l'adapter post-LLM `normalizeResponse` qui :
 * - Lit l'output LLM en priorité `data.findings.structuralRisks` (contrat
 *   natif demandé au LLM par le prompt compagnon A3).
 * - Active un parser tolérant lecture seule si le LLM produit encore
 *   `data.findings.killReasons` legacy (severityLevel CRITICAL|HIGH|CONCERN
 *   → severity CRITICAL|HIGH|MEDIUM), sans réémettre `killReasons` natif.
 * - Dérive `riskPosture` déterministe depuis severity counts si le LLM ne
 *   l'a pas fournie.
 * - Construit `signalContribution.orientation` déterministe depuis
 *   riskPosture + counts (DA n'émet jamais `very_favorable` — biais
 *   contradicteur structurel).
 * - Dérive `alertSignal.recommendation` déterministe depuis `riskPosture`
 *   (LLM ne pilote plus la décision).
 * - Maintient `signalContribution.evidenceSolidity: null` en A3 (D2 verrouillé).
 *
 * `normalizeResponse` est `private`. Pour le tester, on cast l'agent en
 * `Record<string, unknown>` et on appelle la méthode via cast explicite.
 */

import { describe, expect, it, vi } from "vitest";

// Stub OpenRouter API key avant tout import — l'instanciation du singleton
// DA charge transitivement `@/services/openrouter/router` qui initialise
// un client OpenAI au top-level. `vi.hoisted` garantit l'ordre d'exécution
// avant les imports ESM hoistés.
vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { devilsAdvocate } from "../devils-advocate";
import type { DevilsAdvocateData } from "../../types";

type NormalizeResponseFn = (data: unknown, dealName: string) => DevilsAdvocateData;
const normalizeResponse = (devilsAdvocate as unknown as { normalizeResponse: NormalizeResponseFn })
  .normalizeResponse.bind(devilsAdvocate);

function makeMinimalLLMResponse(findingsOverrides: Record<string, unknown> = {}): unknown {
  return {
    meta: { dataCompleteness: "complete", confidenceLevel: 75, limitations: [] },
    score: { value: 60, grade: "C", breakdown: [] },
    findings: {
      counterArguments: [],
      worstCaseScenario: {
        name: "x", description: "x", triggers: [], cascadeEffects: [],
        probability: 20, probabilityRationale: "x",
        lossAmount: { totalLoss: false, estimatedLoss: "50%" },
        comparableCatastrophes: [], earlyWarningSigns: [],
      },
      blindSpots: [],
      alternativeNarratives: [],
      additionalMarketRisks: [],
      hiddenCompetitiveThreats: [],
      executionChallenges: [],
      skepticismAssessment: {
        score: 50, scoreBreakdown: [], verdict: "CAUTIOUS", verdictRationale: "x",
      },
      concernsSummary: { absolute: [], conditional: [], serious: [], minor: [] },
      positiveClaimsChallenged: [],
      ...findingsOverrides,
    },
    dbCrossReference: { claims: [], uncheckedClaims: [] },
    redFlags: [],
    questions: [],
    alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "" },
    narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
  };
}

describe("normalizeResponse — invariants A3 (D1 + D2)", () => {
  describe("Cas natif : LLM produit `structuralRisks[]` (contrat natif Phase A)", () => {
    it("structuralRisks natif → emis tel quel avec severity CRITICAL|HIGH|MEDIUM (A1)", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "Cap table fragmenté", category: "structural", severity: "CRITICAL", evidence: "x", source: "cap-table-auditor" },
          { riskId: "sr-2", description: "Burn élevé", category: "financials", severity: "HIGH" },
        ],
        riskPosture: "elevated",
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.structuralRisks).toHaveLength(2);
      expect(result.findings.structuralRisks[0].severity).toBe("CRITICAL");
      expect(result.findings.structuralRisks[1].severity).toBe("HIGH");
      expect(result.findings.structuralRisks[0].description).toBe("Cap table fragmenté");
    });

    it("Round 2 Codex : LLM riskPosture: 'light' + 3 CRITICAL → riskPosture: 'structural' (LLM ignoré)", () => {
      // Anti-régression du blocker round 2 : le LLM ne doit JAMAIS pouvoir
      // downgrader la posture. Le runtime dérive toujours depuis counts.
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
        riskPosture: "light", // LLM tente de downgrader — doit être ignoré.
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("structural");
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
      expect(result.alertSignal.recommendation).toBe("STOP");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("Round 2 Codex : LLM riskPosture: 'light' + 2 CRITICAL → riskPosture: 'critical' (LLM ignoré)", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
        ],
        riskPosture: "light", // tentative de downgrade — ignorée
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("critical");
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
      expect(result.alertSignal.recommendation).toBe("INVESTIGATE_FURTHER");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("Round 2 Codex : LLM riskPosture: 'structural' + 0 structuralRisks → riskPosture: 'light' (LLM ignoré)", () => {
      // Anti-régression symétrique : le LLM ne doit JAMAIS pouvoir escalader
      // non plus. Sans risques structurels, la posture est `light` même si
      // le LLM annonce `structural`.
      const data = makeMinimalLLMResponse({
        structuralRisks: [],
        riskPosture: "structural", // tentative d'escalade — ignorée
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("light");
      expect(result.findings.signalContribution.orientation).toBe("favorable");
      expect(result.alertSignal.recommendation).toBe("PROCEED");
      expect(result.alertSignal.hasBlocker).toBe(false);
    });

    it("Round 2 Codex : LLM riskPosture invalide (valeur hors enum) → dérivé déterministe depuis counts", () => {
      // Avant round 2 : le runtime acceptait la valeur LLM si elle passait
      // le validRiskPostures.includes(). Désormais le runtime ignore
      // complètement la valeur LLM. Le test garantit que toute valeur LLM
      // est ignorée, valide OU invalide.
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
        riskPosture: "INVALID_VALUE",
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("structural");
    });

    it("structuralRisks vide + pas de riskPosture → riskPosture: light", () => {
      const data = makeMinimalLLMResponse({ structuralRisks: [] });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("light");
    });

    it("signalContribution.orientation dérivé déterministe : 3 CRITICAL → alert_dominant", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
    });

    it("signalContribution.orientation : 2 CRITICAL → alert_dominant", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.signalContribution.orientation).toBe("alert_dominant");
    });

    it("signalContribution.orientation : 1 CRITICAL → vigilance", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.signalContribution.orientation).toBe("vigilance");
    });

    it("signalContribution.orientation : 2 HIGH (0 CRITICAL) → contrasted via riskPosture elevated", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "HIGH" },
          { riskId: "sr-2", description: "B", category: "team", severity: "HIGH" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("elevated");
      expect(result.findings.signalContribution.orientation).toBe("contrasted");
    });

    it("signalContribution.orientation : 0 risk → favorable (riskPosture light)", () => {
      const data = makeMinimalLLMResponse({ structuralRisks: [] });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("light");
      expect(result.findings.signalContribution.orientation).toBe("favorable");
    });
  });

  describe("D2 verrouillé : evidenceSolidity reste null en A3", () => {
    it("structuralRisks 3 CRITICAL → evidenceSolidity = null (jamais fabriqué)", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
    });

    it("structuralRisks vide + score haut → evidenceSolidity reste null (pas de mapping depuis score)", () => {
      const data = makeMinimalLLMResponse({ structuralRisks: [] });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("Parser tolérant LLM dégradé : killReasons legacy → structuralRisks (lecture seule)", () => {
    it("data.findings.killReasons legacy mappé vers structuralRisks ; severity CRITICAL/HIGH/CONCERN → CRITICAL/HIGH/MEDIUM", () => {
      const data = makeMinimalLLMResponse({
        killReasons: [
          { id: "kr-1", reason: "X1", category: "team", evidence: "e1", sourceAgent: "agent1", severityLevel: "CRITICAL", resolutionPossible: false, impactIfIgnored: "i1", questionToFounder: "q1", redFlagAnswer: "r1" },
          { id: "kr-2", reason: "X2", category: "market", evidence: "e2", sourceAgent: "agent2", severityLevel: "HIGH", resolutionPossible: true, impactIfIgnored: "i2", questionToFounder: "q2", redFlagAnswer: "r2" },
          { id: "kr-3", reason: "X3", category: "product", evidence: "e3", sourceAgent: "agent3", severityLevel: "CONCERN", resolutionPossible: true, impactIfIgnored: "i3", questionToFounder: "q3", redFlagAnswer: "r3" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.structuralRisks).toHaveLength(3);
      expect(result.findings.structuralRisks[0].severity).toBe("CRITICAL");
      expect(result.findings.structuralRisks[1].severity).toBe("HIGH");
      expect(result.findings.structuralRisks[2].severity).toBe("MEDIUM"); // CONCERN → MEDIUM
      expect(result.findings.structuralRisks[0].description).toBe("X1");
      expect(result.findings.structuralRisks[0].source).toBe("agent1");
    });

    it("structuralRisks natif a priorité sur killReasons legacy", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "FromStructural", category: "team", severity: "CRITICAL" },
        ],
        killReasons: [
          { id: "kr-1", reason: "FromLegacy", category: "team", evidence: "e", sourceAgent: "x", severityLevel: "CRITICAL", resolutionPossible: false, impactIfIgnored: "x", questionToFounder: "q", redFlagAnswer: "r" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      // structuralRisks natif gagne ; killReasons legacy ignoré.
      expect(result.findings.structuralRisks).toHaveLength(1);
      expect(result.findings.structuralRisks[0].description).toBe("FromStructural");
    });

    it("killReasons sans severityLevel → severity MEDIUM par défaut conservateur", () => {
      const data = makeMinimalLLMResponse({
        killReasons: [
          { id: "kr-1", reason: "X", category: "team", evidence: "e", sourceAgent: "x", resolutionPossible: false, impactIfIgnored: "x", questionToFounder: "q", redFlagAnswer: "r" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.structuralRisks[0].severity).toBe("MEDIUM");
    });
  });

  describe("D1 verrouillé : output sérialisé ne contient AUCUN alias legacy", () => {
    it("Output JSON.stringify ne contient PAS `killReasons`, `dealBreakerLevel`, `overallAssessment`", () => {
      const data = makeMinimalLLMResponse({
        killReasons: [
          { id: "kr-1", reason: "X", category: "team", evidence: "e", sourceAgent: "x", severityLevel: "CRITICAL", resolutionPossible: false, impactIfIgnored: "x", questionToFounder: "q", redFlagAnswer: "r" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("killReasons");
      expect(serialized).not.toContain("dealBreakerLevel");
      expect(serialized).not.toContain("overallAssessment");
    });

    it("findings expose bien le contrat natif Phase A (structuralRisks + riskPosture + signalContribution)", () => {
      const data = makeMinimalLLMResponse({});
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings).toHaveProperty("structuralRisks");
      expect(result.findings).toHaveProperty("riskPosture");
      expect(result.findings).toHaveProperty("signalContribution");
      expect(result.findings.signalContribution).toHaveProperty("orientation");
    });
  });

  describe("Phase A A3 — alertSignal dérivé déterministe depuis riskPosture", () => {
    it("riskPosture: light → alertSignal.recommendation = PROCEED + hasBlocker false", () => {
      const data = makeMinimalLLMResponse({ structuralRisks: [] });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("light");
      expect(result.alertSignal.recommendation).toBe("PROCEED");
      expect(result.alertSignal.hasBlocker).toBe(false);
    });

    it("riskPosture: elevated (2 HIGH) → alertSignal.recommendation = PROCEED_WITH_CAUTION", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "HIGH" },
          { riskId: "sr-2", description: "B", category: "team", severity: "HIGH" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("elevated");
      expect(result.alertSignal.recommendation).toBe("PROCEED_WITH_CAUTION");
      expect(result.alertSignal.hasBlocker).toBe(false);
    });

    it("riskPosture: critical (2 CRITICAL) → alertSignal.recommendation = INVESTIGATE_FURTHER + hasBlocker true", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("critical");
      expect(result.alertSignal.recommendation).toBe("INVESTIGATE_FURTHER");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("riskPosture: structural (3 CRITICAL) → alertSignal.recommendation = STOP + hasBlocker true", () => {
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
      });
      const result = normalizeResponse(data, "TestCo");
      expect(result.findings.riskPosture).toBe("structural");
      expect(result.alertSignal.recommendation).toBe("STOP");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });

    it("alertSignal LLM PROCEED/STOP ignoré : valeur dérivée écrase la valeur LLM", () => {
      // Le LLM dit "PROCEED" mais riskPosture critical → STOP override.
      const data = makeMinimalLLMResponse({
        structuralRisks: [
          { riskId: "sr-1", description: "A", category: "team", severity: "CRITICAL" },
          { riskId: "sr-2", description: "B", category: "team", severity: "CRITICAL" },
          { riskId: "sr-3", description: "C", category: "team", severity: "CRITICAL" },
        ],
      });
      // Mock LLM aurait pu vouloir piloter PROCEED — le runtime ignore.
      const dataWithLLMOverride = {
        ...(data as Record<string, unknown>),
        alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "LLM-override-attempt" },
      };
      const result = normalizeResponse(dataWithLLMOverride, "TestCo");
      expect(result.alertSignal.recommendation).toBe("STOP");
      expect(result.alertSignal.hasBlocker).toBe(true);
    });
  });

  describe("Phase A A3 — Anti-régression D1", () => {
    it("Le typage TypeScript du findings refuse `killReasons` comme champ natif", () => {
      // Test sentinelle : compile-time uniquement. Si la signature
      // `DevilsAdvocateFindings` réintroduit un `killReasons: KillReason[]`,
      // ce test devra être adapté (D1 verrouillé).
      const data = makeMinimalLLMResponse({});
      const result = normalizeResponse(data, "TestCo");
      // @ts-expect-error — D1 : findings n'a pas de champ `killReasons` natif.
      expect(result.findings.killReasons).toBeUndefined();
    });
  });
});
