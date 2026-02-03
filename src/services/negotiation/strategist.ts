/**
 * Negotiation Strategist - Post-processing Service
 *
 * Mission: A partir des resultats d'analyse, generer un plan de negociation personnalise.
 * N'est PAS un agent - c'est un post-processing qui utilise les resultats existants.
 *
 * Inputs:
 * - Resultats de financial-auditor (valo, multiples, benchmarks)
 * - Resultats de cap-table-auditor (equity, dilution, clauses)
 * - Resultats de synthesis-deal-scorer (score global, red flags)
 *
 * Outputs:
 * - Points de negociation priorises
 * - Dealbreakers
 * - Trade-offs suggeres
 */

import { completeJSON } from "@/services/openrouter/router";

// =============================================================================
// TYPES
// =============================================================================

export interface NegotiationPoint {
  id: string;
  priority: "must_have" | "nice_to_have" | "optional";
  topic: string;
  category: "valuation" | "terms" | "governance" | "rights" | "protection" | "other";
  currentSituation: string;
  marketBenchmark?: string;
  argument: string;
  ask: string;
  fallback?: string;
  estimatedImpact?: {
    description: string;
    valueRange?: string;
  };
  status: "to_negotiate" | "obtained" | "refused" | "compromised";
}

export interface Dealbreaker {
  id: string;
  condition: string;
  description: string;
  resolvable: boolean;
  resolutionPath?: string;
  linkedPoints: string[]; // IDs of linked negotiation points
}

export interface TradeOff {
  id: string;
  give: string;
  get: string;
  rationale: string;
  netBenefit: "positive" | "neutral" | "negative";
}

export interface NegotiationStrategy {
  dealName: string;
  generatedAt: string;
  overallLeverage: "strong" | "moderate" | "weak";
  leverageRationale: string;
  negotiationPoints: NegotiationPoint[];
  dealbreakers: Dealbreaker[];
  tradeoffs: TradeOff[];
  suggestedApproach: string;
  keyArguments: string[];
  improvedDealScore?: {
    before: number;
    after: number;
    improvement: number;
  };
}

export interface AnalysisResults {
  financialAuditor?: {
    score?: { value?: number };
    findings?: {
      valuationAnalysis?: {
        currentValuation?: number;
        suggestedRange?: { min?: number; max?: number };
        multipleAnalysis?: {
          current?: { arrMultiple?: number; revenueMultiple?: number };
          benchmark?: { p25?: number; median?: number; p75?: number };
        };
      };
      unitEconomics?: {
        ltv?: number;
        cac?: number;
        ltvCacRatio?: number;
      };
    };
    redFlags?: Array<{
      severity: string;
      title: string;
      description: string;
    }>;
  };
  capTableAuditor?: {
    findings?: {
      currentCapTable?: {
        founderOwnership?: number;
        investorOwnership?: number;
        esopPool?: number;
      };
      dilutionAnalysis?: {
        postMoneyOwnership?: number;
        effectiveDilution?: number;
      };
      termsConcerns?: Array<{
        term: string;
        concern: string;
        suggestion: string;
      }>;
    };
    redFlags?: Array<{
      severity: string;
      title: string;
      description: string;
    }>;
  };
  synthesisDealScorer?: {
    score?: { value?: number };
    overallScore?: number;
    verdict?: string;
    keyStrengths?: string[];
    keyWeaknesses?: string[];
    redFlags?: Array<{
      severity: string;
      title: string;
      description: string;
    }>;
  };
}

// =============================================================================
// LLM RESPONSE INTERFACE
// =============================================================================

