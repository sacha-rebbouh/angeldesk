/**
 * Chantier dé-scorisation P1 — Tests de la fondation `signal-profile`.
 *
 * Couvre :
 *  1. `toDoctrineOrientation` — mapper canonique 5→4 (dont `vigilance→contrasted`
 *     et `not_exploitable` UNIQUEMENT via décision explicite, jamais un fallback).
 *  2. `scrubSynthesisScoreData` / `scrubScoresFromResults` — retrait des champs
 *     de note de deal, immutabilité, idempotence (hygiène contexte LLM).
 *  3. `readDoctrineOrientation` — bi-reader durable old/new ; durabilité
 *     old-snapshot ; PREUVE qu'aucune orientation n'est dérivée d'un score.
 */
import { describe, it, expect } from "vitest";
import { ORIENTATION_VALUES } from "@/lib/ui-configs";
import type { AgentResult } from "@/agents/types";
import {
  DOCTRINE_ORIENTATION_VALUES,
  toDoctrineOrientation,
  scrubSynthesisScoreData,
  scrubScoresFromResults,
  readDoctrineOrientation,
  type AnalysisSignalProfile,
} from "../index";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

/** Snapshot ANCIEN réaliste d'un résultat synthesis-deal-scorer (score-based). */
function makeLegacyScorerResult(verdict = "favorable"): AgentResult & { data: Record<string, unknown> } {
  return {
    agentName: "synthesis-deal-scorer",
    success: true,
    executionTimeMs: 1234,
    cost: 0.02,
    data: {
      overallScore: 82,
      grade: "B",
      verdict,
      confidence: 75,
      dimensionScores: [
        {
          dimension: "Team",
          score: 80,
          weight: 0.3,
          weightedScore: 24,
          sourceAgents: ["team-investigator"],
          keyFactors: ["fondateurs complémentaires"],
        },
      ],
      scoreBreakdown: {
        strengthsContribution: 40,
        weaknessesDeduction: -10,
        riskAdjustment: -5,
        opportunityBonus: 5,
      },
      comparativeRanking: {
        percentileOverall: 78,
        percentileSector: 70,
        percentileStage: 65,
        similarDealsAnalyzed: 12,
      },
      investmentRecommendation: { action: verdict, rationale: "Signaux globalement favorables." },
      keyStrengths: ["équipe solide"],
      keyWeaknesses: ["moat fin"],
      criticalRisks: [],
      signalContribution: { orientation: verdict, score: 82, scoreNote: "agrégé" },
    },
  };
}

function makeProfile(orientation: AnalysisSignalProfile["orientation"]): AnalysisSignalProfile {
  return {
    orientation,
    evidenceSolidity: null,
    dominantSignals: [{ polarity: "favorable", statement: "ARR x3 YoY", source: "deck p.4" }],
    dimensionCoverage: [{ dimension: "Team", level: "covered" }],
    criticalRisks: [],
  };
}

// ----------------------------------------------------------------------------
// 1. Mapper canonique 5→4
// ----------------------------------------------------------------------------

describe("toDoctrineOrientation — mapper canonique 5→4", () => {
  it("collapse very_favorable + favorable → favorable", () => {
    expect(toDoctrineOrientation("very_favorable")).toBe("favorable");
    expect(toDoctrineOrientation("favorable")).toBe("favorable");
  });

  it("collapse contrasted + vigilance → contrasted (vigilance → contrasté, PAS alerte)", () => {
    expect(toDoctrineOrientation("contrasted")).toBe("contrasted");
    expect(toDoctrineOrientation("vigilance")).toBe("contrasted");
  });

  it("alert_dominant → alert", () => {
    expect(toDoctrineOrientation("alert_dominant")).toBe("alert");
  });

  it("not_exploitable UNIQUEMENT via décision de couverture explicite", () => {
    expect(toDoctrineOrientation("favorable", { notExploitable: true })).toBe("not_exploitable");
    // override prioritaire même sur une orientation forte
    expect(toDoctrineOrientation("alert_dominant", { notExploitable: true })).toBe("not_exploitable");
    // sans le flag, jamais not_exploitable par défaut
    for (const v of ORIENTATION_VALUES) {
      expect(toDoctrineOrientation(v)).not.toBe("not_exploitable");
    }
  });

  it("toutes les 5 valeurs internes mappent vers une valeur doctrine valide (totalité)", () => {
    for (const v of ORIENTATION_VALUES) {
      expect(DOCTRINE_ORIENTATION_VALUES).toContain(toDoctrineOrientation(v));
    }
  });

  it("la taxonomie doctrine compte exactement 4 valeurs", () => {
    expect(DOCTRINE_ORIENTATION_VALUES).toEqual(["favorable", "contrasted", "alert", "not_exploitable"]);
  });

  it("lève sur une valeur d'orientation corrompue (jamais de not_exploitable flou)", () => {
    // cast volontaire : simule une donnée corrompue passée sans normalisation
    expect(() => toDoctrineOrientation("STRONG_INVEST" as never)).toThrow();
  });
});

