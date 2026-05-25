import { z } from "zod";

export const DataReliabilityEnum = z.enum([
  "AUDITED", "VERIFIED", "DECLARED", "PROJECTED", "ESTIMATED", "UNVERIFIABLE"
]);

export const RedFlagSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  title: z.string(),
  description: z.string(),
  location: z.string().optional(),
  evidence: z.string().optional(),
  impact: z.string().optional(),
  question: z.string().optional(),
});

export const QuestionSchema = z.object({
  question: z.string(),
  priority: z.enum(["critical", "high", "medium", "CRITICAL", "HIGH", "MEDIUM"]).optional(),
  context: z.string().optional(),
  category: z.string().optional(),
  whatToLookFor: z.string().optional(),
});

export const MetaSchema = z.object({
  dataCompleteness: z.enum(["complete", "partial", "minimal"]),
  confidenceLevel: z.number().min(0).max(100),
  limitations: z.array(z.string()),
});

export const ScoreBreakdownItemSchema = z.object({
  criterion: z.string(),
  weight: z.number(),
  score: z.number().min(0).max(100),
  justification: z.string(),
});

export const ScoreSchema = z.object({
  value: z.number().min(0).max(100),
  breakdown: z.array(ScoreBreakdownItemSchema),
});

export const AlertSignalSchema = z.object({
  hasBlocker: z.boolean(),
  blockerReason: z.preprocess(
    (value) => value ?? undefined,
    z.string().optional()
  ),
  // Phase A slice A7b-2 — `recommendation` rendu optionnel en input LLM.
  // Le prompt Tier 1 ne demande plus ce champ : il est dérivé déterministe
  // runtime via `signalIntensityToRecommendation(signalIntensity)`. Le
  // contrat global `AgentAlertSignal` (output cross-agent) conserve
  // `recommendation` requis — c'est le runtime qui le remplit. La valeur
  // legacy reste acceptée si le LLM la renvoie (parser tolérant lecture
  // seule), mais elle est ignorée par le pipeline.
  recommendation: z.enum(["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"]).optional(),
  justification: z.string(),
});

export const NarrativeSchema = z.object({
  oneLiner: z.string(),
  summary: z.string(),
  keyInsights: z.array(z.string()),
  forNegotiation: z.array(z.string()),
});
