import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const LegalRegulatoryResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    structureAnalysis: z.object({
      entityType: z.string(),
      jurisdiction: z.string(),
      appropriateness: z.enum(["APPROPRIATE", "SUBOPTIMAL", "CONCERNING", "UNKNOWN"]),
      concerns: z.array(z.string()),
      recommendations: z.array(z.string()),
      vestingInPlace: z.boolean(),
      vestingDetails: z.string().optional(),
      shareholderAgreement: z.enum(["YES", "NO", "UNKNOWN"]),
      shareholderConcerns: z.array(z.string()),
    }),
    compliance: z.array(z.object({
      area: z.string(),
      status: z.enum(["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "UNKNOWN"]),
      requirements: z.array(z.string()),
      gaps: z.array(z.string()),
      risk: z.enum(["HIGH", "MEDIUM", "LOW"]),
      evidence: z.string(),
    })),
    ipStatus: z.unknown(),
    regulatoryRisks: z.array(z.unknown()),
    contractualRisks: z.unknown().optional(),
    litigationRisk: z.unknown().optional(),
    sectorPrecedents: z.unknown().optional(),
    upcomingRegulations: z.array(z.unknown()).optional(),
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

export type LegalRegulatoryResponse = z.infer<typeof LegalRegulatoryResponseSchema>;
