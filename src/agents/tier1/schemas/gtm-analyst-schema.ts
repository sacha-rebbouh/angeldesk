import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const GTMAnalystResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    channels: z.array(z.object({
      id: z.string(),
      channel: z.string(),
      type: z.enum(["organic", "paid", "sales", "partnership", "referral", "viral"]),
      contribution: z.unknown(),
      economics: z.unknown(),
      efficiency: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
      efficiencyRationale: z.string(),
      scalability: z.unknown(),
      risks: z.array(z.string()),
      verdict: z.string(),
    })),
    channelSummary: z.object({
      primaryChannel: z.string(),
      channelDiversification: z.enum(["GOOD", "MODERATE", "POOR"]),
      diversificationRationale: z.string(),
      overallChannelHealth: z.number().min(0).max(100),
    }),
    salesMotion: z.unknown(),
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

export type GTMAnalystResponse = z.infer<typeof GTMAnalystResponseSchema>;
