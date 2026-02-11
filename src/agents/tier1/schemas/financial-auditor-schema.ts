import { z } from "zod";
import {
  DataReliabilityEnum,
  RedFlagSchema,
  QuestionSchema,
  MetaSchema,
  ScoreSchema,
  AlertSignalSchema,
  NarrativeSchema,
} from "./common";

const MetricSchema = z.object({
  metric: z.string(),
  status: z.enum(["available", "missing", "suspicious"]),
  reportedValue: z.number().optional(),
  calculatedValue: z.number().optional(),
  calculation: z.string().optional(),
  benchmarkP25: z.number().optional(),
  benchmarkMedian: z.number().optional(),
  benchmarkP75: z.number().optional(),
  percentile: z.number().min(0).max(100).optional(),
  assessment: z.string(),
  source: z.string(),
  dataReliability: DataReliabilityEnum.optional(),
});

export const FinancialAuditResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    metrics: z.array(MetricSchema),
    projections: z.unknown().optional(),
    valuation: z.unknown().optional(),
    unitEconomics: z.unknown().optional(),
    burn: z.unknown().optional(),
  }),
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(),
      location: z.string(),
      dbVerdict: z.string(),
      evidence: z.string(),
    })),
    uncheckedClaims: z.array(z.string()).optional(),
  }).optional(),
  redFlags: z.array(RedFlagSchema),
  questions: z.array(QuestionSchema),
  alertSignal: AlertSignalSchema,
  narrative: NarrativeSchema,
});

export type FinancialAuditResponse = z.infer<typeof FinancialAuditResponseSchema>;
