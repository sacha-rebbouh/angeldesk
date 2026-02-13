import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  CustomerIntelResult,
  CustomerIntelData,
  CustomerIntelFindings,
  CustomerAnalysis,
  CustomerClaimValidation,
  RetentionAnalysis,
  PMFAnalysis,
  ConcentrationAnalysis,
  ExpansionAnalysis,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";
import { getBenchmark } from "@/services/benchmarks";
import { calculateAgentScore, CUSTOMER_INTEL_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";

/**
 * Customer Intel Agent - REFONTE v2.0
 *
 * Mission: Analyse APPROFONDIE de la base clients et signaux de Product-Market Fit
 * Standard: Big4 + Partner VC - Chaque affirmation sourcée, métriques benchmarkées
 *
 * Minimum requis:
 * - 5+ clients analysés en détail
 * - 3+ claims du deck vérifiés
 * - 3+ red flags si problèmes détectés
 * - 5+ questions pour le fondateur
 * - Benchmark vs deals similaires (si Context Engine disponible)
 */

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMCustomerIntelResponse {
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
    icp: {
      description: string;
      segments: string[];
      verticals: string[];
      companySize: string;
      buyerPersona: string;
      icpClarity: "CLEAR" | "PARTIAL" | "UNCLEAR";
    };

    customerBase: {
      totalCustomers?: number;
      payingCustomers?: number;
      activeUsers?: number;
      customerQuality: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
      qualityJustification: string;
      notableCustomers: {
        id: string;
        name: string;
        type: "enterprise" | "mid_market" | "smb" | "startup" | "unknown";
        verified: boolean;
        verificationSource?: string;
        relationship: {
          status: "active" | "pilot" | "churned" | "prospect" | "unknown";
          since?: string;
          contractType?: string;
          dealSize?: string;
          revenueContribution?: number;
        };
        satisfaction: {
          isReference: boolean;
          hasTestimonial: boolean;
          hasExpanded: boolean;
          hasReferred: boolean;
          publicEndorsement?: string;
        };
        risks: string[];
      }[];
      customersMissedInDeck: string[];
    };

    claimsValidation: {
      id: string;
      claim: string;
      location: string;
      claimType: string;
      status: "VERIFIED" | "UNVERIFIED" | "EXAGGERATED" | "MISLEADING";
      evidence: string;
      investorImplication: string;
    }[];

    retention: {
      nrr: {
        reported?: number;
        source: string;
        benchmarkP25: number;
        benchmarkMedian: number;
        benchmarkP75: number;
        percentile?: number;
        verdict: string;
        calculation?: string;
      };
      grossRetention: {
        reported?: number;
        churnRate?: number;
        source: string;
        benchmarkMedian: number;
        verdict: string;
      };
      cohortTrends: {
        trend: string;
        evidence: string;
        concern?: string;
      };
      dataQuality: {
        timespan: string;
        cohortCount: string;
        reliability: string;
        limitations: string[];
      };
    };

    pmf: {
      pmfScore: number;
      pmfVerdict: "STRONG" | "EMERGING" | "WEAK" | "NOT_DEMONSTRATED";
      pmfJustification: string;
      positiveSignals: {
        signal: string;
        evidence: string;
        source: string;
        strength: string;
      }[];
      negativeSignals: {
        signal: string;
        evidence: string;
        source: string;
        severity: string;
      }[];
      pmfTests: {
        test: string;
        result: string;
        evidence: string;
      }[];
    };

    concentration: {
      topCustomerRevenue: number;
      top3CustomersRevenue: number;
      top10CustomersRevenue: number;
      concentrationLevel: string;
      concentrationRationale: string;
      atRiskRevenue: {
        customerId: string;
        customerName: string;
        revenueAtRisk: number;
        riskReason: string;
        probability: string;
      }[];
      diversificationTrend: string;
      trendEvidence: string;
    };

    expansion: {
      upsell: {
        potential: string;
        mechanisms: string[];
        evidence: string;
        blockers: string[];
      };
      crossSell: {
        potential: string;
        opportunities: string[];
        evidence: string;
      };
      virality: {
        coefficient?: number;
        mechanism: string;
        evidence: string;
        verdict: string;
      };
      landAndExpand: {
        strategy: string;
        successRate?: number;
        averageExpansion?: number;
        evidence: string;
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

// ============================================================================
// AGENT CLASS
// ============================================================================

export class CustomerIntelAgent extends BaseAgent<CustomerIntelData, CustomerIntelResult> {
  constructor() {
    super({
      name: "customer-intel",
      description: "Analyse approfondie base clients et signaux PMF - Standard Big4 + Partner VC",
      modelComplexity: "critical",
      maxRetries: 2,
      timeoutMs: 180000, // 3 min
    });
  }

  // ============================================================================
  // SYSTEM PROMPT - Big4 + Partner VC Standard
  // ============================================================================

  protected buildSystemPrompt(): string {
    return `Tu es un CUSTOMER INTELLIGENCE ANALYST de niveau senior dans un cabinet Big4 ET un Partner VC expérimenté spécialisé dans l'évaluation du Product-Market Fit.

## TA MISSION

Analyser la base clients de cette startup avec la rigueur d'un audit et l'œil d'un investisseur. Tu dois répondre à LA question fondamentale:

**"Les clients aiment-ils VRAIMENT ce produit, et pourquoi?"**

Un BA qui investit 50-200K€ doit savoir:
1. La qualité réelle de la base clients (pas juste les logos)
2. Si le PMF est réel ou cosmétique
3. Les risques de concentration/churn
4. Le potentiel d'expansion

## TON STANDARD D'ANALYSE

Tu produis une analyse de la qualité qu'on présenterait à un comité d'investissement tier-1.

### RÈGLES ABSOLUES

1. **CHAQUE AFFIRMATION = UNE SOURCE**
   - ❌ "Les clients sont satisfaits"
   - ✅ "NRR de 125% (Slide 8), supérieur au P75 SaaS B2B (120%), suggère forte satisfaction"

2. **CHAQUE MÉTRIQUE = UN BENCHMARK**
   - ❌ "Le churn de 5% est bon"
   - ✅ "Churn 5% vs benchmark SaaS B2B: P25=3%, Median=5%, P75=8%. Position: médiane."

3. **CHAQUE CLIENT = UNE VÉRIFICATION**
   - ❌ "Ils ont des clients enterprise"
   - ✅ "3 clients enterprise mentionnés: Carrefour (vérifié via news 2024), BNP (non vérifié), TotalEnergies (témoignage LinkedIn)"

4. **ZÉRO AFFIRMATION GÉNÉRIQUE**
   - ❌ "Le PMF semble bon"
   - ✅ "PMF Score 72/100: NRR>120% (PASS), Sean Ellis >40% (PARTIAL - 35% déclaré), Referrals (PASS - 20% clients)"

## FRAMEWORK D'ANALYSE PMF

### Tests PMF à appliquer systématiquement:

| Test | PASS | FAIL |
|------|------|------|
| NRR > 120% | Expansion naturelle | Churn net |
| Sean Ellis > 40% "très déçu" | Addiction produit | Nice-to-have |
| Organic/Referral > 20% acquisition | Virality | Paid-dependent |
| Sales cycle raccourcissant | Pull market | Push market |
| Churn < 5% (B2B) / < 10% (B2C) | Sticky product | Leaky bucket |
| NPS > 50 | Promoteurs actifs | Détracteurs |

### PROTOCOLE DE COLLECTE (OBLIGATOIRE POUR CHAQUE TEST NOT_TESTABLE) (F36)
Pour CHAQUE test marque NOT_TESTABLE, tu DOIS generer un dataCollectionProtocol avec:
- dataNeeded: Quelle donnee exacte est necessaire
- howToRequest: Comment le BA peut l'obtenir (quel export, quel outil)
- questionForFounder: Question non-confrontationnelle a poser
- acceptableFormats: Quels formats sont acceptables
- redFlagIfRefused: Ce que ca revele si le fondateur refuse
- estimatedTimeToCollect: Delai raisonnable
- alternativeProxy: Proxy acceptable si la donnee exacte n'est pas disponible

### Signaux PMF POSITIFS (à sourcer):
- NRR > 120% avec historique > 6 mois
- Churn < benchmark secteur
- Clients qui expandent spontanément
- Referrals significatifs et traçables
- Waitlist / demande inbound > outbound
- Clients qui défendent le produit publiquement
- Renouvellements sans négociation

### Signaux PMF NÉGATIFS (red flags):
- NRR < 100% (contraction nette)
- Churn > 10% mensuel
- Heavy discounting pour closer (>20% moyen)
- Sales cycle qui s'allonge
- Feature requests contradictoires
- Clients concentrés sur un seul use case
- Pas de referrals après 12+ mois

## CONCENTRATION CLIENT - SEUILS

| Seuil | Niveau | Implication |
|-------|--------|-------------|
| Top 1 > 30% revenue | CRITICAL | Risque existentiel |
| Top 3 > 50% revenue | HIGH | Dépendance dangereuse |
| Top 10 > 80% revenue | MODERATE | Diversification nécessaire |
| Aucun client > 10% | HEALTHY | Base diversifiée |

## QUALITÉ CLIENTS - CRITÈRES

| Critère | HIGH | MEDIUM | LOW |
|---------|------|--------|-----|
| Type | Enterprise logos vérifiables | Mid-market connus | SMB anonymes |
| Contrat | Multi-year, expansion | Annual | Monthly/pilots |
| Reference | Public testimonial | Private reference | Aucune |
| Expansion | Expanded 2x+ | Stable | Downsized/churned |

## FORMAT DE SORTIE

Tu DOIS produire un JSON structuré avec:
1. **meta**: Complétude données, confidence, limitations
2. **score**: Score 0-100 avec breakdown par critère (PMF 40%, Rétention 25%, Concentration 20%, Expansion 15%)
3. **findings**: Analyse détaillée par section (ICP, base clients, claims, rétention, PMF, concentration, expansion)
4. **dbCrossReference**: Claims vérifiés vs Funding DB si disponible
5. **redFlags**: Minimum 3 si problèmes, chacun avec evidence + question + impact
6. **questions**: Minimum 5 questions prioritaires pour le fondateur
7. **alertSignal**: GO/NO-GO avec justification
8. **narrative**: Résumé actionnable pour le BA

## BARÈME DE SCORING

| Critère | Poids | A (85-100) | B (70-84) | C (55-69) | D (40-54) | F (<40) |
|---------|-------|------------|-----------|-----------|-----------|---------|
| PMF | 40% | NRR>130%, Sean Ellis>50% | NRR>115%, Signaux forts | NRR>100%, Signaux émergents | NRR<100%, Signaux faibles | Pas de PMF démontré |
| Rétention | 25% | Churn<3%, GRR>95% | Churn<5%, GRR>90% | Churn<8%, GRR>85% | Churn<12%, GRR>75% | Churn>12% |
| Concentration | 20% | Top1<10% | Top1<20% | Top1<30% | Top1<40% | Top1>40% |
| Expansion | 15% | L&E fort + virality | L&E démontré | Upsell possible | Limité | Aucun potentiel |`;
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  protected async execute(context: EnrichedAgentContext): Promise<CustomerIntelData> {
    this._dealStage = context.deal.stage;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Build customer data section from extracted info
    let customerDataSection = "";
    if (extractedInfo) {
      const customerData = {
        customers: extractedInfo.customers,
        users: extractedInfo.users,
        nrr: extractedInfo.nrr,
        churnRate: extractedInfo.churnRate,
        ltv: extractedInfo.ltv,
        cac: extractedInfo.cac,
      };
      customerDataSection = `
## DONNÉES CLIENTS EXTRAITES DU DECK
\`\`\`json
${JSON.stringify(customerData, null, 2)}
\`\`\`
`;
    }

    // Build benchmark section from Context Engine
    let benchmarkSection = "";
    if (context.contextEngine?.marketData?.benchmarks) {
      const relevantBenchmarks = context.contextEngine.marketData.benchmarks.filter(
        (b) =>
          ["nrr", "churn", "gross_retention", "nps", "ltv_cac"].includes(
            b.metricName.toLowerCase().replace(/\s+/g, "_")
          )
      );
      if (relevantBenchmarks.length > 0) {
        benchmarkSection = `
## BENCHMARKS SECTEUR (Context Engine)
| Métrique | P25 | Médiane | P75 | Source |
|----------|-----|---------|-----|--------|
${relevantBenchmarks.map((b) => `| ${b.metricName} | ${b.p25}${b.unit} | ${b.median}${b.unit} | ${b.p75}${b.unit} | ${b.source} |`).join("\n")}
`;
      }
    }

    const prompt = `Analyse la base clients et le Product-Market Fit de ce deal.

${dealContext}
${customerDataSection}
${benchmarkSection}
${contextEngineData}
${this.formatFactStoreData(context)}
## TA MISSION

Produis une analyse EXHAUSTIVE de la base clients avec:

1. **ICP Analysis**: Qui est le client idéal? Est-ce clair?
2. **Customer Base Audit**: Qualité et vérification des clients mentionnés
3. **Claims Verification**: Chaque claim client du deck vérifié (min 3)
4. **Retention Deep Dive**: NRR, GRR, Churn avec benchmarks
5. **PMF Assessment**: Score PMF avec tests structurés
6. **Concentration Analysis**: Risque de dépendance
7. **Expansion Potential**: Upsell, cross-sell, virality

## INSTRUCTIONS CRITIQUES

- Pour CHAQUE client notable: vérifie s'il est vérifiable (news, LinkedIn, site web)
- Pour CHAQUE métrique: compare au benchmark secteur
- Pour CHAQUE claim: cite la source exacte (Slide X, calcul, Context Engine)
- MINIMUM 3 red flags si problèmes détectés
- MINIMUM 5 questions pour le fondateur
- Score PMF: 0-100 avec méthode de calcul explicite

## FORMAT DE RÉPONSE

Réponds UNIQUEMENT en JSON avec cette structure exacte:

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu être analysé"]
  },

  "score": {
    "value": 0-100,
    "grade": "A|B|C|D|F",
    "breakdown": [
      {
        "criterion": "Product-Market Fit",
        "weight": 40,
        "score": 0-100,
        "justification": "Explication avec preuves"
      },
      {
        "criterion": "Rétention",
        "weight": 25,
        "score": 0-100,
        "justification": "Explication avec preuves"
      },
      {
        "criterion": "Concentration",
        "weight": 20,
        "score": 0-100,
        "justification": "Explication avec preuves"
      },
      {
        "criterion": "Expansion Potential",
        "weight": 15,
        "score": 0-100,
        "justification": "Explication avec preuves"
      }
    ]
  },

  "findings": {
    "icp": {
      "description": "Description détaillée du client idéal",
      "segments": ["Segment 1", "Segment 2"],
      "verticals": ["Vertical 1"],
      "companySize": "SMB / Mid-Market / Enterprise",
      "buyerPersona": "Titre du décideur",
      "icpClarity": "CLEAR|PARTIAL|UNCLEAR"
    },

    "customerBase": {
      "totalCustomers": number ou null,
      "payingCustomers": number ou null,
      "activeUsers": number ou null,
      "customerQuality": "HIGH|MEDIUM|LOW|UNKNOWN",
      "qualityJustification": "Pourquoi cette qualité",
      "notableCustomers": [
        {
          "id": "cust_1",
          "name": "Nom du client",
          "type": "enterprise|mid_market|smb|startup|unknown",
          "verified": true/false,
          "verificationSource": "News article 2024, LinkedIn, etc.",
          "relationship": {
            "status": "active|pilot|churned|prospect|unknown",
            "since": "2023",
            "contractType": "subscription|one_time|usage_based|unknown",
            "dealSize": "enterprise|mid|small|unknown",
            "revenueContribution": 15
          },
          "satisfaction": {
            "isReference": true/false,
            "hasTestimonial": true/false,
            "hasExpanded": true/false,
            "hasReferred": true/false,
            "publicEndorsement": "Citation si disponible"
          },
          "risks": ["Risques spécifiques à ce client"]
        }
      ],
      "customersMissedInDeck": ["Type de clients qu'on aimerait voir"]
    },

    "claimsValidation": [
      {
        "id": "claim_1",
        "claim": "Citation EXACTE du deck",
        "location": "Slide X",
        "claimType": "customer_count|logo|testimonial|metric|pmf_signal",
        "status": "VERIFIED|UNVERIFIED|EXAGGERATED|MISLEADING",
        "evidence": "Preuve ou absence de preuve",
        "investorImplication": "Ce que ça signifie pour le BA"
      }
    ],

    "retention": {
      "nrr": {
        "reported": number ou null,
        "source": "Slide X ou 'Non mentionné'",
        "benchmarkP25": 95,
        "benchmarkMedian": 105,
        "benchmarkP75": 120,
        "percentile": number ou null,
        "verdict": "EXCELLENT|GOOD|CONCERNING|CRITICAL|UNKNOWN",
        "calculation": "Comment on arrive à ce verdict"
      },
      "grossRetention": {
        "reported": number ou null,
        "churnRate": number ou null,
        "source": "Slide X",
        "benchmarkMedian": 90,
        "verdict": "EXCELLENT|GOOD|CONCERNING|CRITICAL|UNKNOWN"
      },
      "cohortTrends": {
        "trend": "IMPROVING|STABLE|DECLINING|UNKNOWN",
        "evidence": "Ce qui montre cette tendance",
        "concern": "Préoccupation si applicable"
      },
      "dataQuality": {
        "timespan": "6 mois, 12 mois, etc.",
        "cohortCount": "Nombre de cohortes analysables",
        "reliability": "HIGH|MEDIUM|LOW|UNKNOWN",
        "limitations": ["Limitations des données"]
      }
    },

    "pmf": {
      "pmfScore": 0-100,
      "pmfVerdict": "STRONG|EMERGING|WEAK|NOT_DEMONSTRATED",
      "pmfJustification": "Explication détaillée du verdict PMF",
      "positiveSignals": [
        {
          "signal": "Description du signal",
          "evidence": "Preuve concrète",
          "source": "Slide X, Calcul, Context Engine",
          "strength": "STRONG|MODERATE|WEAK"
        }
      ],
      "negativeSignals": [
        {
          "signal": "Description du signal négatif",
          "evidence": "Preuve concrète",
          "source": "Slide X, Absence de données",
          "severity": "CRITICAL|HIGH|MEDIUM"
        }
      ],
      "pmfTests": [
        {
          "test": "NRR > 120%",
          "result": "PASS|FAIL|PARTIAL|NOT_TESTABLE",
          "evidence": "Résultat du test avec données",
          "dataCollectionProtocol": {
            "dataNeeded": "OBLIGATOIRE si NOT_TESTABLE: Quelle donnee exacte est necessaire",
            "howToRequest": "Comment le BA peut obtenir la donnee (quel export, quel outil)",
            "questionForFounder": "Question non-confrontationnelle a poser au fondateur",
            "acceptableFormats": ["Format 1 acceptable", "Format 2 acceptable"],
            "redFlagIfRefused": "Ce que ca revele si le fondateur refuse de fournir la donnee",
            "estimatedTimeToCollect": "Delai raisonnable (ex: 1-2 jours ouvrables)",
            "alternativeProxy": "Proxy acceptable si la donnee exacte n'est pas disponible"
          }
        },
        {
          "test": "Sean Ellis Test (>40% très déçus)",
          "result": "PASS|FAIL|PARTIAL|NOT_TESTABLE",
          "evidence": "Données si disponibles",
          "dataCollectionProtocol": "OBLIGATOIRE si NOT_TESTABLE (meme structure que ci-dessus)"
        },
        {
          "test": "Organic/Referral > 20%",
          "result": "PASS|FAIL|PARTIAL|NOT_TESTABLE",
          "evidence": "Données si disponibles",
          "dataCollectionProtocol": "OBLIGATOIRE si NOT_TESTABLE (meme structure que ci-dessus)"
        },
        {
          "test": "Churn < 5% (B2B)",
          "result": "PASS|FAIL|PARTIAL|NOT_TESTABLE",
          "evidence": "Données si disponibles",
          "dataCollectionProtocol": "OBLIGATOIRE si NOT_TESTABLE (meme structure que ci-dessus)"
        }
      ]
    },

    "concentration": {
      "topCustomerRevenue": 0-100,
      "top3CustomersRevenue": 0-100,
      "top10CustomersRevenue": 0-100,
      "concentrationLevel": "CRITICAL|HIGH|MODERATE|HEALTHY",
      "concentrationRationale": "Explication du niveau",
      "atRiskRevenue": [
        {
          "customerId": "cust_1",
          "customerName": "Nom",
          "revenueAtRisk": 25,
          "riskReason": "Pourquoi ce revenu est à risque",
          "probability": "HIGH|MEDIUM|LOW"
        }
      ],
      "diversificationTrend": "IMPROVING|STABLE|WORSENING|UNKNOWN",
      "trendEvidence": "Ce qui montre cette tendance"
    },

    "expansion": {
      "upsell": {
        "potential": "HIGH|MEDIUM|LOW|UNKNOWN",
        "mechanisms": ["Mécanismes d'upsell"],
        "evidence": "Preuves d'upsell",
        "blockers": ["Obstacles à l'upsell"]
      },
      "crossSell": {
        "potential": "HIGH|MEDIUM|LOW|UNKNOWN",
        "opportunities": ["Opportunités"],
        "evidence": "Preuves"
      },
      "virality": {
        "coefficient": number ou null,
        "mechanism": "Comment ça se propage",
        "evidence": "Preuves de virality",
        "verdict": "STRONG|MODERATE|WEAK|NONE"
      },
      "landAndExpand": {
        "strategy": "Description de la stratégie L&E",
        "successRate": number ou null,
        "averageExpansion": number ou null,
        "evidence": "Preuves de L&E"
      }
    }
  },

  "dbCrossReference": {
    "claims": [
      {
        "claim": "Claim vérifié",
        "location": "Slide X",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "Ce que la DB montre",
        "severity": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "uncheckedClaims": ["Claims non vérifiables"]
  },

  "redFlags": [
    {
      "id": "rf_1",
      "category": "retention|pmf|concentration|quality|disclosure",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre court du red flag",
      "description": "Description détaillée",
      "location": "Slide X ou section",
      "evidence": "Preuve concrète",
      "contextEngineData": "Cross-ref si disponible",
      "impact": "Impact pour le BA",
      "question": "Question à poser au fondateur",
      "redFlagIfBadAnswer": "Ce qui confirmerait le problème"
    }
  ],

  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "retention|pmf|concentration|expansion|quality",
      "question": "Question précise",
      "context": "Pourquoi on pose cette question",
      "whatToLookFor": "Ce qui révèlerait un problème dans la réponse"
    }
  ],

  "alertSignal": {
    "hasBlocker": true/false,
    "blockerReason": "Raison si blocker",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Pourquoi cette recommandation"
  },

  "narrative": {
    "oneLiner": "Résumé en 1 phrase de la situation clients/PMF",
    "summary": "Résumé en 3-4 phrases pour le BA",
    "keyInsights": [
      "Insight 1 le plus important",
      "Insight 2",
      "Insight 3"
    ],
    "forNegotiation": [
      "Argument de négociation basé sur l'analyse clients"
    ]
  }
}
\`\`\`

IMPORTANT:
- Cohérence OBLIGATOIRE verdict/score PMF:
  * NOT_DEMONSTRATED (pas de preuve) = score 0-15 MAXIMUM
  * WEAK (signaux faibles) = score 15-35 MAXIMUM
  * EMERGING (en construction) = score 35-60 MAXIMUM
  * STRONG (prouvé) = score 60-100
- Si données manquantes = verdict "NOT_DEMONSTRATED" et score 0-10
- Si NRR non mentionné = red flag MEDIUM minimum
- Si clients non vérifiables = customerQuality "LOW"
- Concentration > 30% top client = red flag CRITICAL`;

    const { data } = await this.llmCompleteJSON<LLMCustomerIntelResponse>(prompt);

    // Validate and transform response
    const result = this.transformResponse(data);

    // F03: DETERMINISTIC SCORING
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const f = data.findings;

      // Customer quality
      const qualMap = { HIGH: 85, MEDIUM: 55, LOW: 25, UNKNOWN: 30 };
      if (f?.customerBase?.customerQuality) {
        extractedMetrics.push({
          name: "customer_quality_score", value: qualMap[f.customerBase.customerQuality] ?? 30,
          unit: "score", source: "LLM customer analysis", dataReliability: "DECLARED", category: "customer",
        });
      }

      // ICP clarity
      const icpMap = { CLEAR: 90, PARTIAL: 55, UNCLEAR: 20 };
      if (f?.icp?.icpClarity) {
        extractedMetrics.push({
          name: "icp_clarity", value: icpMap[f.icp.icpClarity] ?? 30,
          unit: "score", source: "LLM ICP analysis", dataReliability: "DECLARED", category: "customer",
        });
      }

      // Retention
      if (f?.retention?.nrr?.reported != null) {
        extractedMetrics.push({
          name: "nrr_customers", value: f.retention.nrr.reported,
          unit: "%", source: "Customer retention data", dataReliability: "DECLARED", category: "customer",
        });
      }
      if (f?.retention?.grossRetention?.reported != null) {
        extractedMetrics.push({
          name: "gross_retention_customers", value: f.retention.grossRetention.reported,
          unit: "%", source: "Customer retention data", dataReliability: "DECLARED", category: "customer",
        });
      }

      // PMF
      const pmfMap = { STRONG: 85, EMERGING: 60, WEAK: 30, NOT_DEMONSTRATED: 10 };
      if (f?.pmf?.pmfVerdict) {
        extractedMetrics.push({
          name: "pmf_score", value: pmfMap[f.pmf.pmfVerdict as keyof typeof pmfMap] ?? 30,
          unit: "score", source: "LLM PMF analysis", dataReliability: "DECLARED", category: "customer",
        });
      }

      // Concentration risk
      if (f?.concentration?.topCustomerRevenue != null) {
        const pct = f.concentration.topCustomerRevenue;
        extractedMetrics.push({
          name: "concentration_risk", value: Math.max(0, 100 - pct * 2),
          unit: "score", source: "Revenue concentration", dataReliability: "DECLARED", category: "customer",
        });
      }

      if (extractedMetrics.length > 0) {
        const sector = context.deal.sector ?? "general";
        const stage = context.deal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "customer-intel", extractedMetrics, sector, stage, CUSTOMER_INTEL_CRITERIA,
        );
        result.score = { ...result.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[customer-intel] Deterministic scoring failed, using LLM score:", err);
    }

    return result;
  }

  // ============================================================================
  // TRANSFORM RESPONSE
  // ============================================================================

  private transformResponse(data: LLMCustomerIntelResponse): CustomerIntelData {
    const validGrades = ["A", "B", "C", "D", "F"] as const;
    const validDataCompleteness = ["complete", "partial", "minimal"] as const;
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;

    // Meta
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[customer-intel] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "customer-intel",
      analysisDate: new Date().toISOString(),
      dataCompleteness: validDataCompleteness.includes(data.meta?.dataCompleteness as typeof validDataCompleteness[number])
        ? data.meta.dataCompleteness as "complete" | "partial" | "minimal"
        : "partial",
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel)),
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[customer-intel] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : (validGrades.includes(data.score?.grade as typeof validGrades[number])
        ? data.score.grade as "A" | "B" | "C" | "D" | "F"
        : "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 25,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "Non spécifié",
          }))
        : [],
    };

    // Findings
    const findings = this.transformFindings(data.findings);

    // DB Cross Reference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: (["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"].includes(c.dbVerdict)
              ? c.dbVerdict
              : "NOT_VERIFIABLE") as "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: c.severity as "CRITICAL" | "HIGH" | "MEDIUM" | undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Red Flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, idx) => ({
          id: rf.id ?? `rf_${idx + 1}`,
          category: rf.category ?? "quality",
          severity: (["CRITICAL", "HIGH", "MEDIUM"].includes(rf.severity)
            ? rf.severity
            : "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM",
          title: rf.title ?? "Red flag non spécifié",
          description: rf.description ?? "",
          location: rf.location ?? "Non spécifié",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: (["CRITICAL", "HIGH", "MEDIUM"].includes(q.priority)
            ? q.priority
            : "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM",
          category: q.category ?? "quality",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Alert Signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(data.alertSignal?.recommendation as typeof validRecommendations[number])
        ? data.alertSignal.recommendation as "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP"
        : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "Analyse automatique",
    };

    // Narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse clients non conclusive",
      summary: data.narrative?.summary ?? "Données insuffisantes pour une analyse complète.",
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

  // ============================================================================
  // TRANSFORM FINDINGS
  // ============================================================================

  private transformFindings(findings: LLMCustomerIntelResponse["findings"]): CustomerIntelFindings {
    if (!findings) {
      return this.getDefaultFindings();
    }

    // ICP
    const icp = {
      description: findings.icp?.description ?? "Non spécifié",
      segments: Array.isArray(findings.icp?.segments) ? findings.icp.segments : [],
      verticals: Array.isArray(findings.icp?.verticals) ? findings.icp.verticals : [],
      companySize: findings.icp?.companySize ?? "Non spécifié",
      buyerPersona: findings.icp?.buyerPersona ?? "Non spécifié",
      icpClarity: (["CLEAR", "PARTIAL", "UNCLEAR"].includes(findings.icp?.icpClarity ?? "")
        ? findings.icp?.icpClarity
        : "UNCLEAR") as "CLEAR" | "PARTIAL" | "UNCLEAR",
    };

    // Customer Base
    const customerBase = {
      totalCustomers: findings.customerBase?.totalCustomers,
      payingCustomers: findings.customerBase?.payingCustomers,
      activeUsers: findings.customerBase?.activeUsers,
      customerQuality: (["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(findings.customerBase?.customerQuality ?? "")
        ? findings.customerBase?.customerQuality
        : "UNKNOWN") as "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
      qualityJustification: findings.customerBase?.qualityJustification ?? "Non évalué",
      notableCustomers: this.transformCustomers(findings.customerBase?.notableCustomers),
      customersMissedInDeck: Array.isArray(findings.customerBase?.customersMissedInDeck)
        ? findings.customerBase.customersMissedInDeck
        : [],
    };

    // Claims Validation
    const claimsValidation: CustomerClaimValidation[] = Array.isArray(findings.claimsValidation)
      ? findings.claimsValidation.map((c, idx) => ({
          id: c.id ?? `claim_${idx + 1}`,
          claim: c.claim ?? "",
          location: c.location ?? "",
          claimType: (["customer_count", "logo", "testimonial", "metric", "pmf_signal"].includes(c.claimType ?? "")
            ? c.claimType
            : "metric") as "customer_count" | "logo" | "testimonial" | "metric" | "pmf_signal",
          status: (["VERIFIED", "UNVERIFIED", "EXAGGERATED", "MISLEADING"].includes(c.status ?? "")
            ? c.status
            : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED" | "EXAGGERATED" | "MISLEADING",
          evidence: c.evidence ?? "",
          investorImplication: c.investorImplication ?? "",
        }))
      : [];

    // Retention
    const retention: RetentionAnalysis = this.transformRetention(findings.retention);

    // PMF
    const pmf: PMFAnalysis = this.transformPMF(findings.pmf);

    // Concentration
    const concentration: ConcentrationAnalysis = this.transformConcentration(findings.concentration);

    // Expansion
    const expansion: ExpansionAnalysis = this.transformExpansion(findings.expansion);

    return {
      icp,
      customerBase,
      claimsValidation,
      retention,
      pmf,
      concentration,
      expansion,
    };
  }

  private transformCustomers(customers: LLMCustomerIntelResponse["findings"]["customerBase"]["notableCustomers"]): CustomerAnalysis[] {
    if (!Array.isArray(customers)) return [];

    return customers.map((c, idx) => ({
      id: c.id ?? `cust_${idx + 1}`,
      name: c.name ?? "Unknown",
      type: (["enterprise", "mid_market", "smb", "startup", "unknown"].includes(c.type ?? "")
        ? c.type
        : "unknown") as "enterprise" | "mid_market" | "smb" | "startup" | "unknown",
      verified: c.verified ?? false,
      verificationSource: c.verificationSource,
      relationship: {
        status: (["active", "pilot", "churned", "prospect", "unknown"].includes(c.relationship?.status ?? "")
          ? c.relationship?.status
          : "unknown") as "active" | "pilot" | "churned" | "prospect" | "unknown",
        since: c.relationship?.since,
        contractType: c.relationship?.contractType as "subscription" | "one_time" | "usage_based" | "unknown" | undefined,
        dealSize: c.relationship?.dealSize as "enterprise" | "mid" | "small" | "unknown" | undefined,
        revenueContribution: c.relationship?.revenueContribution,
      },
      satisfaction: {
        isReference: c.satisfaction?.isReference ?? false,
        hasTestimonial: c.satisfaction?.hasTestimonial ?? false,
        hasExpanded: c.satisfaction?.hasExpanded ?? false,
        hasReferred: c.satisfaction?.hasReferred ?? false,
        publicEndorsement: c.satisfaction?.publicEndorsement,
      },
      risks: Array.isArray(c.risks) ? c.risks : [],
    }));
  }

  private transformRetention(retention: LLMCustomerIntelResponse["findings"]["retention"]): RetentionAnalysis {
    const validVerdicts = ["EXCELLENT", "GOOD", "CONCERNING", "CRITICAL", "UNKNOWN"] as const;
    const validTrends = ["IMPROVING", "STABLE", "DECLINING", "UNKNOWN"] as const;
    const validReliability = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;

    // Get benchmarks from centralized service (uses SEED generic as fallback)
    const nrrP25 = getBenchmark(null, null, "nrr", "p25");
    const nrrMedian = getBenchmark(null, null, "nrr", "median");
    const nrrP75 = getBenchmark(null, null, "nrr", "p75");
    const grossRetentionMedian = getBenchmark(null, null, "grossRetention", "median");

    return {
      nrr: {
        reported: retention?.nrr?.reported,
        source: retention?.nrr?.source ?? "Non spécifié",
        benchmarkP25: retention?.nrr?.benchmarkP25 ?? nrrP25,
        benchmarkMedian: retention?.nrr?.benchmarkMedian ?? nrrMedian,
        benchmarkP75: retention?.nrr?.benchmarkP75 ?? nrrP75,
        percentile: retention?.nrr?.percentile,
        verdict: validVerdicts.includes(retention?.nrr?.verdict as typeof validVerdicts[number])
          ? retention.nrr.verdict as typeof validVerdicts[number]
          : "UNKNOWN",
        calculation: retention?.nrr?.calculation,
      },
      grossRetention: {
        reported: retention?.grossRetention?.reported,
        churnRate: retention?.grossRetention?.churnRate,
        source: retention?.grossRetention?.source ?? "Non spécifié",
        benchmarkMedian: retention?.grossRetention?.benchmarkMedian ?? grossRetentionMedian,
        verdict: validVerdicts.includes(retention?.grossRetention?.verdict as typeof validVerdicts[number])
          ? retention.grossRetention.verdict as typeof validVerdicts[number]
          : "UNKNOWN",
      },
      cohortTrends: {
        trend: validTrends.includes(retention?.cohortTrends?.trend as typeof validTrends[number])
          ? retention.cohortTrends.trend as typeof validTrends[number]
          : "UNKNOWN",
        evidence: retention?.cohortTrends?.evidence ?? "Pas de données de cohorte",
        concern: retention?.cohortTrends?.concern,
      },
      dataQuality: {
        timespan: retention?.dataQuality?.timespan ?? "Inconnu",
        cohortCount: retention?.dataQuality?.cohortCount ?? "0",
        reliability: validReliability.includes(retention?.dataQuality?.reliability as typeof validReliability[number])
          ? retention.dataQuality.reliability as typeof validReliability[number]
          : "UNKNOWN",
        limitations: Array.isArray(retention?.dataQuality?.limitations)
          ? retention.dataQuality.limitations
          : ["Données non disponibles"],
      },
    };
  }

  private transformPMF(pmf: LLMCustomerIntelResponse["findings"]["pmf"]): PMFAnalysis {
    const validVerdicts = ["STRONG", "EMERGING", "WEAK", "NOT_DEMONSTRATED"] as const;
    const validStrengths = ["STRONG", "MODERATE", "WEAK"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validResults = ["PASS", "FAIL", "PARTIAL", "NOT_TESTABLE"] as const;

    // Get raw values
    const rawScore = Math.min(100, Math.max(0, pmf?.pmfScore ?? 0));
    const rawVerdict = validVerdicts.includes(pmf?.pmfVerdict as typeof validVerdicts[number])
      ? pmf.pmfVerdict as typeof validVerdicts[number]
      : "NOT_DEMONSTRATED";

    // Enforce verdict/score coherence:
    // - NOT_DEMONSTRATED: score capped at 15 (no proof = no points)
    // - WEAK: score capped at 35
    // - EMERGING: score capped at 60
    // - STRONG: no cap
    let coherentScore = rawScore;
    if (rawVerdict === "NOT_DEMONSTRATED") {
      coherentScore = Math.min(rawScore, 15);
    } else if (rawVerdict === "WEAK") {
      coherentScore = Math.min(rawScore, 35);
    } else if (rawVerdict === "EMERGING") {
      coherentScore = Math.min(rawScore, 60);
    }

    return {
      pmfScore: coherentScore,
      pmfVerdict: rawVerdict,
      pmfJustification: pmf?.pmfJustification ?? "Données insuffisantes pour évaluer le PMF",
      positiveSignals: Array.isArray(pmf?.positiveSignals)
        ? pmf.positiveSignals.map((s) => ({
            signal: s.signal ?? "",
            evidence: s.evidence ?? "",
            source: s.source ?? "",
            strength: validStrengths.includes(s.strength as typeof validStrengths[number])
              ? s.strength as typeof validStrengths[number]
              : "WEAK",
          }))
        : [],
      negativeSignals: Array.isArray(pmf?.negativeSignals)
        ? pmf.negativeSignals.map((s) => ({
            signal: s.signal ?? "",
            evidence: s.evidence ?? "",
            source: s.source ?? "",
            severity: validSeverities.includes(s.severity as typeof validSeverities[number])
              ? s.severity as typeof validSeverities[number]
              : "MEDIUM",
          }))
        : [],
      pmfTests: Array.isArray(pmf?.pmfTests)
        ? pmf.pmfTests.map((t) => {
            const result = validResults.includes(t.result as typeof validResults[number])
              ? t.result as typeof validResults[number]
              : "NOT_TESTABLE";
            const dcp = (t as Record<string, unknown>).dataCollectionProtocol as Record<string, unknown> | undefined;
            return {
              test: t.test ?? "",
              result,
              evidence: t.evidence ?? "",
              // F36: Data collection protocol for NOT_TESTABLE tests
              dataCollectionProtocol: (result === "NOT_TESTABLE" && dcp)
                ? {
                    dataNeeded: (dcp.dataNeeded as string) ?? "Non specifie",
                    howToRequest: (dcp.howToRequest as string) ?? "Demander directement au fondateur",
                    questionForFounder: (dcp.questionForFounder as string) ?? "",
                    acceptableFormats: Array.isArray(dcp.acceptableFormats) ? dcp.acceptableFormats as string[] : [],
                    redFlagIfRefused: (dcp.redFlagIfRefused as string) ?? "",
                    estimatedTimeToCollect: (dcp.estimatedTimeToCollect as string) ?? "Non estime",
                    alternativeProxy: dcp.alternativeProxy as string | undefined,
                  }
                : undefined,
            };
          })
        : [],
    };
  }

  private transformConcentration(concentration: LLMCustomerIntelResponse["findings"]["concentration"]): ConcentrationAnalysis {
    const validLevels = ["CRITICAL", "HIGH", "MODERATE", "HEALTHY"] as const;
    const validTrends = ["IMPROVING", "STABLE", "WORSENING", "UNKNOWN"] as const;
    const validProbabilities = ["HIGH", "MEDIUM", "LOW"] as const;

    return {
      topCustomerRevenue: concentration?.topCustomerRevenue ?? 0,
      top3CustomersRevenue: concentration?.top3CustomersRevenue ?? 0,
      top10CustomersRevenue: concentration?.top10CustomersRevenue ?? 0,
      concentrationLevel: validLevels.includes(concentration?.concentrationLevel as typeof validLevels[number])
        ? concentration.concentrationLevel as typeof validLevels[number]
        : "UNKNOWN" as "CRITICAL" | "HIGH" | "MODERATE" | "HEALTHY",
      concentrationRationale: concentration?.concentrationRationale ?? "Non évalué",
      atRiskRevenue: Array.isArray(concentration?.atRiskRevenue)
        ? concentration.atRiskRevenue.map((r) => ({
            customerId: r.customerId ?? "",
            customerName: r.customerName ?? "",
            revenueAtRisk: r.revenueAtRisk ?? 0,
            riskReason: r.riskReason ?? "",
            probability: validProbabilities.includes(r.probability as typeof validProbabilities[number])
              ? r.probability as typeof validProbabilities[number]
              : "MEDIUM",
          }))
        : [],
      diversificationTrend: validTrends.includes(concentration?.diversificationTrend as typeof validTrends[number])
        ? concentration.diversificationTrend as typeof validTrends[number]
        : "UNKNOWN",
      trendEvidence: concentration?.trendEvidence ?? "Non évalué",
    };
  }

  private transformExpansion(expansion: LLMCustomerIntelResponse["findings"]["expansion"]): ExpansionAnalysis {
    const validPotentials = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
    const validViralityVerdicts = ["STRONG", "MODERATE", "WEAK", "NONE"] as const;

    return {
      upsell: {
        potential: validPotentials.includes(expansion?.upsell?.potential as typeof validPotentials[number])
          ? expansion.upsell.potential as typeof validPotentials[number]
          : "UNKNOWN",
        mechanisms: Array.isArray(expansion?.upsell?.mechanisms) ? expansion.upsell.mechanisms : [],
        evidence: expansion?.upsell?.evidence ?? "Non évalué",
        blockers: Array.isArray(expansion?.upsell?.blockers) ? expansion.upsell.blockers : [],
      },
      crossSell: {
        potential: validPotentials.includes(expansion?.crossSell?.potential as typeof validPotentials[number])
          ? expansion.crossSell.potential as typeof validPotentials[number]
          : "UNKNOWN",
        opportunities: Array.isArray(expansion?.crossSell?.opportunities) ? expansion.crossSell.opportunities : [],
        evidence: expansion?.crossSell?.evidence ?? "Non évalué",
      },
      virality: {
        coefficient: expansion?.virality?.coefficient,
        mechanism: expansion?.virality?.mechanism ?? "Non identifié",
        evidence: expansion?.virality?.evidence ?? "Non évalué",
        verdict: validViralityVerdicts.includes(expansion?.virality?.verdict as typeof validViralityVerdicts[number])
          ? expansion.virality.verdict as typeof validViralityVerdicts[number]
          : "NONE",
      },
      landAndExpand: {
        strategy: expansion?.landAndExpand?.strategy ?? "Non identifiée",
        successRate: expansion?.landAndExpand?.successRate,
        averageExpansion: expansion?.landAndExpand?.averageExpansion,
        evidence: expansion?.landAndExpand?.evidence ?? "Non évalué",
      },
    };
  }

  private getDefaultFindings(): CustomerIntelFindings {
    // Get benchmarks from centralized service
    const nrrP25 = getBenchmark(null, null, "nrr", "p25");
    const nrrMedian = getBenchmark(null, null, "nrr", "median");
    const nrrP75 = getBenchmark(null, null, "nrr", "p75");
    const grossRetentionMedian = getBenchmark(null, null, "grossRetention", "median");

    return {
      icp: {
        description: "Non spécifié",
        segments: [],
        verticals: [],
        companySize: "Non spécifié",
        buyerPersona: "Non spécifié",
        icpClarity: "UNCLEAR",
      },
      customerBase: {
        customerQuality: "UNKNOWN",
        qualityJustification: "Données insuffisantes",
        notableCustomers: [],
        customersMissedInDeck: [],
      },
      claimsValidation: [],
      retention: {
        nrr: {
          source: "Non disponible",
          benchmarkP25: nrrP25,
          benchmarkMedian: nrrMedian,
          benchmarkP75: nrrP75,
          verdict: "UNKNOWN",
        },
        grossRetention: {
          source: "Non disponible",
          benchmarkMedian: grossRetentionMedian,
          verdict: "UNKNOWN",
        },
        cohortTrends: {
          trend: "UNKNOWN",
          evidence: "Pas de données",
        },
        dataQuality: {
          timespan: "Inconnu",
          cohortCount: "0",
          reliability: "UNKNOWN",
          limitations: ["Aucune donnée de rétention disponible"],
        },
      },
      pmf: {
        pmfScore: 0,
        pmfVerdict: "NOT_DEMONSTRATED",
        pmfJustification: "Données insuffisantes pour évaluer le PMF",
        positiveSignals: [],
        negativeSignals: [],
        pmfTests: [],
      },
      concentration: {
        topCustomerRevenue: 0,
        top3CustomersRevenue: 0,
        top10CustomersRevenue: 0,
        concentrationLevel: "HEALTHY",
        concentrationRationale: "Données non disponibles",
        atRiskRevenue: [],
        diversificationTrend: "UNKNOWN",
        trendEvidence: "Pas de données",
      },
      expansion: {
        upsell: {
          potential: "UNKNOWN",
          mechanisms: [],
          evidence: "Non évalué",
          blockers: [],
        },
        crossSell: {
          potential: "UNKNOWN",
          opportunities: [],
          evidence: "Non évalué",
        },
        virality: {
          mechanism: "Non identifié",
          evidence: "Non évalué",
          verdict: "NONE",
        },
        landAndExpand: {
          strategy: "Non identifiée",
          evidence: "Non évalué",
        },
      },
    };
  }
}

export const customerIntel = new CustomerIntelAgent();
