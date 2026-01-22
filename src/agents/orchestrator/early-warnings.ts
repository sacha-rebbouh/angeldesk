/**
 * Early Warning Detection System
 *
 * Analyzes agent results in real-time to detect potential dealbreakers.
 * Emits warnings immediately when critical issues are found, without
 * stopping the analysis (soft fail-fast).
 */

import type { AgentResult } from "../types";
import type {
  EarlyWarning,
  EarlyWarningSeverity,
  EarlyWarningCategory,
} from "./types";

// ============================================================================
// DETECTION RULES
// ============================================================================

interface DetectionRule {
  agentName: string;
  field: string; // Path to field in result.data (supports dot notation)
  condition: "equals" | "below" | "above" | "contains" | "exists" | "empty";
  threshold?: number | string | string[];
  severity: EarlyWarningSeverity;
  category: EarlyWarningCategory;
  title: string;
  descriptionTemplate: string; // Can use {value} placeholder
  recommendation: "investigate" | "likely_dealbreaker" | "absolute_dealbreaker";
  questionsToAsk?: string[];
}

/**
 * Rules for detecting dealbreakers from agent results
 */
const DETECTION_RULES: DetectionRule[] = [
  // ============================================================================
  // RED FLAG DETECTOR
  // ============================================================================
  {
    agentName: "red-flag-detector",
    field: "overallRiskLevel",
    condition: "equals",
    threshold: "critical",
    severity: "critical",
    category: "founder_integrity",
    title: "Critical Risk Level Detected",
    descriptionTemplate: "Red flag analysis indicates critical overall risk level. Multiple serious issues identified.",
    recommendation: "likely_dealbreaker",
    questionsToAsk: ["What specific critical issues were identified?", "Can any be mitigated?"],
  },

  // ============================================================================
  // FINANCIAL AUDITOR
  // ============================================================================
  {
    agentName: "financial-auditor",
    field: "overallScore",
    condition: "below",
    threshold: 20,
    severity: "critical",
    category: "financial_critical",
    title: "Financial Metrics Below Viability Threshold",
    descriptionTemplate: "Financial score of {value}/100 indicates fundamental business model issues.",
    recommendation: "likely_dealbreaker",
    questionsToAsk: [
      "What explains the weak financial metrics?",
      "Is there a path to unit economics profitability?",
      "What would need to change for financials to work?",
    ],
  },
  {
    agentName: "financial-auditor",
    field: "valuationAnalysis.verdict",
    condition: "equals",
    threshold: "very_aggressive",
    severity: "high",
    category: "deal_structure",
    title: "Valuation Significantly Above Market",
    descriptionTemplate: "Valuation assessed as very aggressive compared to benchmarks.",
    recommendation: "investigate",
    questionsToAsk: [
      "What justifies this premium valuation?",
      "Are there comparable exits at these multiples?",
    ],
  },

  // ============================================================================
  // LEGAL-REGULATORY
  // ============================================================================
  {
    agentName: "legal-regulatory",
    field: "regulatoryExposure.riskLevel",
    condition: "equals",
    threshold: "critical",
    severity: "critical",
    category: "legal_existential",
    title: "Critical Regulatory Risk",
    descriptionTemplate: "Regulatory exposure at critical level - potential license or compliance issues.",
    recommendation: "likely_dealbreaker",
    questionsToAsk: [
      "What specific regulations are at risk?",
      "Is there pending regulatory action?",
      "What's the timeline and cost to achieve compliance?",
    ],
  },
  {
    agentName: "legal-regulatory",
    field: "litigationRisk.currentLitigation",
    condition: "equals",
    threshold: "true",
    severity: "high",
    category: "legal_existential",
    title: "Active Litigation Detected",
    descriptionTemplate: "Company has ongoing litigation that may impact operations or valuation.",
    recommendation: "investigate",
    questionsToAsk: [
      "What is the nature and status of the litigation?",
      "What's the potential financial exposure?",
      "Is there insurance coverage?",
    ],
  },
  {
    agentName: "legal-regulatory",
    field: "criticalIssues",
    condition: "exists",
    severity: "critical",
    category: "legal_existential",
    title: "Critical Legal Issues Identified",
    descriptionTemplate: "Legal analysis found critical issues requiring immediate attention.",
    recommendation: "likely_dealbreaker",
  },

  // ============================================================================
  // TEAM INVESTIGATOR
  // ============================================================================
  {
    agentName: "team-investigator",
    field: "overallTeamScore",
    condition: "below",
    threshold: 25,
    severity: "high",
    category: "founder_integrity",
    title: "Team Assessment Critical",
    descriptionTemplate: "Team score of {value}/100 indicates significant gaps or concerns.",
    recommendation: "investigate",
    questionsToAsk: [
      "What are the key team gaps?",
      "What's the plan to strengthen the team?",
      "Are there any background verification issues?",
    ],
  },
  {
    agentName: "team-investigator",
    field: "founderProfiles.*.redFlags",
    condition: "exists",
    severity: "high",
    category: "founder_integrity",
    title: "Founder Red Flags Detected",
    descriptionTemplate: "Background check revealed concerns about one or more founders.",
    recommendation: "investigate",
    questionsToAsk: [
      "Can you explain the flagged issues?",
      "Are there references who can vouch for this?",
    ],
  },

  // ============================================================================
  // COMPETITIVE INTEL
  // ============================================================================
  {
    agentName: "competitive-intel",
    field: "moatAssessment.type",
    condition: "equals",
    threshold: "none",
    severity: "high",
    category: "product_broken",
    title: "No Competitive Moat Identified",
    descriptionTemplate: "No defensible competitive advantage detected. High risk of commoditization.",
    recommendation: "investigate",
    questionsToAsk: [
      "What prevents competitors from copying this?",
      "What's the plan to build defensibility?",
    ],
  },
  {
    agentName: "competitive-intel",
    field: "competitiveScore",
    condition: "below",
    threshold: 25,
    severity: "high",
    category: "product_broken",
    title: "Weak Competitive Position",
    descriptionTemplate: "Competitive score of {value}/100 indicates vulnerable market position.",
    recommendation: "investigate",
  },

  // ============================================================================
  // MARKET INTELLIGENCE
  // ============================================================================
  {
    agentName: "market-intelligence",
    field: "timingAnalysis.timing",
    condition: "equals",
    threshold: "too_early",
    severity: "medium",
    category: "market_dead",
    title: "Market Timing Concern",
    descriptionTemplate: "Market may be too early for this solution. Adoption risk is elevated.",
    recommendation: "investigate",
    questionsToAsk: [
      "What evidence shows the market is ready now?",
      "How will you survive until market matures?",
    ],
  },
  {
    agentName: "market-intelligence",
    field: "marketSizeValidation.discrepancy",
    condition: "equals",
    threshold: "major",
    severity: "high",
    category: "market_dead",
    title: "Major Market Size Discrepancy",
    descriptionTemplate: "Claimed market size significantly differs from validated figures.",
    recommendation: "investigate",
    questionsToAsk: [
      "What sources support your market size claims?",
      "How do you define your addressable market?",
    ],
  },

  // ============================================================================
  // CAP TABLE AUDITOR
  // ============================================================================
  {
    agentName: "cap-table-auditor",
    field: "capTableScore",
    condition: "below",
    threshold: 30,
    severity: "high",
    category: "deal_structure",
    title: "Problematic Cap Table Structure",
    descriptionTemplate: "Cap table score of {value}/100 indicates structural issues.",
    recommendation: "investigate",
    questionsToAsk: [
      "Can the cap table be cleaned up before investment?",
      "Are there any unresolved option issues?",
    ],
  },
  {
    agentName: "cap-table-auditor",
    field: "roundTerms.participatingPreferred",
    condition: "equals",
    threshold: "true",
    severity: "medium",
    category: "deal_structure",
    title: "Participating Preferred Terms",
    descriptionTemplate: "Deal includes participating preferred shares - unfavorable for common shareholders.",
    recommendation: "investigate",
  },

  // ============================================================================
  // CUSTOMER INTEL
  // ============================================================================
  {
    agentName: "customer-intel",
    field: "customerRisks.concentration",
    condition: "above",
    threshold: 50,
    severity: "high",
    category: "financial_critical",
    title: "Severe Customer Concentration",
    descriptionTemplate: "Top customer represents {value}% of revenue - extreme concentration risk.",
    recommendation: "investigate",
    questionsToAsk: [
      "What's the contract status with your top customer?",
      "What's the plan to diversify the customer base?",
    ],
  },
  {
    agentName: "customer-intel",
    field: "productMarketFit.strength",
    condition: "equals",
    threshold: "weak",
    severity: "high",
    category: "product_broken",
    title: "Weak Product-Market Fit Signals",
    descriptionTemplate: "Product-market fit assessment indicates fundamental adoption challenges.",
    recommendation: "investigate",
    questionsToAsk: [
      "What evidence do you have of product-market fit?",
      "What's your NPS or customer satisfaction score?",
    ],
  },

  // ============================================================================
  // QUESTION MASTER (aggregates dealbreakers)
  // ============================================================================
  {
    agentName: "question-master",
    field: "dealbreakers",
    condition: "exists",
    severity: "critical",
    category: "founder_integrity", // Will be refined based on content
    title: "Potential Dealbreakers Identified",
    descriptionTemplate: "Analysis identified conditions that could kill the deal.",
    recommendation: "likely_dealbreaker",
  },

  // ============================================================================
  // DEVIL'S ADVOCATE (Tier 2)
  // ============================================================================
  {
    agentName: "devils-advocate",
    field: "dealbreakers",
    condition: "exists",
    severity: "critical",
    category: "founder_integrity",
    title: "Devil's Advocate: Dealbreakers Found",
    descriptionTemplate: "Critical review identified potential dealbreaking scenarios.",
    recommendation: "likely_dealbreaker",
  },
  {
    agentName: "devils-advocate",
    field: "overallSkepticism",
    condition: "above",
    threshold: 85,
    severity: "high",
    category: "product_broken",
    title: "Extremely High Skepticism Level",
    descriptionTemplate: "Devil's advocate skepticism at {value}/100 - major concerns identified.",
    recommendation: "investigate",
  },

  // ============================================================================
  // SYNTHESIS DEAL SCORER (Tier 2)
  // ============================================================================
  {
    agentName: "synthesis-deal-scorer",
    field: "verdict",
    condition: "equals",
    threshold: "strong_pass",
    severity: "critical",
    category: "financial_critical",
    title: "Strong Pass Recommendation",
    descriptionTemplate: "Synthesis analysis recommends passing on this deal.",
    recommendation: "likely_dealbreaker",
  },
  {
    agentName: "synthesis-deal-scorer",
    field: "overallScore",
    condition: "below",
    threshold: 30,
    severity: "critical",
    category: "financial_critical",
    title: "Very Low Overall Score",
    descriptionTemplate: "Overall synthesis score of {value}/100 indicates significant issues across multiple dimensions.",
    recommendation: "likely_dealbreaker",
  },
];

