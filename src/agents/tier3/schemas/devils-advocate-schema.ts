import { z } from "zod";
import { Tier3MetaSchema } from "./common";

export const DevilsAdvocateResponseSchema = z.object({
  meta: Tier3MetaSchema,
  challenges: z.array(z.object({
    id: z.string(),
    category: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    challenge: z.string(),
    evidence: z.string(),
    counterArgument: z.string(),
    probabilityOfIssue: z.string(),
    impact: z.string(),
    mitigation: z.string().optional(),
    questionForFounder: z.string(),
  })),
  blindSpots: z.array(z.object({
    area: z.string(),
    risk: z.string(),
    whyMissed: z.string(),
  })),
  stressTests: z.array(z.unknown()).optional(),
  overallAssessment: z.object({
    verdict: z.string(),
    topConcerns: z.array(z.string()),
    recommendation: z.string(),
  }),
});

export type DevilsAdvocateResponse = z.infer<typeof DevilsAdvocateResponseSchema>;
