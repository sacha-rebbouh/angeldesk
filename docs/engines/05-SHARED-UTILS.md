# Shared Utils - Calculs, Schemas Zod et Validation

> Derniere mise a jour: 2026-01-28 | Source: REFLEXION-CONSENSUS-ENGINES.md v3.0

---

## Table des matieres

1. [Calculs Financiers](#1-calculs-financiers)
2. [Schemas Zod - Consensus Engine](#2-schemas-zod---consensus-engine)
3. [Schemas Zod - Reflexion Engine](#3-schemas-zod---reflexion-engine)
4. [Validation LLM avec Retry](#4-validation-llm-avec-retry)
5. [Configuration des Engines](#5-configuration-des-engines)
6. [Benchmarks Sectoriels](#6-benchmarks-sectoriels)
7. [VerificationContext](#7-verificationcontext)
8. [Hierarchie des Fallbacks](#8-hierarchie-des-fallbacks)

---

## 1. Calculs Financiers

**CRITIQUE:** Les LLMs sont notoirement mauvais en arithmetique. Tout calcul DOIT etre fait en code TypeScript.

```typescript
// src/agents/orchestration/utils/financial-calculations.ts

/**
 * TOUS les calculs financiers passent par ce module.
 * Le LLM ne fait JAMAIS de calcul lui-meme.
 */

export interface CalculationResult {
  value: number;
  formula: string;
  inputs: { name: string; value: number; source: string }[];
  formatted: string;
  calculation: string; // Step-by-step pour affichage
}

// ============================================
// METRIQUES SaaS
// ============================================

export function calculateARR(mrr: number, source: string): CalculationResult {
  const arr = mrr * 12;
  return {
    value: arr,
    formula: "ARR = MRR × 12",
    inputs: [{ name: "MRR", value: mrr, source }],
    formatted: formatCurrency(arr),
    calculation: `MRR ${formatCurrency(mrr)} × 12 = ${formatCurrency(arr)}`
  };
}

export function calculateGrossMargin(
  revenue: number,
  cogs: number,
  revenueSource: string,
  cogsSource: string
): CalculationResult {
  const grossProfit = revenue - cogs;
  const margin = (grossProfit / revenue) * 100;

  return {
    value: margin,
    formula: "Gross Margin = (Revenue - COGS) / Revenue × 100",
    inputs: [
      { name: "Revenue", value: revenue, source: revenueSource },
      { name: "COGS", value: cogs, source: cogsSource }
    ],
    formatted: `${margin.toFixed(1)}%`,
    calculation: `(${formatCurrency(revenue)} - ${formatCurrency(cogs)}) / ${formatCurrency(revenue)} × 100 = ${margin.toFixed(1)}%`
  };
}

export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number,
  startSource: string,
  endSource: string
): CalculationResult {
  const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;

  return {
    value: cagr,
    formula: "CAGR = ((End Value / Start Value)^(1/Years) - 1) × 100",
    inputs: [
      { name: "Start Value", value: startValue, source: startSource },
      { name: "End Value", value: endValue, source: endSource },
      { name: "Years", value: years, source: "Periode de projection" }
    ],
    formatted: `${cagr.toFixed(1)}%`,
    calculation: `(${formatCurrency(endValue)} / ${formatCurrency(startValue)})^(1/${years}) - 1 = ${cagr.toFixed(1)}%`
  };
}

export function calculateLTVCACRatio(
  ltv: number,
  cac: number,
  ltvSource: string,
  cacSource: string
): CalculationResult {
  const ratio = ltv / cac;

  return {
    value: ratio,
    formula: "LTV/CAC = LTV / CAC",
    inputs: [
      { name: "LTV", value: ltv, source: ltvSource },
      { name: "CAC", value: cac, source: cacSource }
    ],
    formatted: `${ratio.toFixed(1)}x`,
    calculation: `${formatCurrency(ltv)} / ${formatCurrency(cac)} = ${ratio.toFixed(1)}x`
  };
}

export function calculateRuleOf40(
  revenueGrowth: number,
  profitMargin: number,
  growthSource: string,
  marginSource: string
): CalculationResult {
  const score = revenueGrowth + profitMargin;

  return {
    value: score,
    formula: "Rule of 40 = Revenue Growth % + Profit Margin %",
    inputs: [
      { name: "Revenue Growth", value: revenueGrowth, source: growthSource },
      { name: "Profit Margin", value: profitMargin, source: marginSource }
    ],
    formatted: `${score.toFixed(0)}%`,
    calculation: `${revenueGrowth.toFixed(1)}% + ${profitMargin.toFixed(1)}% = ${score.toFixed(0)}%`
  };
}

// ============================================
// COMPARAISONS
// ============================================

export function calculatePercentageDeviation(
  valueA: number,
  valueB: number
): { deviation: number; formatted: string; significant: boolean } {
  const avg = (valueA + valueB) / 2;
  const deviation = Math.abs(valueA - valueB) / avg * 100;

  return {
    deviation,
    formatted: `${deviation.toFixed(1)}%`,
    significant: deviation > 30 // Seuil de contradiction
  };
}

export function calculatePercentile(
  value: number,
  benchmarks: { p25: number; median: number; p75: number; p90?: number }
): { percentile: number; interpretation: string } {
  if (value <= benchmarks.p25) {
    return { percentile: 25 * (value / benchmarks.p25), interpretation: "Bottom quartile" };
  }
  if (value <= benchmarks.median) {
    return {
      percentile: 25 + 25 * ((value - benchmarks.p25) / (benchmarks.median - benchmarks.p25)),
      interpretation: "Below median"
    };
  }
  if (value <= benchmarks.p75) {
    return {
      percentile: 50 + 25 * ((value - benchmarks.median) / (benchmarks.p75 - benchmarks.median)),
      interpretation: "Above median"
    };
  }
  if (benchmarks.p90 && value <= benchmarks.p90) {
    return {
      percentile: 75 + 15 * ((value - benchmarks.p75) / (benchmarks.p90 - benchmarks.p75)),
      interpretation: "Top quartile"
    };
  }
  return { percentile: 95, interpretation: "Top decile" };
}

// ============================================
// HELPERS
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M€`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K€`;
  }
  return `${value.toFixed(0)}€`;
}

// ============================================
// VALIDATION
// ============================================

export function validateAndCalculate<T>(
  calculationFn: () => CalculationResult,
  validation: {
    minValue?: number;
    maxValue?: number;
    mustBePositive?: boolean;
  }
): CalculationResult | { error: string } {
  try {
    const result = calculationFn();

    if (validation.mustBePositive && result.value < 0) {
      return { error: `Resultat negatif inattendu: ${result.value}` };
    }

    if (validation.minValue !== undefined && result.value < validation.minValue) {
      return { error: `Valeur ${result.value} inferieure au minimum ${validation.minValue}` };
    }

    if (validation.maxValue !== undefined && result.value > validation.maxValue) {
      return { error: `Valeur ${result.value} superieure au maximum ${validation.maxValue}` };
    }

    return result;
  } catch (e) {
    return { error: `Erreur de calcul: ${e}` };
  }
}
```

---

## 2. Schemas Zod - Consensus Engine

```typescript
// src/agents/orchestration/schemas/consensus-schemas.ts

import { z } from "zod";

// ============================================================================
// DEBATER RESPONSE
// ============================================================================

export const DebateEvidenceSchema = z.object({
  source: z.string().min(1, "Source obligatoire"),
  quote: z.string().min(1, "Quote obligatoire"),
  interpretation: z.string().min(1, "Interpretation obligatoire"),
});

export const DebateCalculationSchema = z.object({
  formula: z.string(),
  steps: z.array(z.string()).min(1),
  result: z.string(),
}).optional();

export const DebaterResponseSchema = z.object({
  position: z.object({
    claim: z.string().min(1),
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().optional(),
  }),
  evidence: z.array(DebateEvidenceSchema).min(1, "Au moins une preuve requise"),
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
    range: z.object({
      min: z.union([z.number(), z.string(), z.null()]),
      max: z.union([z.number(), z.string(), z.null()]),
    }).optional(),
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
  unresolvedAspects: z.array(z.object({
    aspect: z.string().min(1),
    reason: z.string().min(1),
    suggestedAction: z.string().min(1),
  })),
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
```

---

## 3. Schemas Zod - Reflexion Engine

```typescript
// src/agents/orchestration/schemas/reflexion-schemas.ts

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
    verdict: z.enum(["ACCEPTABLE", "NEEDS_REVISION", "MAJOR_REVISION_REQUIRED"]),
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
  revisedOutput: z.unknown(), // Le schema de l'output de l'agent
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
```

---

## 4. Validation LLM avec Retry

```typescript
// src/agents/orchestration/utils/llm-validation.ts

import { z } from "zod";
import { complete } from "@/services/openrouter/router";

interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
}

/**
 * Call LLM and validate response with Zod schema
 * Retries up to maxRetries if validation fails
 */
export async function completAndValidate<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  options: {
    maxRetries?: number;
    complexity?: "simple" | "medium" | "complex";
    temperature?: number;
  } = {}
): Promise<ValidationResult<T>> {
  const { maxRetries = 2, complexity = "medium", temperature = 0.1 } = options;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Call LLM
      const response = await complete(
        `${systemPrompt}\n\n${userPrompt}`,
        { complexity, temperature }
      );

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = "No JSON found in response";
        continue;
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        lastError = `JSON parse error: ${e}`;
        continue;
      }

      // Validate with Zod
      const result = schema.safeParse(parsed);
      if (result.success) {
        return {
          success: true,
          data: result.data,
          retries: attempt,
        };
      } else {
        lastError = `Validation error: ${result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`;

        // If we have retries left, add error context to prompt
        if (attempt < maxRetries) {
          userPrompt += `\n\n---\nPREVIOUS RESPONSE HAD VALIDATION ERRORS:\n${lastError}\n\nPlease fix these issues and respond again with valid JSON.`;
        }
      }
    } catch (e) {
      lastError = `LLM call error: ${e}`;
    }
  }

  return {
    success: false,
    error: lastError,
    retries: maxRetries,
  };
}
```

---

## 5. Configuration des Engines

```typescript
// src/agents/orchestration/quality-config.ts

export const QUALITY_ENGINE_CONFIG = {
  // Consensus Engine
  consensus: {
    maxDebateRounds: 3,
    skipDebateConfidenceDiff: 35,      // Skip si diff > 35 points
    skipDebateMinConfidence: 80,        // Et si le plus confiant > 80%
    autoResolveMinorContradictions: true,
    minorContradictionThreshold: "MINOR",
  },

  // Reflexion Engine
  reflexion: {
    tier1ConfidenceThreshold: 70,
    tier2ConfidenceThreshold: 60,
    tier3Enabled: false,
    criticalRedFlagAlwaysReflect: true,
    batchReflexionEnabled: true,
    maxReflexionIterations: 2,
  },

  // Limites globales
  limits: {
    maxContradictionsToResolve: 10,     // Au-dela, prendre les plus severes
    maxAgentsToReflect: 8,              // Au-dela, prendre les moins confiants
    tokenBudget: 100000,                // Budget max pour les engines
  }
};
```

### Estimation des couts

```typescript
function estimateEngineCosts(
  contradictions: EnhancedContradiction[],
  agentsNeedingReflexion: string[]
): { tokens: number; usd: number } {

  let totalTokens = 0;

  // Consensus Engine
  for (const c of contradictions) {
    if (c.severity.level === "MINOR") {
      totalTokens += 0; // Auto-resolve, pas de LLM
    } else if (shouldSkipDebate(c)) {
      totalTokens += 5000; // Arbitrage direct
    } else {
      totalTokens += 15000; // Debat complet
    }
  }

  // Reflexion Engine
  totalTokens += agentsNeedingReflexion.length * 8000;

  // Cout Gemini Flash (0.075$ / 1M tokens input, 0.30$ / 1M output)
  // Estimation 60% input, 40% output
  const inputTokens = totalTokens * 0.6;
  const outputTokens = totalTokens * 0.4;
  const usd = (inputTokens * 0.000075) + (outputTokens * 0.0003);

  return { tokens: totalTokens, usd };
}
```

---

## 6. Benchmarks Sectoriels

### Types

```typescript
// src/data/sector-standards/types.ts

export interface BenchmarkSource {
  name: string;              // "OpenView SaaS Benchmarks"
  year: number;              // 2024
  url: string;               // "https://openview.com/saas-benchmarks-2024"
  publishedAt: string;       // "2024-03-15"
  methodology?: string;
  sampleSize?: number;
}

export interface BenchmarkValues {
  p10?: number;
  p25: number;
  median: number;
  p75: number;
  p90?: number;
  unit: string;              // "percent", "ratio", "months", "dollars"
}

export interface SectorStandard {
  id: string;
  metric: string;
  metricDisplayName: string;
  sector: string;
  stage: string;
  region?: string;
  values: BenchmarkValues;
  source: BenchmarkSource;
  validFrom: string;
  validUntil: string;
  status: "active" | "expiring_soon" | "expired" | "superseded";
  supersededBy?: string;
  interpretation: {
    excellent: string;
    good: string;
    concerning: string;
    problematic: string;
  };
}
```

### Fichier de Standards (exemple SaaS B2B)

```typescript
// src/data/sector-standards/saas-b2b.ts

import { SectorStandard } from "./types";

export const SAAS_B2B_STANDARDS: SectorStandard[] = [
  // ============================================
  // CROISSANCE
  // ============================================
  {
    id: "saas_b2b_seed_revenue_growth",
    metric: "revenue_growth_yoy",
    metricDisplayName: "Revenue Growth YoY",
    sector: "saas_b2b",
    stage: "seed",
    region: "global",
    values: {
      p10: 50,
      p25: 80,
      median: 120,
      p75: 180,
      p90: 250,
      unit: "percent",
    },
    source: {
      name: "OpenView 2024 SaaS Benchmarks",
      year: 2024,
      url: "https://openview.com/2024-saas-benchmarks",
      publishedAt: "2024-03-15",
      methodology: "Survey of 600+ SaaS companies, Seed to Series D",
      sampleSize: 612,
    },
    validFrom: "2024-03-15",
    validUntil: "2025-06-01",
    status: "active",
    interpretation: {
      excellent: "> 180% YoY = Top quartile, croissance exceptionnelle",
      good: "120-180% YoY = Médiane à P75, bonne trajectoire",
      concerning: "80-120% YoY = P25 à médiane, croissance modérée pour un Seed",
      problematic: "< 80% YoY = Bottom quartile, croissance insuffisante pour Seed",
    },
  },

  // ============================================
  // UNIT ECONOMICS
  // ============================================
  {
    id: "saas_b2b_seed_cac_payback",
    metric: "cac_payback_months",
    metricDisplayName: "CAC Payback Period",
    sector: "saas_b2b",
    stage: "seed",
    region: "global",
    values: {
      p25: 6,
      median: 12,
      p75: 18,
      p90: 24,
      unit: "months",
    },
    source: {
      name: "OpenView 2024 SaaS Benchmarks",
      year: 2024,
      url: "https://openview.com/2024-saas-benchmarks",
      publishedAt: "2024-03-15",
      sampleSize: 612,
    },
    validFrom: "2024-03-15",
    validUntil: "2025-06-01",
    status: "active",
    interpretation: {
      excellent: "< 6 mois = Excellent, unit economics très sains",
      good: "6-12 mois = Bon, dans la norme",
      concerning: "12-18 mois = Attention, à surveiller",
      problematic: "> 18 mois = Problématique, cash burn élevé",
    },
  },

  {
    id: "saas_b2b_seed_ltv_cac_ratio",
    metric: "ltv_cac_ratio",
    metricDisplayName: "LTV/CAC Ratio",
    sector: "saas_b2b",
    stage: "seed",
    region: "global",
    values: {
      p25: 2.0,
      median: 3.0,
      p75: 4.5,
      p90: 6.0,
      unit: "ratio",
    },
    source: {
      name: "Bessemer State of the Cloud 2024",
      year: 2024,
      url: "https://www.bvp.com/state-of-the-cloud-2024",
      publishedAt: "2024-02-01",
    },
    validFrom: "2024-02-01",
    validUntil: "2025-04-01",
    status: "active",
    interpretation: {
      excellent: "> 4.5x = Excellent, forte rentabilité client",
      good: "3-4.5x = Bon, modèle sain",
      concerning: "2-3x = Limite acceptable, optimisation nécessaire",
      problematic: "< 2x = Problématique, modèle non viable",
    },
  },

  // ============================================
  // EFFICACITÉ
  // ============================================
  {
    id: "saas_b2b_growth_rule_of_40",
    metric: "rule_of_40",
    metricDisplayName: "Rule of 40 Score",
    sector: "saas_b2b",
    stage: "growth",
    region: "global",
    values: {
      p25: 25,
      median: 40,
      p75: 55,
      p90: 70,
      unit: "percent",
    },
    source: {
      name: "Bessemer State of the Cloud 2024",
      year: 2024,
      url: "https://www.bvp.com/state-of-the-cloud-2024",
      publishedAt: "2024-02-01",
    },
    validFrom: "2024-02-01",
    validUntil: "2025-04-01",
    status: "active",
    interpretation: {
      excellent: "> 55% = Excellent, candidat IPO",
      good: "40-55% = Bon, équilibre croissance/profitabilité sain",
      concerning: "25-40% = Sous le seuil, optimisation nécessaire",
      problematic: "< 25% = Problématique, ni croissance ni profitabilité",
    },
  },

  // ... autres standards
];
```

### Index et Agregation

```typescript
// src/data/sector-standards/index.ts

import { SectorStandard } from "./types";
import { SAAS_B2B_STANDARDS } from "./saas-b2b";
import { FINTECH_STANDARDS } from "./fintech";
import { MARKETPLACE_STANDARDS } from "./marketplace";
// ... autres secteurs

// Tous les standards agrégés
export const ALL_SECTOR_STANDARDS: SectorStandard[] = [
  ...SAAS_B2B_STANDARDS,
  ...FINTECH_STANDARDS,
  ...MARKETPLACE_STANDARDS,
  // ...
];

// Index par ID pour lookup rapide
export const STANDARDS_BY_ID = new Map<string, SectorStandard>(
  ALL_SECTOR_STANDARDS.map(s => [s.id, s])
);

// Helper: trouver les standards pour un secteur/stage
export function getStandardsForContext(
  sector: string,
  stage: string,
  region?: string
): SectorStandard[] {
  return ALL_SECTOR_STANDARDS.filter(s =>
    s.sector === sector &&
    s.stage === stage &&
    (region ? s.region === region || s.region === "global" : true) &&
    s.status !== "expired" &&
    s.status !== "superseded"
  );
}

// Helper: vérifier les standards expirés
export function checkExpiredStandards(): {
  expired: SectorStandard[];
  expiringSoon: SectorStandard[];
} {
  const now = new Date();
  const inOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    expired: ALL_SECTOR_STANDARDS.filter(s => new Date(s.validUntil) < now),
    expiringSoon: ALL_SECTOR_STANDARDS.filter(s => {
      const validUntil = new Date(s.validUntil);
      return validUntil >= now && validUntil <= inOneMonth;
    }),
  };
}
```

### Injection dans les prompts

```typescript
// src/agents/orchestration/utils/benchmark-injector.ts

export function injectSectorBenchmarks(
  sector: string,
  stage: string,
  region?: string
): BenchmarkInjectionResult {
  const standards = getStandardsForContext(sector, stage, region);
  const warnings: string[] = [];

  const { expired, expiringSoon } = checkExpiredStandards();

  if (expired.length > 0) {
    warnings.push(`${expired.length} standards expires - mise a jour necessaire`);
  }

  if (standards.length === 0) {
    return {
      promptAddendum: `\n\n## BENCHMARKS SECTORIELS\nAucun benchmark disponible pour ${sector}/${stage}.`,
      warnings: [`Pas de standards pour ${sector}/${stage}`],
      standardsUsed: [],
    };
  }

  const formattedStandards = standards.map(s => ({
    metric: s.metricDisplayName,
    values: s.values,
    interpretation: s.interpretation,
    source: `${s.source.name} (${s.source.year})`,
    sourceUrl: s.source.url,
  }));

  const promptAddendum = `
## BENCHMARKS SECTORIELS (${sector} / ${stage})

Les benchmarks suivants proviennent de sources verifiables. TOUJOURS citer la source.

${JSON.stringify(formattedStandards, null, 2)}

### Comment utiliser ces benchmarks:
1. Comparer les metriques du deal aux percentiles
2. Citer la source exacte: "Selon [Source] ([Year]), le CAC Payback median est de X mois"
3. Utiliser les interpretations fournies pour contextualiser
`;

  return {
    promptAddendum,
    warnings,
    standardsUsed: standards.map(s => s.id),
  };
}
```

### Procedure de maintenance des standards

```markdown
## PROCÉDURE DE MISE À JOUR DES BENCHMARKS

### Quand mettre à jour ?
- Quand un nouveau rapport sort (OpenView, Bessemer, KeyBanc, etc.)
- Généralement Q1 de chaque année
- Alerte automatique quand `validUntil` approche

### Comment mettre à jour ?

1. Créer une PR avec les nouveaux standards:
   - Ajouter les nouveaux standards avec nouveau `validFrom`
   - Marquer les anciens comme `status: "superseded"` et `supersededBy: "new_id"`

2. Mettre à jour la source:
   - URL du nouveau rapport
   - Date de publication
   - Sample size si disponible

3. Valider:
   - Les valeurs sont-elles cohérentes avec l'année précédente ?
   - Les écarts importants sont-ils justifiés ?

4. Merger et déployer

### Qui est responsable ?
- Owner: [À définir]
- Backup: [À définir]
- Alerte Slack/email quand standards expirent
```

### Fichiers a creer pour standards

```
src/data/sector-standards/
├── types.ts                    # Types SectorStandard, BenchmarkSource
├── index.ts                    # Agrégation + helpers
├── saas-b2b.ts                 # Standards SaaS B2B
├── fintech.ts                  # Standards Fintech
├── marketplace.ts              # Standards Marketplace
├── healthtech.ts               # Standards HealthTech
├── deeptech.ts                 # Standards DeepTech
└── ... (un fichier par secteur)

src/agents/orchestration/utils/
└── benchmark-injector.ts       # Fonction d'injection dans les prompts
```

---

## 7. VerificationContext

```typescript
// src/agents/orchestration/verification-context.ts

export interface VerificationContext {
  // Documents originaux (texte extrait)
  deckExtracts?: string;
  financialModelExtracts?: string;

  // Context Engine (donnees externes)
  contextEngineData?: {
    crunchbase?: {
      companyInfo?: unknown;
      fundingHistory?: unknown;
      founders?: unknown;
    };
    dealroom?: {
      valuation?: unknown;
      competitors?: unknown;
    };
    linkedIn?: {
      founderProfiles?: unknown;
      companySize?: unknown;
    };
  };

  // Funding Database (benchmarks)
  fundingDbData?: {
    comparables?: {
      dealId: string;
      stage: string;
      sector: string;
      arrMultiple: number;
      valuation: number;
    }[];
    benchmarks?: {
      metric: string;
      p25: number;
      median: number;
      p75: number;
      sampleSize: number;
    }[];
  };
}

export async function buildVerificationContext(
  analysisId: string,
  dealId: string
): Promise<VerificationContext> {
  const [deckContent, fmContent, ceData, dbData] = await Promise.all([
    fetchDeckExtracts(dealId),
    fetchFinancialModelExtracts(dealId),
    fetchContextEngineData(dealId),
    fetchFundingDbBenchmarks(dealId),
  ]);

  return {
    deckExtracts: deckContent,
    financialModelExtracts: fmContent,
    contextEngineData: ceData,
    fundingDbData: dbData,
  };
}
```

---

## 8. Hierarchie des Fallbacks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HIERARCHIE DES FALLBACKS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  NIVEAU 1: Donnees primaires disponibles                                │
│  ─────────────────────────────────────────                              │
│  ├─ Deck avec slides numerotees ✓                                       │
│  ├─ Financial Model structure ✓                                         │
│  └─ → TRAITEMENT NORMAL                                                 │
│                                                                         │
│  NIVEAU 2: Donnees primaires partielles                                 │
│  ───────────────────────────────────────                                │
│  ├─ Deck sans numeros → References textuelles                          │
│  ├─ FM avec erreurs → Warnings + cross-check deck                       │
│  └─ → TRAITEMENT AVEC AVERTISSEMENTS                                    │
│                                                                         │
│  NIVEAU 3: Donnees primaires insuffisantes                              │
│  ─────────────────────────────────────────                              │
│  ├─ Context Engine disponible → Utiliser comme source secondaire        │
│  ├─ Funding DB disponible → Utiliser benchmarks                         │
│  └─ → TRAITEMENT DEGRADE + trustLevel=MEDIUM                            │
│                                                                         │
│  NIVEAU 4: Aucune donnee fiable                                         │
│  ────────────────────────────                                           │
│  ├─ Toutes sources < 50% confiance                                      │
│  ├─ → verdict=CANNOT_ASSESS                                             │
│  ├─ → trustLevel=LOW                                                    │
│  └─ → questionForFounder obligatoire                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Gestion deck sans slides numerotees

```typescript
interface DeckExtractionQuality {
  hasSlideNumbers: boolean;
  extractionConfidence: number;
  warnings: string[];
  fallbackReferences: boolean;
}

function adaptSourceReferences(
  quality: DeckExtractionQuality,
  systemPrompt: string
): string {
  if (!quality.hasSlideNumbers) {
    return systemPrompt.replace(
      /Slide \d+/g,
      "Section du deck"
    ) + `

## NOTE IMPORTANTE - REFERENCES DECK
Le deck analyse n'a pas de numeros de slides. Utilise des references textuelles:
- "Section 'Team'" au lieu de "Slide 5"
- "Paragraphe commencant par 'Our revenue...'" au lieu de "Slide 8"
- Cite le TEXTE EXACT entre guillemets pour permettre la verification`;
  }

  return systemPrompt;
}
```

### Edge Case: Financial Model avec formats incoherents

```typescript
interface FinancialModelQuality {
  currency: string | null;          // null si mixte ou non détecté
  dateFormat: string | null;        // null si incohérent
  hasNamedRanges: boolean;
  tabNamingConsistent: boolean;
  extractionConfidence: number;
  issues: {
    type: "mixed_currency" | "inconsistent_dates" | "missing_formulas" | "circular_refs";
    details: string;
    severity: "warning" | "error";
  }[];
}

function handleInconsistentFinancialModel(
  quality: FinancialModelQuality,
  verificationContext: VerificationContext
): VerificationContext {
  const warnings: string[] = [];

  if (quality.currency === null) {
    warnings.push("ATTENTION: Devises mixtes dans le FM - vérifier les conversions");
  }

  if (quality.extractionConfidence < 70) {
    warnings.push(`ATTENTION: Extraction FM peu fiable (${quality.extractionConfidence}%) - cross-vérifier avec le deck`);
  }

  for (const issue of quality.issues) {
    if (issue.severity === "error") {
      warnings.push(`ERREUR FM: ${issue.type} - ${issue.details}`);
    }
  }

  return {
    ...verificationContext,
    financialModelExtracts: verificationContext.financialModelExtracts
      ? `## AVERTISSEMENTS FM\n${warnings.join("\n")}\n\n${verificationContext.financialModelExtracts}`
      : undefined,
    financialModelQuality: quality
  };
}
```

---

## 9. Strategie Batch Reflexion

Traiter plusieurs agents en une seule critique:

```typescript
// Au lieu de 5 appels separes, 1 seul appel avec tous les agents
async function batchCritique(
  agents: { name: string; output: unknown; findings: ScoredFinding[] }[]
): Promise<Map<string, EnhancedCritique[]>> {

  const prompt = buildBatchCritiquePrompt(agents);
  const result = await complete(prompt, { complexity: "complex" });

  return parseBatchCritiqueResult(result);
}
```

**Economie:** ~50% sur les couts de reflexion

---

## 10. Interface EngineMetrics

```typescript
interface EngineMetrics {
  // Consensus
  contradictionsDetected: number;
  contradictionsResolved: number;
  debatesSkipped: number;
  autoResolved: number;
  averageDebateRounds: number;

  // Reflexion
  agentsReflected: number;
  totalCritiques: number;
  totalImprovements: number;
  averageConfidenceGain: number;

  // Couts
  totalTokensUsed: number;
  estimatedCostUSD: number;

  // Performance
  totalDurationMs: number;
}
```

---

## Fichiers connexes

- [01-CONSENSUS-SPEC.md](./01-CONSENSUS-SPEC.md) - Types Consensus Engine
- [03-REFLEXION-SPEC.md](./03-REFLEXION-SPEC.md) - Types Reflexion Engine
- [06-INTEGRATION-CHECKLIST.md](./06-INTEGRATION-CHECKLIST.md) - Implementation
