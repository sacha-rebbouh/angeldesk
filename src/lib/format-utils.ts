/**
 * Utility functions for formatting values across the application
 */

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  "financial-auditor": "Financial Auditor",
  "team-investigator": "Team Investigator",
  "competitive-intel": "Competitive Intel",
  "deck-forensics": "Deck Forensics",
  "market-intelligence": "Market Intelligence",
  "tech-stack-dd": "Tech Stack DD",
  "tech-ops-dd": "Tech Ops DD",
  "legal-regulatory": "Legal & Regulatory",
  "cap-table-auditor": "Cap Table Auditor",
  "gtm-analyst": "GTM Analyst",
  "customer-intel": "Customer Intel",
  "exit-strategist": "Exit Strategist",
  "question-master": "Question Master",
  // Tier 2 agents
  "synthesis-deal-scorer": "Synthesis Deal Scorer",
  "scenario-modeler": "Scenario Modeler",
  "devils-advocate": "Devil's Advocate",
  "contradiction-detector": "Contradiction Detector",
  "memo-generator": "Memo Generator",
  // Tier 3 sector experts
  "saas-expert": "SaaS Expert",
  "marketplace-expert": "Marketplace Expert",
  "fintech-expert": "FinTech Expert",
  "healthtech-expert": "HealthTech Expert",
  "deeptech-expert": "DeepTech Expert",
  "climate-expert": "Climate Expert",
  "hardware-expert": "Hardware Expert",
  "gaming-expert": "Gaming Expert",
  "consumer-expert": "Consumer Expert",
  // Additional agents
  "red-flag-detector": "Red Flag Detector",
};

/**
 * Converts an agent slug (e.g., "financial-auditor") to a display name (e.g., "Financial Auditor")
 */
export function formatAgentName(slug: string): string {
  return AGENT_DISPLAY_NAMES[slug] ?? slug;
}

/**
 * Formats a number as currency (USD)
 */
export function formatCurrency(value: number, options?: {
  compact?: boolean;
  decimals?: number;
}): string {
  const { compact = false, decimals = 0 } = options ?? {};

  if (compact) {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(decimals)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(decimals)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(decimals)}K`;
    }
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formats a nullable number as EUR currency (used in deal display pages)
 */
export function formatCurrencyEUR(value: number | string | null | undefined): string {
  if (value == null) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formats a percentage value
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formats a multiple (e.g., 2.5x)
 */
export function formatMultiple(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}x`;
}

/**
 * Returns Tailwind classes for deal status badge colors
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

/**
 * Returns French label for deal status
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Pass\u00e9",
    INVESTED: "Investi",
    ARCHIVED: "Archiv\u00e9",
  };
  return labels[status] ?? status;
}

/**
 * Returns French label for deal stage
 */
export function getStageLabel(stage: string | null, fallback = "-"): string {
  if (!stage) return fallback;
  const labels: Record<string, string> = {
    PRE_SEED: "Pre-seed",
    SEED: "Seed",
    SERIES_A: "S\u00e9rie A",
    SERIES_B: "S\u00e9rie B",
    SERIES_C: "S\u00e9rie C",
    LATER: "Later Stage",
  };
  return labels[stage] ?? stage;
}

/**
 * Returns Tailwind classes for red flag severity badge
 */
export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-500 text-white",
    HIGH: "bg-orange-500 text-white",
    MEDIUM: "bg-yellow-500 text-black",
    LOW: "bg-blue-100 text-blue-800",
  };
  return colors[severity] ?? "bg-gray-100 text-gray-800";
}

/**
 * Returns text-only Tailwind color class for a score (0-100)
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

/**
 * Returns background Tailwind color class for a score (0-100)
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-100";
  if (score >= 60) return "bg-blue-100";
  if (score >= 40) return "bg-yellow-100";
  if (score >= 20) return "bg-orange-100";
  return "bg-red-100";
}

/**
 * Returns badge-style Tailwind classes (bg + text + border) for a score (0-100)
 */
export function getScoreBadgeColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 20) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}
