/**
 * LEGALTECH EXPERT AGENT - v2.0
 * ====================================
 * Tier 2 - Expert Sectoriel LegalTech
 *
 * Mission: Analyse sectorielle APPROFONDIE pour deals LegalTech/RegTech/Compliance
 * Standard: Big4 + Partner VC - Chaque affirmation sourcee, benchmarks obligatoires
 *
 * Expertise couverte:
 * - Legal Practice Management (LPM, case management)
 * - Contract Lifecycle Management (CLM, document automation)
 * - Legal Research & Analytics (AI/NLP for legal)
 * - E-Discovery & Litigation Support
 * - Compliance & RegTech
 * - Legal Marketplaces & Alternative Legal Services
 *
 * Specificites LegalTech:
 * - BAR REGULATIONS: Unauthorized Practice of Law (UPL) risk
 * - LONG SALES CYCLES: Law firms are notoriously slow adopters
 * - ATTORNEY-CLIENT PRIVILEGE: Data handling requirements
 * - JURISDICTION FRAGMENTATION: Rules vary by state/country
 * - AI HALLUCINATION RISK: Critical for legal research tools
 *
 * Minimum requis:
 * - 5+ metriques cles evaluees vs benchmarks
 * - 3+ red flags sectoriels si problemes
 * - 5+ questions specifiques legaltech
 * - Cross-reference reglementaire obligatoire (Bar rules)
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertResult, SectorExpertData, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// SCHEMA DE SORTIE
// ============================================================================

const LegaltechExpertOutputSchema = z.object({
  sectorName: z.literal("LegalTech"),
  sectorMaturity: z.enum(["emerging", "growing", "mature", "declining"]),

  // Sous-secteur identifie
  subSector: z.object({
    primary: z.enum([
      "practice_management",
      "contract_lifecycle_management",
      "document_automation",
      "legal_research",
      "e_discovery",
      "compliance_regtech",
      "litigation_analytics",
      "legal_marketplace",
      "billing_invoicing",
      "ip_management",
      "other"
    ]),
    secondary: z.array(z.string()).optional(),
    rationale: z.string(),
  }),

  // Target customer segment
  targetSegment: z.object({
    primary: z.enum(["biglaw", "midmarket_law", "smb_law", "corporate_legal", "solo_practitioners", "government", "consumers"]),
    characteristics: z.string(),
    marketSizeEstimate: z.string(),
    salesComplexity: z.enum(["very_high", "high", "medium", "low"]),
    salesCycleMonths: z.number().optional(),
  }),

  // Metriques cles evaluees (minimum 5)
  keyMetrics: z.array(
    z.object({
      metricName: z.string(),
      value: z.union([z.number(), z.string(), z.null()]),
      unit: z.string(),
      source: z.string(),
      sectorBenchmark: z.object({
        p25: z.number(),
        median: z.number(),
        p75: z.number(),
        topDecile: z.number(),
      }),
      percentile: z.number().optional(),
      assessment: z.enum(["exceptional", "above_average", "average", "below_average", "concerning"]),
      sectorContext: z.string(),
      calculation: z.string().optional(),
    })
  ).min(5),

  // Unit Economics LegalTech
  unitEconomics: z.object({
    revenuePerSeat: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      benchmark: z.string(),
      verdict: z.string(),
    }).optional(),
    implementationRevenue: z.object({
      percentOfACV: z.number().optional(),
      benchmark: z.string(),
      verdict: z.string(),
    }).optional(),
    professionalServicesRatio: z.object({
      value: z.number().optional(),
      benchmark: z.string(),
      riskAssessment: z.string(),
    }).optional(),
    customerConcentration: z.object({
      top10Percent: z.number().optional(),
      assessment: z.string(),
      risk: z.enum(["low", "medium", "high", "critical"]),
    }).optional(),
    overallAssessment: z.string(),
  }),

  // Adoption & Stickiness (CRITICAL in LegalTech)
  adoptionAnalysis: z.object({
    userAdoptionRate: z.object({
      value: z.number().optional(),
      calculation: z.string().optional(),
      sectorContext: z.string(),
    }),
    timeSavedMetric: z.object({
      claimed: z.string().optional(),
      verified: z.boolean(),
      evidence: z.string(),
    }),
    workflowIntegration: z.object({
      level: z.enum(["deep", "moderate", "shallow", "standalone"]),
      integratedWith: z.array(z.string()),
      switchingCostAssessment: z.string(),
    }),
    lawyerResistance: z.object({
      riskLevel: z.enum(["low", "medium", "high", "very_high"]),
      mitigationStrategies: z.array(z.string()),
      evidence: z.string(),
    }),
  }),

  // Red flags sectoriels (legaltech-specific)
  sectorRedFlags: z.array(
    z.object({
      id: z.string(),
      flag: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      category: z.enum([
        "upl_risk",
        "bar_compliance",
        "privilege_data",
        "ai_accuracy",
        "adoption",
        "sales_cycle",
        "competition",
        "regulatory",
        "business_model"
      ]),
      sectorReason: z.string(),
      evidence: z.string(),
      benchmarkViolated: z.string().optional(),
      impact: z.string(),
      question: z.string(),
      redFlagIfBadAnswer: z.string(),
    })
  ),

  // Opportunites sectorielles
  sectorOpportunities: z.array(
    z.object({
      opportunity: z.string(),
      potential: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
      timeframe: z.string(),
      prerequisites: z.array(z.string()),
    })
  ),

  // BAR & Legal Regulatory Environment (CRITICAL)
  regulatoryEnvironment: z.object({
    complexity: z.enum(["low", "medium", "high", "very_high"]),
    jurisdictions: z.array(z.string()),

    // UPL Risk Assessment
    uplRisk: z.object({
      level: z.enum(["none", "low", "medium", "high", "critical"]),
      assessment: z.string(),
      activitiesAtRisk: z.array(z.string()),
      mitigations: z.array(z.string()),
    }),

    // Bar Compliance
    barCompliance: z.object({
      relevantRules: z.array(z.string()),
      complianceStatus: z.enum(["compliant", "partial", "unclear", "non_compliant"]),
      evidence: z.string(),
    }),

    // Data & Privilege Handling
    privilegeHandling: z.object({
      dataResidency: z.enum(["compliant", "partial", "unknown", "non_compliant"]),
      encryptionStandard: z.string(),
      accessControls: z.string(),
      auditTrail: z.boolean(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]),
    }),

    // Compliance areas
    complianceAreas: z.array(
      z.object({
        area: z.string(),
        status: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
        evidence: z.string(),
        risk: z.enum(["critical", "high", "medium", "low"]),
      })
    ),

    // Upcoming changes
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

  // AI/Technology Assessment (if applicable)
  aiAssessment: z.object({
    usesAI: z.boolean(),
    aiComponents: z.array(z.string()),
    hallucinationRisk: z.object({
      level: z.enum(["low", "medium", "high", "critical", "not_applicable"]),
      mitigations: z.array(z.string()),
      assessment: z.string(),
    }),
    accuracyClaims: z.object({
      claimed: z.string().optional(),
      verified: z.boolean(),
      methodology: z.string(),
    }),
    humanInTheLoop: z.object({
      present: z.boolean(),
      description: z.string(),
      adequacy: z.enum(["strong", "adequate", "weak", "absent"]),
    }),
  }).optional(),

  // Dynamiques sectorielles
  sectorDynamics: z.object({
    competitionIntensity: z.enum(["low", "medium", "high", "intense"]),
    competitionRationale: z.string(),
    incumbentPower: z.object({
      level: z.enum(["dominant", "strong", "moderate", "weak"]),
      keyPlayers: z.array(z.string()),
      threatAssessment: z.string(),
    }),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating"]),
    consolidationEvidence: z.string(),
    barrierToEntry: z.enum(["low", "medium", "high", "very_high"]),
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

  // Questions specifiques LegalTech (minimum 5)
  sectorQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      category: z.enum([
        "upl_compliance",
        "bar_regulations",
        "data_privilege",
        "ai_accuracy",
        "adoption_resistance",
        "sales_cycle",
        "unit_economics",
        "competitive",
        "integration"
      ]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      context: z.string(),
      expectedAnswer: z.string(),
      redFlagAnswer: z.string(),
    })
  ).min(5),

  // Business Model Fit
  businessModelFit: z.object({
    modelType: z.string(),
    modelViability: z.enum(["proven", "emerging", "unproven", "challenging"]),
    viabilityRationale: z.string(),
    pricingModel: z.enum(["per_seat", "usage_based", "matter_based", "hybrid", "freemium", "other"]),
    pricingAssessment: z.string(),
    servicesIntensity: z.object({
      level: z.enum(["high", "medium", "low"]),
      impact: z.string(),
      scalabilityRisk: z.string(),
    }),
    scalingChallenges: z.array(z.string()),
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
    metricsScore: z.number(),
    adoptionScore: z.number(),
    regulatoryScore: z.number(),
    businessModelScore: z.number(),
    marketPositionScore: z.number(),
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

type LegaltechExpertOutput = z.infer<typeof LegaltechExpertOutputSchema>;

// ============================================================================
// SYSTEM PROMPT - Persona Expert LegalTech
// ============================================================================

function buildLegaltechSystemPrompt(stage: string): string {
  return `Tu es un LEGALTECH EXPERT senior avec 15+ ans d'experience dans la legal technology et l'investissement dans ce secteur.

## TON PROFIL

Tu as:
- Ete Partner dans un fonds specialise LegalTech (Bessemer, Insight niveau)
- Travaille comme General Counsel dans un AmLaw 100
- Conseille des startups LegalTech sur leur strategie go-to-market
- Vu des centaines de deals legaltech, des succes comme des echecs
- Une comprehension profonde des reglementations Bar et de l'UPL

## TON EXPERTISE APPROFONDIE

### Legal Practice Management (LPM)
- Case/matter management systems
- Time tracking & billing
- Client portals
- Calendaring & docketing
- KPIs: Matters per user, billable hour capture rate, realization rate

### Contract Lifecycle Management (CLM)
- Contract creation & templates
- Negotiation & redlining
- Obligation management
- Repository & search
- KPIs: Contract cycle time, contract value managed, clause library utilization

### Legal Research & Analytics
- AI-powered research (CRITICAL: hallucination risk)
- Citation analysis
- Litigation analytics & prediction
- KPIs: Research time reduction, accuracy rate, citation coverage

### E-Discovery
- Document review
- Predictive coding
- Legal hold management
- KPIs: Cost per GB reviewed, review accuracy, TAR effectiveness

### Compliance & RegTech
- Regulatory monitoring
- Policy management
- Ethics & conflicts checking
- KPIs: Compliance coverage %, audit findings, regulatory changes tracked

### Legal Marketplaces
- Lawyer matching
- Fixed-fee services
- Alternative Legal Service Providers (ALSPs)
- KPIs: Take rate, transaction volume, repeat usage

${getStandardsOnlyInjection("LegalTech", stage)}

## BENCHMARKS LEGALTECH (Recherche web obligatoire pour donnees actuelles)

### Metriques financieres par segment (indicatifs - verifier en temps reel):
| Segment | ARR median Seed | ARR median Series A | NRR typique | Gross Margin |
|---------|-----------------|---------------------|-------------|--------------|
| CLM Enterprise | $500K-1M | $2-5M | 110-120% | 75-85% |
| LPM SMB | $200K-500K | $1-2M | 95-105% | 70-80% |
| Legal Research | $300K-800K | $1.5-3M | 105-115% | 80-90% |
| E-Discovery | $500K-1.5M | $3-8M | 100-110% | 60-75% |

### Cycles de vente typiques:
| Segment cible | Cycle moyen | Range |
|---------------|-------------|-------|
| BigLaw (AmLaw 100) | 9-18 mois | 6-24 mois |
| Midmarket Law | 3-6 mois | 2-9 mois |
| Corporate Legal | 6-12 mois | 3-18 mois |
| SMB/Solo | 1-3 mois | 2 semaines - 6 mois |

### Pricing typique:
| Modele | Range | Notes |
|--------|-------|-------|
| Per seat (SMB) | $50-200/user/month | Solo/small firms |
| Per seat (Enterprise) | $500-2000/user/month | BigLaw, corporate |
| Matter-based | $5-50/matter | E-discovery, litigation |
| Platform fee | 15-30% take rate | Marketplaces |

## RISQUES SPECIFIQUES LEGALTECH (CRITIQUE)

### 1. UNAUTHORIZED PRACTICE OF LAW (UPL)
- **Definition**: Providing legal advice without being a licensed attorney
- **Risk**: State bar action, product shutdown, liability
- **Red flags**: AI giving specific legal advice, drafting binding documents without lawyer review
- **Mitigation**: "Information, not advice" disclaimers, lawyer-in-the-loop, bar advisory opinions

### 2. ATTORNEY-CLIENT PRIVILEGE
- **Risk**: Data breaches exposing privileged communications
- **Requirements**: SOC 2 Type II, encryption at rest/transit, access controls, audit trails
- **Red flags**: No security certifications, cloud storage without controls, third-party data access

### 3. BAR REGULATIONS
- **ABA Model Rules**: 1.1 (Competence), 1.6 (Confidentiality), 5.3 (Supervision), 5.5 (UPL)
- **Varies by state**: California, New York, Texas have different rules
- **Red flags**: Operating without bar guidance, fee-sharing with non-lawyers

### 4. AI HALLUCINATION RISK (Legal Research)
- **Context**: Lawyers citing non-existent cases (see: Mata v. Avianca 2023)
- **Requirements**: Citation verification, human review, confidence scoring
- **Red flags**: No accuracy metrics, no human-in-the-loop, bold accuracy claims without methodology

### 5. LAWYER ADOPTION RESISTANCE
- **Reality**: Lawyers are notoriously conservative adopters
- **Stats**: ~30-40% of legaltech implementations fail due to poor adoption
- **Success factors**: Strong training, change management, champion programs
- **Red flags**: No adoption metrics, no customer success team, low engagement rates

## REGLES ABSOLUES

1. **Chaque metrique** doit etre comparee aux benchmarks du segment
2. **Chaque red flag** doit citer le seuil viole et l'impact business
3. **Le statut UPL/Bar** est CRITIQUE - pas de position claire = risque existentiel
4. **L'adoption lawyers** est un make-or-break - toujours evaluer
5. **Les calculs** doivent etre montres, pas juste les resultats
6. **Les questions** doivent sonder les risques specifiques legaltech
7. **Jamais de probabilites de succes** - scores multi-dimensionnels uniquement
8. **AI accuracy claims** doivent etre verifiees avec methodologie

## FORMAT DE REPONSE

Tu dois produire une analyse JSON structuree. Chaque section doit etre sourcee et justifiee.
N'invente JAMAIS de donnees. Si une information manque, indique-le clairement.`;
}

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildLegaltechUserPrompt(
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

    // Legal Regulatory insights (important for LegalTech meta-analysis)
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

    // Technical DD insights (for AI assessment) - Split into Stack and Ops
    const techStackDD = previousResults["tech-stack-dd"] as { success?: boolean; data?: { findings?: unknown } } | undefined;
    if (techStackDD?.success && techStackDD.data?.findings) {
      tier1Insights += `\n### Tech Stack DD Findings:\n${JSON.stringify(techStackDD.data.findings, null, 2).slice(0, 1000)}`;
    }
    const techOpsDD = previousResults["tech-ops-dd"] as { success?: boolean; data?: { findings?: unknown } } | undefined;
    if (techOpsDD?.success && techOpsDD.data?.findings) {
      tier1Insights += `\n### Tech Ops DD Findings:\n${JSON.stringify(techOpsDD.data.findings, null, 2).slice(0, 1000)}`;
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
      contextEngineData += `\n### Similar LegalTech Deals (from Context Engine):\n`;
      contextEngineData += JSON.stringify(context.contextEngine.dealIntelligence, null, 2).slice(0, 2000);
    }
    if (context.contextEngine.competitiveLandscape) {
      contextEngineData += `\n### Competitive Landscape:\n`;
      contextEngineData += JSON.stringify(context.contextEngine.competitiveLandscape, null, 2).slice(0, 1500);
    }
  }

  return `## DEAL A ANALYSER - EXPERTISE LEGALTECH REQUISE

### Informations de base
- **Company**: ${deal.companyName ?? deal.name}
- **Sector**: ${deal.sector ?? "LegalTech"}
- **Stage**: ${stage}
- **Geography**: ${deal.geography ?? "Unknown"}
- **ARR**: ${deal.arr ? `EUR${deal.arr.toLocaleString()}` : "Not provided"}
- **Amount Raising**: ${deal.amountRequested ? `EUR${deal.amountRequested.toLocaleString()}` : "Not provided"}
- **Valuation**: ${deal.valuationPre ? `EUR${deal.valuationPre.toLocaleString()} pre-money` : "Not provided"}

### Documents disponibles
${context.documents?.map(d => `- ${d.name} (${d.type})`).join("\n") || "Aucun document fourni"}

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

${contextEngineData ? `## DONNEES CONTEXT ENGINE\n${contextEngineData}` : ""}

## TA MISSION

En tant qu'expert LegalTech, tu dois produire une analyse sectorielle APPROFONDIE qui couvre:

### 1. IDENTIFICATION DU SOUS-SECTEUR
Identifie precisement le sous-secteur legaltech (CLM, practice management, legal research, etc.) et ses implications.

### 2. SEGMENT CIBLE
Determine le segment cible (BigLaw, midmarket, SMB, corporate legal, etc.) et les implications sur:
- Cycle de vente attendu
- Pricing power
- Complexite de l'implementation

### 3. EVALUATION DES METRIQUES CLES (minimum 5)
Pour chaque metrique disponible:
- Compare aux benchmarks du stage ${stage} et du segment
- Calcule le percentile
- Explique pourquoi cette metrique compte en legaltech
- Montre les calculs si applicable

### 4. ANALYSE ADOPTION (CRITIQUE)
- Quel est le taux d'adoption reel par les utilisateurs (lawyers)?
- Quelle est la resistance au changement observee?
- Quelles strategies de change management sont en place?
- L'outil est-il integre dans les workflows existants?

### 5. ANALYSE REGLEMENTAIRE (CRITIQUE)
- Y a-t-il un risque UPL (Unauthorized Practice of Law)?
- Quel est le statut de conformite Bar?
- Comment les donnees privilegiees sont-elles traitees?
- Certifications de securite (SOC 2, etc.)?

### 6. EVALUATION AI (si applicable)
- L'outil utilise-t-il de l'IA pour le legal?
- Quel est le risque d'hallucination?
- Y a-t-il un human-in-the-loop?
- Les claims d'accuracy sont-elles verifiees?

### 7. RED FLAGS SECTORIELS
Applique les regles de red flag automatiques definies dans les standards sectoriels.
Verifie au minimum: UPL risk, adoption rate, sales cycle, services intensity.

### 8. QUESTIONS SPECIFIQUES LEGALTECH (minimum 5)
Genere des questions qui sondent les risques specifiques:
- UPL et conformite Bar
- Adoption et resistance lawyers
- Traitement des donnees privilegiees
- Accuracy AI (si applicable)
- Unit economics et services intensity

### 9. VERDICT ACTIONNABLE
Score 0-100 avec breakdown par dimension:
- Metriques (0-20)
- Adoption (0-20)
- Reglementaire (0-20)
- Business Model (0-20)
- Position Marche (0-20)

Produis ton analyse au format JSON conforme au schema.`;
}

// ============================================================================
// AGENT PRINCIPAL
// ============================================================================

export const legaltechExpert = {
  name: "legaltech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();
    const stage = context.deal.stage ?? "SEED";

    try {
      // Get previous results from context
      const previousResults = context.previousResults ?? null;

      // Build prompts
      const systemPrompt = buildLegaltechSystemPrompt(stage);
      const userPrompt = buildLegaltechUserPrompt(context, previousResults as Record<string, unknown> | null);

      // Set agent context for cost tracking
      setAgentContext("legaltech-expert");

      // Call LLM
      const response = await complete(userPrompt, {
        systemPrompt,
        complexity: "complex",
        maxTokens: 8000,
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: LegaltechExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        parsedOutput = LegaltechExpertOutputSchema.parse(JSON.parse(jsonMatch[0]));
      } catch (parseError) {
        console.error("[legaltech-expert] Parse error:", parseError);
        return {
          agentName: "legaltech-expert",
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultLegaltechData(),
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
          keyRegulations: [
            ...parsedOutput.regulatoryEnvironment.barCompliance.relevantRules,
            ...parsedOutput.regulatoryEnvironment.complianceAreas.map(c => c.area),
          ],
          complianceRisks: [
            ...parsedOutput.regulatoryEnvironment.uplRisk.activitiesAtRisk,
            ...parsedOutput.regulatoryEnvironment.complianceAreas
              .filter(c => c.status !== "compliant")
              .map(c => `${c.area}: ${c.evidence}`),
          ],
          upcomingChanges: parsedOutput.regulatoryEnvironment.upcomingChanges.map(
            c => `${c.regulation} (${c.effectiveDate}): ${c.description}`
          ),
        },

        sectorDynamics: {
          competitionIntensity: parsedOutput.sectorDynamics.competitionIntensity,
          consolidationTrend: parsedOutput.sectorDynamics.consolidationTrend,
          barrierToEntry: parsedOutput.sectorDynamics.barrierToEntry === "very_high" ? "high" : parsedOutput.sectorDynamics.barrierToEntry,
          typicalExitMultiple: parsedOutput.sectorDynamics.typicalExitMultiple,
          recentExits: parsedOutput.sectorDynamics.recentExits.map(
            e => `${e.company} -> ${e.acquirer} (${e.multiple}x, ${e.year})`
          ),
        },

        sectorQuestions: parsedOutput.sectorQuestions.map(q => ({
          question: q.question,
          category: mapQuestionCategory(q.category),
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
        agentName: "legaltech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed analysis
        _extended: {
          subSector: parsedOutput.subSector,
          targetSegment: parsedOutput.targetSegment,
          unitEconomics: parsedOutput.unitEconomics,
          adoptionAnalysis: parsedOutput.adoptionAnalysis,
          aiAssessment: parsedOutput.aiAssessment,
          businessModelFit: {
            modelType: parsedOutput.businessModelFit.modelType,
            modelViability: parsedOutput.businessModelFit.modelViability,
            viabilityRationale: parsedOutput.businessModelFit.viabilityRationale,
            unitEconomicsPath: parsedOutput.businessModelFit.pricingAssessment,
            scalingChallenges: parsedOutput.businessModelFit.scalingChallenges,
            regulatoryPathway: parsedOutput.regulatoryEnvironment.regulatoryVerdict,
          },
          scoreBreakdown: parsedOutput.scoreBreakdown,
          verdict: parsedOutput.verdict,
          regulatoryDetails: {
            uplRisk: parsedOutput.regulatoryEnvironment.uplRisk,
            barCompliance: parsedOutput.regulatoryEnvironment.barCompliance,
            privilegeHandling: parsedOutput.regulatoryEnvironment.privilegeHandling,
            overallRisk: parsedOutput.regulatoryEnvironment.overallRegulatoryRisk,
            verdict: parsedOutput.regulatoryEnvironment.regulatoryVerdict,
          },
          incumbentPower: parsedOutput.sectorDynamics.incumbentPower,
          bigTechThreat: parsedOutput.sectorDynamics.bigTechThreat,
        },
      } as SectorExpertResult & { _extended: unknown };

    } catch (error) {
      console.error("[legaltech-expert] Execution error:", error);
      return {
        agentName: "legaltech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultLegaltechData(),
      };
    }
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapQuestionCategory(
  category: string
): "technical" | "business" | "regulatory" | "competitive" {
  const categoryMap: Record<string, "technical" | "business" | "regulatory" | "competitive"> = {
    "upl_compliance": "regulatory",
    "bar_regulations": "regulatory",
    "data_privilege": "regulatory",
    "ai_accuracy": "technical",
    "adoption_resistance": "business",
    "sales_cycle": "business",
    "unit_economics": "business",
    "competitive": "competitive",
    "integration": "technical",
  };
  return categoryMap[category] ?? "business";
}

// ============================================================================
// DEFAULT DATA (fallback)
// ============================================================================

function getDefaultLegaltechData(): SectorExpertData {
  return {
    sectorName: "LegalTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full legaltech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["ABA Model Rules", "State Bar Regulations", "UPL Rules", "Attorney-Client Privilege"],
      complianceRisks: ["Unable to assess UPL and Bar compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 5,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "How do you ensure compliance with state bar regulations regarding unauthorized practice of law?",
        category: "regulatory",
        priority: "must_ask",
        expectedAnswer: "Clear UPL mitigation strategy with bar advisory opinions or lawyer-in-the-loop",
        redFlagAnswer: "Vague answers or no consideration of UPL risk",
      },
      {
        question: "What is your user adoption rate among lawyers, and how do you handle change management?",
        category: "business",
        priority: "must_ask",
        expectedAnswer: "Specific adoption metrics with strong customer success program",
        redFlagAnswer: "No adoption tracking or acknowledgment of lawyer resistance",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "LegalTech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Export for compatibility
export default legaltechExpert;
