/**
 * Fintech Expert Agent
 * Specialized analysis for Fintech, Payments, and Banking deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { FINTECH_BENCHMARKS } from "./sector-benchmarks";

const FINTECH_CONFIG: SectorConfig = {
  name: "Fintech",
  emoji: "🏦",
  displayName: "Fintech Expert",
  description: "Expert in financial services, payments, and banking technology",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...FINTECH_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...FINTECH_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: FINTECH_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "Banking license / EMI license",
    "PSD2 / Open Banking regulations",
    "Anti-Money Laundering (AML)",
    "Know Your Customer (KYC)",
    "Consumer credit regulations",
    "Payment Card Industry (PCI DSS)",
    "GDPR for financial data",
    "Capital requirements (Basel III)",
    "Securities regulations (if investment products)",
  ],

  exitMultipleRange: {
    low: FINTECH_BENCHMARKS.exitMultiples.low,
    typical: FINTECH_BENCHMARKS.exitMultiples.median,
    high: FINTECH_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `Fintech-specific scoring (benchmark-anchored):
${FINTECH_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.exceptional}${m.unit}, Good ${m.direction === "lower_better" ? "≤" : "≥"}${m.thresholds.good}${m.unit}, Concerning ${m.direction === "lower_better" ? "≥" : "≤"}${m.thresholds.concerning}${m.unit}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: FINTECH_BENCHMARKS,
};

export const fintechExpert = createSectorExpert("fintech-expert", FINTECH_CONFIG);
