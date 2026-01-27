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
