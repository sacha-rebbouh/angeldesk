import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const TechOpsDDResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    productMaturity: z.unknown().optional(),
    teamCapability: z.unknown().optional(),
    security: z.unknown().optional(),
    ipProtection: z.unknown().optional(),
    technicalRisks: z.array(z.object({
      id: z.string().optional(),
      risk: z.string(),
      category: z.string(),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
      probability: z.string(),
      impact: z.string(),
      mitigation: z.string().optional(),
    })).optional(),
    sectorBenchmark: z.unknown().optional(),
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

export type TechOpsDDResponse = z.infer<typeof TechOpsDDResponseSchema>;
