/**
 * SYNTHESIS DEAL SCORER - TIER 3 - REFONTE v2.0
 *
 * Mission: Produire le SCORE FINAL et la RECOMMANDATION d'investissement
 *          en synthétisant TOUS les outputs Tier 1 (12 agents) et Tier 2 (expert sectoriel)
 *
 * Persona: Senior Investment Committee Partner (20+ ans d'expérience)
 *          - A siégé à 200+ IC meetings
 *          - A vu 3000+ deals, investi dans 150+
 *          - Sait distinguer signal vs noise dans une DD
 *          - Applique les standards Big4 + instinct Partner VC
 *
 * Standards:
 * - Chaque score doit être justifié avec les sources (agents Tier 1/2)
 * - Les calculs de pondération doivent être montrés
 * - Cross-reference obligatoire avec la Funding DB
 * - Red flags consolidés avec les 5 composants requis
 * - Output actionnable: GO/NO-GO clair avec conditions
 *
 * Inputs:
 * - Tous les résultats Tier 1 (12 agents)
 * - Résultat Tier 2 (expert sectoriel si disponible)
 * - Context Engine data
 * - Funding DB comparables
 * - BA Preferences
 *
 * Outputs:
 * - Score final pondéré (0-100) avec breakdown
 * - Verdict: STRONG_PASS / PASS / CONDITIONAL_PASS / WEAK_PASS / NO_GO
 * - Investment thesis (bull/bear)
 * - Consolidated red flags
 * - Top questions for founder
 * - Negotiation points
 */

import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  AgentResult,
} from "../types";
import type { BAPreferences } from "@/services/benchmarks";

// =============================================================================
// OUTPUT TYPES - Synthesis Deal Scorer v2.0
// =============================================================================

/** Dimension score avec détail de calcul */
interface DimensionScore {
  dimension: string;
  weight: number; // Pondération (ex: 0.25 pour 25%)
  rawScore: number; // Score brut de l'agent source (0-100)
  adjustedScore: number; // Score après ajustements
  weightedScore: number; // rawScore * weight
  sourceAgents: string[]; // Agents qui ont contribué
  keyFactors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    contribution: number; // Points ajoutés/retirés
    source: string; // Agent source
  }[];
  calculation: string; // Calcul montré
}

/** Breakdown du score avec transparence totale */
interface ScoreBreakdown {
  baseScore: number; // Moyenne pondérée brute
  adjustments: {
    type: string;
    reason: string;
    impact: number;
    source: string;
  }[];
  finalScore: number;
  calculationShown: string; // Formule complète
}

/** Position vs marché (cross-ref DB) */
interface MarketPosition {
  percentileOverall: number; // Position vs tous les deals DB
  percentileSector: number; // Position vs deals du même secteur
  percentileStage: number; // Position vs deals du même stage
  valuationAssessment: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE";
  valuationRationale: string;
  comparableDeals: {
    name: string;
    score: number;
    valuation: number;
    outcome?: string;
    relevance: string;
  }[];
  similarDealsAnalyzed: number;
}

/** Investment thesis structurée */
interface InvestmentThesis {
  bull: {
    thesis: string;
    evidence: string;
    sourceAgent: string;
  }[];
  bear: {
    thesis: string;
    evidence: string;
    sourceAgent: string;
  }[];
  keyAssumptions: {
    assumption: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    validationNeeded: string;
  }[];
  convictionLevel: "HIGH" | "MEDIUM" | "LOW";
  convictionRationale: string;
}

/** Recommandation d'investissement */
interface InvestmentRecommendation {
  action: "STRONG_INVEST" | "INVEST" | "CONSIDER" | "PASS" | "STRONG_PASS";
  verdict: "strong_pass" | "pass" | "conditional_pass" | "weak_pass" | "no_go";
  rationale: string;
  conditions?: string[]; // Si conditional_pass
  dealbreakers?: string[]; // Si no_go
  suggestedTerms?: string; // Si negotiate
  nextSteps: {
    step: string;
    priority: "IMMEDIATE" | "BEFORE_TERM_SHEET" | "DURING_DD";
    owner: "INVESTOR" | "FOUNDER";
  }[];
}

/** Findings spécifiques Synthesis Deal Scorer */
interface SynthesisDealScorerFindings {
  // Scores par dimension (minimum 6)
  dimensionScores: DimensionScore[];

  // Breakdown transparent du score final
  scoreBreakdown: ScoreBreakdown;

  // Position vs marché (cross-ref DB obligatoire)
  marketPosition: MarketPosition;

  // Investment thesis (bull vs bear)
  investmentThesis: InvestmentThesis;

  // Recommandation finale
  recommendation: InvestmentRecommendation;

  // Synthèse des agents Tier 1
  tier1Synthesis: {
    agentsAnalyzed: number;
    agentsSuccessful: number;
    averageScore: number;
    lowestScoringAgent: { name: string; score: number; concern: string };
    highestScoringAgent: { name: string; score: number; strength: string };
    criticalRedFlagsTotal: number;
    highRedFlagsTotal: number;
    dataCompleteness: number; // 0-100
  };

  // Synthèse Tier 2 (si disponible)
  tier2Synthesis?: {
    sectorExpert: string;
    sectorScore: number;
    sectorFit: string;
    keyInsights: string[];
  };

  // Alignment avec préférences BA
  baAlignment: {
    sectorMatch: boolean;
    stageMatch: boolean;
    ticketFit: boolean;
    riskToleranceMatch: boolean;
    overallFit: "EXCELLENT" | "GOOD" | "MODERATE" | "POOR";
    concerns: string[];
  };

  // Top strengths & weaknesses consolidés
  topStrengths: {
    strength: string;
    evidence: string;
    sourceAgent: string;
  }[];
  topWeaknesses: {
    weakness: string;
    evidence: string;
    sourceAgent: string;
    mitigationPossible: boolean;
  }[];
}

