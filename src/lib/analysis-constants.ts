// =============================================================================
// ANALYSIS CONSTANTS
// Hoisted outside components to prevent recreation on every render
// =============================================================================

// Analysis type options (kept for internal use / API compatibility)
export const ANALYSIS_TYPES = [
  { value: "extraction", label: "Extraction documents", description: "~1min", tier: 1 },
  { value: "tier1_complete", label: "Investigation Tier 1", description: "12 agents en parallèle", tier: 1 },
  { value: "tier2_sector", label: "Expert Sectoriel Tier 2", description: "1 expert selon secteur", tier: 2 },
  { value: "full_dd", label: "Due Diligence complète", description: "~2min", tier: 2 },
  { value: "tier3_synthesis", label: "Synthèse Tier 3", description: "5 agents (nécessite Tier 1)", tier: 3 },
  { value: "full_analysis", label: "Analyse Complète", description: "18+ agents (Tier 1 + 2 + 3)", tier: 3 },
] as const;

export type AnalysisTypeValue = typeof ANALYSIS_TYPES[number]["value"];

// =============================================================================
// PLAN-BASED ANALYSIS CONFIGURATION
// Determines what analysis runs when user clicks "Analyser"
// =============================================================================

export const PLAN_ANALYSIS_CONFIG = {
  FREE: {
    analysisType: "tier1_complete" as AnalysisTypeValue,
    label: "Analyse",
    description: "Extraction + 12 agents d'investigation",
    includes: ["extraction", "tier1_complete"],
  },
  PRO: {
    analysisType: "full_analysis" as AnalysisTypeValue,
    label: "Analyse complète",
    description: "Due Diligence complète + Expert sectoriel",
    includes: ["extraction", "tier1_complete", "tier2_sector", "tier3_synthesis", "full_analysis"],
  },
  ENTERPRISE: {
    analysisType: "full_analysis" as AnalysisTypeValue,
    label: "Analyse complète",
    description: "Due Diligence complète + Expert sectoriel",
    includes: ["extraction", "tier1_complete", "tier2_sector", "tier3_synthesis", "full_analysis"],
  },
} as const;

export type SubscriptionPlan = keyof typeof PLAN_ANALYSIS_CONFIG;

export function getAnalysisTypeForPlan(plan: SubscriptionPlan): AnalysisTypeValue {
  return PLAN_ANALYSIS_CONFIG[plan].analysisType;
}

// =============================================================================
// FREE vs PRO DISPLAY LIMITS
// Controls what FREE users see vs PRO users (with blur/teaser for rest)
// =============================================================================

export const FREE_DISPLAY_LIMITS = {
  // Items shown before blur
  strengths: 2,           // Points forts visibles
  weaknesses: 2,          // Faiblesses visibles
  redFlags: 2,            // Red flags visibles
  devilsAdvocate: 2,      // Objections Devil's Advocate visibles
  criticalQuestions: 3,   // Questions critiques visibles

  // Items completely hidden (teaser only)
  score: false,           // Score détaillé masqué
  contradictions: false,  // Détails contradictions masqués (count only)
  scenarios: false,       // Aucun scénario affiché
  sectorExpert: false,    // Expert sectoriel masqué
  memo: false,            // Memo masqué
} as const;

// PRO has unlimited access
export const PRO_DISPLAY_LIMITS = {
  strengths: Infinity,
  weaknesses: Infinity,
  redFlags: Infinity,
  devilsAdvocate: Infinity,
  criticalQuestions: Infinity,
  score: true,
  contradictions: true,
  scenarios: true,
  sectorExpert: true,
  memo: true,
} as const;

export function getDisplayLimits(plan: SubscriptionPlan) {
  return plan === "FREE" ? FREE_DISPLAY_LIMITS : PRO_DISPLAY_LIMITS;
}

// Agent lists for categorizing results
export const TIER1_AGENTS = [
  "financial-auditor",
  "team-investigator",
  "competitive-intel",
  "deck-forensics",
  "market-intelligence",
  "tech-stack-dd",
  "tech-ops-dd",
  "legal-regulatory",
  "cap-table-auditor",
  "gtm-analyst",
  "customer-intel",
  "exit-strategist",
  "question-master",
] as const;

export const TIER2_AGENTS = [
  "saas-expert",
  "marketplace-expert",
  "fintech-expert",
  "healthtech-expert",
  "ai-expert",
  "deeptech-expert",
  "climate-expert",
  "hardware-expert",
  "gaming-expert",
  "consumer-expert",
] as const;

export const TIER3_AGENTS = [
  "synthesis-deal-scorer",
  "scenario-modeler",
  "devils-advocate",
  "contradiction-detector",
  "memo-generator",
  "conditions-analyst",
] as const;

// Agent display names — canonical source is format-utils.ts
export { AGENT_DISPLAY_NAMES, formatAgentName } from "@/lib/format-utils";

// Analysis mode display names
export const ANALYSIS_MODE_NAMES: Record<string, string> = {
  extraction: "Extraction",
  full_dd: "Due Diligence",
  tier1_complete: "Investigation Tier 1",
  tier2_sector: "Expert Sectoriel",
  tier3_synthesis: "Synthèse Tier 3",
  full_analysis: "Analyse Complète",
  FULL_DD: "Due Diligence",
};

// =============================================================================
// HELPER FUNCTIONS
// Pure functions that don't need to be inside components
// =============================================================================

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

  if (diffMins < 1) return "À l'instant";
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
    return "Non autorisé";
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
  "ai-expert": { emoji: "🤖", displayName: "AI Expert", color: "from-fuchsia-500 to-pink-600" },
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
  emerging: { label: "Émergent", color: "bg-purple-100 text-purple-800" },
  growing: { label: "En croissance", color: "bg-green-100 text-green-800" },
  mature: { label: "Mature", color: "bg-blue-100 text-blue-800" },
  declining: { label: "En déclin", color: "bg-red-100 text-red-800" },
} as const;

// =============================================================================
// ASSESSMENT BADGE CONFIG
// =============================================================================

export const ASSESSMENT_CONFIG = {
  exceptional: { label: "Exceptionnel", color: "text-green-600" },
  above_average: { label: "Au-dessus moy.", color: "text-blue-600" },
  average: { label: "Dans la moyenne", color: "text-gray-600" },
  below_average: { label: "En-dessous moy.", color: "text-orange-600" },
  concerning: { label: "Préoccupant", color: "text-red-600" },
} as const;

// =============================================================================
// SEVERITY BADGE CONFIG
// =============================================================================

export const SEVERITY_CONFIG = {
  critical: { label: "Critique", color: "bg-red-100 text-red-800" },
  major: { label: "Majeur", color: "bg-orange-100 text-orange-800" },
  minor: { label: "Mineur", color: "bg-yellow-100 text-yellow-800" },
} as const;

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
