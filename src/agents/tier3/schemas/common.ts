import { z } from "zod";

export const Tier3MetaSchema = z.object({
  dataCompleteness: z.enum(["complete", "partial", "minimal"]),
  confidenceLevel: z.number().min(0).max(100),
  limitations: z.array(z.string()),
});

export const Tier3ScoreSchema = z.object({
  value: z.number().min(0).max(100),
  breakdown: z.array(z.object({
    criterion: z.string(),
    weight: z.number(),
    score: z.number().min(0).max(100),
    justification: z.string(),
  })).optional(),
});

// ============================================================================
// Phase A — Contrats partagés natifs (slice A1, additif strict)
// ============================================================================
// Schemas Zod pour le scoring 2 axes (Orientation × EvidenceSolidity) et les
// refs partagées (StructuralRisk, CriticalRisk, etc.) qui seront consommés
// par les agents Tier 3 modifiés en A2/A3/A4/A4-bis et par le service
// Solidité en A6.
//
// D1 verrouillé : A1 est strictement additif (aucun rename, aucun retrait,
// aucun bridge legacy).
// D2 verrouillé : EvidenceSolidity Phase A émet uniquement `contradictory`,
//   `insufficient`, ou null. Strong/moderate/low NON émis en Phase A. Aucun
//   mapping depuis score, overallScore, confidence, confidenceLevel, ou
//   auto-évaluation LLM (sera verrouillé mécaniquement côté service A6 par
//   source-guard et typage strict des inputs).
// ============================================================================

/**
 * Orientation du signal — axe 1 du scoring 2 axes.
 * Aligné sur `src/lib/ui-configs.ts` ORIENTATION_VALUES (Phase 2 commit 3be0a39).
 */
export const Tier3OrientationSchema = z.enum([
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
]);
export type Tier3Orientation = z.infer<typeof Tier3OrientationSchema>;

/**
 * Valeurs émissibles de EvidenceSolidity en Phase A (D2 verrouillé, minimal).
 * `contradictory` : contradictions critiques suffisamment établies.
 * `insufficient` : données/preuves insuffisantes pour qualifier.
 * `null` (champ optional) : solidité non qualifiable.
 *
 * Strong/moderate/low NE SONT PAS émis en Phase A. Si une extension future
 * (chantier post-Phase A) ajoute ces valeurs, ce schéma sera étendu — mais
 * pas en A1 ni en A6 Phase A.
 *
 * Note alignement UI : `src/lib/ui-configs.ts` EVIDENCE_SOLIDITY_VALUES
 * déclare les 5 valeurs (strong/moderate/low/contradictory/insufficient)
 * pour permettre à l'UI d'afficher les 5 si jamais émises. L'asymétrie
 * Phase A est portée par le contrat d'émission (ce schéma — 2 valeurs) et
 * par la nullabilité (`.nullable()` au niveau de Tier3SignalContribution).
 */
export const Tier3EvidenceSolidityEmittedSchema = z.enum([
  "contradictory",
  "insufficient",
]);
export type Tier3EvidenceSolidityEmitted = z.infer<typeof Tier3EvidenceSolidityEmittedSchema>;

/**
 * Ref vers une source de preuve (document, slide, claim, agent output).
 */
export const SourceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceType: z.enum(["document", "slide", "agent_output", "external", "founder_declaration"]),
  location: z.string().optional(), // ex: "page 4", "deck slide 12"
  description: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Ref vers une contradiction détectée (typiquement par contradiction-detector).
 */
export const ContradictionRefSchema = z.object({
  contradictionId: z.string().min(1),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  summary: z.string().min(1),
  agents: z.array(z.string()).optional(),
});
export type ContradictionRef = z.infer<typeof ContradictionRefSchema>;

/**
 * Ref vers une question ouverte / question prioritaire à investiguer.
 */