/** Structure complète de sortie v2.0 */
export interface SynthesisDealScorerDataV2 {
  meta: AgentMeta;
  score: AgentScore;
  findings: SynthesisDealScorerFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

// Pour compatibilité avec l'ancien type exporté
export interface SynthesisDealScorerData {
  overallScore: number;
  verdict: "strong_pass" | "pass" | "conditional_pass" | "weak_pass" | "no_go";
  confidence: number;
  dimensionScores: {
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }[];
  scoreBreakdown: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
  };
  investmentRecommendation: {
    action: "invest" | "pass" | "wait" | "negotiate";
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths: string[];
  keyWeaknesses: string[];
  criticalRisks: string[];
}

export interface SynthesisDealScorerResult extends AgentResult {
  agentName: "synthesis-deal-scorer";
  data: SynthesisDealScorerData;
}

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

export class SynthesisDealScorerAgent extends BaseAgent<SynthesisDealScorerData, SynthesisDealScorerResult> {
  constructor() {
    super({
      name: "synthesis-deal-scorer",
      description: "Synthèse finale: score pondéré + recommandation d'investissement basée sur tous les agents",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: [
        // Tier 1 - Analysis agents
        "deck-forensics",
        "financial-auditor",
        "team-investigator",
        "market-intelligence",
        "competitive-intel",
        "exit-strategist",
        "tech-stack-dd",
        "tech-ops-dd",
        "legal-regulatory",
        "gtm-analyst",
        "customer-intel",
        "cap-table-auditor",
        "question-master",
        // Tier 2 - Sector expert (dynamique)
        // Tier 3 - Other synthesis agents
        "contradiction-detector",
      ],
    });
  }

