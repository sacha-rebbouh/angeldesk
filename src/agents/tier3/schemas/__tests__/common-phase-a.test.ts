/**
 * Tests Phase A — Contrats partagés natifs (slice A1, additif strict)
 *
 * Valide les nouveaux schémas Zod ajoutés dans `common.ts` :
 * - Tier3OrientationSchema (alignement ORIENTATION_VALUES UI)
 * - Tier3EvidenceSolidityEmittedSchema (D2 verrouillé : 2 valeurs)
 * - Tier3SignalContributionSchema (asymétrie + refine rationale)
 * - SourceRefSchema / ContradictionRefSchema / OpenQuestionRefSchema /
 *   CriticalRiskRefSchema / ConditionRefSchema / StructuralRiskSchema
 *
 * D1 (additif strict) : Tier3MetaSchema et Tier3ScoreSchema existants ne
 * sont pas modifiés — les anciens tests `schemas.test.ts` continuent de
 * couvrir leur validation.
 * D2 (service Solidité minimal) : EvidenceSolidity Phase A n'émet ni
 * `strong`, ni `moderate`, ni `low`. Vérifié par tests négatifs.
 */

import { describe, expect, it } from "vitest";

import {
  Tier3OrientationSchema,
  type Tier3Orientation,
  Tier3EvidenceSolidityEmittedSchema,
  type Tier3EvidenceSolidityEmitted,
  Tier3SignalContributionSchema,
  type Tier3SignalContribution,
  SourceRefSchema,
  ContradictionRefSchema,
  OpenQuestionRefSchema,
  CriticalRiskRefSchema,
  ConditionRefSchema,
  StructuralRiskSchema,
} from "../common";

import { ORIENTATION_VALUES, EVIDENCE_SOLIDITY_VALUES } from "@/lib/ui-configs";

// ============================================================================
// Tier3OrientationSchema
// ============================================================================

describe("Tier3OrientationSchema (Phase A A1)", () => {
  const ALL_ORIENTATIONS: Tier3Orientation[] = [
    "very_favorable",
    "favorable",
    "contrasted",
    "vigilance",
    "alert_dominant",
  ];

  it.each(ALL_ORIENTATIONS)("accepte la valeur canonique %s", (value) => {
    const result = Tier3OrientationSchema.safeParse(value);
    expect(result.success).toBe(true);
  });

  it("rejette une valeur hors enum", () => {
    expect(Tier3OrientationSchema.safeParse("STRONG_PASS").success).toBe(false);
    expect(Tier3OrientationSchema.safeParse("PASS").success).toBe(false);
    expect(Tier3OrientationSchema.safeParse("favorable_strong").success).toBe(false);
    expect(Tier3OrientationSchema.safeParse("").success).toBe(false);
    expect(Tier3OrientationSchema.safeParse(null).success).toBe(false);
    expect(Tier3OrientationSchema.safeParse(undefined).success).toBe(false);
  });

  it("est aligné EXACTEMENT sur ORIENTATION_VALUES de ui-configs.ts (Phase 2 commit 3be0a39)", () => {
    // Cohérence cross-layer : si ui-configs change, ce test échoue et force
    // la mise à jour cohérente du schéma agent.
    const uiSorted = [...ORIENTATION_VALUES].sort();
    const schemaSorted = [...ALL_ORIENTATIONS].sort();
    expect(schemaSorted).toEqual(uiSorted);
  });
});

// ============================================================================
// Tier3EvidenceSolidityEmittedSchema (D2 verrouillé)
// ============================================================================

describe("Tier3EvidenceSolidityEmittedSchema (Phase A A1, D2 verrouillé)", () => {
  const EMITTED: Tier3EvidenceSolidityEmitted[] = ["contradictory", "insufficient"];

  it.each(EMITTED)("accepte la valeur émissible %s", (value) => {
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse(value).success).toBe(true);
  });

  it("REJETTE `strong` (D2 : non émis en Phase A)", () => {
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse("strong").success).toBe(false);
  });

  it("REJETTE `moderate` (D2 : non émis en Phase A)", () => {
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse("moderate").success).toBe(false);
  });

  it("REJETTE `low` (D2 : non émis en Phase A)", () => {
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse("low").success).toBe(false);
  });

  it("REJETTE les valeurs hors enum (autres, vides, null)", () => {
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse("STRONG").success).toBe(false);
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse("").success).toBe(false);
    expect(Tier3EvidenceSolidityEmittedSchema.safeParse(null).success).toBe(false);
  });

  it("est un strict sous-ensemble de EVIDENCE_SOLIDITY_VALUES de ui-configs.ts", () => {
    // Cohérence UI : les valeurs Phase A émises doivent toutes être affichables
    // par l'UI. EVIDENCE_SOLIDITY_VALUES contient les 5 valeurs (Phase 2) ;
    // Phase A en émet 2.
    for (const emitted of EMITTED) {
      expect(EVIDENCE_SOLIDITY_VALUES as readonly string[]).toContain(emitted);
    }
    // Vérification du strict sous-ensemble : les 2 émis sont inclus, et il reste
    // 3 valeurs UI non émises en Phase A (strong, moderate, low).
    expect(EVIDENCE_SOLIDITY_VALUES.length).toBeGreaterThan(EMITTED.length);
  });
});

