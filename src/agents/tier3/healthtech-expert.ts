/**
 * HealthTech Expert Agent
 * Specialized analysis for HealthTech, MedTech, and BioTech deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { HEALTHTECH_BENCHMARKS } from "./sector-benchmarks";

const HEALTHTECH_CONFIG: SectorConfig = {
  name: "HealthTech",
  emoji: "🏥",
  displayName: "HealthTech Expert",
  description: "Expert in healthcare technology, medical devices, and digital health",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...HEALTHTECH_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...HEALTHTECH_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: HEALTHTECH_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "FDA clearance/approval (510k, PMA, De Novo)",
    "HIPAA compliance",
    "CE marking (EU medical devices)",
    "GDPR for health data",
    "Clinical trial regulations (if applicable)",
    "State-specific telehealth regulations",
    "Stark Law / Anti-Kickback (if provider relationships)",
    "Software as Medical Device (SaMD) classification",
  ],

  exitMultipleRange: {
    low: HEALTHTECH_BENCHMARKS.exitMultiples.low,
    typical: HEALTHTECH_BENCHMARKS.exitMultiples.median,
    high: HEALTHTECH_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `HealthTech-specific scoring (benchmark-anchored):
${HEALTHTECH_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: HEALTHTECH_BENCHMARKS,
};

export const healthtechExpert = createSectorExpert("healthtech-expert", HEALTHTECH_CONFIG);
