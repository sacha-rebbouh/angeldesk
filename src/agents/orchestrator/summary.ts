import type {
  AgentResult,
  ScreeningResult,
  RedFlagResult,
  ScoringResult,
  SynthesisDealScorerResult,
} from "../types";
import type { AnalysisType } from "./types";
import { TIER1_AGENT_NAMES, TIER2_AGENT_NAMES, TIER3_EXPERT_NAMES } from "./types";

/**
 * Generate summary for Tier 1 analysis
 */
export function generateTier1Summary(results: Record<string, AgentResult>): string {
  const parts: string[] = [];
  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  parts.push(`**Tier 1 Investigation**: ${successCount}/${totalCount} agents completes`);

  // Extract key scores from agents that have them
  const scores: { name: string; score: number }[] = [];

  const agentScoreFields: Record<string, string> = {
    "financial-auditor": "overallScore",
    "market-intelligence": "marketScore",
    "competitive-intel": "competitiveScore",
    "team-investigator": "overallTeamScore",
    "technical-dd": "technicalScore",
    "legal-regulatory": "legalScore",
    "cap-table-auditor": "capTableScore",
    "gtm-analyst": "gtmScore",
    "customer-intel": "customerScore",
    "exit-strategist": "exitScore",
  };

  for (const [agentName, scoreField] of Object.entries(agentScoreFields)) {
    const result = results[agentName];
    if (result?.success && "data" in result) {
      const data = result.data as Record<string, unknown>;
      const score = data[scoreField];
      if (typeof score === "number") {
        scores.push({
          name: agentName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          score,
        });
      }
    }
  }

  if (scores.length > 0) {
    parts.push("\n**Scores par dimension:**");
    for (const { name, score } of scores.sort((a, b) => b.score - a.score)) {
      const emoji = score >= 70 ? "✅" : score >= 50 ? "⚠️" : "❌";
      parts.push(`${emoji} ${name}: ${score}/100`);
    }
  }

  // Count critical issues from question-master
  const questionMaster = results["question-master"];
  if (questionMaster?.success && "data" in questionMaster) {
    const data = questionMaster.data as { dealbreakers?: string[]; topPriorities?: string[] };
    if (data.dealbreakers && data.dealbreakers.length > 0) {
      parts.push(`\n**Dealbreakers potentiels:** ${data.dealbreakers.length}`);
    }
    if (data.topPriorities && data.topPriorities.length > 0) {
      parts.push(`**Top priorites:** ${data.topPriorities.slice(0, 3).join(", ")}`);
    }
  }

  return parts.join("\n");
}

/**
 * Generate summary for Tier 2 analysis
 */
export function generateTier2Summary(results: Record<string, AgentResult>): string {
  const parts: string[] = [];
  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  parts.push(`**Tier 2 Synthesis**: ${successCount}/${totalCount} agents completes`);

  // Get verdict from synthesis-deal-scorer
  const scorer = results["synthesis-deal-scorer"] as SynthesisDealScorerResult | undefined;
  if (scorer?.success && scorer.data) {
    const { overallScore, verdict, investmentRecommendation } = scorer.data;
    parts.push(`\n**Score Final**: ${overallScore}/100`);
    parts.push(`**Verdict**: ${verdict.replace("_", " ").toUpperCase()}`);
    parts.push(`**Recommandation**: ${investmentRecommendation.action.toUpperCase()}`);
    parts.push(`> ${investmentRecommendation.rationale}`);
  }

  // Get skepticism from devil's advocate
  const devils = results["devils-advocate"];
  if (devils?.success && "data" in devils) {
    const data = devils.data as { overallSkepticism?: number; topConcerns?: string[] };
    if (typeof data.overallSkepticism === "number") {
      parts.push(`\n**Scepticisme**: ${data.overallSkepticism}/100`);
    }
    if (data.topConcerns && data.topConcerns.length > 0) {
      parts.push(`**Top concerns**: ${data.topConcerns.slice(0, 3).join("; ")}`);
    }
  }

  return parts.join("\n");
}

/**
 * Generate summary for full analysis (Tier 1 + Tier 2 + Tier 3)
 */
