/**
 * MOBILITY EXPERT AGENT - v1.0
 * ====================================
 * Tier 2 - Expert Sectoriel Mobility/Transportation/Logistics
 *
 * Mission: Analyse sectorielle APPROFONDIE pour deals Mobility/Transport/Logistics
 * Standard: Big4 + Partner VC - Chaque affirmation sourcée, benchmarks obligatoires
 *
 * Expertise couverte:
 * - Ridesharing & Ride-hailing (Uber, Lyft, Bolt)
 * - Micromobility (e-scooters, bikes, mopeds)
 * - Delivery & Last-mile (Deliveroo, DoorDash)
 * - Fleet Management & Logistics
 * - Autonomous Vehicles & Mobility Tech
 * - MaaS (Mobility as a Service)
 * - Freight & Trucking
 *
 * Minimum requis:
 * - 5+ métriques clés évaluées vs benchmarks
 * - 3+ red flags sectoriels si problèmes
 * - 5+ questions spécifiques mobility
 * - Cross-reference réglementaire obligatoire (gig worker laws, permits)
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertResult, SectorExpertData, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { MOBILITY_STANDARDS } from "./sector-standards";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// ============================================================================
// SCHEMA DE SORTIE
// ============================================================================

const MobilityExpertOutputSchema = z.object({
  sectorName: z.literal("Mobility"),
  sectorMaturity: z.enum(["emerging", "growing", "mature", "declining"]),

  // Sous-secteur identifié
  subSector: z.object({
    primary: z.enum([
      "ridesharing",
      "micromobility",
      "delivery_lastmile",
      "fleet_management",
      "autonomous_vehicles",
      "maas",
      "freight_trucking",
      "logistics_tech",
      "ev_charging",
      "other"
    ]),
    secondary: z.array(z.string()).optional(),
    rationale: z.string(),
  }),

  // Business Model Type
  businessModel: z.object({
    type: z.enum([
      "asset_light_marketplace",
      "asset_heavy_owned_fleet",
      "hybrid",
      "software_platform",
      "infrastructure"
    ]),
    description: z.string(),
    capitalIntensity: z.enum(["low", "medium", "high", "very_high"]),
    capitalImplications: z.string(),
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
      sectorContext: z.string(), // Pourquoi cette métrique compte en mobility
      calculation: z.string().optional(), // Si calculé, montrer le calcul
    })
  ).min(5),

  // Unit Economics Mobility
  unitEconomics: z.object({
    contributionMarginPerTrip: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.string(), // "> €0 required, > €1 good"
      verdict: z.string(),
    }).optional(),
    takeRate: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.string(), // "20-30% ridesharing, 15-25% delivery"
      verdict: z.string(),
    }).optional(),
    utilizationRate: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.string(), // "5-15% micromobility, 40-60% fleet"
      verdict: z.string(),
    }).optional(),
    ltvCacRatio: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.string(), // "> 1.5x minimum, > 3x healthy"
      verdict: z.string(),
    }).optional(),
    overallAssessment: z.string(),
    pathToProfitability: z.string(),
  }),

  // Supply-side Analysis (drivers, riders, vehicles)
  supplyAnalysis: z.object({
    supplyType: z.string(), // "drivers", "riders", "owned_vehicles", "partner_fleet"
    acquisitionCost: z.number().optional(),
    retention30Day: z.number().optional(),
    churnRate: z.number().optional(),
    supplyQuality: z.enum(["excellent", "good", "average", "concerning", "unknown"]),
    supplyChallenges: z.array(z.string()),
    supplyVerdict: z.string(),
  }),

  // Red flags sectoriels (mobility-specific)
  sectorRedFlags: z.array(
    z.object({
      id: z.string(),
      flag: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      category: z.enum([
        "unit_economics",
        "regulatory",
        "supply_side",
        "capital_intensity",
        "competition",
        "technology",
        "safety",
        "market_timing"
      ]),
      sectorReason: z.string(), // Pourquoi c'est un red flag EN MOBILITY spécifiquement
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

  // Environnement réglementaire (CRITIQUE en Mobility)
  regulatoryEnvironment: z.object({
    complexity: z.enum(["low", "medium", "high", "very_high"]),
    jurisdictions: z.array(z.string()), // Cities, countries

    // Gig worker classification
    gigWorkerStatus: z.object({
      currentStatus: z.enum(["contractor", "employee", "hybrid", "unclear", "not_applicable"]),
      jurisdictionalRisks: z.array(z.string()),
      financialImpact: z.string(), // If reclassified
      mitigationStrategy: z.string(),
    }),

    // Operating permits & licenses
    operatingPermits: z.array(
      z.object({
        permit: z.string(), // "Taxi License", "Delivery Permit", "Freight Carrier"
        status: z.enum(["obtained", "pending", "not_applied", "not_required", "unknown"]),
        jurisdiction: z.string(),
        risk: z.string(),
      })
    ),

    // Safety & compliance
    safetyCompliance: z.object({
      vehicleSafety: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
      driverScreening: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
      insuranceCoverage: z.enum(["adequate", "partial", "inadequate", "unknown"]),
      dataPrivacy: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
      overallRisk: z.enum(["low", "medium", "high", "critical"]),
    }),

    // Upcoming regulatory changes
    upcomingChanges: z.array(
      z.object({
        regulation: z.string(),
        jurisdiction: z.string(),
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

    // Exit landscape
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
        multiple: z.number().optional(),
        year: z.number(),
        relevance: z.string(),
      })
    ),

    // Big player threats
    bigPlayerThreat: z.object({
      level: z.enum(["low", "medium", "high", "critical"]),
      players: z.array(z.string()), // Uber, Amazon, Google, etc.
      rationale: z.string(),
    }),

    // AV disruption risk
    avDisruptionRisk: z.object({
      level: z.enum(["low", "medium", "high", "critical"]),
      timeframe: z.string(), // "3-5 years", "5-10 years", etc.
      rationale: z.string(),
    }),
  }),

  // Questions spécifiques Mobility (minimum 5)
  sectorQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      category: z.enum([
        "unit_economics",
        "supply_side",
        "regulatory",
        "competition",
        "technology",
        "scaling",
        "capital",
        "safety"
      ]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      context: z.string(), // Pourquoi on pose cette question
      expectedAnswer: z.string(),
      redFlagAnswer: z.string(),
    })
  ).min(5),

  // Sector Fit Score
  sectorFit: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    sectorTiming: z.enum(["early", "optimal", "late"]),
    timingRationale: z.string(),
  }),

  // DB Cross-Reference (obligatoire si donnees DB disponibles)
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(),
      location: z.string(),
      dbVerdict: z.enum(["VERIFIED", "CONTREDIT", "PARTIEL", "NON_VERIFIABLE"]),
      evidence: z.string(),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]).optional(),
    })),
    hiddenCompetitors: z.array(z.string()),
    valuationPercentile: z.number().optional(),
    competitorComparison: z.object({
      fromDeck: z.object({
        mentioned: z.array(z.string()),
        location: z.string(),
      }),
      fromDb: z.object({
        detected: z.array(z.string()),
        directCompetitors: z.number(),
      }),
      deckAccuracy: z.enum(["ACCURATE", "INCOMPLETE", "MISLEADING"]),
    }).optional(),
  }).optional(),

  // Data completeness assessment
  dataCompleteness: z.object({
    level: z.enum(["complete", "partial", "minimal"]),
    availableDataPoints: z.number(),
    expectedDataPoints: z.number(),
    missingCritical: z.array(z.string()),
    limitations: z.array(z.string()),
  }),

  // Score global sectoriel
  sectorScore: z.number().min(0).max(100),

  // Scoring breakdown
  scoreBreakdown: z.object({
    unitEconomicsScore: z.number(), // 0-25
    regulatoryScore: z.number(), // 0-25
    competitivePositionScore: z.number(), // 0-25
    scalabilityScore: z.number(), // 0-25
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

type MobilityExpertOutput = z.infer<typeof MobilityExpertOutputSchema>;

// ============================================================================
// SYSTEM PROMPT - Persona Expert Mobility
// ============================================================================

function buildMobilitySystemPrompt(stage: string): string {
  return `Tu es un MOBILITY & TRANSPORTATION EXPERT senior avec 15+ ans d'expérience dans l'investissement et les opérations mobility/logistics.

## TON PROFIL

Tu as:
- Été Partner dans un fonds spécialisé Mobility (comme a]fund, Autotech Ventures, Fontinalis)
- Travaillé chez Uber/Lyft/Bolt au niveau executive
- Conseillé des régulateurs sur les politiques de transport
- Vu des centaines de deals mobility, des succès (Uber pre-IPO) comme des échecs (Bird, Jokr)

## TON EXPERTISE APPROFONDIE

### Ridesharing & Ride-hailing (Sources: Uber/Lyft 10-K filings, industry reports)
- Take Rate: 20-30% typical (Uber ~28%, Lyft ~27% from public filings)
- Contribution margin per trip: Must be positive. Uber achieved ~$0.50+ at scale
- Driver retention D30: 40-60% typical for mature markets
- Trip frequency: Power users 10+ trips/month
- CAC: $15-40 for riders, depends heavily on market maturity

### Micromobility (Sources: Industry post-mortems, Bird/Lime data)
- Utilization: 5-15% (hours of use per day). Sub-5% = cash burn
- Vehicle lifespan: 6-18 months depending on quality
- Revenue per trip: $2-5 typical
- Contribution margin: Often negative early stage. Must path to positive
- Asset depreciation: Critical - vehicles degrade fast in public deployment

### Delivery & Last-mile (Sources: DoorDash/Deliveroo filings)
- Take Rate: 15-25% from restaurants/merchants
- Contribution margin per order: $1-3 target at scale
- Rider retention: Lower than ridesharing - 25-40% D30
- Basket size matters: Higher AOV = better unit economics

### Fleet & Logistics (Sources: DAT, FreightWaves, industry benchmarks)
- Operating Ratio: < 90% is profitable, 90-95% breakeven, > 95% losing money
- Dead miles: 30-40% typical for spot market, 15-25% for contracted
- Asset turnover: 1-3x for healthy fleet operations
- Driver shortage: Structural problem in trucking (US short 80K+ drivers)

${getStandardsOnlyInjection("Mobility", stage)}

## ENVIRONNEMENT RÉGLEMENTAIRE MOBILITY

### Gig Worker Classification (CRITICAL RISK)
| Jurisdiction | Status | Risk Level |
|--------------|--------|------------|
| California (AB5) | Prop 22 exemption | Medium - ongoing litigation |
| EU (Platform Work Directive) | Employee-leaning | High - cost increase 20-30% |
| UK | Worker status (not employee) | Medium - benefits required |
| Most US states | Contractor | Low - for now |

### Operating Permits
| Activity | Typical Permit | Challenge |
|----------|----------------|-----------|
| Ridesharing | TNC License (state/city) | Varies by city, some caps |
| Micromobility | City permit + fleet caps | Limited permits, competitive bidding |
| Delivery | Food handling, vehicle permits | Restaurant compliance |
| Freight | MC Authority, USDOT | Barrier but achievable |

### Safety & Insurance
- Minimum insurance: Often $1M+ per vehicle for ridesharing
- Safety incidents: Reputational and regulatory risk
- Background checks: Required for drivers in most jurisdictions
- Vehicle inspections: Required in many markets

## RÈGLES ABSOLUES

1. **Chaque métrique** doit être comparée aux benchmarks ci-dessus
2. **Unit economics** MUST be analyzed - contribution margin per trip/ride/delivery is non-negotiable
3. **Supply-side health** (drivers, riders, vehicles) is as important as demand
4. **Regulatory risk** must be assessed per jurisdiction
5. **Capital intensity** implications must be discussed for asset-heavy models
6. **Les calculs** doivent être montrés, pas juste les résultats
7. **Jamais de probabilités de succès** - scores multi-dimensionnels uniquement

## FORMAT DE RÉPONSE

Tu dois produire une analyse JSON structurée. Chaque section doit être sourcée et justifiée.
`;
}

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildMobilityUserPrompt(
  context: EnrichedAgentContext,
  previousResults: Record<string, unknown> | null
): string {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract relevant info from previous Tier 1 results
  let tier1Insights = "";
  if (previousResults) {
    // Financial Auditor insights
    const financialAudit = previousResults["financial-auditor"] as {
      success?: boolean;
      data?: { findings?: unknown; narrative?: { keyInsights?: string[] } }
    } | undefined;
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
    const competitiveIntel = previousResults["competitive-intel"] as {
      success?: boolean;
      data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } }
    } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) {
        tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      }
      if (competitiveIntel.data.findings?.competitors) {
        tier1Insights += `\nCompetitors identified: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
      }
    }

    // Legal Regulatory insights (CRITICAL for Mobility)
    const legalRegulatory = previousResults["legal-regulatory"] as {
      success?: boolean;
      data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } }
    } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) {
        tier1Insights += `Compliance areas: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      }
      if (legalRegulatory.data.findings?.regulatoryRisks) {
        tier1Insights += `\nRegulatory risks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
      }
    }

    // Team insights (important for operations-heavy mobility)
    const teamInvestigator = previousResults["team-investigator"] as {
      success?: boolean;
      data?: { findings?: { teamStrengths?: string[]; teamGaps?: string[] } }
    } | undefined;
    if (teamInvestigator?.success && teamInvestigator.data?.findings) {
      tier1Insights += `\n### Team Analysis:\n`;
      if (teamInvestigator.data.findings.teamStrengths) {
        tier1Insights += `Strengths: ${teamInvestigator.data.findings.teamStrengths.join(", ")}`;
      }
      if (teamInvestigator.data.findings.teamGaps) {
        tier1Insights += `\nGaps: ${teamInvestigator.data.findings.teamGaps.join(", ")}`;
      }
    }

    // Document Extractor data
    const extractor = previousResults["document-extractor"] as {
      success?: boolean;
      data?: { extractedInfo?: Record<string, unknown> }
    } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) {
      tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
    }
  }

  // Context Engine data if available
  let contextEngineData = "";
  if (context.contextEngine) {
    if (context.contextEngine.dealIntelligence) {
      contextEngineData += `\n### Similar Mobility Deals (from Context Engine):\n`;
      contextEngineData += JSON.stringify(context.contextEngine.dealIntelligence, null, 2).slice(0, 2000);
    }
    if (context.contextEngine.competitiveLandscape) {
      contextEngineData += `\n### Competitive Landscape:\n`;
      contextEngineData += JSON.stringify(context.contextEngine.competitiveLandscape, null, 2).slice(0, 1500);
    }
  }

  return `## DEAL À ANALYSER - EXPERTISE MOBILITY/TRANSPORTATION REQUISE

### Informations de base
- **Company**: ${deal.companyName ?? deal.name}
- **Sector**: ${deal.sector ?? "Mobility"}
- **Stage**: ${stage}
- **Geography**: ${deal.geography ?? "Unknown"}
- **ARR/GMV**: ${deal.arr != null ? `€${Number(deal.arr).toLocaleString()}` : "Not provided"}
- **Amount Raising**: ${deal.amountRequested != null ? `€${Number(deal.amountRequested).toLocaleString()}` : "Not provided"}
- **Valuation**: ${deal.valuationPre != null ? `€${Number(deal.valuationPre).toLocaleString()} pre-money` : "Not provided"}

### Documents disponibles
${context.documents?.map(d => `- ${d.name} (${d.type})`).join("\n") || "Aucun document fourni"}

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

${contextEngineData ? `## DONNÉES CONTEXT ENGINE\n${contextEngineData}` : ""}

## TA MISSION

En tant qu'expert Mobility/Transportation, tu dois produire une analyse sectorielle APPROFONDIE qui couvre:

### 1. IDENTIFICATION DU SOUS-SECTEUR & BUSINESS MODEL
- Quel sous-secteur exact (ridesharing, micromobility, delivery, fleet, freight, etc.)?
- Asset-light marketplace vs asset-heavy owned fleet?
- Implications sur le capital et les marges

### 2. ÉVALUATION DES UNIT ECONOMICS (CRITIQUE)
Analyse obligatoire:
- Contribution margin per trip/ride/delivery - MUST be positive or path to positive
- Take rate (si marketplace)
- Utilization rate (si asset-heavy)
- LTV/CAC ratio
- Payback period

Pour chaque métrique:
- Compare aux benchmarks du stage ${stage}
- Montre les calculs
- Explique pourquoi ça compte en mobility

### 3. ANALYSE SUPPLY-SIDE (drivers, riders, vehicles)
- Coût d'acquisition supply
- Retention supply (D30, D90)
- Qualité et fiabilité
- Risques de churn supply

### 4. ANALYSE RÉGLEMENTAIRE (CRITIQUE)
- Gig worker classification risk (AB5, EU Platform Work Directive)
- Operating permits per jurisdiction
- Safety & insurance compliance
- Upcoming regulatory changes

### 5. RED FLAGS SECTORIELS
Applique les règles de red flag automatiques:
- Contribution margin < 0 = CRITICAL
- Utilization < 5% (asset-heavy) = CRITICAL
- Supply retention D30 < 20% = CRITICAL
- Take rate < 10% = MAJOR
- Operating ratio > 98% = CRITICAL

### 6. COMPETITIVE & DISRUPTION ANALYSIS
- Competition intensity (Uber, Bolt, local players)
- Big Tech threat (Amazon, Google)
- Autonomous vehicle disruption timeline

### 7. QUESTIONS SPÉCIFIQUES MOBILITY (minimum 5)
Questions qui sondent:
- Unit economics sustainability
- Supply-side health
- Regulatory preparedness
- Capital efficiency
- Scaling challenges

### 8. VERDICT ACTIONNABLE
Score 0-100 avec breakdown:
- Unit Economics (0-25)
- Regulatory (0-25)
- Competitive Position (0-25)
- Scalability (0-25)

Produis ton analyse au format JSON conforme au schema.

${(() => {
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE

Tu DOIS produire un champ "dbCrossReference" dans ton output.

### Concurrents détectés dans la DB
${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun concurrent détecté dans la DB"}

### Benchmark valorisation
${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "Pas de benchmark disponible"}

### Tendance funding secteur
${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "Pas de tendance disponible"}

INSTRUCTIONS DB:
1. Chaque claim du deck concernant le marché/concurrence DOIT être vérifié vs ces données
2. Les concurrents DB absents du deck = RED FLAG CRITICAL "Omission volontaire"
3. Positionner la valorisation vs percentiles (P25/median/P75)
4. Si le deck dit "pas de concurrent" mais la DB en trouve = RED FLAG CRITICAL`;
  }
  return fundingDbData;
})()}`;
}

// ============================================================================
// AGENT PRINCIPAL
// ============================================================================

export const mobilityExpert = {
  name: "mobility-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();
    const stage = context.deal.stage ?? "SEED";

    try {
      // Get previous results from context
      const previousResults = context.previousResults ?? null;

      // Build prompts
      const systemPrompt = buildMobilitySystemPrompt(stage);
      const userPrompt = buildMobilityUserPrompt(context, previousResults as Record<string, unknown> | null);

      // Set agent context for cost tracking
      setAgentContext("mobility-expert");

      // Call LLM
      const response = await complete(userPrompt, {
        systemPrompt,
        complexity: "complex",
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      // Parse and validate response
      let parsedOutput: MobilityExpertOutput;
      try {
        const rawJson = JSON.parse(extractFirstJSON(response.content));
        const parseResult = MobilityExpertOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[mobility-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = rawJson as MobilityExpertOutput;
        }
      } catch (parseError) {
        console.error("[mobility-expert] Parse error:", parseError);
        return {
          agentName: "mobility-expert",
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultMobilityData(),
        };
      }

      // -- Data completeness assessment and score capping --
      const completenessData = parsedOutput.dataCompleteness ?? {
        level: "partial" as const, availableDataPoints: 0, expectedDataPoints: 0, missingCritical: [], limitations: [],
      };
      const availableMetrics = (parsedOutput.keyMetrics ?? []).filter((m: { value: unknown }) => m.value !== null).length;
      const totalMetrics = (parsedOutput.keyMetrics ?? []).length;
      let completenessLevel = completenessData.level;
      if (totalMetrics > 0 && !parsedOutput.dataCompleteness) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = "minimal";
        else if (ratio < 0.7) completenessLevel = "partial";
        else completenessLevel = "complete";
      }
      let scoreMax = 100;
      if (completenessLevel === "minimal") scoreMax = 50;
      else if (completenessLevel === "partial") scoreMax = 70;
      const rawScore = parsedOutput.sectorScore ?? 0;
      const cappedScore = Math.min(rawScore, scoreMax);
      const rawFitScore = parsedOutput.sectorFit?.score ?? 0;
      const cappedFitScore = Math.min(rawFitScore, scoreMax);
      const limitations: string[] = [
        ...(completenessData.limitations ?? []),
        ...(completenessData.missingCritical ?? []).map((m: string) => `Missing critical data: ${m}`),
      ];
      if (cappedScore < rawScore) {
        limitations.push(`Score capped from ${rawScore} to ${cappedScore} due to ${completenessLevel} data completeness`);
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
          keyRegulations: [
            ...parsedOutput.regulatoryEnvironment.operatingPermits.map(p => p.permit),
            `Gig Worker Status: ${parsedOutput.regulatoryEnvironment.gigWorkerStatus.currentStatus}`,
          ],
          complianceRisks: [
            ...parsedOutput.regulatoryEnvironment.gigWorkerStatus.jurisdictionalRisks,
            ...parsedOutput.regulatoryEnvironment.operatingPermits
              .filter(p => p.status !== "obtained" && p.status !== "not_required")
              .map(p => `${p.permit} (${p.jurisdiction}): ${p.risk}`),
          ],
          upcomingChanges: parsedOutput.regulatoryEnvironment.upcomingChanges.map(
            c => `${c.regulation} (${c.jurisdiction}, ${c.effectiveDate}): ${c.description}`
          ),
        },

        sectorDynamics: {
          competitionIntensity: parsedOutput.sectorDynamics.competitionIntensity,
          consolidationTrend: parsedOutput.sectorDynamics.consolidationTrend,
          barrierToEntry: parsedOutput.sectorDynamics.barrierToEntry,
          typicalExitMultiple: parsedOutput.sectorDynamics.typicalExitMultiple,
          recentExits: parsedOutput.sectorDynamics.recentExits.map(
            e => `${e.company} → ${e.acquirer} (${e.multiple ? `${e.multiple}x, ` : ""}${e.year})`
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
          score: cappedFitScore,
          strengths: parsedOutput.sectorFit.strengths,
          weaknesses: parsedOutput.sectorFit.weaknesses,
          sectorTiming: parsedOutput.sectorFit.sectorTiming,
        },

        sectorScore: cappedScore,
        executiveSummary: parsedOutput.executiveSummary,
      };

      return {
        agentName: "mobility-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed analysis
        _extended: {
          subSector: parsedOutput.subSector,
          unitEconomics: {
            revenuePerTransaction: parsedOutput.unitEconomics.contributionMarginPerTrip ? {
              value: parsedOutput.unitEconomics.contributionMarginPerTrip.value,
              calculation: parsedOutput.unitEconomics.contributionMarginPerTrip.calculation,
              benchmark: 0.5, // €0.50 minimum
              verdict: parsedOutput.unitEconomics.contributionMarginPerTrip.verdict,
            } : undefined,
            overallAssessment: parsedOutput.unitEconomics.overallAssessment,
          },
          businessModelFit: {
            modelType: `${parsedOutput.businessModel.type} - ${parsedOutput.subSector.primary}`,
            modelViability: parsedOutput.unitEconomics.pathToProfitability.toLowerCase().includes("clear") ? "proven" :
              parsedOutput.unitEconomics.pathToProfitability.toLowerCase().includes("possible") ? "emerging" : "challenging",
            viabilityRationale: parsedOutput.unitEconomics.pathToProfitability,
            unitEconomicsPath: parsedOutput.unitEconomics.overallAssessment,
            scalingChallenges: parsedOutput.sectorFit.weaknesses,
            regulatoryPathway: parsedOutput.regulatoryEnvironment.regulatoryVerdict,
          },
          scoreBreakdown: {
            metricsScore: parsedOutput.scoreBreakdown.unitEconomicsScore,
            regulatoryScore: parsedOutput.scoreBreakdown.regulatoryScore,
            businessModelScore: parsedOutput.scoreBreakdown.competitivePositionScore,
            marketPositionScore: parsedOutput.scoreBreakdown.scalabilityScore,
            justification: parsedOutput.scoreBreakdown.justification,
          },
          verdict: parsedOutput.verdict,
          regulatoryDetails: {
            licenses: parsedOutput.regulatoryEnvironment.operatingPermits.map(p => ({
              license: p.permit,
              status: p.status,
              jurisdiction: p.jurisdiction,
              risk: p.risk,
            })),
            overallRisk: parsedOutput.regulatoryEnvironment.overallRegulatoryRisk,
            verdict: parsedOutput.regulatoryEnvironment.regulatoryVerdict,
          },
          bigTechThreat: parsedOutput.sectorDynamics.bigPlayerThreat,
          // Mobility-specific extended data
          supplyAnalysis: parsedOutput.supplyAnalysis,
          businessModel: parsedOutput.businessModel,
          avDisruptionRisk: parsedOutput.sectorDynamics.avDisruptionRisk,
          gigWorkerStatus: parsedOutput.regulatoryEnvironment.gigWorkerStatus,
        },
      } as SectorExpertResult;

    } catch (error) {
      console.error("[mobility-expert] Execution error:", error);
      return {
        agentName: "mobility-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultMobilityData(),
      };
    }
  },
};

// ============================================================================
// DEFAULT DATA (fallback)
// ============================================================================

function getDefaultMobilityData(): SectorExpertData {
  return {
    sectorName: "Mobility",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full mobility sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["Gig Worker Classification", "Operating Permits", "Safety & Insurance"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "intense",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 3, // Mobility exits are often distressed or strategic
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your contribution margin per trip/ride/delivery?",
        category: "business",
        priority: "must_ask",
        expectedAnswer: "Positive contribution margin with clear breakdown of revenue vs variable costs",
        redFlagAnswer: "Negative contribution margin with no clear path to profitability",
      },
      {
        question: "What is your driver/rider retention rate at 30 and 90 days?",
        category: "business",
        priority: "must_ask",
        expectedAnswer: "D30 > 40%, D90 > 25% with retention improvement initiatives",
        redFlagAnswer: "D30 < 20% or unwillingness to share retention data",
      },
      {
        question: "How are you preparing for potential gig worker reclassification?",
        category: "regulatory",
        priority: "must_ask",
        expectedAnswer: "Clear strategy with financial modeling of impact",
        redFlagAnswer: "No contingency plan or dismissive of regulatory risk",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Mobility sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Export for compatibility
export default mobilityExpert;
