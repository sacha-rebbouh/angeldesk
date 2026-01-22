/**
 * Marketplace Expert Agent
 * Specialized analysis for Marketplace and Platform deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { MARKETPLACE_BENCHMARKS } from "./sector-benchmarks";

const MARKETPLACE_CONFIG: SectorConfig = {
  name: "Marketplace",
  emoji: "🛒",
  displayName: "Marketplace Expert",
  description: "Expert in two-sided marketplaces, platforms, and network effects",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...MARKETPLACE_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...MARKETPLACE_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: MARKETPLACE_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "Consumer protection laws",
    "Payment services regulations",
    "Data protection (GDPR/CCPA)",
    "Platform liability (DSA in EU)",
    "Competition/antitrust (if dominant)",
    "Sector-specific (real estate, labor, etc.)",
  ],

  exitMultipleRange: {
    low: MARKETPLACE_BENCHMARKS.exitMultiples.low,
    typical: MARKETPLACE_BENCHMARKS.exitMultiples.median,
    high: MARKETPLACE_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Marketplace-specific scoring (benchmark-anchored):
${MARKETPLACE_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit === "%" ? "%" : m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit === "%" ? "%" : m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: MARKETPLACE_BENCHMARKS,
};

export const marketplaceExpert = createSectorExpert("marketplace-expert", MARKETPLACE_CONFIG);
