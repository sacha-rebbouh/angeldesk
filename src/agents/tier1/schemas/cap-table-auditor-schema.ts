import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const CapTableAuditorResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    dataAvailability: z.object({
      capTableProvided: z.boolean(),
      termSheetProvided: z.boolean(),
      dataQuality: z.enum(["FULL", "PARTIAL", "MINIMAL", "NONE"]),
      missingCriticalInfo: z.array(z.string()),
      recommendation: z.string(),
    }),
    ownershipBreakdown: z.unknown().optional(),
    dilutionProjection: z.unknown().optional(),
    roundTerms: z.unknown().optional(),
    esopAnalysis: z.unknown().optional(),
    investorAnalysis: z.unknown().optional(),
    governanceAnalysis: z.unknown().optional(),
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

export type CapTableAuditorResponse = z.infer<typeof CapTableAuditorResponseSchema>;