  // ===========================================================================
  // SYSTEM PROMPT - Big4 + Partner VC Standards
  // ===========================================================================

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un **SENIOR INVESTMENT COMMITTEE PARTNER** avec 20+ ans d'expérience en venture capital.

## TON PROFIL
- Tu as siégé à 200+ Investment Committee meetings
- Tu as analysé 3000+ deals et investi dans 150+
- Tu sais distinguer le signal du noise dans une due diligence
- Tu appliques les standards d'un cabinet Big4 avec l'instinct d'un Partner VC

## TA MISSION POUR CE DEAL

**PRODUIRE LA DÉCISION FINALE D'INVESTISSEMENT** en:
1. Synthétisant les outputs de 12 agents Tier 1 + expert sectoriel Tier 2
2. Calculant un score final pondéré transparent
3. Identifiant les deal-breakers vs nice-to-have concerns
4. Donnant une recommandation GO/NO-GO claire et actionnée

---

# MÉTHODOLOGIE D'ANALYSE

## Étape 1: AGRÉGATION DES SCORES TIER 1
Pour chaque agent Tier 1, extraire:
- Score principal (0-100)
- Red flags critiques et high
- Forces majeures identifiées
- Questions non résolues

## Étape 2: PONDÉRATION DES DIMENSIONS
Appliquer les poids suivants (total = 100%):

| Dimension | Poids | Agents sources |
|-----------|-------|----------------|
| Team | 25% | team-investigator |
| Market | 15% | market-intelligence |
| Product/Tech | 15% | tech-stack-dd, tech-ops-dd, deck-forensics |
| Financials | 20% | financial-auditor, cap-table-auditor |
| GTM/Traction | 15% | gtm-analyst, customer-intel |
| Competitive | 5% | competitive-intel |
| Exit Potential | 5% | exit-strategist |

## Étape 3: AJUSTEMENTS DU SCORE
Ajuster le score base selon:
- Red flags CRITICAL: -10 à -20 points par flag
- Red flags HIGH: -5 à -10 points par flag
- Incohérences détectées (contradiction-detector): -5 à -15 points
- Données manquantes (dataCompleteness < 70%): -10 points
- Sector expert négatif: -5 à -10 points
- BA preferences mismatch: -5 points

Bonifications possibles:
- Top decile sur dimension clé: +5 points
- Serial founder avec exit: +5 points
- Investor signal fort (lead connu): +3 points

## Étape 4: CROSS-REFERENCE FUNDING DB
Obligatoire:
- Positionner la valorisation vs deals comparables (P25/Median/P75)
- Identifier le percentile du deal sur chaque dimension
- Vérifier si les claims de "pas de concurrent" sont valides

## Étape 5: CONSTRUCTION INVESTMENT THESIS
- BULL CASE: 3-5 raisons d'investir (avec sources)
- BEAR CASE: 3-5 raisons de passer (avec sources)
- KEY ASSUMPTIONS: Ce qui doit être vrai pour que l'investissement réussisse

## Étape 6: VERDICT FINAL
Appliquer la grille:

| Score | Verdict | Action |
|-------|---------|--------|
| 85-100 | STRONG_PASS | Investir avec conviction, accélérer closing |
| 70-84 | PASS | Investir avec conditions standard |
| 55-69 | CONDITIONAL_PASS | Investir SI conditions spécifiques remplies |
| 40-54 | WEAK_PASS | Passer sauf conviction forte sur 1 dimension |
| 0-39 | NO_GO | Ne pas investir, deal-breakers présents |

## Étape 7: FORMULATION DES NEXT STEPS
Pour chaque verdict sauf NO_GO:
- Actions immédiates (avant prochaine discussion)
- Actions pre-term sheet
- Actions DD approfondie

---

# FRAMEWORK D'ÉVALUATION

## Critères de scoring par dimension

### TEAM (25%)
| Score | Critères |
|-------|----------|
| 80-100 | Serial founder avec exit, équipe complète, domain expertise 10+ ans |
| 60-79 | Expérience pertinente, équipe core en place, backgrounds vérifiés |
| 40-59 | First-time founders mais profils solides, gaps identifiés |
| 20-39 | Gaps critiques (no CTO, no domain expertise), vesting absent |
| 0-19 | Red flags majeurs (fraude CV, conflits fondateurs, solo sans équipe) |

### FINANCIALS (20%)
| Score | Critères |
|-------|----------|
| 80-100 | Unit economics top quartile, runway 18+ mois, projections réalistes |
| 60-79 | Unit economics au median, runway 12+ mois, model cohérent |
| 40-59 | Unit economics mixtes, burn élevé mais contrôlé |
| 20-39 | Unit economics négatifs, runway < 6 mois, projections irréalistes |
| 0-19 | Pas de data financière ou fraude détectée |

### MARKET (15%)
| Score | Critères |
|-------|----------|
| 80-100 | TAM >1B€ vérifié, CAGR >20%, timing parfait, peu de concurrence |
| 60-79 | TAM significatif, croissance saine, timing correct |
| 40-59 | Marché existant mais mature, croissance modérée |
| 20-39 | Marché en déclin ou surévalué, timing mauvais |
| 0-19 | TAM inventé, marché saturé, réglementation bloquante |

### GTM/TRACTION (15%)
| Score | Critères |
|-------|----------|
| 80-100 | PMF prouvé, NRR >120%, CAC payback <12 mois, croissance 3x |
| 60-79 | Traction early mais prometteuse, metrics en amélioration |
| 40-59 | Quelques clients mais PMF non prouvé |
| 20-39 | Pas de traction, concentration client critique |
| 0-19 | Churn explosif, clients fictifs détectés |

### PRODUCT/TECH (15%)
| Score | Critères |
|-------|----------|
| 80-100 | Produit live scalable, moat technique, IP protégée |
| 60-79 | Produit fonctionnel, stack moderne, roadmap claire |
| 40-59 | MVP, dette technique gérable, pas de moat |
| 20-39 | Prototype uniquement, gaps techniques majeurs |
| 0-19 | Vaporware, code non propriétaire, dépendances critiques |

### COMPETITIVE (5%)
| Score | Critères |
|-------|----------|
| 80-100 | Moat défendable, first mover réel, concurrents distancés |
| 60-79 | Différenciation claire, position tenable |
| 40-59 | Concurrence présente mais gérable |
| 20-39 | Concurrents mieux financés, différenciation floue |
| 0-19 | Big Tech ou leader établi sur le marché |

### EXIT (5%)
| Score | Critères |
|-------|----------|
| 80-100 | Acquéreurs identifiés actifs, multiples >10x, track sector |
| 60-79 | Exit path plausible, M&A actif dans le secteur |
| 40-59 | Exit possible mais timeline longue |
| 20-39 | Exit incertain, multiples faibles |
| 0-19 | Pas de path to exit identifié |

---

# RED FLAGS À DÉTECTER (Consolidation)

## DEAL-BREAKERS (Score = NO_GO automatique)
- Fraude détectée (CV falsifié, metrics inventées)
- Cap table cassée (fondateurs <30% pré-round)
- Litige en cours majeur
- Conflits fondateurs non résolus
- Concurrent mieux financé avec même produit

## CRITICAL FLAGS (-10 à -20 points)
- Incohérences majeures entre deck et data
- Runway < 6 mois sans plan B
- Concentration client >50% sur 1 client
- Churn >5% mensuel
- Valorisation P95+ du secteur

## HIGH FLAGS (-5 à -10 points)
- Données financières incomplètes
- Team gaps non reconnus
- Concurrents omis dans le deck
- Projections > 200% benchmark

---

# FORMAT DE SORTIE

Tu dois produire un JSON avec cette structure EXACTE:

\`\`\`json
{
  "meta": {
    "agentName": "synthesis-deal-scorer",
    "analysisDate": "ISO date",
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["limitation 1", "limitation 2"]
  },
  "score": {
    "value": 0-100,
    "grade": "A|B|C|D|F",
    "breakdown": [
      {
        "criterion": "Dimension name",
        "weight": 0.25,
        "score": 72,
        "justification": "Explication avec source agent"
      }
    ]
  },
  "findings": {
    "dimensionScores": [...],
    "scoreBreakdown": {...},
    "marketPosition": {...},
    "investmentThesis": {...},
    "recommendation": {...},
    "tier1Synthesis": {...},
    "baAlignment": {...},
    "topStrengths": [...],
    "topWeaknesses": [...]
  },
  "dbCrossReference": {
    "claims": [...],
    "uncheckedClaims": [...]
  },
  "redFlags": [...],
  "questions": [...],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "si applicable",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Explication"
  },
  "narrative": {
    "oneLiner": "Résumé en 1 phrase",
    "summary": "3-4 phrases",
    "keyInsights": ["insight 1", "insight 2", "insight 3"],
    "forNegotiation": ["point 1", "point 2"]
  }
}
\`\`\`

---

# RÈGLES ABSOLUES

1. **JAMAIS de score sans justification sourcée**
   - ❌ "Team score: 72"
   - ✅ "Team score: 72 (team-investigator: 75, -3 pts pour gap CTO identifié)"

2. **TOUJOURS montrer les calculs**
   - ❌ "Score final: 68"
   - ✅ "Score final: 68 = (25×75 + 20×70 + 15×65 + 15×60 + 15×72 + 5×55 + 5×68)/100 = 68.6 arrondi"

3. **TOUJOURS cross-référencer la DB**
   - Valorisation vs percentile marché
   - Concurrents mentionnés vs DB

4. **CHAQUE red flag consolidé doit avoir les 5 composants**
   - Sévérité, Preuve, Location, Impact, Question

5. **Le BA doit pouvoir AGIR immédiatement**
   - GO/NO-GO clair
   - Next steps concrets
   - Questions prioritaires listées

---

# EXEMPLE DE BON OUTPUT (Extrait)

\`\`\`json
{
  "score": {
    "value": 64,
    "grade": "C",
    "breakdown": [
      {
        "criterion": "Team",
        "weight": 0.25,
        "score": 72,
        "justification": "team-investigator: 72/100. CEO vérifié (8 ans Salesforce VP). CTO background non vérifiable (-5). Complementarité OK."
      },
      {
        "criterion": "Financials",
        "weight": 0.20,
        "score": 58,
        "justification": "financial-auditor: 58/100. ARR 150K€ (P35 sector). Burn multiple 3.2x (concernant, benchmark <2x). Runway 9 mois."
      }
    ]
  },
  "findings": {
    "scoreBreakdown": {
      "baseScore": 68,
      "adjustments": [
        {"type": "red_flag_critical", "reason": "Valorisation P92 vs sector", "impact": -8, "source": "financial-auditor"},
        {"type": "data_incomplete", "reason": "cap-table-auditor failed", "impact": -3, "source": "meta"}
      ],
      "finalScore": 57,
      "calculationShown": "68 - 8 - 3 = 57"
    },
    "recommendation": {
      "action": "CONSIDER",
      "verdict": "conditional_pass",
      "rationale": "Deal intéressant (équipe + marché) mais valorisation trop agressive dans un marché froid. Investir SI valorisation réduite de 30%.",
      "conditions": [
        "Réduction valorisation à 5.5M€ max (vs 8M€ demandés)",
        "Vérification background CTO avant closing",
        "Extension runway minimum 12 mois post-round"
      ]
    }
  }
}
\`\`\`

---

# EXEMPLE DE MAUVAIS OUTPUT (À ÉVITER)

\`\`\`json
{
  "score": {
    "value": 65,
    "grade": "B",
    "breakdown": [
      {
        "criterion": "Overall",
        "weight": 1,
        "score": 65,
        "justification": "Le deal semble intéressant avec quelques points à clarifier"
      }
    ]
  }
}
\`\`\`

**POURQUOI C'EST MAUVAIS:**
- Pas de breakdown par dimension
- "semble" = pas de source
- "quelques points" = vague
- Pas de calcul montré
- Pas actionnable`;
  }

