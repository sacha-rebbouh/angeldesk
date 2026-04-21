import { z } from "zod";

export const ThesisVerdictSchema = z.enum([
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
]);

export const FrameworkLensAvailabilitySchema = z.enum([
  "evaluated",
  "degraded_schema_recovered",
  "degraded_chain_exhausted",
]);

export const FrameworkClaimSchema = z.object({
  claim: z.string().min(1),
  derivedFrom: z.string().min(1),
  status: z.enum(["supported", "contradicted", "unverifiable", "partial"]),
  evidence: z.string().min(1).optional(),
  concern: z.string().min(1).optional(),
});

export const FrameworkLensSchema = z.object({
  framework: z.enum(["yc", "thiel", "angel-desk"]),
  availability: FrameworkLensAvailabilitySchema.optional().default("evaluated"),
  verdict: ThesisVerdictSchema,
  confidence: z.number().min(0).max(100),
  question: z.string().min(1),
  claims: z.array(FrameworkClaimSchema),
  failures: z.array(z.string().min(1)),
  strengths: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

export const YcFrameworkLensSchema = FrameworkLensSchema.extend({
  framework: z.literal("yc"),
});

export const ThielFrameworkLensSchema = FrameworkLensSchema.extend({
  framework: z.literal("thiel"),
});

export const AngelDeskFrameworkLensSchema = FrameworkLensSchema.extend({
  framework: z.literal("angel-desk"),
});

export const LoadBearingAssumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  status: z.enum(["verified", "declared", "projected", "speculative"]),
  impact: z.string().min(1),
  validationPath: z.string().min(1),
});

export const ThesisAlertSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum([
    "why_now",
    "problem_reality",
    "solution_fit",
    "moat",
    "unit_economics",
    "path_to_exit",
    "team_dependency",
    "market_size",
    "assumption_fragile",
  ]),
  title: z.string().min(1),
  detail: z.string().min(1),
  linkedAssumptionId: z.string().min(1).optional(),
  linkedClaim: z.string().min(1).optional(),
});

export const ThesisExtractorOutputSchema = z.object({
  reformulated: z.string().min(1),
  problem: z.string().min(1),
  solution: z.string().min(1),
  whyNow: z.string().min(1),
  moat: z.string().nullable(),
  pathToExit: z.string().nullable(),
  verdict: ThesisVerdictSchema,
  confidence: z.number().min(0).max(100),
  loadBearing: z.array(LoadBearingAssumptionSchema),
  alerts: z.array(ThesisAlertSchema),
  ycLens: YcFrameworkLensSchema,
  thielLens: ThielFrameworkLensSchema,
  angelDeskLens: AngelDeskFrameworkLensSchema,
  sourceDocumentIds: z.array(z.string().min(1)),
  sourceHash: z.string().min(1),
});

export type ValidatedThesisExtractorOutput = z.infer<typeof ThesisExtractorOutputSchema>;
