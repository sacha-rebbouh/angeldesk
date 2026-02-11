import { z } from "zod";
import { Tier3MetaSchema } from "./common";

export const SynthesisDealScorerResponseSchema = z.object({
  meta: Tier3MetaSchema,
  overallScore: z.number().min(0).max(100),
  verdict: z.enum(["STRONG_PASS", "PASS", "CONDITIONAL_PASS", "WEAK_PASS", "FAIL"]),
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
    action: z.string(),
    conditions: z.array(z.string()),
    nextSteps: z.array(z.string()),
  }),
});

export type SynthesisDealScorerResponse = z.infer<typeof SynthesisDealScorerResponseSchema>;
