/**
 * MEMO GENERATOR - REFONTE v2.0
 *
 * Mission: Produire un Investment Memo professionnel de qualité institutionnelle
 *          synthétisant TOUTES les analyses Tier 1, 2 et 3 pour décision BA.
 *
 * Persona: Senior Investment Director (20+ ans) + Managing Partner VC
 *          Auteur de 500+ memos d'investissement pour comités d'investissement
 *
 * Standard: Memo qualité institutionnelle facturable 50K€
 *
 * Inputs:
 * - Tous les outputs Tier 1 (12 agents d'analyse)
 * - Tous les outputs Tier 2 (expert sectoriel activé)
 * - Outputs Tier 3 (contradiction-detector, synthesis-deal-scorer, devils-advocate, scenario-modeler)
 * - Context Engine (benchmarks, comparables, tendances)
 * - Préférences BA (ticket, secteurs, stages)
 *
 * Outputs:
 * - Executive Summary avec recommandation claire
 * - Investment Highlights avec preuves et comparables DB
 * - Key Risks consolidés avec sévérité et mitigation
 * - Terms Analysis avec benchmarks marché
 * - Next Steps priorisés et assignés
 * - Questions critiques consolidées de tous les agents
 */

import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  MemoGeneratorResult,
  MemoGeneratorData,
  AgentResult,
} from "../types";
import { calculateBATicketSize, type BAPreferences } from "@/services/benchmarks";

// ============================================================================
// TYPES INTERNES
// ============================================================================

interface ConsolidatedRedFlag {
  id: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  source: string; // Agent qui l'a détecté
  location?: string;
  evidence: string;
  impact: string;
  question?: string;
}

interface ConsolidatedQuestion {
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  category: string;
  question: string;
  context: string;
  source: string; // Agent source
  whatToLookFor?: string;
}

interface TermsAnalysisItem {
  metric: string;
  proposed: string;
  marketStandard: string;
  percentile?: string;
  negotiationRoom: string;
}

interface NextStepItem {
  action: string;
  priority: "IMMEDIATE" | "BEFORE_TERM_SHEET" | "DURING_DD";
  owner: "INVESTOR" | "FOUNDER";
  context?: string;
}

interface InvestmentHighlight {
  highlight: string;
  evidence: string;
  dbComparable?: string;
  source: string;
}