// ----------------------------------------------------------------------------
// 2. Scrubber de note de deal
// ----------------------------------------------------------------------------

describe("scrubSynthesisScoreData — retrait de la note de deal", () => {
  it("retire les champs de note de premier niveau", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data);
    expect(out).not.toHaveProperty("overallScore");
    expect(out).not.toHaveProperty("grade");
    expect(out).not.toHaveProperty("scoreBreakdown");
    expect(out).not.toHaveProperty("score");
  });

  it("retire dimensionScores[].score/weightedScore mais garde dimension/sourceAgents/keyFactors", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data) as Record<string, unknown>;
    const dims = out.dimensionScores as Array<Record<string, unknown>>;
    expect(dims[0]).not.toHaveProperty("score");
    expect(dims[0]).not.toHaveProperty("weightedScore");
    expect(dims[0].dimension).toBe("Team");
    expect(dims[0].sourceAgents).toEqual(["team-investigator"]);
    expect(dims[0].keyFactors).toEqual(["fondateurs complémentaires"]);
  });

  it("retire les percentiles DE SCORE mais garde similarDealsAnalyzed", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data) as Record<string, unknown>;
    const cr = out.comparativeRanking as Record<string, unknown>;
    expect(cr).not.toHaveProperty("percentileOverall");
    expect(cr).not.toHaveProperty("percentileSector");
    expect(cr).not.toHaveProperty("percentileStage");
    expect(cr.similarDealsAnalyzed).toBe(12);
  });

  it("retire signalContribution.score/scoreNote mais garde orientation", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data) as Record<string, unknown>;
    const sc = out.signalContribution as Record<string, unknown>;
    expect(sc).not.toHaveProperty("score");
    expect(sc).not.toHaveProperty("scoreNote");
    expect(sc.orientation).toBe("favorable");
  });

  it("préserve l'orientation catégorielle et le contenu analytique", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data) as Record<string, unknown>;
    expect(out.verdict).toBe("favorable");
    expect((out.investmentRecommendation as Record<string, unknown>).action).toBe("favorable");
    expect(out.keyStrengths).toEqual(["équipe solide"]);
    expect(out.keyWeaknesses).toEqual(["moat fin"]);
  });

  it("doctrine invariant — la sérialisation ne contient AUCUN champ de note de deal", () => {
    const out = scrubSynthesisScoreData(makeLegacyScorerResult().data);
    const json = JSON.stringify(out);
    for (const banned of ["overallScore", "weightedScore", "scoreBreakdown", "percentileOverall", "scoreNote", '"grade"']) {
      expect(json).not.toContain(banned);
    }
  });

  it("est immutable — n'altère jamais l'entrée", () => {
    const input = makeLegacyScorerResult().data;
    scrubSynthesisScoreData(input);
    expect(input.overallScore).toBe(82);
    expect(input.grade).toBe("B");
    expect((input.dimensionScores as Array<Record<string, unknown>>)[0].score).toBe(80);
  });

  it("est idempotent", () => {
    const once = scrubSynthesisScoreData(makeLegacyScorerResult().data);
    const twice = scrubSynthesisScoreData(once);
    expect(twice).toEqual(once);
  });

  it("retourne les entrées non-objet telles quelles", () => {
    expect(scrubSynthesisScoreData(null)).toBeNull();
    expect(scrubSynthesisScoreData(undefined)).toBeUndefined();
    expect(scrubSynthesisScoreData("x")).toBe("x");
    expect(scrubSynthesisScoreData(42)).toBe(42);
  });
});

