/**
 * Finding Extractor
 * Extracts findings and confidence from Standard agents for Consensus/Reflexion engines
 */

import type { ScoredFinding, ConfidenceScore, FindingCategory, Evidence } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import type { AgentResult } from "../types";

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
  const confidenceLevel = data.meta?.confidenceLevel ?? 50;
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
  const baseConfidence = data.meta?.confidenceLevel ?? 50;

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

  // Financial Auditor
  if (agentName === "financial-auditor") {
    result.push(...extractFinancialFindings(findings, agentName, baseConfidence));
  }
  // Team Investigator
  else if (agentName === "team-investigator") {
    result.push(...extractTeamFindings(findings, agentName, baseConfidence));
  }
  // Market Intelligence
  else if (agentName === "market-intelligence") {
    result.push(...extractMarketFindings(findings, agentName, baseConfidence));
  }
  // Competitive Intel
  else if (agentName === "competitive-intel") {
    result.push(...extractCompetitiveFindings(findings, agentName, baseConfidence));
  }
  // Generic extraction for other agents
  else {
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
