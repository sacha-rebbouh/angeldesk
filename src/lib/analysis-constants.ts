// =============================================================================
// ANALYSIS CONSTANTS
// Hoisted outside components to prevent recreation on every render
// =============================================================================

// Analysis type options for the selector
export const ANALYSIS_TYPES = [
  { value: "screening", label: "Screening rapide", description: "~30s", tier: 1 },
  { value: "extraction", label: "Extraction documents", description: "~1min", tier: 1 },
  { value: "tier1_complete", label: "Investigation Tier 1", description: "12 agents en parallele", tier: 1 },
  { value: "tier2_synthesis", label: "Synthese Tier 2", description: "5 agents (necessite Tier 1)", tier: 2 },
  { value: "full_dd", label: "Due Diligence complete", description: "~2min", tier: 2 },
  { value: "tier3_sector", label: "Expert Sectoriel Tier 3", description: "1 expert selon secteur", tier: 3 },
  { value: "full_analysis", label: "Analyse Complete", description: "18+ agents (Tier 1 + 2 + 3)", tier: 3 },
] as const;

export type AnalysisTypeValue = typeof ANALYSIS_TYPES[number]["value"];

// Agent lists for categorizing results
export const TIER1_AGENTS = [
  "financial-auditor",
  "team-investigator",
  "competitive-intel",
  "deck-forensics",
  "market-intelligence",
  "technical-dd",
  "legal-regulatory",
  "cap-table-auditor",
  "gtm-analyst",
  "customer-intel",
  "exit-strategist",
  "question-master",
] as const;

export const TIER2_AGENTS = [
  "synthesis-deal-scorer",
  "scenario-modeler",
  "devils-advocate",
  "contradiction-detector",
  "memo-generator",
] as const;

export const TIER3_AGENTS = [
  "saas-expert",
  "marketplace-expert",
  "fintech-expert",
  "healthtech-expert",
  "deeptech-expert",
  "climate-expert",
  "hardware-expert",
  "gaming-expert",
  "consumer-expert",
] as const;

// Agent display names mapping
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // Base agents
  "deal-screener": "Deal Screener",
  "red-flag-detector": "Red Flag Detector",
  "document-extractor": "Document Extractor",
  "deal-scorer": "Deal Scorer",
  // Tier 1 agents
  "financial-auditor": "Financial Auditor",
  "team-investigator": "Team Investigator",
  "competitive-intel": "Competitive Intel",
  "deck-forensics": "Deck Forensics",
  "market-intelligence": "Market Intelligence",
  "technical-dd": "Technical DD",
  "legal-regulatory": "Legal & Regulatory",
  "cap-table-auditor": "Cap Table Auditor",
  "gtm-analyst": "GTM Analyst",
  "customer-intel": "Customer Intel",
  "exit-strategist": "Exit Strategist",
  "question-master": "Question Master",
  // Tier 2 agents
  "contradiction-detector": "Contradiction Detector",
  "scenario-modeler": "Scenario Modeler",
  "synthesis-deal-scorer": "Synthesis Scorer",
  "devils-advocate": "Devil's Advocate",
  "memo-generator": "Memo Generator",
  // Tier 3 experts
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

// Analysis mode display names
export const ANALYSIS_MODE_NAMES: Record<string, string> = {
  screening: "Screening",
  extraction: "Extraction",
  full_dd: "Due Diligence",
  tier1_complete: "Investigation Tier 1",
  tier2_synthesis: "Synthese Tier 2",
  tier3_sector: "Expert Sectoriel",
  full_analysis: "Analyse Complete",
  SCREENING: "Screening",
  FULL_DD: "Due Diligence",
};

// =============================================================================
// HELPER FUNCTIONS
// Pure functions that don't need to be inside components
// =============================================================================

export function formatAgentName(name: string): string {
  return AGENT_DISPLAY_NAMES[name] ?? name;
}

