/**
 * Contradiction Detector Agent (Tier 2)
 *
 * Détecte les contradictions et incohérences entre les outputs Tier 1
 * avec formatage sémantique et pondération par importance
 */

import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, ContradictionDetectorResult, ContradictionDetectorData, AgentResult } from "../types";

// ============================================================================
// IMPORTANCE WEIGHTS
// ============================================================================

/**
 * Catégories de contradictions par importance d'impact sur décision d'investissement
 */
const TOPIC_IMPORTANCE_WEIGHTS: Record<string, number> = {
  // CRITICAL (weight 10) - Deal breakers
  "team": 10,
  "founder": 10,
  "ceo": 10,
  "cto": 10,
  "cofondateur": 10,
  "experience": 9,
  "background": 9,
  "fraude": 10,
  "red_flag": 10,
  "fraud": 10,
  "legal": 10,

  // HIGH (weight 7-8) - Major financial metrics
  "arr": 8,
  "revenue": 8,
  "chiffre_affaires": 8,
  "mrr": 8,
  "valuation": 8,
  "valorisation": 8,
  "growth": 7,
  "croissance": 7,
  "runway": 8,
  "burn": 7,
  "margin": 7,
  "marge": 7,
  "profitability": 7,
  "rentabilite": 7,

  // MEDIUM (weight 5-6) - Important but not deal breakers
  "market": 6,
  "marche": 6,
  "tam": 5,
  "sam": 5,
  "som": 5,
  "competition": 6,
  "concurrent": 6,
  "churn": 6,
  "retention": 6,
  "ltv": 5,
  "cac": 5,
  "unit_economics": 5,

  // LOW (weight 2-4) - Minor discrepancies
  "date": 3,
  "timeline": 3,
  "headcount": 4,
  "effectif": 4,
  "stage": 3,
  "sector": 2,
  "secteur": 2,
  "geography": 2,
  "geographie": 2,
};

/**
 * Calcule le poids d'importance d'une contradiction basée sur son topic
 */
function getTopicWeight(topic: string): number {
  const normalizedTopic = topic.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  for (const [keyword, weight] of Object.entries(TOPIC_IMPORTANCE_WEIGHTS)) {
    if (normalizedTopic.includes(keyword)) {
      return weight;
    }
  }

  return 5; // Default medium weight
}

// ============================================================================
// SEMANTIC FORMATTERS
// ============================================================================

interface SemanticSection {
  agentName: string;
  category: string;
  keyMetrics: Array<{ name: string; value: string | number; unit?: string }>;
  assessments: string[];
  redFlags: string[];
  strengths: string[];
}

/**
 * Extrait le contenu sémantique d'un résultat d'agent
 */
function extractSemanticContent(agentName: string, data: unknown): SemanticSection {
  const section: SemanticSection = {
    agentName,
    category: categorizeAgent(agentName),
    keyMetrics: [],
    assessments: [],
    redFlags: [],
    strengths: [],
  };

  if (!data || typeof data !== "object") {
    return section;
  }

  const obj = data as Record<string, unknown>;

  // Extract based on agent type
  switch (agentName.toLowerCase()) {
    case "deal-screener":
      extractDealScreenerContent(obj, section);
      break;
    case "deal-scorer":
      extractDealScorerContent(obj, section);
      break;
    case "red-flag-detector":
      extractRedFlagContent(obj, section);
      break;
    case "financial-analyzer":
      extractFinancialContent(obj, section);
      break;
    case "team-analyzer":
      extractTeamContent(obj, section);
      break;
    case "market-analyzer":
      extractMarketContent(obj, section);
      break;
    case "valuation-analyzer":
      extractValuationContent(obj, section);
      break;
    default:
      extractGenericContent(obj, section);
  }

  return section;
}

function categorizeAgent(agentName: string): string {
  const categories: Record<string, string[]> = {
    "financial": ["financial", "deal-scorer", "valuation"],
    "team": ["team", "founder"],
    "market": ["market", "competition"],
    "risk": ["red-flag", "risk"],
    "screening": ["screener", "screening"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(k => agentName.toLowerCase().includes(k))) {
      return category;
    }
  }
  return "general";
}

function extractDealScreenerContent(obj: Record<string, unknown>, section: SemanticSection): void {
  if (obj.recommendation) section.assessments.push(`Recommendation: ${obj.recommendation}`);
  if (obj.verdict) section.assessments.push(`Verdict: ${obj.verdict}`);
  if (obj.score !== undefined) section.keyMetrics.push({ name: "screening_score", value: obj.score as number });

  if (Array.isArray(obj.strengths)) {
    section.strengths.push(...(obj.strengths as string[]));
  }
  if (Array.isArray(obj.concerns)) {
    section.redFlags.push(...(obj.concerns as string[]));
  }
  if (Array.isArray(obj.questions)) {
    section.assessments.push(`Questions: ${(obj.questions as string[]).join(", ")}`);
  }
}

