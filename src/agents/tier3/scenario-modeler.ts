/**
 * SCENARIO MODELER AGENT - REFONTE v2.0
 *
 * Mission: Modéliser 4 scénarios (BASE, BULL, BEAR, CATASTROPHIC) basés sur
 * des trajectoires RÉELLES d'entreprises comparables - NE JAMAIS INVENTER
 *
 * Standard: Big4 + Partner VC - Chaque hypothèse sourcée, calculs montrés
 *
 * Inputs:
 * - Documents: Pitch deck, Financial model
 * - Context Engine: Similar deals, funding trends, benchmarks
 * - Funding DB: Comparables réels avec trajectoires
 * - Previous Results: Tous les Tier 1 et Tier 2
 *
 * Outputs:
 * - 4 scénarios avec probabilités sourcées
 * - Calculs IRR explicites (formules montrées)
 * - basedOnComparables OBLIGATOIRE
 * - Questions pour le fondateur
 *
 * REGLE ABSOLUE: NE JAMAIS INVENTER - Chaque hypothèse doit avoir une source
 */

import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  ScenarioModelerResult,
  ScenarioModelerData,
  ScenarioModelerFindings,
  ScenarioV2,
  SensitivityAnalysisV2,
  ScenarioComparable,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  Tier3SignalContribution,
  Tier3Orientation,
} from "../types";
import { calculateBATicketSize, type BAPreferences } from "@/services/benchmarks";
import { calculateIRR } from "@/agents/orchestration/utils/financial-calculations";
import { SCENARIO_MODELER_SYSTEM_PROMPT } from "./prompts/scenario-modeler-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";

// ============================================================================
// LLM RESPONSE TYPES
// ============================================================================

