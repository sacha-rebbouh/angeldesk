/**
 * F77: Unified red flag taxonomy for all agents.
 * Every agent MUST use these categories and subcategories.
 */

export const RED_FLAG_CATEGORIES = {
  TEAM: {
    label: "Equipe & Fondateurs",
    subcategories: ["background", "vesting", "turnover", "conflicts", "competence", "transparency"],
  },
  FINANCIAL: {
    label: "Financier",
    subcategories: ["valuation", "metrics", "projections", "burn", "revenue", "unit_economics"],
  },
  MARKET: {
    label: "Marche & Concurrence",
    subcategories: ["size", "timing", "competition", "barriers", "regulation"],
  },
  PRODUCT: {
    label: "Produit & Technologie",
    subcategories: ["differentiation", "tech_risk", "dependencies", "moat", "traction"],
  },
  DEAL_STRUCTURE: {
    label: "Structure du Deal",
    subcategories: ["cap_table", "terms", "governance", "dilution", "investors"],
  },
  LEGAL: {
    label: "Juridique & Reglementaire",
    subcategories: ["compliance", "ip", "contracts", "litigation", "structure"],
  },
  CUSTOMERS: {
    label: "Clients & PMF",
    subcategories: ["retention", "concentration", "pmf", "quality", "churn"],
  },
  GTM: {
    label: "Go-to-Market",
    subcategories: ["channels", "economics", "scalability", "motion"],
  },
  INTEGRITY: {
    label: "Transparence & Integrite",
    subcategories: ["disclosure", "inconsistency", "exaggeration", "pressure_tactics", "data_quality"],
  },
} as const;

export type RedFlagCategory = keyof typeof RED_FLAG_CATEGORIES;
export type RedFlagSubcategory = (typeof RED_FLAG_CATEGORIES)[RedFlagCategory]["subcategories"][number];

export type RedFlagSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
export type RedFlagProbability = "VERY_LIKELY" | "LIKELY" | "POSSIBLE" | "UNLIKELY";

export interface StandardizedRedFlag {
  id: string;
  category: RedFlagCategory;
  subcategory: string;
  severity: RedFlagSeverity;
  probability: RedFlagProbability;
  riskScore: number; // severity x probability (1-12)
  title: string;
  description: string;
  location: string;
  evidence: string;
  contextEngineData?: string;
  impact: string;
  question: string;
  redFlagIfBadAnswer: string;
  sourceAgent: string;
}

export function calculateRiskScore(severity: RedFlagSeverity, probability: RedFlagProbability): number {
  const severityMap: Record<RedFlagSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2 };
  const probabilityMap: Record<RedFlagProbability, number> = { VERY_LIKELY: 3, LIKELY: 2, POSSIBLE: 1.5, UNLIKELY: 1 };
  return Math.round(severityMap[severity] * probabilityMap[probability] * 10) / 10;
}

/**
 * Maps agent-specific categories to the unified taxonomy.
 */
function mapAgentCategory(
  _agentName: string,
  rawCategory: string
): { category: RedFlagCategory; subcategory: string } {
  const mapping: Record<string, { category: RedFlagCategory; subcategory: string }> = {
    // cap-table-auditor
    "transparency": { category: "INTEGRITY", subcategory: "disclosure" },
    "dilution": { category: "DEAL_STRUCTURE", subcategory: "dilution" },
    "terms": { category: "DEAL_STRUCTURE", subcategory: "terms" },
    "governance": { category: "DEAL_STRUCTURE", subcategory: "governance" },
    "investors": { category: "DEAL_STRUCTURE", subcategory: "investors" },
    // legal-regulatory
    "structure": { category: "LEGAL", subcategory: "structure" },
    "compliance": { category: "LEGAL", subcategory: "compliance" },
    "ip": { category: "LEGAL", subcategory: "ip" },
    "contracts": { category: "LEGAL", subcategory: "contracts" },
    "litigation": { category: "LEGAL", subcategory: "litigation" },
    // customer-intel
    "retention": { category: "CUSTOMERS", subcategory: "retention" },
    "pmf": { category: "CUSTOMERS", subcategory: "pmf" },
    "concentration": { category: "CUSTOMERS", subcategory: "concentration" },
    "quality": { category: "CUSTOMERS", subcategory: "quality" },
    "disclosure": { category: "INTEGRITY", subcategory: "disclosure" },
    // gtm-analyst
    "channel": { category: "GTM", subcategory: "channels" },
    "motion": { category: "GTM", subcategory: "motion" },
    "economics": { category: "GTM", subcategory: "economics" },
    "scalability": { category: "GTM", subcategory: "scalability" },
    "data": { category: "INTEGRITY", subcategory: "data_quality" },
    // red-flag-detector
    "FOUNDER": { category: "TEAM", subcategory: "background" },
    "FINANCIAL": { category: "FINANCIAL", subcategory: "metrics" },
    "MARKET": { category: "MARKET", subcategory: "size" },
    "PRODUCT": { category: "PRODUCT", subcategory: "differentiation" },
    "DEAL_STRUCTURE": { category: "DEAL_STRUCTURE", subcategory: "terms" },
    // pressure tactics
    "pressure_tactics": { category: "INTEGRITY", subcategory: "pressure_tactics" },
  };

  return mapping[rawCategory] ?? { category: "INTEGRITY", subcategory: "data_quality" };
}

/**
 * Consolidates red flags from all agents into a unified matrix.
 */
export function consolidateRedFlags(
  agentResults: Record<string, { redFlags?: Array<{ id: string; category: string; severity: string; [key: string]: unknown }> }>
): StandardizedRedFlag[] {
  const allFlags: StandardizedRedFlag[] = [];

  for (const [agentName, result] of Object.entries(agentResults)) {
    if (!result.redFlags) continue;

    for (const rf of result.redFlags) {
      const mappedCategory = mapAgentCategory(agentName, rf.category);

      allFlags.push({
        id: rf.id as string,
        category: mappedCategory.category,
        subcategory: mappedCategory.subcategory,
        severity: (rf.severity as RedFlagSeverity) || "MEDIUM",
        probability: "POSSIBLE",
        riskScore: calculateRiskScore((rf.severity as RedFlagSeverity) || "MEDIUM", "POSSIBLE"),
        title: (rf.title as string) ?? "",
        description: (rf.description as string) ?? "",
        location: (rf.location as string) ?? "",
        evidence: (rf.evidence as string) ?? "",
        contextEngineData: rf.contextEngineData as string | undefined,
        impact: (rf.impact as string) ?? "",
        question: (rf.question as string) ?? "",
        redFlagIfBadAnswer: (rf.redFlagIfBadAnswer as string) ?? "",
        sourceAgent: agentName,
      });
    }
  }

  return allFlags.sort((a, b) => b.riskScore - a.riskScore);
}
