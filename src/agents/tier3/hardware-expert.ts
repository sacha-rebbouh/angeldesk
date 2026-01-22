/**
 * Hardware Expert Agent
 * Specialized analysis for Hardware, IoT, and Robotics deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { HARDWARE_BENCHMARKS } from "./sector-benchmarks";

const HARDWARE_CONFIG: SectorConfig = {
  name: "Hardware",
  emoji: "🏭",
  displayName: "Hardware Expert",
  description: "Expert in hardware products, IoT, robotics, and manufacturing",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...HARDWARE_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...HARDWARE_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: HARDWARE_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "FCC certification (RF devices)",
    "CE marking (EU market)",
    "UL/safety certifications",
    "RoHS/REACH compliance",
    "Product liability requirements",
    "Import/export regulations",
    "Battery regulations",
    "Wireless spectrum regulations",
    "Data privacy (if IoT/connected)",
  ],

  exitMultipleRange: {
    low: HARDWARE_BENCHMARKS.exitMultiples.low,
    typical: HARDWARE_BENCHMARKS.exitMultiples.median,
    high: HARDWARE_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Hardware-specific scoring (benchmark-anchored):
${HARDWARE_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: HARDWARE_BENCHMARKS,
};

export const hardwareExpert = createSectorExpert("hardware-expert", HARDWARE_CONFIG);