interface LLMNegotiationResponse {
  overallLeverage: "strong" | "moderate" | "weak";
  leverageRationale: string;
  negotiationPoints: {
    priority: "must_have" | "nice_to_have" | "optional";
    topic: string;
    category: string;
    currentSituation: string;
    marketBenchmark?: string;
    argument: string;
    ask: string;
    fallback?: string;
    estimatedImpact?: {
      description: string;
      valueRange?: string;
    };
  }[];
  dealbreakers: {
    condition: string;
    description: string;
    resolvable: boolean;
    resolutionPath?: string;
  }[];
  tradeoffs: {
    give: string;
    get: string;
    rationale: string;
    netBenefit: "positive" | "neutral" | "negative";
  }[];
  suggestedApproach: string;
  keyArguments: string[];
  estimatedScoreImprovement?: number;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

const SYSTEM_PROMPT = `# ROLE ET EXPERTISE

Tu es un negotiateur expert avec 20+ ans d'experience en deals M&A et investissement.
Tu as negocie 500+ deals pour des Business Angels et des fonds VC.
Tu sais identifier les points de levier et construire des arguments convaincants.

# MISSION

A partir des resultats d'analyse d'un deal, generer un plan de negociation actionnable pour un Business Angel.

# CE QUE TU PRODUIS

## 1. Points de Negociation (priorises)

Pour chaque faiblesse ou red flag detecte, tu identifies une opportunite de negociation:

| Priorite | Definition |
|----------|------------|
| must_have | Non negociable - si refuse, ne pas investir |
| nice_to_have | Important mais pas dealbreaker |
| optional | Bonus si obtenu |

Chaque point doit avoir:
- Topic: le sujet (valorisation, board seat, anti-dilution, etc.)
- Situation actuelle: ce qui est propose
- Benchmark marche: ce qui se fait normalement
- Argument: pourquoi on peut negocier (base sur les faiblesses detectees)
- Ask: ce qu'on demande
- Fallback: position de repli acceptable

## 2. Dealbreakers

Points absolument non negociables. Si refuses = no deal.

## 3. Trade-offs

Compromis suggeres: "Tu peux accepter X SI tu obtiens Y"
Permettent de debloquer des situations ou le fondateur refuse un point.

# CATEGORIES DE NEGOCIATION

| Categorie | Exemples |
|-----------|----------|
| valuation | Pre/post money, multiple, discount |
| terms | Liquidation preference, anti-dilution, vesting |
| governance | Board seat, voting rights, veto |
| rights | Pro-rata, information rights, tag-along |
| protection | Ratchet, milestones, earnout |

# FORMAT DE SORTIE

Produis un JSON structure avec tous les elements du plan de negociation.

# REGLES ABSOLUES

1. Chaque argument DOIT etre base sur une donnee de l'analyse (red flag, benchmark, etc.)
2. Les asks doivent etre REALISTES et CHIFFRES quand possible
3. Toujours proposer un fallback (position de repli)
4. Les dealbreakers doivent etre justifies par des risques concrets
5. Les trade-offs doivent avoir un net benefit positif ou neutre`;

export async function generateNegotiationStrategy(
  dealName: string,
  results: AnalysisResults
): Promise<NegotiationStrategy> {
  // Build context from analysis results
  const context = buildAnalysisContext(results);

  // Use triple quotes as delimiters to prevent prompt injection
  const userPrompt = `# DEAL: """${dealName}"""

## RESULTATS D'ANALYSE

${context}

## INSTRUCTIONS

1. Analyse les faiblesses et red flags identifies
2. Genere 5-10 points de negociation priorises
3. Identifie les dealbreakers (si applicable)
4. Propose des trade-offs strategiques
5. Suggere une approche globale de negociation

## OUTPUT ATTENDU

\`\`\`json
{
  "overallLeverage": "strong|moderate|weak",
  "leverageRationale": "Explication du niveau de leverage",
  "negotiationPoints": [
    {
      "priority": "must_have|nice_to_have|optional",
      "topic": "Sujet de negociation",
      "category": "valuation|terms|governance|rights|protection|other",
      "currentSituation": "Ce qui est propose actuellement",
      "marketBenchmark": "Ce qui se fait normalement (optionnel)",
      "argument": "Argument base sur l'analyse",
      "ask": "Ce qu'on demande concretement",
      "fallback": "Position de repli acceptable",
      "estimatedImpact": {
        "description": "Impact si obtenu",
        "valueRange": "Fourchette de valeur si chiffrable"
      }
    }
  ],
  "dealbreakers": [
    {
      "condition": "Condition qui fait dealbreaker",
      "description": "Explication",
      "resolvable": true/false,
      "resolutionPath": "Comment resoudre si resolvable"
    }
  ],
  "tradeoffs": [
    {
      "give": "Ce qu'on accepte de ceder",
      "get": "Ce qu'on obtient en echange",
      "rationale": "Pourquoi c'est un bon deal",
      "netBenefit": "positive|neutral|negative"
    }
  ],
  "suggestedApproach": "Approche globale recommandee pour la negociation",
  "keyArguments": ["Argument 1", "Argument 2", "Argument 3"],
  "estimatedScoreImprovement": 0-20
}
\`\`\``;

  // Call LLM
  const result = await completeJSON<LLMNegotiationResponse>(userPrompt, {
    systemPrompt: SYSTEM_PROMPT,
    complexity: "simple", // Fast model is sufficient for post-processing
    temperature: 0.3,
  });

  const response = result.data;

  // Normalize and return
  return normalizeResponse(dealName, results, response);
}

// =============================================================================
// HELPERS
// =============================================================================

function buildAnalysisContext(results: AnalysisResults): string {
  let context = "";

  // Financial Auditor Results
  if (results.financialAuditor) {
    const fa = results.financialAuditor;
    context += `### FINANCIAL AUDITOR\n`;
    context += `Score: ${fa.score?.value ?? "N/A"}/100\n`;

    if (fa.findings?.valuationAnalysis) {
      const va = fa.findings.valuationAnalysis;
      context += `\nValorisation:\n`;
      context += `- Actuelle: ${va.currentValuation ? `${(va.currentValuation / 1000000).toFixed(1)}M EUR` : "N/A"}\n`;
      if (va.suggestedRange) {
        context += `- Range suggere: ${va.suggestedRange.min ? `${(va.suggestedRange.min / 1000000).toFixed(1)}M` : "?"} - ${va.suggestedRange.max ? `${(va.suggestedRange.max / 1000000).toFixed(1)}M` : "?"} EUR\n`;
      }
      if (va.multipleAnalysis) {
        const ma = va.multipleAnalysis;
        context += `- Multiple ARR actuel: ${ma.current?.arrMultiple ?? "N/A"}x\n`;
        if (ma.benchmark) {
          context += `- Benchmark: P25=${ma.benchmark.p25 ?? "?"}x, Median=${ma.benchmark.median ?? "?"}x, P75=${ma.benchmark.p75 ?? "?"}x\n`;
        }
      }
    }

    if (fa.findings?.unitEconomics) {
      const ue = fa.findings.unitEconomics;
      context += `\nUnit Economics:\n`;
      context += `- LTV: ${ue.ltv ?? "N/A"} EUR\n`;
      context += `- CAC: ${ue.cac ?? "N/A"} EUR\n`;
      context += `- LTV/CAC: ${ue.ltvCacRatio ?? "N/A"}x\n`;
    }

    if (fa.redFlags && fa.redFlags.length > 0) {
      context += `\nRed Flags Financial:\n`;
      for (const rf of fa.redFlags.slice(0, 5)) {
        context += `- [${rf.severity}] ${rf.title}: ${rf.description}\n`;
      }
    }
    context += `\n`;
  }

  // Cap Table Auditor Results
  if (results.capTableAuditor) {
    const ca = results.capTableAuditor;
    context += `### CAP TABLE AUDITOR\n`;

    if (ca.findings?.currentCapTable) {
      const ct = ca.findings.currentCapTable;
      context += `\nCap Table Actuelle:\n`;
      context += `- Fondateurs: ${ct.founderOwnership ?? "N/A"}%\n`;
      context += `- Investisseurs: ${ct.investorOwnership ?? "N/A"}%\n`;
      context += `- ESOP: ${ct.esopPool ?? "N/A"}%\n`;
    }

    if (ca.findings?.dilutionAnalysis) {
      const da = ca.findings.dilutionAnalysis;
      context += `\nDilution:\n`;
      context += `- Post-money ownership BA: ${da.postMoneyOwnership ?? "N/A"}%\n`;
      context += `- Dilution effective: ${da.effectiveDilution ?? "N/A"}%\n`;
    }

    if (ca.findings?.termsConcerns && ca.findings.termsConcerns.length > 0) {
      context += `\nConcerns sur les Terms:\n`;
      for (const tc of ca.findings.termsConcerns.slice(0, 5)) {
        context += `- ${tc.term}: ${tc.concern} (Suggestion: ${tc.suggestion})\n`;
      }
    }

    if (ca.redFlags && ca.redFlags.length > 0) {
      context += `\nRed Flags Cap Table:\n`;
      for (const rf of ca.redFlags.slice(0, 5)) {
        context += `- [${rf.severity}] ${rf.title}: ${rf.description}\n`;
      }
    }
    context += `\n`;
  }

  // Synthesis Deal Scorer Results
  if (results.synthesisDealScorer) {
    const sds = results.synthesisDealScorer;
    context += `### SYNTHESIS DEAL SCORER\n`;
    context += `Score Global: ${sds.overallScore ?? sds.score?.value ?? "N/A"}/100\n`;
    context += `Verdict: ${sds.verdict ?? "N/A"}\n`;

    if (sds.keyStrengths && sds.keyStrengths.length > 0) {
      context += `\nPoints Forts:\n`;
      for (const s of sds.keyStrengths.slice(0, 5)) {
        context += `- ${s}\n`;
      }
    }

    if (sds.keyWeaknesses && sds.keyWeaknesses.length > 0) {
      context += `\nPoints Faibles (LEVERAGE pour negociation):\n`;
      for (const w of sds.keyWeaknesses.slice(0, 5)) {
        context += `- ${w}\n`;
      }
    }

    if (sds.redFlags && sds.redFlags.length > 0) {
      context += `\nRed Flags Synthese:\n`;
      for (const rf of sds.redFlags.slice(0, 5)) {
        context += `- [${rf.severity}] ${rf.title}: ${rf.description}\n`;
      }
    }
  }

  return context || "Aucune donnee d'analyse disponible.";
}

function normalizeResponse(
  dealName: string,
  results: AnalysisResults,
  response: LLMNegotiationResponse
): NegotiationStrategy {
  const validLeverages = ["strong", "moderate", "weak"] as const;
  const validPriorities = ["must_have", "nice_to_have", "optional"] as const;
  const validCategories = ["valuation", "terms", "governance", "rights", "protection", "other"] as const;
  const validBenefits = ["positive", "neutral", "negative"] as const;

  // Normalize negotiation points
  const negotiationPoints: NegotiationPoint[] = Array.isArray(response.negotiationPoints)
    ? response.negotiationPoints.map((np, idx) => ({
        id: `NEG-${String(idx + 1).padStart(3, "0")}`,
        priority: validPriorities.includes(np.priority as typeof validPriorities[number])
          ? np.priority
          : "nice_to_have",
        topic: np.topic ?? "Point de negociation",
        category: validCategories.includes(np.category as typeof validCategories[number])
          ? (np.category as typeof validCategories[number])
          : "other",
        currentSituation: np.currentSituation ?? "",
        marketBenchmark: np.marketBenchmark,
        argument: np.argument ?? "",
        ask: np.ask ?? "",
        fallback: np.fallback,
        estimatedImpact: np.estimatedImpact,
        status: "to_negotiate" as const,
      }))
    : [];

  // Normalize dealbreakers
  const dealbreakers: Dealbreaker[] = Array.isArray(response.dealbreakers)
    ? response.dealbreakers.map((db, idx) => ({
        id: `DB-${String(idx + 1).padStart(3, "0")}`,
        condition: db.condition ?? "",
        description: db.description ?? "",
        resolvable: db.resolvable ?? true,
        resolutionPath: db.resolutionPath,
        linkedPoints: [],
      }))
    : [];

  // Normalize tradeoffs
  const tradeoffs: TradeOff[] = Array.isArray(response.tradeoffs)
    ? response.tradeoffs.map((to, idx) => ({
        id: `TO-${String(idx + 1).padStart(3, "0")}`,
        give: to.give ?? "",
        get: to.get ?? "",
        rationale: to.rationale ?? "",
        netBenefit: validBenefits.includes(to.netBenefit as typeof validBenefits[number])
          ? to.netBenefit
          : "neutral",
      }))
    : [];

  // Calculate improved deal score if possible
  const currentScore = results.synthesisDealScorer?.overallScore ?? results.synthesisDealScorer?.score?.value ?? 0;
  const improvement = response.estimatedScoreImprovement ?? 0;
  const improvedDealScore = currentScore > 0
    ? {
        before: currentScore,
        after: Math.min(100, currentScore + improvement),
        improvement,
      }
    : undefined;

  return {
    dealName,
    generatedAt: new Date().toISOString(),
    overallLeverage: validLeverages.includes(response.overallLeverage as typeof validLeverages[number])
      ? response.overallLeverage
      : "moderate",
    leverageRationale: response.leverageRationale ?? "",
    negotiationPoints,
    dealbreakers,
    tradeoffs,
    suggestedApproach: response.suggestedApproach ?? "",
    keyArguments: Array.isArray(response.keyArguments) ? response.keyArguments : [],
    improvedDealScore,
  };
}

// =============================================================================
// UTILITY: Update negotiation point status
// =============================================================================

export function updatePointStatus(
  strategy: NegotiationStrategy,
  pointId: string,
  newStatus: NegotiationPoint["status"]
): NegotiationStrategy {
  return {
    ...strategy,
    negotiationPoints: strategy.negotiationPoints.map(np =>
      np.id === pointId ? { ...np, status: newStatus } : np
    ),
  };
}

export function calculateImprovedScore(strategy: NegotiationStrategy): number {
  // Count obtained points by priority
  const obtainedMustHave = strategy.negotiationPoints.filter(
    np => np.priority === "must_have" && np.status === "obtained"
  ).length;
  const obtainedNiceToHave = strategy.negotiationPoints.filter(
    np => np.priority === "nice_to_have" && np.status === "obtained"
  ).length;
  const obtainedOptional = strategy.negotiationPoints.filter(
    np => np.priority === "optional" && np.status === "obtained"
  ).length;

  // Weighted score improvement
  const improvement = obtainedMustHave * 5 + obtainedNiceToHave * 2 + obtainedOptional * 1;

  if (strategy.improvedDealScore) {
    return Math.min(100, strategy.improvedDealScore.before + improvement);
  }

  return improvement;
}
