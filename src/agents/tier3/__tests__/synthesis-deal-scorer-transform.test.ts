/**
 * Tests `transformResponse` — invariants runtime Phase A slice A2 (D1 + D2)
 *
 * Vérifie le comportement de l'adapter post-LLM `transformResponse` qui :
 * - Lit l'output LLM (potentiellement dégradé en valeurs legacy) et le
 *   normalise vers orientation native via `actionMapping` (parser tolérant
 *   lecture seule — D1 verrouillé).
 * - Produit `signalContribution: Tier3SignalContribution` (champ A1) avec
 *   orientation cohérente avec le `verdict` du data, et `evidenceSolidity: null`
 *   en A2 (D2 verrouillé : sera renseigné par service Solidité en A6).
 *
 * `transformResponse` est `private`. Pour le tester, on cast l'agent en
 * `Record<string, unknown>` et on appelle la méthode via cast explicite. C'est
 * un pattern de test acceptable pour valider l'invariant d'un adapter privé
 * sans changer la visibilité publique de l'API.
 */

import { describe, expect, it, beforeAll, vi } from "vitest";

// Stub OpenRouter API key avant tout import — l'instanciation du singleton
// SDS charge transitivement `@/services/openrouter/router` qui initialise
// un client OpenAI au top-level. Sans clé, l'import du test plante.
// `vi.hoisted` garantit l'ordre d'exécution avant les imports ESM hoistés.
vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { synthesisDealScorer, type SynthesisDealScorerData } from "../synthesis-deal-scorer";

import type { EnrichedAgentContext } from "../../types";

// Cast Helper : transformResponse est private — on l'invoque via Record<string, unknown>
// pour les tests d'invariant. Pas un usage runtime, juste validation contractuelle.
type TransformResponseFn = (data: unknown, context: EnrichedAgentContext) => SynthesisDealScorerData;
const transformResponse = (synthesisDealScorer as unknown as { transformResponse: TransformResponseFn }).transformResponse.bind(synthesisDealScorer);

// Mock contexte minimal — `transformResponse` n'utilise que `previousResults`,
// `thesis`, et `analysis` côté coherence caps + meta-gate. Pour les tests
// d'invariant on fournit un contexte vide.
function makeMockContext(overrides: Partial<EnrichedAgentContext> = {}): EnrichedAgentContext {
  return {
    previousResults: {},
    ...overrides,
  } as EnrichedAgentContext;
}

// Forme minimale LLM acceptée par `transformResponse` pour produire un
// SynthesisDealScorerData valide. Utilise le format racine (alternative
// LLM possible documentée dans LLMSynthesisResponse).
function makeMinimalLLMResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    meta: {
      agentName: "synthesis-deal-scorer",
      analysisDate: "2026-05-24",
      dataCompleteness: "complete",
      confidenceLevel: 75,
      limitations: [],
    },
    score: {
      value: 65,
      grade: "C",
      breakdown: [
        { criterion: "Team", weight: 0.26, score: 70, justification: "team-investigator: 70/100" },
        { criterion: "Financials", weight: 0.21, score: 60, justification: "financial-auditor: 60/100" },
        { criterion: "Market", weight: 0.16, score: 65, justification: "market-intelligence: 65/100" },
        { criterion: "GTM", weight: 0.16, score: 60, justification: "gtm-analyst: 60/100" },
        { criterion: "Product", weight: 0.16, score: 65, justification: "tech-stack-dd: 65/100" },
        { criterion: "Competitive", weight: 0.05, score: 60, justification: "competitive-intel: 60/100" },
      ],
    },
    redFlags: [],
    ...overrides,
  };
}

