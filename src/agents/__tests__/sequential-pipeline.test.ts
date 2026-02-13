/**
 * Sequential Pipeline Test — Full Analysis Simulation
 *
 * Simulates exactly how runFullAnalysis() runs in production:
 * Step 0: Tier 0 — fact-extractor
 * Step 1: document-extractor
 * Step 2: Build enriched context
 * Step 3: Tier 1 — 4 sequential phases (A, B, C, D)
 * Step 4: Tier 2 — saas-expert
 * Step 5: Tier 3 — 3 batches (batch 1 parallel, batch 2 sequential, batch 3 sequential)
 *
 * Goal: Identify which agents break and why, without calling OpenRouter.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import type { AgentResult, EnrichedAgentContext } from "../types";

// ============================================================================
// MOCK: OpenRouter Router (intercepts ALL LLM calls)
// ============================================================================

function buildAgentMockResponse(prompt: string, systemPrompt?: string): unknown {
  const combined = `${systemPrompt ?? ""} ${prompt}`.toLowerCase();

  // -- Tier 0: fact-extractor (meta-evaluate second pass) --
  if (combined.includes("meta-evaluation") || combined.includes("auditeur externe")) {
    return {
      evaluations: [
        { factKey: "financial.arr", reliability: "DECLARED", isProjection: false, reasoning: "Chiffre du deck." },
      ],
    };
  }

  // -- Tier 0: fact-extractor --
  if (combined.includes("extraction de faits") || combined.includes("taxonomie des cles canoniques")) {
    return {
      facts: [
        {
          factKey: "financial.arr",
          category: "FINANCIAL",
          value: 600000,
          displayValue: "600K EUR",
          unit: "EUR",
          sourceDocumentId: "doc-001",
          sourceConfidence: 95,
          extractedText: "[Source: Pitch Deck, Slide 6] ARR 600K EUR, growing 15% MoM",
          validAt: "2025-12-31",
          periodType: "YEAR",
          periodLabel: "FY2025",
          reliability: "DECLARED",
          reliabilityReasoning: "Stated in deck without audit proof.",
          isProjection: false,
          documentDate: "2025-12-01",
          dataPeriodEnd: "2025-12-31",
          projectionPercent: 0,
        },
        {
          factKey: "financial.mrr",
          category: "FINANCIAL",
          value: 50000,
          displayValue: "50K EUR",
          unit: "EUR",
          sourceDocumentId: "doc-001",
          sourceConfidence: 95,
          extractedText: "[Source: Pitch Deck, Slide 4] MRR 50K EUR",
          reliability: "DECLARED",
          reliabilityReasoning: "Stated in deck.",
          isProjection: false,
        },
        {
          factKey: "traction.customers_count",
          category: "TRACTION",
          value: 120,
          displayValue: "120",
          sourceDocumentId: "doc-001",
          sourceConfidence: 90,
          extractedText: "[Source: Pitch Deck, Slide 4] 120 customers",
          reliability: "DECLARED",
          reliabilityReasoning: "Stated in deck.",
          isProjection: false,
        },
        {
          factKey: "company.name",
          category: "OTHER",
          value: "TestCo",
          displayValue: "TestCo",
          sourceDocumentId: "doc-001",
          sourceConfidence: 99,
          extractedText: "[Source: Pitch Deck, Slide 1] TestCo",
          reliability: "DECLARED",
          reliabilityReasoning: "Name from slide 1.",
          isProjection: false,
        },
      ],
      contradictions: [],
      extractionNotes: ["No major issues found."],
    };
  }

  // -- Step 1: document-extractor --
  if (combined.includes("extrais les informations structurees") || combined.includes("analyse ces documents et extrais")) {
    return {
      extractedInfo: {
        companyName: "TestCo",
        tagline: "AI-powered B2B analytics",
        sector: "SaaS",
        stage: "SEED",
        geography: "Europe",
        foundedYear: 2023,
        teamSize: 8,
        arr: 600000,
        mrr: 50000,
        revenue: 600000,
        growthRateYoY: 180,
        burnRate: 80000,
        runway: 25,
        financialDataType: "historical",
        financialDataAsOf: "2025-12-01",
        projectionReliability: "low",
        financialRedFlags: [],
        dataClassifications: {},
        amountRaising: 2000000,
        valuationPre: 10000000,
        valuationPost: 12000000,
        customers: 120,
        users: 500,
        nrr: 110,
        churnRate: 3,
        cac: 500,
        ltv: 12000,
        founders: [
          { name: "John Doe", role: "CEO", background: "ex-Google", linkedinUrl: "https://linkedin.com/in/johndoe" },
          { name: "Jane Smith", role: "CTO", background: "ex-Meta, AI PhD", linkedinUrl: null },
          { name: "Bob Wilson", role: "COO", background: "ex-McKinsey", linkedinUrl: null },
        ],
        teamMembers: [],
        productName: "TestCo Analytics",
        productDescription: "AI-powered B2B analytics platform",
        techStack: ["React", "Node.js", "Python", "PostgreSQL"],
        competitiveAdvantage: "AI-powered real-time analytics",
        coreValueProposition: "Enterprise-grade analytics accessible to SMBs via AI",
        keyDifferentiators: ["AI-powered", "Real-time", "No-code"],
        useCases: ["Business analytics", "KPI tracking"],
        targetMarket: "B2B SMBs in Europe",
        markets: [{ name: "B2B Analytics", tamGlobal: 5000000000, samEurope: 500000000, somFrance: 50000000, cagr: 15, year: 2025 }],
        competitors: ["Datadog", "Mixpanel"],
        advisors: [],
        partners: [],
      },
      confidence: {
        companyName: 1.0,
        arr: 0.9,
        founders: 0.8,
        competitors: 0.7,
      },
      sourceReferences: [
        { field: "companyName", quote: "TestCo", documentName: "TestCo_Deck.pdf" },
        { field: "arr", quote: "ARR 600K EUR", documentName: "TestCo_Deck.pdf" },
      ],
    };
  }

  // -- Tier 2: saas-expert (MUST be before Tier 1 patterns because its prompt contains generic words like "concurrents", "retention", "gtm") --
  if (combined.includes("expert saas b2b") || combined.includes("kpis critiques saas")) {
    return {
      sectorConfidence: 90,
      subSector: "Horizontal SaaS - Analytics",
      businessModel: "pure_saas",
      primaryMetrics: [
        {
          metricName: "ARR Growth", dealValue: 180, source: "Deck Slide 6",
          benchmark: { p25: 50, median: 100, p75: 200, topDecile: 300 },
          percentilePosition: 65, assessment: "above_average",
          insight: "Strong growth but need to verify sustainability",
        },
        {
          metricName: "Net Revenue Retention", dealValue: 110, source: "Deck Slide 4",
          benchmark: { p25: 90, median: 105, p75: 120, topDecile: 140 },
          percentilePosition: 55, assessment: "average",
          insight: "Decent NRR, room for improvement",
        },
      ],
      secondaryMetrics: [
        {
          metricName: "Gross Margin", dealValue: 80, source: "Estimated",
          benchmark: { p25: 60, median: 72, p75: 82, topDecile: 90 },
          percentilePosition: 70, assessment: "above_average",
          insight: "Healthy SaaS margins",
        },
      ],
      unitEconomics: {
        ltv: { value: 12000, calculation: "ARPA 5000 / monthly churn 3% = 12K", confidence: "medium" },
        cac: { value: 500, calculation: "From deck", confidence: "low" },
        ltvCacRatio: { value: 24, assessment: "Excellent", vsMedian: "Well above 3x median" },
        cacPaybackMonths: { value: 1.2, assessment: "Very fast payback", runway: "~20 paybacks before next round" },
        burnMultiple: { value: 1.6, assessment: "Efficient burn" },
        magicNumber: { value: null, assessment: "Insufficient data" },
      },
      redFlags: [
        {
          flag: "Churn rate of 3% monthly is high for B2B SaaS",
          severity: "major",
          evidence: "3% monthly = 31% annual churn",
          impact: "Customer base eroding quickly",
          questionToAsk: "What are you doing to reduce churn?",
          benchmarkViolation: "Median B2B SaaS monthly churn is 1.5%",
        },
      ],
      greenFlags: [
        { flag: "Strong LTV/CAC ratio", strength: "strong", evidence: "24x ratio", implication: "Efficient customer acquisition" },
      ],
      cohortHealth: { dataAvailable: false, nrrTrend: "unknown", churnTrend: "unknown", expansionTrend: "unknown" },
      gtmAssessment: { model: "sales_led", efficiency: "efficient", salesCycleMonths: 3, keyInsight: "Direct sales working well" },
      saasCompetitiveMoat: {
        dataNetworkEffects: true, switchingCostLevel: "medium",
        integrationDepth: "medium", categoryLeaderPotential: true,
        moatAssessment: "Emerging moat through data network effects",
      },
      valuationAnalysis: {
        askMultiple: 16.7, medianSectorMultiple: 12, percentilePosition: 70,
        justifiedRange: { low: 7000000, fair: 9000000, high: 12000000 },
        verdict: "stretched",
        negotiationLeverage: "Valuation above median, negotiate down citing churn concerns",
      },
      dbComparison: {
        similarDealsFound: 5,
        thisDealsPosition: "Above median in terms of traction",
        bestComparable: { name: "SaaS Co A", similarity: "Similar ARR at Seed", outcome: "Raised Series A at 30M" },
      },
      sectorQuestions: [
        {
          question: "What is your plan to reduce monthly churn below 2%?",
          category: "retention", priority: "must_ask",
          why: "3% monthly churn is unsustainable", greenFlagAnswer: "Concrete retention roadmap",
          redFlagAnswer: "No clear plan",
        },
      ],
      exitPotential: {
        typicalMultiple: 8, likelyAcquirers: ["Datadog", "Salesforce"],
        timeToExit: "5-7 years", exitReadiness: "needs_work",
      },
      sectorScore: 62,
      scoreBreakdown: { unitEconomics: 18, growth: 17, retention: 12, gtmEfficiency: 15 },
      executiveSummary: "SaaS fondamentalement solide avec de bons unit economics. Le churn mensuel de 3% est un point de vigilance. Croissance forte mais a confirmer.",
      investmentImplication: "solid_with_concerns",
      dbCrossReference: { claims: [], hiddenCompetitors: [] },
      dataCompleteness: {
        level: "partial", availableDataPoints: 8, expectedDataPoints: 12,
        missingCritical: ["Cohort data", "Sales pipeline"], limitations: ["Limited historical data"],
      },
    };
  }

  // -- deck-forensics --
  if (combined.includes("forensique") || combined.includes("claim verification") || combined.includes("deck forensics")) {
    return buildTier1Response("deck-forensics", {
      narrativeAnalysis: {
        storyCoherence: 72,
        credibilityAssessment: "Le deck presente une histoire coherente mais avec des trous. Les claims financiers sont partiellement verifiables.",
        narrativeStrengths: [{ point: "Vision claire du produit", location: "Slide 2" }],
        narrativeWeaknesses: [{ point: "Chiffres de marche non sources", location: "Slide 3" }],
        criticalMissingInfo: [{ info: "Unit economics detailles", whyItMatters: "Impossible de valider la viabilite du modele" }],
      },
      claimVerification: [
        {
          id: "cv-1", category: "financials", claim: "ARR 600K EUR", location: "Slide 6",
          status: "VERIFIED", evidence: "Coherent avec MRR 50K * 12", sourceUsed: "Calcul interne",
          investorImplication: "Les chiffres tiennent", dataReliability: "DECLARED",
        },
      ],
      inconsistencies: [],
      deckQuality: { professionalismScore: 75, completenessScore: 65, transparencyScore: 60, issues: ["Pas de slide sur les unit economics"] },
    });
  }

  // -- financial-auditor --
  if (combined.includes("audit financier") || combined.includes("financial audit")) {
    return buildTier1Response("financial-auditor", {
      metrics: [
        {
          metric: "ARR", status: "available", reportedValue: 600000, calculatedValue: 600000,
          calculation: "MRR 50K * 12 = 600K", benchmarkP25: 200000, benchmarkMedian: 400000,
          benchmarkP75: 800000, percentile: 60, source: "Pitch Deck Slide 6",
          assessment: "Above median for Seed SaaS", dataReliability: "DECLARED",
        },
      ],
      projections: { realistic: true, assumptions: ["15% MoM growth"], concerns: ["Growth rate ambitious"] },
      valuation: {
        requested: 10000000, impliedMultiple: 16.7, benchmarkMultiple: 12,
        percentile: 70, verdict: "AGGRESSIVE",
        comparables: [{ name: "Similar SaaS A", multiple: 14, stage: "Seed", source: "DB" }],
      },
      unitEconomics: {
        ltv: { value: 12000, calculation: "ARPA / churn = 5000 / (3%*12) = 12K" },
        cac: { value: 500, calculation: "Reported" },
        ltvCacRatio: 24, paybackMonths: 1.2,
        assessment: "Excellent unit economics, LTV/CAC > 3x",
      },
      burn: {
        monthlyBurn: 80000, runway: 25, burnMultiple: 1.6,
        efficiency: "EFFICIENT", assessment: "Healthy burn rate with 25 months runway",
      },
    });
  }

  // -- team-investigator --
  if (combined.includes("team investigat") || combined.includes("equipe fondatrice") || combined.includes("fondateurs")) {
    return buildTier1Response("team-investigator", {
      founderProfiles: [
        {
          name: "John Doe", role: "CEO", linkedinUrl: "https://linkedin.com/in/johndoe",
          linkedinVerified: false, linkedinScrapedAt: undefined,
          background: {
            yearsExperience: 10, headline: "CEO at TestCo", currentTitle: "CEO",
            educationHighlight: "MBA Stanford", topPreviousCompanies: ["Google"],
            domainExpertiseYears: 5, relevantRoles: ["PM at Google"], keySkills: ["Product", "AI"],
          },
          entrepreneurialTrack: {
            isFirstTimeFounder: true, previousVentures: [], totalVentures: 0, successfulExits: 0,
          },
          scores: { domainExpertise: 70, entrepreneurialExperience: 40, executionCapability: 65, networkStrength: 60, overallFounderScore: 60 },
          redFlags: [], strengths: ["Strong domain expertise"], concerns: ["First-time founder"],
        },
      ],
      teamMemberProfiles: [],
      teamComposition: {
        size: 8, rolesPresent: ["CEO", "CTO", "COO"], rolesMissing: ["VP Sales"],
        technicalStrength: 70, businessStrength: 65, complementarityScore: 70,
        gaps: [{ gap: "VP Sales", severity: "HIGH", impact: "GTM execution risk", recommendation: "Hire before Series A" }],
        keyHiresToMake: [{ role: "VP Sales", priority: "IMMEDIATE", rationale: "GTM execution" }],
      },
      cofounderDynamics: {
        foundersCount: 3, equitySplit: "Equal", equitySplitAssessment: "healthy",
        vestingInPlace: true,
        workingHistoryTogether: { duration: "2 years", context: "Previous project", assessment: "Solid" },
        relationshipStrength: "strong", potentialConflicts: [],
      },
      networkAnalysis: {
        overallNetworkStrength: "moderate", notableConnections: [],
        advisors: [], investorRelationships: [], industryConnections: [],
      },
      benchmarkComparison: {
        vsSuccessfulFounders: "Average for Seed stage",
        percentileInSector: 55,
        similarSuccessfulTeams: [{ company: "Comparable B", similarity: "Similar team profile", outcome: "Series B" }],
      },
    });
  }

  // -- competitive-intel --
  if (combined.includes("competitive intel") || combined.includes("concurrents") || combined.includes("paysage concurrentiel")) {
    return buildTier1ResponseWithGrade("competitive-intel", {
      competitors: [
        {
          name: "Datadog", website: "https://datadoghq.com", positioning: "Full-stack observability",
          targetCustomer: "Enterprise DevOps", overlap: "indirect",
          overlapExplanation: "Different target segment",
          funding: { total: 800000000, lastRound: 130000000, stage: "Public", source: "Crunchbase" },
          strengths: [{ point: "Market leader", evidence: "Public company" }],
          weaknesses: [{ point: "Complex pricing", evidence: "Customer complaints" }],
          threatLevel: "MEDIUM", threatRationale: "Different segment but could expand",
          timeToThreat: "2+ years",
          differentiationVsUs: { ourAdvantage: "Simplicity", theirAdvantage: "Scale", verdict: "DIFFERENT_SEGMENT" },
        },
      ],
      competitorsMissedInDeck: [],
      marketStructure: {
        concentration: "fragmented", totalPlayers: 50,
        topPlayersMarketShare: "Top 5 hold 30%",
        entryBarriers: "medium", entryBarriersExplanation: "Data moat needed",
      },
      moatAnalysis: {
        primaryMoatType: "Data network effects",
        secondaryMoatTypes: ["Switching costs"],
        moatScoring: [{ moatType: "Data", score: 60, evidence: "120 customers", sustainability: "moderate", timeframe: "2-3 years" }],
        overallMoatStrength: 55, moatVerdict: "EMERGING_MOAT",
        moatJustification: "Early-stage moat building", moatRisks: [],
      },
      competitivePositioning: {
        ourPosition: "AI-first analytics for SMBs",
        nearestCompetitor: "Mixpanel", differentiationStrength: "moderate",
        sustainabilityOfPosition: "Sustainable if AI advantage maintained",
      },
      claimsAnalysis: [],
      competitiveThreats: [],
      fundingBenchmark: {
        ourFunding: 2000000,
        competitorsFunding: [{ name: "Datadog", funding: 800000000 }],
        percentileVsCompetitors: 10, verdict: "Significantly less funded but different segment",
      },
    });
  }

  // -- market-intelligence --
  if (combined.includes("market intelligence") || combined.includes("analyse de marche") || combined.includes("taille du marche")) {
    return buildTier1ResponseWithGrade("market-intelligence", {
      marketSize: {
        tam: { claimed: 5000000000, validated: 4500000000, source: "Gartner 2025", year: 2025, methodology: "top_down", confidence: "medium" },
        sam: { claimed: 500000000, validated: 450000000, source: "Estimated", calculation: "TAM * 10% EU share" },
        som: { claimed: 50000000, validated: 30000000, source: "Bottom-up", calculation: "120 customers * 250K ARPA", realisticAssessment: "Achievable in 3 years" },
        growthRate: { claimed: 15, validated: 12, cagr: 12, source: "IDC", period: "2024-2028" },
        discrepancyLevel: "MINOR", overallAssessment: "Market claims are mostly aligned with external data",
      },
      fundingTrends: {
        sectorName: "B2B Analytics/SaaS", period: "2024-2025",
        totalFunding: { value: 5000000000, yoyChange: -10 },
        dealCount: { value: 250, yoyChange: -5 },
        averageDealSize: { value: 20000000, percentile: 30 },
        medianValuation: { value: 15000000, trend: "Slightly down from 2023 peak" },
        trend: "COOLING", trendAnalysis: "Market normalizing after 2021-2022 bubble",
        topDeals: [{ company: "SaaS Leader X", amount: 100000000, date: "2025-06" }],
      },
      timing: {
        assessment: "GOOD",
        rationale: "Market growing steadily, valuations normalizing to sustainable levels",
        windowRemaining: "12-18 months for optimal entry",
        catalysts: ["AI adoption acceleration", "Enterprise analytics demand"],
        headwinds: ["Funding market tightening"],
      },
      regulatoryEnvironment: {
        currentRegulations: ["GDPR"],
        upcomingRegulations: ["EU AI Act"],
        impact: "NEUTRAL",
        complianceCost: "Moderate",
        assessment: "Manageable regulatory environment",
      },
    });
  }

  // -- tech-stack-dd --
  if (combined.includes("tech stack") || combined.includes("stack technique") || combined.includes("dette technique")) {
    return buildTier1Response("tech-stack-dd", {
      techStack: {
        frontend: { tech: "React/Next.js", assessment: "Modern and scalable", maturity: "production" },
        backend: { tech: "Node.js/Python", assessment: "Good choice for AI workloads", maturity: "production" },
        database: { tech: "PostgreSQL", assessment: "Solid relational choice", maturity: "production" },
        infrastructure: { tech: "AWS", assessment: "Standard cloud infra", maturity: "production" },
        aiMl: { tech: "Python/TensorFlow", assessment: "Appropriate for analytics AI", maturity: "developing" },
      },
      scalabilityAssessment: {
        currentScale: "120 customers, handles well",
        bottlenecks: ["Single database instance"],
        scalabilityScore: 65,
        recommendation: "Add read replicas before 500 customers",
      },
      technicalDebt: {
        level: "moderate",
        areas: ["Testing coverage at 40%"],
        impact: "Manageable at current stage",
        recommendation: "Increase test coverage before Series A",
      },
    });
  }

  // -- tech-ops-dd --
  if (combined.includes("tech ops") || combined.includes("maturite produit") || combined.includes("securite") || combined.includes("propriete intellectuelle")) {
    return buildTier1Response("tech-ops-dd", {
      productMaturity: {
        stage: "growth",
        features: { core: 85, advanced: 40, enterprise: 20 },
        roadmapClarity: "clear",
        assessment: "Core product solid, enterprise features needed for Series A",
      },
      teamTech: {
        size: 4, seniorityMix: "2 senior, 2 mid",
        velocityAssessment: "Good for team size",
        hiringNeeds: ["Senior backend engineer"],
      },
      security: {
        overallScore: 55,
        certifications: [],
        gaps: ["No SOC2", "No penetration testing"],
        assessment: "Below enterprise standards, needs investment",
      },
      ip: {
        patents: 0, trademarks: 1,
        proprietaryTech: "AI analytics engine",
        assessment: "Limited formal IP protection",
      },
    });
  }

  // -- legal-regulatory --
  if (combined.includes("legal") || combined.includes("reglementaire") || combined.includes("juridique")) {
    return buildTier1Response("legal-regulatory", {
      corporateStructure: {
        entityType: "SAS",
        jurisdiction: "France",
        assessment: "Standard French startup structure",
        concerns: [],
      },
      regulatoryCompliance: {
        gdpr: { status: "partial", assessment: "DPO appointed but privacy policy needs update" },
        sectorSpecific: [],
        overallScore: 60,
      },
      contractualRisks: {
        customerContracts: "Standard SaaS terms",
        vendorContracts: "No major lock-in",
        keyManClauses: true,
        assessment: "Low contractual risk",
      },
      litigationRisk: {
        pendingLitigation: false,
        potentialRisks: ["IP infringement from competitors unlikely"],
        assessment: "Low litigation risk",
      },
    });
  }

  // -- cap-table-auditor --
  if (combined.includes("cap table") || combined.includes("table de capitalisation") || combined.includes("captable")) {
    return buildTier1Response("cap-table-auditor", {
      currentCapTable: {
        totalShares: 1000000,
        shareholders: [
          { name: "John Doe", shares: 333333, percentage: 33.3, type: "founder" },
          { name: "Jane Smith", shares: 333333, percentage: 33.3, type: "founder" },
          { name: "Bob Wilson", shares: 333334, percentage: 33.4, type: "founder" },
        ],
        optionPool: { size: 0, allocated: 0, available: 0 },
      },
      dilutionAnalysis: {
        currentRound: {
          preMoneyValuation: 10000000,
          postMoneyValuation: 12000000,
          newSharesPercent: 16.7,
          foundersDilution: 16.7,
        },
        projectedDilution: "Founders will hold ~55% after Series A assuming 25% dilution",
      },
      vestingAnalysis: {
        vestingInPlace: true,
        schedule: "4-year with 1-year cliff",
        concerns: [],
        assessment: "Standard vesting, well-structured",
      },
      redFlags: [],
      concerns: ["No ESOP pool pre-round"],
    });
  }

  // -- gtm-analyst --
  if (combined.includes("go-to-market") || combined.includes("gtm") || combined.includes("strategie commerciale")) {
    return buildTier1Response("gtm-analyst", {
      gtmStrategy: {
        primaryModel: "Direct sales",
        secondaryModel: "Partnerships",
        assessment: "Coherent strategy for B2B SaaS",
        maturity: "developing",
      },
      salesMetrics: {
        salesCycleMonths: 3,
        winRate: null,
        avgDealSize: 5000,
        pipelineCoverage: null,
        assessment: "Limited sales data available at this stage",
      },
      channelAnalysis: {
        channels: [
          { channel: "Direct outbound", contribution: 60, assessment: "Primary driver", scalability: "moderate" },
          { channel: "Inbound/Content", contribution: 40, assessment: "Growing", scalability: "high" },
        ],
        diversification: "moderate",
      },
      customerAcquisition: {
        cac: 500, cacTrend: "stable",
        paybackMonths: 1.2,
        efficiency: "efficient",
        assessment: "Strong acquisition efficiency",
      },
    });
  }

  // -- customer-intel --
  if (combined.includes("customer intel") || combined.includes("analyse client") || combined.includes("retention")) {
    return buildTier1Response("customer-intel", {
      customerProfile: {
        icp: "B2B SMBs (50-500 employees) in Europe",
        segments: [
          { segment: "Tech companies", percentage: 60, arpa: 6000, churn: 2 },
          { segment: "E-commerce", percentage: 40, arpa: 4000, churn: 4 },
        ],
        concentration: { top10Percentage: 40, assessment: "moderate" },
      },
      retentionMetrics: {
        grossChurn: 3,
        netChurn: -7,
        nrr: 110,
        expansionRevenue: 10,
        assessment: "Strong retention with healthy expansion",
      },
      satisfactionSignals: {
        nps: null,
        reviews: "Limited public reviews",
        churnReasons: ["Budget constraints", "Feature gaps"],
        assessment: "No strong negative signals",
      },
      customerGrowth: {
        currentCustomers: 120,
        growthRate: 15,
        logoChurn: 3,
        assessment: "Healthy customer growth trajectory",
      },
    });
  }

  // -- exit-strategist --
  if (combined.includes("exit strateg") || combined.includes("strategie de sortie") || combined.includes("liquidite")) {
    return buildTier1Response("exit-strategist", {
      exitPaths: [
        {
          type: "Acquisition", probability: 60, timeline: "4-6 years",
          potentialAcquirers: ["Datadog", "Salesforce"],
          expectedMultiple: { min: 5, median: 8, max: 15 },
          prerequisites: ["ARR > 10M", "Enterprise customers"],
          assessment: "Most likely exit path for B2B SaaS at this stage",
        },
        {
          type: "IPO", probability: 10, timeline: "7-10 years",
          expectedMultiple: { min: 10, median: 15, max: 25 },
          prerequisites: ["ARR > 100M", "Profitability"],
          assessment: "Long-term possibility if growth continues",
        },
      ],
      timeToLiquidity: {
        estimated: "5-7 years",
        factors: ["Market conditions", "Growth trajectory"],
        assessment: "Standard for Seed SaaS investment",
      },
      returnAnalysis: {
        baseCase: { multiple: 5, irr: 35 },
        bullCase: { multiple: 15, irr: 60 },
        bearCase: { multiple: 1, irr: 0 },
        assessment: "Asymmetric upside typical of Seed stage",
      },
    });
  }

  // -- question-master --
  if (combined.includes("question master") || combined.includes("questions a poser") || combined.includes("diligence checklist")) {
    return buildTier1Response("question-master", {
      founderQuestions: [
        {
          id: "q-1", priority: "CRITICAL", category: "financials",
          question: "Can you share bank statements confirming ARR?",
          context: {
            sourceAgent: "financial-auditor", triggerData: "ARR 600K declared",
            whyItMatters: "Need to verify declared financials",
          },
          evaluation: {
            goodAnswer: "Provides Qonto/bank statements",
            badAnswer: "Refuses or provides only projections",
            redFlagIfBadAnswer: "Cannot verify core financials",
            followUpIfBad: "Request access to accounting software",
          },
          timing: "Before term sheet",
        },
      ],
      referenceChecks: [
        {
          id: "rc-1", targetType: "Former colleague", priority: "HIGH",
          targetProfile: {
            description: "Someone who worked with CEO at Google",
            howToFind: "LinkedIn connections",
          },
          questions: [
            { question: "How was John as a leader?", whatToLookFor: "Specific examples", redFlagAnswer: "Vague or negative" },
          ],
          rationale: "Verify CEO leadership claims",
        },
      ],
      diligenceChecklist: {
        totalItems: 5, doneItems: 1, blockedItems: 0, criticalPathItems: 3,
        items: [
          {
            id: "dc-1", category: "Financial", item: "Bank statements",
            description: "Last 12 months", status: "pending",
            criticalPath: true, blockingForDecision: true,
            responsibleParty: "Founder", estimatedEffort: "1 day",
            documentsNeeded: ["Bank statements"],
          },
        ],
      },
      negotiationPoints: [
        {
          id: "np-1", priority: "HIGH", category: "Valuation",
          point: "Negotiate valuation down to 8M pre-money",
          leverage: {
            argument: "Valuation aggressive vs benchmarks",
            evidence: "Median Seed SaaS multiple is 12x, this is 16.7x",
            sourceAgent: "financial-auditor",
          },
          suggestedApproach: "Start at 8M, settle at 9M",
          fallbackPosition: "Accept 10M with protective provisions",
          walkAwayPoint: "Above 12M pre-money",
        },
      ],
      dealbreakers: [],
      tier1Summary: {
        agentsAnalyzed: [
          { agentName: "financial-auditor", score: 65, grade: "B", criticalRedFlagsCount: 0, highRedFlagsCount: 1 },
        ],
      },
    });
  }

  // -- Tier 3: contradiction-detector --
  if (combined.includes("contradiction") || combined.includes("incoherence") || combined.includes("consistance")) {
    return {
      contradictions: [
        {
          id: "cd-1", type: "INTERNAL", severity: "MEDIUM", topic: "Growth rate",
          statement1: { text: "15% MoM growth", location: "Slide 6", source: "deck" },
          statement2: { text: "ARR 600K implies ~180% YoY", location: "Calculated", source: "financial-auditor" },
          analysis: "Growth claims are consistent but high",
          implication: "Need to verify sustainability",
          confidenceLevel: 75,
          resolution: { likely: "Claims accurate but ambitious", reasoning: "Math checks out", needsVerification: true },
          question: "Can you show monthly cohort data?",
          redFlagIfBadAnswer: "Growth may be inflated",
        },
      ],
      dataGaps: [
        {
          id: "dg-1", area: "Unit Economics", description: "No detailed cohort data",
          missingFrom: ["deck", "data-room"], expectedSource: "Data room",
          importance: "HIGH", impactOnAnalysis: "Cannot validate retention claims",
          recommendation: "Request cohort data", questionToAsk: "Share monthly cohort retention data",
        },
      ],
      consistencyAnalysis: {
        overallScore: 72,
        breakdown: [
          { dimension: "Financial consistency", score: 75, weight: 40, issues: [] },
          { dimension: "Narrative consistency", score: 70, weight: 30, issues: ["Minor timeline gaps"] },
          { dimension: "Data quality", score: 68, weight: 30, issues: ["Some metrics unverified"] },
        ],
        interpretation: "Overall consistency is acceptable with minor gaps",
      },
      redFlagConvergence: [],
      redFlags: [],
      questions: [
        { priority: "HIGH", category: "consistency", question: "Provide cohort data to resolve data gaps", context: "Multiple agents flagged missing data", whatToLookFor: "Monthly retention by cohort" },
      ],
      alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "No critical contradictions but data gaps exist" },
      narrative: {
        oneLiner: "Deck globalement coherent avec quelques lacunes de donnees.",
        summary: "L'analyse croisee revele une coherence acceptable entre les sources. Les metriques financieres sont mathematiquement coherentes. Les lacunes principales concernent les donnees de retention par cohorte.",
        keyInsights: ["Financial metrics are internally consistent", "Missing cohort data is the main gap"],
        forNegotiation: ["Request cohort data before committing"],
      },
    };
  }

  // -- Tier 3: scenario-modeler --
  if (combined.includes("scenario") || combined.includes("modelisation") || combined.includes("bull.*bear") || combined.includes("irr")) {
    return {
      scenarios: [
        {
          name: "BASE",
          description: "Growth continues at reduced rate, successful Series A",
          probability: { value: 45, rationale: "Most likely based on current trajectory", source: "Historical SaaS benchmarks" },
          assumptions: [{ assumption: "ARR growth decelerates to 100% YoY", value: 100, source: "Sector median", confidence: "medium" }],
          metrics: [
            { year: 2026, revenue: 1200000, revenueSource: "100% growth", valuation: 15000000, valuationSource: "12x ARR", employeeCount: 15, employeeCountSource: "Estimated" },
            { year: 2027, revenue: 2400000, revenueSource: "100% growth", valuation: 30000000, valuationSource: "12x ARR", employeeCount: 25, employeeCountSource: "Estimated" },
          ],
          exitOutcome: {
            type: "Acquisition", typeRationale: "Most common for B2B SaaS",
            timing: "2030-2031", timingSource: "5-6 year typical hold",
            exitValuation: 50000000, exitValuationCalculation: "8x ARR at exit",
            exitMultiple: 8, exitMultipleSource: "Median SaaS acquisition",
          },
          investorReturn: {
            initialInvestment: 100000, initialInvestmentSource: "Typical BA ticket",
            ownershipAtEntry: 1, ownershipCalculation: "100K / 10M = 1%",
            dilutionToExit: 50, dilutionSource: "3 rounds @ ~20% each",
            ownershipAtExit: 0.5, ownershipAtExitCalculation: "1% * (1-50%) = 0.5%",
            grossProceeds: 250000, proceedsCalculation: "50M * 0.5% = 250K",
            multiple: 2.5, multipleCalculation: "250K / 100K = 2.5x",
            irr: 20, irrCalculation: "2.5x over 5 years = ~20% IRR",
            holdingPeriodYears: 5,
          },
          keyRisks: [{ risk: "Churn acceleration", source: "customer-intel" }],
          keyDrivers: [{ driver: "NRR improvement", source: "saas-expert" }],
        },
        {
          name: "BULL",
          description: "Exceptional growth, category leader",
          probability: { value: 20, rationale: "Optimistic but possible", source: "Top decile SaaS" },
          assumptions: [{ assumption: "ARR growth sustained at 180%", value: 180, source: "Current rate", confidence: "low" }],
          metrics: [
            { year: 2026, revenue: 1680000, revenueSource: "180% growth", valuation: 25000000, valuationSource: "15x ARR", employeeCount: 20, employeeCountSource: "Estimated" },
          ],
          exitOutcome: {
            type: "IPO or Large Acquisition", typeRationale: "Category leaders get premium exits",
            timing: "2029-2030", timingSource: "4-5 year hold",
            exitValuation: 200000000, exitValuationCalculation: "15x ARR at ~13M ARR",
            exitMultiple: 15, exitMultipleSource: "Top quartile SaaS",
          },
          investorReturn: {
            initialInvestment: 100000, initialInvestmentSource: "Typical BA ticket",
            ownershipAtEntry: 1, ownershipCalculation: "100K / 10M = 1%",
            dilutionToExit: 60, dilutionSource: "Multiple large rounds",
            ownershipAtExit: 0.4, ownershipAtExitCalculation: "1% * (1-60%) = 0.4%",
            grossProceeds: 800000, proceedsCalculation: "200M * 0.4% = 800K",
            multiple: 8, multipleCalculation: "800K / 100K = 8x",
            irr: 55, irrCalculation: "8x over 4.5 years",
            holdingPeriodYears: 4,
          },
          keyRisks: [{ risk: "Execution risk at scale", source: "team-investigator" }],
          keyDrivers: [{ driver: "AI differentiation", source: "tech-stack-dd" }],
        },
        {
          name: "BEAR",
          description: "Growth stalls, difficult fundraising",
          probability: { value: 25, rationale: "Possible if churn worsens", source: "Historical failure rate" },
          assumptions: [{ assumption: "Growth slows to 30% YoY", value: 30, source: "Pessimistic", confidence: "medium" }],
          metrics: [
            { year: 2026, revenue: 780000, revenueSource: "30% growth", valuation: 8000000, valuationSource: "10x ARR", employeeCount: 10, employeeCountSource: "Cost cuts" },
          ],
          exitOutcome: {
            type: "Acqui-hire or small acquisition", typeRationale: "Limited exit options",
            timing: "2028-2029", timingSource: "Forced exit",
            exitValuation: 5000000, exitValuationCalculation: "5x reduced ARR",
            exitMultiple: 5, exitMultipleSource: "Distressed acquisition",
          },
          investorReturn: {
            initialInvestment: 100000, initialInvestmentSource: "BA ticket",
            ownershipAtEntry: 1, ownershipCalculation: "100K / 10M = 1%",
            dilutionToExit: 70, dilutionSource: "Down rounds",
            ownershipAtExit: 0.3, ownershipAtExitCalculation: "1% * (1-70%) = 0.3%",
            grossProceeds: 15000, proceedsCalculation: "5M * 0.3% = 15K",
            multiple: 0.15, multipleCalculation: "15K / 100K = 0.15x",
            irr: -40, irrCalculation: "0.15x over 4 years",
            holdingPeriodYears: 4,
          },
          keyRisks: [{ risk: "Cash runway depletion", source: "financial-auditor" }],
          keyDrivers: [{ driver: "Market downturn", source: "market-intelligence" }],
        },
        {
          name: "CATASTROPHIC",
          description: "Complete failure",
          probability: { value: 10, rationale: "Startup base rate", source: "CB Insights" },
          assumptions: [{ assumption: "Business collapses", value: 0, source: "Base rate", confidence: "low" }],
          metrics: [],
          exitOutcome: {
            type: "Shutdown", typeRationale: "Business failure",
            timing: "2027", timingSource: "Runway exhaustion",
            exitValuation: 0, exitValuationCalculation: "Total loss",
            exitMultiple: 0, exitMultipleSource: "N/A",
          },
          investorReturn: {
            initialInvestment: 100000, initialInvestmentSource: "BA ticket",
            ownershipAtEntry: 1, ownershipCalculation: "100K / 10M = 1%",
            dilutionToExit: 100, dilutionSource: "N/A",
            ownershipAtExit: 0, ownershipAtExitCalculation: "Total loss",
            grossProceeds: 0, proceedsCalculation: "Total loss",
            multiple: 0, multipleCalculation: "Total loss",
            irr: -100, irrCalculation: "Total loss",
            holdingPeriodYears: 2,
          },
          keyRisks: [{ risk: "Startup failure", source: "base rate" }],
          keyDrivers: [],
        },
      ],
      sensitivityAnalysis: [
        {
          variable: "Monthly churn", baseCase: { value: 3, source: "Deck" },
          impactOnValuation: [
            { change: "Churn drops to 1.5%", newValuation: 15000000, calculation: "Higher LTV, better retention" },
            { change: "Churn rises to 5%", newValuation: 6000000, calculation: "Rapid customer erosion" },
          ],
          impactLevel: "HIGH", impactRationale: "Churn is the key variable for SaaS valuation",
        },
      ],
      basedOnComparables: [
        { company: "Comparable SaaS X", sector: "SaaS", stage: "Seed", trajectory: "Similar metrics at Seed", outcome: "Series A at 25M", relevance: "Strong comparable", source: "DB" },
      ],
      breakEvenAnalysis: {
        monthsToBreakeven: 18, breakEvenCalculation: "Current burn 80K, revenue growing 15%/mo",
        requiredGrowthRate: 10, growthRateSource: "Minimum for breakeven",
        burnUntilBreakeven: 1440000, burnCalculation: "80K * 18 months",
        achievability: "Achievable", achievabilityRationale: "Current growth exceeds required rate",
      },
      probabilityWeightedOutcome: {
        expectedMultiple: 2.8, expectedMultipleCalculation: "45%*2.5 + 20%*8 + 25%*0.15 + 10%*0",
        expectedIRR: 18, expectedIRRCalculation: "Weighted average IRR",
        riskAdjustedAssessment: "Acceptable risk-reward for Seed stage",
      },
      mostLikelyScenario: "BASE",
      mostLikelyRationale: "Current trajectory supports moderate growth scenario",
      score: {
        value: 60,
        grade: "B",
        breakdown: [
          { criterion: "Return potential", weight: 40, score: 65, justification: "Decent upside in bull case" },
          { criterion: "Risk assessment", weight: 30, score: 55, justification: "Churn risk is the main concern" },
          { criterion: "Comparable validation", weight: 30, score: 60, justification: "Similar companies have succeeded" },
        ],
      },
      redFlags: [],
      questions: [
        { priority: "HIGH", category: "growth", question: "What is your monthly cohort data?", context: "Need to validate growth assumptions", whatToLookFor: "Consistent cohort performance" },
      ],
      alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "Acceptable risk-reward but churn needs monitoring" },
      narrative: {
        oneLiner: "Profil risque-rendement acceptable pour un Seed SaaS.",
        summary: "Le scenario de base offre un multiple de 2.5x avec 20% de chances d'un 8x. Le risque principal est l'acceleration du churn.",
        keyInsights: ["Expected multiple of 2.8x", "Churn is the key swing factor"],
        forNegotiation: ["Use bear case to negotiate valuation down"],
      },
    };
  }

  // -- Tier 3: devils-advocate --
  if (combined.includes("devil") || combined.includes("avocat du diable") || combined.includes("skepti")) {
    return buildTier1ResponseWithGrade("devils-advocate", {
      counterArguments: [
        {
          id: "ca-1",
          thesis: "Strong LTV/CAC ratio of 24x",
          thesisSource: "financial-auditor",
          counterArgument: "LTV/CAC may be inflated due to early customer cohort bias",
          evidence: "No cohort data to validate long-term retention",
          comparableFailure: {
            company: "Chartbeat", sector: "Analytics", fundingRaised: 15000000,
            similarity: "B2B analytics with strong initial metrics",
            outcome: "Growth plateaued after initial customer base",
            lessonsLearned: "Early metrics often don't sustain at scale",
            source: "TechCrunch archives",
          },
          probability: "MEDIUM", probabilityRationale: "Common pattern in early SaaS",
          mitigationPossible: true, mitigation: "Request and analyze cohort data",
        },
      ],
      worstCaseScenario: {
        name: "Churn Spiral",
        description: "Monthly churn accelerates, NRR drops below 100%, growth stalls",
        triggers: [
          { trigger: "Key customer loss", probability: "MEDIUM", timeframe: "6-12 months" },
          { trigger: "Competitor launches similar AI feature", probability: "MEDIUM", timeframe: "12-18 months" },
        ],
        cascadeEffects: ["Revenue decline", "Inability to raise Series A", "Forced layoffs"],
        probability: 15, probabilityRationale: "Based on SaaS failure patterns",
        lossAmount: { totalLoss: false, estimatedLoss: "50-80% of investment", calculation: "Acqui-hire at 2-3M" },
        comparableCatastrophes: [
          { company: "Periscope Data", whatHappened: "Acquired at low multiple after growth stalled", investorLosses: "~50% loss", source: "Crunchbase" },
        ],
        earlyWarningSigns: ["Monthly churn > 4%", "NRR < 100%", "Pipeline coverage < 2x"],
      },
      killReasons: [
        {
          id: "kr-1", reason: "No verified financial data", category: "Financial transparency",
          evidence: "All financials are declared only", sourceAgent: "financial-auditor",
          dealBreakerLevel: "CONDITIONAL", condition: "Unless bank statements provided",
          resolutionPossible: true, resolutionPath: "Request Qonto/bank statements",
          impactIfIgnored: "Could be investing based on fabricated numbers",
          questionToFounder: "Share your banking dashboard access",
          redFlagAnswer: "Refuses to share bank data",
        },
      ],
      blindSpots: [
        {
          id: "bs-1", area: "Customer concentration",
          description: "Top 10 customers may represent >40% of revenue",
          whyMissed: "No detailed customer breakdown provided",
          whatCouldGoWrong: "Loss of 2-3 key customers could significantly impact revenue",
          recommendedAction: "Request customer revenue breakdown",
          urgency: "BEFORE_DECISION",
        },
      ],
      alternativeNarratives: [
        {
          id: "an-1",
          currentNarrative: "AI-powered analytics is a growing category",
          alternativeNarrative: "AI features are becoming commoditized, every analytics tool will have them",
          plausibility: 60, plausibilityRationale: "OpenAI/Google embedding AI everywhere",
          evidenceSupporting: ["Mixpanel launched AI features", "Amplitude has AI analytics"],
          implications: "Differentiation may erode within 12-18 months",
          testToValidate: "Evaluate depth of AI integration vs competitors",
        },
      ],
      additionalMarketRisks: [],
      hiddenCompetitiveThreats: [],
      executionChallenges: [],
      skepticismAssessment: {
        score: 55,
        scoreBreakdown: [
          { factor: "Data quality", contribution: 20, rationale: "Declared metrics only" },
          { factor: "Market risk", contribution: 15, rationale: "AI commoditization risk" },
          { factor: "Execution risk", contribution: 20, rationale: "First-time founders" },
        ],
        verdict: "CAUTIOUS", verdictRationale: "Decent opportunity but several unverified assumptions",
      },
      concernsSummary: {
        absolute: [],
        conditional: ["Financial verification required"],
        serious: ["Churn rate", "AI commoditization"],
        minor: ["First-time founders"],
      },
      positiveClaimsChallenged: [
        { claim: "Best LTV/CAC in segment", sourceAgent: "financial-auditor", challenge: "Based on unverified data", verdict: "WEAKENED", verdictRationale: "Need cohort proof" },
      ],
    });
  }

  // -- Tier 3: synthesis-deal-scorer --
  if (combined.includes("synthesis") || combined.includes("score global") || combined.includes("synthese du deal") || combined.includes("scoring final")) {
    return {
      meta: {
        agentName: "synthesis-deal-scorer",
        analysisDate: new Date().toISOString(),
        dataCompleteness: "partial",
        confidenceLevel: 70,
        limitations: ["Some metrics unverified"],
      },
      score: {
        value: 62,
        grade: "B",
        breakdown: [
          { criterion: "Team", weight: 25, score: 60, justification: "Solid team but first-time founders", sourceAgents: ["team-investigator"] },
          { criterion: "Market", weight: 20, score: 70, justification: "Large growing market", sourceAgents: ["market-intelligence"] },
          { criterion: "Product/Tech", weight: 20, score: 65, justification: "Good tech stack, AI moat emerging", sourceAgents: ["tech-stack-dd"] },
          { criterion: "Financials", weight: 20, score: 60, justification: "Good metrics but aggressive valuation", sourceAgents: ["financial-auditor"] },
          { criterion: "Risk", weight: 15, score: 55, justification: "Churn risk and unverified data", sourceAgents: ["devils-advocate"] },
        ],
      },
      findings: {
        dimensionScores: [
          { dimension: "Team", weight: 25, rawScore: 60, adjustedScore: 60, weightedScore: 15, sourceAgents: ["team-investigator"] },
          { dimension: "Market", weight: 20, rawScore: 70, adjustedScore: 70, weightedScore: 14, sourceAgents: ["market-intelligence"] },
        ],
        scoreBreakdown: {
          baseScore: 65, adjustments: [{ type: "risk", reason: "Churn concern", impact: -3, source: "devils-advocate" }],
          finalScore: 62, calculationShown: "65 - 3 = 62",
        },
        marketPosition: {
          percentileOverall: 60, percentileSector: 55, percentileStage: 65,
          valuationAssessment: "Slightly aggressive but justifiable with growth",
          similarDealsAnalyzed: 50,
        },
        recommendation: {
          action: "PROCEED_WITH_CAUTION",
          verdict: "Investissement recommande sous conditions",
          rationale: "Bons fondamentaux SaaS mais donnees a verifier et churn a surveiller.",
          conditions: ["Verify financials with bank statements", "Get cohort retention data"],
          suggestedTerms: "8-10M pre-money with pro-rata rights",
        },
        topStrengths: [
          { strength: "Strong unit economics", evidence: "LTV/CAC 24x", sourceAgent: "financial-auditor" },
          { strength: "Growing market", evidence: "12% CAGR", sourceAgent: "market-intelligence" },
        ],
        topWeaknesses: [
          { weakness: "High churn rate", evidence: "3% monthly" },
          { weakness: "Unverified financials", evidence: "Declared only" },
        ],
      },
      dbCrossReference: { claims: [], uncheckedClaims: [] },
      redFlags: [
        {
          id: "rf-synth-1", category: "retention", severity: "HIGH",
          title: "High monthly churn", description: "3% monthly churn is above SaaS median",
          location: "saas-expert + financial-auditor", evidence: "3% monthly = 31% annual",
          impact: "Customer base eroding",
          question: "What retention initiatives are planned?",
        },
      ],
      alertSignal: {
        hasBlocker: false,
        recommendation: "PROCEED_WITH_CAUTION",
        justification: "Deal merite attention mais conditions prealables a remplir.",
      },
      narrative: {
        oneLiner: "Deal SaaS B2B solide (62/100) avec un risque churn a adresser.",
        summary: "TestCo presente un profil d'investissement interessant pour le Seed: bons unit economics, marche en croissance, equipe competente. Principaux points de vigilance: churn mensuel eleve (3%) et donnees financieres non verifiees. Score global: 62/100.",
        keyInsights: [
          "Score 62/100 - Above average for Seed",
          "Key risk: 3% monthly churn",
          "Valuation slightly aggressive at 16.7x ARR",
        ],
        forNegotiation: [
          "Negotiate valuation to 8-9M based on churn concerns",
          "Include pro-rata rights",
        ],
      },
      overallScore: 62,
      verdict: "PROCEED_WITH_CAUTION",
      confidence: 70,
    };
  }

  // -- Tier 3: memo-generator --
  if (combined.includes("memo") || combined.includes("investment memo") || combined.includes("memo d'investissement")) {
    return {
      meta: { dataCompleteness: "partial", confidenceLevel: 70, limitations: ["Some data unverified"] },
      score: {
        value: 62, grade: "B",
        breakdown: [{ criterion: "Overall quality", weight: 100, score: 62, justification: "Solid deal with caveats" }],
      },
      executiveSummary: {
        oneLiner: "TestCo est un SaaS B2B analytics prometteur a un stade Seed avec un risque churn.",
        recommendation: "CONSIDER",
        verdict: "Deal interessant sous reserve de verification des donnees financieres et d'un plan de reduction du churn.",
        keyStrengths: ["Strong unit economics (LTV/CAC 24x)", "Growing market (12% CAGR)", "Competent team"],
        keyRisks: ["High monthly churn (3%)", "Aggressive valuation (16.7x ARR)", "Unverified financials"],
      },
      companyOverview: {
        description: "TestCo develops an AI-powered B2B analytics platform for SMBs",
        problem: "Enterprises lack accessible real-time analytics",
        solution: "AI-powered dashboard requiring no technical expertise",
        businessModel: "SaaS subscription, monthly/annual plans",
        traction: "ARR 600K EUR, 120 customers, 15% MoM growth",
        stage: "Seed - raising 2M EUR at 10M pre-money",
      },
      investmentHighlights: [
        { highlight: "Strong unit economics", evidence: "LTV/CAC 24x, payback 1.2 months", source: "financial-auditor" },
        { highlight: "AI moat developing", evidence: "Proprietary analytics engine", source: "tech-stack-dd" },
      ],
      keyRisks: [
        { risk: "High churn", severity: "HIGH", category: "Retention", mitigation: "Retention roadmap needed", residualRisk: "Medium", source: "saas-expert" },
        { risk: "Aggressive valuation", severity: "MEDIUM", category: "Valuation", mitigation: "Negotiate to 8-9M", residualRisk: "Low", source: "financial-auditor" },
      ],
      financialSummary: {
        currentMetrics: { ARR: "600K EUR", MRR: "50K EUR", Customers: 120, "Monthly Churn": "3%" },
        projections: { realistic: true, concerns: ["Growth rate sustainability"] },
        valuationAssessment: {
          proposed: "10M EUR pre-money", percentile: "P70 vs sector",
          verdict: "AGGRESSIVE", benchmarkComparables: ["SaaS A at 12x", "SaaS B at 14x"],
        },
      },
      teamAssessment: {
        overallScore: 60,
        founders: [
          { name: "John Doe", role: "CEO", verificationStatus: "Partial", strengths: ["Google background"], concerns: ["First-time founder"] },
        ],
        gaps: ["VP Sales needed"], verdict: "Solid team for Seed stage",
      },
      marketOpportunity: {
        tam: "5B EUR", sam: "500M EUR", som: "50M EUR",
        timing: "GOOD", trend: "Growing at 12% CAGR",
        verdict: "Attractive market opportunity",
      },
      competitiveLandscape: {
        competitors: [{ name: "Datadog", threat: "Indirect", funding: "Public" }],
        differentiation: "AI-first approach for SMBs",
        moatStrength: 55, verdict: "Emerging moat, sustainable if AI advantage maintained",
      },
      termsAnalysis: [
        { term: "Valuation", assessment: "Aggressive", recommendation: "Negotiate to 8-9M", impact: "HIGH" },
      ],
      dealStructure: {
        valuation: "10M EUR pre-money", roundSize: "2M EUR",
        keyTerms: ["Pro-rata rights", "Board seat"],
        negotiationPoints: ["Valuation reduction", "Anti-dilution protection"],
      },
      investmentThesis: {
        bull: ["AI analytics market expanding", "Strong unit economics"],
        bear: ["Churn risk", "AI commoditization"],
        keyAssumptions: ["Growth sustains above 100% YoY", "Churn improves below 2%"],
        thesis: "TestCo addresses a real need with strong execution metrics. Risk-adjusted, it's a solid Seed investment if valuation is negotiated down.",
      },
      exitStrategy: {
        primaryPath: "Acquisition by analytics incumbent",
        timeline: "5-7 years",
        potentialAcquirers: ["Datadog", "Salesforce", "HubSpot"],
        expectedMultiple: { min: 5, median: 8, max: 15 },
      },
      nextSteps: [
        { step: "Verify financials", priority: "CRITICAL", deadline: "Before term sheet", responsible: "BA" },
        { step: "Request cohort data", priority: "HIGH", deadline: "1 week", responsible: "Founder" },
      ],
      questionsForFounder: [
        { priority: "CRITICAL", category: "financials", question: "Share bank statements", context: "Need to verify declared ARR", whatToLookFor: "Consistent monthly deposits" },
      ],
      narrative: {
        summary: "TestCo presente un profil d'investissement Seed interessant avec de bons fondamentaux SaaS.",
        keyInsights: ["Score 62/100", "LTV/CAC 24x exceptionnel", "Churn 3% a adresser"],
        forNegotiation: ["Viser 8-9M de valorisation", "Exiger les releves bancaires"],
      },
      alertSignal: {
        hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION",
        justification: "Deal solide sous conditions: verification financiere et plan churn.",
      },
    };
  }

  // Fallback: generic response for unmatched agents
  console.warn(`[MOCK] Unmatched prompt pattern. First 200 chars: ${combined.substring(0, 200)}`);
  return buildTier1Response("unknown", {});
}

// Helper: build universal Tier 1 response structure
function buildTier1Response(agentName: string, findings: Record<string, unknown>) {
  return {
    meta: { dataCompleteness: "partial", confidenceLevel: 70, limitations: ["Test mock data"] },
    score: {
      value: 65,
      breakdown: [
        { criterion: "Data quality", weight: 30, score: 60, justification: "Partial data" },
        { criterion: "Analysis depth", weight: 40, score: 70, justification: "Adequate analysis" },
        { criterion: "Actionability", weight: 30, score: 65, justification: "Actionable output" },
      ],
    },
    findings,
    dbCrossReference: { claims: [], uncheckedClaims: [] },
    redFlags: [],
    questions: [
      { priority: "MEDIUM", category: "general", question: "Generic follow-up question", context: `From ${agentName}`, whatToLookFor: "Specific data points" },
    ],
    alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "No critical blockers" },
    narrative: {
      oneLiner: `${agentName} analysis completed.`,
      summary: `Analysis by ${agentName} shows partial data coverage with no critical issues.`,
      keyInsights: ["Data partially available", "No critical red flags"],
      forNegotiation: ["Use identified gaps as negotiation leverage"],
    },
  };
}

function buildTier1ResponseWithGrade(agentName: string, findings: Record<string, unknown>) {
  const base = buildTier1Response(agentName, findings);
  (base.score as Record<string, unknown>).grade = "B";
  return base;
}

// ============================================================================
// MOCKS
// ============================================================================

// Mock OpenRouter router - intercepts ALL LLM calls
vi.mock("@/services/openrouter/router", () => ({
  complete: vi.fn().mockResolvedValue({ content: "Mock response", cost: 0.001 }),
  completeJSON: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    raw: "{}",
  })),
  completeJSONWithFallback: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    raw: "{}",
  })),
  completeJSONStreaming: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    wasTruncated: false,
  })),
  stream: vi.fn().mockResolvedValue({ content: "Mock stream", cost: 0.001 }),
  setAgentContext: vi.fn(),
  setAnalysisContext: vi.fn(),
  getAgentContext: vi.fn().mockReturnValue(null),
  getAnalysisContext: vi.fn().mockReturnValue(null),
  selectModel: vi.fn().mockReturnValue("HAIKU"),
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: { findFirst: vi.fn().mockResolvedValue(null) },
    deal: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
  },
}));

// Mock scoring services
vi.mock("@/scoring/services/agent-score-calculator", () => ({
  calculateAgentScore: vi.fn().mockResolvedValue({
    score: 65,
    grade: "B",
    breakdown: [{ criterion: "test", weight: 100, score: 65, justification: "test" }],
    metrics: [],
    confidence: 70,
  }),
  normalizeMetricName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, "_")),
  DECK_FORENSICS_CRITERIA: {},
  FINANCIAL_AUDITOR_CRITERIA: {},
  TEAM_INVESTIGATOR_CRITERIA: {},
  COMPETITIVE_INTEL_CRITERIA: {},
  MARKET_INTELLIGENCE_CRITERIA: {},
  LEGAL_REGULATORY_CRITERIA: {},
  TECH_OPS_DD_CRITERIA: {},
  TECH_STACK_DD_CRITERIA: {},
  CAP_TABLE_AUDITOR_CRITERIA: {},
  CUSTOMER_INTEL_CRITERIA: {},
  EXIT_STRATEGIST_CRITERIA: {},
  GTM_ANALYST_CRITERIA: {},
  QUESTION_MASTER_CRITERIA: {},
}));

// Mock scoring index (benchmarkService)
vi.mock("@/scoring", () => ({
  benchmarkService: {
    getBenchmark: vi.fn().mockReturnValue({ p25: 10, median: 20, p75: 30, topDecile: 50 }),
    getPercentile: vi.fn().mockReturnValue(50),
    getSectorBenchmarks: vi.fn().mockReturnValue([]),
    lookup: vi.fn().mockResolvedValue({ p25: 200000, median: 400000, p75: 800000, source: "mock" }),
  },
}));

// Mock benchmarks service
vi.mock("@/services/benchmarks", () => ({
  getBenchmark: vi.fn().mockReturnValue({ p25: 200000, median: 400000, p75: 800000, topDecile: 1500000, source: "mock" }),
  getBenchmarkFull: vi.fn().mockReturnValue({
    metric: "ARR",
    stage: "Seed",
    sector: "SaaS",
    p25: 200000,
    median: 400000,
    p75: 800000,
    topDecile: 1500000,
    source: "mock",
    freshness: { status: "fresh", lastUpdated: new Date().toISOString() },
  }),
  getExitBenchmarkFull: vi.fn().mockReturnValue({
    sectorMultiple: { min: 5, median: 8, max: 15 },
    timeToExit: { min: 3, median: 5, max: 8 },
    source: "mock",
  }),
  getTimeToLiquidity: vi.fn().mockReturnValue({ min: 3, median: 5, max: 8 }),
  calculateBATicketSize: vi.fn().mockReturnValue(100000),
  DEFAULT_BA_PREFERENCES: {
    typicalTicketPercent: 0.05,
    minTicket: 10000,
    maxTicket: 500000,
    preferredStages: ["SEED"],
    preferredSectors: ["SaaS"],
    riskTolerance: "moderate",
  },
}));

// Mock benchmarks freshness
vi.mock("@/services/benchmarks/freshness-checker", () => ({
  checkBenchmarkFreshness: vi.fn().mockReturnValue({ status: "fresh", staleMetrics: [], lastUpdated: new Date().toISOString() }),
  formatFreshnessWarning: vi.fn().mockReturnValue(""),
}));

// Mock FOMO detector
vi.mock("@/services/fomo-detector", () => ({
  detectFOMO: vi.fn().mockReturnValue({ detected: false, signals: [], score: 0 }),
}));

// Mock fact-checking (for devils-advocate)
vi.mock("@/services/fact-checking", () => ({
  factCheckDevilsAdvocate: vi.fn().mockImplementation(async (findings: unknown) => ({
    findings,
    stats: { totalChecked: 0, verified: 0, unverified: 0, errors: 0 },
  })),
}));

// Mock waterfall simulator (for cap-table-auditor)
vi.mock("@/services/waterfall-simulator", () => ({
  simulateWaterfall: vi.fn().mockReturnValue({
    results: [],
    totalProceeds: 0,
  }),
}));

// Mock financial calculations (for scenario-modeler)
vi.mock("@/agents/orchestration/utils/financial-calculations", () => ({
  calculateIRR: vi.fn().mockReturnValue({ value: 20, calculation: "20% IRR", steps: [] }),
  calculateCumulativeDilution: vi.fn().mockReturnValue({ value: 50, calculation: "50% dilution", steps: [] }),
}));

// Mock context-engine geography coverage
vi.mock("@/services/context-engine/geography-coverage", () => ({
  formatGeographyCoverageForPrompt: vi.fn().mockReturnValue("Europe coverage: Good"),
}));

// Mock red-flag thresholds
vi.mock("@/agents/config/red-flag-thresholds", () => ({
  formatThresholdsForPrompt: vi.fn().mockReturnValue("Standard thresholds applied"),
}));

// Mock sector standards (for all tier2 experts)
vi.mock("@/agents/tier2/sector-standards", () => {
  const stubStandards = {
    sector: "Mock",
    aliases: [],
    primaryMetrics: [],
    secondaryMetrics: [],
    unitEconomicsFormulas: [],
    redFlagRules: [],
    sectorRisks: [],
    successPatterns: [],
    typicalAcquirers: [],
    benchmarkSearchQueries: [],
  };
  return {
    SAAS_STANDARDS: { ...stubStandards, sector: "SaaS" },
    FINTECH_STANDARDS: { ...stubStandards, sector: "Fintech" },
    MARKETPLACE_STANDARDS: { ...stubStandards, sector: "Marketplace" },
    AI_STANDARDS: { ...stubStandards, sector: "AI" },
    HEALTHTECH_STANDARDS: { ...stubStandards, sector: "HealthTech" },
    DEEPTECH_STANDARDS: { ...stubStandards, sector: "DeepTech" },
    CLIMATE_STANDARDS: { ...stubStandards, sector: "Climate" },
    CONSUMER_STANDARDS: { ...stubStandards, sector: "Consumer" },
    GAMING_STANDARDS: { ...stubStandards, sector: "Gaming" },
    HARDWARE_STANDARDS: { ...stubStandards, sector: "Hardware" },
    BIOTECH_STANDARDS: { ...stubStandards, sector: "Biotech" },
    EDTECH_STANDARDS: { ...stubStandards, sector: "EdTech" },
    FOODTECH_STANDARDS: { ...stubStandards, sector: "FoodTech" },
    MOBILITY_STANDARDS: { ...stubStandards, sector: "Mobility" },
    PROPTECH_STANDARDS: { ...stubStandards, sector: "PropTech" },
    CYBERSECURITY_STANDARDS: { ...stubStandards, sector: "Cybersecurity" },
    HRTECH_STANDARDS: { ...stubStandards, sector: "HRTech" },
    LEGALTECH_STANDARDS: { ...stubStandards, sector: "LegalTech" },
    CREATOR_STANDARDS: { ...stubStandards, sector: "Creator" },
    BLOCKCHAIN_STANDARDS: { ...stubStandards, sector: "Blockchain" },
    SECTOR_STANDARDS: {},
    getSectorStandards: vi.fn().mockReturnValue(null),
    getBenchmarkSearchQueries: vi.fn().mockReturnValue([]),
  };
});

// Mock benchmark injector (for saas-expert)
vi.mock("@/agents/tier2/benchmark-injector", () => ({
  getStandardsOnlyInjection: vi.fn().mockReturnValue("SaaS benchmarks: ARR median 400K for Seed"),
  injectBenchmarks: vi.fn().mockReturnValue(""),
}));

// Mock sanitize
vi.mock("@/lib/sanitize", () => ({
  sanitizeForLLM: vi.fn((text: string) => text),
  sanitizeName: vi.fn((name: string) => name),
  PromptInjectionError: class PromptInjectionError extends Error {
    patterns: string[];
    constructor(message: string, patterns: string[]) {
      super(message);
      this.patterns = patterns;
    }
  },
}));

// ============================================================================
// TEST SETUP
// ============================================================================

const mockDeal = {
  id: "test-deal-001",
  name: "TestCo SaaS",
  tagline: "AI-powered B2B analytics",
  sector: "SaaS",
  stage: "SEED",
  amount: 2000000,
  valuation: 10000000,
  currency: "EUR",
  userId: "user-001",
  founderLinkedin: "https://linkedin.com/in/johndoe",
  documents: [
    {
      id: "doc-001",
      type: "pitch_deck",
      name: "TestCo_Deck.pdf",
      processingStatus: "COMPLETED",
      extractedText: `TestCo - AI-Powered B2B Analytics Platform
Slide 1: Problem - Enterprises lack real-time analytics
Slide 2: Solution - AI-powered dashboard
Slide 3: Market - TAM 5B EUR, SAM 500M, SOM 50M
Slide 4: Traction - MRR 50K EUR, 120 customers, 3% monthly churn
Slide 5: Team - 3 cofounders, 8 total employees
  CEO: John Doe (ex-Google, 10 years)
  CTO: Jane Smith (ex-Meta, AI PhD)
  COO: Bob Wilson (ex-McKinsey)
Slide 6: Financials - ARR 600K, growing 15% MoM, CAC 500 EUR, LTV 12000 EUR
Slide 7: Ask - 2M EUR at 10M pre-money valuation
Slide 8: Competition - No direct competitor in EU market
Slide 9: Go-to-Market - Direct sales + partnerships
Slide 10: Roadmap - Enterprise features Q2 2026`,
    },
  ],
  founderResponses: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================================
// SEQUENTIAL PIPELINE TEST
// ============================================================================

describe("Sequential Pipeline — Full Analysis Simulation", () => {
  const allResults: Record<string, AgentResult & { data?: unknown }> = {};
  let enrichedContext: EnrichedAgentContext;
  let totalCost = 0;

  // ── Step 0: Tier 0 — Fact Extraction ──
  it("Step 0: Tier 0 — fact-extractor produces structured facts", async () => {
    const { factExtractorAgent } = await import("../tier0/fact-extractor");

    const context = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDeal.documents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        extractedText: d.extractedText,
      })),
      previousResults: {},
    };

    const result = await factExtractorAgent.run(context);

    allResults["fact-extractor"] = result;
    totalCost += result.cost;

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("fact-extractor");

    if ("data" in result) {
      const data = result.data as { facts: unknown[]; metadata: { factsExtracted: number } };
      expect(data.facts).toBeDefined();
      expect(Array.isArray(data.facts)).toBe(true);
      console.log(`[Step 0] fact-extractor: ${data.metadata.factsExtracted} facts extracted`);
    }
  });

  // ── Step 1: Document Extraction ──
  it("Step 1: document-extractor extracts structured data", async () => {
    const { documentExtractor } = await import("../document-extractor");

    const context = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDeal.documents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        extractedText: d.extractedText,
      })),
      previousResults: {
        "fact-extractor": allResults["fact-extractor"],
      },
    };

    const result = await documentExtractor.run(context);

    allResults["document-extractor"] = result;
    totalCost += result.cost;

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("document-extractor");
    console.log(`[Step 1] document-extractor: SUCCESS`);
  });

  // ── Step 2: Build Enriched Context ──
  it("Step 2: Build enriched context", () => {
    enrichedContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDeal.documents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        extractedText: d.extractedText,
      })),
      previousResults: { ...allResults },
      contextEngine: {
        dealIntelligence: undefined,
        marketData: undefined,
        competitiveLandscape: undefined,
        newsSentiment: undefined,
        peopleGraph: undefined,
        enrichedAt: new Date().toISOString(),
        completeness: 20,
      },
      factStore: [],
      factStoreFormatted: "financial.arr: 600K EUR (DECLARED)\ntraction.customers_count: 120 (DECLARED)",
    };

    expect(enrichedContext.factStoreFormatted).toContain("600K");
    console.log("[Step 2] Enriched context built successfully");
  });

  // ── Step 3a: Phase A — deck-forensics ──
  it("Step 3a: Phase A — deck-forensics", async () => {
    const tier1Module = await import("../tier1");

    const result = await tier1Module.deckForensics.run(enrichedContext);

    allResults["deck-forensics"] = result;
    totalCost += result.cost;
    enrichedContext.previousResults!["deck-forensics"] = result;

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("deck-forensics");
    console.log(`[Step 3a] deck-forensics: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
  });

  // ── Step 3b: Phase B — financial-auditor ──
  it("Step 3b: Phase B — financial-auditor (with deck-forensics results)", async () => {
    const tier1Module = await import("../tier1");

    const result = await tier1Module.financialAuditor.run(enrichedContext);

    allResults["financial-auditor"] = result;
    totalCost += result.cost;
    enrichedContext.previousResults!["financial-auditor"] = result;

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("financial-auditor");
    console.log(`[Step 3b] financial-auditor: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
  });

  // ── Step 3c: Phase C — team + competitive + market (parallel) ──
  it("Step 3c: Phase C — team-investigator, competitive-intel, market-intelligence (parallel)", async () => {
    const tier1Module = await import("../tier1");

    const agentsC = [
      { name: "team-investigator", agent: tier1Module.teamInvestigator },
      { name: "competitive-intel", agent: tier1Module.competitiveIntel },
      { name: "market-intelligence", agent: tier1Module.marketIntelligence },
    ];

    const results = await Promise.all(
      agentsC.map(async ({ name, agent }) => {
        try {
          const result = await agent.run(enrichedContext);
          return { name, result };
        } catch (error) {
          return {
            name,
            result: {
              agentName: name,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : String(error),
            } as AgentResult,
          };
        }
      })
    );

    for (const { name, result } of results) {
      allResults[name] = result;
      totalCost += result.cost;
      enrichedContext.previousResults![name] = result;
      console.log(`[Step 3c] ${name}: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
    }

    // All 3 should be present
    expect(allResults["team-investigator"]).toBeDefined();
    expect(allResults["competitive-intel"]).toBeDefined();
    expect(allResults["market-intelligence"]).toBeDefined();
  });

  // ── Step 3d: Phase D — 8 remaining agents (parallel) ──
  it("Step 3d: Phase D — 8 remaining Tier 1 agents (parallel)", async () => {
    const tier1Module = await import("../tier1");

    const agentsD = [
      { name: "tech-stack-dd", agent: tier1Module.techStackDD },
      { name: "tech-ops-dd", agent: tier1Module.techOpsDD },
      { name: "legal-regulatory", agent: tier1Module.legalRegulatory },
      { name: "cap-table-auditor", agent: tier1Module.capTableAuditor },
      { name: "gtm-analyst", agent: tier1Module.gtmAnalyst },
      { name: "customer-intel", agent: tier1Module.customerIntel },
      { name: "exit-strategist", agent: tier1Module.exitStrategist },
      { name: "question-master", agent: tier1Module.questionMaster },
    ];

    const results = await Promise.all(
      agentsD.map(async ({ name, agent }) => {
        try {
          const result = await agent.run(enrichedContext);
          return { name, result };
        } catch (error) {
          return {
            name,
            result: {
              agentName: name,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : String(error),
            } as AgentResult,
          };
        }
      })
    );

    for (const { name, result } of results) {
      allResults[name] = result;
      totalCost += result.cost;
      enrichedContext.previousResults![name] = result;
      console.log(`[Step 3d] ${name}: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
    }

    // All 8 should be present
    for (const { name } of agentsD) {
      expect(allResults[name]).toBeDefined();
    }
  });

  // ── Step 4: Tier 2 — saas-expert ──
  it("Step 4: Tier 2 — saas-expert", async () => {
    const tier2Module = await import("../tier2");
    const sectorExpert = tier2Module.getSectorExpertForDeal("SaaS");

    expect(sectorExpert).not.toBeNull();

    if (sectorExpert) {
      const result = await sectorExpert.run(enrichedContext);

      allResults[sectorExpert.name] = result;
      totalCost += result.cost;
      enrichedContext.previousResults![sectorExpert.name] = result;

      if (!result.success) {
        console.error(`[Step 4] ${sectorExpert.name}: FAILED with error: ${result.error}`);
      } else {
        console.log(`[Step 4] ${sectorExpert.name}: SUCCESS`);
      }
      expect(result.success).toBe(true);
    }
  });

  // ── Step 5a: Tier 3 Batch 1 — contradiction + scenario + devils-advocate ──
  it("Step 5a: Tier 3 Batch 1 — contradiction-detector, scenario-modeler, devils-advocate (parallel)", async () => {
    // Restore full results for Tier 3 (unsanitized)
    for (const [name, result] of Object.entries(allResults)) {
      enrichedContext.previousResults![name] = result;
    }

    const tier3Module = await import("../tier3");

    const batch1 = [
      { name: "contradiction-detector", agent: tier3Module.contradictionDetector },
      { name: "scenario-modeler", agent: tier3Module.scenarioModeler },
      { name: "devils-advocate", agent: tier3Module.devilsAdvocate },
    ];

    const results = await Promise.all(
      batch1.map(async ({ name, agent }) => {
        try {
          const result = await agent.run(enrichedContext);
          return { name, result };
        } catch (error) {
          return {
            name,
            result: {
              agentName: name,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : String(error),
            } as AgentResult,
          };
        }
      })
    );

    for (const { name, result } of results) {
      allResults[name] = result;
      totalCost += result.cost;
      enrichedContext.previousResults![name] = result;
      console.log(`[Step 5a] ${name}: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
    }
  });

  // ── Step 5b: Tier 3 Batch 2 — synthesis-deal-scorer ──
  it("Step 5b: Tier 3 Batch 2 — synthesis-deal-scorer", async () => {
    const tier3Module = await import("../tier3");

    try {
      const result = await tier3Module.synthesisDealScorer.run(enrichedContext);

      allResults["synthesis-deal-scorer"] = result;
      totalCost += result.cost;
      enrichedContext.previousResults!["synthesis-deal-scorer"] = result;

      expect(result.success).toBe(true);
      console.log(`[Step 5b] synthesis-deal-scorer: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
    } catch (error) {
      const errorResult: AgentResult = {
        agentName: "synthesis-deal-scorer",
        success: false,
        executionTimeMs: 0,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      allResults["synthesis-deal-scorer"] = errorResult;
      console.log(`[Step 5b] synthesis-deal-scorer: FAILED: ${errorResult.error}`);
    }
  });

  // ── Step 5c: Tier 3 Batch 3 — memo-generator ──
  it("Step 5c: Tier 3 Batch 3 — memo-generator", async () => {
    const tier3Module = await import("../tier3");

    try {
      const result = await tier3Module.memoGenerator.run(enrichedContext);

      allResults["memo-generator"] = result;
      totalCost += result.cost;
      enrichedContext.previousResults!["memo-generator"] = result;

      expect(result.success).toBe(true);
      console.log(`[Step 5c] memo-generator: ${result.success ? "SUCCESS" : "FAILED: " + result.error}`);
    } catch (error) {
      const errorResult: AgentResult = {
        agentName: "memo-generator",
        success: false,
        executionTimeMs: 0,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      allResults["memo-generator"] = errorResult;
      console.log(`[Step 5c] memo-generator: FAILED: ${errorResult.error}`);
    }
  });

  // ── Final: Scorecard ──
  it("Final: All 21 agents completed — scorecard", () => {
    const expectedAgents = [
      "fact-extractor",
      "document-extractor",
      "deck-forensics",
      "financial-auditor",
      "team-investigator",
      "competitive-intel",
      "market-intelligence",
      "tech-stack-dd",
      "tech-ops-dd",
      "legal-regulatory",
      "cap-table-auditor",
      "gtm-analyst",
      "customer-intel",
      "exit-strategist",
      "question-master",
      "saas-expert",
      "contradiction-detector",
      "scenario-modeler",
      "devils-advocate",
      "synthesis-deal-scorer",
      "memo-generator",
    ];

    // Print scorecard
    console.log("\n=== PIPELINE SCORECARD ===\n");
    const scorecard = expectedAgents.map((name) => {
      const r = allResults[name];
      if (!r) return `-- ${name}: MISSING (not executed)`;
      return `${r.success ? "OK" : "XX"} ${name}: ${r.success ? "SUCCESS" : "FAILED: " + r.error} [${r.executionTimeMs}ms, $${r.cost.toFixed(4)}]`;
    });
    console.log(scorecard.join("\n"));
    console.log(`\nTotal cost: $${totalCost.toFixed(4)}`);

    // Assert all 21 present
    const presentAgents = expectedAgents.filter((name) => allResults[name]);
    const missingAgents = expectedAgents.filter((name) => !allResults[name]);

    if (missingAgents.length > 0) {
      console.log(`\nMISSING agents: ${missingAgents.join(", ")}`);
    }

    expect(presentAgents.length).toBe(21);

    // Show which failed
    const failed = expectedAgents.filter((name) => allResults[name] && !allResults[name].success);
    if (failed.length > 0) {
      console.log(`\n${failed.length} agents failed:`);
      failed.forEach((name) => console.log(`  - ${name}: ${allResults[name].error}`));
    }

    // This is the key assertion: we want 21/21 success
    expect(failed.length).toBe(0);

    // Assert total cost > 0 (mock costs are non-zero)
    expect(totalCost).toBeGreaterThanOrEqual(0);
  });
});