export function generateFullAnalysisSummary(results: Record<string, AgentResult>): string {
  const parts: string[] = [];

  // Count successes by tier
  const tier1Success = TIER1_AGENT_NAMES.filter((a) => results[a]?.success).length;
  const tier2Success = TIER2_AGENT_NAMES.filter((a) => results[a]?.success).length;

  // Find which Tier 3 agent ran (if any)
  const tier3Result = TIER3_EXPERT_NAMES.find((a) => results[a]);
  const tier3Success = tier3Result && results[tier3Result]?.success;

  parts.push(`**Full Analysis Complete**`);
  parts.push(`- Tier 1 (Investigation): ${tier1Success}/12 agents`);
  parts.push(`- Tier 2 (Synthesis): ${tier2Success}/5 agents`);
  if (tier3Result) {
    const expertName = tier3Result.replace("-expert", "").replace(/-/g, " ").toUpperCase();
    parts.push(`- Tier 3 (Sector): ${tier3Success ? "✅" : "❌"} ${expertName} Expert`);
  }

  // Get final verdict
  const scorer = results["synthesis-deal-scorer"] as SynthesisDealScorerResult | undefined;
  if (scorer?.success && scorer.data) {
    const { overallScore, verdict, investmentRecommendation } = scorer.data;
    parts.push(`\n**VERDICT FINAL**`);
    parts.push(`Score: ${overallScore}/100 - ${verdict.replace("_", " ").toUpperCase()}`);
    parts.push(`Action: ${investmentRecommendation.action.toUpperCase()}`);
    parts.push(`> ${investmentRecommendation.rationale}`);
  }

  // Add Tier 3 sector insights if available
  if (tier3Result && results[tier3Result]?.success && "data" in results[tier3Result]) {
    const sectorData = results[tier3Result].data as {
      sectorScore?: number;
      sectorFit?: string;
      sectorInsights?: { metric?: string; assessment?: string }[];
    };
    if (sectorData.sectorScore) {
      parts.push(`\n**ANALYSE SECTORIELLE**`);
      parts.push(`Score Sectoriel: ${sectorData.sectorScore}/100`);
      if (sectorData.sectorFit) {
        parts.push(`Fit: ${sectorData.sectorFit.toUpperCase()}`);
      }
      if (sectorData.sectorInsights && sectorData.sectorInsights.length > 0) {
        const topInsights = sectorData.sectorInsights.slice(0, 3);
        for (const insight of topInsights) {
          parts.push(`- ${insight.metric}: ${insight.assessment}`);
        }
      }
    }
  }

  return parts.join("\n");
}

/**
 * Generate summary from all results (basic analysis types)
 */
export function generateSummary(
  results: Record<string, AgentResult>,
  _type: AnalysisType
): string {
  const parts: string[] = [];

  // Screening summary
  const screening = results["deal-screener"] as ScreeningResult | undefined;
  if (screening?.success && screening.data) {
    const { shouldProceed, confidenceScore, summary } = screening.data;
    parts.push(
      `**Screening**: ${shouldProceed ? "PROCEED" : "PASS"} (${confidenceScore}% confiance)`
    );
    parts.push(summary);
  }

  // Scoring summary
  const scoring = results["deal-scorer"] as ScoringResult | undefined;
  if (scoring?.success && scoring.data) {
    const { scores } = scoring.data;
    parts.push(
      `**Score Global**: ${scores.global}/100\n` +
        `- Team: ${scores.team}/100\n` +
        `- Market: ${scores.market}/100\n` +
        `- Product: ${scores.product}/100\n` +
        `- Financials: ${scores.financials}/100\n` +
        `- Timing: ${scores.timing}/100`
    );
  }

  // Red flags summary
  const redFlags = results["red-flag-detector"] as RedFlagResult | undefined;
  if (redFlags?.success && redFlags.data) {
    const { redFlags: flags, overallRiskLevel } = redFlags.data;
    if (flags.length > 0) {
      const critical = flags.filter((f) => f.severity === "CRITICAL").length;
      const high = flags.filter((f) => f.severity === "HIGH").length;
      parts.push(
        `**Red Flags**: ${flags.length} detecte(s) - Risque ${overallRiskLevel}` +
          (critical > 0 ? ` (${critical} critique(s))` : "") +
          (high > 0 ? ` (${high} eleve(s))` : "")
      );
    } else {
      parts.push("**Red Flags**: Aucun red flag majeur detecte");
    }
  }

  return parts.join("\n\n");
}