// ============================================================================
// DETECTION ENGINE
// ============================================================================

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array wildcard (e.g., "founderProfiles.*.redFlags")
    if (part === "*" && Array.isArray(current)) {
      const remaining = parts.slice(parts.indexOf(part) + 1).join(".");
      if (remaining) {
        return current.map((item) => getNestedValue(item, remaining)).filter(Boolean);
      }
      return current;
    }

    if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Check if a condition is met
 */
function checkCondition(
  value: unknown,
  condition: DetectionRule["condition"],
  threshold?: number | string | string[]
): boolean {
  switch (condition) {
    case "equals":
      return String(value) === String(threshold);

    case "below":
      return typeof value === "number" && typeof threshold === "number" && value < threshold;

    case "above":
      return typeof value === "number" && typeof threshold === "number" && value > threshold;

    case "contains":
      if (Array.isArray(threshold)) {
        return threshold.some((t) =>
          String(value).toLowerCase().includes(String(t).toLowerCase())
        );
      }
      return String(value).toLowerCase().includes(String(threshold).toLowerCase());

    case "exists":
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== null && value !== undefined && value !== "";

    case "empty":
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return value === null || value === undefined || value === "";

    default:
      return false;
  }
}

/**
 * Generate a unique ID for an early warning
 */
function generateWarningId(agentName: string, category: string): string {
  return `ew_${agentName}_${category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract evidence from agent result based on the warning
 */
function extractEvidence(result: AgentResult, rule: DetectionRule): string[] {
  const evidence: string[] = [];

  if (!("data" in result) || !result.data) {
    return evidence;
  }

  const data = result.data as Record<string, unknown>;

  // Get the actual value that triggered the warning
  const value = getNestedValue(data, rule.field);
  if (value !== undefined) {
    evidence.push(`${rule.field}: ${JSON.stringify(value)}`);
  }

  // Try to get related evidence fields
  const evidenceFields = [
    "evidence",
    "concerns",
    "redFlags",
    "risks",
    "issues",
    "criticalIssues",
    "financialRedFlags",
    "structuralRedFlags",
    "competitiveRisks",
  ];

  for (const field of evidenceFields) {
    const fieldValue = data[field];
    if (Array.isArray(fieldValue) && fieldValue.length > 0) {
      evidence.push(...fieldValue.slice(0, 3).map((e) => String(e)));
    }
  }

  return evidence.slice(0, 5); // Limit to 5 pieces of evidence
}

/**
 * Analyze an agent result and detect early warnings
 */
export function detectEarlyWarnings(
  agentName: string,
  result: AgentResult
): EarlyWarning[] {
  if (!result.success || !("data" in result) || !result.data) {
    return [];
  }

  const warnings: EarlyWarning[] = [];
  const data = result.data as Record<string, unknown>;

  // Check all rules for this agent
  const applicableRules = DETECTION_RULES.filter((r) => r.agentName === agentName);

  for (const rule of applicableRules) {
    const value = getNestedValue(data, rule.field);

    if (checkCondition(value, rule.condition, rule.threshold)) {
      // Build description with value substitution
      const description = rule.descriptionTemplate.replace(
        "{value}",
        String(value)
      );

      warnings.push({
        id: generateWarningId(agentName, rule.category),
        timestamp: new Date(),
        agentName,
        severity: rule.severity,
        category: rule.category,
        title: rule.title,
        description,
        evidence: extractEvidence(result, rule),
        confidence: result.success ? 85 : 50, // Higher confidence for successful analysis
        recommendation: rule.recommendation,
        questionsToAsk: rule.questionsToAsk,
      });
    }
  }

  return warnings;
}

/**
 * Aggregate warnings and determine if there are critical issues
 */
export function aggregateWarnings(warnings: EarlyWarning[]): {
  all: EarlyWarning[];
  critical: EarlyWarning[];
  high: EarlyWarning[];
  hasCritical: boolean;
  summary: string;
} {
  const critical = warnings.filter((w) => w.severity === "critical");
  const high = warnings.filter((w) => w.severity === "high");

  let summary: string;
  if (critical.length > 0) {
    summary = `${critical.length} CRITICAL warning(s) detected - potential dealbreakers identified`;
  } else if (high.length > 0) {
    summary = `${high.length} HIGH priority warning(s) - require investigation before proceeding`;
  } else if (warnings.length > 0) {
    summary = `${warnings.length} warning(s) detected - review recommended`;
  } else {
    summary = "No early warnings detected";
  }

  return {
    all: warnings,
    critical,
    high,
    hasCritical: critical.length > 0,
    summary,
  };
}
