import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const CustomerIntelResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    icp: z.object({
      description: z.string(),
      segments: z.array(z.string()),
      verticals: z.array(z.string()),
      companySize: z.string(),
      buyerPersona: z.string(),
      icpClarity: z.enum(["CLEAR", "PARTIAL", "UNCLEAR"]),
    }),
    customerBase: z.unknown(),
    claimsValidation: z.array(z.unknown()).optional(),
    retention: z.unknown(),
    pmf: z.object({
      pmfScore: z.number().min(0).max(100),
      pmfVerdict: z.enum(["STRONG", "EMERGING", "WEAK", "NOT_DEMONSTRATED"]),
      pmfJustification: z.string(),
      positiveSignals: z.array(z.unknown()),
      negativeSignals: z.array(z.unknown()),
      pmfTests: z.array(z.unknown()),
    }),
    concentration: z.unknown(),
    expansion: z.unknown().optional(),
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

export type CustomerIntelResponse = z.infer<typeof CustomerIntelResponseSchema>;
