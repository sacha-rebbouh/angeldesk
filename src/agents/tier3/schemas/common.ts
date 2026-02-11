import { z } from "zod";

export const Tier3MetaSchema = z.object({
  dataCompleteness: z.enum(["complete", "partial", "minimal"]),
  confidenceLevel: z.number().min(0).max(100),
  limitations: z.array(z.string()),
});

export const Tier3ScoreSchema = z.object({
  value: z.number().min(0).max(100),
  breakdown: z.array(z.object({
    criterion: z.string(),
    weight: z.number(),
    score: z.number().min(0).max(100),
    justification: z.string(),
  })).optional(),
});
