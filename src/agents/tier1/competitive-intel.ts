import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  CompetitiveIntelResult,
  CompetitiveIntelData,
  CompetitiveIntelFindings,
  CompetitorAnalysis,
  MoatAnalysis,
  CompetitiveClaim,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";

/**
 * COMPETITIVE INTEL AGENT - REFONTE v2.0
 *
 * Mission: Cartographie COMPLETE du paysage concurrentiel avec cross-reference DB.
 * Standard: Big4 Analyst + Partner VC - Chaque concurrent sourcé, moat justifié.
 *
 * Un BA doit savoir:
 * - Qui sont VRAIMENT les concurrents (pas juste ceux du deck)
 * - Pourquoi cette startup peut gagner (ou pas)
 * - Le moat est-il réel ou c'est du storytelling
 * - Quels red flags concurrentiels le deck cache
 *
 * MINIMUM OUTPUT:
 * - 5+ concurrents analysés (directs, indirects, futurs)
 * - 3+ red flags si problèmes détectés
 * - 5+ questions pour le fondateur
 * - Cross-reference obligatoire deck vs DB
 */

// ============================================================================
// LLM RESPONSE TYPES
// ============================================================================

interface LLMCompetitiveIntelResponse {
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
    competitors: {
      name: string;
      website?: string;
      positioning: string;
      targetCustomer: string;
      overlap: "direct" | "indirect" | "adjacent" | "future_threat";
      overlapExplanation: string;
      funding: {
        total?: number;
        lastRound?: number;
        lastRoundDate?: string;
        stage?: string;
        investors?: string[];
        source: string;
      };
      estimatedRevenue?: { value: number; basis: string };
      strengths: { point: string; evidence: string }[];
      weaknesses: { point: string; evidence: string }[];
      threatLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      threatRationale: string;
      timeToThreat: string;
      differentiationVsUs: {
        ourAdvantage: string;
        theirAdvantage: string;
        verdict: "WE_WIN" | "THEY_WIN" | "PARITY" | "DIFFERENT_SEGMENT";
      };
    }[];
    competitorsMissedInDeck: {
      name: string;
      funding?: number;
      whyRelevant: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    marketStructure: {
      concentration: "fragmented" | "moderate" | "concentrated" | "monopolistic";
      totalPlayers: number;
      topPlayersMarketShare: string;
      entryBarriers: "low" | "medium" | "high";
      entryBarriersExplanation: string;
    };
    moatAnalysis: {
      primaryMoatType: string;
      secondaryMoatTypes: string[];
      moatScoring: {
        moatType: string;
        score: number;
        evidence: string;
        sustainability: "strong" | "moderate" | "weak";
        timeframe: string;
      }[];
      overallMoatStrength: number;
      moatVerdict: "STRONG_MOAT" | "EMERGING_MOAT" | "WEAK_MOAT" | "NO_MOAT";
      moatJustification: string;
      moatRisks: { risk: string; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string }[];
    };
    competitivePositioning: {
      ourPosition: string;
      nearestCompetitor: string;
      differentiationStrength: "strong" | "moderate" | "weak" | "unclear";
      sustainabilityOfPosition: string;
    };
    claimsAnalysis: {
      claim: string;
      location: string;
      claimType: string;
      verificationStatus: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "UNVERIFIABLE";
      verificationEvidence: string;
      sourceUsed: string;
      investorImplication: string;
      severityIfFalse: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    competitiveThreats: {
      threat: string;
      source: string;
      probability: "HIGH" | "MEDIUM" | "LOW";
      timeframe: string;
      potentialImpact: string;
      mitigation: string;
    }[];
    fundingBenchmark: {
      ourFunding: number;
      competitorsFunding: { name: string; funding: number }[];
      percentileVsCompetitors: number;
      verdict: string;
    };
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

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class CompetitiveIntelAgent extends BaseAgent<CompetitiveIntelData, CompetitiveIntelResult> {
  constructor() {
    super({
      name: "competitive-intel",
      description: "Cartographie le paysage concurrentiel et évalue le moat",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000, // 2 min - analyse approfondie
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste concurrentiel SENIOR avec 15 ans d'expérience chez McKinsey et 5 ans comme Partner VC chez Sequoia.

# TA MISSION
Produire une cartographie concurrentielle EXHAUSTIVE qui permet à un Business Angel de comprendre:
1. Qui sont les VRAIS concurrents (pas juste ceux listés dans le deck)
2. Si le moat revendiqué est RÉEL ou du storytelling
3. Les red flags concurrentiels que le deck cache volontairement
4. Si la startup peut VRAIMENT gagner contre la concurrence

# TON PERSONA
Tu combines:
- La RIGUEUR d'un consultant Big4 (chaque affirmation sourcée)
- Le SCEPTICISME d'un Partner VC (tu as vu 1000+ decks, tu détectes le BS)
- L'EXPERIENCE terrain (tu connais les dynamiques concurrentielles réelles)

# TYPES DE CONCURRENTS À IDENTIFIER (MINIMUM 5)

1. DIRECTS: Même problème, même solution, même client
   - Exemples: Notion vs Coda, Slack vs Teams

2. INDIRECTS: Même problème, solution différente
   - Exemples: Zoom vs déplacements physiques

3. ADJACENTS: Solution similaire, client différent (risque d'extension)
   - Exemples: Salesforce SMB → Enterprise

4. FUTURS/GAFAM: Gros acteurs qui pourraient entrer
   - Exemples: AWS qui lance un produit similaire

# ANALYSE DU MOAT - FRAMEWORK

Pour chaque type de moat, score 0-100 avec PREUVES:

| Type | Description | Score si prouvé |
|------|-------------|-----------------|
| Network Effects | Valeur augmente avec users (ex: marketplace) | 85-100 |
| Data Moat | Données propriétaires difficiles à répliquer | 75-95 |
| Brand | Marque reconnue et trusted | 60-85 |
| Switching Costs | Coûteux/compliqué de changer | 55-80 |
| Scale | Économies d'échelle | 45-70 |
| Technology | Tech propriétaire/brevets | 40-70 |
| Regulatory | Licences/agréments | 30-60 |
| None | Pas de moat identifiable | 0-30 |

RÈGLE ABSOLUE: Un moat revendiqué sans PREUVE = NO_MOAT

# CROSS-REFERENCE OBLIGATOIRE

Pour CHAQUE claim concurrentiel du deck:
1. Identifier la citation EXACTE
2. Vérifier dans la Funding DB et Context Engine
3. Verdict: VERIFIED / CONTRADICTED / EXAGGERATED / UNVERIFIABLE
4. Si CONTRADICTED: RED FLAG automatique

EXEMPLES DE CLAIMS À VÉRIFIER:
- "Pas de concurrent direct" → Vérifier dans la DB
- "Leader du marché" → Preuves de market share?
- "Technologie unique" → Brevets? Ou juste du marketing?
- "First mover" → Vérifier dates de création concurrents

# RED FLAGS CONCURRENTIELS (minimum 3 si problèmes)

CRITIQUES (bloquants):
- Concurrent bien financé (>50M€) non mentionné dans le deck
- GAFAM déjà présent ou annoncé sur le segment
- Market share claim non vérifiable
- Moat revendiqué sans aucune preuve

ÉLEVÉS (très préoccupants):
- Concurrent avec 10x plus de funding
- Plusieurs pivots des concurrents vers ce segment
- Commoditisation visible du marché
- Différenciation uniquement sur le prix

MOYENS (à surveiller):
- Concurrents en hypercroissance
- Barrières à l'entrée faibles
- Positionnement trop proche d'un leader

# FORMAT DE SORTIE

Chaque red flag DOIT avoir:
- Sévérité: CRITICAL / HIGH / MEDIUM
- Titre court et percutant
- Description détaillée avec PREUVES
- Location dans le deck
- Impact pour l'investisseur
- Question à poser au fondateur
- Ce qui serait un red flag dans la réponse

# QUESTIONS POUR LE FONDATEUR (minimum 5)

Chaque question doit:
- Être SPÉCIFIQUE (pas de question générique)
- Avoir un CONTEXTE (pourquoi on pose cette question)
- Indiquer ce qu'on cherche dans la réponse
- Permettre de détecter du BS si mauvaise réponse

Exemples:
❌ "Comment vous différenciez-vous?" (trop vague)
✅ "Competitor X a levé 50M€ en 2023 et cible le même segment. Qu'est-ce qui empêche un client de choisir leur solution plutôt que la vôtre?" (spécifique, factuel)

# RÈGLES ABSOLUES

1. JAMAIS de données inventées - "Non disponible" si pas d'info
2. Chaque concurrent doit avoir au moins 2 sources
3. Le moat doit être PROUVÉ, pas juste revendiqué
4. Les claims du deck doivent être VÉRIFIÉS vs la réalité
5. Un deck qui dit "pas de concurrent" est un RED FLAG majeur
6. Minimum 5 concurrents analysés (sinon marché trop niche = autre red flag)

# OUTPUT

Réponds UNIQUEMENT en JSON valide, pas de texte avant ou après.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<CompetitiveIntelData> {
    // Build comprehensive context
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Extract competitors mentioned in deck
    let competitorsSection = "";
    if (extractedInfo?.competitors && Array.isArray(extractedInfo.competitors)) {
      competitorsSection = `
## CONCURRENTS MENTIONNÉS DANS LE DECK
${JSON.stringify(extractedInfo.competitors, null, 2)}

ATTENTION: Tu dois vérifier si cette liste est COMPLETE.
Des concurrents majeurs non mentionnés = RED FLAG CRITIQUE.`;
    } else {
      competitorsSection = `
## CONCURRENTS MENTIONNÉS DANS LE DECK
Aucun concurrent mentionné explicitement.

ATTENTION: C'est un RED FLAG potentiel. "Pas de concurrents" n'existe JAMAIS.
Tu dois identifier les concurrents via le Context Engine et la Funding DB.`;
    }

    // Extract competitive advantage claims
    let advantageSection = "";
    if (extractedInfo?.competitiveAdvantage) {
      advantageSection = `
## AVANTAGE COMPÉTITIF REVENDIQUÉ DANS LE DECK
"${extractedInfo.competitiveAdvantage}"

Tu dois VÉRIFIER si cet avantage est:
1. RÉEL (preuves tangibles)
2. DURABLE (moat défendable)
3. UNIQUE (pas facilement copiable)`;
    }

    // Extract key differentiators
    let differentiatorsSection = "";
    if (extractedInfo?.keyDifferentiators && Array.isArray(extractedInfo.keyDifferentiators)) {
      differentiatorsSection = `
## DIFFÉRENCIATEURS CLÉS REVENDIQUÉS
${extractedInfo.keyDifferentiators.map((d: string) => `- ${d}`).join("\n")}

Vérifie chaque différenciateur: est-il VRAI et DURABLE?`;
    }

    // Get funding info for benchmark
    const amountRaising = extractedInfo?.amountRaising as number | undefined;
    const fundingSection = amountRaising
      ? `\n## LEVÉE EN COURS\nMontant: €${amountRaising.toLocaleString()}\nCompare ce montant aux concurrents pour évaluer la position.`
      : "";

    // Build the comprehensive prompt
    const prompt = `ANALYSE CONCURRENTIELLE APPROFONDIE

${dealContext}
${competitorsSection}
${advantageSection}
${differentiatorsSection}
${fundingSection}
${contextEngineData}

# TA MISSION

1. IDENTIFIER tous les concurrents (minimum 5):
   - Utilise le Context Engine (paysage concurrentiel fourni)
   - Cherche les concurrents NON MENTIONNÉS dans le deck
   - Classe par niveau de menace

2. VÉRIFIER chaque claim concurrentiel du deck:
   - Cross-reference avec la DB et Context Engine
   - Verdict: VERIFIED / CONTRADICTED / EXAGGERATED / UNVERIFIABLE

3. ANALYSER le moat:
   - Quel type de moat?
   - Est-il PROUVÉ ou juste revendiqué?
   - Score de solidité 0-100

4. DÉTECTER les red flags:
   - Concurrents cachés
   - Moat inexistant ou faible
   - Position concurrentielle fragile
   - Claims exagérés ou faux

5. GÉNÉRER les questions:
   - Questions spécifiques sur la concurrence
   - Questions pour valider le moat
   - Questions pour comprendre le win rate

# SCORING DU POSITIONNEMENT CONCURRENTIEL

Score global 0-100 basé sur:
- Position vs concurrents (40%)
- Solidité du moat (30%)
- Barrières à l'entrée (15%)
- Honnêteté du deck sur la concurrence (15%)

Réponds en JSON avec EXACTEMENT cette structure:
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
      {
        "criterion": "string",
        "weight": 0-100,
        "score": 0-100,
        "justification": "string"
      }
    ]
  },
  "findings": {
    "competitors": [
      {
        "name": "string",
        "website": "string|null",
        "positioning": "string",
        "targetCustomer": "string",
        "overlap": "direct|indirect|adjacent|future_threat",
        "overlapExplanation": "string",
        "funding": {
          "total": number|null,
          "lastRound": number|null,
          "lastRoundDate": "string|null",
          "stage": "string|null",
          "investors": ["string"],
          "source": "Funding DB|Context Engine|News|Unknown"
        },
        "estimatedRevenue": {"value": number, "basis": "string"} | null,
        "strengths": [{"point": "string", "evidence": "string"}],
        "weaknesses": [{"point": "string", "evidence": "string"}],
        "threatLevel": "CRITICAL|HIGH|MEDIUM|LOW",
        "threatRationale": "string",
        "timeToThreat": "string",
        "differentiationVsUs": {
          "ourAdvantage": "string",
          "theirAdvantage": "string",
          "verdict": "WE_WIN|THEY_WIN|PARITY|DIFFERENT_SEGMENT"
        }
      }
    ],
    "competitorsMissedInDeck": [
      {
        "name": "string",
        "funding": number|null,
        "whyRelevant": "string",
        "severity": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "marketStructure": {
      "concentration": "fragmented|moderate|concentrated|monopolistic",
      "totalPlayers": number,
      "topPlayersMarketShare": "string",
      "entryBarriers": "low|medium|high",
      "entryBarriersExplanation": "string"
    },
    "moatAnalysis": {
      "primaryMoatType": "network_effects|data_moat|brand|switching_costs|scale|technology|regulatory|none",
      "secondaryMoatTypes": ["string"],
      "moatScoring": [
        {
          "moatType": "string",
          "score": 0-100,
          "evidence": "string",
          "sustainability": "strong|moderate|weak",
          "timeframe": "string"
        }
      ],
      "overallMoatStrength": 0-100,
      "moatVerdict": "STRONG_MOAT|EMERGING_MOAT|WEAK_MOAT|NO_MOAT",
      "moatJustification": "string (3-4 phrases)",
      "moatRisks": [{"risk": "string", "probability": "HIGH|MEDIUM|LOW", "impact": "string"}]
    },
    "competitivePositioning": {
      "ourPosition": "string",
      "nearestCompetitor": "string",
      "differentiationStrength": "strong|moderate|weak|unclear",
      "sustainabilityOfPosition": "string"
    },
    "claimsAnalysis": [
      {
        "claim": "string (citation exacte)",
        "location": "Slide X",
        "claimType": "no_competition|market_leader|unique_tech|first_mover|better_product|cheaper|other",
        "verificationStatus": "VERIFIED|CONTRADICTED|EXAGGERATED|UNVERIFIABLE",
        "verificationEvidence": "string",
        "sourceUsed": "string",
        "investorImplication": "string",
        "severityIfFalse": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "competitiveThreats": [
      {
        "threat": "string",
        "source": "string",
        "probability": "HIGH|MEDIUM|LOW",
        "timeframe": "string",
        "potentialImpact": "string",
        "mitigation": "string"
      }
    ],
    "fundingBenchmark": {
      "ourFunding": number,
      "competitorsFunding": [{"name": "string", "funding": number}],
      "percentileVsCompetitors": 0-100,
      "verdict": "string"
    }
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "string",
        "location": "string",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "string",
        "severity": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "uncheckedClaims": ["string"]
  },
  "redFlags": [
    {
      "category": "competition|moat|positioning|transparency",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "string (court et percutant)",
      "description": "string (détaillé avec preuves)",
      "location": "Slide X ou Section Y",
      "evidence": "string (citation ou donnée)",
      "contextEngineData": "string|null",
      "impact": "string (pourquoi c'est un problème pour le BA)",
      "question": "string (question à poser au fondateur)",
      "redFlagIfBadAnswer": "string"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "competition|moat|positioning|strategy",
      "question": "string (question spécifique)",
      "context": "string (pourquoi on pose cette question)",
      "whatToLookFor": "string (ce qui révèlerait un problème)"
    }
  ],
  "alertSignal": {
    "hasBlocker": boolean,
    "blockerReason": "string|null",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "string"
  },
  "narrative": {
    "oneLiner": "string (résumé en 1 phrase)",
    "summary": "string (3-4 phrases)",
    "keyInsights": ["string (3-5 insights majeurs)"],
    "forNegotiation": ["string (arguments pour négocier si on proceed)"]
  }
}
\`\`\`

RAPPELS:
- Minimum 5 concurrents analysés
- Minimum 3 red flags si problèmes détectés
- Minimum 5 questions pour le fondateur
- Chaque claim vérifié vs DB/Context Engine
- Moat PROUVÉ, pas juste revendiqué`;

    // Call LLM
    const { data } = await this.llmCompleteJSON<LLMCompetitiveIntelResponse>(prompt);

    // Transform and validate response
    return this.transformResponse(data, amountRaising);
  }

  private transformResponse(
    data: LLMCompetitiveIntelResponse,
    amountRaising?: number
  ): CompetitiveIntelData {
    // Validate and normalize competitors
    const competitors: CompetitorAnalysis[] = (data.findings?.competitors ?? []).map((c, idx) => ({
      id: `competitor-${idx + 1}`,
      name: c.name ?? "Unknown",
      website: c.website,
      positioning: c.positioning ?? "",
      targetCustomer: c.targetCustomer ?? "",
      overlap: this.validateOverlap(c.overlap),
      overlapExplanation: c.overlapExplanation ?? "",
      funding: {
        total: c.funding?.total,
        lastRound: c.funding?.lastRound,
        lastRoundDate: c.funding?.lastRoundDate,
        stage: c.funding?.stage,
        investors: c.funding?.investors ?? [],
        source: c.funding?.source ?? "Unknown",
      },
      estimatedRevenue: c.estimatedRevenue,
      strengths: c.strengths ?? [],
      weaknesses: c.weaknesses ?? [],
      threatLevel: this.validateThreatLevel(c.threatLevel),
      threatRationale: c.threatRationale ?? "",
      timeToThreat: c.timeToThreat ?? "Unknown",
      differentiationVsUs: {
        ourAdvantage: c.differentiationVsUs?.ourAdvantage ?? "",
        theirAdvantage: c.differentiationVsUs?.theirAdvantage ?? "",
        verdict: this.validateDiffVerdict(c.differentiationVsUs?.verdict),
      },
    }));

    // Validate moat analysis
    const moatAnalysis: MoatAnalysis = {
      primaryMoatType: this.validateMoatType(data.findings?.moatAnalysis?.primaryMoatType),
      secondaryMoatTypes: data.findings?.moatAnalysis?.secondaryMoatTypes ?? [],
      moatScoring: (data.findings?.moatAnalysis?.moatScoring ?? []).map(m => ({
        moatType: m.moatType ?? "",
        score: Math.min(100, Math.max(0, m.score ?? 0)),
        evidence: m.evidence ?? "",
        sustainability: this.validateSustainability(m.sustainability),
        timeframe: m.timeframe ?? "",
      })),
      overallMoatStrength: Math.min(100, Math.max(0, data.findings?.moatAnalysis?.overallMoatStrength ?? 30)),
      moatVerdict: this.validateMoatVerdict(data.findings?.moatAnalysis?.moatVerdict),
      moatJustification: data.findings?.moatAnalysis?.moatJustification ?? "",
      moatRisks: data.findings?.moatAnalysis?.moatRisks ?? [],
    };

    // Validate claims analysis
    const claimsAnalysis: CompetitiveClaim[] = (data.findings?.claimsAnalysis ?? []).map((c, idx) => ({
      id: `claim-${idx + 1}`,
      claim: c.claim ?? "",
      location: c.location ?? "",
      claimType: c.claimType as CompetitiveClaim["claimType"] ?? "other",
      verificationStatus: this.validateVerificationStatus(c.verificationStatus),
      verificationEvidence: c.verificationEvidence ?? "",
      sourceUsed: c.sourceUsed ?? "",
      investorImplication: c.investorImplication ?? "",
      severityIfFalse: this.validateSeverity(c.severityIfFalse),
    }));

    // Build findings
    const findings: CompetitiveIntelFindings = {
      competitors,
      competitorsMissedInDeck: (data.findings?.competitorsMissedInDeck ?? []).map(c => ({
        name: c.name ?? "",
        funding: c.funding,
        whyRelevant: c.whyRelevant ?? "",
        severity: this.validateSeverity(c.severity),
      })),
      marketStructure: {
        concentration: this.validateConcentration(data.findings?.marketStructure?.concentration),
        totalPlayers: data.findings?.marketStructure?.totalPlayers ?? 0,
        topPlayersMarketShare: data.findings?.marketStructure?.topPlayersMarketShare ?? "",
        entryBarriers: this.validateBarriers(data.findings?.marketStructure?.entryBarriers),
        entryBarriersExplanation: data.findings?.marketStructure?.entryBarriersExplanation ?? "",
      },
      moatAnalysis,
      competitivePositioning: {
        ourPosition: data.findings?.competitivePositioning?.ourPosition ?? "",
        nearestCompetitor: data.findings?.competitivePositioning?.nearestCompetitor ?? "",
        differentiationStrength: this.validateDiffStrength(data.findings?.competitivePositioning?.differentiationStrength),
        sustainabilityOfPosition: data.findings?.competitivePositioning?.sustainabilityOfPosition ?? "",
      },
      claimsAnalysis,
      competitiveThreats: data.findings?.competitiveThreats ?? [],
      fundingBenchmark: {
        ourFunding: amountRaising ?? data.findings?.fundingBenchmark?.ourFunding ?? 0,
        competitorsFunding: data.findings?.fundingBenchmark?.competitorsFunding ?? [],
        percentileVsCompetitors: data.findings?.fundingBenchmark?.percentileVsCompetitors ?? 50,
        verdict: data.findings?.fundingBenchmark?.verdict ?? "",
      },
    };

    // Build meta
    const meta: AgentMeta = {
      agentName: "competitive-intel",
      analysisDate: new Date().toISOString(),
      dataCompleteness: data.meta?.dataCompleteness ?? "partial",
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: data.meta?.limitations ?? [],
    };

    // Build score
    const score: AgentScore = {
      value: Math.min(100, Math.max(0, data.score?.value ?? 50)),
      grade: this.validateGrade(data.score?.grade),
      breakdown: (data.score?.breakdown ?? []).map(b => ({
        criterion: b.criterion ?? "",
        weight: b.weight ?? 0,
        score: Math.min(100, Math.max(0, b.score ?? 0)),
        justification: b.justification ?? "",
      })),
    };

    // Build red flags
    const redFlags: AgentRedFlag[] = (data.redFlags ?? []).map((rf, idx) => ({
      id: `rf-comp-${idx + 1}`,
      category: rf.category ?? "competition",
      severity: this.validateSeverity(rf.severity),
      title: rf.title ?? "",
      description: rf.description ?? "",
      location: rf.location ?? "",
      evidence: rf.evidence ?? "",
      contextEngineData: rf.contextEngineData,
      impact: rf.impact ?? "",
      question: rf.question ?? "",
      redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
    }));

    // Build questions
    const questions: AgentQuestion[] = (data.questions ?? []).map(q => ({
      priority: this.validatePriority(q.priority),
      category: q.category ?? "competition",
      question: q.question ?? "",
      context: q.context ?? "",
      whatToLookFor: q.whatToLookFor ?? "",
    }));

    // Build DB cross-reference
    const dbCrossReference: DbCrossReference = {
      claims: (data.dbCrossReference?.claims ?? []).map(c => ({
        claim: c.claim ?? "",
        location: c.location ?? "",
        dbVerdict: this.validateDbVerdict(c.dbVerdict),
        evidence: c.evidence ?? "",
        severity: c.severity,
      })),
      uncheckedClaims: data.dbCrossReference?.uncheckedClaims ?? [],
    };

    // Build alert signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: this.validateRecommendation(data.alertSignal?.recommendation),
      justification: data.alertSignal?.justification ?? "",
    };

    // Build narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "",
      summary: data.narrative?.summary ?? "",
      keyInsights: data.narrative?.keyInsights ?? [],
      forNegotiation: data.narrative?.forNegotiation ?? [],
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

  // ============================================================================
  // VALIDATION HELPERS
  // ============================================================================

  private validateOverlap(value: string | undefined): CompetitorAnalysis["overlap"] {
    const valid = ["direct", "indirect", "adjacent", "future_threat"];
    return valid.includes(value ?? "") ? value as CompetitorAnalysis["overlap"] : "indirect";
  }

  private validateThreatLevel(value: string | undefined): CompetitorAnalysis["threatLevel"] {
    const valid = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    return valid.includes(value ?? "") ? value as CompetitorAnalysis["threatLevel"] : "MEDIUM";
  }

  private validateDiffVerdict(value: string | undefined): "WE_WIN" | "THEY_WIN" | "PARITY" | "DIFFERENT_SEGMENT" {
    const valid = ["WE_WIN", "THEY_WIN", "PARITY", "DIFFERENT_SEGMENT"];
    return valid.includes(value ?? "") ? value as "WE_WIN" | "THEY_WIN" | "PARITY" | "DIFFERENT_SEGMENT" : "PARITY";
  }

  private validateMoatType(value: string | undefined): MoatAnalysis["primaryMoatType"] {
    const valid = ["network_effects", "data_moat", "brand", "switching_costs", "scale", "technology", "regulatory", "none"];
    return valid.includes(value ?? "") ? value as MoatAnalysis["primaryMoatType"] : "none";
  }

  private validateSustainability(value: string | undefined): "strong" | "moderate" | "weak" {
    const valid = ["strong", "moderate", "weak"];
    return valid.includes(value ?? "") ? value as "strong" | "moderate" | "weak" : "moderate";
  }

  private validateMoatVerdict(value: string | undefined): MoatAnalysis["moatVerdict"] {
    const valid = ["STRONG_MOAT", "EMERGING_MOAT", "WEAK_MOAT", "NO_MOAT"];
    return valid.includes(value ?? "") ? value as MoatAnalysis["moatVerdict"] : "NO_MOAT";
  }

  private validateVerificationStatus(value: string | undefined): CompetitiveClaim["verificationStatus"] {
    const valid = ["VERIFIED", "CONTRADICTED", "EXAGGERATED", "UNVERIFIABLE"];
    return valid.includes(value ?? "") ? value as CompetitiveClaim["verificationStatus"] : "UNVERIFIABLE";
  }

  private validateSeverity(value: string | undefined): "CRITICAL" | "HIGH" | "MEDIUM" {
    const valid = ["CRITICAL", "HIGH", "MEDIUM"];
    return valid.includes(value ?? "") ? value as "CRITICAL" | "HIGH" | "MEDIUM" : "MEDIUM";
  }

  private validateConcentration(value: string | undefined): CompetitiveIntelFindings["marketStructure"]["concentration"] {
    const valid = ["fragmented", "moderate", "concentrated", "monopolistic"];
    return valid.includes(value ?? "") ? value as CompetitiveIntelFindings["marketStructure"]["concentration"] : "moderate";
  }

  private validateBarriers(value: string | undefined): "low" | "medium" | "high" {
    const valid = ["low", "medium", "high"];
    return valid.includes(value ?? "") ? value as "low" | "medium" | "high" : "medium";
  }

  private validateDiffStrength(value: string | undefined): "strong" | "moderate" | "weak" | "unclear" {
    const valid = ["strong", "moderate", "weak", "unclear"];
    return valid.includes(value ?? "") ? value as "strong" | "moderate" | "weak" | "unclear" : "unclear";
  }

  private validateGrade(value: string | undefined): AgentScore["grade"] {
    const valid = ["A", "B", "C", "D", "F"];
    return valid.includes(value ?? "") ? value as AgentScore["grade"] : "C";
  }

  private validatePriority(value: string | undefined): AgentQuestion["priority"] {
    const valid = ["CRITICAL", "HIGH", "MEDIUM"];
    return valid.includes(value ?? "") ? value as AgentQuestion["priority"] : "MEDIUM";
  }

  private validateDbVerdict(value: string | undefined): DbCrossReference["claims"][0]["dbVerdict"] {
    const valid = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"];
    return valid.includes(value ?? "") ? value as DbCrossReference["claims"][0]["dbVerdict"] : "NOT_VERIFIABLE";
  }

  private validateRecommendation(value: string | undefined): AgentAlertSignal["recommendation"] {
    const valid = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"];
    return valid.includes(value ?? "") ? value as AgentAlertSignal["recommendation"] : "INVESTIGATE_FURTHER";
  }
}

export const competitiveIntel = new CompetitiveIntelAgent();
