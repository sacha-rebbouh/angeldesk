/**
 * FINTECH EXPERT AGENT - REFONTE v2.0
 * ====================================
 * Tier 2 - Expert Sectoriel Fintech
 *
 * Mission: Analyse sectorielle APPROFONDIE pour deals Fintech/Payments/Banking/Lending
 * Standard: Big4 + Partner VC - Chaque affirmation sourcée, benchmarks obligatoires
 *
 * Expertise couverte:
 * - Payments & Processing (TPV, Take Rate, Fraud)
 * - Lending & Credit (NIM, Default Rate, NPL)
 * - Banking & Neobanks (CAR, NII, Cost-to-Income)
 * - Embedded Finance & BaaS
 * - InsurTech & WealthTech
 *
 * Minimum requis:
 * - 5+ métriques clés évaluées vs benchmarks
 * - 3+ red flags sectoriels si problèmes
 * - 5+ questions spécifiques fintech
 * - Cross-reference réglementaire obligatoire
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertResult, SectorExpertData, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { FINTECH_STANDARDS } from "./sector-standards";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// SCHEMA DE SORTIE
// ============================================================================

const FintechExpertOutputSchema = z.object({
  sectorName: z.literal("Fintech"),
  sectorMaturity: z.enum(["emerging", "growing", "mature", "declining"]),

  // Sous-secteur identifié
  subSector: z.object({
    primary: z.enum(["payments", "lending", "banking", "embedded_finance", "insurtech", "wealthtech", "crypto", "regtech", "other"]),
    secondary: z.array(z.string()).optional(),
    rationale: z.string(),
  }),

  // Métriques clés évaluées (minimum 5)
  keyMetrics: z.array(
    z.object({
      metricName: z.string(),
      value: z.union([z.number(), z.string(), z.null()]),
      unit: z.string(),
      source: z.string(), // "Deck Slide X", "Calculated", "Not provided"
      sectorBenchmark: z.object({
        p25: z.number(),
        median: z.number(),
        p75: z.number(),
        topDecile: z.number(),
      }),
      percentile: z.number().optional(),
      assessment: z.enum(["exceptional", "above_average", "average", "below_average", "concerning"]),
      sectorContext: z.string(), // Pourquoi cette métrique compte en fintech
      calculation: z.string().optional(), // Si calculé, montrer le calcul
    })
  ).min(5),

  // Unit Economics Fintech
  unitEconomics: z.object({
    revenuePerTransaction: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.number(),
      verdict: z.string(),
    }).optional(),
    contributionMargin: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.number(),
      verdict: z.string(),
    }).optional(),
    lossReserveRatio: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.number(),
      verdict: z.string(),
    }).optional(),
    overallAssessment: z.string(),
  }),

  // Red flags sectoriels (fintech-specific)
  sectorRedFlags: z.array(
    z.object({
      id: z.string(),
      flag: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      category: z.enum(["regulatory", "fraud", "credit", "liquidity", "technology", "compliance", "business_model"]),
      sectorReason: z.string(), // Pourquoi c'est un red flag EN FINTECH spécifiquement
      evidence: z.string(),
      benchmarkViolated: z.string().optional(), // Si applicable
      impact: z.string(),
      question: z.string(),
      redFlagIfBadAnswer: z.string(),
    })
  ),

  // Opportunités sectorielles
  sectorOpportunities: z.array(
    z.object({
      opportunity: z.string(),
      potential: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
      timeframe: z.string(),
      prerequisites: z.array(z.string()),
    })
  ),

  // Environnement réglementaire (CRITIQUE en Fintech)
  regulatoryEnvironment: z.object({
    complexity: z.enum(["low", "medium", "high", "very_high"]),
    jurisdictions: z.array(z.string()), // EU, US, UK, etc.

    // Licences requises
    licensesRequired: z.array(
      z.object({
        license: z.string(), // "EMI", "Banking License", "Payment Institution"
        status: z.enum(["obtained", "pending", "not_applied", "not_required", "unknown"]),
        jurisdiction: z.string(),
        risk: z.string(),
      })
    ),

    // Conformité
    complianceAreas: z.array(
      z.object({
        area: z.string(), // "AML/KYC", "PSD2", "GDPR", "Consumer Credit"
        status: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
        evidence: z.string(),
        risk: z.enum(["critical", "high", "medium", "low"]),
      })
    ),

    // Changements à venir
    upcomingChanges: z.array(
      z.object({
        regulation: z.string(),
        effectiveDate: z.string(),
        impact: z.enum(["positive", "neutral", "negative"]),
        preparedness: z.enum(["ready", "in_progress", "not_started", "unknown"]),
        description: z.string(),
      })
    ),

    overallRegulatoryRisk: z.enum(["low", "medium", "high", "critical"]),
    regulatoryVerdict: z.string(),
  }),

  // Dynamiques sectorielles
  sectorDynamics: z.object({
    competitionIntensity: z.enum(["low", "medium", "high", "intense"]),
    competitionRationale: z.string(),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating"]),
    consolidationEvidence: z.string(),
    barrierToEntry: z.enum(["low", "medium", "high"]),
    barrierDetails: z.string(),
    typicalExitMultiple: z.number(),
    exitMultipleRange: z.object({
      low: z.number(),
      median: z.number(),
      high: z.number(),
    }),
    recentExits: z.array(
      z.object({
        company: z.string(),
        acquirer: z.string(),
        multiple: z.number(),
        year: z.number(),
        relevance: z.string(),
      })
    ),
    bigTechThreat: z.object({
      level: z.enum(["low", "medium", "high", "critical"]),
      players: z.array(z.string()),
      rationale: z.string(),
    }),
  }),

  // Questions spécifiques Fintech (minimum 5)
  sectorQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      category: z.enum(["regulatory", "fraud_risk", "credit_risk", "unit_economics", "technology", "competitive", "scaling"]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      context: z.string(), // Pourquoi on pose cette question
      expectedAnswer: z.string(),
      redFlagAnswer: z.string(),
    })
  ).min(5),

  // Business Model Fit
  businessModelFit: z.object({
    modelType: z.string(), // "Payment Facilitator", "Neobank", "BNPL", etc.
    modelViability: z.enum(["proven", "emerging", "unproven", "challenging"]),
    viabilityRationale: z.string(),
    unitEconomicsPath: z.string(),
    scalingChallenges: z.array(z.string()),
    regulatoryPathway: z.string(),
  }),

  // Sector Fit Score
  sectorFit: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    sectorTiming: z.enum(["early", "optimal", "late"]),
    timingRationale: z.string(),
  }),

  // Score global sectoriel
  sectorScore: z.number().min(0).max(100),

  // Scoring breakdown
  scoreBreakdown: z.object({
    metricsScore: z.number(), // 0-25
    regulatoryScore: z.number(), // 0-25
    businessModelScore: z.number(), // 0-25
    marketPositionScore: z.number(), // 0-25
    justification: z.string(),
  }),

  // Executive Summary
  executiveSummary: z.string(),

  // Verdict actionnable
  verdict: z.object({
    recommendation: z.enum(["STRONG_FIT", "GOOD_FIT", "MODERATE_FIT", "POOR_FIT", "NOT_RECOMMENDED"]),
    confidence: z.enum(["high", "medium", "low"]),
    keyInsight: z.string(),
    topConcern: z.string(),
    topStrength: z.string(),
  }),
});

type FintechExpertOutput = z.infer<typeof FintechExpertOutputSchema>;

// ============================================================================
// SYSTEM PROMPT - Persona Expert Fintech
// ============================================================================

function buildFintechSystemPrompt(stage: string): string {
  return `Tu es un FINTECH EXPERT senior avec 15+ ans d'expérience dans les services financiers et l'investissement fintech.

## TON PROFIL

Tu as:
- Été Partner dans un fonds spécialisé Fintech (Ribbit Capital, QED Investors niveau)
- Travaillé comme régulateur financier (AMF, ACPR, FCA)
- Conseillé des licornes fintech sur leur stratégie réglementaire
- Vu des centaines de deals fintech, des succès comme des échecs spectaculaires

## TON EXPERTISE APPROFONDIE

### Payments & Processing (Sources: McKinsey Global Payments Report 2024, FIS Global Payments)
- TPV (Total Payment Volume) et trajectoires de croissance
- Take rates par segment:
  - Card networks: 0.1-0.3% (Visa/MC public pricing)
  - PSPs (Stripe, Adyen): 0.5-2% (public pricing)
  - PayFacs: 1-3% (McKinsey 2024)
  - Embedded finance: 2-5% (a16z fintech benchmarks)
- Fraud rates: Industry CNP fraud 0.1-0.15% (Nilson Report 2024). > 0.3% indicates issues
- Interchange economics: EU IFR caps 0.2% debit / 0.3% credit

### Lending & Credit (Sources: Federal Reserve FRED, S&P Global)
- Net Interest Margin (NIM):
  - Traditional banks: 2.5-3.5% (FRED commercial bank NIM)
  - Fintech lenders: 6-12% (higher risk profile)
  - Subprime: 10-18% (must provision heavily)
- Default rates: Prime < 2%, Near-prime 3-6%, Subprime 8-15% (Fed Consumer Credit data)
- Underwriting models et vintage analysis
- Funding structures (balance sheet vs marketplace)

### Banking & Neobanks (Sources: EBA data, public filings)
- Capital Adequacy Ratio (CAR): Basel III minimum CET1 4.5%, total 8%. Well-capitalized 10%+
- Cost-to-Income ratio:
  - Neobanks: 45-65% (Revolut ~60%, N26 ~70% - estimated from public info)
  - Traditional: 55-75% (EBA EU banking data)
- Customer acquisition costs B2C: $30-100 typical (public company filings)
- Deposit economics et funding costs

### Embedded Finance & BaaS
- Revenue share: Platform typically gets 60-80% after BaaS provider cut
- API economics et pricing (transaction-based + monthly minimums typical)
- Bank charter vs BaaS partnerships trade-offs

${getStandardsOnlyInjection("Fintech", stage)}

## ENVIRONNEMENT RÉGLEMENTAIRE FINTECH

### Licences par activité
| Activité | Licence EU | Licence US | Licence UK |
|----------|------------|------------|------------|
| Payments | EMI / PI | State MTL + FinCEN | EMI / PI |
| Banking | Banking License | Bank Charter / ILC | Banking License |
| Lending | Consumer Credit | State Lending License | Consumer Credit |
| Investment | MiFID II | SEC/FINRA | FCA Authorization |
| Crypto | MiCA | State by state | FCA Crypto |

### Réglementations clés à vérifier
1. **AML/KYC** - Anti-Money Laundering, Know Your Customer (OBLIGATOIRE)
2. **PSD2/PSR** - Payment Services Directive (EU), Open Banking
3. **Consumer Credit** - Taux d'usure, devoir de conseil
4. **Data Protection** - GDPR, données financières sensibles
5. **Capital Requirements** - Basel III, ratios prudentiels
6. **AI Act** - Si scoring/underwriting par IA (2025+)

## RÈGLES ABSOLUES

1. **Chaque métrique** doit être comparée aux benchmarks ci-dessus
2. **Chaque red flag** doit citer le seuil violé et l'impact business
3. **Le statut réglementaire** est CRITIQUE - pas de licence = risque existentiel
4. **Les calculs** doivent être montrés, pas juste les résultats
5. **Les questions** doivent sonder les risques spécifiques fintech
6. **Jamais de probabilités de succès** - scores multi-dimensionnels uniquement

## FORMAT DE RÉPONSE

Tu dois produire une analyse JSON structurée. Chaque section doit être sourcée et justifiée.
`;
}

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildFintechUserPrompt(
  context: EnrichedAgentContext,
  previousResults: Record<string, unknown> | null
): string {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract relevant info from previous Tier 1 results
  let tier1Insights = "";
  if (previousResults) {
    // Financial Auditor insights
    const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
    if (financialAudit?.success && financialAudit.data) {
      tier1Insights += `\n### Financial Auditor Findings:\n`;
      if (financialAudit.data.narrative?.keyInsights) {
        tier1Insights += financialAudit.data.narrative.keyInsights.join("\n- ");
      }
      if (financialAudit.data.findings) {
        tier1Insights += `\nFindings: ${JSON.stringify(financialAudit.data.findings, null, 2).slice(0, 2000)}...`;
      }
    }

    // Competitive Intel insights
    const competitiveIntel = previousResults["competitive-intel"] as { success?: boolean; data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } } } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) {
        tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      }
      if (competitiveIntel.data.findings?.competitors) {
        tier1Insights += `\nCompetitors identified: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
      }
    }

    // Legal Regulatory insights (CRITICAL for Fintech)
    const legalRegulatory = previousResults["legal-regulatory"] as { success?: boolean; data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } } } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) {
        tier1Insights += `Compliance areas: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      }
      if (legalRegulatory.data.findings?.regulatoryRisks) {
        tier1Insights += `\nRegulatory risks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
      }
    }

    // Document Extractor data
    const extractor = previousResults["document-extractor"] as { success?: boolean; data?: { extractedInfo?: Record<string, unknown> } } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) {
      tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
    }
  }

  // Context Engine data if available
  let contextEngineData = "";
  if (context.contextEngine) {
    if (context.contextEngine.dealIntelligence) {
      contextEngineData += `\n### Similar Fintech Deals (from Context Engine):\n`;
      contextEngineData += JSON.stringify(context.contextEngine.dealIntelligence, null, 2).slice(0, 2000);
    }
    if (context.contextEngine.competitiveLandscape) {
      contextEngineData += `\n### Competitive Landscape:\n`;
      contextEngineData += JSON.stringify(context.contextEngine.competitiveLandscape, null, 2).slice(0, 1500);
    }
  }

  return `## DEAL À ANALYSER - EXPERTISE FINTECH REQUISE

### Informations de base
- **Company**: ${deal.companyName ?? deal.name}
- **Sector**: ${deal.sector ?? "Fintech"}
- **Stage**: ${stage}
- **Geography**: ${deal.geography ?? "Unknown"}
- **ARR**: ${deal.arr ? `€${deal.arr.toLocaleString()}` : "Not provided"}
- **Amount Raising**: ${deal.amountRequested ? `€${deal.amountRequested.toLocaleString()}` : "Not provided"}
- **Valuation**: ${deal.valuationPre ? `€${deal.valuationPre.toLocaleString()} pre-money` : "Not provided"}

### Documents disponibles
${context.documents?.map(d => `- ${d.name} (${d.type})`).join("\n") || "Aucun document fourni"}

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

${contextEngineData ? `## DONNÉES CONTEXT ENGINE\n${contextEngineData}` : ""}

## TA MISSION

En tant qu'expert Fintech, tu dois produire une analyse sectorielle APPROFONDIE qui couvre:

### 1. IDENTIFICATION DU SOUS-SECTEUR
Identifie précisément le sous-secteur fintech (payments, lending, banking, embedded finance, etc.) et ses implications.

### 2. ÉVALUATION DES MÉTRIQUES CLÉS (minimum 5)
Pour chaque métrique disponible:
- Compare aux benchmarks du stage ${stage}
- Calcule le percentile
- Explique pourquoi cette métrique compte en fintech
- Montre les calculs si applicable

### 3. ANALYSE RÉGLEMENTAIRE (CRITIQUE)
- Quelles licences sont requises pour ce business model?
- Quel est le statut de conformité (AML/KYC, PSD2, etc.)?
- Quels risques réglementaires majeurs?
- Changements réglementaires à venir qui impactent?

### 4. RED FLAGS SECTORIELS
Applique les règles de red flag automatiques definies dans les standards sectoriels ci-dessus.
Verifie au minimum: Default Rate, Fraud Rate, Take Rate, Regulatory Capital.

### 5. QUESTIONS SPÉCIFIQUES FINTECH (minimum 5)
Génère des questions qui sondent les risques spécifiques:
- Fraud & risk management
- Regulatory pathway
- Unit economics sustainability
- Funding structure (si lending)
- Technology & security

### 6. VERDICT ACTIONNABLE
Score 0-100 avec breakdown par dimension:
- Métriques (0-25)
- Réglementaire (0-25)
- Business Model (0-25)
- Position Marché (0-25)

Produis ton analyse au format JSON conforme au schema.`;
}

// ============================================================================
// AGENT PRINCIPAL
// ============================================================================

export const fintechExpert = {
  name: "fintech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      // Get previous results from context
      const previousResults = context.previousResults ?? null;
      const stage = context.deal.stage ?? "SEED";

      // Build prompts
      const userPrompt = buildFintechUserPrompt(context, previousResults as Record<string, unknown> | null);

      // Set agent context for cost tracking
      setAgentContext("fintech-expert");

      // Call LLM
      const response = await complete(userPrompt, {
        systemPrompt: buildFintechSystemPrompt(stage),
        complexity: "complex",
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      // Parse and validate response
      let parsedOutput: FintechExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        parsedOutput = FintechExpertOutputSchema.parse(JSON.parse(jsonMatch[0]));
      } catch (parseError) {
        console.error("[fintech-expert] Parse error:", parseError);
        return {
          agentName: "fintech-expert",
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultFintechData(),
        };
      }

      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: parsedOutput.sectorName,
        sectorMaturity: parsedOutput.sectorMaturity,

        keyMetrics: parsedOutput.keyMetrics.map(m => ({
          metricName: m.metricName,
          value: m.value,
          sectorBenchmark: m.sectorBenchmark,
          assessment: m.assessment,
          sectorContext: m.sectorContext,
        })),

        sectorRedFlags: parsedOutput.sectorRedFlags.map(rf => ({
          flag: rf.flag,
          severity: rf.severity,
          sectorReason: rf.sectorReason,
        })),

        sectorOpportunities: parsedOutput.sectorOpportunities.map(o => ({
          opportunity: o.opportunity,
          potential: o.potential,
          reasoning: o.reasoning,
        })),

        regulatoryEnvironment: {
          complexity: parsedOutput.regulatoryEnvironment.complexity,
          keyRegulations: parsedOutput.regulatoryEnvironment.complianceAreas.map(c => c.area),
          complianceRisks: parsedOutput.regulatoryEnvironment.complianceAreas
            .filter(c => c.status !== "compliant")
            .map(c => `${c.area}: ${c.evidence}`),
          upcomingChanges: parsedOutput.regulatoryEnvironment.upcomingChanges.map(
            c => `${c.regulation} (${c.effectiveDate}): ${c.description}`
          ),
        },

        sectorDynamics: {
          competitionIntensity: parsedOutput.sectorDynamics.competitionIntensity,
          consolidationTrend: parsedOutput.sectorDynamics.consolidationTrend,
          barrierToEntry: parsedOutput.sectorDynamics.barrierToEntry,
          typicalExitMultiple: parsedOutput.sectorDynamics.typicalExitMultiple,
          recentExits: parsedOutput.sectorDynamics.recentExits.map(
            e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`
          ),
        },

        sectorQuestions: parsedOutput.sectorQuestions.map(q => ({
          question: q.question,
          category: q.category as "technical" | "business" | "regulatory" | "competitive",
          priority: q.priority,
          expectedAnswer: q.expectedAnswer,
          redFlagAnswer: q.redFlagAnswer,
        })),

        sectorFit: {
          score: parsedOutput.sectorFit.score,
          strengths: parsedOutput.sectorFit.strengths,
          weaknesses: parsedOutput.sectorFit.weaknesses,
          sectorTiming: parsedOutput.sectorFit.sectorTiming,
        },

        sectorScore: parsedOutput.sectorScore,
        executiveSummary: parsedOutput.executiveSummary,
      };

      return {
        agentName: "fintech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed analysis
        _extended: {
          subSector: parsedOutput.subSector,
          unitEconomics: parsedOutput.unitEconomics,
          businessModelFit: parsedOutput.businessModelFit,
          scoreBreakdown: parsedOutput.scoreBreakdown,
          verdict: parsedOutput.verdict,
          regulatoryDetails: {
            licenses: parsedOutput.regulatoryEnvironment.licensesRequired,
            overallRisk: parsedOutput.regulatoryEnvironment.overallRegulatoryRisk,
            verdict: parsedOutput.regulatoryEnvironment.regulatoryVerdict,
          },
          bigTechThreat: parsedOutput.sectorDynamics.bigTechThreat,
        },
      } as SectorExpertResult & { _extended: unknown };

    } catch (error) {
      console.error("[fintech-expert] Execution error:", error);
      return {
        agentName: "fintech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultFintechData(),
      };
    }
  },
};

// ============================================================================
// DEFAULT DATA (fallback)
// ============================================================================

function getDefaultFintechData(): SectorExpertData {
  return {
    sectorName: "Fintech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full fintech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["AML/KYC", "PSD2", "Consumer Credit", "GDPR"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 6, // Placeholder - multiples actuels via recherche web
      recentExits: [], // Exits recents via recherche web, pas hardcodes
    },
    sectorQuestions: [
      {
        question: "What regulatory licenses do you currently hold or are in process of obtaining?",
        category: "regulatory",
        priority: "must_ask",
        expectedAnswer: "Clear list of obtained licenses with jurisdictions",
        redFlagAnswer: "Vague answers or no license strategy",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Fintech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Export for compatibility
export default fintechExpert;
