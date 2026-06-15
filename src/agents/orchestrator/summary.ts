import type {
  AgentResult,
  RedFlagResult,
  SynthesisDealScorerResult,
} from "../types";
import type { AnalysisType } from "./types";
import { TIER1_AGENT_NAMES, TIER3_AGENT_NAMES, TIER2_EXPERT_NAMES } from "./types";

const ACTION_LABELS: Record<string, string> = {
  very_favorable: "Signaux très favorables",
  favorable: "Signaux favorables",
  contrasted: "Signaux contrastés",
  vigilance: "Vigilance requise",
  alert_dominant: "Signaux d'alerte dominants",
};

/**
 * Generate summary for Tier 1 analysis
 */
export function generateTier1Summary(results: Record<string, AgentResult>): string {
  const parts: string[] = [];
  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  parts.push(`**Tier 1 Investigation**: ${successCount}/${totalCount} agents completes`);

  // P2 — Aucune note par dimension restituée (les sous-scores /100 ont été
  // retirés : ce résumé alimente aussi le contexte chat LLM). La couverture et
  // l'orientation sont portées par la synthèse et l'UI scoreless.

  // Count critical issues from question-master
  const questionMaster = results["question-master"];
  if (questionMaster?.success && "data" in questionMaster) {
    const data = questionMaster.data as { criticalQuestions?: string[]; dealbreakers?: string[]; topPriorities?: string[] };
    const criticalQs = data.criticalQuestions ?? data.dealbreakers;
    if (criticalQs && criticalQs.length > 0) {
      parts.push(`\n**Risques critiques potentiels:** ${criticalQs.length}`);
    }
    if (data.topPriorities && data.topPriorities.length > 0) {
      parts.push(`**Top priorites:** ${data.topPriorities.slice(0, 3).join(", ")}`);
    }
  }

  return parts.join("\n");
}

/**
 * Generate summary for Tier 3 analysis
 */
export function generateTier3Summary(results: Record<string, AgentResult>): string {
  const parts: string[] = [];
  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  parts.push(`**Tier 3 Synthesis**: ${successCount}/${totalCount} agents completes`);

  // Get verdict from synthesis-deal-scorer
  const scorer = results["synthesis-deal-scorer"] as SynthesisDealScorerResult | undefined;
  if (scorer?.success && scorer.data) {
    const { verdict, investmentRecommendation } = scorer.data;
    // P2 — Aucune note de deal restituée (plus de "Score Final/100").
    parts.push(`\n**Profil**: ${verdict.replace("_", " ").toUpperCase()}`);
    parts.push(`**Signal**: ${ACTION_LABELS[investmentRecommendation.action.toLowerCase()] ?? investmentRecommendation.action}`);
    parts.push(`> ${investmentRecommendation.rationale}`);
  }

  // Get top concerns from devil's advocate (P2 — plus de score de scepticisme /100)
  const devils = results["devils-advocate"];
  if (devils?.success && "data" in devils) {
    const data = devils.data as { topConcerns?: string[] };
    if (data.topConcerns && data.topConcerns.length > 0) {
      parts.push(`\n**Top concerns**: ${data.topConcerns.slice(0, 3).join("; ")}`);
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
  const tier3Success = TIER3_AGENT_NAMES.filter((a) => results[a]?.success).length;

  // Find which Tier 2 sector expert ran (if any)
  const tier2Result = TIER2_EXPERT_NAMES.find((a) => results[a]);
  const tier2ExpertSuccess = tier2Result && results[tier2Result]?.success;

  parts.push(`**Full Analysis Complete**`);
  parts.push(`- Tier 1 (Investigation): ${tier1Success}/${TIER1_AGENT_NAMES.length} agents`);
  if (tier2Result) {
    const expertName = tier2Result.replace("-expert", "").replace(/-/g, " ").toUpperCase();
    parts.push(`- Tier 2 (Sector): ${tier2ExpertSuccess ? "✅" : "❌"} ${expertName} Expert`);
  }
  parts.push(`- Tier 3 (Synthesis): ${tier3Success}/${TIER3_AGENT_NAMES.length} agents`);

  // Get final verdict
  const scorer = results["synthesis-deal-scorer"] as SynthesisDealScorerResult | undefined;
  if (scorer?.success && scorer.data) {
    const { verdict, investmentRecommendation } = scorer.data;
    // P2 — Aucune note de deal restituée (plus de "Score: X/100").
    parts.push(`\n**ANALYSE FINALE**`);
    parts.push(`Profil: ${verdict.replace("_", " ").toUpperCase()}`);
    parts.push(`Signal: ${ACTION_LABELS[investmentRecommendation.action.toLowerCase()] ?? investmentRecommendation.action}`);
    parts.push(`> ${investmentRecommendation.rationale}`);
  }

  // Add Tier 2 sector insights if available
  if (tier2Result && results[tier2Result]?.success && "data" in results[tier2Result]) {
    const sectorData = results[tier2Result].data as {
      sectorFit?: string;
      sectorInsights?: { metric?: string; assessment?: string }[];
    };
    // P2 — Aucun score sectoriel /100 restitué ; on garde le fit qualitatif et
    // les insights observables.
    if (sectorData.sectorFit || (sectorData.sectorInsights && sectorData.sectorInsights.length > 0)) {
      parts.push(`\n**ANALYSE SECTORIELLE**`);
      if (typeof sectorData.sectorFit === "string") {
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
  void _type;
  const parts: string[] = [];

  // P2 — Orientation (pas de note de deal) depuis synthesis-deal-scorer.
  const scorer = results["synthesis-deal-scorer"] as SynthesisDealScorerResult | undefined;
  if (scorer?.success && scorer.data?.verdict) {
    parts.push(`**Profil**: ${ACTION_LABELS[scorer.data.verdict.toLowerCase()] ?? scorer.data.verdict}`);
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
