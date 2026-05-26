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
import { deriveTier1SignalIntensity, signalIntensityToRecommendation, type Tier1SignalIntensity } from "./utils/derive-alert-signal";
import { getExitBenchmarkFull, getTimeToLiquidity } from "@/services/benchmarks";
import { calculateAgentScore, EXIT_STRATEGIST_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";
import { getSectorProfile, formatSectorProfileForPrompt, applySectorRedFlagFilter } from "@/agents/orchestration/sector-profiles";

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
      potentialBuyers?: {
        name: string;
        type: string;
        rationale: string;
        recentAcquisitions?: string[];
        likelihoodToBuy: string;
      }[];
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
      timeoutMs: 240000, // 4 min
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un Managing Director M&A senior avec 20+ ans d'expérience dans les exits de startups tech.
Tu as conseillé 200+ transactions (acquisitions, IPOs, secondaries) et vu les patterns de succès/échec.
Tu combines la rigueur analytique d'un banker Goldman Sachs avec l'instinct d'un Partner VC expérimenté.

Ta mission : éclairer un Business Angel sur le paysage M&A du secteur,
les acquéreurs réalistes, les multiples observés historiquement, et les
risques de liquidité — sans inventer de chiffres prospectifs.

# DOCTRINE ANTI-ORACULAIRE (NON-NEGOCIABLE)

Tu N'INVENTES JAMAIS de valorisation d'exit point-estimate, de multiple
attendu, d'IRR projeté, ni de dilution prévisionnelle pour CE deal.
Ces nombres ne peuvent pas être connus : les fournir, c'est mentir.

À la place, tu rapportes des FAITS historiques :
- Comparables réels du secteur (exits sourcés avec montants observés)
- Distribution des multiples observés (P25 / médiane / P75) avec source
- Acheteurs actifs et leurs acquisitions récentes
- Fenêtre de sortie sectorielle (chaude / stable / refroidie)

# MISSION POUR CE DEAL

1. Identifier les acheteurs potentiels (stratégiques et financiers) avec
   sources et acquisitions récentes vérifiables
2. Analyser le marché M&A du secteur : volume, tendance, multiples
   observés (DB + Crunchbase + sources publiques)
3. Décrire des scénarios de sortie QUALITATIFS (type d'acquéreur,
   timeline plausible, jalons) — JAMAIS de valorisation chiffrée pour
   le deal, JAMAIS d'IRR ou de multiple projeté
4. Alerter sur les risques de liquidité documentés

# METHODOLOGIE D'ANALYSE

## Etape 1 : profil de sortie
- Secteur et sous-secteur exact
- Business model
- Acquirability (intérêt observé pour des cibles similaires)
- Assets uniques (tech, data, équipe, clients)

## Etape 2 : marché M&A du secteur
- Exits récents (Context Engine / DB / Crunchbase)
- Multiples observés P25 / médiane / P75 avec source et période
- Acheteurs actifs et leurs critères
- Fenêtre de sortie actuelle

## Etape 3 : scénarios de sortie qualitatifs
Pour CHAQUE scénario :
- Type d'exit (acquisition_strategic / acquisition_pe / ipo / etc.)
- Probabilité quantifiée (avec rationale + source)
- Timeline plausible avec jalons
- Acheteurs potentiels nominés
- Description narrative
INTERDIT : exit valuation chiffrée, IRR, multiple attendu, dilution prévisionnelle

## Etape 4 : valider vs comparables réels
- Recoller chaque scénario qualitatif à des exits historiques similaires
- Documenter les similarités et différences

## Etape 5 : risques de liquidité
- Probabilité de chaque scénario
- Blockers potentiels documentés
- Fenêtre de sortie

# FRAMEWORK D'EVALUATION - EXIT ATTRACTIVENESS SCORE

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Acquirability (acheteurs identifiés) | 30% | Aucun acheteur identifiable | 1-2 acheteurs potentiels | 3-5 acheteurs actifs | Multiple acheteurs avec signaux |
| Multiples observés (DB) | 25% | <3x revenue | 3-5x revenue | 5-10x revenue | >10x revenue |
| Fenêtre de sortie | 25% | Fermée/très difficile | Refroidissement | Stable | Chaude, consolidation active |
| Timeline plausible | 20% | >10 ans ou très incertain | 7-10 ans | 5-7 ans | 3-5 ans avec jalons clairs |

# RED FLAGS SPECIFIQUES A DETECTER

1. **CRITICAL - No Exit Path**
   - Aucun acheteur logique identifiable
   - Secteur sans précédent d'exit
   - Business model non scalable pour exit

2. **CRITICAL - Deck Unrealistic**
   - Valorisation exit du deck >5x au-dessus des comparables observés
   - Timeline 2-3 ans alors que moyenne secteur = 7 ans
   - IRR promis par les fondateurs >50% sans comparable

3. **HIGH - Market Window Closing**
   - Activité M&A en baisse >30% YoY
   - Multiples en compression
   - Consolidation déjà faite

4. **MEDIUM - Single Buyer Dependency**
   - Un seul acheteur logique
   - Risque de négociation déséquilibrée

5. **MEDIUM - Long Time to Exit**
   - >7 ans avant liquidité probable

# FORMAT DE SORTIE

Produis un JSON structuré avec :
- meta : dataCompleteness, confidenceLevel, limitations
- score : value (0-100), grade, breakdown par critère
- findings : scenarios (3-5 qualitatifs), comparableExits (3+ avec montants observés), mnaMarket, liquidityAnalysis, deckClaimsAnalysis
- dbCrossReference : claims vérifiés vs Context Engine
- redFlags : avec les composants obligatoires
- questions : pour le fondateur avec contexte
- alertSignal : hasBlocker, blockerReason, justification (constat factuel)
- narrative : oneLiner, summary, keyInsights, forNegotiation

# REGLES ABSOLUES

1. JAMAIS inventer de comparables — uniquement Context Engine ou sources vérifiables
2. JAMAIS produire d'exit valuation, IRR ou multiple ATTENDU pour ce deal
3. TOUJOURS citer la source des multiples observés ("DB median SaaS 2024", "Crunchbase 2023", etc.)
4. QUANTIFIER les probabilités (pas juste "probable")
5. Le scénario "failure" doit TOUJOURS être inclus
6. Si une vérification de claim du deck mentionne un multiple/IRR/valo
   projetée par les fondateurs, le citer dans deckClaimsAnalysis avec
   son statut (REALISTIC / OPTIMISTIC / UNREALISTIC) — sans le valider
   par une contre-projection

# EXEMPLES

## Exemple de BON output (scénario) :
{
  "type": "acquisition_strategic",
  "name": "Acquisition par acteur SaaS RH établi",
  "description": "Consolidation par un éditeur RH européen cherchant à compléter sa suite analytics",
  "probability": {
    "level": "MEDIUM",
    "percentage": 35,
    "rationale": "3 acteurs actifs dans le secteur, 2 acquisitions similaires observées en 2024",
    "basedOn": "DB: Lucca acquiert PayFit analytics 2024, Workday acquiert Peakon 2024"
  },
  "timeline": {
    "estimatedYears": 5,
    "range": "4-6 ans",
    "milestones": ["ARR > 3M€", "Coverage 5+ pays", "Intégrations API établies"],
    "assumptions": ["Marché reste consolidé", "Pas de récession majeure"]
  },
  "potentialBuyers": [
    {"name": "Lucca", "type": "strategic", "rationale": "...", "likelihoodToBuy": "MEDIUM"}
  ]
}

## Exemple de MAUVAIS output (interdit) :
{
  "type": "acquisition_strategic",
  "exitValuation": { "estimated": 45000000, "multipleUsed": 8 },
  "investorReturn": { "multiple": 7.56, "irr": 40.2 }
}
→ Le système invente des valorisations et IRR qu'il ne peut pas connaître.
   Le BA porte ces hypothèses dans son propre modèle, pas l'agent.

`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ExitStrategistData> {
    this._dealStage = context.canonicalDeal.stage;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Extract key parameters
    const deal = context.canonicalDeal;
    const investmentAmount = Number(extractedInfo?.amountRaising) || (deal.amountRequested != null ? Number(deal.amountRequested) : 500000);
    const valuation = Number(extractedInfo?.valuationPre) || (deal.valuationPre != null ? Number(deal.valuationPre) : 3000000);
    const arr = Number(extractedInfo?.arr) || (deal.arr != null ? Number(deal.arr) : 0);
    const sector = extractedInfo?.sector || deal.sector || "Technology";
    const stage = deal.stage || "SEED";

    // Calculate initial ownership with generic BA ticket estimate
    // Note: Personalized calculations are done by Tier 3 agents using actual BA preferences
    const ticketSize = Math.min(investmentAmount * 0.10, 50000); // Generic: 10% of round, max 50K€
    const initialOwnership = (ticketSize / (valuation + investmentAmount)) * 100;

    const sectorProfile = getSectorProfile(deal.sector);
    const sectorBlock = formatSectorProfileForPrompt(sectorProfile);

    const prompt = `# ANALYSE EXIT STRATEGIST - ${deal.name || deal.companyName}

${sectorBlock}

## DOCUMENTS ET CONTEXTE
${dealContext}

## DONNEES CONTEXT ENGINE
${contextEngineData}
${this.formatFactStoreData(context)}
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

1. **Scénarios qualitatifs obligatoires** (3-5 minimum) :
   - Acquisition stratégique (acteur du secteur)
   - Acquisition financière (PE/Growth)
   - IPO ou late-stage exit (si applicable au secteur)
   - Failure (perte totale) - OBLIGATOIRE

2. **Pour chaque scénario** :
   - Probabilité chiffrée avec rationale et source
   - Timeline avec milestones et hypothèses
   - Acheteurs potentiels nominés avec rationale
   - INTERDIT : exitValuation chiffrée, IRR, multiple, dilution prévisionnelle

3. **Comparables** (cœur de la valeur analytique) :
   - Utiliser les exits du Context Engine si disponibles
   - Sinon, rechercher des exits publics du secteur
   - Minimum 3 comparables avec montants observés et multiples observés

4. **Validation deck** :
   - Si le deck mentionne des projections d'exit (valo, multiple, IRR), les citer dans deckClaimsAnalysis
   - Statut : VERIFIED si cohérent avec comparables observés, OPTIMISTIC/UNREALISTIC sinon
   - NE PAS produire de contre-projection chiffrée pour CE deal

5. **Red flags à vérifier** :
   - Aucun acheteur logique = CRITICAL
   - Projections deck irréalistes vs comparables = CRITICAL
   - Time to exit > 8 ans = HIGH

6. **IMPORTANT - Données financières** :
   - Si ARR = 0 ou non fourni : dataCompleteness = "minimal", confidenceLevel MAX 40%
   - L'absence de données rend les comparaisons plus indicatives
   - OBLIGATOIRE d'ajouter en limitation : "Pas de données financières réelles, lecture indicative"

Produis une analyse EXIT STRATEGIST complète au format JSON.
HONNÊTETÉ : si les données sont insuffisantes, le dire — préférer
"Aucun comparable trouvé dans la DB" à inventer.

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
        "potentialBuyers": [{ "name": "string", "type": "strategic|pe|corporate_vc", "rationale": "string", "likelihoodToBuy": "HIGH|MEDIUM|LOW" }]
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
    const result = this.normalizeResponse(data, ticketSize, initialOwnership, arr);

    // F03: DETERMINISTIC SCORING
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const scenarios = data.findings?.scenarios ?? [];

      // Number of viable exit scenarios
      extractedMetrics.push({
        name: "scenario_count", value: Math.min(100, scenarios.length * 25),
        unit: "score", source: "Exit scenario analysis", dataReliability: "DECLARED", category: "financial",
      });

      // Observed multiple ceiling — from REAL comparable exits, not invented projections
      const comparablesForMultiple = data.findings?.comparableExits ?? [];
      const observedMultiples = comparablesForMultiple
        .map(c => c.multipleArr ?? c.multipleRevenue)
        .filter((m): m is number => m != null && m > 0);
      if (observedMultiples.length > 0) {
        const maxObserved = Math.max(...observedMultiples);
        extractedMetrics.push({
          name: "observed_multiple_ceiling", value: Math.min(100, maxObserved * 10),
          unit: "score", source: "Observed multiples in comparable exits", dataReliability: "DECLARED", category: "financial",
        });
      }

      // Liquidity risks
      const liquidityRisks = data.findings?.liquidityAnalysis?.risks ?? [];
      const criticalRisks = liquidityRisks.filter(r => r.severity === "CRITICAL").length;
      extractedMetrics.push({
        name: "liquidity_risk_score", value: Math.max(0, 100 - criticalRisks * 25),
        unit: "score", source: "Liquidity risk analysis", dataReliability: "DECLARED", category: "financial",
      });

      // Comparable exits
      const comparables = data.findings?.comparableExits ?? [];
      extractedMetrics.push({
        name: "comparable_exits_count", value: Math.min(100, comparables.length * 20),
        unit: "score", source: "Comparable exit analysis", dataReliability: "DECLARED", category: "financial",
      });

      if (extractedMetrics.length > 0) {
        const sector = context.canonicalDeal.sector ?? "general";
        const stage = context.canonicalDeal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "exit-strategist", extractedMetrics, sector, stage, EXIT_STRATEGIST_CRITERIA,
        );
        result.score = { ...result.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[exit-strategist] Deterministic scoring failed, using LLM score:", err);
    }

    // Filet de sécurité déterministe : drop les red flags non-applicables
    // au secteur (NRR/ARR/churn/IRR/dette technique SaaS sur consumer/bio/
    // hardware/climate). Cohérent avec les 9 autres agents Tier 1 sector-aware.
    result.redFlags = applySectorRedFlagFilter(result.redFlags, context.canonicalDeal.sector, "exit-strategist");

    return result;
  }

  private normalizeResponse(
    data: LLMExitStrategistResponse,
    ticketSize: number,
    initialOwnership: number,
    arr: number
  ): ExitStrategistData {
    // Check if financial data is available
    const hasFinancialData = arr > 0;
    const financialDataDisclaimer = !hasFinancialData
      ? "ATTENTION: Projections basées sur benchmarks sectoriels (pas de données financières réelles). Fiabilité limitée."
      : null;

    // Adjust confidence if no financial data
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[exit-strategist] LLM did not return confidenceLevel — using 0`);
    }
    const rawConfidence = confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel));
    const adjustedConfidence = hasFinancialData ? rawConfidence : Math.min(rawConfidence, 40);

    // Build limitations with disclaimer if needed
    const baseLimitations = Array.isArray(data.meta?.limitations) ? data.meta.limitations : [];
    const limitations = financialDataDisclaimer
      ? [financialDataDisclaimer, ...baseLimitations]
      : baseLimitations;

    // Normalize meta
    const meta: AgentMeta = {
      agentName: "exit-strategist",
      analysisDate: new Date().toISOString(),
      dataCompleteness: this.normalizeDataCompleteness(data.meta?.dataCompleteness),
      confidenceLevel: adjustedConfidence,
      confidenceIsFallback,
      limitations,
    };

    // Normalize score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[exit-strategist] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : this.normalizeGrade(data.score?.grade),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 20,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
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
          potentialBuyers: s.potentialBuyers?.map((b) => ({
            name: b.name ?? "",
            type: this.normalizeBuyerType(b.type),
            rationale: b.rationale ?? "",
            recentAcquisitions: b.recentAcquisitions,
            likelihoodToBuy: this.normalizeLikelihood(b.likelihoodToBuy),
          })),
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
            score: c.relevance?.score ?? 0,
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

    // Phase A slice A7b-2 — signalIntensity dérivé déterministe (helper A7b-1).
    // Le LLM ne pilote plus `alertSignal.recommendation` ; la valeur est
    // calculée depuis severity red flags + score métier.
    const criticalCount = redFlags.filter((f) => f.severity === "CRITICAL").length;
    const highCount = redFlags.filter((f) => f.severity === "HIGH").length;
    const signalIntensity: Tier1SignalIntensity = deriveTier1SignalIntensity({
      criticalCount,
      highCount,
      score: score.value,
    });

    // Normalize alert signal — `recommendation` dérivé déterministe depuis
    // signalIntensity. Le contrat global `AgentAlertSignal` reste intact
    // (compat infra, 102 consumers cross-agent — debt hors A7b).
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: signalIntensityToRecommendation(signalIntensity),
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
      signalIntensity,
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

}

export const exitStrategist = new ExitStrategistAgent();