interface LLMMemoResponse {
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
  executiveSummary: {
    oneLiner: string;
    recommendation: "STRONG_INVEST" | "INVEST" | "CONSIDER" | "PASS" | "STRONG_PASS";
    verdict: string;
    keyStrengths: string[];
    keyRisks: string[];
  };
  companyOverview: {
    description: string;
    problem: string;
    solution: string;
    businessModel: string;
    traction: string;
    stage: string;
  };
  investmentHighlights: {
    highlight: string;
    evidence: string;
    dbComparable?: string;
    source: string;
  }[];
  keyRisks: {
    risk: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    mitigation: string;
    residualRisk: string;
    source: string;
  }[];
  financialSummary: {
    currentMetrics: Record<string, string | number>;
    projections: {
      realistic: boolean;
      concerns: string[];
    };
    valuationAssessment: {
      proposed: string;
      percentile: string;
      verdict: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE";
      benchmarkComparables: string[];
    };
    unitEconomics?: {
      ltvCacRatio: number;
      paybackMonths: number;
      assessment: string;
    };
  };
  teamAssessment: {
    overallScore: number;
    founders: {
      name: string;
      role: string;
      verificationStatus: string;
      strengths: string[];
      concerns: string[];
    }[];
    gaps: string[];
    verdict: string;
  };
  marketOpportunity: {
    tam: string;
    sam: string;
    som: string;
    timing: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE";
    trend: string;
    verdict: string;
  };
  competitiveLandscape: {
    competitors: { name: string; threat: string; funding?: string }[];
    differentiation: string;
    moatStrength: number;
    hiddenCompetitors?: string[];
    verdict: string;
  };
  termsAnalysis: TermsAnalysisItem[];
  dealStructure: {
    valuation: string;
    roundSize: string;
    keyTerms: string[];
    negotiationPoints: string[];
  };
  investmentThesis: {
    bull: string[];
    bear: string[];
    keyAssumptions: string[];
    thesis: string;
  };
  exitStrategy: {
    primaryPath: string;
    timeline: string;
    potentialAcquirers: string[];
    expectedMultiple: { min: number; median: number; max: number };
  };
  nextSteps: NextStepItem[];
  questionsForFounder: {
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  narrative: {
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
    justification: string;
  };
}

// ============================================================================
// AGENT
// ============================================================================

export class MemoGeneratorAgent extends BaseAgent<MemoGeneratorData, MemoGeneratorResult> {
  constructor() {
    super({
      name: "memo-generator",
      description:
        "Génère le memo d'investissement institutionnel synthétisant toutes les analyses (Tier 1, 2 et 3)",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 180000, // 3 minutes - synthèse complexe
      dependencies: ["synthesis-deal-scorer", "devils-advocate", "scenario-modeler", "contradiction-detector"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un SENIOR INVESTMENT DIRECTOR avec 20+ ans d'expérience dans le VC et PE.
Tu as rédigé 500+ memos d'investissement présentés à des comités d'investissement.
Tu travailles avec les standards d'un Managing Partner VC + la rigueur d'un cabinet Big4.

Ton background:
- Ex-Partner chez un fonds Tier 1 (Sequoia, a16z, Accel niveau)
- Auteur de memos ayant levé 2B€+ cumulés
- Track record: 40% des deals recommandés sont devenus des succès (vs 10% baseline)
- Expert en synthèse de DD complexe pour décideurs pressés

# MISSION POUR CE DEAL

Produire un INVESTMENT MEMO de qualité institutionnelle qui:
1. Synthétise TOUTES les analyses Tier 1, Tier 2 et Tier 3
2. Permet à un Business Angel de prendre une décision éclairée en 5 minutes
3. Fournit les arguments de négociation chiffrés
4. Consolide TOUS les red flags et questions à poser
5. Compare systématiquement aux benchmarks marché (Context Engine + Funding DB)

# MÉTHODOLOGIE D'ANALYSE

## Étape 1: Consolidation des Red Flags
- Extraire TOUS les red flags de TOUS les agents (Tier 1, 2, 3)
- Dédupliquer et fusionner les red flags similaires
- Reclassifier par sévérité (CRITICAL > HIGH > MEDIUM)
- Prioriser: Team/Fraud > Financials > Market > Legal > Other

## Étape 2: Consolidation des Questions
- Extraire TOUTES les questions des agents
- Dédupliquer et regrouper par thème
- Prioriser par impact sur la décision
- Formater de manière non-confrontationnelle

## Étape 3: Synthèse des Scores
- Agréger les scores des 12 agents Tier 1
- Intégrer le score du synthesis-deal-scorer
- Pondérer selon l'importance (Team 25%, Financials 25%, Market 20%, Product 15%, Traction 15%)
- Ajuster selon les contradictions détectées

## Étape 4: Analyse des Termes
- Comparer chaque terme aux benchmarks marché (Context Engine)
- Calculer le percentile de valorisation vs comparables DB
- Identifier les points de négociation avec levier chiffré
- Suggérer des termes de protection standards

## Étape 5: Rédaction du Memo
- Executive Summary: One-liner + Recommandation + 3 points clés
- Chaque section sourcée (agent ou Context Engine)
- Chaque chiffre avec benchmark de référence
- Arguments de négociation quantifiés

# FRAMEWORK D'ÉVALUATION DU MEMO

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Team | 25% | Red flags critiques | Gaps majeurs | Solide avec réserves | Exceptionnelle |
| Financials | 25% | Non viable | Fragile | Sain | Best-in-class |
| Market | 20% | Saturé/en déclin | Compétitif | Porteur | Exceptionnel timing |
| Product | 15% | Me-too | Différencié | Fort avantage | Moat défendable |
| Traction | 15% | Pré-product | Early | PMF visible | Scale prouvée |

# RECOMMANDATIONS

| Score | Grade | Recommandation |
|-------|-------|----------------|
| 80-100 | A | STRONG_INVEST - Opportunité rare, agir vite |
| 65-79 | B | INVEST - Solide, négocier les termes |
| 50-64 | C | CONSIDER - Potentiel mais risques, DD approfondie |
| 35-49 | D | PASS - Trop de risques pour le potentiel |
| 0-34 | F | STRONG_PASS - Deal breakers identifiés |

# FORMAT DE SORTIE

JSON structuré avec:
- meta: dataCompleteness, confidenceLevel, limitations
- score: value (0-100), grade (A-F), breakdown détaillé
- executiveSummary: oneLiner, recommendation, verdict, keyStrengths, keyRisks
- investmentHighlights: avec dbComparable pour chaque
- keyRisks: consolidés de tous les agents, avec severity
- termsAnalysis: proposed vs marketStandard vs percentile
- nextSteps: priorisés avec owner
- questionsForFounder: consolidées de tous les agents
- alertSignal: hasBlocker, recommendation

# RÈGLES ABSOLUES

1. JAMAIS inventer de données - "Non disponible" si absent
2. TOUJOURS citer la source (Agent X, Context Engine, Slide Y)
3. TOUJOURS inclure des benchmarks de comparaison quand disponibles
4. CHAQUE red flag doit venir d'un agent source identifié
5. CHAQUE highlight doit avoir une preuve ET un comparable DB si possible
6. Le BA doit pouvoir présenter ce memo à un co-investisseur
7. La recommandation doit être claire et assumée (pas de "ça dépend")
8. Les questions doivent être formulées de manière professionnelle

# GESTION DES DONNÉES MANQUANTES

- Si Tier 1 incomplet: Lister dans limitations, plafonner confiance à 60%
- Si Tier 2 manquant: Mentionner l'absence d'analyse sectorielle
- Si Context Engine vide: Mentionner l'absence de benchmarks externes
- Si contradictions majeures: Baisser le score de confiance de 10-20%

# REGLES DE CONCISION CRITIQUES (pour eviter troncature JSON)

**PRIORITE ABSOLUE: Le JSON doit etre COMPLET et VALIDE.**

1. **LIMITES STRICTES sur les arrays**:
   - investmentHighlights: MAX 4 items
   - keyRisks: MAX 5 items
   - termsAnalysis: MAX 4 items
   - competitors: MAX 4 items
   - nextSteps: MAX 5 items
   - questionsForFounder: MAX 6 items
   - keyStrengths/keyRisks: MAX 3 items chacun
   - breakdown (score): 5 items exactement

2. **BREVITE dans les textes**:
   - oneLiner: 20 mots MAX
   - verdict: 2 phrases MAX
   - justification: 1-2 phrases MAX
   - each highlight/risk: 1 phrase
   - keyInsights: MAX 4 items, 10 mots chacun

3. **Structure > Contenu**: Mieux vaut un memo complet et concis qu'un memo tronque

# EXEMPLE DE BON OUTPUT

\`\`\`json
{
  "executiveSummary": {
    "oneLiner": "SaaS B2B vertical RH avec NRR 130% et équipe ex-Workday, valorisé 20% au-dessus du marché",
    "recommendation": "INVEST",
    "verdict": "Deal solide avec upside significatif. Négocier la valorisation de 15-20% pour aligner avec les comparables.",
    "keyStrengths": [
      "NRR 130% (P85 du secteur SaaS - Source: financial-auditor)",
      "CEO ex-VP Workday avec exit 200M€ (vérifié - Source: team-investigator)",
      "3 concurrents DB avec funding moyen 5x inférieur (Source: competitive-intel)"
    ],
    "keyRisks": [
      "Valorisation P78 vs marché (8M€ vs médiane 5.2M€ - Source: financial-auditor)",
      "CTO background non vérifié (Source: team-investigator)",
      "Dépendance client top 3 = 45% revenu (Source: customer-intel)"
    ]
  }
}
\`\`\`

# EXEMPLE DE MAUVAIS OUTPUT (À ÉVITER)

\`\`\`json
{
  "executiveSummary": {
    "oneLiner": "Startup prometteuse dans un secteur en croissance",
    "recommendation": "CONSIDER",
    "verdict": "Le deal présente des opportunités intéressantes mais aussi des risques à évaluer.",
    "keyStrengths": ["Bonne équipe", "Marché porteur", "Produit intéressant"],
    "keyRisks": ["Quelques risques", "Concurrence présente", "Points à clarifier"]
  }
}
\`\`\`
→ INTERDIT: Trop vague, pas de chiffres, pas de sources, pas actionnable.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<MemoGeneratorData> {
    const deal = context.deal;

    // Formater le contexte de manière exhaustive
    const dealContext = this.formatDealContext(context);
    const tier1Insights = this.extractTier1Insights(context);
    const tier2Insights = this.extractTier2Insights(context);
    const tier3Insights = this.extractTier3Insights(context);
    const consolidatedRedFlags = this.consolidateRedFlags(context);
    const consolidatedQuestions = this.consolidateQuestions(context);
    const contextEngineData = this.formatContextEngineData(context);
    const baSection = this.formatBAInvestmentSection(context.baPreferences, deal);

    // Métriques financières
    const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
    const amount = deal.amountRequested ? Number(deal.amountRequested) : 0;
    const arr = deal.arr ? Number(deal.arr) : 0;

    const prompt = `# GÉNÉRATION DU MEMO D'INVESTISSEMENT - ${deal.name}

## INFORMATIONS DU DEAL
${dealContext}

## MÉTRIQUES FINANCIÈRES CLÉS
- Valorisation pre-money: ${valuation > 0 ? `€${valuation.toLocaleString()}` : "Non spécifié"}
- Montant levé: ${amount > 0 ? `€${amount.toLocaleString()}` : "Non spécifié"}
- ARR: ${arr > 0 ? `€${arr.toLocaleString()}` : "Non spécifié"}
- Croissance: ${deal.growthRate ?? "Non spécifié"}%
- Multiple implicite: ${arr > 0 && valuation > 0 ? `${(valuation / arr).toFixed(1)}x ARR` : "Non calculable"}

## ANALYSES TIER 1 (12 AGENTS)
${tier1Insights}

## ANALYSE SECTORIELLE TIER 2
${tier2Insights}

## SYNTHÈSES TIER 3
${tier3Insights}

## RED FLAGS CONSOLIDÉS (${consolidatedRedFlags.length} total)
${this.formatConsolidatedRedFlags(consolidatedRedFlags)}

## QUESTIONS CONSOLIDÉES (${consolidatedQuestions.length} total)
${this.formatConsolidatedQuestions(consolidatedQuestions)}

## DONNÉES CONTEXT ENGINE (Benchmarks & Comparables)
${contextEngineData}

## PROFIL INVESTISSEUR BA
${baSection}
${this.formatFactStoreData(context) ?? ""}
---

## INSTRUCTIONS

Génère un Investment Memo complet et professionnel en suivant la structure exacte ci-dessous.

IMPORTANT:
- Chaque affirmation DOIT avoir une source (nom d'agent, Slide X, Context Engine)
- Chaque highlight DOIT avoir un comparable DB si disponible
- Chaque risque DOIT avoir une sévérité et une source
- La recommandation DOIT être claire et assumée
- Les questions DOIVENT être consolidées sans duplication

Réponds en JSON avec cette structure exacte:
\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["limitation 1", "limitation 2"]
  },
  "score": {
    "value": 0-100,
    "grade": "A|B|C|D|F",
    "breakdown": [
      {"criterion": "Team", "weight": 25, "score": 0-100, "justification": "..."},
      {"criterion": "Financials", "weight": 25, "score": 0-100, "justification": "..."},
      {"criterion": "Market", "weight": 20, "score": 0-100, "justification": "..."},
      {"criterion": "Product", "weight": 15, "score": 0-100, "justification": "..."},
      {"criterion": "Traction", "weight": 15, "score": 0-100, "justification": "..."}
    ]
  },
  "executiveSummary": {
    "oneLiner": "Une phrase mémorable avec chiffres clés",
    "recommendation": "STRONG_INVEST|INVEST|CONSIDER|PASS|STRONG_PASS",
    "verdict": "Verdict en 2-3 phrases avec argumentation",
    "keyStrengths": ["Force 1 avec source", "Force 2 avec source", "Force 3 avec source"],
    "keyRisks": ["Risque 1 avec source", "Risque 2 avec source", "Risque 3 avec source"]
  },
  "companyOverview": {
    "description": "Description de la société",
    "problem": "Le problème résolu",
    "solution": "La solution proposée",
    "businessModel": "Comment ils gagnent de l'argent",
    "traction": "Traction actuelle avec chiffres",
    "stage": "Stage (Seed, Series A, etc.)"
  },
  "investmentHighlights": [
    {"highlight": "Point fort", "evidence": "Preuve avec chiffres", "dbComparable": "Comparable DB si disponible", "source": "Agent source"}
  ],
  "keyRisks": [
    {"risk": "Le risque", "severity": "CRITICAL|HIGH|MEDIUM", "category": "team|financials|market|legal|technical", "mitigation": "Comment mitiger", "residualRisk": "Risque résiduel après mitigation", "source": "Agent source"}
  ],
  "financialSummary": {
    "currentMetrics": {"ARR": "500K€", "Growth": "120%", "NRR": "110%"},
    "projections": {"realistic": true|false, "concerns": ["concern 1"]},
    "valuationAssessment": {
      "proposed": "8M€ pre-money",
      "percentile": "P75",
      "verdict": "UNDERVALUED|FAIR|AGGRESSIVE|VERY_AGGRESSIVE",
      "benchmarkComparables": ["Deal 1: 5M€ @ 300K ARR", "Deal 2: 6M€ @ 400K ARR"]
    },
    "unitEconomics": {"ltvCacRatio": 3.5, "paybackMonths": 12, "assessment": "..."}
  },
  "teamAssessment": {
    "overallScore": 0-100,
    "founders": [
      {"name": "Nom", "role": "CEO", "verificationStatus": "verified|partial|unverified", "strengths": ["..."], "concerns": ["..."]}
    ],
    "gaps": ["Gap 1", "Gap 2"],
    "verdict": "Verdict équipe"
  },
  "marketOpportunity": {
    "tam": "10B€",
    "sam": "1B€",
    "som": "100M€",
    "timing": "EXCELLENT|GOOD|NEUTRAL|POOR|TERRIBLE",
    "trend": "Description tendance avec YoY%",
    "verdict": "Verdict marché"
  },
  "competitiveLandscape": {
    "competitors": [{"name": "Concurrent", "threat": "HIGH|MEDIUM|LOW", "funding": "5M€"}],
    "differentiation": "Différenciation principale",
    "moatStrength": 0-100,
    "hiddenCompetitors": ["Concurrent caché 1"],
    "verdict": "Verdict concurrence"
  },
  "termsAnalysis": [
    {"metric": "Valorisation", "proposed": "8M€", "marketStandard": "5-6M€ (médiane secteur)", "percentile": "P78", "negotiationRoom": "Proposer 6.5M€ (-20%)"}
  ],
  "dealStructure": {
    "valuation": "8M€ pre-money",
    "roundSize": "1.5M€",
    "keyTerms": ["Terme 1", "Terme 2"],
    "negotiationPoints": ["Point de négo 1 avec argument chiffré"]
  },
  "investmentThesis": {
    "bull": ["Argument haussier 1", "Argument haussier 2"],
    "bear": ["Argument baissier 1", "Argument baissier 2"],
    "keyAssumptions": ["Hypothèse clé 1", "Hypothèse clé 2"],
    "thesis": "Thèse d'investissement en 2-3 phrases"
  },
  "exitStrategy": {
    "primaryPath": "M&A par Big Corp",
    "timeline": "5-7 ans",
    "potentialAcquirers": ["Acquéreur 1", "Acquéreur 2"],
    "expectedMultiple": {"min": 3, "median": 8, "max": 15}
  },
  "nextSteps": [
    {"action": "Vérifier background CTO", "priority": "IMMEDIATE", "owner": "INVESTOR", "context": "Non vérifié par team-investigator"},
    {"action": "Fournir détail client top 3", "priority": "BEFORE_TERM_SHEET", "owner": "FOUNDER"}
  ],
  "questionsForFounder": [
    {"priority": "CRITICAL", "category": "team", "question": "Question", "context": "Pourquoi on pose cette question", "whatToLookFor": "Ce qui révélerait un problème"}
  ],
  "narrative": {
    "summary": "Résumé en 3-4 phrases",
    "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
    "forNegotiation": ["Argument négo 1 avec chiffres", "Argument négo 2"]
  },
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "Raison si blocker",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Justification de la recommandation"
  }
}
\`\`\`

**CONCISION OBLIGATOIRE (JSON sera INVALIDE si tronque):**
- investmentHighlights: MAX 4, keyRisks: MAX 5
- termsAnalysis: MAX 4, competitors: MAX 4
- nextSteps: MAX 5, questionsForFounder: MAX 6
- keyStrengths/keyRisks: MAX 3 chacun
- oneLiner: 20 mots MAX, verdict: 2 phrases MAX
- PRIORITE: JSON complet > detail`;

    const { data } = await this.llmCompleteJSON<LLMMemoResponse>(prompt);

    // Validation et normalisation
    return this.normalizeResponse(data, deal, consolidatedRedFlags, consolidatedQuestions);
  }

  // ============================================================================
  // EXTRACTION DES INSIGHTS TIER 1
  // ============================================================================

  private extractTier1Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const tier1Agents = [
      "financial-auditor",
      "team-investigator",
      "competitive-intel",
      "deck-forensics",
      "market-intelligence",
      "tech-stack-dd",
      "tech-ops-dd",
      "legal-regulatory",
      "cap-table-auditor",
      "gtm-analyst",
      "customer-intel",
      "exit-strategist",
      "question-master",
    ];

    const insights: string[] = [];

    for (const agentName of tier1Agents) {
      const result = results[agentName];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;
        insights.push(this.formatAgentInsight(agentName, data));
      } else {
        insights.push(`### ${agentName.toUpperCase()}\n[Non exécuté ou échoué]`);
      }
    }