export function formatAnalysisMode(mode: string): string {
  return ANALYSIS_MODE_NAMES[mode] ?? mode;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "A l'instant";
  if (diffMins < 60) return `Il y a ${diffMins}min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function formatErrorMessage(error: string): string {
  if (error.includes("402") || error.includes("Insufficient credits")) {
    return "Credits insuffisants";
  }
  if (error.includes("401") || error.includes("Unauthorized")) {
    return "Non autorise";
  }
  if (error.includes("429") || error.includes("rate limit")) {
    return "Limite atteinte";
  }
  if (error.includes("500") || error.includes("Internal")) {
    return "Erreur serveur";
  }
  if (error.includes("timeout") || error.includes("Timeout")) {
    return "Timeout";
  }
  if (error.length > 30) {
    return error.substring(0, 27) + "...";
  }
  return error;
}

// =============================================================================
// SECTOR EXPERT CONFIGURATION
// Hoisted from tier3-results.tsx
// =============================================================================

export const SECTOR_CONFIG = {
  "saas-expert": { emoji: "💻", displayName: "SaaS Expert", color: "from-blue-500 to-indigo-600" },
  "marketplace-expert": { emoji: "🛒", displayName: "Marketplace Expert", color: "from-purple-500 to-pink-600" },
  "fintech-expert": { emoji: "💳", displayName: "FinTech Expert", color: "from-emerald-500 to-teal-600" },
  "healthtech-expert": { emoji: "🏥", displayName: "HealthTech Expert", color: "from-red-500 to-rose-600" },
  "deeptech-expert": { emoji: "🔬", displayName: "DeepTech Expert", color: "from-cyan-500 to-blue-600" },
  "climate-expert": { emoji: "🌱", displayName: "Climate Expert", color: "from-green-500 to-emerald-600" },
  "hardware-expert": { emoji: "🏭", displayName: "Hardware Expert", color: "from-gray-500 to-slate-600" },
  "gaming-expert": { emoji: "🎮", displayName: "Gaming Expert", color: "from-violet-500 to-purple-600" },
  "consumer-expert": { emoji: "📱", displayName: "Consumer Expert", color: "from-orange-500 to-amber-600" },
} as const;

export type SectorExpertType = keyof typeof SECTOR_CONFIG;

// =============================================================================
// MATURITY BADGE CONFIG
// =============================================================================

export const MATURITY_CONFIG = {
  emerging: { label: "Emerging", color: "bg-purple-100 text-purple-800" },
  growing: { label: "Growing", color: "bg-green-100 text-green-800" },
  mature: { label: "Mature", color: "bg-blue-100 text-blue-800" },
  declining: { label: "Declining", color: "bg-red-100 text-red-800" },
} as const;

// =============================================================================
// ASSESSMENT BADGE CONFIG
// =============================================================================

export const ASSESSMENT_CONFIG = {
  exceptional: { label: "Exceptional", color: "text-green-600" },
  above_average: { label: "Above Avg", color: "text-blue-600" },
  average: { label: "Average", color: "text-gray-600" },
  below_average: { label: "Below Avg", color: "text-orange-600" },
  concerning: { label: "Concerning", color: "text-red-600" },
} as const;

// =============================================================================
// SEVERITY BADGE CONFIG
// =============================================================================

export const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-100 text-red-800" },
  major: { label: "Major", color: "bg-orange-100 text-orange-800" },
  minor: { label: "Minor", color: "bg-yellow-100 text-yellow-800" },
} as const;

// =============================================================================
// SCORE COLOR HELPER
// Pure function that doesn't need to be in a component
// =============================================================================

export function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 20) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

// =============================================================================
// RESULT CATEGORIZATION HELPERS
// =============================================================================

export function categorizeResults(results: Record<string, unknown>): {
  isTier1: boolean;
  isTier2: boolean;
  isTier3: boolean;
  tier1Results: Record<string, unknown>;
  tier2Results: Record<string, unknown>;
  tier3Results: Record<string, unknown>;
} {
  const resultKeys = Object.keys(results);

  const tier1Set = new Set<string>(TIER1_AGENTS);
  const tier2Set = new Set<string>(TIER2_AGENTS);
  const tier3Set = new Set<string>(TIER3_AGENTS);

  const tier1Results: Record<string, unknown> = {};
  const tier2Results: Record<string, unknown> = {};
  const tier3Results: Record<string, unknown> = {};

  for (const key of resultKeys) {
    if (tier1Set.has(key)) {
      tier1Results[key] = results[key];
    } else if (tier2Set.has(key)) {
      tier2Results[key] = results[key];
    } else if (tier3Set.has(key)) {
      tier3Results[key] = results[key];
    }
  }

  return {
    isTier1: Object.keys(tier1Results).length > 0,
    isTier2: Object.keys(tier2Results).length > 0,
    isTier3: Object.keys(tier3Results).length > 0,
    tier1Results,
    tier2Results,
    tier3Results,
  };
}
