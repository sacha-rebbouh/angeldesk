/**
 * Finding Extractor
 * Extracts findings and confidence from Standard agents for Consensus/Reflexion engines
 */

import type { ScoredFinding, ConfidenceScore, FindingCategory, Evidence } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import type { AgentResult } from "../types";
import type { AgentFactValidation } from "@/services/fact-store/current-facts";

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedAgentData {
  agentName: string;
  confidence: ConfidenceScore;
  findings: ScoredFinding[];
  rawData: unknown;
}

// Agent data structure (common pattern across Standard agents)
interface AgentData {
  meta?: {
    agentName?: string;
    confidenceLevel?: number;
    dataCompleteness?: string;
    limitations?: string[];
  };
  score?: {
    value?: number;
    breakdown?: Array<{
      criterion?: string;
      score?: number;
      justification?: string;
    }>;
  };
  findings?: Record<string, unknown>;
  redFlags?: Array<{
    id?: string;
    title?: string;
    severity?: string;
    category?: string;
    description?: string;
    evidence?: string;
    impact?: string;
  }>;
}

// ============================================================================
// MAIN EXTRACTOR
// ============================================================================

/**
 * Extract findings and confidence from any Standard agent result
 */
export function extractAgentData(result: AgentResult): ExtractedAgentData | null {
  if (!result.success) {
    return null;
  }

  const data = (result as { data?: AgentData }).data;
  if (!data) {
    return null;
  }

  const agentName = result.agentName;

  // Extract confidence
  const confidence = extractConfidence(data, agentName);

  // Extract and convert findings to ScoredFinding format
  const findings = extractFindings(data, agentName);

  return {
    agentName,
    confidence,
    findings,
    rawData: data,
  };
}

// ============================================================================
// CONFIDENCE EXTRACTION
// ============================================================================

function extractConfidence(data: AgentData, agentName: string): ConfidenceScore {
  const confidenceLevel = data.meta?.confidenceLevel ?? 0;
  const dataCompleteness = data.meta?.dataCompleteness ?? "minimal";
  const limitations = data.meta?.limitations ?? [];

  // Map data completeness to score modifier
  const completenessModifier: Record<string, number> = {
    complete: 1.0,
    partial: 0.7,
    minimal: 0.4,
  };

  const modifier = completenessModifier[dataCompleteness] ?? 0.5;

  // Calculate adjusted confidence
  const adjustedScore = Math.min(100, Math.max(0, confidenceLevel * modifier));

  // Penalty for limitations
  const limitationPenalty = Math.min(20, limitations.length * 5);
  const finalScore = Math.max(0, adjustedScore - limitationPenalty);

  return confidenceCalculator.calculate({
    dataAvailability: finalScore,
    evidenceQuality: confidenceLevel,
  });
}

// ============================================================================
// FINDINGS EXTRACTION
// ============================================================================

function extractFindings(data: AgentData, agentName: string): ScoredFinding[] {
  const findings: ScoredFinding[] = [];
  const baseConfidence = data.meta?.confidenceLevel ?? 0;

  // Extract from score breakdown (all agents have this)
  if (data.score?.breakdown) {
    for (const item of data.score.breakdown) {
      if (item.criterion && item.score !== undefined) {
        findings.push(createScoredFinding({
          agentName,
          metric: item.criterion,
          category: inferCategory(agentName),
          value: item.score,
          unit: "score",
          assessment: assessScore(item.score),
          confidence: baseConfidence,
          evidence: item.justification ? [{ content: item.justification }] : [],
        }));
      }
    }
  }

  // Extract from agent-specific findings
  if (data.findings) {
    const agentFindings = extractAgentSpecificFindings(data.findings, agentName, baseConfidence);
    findings.push(...agentFindings);
  }

  // Extract from red flags (as negative findings)
  if (data.redFlags) {
    for (const flag of data.redFlags) {
      if (flag.title) {
        findings.push(createScoredFinding({
          agentName,
          metric: `red_flag_${flag.id ?? crypto.randomUUID().slice(0, 8)}`,
          category: mapRedFlagCategory(flag.category),
          value: flag.severity === "critical" ? 0 : flag.severity === "high" ? 25 : 50,
          unit: "severity",
          assessment: flag.severity ?? "moderate",
          confidence: baseConfidence,
          evidence: [
            { content: flag.description ?? flag.title },
            ...(flag.evidence ? [{ content: flag.evidence }] : []),
          ],
        }));
      }
    }
  }

  return findings;
}

// ============================================================================
// AGENT-SPECIFIC EXTRACTORS
// ============================================================================

function extractAgentSpecificFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const extractors: Record<string, (f: Record<string, unknown>, a: string, c: number) => ScoredFinding[]> = {
    "financial-auditor": extractFinancialFindings,
    "team-investigator": extractTeamFindings,
    "market-intelligence": extractMarketFindings,
    "competitive-intel": extractCompetitiveFindings,
    "deck-forensics": extractDeckForensicsFindings,
    "exit-strategist": extractExitFindings,
    "tech-stack-dd": extractTechStackFindings,
    "tech-ops-dd": extractTechOpsFindings,
    "legal-regulatory": extractLegalFindings,
    "gtm-analyst": extractGtmFindings,
    "customer-intel": extractCustomerFindings,
    "cap-table-auditor": extractCapTableFindings,
    "question-master": extractQuestionMasterFindings,
  };

  const extractor = extractors[agentName];
  if (extractor) {
    result.push(...extractor(findings, agentName, baseConfidence));
  } else {
    result.push(...extractGenericFindings(findings, agentName, baseConfidence));
  }

  return result;
}

function extractFinancialFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  // Extract metrics
  const metrics = findings.metrics as Array<{
    metric?: string;
    reportedValue?: number;
    calculatedValue?: number;
    status?: string;
    benchmarkP25?: number;
    benchmarkMedian?: number;
    benchmarkP75?: number;
  }> | undefined;

  if (metrics) {
    for (const m of metrics) {
      if (m.metric) {
        const value = m.calculatedValue ?? m.reportedValue;
        result.push(createScoredFinding({
          agentName,
          metric: m.metric,
          category: "financial",
          value: value ?? null,
          unit: inferUnit(m.metric),
          assessment: m.status ?? "unknown",
          confidence: baseConfidence,
          benchmarkData: m.benchmarkMedian ? {
            sector: "unknown",
            stage: "unknown",
            metric: m.metric,
            p25: m.benchmarkP25 ?? 0,
            median: m.benchmarkMedian,
            p75: m.benchmarkP75 ?? 0,
            source: "agent",
          } : undefined,
          evidence: [],
        }));
      }
    }
  }

  // Extract valuation
  const valuation = findings.valuation as {
    askingValuation?: number;
    impliedMultiple?: number;
    assessment?: string;
  } | undefined;

  if (valuation?.askingValuation) {
    result.push(createScoredFinding({
      agentName,
      metric: "valuation",
      category: "financial",
      value: valuation.askingValuation,
      unit: "EUR",
      assessment: valuation.assessment ?? "unknown",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  // Extract burn
  const burn = findings.burn as {
    monthlyBurn?: number;
    runway?: number;
  } | undefined;

  if (burn?.monthlyBurn) {
    result.push(createScoredFinding({
      agentName,
      metric: "monthly_burn",
      category: "financial",
      value: burn.monthlyBurn,
      unit: "EUR/month",
      assessment: burn.runway && burn.runway > 12 ? "healthy" : "concerning",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

function extractTeamFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  // Extract founder profiles
  const founders = findings.founderProfiles as Array<{
    name?: string;
    role?: string;
    overallAssessment?: string;
    yearsExperience?: number;
  }> | undefined;

  if (founders) {
    for (const founder of founders) {
      if (founder.name) {
        result.push(createScoredFinding({
          agentName,
          metric: `founder_${founder.name.toLowerCase().replace(/\s+/g, "_")}`,
          category: "team",
          value: founder.yearsExperience ?? null,
          unit: "years",
          assessment: founder.overallAssessment ?? "unknown",
          confidence: baseConfidence,
          evidence: [],
        }));
      }
    }
  }

  // Extract team composition
  const composition = findings.teamComposition as {
    teamSize?: number;
    gaps?: Array<{ area?: string }>;
  } | undefined;

  if (composition?.teamSize) {
    result.push(createScoredFinding({
      agentName,
      metric: "team_size",
      category: "team",
      value: composition.teamSize,
      unit: "people",
      assessment: composition.teamSize >= 3 ? "adequate" : "small",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

function extractMarketFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  // Extract market size
  const marketSize = findings.marketSize as {
    tam?: number;
    sam?: number;
    som?: number;
    assessment?: string;
  } | undefined;

  if (marketSize) {
    if (marketSize.tam) {
      result.push(createScoredFinding({
        agentName,
        metric: "tam",
        category: "market",
        value: marketSize.tam,
        unit: "EUR",
        assessment: marketSize.assessment ?? "unknown",
        confidence: baseConfidence,
        evidence: [],
      }));
    }
    if (marketSize.sam) {
      result.push(createScoredFinding({
        agentName,
        metric: "sam",
        category: "market",
        value: marketSize.sam,
        unit: "EUR",
        assessment: marketSize.assessment ?? "unknown",
        confidence: baseConfidence,
        evidence: [],
      }));
    }
  }

  // Extract timing
  const timing = findings.timing as {
    assessment?: string;
    score?: number;
  } | undefined;

  if (timing?.score) {
    result.push(createScoredFinding({
      agentName,
      metric: "market_timing",
      category: "market",
      value: timing.score,
      unit: "score",
      assessment: timing.assessment ?? "unknown",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

function extractCompetitiveFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  // Extract competitors
  const competitors = findings.competitors as Array<{
    name?: string;
    threatLevel?: string;
  }> | undefined;

  if (competitors) {
    result.push(createScoredFinding({
      agentName,
      metric: "competitor_count",
      category: "competitive",
      value: competitors.length,
      unit: "competitors",
      assessment: competitors.length > 5 ? "crowded" : competitors.length > 2 ? "competitive" : "emerging",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  // Extract moat
  const moat = findings.moatAnalysis as {
    overallMoatStrength?: string;
    score?: number;
  } | undefined;

  if (moat?.score) {
    result.push(createScoredFinding({
      agentName,
      metric: "moat_strength",
      category: "competitive",
      value: moat.score,
      unit: "score",
      assessment: moat.overallMoatStrength ?? "unknown",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

// ============================================================================
// DECK FORENSICS
// ============================================================================

function extractDeckForensicsFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const narrative = findings.narrativeAnalysis as {
    storyCoherence?: number;
    credibilityAssessment?: string;
    criticalMissingInfo?: Array<{ info: string; whyItMatters: string }>;
  } | undefined;

  if (narrative?.storyCoherence !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "story_coherence",
      category: "product",
      value: narrative.storyCoherence,
      unit: "score",
      assessment: narrative.credibilityAssessment ?? assessScore(narrative.storyCoherence),
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  const claims = findings.claimVerification as Array<{
    claim?: string;
    status?: string;
    category?: string;
    evidence?: string;
  }> | undefined;

  if (claims) {
    const contradicted = claims.filter(c => c.status === "CONTRADICTED" || c.status === "MISLEADING");
    if (contradicted.length > 0) {
      result.push(createScoredFinding({
        agentName,
        metric: "contradicted_claims",
        category: "product",
        value: contradicted.length,
        unit: "claims",
        assessment: contradicted.length > 3 ? "poor" : "concerning",
        confidence: baseConfidence,
        evidence: contradicted.slice(0, 3).map(c => ({ content: `${c.claim}: ${c.evidence ?? c.status}` })),
      }));
    }
  }

  const inconsistencies = findings.inconsistencies as Array<{
    issue?: string;
    severity?: string;
  }> | undefined;

  if (inconsistencies && inconsistencies.length > 0) {
    result.push(createScoredFinding({
      agentName,
      metric: "inconsistency_count",
      category: "product",
      value: inconsistencies.length,
      unit: "issues",
      assessment: inconsistencies.length > 3 ? "poor" : "concerning",
      confidence: baseConfidence,
      evidence: inconsistencies.slice(0, 3).map(i => ({ content: i.issue ?? "Inconsistency detected" })),
    }));
  }

  return result;
}

// ============================================================================
// EXIT STRATEGIST
// ============================================================================

function extractExitFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const scenarios = findings.scenarios as Array<{
    type?: string;
    name?: string;
    probability?: { percentage?: number; level?: string };
    timeline?: { estimatedYears?: number };
    exitValuation?: { estimated?: number };
    investorReturn?: { multiple?: number };
  }> | undefined;

  if (scenarios) {
    for (const scenario of scenarios) {
      if (scenario.name && scenario.probability?.percentage !== undefined) {
        result.push(createScoredFinding({
          agentName,
          metric: `exit_${scenario.type ?? "scenario"}_${scenario.name.toLowerCase().replace(/\s+/g, "_")}`,
          category: "exit",
          value: scenario.probability.percentage,
          unit: "%",
          assessment: scenario.probability.level ?? "unknown",
          confidence: baseConfidence,
          evidence: [
            ...(scenario.timeline?.estimatedYears ? [{ content: `Timeline: ${scenario.timeline.estimatedYears} years` }] : []),
            ...(scenario.investorReturn?.multiple ? [{ content: `Return multiple: ${scenario.investorReturn.multiple}x` }] : []),
          ],
        }));
      }
    }

    // Best case return multiple
    const bestReturn = scenarios.reduce((max, s) => {
      const m = s.investorReturn?.multiple ?? 0;
      return m > max ? m : max;
    }, 0);

    if (bestReturn > 0) {
      result.push(createScoredFinding({
        agentName,
        metric: "best_return_multiple",
        category: "exit",
        value: bestReturn,
        unit: "x",
        assessment: bestReturn >= 10 ? "exceptional" : bestReturn >= 5 ? "above_average" : bestReturn >= 3 ? "average" : "below_average",
        confidence: baseConfidence,
        evidence: [],
      }));
    }
  }

  return result;
}

// ============================================================================
// TECH STACK DD
// ============================================================================

function extractTechStackFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const techStack = findings.techStack as {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    assessment?: string;
  } | undefined;

  if (techStack?.assessment) {
    result.push(createScoredFinding({
      agentName,
      metric: "stack_assessment",
      category: "technical",
      value: null,
      unit: "assessment",
      assessment: techStack.assessment,
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  const scalability = findings.scalability as {
    currentCapacity?: string;
    bottlenecks?: Array<{ area?: string; severity?: string }>;
    score?: number;
  } | undefined;

  if (scalability?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "scalability_score",
      category: "technical",
      value: scalability.score,
      unit: "score",
      assessment: assessScore(scalability.score),
      confidence: baseConfidence,
      evidence: (scalability.bottlenecks ?? []).slice(0, 3).map(b => ({ content: `Bottleneck: ${b.area} (${b.severity})` })),
    }));
  }

  const debt = findings.technicalDebt as {
    level?: string;
    estimatedCost?: number;
    impactOnVelocity?: string;
    score?: number;
  } | undefined;

  if (debt?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "technical_debt",
      category: "technical",
      value: debt.score,
      unit: "score",
      assessment: debt.level ?? assessScore(debt.score),
      confidence: baseConfidence,
      evidence: debt.estimatedCost ? [{ content: `Estimated remediation cost: ${debt.estimatedCost}` }] : [],
    }));
  }

  const risks = findings.technicalRisks as Array<{
    risk?: string;
    severity?: string;
    category?: string;
  }> | undefined;

  if (risks) {
    const criticalRisks = risks.filter(r => r.severity === "CRITICAL" || r.severity === "HIGH");
    if (criticalRisks.length > 0) {
      result.push(createScoredFinding({
        agentName,
        metric: "critical_tech_risks",
        category: "technical",
        value: criticalRisks.length,
        unit: "risks",
        assessment: criticalRisks.length > 3 ? "poor" : "concerning",
        confidence: baseConfidence,
        evidence: criticalRisks.slice(0, 3).map(r => ({ content: r.risk ?? "Risk identified" })),
      }));
    }
  }

  return result;
}

// ============================================================================
// TECH OPS DD
// ============================================================================

function extractTechOpsFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const security = findings.security as {
    score?: number;
    level?: string;
    issues?: Array<{ issue?: string; severity?: string }>;
  } | undefined;

  if (security?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "security_score",
      category: "technical",
      value: security.score,
      unit: "score",
      assessment: security.level ?? assessScore(security.score),
      confidence: baseConfidence,
      evidence: (security.issues ?? []).slice(0, 3).map(i => ({ content: `${i.issue} (${i.severity})` })),
    }));
  }

  const maturity = findings.maturity as {
    score?: number;
    level?: string;
    ciCd?: boolean;
    monitoring?: boolean;
    incidentProcess?: boolean;
  } | undefined;

  if (maturity?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "ops_maturity",
      category: "technical",
      value: maturity.score,
      unit: "score",
      assessment: maturity.level ?? assessScore(maturity.score),
      confidence: baseConfidence,
      evidence: [
        ...(maturity.ciCd !== undefined ? [{ content: `CI/CD: ${maturity.ciCd ? "Yes" : "No"}` }] : []),
        ...(maturity.monitoring !== undefined ? [{ content: `Monitoring: ${maturity.monitoring ? "Yes" : "No"}` }] : []),
      ],
    }));
  }

  const team = findings.teamCapability as {
    score?: number;
    seniorityMix?: string;
    gaps?: string[];
  } | undefined;

  if (team?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "tech_team_capability",
      category: "technical",
      value: team.score,
      unit: "score",
      assessment: assessScore(team.score),
      confidence: baseConfidence,
      evidence: (team.gaps ?? []).slice(0, 3).map(g => ({ content: `Gap: ${g}` })),
    }));
  }

  const ip = findings.ipProtection as {
    score?: number;
    patents?: number;
    trademarks?: number;
    assessment?: string;
  } | undefined;

  if (ip?.score !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "ip_protection",
      category: "technical",
      value: ip.score,
      unit: "score",
      assessment: ip.assessment ?? assessScore(ip.score),
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

// ============================================================================
// LEGAL-REGULATORY
// ============================================================================

function extractLegalFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const structure = findings.structureAnalysis as {
    entityType?: string;
    jurisdiction?: string;
    appropriateness?: string;
    vestingInPlace?: boolean;
    shareholderAgreement?: string;
    concerns?: string[];
  } | undefined;

  if (structure) {
    result.push(createScoredFinding({
      agentName,
      metric: "legal_structure",
      category: "legal",
      value: structure.appropriateness === "APPROPRIATE" ? 80 : structure.appropriateness === "SUBOPTIMAL" ? 50 : 20,
      unit: "score",
      assessment: structure.appropriateness ?? "unknown",
      confidence: baseConfidence,
      evidence: [
        ...(structure.entityType ? [{ content: `Entity: ${structure.entityType} (${structure.jurisdiction ?? "unknown"})` }] : []),
        { content: `Vesting: ${structure.vestingInPlace ? "Yes" : "No"}` },
        { content: `Shareholder agreement: ${structure.shareholderAgreement ?? "unknown"}` },
      ],
    }));
  }

  const compliance = findings.compliance as Array<{
    area?: string;
    status?: string;
    risk?: string;
    gaps?: string[];
  }> | undefined;

  if (compliance) {
    const nonCompliant = compliance.filter(c => c.status === "NON_COMPLIANT" || c.risk === "HIGH");
    if (nonCompliant.length > 0) {
      result.push(createScoredFinding({
        agentName,
        metric: "compliance_gaps",
        category: "legal",
        value: nonCompliant.length,
        unit: "areas",
        assessment: nonCompliant.length > 2 ? "poor" : "concerning",
        confidence: baseConfidence,
        evidence: nonCompliant.slice(0, 3).map(c => ({ content: `${c.area}: ${c.status} (risk: ${c.risk})` })),
      }));
    }
  }

  const litigationRisk = findings.litigationRisk as {
    riskLevel?: string;
    currentLitigation?: boolean;
    details?: string;
  } | undefined;

  if (litigationRisk) {
    result.push(createScoredFinding({
      agentName,
      metric: "litigation_risk",
      category: "legal",
      value: litigationRisk.riskLevel === "CRITICAL" ? 0 : litigationRisk.riskLevel === "HIGH" ? 25 : litigationRisk.riskLevel === "MEDIUM" ? 50 : 75,
      unit: "score",
      assessment: litigationRisk.riskLevel ?? "unknown",
      confidence: baseConfidence,
      evidence: [
        { content: `Active litigation: ${litigationRisk.currentLitigation ? "Yes" : "No"}` },
        ...(litigationRisk.details ? [{ content: litigationRisk.details }] : []),
      ],
    }));
  }

  return result;
}

// ============================================================================
// GTM ANALYST
// ============================================================================

function extractGtmFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const channels = findings.channels as Array<{
    channel?: string;
    type?: string;
    contribution?: { revenuePercent?: number };
    economics?: {
      cac?: number;
      ltv?: number;
      ltvCacRatio?: number;
      cacPaybackMonths?: number;
    };
  }> | undefined;

  if (channels) {
    for (const ch of channels) {
      if (ch.economics?.ltvCacRatio !== undefined) {
        result.push(createScoredFinding({
          agentName,
          metric: `ltv_cac_${ch.channel?.toLowerCase().replace(/\s+/g, "_") ?? "channel"}`,
          category: "gtm",
          value: ch.economics.ltvCacRatio,
          unit: "x",
          assessment: ch.economics.ltvCacRatio >= 3 ? "healthy" : ch.economics.ltvCacRatio >= 1 ? "marginal" : "unsustainable",
          confidence: baseConfidence,
          evidence: [
            ...(ch.economics.cac ? [{ content: `CAC: ${ch.economics.cac}` }] : []),
            ...(ch.economics.ltv ? [{ content: `LTV: ${ch.economics.ltv}` }] : []),
          ],
        }));
      }
    }

    // Overall channel count
    result.push(createScoredFinding({
      agentName,
      metric: "gtm_channel_count",
      category: "gtm",
      value: channels.length,
      unit: "channels",
      assessment: channels.length >= 3 ? "diversified" : channels.length >= 2 ? "developing" : "concentrated",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  const salesCycle = findings.salesCycle as {
    averageDays?: number;
    assessment?: string;
  } | undefined;

  if (salesCycle?.averageDays !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "sales_cycle_days",
      category: "gtm",
      value: salesCycle.averageDays,
      unit: "days",
      assessment: salesCycle.assessment ?? "unknown",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  return result;
}

// ============================================================================
// CUSTOMER INTEL
// ============================================================================

function extractCustomerFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const icp = findings.icp as {
    icpClarity?: string;
    description?: string;
  } | undefined;

  if (icp?.icpClarity) {
    result.push(createScoredFinding({
      agentName,
      metric: "icp_clarity",
      category: "customer",
      value: icp.icpClarity === "CLEAR" ? 80 : icp.icpClarity === "PARTIAL" ? 50 : 20,
      unit: "score",
      assessment: icp.icpClarity,
      confidence: baseConfidence,
      evidence: icp.description ? [{ content: icp.description }] : [],
    }));
  }

  const customerBase = findings.customerBase as {
    totalCustomers?: number;
    payingCustomers?: number;
    customerQuality?: string;
  } | undefined;

  if (customerBase) {
    if (customerBase.payingCustomers !== undefined) {
      result.push(createScoredFinding({
        agentName,
        metric: "paying_customers",
        category: "customer",
        value: customerBase.payingCustomers,
        unit: "customers",
        assessment: customerBase.customerQuality ?? "unknown",
        confidence: baseConfidence,
        evidence: [],
      }));
    }
  }

  const concentration = findings.concentration as {
    topCustomerRevenue?: number;
    top5Revenue?: number;
  } | undefined;

  if (concentration?.topCustomerRevenue !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "customer_concentration",
      category: "customer",
      value: concentration.topCustomerRevenue,
      unit: "%",
      assessment: concentration.topCustomerRevenue > 50 ? "critical" : concentration.topCustomerRevenue > 30 ? "concerning" : "healthy",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  const pmf = findings.pmf as {
    pmfVerdict?: string;
    score?: number;
    nps?: number;
  } | undefined;

  if (pmf) {
    if (pmf.score !== undefined) {
      result.push(createScoredFinding({
        agentName,
        metric: "pmf_score",
        category: "customer",
        value: pmf.score,
        unit: "score",
        assessment: pmf.pmfVerdict ?? assessScore(pmf.score),
        confidence: baseConfidence,
        evidence: pmf.nps !== undefined ? [{ content: `NPS: ${pmf.nps}` }] : [],
      }));
    }
  }

  return result;
}

// ============================================================================
// CAP TABLE AUDITOR
// ============================================================================

function extractCapTableFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const dataAvailability = findings.dataAvailability as {
    dataQuality?: string;
    capTableProvided?: boolean;
    termSheetProvided?: boolean;
    missingCriticalInfo?: string[];
  } | undefined;

  if (dataAvailability) {
    result.push(createScoredFinding({
      agentName,
      metric: "cap_table_data_quality",
      category: "structure",
      value: dataAvailability.dataQuality === "COMPLETE" ? 90 : dataAvailability.dataQuality === "PARTIAL" ? 60 : dataAvailability.dataQuality === "MINIMAL" ? 30 : 10,
      unit: "score",
      assessment: dataAvailability.dataQuality ?? "unknown",
      confidence: baseConfidence,
      evidence: (dataAvailability.missingCriticalInfo ?? []).slice(0, 3).map(m => ({ content: `Missing: ${m}` })),
    }));
  }

  const dilution = findings.dilutionProjection as {
    founderDilutionAtSeriesA?: number;
    founderOwnershipPostRound?: number;
  } | undefined;

  if (dilution?.founderOwnershipPostRound !== undefined) {
    result.push(createScoredFinding({
      agentName,
      metric: "founder_ownership_post_round",
      category: "structure",
      value: dilution.founderOwnershipPostRound,
      unit: "%",
      assessment: dilution.founderOwnershipPostRound >= 60 ? "healthy" : dilution.founderOwnershipPostRound >= 40 ? "acceptable" : "concerning",
      confidence: baseConfidence,
      evidence: [],
    }));
  }

  const structuralIssues = findings.structuralIssues as Array<{
    issue?: string;
    severity?: string;
    impact?: string;
  }> | undefined;

  if (structuralIssues && structuralIssues.length > 0) {
    const critical = structuralIssues.filter(i => i.severity === "CRITICAL" || i.severity === "HIGH");
    result.push(createScoredFinding({
      agentName,
      metric: "structural_issues",
      category: "structure",
      value: critical.length,
      unit: "issues",
      assessment: critical.length > 2 ? "poor" : critical.length > 0 ? "concerning" : "clean",
      confidence: baseConfidence,
      evidence: critical.slice(0, 3).map(i => ({ content: `${i.issue} (${i.severity}): ${i.impact ?? ""}` })),
    }));
  }

  return result;
}

// ============================================================================
// QUESTION MASTER
// ============================================================================

function extractQuestionMasterFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  const questions = findings.founderQuestions as Array<{
    priority?: string;
    category?: string;
    question?: string;
    context?: { whyItMatters?: string };
  }> | undefined;

  if (questions) {
    const criticalQuestions = questions.filter(q => q.priority === "CRITICAL");
    if (criticalQuestions.length > 0) {
      result.push(createScoredFinding({
        agentName,
        metric: "critical_questions",
        category: "team",
        value: criticalQuestions.length,
        unit: "questions",
        assessment: criticalQuestions.length > 5 ? "many_concerns" : "normal",
        confidence: baseConfidence,
        evidence: criticalQuestions.slice(0, 3).map(q => ({ content: q.question ?? "Question identified" })),
      }));
    }
  }

  const dealbreakers = findings.dealbreakers as Array<{
    condition?: string;
    category?: string;
  }> | undefined;

  if (dealbreakers && dealbreakers.length > 0) {
    result.push(createScoredFinding({
      agentName,
      metric: "potential_dealbreakers",
      category: "team",
      value: dealbreakers.length,
      unit: "dealbreakers",
      assessment: "critical",
      confidence: baseConfidence,
      evidence: dealbreakers.slice(0, 3).map(d => ({ content: d.condition ?? "Dealbreaker condition" })),
    }));
  }

  return result;
}

// ============================================================================
// GENERIC FALLBACK
// ============================================================================

function extractGenericFindings(
  findings: Record<string, unknown>,
  agentName: string,
  baseConfidence: number
): ScoredFinding[] {
  const result: ScoredFinding[] = [];

  // Recursively extract numeric values from findings
  function extractNumericValues(obj: Record<string, unknown>, prefix: string = ""): void {
    for (const [key, value] of Object.entries(obj)) {
      const metricName = prefix ? `${prefix}_${key}` : key;

      if (typeof value === "number") {
        result.push(createScoredFinding({
          agentName,
          metric: metricName,
          category: inferCategory(agentName),
          value,
          unit: inferUnit(metricName),
          assessment: "extracted",
          confidence: baseConfidence * 0.8, // Lower confidence for generic extraction
          evidence: [],
        }));
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        extractNumericValues(value as Record<string, unknown>, metricName);
      }
    }
  }

  extractNumericValues(findings);
  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function createScoredFinding(params: {
  agentName: string;
  metric: string;
  category: FindingCategory;
  value: number | string | null;
  unit: string;
  assessment: string;
  confidence: number;
  evidence: Array<{ content: string }>;
  benchmarkData?: {
    sector: string;
    stage: string;
    metric: string;
    p25: number;
    median: number;
    p75: number;
    source: string;
  };
}): ScoredFinding {
  const evidenceItems: Evidence[] = params.evidence.map((e) => ({
    type: "inference" as const,
    content: e.content,
    source: params.agentName,
    confidence: params.confidence / 100,
  }));

  return {
    id: `${params.agentName}_${params.metric}_${crypto.randomUUID().slice(0, 8)}`,
    agentName: params.agentName,
    metric: params.metric,
    category: params.category,
    value: params.value,
    unit: params.unit,
    assessment: params.assessment,
    confidence: confidenceCalculator.calculate({
      dataAvailability: params.confidence,
    }),
    evidence: evidenceItems,
    benchmarkData: params.benchmarkData,
    createdAt: new Date(),
  };
}

function inferCategory(agentName: string): FindingCategory {
  const mapping: Record<string, FindingCategory> = {
    "financial-auditor": "financial",
    "team-investigator": "team",
    "market-intelligence": "market",
    "competitive-intel": "competitive",
    "deck-forensics": "product",
    "exit-strategist": "exit",
    "tech-stack-dd": "technical",
    "tech-ops-dd": "technical",
    "legal-regulatory": "legal",
    "gtm-analyst": "gtm",
    "customer-intel": "customer",
    "cap-table-auditor": "structure",
    "question-master": "team",
  };
  return mapping[agentName] ?? "financial";
}

function inferUnit(metric: string): string {
  const lower = metric.toLowerCase();
  if (lower.includes("rate") || lower.includes("margin") || lower.includes("growth")) return "%";
  if (lower.includes("burn") || lower.includes("revenue") || lower.includes("arr")) return "EUR";
  if (lower.includes("runway")) return "months";
  if (lower.includes("multiple")) return "x";
  if (lower.includes("ratio")) return "x";
  if (lower.includes("count") || lower.includes("size")) return "count";
  return "value";
}

function assessScore(score: number): string {
  if (score >= 80) return "exceptional";
  if (score >= 60) return "above_average";
  if (score >= 40) return "average";
  if (score >= 20) return "below_average";
  return "poor";
}

function mapRedFlagCategory(category?: string): FindingCategory {
  const mapping: Record<string, FindingCategory> = {
    TEAM: "team",
    FINANCIAL: "financial",
    MARKET: "market",
    PRODUCT: "product",
    LEGAL: "legal",
    TECHNICAL: "technical",
  };
  return mapping[category ?? ""] ?? "financial";
}

// ============================================================================
// VALIDATED CLAIMS EXTRACTION (for sequential pipeline)
// ============================================================================

/**
 * Extract validated claims from deck-forensics or financial-auditor output.
 * Maps agent-specific output structures to AgentFactValidation format
 * for in-memory Fact Store updates between pipeline phases.
 */
export function extractValidatedClaims(
  result: AgentResult,
  agentName: string
): AgentFactValidation[] {
  if (!result.success) return [];

  const data = (result as { data?: Record<string, unknown> }).data;
  if (!data) return [];

  if (agentName === "deck-forensics") {
    return extractDeckForensicsValidations(data);
  }

  if (agentName === "financial-auditor") {
    return extractFinancialAuditorValidations(data);
  }

  if (agentName === "team-investigator") {
    return extractTeamInvestigatorValidations(data);
  }

  if (agentName === "competitive-intel") {
    return extractCompetitiveIntelValidations(data);
  }

  if (agentName === "market-intelligence") {
    return extractMarketIntelligenceValidations(data);
  }

  // Log unsupported agents so we know when validation extraction should be added
  const SUPPORTED_AGENTS = ["deck-forensics", "financial-auditor", "team-investigator", "competitive-intel", "market-intelligence"];
  if (!SUPPORTED_AGENTS.includes(agentName)) {
    console.warn(`[extractValidatedClaims] Agent "${agentName}" has no validation extractor — claims not extracted`);
  }

  return [];
}

function extractDeckForensicsValidations(data: Record<string, unknown>): AgentFactValidation[] {
  const validations: AgentFactValidation[] = [];

  const findings = data.findings as Record<string, unknown> | undefined;
  if (!findings) return [];

  const claims = findings.claimVerification as Array<{
    claim?: string;
    status?: string;
    evidence?: string;
    category?: string;
  }> | undefined;

  if (!claims) return [];

  for (const claim of claims) {
    if (!claim.claim || !claim.status) continue;

    // Map claim category + content to fact key prefix
    const factKeyPrefix = mapClaimCategoryToFactKey(claim.category, claim.claim);
    if (!factKeyPrefix) continue;

    const statusMap: Record<string, AgentFactValidation['status']> = {
      'VERIFIED': 'VERIFIED',
      'CONTRADICTED': 'CONTRADICTED',
      'EXAGGERATED': 'CONTRADICTED',
      'MISLEADING': 'CONTRADICTED',
      'UNVERIFIED': 'UNVERIFIABLE',
    };

    const status = statusMap[claim.status];
    if (!status) continue;

    const confidenceMap: Record<AgentFactValidation['status'], number> = {
      'VERIFIED': 92,
      'CONTRADICTED': 15,
      'UNVERIFIABLE': 45,
    };

    validations.push({
      factKey: factKeyPrefix,
      status,
      newConfidence: confidenceMap[status],
      validatedBy: 'deck-forensics',
      explanation: claim.evidence ?? claim.claim,
    });
  }

  return validations;
}

function extractFinancialAuditorValidations(data: Record<string, unknown>): AgentFactValidation[] {
  const validations: AgentFactValidation[] = [];

  const findings = data.findings as Record<string, unknown> | undefined;
  if (!findings) return [];

  const metrics = findings.metrics as Array<{
    metric?: string;
    status?: string;
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string;
  }> | undefined;

  if (!metrics) return [];

  for (const m of metrics) {
    if (!m.metric) continue;

    const factKey = mapMetricToFactKey(m.metric);
    if (!factKey) continue;

    if (m.status === 'available' && m.calculatedValue !== undefined) {
      const isContradicted = m.reportedValue !== undefined &&
        Math.abs(m.calculatedValue - m.reportedValue) / Math.max(1, Math.abs(m.reportedValue)) > 0.05;

      validations.push({
        factKey,
        status: isContradicted ? 'CONTRADICTED' : 'VERIFIED',
        newConfidence: isContradicted ? 25 : 95,
        validatedBy: 'financial-auditor',
        explanation: m.calculation ?? `Calculated: ${m.calculatedValue}`,
        ...(isContradicted ? {
          correctedValue: m.calculatedValue,
          correctedDisplayValue: `${m.calculatedValue}`,
        } : {}),
      });
    } else if (m.status === 'suspicious') {
      validations.push({
        factKey,
        status: 'CONTRADICTED',
        newConfidence: 20,
        validatedBy: 'financial-auditor',
        explanation: m.calculation ?? `Metric flagged as suspicious`,
      });
    } else if (m.status === 'missing') {
      validations.push({
        factKey,
        status: 'UNVERIFIABLE',
        newConfidence: 30,
        validatedBy: 'financial-auditor',
        explanation: `Metric not found in documents`,
      });
    }
  }

  return validations;
}

function extractTeamInvestigatorValidations(data: Record<string, unknown>): AgentFactValidation[] {
  const validations: AgentFactValidation[] = [];
  const findings = data.findings as Record<string, unknown> | undefined;
  if (!findings) return [];

  // Validate team.headcount from teamComposition
  const composition = findings.teamComposition as {
    teamSize?: number;
  } | undefined;

  if (composition?.teamSize !== undefined && composition.teamSize > 0) {
    validations.push({
      factKey: 'team.headcount',
      status: 'VERIFIED',
      newConfidence: 85,
      validatedBy: 'team-investigator',
      explanation: `Team size verified: ${composition.teamSize} people (from LinkedIn/Context Engine cross-reference)`,
      correctedValue: composition.teamSize,
      correctedDisplayValue: `${composition.teamSize}`,
    });
  } else if (composition?.teamSize === 0) {
    validations.push({
      factKey: 'team.headcount',
      status: 'UNVERIFIABLE',
      newConfidence: 30,
      validatedBy: 'team-investigator',
      explanation: 'Team size reported as 0 — could not verify actual headcount',
    });
  }

  // Validate team.founders_count from founderProfiles
  const founders = findings.founderProfiles as Array<{
    name?: string;
  }> | undefined;

  if (founders && founders.length > 0) {
    validations.push({
      factKey: 'team.founders_count',
      status: 'VERIFIED',
      newConfidence: 90,
      validatedBy: 'team-investigator',
      explanation: `${founders.length} founder(s) identified via LinkedIn/Context Engine`,
      correctedValue: founders.length,
      correctedDisplayValue: `${founders.length}`,
    });
  }

  return validations;
}

function extractCompetitiveIntelValidations(data: Record<string, unknown>): AgentFactValidation[] {
  const validations: AgentFactValidation[] = [];
  const findings = data.findings as Record<string, unknown> | undefined;
  if (!findings) return [];

  // Validate competition.competitor_count from competitors list
  const competitors = findings.competitors as Array<{
    name?: string;
    threatLevel?: string;
  }> | undefined;

  if (competitors && competitors.length > 0) {
    validations.push({
      factKey: 'competition.competitor_count',
      status: 'VERIFIED',
      newConfidence: 80,
      validatedBy: 'competitive-intel',
      explanation: `${competitors.length} competitor(s) identified through competitive analysis`,
      correctedValue: competitors.length,
      correctedDisplayValue: `${competitors.length}`,
    });
  } else if (competitors && competitors.length === 0) {
    validations.push({
      factKey: 'competition.competitor_count',
      status: 'UNVERIFIABLE',
      newConfidence: 40,
      validatedBy: 'competitive-intel',
      explanation: 'No competitors found — does not confirm absence of competition',
    });
  }

  // Validate competition.moat_strength from moatAnalysis
  const moat = findings.moatAnalysis as {
    overallMoatStrength?: string;
    score?: number;
  } | undefined;

  if (moat?.score !== undefined) {
    validations.push({
      factKey: 'competition.moat_strength',
      status: 'VERIFIED',
      newConfidence: 75,
      validatedBy: 'competitive-intel',
      explanation: `Moat strength: ${moat.overallMoatStrength ?? 'unknown'} (score: ${moat.score}/100)`,
      correctedValue: moat.score,
      correctedDisplayValue: `${moat.score}/100 (${moat.overallMoatStrength ?? 'N/A'})`,
    });
  }

  return validations;
}

function extractMarketIntelligenceValidations(data: Record<string, unknown>): AgentFactValidation[] {
  const validations: AgentFactValidation[] = [];
  const findings = data.findings as Record<string, unknown> | undefined;
  if (!findings) return [];

  // Validate market.tam and market.sam from marketSize
  const marketSize = findings.marketSize as {
    tam?: number;
    sam?: number;
    assessment?: string;
  } | undefined;

  if (marketSize?.tam !== undefined) {
    validations.push({
      factKey: 'market.tam',
      status: 'VERIFIED',
      newConfidence: 70,
      validatedBy: 'market-intelligence',
      explanation: `TAM estimated at ${marketSize.tam} (assessment: ${marketSize.assessment ?? 'unknown'})`,
      correctedValue: marketSize.tam,
      correctedDisplayValue: `${marketSize.tam}`,
    });
  }

  if (marketSize?.sam !== undefined) {
    validations.push({
      factKey: 'market.sam',
      status: 'VERIFIED',
      newConfidence: 70,
      validatedBy: 'market-intelligence',
      explanation: `SAM estimated at ${marketSize.sam} (assessment: ${marketSize.assessment ?? 'unknown'})`,
      correctedValue: marketSize.sam,
      correctedDisplayValue: `${marketSize.sam}`,
    });
  }

  return validations;
}

function mapClaimCategoryToFactKey(category?: string, claimContent?: string): string | null {
  if (!category && !claimContent) return null;

  // 1. Try to extract specific metric from claim content first
  if (claimContent) {
    const contentLower = claimContent.toLowerCase();
    const contentMapping: Array<{ keywords: string[]; factKey: string }> = [
      { keywords: ['arr'], factKey: 'financial.arr' },
      { keywords: ['mrr'], factKey: 'financial.mrr' },
      { keywords: ['burn', 'burn rate'], factKey: 'financial.burn_rate' },
      { keywords: ['runway'], factKey: 'financial.runway_months' },
      { keywords: ['churn'], factKey: 'traction.churn_monthly' },
      { keywords: ['valuation', 'valo'], factKey: 'financial.valuation_pre' },
      { keywords: ['gross margin'], factKey: 'financial.gross_margin' },
      { keywords: ['net margin'], factKey: 'financial.net_margin' },
      { keywords: ['revenue growth', 'yoy growth', 'croissance'], factKey: 'financial.revenue_growth_yoy' },
      { keywords: ['revenue', 'chiffre d\'affaires', 'ca annuel'], factKey: 'financial.revenue' },
      { keywords: ['margin'], factKey: 'financial.gross_margin' },
      { keywords: ['ltv', 'lifetime value'], factKey: 'traction.ltv' },
      { keywords: ['cac', 'cost of acquisition', 'acquisition cost'], factKey: 'traction.cac' },
      { keywords: ['nrr', 'net revenue retention'], factKey: 'traction.nrr' },
      { keywords: ['customers', 'clients', 'customer count'], factKey: 'traction.customers_count' },
      { keywords: ['users', 'user count', 'utilisateurs'], factKey: 'traction.users_count' },
      { keywords: ['tam', 'total addressable'], factKey: 'market.tam' },
      { keywords: ['sam', 'serviceable addressable'], factKey: 'market.sam' },
      { keywords: ['headcount', 'team size', 'employees'], factKey: 'team.headcount' },
      { keywords: ['founders', 'co-founders', 'cofounders'], factKey: 'team.founders_count' },
    ];

    for (const { keywords, factKey } of contentMapping) {
      if (keywords.some(kw => contentLower.includes(kw))) return factKey;
    }
  }

  // 2. Fallback: map by category
  if (!category) {
    console.warn(`[finding-extractor] Could not map claim to fact key. No category, content: "${claimContent?.slice(0, 80)}"`);
    return null;
  }

  const lower = category.toLowerCase();

  const categoryMapping: Record<string, string> = {
    'traction': 'traction.customers_count',
    'revenue': 'financial.arr',
    'financial': 'financial.arr',
    'market': 'market.tam',
    'team': 'team.headcount',
    'growth': 'financial.revenue_growth_yoy',
    'product': 'product.maturity',
    'customers': 'traction.customers_count',
    'users': 'traction.users_count',
  };

  for (const [key, factKey] of Object.entries(categoryMapping)) {
    if (lower.includes(key)) return factKey;
  }

  console.warn(`[finding-extractor] Unmapped claim category: "${category}", content: "${claimContent?.slice(0, 80)}"`);
  return null;
}

function mapMetricToFactKey(metric: string): string | null {
  const lower = metric.toLowerCase();
  const mapping: Record<string, string> = {
    'arr': 'financial.arr',
    'mrr': 'financial.mrr',
    'burn': 'financial.burn_rate',
    'runway': 'financial.runway_months',
    'gross margin': 'financial.gross_margin',
    'net margin': 'financial.net_margin',
    'revenue': 'financial.revenue',
    'valuation': 'financial.valuation_pre',
    'cac': 'traction.cac',
    'ltv': 'traction.ltv',
    'churn': 'traction.churn_monthly',
    'nrr': 'traction.nrr',
    'growth': 'financial.revenue_growth_yoy',
  };

  for (const [key, factKey] of Object.entries(mapping)) {
    if (lower.includes(key)) return factKey;
  }

  return null;
}

// ============================================================================
// BATCH EXTRACTION
// ============================================================================

/**
 * Extract findings from all agent results
 */
export function extractAllFindings(results: Record<string, AgentResult>): {
  allFindings: ScoredFinding[];
  agentConfidences: Map<string, ConfidenceScore>;
  lowConfidenceAgents: string[];
} {
  const allFindings: ScoredFinding[] = [];
  const agentConfidences = new Map<string, ConfidenceScore>();
  const lowConfidenceAgents: string[] = [];

  for (const [agentName, result] of Object.entries(results)) {
    const extracted = extractAgentData(result);
    if (extracted) {
      allFindings.push(...extracted.findings);
      agentConfidences.set(agentName, extracted.confidence);

      if (extracted.confidence.score < 50) {
        lowConfidenceAgents.push(agentName);
      }
    }
  }

  return { allFindings, agentConfidences, lowConfidenceAgents };
}