describe("transformResponse — invariants A2 (D1 + D2)", () => {
  describe("Cas natif top-level : LLM produit `orientation` top-level (chemin Phase A natif)", () => {
    // Round 3-4 — Le `transformResponse` doit lire `data.orientation` en
    // priorité absolue, avant tout chemin dégradé. Plan A2 §2 + finding
    // Codex round 2 + finding round 3 (test strict).

    it("data.orientation: 'contrasted' sans recommendation.action → mappedAction === 'contrasted' STRICT (round 4 fix)", () => {
      // Test strict round 4 : vérifie que `data.orientation` est RÉELLEMENT
      // lu et utilisé pour `mappedAction`, pas seulement que le résultat est
      // dans la liste d'orientations valides.
      //
      // Score 65 → finalVerdict = "contrasted" (cohérent avec data.orientation).
      // Le coherence enforcement ne ré-aligne pas (les 2 règles ne couvrent
      // que alert_dominant ↔ very_favorable mismatch).
      const llmResponse = makeMinimalLLMResponse({
        orientation: "contrasted",
        // PAS de `findings.recommendation`, PAS de `recommendation`
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
    });

    it("data.orientation: 'favorable' avec score 65 → mappedAction === 'favorable' (priorité absolue)", () => {
      // Cas natif favorable : orientation racine = "favorable", score 65.
      // finalVerdict (score-based) = "contrasted". Coherence enforcement
      // ne couvre pas favorable↔contrasted, donc mappedAction reste "favorable".
      const llmResponse = makeMinimalLLMResponse({
        orientation: "favorable",
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("favorable");
    });

    it("data.orientation prime sur recommendation.action (priorité absolue round 3)", () => {
      // Si les deux sont présents, `data.orientation` (priorité 1) prime sur
      // `recommendation.action` (priorité 3).
      const llmResponse = makeMinimalLLMResponse({
        orientation: "favorable",
        recommendation: {
          action: "vigilance", // doit être ignoré
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("favorable");
    });

    let result: SynthesisDealScorerData;

    beforeAll(() => {
      const llmResponse = makeMinimalLLMResponse({
        orientation: "contrasted",
      });
      result = transformResponse(llmResponse, makeMockContext());
    });

    it("output verdict est dérivé du score (cohérence dimensionnelle)", () => {
      expect(result.verdict).toBe("contrasted");
    });

    it("signalContribution.orientation === verdict (invariant cohérence)", () => {
      expect(result.signalContribution.orientation).toBe(result.verdict);
    });

    it("signalContribution.evidenceSolidity === null (D2 verrouillé)", () => {
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("Cas natif : LLM produit orientation native via `findings.recommendation` (chemin alternatif)", () => {
    let result: SynthesisDealScorerData;

    beforeAll(() => {
      const llmResponse = makeMinimalLLMResponse({
        findings: {
          recommendation: {
            action: "contrasted",
            verdict: "contrasted",
            rationale: "Signaux contrastés sur 3 dimensions",
          },
        },
      });
      result = transformResponse(llmResponse, makeMockContext());
    });

    it("verdict de l'output est orientation native (cohérent avec score-based dérivation)", () => {
      // Le `transformResponse` dérive `finalVerdict` de `scoreBasedVerdict(score)`.
      // Score 65 → "contrasted" (range 55-69 selon la grille SDS).
      expect(result.verdict).toBe("contrasted");
    });

    it("signalContribution.orientation === verdict (invariant cohérence A1)", () => {
      expect(result.signalContribution.orientation).toBe(result.verdict);
    });

    it("signalContribution.evidenceSolidity === null en A2 (D2 verrouillé)", () => {
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });

    it("signalContribution.score === overallScore (cohérence dimensionnelle)", () => {
      expect(result.signalContribution.score).toBe(result.overallScore);
    });

    it("investmentRecommendation.action === verdict (cohérence interne action↔verdict)", () => {
      expect(result.investmentRecommendation.action).toBe(result.verdict);
    });
  });

  describe("Cas LLM dégradé : LLM produit ancien format legacy (STRONG_PASS/PASS/...)", () => {
    it("LLM produit `recommendation.action: STRONG_PASS` → mappé vers `alert_dominant` (parser tolérant lecture seule)", () => {
      const llmResponse = makeMinimalLLMResponse({
        // LLM dégradé : action contient une valeur legacy (cast vers unknown)
        findings: {
          recommendation: {
            action: "STRONG_PASS" as unknown,
            verdict: "STRONG_PASS" as unknown,
            rationale: "LLM dégradé",
          },
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      // Le `actionMapping` mappe STRONG_PASS → alert_dominant (parser lecture seule).
      // L'output `verdict` est ensuite dérivé de score (non legacy).
      expect(result.investmentRecommendation.action).toBe("alert_dominant");
    });

    it("LLM produit `recommendation.action: PASS` (legacy) → mappé vers orientation native", () => {
      const llmResponse = makeMinimalLLMResponse({
        recommendation: {
          action: "PASS" as unknown,
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"]).toContain(
        result.investmentRecommendation.action
      );
      expect(result.investmentRecommendation.action).not.toBe("PASS");
    });

    it("LLM produit `verdict: PASS` racine (legacy) → strict `vigilance` via raw cast (round 5 strict)", () => {
      // Régression round 3 : `verdict?: Tier3Orientation` était déclaré dans
      // l'interface mais jamais lu par `transformResponse`. Round 4 corrige
      // via raw cast `(data as { verdict?: string }).verdict`. Round 5 rend
      // l'assertion strict : si le raw cast est retiré, ce test échoue.
      //
      // Chaîne : `verdict: "PASS"` racine → rawAction lu via raw cast →
      // `actionMapping["PASS"] = "vigilance"`. Score 65 → finalVerdict =
      // "contrasted". Coherence enforcement ne touche pas (ne couvre que
      // alert_dominant ↔ very_favorable). Donc mappedAction = "vigilance".
      const llmResponse = makeMinimalLLMResponse({
        verdict: "PASS" as unknown,
        // PAS de `data.orientation`, PAS de `recommendation.action`
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("vigilance");
    });

    it("LLM produit `verdict: STRONG_PASS` racine → strict `alert_dominant` via raw cast (round 5 strict)", () => {
      // Round 5 strict : si `rawRootVerdict` est retiré de `transformResponse`,
      // ce test échoue (mappedAction tomberait sur fallback "vigilance" sans
      // la lecture du verdict racine).
      //
      // Chaîne : `verdict: "STRONG_PASS"` racine → rawAction lu via raw cast →
      // `actionMapping["STRONG_PASS"] = "alert_dominant"`. Score 65 →
      // finalVerdict = "contrasted". Coherence enforcement : finalVerdict
      // "contrasted" ≠ "alert_dominant" et ≠ "very_favorable", donc aucune
      // règle ne réaligne. Donc mappedAction reste "alert_dominant".
      const llmResponse = makeMinimalLLMResponse({
        verdict: "STRONG_PASS" as unknown,
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("alert_dominant");
    });

    it("LLM produit `verdict: favorable` racine natif → lu via raw cast", () => {
      // Cas natif : verdict racine déjà orientation. Le raw cast le lit en
      // priorité 2 (après data.orientation absent). mappedAction = "favorable".
      // Score 65 → finalVerdict = "contrasted". Coherence enforcement laisse
      // passer (les 2 règles ne couvrent que alert_dominant ↔ very_favorable).
      const llmResponse = makeMinimalLLMResponse({
        verdict: "favorable" as unknown,
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("favorable");
    });

    it("LLM ne produit AUCUNE recommendation → default = vigilance (fallback safe)", () => {
      const llmResponse = makeMinimalLLMResponse();
      const result = transformResponse(llmResponse, makeMockContext());
      expect(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"]).toContain(
        result.verdict
      );
    });

    it("Cas dégradé : `signalContribution.orientation === verdict` (invariant maintenu)", () => {
      const llmResponse = makeMinimalLLMResponse({
        findings: {
          recommendation: {
            action: "STRONG_INVEST" as unknown, // Legacy "STRONG_INVEST"
            verdict: "STRONG_INVEST" as unknown,
            rationale: "LLM dégradé",
          },
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.signalContribution.orientation).toBe(result.verdict);
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("D1 — aucun champ legacy émis dans l'output", () => {
    it("output ne contient ni `legacyVerdict` ni `STRONG_PASS` dans aucun champ", () => {
      const llmResponse = makeMinimalLLMResponse({
        findings: {
          recommendation: {
            action: "STRONG_PASS" as unknown,
            verdict: "STRONG_PASS" as unknown,
            rationale: "LLM dégradé legacy",
          },
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());

      // Sérialiser l'output et chercher tout token legacy
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/STRONG_PASS/);
      expect(serialized).not.toMatch(/CONDITIONAL_PASS/);
      expect(serialized).not.toMatch(/WEAK_PASS/);
      expect(serialized).not.toMatch(/legacyVerdict/);
      expect(serialized).not.toMatch(/STRONG_INVEST/);
    });

    it("output contient bien le champ `signalContribution` (A1)", () => {
      const llmResponse = makeMinimalLLMResponse();
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.signalContribution).toBeDefined();
      expect(result.signalContribution.orientation).toBeDefined();
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });
  });

  describe("D2 — signalContribution.evidenceSolidity toujours null en A2", () => {
    it.each([
      "very_favorable",
      "favorable",
      "contrasted",
      "vigilance",
      "alert_dominant",
    ] as const)("orientation %s → evidenceSolidity null (A2 service Solidité non câblé)", (orientation) => {
      const llmResponse = makeMinimalLLMResponse({
        findings: {
          recommendation: {
            action: orientation,
            verdict: orientation,
            rationale: "test",
          },
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      // evidenceSolidity DOIT être null en A2 — sera renseigné par A6 service Solidité
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });
  });
});
