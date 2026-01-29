import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  GTMAnalystResult,
  GTMAnalystData,
  GTMAnalystFindings,
  GTMChannelAnalysis,
  GTMSalesMotionAnalysis,
  GTMExpansionAnalysis,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";

/**
 * GTM Analyst Agent - REFONTE v2.0
 *
 * Mission: Analyser la stratégie Go-to-Market et l'efficacité commerciale.
 * Un BA veut savoir: "Comment vont-ils acquérir et retenir des clients à grande échelle?"
 *
 * Standard: Big4 + Partner VC
 * - Chaque canal analysé avec métriques et benchmarks
 * - Cross-reference DB obligatoire (patterns concurrents, CAC benchmark)
 * - Minimum 3+ canaux, 3+ red flags si problèmes, 5+ questions
 */

interface LLMGTMAnalystResponse {
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
    channels: {
      id: string;
      channel: string;
      type: "organic" | "paid" | "sales" | "partnership" | "referral" | "viral";
      contribution: {
        revenuePercent?: number;
        customerPercent?: number;
        source: string;
      };
      economics: {
        cac?: number;
        cacCalculation?: string;
        cacPaybackMonths?: number;
        ltv?: number;
        ltvCacRatio?: number;
        benchmarkCac?: {
          sectorMedian: number;
          percentile: number;
          source: string;
        };
      };
      efficiency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
      efficiencyRationale: string;
      scalability: {
        level: "HIGH" | "MEDIUM" | "LOW";
        constraints: string[];
        investmentRequired: string;
      };
      risks: string[];
      verdict: string;
    }[];
    channelSummary: {
      primaryChannel: string;
      channelDiversification: "GOOD" | "MODERATE" | "POOR";
      diversificationRationale: string;
      overallChannelHealth: number;
    };
    salesMotion: {
      type: "PLG" | "SALES_LED" | "HYBRID" | "COMMUNITY_LED" | "UNCLEAR";
      typeEvidence: string;
      appropriateness: {
        verdict: "APPROPRIATE" | "QUESTIONABLE" | "INAPPROPRIATE";
        rationale: string;
        benchmark: string;
      };
      salesCycle: {
        length?: number;
        benchmark?: number;
        assessment: string;
      };
      acv: {
        value?: number;
        benchmark?: number;
        assessment: string;
      };
      winRate?: {
        value: number;
        benchmark?: number;
        assessment: string;
      };
      pipelineCoverage?: {
        value: number;
        target: number;
        assessment: string;
      };
      bottlenecks: {
        bottleneck: string;
        impact: "CRITICAL" | "HIGH" | "MEDIUM";
        recommendation: string;
      }[];
      magicNumber?: {
        value: number;
        interpretation: string;
      };
    };
    expansion: {
      currentGrowthRate: {
        value?: number;
        period: string;
        source: string;
        sustainability: "SUSTAINABLE" | "QUESTIONABLE" | "UNSUSTAINABLE";
        sustainabilityRationale: string;
      };
      expansion: {
        strategy: string;
        markets: {
          market: string;
          status: "current" | "planned" | "potential";
          timeline?: string;
          rationale: string;
        }[];
        risks: string[];
        feasibilityAssessment: string;
      };
      growthLevers: {
        lever: string;
        potential: "HIGH" | "MEDIUM" | "LOW";
        prerequisite: string;
        timeline: string;
      }[];
      scalingConstraints: {
        constraint: string;
        severity: "CRITICAL" | "HIGH" | "MEDIUM";
        mitigation: string;
      }[];
    };
    competitorPatterns: {
      patterns: {
        company: string;
        channel: string;
        success: "HIGH" | "MEDIUM" | "LOW";
        insight: string;
        source: string;
      }[];
      insight: string;
      gapsVsCompetitors: string[];
      advantagesVsCompetitors: string[];
    };
    cacBenchmark: {
      sector: string;
      stage: string;
      p25: number;
      median: number;
      p75: number;
      source: string;
      thisDeal?: {
        cac: number;
        percentile: number;
      };
    };
    unitEconomics: {
      overall: "HEALTHY" | "ACCEPTABLE" | "CONCERNING" | "UNKNOWN";
      rationale: string;
      keyMetrics: {
        metric: string;
        value?: number;
        benchmark?: number;
        assessment: string;
      }[];
    };
    deckClaimsAnalysis: {
      claim: string;
      location: string;
      status: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "NOT_VERIFIABLE";
      evidence: string;
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

export class GTMAnalystAgent extends BaseAgent<GTMAnalystData, GTMAnalystResult> {
  constructor() {
    super({
      name: "gtm-analyst",
      description: "Analyse approfondie de la strategie Go-to-Market",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
    });
  }

  protected buildSystemPrompt(): string {
    return `# GTM ANALYST - Go-to-Market Due Diligence Expert

## 1. PERSONA
Tu es un expert GTM/Growth avec 15 ans d'expérience en scale-ups B2B et B2C.
Tu as été VP Growth chez 3 licornes et advisor GTM pour Sequoia et a]16[z.
Tu analyses les stratégies d'acquisition avec la rigueur d'un Partner VC qui a vu 1000+ deals.

IMPORTANT: Tu travailles pour un Business Angel qui investit SEUL.
- Il n'a pas d'équipe pour vérifier tes analyses
- Chaque affirmation doit être sourcée et vérifiable
- Il a besoin d'éléments ACTIONNABLES pour négocier ou passer

## 2. MISSION
Analyser la stratégie Go-to-Market pour répondre à LA question du BA:
"Comment vont-ils acquérir et retenir des clients à grande échelle de manière rentable?"

Tu dois identifier:
- Les canaux d'acquisition et leur scalabilité
- La motion de vente (PLG, Sales-led, Hybrid) et son adéquation
- Les unit economics (CAC, LTV, payback)
- Les bottlenecks et risques de scaling
- La cohérence avec les pratiques gagnantes du secteur

## 3. METHODOLOGY

### 3.1 Analyse des Canaux d'Acquisition
Pour CHAQUE canal identifié ou mentionné:
1. Identifier le type (organic, paid, sales, partnership, referral, viral)
2. Évaluer la contribution (% revenue, % customers)
3. Calculer/estimer le CAC spécifique au canal
4. Évaluer la scalabilité (contraintes, investissement requis)
5. Identifier les risques spécifiques
6. Cross-référencer avec les patterns des concurrents (via Context Engine)

### 3.2 Analyse de la Motion de Vente
1. Classifier: PLG, Sales-Led, Hybrid, Community-Led, ou Unclear
2. Justifier avec des preuves concrètes du deck
3. Évaluer l'adéquation avec le business model
4. Comparer aux benchmarks du secteur
5. Identifier les bottlenecks

### 3.3 Unit Economics Deep-Dive
- CAC: Coût total d'acquisition (incluant sales, marketing, onboarding)
- LTV: Valeur vie client (avec méthode de calcul)
- LTV/CAC: Ratio (>3x = sain, <2x = alerte)
- CAC Payback: En mois (benchmark: <12 mois seed, <18 mois Series A)
- Magic Number: Pour SaaS (>0.75 = efficient)

### 3.4 Cross-Reference DB Obligatoire
Tu DOIS croiser avec les données du Context Engine:
- Patterns GTM des concurrents (qui utilise quoi, avec quel succès)
- Benchmarks CAC du secteur (P25, Median, P75)
- Tendances de scaling du secteur

## 4. FRAMEWORK D'ÉVALUATION

### 4.1 Modèles GTM de Référence

**PRODUCT-LED GROWTH (PLG)**
- Caractéristiques: Freemium, self-service, viral loops
- CAC attendu: < €100 pour SMB, < €500 pour mid-market
- Exemples succès: Slack, Notion, Figma, Calendly
- Red flag si: Pas de viralité naturelle, onboarding complexe

**SALES-LED GROWTH (SLG)**
- Caractéristiques: AEs, SDRs, solution selling
- ACV attendu: > €10K pour justifier le coût
- Sales cycle: SMB < 30j, Mid-market 60-90j, Enterprise > 90j
- Red flag si: ACV < €10K avec sales-led, cycle trop long

**HYBRID**
- Caractéristiques: PLG pour acquisition, sales pour expansion/enterprise
- Land and expand strategy
- Exemples: Zoom, Datadog, Atlassian
- Red flag si: Confusion entre les deux motions

### 4.2 Benchmarks par Stage

**SEED**
- CAC Payback: < 12 mois acceptable
- LTV/CAC: > 2x minimum
- Growth rate: > 15% MoM
- Magic Number: > 0.5

**SERIES A**
- CAC Payback: < 18 mois
- LTV/CAC: > 3x
- Growth rate: > 10% MoM ou > 100% YoY
- Magic Number: > 0.75

## 5. RED FLAGS GTM (MINIMUM 3 SI PROBLÈMES)

Chaque red flag DOIT avoir:
- id: Identifiant unique
- category: "channel", "motion", "economics", "scalability", "data"
- severity: "CRITICAL" | "HIGH" | "MEDIUM"
- title: Titre court et percutant
- description: 2-3 phrases expliquant le problème
- location: Où tu as trouvé ça ("Slide X", "Deck", "Calcul")
- evidence: Citation EXACTE ou calcul montré
- contextEngineData: Ce que disent les données externes (si applicable)
- impact: Pourquoi c'est un problème pour le BA
- question: Question à poser au fondateur
- redFlagIfBadAnswer: Ce qui aggraverait le red flag

### Red Flags à Détecter:

**CRITICAL (Blocker potentiel)**
- Aucun canal clair identifié
- CAC > 24 mois de revenus
- LTV/CAC < 1x (perte sur chaque client)
- 100% dépendance à paid acquisition sans path to organic
- Motion de vente inadaptée au business model

**HIGH (Investigation requise)**
- CAC Payback > 18 mois
- Un seul canal représente > 80% des clients
- Sales cycle > 2x le benchmark du secteur
- Pas de données de rétention/churn
- Claims GTM contradictoires dans le deck

**MEDIUM (Point d'attention)**
- CAC en augmentation sans explication
- Channel mix non diversifié
- Pas de stratégie d'expansion claire
- Métriques GTM manquantes

## 6. QUESTIONS POUR LE FONDATEUR (MINIMUM 5)

Format obligatoire:
- priority: "CRITICAL" | "HIGH" | "MEDIUM"
- category: "channel", "economics", "motion", "expansion", "data"
- question: Question précise et directe
- context: Pourquoi tu poses cette question
- whatToLookFor: Ce qui révèlerait un problème

Exemples de questions pertinentes:
- "Quel est votre CAC par canal et comment l'avez-vous calculé?"
- "Quelle est votre stratégie si [canal principal] devient moins efficient?"
- "Comment comptez-vous passer de [X] à [10X] clients?"

## 7. SCORING GTM (0-100)

Critères et poids:
- Channel Strategy (25%): Clarté, diversification, scalabilité
- Sales Motion Fit (20%): Adéquation au business model
- Unit Economics (25%): CAC, LTV, payback, magic number
- Growth Potential (15%): Leviers, constraints, sustainability
- Data Quality (15%): Complétude et fiabilité des métriques

Grille de notation:
- A (80-100): GTM best-in-class, unit economics excellents
- B (65-79): GTM solide avec quelques optimisations nécessaires
- C (50-64): GTM acceptable mais risques de scaling
- D (35-49): GTM problématique, investissement risqué
- F (0-34): GTM non viable, red flags majeurs

## 8. FORMAT DE SORTIE

Tu DOIS retourner un JSON avec EXACTEMENT cette structure:
- meta: dataCompleteness, confidenceLevel, limitations
- score: value (0-100), grade (A-F), breakdown avec justifications
- findings: channels[], channelSummary, salesMotion, expansion, competitorPatterns, cacBenchmark, unitEconomics, deckClaimsAnalysis[]
- dbCrossReference: claims[] avec vérification, uncheckedClaims[]
- redFlags: array avec tous les champs requis (minimum 3 si problèmes)
- questions: array (minimum 5)
- alertSignal: hasBlocker, recommendation, justification
- narrative: oneLiner, summary, keyInsights[], forNegotiation[]

## 9. RÈGLES ABSOLUES

1. JAMAIS d'affirmation sans source ou calcul
2. TOUJOURS cross-référencer avec Context Engine quand disponible
3. MINIMUM 3 canaux analysés (ou expliquer pourquoi moins)
4. MINIMUM 3 red flags si la stratégie GTM est problématique
5. MINIMUM 5 questions pertinentes et actionnables
6. CHAQUE red flag avec les 5 composants obligatoires
7. MONTRER les calculs (CAC = Spend/Customers = X/Y = Z)
8. Pas de "environ" ou "peut-être" - des chiffres ou "NON DISPONIBLE"
9. Si données manquantes: l'indiquer clairement ET poser la question

## 10. ANTI-PATTERNS À ÉVITER

❌ "La stratégie GTM semble solide" → ✅ "PLG avec freemium, CAC estimé €50, 3 canaux actifs"
❌ "Le CAC est correct" → ✅ "CAC €800 vs benchmark secteur €600 (P50), soit P65"
❌ "Ils ont de bons canaux" → ✅ "SEO (45% traffic), Outbound (40% revenue), Referral (15%)"
❌ Liste de risques génériques → ✅ Red flags spécifiques avec preuves du deck`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<GTMAnalystData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Préparer les données GTM du deck si disponibles
    let gtmSection = "";
    if (extractedInfo) {
      const gtmData = {
        cac: extractedInfo.cac,
        ltv: extractedInfo.ltv,
        customers: extractedInfo.customers,
        churnRate: extractedInfo.churnRate,
        growthRateYoY: extractedInfo.growthRateYoY,
        arr: extractedInfo.arr,
        mrr: extractedInfo.mrr,
      };
      gtmSection = `\n## Métriques GTM Extraites du Deck\n${JSON.stringify(gtmData, null, 2)}`;
    }

    // Préparer les données concurrentielles pour benchmark
    let competitorSection = "";
    if (context.contextEngine?.competitiveLandscape?.competitors) {
      const competitors = context.contextEngine.competitiveLandscape.competitors.slice(0, 5);
      competitorSection = `\n## Concurrents Identifiés (pour patterns GTM)\n${JSON.stringify(competitors.map(c => ({
        name: c.name,
        funding: c.totalFunding,
        positioning: c.positioning,
      })), null, 2)}`;
    }

    // Préparer les benchmarks sectoriels
    let benchmarkSection = "";
    if (context.contextEngine?.marketData?.benchmarks) {
      const relevantBenchmarks = context.contextEngine.marketData.benchmarks.filter(
        b => ["CAC", "LTV", "LTV/CAC", "Payback", "Magic Number", "Growth Rate"].some(
          metric => b.metricName.toLowerCase().includes(metric.toLowerCase())
        )
      );
      if (relevantBenchmarks.length > 0) {
        benchmarkSection = `\n## Benchmarks Sectoriels (Context Engine)\n${JSON.stringify(relevantBenchmarks, null, 2)}`;
      }
    }

    const prompt = `Analyse la stratégie Go-to-Market de ce deal avec la rigueur d'un Partner VC.

${dealContext}
${gtmSection}
${competitorSection}
${benchmarkSection}
${contextEngineData}
${this.formatFactStoreData(context)}
## INSTRUCTIONS SPÉCIFIQUES

1. **Analyse des Canaux**: Identifie TOUS les canaux mentionnés ou détectables. Pour chacun:
   - Type (organic/paid/sales/partnership/referral/viral)
   - Contribution estimée (% revenue ou % customers)
   - CAC si calculable, sinon estimation avec méthode
   - Scalabilité avec contraintes concrètes

2. **Motion de Vente**: Classifie en PLG/SALES_LED/HYBRID/COMMUNITY_LED/UNCLEAR
   - Justifie avec des PREUVES du deck
   - Compare aux succès du secteur

3. **Unit Economics**: Calcule ou estime:
   - CAC global et par canal si possible
   - LTV (avec méthode de calcul)
   - LTV/CAC ratio
   - CAC Payback en mois
   - Magic Number si applicable (SaaS)

4. **Cross-Reference DB**: Utilise les données Context Engine pour:
   - Identifier les patterns GTM des concurrents
   - Benchmarker le CAC (P25/Median/P75)
   - Valider les claims du deck

5. **Red Flags**: Génère MINIMUM 3 red flags si la stratégie GTM a des problèmes.
   Chaque red flag DOIT avoir: id, category, severity, title, description, location, evidence, impact, question, redFlagIfBadAnswer

6. **Questions**: Génère MINIMUM 5 questions pertinentes et actionnables.

Réponds UNIQUEMENT en JSON valide avec la structure exacte demandée.`;

    const { data } = await this.llmCompleteJSON<LLMGTMAnalystResponse>(prompt);

    // Valider et normaliser les données
    return this.normalizeResponse(data, context);
  }

  private normalizeResponse(
    data: LLMGTMAnalystResponse,
    context: EnrichedAgentContext
  ): GTMAnalystData {
    const now = new Date().toISOString();

    // Normaliser meta
    const meta: AgentMeta = {
      agentName: "gtm-analyst",
      analysisDate: now,
      dataCompleteness: this.normalizeDataCompleteness(data.meta?.dataCompleteness),
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normaliser score
    const score: AgentScore = {
      value: Math.min(100, Math.max(0, data.score?.value ?? 50)),
      grade: this.normalizeGrade(data.score?.grade),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map(b => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 0,
            score: Math.min(100, Math.max(0, b.score ?? 0)),
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normaliser findings
    const findings: GTMAnalystFindings = {
      channels: this.normalizeChannels(data.findings?.channels ?? []),
      channelSummary: {
        primaryChannel: data.findings?.channelSummary?.primaryChannel ?? "Not identified",
        channelDiversification: this.normalizeDiversification(data.findings?.channelSummary?.channelDiversification),
        diversificationRationale: data.findings?.channelSummary?.diversificationRationale ?? "",
        overallChannelHealth: Math.min(100, Math.max(0, data.findings?.channelSummary?.overallChannelHealth ?? 50)),
      },
      salesMotion: this.normalizeSalesMotion(data.findings?.salesMotion),
      expansion: this.normalizeExpansion(data.findings?.expansion),
      competitorPatterns: {
        patterns: Array.isArray(data.findings?.competitorPatterns?.patterns)
          ? data.findings.competitorPatterns.patterns.map(p => ({
              company: p.company ?? "Unknown",
              channel: p.channel ?? "Unknown",
              success: this.normalizeSuccess(p.success),
              insight: p.insight ?? "",
              source: p.source ?? "Unknown",
            }))
          : [],
        insight: data.findings?.competitorPatterns?.insight ?? "No competitor pattern data available",
        gapsVsCompetitors: Array.isArray(data.findings?.competitorPatterns?.gapsVsCompetitors)
          ? data.findings.competitorPatterns.gapsVsCompetitors
          : [],
        advantagesVsCompetitors: Array.isArray(data.findings?.competitorPatterns?.advantagesVsCompetitors)
          ? data.findings.competitorPatterns.advantagesVsCompetitors
          : [],
      },
      cacBenchmark: {
        sector: data.findings?.cacBenchmark?.sector ?? context.deal.sector ?? "Unknown",
        stage: data.findings?.cacBenchmark?.stage ?? context.deal.stage ?? "Seed",
        p25: data.findings?.cacBenchmark?.p25 ?? 0,
        median: data.findings?.cacBenchmark?.median ?? 0,
        p75: data.findings?.cacBenchmark?.p75 ?? 0,
        source: data.findings?.cacBenchmark?.source ?? "No benchmark data",
        thisDeal: data.findings?.cacBenchmark?.thisDeal,
      },
      unitEconomics: {
        overall: this.normalizeUnitEconomicsStatus(data.findings?.unitEconomics?.overall),
        rationale: data.findings?.unitEconomics?.rationale ?? "Insufficient data",
        keyMetrics: Array.isArray(data.findings?.unitEconomics?.keyMetrics)
          ? data.findings.unitEconomics.keyMetrics.map(m => ({
              metric: m.metric ?? "Unknown",
              value: m.value,
              benchmark: m.benchmark,
              assessment: m.assessment ?? "",
            }))
          : [],
      },
      deckClaimsAnalysis: Array.isArray(data.findings?.deckClaimsAnalysis)
        ? data.findings.deckClaimsAnalysis.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "Unknown",
            status: this.normalizeClaimStatus(c.status),
            evidence: c.evidence ?? "",
            investorImplication: c.investorImplication ?? "",
          }))
        : [],
    };

    // Normaliser dbCrossReference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "Unknown",
            dbVerdict: this.normalizeDbVerdict(c.dbVerdict),
            evidence: c.evidence ?? "",
            severity: c.severity,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normaliser red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, index) => ({
          id: rf.id ?? `gtm-rf-${index + 1}`,
          category: rf.category ?? "gtm",
          severity: this.normalizeSeverity(rf.severity),
          title: rf.title ?? "GTM Issue",
          description: rf.description ?? "",
          location: rf.location ?? "Unknown",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normaliser questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map(q => ({
          priority: this.normalizePriority(q.priority),
          category: q.category ?? "gtm",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normaliser alert signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: this.normalizeRecommendation(data.alertSignal?.recommendation),
      justification: data.alertSignal?.justification ?? "Analysis completed",
    };

    // Normaliser narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "GTM analysis completed",
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

  // Helper methods for normalization
  private normalizeDataCompleteness(value?: string): "complete" | "partial" | "minimal" {
    if (value === "complete" || value === "partial" || value === "minimal") return value;
    return "partial";
  }

  private normalizeGrade(value?: string): "A" | "B" | "C" | "D" | "F" {
    if (value === "A" || value === "B" || value === "C" || value === "D" || value === "F") return value;
    return "C";
  }

  private normalizeDiversification(value?: string): "GOOD" | "MODERATE" | "POOR" {
    if (value === "GOOD" || value === "MODERATE" || value === "POOR") return value;
    return "MODERATE";
  }

  private normalizeSuccess(value?: string): "HIGH" | "MEDIUM" | "LOW" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
    return "MEDIUM";
  }

  private normalizeUnitEconomicsStatus(value?: string): "HEALTHY" | "ACCEPTABLE" | "CONCERNING" | "UNKNOWN" {
    if (value === "HEALTHY" || value === "ACCEPTABLE" || value === "CONCERNING" || value === "UNKNOWN") return value;
    return "UNKNOWN";
  }

  private normalizeClaimStatus(value?: string): "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "NOT_VERIFIABLE" {
    if (value === "VERIFIED" || value === "CONTRADICTED" || value === "EXAGGERATED" || value === "NOT_VERIFIABLE") return value;
    return "NOT_VERIFIABLE";
  }

  private normalizeDbVerdict(value?: string): "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE" {
    if (value === "VERIFIED" || value === "CONTRADICTED" || value === "PARTIAL" || value === "NOT_VERIFIABLE") return value;
    return "NOT_VERIFIABLE";
  }

  private normalizeSeverity(value?: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    if (value === "CRITICAL" || value === "HIGH" || value === "MEDIUM") return value;
    return "MEDIUM";
  }

  private normalizePriority(value?: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    if (value === "CRITICAL" || value === "HIGH" || value === "MEDIUM") return value;
    return "MEDIUM";
  }

  private normalizeRecommendation(value?: string): "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP" {
    if (value === "PROCEED" || value === "PROCEED_WITH_CAUTION" || value === "INVESTIGATE_FURTHER" || value === "STOP") return value;
    return "INVESTIGATE_FURTHER";
  }

  private normalizeChannels(channels: LLMGTMAnalystResponse["findings"]["channels"]): GTMChannelAnalysis[] {
    return channels.map((ch, index) => ({
      id: ch.id ?? `channel-${index + 1}`,
      channel: ch.channel ?? "Unknown",
      type: this.normalizeChannelType(ch.type),
      contribution: {
        revenuePercent: ch.contribution?.revenuePercent,
        customerPercent: ch.contribution?.customerPercent,
        source: ch.contribution?.source ?? "Unknown",
      },
      economics: {
        cac: ch.economics?.cac,
        cacCalculation: ch.economics?.cacCalculation,
        cacPaybackMonths: ch.economics?.cacPaybackMonths,
        ltv: ch.economics?.ltv,
        ltvCacRatio: ch.economics?.ltvCacRatio,
        benchmarkCac: ch.economics?.benchmarkCac,
      },
      efficiency: this.normalizeEfficiency(ch.efficiency),
      efficiencyRationale: ch.efficiencyRationale ?? "",
      scalability: {
        level: this.normalizeScalabilityLevel(ch.scalability?.level),
        constraints: Array.isArray(ch.scalability?.constraints) ? ch.scalability.constraints : [],
        investmentRequired: ch.scalability?.investmentRequired ?? "Unknown",
      },
      risks: Array.isArray(ch.risks) ? ch.risks : [],
      verdict: ch.verdict ?? "",
    }));
  }

  private normalizeChannelType(value?: string): "organic" | "paid" | "sales" | "partnership" | "referral" | "viral" {
    const valid = ["organic", "paid", "sales", "partnership", "referral", "viral"];
    return valid.includes(value ?? "") ? (value as "organic" | "paid" | "sales" | "partnership" | "referral" | "viral") : "organic";
  }

  private normalizeEfficiency(value?: string): "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW" || value === "UNKNOWN") return value;
    return "UNKNOWN";
  }

  private normalizeScalabilityLevel(value?: string): "HIGH" | "MEDIUM" | "LOW" {
    if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
    return "MEDIUM";
  }

  private normalizeSalesMotion(motion?: LLMGTMAnalystResponse["findings"]["salesMotion"]): GTMSalesMotionAnalysis {
    return {
      type: this.normalizeMotionType(motion?.type),
      typeEvidence: motion?.typeEvidence ?? "",
      appropriateness: {
        verdict: this.normalizeAppropriatenessVerdict(motion?.appropriateness?.verdict),
        rationale: motion?.appropriateness?.rationale ?? "",
        benchmark: motion?.appropriateness?.benchmark ?? "",
      },
      salesCycle: {
        length: motion?.salesCycle?.length,
        benchmark: motion?.salesCycle?.benchmark,
        assessment: motion?.salesCycle?.assessment ?? "No data",
      },
      acv: {
        value: motion?.acv?.value,
        benchmark: motion?.acv?.benchmark,
        assessment: motion?.acv?.assessment ?? "No data",
      },
      winRate: motion?.winRate,
      pipelineCoverage: motion?.pipelineCoverage,
      bottlenecks: Array.isArray(motion?.bottlenecks)
        ? motion.bottlenecks.map(b => ({
            bottleneck: b.bottleneck ?? "",
            impact: this.normalizeSeverity(b.impact),
            recommendation: b.recommendation ?? "",
          }))
        : [],
      magicNumber: motion?.magicNumber,
    };
  }

  private normalizeMotionType(value?: string): "PLG" | "SALES_LED" | "HYBRID" | "COMMUNITY_LED" | "UNCLEAR" {
    const valid = ["PLG", "SALES_LED", "HYBRID", "COMMUNITY_LED", "UNCLEAR"];
    return valid.includes(value ?? "") ? (value as "PLG" | "SALES_LED" | "HYBRID" | "COMMUNITY_LED" | "UNCLEAR") : "UNCLEAR";
  }

  private normalizeAppropriatenessVerdict(value?: string): "APPROPRIATE" | "QUESTIONABLE" | "INAPPROPRIATE" {
    if (value === "APPROPRIATE" || value === "QUESTIONABLE" || value === "INAPPROPRIATE") return value;
    return "QUESTIONABLE";
  }

  private normalizeExpansion(expansion?: LLMGTMAnalystResponse["findings"]["expansion"]): GTMExpansionAnalysis {
    return {
      currentGrowthRate: {
        value: expansion?.currentGrowthRate?.value,
        period: expansion?.currentGrowthRate?.period ?? "Unknown",
        source: expansion?.currentGrowthRate?.source ?? "Unknown",
        sustainability: this.normalizeSustainability(expansion?.currentGrowthRate?.sustainability),
        sustainabilityRationale: expansion?.currentGrowthRate?.sustainabilityRationale ?? "",
      },
      expansion: {
        strategy: expansion?.expansion?.strategy ?? "Not defined",
        markets: Array.isArray(expansion?.expansion?.markets)
          ? expansion.expansion.markets.map(m => ({
              market: m.market ?? "Unknown",
              status: this.normalizeMarketStatus(m.status),
              timeline: m.timeline,
              rationale: m.rationale ?? "",
            }))
          : [],
        risks: Array.isArray(expansion?.expansion?.risks) ? expansion.expansion.risks : [],
        feasibilityAssessment: expansion?.expansion?.feasibilityAssessment ?? "",
      },
      growthLevers: Array.isArray(expansion?.growthLevers)
        ? expansion.growthLevers.map(l => ({
            lever: l.lever ?? "",
            potential: this.normalizeSuccess(l.potential),
            prerequisite: l.prerequisite ?? "",
            timeline: l.timeline ?? "",
          }))
        : [],
      scalingConstraints: Array.isArray(expansion?.scalingConstraints)
        ? expansion.scalingConstraints.map(c => ({
            constraint: c.constraint ?? "",
            severity: this.normalizeSeverity(c.severity),
            mitigation: c.mitigation ?? "",
          }))
        : [],
    };
  }

  private normalizeSustainability(value?: string): "SUSTAINABLE" | "QUESTIONABLE" | "UNSUSTAINABLE" {
    if (value === "SUSTAINABLE" || value === "QUESTIONABLE" || value === "UNSUSTAINABLE") return value;
    return "QUESTIONABLE";
  }

  private normalizeMarketStatus(value?: string): "current" | "planned" | "potential" {
    if (value === "current" || value === "planned" || value === "potential") return value;
    return "potential";
  }
}

export const gtmAnalyst = new GTMAnalystAgent();
