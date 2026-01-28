/**
 * Zod schemas for Consensus Engine LLM response validation
 */

import { z } from "zod";

// ============================================================================
// DEBATER RESPONSE
// ============================================================================

export const DebateEvidenceSchema = z.object({
  source: z.string().min(1, "Source obligatoire"),
  quote: z.string().min(1, "Quote obligatoire"),
  interpretation: z.string().min(1, "Interpretation obligatoire"),
});

export const DebateCalculationSchema = z
  .object({
    formula: z.string(),
    steps: z.array(z.string()).min(1),
    result: z.string(),
  })
  .optional();

export const DebaterResponseSchema = z.object({
  position: z.object({
    claim: z.string().min(1),
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().optional(),
  }),
  evidence: z
    .array(DebateEvidenceSchema)
    .min(1, "Au moins une preuve requise"),
  calculation: DebateCalculationSchema,
  weaknesses: z.array(z.string()),
  confidenceLevel: z.number().min(0).max(100),
  confidenceJustification: z.string().min(1),
});

export type DebaterResponse = z.infer<typeof DebaterResponseSchema>;

// ============================================================================
// ARBITRATOR RESPONSE
// ============================================================================

export const DecisiveFactorSchema = z.object({
  factor: z.string().min(1),
  source: z.string().min(1),
  weight: z.enum(["PRIMARY", "SUPPORTING"]),
});

export const RejectedFlawSchema = z.object({
  position: z.string().min(1),
  flaw: z.string().min(1),
  evidence: z.string().min(1),
});

export const VerifiableSourceSchema = z.object({
  source: z.string().min(1),
  reference: z.string().min(1),
  whatItProves: z.string().min(1),
});

export const ArbitratorResponseSchema = z.object({
  verdict: z.object({
    decision: z.enum(["POSITION_A", "POSITION_B", "SYNTHESIS", "UNRESOLVED"]),
    winner: z.string().nullable(),
    justification: z.object({
      decisiveFactors: z.array(DecisiveFactorSchema),
      rejectedPositionFlaws: z.array(RejectedFlawSchema),
    }),
  }),
  finalValue: z.object({
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().optional(),
    confidence: z.number().min(0).max(100),
    range: z
      .object({
        min: z.union([z.number(), z.string(), z.null()]),
        max: z.union([z.number(), z.string(), z.null()]),
      })
      .optional(),
    derivedFrom: z.object({
      source: z.string().min(1),
      calculation: z.string().optional(),
    }),
  }),
  baGuidance: z.object({
    oneLiner: z.string().min(1).max(200),
    canTrust: z.boolean(),
    trustLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
    whatToVerify: z.string().nullable(),
    questionForFounder: z.string().nullable(),
    verifiableSources: z.array(VerifiableSourceSchema),
  }),
  unresolvedAspects: z.array(
    z.object({
      aspect: z.string().min(1),
      reason: z.string().min(1),
      suggestedAction: z.string().min(1),
    })
  ),
});

export type ArbitratorResponse = z.infer<typeof ArbitratorResponseSchema>;

// ============================================================================
// QUICK RESOLUTION
// ============================================================================

export const QuickResolutionSchema = z.object({
  winner: z.enum(["POSITION_A", "POSITION_B", "UNRESOLVED"]),
  reason: z.string().min(1),
  finalValue: z.object({
    value: z.union([z.number(), z.string(), z.null()]),
    source: z.string().min(1),
  }),
  trustLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  baOneLiner: z.string().min(1).max(150),
});

export type QuickResolution = z.infer<typeof QuickResolutionSchema>;
