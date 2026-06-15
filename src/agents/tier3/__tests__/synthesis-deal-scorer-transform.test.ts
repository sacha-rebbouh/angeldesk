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

import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";

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

import type { EnrichedAgentContext, AgentResult } from "../../types";

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
  describe("P2 — `orientation`/`action` LLM TOLÉRÉE en entrée, JAMAIS préservée en sortie", () => {
    // P2 (recadrage gate Codex) — `investmentRecommendation.action` n'est plus
    // un canal d'orientation piloté par le LLM. Quelle que soit l'orientation
    // produite par le LLM, l'output `action` reflète DÉTERMINISTIQUEMENT
    // `finalVerdict` (score-indépendant). Contexte vide → finalVerdict =
    // "contrasted" (intensité low, pas de dominance favorable).

    it("data.orientation: 'favorable' (LLM) → output action = finalVerdict 'contrasted' (LLM ignoré)", () => {
      const llmResponse = makeMinimalLLMResponse({ orientation: "favorable" });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
      expect(result.investmentRecommendation.action).toBe(result.verdict);
    });

    it("data.orientation: 'very_favorable' + recommendation.action: 'alert_dominant' → output action = finalVerdict (les deux ignorés)", () => {
      const llmResponse = makeMinimalLLMResponse({
        orientation: "very_favorable",
        recommendation: { action: "alert_dominant" },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
      expect(result.investmentRecommendation.action).toBe(result.verdict);
    });

    it("action LLM divergente n'apparaît jamais dans l'output sérialisé", () => {
      const llmResponse = makeMinimalLLMResponse({ orientation: "very_favorable" });
      const result = transformResponse(llmResponse, makeMockContext());
      // verdict + action déterministes = contrasted ; la valeur LLM very_favorable
      // ne doit pas être préservée comme orientation de sortie.
      expect(result.verdict).toBe("contrasted");
      expect(result.investmentRecommendation.action).toBe("contrasted");
    });

    let result: SynthesisDealScorerData;

    beforeAll(() => {
      const llmResponse = makeMinimalLLMResponse({
        orientation: "contrasted",
      });
      result = transformResponse(llmResponse, makeMockContext());
    });

    it("output verdict score-indépendant (P2) : intensité low + pas de dominance favorable → contrasted", () => {
      // P2 — `verdict` n'est plus dérivé du score. Contexte vide → intensité
      // low, 0 dimension couverte, 0 signal favorable → branche positive sans
      // dominance → contrasted.
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

    it("verdict de l'output score-indépendant (P2) → contrasted", () => {
      // P2 — `finalVerdict` est dérivé via `deriveScoreIndependentOrientation`
      // (intensité red flags + couverture + solidité), JAMAIS du score. Contexte
      // vide → intensité low, pas de dominance favorable → contrasted.
      expect(result.verdict).toBe("contrasted");
    });

    it("signalContribution.orientation === verdict (invariant cohérence A1)", () => {
      expect(result.signalContribution.orientation).toBe(result.verdict);
    });

    it("signalContribution.evidenceSolidity === null en A2 (D2 verrouillé)", () => {
      expect(result.signalContribution.evidenceSolidity).toBeNull();
    });

    // Chantier P4 — l'invariant `signalContribution.score === overallScore` est
    // supprimé : la synthèse ne produit plus de note de deal (ni `overallScore`,
    // ni `signalContribution.score`). L'orientation reste portée par `verdict`.

    it("investmentRecommendation.action === verdict (cohérence interne action↔verdict)", () => {
      expect(result.investmentRecommendation.action).toBe(result.verdict);
    });
  });

  describe("P2 — LLM dégradé/legacy (STRONG_PASS/PASS/...) toléré en entrée, non préservé", () => {
    // P2 — Les valeurs legacy LLM ne crashent pas le transform (tolérance
    // d'entrée) et n'apparaissent JAMAIS comme orientation de sortie : l'output
    // `action` est toujours `finalVerdict` (contrasted, contexte vide).

    it("`recommendation.action: STRONG_PASS` → toléré, output action = finalVerdict 'contrasted' (PAS alert_dominant)", () => {
      const llmResponse = makeMinimalLLMResponse({
        findings: {
          recommendation: {
            action: "STRONG_PASS" as unknown,
            verdict: "STRONG_PASS" as unknown,
            rationale: "LLM dégradé",
          },
        },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
      expect(result.investmentRecommendation.action).not.toBe("alert_dominant");
    });

    it("`recommendation.action: PASS` (legacy) → toléré, output action = finalVerdict (jamais 'PASS')", () => {
      const llmResponse = makeMinimalLLMResponse({
        recommendation: { action: "PASS" as unknown },
      });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
      expect(result.investmentRecommendation.action).not.toBe("PASS");
    });

    it("`verdict: STRONG_PASS` racine (legacy) → toléré, output action = finalVerdict 'contrasted' (PAS alert_dominant)", () => {
      const llmResponse = makeMinimalLLMResponse({ verdict: "STRONG_PASS" as unknown });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
      expect(result.verdict).toBe("contrasted");
    });

    it("`verdict: favorable` racine natif → toléré, output action = finalVerdict 'contrasted' (PAS favorable)", () => {
      // Même une valeur native favorable du LLM est ignorée : l'orientation est
      // déterministe (contexte vide → contrasted).
      const llmResponse = makeMinimalLLMResponse({ verdict: "favorable" as unknown });
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.investmentRecommendation.action).toBe("contrasted");
    });

    it("LLM ne produit AUCUNE recommendation → output verdict déterministe (contrasted)", () => {
      const llmResponse = makeMinimalLLMResponse();
      const result = transformResponse(llmResponse, makeMockContext());
      expect(result.verdict).toBe("contrasted");
      expect(result.investmentRecommendation.action).toBe("contrasted");
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

// ===========================================================================
// P2 — Orientation SCORELESS : invariant « poisoned score » + modèle positif
// ===========================================================================

/** Construit un AgentResult Tier 1 "couvert" avec d'éventuels red flags. */
function makeCoveredResult(
  agentName: string,
  redFlags: Array<{ severity: string; title: string; description?: string; evidence?: string }> = [],
): AgentResult {
  return {
    success: true,
    agentName,
    data: { redFlags },
  } as unknown as AgentResult;
}

/** Les 12 agents de couverture (alignés sur COVERAGE_DIMENSIONS). */
const COVERAGE_AGENTS = [
  "financial-auditor", "team-investigator", "competitive-intel", "market-intelligence",
  "tech-stack-dd", "tech-ops-dd", "legal-regulatory", "cap-table-auditor",
  "gtm-analyst", "customer-intel", "deck-forensics", "question-master",
];

/** Contexte avec `count` agents couverts (sans red flags) + flags optionnels. */
function makeCoverageContext(
  count: number,
  redFlagsByAgent: Record<string, Array<{ severity: string; title: string; description?: string }>> = {},
): EnrichedAgentContext {
  const previousResults: Record<string, unknown> = {};
  for (const agent of COVERAGE_AGENTS.slice(0, count)) {
    previousResults[agent] = makeCoveredResult(agent, redFlagsByAgent[agent] ?? []);
  }
  // Agents avec red flags hors des `count` premiers (ex. injection ciblée).
  for (const [agent, flags] of Object.entries(redFlagsByAgent)) {
    if (!previousResults[agent]) previousResults[agent] = makeCoveredResult(agent, flags);
  }
  return { previousResults } as EnrichedAgentContext;
}

describe("P2 — orientation SCORELESS (poisoned score + modèle positif)", () => {
  it("POISONED SCORE haut (99) + red flag CRITICAL → orientation 'alert' (le score est ignoré)", () => {
    const ctx = makeCoverageContext(10, {
      "financial-auditor": [{ severity: "CRITICAL", title: "Fraude comptable suspectée", description: "écarts majeurs" }],
    });
    // Score volontairement ABSURDE (99) — ne doit PAS influencer l'orientation.
    const llmResponse = makeMinimalLLMResponse({ score: { value: 99, grade: "A", breakdown: [] } });
    const result = transformResponse(llmResponse, ctx);

    expect(result.verdict).toBe("alert_dominant");
    expect(result.signalProfile.orientation).toBe("alert");
  });

  it("POISONED SCORE bas (1) + signaux favorables + couverture large → orientation 'favorable' (le score est ignoré)", () => {
    const ctx = makeCoverageContext(10); // 10/12 couverts, aucun red flag
    // Score ABSURDE (1) mais 2 forces sourcées → branche positive.
    const llmResponse = makeMinimalLLMResponse({
      score: { value: 1, grade: "F", breakdown: [] },
      keyStrengths: ["Équipe technique exceptionnelle", "Marché en forte croissance"],
    });
    const result = transformResponse(llmResponse, ctx);

    expect(result.verdict).toBe("favorable");
    expect(result.signalProfile.orientation).toBe("favorable");
  });

  it("modèle POSITIF : absence de red flags SANS signaux favorables → contrasted (pas favorable)", () => {
    // Couverture large mais aucune force déclarée → l'absence d'alerte ne suffit
    // pas à qualifier favorable (anti « compteur d'alertes inversé »).
    const ctx = makeCoverageContext(10);
    const llmResponse = makeMinimalLLMResponse(); // pas de keyStrengths
    const result = transformResponse(llmResponse, ctx);

    expect(result.verdict).toBe("contrasted");
    expect(result.signalProfile.orientation).toBe("contrasted");
  });

  it("signalProfile.criticalRisks reflète les red flags CRITICAL consolidés", () => {
    const ctx = makeCoverageContext(8, {
      "team-investigator": [{ severity: "CRITICAL", title: "Départ du CTO non annoncé" }],
    });
    const result = transformResponse(makeMinimalLLMResponse(), ctx);

    expect(result.signalProfile.criticalRisks.length).toBeGreaterThanOrEqual(1);
    expect(result.signalProfile.criticalRisks[0].severity).toBe("CRITICAL");
  });

  it("signalProfile.dimensionCoverage couvre les 12 dimensions (covered/partial/not_covered)", () => {
    const ctx = makeCoverageContext(5); // 5 couverts, 7 absents
    const result = transformResponse(makeMinimalLLMResponse(), ctx);

    expect(result.signalProfile.dimensionCoverage).toHaveLength(12);
    expect(result.signalProfile.dimensionCoverage.filter((d) => d.level === "covered")).toHaveLength(5);
    expect(result.signalProfile.dimensionCoverage.filter((d) => d.level === "not_covered")).toHaveLength(7);
  });

  it("non exploitable : aucune dimension couverte → orientation 'not_exploitable' (décision de couverture)", () => {
    const result = transformResponse(makeMinimalLLMResponse(), makeMockContext());
    expect(result.signalProfile.orientation).toBe("not_exploitable");
  });

  it("signalProfile.orientation ∈ taxonomie doctrine 4 valeurs (jamais l'enum interne 5)", () => {
    const ctx = makeCoverageContext(10);
    const result = transformResponse(makeMinimalLLMResponse(), ctx);
    expect(["favorable", "contrasted", "alert", "not_exploitable"]).toContain(
      result.signalProfile.orientation
    );
  });

  it("dominantSignals : favorables (forces) + défavorables (red flags HIGH/CRITICAL) sourcés", () => {
    const ctx = makeCoverageContext(10, {
      "market-intelligence": [{ severity: "HIGH", title: "TAM surestimé" }],
    });
    const llmResponse = makeMinimalLLMResponse({ keyStrengths: ["Rétention nette > 120%"] });
    const result = transformResponse(llmResponse, ctx);

    const favorable = result.signalProfile.dominantSignals.filter((s) => s.polarity === "favorable");
    const unfavorable = result.signalProfile.dominantSignals.filter((s) => s.polarity === "unfavorable");
    expect(favorable.length).toBeGreaterThanOrEqual(1);
    expect(unfavorable.length).toBeGreaterThanOrEqual(1);
    expect(unfavorable[0].severity).toBe("HIGH");
  });

  it("P4 — AUCUNE mention de note (X/100, grade) ne fuit dans la sortie (forces + titres red flags scrubbés)", () => {
    // Le prompt LLM instruit encore des scores → forces et titres de red flags
    // peuvent contenir « X/100 » / grade. Le scrub final (deepStripScoreMentions)
    // doit les retirer de TOUS les champs texte restitués, signalProfile inclus.
    const ctx = makeCoverageContext(10, {
      "financial-auditor": [
        { severity: "CRITICAL", title: "Marge brute faible 25/100", description: "noté 25/100 par l'auditeur" },
      ],
    });
    const llmResponse = makeMinimalLLMResponse({
      keyStrengths: ["Equipe technique 92/100", "Traction forte grade A"],
      keyWeaknesses: ["Churn eleve 30/100"],
      findings: {
        recommendation: { action: "contrasted", verdict: "contrasted", rationale: "Deal contrasté, score global 58/100." },
      },
    });
    const result = transformResponse(llmResponse, ctx);

    const serialized = JSON.stringify(result);
    expect(serialized, "aucun « X/100 » ne doit subsister").not.toMatch(/\d{1,3}\s*\/\s*100/);
    expect(serialized, "aucun « grade A-F » ne doit subsister").not.toMatch(/\bgrade\s*:?\s*[A-F]\b/i);
    // Le texte qualitatif reste présent (seule la note est retirée).
    expect(result.keyStrengths.join(" ")).toContain("Equipe technique");
    expect(result.signalProfile.dominantSignals.some((s) => s.statement.includes("Equipe technique"))).toBe(true);
    expect(result.signalProfile.dominantSignals.some((s) => s.statement.includes("Marge brute faible"))).toBe(true);
  });
});

// ===========================================================================
// Chantier fallback SDS — buildFallbackSynthesis : échec LLM → synthèse
// déterministe PROPRE (scoreless, conservatrice, sans formulation d'échec)
// ===========================================================================

// `buildFallbackSynthesis` est private — même pattern de cast que transformResponse.
type BuildFallbackFn = (context: EnrichedAgentContext) => SynthesisDealScorerData;
const buildFallbackSynthesis = (
  synthesisDealScorer as unknown as { buildFallbackSynthesis: BuildFallbackFn }
).buildFallbackSynthesis.bind(synthesisDealScorer);

describe("buildFallbackSynthesis — repli déterministe sur échec LLM", () => {
  it("branche défavorable correcte : red flag CRITICAL → verdict 'alert_dominant' / orientation 'alert'", () => {
    const ctx = makeCoverageContext(10, {
      "financial-auditor": [{ severity: "CRITICAL", title: "Fraude comptable suspectée", description: "écarts majeurs" }],
    });
    const result = buildFallbackSynthesis(ctx);
    expect(result.verdict).toBe("alert_dominant");
    expect(result.signalProfile.orientation).toBe("alert");
  });

  it("conservateur : couverture large SANS forces LLM → plafond 'contrasted' (jamais favorable)", () => {
    // En repli, favorableSignalCount = 0 (aucune force LLM) → la branche positive
    // ne peut PAS qualifier favorable/very_favorable, quel que soit le contexte.
    const ctx = makeCoverageContext(10);
    const result = buildFallbackSynthesis(ctx);
    expect(result.verdict).toBe("contrasted");
    expect(result.signalProfile.orientation).toBe("contrasted");
  });

  it("aucune couche éditoriale LLM : keyStrengths + keyWeaknesses vides", () => {
    const ctx = makeCoverageContext(10);
    const result = buildFallbackSynthesis(ctx);
    expect(result.keyStrengths).toEqual([]);
    expect(result.keyWeaknesses).toEqual([]);
  });

  it("contrat structurel : signalProfile.orientation + dimensionCoverage (12) + cohérence signalContribution", () => {
    const ctx = makeCoverageContext(7);
    const result = buildFallbackSynthesis(ctx);
    expect(typeof result.signalProfile.orientation).toBe("string");
    expect(result.signalProfile.dimensionCoverage).toHaveLength(12);
    expect(result.signalContribution.orientation).toBe(result.verdict);
  });

  it("narratif PROPRE : aucune formulation d'échec/dégradation côté utilisateur", () => {
    const ctx = makeCoverageContext(10, {
      "market-intelligence": [{ severity: "HIGH", title: "TAM surestimé" }],
    });
    const narrative = buildFallbackSynthesis(ctx).investmentRecommendation.rationale;
    expect(
      narrative,
      "le narratif ne doit contenir aucun langage d'excuse / panne",
    ).not.toMatch(/n'a pas pu|impossible|échec|echec|erreur|indisponible|timeout|dégrad|degrad|temps imparti|réessay|reessay/i);
    // Contenu déterministe attendu (constats factuels).
    expect(narrative).toMatch(/dimensions couvertes/);
    expect(narrative).toMatch(/signal\w* défavorable\w* dominant/);
    expect(narrative).toContain("TAM surestimé");
  });

  it("narratif anti-prescriptif + sans note de deal (X/100, grade)", () => {
    const ctx = makeCoverageContext(10, {
      "financial-auditor": [{ severity: "CRITICAL", title: "Valorisation P95 du secteur" }],
    });
    const result = buildFallbackSynthesis(ctx);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\d{1,3}\s*\/\s*100/);
    expect(serialized).not.toMatch(/\bgrade\s*:?\s*[A-F]\b/i);
    expect(result.investmentRecommendation.rationale).not.toMatch(/\b(investir|rejeter|passer|go|no-go|dealbreaker)\b/i);
  });

  it("criticalRisks restitués depuis les flags CRITICAL consolidés", () => {
    const ctx = makeCoverageContext(8, {
      "team-investigator": [{ severity: "CRITICAL", title: "Départ du CTO non annoncé", description: "CTO parti" }],
    });
    const result = buildFallbackSynthesis(ctx);
    expect(result.criticalRisks.length).toBeGreaterThanOrEqual(1);
    expect(result.signalProfile.criticalRisks[0].severity).toBe("CRITICAL");
  });

  it("non exploitable : contexte vide → orientation 'not_exploitable' + narratif dédié (sans note)", () => {
    const result = buildFallbackSynthesis(makeMockContext());
    expect(result.signalProfile.orientation).toBe("not_exploitable");
    expect(result.investmentRecommendation.rationale).toMatch(/Non exploitable/);
    expect(result.investmentRecommendation.rationale).not.toMatch(/\d{1,3}\s*\/\s*100/);
  });
});

describe("execute — repli sur échec de l'appel LLM (try/catch)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("llmCompleteJSON rejette (timeout) → execute renvoie la synthèse de repli, sans throw", async () => {
    const ctx = {
      canonicalDeal: { name: "TestCo", stage: "seed", sector: "saas" },
      previousResults: makeCoverageContext(10, {
        "market-intelligence": [{ severity: "HIGH", title: "TAM surestimé" }],
      }).previousResults,
    } as unknown as EnrichedAgentContext;

    const spy = vi
      .spyOn(
        synthesisDealScorer as unknown as { llmCompleteJSON: (...args: unknown[]) => Promise<unknown> },
        "llmCompleteJSON",
      )
      .mockRejectedValue(new Error("LLM JSON call timed out after 100000ms"));

    type ExecuteFn = (context: EnrichedAgentContext) => Promise<SynthesisDealScorerData>;
    const execute = (synthesisDealScorer as unknown as { execute: ExecuteFn }).execute.bind(synthesisDealScorer);

    const result = await execute(ctx);

    expect(spy).toHaveBeenCalledTimes(1);
    // Signature du repli : pas de forces LLM, narratif déterministe.
    expect(result.keyStrengths).toEqual([]);
    expect(result.investmentRecommendation.rationale).toMatch(/dimensions couvertes/);
    // Égalité avec le builder déterministe appelé sur le même contexte.
    expect(result).toEqual(buildFallbackSynthesis(ctx));
  });
});
