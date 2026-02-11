import { z } from "zod";
import { Tier3MetaSchema } from "./common";

export const ContradictionDetectorResponseSchema = z.object({
  meta: Tier3MetaSchema,
  contradictions: z.array(z.object({
    id: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    type: z.string(),
    agent1: z.string(),
    claim1: z.string(),
    source1: z.string(),
    agent2: z.string(),
    claim2: z.string(),
    source2: z.string(),
    analysis: z.string(),
    impact: z.string(),
    resolution: z.string().optional(),
    questionForFounder: z.string(),
  })),
  summary: z.object({
    totalContradictions: z.number(),
    criticalCount: z.number(),
    topRisks: z.array(z.string()),
    verdict: z.string(),
  }),
});

export type ContradictionDetectorResponse = z.infer<typeof ContradictionDetectorResponseSchema>;
