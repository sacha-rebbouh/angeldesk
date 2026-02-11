import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const MarketIntelligenceResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    marketSize: z.unknown().optional(),
    growthDynamics: z.unknown().optional(),
    marketTiming: z.unknown().optional(),
    regulatoryLandscape: z.unknown().optional(),
    dataCredibility: z.unknown().optional(),
  }),
  dbCrossReference: z.object({
    claims: z.array(z.object({ claim: z.string(), location: z.string(), dbVerdict: z.string(), evidence: z.string() })),
    uncheckedClaims: z.array(z.string()).optional(),
  }).optional(),
  redFlags: z.array(RedFlagSchema),
  questions: z.array(QuestionSchema),
  alertSignal: AlertSignalSchema,
  narrative: NarrativeSchema,
});

export type MarketIntelligenceResponse = z.infer<typeof MarketIntelligenceResponseSchema>;