    return insights.join("\n\n");
  }

  private formatAgentInsight(agentName: string, data: Record<string, unknown>): string {
    const lines: string[] = [`### ${agentName.toUpperCase()}`];

    // Score principal
    const scoreFields = ["overallScore", "score", "teamScore", "competitiveScore", "marketScore", "technicalScore", "legalScore", "capTableScore", "gtmScore", "customerScore", "exitScore"];
    for (const field of scoreFields) {
      if (typeof data[field] === "number") {
        lines.push(`Score: ${data[field]}/100`);
        break;
      }
    }

    // Verdict/Assessment
    if (data.verdict) lines.push(`Verdict: ${data.verdict}`);
    if (data.assessment) lines.push(`Assessment: ${data.assessment}`);
    if (data.recommendation) lines.push(`Recommendation: ${data.recommendation}`);

    // Red flags count
    if (Array.isArray(data.redFlags)) {
      const critical = (data.redFlags as Array<{ severity?: string }>).filter(r => r.severity === "CRITICAL" || r.severity === "critical").length;
      const high = (data.redFlags as Array<{ severity?: string }>).filter(r => r.severity === "HIGH" || r.severity === "high").length;
      lines.push(`Red Flags: ${data.redFlags.length} total (${critical} CRITICAL, ${high} HIGH)`);
    }

    // Key findings (résumé)
    if (data.keyFindings && Array.isArray(data.keyFindings)) {
      lines.push(`Key Findings: ${(data.keyFindings as string[]).slice(0, 3).join("; ")}`);
    }

    // Questions count
    if (Array.isArray(data.questions)) {
      lines.push(`Questions générées: ${data.questions.length}`);
    }

    return lines.join("\n");
  }