// ============================================================================
// Tier3SignalContributionSchema (asymétrie + refine)
// ============================================================================

describe("Tier3SignalContributionSchema (Phase A A1)", () => {
  it("accepte un contribution minimal : orientation + evidenceSolidity null", () => {
    const input: Tier3SignalContribution = {
      orientation: "vigilance",
      evidenceSolidity: null,
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(true);
  });

  it("accepte un contribution complet : orientation + evidenceSolidity qualifiée + rationale", () => {
    const input: Tier3SignalContribution = {
      orientation: "alert_dominant",
      evidenceSolidity: "contradictory",
      evidenceSolidityRationale: "2 contradictions critiques entre deck et déclarations fondateur",
      score: 35,
      scoreNote: "computed_from_dimensions",
      contradictions: [
        {
          contradictionId: "C-1",
          severity: "CRITICAL",
          summary: "ARR deck 2.5M€ vs founder 1.8M€",
        },
      ],
      openQuestions: [
        {
          questionId: "Q-1",
          question: "Source exacte du chiffre ARR 2.5M€ ?",
          priority: "CRITICAL",
        },
      ],
      criticalRisks: [
        {
          riskId: "R-1",
          severity: "CRITICAL",
          description: "Discordance financière non résolue",
        },
      ],
      conditionsToExamine: [
        {
          conditionId: "Cond-1",
          description: "Audit financier indépendant requis",
        },
      ],
      evidenceSources: [
        {
          sourceId: "doc-deck-1",
          sourceType: "slide",
          location: "slide 14",
        },
      ],
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(true);
  });

  it("orientation est OBLIGATOIRE (rejet si absente)", () => {
    const result = Tier3SignalContributionSchema.safeParse({
      evidenceSolidity: null,
    });
    expect(result.success).toBe(false);
  });

  it("REJETTE evidenceSolidity qualifiée sans rationale (D2 refine)", () => {
    const input = {
      orientation: "contrasted",
      evidenceSolidity: "insufficient",
      // pas de evidenceSolidityRationale
    };
    const result = Tier3SignalContributionSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/evidenceSolidityRationale/);
    }
  });

  it("REJETTE evidenceSolidity qualifiée avec rationale vide", () => {
    const input = {
      orientation: "contrasted",
      evidenceSolidity: "insufficient",
      evidenceSolidityRationale: "",
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(false);
  });

  it("ACCEPTE evidenceSolidity null sans rationale", () => {
    const input = {
      orientation: "favorable",
      evidenceSolidity: null,
      // pas de rationale → OK car evidenceSolidity null
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(true);
  });

  it("ACCEPTE champ evidenceSolidity absent (undefined ≡ null pour 'non qualifié')", () => {
    // Régression du bug Codex audit A1 : `.nullable()` seul rejette le champ
    // absent. Le contrat dit "null/undefined = non qualifié". L'asymétrie
    // doit accepter les deux.
    const input = {
      orientation: "vigilance",
      // pas de evidenceSolidity du tout → OK
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(true);
  });

  it("ACCEPTE champ evidenceSolidity absent même sans rationale", () => {
    const input = {
      orientation: "alert_dominant",
      // ni evidenceSolidity ni rationale → OK (champ absent = non qualifié)
    };
    expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(true);
  });

  it("REJETTE evidenceSolidity qualifiée avec rationale whitespace-only (trim)", () => {
    // Trim côté refine : "   " (espaces) ou "\n\t" (tabulations) ne comptent
    // pas comme rationale valide.
    for (const whitespace of ["   ", "\n", "\t", " \n\t "]) {
      const input = {
        orientation: "contrasted",
        evidenceSolidity: "insufficient",
        evidenceSolidityRationale: whitespace,
      };
      expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(false);
    }
  });

  it("REJETTE evidenceSolidity = strong/moderate/low (D2 sous-ensemble)", () => {
    for (const banned of ["strong", "moderate", "low"]) {
      const input = {
        orientation: "favorable",
        evidenceSolidity: banned,
        evidenceSolidityRationale: "test rationale",
      };
      expect(Tier3SignalContributionSchema.safeParse(input).success).toBe(false);
    }
  });

  it("score reste optionnel et borné [0, 100]", () => {
    const okMin = Tier3SignalContributionSchema.safeParse({
      orientation: "favorable",
      evidenceSolidity: null,
      score: 0,
    });
    const okMax = Tier3SignalContributionSchema.safeParse({
      orientation: "favorable",
      evidenceSolidity: null,
      score: 100,
    });
    const tooHigh = Tier3SignalContributionSchema.safeParse({
      orientation: "favorable",
      evidenceSolidity: null,
      score: 150,
    });
    const negative = Tier3SignalContributionSchema.safeParse({
      orientation: "favorable",
      evidenceSolidity: null,
      score: -5,
    });
    expect(okMin.success).toBe(true);
    expect(okMax.success).toBe(true);
    expect(tooHigh.success).toBe(false);
    expect(negative.success).toBe(false);
  });
});

// ============================================================================
// Refs schemas (SourceRef, ContradictionRef, etc.) — sanity tests
// ============================================================================

describe("Refs schemas Phase A A1", () => {
  it("SourceRefSchema accepte un ref minimal valide", () => {
    expect(
      SourceRefSchema.safeParse({
        sourceId: "doc-1",
        sourceType: "document",
      }).success
    ).toBe(true);
  });

  it("SourceRefSchema rejette un sourceId vide", () => {
    expect(
      SourceRefSchema.safeParse({
        sourceId: "",
        sourceType: "document",
      }).success
    ).toBe(false);
  });

  it("SourceRefSchema rejette un sourceType hors enum", () => {
    expect(
      SourceRefSchema.safeParse({
        sourceId: "doc-1",
        sourceType: "unknown_type",
      }).success
    ).toBe(false);
  });

  it("ContradictionRefSchema accepte un ref valide", () => {
    expect(
      ContradictionRefSchema.safeParse({
        contradictionId: "C-1",
        severity: "HIGH",
        summary: "Désaccord ARR deck vs founder",
        agents: ["financial-auditor", "deck-forensics"],
      }).success
    ).toBe(true);
  });

  it("ContradictionRefSchema rejette une sévérité hors enum", () => {
    expect(
      ContradictionRefSchema.safeParse({
        contradictionId: "C-1",
        severity: "LOW",
        summary: "test",
      }).success
    ).toBe(false);
  });

  it("OpenQuestionRefSchema accepte les 4 priorités", () => {
    for (const priority of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      expect(
        OpenQuestionRefSchema.safeParse({
          questionId: "Q-1",
          question: "test ?",
          priority,
        }).success
      ).toBe(true);
    }
  });

  it("CriticalRiskRefSchema accepte les 3 sévérités CRITICAL/HIGH/MEDIUM", () => {
    for (const severity of ["CRITICAL", "HIGH", "MEDIUM"] as const) {
      expect(
        CriticalRiskRefSchema.safeParse({
          riskId: "R-1",
          severity,
          description: "test risk",
        }).success
      ).toBe(true);
    }
  });

  it("ConditionRefSchema accepte ref minimal sans priorité", () => {
    expect(
      ConditionRefSchema.safeParse({
        conditionId: "Cond-1",
        description: "Audit indépendant requis",
      }).success
    ).toBe(true);
  });

  it("StructuralRiskSchema accepte les 8 catégories", () => {
    for (const category of [
      "team",
      "market",
      "product",
      "financials",
      "competition",
      "timing",
      "structural",
      "other",
    ] as const) {
      expect(
        StructuralRiskSchema.safeParse({
          riskId: "SR-1",
          severity: "HIGH",
          category,
          description: "risk description",
        }).success
      ).toBe(true);
    }
  });

  it("StructuralRiskSchema rejette une catégorie hors enum", () => {
    expect(
      StructuralRiskSchema.safeParse({
        riskId: "SR-1",
        severity: "HIGH",
        category: "unknown_category",
        description: "test",
      }).success
    ).toBe(false);
  });
});

// ============================================================================
// Additif strict — anciens schémas inchangés (sanity)
// ============================================================================

describe("Additif strict A1 — Tier3MetaSchema + Tier3ScoreSchema intacts", () => {
  it("import des nouveaux schémas n'a pas cassé les anciens (Tier3MetaSchema importable)", async () => {
    const { Tier3MetaSchema, Tier3ScoreSchema } = await import("../common");
    expect(Tier3MetaSchema).toBeDefined();
    expect(Tier3ScoreSchema).toBeDefined();
  });

  it("Tier3MetaSchema accepte toujours sa forme historique", async () => {
    const { Tier3MetaSchema } = await import("../common");
    expect(
      Tier3MetaSchema.safeParse({
        dataCompleteness: "partial",
        confidenceLevel: 75,
        limitations: ["pas d'audit"],
      }).success
    ).toBe(true);
  });
});