  // ===========================================================================
  // EXECUTE - Main analysis logic
  // ===========================================================================

  protected async execute(context: EnrichedAgentContext): Promise<SynthesisDealScorerData> {
    const deal = context.deal;

    // Build comprehensive prompt with all context
    const dealContext = this.formatDealContext(context);
    const tier1Scores = this.extractTier1Scores(context);
    const tier1RedFlags = this.extractTier1RedFlags(context);
    const tier1Synthesis = this.buildTier1Synthesis(context);
    const tier2Data = this.extractTier2Data(context);
    const fundingDbContext = this.formatFundingDbContext(context);
    const baPrefsSection = this.formatBAPreferences(context.baPreferences, deal.sector, deal.stage);
    const contradictions = this.extractContradictions(context);

    const prompt = `# ANALYSE SYNTHESIS DEAL SCORER - ${deal.companyName ?? deal.name}

## INFORMATIONS DEAL
${dealContext}

---

## SCORES DES AGENTS TIER 1 (12 agents)
${tier1Scores}

---

## RED FLAGS AGRÉGÉS (Tier 1)
${tier1RedFlags}

---

## SYNTHÈSE TIER 1
${tier1Synthesis}

---

## DONNÉES EXPERT SECTORIEL (Tier 2)
${tier2Data}

---

## INCOHÉRENCES DÉTECTÉES (contradiction-detector)
${contradictions}

---

## DONNÉES FUNDING DB (Comparables)
${fundingDbContext}

---

## PROFIL BUSINESS ANGEL
${baPrefsSection}
${this.formatFactStoreData(context)}
---

## TA MISSION

1. **CALCULE LE SCORE PONDÉRÉ** avec la formule:
   Score = Σ(dimension_weight × dimension_score) + adjustments

   Pondérations: Team(25%) + Financials(20%) + Market(15%) + GTM(15%) + Product(15%) + Competitive(5%) + Exit(5%)

2. **AJUSTE SELON LES RED FLAGS**:
   - CRITICAL: -10 à -20 pts
   - HIGH: -5 à -10 pts
   - Incohérences: -5 à -15 pts
   - Data incomplete: -10 pts

3. **CROSS-RÉFÉRENCE LA DB**:
   - Percentile valorisation vs sector deals
   - Position vs median sur chaque dimension
   - Vérification claims concurrentiels

4. **CONSTRUIS L'INVESTMENT THESIS**:
   - 3-5 bull points avec sources
   - 3-5 bear points avec sources
   - Key assumptions à valider

5. **DONNE LE VERDICT**:
   - 85-100: STRONG_PASS
   - 70-84: PASS
   - 55-69: CONDITIONAL_PASS
   - 40-54: WEAK_PASS
   - 0-39: NO_GO

6. **LISTE LES NEXT STEPS** concrets

---

## RAPPELS CRITIQUES

⚠️ **MONTRE TOUS LES CALCULS** - Le BA doit comprendre comment tu arrives au score
⚠️ **SOURCE CHAQUE AFFIRMATION** - Cite l'agent qui a fourni la donnée
⚠️ **SOIS ACTIONNABLE** - GO/NO-GO clair, pas de "ça dépend" sans conditions
⚠️ **CONSOLIDE LES RED FLAGS** - Ne répète pas, synthétise avec priorité
⚠️ **ADAPTE AU PROFIL BA** - Tiens compte de ses préférences

Produis le JSON complet selon le format spécifié dans le system prompt.`;

    const { data } = await this.llmCompleteJSON<LLMSynthesisResponse>(prompt);

    // Transform and validate the response
    return this.transformResponse(data, context);
  }

  // ===========================================================================
  // HELPER METHODS - Data extraction from previous agents
  // ===========================================================================

