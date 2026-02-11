import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const TeamInvestigatorResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    founders: z.array(z.unknown()),
    teamComposition: z.unknown().optional(),
    keyPersonRisks: z.unknown().optional(),
    advisors: z.unknown().optional(),
    culturalSignals: z.unknown().optional(),
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

export type TeamInvestigatorResponse = z.infer<typeof TeamInvestigatorResponseSchema>;
