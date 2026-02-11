import { z } from "zod";
import {
  RedFlagSchema,
  QuestionSchema,
  MetaSchema,
  ScoreSchema,
  AlertSignalSchema,
  NarrativeSchema,
  DataReliabilityEnum,
} from "./common";

const ClaimVerificationSchema = z.object({
  category: z.string(),
  claim: z.string(),
  location: z.string(),
  status: z.enum(["VERIFIED", "UNVERIFIED", "CONTRADICTED", "EXAGGERATED", "MISLEADING", "PROJECTION_AS_FACT"]),
  evidence: z.string(),
  sourceUsed: z.string(),
  investorImplication: z.string(),
  dataReliability: DataReliabilityEnum.optional(),
});

export const DeckForensicsResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    narrativeAnalysis: z.object({
      storyCoherence: z.number().min(0).max(100),
      credibilityAssessment: z.string(),
      narrativeStrengths: z.array(z.object({ point: z.string(), location: z.string() })),
      narrativeWeaknesses: z.array(z.object({ point: z.string(), location: z.string() })),
      criticalMissingInfo: z.array(z.object({ info: z.string(), whyItMatters: z.string() })),
    }),
    claimVerification: z.array(ClaimVerificationSchema),
    inconsistencies: z.array(z.object({
      issue: z.string(),
      location1: z.string(),
      location2: z.string(),
      quote1: z.string(),
      quote2: z.string(),
      severity: z.enum(["CRITICAL", "MAJOR", "MINOR"]),
      investorImplication: z.string(),
    })),
    deckQuality: z.object({
      professionalismScore: z.number().min(0).max(100),
      completenessScore: z.number().min(0).max(100),
      transparencyScore: z.number().min(0).max(100),
      issues: z.array(z.string()),
    }),
  }),
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(),
      location: z.string(),
      dbVerdict: z.string(),
      evidence: z.string(),
      severity: z.string().optional(),
    })),
    uncheckedClaims: z.array(z.string()).optional(),
  }).optional(),
  redFlags: z.array(RedFlagSchema),
  questions: z.array(QuestionSchema),
  alertSignal: AlertSignalSchema,
  narrative: NarrativeSchema,
});

export type DeckForensicsResponse = z.infer<typeof DeckForensicsResponseSchema>;
