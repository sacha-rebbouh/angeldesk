import { z } from "zod";
import { MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

export const QuestionMasterResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema,
  findings: z.object({
    founderQuestions: z.array(z.object({
      id: z.string(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
      category: z.string(),
      question: z.string(),
      context: z.string(),
      whatToLookFor: z.string(),
      whyItMatters: z.string(),
      sourceAgent: z.string(),
    })),
    referenceChecks: z.array(z.unknown()),
    diligenceChecklist: z.object({
      totalItems: z.number(),
      doneItems: z.number(),
      blockedItems: z.number(),
      criticalPathItems: z.number(),
      items: z.array(z.unknown()),
    }),
    negotiationPoints: z.array(z.unknown()),
    dealbreakers: z.array(z.object({
      id: z.string(),
      severity: z.enum(["ABSOLUTE", "CONDITIONAL"]),
      condition: z.string(),
      description: z.string(),
      sourceAgent: z.string(),
      linkedRedFlags: z.array(z.string()),
      resolvable: z.boolean(),
    })),
    ddReadiness: z.unknown().optional(),
  }),
  dbCrossReference: z.object({
    claims: z.array(z.object({ claim: z.string(), location: z.string(), dbVerdict: z.string(), evidence: z.string() })),
    uncheckedClaims: z.array(z.string()).optional(),
  }).optional(),
  redFlags: z.array(z.unknown()).optional(),
  questions: z.array(z.unknown()).optional(),
  alertSignal: AlertSignalSchema,
  narrative: NarrativeSchema,
});

export type QuestionMasterResponse = z.infer<typeof QuestionMasterResponseSchema>;
