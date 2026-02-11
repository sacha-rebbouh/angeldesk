import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const CompetitiveIntelResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    competitors: z.array(z.unknown()),
    moatAnalysis: z.unknown().optional(),
    competitivePositioning: z.unknown().optional(),
    marketStructure: z.unknown().optional(),
    competitorsMissedInDeck: z.array(z.string()).optional(),
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

export type CompetitiveIntelResponse = z.infer<typeof CompetitiveIntelResponseSchema>;
