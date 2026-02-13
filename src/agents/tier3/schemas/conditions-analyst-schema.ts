import { z } from "zod";
import { Tier3MetaSchema, Tier3ScoreSchema } from "./common";

export const ConditionsAnalystResponseSchema = z.object({
  meta: Tier3MetaSchema,
  score: Tier3ScoreSchema,

  findings: z.object({
    termsSource: z.enum(["form", "term_sheet", "deck", "none"]),

    valuation: z.object({
      assessedValue: z.number().nullable(),
      percentileVsDB: z.number().min(0).max(100).nullable(),
      verdict: z.enum(["UNDERVALUED", "FAIR", "AGGRESSIVE", "VERY_AGGRESSIVE"]),
      rationale: z.string(),
      benchmarkUsed: z.string(),
    }),

    instrument: z.object({
      type: z.string().nullable(),
      assessment: z.enum(["STANDARD", "FAVORABLE", "UNFAVORABLE", "TOXIC"]),
      rationale: z.string(),
      stageAppropriate: z.boolean(),
    }),

    protections: z.object({
      overallAssessment: z.enum(["STRONG", "ADEQUATE", "WEAK", "NONE"]),
      keyProtections: z.array(z.object({
        item: z.string(),
        present: z.boolean(),
        assessment: z.string(),
      })),
      missingCritical: z.array(z.string()),
    }),

    governance: z.object({
      vestingAssessment: z.string(),
      esopAssessment: z.string(),
      overallAssessment: z.enum(["STRONG", "ADEQUATE", "WEAK", "CONCERNING"]),
    }),

    crossReferenceInsights: z.array(z.object({
      insight: z.string(),
      sourceAgent: z.string(),
      impact: z.enum(["positive", "negative", "neutral"]),
    })),

    negotiationAdvice: z.array(z.object({
      point: z.string(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
      suggestedArgument: z.string(),
      leverageSource: z.string(),
    })),
  }),

  redFlags: z.array(z.object({
    id: z.string(),
    category: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    title: z.string(),
    description: z.string(),
    evidence: z.string(),
    impact: z.string(),
    question: z.string(),
  })),

  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    context: z.string(),
    whatToLookFor: z.string(),
  })),

  narrative: z.object({
    oneLiner: z.string(),
    summary: z.string(),
    keyInsights: z.array(z.string()),
    forNegotiation: z.array(z.string()),
  }),
});

export type ConditionsAnalystResponse = z.infer<typeof ConditionsAnalystResponseSchema>;
