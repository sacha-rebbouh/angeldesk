/**
 * TIER 1 CROSS-VALIDATION ENGINE - Module deterministe (NO LLM)
 *
 * Verifie la coherence inter-agents Tier 1 APRES leur execution parallele.
 * S'execute entre Tier 1 et Tier 2/3.
 *
 * Cross-validations implementees:
 * - financial-auditor projections vs gtm-analyst capacites (F34)
 * - financial-auditor metrics vs customer-intel retention
 * - Divergence de scores > 30 points entre agents Tier 1 (F39)
 * - Detection outliers statistiques (> 2 ecarts-types)
 */

import type { AgentResult } from "../types";

export interface CrossValidationResult {
  validations: CrossValidation[];
  adjustments: ScoreAdjustment[];
  warnings: string[];
}

export interface CrossValidation {
  id: string;
  type: "PROJECTION_VS_GTM" | "METRICS_VS_RETENTION" | "TEAM_VS_TECH";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  agent1: string;
  agent1Claim: string;
  agent2: string;
  agent2Data: string;
  verdict: "COHERENT" | "MINOR_DIVERGENCE" | "MAJOR_DIVERGENCE" | "CONTRADICTION";
  detail: string;
  suggestedScoreAdjustment?: number;
}

export interface ScoreAdjustment {
  agentName: string;
  field: string;
  before: number;
  after: number;
  reason: string;
  crossValidationId: string;
}

