/**
 * Climate Expert Agent
 * Specialized analysis for CleanTech, Climate, and Energy deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { CLIMATE_BENCHMARKS } from "./sector-benchmarks";

const CLIMATE_CONFIG: SectorConfig = {
  name: "Climate",
  emoji: "🌱",
  displayName: "Climate Expert",
  description: "Expert in clean technology, sustainability, and energy transition",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...CLIMATE_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...CLIMATE_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: CLIMATE_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "Carbon credit standards (Verra, Gold Standard)",
    "Renewable energy incentives (ITC, PTC)",
    "EU Taxonomy for sustainable activities",
    "Emissions reporting requirements",
    "Environmental permits and assessments",
    "Grid interconnection regulations",
    "CBAM (Carbon Border Adjustment Mechanism)",
    "Voluntary carbon market standards",
    "IRA (Inflation Reduction Act) credits",
  ],

  exitMultipleRange: {
    low: CLIMATE_BENCHMARKS.exitMultiples.low,
    typical: CLIMATE_BENCHMARKS.exitMultiples.median,
    high: CLIMATE_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Climate-specific scoring (benchmark-anchored):
${CLIMATE_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: CLIMATE_BENCHMARKS,
};

export const climateExpert = createSectorExpert("climate-expert", CLIMATE_CONFIG);