function extractDealScorerContent(obj: Record<string, unknown>, section: SemanticSection): void {
  // Extract dimension scores
  const dimensions = ["team", "market", "product", "financials", "traction"] as const;
  for (const dim of dimensions) {
    const score = obj[`${dim}Score`] ?? (obj.scores as Record<string, unknown>)?.[dim];
    if (score !== undefined) {
      section.keyMetrics.push({ name: `${dim}_score`, value: score as number, unit: "/100" });
    }
  }

  if (obj.overallScore !== undefined) {
    section.keyMetrics.push({ name: "overall_score", value: obj.overallScore as number, unit: "/100" });
  }

  if (obj.assessment) section.assessments.push(obj.assessment as string);
  if (obj.recommendation) section.assessments.push(`Recommendation: ${obj.recommendation}`);
}

function extractRedFlagContent(obj: Record<string, unknown>, section: SemanticSection): void {
  if (Array.isArray(obj.redFlags)) {
    for (const flag of obj.redFlags as Array<Record<string, unknown>>) {
      const severity = flag.severity ?? "unknown";
      const description = flag.description ?? flag.title ?? flag.issue ?? "";
      section.redFlags.push(`[${severity}] ${description}`);
    }
  }

  if (obj.riskScore !== undefined) {
    section.keyMetrics.push({ name: "risk_score", value: obj.riskScore as number, unit: "/100" });
  }

  if (obj.overallAssessment) section.assessments.push(obj.overallAssessment as string);
}

function extractFinancialContent(obj: Record<string, unknown>, section: SemanticSection): void {
  const metrics = ["arr", "mrr", "revenue", "growth", "growthRate", "runway", "burn", "burnRate", "margin", "ltv", "cac"];

  for (const metric of metrics) {
    const value = obj[metric];
    if (value !== undefined && value !== null) {
      let unit = "";
      if (metric.includes("growth") || metric.includes("margin")) unit = "%";
      else if (metric.includes("runway")) unit = " months";
      section.keyMetrics.push({ name: metric, value: value as number, unit });
    }
  }

  if (obj.assessment) section.assessments.push(obj.assessment as string);
  if (obj.unitEconomics) {
    const ue = obj.unitEconomics as Record<string, unknown>;
    if (ue.ltvCacRatio) section.keyMetrics.push({ name: "ltv_cac_ratio", value: ue.ltvCacRatio as number, unit: "x" });
  }
}

function extractTeamContent(obj: Record<string, unknown>, section: SemanticSection): void {
  if (obj.teamScore !== undefined) {
    section.keyMetrics.push({ name: "team_score", value: obj.teamScore as number, unit: "/100" });
  }

  if (Array.isArray(obj.founders)) {
    const founders = obj.founders as Array<Record<string, unknown>>;
    for (const founder of founders) {
      const name = founder.name ?? "Unknown";
      const role = founder.role ?? "Founder";
      const experience = founder.experience ?? founder.background ?? "";
      section.assessments.push(`${name} (${role}): ${experience}`);

      if (founder.verified === false || founder.verificationStatus === "unverified") {
        section.redFlags.push(`${name}: Background not verified`);
      }
    }
  }

  if (obj.teamStrengths) section.strengths.push(...(obj.teamStrengths as string[]));
  if (obj.teamWeaknesses) section.redFlags.push(...(obj.teamWeaknesses as string[]));
}

function extractMarketContent(obj: Record<string, unknown>, section: SemanticSection): void {
  if (obj.tam) section.keyMetrics.push({ name: "TAM", value: formatMoney(obj.tam as number) });
  if (obj.sam) section.keyMetrics.push({ name: "SAM", value: formatMoney(obj.sam as number) });
  if (obj.som) section.keyMetrics.push({ name: "SOM", value: formatMoney(obj.som as number) });
  if (obj.cagr) section.keyMetrics.push({ name: "CAGR", value: obj.cagr as number, unit: "%" });

  if (obj.marketScore !== undefined) {
    section.keyMetrics.push({ name: "market_score", value: obj.marketScore as number, unit: "/100" });
  }

  if (Array.isArray(obj.competitors)) {
    const count = (obj.competitors as unknown[]).length;
    section.assessments.push(`${count} competitors identified`);
  }

  if (obj.competitivePosition) section.assessments.push(`Position: ${obj.competitivePosition}`);
}