interface LLMScenarioResponse {
  scenarios: {
    name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC";
    description: string;
    probability: {
      value: number;
      rationale: string;
      source: string;
    };
    assumptions: {
      assumption: string;
      value: string | number;
      source: string;
      confidence: string;
    }[];
    metrics: {
      year: number;
      revenue: number;
      revenueSource: string;
      valuation: number;
      valuationSource: string;
      employeeCount: number;
      employeeCountSource: string;
    }[];
    exitOutcome: {
      type: string;
      typeRationale: string;
      timing: string;
      timingSource: string;
      exitValuation: number;
      exitValuationCalculation: string;
      exitMultiple: number;
      exitMultipleSource: string;
    };
    investorReturn: {
      initialInvestment: number;
      initialInvestmentSource: string;
      ownershipAtEntry: number;
      ownershipCalculation: string;
      dilutionToExit: number;
      dilutionSource: string;
      ownershipAtExit: number;
      ownershipAtExitCalculation: string;
      grossProceeds: number;
      proceedsCalculation: string;
      multiple: number;
      multipleCalculation: string;
      irr: number;
      irrCalculation: string;
      holdingPeriodYears: number;
    };
    keyRisks: { risk: string; source: string }[];
    keyDrivers: { driver: string; source: string }[];
    triggers?: {
      trigger: string;
      source: string;
      impactOnScenario: string;
      probability: string;
      mitigations: string[];
    }[];
    basedOnComparable?: {
      company: string;
      trajectory: string;
      relevance: string;
      source: string;
    };
  }[];
  sensitivityAnalysis: {
    variable: string;
    baseCase: { value: number; source: string };
    impactOnValuation: { change: string; newValuation: number; calculation: string }[];
    impactLevel: string;
    impactRationale: string;
  }[];
  basedOnComparables: {
    company: string;
    sector: string;
    stage: string;
    trajectory: string;
    outcome: string;
    relevance: string;
    source: string;
    keyMetrics?: {
      seedValuation?: number;
      exitValuation?: number;
      timeToExit?: number;
      peakEmployees?: number;
    };
  }[];
  breakEvenAnalysis: {
    monthsToBreakeven: number;
    breakEvenCalculation: string;
    requiredGrowthRate: number;
    growthRateSource: string;
    burnUntilBreakeven: number;
    burnCalculation: string;
    achievability: string;
    achievabilityRationale: string;
  };
  probabilityWeightedOutcome: {
    expectedMultiple: number;
    expectedMultipleCalculation: string;
    expectedIRR: number;
    expectedIRRCalculation: string;
    riskAdjustedAssessment: string;
  };
  // Phase A slice A4 — Le LLM fournit `dominantScenario` (renommage de
  // l'ancien `mostLikelyScenario`). Si le LLM produit encore l'ancien nom,
  // le parser tolérant le lit en lecture seule (cf. `normalizeResponse`).
  // Le champ `signalContribution` n'est PAS dans cette interface : il est
  // dérivé déterministe par le runtime depuis les probabilités scenarios.
  dominantScenario?: string;
  mostLikelyScenario?: string;
  dominantScenarioRationale?: string;
  mostLikelyRationale?: string;
  score: {
    value: number;
    grade: string;
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  redFlags: {
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    location: string;
    evidence: string;
    contextEngineData?: string;
    impact: string;
    question: string;
    redFlagIfBadAnswer: string;
  }[];
  questions: {
    priority: string;
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: string;
    justification: string;
  };
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
  dbCrossReference: {
    claims: {
      claim: string;
      location: string;
      dbVerdict: string;
      evidence: string;
      severity?: string;
    }[];
    uncheckedClaims: string[];
  };
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class ScenarioModelerAgent extends BaseAgent<ScenarioModelerData, ScenarioModelerResult> {
  constructor() {
    super({
      name: "scenario-modeler",
      description: "Modélise 4 scénarios (BASE/BULL/BEAR/CATASTROPHIC) basés sur trajectoires réelles",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 180000,
      dependencies: ["financial-auditor", "market-intelligence", "exit-strategist"],
    });
  }

  protected buildSystemPrompt(): string {
    // Phase A slice A4 — System prompt extrait dans un fichier compagnon
    // (`./prompts/scenario-modeler-prompt.ts`). Les invariants doctrinaux
    // (absence de directive historique de seuil d'auto-confiance, absence
    // de lexique prescriptif legacy de "raison-de-tuer-le-deal" /
    // "destructeur-de-deal", `dominantScenario` natif renommage de
    // l'ancien `mostLikelyScenario`, `signalContribution` dérivé déterministe
    // côté runtime — pas demandé au LLM) sont verrouillés mécaniquement par
    // les source-guards de `__tests__/scenario-modeler-prompt.guard.test.ts`.
    return SCENARIO_MODELER_SYSTEM_PROMPT;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ScenarioModelerData> {
    this._dealStage = context.canonicalDeal.stage;
    const deal = context.canonicalDeal;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const tier1Insights = this.extractTier1Insights(context);
    const tier2Insights = this.extractTier2Insights(context);
    const fundingDbData = this.formatFundingDbData(context);
    const baInvestmentSection = this.formatBAInvestment(context.baPreferences, deal);

    // Extract key metrics
    const currentARR = deal.arr != null ? Number(deal.arr) : 0;
    const growthRate = deal.growthRate != null ? Number(deal.growthRate) : 0;
    const valuation = deal.valuationPre != null ? Number(deal.valuationPre) : 0;
    const amountRaising = deal.amountRequested != null ? Number(deal.amountRequested) : 0;
    const sector = deal.sector ?? "SaaS B2B";
    const stage = deal.stage ?? "SEED";

    const prompt = `# ANALYSE SCENARIO MODELER - ${deal.name ?? deal.companyName ?? "Deal"}

## DOCUMENTS ET DONNEES DU DEAL
${dealContext}

## METRIQUES DE BASE (extraites)
- ARR actuel: ${currentARR > 0 ? `€${currentARR.toLocaleString()}` : "NON DISPONIBLE"}
- Croissance YoY: ${growthRate > 0 ? `${growthRate}%` : "NON DISPONIBLE"}
- Valorisation pre-money: ${valuation > 0 ? `€${valuation.toLocaleString()}` : "NON DISPONIBLE"}
- Montant levé: ${amountRaising > 0 ? `€${amountRaising.toLocaleString()}` : "NON DISPONIBLE"}
- Secteur: ${sector}
- Stage: ${stage}

## DONNEES CONTEXT ENGINE
${contextEngineData || "Aucune donnée Context Engine disponible."}

## DONNEES FUNDING DB (COMPARABLES)
${fundingDbData}

## INSIGHTS TIER 1 (agents d'analyse)
${tier1Insights}

## INSIGHTS TIER 2 (expert sectoriel)
${tier2Insights}

## PARAMETRES D'INVESTISSEMENT BA
${baInvestmentSection}
${this.formatFactStoreData(context) ?? ""}
## INSTRUCTIONS SPECIFIQUES

1. Construis les 4 scénarios (BASE, BULL, BEAR, CATASTROPHIC):
   - CHAQUE hypothèse doit avoir une SOURCE explicite
   - CHAQUE scénario doit être ancré sur un COMPARABLE REEL si disponible
   - Si données manquantes, utiliser benchmarks DB ou marquer "NON DISPONIBLE"

2. Pour les calculs de retour investisseur:
   - Utiliser le ticket BA fourni (${baInvestmentSection.includes("Ticket") ? "voir section BA" : "estimer 5-10% du round"})
   - MONTRER tous les calculs (ownership, dilution, proceeds, multiple, IRR)
   - Utiliser formule IRR: ((Multiple)^(1/years) - 1) × 100

3. Analyse de sensibilité:
   - Identifier 3-5 variables critiques (growth, multiple exit, dilution...)
   - Calculer l'impact de variations (-30%, -15%, +15%, +30%) sur la valorisation

4. Cross-reference DB:
   - Vérifier si les projections deck sont cohérentes avec les benchmarks DB
   - Identifier les écarts significatifs (red flags si >50%)

5. Si tu n'as pas de comparable réel, indique clairement "Aucun comparable trouvé dans DB - basé sur benchmarks sectoriels généraux" mais NE PAS INVENTER de faux comparables.

Réponds en JSON avec la structure suivante:

\`\`\`json
{
  "score": {
    "value": 0-100,
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {"criterion": "Return Potential", "weight": 30, "score": 0-100, "justification": "..."},
      {"criterion": "Scenario Balance", "weight": 25, "score": 0-100, "justification": "..."},
      {"criterion": "Data Quality", "weight": 20, "score": 0-100, "justification": "..."},
      {"criterion": "Risk/Reward", "weight": 15, "score": 0-100, "justification": "..."},
      {"criterion": "Comparable Anchoring", "weight": 10, "score": 0-100, "justification": "..."}
    ]
  },
  "alertSignal": {"hasBlocker": false, "recommendation": "PROCEED_WITH_CAUTION", "justification": "..."},
  "narrative": {"oneLiner": "...", "summary": "...", "keyInsights": ["..."], "forNegotiation": ["..."]},
  "redFlags": [{"id": "RF-SM-1", "category": "scenario", "severity": "HIGH", "title": "...", "description": "...", "location": "...", "evidence": "...", "impact": "...", "question": "...", "redFlagIfBadAnswer": "..."}],
  "questions": [{"priority": "HIGH", "category": "scenario", "question": "...", "context": "...", "whatToLookFor": "..."}],
  "scenarios": [
    {
      "name": "BASE",
      "description": "Description du scénario",
      "probability": {"value": 40, "rationale": "Pourquoi", "source": "DB: X%..."},
      "assumptions": [{"assumption": "Croissance Y1", "value": "100%", "source": "DB median", "confidence": "high"}],
      "metrics": [{"year": 1, "revenue": 300000, "revenueSource": "...", "valuation": 6000000, "valuationSource": "...", "employeeCount": 8, "employeeCountSource": "..."}],
      "exitOutcome": {"type": "acquisition_strategic", "typeRationale": "...", "timing": "5-6 ans", "timingSource": "...", "exitValuation": 50000000, "exitValuationCalculation": "...", "exitMultiple": 5, "exitMultipleSource": "..."},
      "investorReturn": {"initialInvestment": 50000, "initialInvestmentSource": "...", "ownershipAtEntry": 2.0, "ownershipCalculation": "...", "dilutionToExit": 60, "dilutionSource": "...", "ownershipAtExit": 0.8, "ownershipAtExitCalculation": "...", "grossProceeds": 400000, "proceedsCalculation": "...", "multiple": 8.0, "multipleCalculation": "...", "irr": 41.4, "irrCalculation": "...", "holdingPeriodYears": 6},
      "keyRisks": [{"risk": "...", "source": "..."}],
      "keyDrivers": [{"driver": "...", "source": "..."}],
      "basedOnComparable": {"company": "...", "trajectory": "...", "relevance": "...", "source": "Funding DB"}
    }
  ],
  "sensitivityAnalysis": [...],
  "basedOnComparables": [...],
  "breakEvenAnalysis": {...},
  "probabilityWeightedOutcome": {...},
  "dominantScenario": "BASE",
  "dominantScenarioRationale": "...",
  "dbCrossReference": {...}
}
\`\`\`

RAPPEL CRITIQUE: NE JAMAIS INVENTER. Si tu n'as pas de données, écris "NON DISPONIBLE" ou "Basé sur benchmark général (confidence: low)".

**CONCISION OBLIGATOIRE (JSON sera INVALIDE si tronque):**
- 4 scenarios exactement, assumptions MAX 4 par scenario
- metrics MAX 3 par scenario, keyRisks/keyDrivers MAX 3
- sensitivityAnalysis MAX 4, basedOnComparables MAX 3
- redFlags MAX 5, questions MAX 5
- PRIORITE: JSON complet > detail`;

    const { data } = await this.llmCompleteJSONWithFallback<LLMScenarioResponse>(prompt);

    // Validate, normalize, and apply sanity caps
    const normalized = this.normalizeResponse(data, context);
    normalized.findings.scenarios = this.sanitizeExitValuations(
      normalized.findings.scenarios,
      context
    );
    // Recalculate probability-weighted outcome after sanitization
    normalized.findings.probabilityWeightedOutcome = this.recalculateWeightedOutcome(
      normalized.findings.scenarios
    );
    return normalized;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private extractTier1Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const insights: string[] = [];

    // Financial Auditor
    const financial = results["financial-auditor"];
    if (financial?.success && "data" in financial) {
      const d = financial.data as Record<string, unknown>;
      insights.push("### Financial Auditor");
      if (d.score && typeof d.score === "object") {
        const score = d.score as { value?: number; grade?: string };
        insights.push(`- Score: ${score.value ?? "N/A"}/100 (${score.grade ?? "N/A"})`);
      }
      if (d.findings && typeof d.findings === "object") {
        const findings = d.findings as { valuation?: { verdict?: string; percentile?: number } };
        if (findings.valuation) {
          insights.push(`- Valorisation: ${findings.valuation.verdict ?? "N/A"} (P${findings.valuation.percentile ?? "N/A"})`);
        }
      }
      if (d.alertSignal && typeof d.alertSignal === "object") {
        const alert = d.alertSignal as { recommendation?: string };
        insights.push(`- Recommandation: ${alert.recommendation ?? "N/A"}`);
      }
    }

    // Market Intelligence
    const market = results["market-intelligence"];
    if (market?.success && "data" in market) {
      const d = market.data as Record<string, unknown>;
      insights.push("### Market Intelligence");
      if (d.score && typeof d.score === "object") {
        const score = d.score as { value?: number };
        insights.push(`- Score: ${score.value ?? "N/A"}/100`);
      }
      if (d.findings && typeof d.findings === "object") {
        const findings = d.findings as { timing?: { assessment?: string }; fundingTrends?: { trend?: string } };
        if (findings.timing?.assessment) {
          insights.push(`- Timing: ${findings.timing.assessment}`);
        }
        if (findings.fundingTrends?.trend) {
          insights.push(`- Tendance: ${findings.fundingTrends.trend}`);
        }
      }
    }

    // Exit Strategist
    const exit = results["exit-strategist"];
    if (exit?.success && "data" in exit) {
      const d = exit.data as Record<string, unknown>;
      insights.push("### Exit Strategist");
      if (d.score && typeof d.score === "object") {
        const score = d.score as { value?: number };
        insights.push(`- Score: ${score.value ?? "N/A"}/100`);
      }
      if (d.findings && typeof d.findings === "object") {
        const findings = d.findings as {
          scenarios?: Array<{ type?: string; probability?: { percentage?: number } }>;
          mnaMarket?: { exitWindow?: { assessment?: string } };
        };
        if (findings.scenarios && findings.scenarios.length > 0) {
          const topScenario = findings.scenarios[0];
          insights.push(`- Exit probable: ${topScenario.type ?? "N/A"} (${topScenario.probability?.percentage ?? "N/A"}%)`);
        }
        if (findings.mnaMarket?.exitWindow?.assessment) {
          insights.push(`- Fenêtre M&A: ${findings.mnaMarket.exitWindow.assessment}`);
        }
      }
    }

    // Competitive Intel
    const competitive = results["competitive-intel"];
    if (competitive?.success && "data" in competitive) {
      const d = competitive.data as Record<string, unknown>;
      insights.push("### Competitive Intel");
      if (d.findings && typeof d.findings === "object") {
        const findings = d.findings as {
          competitors?: Array<unknown>;
          moatAnalysis?: { moatVerdict?: string };
        };
        if (findings.competitors) {
          insights.push(`- Concurrents identifiés: ${findings.competitors.length}`);
        }
        if (findings.moatAnalysis?.moatVerdict) {
          insights.push(`- Moat: ${findings.moatAnalysis.moatVerdict}`);
        }
      }
    }

    // Team Investigator
    const team = results["team-investigator"];
    if (team?.success && "data" in team) {
      const d = team.data as Record<string, unknown>;
      insights.push("### Team Investigator");
      if (d.score && typeof d.score === "object") {
        const score = d.score as { value?: number; grade?: string };
        insights.push(`- Score: ${score.value ?? "N/A"}/100 (${score.grade ?? "N/A"})`);
      }
    }

    // Red flags as scenario triggers (F74)
    const triggerRedFlags: Array<{ agent: string; severity: string; title: string; description: string }> = [];
    let totalRedFlags = 0;
    let criticalRedFlags = 0;

    for (const [agentName, result] of Object.entries(results)) {
      if (result?.success && "data" in result) {
        const d = result.data as { redFlags?: Array<{ severity?: string; title?: string; description?: string }> };
        if (Array.isArray(d.redFlags)) {
          totalRedFlags += d.redFlags.length;
          for (const rf of d.redFlags) {
            if (rf.severity === "CRITICAL") criticalRedFlags++;
            if (rf.severity === "CRITICAL" || rf.severity === "HIGH") {
              triggerRedFlags.push({
                agent: agentName,
                severity: rf.severity ?? "HIGH",
                title: rf.title ?? "Unknown",
                description: (rf.description ?? "").slice(0, 200),
              });
            }
          }
        }
      }
    }

    if (totalRedFlags > 0) {
      insights.push(`### Red Flags Tier 1`);
      insights.push(`- Total: ${totalRedFlags} (dont ${criticalRedFlags} CRITICAL)`);
    }

    if (triggerRedFlags.length > 0) {
      insights.push(`\n### Red Flags comme Triggers de Scenarios`);
      insights.push(`IMPORTANT: Utilise ces red flags comme TRIGGERS SPECIFIQUES dans chaque scenario.`);
      insights.push(`Pour chaque scenario, indique quel(s) trigger(s) se materialisent et lesquels non.\n`);
      for (const rf of triggerRedFlags.slice(0, 10)) {
        insights.push(`- [${rf.severity}] (${rf.agent}) ${rf.title}: ${rf.description}`);
      }
    }

    return insights.length > 0 ? insights.join("\n") : "Pas d'insights Tier 1 disponibles.";
  }

  private extractTier2Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const insights: string[] = [];

    // Find sector expert result
    const sectorExperts = [
      "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
      "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
      "hardware-expert", "gaming-expert", "general-expert",
    ];

    for (const expertName of sectorExperts) {
      const expert = results[expertName];
      if (expert?.success && "data" in expert) {
        const d = expert.data as Record<string, unknown>;
        insights.push(`### ${expertName.replace("-", " ").toUpperCase()}`);
        if (d.score && typeof d.score === "object") {
          const score = d.score as { value?: number };
          insights.push(`- Score: ${score.value ?? "N/A"}/100`);
        }
        if (d.findings && typeof d.findings === "object") {
          const findings = d.findings as { benchmarks?: Array<{ metric?: string; percentile?: number }> };
          if (findings.benchmarks && findings.benchmarks.length > 0) {
            insights.push("- Benchmarks clés:");
            for (const b of findings.benchmarks.slice(0, 3)) {
              insights.push(`  - ${b.metric ?? "?"}: P${b.percentile ?? "?"}`);
            }
          }
        }
        break; // Only include one sector expert
      }
    }

    return insights.length > 0 ? insights.join("\n") : "Pas d'expert sectoriel Tier 2 disponible.";
  }

  private formatFundingDbData(context: EnrichedAgentContext): string {
    const fundingDb = context.fundingDbContext ?? context.fundingContext;
    if (!fundingDb) {
      return "Aucune donnée Funding DB disponible. Utiliser les benchmarks généraux.";
    }

    const lines: string[] = [];

    // Cast to access additional properties that may exist
    const extendedDb = fundingDb as Record<string, unknown>;

    // Competitors as potential comparables
    if (fundingDb.competitors && fundingDb.competitors.length > 0) {
      lines.push("### Entreprises similaires (potentiels comparables)");
      for (const c of fundingDb.competitors.slice(0, 5)) {
        lines.push(`- ${c.name}: ${c.totalFunding ? `€${c.totalFunding.toLocaleString()}` : "N/A"} (${c.lastRound ?? "N/A"}) - Status: ${c.status ?? "N/A"}`);
      }
    }

    // Similar deals (from extended properties)
    const similarDeals = extendedDb.similarDeals as Array<Record<string, unknown>> | undefined;
    if (similarDeals && similarDeals.length > 0) {
      lines.push("### Deals similaires récents");
      for (const deal of similarDeals.slice(0, 5)) {
        lines.push(`- ${deal.companyName ?? "?"}: ${deal.fundingAmount ? `€${Number(deal.fundingAmount).toLocaleString()}` : "N/A"} @ ${deal.valuationMultiple ?? "?"}x`);
      }
    }

    // Benchmarks (from extended properties)
    const benchmarks = extendedDb.benchmarks as { valuationMedian?: number; arrMultipleMedian?: number } | undefined;
    if (benchmarks) {
      lines.push("### Benchmarks secteur");
      if (benchmarks.valuationMedian) lines.push(`- Valorisation médiane: €${benchmarks.valuationMedian.toLocaleString()}`);
      if (benchmarks.arrMultipleMedian) lines.push(`- Multiple ARR médian: ${benchmarks.arrMultipleMedian}x`);
    }

    // Sector benchmarks (alternative property name)
    const sectorBenchmarks = extendedDb.sectorBenchmarks as Record<string, unknown> | undefined;
    if (sectorBenchmarks && !benchmarks) {
      lines.push("### Benchmarks secteur");
      for (const [key, value] of Object.entries(sectorBenchmarks).slice(0, 5)) {
        if (typeof value === "number") {
          lines.push(`- ${key}: ${value}`);
        }
      }
    }

    return lines.length > 0 ? lines.join("\n") : "Données Funding DB limitées.";
  }

  private formatBAInvestment(prefs: BAPreferences | undefined, deal: EnrichedAgentContext["deal"]): string {
    const amount = deal.amountRequested != null ? Number(deal.amountRequested) : 0;
    const valuation = deal.valuationPre != null ? Number(deal.valuationPre) : 0;
    const postMoney = valuation + amount;

    if (!prefs) {
      const genericTicket = Math.min(amount * 0.10, 50000);
      const ownership = postMoney > 0 ? (genericTicket / postMoney) * 100 : 0;
      return `Ticket estimé: €${genericTicket.toLocaleString()} (${ownership.toFixed(2)}% post-money)
Source: Estimation générique (10% du round, max 50K€)
Horizon: 5-7 ans (standard BA)`;
    }

    const ticketSize = calculateBATicketSize(amount, prefs);
    const ownership = postMoney > 0 ? (ticketSize / postMoney) * 100 : 0;

    return `Ticket BA personnalisé: €${ticketSize.toLocaleString()}
Part au capital: ${ownership.toFixed(2)}% post-money
Ownership calculation: ${ticketSize} / (${valuation} pre + ${amount} round) = ${ownership.toFixed(2)}%
Horizon d'investissement: ${prefs.expectedHoldingPeriod} ans
Tolérance au risque: ${prefs.riskTolerance}/5

UTILISER CES PARAMETRES pour les calculs de retour dans chaque scénario.`;
  }

  private normalizeResponse(data: LLMScenarioResponse, context: EnrichedAgentContext): ScenarioModelerData {
    const validScenarioNames = ["BASE", "BULL", "BEAR", "CATASTROPHIC"] as const;
    const validExitTypes = ["acquisition_strategic", "acquisition_pe", "ipo", "secondary", "acquihire", "shutdown", "zombie"] as const;
    const validGrades = ["A", "B", "C", "D", "F"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;
    const validImpactLevels = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
    const validOutcomes = ["success", "moderate_success", "struggle", "failure"] as const;
    const validAchievability = ["ACHIEVABLE", "CHALLENGING", "UNLIKELY", "UNKNOWN"] as const;
    const validConfidence = ["high", "medium", "low"] as const;

    // Normalize scenarios
    const scenarios: ScenarioV2[] = Array.isArray(data.scenarios)
      ? data.scenarios.map((s) => ({
          name: validScenarioNames.includes(s.name as typeof validScenarioNames[number])
            ? (s.name as typeof validScenarioNames[number])
            : "BASE",
          description: s.description ?? "",
          probability: {
            value: Math.min(100, Math.max(0, s.probability?.value ?? 25)),
            rationale: s.probability?.rationale ?? "Non spécifié",
            source: s.probability?.source ?? "Estimation",
          },
          assumptions: Array.isArray(s.assumptions)
            ? s.assumptions.map((a) => ({
                assumption: a.assumption ?? "",
                value: a.value ?? "",
                source: a.source ?? "Non spécifié",
                confidence: validConfidence.includes(a.confidence as typeof validConfidence[number])
                  ? (a.confidence as typeof validConfidence[number])
                  : "medium",
              }))
            : [],
          metrics: Array.isArray(s.metrics)
            ? s.metrics.map((m) => ({
                year: m.year ?? 1,
                revenue: m.revenue ?? 0,
                revenueSource: m.revenueSource ?? "Non spécifié",
                valuation: m.valuation ?? 0,
                valuationSource: m.valuationSource ?? "Non spécifié",
                employeeCount: m.employeeCount ?? 0,
                employeeCountSource: m.employeeCountSource ?? "Non spécifié",
              }))
            : [],
          exitOutcome: {
            type: validExitTypes.includes(s.exitOutcome?.type as typeof validExitTypes[number])
              ? (s.exitOutcome.type as typeof validExitTypes[number])
              : "acquisition_strategic",
            typeRationale: s.exitOutcome?.typeRationale ?? "Non spécifié",
            timing: s.exitOutcome?.timing ?? "5-7 ans",
            timingSource: s.exitOutcome?.timingSource ?? "Estimation",
            exitValuation: s.exitOutcome?.exitValuation ?? 0,
            exitValuationCalculation: s.exitOutcome?.exitValuationCalculation ?? "Non calculé",
            exitMultiple: s.exitOutcome?.exitMultiple ?? 0,
            exitMultipleSource: s.exitOutcome?.exitMultipleSource ?? "Non spécifié",
          },
          investorReturn: {
            initialInvestment: s.investorReturn?.initialInvestment ?? 0,
            initialInvestmentSource: s.investorReturn?.initialInvestmentSource ?? "Non spécifié",
            ownershipAtEntry: s.investorReturn?.ownershipAtEntry ?? 0,
            ownershipCalculation: s.investorReturn?.ownershipCalculation ?? "Non calculé",
            dilutionToExit: s.investorReturn?.dilutionToExit ?? 0,
            dilutionSource: s.investorReturn?.dilutionSource ?? "Non spécifié",
            ownershipAtExit: s.investorReturn?.ownershipAtExit ?? 0,
            ownershipAtExitCalculation: s.investorReturn?.ownershipAtExitCalculation ?? "Non calculé",
            grossProceeds: s.investorReturn?.grossProceeds ?? 0,
            proceedsCalculation: s.investorReturn?.proceedsCalculation ?? "Non calculé",
            multiple: s.investorReturn?.multiple ?? 0,
            multipleCalculation: s.investorReturn?.multipleCalculation ?? "Non calculé",
            irr: s.investorReturn?.irr ?? 0,
            irrCalculation: s.investorReturn?.irrCalculation ?? "Non calculé",
            holdingPeriodYears: s.investorReturn?.holdingPeriodYears ?? 6,
          },
          keyRisks: Array.isArray(s.keyRisks) ? s.keyRisks : [],
          keyDrivers: Array.isArray(s.keyDrivers) ? s.keyDrivers : [],
          basedOnComparable: s.basedOnComparable,
        }))
      : this.getDefaultScenarios(context);

    // Normalize sensitivity analysis
    const sensitivityAnalysis: SensitivityAnalysisV2[] = Array.isArray(data.sensitivityAnalysis)
      ? data.sensitivityAnalysis.map((s) => ({
          variable: s.variable ?? "Unknown",
          baseCase: {
            value: s.baseCase?.value ?? 0,
            source: s.baseCase?.source ?? "Non spécifié",
          },
          impactOnValuation: Array.isArray(s.impactOnValuation) ? s.impactOnValuation : [],
          impactLevel: validImpactLevels.includes(s.impactLevel as typeof validImpactLevels[number])
            ? (s.impactLevel as typeof validImpactLevels[number])
            : "MEDIUM",
          impactRationale: s.impactRationale ?? "",
        }))
      : [];

    // Normalize comparables
    const basedOnComparables: ScenarioComparable[] = Array.isArray(data.basedOnComparables)
      ? data.basedOnComparables.map((c) => ({
          company: c.company ?? "Unknown",
          sector: c.sector ?? context.canonicalDeal.sector ?? "Unknown",
          stage: c.stage ?? context.canonicalDeal.stage ?? "Unknown",
          trajectory: c.trajectory ?? "Non disponible",
          outcome: validOutcomes.includes(c.outcome as typeof validOutcomes[number])
            ? (c.outcome as typeof validOutcomes[number])
            : "moderate_success",
          relevance: c.relevance ?? "",
          source: c.source ?? "Non spécifié",
          keyMetrics: c.keyMetrics,
        }))
      : [];

    // Build meta
    const meta: AgentMeta = {
      agentName: "scenario-modeler",
      analysisDate: new Date().toISOString(),
      dataCompleteness: basedOnComparables.length >= 3 ? "complete" : basedOnComparables.length >= 1 ? "partial" : "minimal",
      confidenceLevel: Math.min(100, Math.max(0, basedOnComparables.length * 25)),
      limitations: this.identifyLimitations(data, context),
    };

    // Normalize score — derive from scenarios if LLM didn't return it
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    let derivedScore = 0;
    if (scoreIsFallback) {
      // Derive score from probability-weighted expected multiple
      const expectedMultiple = data.probabilityWeightedOutcome?.expectedMultiple;
      if (expectedMultiple != null && expectedMultiple > 0) {
        // Map expected multiple to score: 1x=30, 3x=50, 5x=65, 10x=80, 20x+=95
        derivedScore = Math.min(95, Math.max(15, Math.round(30 + Math.log2(expectedMultiple) * 15)));
      } else if (scenarios.length > 0) {
        // Fallback: use BASE scenario multiple if available
        const baseScenario = scenarios.find(s => s.name === "BASE");
        const baseMult = baseScenario?.investorReturn?.multiple ?? 0;
        derivedScore = baseMult > 0
          ? Math.min(90, Math.max(20, Math.round(25 + Math.log2(baseMult) * 15)))
          : 40; // neutral default
      } else {
        derivedScore = 40;
      }
      console.warn(`[scenario-modeler] LLM did not return score value — derived ${derivedScore} from scenarios`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? derivedScore : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback
        ? (derivedScore >= 80 ? "A" : derivedScore >= 60 ? "B" : derivedScore >= 40 ? "C" : derivedScore >= 20 ? "D" : "F")
        : (validGrades.includes(data.score?.grade as typeof validGrades[number])
          ? (data.score.grade as typeof validGrades[number])
          : "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "",
            weight: b.weight ?? 0,
            score: b.score ?? 0,
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((f, i) => ({
          id: f.id ?? `RF-SM-${i + 1}`,
          category: f.category ?? "scenario",
          severity: validSeverities.includes(f.severity as typeof validSeverities[number])
            ? (f.severity as typeof validSeverities[number])
            : "MEDIUM",
          title: f.title ?? "",
          description: f.description ?? "",
          location: f.location ?? "Scenario Model",
          evidence: f.evidence ?? "",
          contextEngineData: f.contextEngineData,
          impact: f.impact ?? "",
          question: f.question ?? "",
          redFlagIfBadAnswer: f.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: validPriorities.includes(q.priority as typeof validPriorities[number])
            ? (q.priority as typeof validPriorities[number])
            : "MEDIUM",
          category: q.category ?? "scenario",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alert signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(data.alertSignal?.recommendation as typeof validRecommendations[number])
        ? (data.alertSignal.recommendation as typeof validRecommendations[number])
        : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "",
      summary: data.narrative?.summary ?? "",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
    };

    // Normalize DB cross-reference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: (c.dbVerdict as DbCrossReference["claims"][0]["dbVerdict"]) ?? "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: c.severity as "CRITICAL" | "HIGH" | "MEDIUM" | undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Build findings
    const findings: ScenarioModelerFindings = {
      scenarios,
      sensitivityAnalysis,
      basedOnComparables,
      breakEvenAnalysis: {
        monthsToBreakeven: data.breakEvenAnalysis?.monthsToBreakeven ?? 0,
        breakEvenCalculation: data.breakEvenAnalysis?.breakEvenCalculation ?? "Non calculé",
        requiredGrowthRate: data.breakEvenAnalysis?.requiredGrowthRate ?? 0,
        growthRateSource: data.breakEvenAnalysis?.growthRateSource ?? "Non spécifié",
        burnUntilBreakeven: data.breakEvenAnalysis?.burnUntilBreakeven ?? 0,
        burnCalculation: data.breakEvenAnalysis?.burnCalculation ?? "Non calculé",
        achievability: validAchievability.includes(data.breakEvenAnalysis?.achievability as typeof validAchievability[number])
          ? (data.breakEvenAnalysis.achievability as typeof validAchievability[number])
          : "UNKNOWN",
        achievabilityRationale: data.breakEvenAnalysis?.achievabilityRationale ?? "",
      },
      probabilityWeightedOutcome: {
        expectedMultiple: data.probabilityWeightedOutcome?.expectedMultiple ?? 0,
        expectedMultipleCalculation: data.probabilityWeightedOutcome?.expectedMultipleCalculation ?? "Non calculé",
        expectedIRR: data.probabilityWeightedOutcome?.expectedIRR ?? 0,
        expectedIRRCalculation: data.probabilityWeightedOutcome?.expectedIRRCalculation ?? "Non calculé",
        riskAdjustedAssessment: data.probabilityWeightedOutcome?.riskAdjustedAssessment ?? "",
      },
      // Phase A slice A4 — `dominantScenario` (renommage de l'ancien
      // `mostLikelyScenario`). Lecture priorité 1 : champ natif Phase A
      // (`data.dominantScenario`). Lecture priorité 2 (parser tolérant,
      // lecture seule) : ancien champ `data.mostLikelyScenario` si le LLM
      // continue à le produire. Le champ n'est PAS ré-émis natif (D1).
      dominantScenario: this.resolveDominantScenarioName(data, validScenarioNames),
      dominantScenarioRationale: data.dominantScenarioRationale?.trim()
        || data.mostLikelyRationale?.trim()
        || "",
      // Phase A slice A4 — `signalContribution` déterministe (runtime-derived).
      // Le LLM ne pilote PAS l'orientation (leçon round 2 A3 sur riskPosture) :
      // la valeur est dérivée mécaniquement depuis les probabilités scenarios.
      // evidenceSolidity reste null en A4 (D2 verrouillé — A6 service Solidité
      // qualifiera ultérieurement).
      signalContribution: this.buildSignalContribution(scenarios, context),
    };

    return {
      meta,
      score,
      findings,
      dbCrossReference,
      redFlags,
      questions,
      alertSignal,
      narrative,
    };
  }

  /**
   * Phase A slice A4 — Résolution déterministe de `dominantScenario`.
   *
   * Priorité 1 : `data.dominantScenario` (contrat natif Phase A).
   * Priorité 2 : `data.mostLikelyScenario` (parser tolérant lecture seule —
   * LLM dégradé, lecture interne uniquement, jamais émis sous l'ancien nom).
   * Fallback : "BASE".
   */
  private resolveDominantScenarioName(
    data: LLMScenarioResponse,
    validScenarioNames: readonly ("BASE" | "BULL" | "BEAR" | "CATASTROPHIC")[],
  ): "BASE" | "BULL" | "BEAR" | "CATASTROPHIC" {
    const candidate = data.dominantScenario ?? data.mostLikelyScenario;
    if (
      candidate &&
      validScenarioNames.includes(
        candidate as (typeof validScenarioNames)[number],
      )
    ) {
      return candidate as (typeof validScenarioNames)[number];
    }
    return "BASE";
  }

  /**
   * Phase A slice A4 — Dérive `signalContribution` déterministe.
   *
   * Anti-régression round 2 A3 : le LLM ne peut PAS piloter l'orientation
   * du signal (cas equivalent au `riskPosture` LLM-driven banni en A3).
   * Ici la dérivation est purement runtime, depuis les probabilités
   * scenarios. Aucune valeur LLM n'entre dans le calcul.
   *
   * Règle :
   *   P_pos = prob(BULL) + prob(BASE)
   *   P_neg = prob(BEAR) + prob(CATASTROPHIC)
   *   P_cat = prob(CATASTROPHIC)
   *
   *   P_cat >= 25                  → alert_dominant
   *   P_neg >= 50                  → vigilance
   *   P_pos >= 65 && BULL > BASE   → favorable
   *   P_pos >= 50                  → contrasted (légère prédominance positive)
   *   sinon                        → contrasted (défaut central)
   *
   * Scenario Modeler n'émet jamais `very_favorable` (le LLM contradicteur
   * n'a pas vocation à porter une orientation maximaliste positive ; même
   * biais structurel que DA).
   *
   * D2 verrouillé : `evidenceSolidity` reste null en A4 (A6 qualifiera).
   */
  private deriveSignalContributionFromScenarios(
    scenarios: ScenarioV2[],
  ): Tier3SignalContribution {
    const probOf = (name: ScenarioV2["name"]): number => {
      const s = scenarios.find((sc) => sc.name === name);
      return s?.probability?.value ?? 0;
    };
    const pBull = probOf("BULL");
    const pBase = probOf("BASE");
    const pBear = probOf("BEAR");
    const pCat = probOf("CATASTROPHIC");
    const pPos = pBull + pBase;
    const pNeg = pBear + pCat;

    let orientation: Tier3Orientation;
    if (pCat >= 25) {
      orientation = "alert_dominant";
    } else if (pNeg >= 50) {
      orientation = "vigilance";
    } else if (pPos >= 65 && pBull > pBase) {
      orientation = "favorable";
    } else if (pPos >= 50) {
      orientation = "contrasted";
    } else {
      orientation = "contrasted";
    }

    return {
      orientation,
      evidenceSolidity: null,
    };
  }

  /**
   * Phase A slice A6 — Construit signalContribution avec qualification
   * evidenceSolidity via le service déterministe. Combine la dérivation
   * d'orientation existante (depuis probabilités) avec l'appel au service
   * Evidence Solidity (D2 verrouillé).
   */
  private buildSignalContribution(
    scenarios: ScenarioV2[],
    context: EnrichedAgentContext,
  ): Tier3SignalContribution {
    const base = this.deriveSignalContributionFromScenarios(scenarios);
    const solidity = buildEvidenceSolidityForContext(context);
    if (solidity.value !== null && solidity.rationale) {
      base.evidenceSolidity = solidity.value;
      base.evidenceSolidityRationale = solidity.rationale;
    }
    return base;
  }

  /**
   * Caps de realisme sur les exit valuations pour eviter les scenarios delirants.
   * Un deal a 48K ARR ne peut pas afficher un BULL a 100M - ca decredibilise la plateforme.
   */
  private sanitizeExitValuations(
    scenarios: ScenarioV2[],
    context: EnrichedAgentContext
  ): ScenarioV2[] {
    const currentARR = context.canonicalDeal.arr != null ? Number(context.canonicalDeal.arr) : 0;
    if (currentARR <= 0) return scenarios;

    // CAGR annuel max et exit multiple max par scenario
    const caps: Record<string, { cagr: number; exitMult: number }> = {
      BULL: { cagr: 2.5, exitMult: 10 },        // 150% CAGR, 10x ARR
      BASE: { cagr: 1.8, exitMult: 7 },          // 80% CAGR, 7x ARR
      BEAR: { cagr: 1.2, exitMult: 3 },          // 20% CAGR, 3x ARR
      CATASTROPHIC: { cagr: 1.0, exitMult: 1 },  // flat, 1x ARR
    };

    return scenarios.map((s) => {
      const cap = caps[s.name];
      if (!cap) return s;

      const maxY5Revenue = currentARR * Math.pow(cap.cagr, 5);
      const maxExitValo = Math.round(maxY5Revenue * cap.exitMult);

      if (s.exitOutcome.exitValuation <= maxExitValo) return s;

      // Cap needed - recalculate downstream metrics
      const cappedExitValo = maxExitValo;
      const ownershipAtExitPct = s.investorReturn.ownershipAtExit / 100;
      const newProceeds = Math.round(ownershipAtExitPct * cappedExitValo);
      const investment = s.investorReturn.initialInvestment;
      const newMultiple = investment > 0
        ? Math.round((newProceeds / investment) * 10) / 10
        : 0;
      const years = s.investorReturn.holdingPeriodYears || 6;

      // F78: Use Newton-Raphson IRR instead of simplified formula
      let newIrr = -100;
      if (investment > 0 && newProceeds > 0) {
        const irrResult = calculateIRR([-investment, newProceeds], [0, years]);
        if ("value" in irrResult) {
          newIrr = irrResult.value;
        } else {
          // Fallback to simplified formula
          newIrr = newMultiple > 0
            ? Math.round((Math.pow(newMultiple, 1 / years) - 1) * 1000) / 10
            : -100;
        }
      }

      return {
        ...s,
        exitOutcome: {
          ...s.exitOutcome,
          exitValuation: cappedExitValo,
          exitMultiple: Math.round((cappedExitValo / Math.max(maxY5Revenue, 1)) * 10) / 10,
          exitValuationCalculation: `${s.exitOutcome.exitValuationCalculation} [CAPPE: max realiste ${(cappedExitValo / 1_000_000).toFixed(1)}M€ base sur CAGR ${Math.round((cap.cagr - 1) * 100)}%/an]`,
        },
        investorReturn: {
          ...s.investorReturn,
          grossProceeds: newProceeds,
          proceedsCalculation: `${ownershipAtExitPct * 100}% × €${cappedExitValo.toLocaleString()} = €${newProceeds.toLocaleString()} [recalcule apres cap]`,
          multiple: newMultiple,
          multipleCalculation: `€${newProceeds.toLocaleString()} / €${investment.toLocaleString()} = ${newMultiple}x [recalcule apres cap]`,
          irr: newIrr,
          irrCalculation: `((${newMultiple})^(1/${years}) - 1) × 100 = ${newIrr}% [recalcule apres cap]`,
        },
      };
    });
  }

  /**
   * Recalcule le weighted outcome apres sanitization des scenarios
   */
  private recalculateWeightedOutcome(
    scenarios: ScenarioV2[]
  ): ScenarioModelerFindings["probabilityWeightedOutcome"] {
    let weightedMultiple = 0;
    let totalProb = 0;

    for (const s of scenarios) {
      const prob = s.probability.value / 100;
      weightedMultiple += prob * s.investorReturn.multiple;
      totalProb += prob;
    }

    // Normaliser si les probas ne font pas 100%
    if (totalProb > 0 && totalProb !== 1) {
      weightedMultiple /= totalProb;
    }

    const years = scenarios[0]?.investorReturn.holdingPeriodYears ?? 6;
    // F78: Use Newton-Raphson IRR for weighted outcome
    let weightedIRR = -100;
    if (weightedMultiple > 0) {
      const irrResult = calculateIRR([-1, weightedMultiple], [0, years]);
      weightedIRR = "value" in irrResult ? irrResult.value : Math.round((Math.pow(weightedMultiple, 1 / years) - 1) * 1000) / 10;
    }

    const calcParts = scenarios
      .map((s) => `${s.probability.value}% × ${s.investorReturn.multiple}x`)
      .join(" + ");

    return {
      expectedMultiple: Math.round(weightedMultiple * 10) / 10,
      expectedMultipleCalculation: `${calcParts} = ${Math.round(weightedMultiple * 10) / 10}x`,
      expectedIRR: weightedIRR,
      expectedIRRCalculation: `((${Math.round(weightedMultiple * 10) / 10})^(1/${years}) - 1) × 100 = ${weightedIRR}%`,
      riskAdjustedAssessment: weightedMultiple >= 3
        ? "Rapport risque/rendement favorable"
        : weightedMultiple >= 1.5
          ? "Rapport risque/rendement acceptable"
          : "Rapport risque/rendement defavorable - rendement esperé ne compense pas le risque",
    };
  }

  private getDefaultScenarios(context: EnrichedAgentContext): ScenarioV2[] {
    const deal = context.canonicalDeal;
    const investment = deal.amountRequested != null ? Number(deal.amountRequested) * 0.1 : 50000;

    const defaultScenario = (
      name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC",
      prob: number,
      desc: string
    ): ScenarioV2 => ({
      name,
      description: desc,
      probability: {
        value: prob,
        rationale: "Estimation par défaut - données insuffisantes",
        source: "Valeur par défaut",
      },
      assumptions: [],
      metrics: [],
      exitOutcome: {
        type: name === "CATASTROPHIC" ? "shutdown" : "acquisition_strategic",
        typeRationale: "Non spécifié",
        timing: "5-7 ans",
        timingSource: "Standard",
        exitValuation: 0,
        exitValuationCalculation: "Non calculé - données insuffisantes",
        exitMultiple: 0,
        exitMultipleSource: "Non spécifié",
      },
      investorReturn: {
        initialInvestment: investment,
        initialInvestmentSource: "Estimation 10% du round",
        ownershipAtEntry: 0,
        ownershipCalculation: "Non calculé",
        dilutionToExit: 60,
        dilutionSource: "Standard Seed→Exit",
        ownershipAtExit: 0,
        ownershipAtExitCalculation: "Non calculé",
        grossProceeds: 0,
        proceedsCalculation: "Non calculé",
        multiple: 0,
        multipleCalculation: "Non calculé",
        irr: 0,
        irrCalculation: "Non calculé",
        holdingPeriodYears: 6,
      },
      keyRisks: [],
      keyDrivers: [],
    });

    return [
      defaultScenario("BASE", 40, "Scénario de base - données insuffisantes pour modéliser"),
      defaultScenario("BULL", 25, "Scénario optimiste - données insuffisantes pour modéliser"),
      defaultScenario("BEAR", 25, "Scénario pessimiste - données insuffisantes pour modéliser"),
      defaultScenario("CATASTROPHIC", 10, "Scénario catastrophique - données insuffisantes pour modéliser"),
    ];
  }

  private identifyLimitations(data: LLMScenarioResponse, context: EnrichedAgentContext): string[] {
    const limitations: string[] = [];

    // Check data completeness
    const deal = context.canonicalDeal;
    if (!deal.arr) limitations.push("ARR non disponible - projections moins fiables");
    if (!deal.growthRate) limitations.push("Taux de croissance non disponible");
    if (!deal.valuationPre) limitations.push("Valorisation pre-money non disponible");

    // Check comparables
    if (!data.basedOnComparables || data.basedOnComparables.length === 0) {
      limitations.push("Aucun comparable réel trouvé - scénarios basés sur benchmarks généraux");
    } else if (data.basedOnComparables.length < 3) {
      limitations.push(`Seulement ${data.basedOnComparables.length} comparable(s) trouvé(s) - confiance limitée`);
    }

    // Check Context Engine
    if (!context.contextEngine) {
      limitations.push("Pas de données Context Engine - benchmarks limités");
    }

    // Check Funding DB
    if (!context.fundingDbContext && !context.fundingContext) {
      limitations.push("Pas de données Funding DB - comparables non vérifiables");
    }

    // Check Tier 1 results
    const tier1Agents = ["financial-auditor", "market-intelligence", "exit-strategist"];
    const missingTier1 = tier1Agents.filter(
      (agent) => !context.previousResults?.[agent]?.success
    );
    if (missingTier1.length > 0) {
      limitations.push(`Agents Tier 1 manquants: ${missingTier1.join(", ")}`);
    }

    return limitations;
  }
}

export const scenarioModeler = new ScenarioModelerAgent();
