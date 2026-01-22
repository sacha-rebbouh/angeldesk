/**
 * SaaS Expert Agent
 * Specialized analysis for SaaS and B2B Software deals
 * Enhanced with structured benchmarks from sector-benchmarks.ts
 */

import { createSectorExpert, type SectorConfig } from "./base-sector-expert";
import { SAAS_BENCHMARKS } from "./sector-benchmarks";

const SAAS_CONFIG: SectorConfig = {
  name: "SaaS",
  emoji: "💻",
  displayName: "SaaS Expert",
  description: "Expert in B2B SaaS metrics, unit economics, and growth patterns",

  // Metrics derived from structured benchmarks
  keyMetrics: [
    ...SAAS_BENCHMARKS.primaryMetrics.map(m => m.name),
    ...SAAS_BENCHMARKS.secondaryMetrics.map(m => m.name),
  ],

  typicalRedFlags: SAAS_BENCHMARKS.redFlagRules.map(r =>
    `${r.metric} ${r.condition} ${r.threshold}: ${r.reason}`
  ),

  keyRegulations: [
    "GDPR (EU data protection)",
    "SOC 2 Type II (security compliance)",
    "HIPAA (if healthcare adjacent)",
    "CCPA (California consumer privacy)",
    "ISO 27001 (information security)",
  ],

  exitMultipleRange: {
    low: SAAS_BENCHMARKS.exitMultiples.low,
    typical: SAAS_BENCHMARKS.exitMultiples.median,
    high: SAAS_BENCHMARKS.exitMultiples.high,
  },

  scoringCriteria: `SaaS-specific scoring (benchmark-anchored):
${SAAS_BENCHMARKS.primaryMetrics.map(m =>
  `- ${m.name}: Exceptional ≥${m.thresholds.exceptional}${m.unit === "%" ? "%" : ""}, Good ≥${m.thresholds.good}${m.unit === "%" ? "%" : ""}, Concerning ≤${m.thresholds.concerning}${m.unit === "%" ? "%" : ""}`
).join("\n")}`,

  // Link to structured benchmark data
  benchmarkData: SAAS_BENCHMARKS,
};

export const saasExpert = createSectorExpert("saas-expert", SAAS_CONFIG);