export function runTier1CrossValidation(
  allResults: Record<string, AgentResult>
): CrossValidationResult {
  const validations: CrossValidation[] = [];
  const adjustments: ScoreAdjustment[] = [];
  const warnings: string[] = [];

  // --- CROSS-VALIDATION 1: Projections financieres vs GTM (F34) ---
  const finResult = allResults["financial-auditor"];
  const gtmResult = allResults["gtm-analyst"];

  if (finResult?.success && gtmResult?.success) {
    const finData = (finResult as { data?: Record<string, unknown> }).data;
    const gtmData = (gtmResult as { data?: Record<string, unknown> }).data;

    if (finData && gtmData) {
      const projections = (finData.findings as Record<string, unknown>)?.projections as
        { realistic?: boolean; assumptions?: string[]; concerns?: string[] } | undefined;

      const salesMotion = (gtmData.findings as Record<string, unknown>)?.salesMotion as Record<string, unknown> | undefined;
      const gtmScore = (gtmData.score as { value?: number })?.value ?? 0;
      const finScore = (finData.score as { value?: number })?.value ?? 0;

      // Divergence: projections realistes mais score GTM < 40
      if (projections?.realistic === true && gtmScore < 40) {
        validations.push({
          id: "CV-001",
          type: "PROJECTION_VS_GTM",
          severity: "CRITICAL",
          agent1: "financial-auditor",
          agent1Claim: "Projections jugees realistes",
          agent2: "gtm-analyst",
          agent2Data: `Score GTM = ${gtmScore}/100 (insuffisant pour supporter les projections)`,
          verdict: "MAJOR_DIVERGENCE",
          detail: `Le financial-auditor juge les projections realistes mais le GTM analyst attribue un score de ${gtmScore}/100. Les projections de croissance ne sont pas soutenues par la capacite commerciale.`,
          suggestedScoreAdjustment: -10,
        });

        if (finScore > 50) {
          adjustments.push({
            agentName: "financial-auditor",
            field: "score.value",
            before: finScore,
            after: Math.max(30, finScore - 10),
            reason: `Projections realistes mais GTM score ${gtmScore} < 40 = incoherence`,
            crossValidationId: "CV-001",
          });
        }
      }

      // Divergence: projections realistes mais equipe sales <= 1 personne
      const teamSize = (salesMotion as Record<string, unknown> | undefined)?.teamSize;
      if (typeof teamSize === "number" && teamSize <= 1 && projections?.realistic) {
        validations.push({
          id: "CV-002",
          type: "PROJECTION_VS_GTM",
          severity: "HIGH",
          agent1: "financial-auditor",
          agent1Claim: "Projections jugees realistes",
          agent2: "gtm-analyst",
          agent2Data: `Equipe sales: ${teamSize} personne(s)`,
          verdict: "MAJOR_DIVERGENCE",
          detail: "Les projections financieres sont validees mais l'equipe commerciale est sous-dimensionnee pour les atteindre.",
        });
      }
    }
  } else {
    if (!finResult?.success) warnings.push("financial-auditor indisponible pour cross-validation");
    if (!gtmResult?.success) warnings.push("gtm-analyst indisponible pour cross-validation");
  }

  // --- CROSS-VALIDATION 2: Metrics financieres vs retention client ---
  const custResult = allResults["customer-intel"];
  if (finResult?.success && custResult?.success) {
    const finData = (finResult as { data?: Record<string, unknown> }).data;
    const custData = (custResult as { data?: Record<string, unknown> }).data;

    if (finData && custData) {
      const custFindings = custData.findings as Record<string, unknown> | undefined;
      const pmf = custFindings?.pmf as { pmfVerdict?: string; pmfScore?: number } | undefined;

      const finScore = (finData.score as { value?: number })?.value ?? 0;
      if (finScore > 65 && pmf?.pmfVerdict === "NOT_DEMONSTRATED") {
        validations.push({
          id: "CV-003",
          type: "METRICS_VS_RETENTION",
          severity: "HIGH",
          agent1: "financial-auditor",
          agent1Claim: `Score financier = ${finScore}/100`,
          agent2: "customer-intel",
          agent2Data: `PMF = NOT_DEMONSTRATED (score ${pmf.pmfScore ?? 0})`,
          verdict: "MAJOR_DIVERGENCE",
          detail: "Les metriques financieres semblent saines mais le PMF n'est pas demontre. Les chiffres actuels pourraient ne pas etre reproductibles.",
        });
      }
    }
  }

  // --- DIVERGENCE DETECTOR: Scores Tier 1 (F39) ---
  const tier1Agents = [
    "financial-auditor", "team-investigator", "competitive-intel",
    "market-intelligence", "tech-stack-dd", "tech-ops-dd",
    "legal-regulatory", "gtm-analyst", "customer-intel",
    "exit-strategist", "deck-forensics", "cap-table-auditor",
  ];

  const agentScores: { name: string; score: number }[] = [];
  for (const agentName of tier1Agents) {
    const result = allResults[agentName];
    if (!result?.success) continue;
    const data = (result as { data?: Record<string, unknown> }).data;
    const score = (data?.score as { value?: number })?.value;
    if (typeof score === "number") {
      agentScores.push({ name: agentName, score });
    }
  }

  // Detect major divergences (> 30 points)
  for (let i = 0; i < agentScores.length; i++) {
    for (let j = i + 1; j < agentScores.length; j++) {
      const delta = Math.abs(agentScores[i].score - agentScores[j].score);
      if (delta > 30) {
        validations.push({
          id: `CV-DIV-${i}-${j}`,
          type: "METRICS_VS_RETENTION",
          severity: delta > 50 ? "CRITICAL" : "HIGH",
          agent1: agentScores[i].name,
          agent1Claim: `Score = ${agentScores[i].score}/100`,
          agent2: agentScores[j].name,
          agent2Data: `Score = ${agentScores[j].score}/100`,
          verdict: delta > 50 ? "CONTRADICTION" : "MAJOR_DIVERGENCE",
          detail: `Divergence de ${delta} points entre ${agentScores[i].name} (${agentScores[i].score}) et ${agentScores[j].name} (${agentScores[j].score}). Necessite investigation.`,
        });
      }
    }
  }

  // Detect statistical outliers (> 2 standard deviations)
  if (agentScores.length >= 5) {
    const mean = agentScores.reduce((s, a) => s + a.score, 0) / agentScores.length;
    const stdDev = Math.sqrt(agentScores.reduce((s, a) => s + Math.pow(a.score - mean, 2), 0) / agentScores.length);

    if (stdDev > 0) {
      for (const agent of agentScores) {
        if (Math.abs(agent.score - mean) > 2 * stdDev) {
          warnings.push(
            `OUTLIER: ${agent.name} score ${agent.score} est a ${((agent.score - mean) / stdDev).toFixed(1)} ecarts-types de la moyenne (${mean.toFixed(0)} +/- ${stdDev.toFixed(0)})`
          );
        }
      }
    }
  }

  return { validations, adjustments, warnings };
}
