import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const ExitStrategistResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    scenarios: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      description: z.string(),
      probability: z.unknown(),
      timeline: z.unknown(),
      exitValuation: z.unknown(),
      potentialBuyers: z.array(z.unknown()).optional(),
      investorReturn: z.object({
        initialInvestment: z.number(),
        ownershipAtEntry: z.number(),
        dilutionToExit: z.number(),
        dilutionCalculation: z.string(),
        ownershipAtExit: z.number(),
        grossProceeds: z.number(),
        proceedsCalculation: z.string(),
        multiple: z.number(),
        irr: z.number(),
        irrCalculation: z.string(),
      }),
    })),
    comparableExits: z.array(z.unknown()),
    mnaMarket: z.unknown(),
    liquidityAnalysis: z.unknown(),
    deckClaimsAnalysis: z.unknown().optional(),
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

export type ExitStrategistResponse = z.infer<typeof ExitStrategistResponseSchema>;
