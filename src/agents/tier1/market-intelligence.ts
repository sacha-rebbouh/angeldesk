import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  MarketIntelResult,
  MarketIntelData,
  MarketIntelFindings,
  MarketClaimValidation,
  MarketCompetitorSignal,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";
import { calculateAgentScore, MARKET_INTELLIGENCE_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";

/**
 * MARKET INTELLIGENCE AGENT - REFONTE v2.0
 *
 * Mission: Valider les claims de marche (TAM/SAM/SOM) et analyser le timing.
 * Persona: Analyste Marche Big4 + Partner VC avec 20+ ans d'experience
 * Standard: Chaque affirmation sourcee, cross-reference DB obligatoire
 *
 * Inputs:
 * - Documents: Pitch deck, business plan
 * - Context Engine: Deal Intelligence, Market Data, Competitive Landscape
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: Market attractiveness (0-100)
 * - Findings: Market size validation, funding trends, timing analysis
 * - Red Flags: Claims exaggeres, timing defavorable, marche en decline
 * - Questions: Pour valider les hypotheses marche
 */

// LLM Response interface
interface LLMMarketIntelResponse {
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
    marketSize: {
      tam: {
        claimed?: number;
        validated?: number;
        source: string;
        year: number;
        methodology: "top_down" | "bottom_up" | "unknown";
        confidence: "high" | "medium" | "low";
      };
      sam: {
        claimed?: number;
        validated?: number;
        source: string;
        calculation: string;
      };
      som: {
        claimed?: number;
        validated?: number;
        source: string;
        calculation: string;
        realisticAssessment: string;
      };
      growthRate: {
        claimed?: number;
        validated?: number;
        cagr: number;
        source: string;
        period: string;
      };
      discrepancyLevel: "NONE" | "MINOR" | "SIGNIFICANT" | "MAJOR";
      overallAssessment: string;
    };
    fundingTrends: {
      sectorName: string;
      period: string;
      totalFunding: { value: number; yoyChange: number };
      dealCount: { value: number; yoyChange: number };
      averageDealSize: { value: number; percentile?: number };
      medianValuation: { value: number; trend: string };
      trend: "HEATING" | "STABLE" | "COOLING" | "FROZEN";
      trendAnalysis: string;
      topDeals: { company: string; amount: number; date: string }[];
    };
    timing: {
      marketMaturity: "emerging" | "growing" | "mature" | "declining";
      adoptionCurve: "innovators" | "early_adopters" | "early_majority" | "late_majority";
      assessment: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE";
      reasoning: string;
      windowRemaining: string;
      competitorActivity: {
        name: string;
        totalFunding: number;
        lastRoundDate?: string;
        lastRoundAmount?: number;
        status: "active" | "acquired" | "shutdown";
        signal: string;
      }[];
    };
    regulatoryLandscape: {
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      keyRegulations: string[];
      upcomingChanges: string[];
      impact: string;
    };
    claimValidations: {
      id: string;
      claimType: "tam" | "sam" | "som" | "growth" | "market_position" | "timing";
      claimedValue: string;
      claimedSource?: string;
      location: string;
      validatedValue?: string;
      validationSource: string;
      status: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "EXAGGERATED" | "NOT_VERIFIABLE";
      discrepancyPercent?: number;
      analysis: string;
      investorImplication: string;
    }[];
  };
  dbCrossReference: {
    claims: {
      claim: string;
      location: string;
      dbVerdict: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE";
      evidence: string;
      severity?: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    uncheckedClaims: string[];
  };
  redFlags: {
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
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
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
    justification: string;
  };
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
}

export class MarketIntelligenceAgent extends BaseAgent<MarketIntelData, MarketIntelResult> {
  constructor() {
    super({
      name: "market-intelligence",
      description: "Valide les claims de marche (TAM/SAM/SOM) et analyse le timing - Standard Big4 + Partner VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 180000, // 3 min (was 2 min - increased to avoid premature termination)
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un ANALYSTE MARCHE SENIOR avec 20+ ans d'experience, combinant:
- La rigueur methodologique d'un consultant Big4 (McKinsey, BCG, Bain)
- L'instinct d'un Partner VC qui a vu 500+ deals et sait detecter les bullshit market claims

Tu as analyse des centaines de marches et sais que:
- 80% des TAM des pitch decks sont gonfles ou mal calcules
- Les fondateurs confondent regulierement TAM et SAM
- "Marche en croissance de 25% par an" sans source = red flag
- Le timing est souvent sous-estime (too early = mort lente)

# MISSION POUR CE DEAL

Valider les claims de marche du deck (TAM/SAM/SOM, croissance, timing) en les confrontant aux donnees reelles du Context Engine et de la Funding Database. Le BA doit savoir: "Le marche est-il aussi gros qu'ils le pretendent? Est-ce le bon moment?"

# METHODOLOGIE D'ANALYSE

## Etape 1: Extraction des Claims Marche
- Identifier TOUS les claims de marche dans le deck (TAM, SAM, SOM, croissance, timing, positionnement)
- Noter la source citee par le fondateur (si presente)
- Noter la slide/page exacte

## Etape 2: Validation TAM/SAM/SOM
Pour chaque metrique:
1. COMPARER avec les donnees Context Engine (si disponibles)
2. VERIFIER la methodologie (top-down vs bottom-up)
3. CALCULER l'ecart entre claim et realite
4. QUALIFIER l'ecart: NONE (<10%), MINOR (10-30%), SIGNIFICANT (30-100%), MAJOR (>100%)

Methodes de validation:
- TOP-DOWN: Rapports marche (Gartner, McKinsey, Statista, Dealroom)
- BOTTOM-UP: # clients potentiels x ACV
- TRIANGULATION: Croiser plusieurs sources

## Etape 3: Analyse des Tendances Funding
Utiliser les donnees Context Engine pour:
- Calculer le YoY change du funding dans le secteur
- Identifier la tendance: HEATING (>+20%), STABLE (-20% a +20%), COOLING (-20% a -50%), FROZEN (<-50%)
- Comparer la deal size demandee vs moyenne du marche

## Etape 4: Evaluation du Timing
- Positionner le marche sur la courbe d'adoption (Innovators → Late Majority)
- Evaluer la maturite (emerging, growing, mature, declining)
- Analyser l'activite des concurrents (levees recentes = marche valide)
- Identifier la fenetre d'opportunite restante

## Etape 5: Cross-Reference DB Obligatoire
- Confronter CHAQUE claim du deck aux donnees DB
- Marquer comme VERIFIED, CONTRADICTED, PARTIAL, ou NOT_VERIFIABLE
- Generer red flags pour les contradictions

# FRAMEWORK D'EVALUATION

| Critere | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Taille marche (TAM/SAM/SOM valides) | 25% | TAM invente, pas de SOM | Claims exageres >2x | Claims legers ecarts | Claims verifies |
| Croissance marche | 20% | Declining (<0%) | Stagnant (0-5%) | Moderate (5-15%) | Strong (>15%) |
| Timing/Maturite | 25% | Too early ou too late | Suboptimal | Bon timing | Optimal window |
| Tendance funding secteur | 15% | Frozen (<-50% YoY) | Cooling | Stable | Heating |
| Risque regulatoire | 15% | Critical (deal-breaker) | High (major risk) | Medium (gerabgle) | Low (favorable) |

# RED FLAGS A DETECTER

1. TAM = "Tous ceux qui utilisent Internet" - Severite: CRITICAL
2. SOM > 5% du SAM sans justification - Severite: HIGH
3. Pas de source pour les chiffres marche - Severite: HIGH
4. Confusion TAM/SAM (tres courant) - Severite: MEDIUM
5. Claim "marche en croissance" sans CAGR specifique - Severite: MEDIUM
6. Marche en decline mais presente comme "en croissance" - Severite: CRITICAL
7. Funding secteur en chute mais pas mentionne - Severite: HIGH
8. Timing "too early" (innovators only) pour un produit mainstream - Severite: HIGH
9. Claim de "leader du marche" sans preuve - Severite: HIGH
10. Ecart >100% entre TAM claim et TAM valide - Severite: CRITICAL

# FORMAT DE SORTIE

Produis un JSON avec la structure exacte specifiee. Rappel:
- Chaque affirmation doit etre sourcee (Context Engine, calcul, ou "non verifiable")
- Chaque red flag doit avoir: severity + evidence + impact + question + redFlagIfBadAnswer
- Le score doit etre decompose avec justification par critere
- Les questions doivent etre actionnables et non-confrontationnelles

# REGLES ABSOLUES

1. JAMAIS inventer de donnees - "Non disponible" si absent
2. TOUJOURS citer la source (Slide X, Context Engine, Calcul: X)
3. TOUJOURS croiser avec le Context Engine quand disponible
4. QUANTIFIER chaque fois que possible (%, montants, dates)
5. Chaque red flag = severity + preuve + impact + question
6. Le BA doit pouvoir agir immediatement sur chaque output

# EXEMPLES

## Exemple de BON output (validation TAM):
"TAM VALIDATION:
├─ Claim deck (Slide 4): 'TAM global de 50B€'
├─ Source citee: 'Gartner 2023'
├─ Verification Context Engine:
│   └─ Gartner 2023 (via Dealroom): TAM = 23B€ pour ce segment
├─ Ecart: +117% (MAJOR)
├─ Analyse: Le fondateur a probablement utilise le TAM d'un marche adjacent plus large
├─ Impact BA: Valorisation potentiellement basee sur un marche surestime
├─ Question: 'Pouvez-vous me montrer le rapport Gartner exact que vous avez utilise?'
└─ Red flag si mauvaise reponse: Manipulation intentionnelle des chiffres"

## Exemple de MAUVAIS output (a eviter):
"Le marche semble interessant avec une croissance attendue.
Le TAM est probablement correct."
→ AUCUNE source, AUCUNE verification, ZERO actionnable`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<MarketIntelData> {
    this._dealStage = context.deal.stage;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Format market data from extracted info
    let marketSection = "";
    if (extractedInfo) {
      const marketData = {
        tam: extractedInfo.tam,
        sam: extractedInfo.sam,
        som: extractedInfo.som,
        targetMarket: extractedInfo.targetMarket,
        markets: extractedInfo.markets,
        sector: extractedInfo.sector,
        competitors: extractedInfo.competitors,
      };
      marketSection = `\n## Donnees Marche Extraites du Deck\n${JSON.stringify(marketData, null, 2)}`;
    }

    // Format funding DB data if available
    let fundingDbSection = "";
    if (context.contextEngine?.dealIntelligence) {
      const di = context.contextEngine.dealIntelligence;
      fundingDbSection = `\n## Donnees Funding Database

### Deals Similaires
${di.similarDeals?.length ?? 0} deals comparables identifies dans la DB.
${di.similarDeals?.slice(0, 10).map(d =>
  `- ${d.companyName} (${d.sector}, ${d.stage}): ${d.fundingAmount ? `€${(d.fundingAmount/1000000).toFixed(1)}M` : 'N/A'} - ${d.fundingDate ?? 'N/A'}`
).join('\n') ?? 'Aucun deal comparable'}

### Contexte Funding
${di.fundingContext ? `
- Periode: ${di.fundingContext.period}
- Tendance: ${di.fundingContext.trend} (${di.fundingContext.trendPercentage > 0 ? '+' : ''}${di.fundingContext.trendPercentage}%)
- Deals sur la periode: ${di.fundingContext.totalDealsInPeriod}
- Valorisation mediane: ${di.fundingContext.medianValuationMultiple}x ARR
- P25: ${di.fundingContext.p25ValuationMultiple}x | P75: ${di.fundingContext.p75ValuationMultiple}x
` : 'Non disponible'}

### Verdict Valorisation DB
${di.verdict ? `**${di.verdict.toUpperCase()}**` : 'Non calcule'}`;
    }

    // =====================================================
    // F19: ESTIMATION BOTTOM-UP INDEPENDANTE
    // =====================================================
    let bottomUpSection = "";

    const avgDealSize = extractedInfo?.avgDealSize as number | undefined
      || extractedInfo?.arpu as number | undefined
      || extractedInfo?.acv as number | undefined;
    const targetCustomerCount = extractedInfo?.targetCustomers as number | undefined;
    const conversionRate = extractedInfo?.conversionRate as number | undefined;
    const tam = extractedInfo?.tam as number | undefined;
    const sam = extractedInfo?.sam as number | undefined;
    const som = extractedInfo?.som as number | undefined;

    bottomUpSection = `\n## ESTIMATION BOTTOM-UP INDEPENDANTE (OBLIGATOIRE)

Tu DOIS produire une estimation bottom-up INDEPENDANTE du deck, en plus de la validation top-down.

### Methodologie bottom-up obligatoire :
1. **Identifier le segment cible** : Quel type de client exactement ? (ex: PME SaaS B2B France 10-50 employes)
2. **Estimer le nombre de clients potentiels** : Utilise les donnees INSEE/Eurostat disponibles
   ${targetCustomerCount ? `- Le deck declare ${targetCustomerCount} clients potentiels. VERIFIE ce chiffre.` : "- Le deck ne donne PAS de nombre de clients potentiels. ESTIME-LE toi-meme."}
3. **Determiner l'ACV (Annual Contract Value)** :
   ${avgDealSize ? `- Le deck declare ACV = ${avgDealSize}EUR. Est-ce coherent avec le marche ?` : "- ACV non declare. ESTIME-LE base sur le positionnement prix."}
4. **Taux de conversion realiste** :
   ${conversionRate ? `- Le deck declare ${conversionRate}% de conversion.` : "- Utilise 1-5% pour early stage (sauf preuve contraire)."}

### FORMULE OBLIGATOIRE :
SAM bottom-up = Clients potentiels x ACV
SOM bottom-up = SAM x Taux de conversion realiste (1-5% pour early stage)

### COMPARAISON OBLIGATOIRE :
${tam ? `- TAM deck: ${tam}EUR` : "- TAM deck: non fourni"}
${sam ? `- SAM deck: ${sam}EUR` : "- SAM deck: non fourni"}
${som ? `- SOM deck: ${som}EUR` : "- SOM deck: non fourni"}

Compare tes estimations bottom-up avec les claims du deck.
Si ecart > 3x sur le SAM ou > 5x sur le SOM → RED FLAG.

### OUTPUT ATTENDU :
Dans findings.marketSize, ajoute pour sam et som :
- "calculation": "FORMULE COMPLETE avec chiffres"
- Un "validated" qui est ton estimation bottom-up (PAS le chiffre du deck)
`;

    const prompt = `# ANALYSE MARKET INTELLIGENCE - ${context.deal.name}

## DOCUMENTS FOURNIS
${dealContext}
${marketSection}
${bottomUpSection}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData}
${fundingDbSection}
${this.formatFactStoreData(context)}

## INSTRUCTIONS SPECIFIQUES

1. Identifier et extraire TOUS les claims de marche du deck (TAM, SAM, SOM, croissance, timing)
2. Pour chaque claim, effectuer une validation rigoureuse avec les donnees Context Engine
3. Calculer les ecarts et qualifier leur severite
4. Analyser les tendances funding du secteur (YoY change, trend)
5. Evaluer le timing marche et la fenetre d'opportunite
6. Cross-referencer CHAQUE claim avec les donnees DB disponibles
7. Generer des red flags pour toute contradiction ou exageration
8. Produire des questions actionnables pour le BA
9. OBLIGATOIRE: Produire une estimation bottom-up independante du SAM/SOM

IMPORTANT:
- Si les donnees Context Engine sont absentes ou limitees, l'indiquer clairement dans les limitations
- Utiliser les deals similaires de la DB pour valider les tendances
- Le score doit refleter la REALITE du marche, pas les claims du fondateur
- L'estimation bottom-up est OBLIGATOIRE, meme si approximative

## OUTPUT ATTENDU

Produis une analyse marche COMPLETE au format JSON specifie.
Standard: Big4 + Partner VC. Chaque affirmation doit etre sourcee ou marquee comme non verifiable.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete" | "partial" | "minimal",
    "confidenceLevel": number (0-100),
    "limitations": ["string - ce qui n'a pas pu etre analyse"]
  },
  "score": {
    "value": number (0-100),
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {
        "criterion": "Taille marche (TAM/SAM/SOM valides)",
        "weight": 25,
        "score": number (0-100),
        "justification": "string - AVEC SOURCES"
      },
      {
        "criterion": "Croissance marche",
        "weight": 20,
        "score": number,
        "justification": "string"
      },
      {
        "criterion": "Timing/Maturite",
        "weight": 25,
        "score": number,
        "justification": "string"
      },
      {
        "criterion": "Tendance funding secteur",
        "weight": 15,
        "score": number,
        "justification": "string"
      },
      {
        "criterion": "Risque regulatoire",
        "weight": 15,
        "score": number,
        "justification": "string"
      }
    ]
  },
  "findings": {
    "marketSize": {
      "tam": {
        "claimed": number ou null,
        "validated": number ou null,
        "source": "string (source de validation)",
        "year": number,
        "methodology": "top_down" | "bottom_up" | "unknown",
        "confidence": "high" | "medium" | "low"
      },
      "sam": {
        "claimed": number ou null,
        "validated": number ou null,
        "source": "string",
        "calculation": "string (montrer le calcul)"
      },
      "som": {
        "claimed": number ou null,
        "validated": number ou null,
        "source": "string",
        "calculation": "string",
        "realisticAssessment": "string (est-ce realiste?)"
      },
      "growthRate": {
        "claimed": number ou null,
        "validated": number ou null,
        "cagr": number,
        "source": "string",
        "period": "string (ex: 2023-2028)"
      },
      "discrepancyLevel": "NONE" | "MINOR" | "SIGNIFICANT" | "MAJOR",
      "overallAssessment": "string (synthese 3-4 phrases)"
    },
    "fundingTrends": {
      "sectorName": "string",
      "period": "string (ex: 2024)",
      "totalFunding": { "value": number, "yoyChange": number (en %) },
      "dealCount": { "value": number, "yoyChange": number },
      "averageDealSize": { "value": number, "percentile": number ou null },
      "medianValuation": { "value": number, "trend": "string" },
      "trend": "HEATING" | "STABLE" | "COOLING" | "FROZEN",
      "trendAnalysis": "string (analyse 2-3 phrases)",
      "topDeals": [{ "company": "string", "amount": number, "date": "string" }]
    },
    "timing": {
      "marketMaturity": "emerging" | "growing" | "mature" | "declining",
      "adoptionCurve": "innovators" | "early_adopters" | "early_majority" | "late_majority",
      "assessment": "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE",
      "reasoning": "string (justification detaillee)",
      "windowRemaining": "string (ex: '18-24 mois avant consolidation')",
      "competitorActivity": [
        {
          "name": "string",
          "totalFunding": number,
          "lastRoundDate": "string" ou null,
          "lastRoundAmount": number ou null,
          "status": "active" | "acquired" | "shutdown",
          "signal": "string (ce que ca dit du marche)"
        }
      ]
    },
    "regulatoryLandscape": {
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "keyRegulations": ["string"],
      "upcomingChanges": ["string"],
      "impact": "string"
    },
    "claimValidations": [
      {
        "id": "claim_1",
        "claimType": "tam" | "sam" | "som" | "growth" | "market_position" | "timing",
        "claimedValue": "string (citation EXACTE du deck)",
        "claimedSource": "string" ou null,
        "location": "Slide X",
        "validatedValue": "string" ou null,
        "validationSource": "string",
        "status": "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "EXAGGERATED" | "NOT_VERIFIABLE",
        "discrepancyPercent": number ou null,
        "analysis": "string (explication detaillee)",
        "investorImplication": "string (impact pour le BA)"
      }
    ]
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "string (claim du deck)",
        "location": "Slide X",
        "dbVerdict": "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE",
        "evidence": "string (donnee DB qui confirme/infirme)",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM" (si CONTRADICTED)
      }
    ],
    "uncheckedClaims": ["string (claims non verifiables avec la DB)"]
  },
  "redFlags": [
    {
      "id": "rf_market_1",
      "category": "market_size" | "growth" | "timing" | "regulatory" | "claims",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM",
      "title": "string (titre court)",
      "description": "string (description detaillee)",
      "location": "Slide X ou Source",
      "evidence": "string (citation ou donnee)",
      "contextEngineData": "string" ou null,
      "impact": "string (pourquoi c'est un probleme pour le BA)",
      "question": "string (question a poser au fondateur)",
      "redFlagIfBadAnswer": "string (ce que ca revelerait)"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM",
      "category": "market_size" | "growth" | "timing" | "competition" | "regulatory",
      "question": "string (question formulee de maniere non-confrontationnelle)",
      "context": "string (pourquoi on pose cette question)",
      "whatToLookFor": "string (ce qui revelerait un probleme)"
    }
  ],
  "alertSignal": {
    "hasBlocker": boolean,
    "blockerReason": "string" ou null,
    "recommendation": "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP",
    "justification": "string"
  },
  "narrative": {
    "oneLiner": "string (resume en 1 phrase)",
    "summary": "string (3-4 phrases)",
    "keyInsights": ["string (3-5 insights majeurs)"],
    "forNegotiation": ["string (arguments pour negocier si on proceed)"]
  }
}
\`\`\`

## OUTPUT CRITIQUE
Réponds UNIQUEMENT avec le JSON valide. Commence par { et termine par }.

STYLE D'ÉCRITURE:
- Champs courts (title, source, location): 5-10 mots
- Champs moyens (description, impact, reasoning): 2-3 phrases, droit au but
- Champs analytiques (analysis, justification, overallAssessment): 3-5 phrases si nécessaire
- ÉVITER: introductions inutiles ("Il est important de noter que..."), répétitions, formules creuses
- INCLURE: chiffres, sources, calculs - c'est le contenu utile

NE PAS limiter le nombre d'éléments: inclure TOUS les claims, red flags et questions pertinents.

CRITIQUE: Tu DOIS terminer le JSON avec TOUTES les accolades fermantes. Ne t'arrête JAMAIS au milieu.`;

    const { data } = await this.llmCompleteJSON<LLMMarketIntelResponse>(prompt);

    // F03: DETERMINISTIC SCORING - Extract market metrics, score in code
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const findings = data.findings;

      if (findings) {
        // TAM validation — compare claimed vs validated
        const tam = findings.marketSize?.tam;
        if (tam?.claimed && tam?.validated) {
          const tamRatio = tam.validated / tam.claimed;
          // Close to 1.0 = validated, <0.5 = major overestimate
          extractedMetrics.push({
            name: "tam_validation", value: Math.min(100, Math.round(tamRatio * 100)),
            unit: "score", source: tam.source, dataReliability: tam.confidence === "high" ? "VERIFIED" : "DECLARED", category: "market",
          });
        }

        // Market CAGR
        if (findings.marketSize?.growthRate?.cagr != null) {
          const cagr = findings.marketSize.growthRate.cagr;
          // Normalize: 0% = 20, 10% = 50, 30%+ = 90
          const cagrScore = Math.min(100, Math.max(0, Math.round(20 + cagr * 2.3)));
          extractedMetrics.push({
            name: "market_cagr", value: cagrScore,
            unit: "score", source: findings.marketSize.growthRate.source, dataReliability: "DECLARED", category: "market",
          });
        }

        // Funding trend
        const trendMap = { HEATING: 90, STABLE: 60, COOLING: 35, FROZEN: 10 };
        if (findings.fundingTrends?.trend) {
          extractedMetrics.push({
            name: "funding_trend", value: trendMap[findings.fundingTrends.trend] ?? 0,
            unit: "score", source: "Funding DB trends", dataReliability: "VERIFIED", category: "market",
          });
        }

        // Discrepancy level — factual (deck claims vs reality)
        const discMap = { NONE: 95, MINOR: 70, SIGNIFICANT: 40, MAJOR: 15 };
        if (findings.marketSize?.discrepancyLevel) {
          extractedMetrics.push({
            name: "discrepancy_level", value: discMap[findings.marketSize.discrepancyLevel] ?? 0,
            unit: "score", source: "Deck vs market data comparison", dataReliability: "DECLARED", category: "market",
          });
        }

        // Timing score from LLM
        const timingMap = { EXCELLENT: 95, GOOD: 75, NEUTRAL: 50, POOR: 25, TERRIBLE: 10 };
        if (findings.timing?.assessment) {
          extractedMetrics.push({
            name: "timing_score", value: timingMap[findings.timing.assessment as keyof typeof timingMap] ?? 0,
            unit: "score", source: "LLM timing analysis", dataReliability: "DECLARED", category: "market",
          });
        }
      }

      if (extractedMetrics.length > 0) {
        const sector = context.deal.sector ?? "general";
        const stage = context.deal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "market-intelligence", extractedMetrics, sector, stage, MARKET_INTELLIGENCE_CRITERIA,
        );
        data.score = { ...data.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[market-intelligence] Deterministic scoring failed, using LLM score:", err);
    }

    // Validate and normalize the response
    const result = this.normalizeResponse(data);

    // F19: Post-processing - Verify bottom-up estimation was produced
    const samCalc = data.findings?.marketSize?.sam?.calculation || "";
    const somCalc = data.findings?.marketSize?.som?.calculation || "";
    const hasBottomUp = samCalc.includes("x") || samCalc.includes("*") || samCalc.includes("×") || somCalc.includes("x") || somCalc.includes("*");

    if (!hasBottomUp) {
      result.meta.limitations = [
        ...(result.meta.limitations || []),
        "Estimation bottom-up non produite. Les TAM/SAM/SOM sont bases uniquement sur les claims du deck (top-down).",
      ];
      result.meta.confidenceLevel = Math.min(result.meta.confidenceLevel, 40);
    }

    return result;
  }

  private normalizeResponse(data: LLMMarketIntelResponse): MarketIntelData {
    // Validate meta
    const validCompleteness = ["complete", "partial", "minimal"];
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[market-intelligence] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "market-intelligence",
      analysisDate: new Date().toISOString(),
      dataCompleteness: validCompleteness.includes(data.meta?.dataCompleteness)
        ? data.meta.dataCompleteness
        : "partial",
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel)),
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Validate score
    const validGrades = ["A", "B", "C", "D", "F"];
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[market-intelligence] LLM did not return score value — using 0`);
    }
    const scoreValue = scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue));
    const score: AgentScore = {
      value: scoreValue,
      grade: scoreIsFallback ? "F" : (validGrades.includes(data.score?.grade)
        ? data.score.grade as "A" | "B" | "C" | "D" | "F"
        : "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map(b => ({
            criterion: b.criterion ?? "",
            weight: b.weight ?? 20,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "Non fourni",
          }))
        : [],
    };

    // Validate findings
    const validMaturities = ["emerging", "growing", "mature", "declining"];
    const validAdoption = ["innovators", "early_adopters", "early_majority", "late_majority"];
    const validTimingAssessment = ["EXCELLENT", "GOOD", "NEUTRAL", "POOR", "TERRIBLE"];
    const validTrends = ["HEATING", "STABLE", "COOLING", "FROZEN"];
    const validDiscrepancy = ["NONE", "MINOR", "SIGNIFICANT", "MAJOR"];
    const validMethodology = ["top_down", "bottom_up", "unknown"];
    const validConfidence = ["high", "medium", "low"];
    const validRiskLevel = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const validClaimStatus = ["VERIFIED", "CONTRADICTED", "PARTIAL", "EXAGGERATED", "NOT_VERIFIABLE"];

    const findings: MarketIntelFindings = {
      marketSize: {
        tam: {
          claimed: data.findings?.marketSize?.tam?.claimed ?? undefined,
          validated: data.findings?.marketSize?.tam?.validated ?? undefined,
          source: data.findings?.marketSize?.tam?.source ?? "Non disponible",
          year: data.findings?.marketSize?.tam?.year ?? new Date().getFullYear(),
          methodology: validMethodology.includes(data.findings?.marketSize?.tam?.methodology ?? "")
            ? data.findings.marketSize.tam.methodology as "top_down" | "bottom_up" | "unknown"
            : "unknown",
          confidence: validConfidence.includes(data.findings?.marketSize?.tam?.confidence ?? "")
            ? data.findings.marketSize.tam.confidence as "high" | "medium" | "low"
            : "low",
        },
        sam: {
          claimed: data.findings?.marketSize?.sam?.claimed ?? undefined,
          validated: data.findings?.marketSize?.sam?.validated ?? undefined,
          source: data.findings?.marketSize?.sam?.source ?? "Non disponible",
          calculation: data.findings?.marketSize?.sam?.calculation ?? "Non fourni",
        },
        som: {
          claimed: data.findings?.marketSize?.som?.claimed ?? undefined,
          validated: data.findings?.marketSize?.som?.validated ?? undefined,
          source: data.findings?.marketSize?.som?.source ?? "Non disponible",
          calculation: data.findings?.marketSize?.som?.calculation ?? "Non fourni",
          realisticAssessment: data.findings?.marketSize?.som?.realisticAssessment ?? "Non evalue",
        },
        growthRate: {
          claimed: data.findings?.marketSize?.growthRate?.claimed ?? undefined,
          validated: data.findings?.marketSize?.growthRate?.validated ?? undefined,
          cagr: data.findings?.marketSize?.growthRate?.cagr ?? 0,
          source: data.findings?.marketSize?.growthRate?.source ?? "Non disponible",
          period: data.findings?.marketSize?.growthRate?.period ?? "Non specifie",
        },
        discrepancyLevel: validDiscrepancy.includes(data.findings?.marketSize?.discrepancyLevel ?? "")
          ? data.findings.marketSize.discrepancyLevel as "NONE" | "MINOR" | "SIGNIFICANT" | "MAJOR"
          : "MINOR",
        overallAssessment: data.findings?.marketSize?.overallAssessment ?? "Donnees insuffisantes pour une evaluation complete.",
      },
      fundingTrends: {
        sectorName: data.findings?.fundingTrends?.sectorName ?? "Non specifie",
        period: data.findings?.fundingTrends?.period ?? new Date().getFullYear().toString(),
        totalFunding: {
          value: data.findings?.fundingTrends?.totalFunding?.value ?? 0,
          yoyChange: data.findings?.fundingTrends?.totalFunding?.yoyChange ?? 0,
        },
        dealCount: {
          value: data.findings?.fundingTrends?.dealCount?.value ?? 0,
          yoyChange: data.findings?.fundingTrends?.dealCount?.yoyChange ?? 0,
        },
        averageDealSize: {
          value: data.findings?.fundingTrends?.averageDealSize?.value ?? 0,
          percentile: data.findings?.fundingTrends?.averageDealSize?.percentile ?? undefined,
        },
        medianValuation: {
          value: data.findings?.fundingTrends?.medianValuation?.value ?? 0,
          trend: data.findings?.fundingTrends?.medianValuation?.trend ?? "Non determine",
        },
        trend: validTrends.includes(data.findings?.fundingTrends?.trend ?? "")
          ? data.findings.fundingTrends.trend as "HEATING" | "STABLE" | "COOLING" | "FROZEN"
          : "STABLE",
        trendAnalysis: data.findings?.fundingTrends?.trendAnalysis ?? "Analyse non disponible.",
        topDeals: Array.isArray(data.findings?.fundingTrends?.topDeals)
          ? data.findings.fundingTrends.topDeals.map(d => ({
              company: d.company ?? "",
              amount: d.amount ?? 0,
              date: d.date ?? "",
            }))
          : [],
      },
      timing: {
        marketMaturity: validMaturities.includes(data.findings?.timing?.marketMaturity ?? "")
          ? data.findings.timing.marketMaturity as "emerging" | "growing" | "mature" | "declining"
          : "growing",
        adoptionCurve: validAdoption.includes(data.findings?.timing?.adoptionCurve ?? "")
          ? data.findings.timing.adoptionCurve as "innovators" | "early_adopters" | "early_majority" | "late_majority"
          : "early_adopters",
        assessment: validTimingAssessment.includes(data.findings?.timing?.assessment ?? "")
          ? data.findings.timing.assessment as "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE"
          : "NEUTRAL",
        reasoning: data.findings?.timing?.reasoning ?? "Non evalue.",
        windowRemaining: data.findings?.timing?.windowRemaining ?? "Non determine",
        competitorActivity: Array.isArray(data.findings?.timing?.competitorActivity)
          ? data.findings.timing.competitorActivity.map((c): MarketCompetitorSignal => ({
              name: c.name ?? "",
              totalFunding: c.totalFunding ?? 0,
              lastRoundDate: c.lastRoundDate ?? undefined,
              lastRoundAmount: c.lastRoundAmount ?? undefined,
              status: ["active", "acquired", "shutdown"].includes(c.status ?? "")
                ? c.status as "active" | "acquired" | "shutdown"
                : "active",
              signal: c.signal ?? "",
            }))
          : [],
      },
      regulatoryLandscape: {
        riskLevel: validRiskLevel.includes(data.findings?.regulatoryLandscape?.riskLevel ?? "")
          ? data.findings.regulatoryLandscape.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
          : "MEDIUM",
        keyRegulations: Array.isArray(data.findings?.regulatoryLandscape?.keyRegulations)
          ? data.findings.regulatoryLandscape.keyRegulations
          : [],
        upcomingChanges: Array.isArray(data.findings?.regulatoryLandscape?.upcomingChanges)
          ? data.findings.regulatoryLandscape.upcomingChanges
          : [],
        impact: data.findings?.regulatoryLandscape?.impact ?? "Non evalue.",
      },
      claimValidations: Array.isArray(data.findings?.claimValidations)
        ? data.findings.claimValidations.map((c): MarketClaimValidation => ({
            id: c.id ?? `claim_${Math.random().toString(36).substr(2, 9)}`,
            claimType: ["tam", "sam", "som", "growth", "market_position", "timing"].includes(c.claimType ?? "")
              ? c.claimType as "tam" | "sam" | "som" | "growth" | "market_position" | "timing"
              : "tam",
            claimedValue: c.claimedValue ?? "",
            claimedSource: c.claimedSource ?? undefined,
            location: c.location ?? "Non specifie",
            validatedValue: c.validatedValue ?? undefined,
            validationSource: c.validationSource ?? "Non verifiable",
            status: validClaimStatus.includes(c.status ?? "")
              ? c.status as "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "EXAGGERATED" | "NOT_VERIFIABLE"
              : "NOT_VERIFIABLE",
            discrepancyPercent: c.discrepancyPercent ?? undefined,
            analysis: c.analysis ?? "Non analyse",
            investorImplication: c.investorImplication ?? "Non determine",
          }))
        : [],
    };

    // Validate dbCrossReference
    const validDbVerdict = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"];
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: validDbVerdict.includes(c.dbVerdict ?? "")
              ? c.dbVerdict as "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE"
              : "NOT_VERIFIABLE",
            evidence: c.evidence ?? "Non disponible",
            severity: ["CRITICAL", "HIGH", "MEDIUM"].includes(c.severity ?? "")
              ? c.severity as "CRITICAL" | "HIGH" | "MEDIUM"
              : undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Validate red flags
    const validSeverity = ["CRITICAL", "HIGH", "MEDIUM"];
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map(rf => ({
          id: rf.id ?? `rf_${Math.random().toString(36).substr(2, 9)}`,
          category: rf.category ?? "market",
          severity: validSeverity.includes(rf.severity ?? "")
            ? rf.severity as "CRITICAL" | "HIGH" | "MEDIUM"
            : "MEDIUM",
          title: rf.title ?? "Red flag detecte",
          description: rf.description ?? "",
          location: rf.location ?? "Non specifie",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData ?? undefined,
          impact: rf.impact ?? "Non determine",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Validate questions
    const validPriority = ["CRITICAL", "HIGH", "MEDIUM"];
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map(q => ({
          priority: validPriority.includes(q.priority ?? "")
            ? q.priority as "CRITICAL" | "HIGH" | "MEDIUM"
            : "MEDIUM",
          category: q.category ?? "market",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Validate alert signal
    const validRecommendation = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"];
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason ?? undefined,
      recommendation: validRecommendation.includes(data.alertSignal?.recommendation ?? "")
        ? data.alertSignal.recommendation as "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP"
        : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "Evaluation incomplete.",
    };

    // Validate narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse marche en cours.",
      summary: data.narrative?.summary ?? "Donnees insuffisantes pour un resume complet.",
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
}

export const marketIntelligence = new MarketIntelligenceAgent();