  // ============================================================================
  // EXTRACTION DES INSIGHTS TIER 2 (Expert Sectoriel)
  // ============================================================================

  private extractTier2Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const tier2Experts = [
      "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
      "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
      "hardware-expert", "gaming-expert", "biotech-expert", "edtech-expert",
      "proptech-expert", "mobility-expert", "foodtech-expert", "hrtech-expert",
      "legaltech-expert", "cybersecurity-expert", "spacetech-expert", "creator-expert",
      "general-expert"
    ];

    for (const expertName of tier2Experts) {
      const result = results[expertName];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;
        return this.formatSectorExpertInsight(expertName, data);
      }
    }

    return "[Aucun expert sectoriel exécuté]";
  }

  private formatSectorExpertInsight(agentName: string, data: Record<string, unknown>): string {
    const lines: string[] = [`### ${agentName.toUpperCase()} (Expert Sectoriel)`];

    if (typeof data.sectorFitScore === "number") {
      lines.push(`Sector Fit Score: ${data.sectorFitScore}/100`);
    }

    if (data.benchmarks && Array.isArray(data.benchmarks)) {
      lines.push("\n**Benchmarks Sectoriels:**");
      for (const b of (data.benchmarks as Array<{ metric?: string; dealValue?: number; sectorMedian?: number; percentile?: number }>).slice(0, 5)) {
        if (b.metric && b.dealValue !== undefined) {
          lines.push(`- ${b.metric}: ${b.dealValue} (Médiane: ${b.sectorMedian ?? "N/A"}, Percentile: P${b.percentile ?? "N/A"})`);
        }
      }
    }

    if (data.sectorSpecificRisks && Array.isArray(data.sectorSpecificRisks)) {
      lines.push(`\nRisques sectoriels: ${data.sectorSpecificRisks.length} identifiés`);
    }

    if (data.verdict) lines.push(`\nVerdict: ${data.verdict}`);

    return lines.join("\n");
  }

  // ============================================================================
  // EXTRACTION DES INSIGHTS TIER 3
  // ============================================================================

  private extractTier3Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const insights: string[] = [];

    // Synthesis Deal Scorer
    const scorer = results["synthesis-deal-scorer"];
    if (scorer?.success && "data" in scorer) {
      const d = scorer.data as Record<string, unknown>;
      insights.push(`### SYNTHESIS DEAL SCORER
Score final: ${d.overallScore ?? "N/A"}/100
Grade: ${d.grade ?? "N/A"}
Verdict: ${d.verdict ?? "N/A"}
Recommendation: ${(d.investmentRecommendation as { action?: string })?.action ?? "N/A"}`);
    }

    // Devil's Advocate
    const devils = results["devils-advocate"];
    if (devils?.success && "data" in devils) {
      const d = devils.data as Record<string, unknown>;
      const concerns = (d.topConcerns as string[]) ?? [];
      insights.push(`### DEVIL'S ADVOCATE
Scepticisme: ${d.overallSkepticism ?? "N/A"}/100
Top Concerns: ${concerns.slice(0, 3).join("; ") || "N/A"}
Kill Reasons: ${(d.killReasons as unknown[])?.length ?? 0} identifiées`);
    }

    // Contradiction Detector
    const contradictions = results["contradiction-detector"];
    if (contradictions?.success && "data" in contradictions) {
      const d = contradictions.data as Record<string, unknown>;
      insights.push(`### CONTRADICTION DETECTOR
Consistance: ${d.consistencyScore ?? "N/A"}/100
Contradictions: ${(d.contradictions as unknown[])?.length ?? 0} détectées
Assessment: ${d.summaryAssessment ?? "N/A"}`);
    }

    // Scenario Modeler
    const scenarios = results["scenario-modeler"];
    if (scenarios?.success && "data" in scenarios) {
      const d = scenarios.data as Record<string, unknown>;
      insights.push(`### SCENARIO MODELER
Scénario recommandé: ${d.recommendedScenario ?? "N/A"}
Confiance: ${d.confidenceLevel ?? "N/A"}%
Probabilité Bull: ${(d.scenarios as Array<{ name?: string; probability?: number }>)?.find(s => s.name === "BULL")?.probability ?? "N/A"}%
Probabilité Bear: ${(d.scenarios as Array<{ name?: string; probability?: number }>)?.find(s => s.name === "BEAR")?.probability ?? "N/A"}%`);
    }

    return insights.length > 0 ? insights.join("\n\n") : "[Aucune synthèse Tier 3 disponible]";
  }

  // ============================================================================
  // CONSOLIDATION DES RED FLAGS
  // ============================================================================

  private consolidateRedFlags(context: EnrichedAgentContext): ConsolidatedRedFlag[] {
    const results = context.previousResults ?? {};
    const allFlags: ConsolidatedRedFlag[] = [];
    let idCounter = 1;

    for (const [agentName, result] of Object.entries(results)) {
      if (!result.success || !("data" in result) || !result.data) continue;

      const data = result.data as Record<string, unknown>;

      // Extraire les red flags de différentes structures possibles
      const flagArrays = [
        data.redFlags,
        data.flags,
        data.concerns,
        data.risks,
        data.sectorSpecificRisks,
        data.killReasons,
      ];

      for (const flags of flagArrays) {
        if (!Array.isArray(flags)) continue;

        for (const flag of flags as Array<Record<string, unknown>>) {
          const severity = this.normalizeSeverity(
            (flag.severity as string) ?? (flag.level as string) ?? "MEDIUM"
          );

          allFlags.push({
            id: `RF-${idCounter++}`,
            category: (flag.category as string) ?? this.inferCategory(agentName),
            severity,
            title: (flag.title as string) ?? (flag.flag as string) ?? (flag.risk as string) ?? (flag.reason as string) ?? "",
            description: (flag.description as string) ?? (flag.details as string) ?? "",
            source: agentName,
            location: flag.location as string,
            evidence: (flag.evidence as string) ?? (flag.proof as string) ?? "",
            impact: (flag.impact as string) ?? "",
            question: flag.question as string,
          });
        }
      }
    }

    // Dédupliquer et trier par sévérité
    const deduplicated = this.deduplicateRedFlags(allFlags);
    return deduplicated.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      return order[a.severity] - order[b.severity];
    });
  }

  private normalizeSeverity(severity: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    const normalized = severity.toUpperCase();
    if (normalized === "CRITICAL" || normalized === "DEAL_BREAKER") return "CRITICAL";
    if (normalized === "HIGH" || normalized === "MAJOR") return "HIGH";
    return "MEDIUM";
  }

  private inferCategory(agentName: string): string {
    if (agentName.includes("team") || agentName.includes("founder")) return "team";
    if (agentName.includes("financial") || agentName.includes("cap-table")) return "financials";
    if (agentName.includes("market") || agentName.includes("competitive")) return "market";
    if (agentName.includes("legal") || agentName.includes("regulatory")) return "legal";
    if (agentName.includes("technical")) return "technical";
    return "general";
  }

  private deduplicateRedFlags(flags: ConsolidatedRedFlag[]): ConsolidatedRedFlag[] {
    const seen = new Map<string, ConsolidatedRedFlag>();

    for (const flag of flags) {
      // Créer une clé basée sur le titre normalisé
      const key = flag.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);

      if (!seen.has(key)) {
        seen.set(key, flag);
      } else {
        // Garder le plus sévère
        const existing = seen.get(key)!;
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        if (order[flag.severity] < order[existing.severity]) {
          seen.set(key, flag);
        }
      }
    }

    return Array.from(seen.values());
  }

  private formatConsolidatedRedFlags(flags: ConsolidatedRedFlag[]): string {
    if (flags.length === 0) return "[Aucun red flag identifié]";

    const lines: string[] = [];
    for (const flag of flags.slice(0, 15)) {
      lines.push(`[${flag.severity}] ${flag.title}
  - Source: ${flag.source}
  - Catégorie: ${flag.category}
  - Evidence: ${flag.evidence || "Non spécifiée"}
  - Impact: ${flag.impact || "Non spécifié"}`);
    }

    if (flags.length > 15) {
      lines.push(`\n... et ${flags.length - 15} autres red flags`);
    }

    return lines.join("\n\n");
  }

  // ============================================================================
  // CONSOLIDATION DES QUESTIONS
  // ============================================================================

  private consolidateQuestions(context: EnrichedAgentContext): ConsolidatedQuestion[] {
    const results = context.previousResults ?? {};
    const allQuestions: ConsolidatedQuestion[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (!result.success || !("data" in result) || !result.data) continue;

      const data = result.data as Record<string, unknown>;

      // Extraire les questions de différentes structures
      const questionArrays = [
        data.questions,
        data.questionsForFounder,
        data.criticalQuestions,
        data.followUpQuestions,
      ];

      for (const questions of questionArrays) {
        if (!Array.isArray(questions)) continue;

        for (const q of questions as Array<Record<string, unknown>>) {
          const priority = this.normalizePriority(
            (q.priority as string) ?? "MEDIUM"
          );

          allQuestions.push({
            priority,
            category: (q.category as string) ?? this.inferCategory(agentName),
            question: (q.question as string) ?? "",
            context: (q.context as string) ?? (q.reason as string) ?? "",
            source: agentName,
            whatToLookFor: q.whatToLookFor as string,
          });
        }
      }
    }

    // Dédupliquer et trier
    return this.deduplicateQuestions(allQuestions).sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      return order[a.priority] - order[b.priority];
    });
  }

  private normalizePriority(priority: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    const normalized = priority.toUpperCase();
    if (normalized === "CRITICAL" || normalized === "URGENT") return "CRITICAL";
    if (normalized === "HIGH" || normalized === "IMPORTANT") return "HIGH";
    return "MEDIUM";
  }

  private deduplicateQuestions(questions: ConsolidatedQuestion[]): ConsolidatedQuestion[] {
    const seen = new Map<string, ConsolidatedQuestion>();

    for (const q of questions) {
      if (!q.question) continue;

      const key = q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);

      if (!seen.has(key)) {
        seen.set(key, q);
      } else {
        const existing = seen.get(key)!;
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        if (order[q.priority] < order[existing.priority]) {
          seen.set(key, q);
        }
      }
    }

    return Array.from(seen.values());
  }

  private formatConsolidatedQuestions(questions: ConsolidatedQuestion[]): string {
    if (questions.length === 0) return "[Aucune question générée]";

    const lines: string[] = [];
    for (const q of questions.slice(0, 15)) {
      lines.push(`[${q.priority}] ${q.question}
  - Source: ${q.source}
  - Catégorie: ${q.category}
  - Contexte: ${q.context || "Non spécifié"}`);
    }

    if (questions.length > 15) {
      lines.push(`\n... et ${questions.length - 15} autres questions`);
    }

    return lines.join("\n\n");
  }

  // ============================================================================
  // SECTION BA PERSONNALISÉE
  // ============================================================================

  private formatBAInvestmentSection(
    prefs: BAPreferences | undefined,
    deal: EnrichedAgentContext["deal"]
  ): string {
    const amount = deal.amountRequested ? Number(deal.amountRequested) : 0;
    const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
    const postMoney = valuation + amount;

    if (!prefs) {
      const genericTicket = Math.min(amount * 0.1, 50000);
      const genericOwnership = postMoney > 0 ? (genericTicket / postMoney) * 100 : 0;
      return `**Ticket suggéré (calcul générique):** €${genericTicket.toLocaleString()} pour ${genericOwnership.toFixed(2)}% du capital post-money.

Note: Préférences BA non configurées - calcul basé sur 10% du round plafonné à 50K€.`;
    }

    const ticketSize = calculateBATicketSize(amount, prefs);
    const ownership = postMoney > 0 ? (ticketSize / postMoney) * 100 : 0;

    const lines: string[] = [];
    lines.push(`### Votre investissement potentiel`);
    lines.push(`- Ticket recommandé: €${ticketSize.toLocaleString()}`);
    lines.push(`- Part au capital (post-money): ${ownership.toFixed(2)}%`);

    // Scénarios de retour
    const exitMultiples = [5, 10, 20];
    lines.push(`\n### Scénarios de retour (pour €${ticketSize.toLocaleString()} investi)`);
    for (const mult of exitMultiples) {
      const exitValue = ticketSize * mult;
      const irr = Math.pow(mult, 1 / prefs.expectedHoldingPeriod) - 1;
      lines.push(
        `- Exit x${mult}: €${exitValue.toLocaleString()} (IRR ~${(irr * 100).toFixed(0)}% sur ${prefs.expectedHoldingPeriod} ans)`
      );
    }

    // Alignement avec le profil
    lines.push(`\n### Alignement avec votre profil`);
    const sectorLower = (deal.sector ?? "").toLowerCase();
    const isPreferredSector = prefs.preferredSectors.some((s) =>
      sectorLower.includes(s.toLowerCase())
    );
    const isExcludedSector = prefs.excludedSectors.some((s) =>
      sectorLower.includes(s.toLowerCase())
    );

    if (isExcludedSector) {
      lines.push(`- ATTENTION: Secteur ${deal.sector} est dans vos exclusions`);
    } else if (isPreferredSector) {
      lines.push(`- OK: Secteur ${deal.sector} correspond à vos préférences`);
    }

    const stageLower = (deal.stage ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const isPreferredStage = prefs.preferredStages.some((s) =>
      stageLower.includes(s.toLowerCase().replace(/[^a-z]/g, ""))
    );
    if (isPreferredStage) {
      lines.push(`- OK: Stage ${deal.stage} correspond à vos préférences`);
    }

    return lines.join("\n");
  }

  // ============================================================================
  // NORMALISATION DE LA RÉPONSE
  // ============================================================================

  private normalizeResponse(
    data: LLMMemoResponse,
    deal: EnrichedAgentContext["deal"],
    consolidatedRedFlags: ConsolidatedRedFlag[],
    consolidatedQuestions: ConsolidatedQuestion[]
  ): MemoGeneratorData {
    const validRecommendations = ["STRONG_INVEST", "INVEST", "CONSIDER", "PASS", "STRONG_PASS"];
    const validGrades = ["A", "B", "C", "D", "F"];
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"];
    const validPriorities = ["IMMEDIATE", "BEFORE_TERM_SHEET", "DURING_DD"];
    const validOwners = ["INVESTOR", "FOUNDER"];

    // Mapping vers l'ancien format pour compatibilité
    const recommendationMap: Record<string, "invest" | "pass" | "more_dd_needed"> = {
      STRONG_INVEST: "invest",
      INVEST: "invest",
      CONSIDER: "more_dd_needed",
      PASS: "pass",
      STRONG_PASS: "pass",
    };

    const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
    const amount = deal.amountRequested ? Number(deal.amountRequested) : 0;

    return {
      // Executive Summary (ancien format pour compatibilité)
      executiveSummary: {
        oneLiner: data.executiveSummary?.oneLiner ?? `${deal.name} - Investment Memo`,
        recommendation: recommendationMap[data.executiveSummary?.recommendation ?? "CONSIDER"] ?? "more_dd_needed",
        keyPoints: [
          ...(data.executiveSummary?.keyStrengths ?? []).slice(0, 3),
          ...(data.executiveSummary?.keyRisks ?? []).slice(0, 2),
        ],
      },

      // Company Overview
      companyOverview: {
        description: data.companyOverview?.description ?? deal.description ?? "",
        problem: data.companyOverview?.problem ?? "",
        solution: data.companyOverview?.solution ?? "",
        businessModel: data.companyOverview?.businessModel ?? "",
        traction: data.companyOverview?.traction ?? "",
      },

      // Investment Highlights (ajout dbComparable)
      investmentHighlights: Array.isArray(data.investmentHighlights)
        ? data.investmentHighlights.map((h) => ({
            highlight: h.highlight ?? "",
            evidence: h.evidence ?? "",
            // Note: dbComparable et source sont dans la nouvelle structure mais pas dans l'ancien type
          }))
        : [],

      // Key Risks (avec severity maintenant)
      keyRisks: Array.isArray(data.keyRisks)
        ? data.keyRisks.map((r) => ({
            risk: r.risk ?? "",
            mitigation: r.mitigation ?? "",
            residualRisk: (r.residualRisk?.toLowerCase() === "low"
              ? "low"
              : r.residualRisk?.toLowerCase() === "high"
              ? "high"
              : "medium") as "low" | "medium" | "high",
          }))
        : consolidatedRedFlags.slice(0, 10).map((rf) => ({
            risk: rf.title,
            mitigation: "À définir",
            residualRisk: rf.severity === "CRITICAL" ? "high" : rf.severity === "HIGH" ? "medium" : "low" as "low" | "medium" | "high",
          })),

      // Financial Summary
      financialSummary: {
        currentMetrics: data.financialSummary?.currentMetrics ?? {},
        projections: data.financialSummary?.projections?.concerns?.join("; ") ?? "",
        valuationAssessment:
          data.financialSummary?.valuationAssessment?.verdict ??
          `Valorisation: ${data.financialSummary?.valuationAssessment?.percentile ?? "N/A"}`,
      },

      // Team Assessment
      teamAssessment:
        data.teamAssessment?.verdict ??
        `Score équipe: ${data.teamAssessment?.overallScore ?? "N/A"}/100`,

      // Market Opportunity
      marketOpportunity:
        data.marketOpportunity?.verdict ??
        `TAM: ${data.marketOpportunity?.tam ?? "N/A"}, Timing: ${data.marketOpportunity?.timing ?? "N/A"}`,

      // Competitive Landscape
      competitiveLandscape:
        data.competitiveLandscape?.verdict ??
        `${data.competitiveLandscape?.competitors?.length ?? 0} concurrents identifiés`,

      // Deal Terms
      dealTerms: {
        valuation:
          data.dealStructure?.valuation ??
          (valuation > 0 ? `€${valuation.toLocaleString()} pre-money` : "Non spécifié"),
        roundSize:
          data.dealStructure?.roundSize ??
          (amount > 0 ? `€${amount.toLocaleString()}` : "Non spécifié"),
        keyTerms: Array.isArray(data.dealStructure?.keyTerms)
          ? data.dealStructure.keyTerms
          : [],
        negotiationPoints: Array.isArray(data.dealStructure?.negotiationPoints)
          ? data.dealStructure.negotiationPoints
          : data.narrative?.forNegotiation ?? [],
      },

      // Due Diligence Findings
      dueDiligenceFindings: {
        completed: this.extractCompletedDD(data),
        outstanding: this.extractOutstandingDD(data, consolidatedQuestions),
        redFlags: consolidatedRedFlags.slice(0, 10).map(
          (rf) => `[${rf.severity}] ${rf.title} (${rf.source})`
        ),
      },

      // Investment Thesis
      investmentThesis: data.investmentThesis?.thesis ?? "",

      // Exit Strategy
      exitStrategy:
        data.exitStrategy?.primaryPath ??
        `Timeline: ${data.exitStrategy?.timeline ?? "N/A"}, Multiple attendu: ${data.exitStrategy?.expectedMultiple?.median ?? "N/A"}x`,

      // Next Steps (enrichis)
      nextSteps: Array.isArray(data.nextSteps)
        ? data.nextSteps.map((s) => {
            const priority = validPriorities.includes(s.priority) ? s.priority : "BEFORE_TERM_SHEET";
            const owner = validOwners.includes(s.owner) ? s.owner : "INVESTOR";
            return `[${priority}] [${owner}] ${s.action}`;
          })
        : consolidatedQuestions.slice(0, 5).map(
            (q) => `[BEFORE_TERM_SHEET] [FOUNDER] Répondre à: ${q.question.slice(0, 100)}`
          ),

      // Appendix
      appendix: {
        financialModel: data.financialSummary?.projections?.concerns?.join("; "),
        comparableDeals: data.financialSummary?.valuationAssessment?.benchmarkComparables?.join("; "),
        referencesChecked: this.extractReferencesChecked(data),
      },
    };
  }

  private extractCompletedDD(data: LLMMemoResponse): string[] {
    const completed: string[] = [];

    if (data.teamAssessment?.founders?.length) {
      completed.push(`Team investigation (${data.teamAssessment.founders.length} fondateurs analysés)`);
    }
    if (data.financialSummary?.currentMetrics && Object.keys(data.financialSummary.currentMetrics).length > 0) {
      completed.push("Audit financier (métriques extraites)");
    }
    if (data.competitiveLandscape?.competitors?.length) {
      completed.push(`Analyse concurrentielle (${data.competitiveLandscape.competitors.length} concurrents)`);
    }
    if (data.marketOpportunity?.tam) {
      completed.push("Analyse de marché (TAM/SAM/SOM)");
    }

    return completed;
  }

  private extractOutstandingDD(data: LLMMemoResponse, questions: ConsolidatedQuestion[]): string[] {
    const outstanding: string[] = [];

    // Vérifications en attente basées sur les questions critiques
    const criticalQuestions = questions.filter((q) => q.priority === "CRITICAL");
    for (const q of criticalQuestions.slice(0, 5)) {
      outstanding.push(`Vérifier: ${q.question.slice(0, 80)}...`);
    }

    // Ajouter les limitations
    if (data.meta?.limitations) {
      for (const lim of data.meta.limitations.slice(0, 3)) {
        outstanding.push(`Limitation: ${lim}`);
      }
    }

    return outstanding;
  }

  private extractReferencesChecked(data: LLMMemoResponse): string[] {
    const refs: string[] = [];

    if (data.teamAssessment?.founders) {
      for (const f of data.teamAssessment.founders) {
        if (f.verificationStatus === "verified") {
          refs.push(`${f.name} (${f.role}) - vérifié`);
        }
      }
    }

    if (data.financialSummary?.valuationAssessment?.benchmarkComparables) {
      refs.push(
        `Comparables valorisation: ${data.financialSummary.valuationAssessment.benchmarkComparables.length} deals`
      );
    }

    return refs;
  }
}

export const memoGenerator = new MemoGeneratorAgent();
