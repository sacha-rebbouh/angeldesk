import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  ExitStrategistResult,
  ExitStrategistData,
  ExitStrategistFindings,
  ExitScenario,
  ComparableExit,
  MnAMarketAnalysis,
  LiquidityRisk,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";
import { getExitBenchmarkFull, getTimeToLiquidity } from "@/services/benchmarks";

/**
 * EXIT STRATEGIST AGENT - REFONTE v2.0
 *
 * Mission: Modéliser les scénarios de sortie réalistes et calculer les retours potentiels
 * pour un Business Angel, avec TOUS les calculs montrés et sourcés.
 *
 * Persona: Managing Director M&A chez Goldman Sachs + Partner VC 20+ ans d'expérience exits
 *
 * Standard: Big4 + Partner VC
 * - Chaque scénario basé sur des comparables réels
 * - Chaque multiple sourcé (DB, Crunchbase, deals publics)
 * - Calculs IRR et dilution MONTRES
 * - Red flags avec impact quantifié
 *
 * Inputs:
 * - Documents: Pitch deck, financial model
 * - Context Engine: Deals similaires, exits secteur, acheteurs actifs
 * - Dependencies: document-extractor, financial-auditor (optionnel)
 *
 * Outputs:
 * - 4+ scénarios d'exit détaillés avec calculs
 * - Comparables réels sourcés
 * - Red flags liquidité
 * - Questions pour le fondateur
 */

