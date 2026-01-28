/**
 * Zod schemas for Reflexion Engine LLM response validation
 */

import { z } from "zod";

// ============================================================================
// CRITIQUE RESPONSE
// ============================================================================

export const SuggestedFixSchema = z.object({
  action: z.string().min(1),
  source: z.string().optional(),
  example: z.string().optional(),
  estimatedEffort: z.enum(["TRIVIAL", "EASY", "MODERATE", "SIGNIFICANT"]),
});

export const CritiqueSchema = z.object({
  id: z.string().regex(/^CRT-\d{3}$/, "Format: CRT-001"),
  type: z.enum([
    "unsourced_claim",
    "unverifiable_calculation",
    "incomplete_red_flag",
    "missing_data_not_flagged",
    "missing_cross_reference",
    "weak_conclusion",
    "methodological_flaw",
    "inconsistency",
  ]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  location: z.object({
    section: z.string().min(1),
    quote: z.string().min(1),
  }),
  issue: z.string().min(10, "Issue trop vague"),
  standard: z.string().min(1),
  expectedBehavior: z.string().min(1),
  suggestedFix: SuggestedFixSchema,
  impactOnBA: z.string().min(1),
});

export const MissingCrossReferenceSchema = z.object({
  source: z.string().min(1),
  dataType: z.string().min(1),
  potentialValue: z.string().min(1),
});

export const CriticResponseSchema = z.object({
  critiques: z.array(CritiqueSchema),
  missingCrossReferences: z.array(MissingCrossReferenceSchema),
  overallAssessment: z.object({
    qualityScore: z.number().min(0).max(100),
    verdict: z.enum([
      "ACCEPTABLE",
      "NEEDS_REVISION",
      "MAJOR_REVISION_REQUIRED",
    ]),
    keyWeaknesses: z.array(z.string()).max(5),
    readyForBA: z.boolean(),
  }),
});

export type CriticResponse = z.infer<typeof CriticResponseSchema>;

// ============================================================================
// IMPROVEMENT RESPONSE
// ============================================================================

export const ChangeSchema = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
  type: z.enum([
    "added_source",
    "added_calculation",
    "completed_red_flag",
    "added_cross_reference",
    "clarified",
    "removed",
    "downgraded",
  ]),
});

export const CorrectionSchema = z.object({
  critiqueId: z.string().regex(/^CRT-\d{3}$/),
  status: z.enum(["FIXED", "PARTIALLY_FIXED", "CANNOT_FIX"]),
  change: ChangeSchema,
  justification: z.object({
    sourceUsed: z.string().optional(),
    calculationShown: z.string().optional(),
    crossReferenceResult: z.string().optional(),
    ifCannotFix: z.string().optional(),
  }),
  confidenceImpact: z.number().min(-50).max(50),
  qualityImpact: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export const ImproverResponseSchema = z.object({
  corrections: z.array(CorrectionSchema),
  revisedOutput: z.unknown(),
  qualityMetrics: z.object({
    originalScore: z.number().min(0).max(100),
    revisedScore: z.number().min(0).max(100),
    change: z.number(),
    readyForBA: z.boolean(),
  }),
  baNotice: z.object({
    remainingWeaknesses: z.array(z.string()),
    dataNeedsFromFounder: z.array(z.string()),
    confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  }),
});

export type ImproverResponse = z.infer<typeof ImproverResponseSchema>;