  private extractTier1Scores(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const scores: string[] = [];

    // Mapping agent name to their score field
    const scoreMapping: Record<string, { field: string; dimension: string }> = {
      "financial-auditor": { field: "score.value", dimension: "Financials" },
      "team-investigator": { field: "score.value", dimension: "Team" },
      "competitive-intel": { field: "score.value", dimension: "Competitive" },
      "market-intelligence": { field: "score.value", dimension: "Market" },
      "tech-stack-dd": { field: "score.value", dimension: "Tech Stack" },
      "tech-ops-dd": { field: "score.value", dimension: "Tech Ops" },
      "legal-regulatory": { field: "score.value", dimension: "Legal" },
      "cap-table-auditor": { field: "capTableScore", dimension: "Cap Table" },
      "gtm-analyst": { field: "score.value", dimension: "GTM" },
      "customer-intel": { field: "score.value", dimension: "Traction" },
      "exit-strategist": { field: "score.value", dimension: "Exit" },
      "deck-forensics": { field: "score.value", dimension: "Deck Quality" },
      "question-master": { field: "score.value", dimension: "DD Readiness" },
    };

    for (const [agentName, config] of Object.entries(scoreMapping)) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;

        // Try to extract score from nested structure (score.value) or direct field
        let scoreValue: number | undefined;

        if (config.field.includes(".")) {
          const [obj, key] = config.field.split(".");
          const nestedObj = data[obj] as Record<string, unknown> | undefined;
          if (nestedObj && typeof nestedObj[key] === "number") {
            scoreValue = nestedObj[key] as number;
          }
        } else if (typeof data[config.field] === "number") {
          scoreValue = data[config.field] as number;
        }

        // Fallback to common score field names
        if (scoreValue === undefined) {
          const fallbackFields = ["overallScore", "score", "finalScore", "capTableScore", "gtmScore"];
          for (const field of fallbackFields) {
            if (typeof data[field] === "number") {
              scoreValue = data[field] as number;
              break;
            }
          }
        }

        if (scoreValue !== undefined) {
          // Extract key factors if available
          const keyFactors = this.extractKeyFactors(data, agentName);
          scores.push(`### ${agentName} → ${config.dimension}
- **Score**: ${scoreValue}/100
- **Facteurs clés**: ${keyFactors || "Non disponible"}`);
        } else {
          scores.push(`### ${agentName} → ${config.dimension}
- **Score**: NON DISPONIBLE (agent n'a pas retourné de score)
- **Status**: ${result.success ? "Exécuté mais sans score" : "Échec"}`);
        }
      } else {
        scores.push(`### ${agentName} → ${config.dimension}
- **Score**: NON EXÉCUTÉ
- **Impact**: Dimension non évaluée, confiance réduite`);
      }
    }

    return scores.length > 0 ? scores.join("\n\n") : "Aucun score Tier 1 disponible - analyse impossible.";
  }

  private extractKeyFactors(data: Record<string, unknown>, agentName: string): string {
    const factors: string[] = [];

    // Extract based on agent type
    switch (agentName) {
      case "financial-auditor":
        if (data.findings && typeof data.findings === "object") {
          const findings = data.findings as Record<string, unknown>;
          if (findings.valuation && typeof findings.valuation === "object") {
            const val = findings.valuation as Record<string, unknown>;
            if (val.verdict) factors.push(`Valorisation: ${val.verdict}`);
          }
          if (findings.burn && typeof findings.burn === "object") {
            const burn = findings.burn as Record<string, unknown>;
            if (burn.efficiency) factors.push(`Burn: ${burn.efficiency}`);
          }
        }
        break;
      case "team-investigator":
        if (data.findings && typeof data.findings === "object") {
          const findings = data.findings as Record<string, unknown>;
          if (findings.teamComposition && typeof findings.teamComposition === "object") {
            const team = findings.teamComposition as Record<string, unknown>;
            if (team.complementarityScore) factors.push(`Complémentarité: ${team.complementarityScore}/100`);
          }
        }
        break;
      default:
        // Generic extraction
        if (Array.isArray(data.keyStrengths) && data.keyStrengths.length > 0) {
          factors.push(`Forces: ${(data.keyStrengths as string[]).slice(0, 2).join(", ")}`);
        }
        if (Array.isArray(data.keyWeaknesses) && data.keyWeaknesses.length > 0) {
          factors.push(`Faiblesses: ${(data.keyWeaknesses as string[]).slice(0, 2).join(", ")}`);
        }
    }

    return factors.length > 0 ? factors.join(" | ") : "";
  }

  private extractTier1RedFlags(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const allRedFlags: { agent: string; severity: string; flag: string }[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (result.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;

        // Check various red flag field names
        const redFlagFields = ["redFlags", "financialRedFlags", "criticalIssues", "structuralRedFlags", "sectorRedFlags"];

        for (const field of redFlagFields) {
          if (Array.isArray(data[field])) {
            for (const rf of data[field] as Array<Record<string, unknown>>) {
              const severity = rf.severity ?? rf.level ?? "MEDIUM";
              const flag = rf.title ?? rf.flag ?? rf.description ?? JSON.stringify(rf);
              allRedFlags.push({
                agent: agentName,
                severity: String(severity).toUpperCase(),
                flag: String(flag),
              });
            }
          }
        }
      }
    }

    if (allRedFlags.length === 0) {
      return "Aucun red flag détecté par les agents Tier 1.";
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    allRedFlags.sort((a, b) => {
      const orderA = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
      const orderB = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
      return orderA - orderB;
    });

    // Group by severity
    const critical = allRedFlags.filter(rf => rf.severity === "CRITICAL");
    const high = allRedFlags.filter(rf => rf.severity === "HIGH");
    const medium = allRedFlags.filter(rf => rf.severity === "MEDIUM");

    let output = `**Total: ${allRedFlags.length} red flags** (${critical.length} CRITICAL, ${high.length} HIGH, ${medium.length} MEDIUM)\n\n`;

    if (critical.length > 0) {
      output += "### 🚨 CRITICAL\n";
      critical.forEach(rf => {
        output += `- [${rf.agent}] ${rf.flag}\n`;
      });
      output += "\n";
    }

    if (high.length > 0) {
      output += "### ⚠️ HIGH\n";
      high.forEach(rf => {
        output += `- [${rf.agent}] ${rf.flag}\n`;
      });
      output += "\n";
    }

    if (medium.length > 0) {
      output += "### ℹ️ MEDIUM\n";
      medium.slice(0, 5).forEach(rf => {
        output += `- [${rf.agent}] ${rf.flag}\n`;
      });
      if (medium.length > 5) {
        output += `... et ${medium.length - 5} autres\n`;
      }
    }

    return output;
  }

  private buildTier1Synthesis(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    let totalAgents = 0;
    let successfulAgents = 0;
    let totalScore = 0;
    let scoreCount = 0;
    let lowestScore = { agent: "", score: 100 };
    let highestScore = { agent: "", score: 0 };

    const tier1Agents = [
      "deck-forensics", "financial-auditor", "team-investigator", "market-intelligence",
      "competitive-intel", "exit-strategist", "tech-stack-dd", "tech-ops-dd", "legal-regulatory",
      "gtm-analyst", "customer-intel", "cap-table-auditor", "question-master"
    ];

    for (const agentName of tier1Agents) {
      totalAgents++;
      const result = results[agentName];

      if (result?.success) {
        successfulAgents++;

        if ("data" in result && result.data) {
          const data = result.data as Record<string, unknown>;
          let score: number | undefined;

          // Try to extract score
          if (typeof data.score === "object" && data.score !== null) {
            const scoreObj = data.score as Record<string, unknown>;
            if (typeof scoreObj.value === "number") score = scoreObj.value;
          } else if (typeof data.overallScore === "number") {
            score = data.overallScore;
          } else if (typeof data.capTableScore === "number") {
            score = data.capTableScore;
          }

          if (score !== undefined) {
            totalScore += score;
            scoreCount++;

            if (score < lowestScore.score) {
              lowestScore = { agent: agentName, score };
            }
            if (score > highestScore.score) {
              highestScore = { agent: agentName, score };
            }
          }
        }
      }
    }

    const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
    const completeness = Math.round((successfulAgents / totalAgents) * 100);

    return `**Agents analysés**: ${successfulAgents}/${totalAgents} (${completeness}% completeness)
**Score moyen**: ${avgScore}/100
**Plus haut score**: ${highestScore.agent} (${highestScore.score}/100)
**Plus bas score**: ${lowestScore.agent} (${lowestScore.score}/100)

${completeness < 70 ? "⚠️ **ATTENTION**: Données incomplètes, confiance réduite" : "✅ Données suffisantes pour une analyse fiable"}`;
  }

  private extractTier2Data(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};

    // Look for sector expert results
    const sectorExperts = [
      "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
      "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
      "hardware-expert", "gaming-expert", "general-expert"
    ];

    for (const expert of sectorExperts) {
      const result = results[expert];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;

        // Extract key info
        const sectorScore = (data.executiveSummary as Record<string, unknown>)?.sectorScore ??
                          (data.sectorFit as Record<string, unknown>)?.score ?? "N/A";
        const verdict = (data.executiveSummary as Record<string, unknown>)?.verdict ?? "N/A";
        const topStrengths = (data.executiveSummary as Record<string, unknown>)?.topStrengths ?? [];
        const topConcerns = (data.executiveSummary as Record<string, unknown>)?.topConcerns ?? [];

        return `**Expert**: ${expert}
**Score sectoriel**: ${sectorScore}/100
**Verdict**: ${verdict}

**Top Strengths**:
${Array.isArray(topStrengths) ? topStrengths.map((s: string) => `- ${s}`).join("\n") : "N/A"}

**Top Concerns**:
${Array.isArray(topConcerns) ? topConcerns.map((c: string) => `- ${c}`).join("\n") : "N/A"}`;
      }
    }

    return "Aucun expert sectoriel Tier 2 n'a été exécuté.";
  }

  private extractContradictions(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const contradictionResult = results["contradiction-detector"];

    if (!contradictionResult?.success || !("data" in contradictionResult) || !contradictionResult.data) {
      return "Contradiction detector non exécuté.";
    }

    const data = contradictionResult.data as Record<string, unknown>;
    const contradictions = data.contradictions as Array<Record<string, unknown>> | undefined;
    const consistencyScore = data.consistencyScore as number | undefined;

    if (!contradictions || contradictions.length === 0) {
      return `**Score de cohérence**: ${consistencyScore ?? "N/A"}/100
Aucune incohérence majeure détectée entre les agents.`;
    }

    let output = `**Score de cohérence**: ${consistencyScore ?? "N/A"}/100
**${contradictions.length} incohérences détectées**:\n\n`;

    for (const c of contradictions.slice(0, 5)) {
      output += `- **${c.severity}**: ${c.topic}
  - Claim 1 (${(c.claim1 as Record<string, unknown>)?.agent}): ${(c.claim1 as Record<string, unknown>)?.statement}
  - Claim 2 (${(c.claim2 as Record<string, unknown>)?.agent}): ${(c.claim2 as Record<string, unknown>)?.statement}
  - Impact: ${c.impact}\n\n`;
    }

    return output;
  }

  private formatFundingDbContext(context: EnrichedAgentContext): string {
    const fundingDb = context.fundingDbContext ?? context.fundingContext;

    if (!fundingDb) {
      return "Aucune donnée Funding DB disponible pour cross-reference.";
    }

    let output = "";

    // Competitors from funding context
    if (fundingDb.competitors && Array.isArray(fundingDb.competitors) && fundingDb.competitors.length > 0) {
      output += `### Concurrents identifiés (${fundingDb.competitors.length})\n`;
      for (const comp of fundingDb.competitors.slice(0, 5)) {
        output += `- ${comp.name}: ${comp.totalFunding ? `€${Number(comp.totalFunding).toLocaleString()} levés` : "Funding inconnu"} (${comp.lastRound ?? "stage inconnu"})\n`;
      }
      output += "\n";
    }

    // Sector benchmarks
    if (fundingDb.sectorBenchmarks && typeof fundingDb.sectorBenchmarks === "object") {
      const benchmarks = fundingDb.sectorBenchmarks as Record<string, unknown>;
      output += `### Benchmarks secteur\n`;

      // Try to extract common benchmark fields
      const valuationMedian = benchmarks.valuationMedian ?? benchmarks.medianValuation;
      const arrMultiple = benchmarks.arrMultipleMedian ?? benchmarks.revenueMultiple;

      if (valuationMedian) {
        output += `- Valorisation médiane: €${Number(valuationMedian).toLocaleString()}\n`;
      }
      if (arrMultiple) {
        output += `- Multiple ARR médian: ${arrMultiple}x\n`;
      }
      output += "\n";
    }

    // Context Engine data if available
    const ce = context.contextEngine;
    if (ce?.dealIntelligence?.fundingContext) {
      const fc = ce.dealIntelligence.fundingContext;
      output += `\n### Tendance marché (${fc.period})\n`;
      output += `- Multiple valo: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
      output += `- Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
      output += `- Deals analysés: ${fc.totalDealsInPeriod}\n`;
    }

    return output || "Données Funding DB limitées.";
  }

  private formatBAPreferences(prefs: BAPreferences | undefined, dealSector: string | null, dealStage: string | null): string {
    if (!prefs) {
      return "Aucune préférence BA configurée - utiliser les critères standards.";
    }

    const lines: string[] = [];

    // Ticket size
    lines.push(`**Ticket**: ${(prefs.typicalTicketPercent * 100).toFixed(0)}% du round (€${prefs.minTicketAmount.toLocaleString()} - €${prefs.maxTicketAmount.toLocaleString()})`);

    // Sector alignment
    if (dealSector) {
      const sectorLower = dealSector.toLowerCase();
      const isPreferred = prefs.preferredSectors.some(s => sectorLower.includes(s.toLowerCase()));
      const isExcluded = prefs.excludedSectors.some(s => sectorLower.includes(s.toLowerCase()));

      if (isExcluded) {
        lines.push(`**Secteur**: ⚠️ EXCLU - ${dealSector} est dans les exclusions du BA`);
      } else if (isPreferred) {
        lines.push(`**Secteur**: ✅ PRÉFÉRÉ - ${dealSector} match les préférences`);
      } else {
        lines.push(`**Secteur**: ℹ️ NEUTRE - ${dealSector} (préférés: ${prefs.preferredSectors.join(", ")})`);
      }
    }

    // Stage alignment
    if (dealStage) {
      const isPreferredStage = prefs.preferredStages.some(s =>
        dealStage.toLowerCase().replace(/[^a-z]/g, "").includes(s.toLowerCase().replace(/[^a-z]/g, ""))
      );
      if (isPreferredStage) {
        lines.push(`**Stage**: ✅ PRÉFÉRÉ - ${dealStage}`);
      } else {
        lines.push(`**Stage**: ℹ️ HORS PRÉFÉRENCES - ${dealStage} (préférés: ${prefs.preferredStages.join(", ")})`);
      }
    }

    // Risk tolerance
    const riskLabel = prefs.riskTolerance <= 2 ? "conservateur" : prefs.riskTolerance >= 4 ? "agressif" : "modéré";
    lines.push(`**Tolérance risque**: ${prefs.riskTolerance}/5 (${riskLabel})`);

    // Holding period
    lines.push(`**Horizon**: ${prefs.expectedHoldingPeriod} ans`);

    // Geography
    if (prefs.preferredGeographies.length > 0) {
      lines.push(`**Géographies**: ${prefs.preferredGeographies.join(", ")}`);
    }

    return lines.join("\n");
  }

  // ===========================================================================
  // RESPONSE TRANSFORMATION
  // ===========================================================================

  private transformResponse(data: LLMSynthesisResponse, context: EnrichedAgentContext): SynthesisDealScorerData {
    // Validate and normalize the response
    const validVerdicts = ["strong_pass", "pass", "conditional_pass", "weak_pass", "no_go"] as const;
    const validActions = ["invest", "pass", "wait", "negotiate"] as const;

    // Map new action format to old
    const actionMapping: Record<string, typeof validActions[number]> = {
      "STRONG_INVEST": "invest",
      "INVEST": "invest",
      "CONSIDER": "negotiate",
      "PASS": "pass",
      "STRONG_PASS": "pass",
    };

    const rawAction = data.findings?.recommendation?.action ?? data.investmentRecommendation?.action;
    const mappedAction = actionMapping[rawAction as string] ??
                        (validActions.includes(rawAction as typeof validActions[number]) ? rawAction : "wait");

    // Extract dimension scores with backward compatibility
    const rawDimensionData = data.score?.breakdown ?? data.dimensionScores ?? [];
    const dimensionScores = rawDimensionData.map((d) => {
      // Handle both formats: breakdown (criterion/justification) and dimensionScores (dimension/keyFactors)
      const dAny = d as Record<string, unknown>;
      const dimensionName = (dAny.criterion ?? dAny.dimension ?? "Unknown") as string;
      const scoreVal = Math.min(100, Math.max(0, (dAny.score as number) ?? 50));
      const weightVal = (dAny.weight as number) ?? 0;
      const justificationVal = dAny.justification as string | undefined;

      return {
        dimension: dimensionName,
        score: scoreVal,
        weight: weightVal,
        weightedScore: scoreVal * weightVal,
        sourceAgents: (dAny.sourceAgents as string[]) ?? [],
        keyFactors: (dAny.keyFactors as string[]) ?? (justificationVal ? [justificationVal] : []),
      };
    });

    // Calculate overall score if not provided
    const overallScore = data.score?.value ?? data.overallScore ??
      Math.round(dimensionScores.reduce((sum, d) => sum + d.weightedScore, 0));

    // Extract key strengths/weaknesses
    const keyStrengths = data.narrative?.keyInsights?.filter((_, i) => i < 3) ??
                        data.findings?.topStrengths?.map(s => typeof s === "string" ? s : s.strength) ??
                        data.keyStrengths ?? [];

    const keyWeaknesses = data.findings?.topWeaknesses?.map(w => typeof w === "string" ? w : w.weakness) ??
                         data.keyWeaknesses ?? [];

    // Extract critical risks from red flags
    const criticalRisks = (data.redFlags ?? [])
      .filter(rf => rf.severity === "CRITICAL")
      .map(rf => rf.title ?? rf.description ?? "Unknown critical risk");

    // Determine verdict with proper null checks
    const findingsVerdict = data.findings?.recommendation?.verdict;
    let finalVerdict: typeof validVerdicts[number] = "conditional_pass";
    if (findingsVerdict && validVerdicts.includes(findingsVerdict as typeof validVerdicts[number])) {
      finalVerdict = findingsVerdict as typeof validVerdicts[number];
    } else if (data.verdict && validVerdicts.includes(data.verdict as typeof validVerdicts[number])) {
      finalVerdict = data.verdict as typeof validVerdicts[number];
    }

    return {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      verdict: finalVerdict,
      confidence: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? data.confidence ?? 50)),
      dimensionScores,
      scoreBreakdown: {
        strengthsContribution: data.findings?.scoreBreakdown?.adjustments
          ?.filter(a => a.impact > 0)
          .reduce((sum, a) => sum + a.impact, 0) ??
          data.scoreBreakdown?.strengthsContribution ?? 0,
        weaknessesDeduction: Math.abs(data.findings?.scoreBreakdown?.adjustments
          ?.filter(a => a.impact < 0)
          .reduce((sum, a) => sum + a.impact, 0) ??
          data.scoreBreakdown?.weaknessesDeduction ?? 0),
        riskAdjustment: data.scoreBreakdown?.riskAdjustment ?? 0,
        opportunityBonus: data.scoreBreakdown?.opportunityBonus ?? 0,
      },
      comparativeRanking: {
        percentileOverall: data.findings?.marketPosition?.percentileOverall ??
                          data.comparativeRanking?.percentileOverall ?? 50,
        percentileSector: data.findings?.marketPosition?.percentileSector ??
                         data.comparativeRanking?.percentileSector ?? 50,
        percentileStage: data.findings?.marketPosition?.percentileStage ??
                        data.comparativeRanking?.percentileStage ?? 50,
        similarDealsAnalyzed: data.findings?.marketPosition?.similarDealsAnalyzed ??
                             data.comparativeRanking?.similarDealsAnalyzed ?? 0,
      },
      investmentRecommendation: {
        action: mappedAction as "invest" | "pass" | "wait" | "negotiate",
        rationale: data.findings?.recommendation?.rationale ??
                  data.investmentRecommendation?.rationale ??
                  "Analyse en cours",
        conditions: data.findings?.recommendation?.conditions ??
                   data.investmentRecommendation?.conditions,
        suggestedTerms: data.findings?.recommendation?.suggestedTerms ??
                       data.investmentRecommendation?.suggestedTerms,
      },
      keyStrengths: Array.isArray(keyStrengths) ? keyStrengths.slice(0, 5) : [],
      keyWeaknesses: Array.isArray(keyWeaknesses) ? keyWeaknesses.slice(0, 5) : [],
      criticalRisks: Array.isArray(criticalRisks) ? criticalRisks.slice(0, 3) : [],
    };
  }
}

