/**
 * Consumer Expert Agent
 * Specialized analysis for Consumer, D2C, and Social deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { CONSUMER_BENCHMARKS } from "./sector-benchmarks";

const CONSUMER_CONFIG: SectorConfig = {
  name: "Consumer",
  emoji: "📱",
  displayName: "Consumer Expert",
  description: "Expert in consumer products, D2C brands, e-commerce, and social platforms",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...CONSUMER_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...CONSUMER_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: CONSUMER_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "Consumer protection laws",
    "Product safety regulations",
    "Advertising standards (FTC guidelines)",
    "Privacy regulations (GDPR, CCPA, cookies)",
    "E-commerce regulations",
    "Food/beverage regulations (if applicable)",
    "Cosmetics/health claims regulations",
    "Children's advertising restrictions",
    "Platform-specific policies (social media TOS)",
  ],

  exitMultipleRange: {
    low: CONSUMER_BENCHMARKS.exitMultiples.low,
    typical: CONSUMER_BENCHMARKS.exitMultiples.median,
    high: CONSUMER_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Consumer-specific scoring (benchmark-anchored):
${CONSUMER_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: CONSUMER_BENCHMARKS,
};

export const consumerExpert = createSectorExpert("consumer-expert", CONSUMER_CONFIG);