export const OpenQuestionRefSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  rationale: z.string().optional(),
});
export type OpenQuestionRef = z.infer<typeof OpenQuestionRefSchema>;

/**
 * Ref vers un risque critique identifié.
 */
export const CriticalRiskRefSchema = z.object({
  riskId: z.string().min(1),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  description: z.string().min(1),
  evidence: z.string().optional(),
  source: z.string().optional(),
});
export type CriticalRiskRef = z.infer<typeof CriticalRiskRefSchema>;

/**
 * Ref vers une condition à examiner (signal examinable, pas action prescriptive).
 */
export const ConditionRefSchema = z.object({
  conditionId: z.string().min(1),
  description: z.string().min(1),
  evidence: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
});
export type ConditionRef = z.infer<typeof ConditionRefSchema>;

/**
 * Risque structurel critique — destiné à remplacer l'ancien terme "kill reason"
 * dans le contrat de sortie de devils-advocate (cf. plan A3). Aucun usage
 * runtime en A1 (additif strict).
 */
export const StructuralRiskSchema = z.object({
  riskId: z.string().min(1),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  category: z.enum([
    "team",
    "market",
    "product",
    "financials",
    "competition",
    "timing",
    "structural",
    "other",
  ]),
  description: z.string().min(1),
  evidence: z.string().optional(),
  impact: z.string().optional(),
  source: z.string().optional(),
  question: z.string().optional(),
});
export type StructuralRisk = z.infer<typeof StructuralRiskSchema>;

/**
 * Tier3SignalContribution — contrat de sortie partagé par les agents Tier 3
 * modifiés en Phase A (A2/A3/A4/A4-bis).
 *
 * Asymétrie volontaire :
 * - `orientation` : OBLIGATOIRE (toujours qualifiable depuis l'analyse).
 * - `evidenceSolidity` : OPTIONNELLE et NULLABLE (D2 verrouillé — émise seulement
 *   si qualifiable par le service Solidité A6, sinon `null`).
 * - `evidenceSolidityRationale` : REQUISE quand evidenceSolidity est qualifiée
 *   (non-null), via refine. Sinon optionnelle.
 *
 * Cf. `src/components/shared/orientation-solidity-display.tsx` (Phase 2)
 * pour le comportement UI symétrique : orientation toujours affichée,
 * solidité optionnelle avec opt-in `showUnqualified` pour fallback "à qualifier".
 */
export const Tier3SignalContributionSchema = z.object({
  orientation: Tier3OrientationSchema,
  // evidenceSolidity est OPTIONNELLE ET NULLABLE — `null`, `undefined`, et
  // champ absent signifient tous "non qualifié" (D2). Le `.optional()` est
  // critique : sans lui, `{ orientation: "vigilance" }` serait rejeté.
  evidenceSolidity: Tier3EvidenceSolidityEmittedSchema.nullable().optional(),
  evidenceSolidityRationale: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  scoreNote: z.string().optional(),
  contradictions: z.array(ContradictionRefSchema).optional(),
  openQuestions: z.array(OpenQuestionRefSchema).optional(),
  criticalRisks: z.array(CriticalRiskRefSchema).optional(),
  conditionsToExamine: z.array(ConditionRefSchema).optional(),
  evidenceSources: z.array(SourceRefSchema).optional(),
}).refine(
  (data) => {
    // D2 : si evidenceSolidity est qualifiée (non-null ET non-undefined),
    // la rationale est requise (non-vide, non-whitespace-only).
    // `!= null` couvre à la fois `null` et `undefined`.
    if (data.evidenceSolidity != null && !data.evidenceSolidityRationale?.trim()) {
      return false;
    }
    return true;
  },
  {
    message:
      "evidenceSolidityRationale requise (non vide) quand evidenceSolidity est qualifiée",
    path: ["evidenceSolidityRationale"],
  }
);
export type Tier3SignalContribution = z.infer<typeof Tier3SignalContributionSchema>;