describe("scrubScoresFromResults — scrub ciblé sur la map de résultats", () => {
  it("scrub uniquement synthesis-deal-scorer, laisse les autres agents intacts (par référence)", () => {
    const devils: AgentResult & { data: unknown } = {
      agentName: "devils-advocate",
      success: true,
      executionTimeMs: 10,
      cost: 0,
      data: { overallSkepticism: 60 },
    };
    const results = {
      "synthesis-deal-scorer": makeLegacyScorerResult(),
      "devils-advocate": devils,
    } as Record<string, AgentResult>;

    const out = scrubScoresFromResults(results);
    expect((out["synthesis-deal-scorer"] as AgentResult & { data: Record<string, unknown> }).data).not.toHaveProperty(
      "overallScore"
    );
    // autre agent : référence identique préservée (non clonée, non mutée)
    expect(out["devils-advocate"]).toBe(devils);
  });

  it("retourne la map telle quelle si synthesis absent ou sans data", () => {
    const noData = { "synthesis-deal-scorer": { agentName: "synthesis-deal-scorer", success: false, executionTimeMs: 0, cost: 0 } } as Record<string, AgentResult>;
    expect(scrubScoresFromResults(noData)).toBe(noData);
    const empty = {} as Record<string, AgentResult>;
    expect(scrubScoresFromResults(empty)).toBe(empty);
  });

  it("n'altère jamais la map d'entrée", () => {
    const results = { "synthesis-deal-scorer": makeLegacyScorerResult() } as Record<string, AgentResult>;
    scrubScoresFromResults(results);
    expect((results["synthesis-deal-scorer"] as AgentResult & { data: Record<string, unknown> }).data.overallScore).toBe(82);
  });
});

// ----------------------------------------------------------------------------
// 3. Bi-reader durable old/new
// ----------------------------------------------------------------------------

describe("readDoctrineOrientation — bi-reader durable", () => {
  it("durabilité old-snapshot : verdict 5 valeurs → orientation doctrine 4 valeurs", () => {
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": makeLegacyScorerResult("favorable") })).toEqual({
      orientation: "favorable",
      source: "legacy_verdict",
    });
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": makeLegacyScorerResult("vigilance") })).toEqual({
      orientation: "contrasted",
      source: "legacy_verdict",
    });
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": makeLegacyScorerResult("alert_dominant") })).toEqual({
      orientation: "alert",
      source: "legacy_verdict",
    });
  });

  it("forme nouvelle : lit le profil scoreless quand présent", () => {
    const result: AgentResult & { data: unknown } = {
      agentName: "synthesis-deal-scorer",
      success: true,
      executionTimeMs: 1,
      cost: 0,
      data: { signalProfile: makeProfile("alert"), verdict: "favorable" },
    };
    // le profil (alert) prime sur un éventuel verdict legacy résiduel (favorable)
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": result })).toEqual({
      orientation: "alert",
      source: "profile",
    });
  });

  it("profil présent mais orientation invalide → null/source profile (pas de fallback)", () => {
    const result: AgentResult & { data: unknown } = {
      agentName: "synthesis-deal-scorer",
      success: true,
      executionTimeMs: 1,
      cost: 0,
      data: { signalProfile: { orientation: "garbage", dominantSignals: [], dimensionCoverage: [] } },
    };
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": result })).toEqual({
      orientation: null,
      source: "profile",
    });
  });

  it("NE dérive JAMAIS une orientation d'un score (score sans verdict ni profil → none)", () => {
    const result: AgentResult & { data: unknown } = {
      agentName: "synthesis-deal-scorer",
      success: true,
      executionTimeMs: 1,
      cost: 0,
      data: { overallScore: 95, grade: "A" }, // un score élevé, mais aucun verdict/profil
    };
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": result })).toEqual({
      orientation: null,
      source: "none",
    });
  });

  it("synthesis en échec, absent, ou results vide → none", () => {
    expect(
      readDoctrineOrientation({
        "synthesis-deal-scorer": { agentName: "synthesis-deal-scorer", success: false, executionTimeMs: 0, cost: 0 },
      })
    ).toEqual({ orientation: null, source: "none" });
    expect(readDoctrineOrientation({})).toEqual({ orientation: null, source: "none" });
    expect(readDoctrineOrientation(null)).toEqual({ orientation: null, source: "none" });
    expect(readDoctrineOrientation(undefined)).toEqual({ orientation: null, source: "none" });
  });

  it("verdict legacy corrompu → none (pas de legacy_verdict avec une valeur invalide)", () => {
    const result: AgentResult & { data: unknown } = {
      agentName: "synthesis-deal-scorer",
      success: true,
      executionTimeMs: 1,
      cost: 0,
      data: { verdict: "STRONG_INVEST", overallScore: 90 },
    };
    expect(readDoctrineOrientation({ "synthesis-deal-scorer": result })).toEqual({
      orientation: null,
      source: "none",
    });
  });
});
