/**
 * F82: Parametric red flag thresholds by stage and sector.
 * Each threshold includes a justification reference.
 */

export interface StageThresholds {
  stage: string;
  growthRateYoY: { warning: number; critical: number; reference: string };
  burnMultiple: { warning: number; critical: number; reference: string };
  valuationMultiple: { warning: number; critical: number; reference: string };
  runwayMonths: { warning: number; critical: number; reference: string };
}

/**
 * Thresholds by stage.
 * Sources: Carta benchmark 2024, Bessemer Cloud Index, SaaS Capital
 */
export const STAGE_THRESHOLDS: Record<string, StageThresholds> = {
  PRE_SEED: {
    stage: "PRE_SEED",
    growthRateYoY: {
      warning: 500,
      critical: 1000,
      reference: "Carta State of Private Markets Q4 2024",
    },
    burnMultiple: {
      warning: 5,
      critical: 10,
      reference: "Bessemer Efficiency Score guidelines",
    },
    valuationMultiple: {
      warning: 100,
      critical: 200,
      reference: "Carta median pre-seed valuation multiples 2024",
    },
    runwayMonths: {
      warning: 6,
      critical: 3,
      reference: "Standard VC runway guidance",
    },
  },
  SEED: {
    stage: "SEED",
    growthRateYoY: {
      warning: 300,
      critical: 500,
      reference: "SaaS Capital growth benchmarks 2024",
    },
    burnMultiple: {
      warning: 3,
      critical: 7,
      reference: "Bessemer Efficiency Score guidelines",
    },
    valuationMultiple: {
      warning: 60,
      critical: 100,
      reference: "Carta median seed valuation multiples 2024",
    },
    runwayMonths: {
      warning: 9,
      critical: 6,
      reference: "Standard VC runway guidance",
    },
  },
  SERIES_A: {
    stage: "SERIES_A",
    growthRateYoY: {
      warning: 200,
      critical: 400,
      reference: "Neeraj Agrawal T2D3 framework, Battery Ventures",
    },
    burnMultiple: {
      warning: 2,
      critical: 4,
      reference: "Bessemer Efficiency Score guidelines",
    },
    valuationMultiple: {
      warning: 40,
      critical: 80,
      reference: "Carta median Series A multiples 2024",
    },
    runwayMonths: {
      warning: 12,
      critical: 6,
      reference: "Standard VC runway guidance",
    },
  },
  SERIES_B: {
    stage: "SERIES_B",
    growthRateYoY: {
      warning: 150,
      critical: 300,
      reference: "Bessemer Cloud Index growth benchmarks",
    },
    burnMultiple: {
      warning: 1.5,
      critical: 3,
      reference: "Bessemer Efficiency Score guidelines",
    },
    valuationMultiple: {
      warning: 30,
      critical: 50,
      reference: "Carta median Series B multiples 2024",
    },
    runwayMonths: {
      warning: 18,
      critical: 12,
      reference: "Standard VC runway guidance",
    },
  },
};

/**
 * Sector adjustments (multipliers applied to stage thresholds).
 * A multiplier > 1 means the threshold is RAISED (more tolerant).
 */
export const SECTOR_ADJUSTMENTS: Record<string, {
  growthMultiplier: number;
  valuationMultiplier: number;
  reference: string;
}> = {
  "AI/ML": {
    growthMultiplier: 1.5,
    valuationMultiplier: 1.5,
    reference: "Pitchbook AI/ML valuation report 2024",
  },
  "SaaS": {
    growthMultiplier: 1.0,
    valuationMultiplier: 1.0,
    reference: "SaaS Capital benchmark baseline",
  },
  "Fintech": {
    growthMultiplier: 1.2,
    valuationMultiplier: 1.3,
    reference: "CB Insights Fintech report 2024",
  },
  "Biotech": {
    growthMultiplier: 0.5,
    valuationMultiplier: 2.0,
    reference: "Nature Biotech industry report",
  },
  "Hardware": {
    growthMultiplier: 0.7,
    valuationMultiplier: 0.7,
    reference: "Hardware Startup Handbook, HAX",
  },
  "default": {
    growthMultiplier: 1.0,
    valuationMultiplier: 1.0,
    reference: "No sector-specific adjustment",
  },
};

/**
 * Get calibrated thresholds for a deal (stage + sector).
 */
export function getCalibratedThresholds(
  stage: string,
  sector: string
): StageThresholds & { sectorAdjustment: string } {
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
  const baseThresholds = STAGE_THRESHOLDS[stageKey] ?? STAGE_THRESHOLDS["SEED"];
  const sectorAdj = SECTOR_ADJUSTMENTS[sector] ?? SECTOR_ADJUSTMENTS["default"];

  return {
    ...baseThresholds,
    growthRateYoY: {
      warning: Math.round(baseThresholds.growthRateYoY.warning * sectorAdj.growthMultiplier),
      critical: Math.round(baseThresholds.growthRateYoY.critical * sectorAdj.growthMultiplier),
      reference: `${baseThresholds.growthRateYoY.reference} (adjusted: ${sectorAdj.reference})`,
    },
    valuationMultiple: {
      warning: Math.round(baseThresholds.valuationMultiple.warning * sectorAdj.valuationMultiplier),
      critical: Math.round(baseThresholds.valuationMultiple.critical * sectorAdj.valuationMultiplier),
      reference: `${baseThresholds.valuationMultiple.reference} (adjusted: ${sectorAdj.reference})`,
    },
    sectorAdjustment: sectorAdj.reference,
  };
}

/**
 * Format thresholds for LLM prompt injection.
 */
export function formatThresholdsForPrompt(
  stage: string,
  sector: string
): string {
  const t = getCalibratedThresholds(stage, sector);
  return `
SEUILS CALIBRES (${t.stage}, secteur: ${sector}):
- Croissance YoY: warning >${t.growthRateYoY.warning}%, critique >${t.growthRateYoY.critical}% [${t.growthRateYoY.reference}]
- Burn Multiple: warning >${t.burnMultiple.warning}x, critique >${t.burnMultiple.critical}x [${t.burnMultiple.reference}]
- Multiple de valorisation: warning >${t.valuationMultiple.warning}x ARR, critique >${t.valuationMultiple.critical}x ARR [${t.valuationMultiple.reference}]
- Runway: warning <${t.runwayMonths.warning} mois, critique <${t.runwayMonths.critical} mois [${t.runwayMonths.reference}]
`.trim();
}
