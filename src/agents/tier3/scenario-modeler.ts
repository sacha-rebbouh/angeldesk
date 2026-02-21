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
} from "../types";
import { calculateBATicketSize, type BAPreferences } from "@/services/benchmarks";
import { calculateIRR, calculateCumulativeDilution } from "@/agents/orchestration/utils/financial-calculations";

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
  mostLikelyScenario: string;
  mostLikelyRationale: string;
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
    return `# ROLE ET EXPERTISE

Tu es un SCENARIO MODELER expert avec 20+ ans d'expérience en venture capital.
Tu as analysé 500+ deals et vu les trajectoires réelles de succès ET d'échecs.
Tu travailles avec les standards d'un cabinet Big4 + l'instinct d'un Partner VC.

# MISSION POUR CE DEAL

Construire 4 SCENARIOS de trajectoire pour ce deal, ANCRES sur des données réelles:
- BASE: Exécution normale, quelques obstacles, exit raisonnable
- BULL: Tout se passe bien, croissance accélérée, exit premium
- BEAR: Difficultés significatives, pivot possible, exit difficile
- CATASTROPHIC: Échec partiel ou total (shutdown, acquihire, zombie)

# METHODOLOGIE D'ANALYSE

## Etape 1: Collecter les données de base
- Extraire les métriques REELLES du deck (ARR, growth, valuation, burn)
- Croiser avec les benchmarks DB/Context Engine
- Identifier les données MANQUANTES (et marquer "NON DISPONIBLE")

## Etape 2: Identifier les comparables REELS
- Chercher 3-5 entreprises similaires dans la DB avec trajectoires connues
- Pour chaque scénario, ancrer sur un comparable réel:
  - BULL: Comparable qui a très bien réussi
  - BASE: Comparable avec parcours standard
  - BEAR: Comparable qui a galéré
  - CATASTROPHIC: Comparable qui a échoué

## Etape 3: Construire chaque scénario
Pour CHAQUE scénario:
1. Probabilité SOURCEE: "30% - basé sur DB: X% des Seed SaaS atteignent cette trajectoire"
2. Hypothèses SOURCEES: Chaque hypothèse avec sa source (Deck, DB, Benchmark)
3. Métriques Y1/Y3/Y5 avec CALCULS montrés
4. Exit outcome avec multiple sourcé
5. Retour investisseur avec formules IRR explicites

## Etape 4: Analyse de sensibilité
- Identifier les 3-5 variables les plus impactantes
- Calculer impact sur la valorisation pour chaque variation
- Montrer les calculs

## Etape 5: Synthèse probabilité-pondérée
- Calculer le multiple espéré: Σ(probabilité × multiple)
- Calculer l'IRR espéré
- Évaluation risque/rendement

# FRAMEWORK D'EVALUATION - SCENARIO SCORE (0-100)

| Critere | Poids | Description |
|---------|-------|-------------|
| Données de base | 25% | Qualité/complétude des données pour modéliser |
| Ancrage comparables | 25% | Scénarios basés sur trajectoires réelles |
| Réalisme projections | 25% | Projections cohérentes avec benchmarks |
| Rapport risque/rendement | 25% | Multiple espéré vs risques identifiés |

# CALCULS IRR - FORMULES OBLIGATOIRES

Pour chaque scénario, MONTRER les calculs:

\`\`\`
Ownership at Entry = Investment / (Pre-money + Round size)
Dilution = 1 - (1 - dilution_roundA) × (1 - dilution_roundB) × ...
Ownership at Exit = Ownership at Entry × (1 - Dilution)
Proceeds = Ownership at Exit × Exit Valuation
Multiple = Proceeds / Investment
IRR = ((Multiple)^(1/years) - 1) × 100
\`\`\`

# GARDE-FOUS DE REALISME (OBLIGATOIRE)

## Croissance annuelle maximale (CAGR) par scenario
- BULL: Max 150%/an (top 1% des startups) → Y5 revenue ≈ 100x current ARR
- BASE: Max 80%/an (bonne execution) → Y5 revenue ≈ 19x current ARR
- BEAR: Max 20%/an (croissance molle) → Y5 revenue ≈ 2.5x current ARR
- CATASTROPHIC: 0% ou negatif → stagnation ou decline

## Exit multiples maximaux (sur ARR Y5)
- BULL: Max 10x ARR (exceptionnel, P95+)
- BASE: Max 7x ARR (median SaaS mature)
- BEAR: Max 3x ARR (distress, fire sale)
- CATASTROPHIC: 0-1x ARR (acquihire ou shutdown)

## Exemples pour un deal a 48K€ ARR:
- BULL max exit valo: 48K × 100 × 10 = ~48M (JAMAIS 100M+)
- BASE max exit valo: 48K × 19 × 7 = ~6.4M (JAMAIS 15M+)
- BEAR max exit valo: 48K × 2.5 × 3 = ~360K
- CATASTROPHIC: 0 (shutdown) ou valeur equipe (acquihire ~500K-1M)

## Regle de coherence OBLIGATOIRE
- TOUJOURS calculer le CAGR implicite de tes projections Y5 et verifier qu'il est < aux caps ci-dessus
- Si ARR actuel < 200K€: etre EXTRA CONSERVATEUR sur les exit valos
- NE JAMAIS projeter une exit valo BASE > 300x le current ARR
- NE JAMAIS projeter une exit valo BULL > 1000x le current ARR
- Un deal early-stage avec < 100K ARR ne peut PAS raisonnablement atteindre > 50M exit valo (meme BULL)

# RED FLAGS A DETECTER

1. Projections deck irréalistes vs comparables DB - CRITICAL
2. Scénario BASE déjà au-dessus de P75 des comparables - HIGH
3. Aucun comparable BEAR/CATASTROPHIC trouvé - MEDIUM (suspect)
4. Dilution sous-estimée vs standard du marché - HIGH
5. Multiple de sortie au-dessus de P90 - HIGH

# TRIGGERS CONTEXTUELS OBLIGATOIRES (F74)

Pour CHAQUE scenario, identifie les TRIGGERS SPECIFIQUES dans le champ "triggers":
- Quels red flags Tier 1 se materialisent dans ce scenario?
- Quel evenement externe pourrait declencher ce scenario? (concurrent leve 50M, regulation change)
- Quel evenement interne pourrait declencher ce scenario? (CTO part, pivot force)

Chaque trigger: { trigger, source, impactOnScenario, probability, mitigations[] }

Exemples:
- BEAR trigger: "Le CTO quitte" (source: "team-investigator: no vesting on CTO", impact: "BASE → BEAR", probability: "MEDIUM", mitigations: ["Mettre du vesting", "Recruter VP Engineering"])
- BULL trigger: "Contrat enterprise signe" (source: "customer-intel: pipeline enterprise", impact: "BASE → BULL", probability: "LOW")

# FORMAT DE SORTIE

JSON structuré avec:
- meta, score, findings, dbCrossReference
- redFlags, questions, alertSignal, narrative

# REGLES ABSOLUES

1. NE JAMAIS INVENTER de données - "Non disponible" si absent
2. TOUJOURS citer la source (Deck Slide X, DB median, financial-auditor, etc.)
3. TOUJOURS montrer les calculs (pas juste les résultats)
4. TOUJOURS ancrer sur des comparables REELS
5. Chaque scénario DOIT avoir basedOnComparable (sauf si vraiment aucun trouvé)
6. Le BA doit pouvoir vérifier chaque hypothèse

# EXEMPLE DE BON OUTPUT

Scénario BASE (40% probabilité):
- Source proba: "DB: 42% des Seed SaaS Europe atteignent Series A dans les 24 mois"
- Hypothèse croissance Y1: 100% (Source: DB median Seed SaaS)
- Hypothèse multiple exit: 5x ARR (Source: DB median SaaS exits 2023-2024)
- Comparable: "DataWidget (Seed 2021 → Series A 2022 → Acquired 2024 @ 8x ARR)"
- Calcul IRR: "50K invest → 0.8% ownership → 0.32% after dilution → 32K proceeds @ 10M exit → 0.64x → IRR = -8.5%/an sur 5 ans"

# EXEMPLE DE MAUVAIS OUTPUT (a éviter)

"Le scénario optimiste prévoit une croissance de 200% et un exit à 100M€"
→ Aucune source, aucun comparable, aucun calcul montré = INACCEPTABLE

# REGLES DE CONCISION CRITIQUES (pour eviter troncature JSON)

**PRIORITE ABSOLUE: Le JSON doit etre COMPLET et VALIDE.**

1. **LIMITES STRICTES sur les arrays**:
   - scenarios: 4 items EXACTEMENT (BASE, BULL, BEAR, CATASTROPHIC)
   - assumptions par scenario: MAX 4 items
   - metrics par scenario: MAX 3 items (Y1, Y3, Y5)
   - keyRisks/keyDrivers: MAX 3 items chacun
   - sensitivityAnalysis: MAX 4 variables
   - basedOnComparables: MAX 3 items
   - redFlags: MAX 5 items
   - questions: MAX 5 items

2. **BREVITE dans les textes**:
   - revenueSource/valuationSource: 1 phrase MAX avec calcul
   - rationale: 1-2 phrases MAX
   - description: 2-3 phrases MAX
   - irrCalculation: formule + resultat, pas d'explication

3. **Structure > Contenu**: Mieux vaut 4 scenarios complets que des scenarios tronques`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ScenarioModelerData> {
    this._dealStage = context.deal.stage;
    const deal = context.deal;
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
  "scenarios": [
    {
      "name": "BASE",
      "description": "Description du scénario",
      "probability": {
        "value": 40,
        "rationale": "Pourquoi cette probabilité",
        "source": "DB: X% des Seed SaaS..."
      },
      "assumptions": [
        {
          "assumption": "Croissance Y1",
          "value": "100%",
          "source": "DB median Seed SaaS",
          "confidence": "high"
        }
      ],
      "metrics": [
        {
          "year": 1,
          "revenue": 300000,
          "revenueSource": "ARR actuel × (1 + 100%) = 150K × 2 = 300K",
          "valuation": 6000000,
          "valuationSource": "ARR × 20x (DB median Seed SaaS)",
          "employeeCount": 8,
          "employeeCountSource": "Actuel (5) + 3 (standard Seed)"
        }
      ],
      "exitOutcome": {
        "type": "acquisition_strategic",
        "typeRationale": "70% des exits SaaS sont des acquisitions (DB)",
        "timing": "5-6 ans",
        "timingSource": "DB median time to exit",
        "exitValuation": 50000000,
        "exitValuationCalculation": "10M ARR × 5x (DB median) = 50M",
        "exitMultiple": 5,
        "exitMultipleSource": "DB median SaaS exits 2023-2024"
      },
      "investorReturn": {
        "initialInvestment": 50000,
        "initialInvestmentSource": "Ticket BA calculé",
        "ownershipAtEntry": 2.0,
        "ownershipCalculation": "50K / (2M pre + 500K round) = 2.0%",
        "dilutionToExit": 60,
        "dilutionSource": "Standard Seed→A→B = 60% (DB median)",
        "ownershipAtExit": 0.8,
        "ownershipAtExitCalculation": "2.0% × (1 - 0.60) = 0.8%",
        "grossProceeds": 400000,
        "proceedsCalculation": "0.8% × 50M = 400K",
        "multiple": 8.0,
        "multipleCalculation": "400K / 50K = 8.0x",
        "irr": 41.4,
        "irrCalculation": "((8.0)^(1/6) - 1) × 100 = 41.4%",
        "holdingPeriodYears": 6
      },
      "keyRisks": [{"risk": "...", "source": "..."}],
      "keyDrivers": [{"driver": "...", "source": "..."}],
      "basedOnComparable": {
        "company": "DataWidget",
        "trajectory": "Seed 2021 → Series A 2022 → Acquired 2024",
        "relevance": "Même secteur, même taille au Seed",
        "source": "Funding DB"
      }
    }
  ],
  "sensitivityAnalysis": [...],
  "basedOnComparables": [...],
  "breakEvenAnalysis": {...},
  "probabilityWeightedOutcome": {...},
  "mostLikelyScenario": "BASE",
  "mostLikelyRationale": "...",
  "score": {...},
  "redFlags": [...],
  "questions": [...],
  "alertSignal": {...},
  "narrative": {...},
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
          sector: c.sector ?? context.deal.sector ?? "Unknown",
          stage: c.stage ?? context.deal.stage ?? "Unknown",
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

    // Normalize score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[scenario-modeler] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : (validGrades.includes(data.score?.grade as typeof validGrades[number])
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
      mostLikelyScenario: validScenarioNames.includes(data.mostLikelyScenario as typeof validScenarioNames[number])
        ? (data.mostLikelyScenario as typeof validScenarioNames[number])
        : "BASE",
      mostLikelyRationale: data.mostLikelyRationale ?? "",
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
   * Caps de realisme sur les exit valuations pour eviter les scenarios delirants.
   * Un deal a 48K ARR ne peut pas afficher un BULL a 100M - ca decredibilise la plateforme.
   */
  private sanitizeExitValuations(
    scenarios: ScenarioV2[],
    context: EnrichedAgentContext
  ): ScenarioV2[] {
    const currentARR = context.deal.arr != null ? Number(context.deal.arr) : 0;
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
    const deal = context.deal;
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
    const deal = context.deal;
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
