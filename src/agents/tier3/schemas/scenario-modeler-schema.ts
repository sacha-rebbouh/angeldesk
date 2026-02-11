import { z } from "zod";
import { Tier3MetaSchema } from "./common";

export const ScenarioModelerResponseSchema = z.object({
  meta: Tier3MetaSchema,
  scenarios: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["BULL", "BASE", "BEAR", "BLACK_SWAN"]),
    probability: z.number().min(0).max(100),
    description: z.string(),
    assumptions: z.array(z.string()),
    timeline: z.string(),
    financialProjection: z.unknown(),
    investorReturn: z.unknown(),
    triggers: z.array(z.string()),
    keyRisks: z.array(z.string()),
  })),
  sensitivityAnalysis: z.unknown().optional(),
  recommendation: z.object({
    bestScenario: z.string(),
    worstScenario: z.string(),
    expectedValue: z.string(),
    verdict: z.string(),
  }),
});

export type ScenarioModelerResponse = z.infer<typeof ScenarioModelerResponseSchema>;
