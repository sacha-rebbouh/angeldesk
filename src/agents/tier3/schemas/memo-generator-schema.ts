import { z } from "zod";
import { Tier3MetaSchema } from "./common";

export const MemoGeneratorResponseSchema = z.object({
  meta: Tier3MetaSchema,
  memo: z.object({
    title: z.string(),
    executiveSummary: z.string(),
    sections: z.array(z.object({
      title: z.string(),
      content: z.string(),
      keyPoints: z.array(z.string()),
    })),
    verdict: z.object({
      recommendation: z.string(),
      score: z.number().min(0).max(100),
      conditions: z.array(z.string()),
    }),
    appendices: z.array(z.object({
      title: z.string(),
      content: z.string(),
    })).optional(),
  }),
});

export type MemoGeneratorResponse = z.infer<typeof MemoGeneratorResponseSchema>;