function extractValuationContent(obj: Record<string, unknown>, section: SemanticSection): void {
  if (obj.proposedValuation) {
    section.keyMetrics.push({ name: "proposed_valuation", value: formatMoney(obj.proposedValuation as number) });
  }
  if (obj.fairValuation) {
    section.keyMetrics.push({ name: "fair_valuation", value: formatMoney(obj.fairValuation as number) });
  }
  if (obj.valuationMultiple) {
    section.keyMetrics.push({ name: "valuation_multiple", value: obj.valuationMultiple as number, unit: "x ARR" });
  }

  if (obj.verdict) section.assessments.push(`Verdict: ${obj.verdict}`);
  if (obj.recommendation) section.assessments.push(obj.recommendation as string);
}

function extractGenericContent(obj: Record<string, unknown>, section: SemanticSection): void {
  // Extract any numeric values as potential metrics
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number" && !key.toLowerCase().includes("id")) {
      section.keyMetrics.push({ name: key, value });
    } else if (typeof value === "string" && value.length < 200) {
      if (key.toLowerCase().includes("assessment") || key.toLowerCase().includes("recommendation")) {
        section.assessments.push(value);
      }
    }
  }

  // Extract arrays of strings as potential assessments
  if (Array.isArray(obj.strengths)) section.strengths.push(...(obj.strengths as string[]));
  if (Array.isArray(obj.weaknesses)) section.redFlags.push(...(obj.weaknesses as string[]));
  if (Array.isArray(obj.concerns)) section.redFlags.push(...(obj.concerns as string[]));
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value}`;
}

/**
 * Formate une section sémantique en texte structuré pour le LLM
 */
function formatSemanticSection(section: SemanticSection): string {
  const lines: string[] = [`### ${section.agentName.toUpperCase()} [${section.category}]`];

  if (section.keyMetrics.length > 0) {
    lines.push("\n**Key Metrics:**");
    for (const m of section.keyMetrics) {
      lines.push(`- ${m.name}: ${m.value}${m.unit ?? ""}`);
    }
  }

  if (section.assessments.length > 0) {
    lines.push("\n**Assessments:**");
    for (const a of section.assessments) {
      lines.push(`- ${a}`);
    }
  }

  if (section.strengths.length > 0) {
    lines.push("\n**Strengths:**");
    for (const s of section.strengths) {
      lines.push(`+ ${s}`);
    }
  }

  if (section.redFlags.length > 0) {
    lines.push("\n**Concerns/Red Flags:**");
    for (const r of section.redFlags) {
      lines.push(`! ${r}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// LLM RESPONSE TYPES
// ============================================================================

interface LLMContradictionResponse {
  contradictions: {
    id: string;
    sources: string[];
    topic: string;
    claim1: { agent: string; statement: string };
    claim2: { agent: string; statement: string };
    severity: string;
    impact: string;
    resolution?: string;
    needsVerification: boolean;
  }[];
  dataGaps: {
    area: string;
    missingFrom: string[];
    importance: string;
    recommendation: string;
  }[];
  consistencyScore: number;
  summaryAssessment: string;
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class ContradictionDetectorAgent extends BaseAgent<ContradictionDetectorData, ContradictionDetectorResult> {
  constructor() {
    super({
      name: "contradiction-detector",
      description: "Detecte les contradictions et incoherences entre les outputs Tier 1",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 60000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un CONTRADICTION DETECTOR expert en analyse croisee de documents.

TON ROLE:
- Comparer les outputs de tous les agents Tier 1
- Identifier les CONTRADICTIONS entre differentes analyses
- Reperer les GAPS de donnees (informations manquantes importantes)
- Evaluer la CONSISTANCE globale de l'analyse

TYPES DE CONTRADICTIONS:
1. CHIFFRES CONFLICTUELS: Un agent dit ARR=500K, un autre dit 800K
2. ASSESSMENTS OPPOSES: Un agent dit "team forte", un autre "gaps critiques"
3. TEMPORALITE INCOHERENTE: Dates ou timelines qui ne correspondent pas
4. QUALIFICATIONS CONTRADICTOIRES: "croissance exceptionnelle" vs "metriques faibles"

SEVERITE:
- minor: Ecart de formulation, pas d'impact sur la decision
- moderate: Ecart significatif qui merite clarification
- major: Contradiction importante qui affecte l'analyse
- critical: Contradiction qui remet en question toute l'analyse

POIDS D'IMPORTANCE (pour le score):
- Team/Founders: Poids maximum (10) - probleme de team = red flag majeur
- Financial metrics (ARR, growth): Poids eleve (8) - affecte directement la decision
- Market (TAM, competition): Poids moyen (6) - important mais pas bloquant
- Timeline/dates: Poids faible (3) - a clarifier mais pas critique

SCORE DE CONSISTANCE:
- 90-100: Analyse tres coherente, agents alignes
- 70-89: Quelques ecarts mineurs, globalement solide
- 50-69: Inconsistances notables a resoudre
- 30-49: Contradictions significatives
- 0-29: Analyse incoherente, donnees peu fiables

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ContradictionDetectorData> {
    const tier1Results = this.formatTier1ResultsSemantically(context);

    const prompt = `Analyse les resultats de tous les agents Tier 1 et identifie les contradictions:

${tier1Results}

IMPORTANT:
- Priorise les contradictions sur les sujets CRITIQUES (team, financials) vs les sujets mineurs (dates, geography)
- Une contradiction sur la team/founders a PLUS de poids qu'une sur le headcount
- Une contradiction sur l'ARR a PLUS de poids qu'une sur le TAM

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "contradictions": [
    {
      "id": "CONT-1",
      "sources": ["agent1", "agent2"],
      "topic": "sujet de la contradiction",
      "claim1": { "agent": "agent1", "statement": "affirmation 1" },
      "claim2": { "agent": "agent2", "statement": "affirmation 2" },
      "severity": "minor|moderate|major|critical",
      "impact": "impact sur la decision d'investissement",
      "resolution": "comment resoudre si possible",
      "needsVerification": true
    }
  ],
  "dataGaps": [
    {
      "area": "domaine manquant",
      "missingFrom": ["agent1", "agent2"],
      "importance": "low|medium|high",
      "recommendation": "comment obtenir cette info"
    }
  ],
  "consistencyScore": 75,
  "summaryAssessment": "resume de l'analyse de consistance"
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMContradictionResponse>(prompt);

    const validSeverities = ["minor", "moderate", "major", "critical"];
    const validImportance = ["low", "medium", "high"];

    // Process contradictions with weighted scoring
    const processedContradictions = Array.isArray(data.contradictions)
      ? data.contradictions.map((c, i) => {
          const topicWeight = getTopicWeight(c.topic ?? "");
          const baseSeverity = validSeverities.includes(c.severity) ? c.severity : "moderate";

          // Adjust severity based on topic weight
          let finalSeverity = baseSeverity;
          if (topicWeight >= 9 && baseSeverity === "moderate") {
            finalSeverity = "major"; // Upgrade for critical topics
          } else if (topicWeight <= 3 && baseSeverity === "major") {
            finalSeverity = "moderate"; // Downgrade for minor topics
          }

          return {
            id: c.id ?? `CONT-${i + 1}`,
            sources: Array.isArray(c.sources) ? c.sources : [],
            topic: c.topic ?? "Unknown",
            claim1: c.claim1 ?? { agent: "unknown", statement: "" },
            claim2: c.claim2 ?? { agent: "unknown", statement: "" },
            severity: finalSeverity as "minor" | "moderate" | "major" | "critical",
            impact: c.impact ?? "",
            resolution: c.resolution,
            needsVerification: c.needsVerification ?? true,
            _weight: topicWeight, // Internal for debugging
          };
        })
      : [];

    // Sort contradictions by severity and weight
    const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3 };
    processedContradictions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return (b._weight ?? 5) - (a._weight ?? 5);
    });

    // Calculate weighted consistency score
    let weightedPenalty = 0;
    for (const c of processedContradictions) {
      const severityPenalty = { minor: 2, moderate: 5, major: 10, critical: 20 };
      const weight = c._weight ?? 5;
      weightedPenalty += severityPenalty[c.severity] * (weight / 10);
    }
    const adjustedConsistencyScore = Math.max(0, Math.min(100, 100 - weightedPenalty));

    return {
      contradictions: processedContradictions.map(({ _weight, ...rest }) => rest),
      dataGaps: Array.isArray(data.dataGaps)
        ? data.dataGaps.map((g) => ({
            area: g.area ?? "Unknown",
            missingFrom: Array.isArray(g.missingFrom) ? g.missingFrom : [],
            importance: validImportance.includes(g.importance)
              ? (g.importance as "low" | "medium" | "high")
              : "medium",
            recommendation: g.recommendation ?? "",
          }))
        : [],
      consistencyScore: Math.round(adjustedConsistencyScore),
      summaryAssessment: data.summaryAssessment ?? "Analyse de consistance non disponible",
    };
  }

  /**
   * Formate les résultats Tier 1 de manière sémantique (pas de JSON brut)
   */
  private formatTier1ResultsSemantically(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const sections: string[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (result.success && "data" in result && result.data) {
        const semanticSection = extractSemanticContent(agentName, result.data);
        sections.push(formatSemanticSection(semanticSection));
      }
    }

    if (sections.length === 0) {
      return "Aucun resultat Tier 1 disponible.";
    }

    // Group by category for better comparison
    const header = `## TIER 1 AGENT OUTPUTS
${sections.length} agents ont produit des resultats.
Comparez attentivement les metriques et assessments entre agents.
`;

    return header + "\n\n" + sections.join("\n\n---\n\n");
  }
}

export const contradictionDetector = new ContradictionDetectorAgent();