// LLM Response structure
interface LLMExitStrategistResponse {
  meta: {
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score: {
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  findings: {
    scenarios: {
      id: string;
      type: string;
      name: string;
      description: string;
      probability: {
        level: string;
        percentage: number;
        rationale: string;
        basedOn: string;
      };
      timeline: {
        estimatedYears: number;
        range: string;
        milestones: string[];
        assumptions: string[];
      };
      exitValuation: {
        estimated: number;
        range: { min: number; max: number };
        methodology: string;
        multipleUsed: number;
        multipleSource: string;
        calculation: string;
      };
      potentialBuyers?: {
        name: string;
        type: string;
        rationale: string;
        recentAcquisitions?: string[];
        likelihoodToBuy: string;
      }[];
      investorReturn: {
        initialInvestment: number;
        ownershipAtEntry: number;
        dilutionToExit: number;
        dilutionCalculation: string;
        ownershipAtExit: number;
        grossProceeds: number;
        proceedsCalculation: string;
        multiple: number;
        irr: number;
        irrCalculation: string;
      };
    }[];
    comparableExits: {
      id: string;
      target: string;
      acquirer: string;
      year: number;
      sector: string;
      stage: string;
      exitValue: number;
      revenueAtExit?: number;
      arrAtExit?: number;
      multipleRevenue?: number;
      multipleArr?: number;
      source: string;
      relevance: {
        score: number;
        similarities: string[];
        differences: string[];
      };
    }[];
    mnaMarket: {
      sectorName: string;
      period: string;
      activity: {
        totalDeals: number;
        totalValue: number;
        trend: string;
        trendRationale: string;
      };
      multiples: {
        revenueMultiple: { p25: number; median: number; p75: number };
        arrMultiple?: { p25: number; median: number; p75: number };
        source: string;
      };
      activeBuyers: {
        name: string;
        type: string;
        recentDeals: number;
        focusAreas: string[];
      }[];
      exitWindow: {
        assessment: string;
        rationale: string;
        timeRemaining: string;
      };
    };
    liquidityAnalysis: {
      overallLiquidity: string;
      rationale: string;
      risks: {
        id: string;
        risk: string;
        category: string;
        severity: string;
        probability: string;
        impact: string;
        mitigation?: string;
        questionToAsk: string;
      }[];
      timeToLiquidity: {
        bestCase: string;
        baseCase: string;
        worstCase: string;
      };
    };
    deckClaimsAnalysis: {
      claimsFound: {
        claim: string;
        location: string;
        status: string;
        evidence: string;
      }[];
      deckRealism: string;
      deckRealismRationale: string;
    };
    returnSummary: {
      expectedCase: {
        scenario: string;
        probability: number;
        multiple: number;
        irr: number;
      };
      upside: {
        scenario: string;
        probability: number;
        multiple: number;
        irr: number;
      };
      downside: {
        scenario: string;
        probability: number;
        multiple: number;
        irr: number;
      };
      probabilityWeightedReturn: {
        expectedMultiple: number;
        calculation: string;
      };
    };
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
}

export class ExitStrategistAgent extends BaseAgent<ExitStrategistData, ExitStrategistResult> {
  constructor() {
    super({
      name: "exit-strategist",
      description: "Modélise les scénarios de sortie et calcule les retours potentiels pour le BA",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un Managing Director M&A senior avec 20+ ans d'expérience dans les exits de startups tech.
Tu as conseillé 200+ transactions (acquisitions, IPOs, secondaries) et vu les patterns de succès/échec.
Tu combines la rigueur analytique d'un banker Goldman Sachs avec l'instinct d'un Partner VC expérimenté.

Ta mission: Aider un Business Angel à comprendre EXACTEMENT comment il sortira de cet investissement,
avec quels retours réalistes, et quels sont les risques de liquidité.

# MISSION POUR CE DEAL

Analyser les scénarios de sortie réalistes pour ce deal en:
1. Identifiant les acheteurs potentiels (stratégiques et financiers)
2. Calculant les retours attendus avec dilution réaliste
3. Comparant avec des exits réels du secteur
4. Alertant sur les risques de liquidité

# METHODOLOGIE D'ANALYSE

## Etape 1: Comprendre le profil de sortie
- Identifier le secteur et sous-secteur exact
- Analyser le business model (SaaS, Marketplace, etc.)
- Évaluer la "acquirability" (intérêt pour les acheteurs)
- Identifier les assets uniques (tech, data, équipe, clients)

## Etape 2: Analyser le marché M&A du secteur
- Rechercher les exits récents dans le secteur (Context Engine / DB)
- Calculer les multiples observés (P25, médiane, P75)
- Identifier les acheteurs actifs et leurs critères
- Évaluer la fenêtre de sortie actuelle

## Etape 3: Modéliser les scénarios d'exit
Pour CHAQUE scénario, calculer avec précision:
- Timeline réaliste avec milestones
- Valorisation à l'exit (multiple × métriques projetées)
- Dilution cumulative jusqu'à l'exit (série par série)
- Retour brut pour le BA (ownership × exit value)
- IRR annualisé (formule: (retour/investissement)^(1/années) - 1)

## Etape 4: Valider vs comparables réels
- Croiser chaque projection avec des exits réels
- Ajuster les multiples si nécessaire
- Identifier les écarts vs marché

## Etape 5: Identifier les risques de liquidité
- Évaluer la probabilité de chaque scénario
- Identifier les blockers potentiels
- Calculer le retour pondéré par les probabilités

# FRAMEWORK D'EVALUATION - EXIT ATTRACTIVENESS SCORE

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Acquirability (intérêt acheteurs) | 25% | Aucun acheteur identifiable | 1-2 acheteurs potentiels | 3-5 acheteurs actifs | Multiple acheteurs, signaux d'intérêt |
| Multiples secteur | 20% | <3x revenue | 3-5x revenue | 5-10x revenue | >10x revenue |
| Fenêtre de sortie | 20% | Fermée/très difficile | Refroidissement | Stable | Chaude, consolidation active |
| Timeline réaliste | 15% | >10 ans ou très incertain | 7-10 ans | 5-7 ans | 3-5 ans avec jalons clairs |
| Retour attendu (IRR) | 20% | <10% IRR | 10-20% IRR | 20-35% IRR | >35% IRR |

# RED FLAGS SPECIFIQUES A DETECTER

1. **CRITICAL - No Exit Path**
   - Aucun acheteur logique identifiable
   - Secteur sans précédent d'exit
   - Business model non scalable pour exit

2. **CRITICAL - Unrealistic Projections**
   - Valorisation exit du deck 5x+ vs comparables
   - Timeline 2-3 ans pour exit alors que moyenne secteur = 7 ans
   - IRR promis > 50% sans justification

3. **HIGH - Excessive Dilution**
   - Dilution projetée > 80% seed→exit
   - Plusieurs tours avant profitabilité
   - Option pool à créer pre-exit

4. **HIGH - Market Window Closing**
   - Activité M&A en baisse >30% YoY
   - Multiples en compression
   - Consolidation déjà faite

5. **MEDIUM - Single Buyer Dependency**
   - Un seul acheteur logique
   - Risque de négociation déséquilibrée

6. **MEDIUM - Long Time to Exit**
   - >7 ans avant liquidité probable
   - Plusieurs pivots possibles avant exit

# REGLES DE CALCUL

## Dilution standard (à ajuster selon secteur)
- Seed → Series A: 25-30%
- Series A → Series B: 20-25%
- Series B → Series C/Exit: 15-20%
- ESOP refresh: 5-10% par round
- Total seed→exit: 55-70% typique

## Formules obligatoires

IRR = (Exit Proceeds / Initial Investment)^(1/years) - 1

Ownership at Exit = Initial % × (1 - Dilution_A) × (1 - Dilution_B) × ...

Exit Proceeds = Exit Valuation × Ownership at Exit

Expected Multiple = Σ (Scenario Probability × Scenario Multiple)

# FORMAT DE SORTIE

Produis un JSON structuré avec:
- meta: dataCompleteness, confidenceLevel, limitations
- score: value (0-100), grade, breakdown par critère
- findings: scenarios (4+), comparableExits (3+), mnaMarket, liquidityAnalysis, returnSummary
- dbCrossReference: claims vérifiés vs Context Engine
- redFlags: avec les 5 composants obligatoires
- questions: pour le fondateur avec contexte
- alertSignal: hasBlocker, recommendation, justification
- narrative: oneLiner, summary, keyInsights, forNegotiation

# REGLES ABSOLUES

1. JAMAIS inventer de comparables - utiliser uniquement ceux du Context Engine ou sources vérifiables
2. TOUJOURS montrer les calculs (IRR, dilution, proceeds)
3. TOUJOURS citer la source des multiples ("DB median SaaS 2024", "Crunchbase", etc.)
4. QUANTIFIER les probabilités (pas juste "probable")
5. Le scénario "failure" doit TOUJOURS être inclus avec perte totale
6. Le BA doit pouvoir expliquer ces projections à un co-investisseur

# EXEMPLES

## Exemple de BON output (scénario):
{
  "type": "acquisition_strategic",
  "name": "Acquisition par acteur SaaS RH établi",
  "probability": {
    "level": "MEDIUM",
    "percentage": 35,
    "rationale": "3 acteurs actifs dans le secteur, 2 acquisitions similaires en 2024",
    "basedOn": "DB: 2 exits SaaS RH France 2024 (Lucca acquiert PayFit analytics, Workday acquiert Peakon)"
  },
  "exitValuation": {
    "estimated": 45000000,
    "methodology": "8x ARR projeté Y5",
    "multipleUsed": 8,
    "multipleSource": "DB median SaaS B2B Europe exits 2023-2024: 7.2x ARR",
    "calculation": "ARR Y5 projeté: 5.6M€ × 8 = 44.8M€, arrondi 45M€"
  },
  "investorReturn": {
    "initialInvestment": 50000,
    "ownershipAtEntry": 1.67,
    "dilutionToExit": 62,
    "dilutionCalculation": "Seed: 100% → SerA (-28%): 72% → SerB (-22%): 56% → Pre-exit ESOP (-10%): 50.4% | Total dilution: 1 - 0.504/1 = 49.6% sur ownership, ownership finale: 1.67% × 0.504 = 0.84%",
    "ownershipAtExit": 0.84,
    "grossProceeds": 378000,
    "proceedsCalculation": "45M€ × 0.84% = 378K€",
    "multiple": 7.56,
    "irr": 40.2,
    "irrCalculation": "(378000/50000)^(1/5) - 1 = 7.56^0.2 - 1 = 40.2%"
  }
}

## Exemple de MAUVAIS output (à éviter):
{
  "type": "acquisition",
  "probability": "medium",
  "exitValuation": 50000000,
  "investorReturn": { "multiple": 10 }
}
→ Aucun calcul montré, aucune source, probabilité non quantifiée.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ExitStrategistData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Extract key parameters
    const deal = context.deal;
    const investmentAmount = Number(extractedInfo?.amountRaising) || (deal.amountRequested ? Number(deal.amountRequested) : 500000);
    const valuation = Number(extractedInfo?.valuationPre) || (deal.valuationPre ? Number(deal.valuationPre) : 3000000);
    const arr = Number(extractedInfo?.arr) || (deal.arr ? Number(deal.arr) : 0);
    const sector = extractedInfo?.sector || deal.sector || "Technology";
    const stage = deal.stage || "SEED";

    // Calculate initial ownership with generic BA ticket estimate
    // Note: Personalized calculations are done by Tier 3 agents using actual BA preferences
    const ticketSize = Math.min(investmentAmount * 0.10, 50000); // Generic: 10% of round, max 50K€
    const initialOwnership = (ticketSize / (valuation + investmentAmount)) * 100;

    const prompt = `# ANALYSE EXIT STRATEGIST - ${deal.name || deal.companyName}

## DOCUMENTS ET CONTEXTE
${dealContext}

## DONNEES CONTEXT ENGINE
${contextEngineData}

## PARAMETRES D'INVESTISSEMENT

| Paramètre | Valeur | Source |
|-----------|--------|--------|
| Valorisation pre-money | €${valuation.toLocaleString()} | ${extractedInfo?.valuationPre ? "Deck" : "Estimé"} |
| Montant du round | €${investmentAmount.toLocaleString()} | ${extractedInfo?.amountRaising ? "Deck" : "Estimé"} |
| Ticket BA (estimé) | €${ticketSize.toLocaleString()} | 15% du round, max 100K |
| Ownership BA post-round | ${initialOwnership.toFixed(2)}% | Calcul: ${ticketSize}/(${valuation}+${investmentAmount}) |
| ARR actuel | €${arr.toLocaleString()} | ${arr > 0 ? "Deck" : "Non fourni"} |
| Secteur | ${sector} | Deal |
| Stade | ${stage} | Deal |

## INSTRUCTIONS SPECIFIQUES

1. **Scénarios obligatoires** (minimum 4):
   - Acquisition stratégique (acteur du secteur)
   - Acquisition financière (PE/Growth)
   - IPO ou late-stage exit (si applicable)
   - Failure (perte totale) - OBLIGATOIRE

2. **Pour chaque scénario**:
   - Probabilité chiffrée avec justification
   - Timeline avec milestones
   - Valorisation avec calcul montré
   - Dilution détaillée par round
   - Retour BA avec formule IRR

3. **Comparables**:
   - Utiliser les exits du Context Engine si disponibles
   - Sinon, rechercher des exits publics du secteur
   - Minimum 3 comparables avec multiples

4. **Validation deck**:
   - Si le deck mentionne des projections d'exit, les vérifier
   - Comparer aux multiples réels du marché

5. **Red flags à vérifier**:
   - Aucun acheteur logique = CRITICAL
   - Projections exit irréalistes = CRITICAL
   - Dilution > 75% = HIGH
   - Time to exit > 8 ans = HIGH

Produis une analyse EXIT STRATEGIST complète au format JSON.
Standard: Qualité M&A Goldman Sachs.
Le BA doit pouvoir utiliser ces projections dans sa décision d'investissement.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["string"]
  },
  "score": {
    "value": 0-100,
    "grade": "A|B|C|D|F",
    "breakdown": [
      { "criterion": "string", "weight": 0-100, "score": 0-100, "justification": "string" }
    ]
  },
  "findings": {
    "scenarios": [
      {
        "id": "scenario_1",
        "type": "acquisition_strategic|acquisition_pe|ipo|secondary|acquihire|failure",
        "name": "string",
        "description": "string",
        "probability": { "level": "HIGH|MEDIUM|LOW|VERY_LOW", "percentage": 0-100, "rationale": "string", "basedOn": "string" },
        "timeline": { "estimatedYears": number, "range": "string", "milestones": ["string"], "assumptions": ["string"] },
        "exitValuation": { "estimated": number, "range": { "min": number, "max": number }, "methodology": "string", "multipleUsed": number, "multipleSource": "string", "calculation": "string" },
        "potentialBuyers": [{ "name": "string", "type": "strategic|pe|corporate_vc", "rationale": "string", "likelihoodToBuy": "HIGH|MEDIUM|LOW" }],
        "investorReturn": { "initialInvestment": number, "ownershipAtEntry": number, "dilutionToExit": number, "dilutionCalculation": "string", "ownershipAtExit": number, "grossProceeds": number, "proceedsCalculation": "string", "multiple": number, "irr": number, "irrCalculation": "string" }
      }
    ],
    "comparableExits": [
      { "id": "comp_1", "target": "string", "acquirer": "string", "year": number, "sector": "string", "stage": "string", "exitValue": number, "arrAtExit": number, "multipleArr": number, "source": "string", "relevance": { "score": 0-100, "similarities": ["string"], "differences": ["string"] } }
    ],
    "mnaMarket": {
      "sectorName": "string",
      "period": "string",
      "activity": { "totalDeals": number, "totalValue": number, "trend": "HEATING|STABLE|COOLING", "trendRationale": "string" },
      "multiples": { "revenueMultiple": { "p25": number, "median": number, "p75": number }, "source": "string" },
      "activeBuyers": [{ "name": "string", "type": "string", "recentDeals": number, "focusAreas": ["string"] }],
      "exitWindow": { "assessment": "EXCELLENT|GOOD|NEUTRAL|POOR|CLOSED", "rationale": "string", "timeRemaining": "string" }
    },
    "liquidityAnalysis": {
      "overallLiquidity": "HIGH|MEDIUM|LOW|VERY_LOW",
      "rationale": "string",
      "risks": [{ "id": "risk_1", "risk": "string", "category": "market|company|structural|timing|dilution", "severity": "CRITICAL|HIGH|MEDIUM", "probability": "HIGH|MEDIUM|LOW", "impact": "string", "mitigation": "string", "questionToAsk": "string" }],
      "timeToLiquidity": { "bestCase": "string", "baseCase": "string", "worstCase": "string" }
    },
    "deckClaimsAnalysis": {
      "claimsFound": [{ "claim": "string", "location": "string", "status": "VERIFIED|EXAGGERATED|UNREALISTIC|NOT_VERIFIABLE", "evidence": "string" }],
      "deckRealism": "REALISTIC|OPTIMISTIC|VERY_OPTIMISTIC|UNREALISTIC",
      "deckRealismRationale": "string"
    },
    "returnSummary": {
      "expectedCase": { "scenario": "string", "probability": number, "multiple": number, "irr": number },
      "upside": { "scenario": "string", "probability": number, "multiple": number, "irr": number },
      "downside": { "scenario": "string", "probability": number, "multiple": number, "irr": number },
      "probabilityWeightedReturn": { "expectedMultiple": number, "calculation": "string" }
    }
  },
  "dbCrossReference": {
    "claims": [{ "claim": "string", "location": "string", "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE", "evidence": "string", "severity": "CRITICAL|HIGH|MEDIUM" }],
    "uncheckedClaims": ["string"]
  },
  "redFlags": [
    { "id": "rf_1", "category": "exit_path|projections|dilution|timing|liquidity", "severity": "CRITICAL|HIGH|MEDIUM", "title": "string", "description": "string", "location": "string", "evidence": "string", "contextEngineData": "string", "impact": "string", "question": "string", "redFlagIfBadAnswer": "string" }
  ],
  "questions": [
    { "priority": "CRITICAL|HIGH|MEDIUM", "category": "exit_strategy|acquirers|timeline|dilution|terms", "question": "string", "context": "string", "whatToLookFor": "string" }
  ],
  "alertSignal": {
    "hasBlocker": boolean,
    "blockerReason": "string ou null",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "string"
  },
  "narrative": {
    "oneLiner": "string (1 phrase résumant le potentiel exit)",
    "summary": "string (3-4 phrases)",
    "keyInsights": ["string (3-5 insights majeurs)"],
    "forNegotiation": ["string (arguments pour négocier si on proceed)"]
  }
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMExitStrategistResponse>(prompt);

    // Normalize and validate the response
    return this.normalizeResponse(data, ticketSize, initialOwnership);
  }

  private normalizeResponse(
    data: LLMExitStrategistResponse,
    ticketSize: number,
    initialOwnership: number
  ): ExitStrategistData {
    // Normalize meta
    const meta: AgentMeta = {
      agentName: "exit-strategist",
      analysisDate: new Date().toISOString(),
      dataCompleteness: this.normalizeDataCompleteness(data.meta?.dataCompleteness),
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const score: AgentScore = {
      value: Math.min(100, Math.max(0, data.score?.value ?? 50)),
      grade: this.normalizeGrade(data.score?.grade),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 20,
            score: Math.min(100, Math.max(0, b.score ?? 50)),
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize scenarios
    const scenarios: ExitScenario[] = Array.isArray(data.findings?.scenarios)
      ? data.findings.scenarios.map((s, i) => ({
          id: s.id ?? `scenario_${i + 1}`,
          type: this.normalizeExitType(s.type),
          name: s.name ?? "Unnamed scenario",
          description: s.description ?? "",
          probability: {
            level: this.normalizeProbabilityLevel(s.probability?.level),
            percentage: Math.min(100, Math.max(0, s.probability?.percentage ?? 25)),
            rationale: s.probability?.rationale ?? "",
            basedOn: s.probability?.basedOn ?? "Estimation",
          },
          timeline: {
            estimatedYears: s.timeline?.estimatedYears ?? 5,
            range: s.timeline?.range ?? "4-7 ans",
            milestones: Array.isArray(s.timeline?.milestones) ? s.timeline.milestones : [],
            assumptions: Array.isArray(s.timeline?.assumptions) ? s.timeline.assumptions : [],
          },
          exitValuation: {
            estimated: s.exitValuation?.estimated ?? 0,
            range: {
              min: s.exitValuation?.range?.min ?? 0,
              max: s.exitValuation?.range?.max ?? 0,
            },
            methodology: s.exitValuation?.methodology ?? "",
            multipleUsed: s.exitValuation?.multipleUsed ?? 0,
            multipleSource: s.exitValuation?.multipleSource ?? "Non sourcé",
            calculation: s.exitValuation?.calculation ?? "",
          },
          potentialBuyers: s.potentialBuyers?.map((b) => ({
            name: b.name ?? "",
            type: this.normalizeBuyerType(b.type),
            rationale: b.rationale ?? "",
            recentAcquisitions: b.recentAcquisitions,
            likelihoodToBuy: this.normalizeLikelihood(b.likelihoodToBuy),
          })),
          investorReturn: {
            initialInvestment: s.investorReturn?.initialInvestment ?? ticketSize,
            ownershipAtEntry: s.investorReturn?.ownershipAtEntry ?? initialOwnership,
            dilutionToExit: s.investorReturn?.dilutionToExit ?? 60,
            dilutionCalculation: s.investorReturn?.dilutionCalculation ?? "",
            ownershipAtExit: s.investorReturn?.ownershipAtExit ?? initialOwnership * 0.4,
            grossProceeds: s.investorReturn?.grossProceeds ?? 0,
            proceedsCalculation: s.investorReturn?.proceedsCalculation ?? "",
            multiple: s.investorReturn?.multiple ?? 0,
            irr: s.investorReturn?.irr ?? 0,
            irrCalculation: s.investorReturn?.irrCalculation ?? "",
          },
        }))
      : [];

    // Normalize comparable exits
    const comparableExits: ComparableExit[] = Array.isArray(data.findings?.comparableExits)
      ? data.findings.comparableExits.map((c, i) => ({
          id: c.id ?? `comp_${i + 1}`,
          target: c.target ?? "",
          acquirer: c.acquirer ?? "",
          year: c.year ?? new Date().getFullYear(),
          sector: c.sector ?? "",
          stage: c.stage ?? "",
          exitValue: c.exitValue ?? 0,
          revenueAtExit: c.revenueAtExit,
          arrAtExit: c.arrAtExit,
          multipleRevenue: c.multipleRevenue,
          multipleArr: c.multipleArr,
          source: c.source ?? "Unknown",
          relevance: {
            score: c.relevance?.score ?? 50,
            similarities: c.relevance?.similarities ?? [],
            differences: c.relevance?.differences ?? [],
          },
        }))
      : [];

    // Get exit benchmarks from centralized service
    const exitBenchmark = getExitBenchmarkFull(null, null, "revenueMultiple");

    // Normalize M&A market
    const mnaMarket: MnAMarketAnalysis = {
      sectorName: data.findings?.mnaMarket?.sectorName ?? "Technology",
      period: data.findings?.mnaMarket?.period ?? "2023-2025",
      activity: {
        totalDeals: data.findings?.mnaMarket?.activity?.totalDeals ?? 0,
        totalValue: data.findings?.mnaMarket?.activity?.totalValue ?? 0,
        trend: this.normalizeTrend(data.findings?.mnaMarket?.activity?.trend),
        trendRationale: data.findings?.mnaMarket?.activity?.trendRationale ?? "",
      },
      multiples: {
        revenueMultiple: {
          p25: data.findings?.mnaMarket?.multiples?.revenueMultiple?.p25 ?? exitBenchmark.p25,
          median: data.findings?.mnaMarket?.multiples?.revenueMultiple?.median ?? exitBenchmark.median,
          p75: data.findings?.mnaMarket?.multiples?.revenueMultiple?.p75 ?? exitBenchmark.p75,
        },
        arrMultiple: data.findings?.mnaMarket?.multiples?.arrMultiple,
        source: data.findings?.mnaMarket?.multiples?.source ?? "Centralized Benchmarks",
      },
      activeBuyers: data.findings?.mnaMarket?.activeBuyers ?? [],
      exitWindow: {
        assessment: this.normalizeExitWindow(data.findings?.mnaMarket?.exitWindow?.assessment),
        rationale: data.findings?.mnaMarket?.exitWindow?.rationale ?? "",
        timeRemaining: data.findings?.mnaMarket?.exitWindow?.timeRemaining ?? "",
      },
    };

    // Normalize liquidity risks
    const liquidityRisks: LiquidityRisk[] = Array.isArray(data.findings?.liquidityAnalysis?.risks)
      ? data.findings.liquidityAnalysis.risks.map((r, i) => ({
          id: r.id ?? `risk_${i + 1}`,
          risk: r.risk ?? "",
          category: this.normalizeRiskCategory(r.category),
          severity: this.normalizeSeverity(r.severity),
          probability: this.normalizeLikelihood(r.probability),
          impact: r.impact ?? "",
          mitigation: r.mitigation,
          questionToAsk: r.questionToAsk ?? "",
        }))
      : [];

    // Normalize findings
    const findings: ExitStrategistFindings = {
      scenarios,
      comparableExits,
      mnaMarket,
      liquidityAnalysis: {
        overallLiquidity: this.normalizeLiquidity(data.findings?.liquidityAnalysis?.overallLiquidity),
        rationale: data.findings?.liquidityAnalysis?.rationale ?? "",
        risks: liquidityRisks,
        timeToLiquidity: (() => {
          // Get time to liquidity from centralized service
          const ttl = getTimeToLiquidity(null, null);
          return {
            bestCase: data.findings?.liquidityAnalysis?.timeToLiquidity?.bestCase ?? `${ttl.bestCase} ans`,
            baseCase: data.findings?.liquidityAnalysis?.timeToLiquidity?.baseCase ?? `${ttl.baseCase} ans`,
            worstCase: data.findings?.liquidityAnalysis?.timeToLiquidity?.worstCase ?? `${ttl.worstCase}+ ans`,
          };
        })(),
      },
      deckClaimsAnalysis: {
        claimsFound: Array.isArray(data.findings?.deckClaimsAnalysis?.claimsFound)
          ? data.findings.deckClaimsAnalysis.claimsFound.map((c) => ({
              claim: c.claim ?? "",
              location: c.location ?? "",
              status: this.normalizeClaimStatus(c.status),
              evidence: c.evidence ?? "",
            }))
          : [],
        deckRealism: this.normalizeDeckRealism(data.findings?.deckClaimsAnalysis?.deckRealism),
        deckRealismRationale: data.findings?.deckClaimsAnalysis?.deckRealismRationale ?? "",
      },
      returnSummary: {
        expectedCase: data.findings?.returnSummary?.expectedCase ?? { scenario: "", probability: 0, multiple: 0, irr: 0 },
        upside: data.findings?.returnSummary?.upside ?? { scenario: "", probability: 0, multiple: 0, irr: 0 },
        downside: data.findings?.returnSummary?.downside ?? { scenario: "", probability: 0, multiple: 0, irr: 0 },
        probabilityWeightedReturn: {
          expectedMultiple: data.findings?.returnSummary?.probabilityWeightedReturn?.expectedMultiple ?? 0,
          calculation: data.findings?.returnSummary?.probabilityWeightedReturn?.calculation ?? "",
        },
      },
    };

    // Normalize DB cross-reference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: this.normalizeVerdict(c.dbVerdict),
            evidence: c.evidence ?? "",
            severity: c.severity ? this.normalizeSeverity(c.severity) : undefined,
          }))
        : [],
      uncheckedClaims: data.dbCrossReference?.uncheckedClaims ?? [],
    };

    // Normalize red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, i) => ({
          id: rf.id ?? `rf_${i + 1}`,
          category: rf.category ?? "exit_path",
          severity: this.normalizeSeverity(rf.severity),
          title: rf.title ?? "",
          description: rf.description ?? "",
          location: rf.location ?? "",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: this.normalizePriority(q.priority),
          category: q.category ?? "exit_strategy",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alert signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: this.normalizeRecommendation(data.alertSignal?.recommendation),
      justification: data.alertSignal?.justification ?? "",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "",
      summary: data.narrative?.summary ?? "",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
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

  // Normalization helpers
  private normalizeDataCompleteness(value?: string): "complete" | "partial" | "minimal" {
    if (value === "complete" || value === "partial" || value === "minimal") return value;
    return "partial";
  }

  private normalizeGrade(value?: string): "A" | "B" | "C" | "D" | "F" {
    if (value === "A" || value === "B" || value === "C" || value === "D" || value === "F") return value;
    return "C";
  }

  private normalizeExitType(value?: string): ExitScenario["type"] {
    const valid = ["acquisition_strategic", "acquisition_pe", "ipo", "secondary", "acquihire", "failure"];
    if (valid.includes(value ?? "")) return value as ExitScenario["type"];
    return "acquisition_strategic";
  }

  private normalizeProbabilityLevel(value?: string): "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW" || value === "VERY_LOW") return value;
    return "MEDIUM";
  }

  private normalizeBuyerType(value?: string): "strategic" | "pe" | "corporate_vc" {
    if (value === "strategic" || value === "pe" || value === "corporate_vc") return value;
    return "strategic";
  }

  private normalizeLikelihood(value?: string): "HIGH" | "MEDIUM" | "LOW" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
    return "MEDIUM";
  }

  private normalizeTrend(value?: string): "HEATING" | "STABLE" | "COOLING" {
    if (value === "HEATING" || value === "STABLE" || value === "COOLING") return value;
    return "STABLE";
  }

  private normalizeExitWindow(value?: string): "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "CLOSED" {
    if (value === "EXCELLENT" || value === "GOOD" || value === "NEUTRAL" || value === "POOR" || value === "CLOSED") return value;
    return "NEUTRAL";
  }

  private normalizeRiskCategory(value?: string): LiquidityRisk["category"] {
    const valid = ["market", "company", "structural", "timing", "dilution"];
    if (valid.includes(value ?? "")) return value as LiquidityRisk["category"];
    return "market";
  }

  private normalizeSeverity(value?: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    if (value === "CRITICAL" || value === "HIGH" || value === "MEDIUM") return value;
    return "MEDIUM";
  }

  private normalizeLiquidity(value?: string): "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW" || value === "VERY_LOW") return value;
    return "MEDIUM";
  }

  private normalizeDeckRealism(value?: string): "REALISTIC" | "OPTIMISTIC" | "VERY_OPTIMISTIC" | "UNREALISTIC" {
    if (value === "REALISTIC" || value === "OPTIMISTIC" || value === "VERY_OPTIMISTIC" || value === "UNREALISTIC") return value;
    return "OPTIMISTIC";
  }

  private normalizeClaimStatus(value?: string): "VERIFIED" | "EXAGGERATED" | "UNREALISTIC" | "NOT_VERIFIABLE" {
    if (value === "VERIFIED" || value === "EXAGGERATED" || value === "UNREALISTIC" || value === "NOT_VERIFIABLE") return value;
    return "NOT_VERIFIABLE";
  }

  private normalizeVerdict(value?: string): "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE" {
    if (value === "VERIFIED" || value === "CONTRADICTED" || value === "PARTIAL" || value === "NOT_VERIFIABLE") return value;
    return "NOT_VERIFIABLE";
  }

  private normalizePriority(value?: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    if (value === "CRITICAL" || value === "HIGH" || value === "MEDIUM") return value;
    return "MEDIUM";
  }

  private normalizeRecommendation(value?: string): AgentAlertSignal["recommendation"] {
    const valid = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"];
    if (valid.includes(value ?? "")) return value as AgentAlertSignal["recommendation"];
    return "INVESTIGATE_FURTHER";
  }
}

export const exitStrategist = new ExitStrategistAgent();
