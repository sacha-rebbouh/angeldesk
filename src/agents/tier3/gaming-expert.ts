/**
 * Gaming Expert Agent
 * Specialized analysis for Gaming, Esports, and Metaverse deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { GAMING_BENCHMARKS } from "./sector-benchmarks";

const GAMING_CONFIG: SectorConfig = {
  name: "Gaming",
  emoji: "🎮",
  displayName: "Gaming Expert",
  description: "Expert in gaming, esports, metaverse, and interactive entertainment",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...GAMING_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...GAMING_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: GAMING_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "Age ratings (PEGI, ESRB)",
    "Loot box regulations (gambling laws in some jurisdictions)",
    "COPPA (children's online privacy)",
    "In-app purchase regulations",
    "Platform store policies (Apple, Google, Steam)",
    "Esports gambling regulations",
    "Virtual currency/token regulations",
    "Data privacy (GDPR, CCPA)",
  ],

  exitMultipleRange: {
    low: GAMING_BENCHMARKS.exitMultiples.low,
    typical: GAMING_BENCHMARKS.exitMultiples.median,
    high: GAMING_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Gaming-specific scoring (benchmark-anchored):
${GAMING_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: GAMING_BENCHMARKS,
};

export const gamingExpert = createSectorExpert("gaming-expert", GAMING_CONFIG);
