/**
 * DeepTech Expert Agent
 * Specialized analysis for DeepTech, AI/ML, and frontier technology deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { DEEPTECH_BENCHMARKS } from "./sector-benchmarks";

const DEEPTECH_CONFIG: SectorConfig = {
  name: "DeepTech",
  emoji: "🔬",
  displayName: "DeepTech Expert",
  description: "Expert in AI/ML, quantum computing, blockchain, and frontier technologies",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...DEEPTECH_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...DEEPTECH_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: DEEPTECH_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "AI Act (EU) - risk classification",
    "Data protection (GDPR, CCPA) for training data",
    "Export controls (certain AI technologies)",
    "Securities regulations (if tokens involved)",
    "Algorithmic accountability requirements",
    "Sector-specific AI regulations (healthcare, finance)",
    "IP and patent regulations",
  ],

  exitMultipleRange: {
    low: DEEPTECH_BENCHMARKS.exitMultiples.low,
    typical: DEEPTECH_BENCHMARKS.exitMultiples.median,
    high: DEEPTECH_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `DeepTech-specific scoring (benchmark-anchored):
${DEEPTECH_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: DEEPTECH_BENCHMARKS,
};

export const deeptechExpert = createSectorExpert("deeptech-expert", DEEPTECH_CONFIG);
