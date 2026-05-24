import { z } from "zod";
import { Tier3MetaSchema, Tier3OrientationSchema } from "./common";

/**
 * Phase A slice A2 — Schéma SDS aligné orientation native.
 *
 * D1 verrouillé :
 * - Champ top-level `orientation` typé `Tier3OrientationSchema` natif
 *   (renommé depuis l'ancien `verdict` legacy).
 * - Sous-champ `recommendation.action` typé `Tier3OrientationSchema` natif
 *   (plus de `z.string()` libre, plus de drift Phase A initial).
 * - Aucun champ `legacyVerdict` bridge, aucune émission legacy. Si une
 *   fixture brute de sortie LLM dégradée doit être testée (contenant
 *   encore `STRONG_PASS` etc.), elle l'est au niveau **input de
 *   `transformResponse`** (donnée non typée reçue du LLM avant
 *   normalisation), pas comme champ optionnel de ce schéma contractuel.
 *
 * Schéma test-only : il n'est pas importé en runtime par
 * `synthesis-deal-scorer.ts` (vérifié — seul usage dans
 * `schemas/__tests__/schemas.test.ts`).
 */
export const SynthesisDealScorerResponseSchema = z.object({
  meta: Tier3MetaSchema,
  overallScore: z.number().min(0).max(100),
  // Phase A slice A2 — Champ renommé depuis l'ancien `verdict` legacy.
  // Tier3OrientationSchema natif. Aucun bridge legacy.
  orientation: Tier3OrientationSchema,
  dimensionScores: z.array(z.object({
    dimension: z.string(),
    score: z.number().min(0).max(100),
    weight: z.number(),
    justification: z.string(),
    keyFactors: z.array(z.string()),
  })),
  investmentThesis: z.object({
    summary: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    keyRisks: z.array(z.string()),
    keyOpportunities: z.array(z.string()),
  }),
  recommendation: z.object({
    // Phase A slice A2 — D1 verrouillé : action typée orientation native
    // (anciennement `z.string()` libre, drift A2 initial corrigé).
    action: Tier3OrientationSchema,
    conditions: z.array(z.string()),
    nextSteps: z.array(z.string()),
  }),
});

export type SynthesisDealScorerResponse = z.infer<typeof SynthesisDealScorerResponseSchema>;
