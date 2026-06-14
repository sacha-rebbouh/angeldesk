import { z } from "zod";
import {
  Tier3MetaSchema,
  Tier3ScoreSchema,
  Tier3SignalContributionSchema,
} from "./common";

/**
 * Phase A slice A4-bis — Schéma Conditions Analyst aligné contrat natif.
 *
 * D1 verrouillé :
 * - `signalIntensity` natif (low | elevated | high | critical) remplace la
 *   sémantique prescriptive `recommendation: PROCEED/STOP`. Dérivé
 *   déterministe par le runtime depuis severity red flags + score.
 * - `signalContribution` natif (Tier3SignalContribution A1).
 *
 * D2 verrouillé : `signalContribution.evidenceSolidity` reste nullable en
 * A4-bis (A6 qualifiera).
 *
 * Exception cross-agent documentée : `AgentAlertSignal` reste intact, sa
 * valeur est dérivée déterministe.
 *
 * `.strict()` appliqué.
 */
export const ConditionsAnalystResponseSchema = z.object({
  meta: Tier3MetaSchema,
  // Chantier P4 — conditions-analyst SCORELESS : note de deal plus produite ; OPTIONNEL pour compat (schéma hors-runtime, agent typé LLMConditionsResponse).
  score: Tier3ScoreSchema.optional(),

  findings: z.object({
    termsSource: z.enum(["form", "term_sheet", "deck", "none"]),

    // Chantier P4 — conditions-analyst SCORELESS : évaluation qualitative par
    // critère (remplace score.breakdown). criterion + justification UNIQUEMENT,
    // aucune note. Optionnel + default [] pour compat historique.
    dimensionAssessment: z.array(z.object({
      criterion: z.string(),
      justification: z.string(),
    }).strict()).optional().default([]),

    valuation: z.object({
      assessedValue: z.number().nullable(),
      percentileVsDB: z.number().min(0).max(100).nullable(),
      verdict: z.enum(["UNDERVALUED", "FAIR", "AGGRESSIVE", "VERY_AGGRESSIVE"]),
      rationale: z.string(),
      benchmarkUsed: z.string(),
    }).strict(),

    instrument: z.object({
      type: z.string().nullable(),
      assessment: z.enum(["STANDARD", "FAVORABLE", "UNFAVORABLE", "TOXIC"]),
      rationale: z.string(),
      stageAppropriate: z.boolean(),
    }).strict(),

    protections: z.object({
      overallAssessment: z.enum(["STRONG", "ADEQUATE", "WEAK", "NONE"]),
      keyProtections: z.array(z.object({
        item: z.string(),
        present: z.boolean(),
        assessment: z.string(),
      }).strict()),
      missingCritical: z.array(z.string()),
    }).strict(),

    governance: z.object({
      vestingAssessment: z.string(),
      esopAssessment: z.string(),
      overallAssessment: z.enum(["STRONG", "ADEQUATE", "WEAK", "CONCERNING"]),
    }).strict(),

    crossReferenceInsights: z.array(z.object({
      insight: z.string(),
      sourceAgent: z.string(),
      impact: z.enum(["positive", "negative", "neutral"]),
    }).strict()),

    negotiationAdvice: z.array(z.object({
      point: z.string(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
      suggestedArgument: z.string(),
      leverageSource: z.string(),
    }).strict()),

    structuredAssessment: z.object({
      overallStructureVerdict: z.string(),
      trancheAssessments: z.array(z.object({
        trancheLabel: z.string(),
        assessment: z.string(),
        risks: z.array(z.string()),
        score: z.number().min(0).max(100),
      }).strict()),
      blendedEffectiveValuation: z.number().nullable(),
      triggerRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
    }).strict().optional(),

    // Phase A slice A4-bis — Contrat natif Phase A (D1).
    signalIntensity: z.enum(["low", "elevated", "high", "critical"]),
    signalContribution: Tier3SignalContributionSchema,
  }).strict(),

  redFlags: z.array(z.object({
    id: z.string(),
    category: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    title: z.string(),
    description: z.string(),
    evidence: z.string(),
    impact: z.string(),
    question: z.string(),
  }).strict()),

  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    context: z.string(),
    whatToLookFor: z.string(),
  }).strict()),

  narrative: z.object({
    oneLiner: z.string(),
    summary: z.string(),
    keyInsights: z.array(z.string()),
    forNegotiation: z.array(z.string()),
  }).strict(),
}).strict();

export type ConditionsAnalystResponse = z.infer<typeof ConditionsAnalystResponseSchema>;