// =============================================================================
// LLM RESPONSE INTERFACE (internal)
// =============================================================================

interface LLMSynthesisResponse {
  meta?: {
    agentName: string;
    analysisDate: string;
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score?: {
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
      sourceAgents?: string[];
      keyFactors?: string[];
    }[];
  };
  findings?: {
    dimensionScores?: Array<{
      dimension: string;
      weight: number;
      rawScore: number;
      adjustedScore: number;
      weightedScore: number;
      sourceAgents: string[];
    }>;
    scoreBreakdown?: {
      baseScore: number;
      adjustments: { type: string; reason: string; impact: number; source: string }[];
      finalScore: number;
      calculationShown: string;
    };
    marketPosition?: {
      percentileOverall: number;
      percentileSector: number;
      percentileStage: number;
      valuationAssessment: string;
      similarDealsAnalyzed: number;
      comparableDeals?: Array<{ name: string; score: number; valuation: number }>;
    };
    recommendation?: {
      action: string;
      verdict: string;
      rationale: string;
      conditions?: string[];
      suggestedTerms?: string;
    };
    topStrengths?: Array<{ strength: string; evidence: string; sourceAgent: string } | string>;
    topWeaknesses?: Array<{ weakness: string; evidence: string } | string>;
  };
  dbCrossReference?: {
    claims: { claim: string; location: string; dbVerdict: string; evidence: string }[];
    uncheckedClaims: string[];
  };
  redFlags?: Array<{
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string;
    evidence: string;
    impact: string;
    question: string;
  }>;
  alertSignal?: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: string;
    justification: string;
  };
  narrative?: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
  // Legacy fields for backward compatibility
  overallScore?: number;
  verdict?: string;
  confidence?: number;
  dimensionScores?: Array<{
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }>;
  scoreBreakdown?: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking?: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
  };
  investmentRecommendation?: {
    action: string;
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths?: string[];
  keyWeaknesses?: string[];
  criticalRisks?: string[];
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const synthesisDealScorer = new SynthesisDealScorerAgent();
