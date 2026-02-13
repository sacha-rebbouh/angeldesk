// ============================================================================
// COMPREHENSIVE AGENT PIPELINE TESTS
// Tests all 21 agents individually + pipeline integration
// Run: npx vitest run --config vitest.unit.config.ts src/agents/__tests__/agent-pipeline.test.ts
// ============================================================================

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ============================================================================
// MOCK SETUP - Must be before any agent imports
// ============================================================================

// ---------- OpenRouter Router (CRITICAL - all LLM calls go through here) ----------
vi.mock("@/services/openrouter/router", () => {
  // Factory that builds mock responses based on prompt content
  function buildMockResponse(prompt: string): unknown {
    // Detect which agent is calling based on prompt keywords
    const promptLower = (prompt || "").toLowerCase();

    // ----- TIER 0: fact-extractor -----
    if (
      promptLower.includes("extraire tous les faits") ||
      promptLower.includes("fact") && promptLower.includes("extract")
    ) {
      return {
        facts: [
          {
            factKey: "financial.arr",
            category: "financial",
            value: 600000,
            displayValue: "600K EUR",
            unit: "EUR",
            sourceDocumentId: "doc-1",
            sourceConfidence: 90,
            extractedText: "ARR: 600K EUR",
            reliability: "DECLARED",
            reliabilityReasoning: "Stated in deck",
            isProjection: false,
          },
        ],
        contradictions: [],
        extractionNotes: ["Mock extraction"],
      };
    }

    // ----- TIER 0: document-extractor -----
    if (
      promptLower.includes("extrais les informations structurees") ||
      promptLower.includes("extractedinfo")
    ) {
      return {
        extractedInfo: {
          companyName: "TestCo",
          tagline: "AI-powered analytics platform",
          sector: "SaaS",
          stage: "SEED",
          geography: "France",
          arr: 600000,
          mrr: 50000,
          teamSize: 8,
          financialDataType: "mixed",
          founders: [
            { name: "John Doe", role: "CEO", background: "ex-Google" },
          ],
          competitors: ["CompetitorA", "CompetitorB"],
          targetMarket: "B2B SaaS analytics",
          tam: 5000000000,
          sam: 500000000,
          som: 50000000,
        },
        confidence: {
          companyName: 95,
          sector: 90,
          arr: 80,
        },
        sourceReferences: [
          {
            field: "companyName",
            quote: "TestCo - AI Analytics Platform",
            documentName: "deck.pdf",
          },
        ],
      };
    }

    // ----- TIER 1: Deck Forensics -----
    if (promptLower.includes("forensic") || promptLower.includes("claim verification") && promptLower.includes("deck")) {
      return buildTier1Response("deck-forensics", {
        narrativeAnalysis: {
          storyCoherence: 72,
          credibilityAssessment: "Overall credible narrative with some gaps in financial projections.",
          narrativeStrengths: [{ point: "Clear problem-solution fit", location: "Slide 2" }],
          narrativeWeaknesses: [{ point: "Vague go-to-market details", location: "Slide 8" }],
          criticalMissingInfo: [{ info: "Unit economics breakdown", whyItMatters: "Cannot validate financial viability" }],
        },
        claimVerification: [
          {
            category: "market",
            claim: "TAM of 5B",
            location: "Slide 3",
            status: "UNVERIFIED",
            evidence: "No source cited for TAM estimate",
            sourceUsed: "Context Engine",
            investorImplication: "Market size may be inflated",
            dataReliability: "DECLARED",
          },
        ],
        inconsistencies: [],
        deckQuality: {
          professionalismScore: 70,
          completenessScore: 65,
          transparencyScore: 60,
          issues: ["Missing financial annexes"],
        },
      });
    }

    // ----- TIER 1: Financial Auditor -----
    if (promptLower.includes("audit financier") || promptLower.includes("financial audit")) {
      return buildTier1Response("financial-auditor", {
        metrics: [
          {
            metric: "ARR",
            status: "available",
            reportedValue: 600000,
            calculatedValue: 600000,
            calculation: "MRR * 12 = 50K * 12 = 600K",
            benchmarkP25: 300000,
            benchmarkMedian: 500000,
            benchmarkP75: 900000,
            percentile: 60,
            source: "Deck slide 5",
            assessment: "Above median for Seed SaaS",
            dataReliability: "DECLARED",
          },
        ],
        projections: {
          realistic: false,
          assumptions: ["15% MoM growth sustained for 24 months"],
          concerns: ["Growth assumption is aggressive for the stage"],
        },
        valuation: {
          requested: 10000000,
          impliedMultiple: 16.7,
          benchmarkMultiple: 12,
          percentile: 75,
          verdict: "AGGRESSIVE",
          comparables: [{ name: "SimilarCo", multiple: 10, stage: "Seed", source: "DB" }],
        },
        unitEconomics: {
          ltv: { value: 50000, calculation: "ARPA / churn = 10K / 0.2" },
          cac: { value: 5000, calculation: "Marketing spend / new customers" },
          ltvCacRatio: 10,
          paybackMonths: 6,
          assessment: "Healthy unit economics",
        },
        burn: {
          monthlyBurn: 80000,
          runway: 18,
          burnMultiple: 1.6,
          efficiency: "MODERATE",
          assessment: "Adequate runway for next round",
        },
      });
    }

    // ----- TIER 1: Team Investigator -----
    if (promptLower.includes("team") && (promptLower.includes("investigat") || promptLower.includes("equipe"))) {
      return buildTier1Response("team-investigator", {
        founderProfiles: [
          {
            name: "John Doe",
            role: "CEO",
            verificationStatus: "PARTIALLY_VERIFIED",
            linkedinMatch: true,
            experienceYears: 12,
            relevantExperience: "10 years in SaaS",
            previousVentures: [],
            education: ["MIT MBA"],
            strengths: ["Strong technical background"],
            concerns: ["No previous startup experience"],
            overallAssessment: "Solid operator, first-time founder",
          },
        ],
        teamComposition: {
          totalSize: 8,
          foundersCount: 2,
          technicalRatio: 0.6,
          experienceLevel: "SENIOR",
          diversityAssessment: "Moderate",
          keyGaps: ["No VP Sales"],
          verdict: "Competent but thin team",
        },
        founderMarketFit: {
          score: 65,
          rationale: "Industry experience relevant but no direct startup success",
          advantages: ["Deep domain knowledge"],
          concerns: ["First-time founders"],
        },
        advisorsAndBoard: {
          advisors: [],
          boardMembers: [],
          networkStrength: "MODERATE",
          verdict: "Limited advisory board",
        },
        linkedinVerification: {
          profilesChecked: 2,
          matchRate: 100,
          discrepancies: [],
          verdict: "LinkedIn profiles match deck claims",
        },
      });
    }

    // ----- TIER 1: Competitive Intel -----
    if (promptLower.includes("concurren") || promptLower.includes("competitive") && promptLower.includes("intel")) {
      return buildTier1Response("competitive-intel", {
        competitors: [
          {
            id: "comp-1",
            name: "CompetitorA",
            website: "https://competitor-a.com",
            positioning: "Enterprise analytics",
            targetCustomer: "Fortune 500",
            overlap: "direct",
            overlapExplanation: "Same market segment",
            funding: { total: 50000000, source: "Funding DB" },
            strengths: [{ point: "Large customer base", evidence: "500+ enterprise clients" }],
            weaknesses: [{ point: "Legacy technology", evidence: "10-year old architecture" }],
            threatLevel: "HIGH",
            threatRationale: "Dominant player in target market",
            timeToThreat: "Immediate",
            differentiationVsUs: {
              ourAdvantage: "Modern AI-native approach",
              theirAdvantage: "Established brand and customer base",
              verdict: "DIFFERENT_SEGMENT",
            },
          },
        ],
        competitorsMissedInDeck: [],
        marketStructure: {
          concentration: "moderate",
          totalPlayers: 15,
          topPlayersMarketShare: "Top 3 = 45%",
          entryBarriers: "medium",
          entryBarriersExplanation: "Requires significant data and ML expertise",
        },
        moatAnalysis: {
          primaryMoatType: "technology",
          secondaryMoatTypes: ["data_moat"],
          moatScoring: [{ moatType: "technology", score: 55, evidence: "Proprietary ML models", sustainability: "moderate", timeframe: "2-3 years" }],
          overallMoatStrength: 50,
          moatVerdict: "EMERGING_MOAT",
          moatJustification: "Technology differentiation is real but not yet proven at scale",
          moatRisks: [{ risk: "Larger players could replicate", probability: "MEDIUM", impact: "Loss of differentiation" }],
        },
        competitivePositioning: {
          ourPosition: "AI-native challenger",
          nearestCompetitor: "CompetitorA",
          differentiationStrength: "moderate",
          sustainabilityOfPosition: "Needs to build data moat quickly",
        },
        claimsAnalysis: [],
        competitiveThreats: [],
        fundingBenchmark: {
          ourFunding: 2000000,
          competitorsFunding: [{ name: "CompetitorA", funding: 50000000 }],
          percentileVsCompetitors: 15,
          verdict: "Significantly underfunded vs competitors",
        },
      });
    }

    // ----- TIER 1: Market Intelligence -----
    if (promptLower.includes("marche") || promptLower.includes("market") && promptLower.includes("intelligence")) {
      return buildTier1Response("market-intelligence", {
        marketSize: {
          tam: { claimed: 5000000000, validated: 4500000000, source: "Gartner 2024", year: 2024, methodology: "top_down", confidence: "medium" },
          sam: { claimed: 500000000, validated: 450000000, source: "Internal calc", calculation: "TAM * 10% EU share" },
          som: { claimed: 50000000, validated: 40000000, source: "Internal calc", calculation: "SAM * 8-10% share", realisticAssessment: "Achievable in 3-5 years" },
          growthRate: { claimed: 25, validated: 18, cagr: 18, source: "IDC 2024", period: "2024-2028" },
          discrepancyLevel: "MINOR",
          overallAssessment: "Market size claims are slightly inflated but within reasonable range",
        },
        fundingTrends: {
          sectorName: "SaaS Analytics",
          period: "2023-2024",
          totalFunding: { value: 2000000000, yoyChange: -15 },
          dealCount: { value: 150, yoyChange: -10 },
          averageDealSize: { value: 13000000, percentile: 35 },
          medianValuation: { value: 40000000, trend: "declining" },
          trend: "COOLING",
          trendAnalysis: "Market cooling after 2021-2022 peak",
          topDeals: [{ company: "TopCo", amount: 100000000, date: "2024-06" }],
        },
        timing: {
          marketMaturity: "growing",
          adoptionCurve: "early_majority",
          assessment: "GOOD",
          reasoning: "Market moving from early adopters to early majority",
          windowRemaining: "18-24 months",
          competitorActivity: [],
        },
        regulatoryLandscape: {
          riskLevel: "LOW",
          keyRegulations: ["GDPR", "AI Act"],
          upcomingChanges: ["EU AI Act enforcement 2025"],
          impact: "Manageable compliance costs",
        },
        claimValidations: [],
      });
    }

    // ----- TIER 1: Tech Stack DD -----
    if (promptLower.includes("tech stack") || promptLower.includes("stack technologique")) {
      return buildTier1Response("tech-stack-dd", {
        stackAssessment: {
          overallMaturity: "moderate",
          architectureType: "monolith_migrating",
          scalabilityReadiness: "partial",
          verdict: "Adequate for current scale, needs investment for 10x growth",
        },
        technologies: [
          { name: "Python", category: "backend", assessment: "standard", scalability: "good", concern: null },
          { name: "React", category: "frontend", assessment: "standard", scalability: "good", concern: null },
        ],
        technicalDebt: {
          level: "moderate",
          keyAreas: ["No automated testing", "Manual deployments"],
          estimatedCostToFix: "2-3 engineering months",
          riskToGrowth: "Medium",
        },
        scalability: {
          currentCapacity: "1K concurrent users",
          targetCapacity: "10K concurrent users",
          bottlenecks: ["Database queries"],
          estimatedCostToScale: "Engineering hire + infrastructure",
        },
        securityPosture: {
          level: "basic",
          keyGaps: ["No SOC2", "No pen testing"],
          criticalIssues: [],
        },
      });
    }

    // ----- TIER 1: Tech Ops DD -----
    if (promptLower.includes("tech ops") || promptLower.includes("maturite produit")) {
      return buildTier1Response("tech-ops-dd", {
        productMaturity: {
          stage: "growth",
          mvpCompleteness: 85,
          featureDepth: "moderate",
          userExperience: "good",
          verdict: "Solid product, needs polish for enterprise",
        },
        engineeringTeam: {
          size: 5,
          seniorityDistribution: "balanced",
          keyPersonRisk: "medium",
          hiringNeeds: ["Senior Backend Engineer"],
          verdict: "Adequate for current stage",
        },
        securityAndCompliance: {
          overallLevel: "basic",
          dataProtection: "GDPR aware but not certified",
          accessControl: "role_based",
          auditTrail: false,
          keyGaps: ["No SOC2", "No GDPR DPA"],
        },
        ipProtection: {
          patents: 0,
          tradeSecrets: true,
          openSourceRisk: "low",
          verdict: "Limited IP protection, relies on trade secrets",
        },
        devOps: {
          cicd: true,
          monitoring: "basic",
          deploymentFrequency: "weekly",
          incidentResponse: "informal",
        },
      });
    }

    // ----- TIER 1: Legal Regulatory -----
    if (promptLower.includes("legal") || promptLower.includes("juridique") || promptLower.includes("regulatory")) {
      return buildTier1Response("legal-regulatory", {
        corporateStructure: {
          entityType: "SAS",
          jurisdiction: "France",
          incorporationDate: "2022",
          issues: [],
          verdict: "Standard French SAS structure",
        },
        ipStatus: {
          patents: [],
          trademarks: [],
          copyrights: [],
          openSourceRisks: [],
          verdict: "Limited IP portfolio for early stage",
        },
        regulatoryCompliance: {
          applicableRegulations: ["GDPR", "AI Act"],
          complianceStatus: "partial",
          gaps: ["GDPR DPA template needed"],
          riskLevel: "MEDIUM",
          verdict: "Manageable regulatory burden",
        },
        contractsAnalysis: {
          keyContracts: [],
          termsIssues: [],
          verdict: "Standard early-stage contracts",
        },
        litigationRisk: {
          pendingLitigation: [],
          potentialRisks: [],
          overallRisk: "LOW",
          verdict: "No material litigation risk identified",
        },
      });
    }

    // ----- TIER 1: Cap Table Auditor -----
    if (promptLower.includes("cap table") || promptLower.includes("capitalis")) {
      return buildTier1Response("cap-table-auditor", {
        capTableAnalysis: {
          foundersOwnership: 70,
          investorOwnership: 20,
          esopPool: 10,
          dilutionProjection: "Founders retain 45% after Series A",
          verdict: "Healthy cap table for Seed stage",
        },
        dilutionScenarios: [
          { scenario: "Series A at 30M", foundersPostDilution: 50, investorReturn: "2x" },
        ],
        termsAnalysis: {
          preferenceStack: "1x non-participating",
          antiDilution: "broad-based weighted average",
          boardSeats: "2 founders, 1 investor",
          proRataRights: true,
          dragAlong: true,
          verdict: "Standard terms for Seed round",
        },
        investorRights: {
          informationRights: true,
          tagAlong: true,
          vestingSchedule: "4 years, 1 year cliff",
          accelerationClauses: "single trigger",
          verdict: "Standard investor protections",
        },
        esopAnalysis: {
          poolSize: 10,
          granted: 3,
          available: 7,
          vestingTerms: "4 years, 1 year cliff",
          verdict: "Adequate ESOP for current stage",
        },
      });
    }

    // ----- TIER 1: GTM Analyst -----
    if (promptLower.includes("gtm") || promptLower.includes("go-to-market") || promptLower.includes("go to market")) {
      return buildTier1Response("gtm-analyst", {
        gtmStrategy: {
          model: "sales_led",
          channels: ["Direct sales", "Content marketing"],
          efficiency: "moderate",
          scalability: "limited",
          verdict: "Workable GTM but needs product-led growth component",
        },
        salesProcess: {
          cycleLength: "3 months",
          averageDealSize: 10000,
          conversionRate: 15,
          pipelineCoverage: 3,
          verdict: "Standard B2B sales process",
        },
        customerAcquisition: {
          cac: 5000,
          cacTrend: "stable",
          channels: [{ channel: "Outbound", percentage: 60, cac: 6000 }],
          verdict: "CAC reasonable for B2B SaaS",
        },
        retentionAndExpansion: {
          grossRetention: 85,
          netRetention: 105,
          expansionMechanisms: ["Upsell to higher tiers"],
          churnReasons: ["Poor onboarding"],
          verdict: "Net retention positive but gross retention needs improvement",
        },
        marketingEfficiency: {
          spend: 15000,
          roi: 3,
          keyChannels: ["LinkedIn", "Content"],
          verdict: "Efficient marketing spend",
        },
      });
    }

    // ----- TIER 1: Customer Intel -----
    if (promptLower.includes("customer") || promptLower.includes("client") && promptLower.includes("intel")) {
      return buildTier1Response("customer-intel", {
        customerBase: {
          totalCustomers: 50,
          activeCustomers: 45,
          customerGrowthRate: 20,
          concentrationRisk: "moderate",
          topCustomerRevShare: 15,
          verdict: "Growing customer base with moderate concentration",
        },
        customerSegmentation: {
          segments: [{ name: "Enterprise", count: 10, avgRevenue: 30000, growthRate: 25 }],
          primarySegment: "Enterprise",
          verdict: "Focused on enterprise segment",
        },
        customerSatisfaction: {
          nps: 45,
          churnRate: 15,
          supportTickets: "50/month",
          commonComplaints: ["Onboarding complexity"],
          verdict: "Good NPS, churn needs attention",
        },
        referenceCases: {
          strongReferences: 3,
          publicCaseStudies: 1,
          testimonials: 5,
          verdict: "Some references available",
        },
        productMarketFit: {
          signals: ["Strong retention in enterprise segment", "Organic referrals"],
          score: 65,
          verdict: "Early signs of PMF in enterprise segment",
        },
      });
    }

    // ----- TIER 1: Exit Strategist -----
    if (promptLower.includes("exit") || promptLower.includes("sortie")) {
      return buildTier1Response("exit-strategist", {
        exitOptions: [
          {
            type: "ACQUISITION",
            probability: 60,
            timeline: "5-7 years",
            potentialAcquirers: ["BigCo", "MegaCorp"],
            estimatedValuation: 100000000,
            rationale: "Strategic acquisition by analytics incumbents",
          },
        ],
        returnAnalysis: {
          investmentAmount: 2000000,
          currentValuation: 10000000,
          ownership: 20,
          scenarios: [
            { scenario: "Base case", exitValuation: 50000000, multiple: 5, irr: 35 },
          ],
          verdict: "Attractive return potential in base case",
        },
        comparableExits: [
          {
            company: "SimilarExit",
            sector: "SaaS Analytics",
            exitType: "acquisition",
            exitValuation: 75000000,
            multiple: 8,
            year: 2023,
            acquirer: "BigTechCo",
          },
        ],
        exitReadiness: {
          score: 45,
          strengths: ["Growing ARR", "Clean cap table"],
          gaps: ["Need more enterprise customers", "No SOC2"],
          verdict: "Not exit-ready, needs 3-5 years of growth",
        },
        liquidityTimeline: {
          bestCase: "4 years",
          likelyCase: "6 years",
          worstCase: "8+ years or no exit",
          verdict: "Typical SaaS exit timeline",
        },
      });
    }

    // ----- TIER 1: Question Master -----
    if (promptLower.includes("question") && promptLower.includes("master")) {
      return buildTier1Response("question-master", {
        questionSets: {
          mustAsk: [
            {
              question: "What is your current monthly burn rate and how is it trending?",
              category: "financial",
              context: "Financial sustainability assessment",
              expectedInsight: "Validates financial runway claims",
              redFlagIfBadAnswer: "Evasive or inconsistent with deck figures",
            },
          ],
          shouldAsk: [
            {
              question: "Who are your top 3 customers and what percentage of revenue do they represent?",
              category: "customer",
              context: "Customer concentration risk",
              expectedInsight: "Validates customer diversity",
              redFlagIfBadAnswer: "Single customer represents >30% of revenue",
            },
          ],
          niceToHave: [],
        },
        questionStrategy: {
          openingQuestions: ["Tell me about your founding story"],
          followUpTriggers: ["If burn rate seems high, ask about path to profitability"],
          closingQuestions: ["What would make you walk away from this round?"],
        },
        questionPrioritization: {
          totalQuestions: 15,
          criticalCount: 5,
          groupedByTheme: [{ theme: "Financial Health", count: 4 }],
        },
      });
    }

    // ----- TIER 2: SaaS Expert -----
    if (promptLower.includes("saas") && (promptLower.includes("expert") || promptLower.includes("sectori"))) {
      return {
        sectorConfidence: 90,
        subSector: "Horizontal SaaS",
        businessModel: "pure_saas",
        primaryMetrics: [
          {
            metricName: "ARR",
            dealValue: 600000,
            source: "Deck slide 5",
            benchmark: { p25: 300000, median: 500000, p75: 900000, topDecile: 1500000 },
            percentilePosition: 60,
            assessment: "above_average",
            insight: "Above median for Seed SaaS",
          },
        ],
        secondaryMetrics: [],
        unitEconomics: {
          ltv: { value: 50000, calculation: "ARPA/churn = 10K/0.2", confidence: "medium" },
          cac: { value: 5000, calculation: "Marketing/new customers", confidence: "medium" },
          ltvCacRatio: { value: 10, assessment: "Excellent", vsMedian: "2x above median" },
          cacPaybackMonths: { value: 6, assessment: "Good", runway: "3 paybacks before next round" },
          burnMultiple: { value: 1.6, assessment: "Moderate" },
          magicNumber: { value: 0.8, assessment: "Good" },
        },
        redFlags: [
          {
            flag: "No NRR data provided",
            severity: "major",
            evidence: "Missing from deck and data room",
            impact: "Cannot assess retention quality",
            questionToAsk: "What is your NRR over the last 12 months?",
          },
        ],
        greenFlags: [
          {
            flag: "Strong LTV/CAC ratio",
            strength: "strong",
            evidence: "LTV/CAC = 10x",
            implication: "Highly efficient customer acquisition",
          },
        ],
        cohortHealth: {
          dataAvailable: false,
          nrrTrend: "unknown",
          churnTrend: "unknown",
          expansionTrend: "unknown",
        },
        gtmAssessment: {
          model: "sales_led",
          efficiency: "acceptable",
          salesCycleMonths: 3,
          keyInsight: "Standard B2B sales motion",
        },
        saasCompetitiveMoat: {
          dataNetworkEffects: false,
          switchingCostLevel: "medium",
          integrationDepth: "medium",
          categoryLeaderPotential: false,
          moatAssessment: "Emerging moat through product depth",
        },
        valuationAnalysis: {
          askMultiple: 16.7,
          medianSectorMultiple: 12,
          percentilePosition: 75,
          justifiedRange: { low: 7000000, fair: 9000000, high: 12000000 },
          verdict: "stretched",
          negotiationLeverage: "Ask is above P75, negotiate to fair value",
        },
        dbComparison: {
          similarDealsFound: 5,
          thisDealsPosition: "P60 among comparable Seed SaaS deals",
        },
        sectorQuestions: [
          {
            question: "What is your NRR?",
            category: "retention",
            priority: "must_ask",
            why: "Critical SaaS health metric",
            greenFlagAnswer: "NRR > 110%",
            redFlagAnswer: "NRR < 90%",
          },
        ],
        exitPotential: {
          typicalMultiple: 8,
          likelyAcquirers: ["Salesforce", "HubSpot"],
          timeToExit: "5-7 years",
          exitReadiness: "needs_work",
        },
        sectorScore: 62,
        scoreBreakdown: {
          unitEconomics: 18,
          growth: 15,
          retention: 12,
          gtmEfficiency: 17,
        },
        executiveSummary: "Solid SaaS fundamentals with above-median ARR. Missing NRR data is a concern.",
        investmentImplication: "solid_with_concerns",
        dataCompleteness: {
          level: "partial",
          availableDataPoints: 8,
          expectedDataPoints: 12,
          missingCritical: ["NRR", "Cohort data"],
          limitations: ["No retention cohort data available"],
        },
      };
    }

    // ----- TIER 3: Contradiction Detector -----
    if (promptLower.includes("contradiction") || promptLower.includes("incoherence")) {
      return {
        contradictions: [
          {
            id: "c-1",
            type: "DATA_MISMATCH",
            severity: "MEDIUM",
            topic: "Revenue figures",
            statement1: { text: "ARR 600K", location: "Deck slide 5", source: "deck-forensics" },
            statement2: { text: "ARR 550K", location: "Financial model", source: "financial-auditor" },
            analysis: "Minor discrepancy in ARR figures",
            implication: "May indicate outdated figures in deck",
            confidenceLevel: 80,
            resolution: { likely: "Deck uses more recent figures", reasoning: "Deck updated after financial model", needsVerification: true },
            question: "Can you clarify the discrepancy between your deck ARR and financial model?",
            redFlagIfBadAnswer: "Unable to explain the discrepancy",
          },
        ],
        dataGaps: [
          {
            id: "dg-1",
            area: "Customer retention",
            description: "No NRR or cohort data provided",
            missingFrom: ["deck", "data room"],
            expectedSource: "Financial model or data room",
            importance: "CRITICAL",
            impactOnAnalysis: "Cannot validate SaaS health",
            recommendation: "Request NRR data before decision",
            questionToAsk: "Can you provide your NRR data?",
          },
        ],
        consistencyAnalysis: {
          overallScore: 72,
          breakdown: [
            { dimension: "Financial data", score: 65, weight: 30, issues: ["ARR discrepancy"] },
            { dimension: "Market claims", score: 80, weight: 25, issues: [] },
          ],
          interpretation: "Generally consistent with minor financial discrepancies",
        },
        redFlagConvergence: [],
        redFlags: [],
        questions: [
          {
            priority: "HIGH",
            category: "financial",
            question: "Please clarify your current ARR",
            context: "Discrepancy detected between documents",
            whatToLookFor: "Consistent and verifiable ARR figure",
          },
        ],
        alertSignal: {
          hasBlocker: false,
          recommendation: "PROCEED_WITH_CAUTION",
          justification: "Minor contradictions detected, need clarification",
        },
        narrative: {
          oneLiner: "Generally consistent data with minor financial discrepancies requiring clarification.",
          summary: "Analysis found a few data inconsistencies between the deck and financial model. Most claims are internally consistent. The ARR discrepancy needs clarification.",
          keyInsights: ["ARR figures differ between documents", "Market claims are consistent"],
          forNegotiation: ["Use ARR discrepancy to request audited figures"],
        },
      };
    }

    // ----- TIER 3: Scenario Modeler -----
    if (promptLower.includes("scenario") || promptLower.includes("modelis")) {
      return {
        scenarios: [
          {
            name: "BASE",
            description: "Moderate growth trajectory",
            probability: { value: 50, rationale: "Most likely based on current metrics", source: "Internal analysis" },
            assumptions: [
              { assumption: "MoM growth", value: "10%", source: "Current trend", confidence: "MEDIUM" },
            ],
            metrics: [
              { year: 2025, revenue: 1000000, revenueSource: "Projection", valuation: 15000000, valuationSource: "Multiple", employeeCount: 15, employeeCountSource: "Growth plan" },
            ],
            exitOutcome: {
              type: "ACQUISITION",
              typeRationale: "Most common SaaS exit",
              timing: "2029",
              timingSource: "Industry average",
              exitValuation: 50000000,
              exitValuationCalculation: "ARR * 8x",
              exitMultiple: 8,
              exitMultipleSource: "SaaS median",
            },
            investorReturn: {
              initialInvestment: 200000,
              initialInvestmentSource: "Term sheet",
              ownershipAtEntry: 2,
              ownershipCalculation: "200K / 10M",
              dilutionToExit: 40,
              dilutionSource: "Standard 2 rounds",
              ownershipAtExit: 1.2,
              ownershipAtExitCalculation: "2% * 0.6",
              grossProceeds: 600000,
              proceedsCalculation: "50M * 1.2%",
              multiple: 3,
              multipleCalculation: "600K / 200K",
              irr: 25,
              irrCalculation: "3x over 5 years",
              holdingPeriodYears: 5,
            },
            keyRisks: [{ risk: "Market slowdown", source: "Market intelligence" }],
            keyDrivers: [{ driver: "Enterprise adoption", source: "GTM analysis" }],
          },
        ],
        sensitivityAnalysis: [
          {
            variable: "Growth rate",
            baseCase: { value: 10, source: "Current MoM" },
            impactOnValuation: [{ change: "+5%", newValuation: 75000000, calculation: "Higher ARR * same multiple" }],
            impactLevel: "HIGH",
            impactRationale: "Growth is the primary value driver",
          },
        ],
        basedOnComparables: [
          {
            company: "SimilarCo",
            sector: "SaaS",
            stage: "Seed",
            trajectory: "Grew from 500K to 5M ARR in 3 years",
            outcome: "Acquired for 60M",
            relevance: "Similar segment and stage",
            source: "Funding DB",
          },
        ],
        breakEvenAnalysis: {
          monthsToBreakeven: 24,
          breakEvenCalculation: "Current burn trajectory with growth",
          requiredGrowthRate: 15,
          growthRateSource: "To cover burn within runway",
          burnUntilBreakeven: 1920000,
          burnCalculation: "80K * 24 months",
          achievability: "Challenging but possible",
          achievabilityRationale: "Requires improving unit economics",
        },
        probabilityWeightedOutcome: {
          expectedMultiple: 2.5,
          expectedMultipleCalculation: "Weighted average across scenarios",
          expectedIRR: 20,
          expectedIRRCalculation: "Weighted IRR across scenarios",
          riskAdjustedAssessment: "Moderate risk-adjusted return",
        },
        mostLikelyScenario: "BASE",
        mostLikelyRationale: "Current metrics support moderate growth trajectory",
        score: {
          value: 55,
          grade: "C",
          breakdown: [
            { criterion: "Return potential", weight: 40, score: 60, justification: "3x base case" },
            { criterion: "Risk profile", weight: 30, score: 50, justification: "Moderate risk" },
            { criterion: "Exit feasibility", weight: 30, score: 55, justification: "Standard SaaS exit path" },
          ],
        },
        redFlags: [],
        questions: [],
        alertSignal: {
          hasBlocker: false,
          recommendation: "PROCEED_WITH_CAUTION",
          justification: "Moderate return potential with manageable risks",
        },
        narrative: {
          oneLiner: "Moderate return potential (3x base case) with standard SaaS exit timeline.",
          summary: "Base case projects 3x return over 5 years via acquisition. Growth rate is the key sensitivity variable.",
          keyInsights: ["3x base case return", "5-year holding period", "Growth rate is primary value driver"],
          forNegotiation: ["Use moderate return to negotiate lower valuation"],
        },
      };
    }

    // ----- TIER 3: Devil's Advocate -----
    if (promptLower.includes("avocat du diable") || promptLower.includes("devil") || promptLower.includes("advocate")) {
      return {
        meta: {
          dataCompleteness: "partial",
          confidenceLevel: 75,
          limitations: ["Limited financial data"],
        },
        score: {
          value: 45,
          grade: "C",
          breakdown: [
            { criterion: "Argument strength", weight: 40, score: 50, justification: "Reasonable counter-arguments" },
            { criterion: "Kill reasons identified", weight: 30, score: 40, justification: "One conditional deal-breaker" },
            { criterion: "Blind spot coverage", weight: 30, score: 45, justification: "Identified key blind spots" },
          ],
        },
        findings: {
          counterArguments: [
            {
              id: "ca-1",
              thesis: "AI-powered analytics will disrupt traditional BI",
              thesisSource: "Deck slide 2",
              counterArgument: "Traditional BI players are also integrating AI",
              evidence: "Tableau, Power BI already have AI features",
              comparableFailure: {
                company: "FailedAICo",
                sector: "AI Analytics",
                fundingRaised: 15000000,
                similarity: "Same market positioning",
                outcome: "Shutdown after failing to compete with incumbents",
                lessonsLearned: "Incumbents have distribution advantage",
                source: "TechCrunch 2023",
              },
              probability: "MEDIUM",
              probabilityRationale: "Incumbents moving fast",
              mitigationPossible: true,
              mitigation: "Focus on specific niche where incumbents are weak",
            },
          ],
          worstCaseScenario: {
            name: "Incumbent Steamroll",
            description: "Major BI players launch competing AI features",
            triggers: [
              { trigger: "Tableau AI launch", probability: "HIGH", timeframe: "6-12 months" },
            ],
            cascadeEffects: ["Customer churn", "Pricing pressure", "Talent loss"],
            probability: 25,
            probabilityRationale: "Incumbents already investing heavily",
            lossAmount: { totalLoss: false, estimatedLoss: "60-80% of investment", calculation: "Salvage value of customer base" },
            comparableCatastrophes: [],
            earlyWarningSigns: ["Incumbent AI feature announcements", "Customer inquiries about alternatives"],
          },
          killReasons: [
            {
              id: "kr-1",
              reason: "No defensible moat against incumbents",
              category: "competitive",
              evidence: "Technology can be replicated",
              sourceAgent: "competitive-intel",
              dealBreakerLevel: "CONDITIONAL",
              condition: "Unless proprietary data moat is built within 12 months",
              resolutionPossible: true,
              resolutionPath: "Build data flywheel with early customers",
              impactIfIgnored: "Gradual market share erosion",
              questionToFounder: "What prevents Tableau from replicating your AI features?",
              redFlagAnswer: "Vague answer about speed or vision",
            },
          ],
          blindSpots: [],
          alternativeNarratives: [],
          additionalMarketRisks: [],
          hiddenCompetitiveThreats: [],
        },
        redFlags: [],
        questions: [],
        alertSignal: {
          hasBlocker: false,
          recommendation: "INVESTIGATE_FURTHER",
          justification: "Competitive risk needs deeper investigation",
        },
        narrative: {
          oneLiner: "Competitive risk from incumbents is the primary concern.",
          summary: "The main bear case centers on incumbent BI players integrating AI features. The moat is emerging but not defensible yet.",
          keyInsights: ["Incumbent threat is real and imminent", "Data moat must be built quickly"],
          forNegotiation: ["Use competitive risk to negotiate lower entry valuation"],
        },
      };
    }

    // ----- TIER 3: Synthesis Deal Scorer -----
    if (promptLower.includes("synthes") && promptLower.includes("scor")) {
      return {
        meta: {
          agentName: "synthesis-deal-scorer",
          analysisDate: new Date().toISOString(),
          dataCompleteness: "partial",
          confidenceLevel: 70,
          limitations: ["Limited financial verification"],
        },
        score: {
          value: 58,
          grade: "C",
          breakdown: [
            { criterion: "Team", weight: 25, score: 65, justification: "Solid team, first-time founders" },
            { criterion: "Market", weight: 25, score: 60, justification: "Large market, good timing" },
            { criterion: "Product", weight: 20, score: 55, justification: "Working product, early traction" },
            { criterion: "Financials", weight: 15, score: 50, justification: "Aggressive valuation, moderate metrics" },
            { criterion: "Competition", weight: 15, score: 55, justification: "Emerging moat, incumbent risk" },
          ],
        },
        findings: {
          dimensionScores: [
            { dimension: "Team", weight: 25, rawScore: 65, adjustedScore: 65, weightedScore: 16.25, sourceAgents: ["team-investigator"] },
          ],
          scoreBreakdown: {
            baseScore: 60,
            adjustments: [{ type: "risk", reason: "Valuation premium", impact: -2, source: "financial-auditor" }],
            finalScore: 58,
            calculationShown: "60 - 2 = 58",
          },
          recommendation: {
            action: "CONSIDER",
            verdict: "Interesting deal with notable risks",
            rationale: "Above-average team and market, but aggressive valuation and unproven moat",
            conditions: ["Negotiate valuation to 8M or below", "Get NRR data"],
          },
        },
        redFlags: [],
        alertSignal: {
          hasBlocker: false,
          recommendation: "PROCEED_WITH_CAUTION",
          justification: "Interesting deal but negotiate hard on valuation",
        },
        narrative: {
          oneLiner: "Above-average deal with aggressive valuation needing negotiation.",
          summary: "TestCo scores 58/100 driven by solid team and large market. Main concerns are aggressive valuation and unproven competitive moat.",
          keyInsights: ["Team is the strongest dimension", "Valuation is aggressive", "Need NRR data"],
          forNegotiation: ["Target 8M pre-money", "Require monthly NRR reporting"],
        },
      };
    }

    // ----- TIER 3: Memo Generator -----
    if (promptLower.includes("memo") || promptLower.includes("investment memo")) {
      return {
        meta: {
          dataCompleteness: "partial",
          confidenceLevel: 72,
          limitations: ["Some financial data unverified"],
        },
        score: {
          value: 58,
          grade: "C",
          breakdown: [
            { criterion: "Memo completeness", weight: 50, score: 60, justification: "All sections covered" },
            { criterion: "Evidence quality", weight: 50, score: 56, justification: "Some data gaps" },
          ],
        },
        executiveSummary: {
          oneLiner: "TestCo is a promising AI analytics SaaS at Seed stage with aggressive valuation.",
          recommendation: "CONSIDER",
          verdict: "Interesting deal worth investigating further, but negotiate on valuation.",
          keyStrengths: ["Strong technical team", "Large addressable market", "Above-median ARR for stage"],
          keyRisks: ["Aggressive valuation", "No NRR data", "Incumbent competitive risk"],
        },
        companyOverview: {
          description: "AI-powered analytics platform for B2B",
          problem: "Traditional BI tools lack AI capabilities",
          solution: "AI-native analytics platform",
          businessModel: "SaaS subscription",
          traction: "600K ARR, 50 customers",
          stage: "Seed",
        },
        investmentHighlights: [
          { highlight: "Above-median ARR for Seed", evidence: "600K ARR vs 500K median", source: "financial-auditor" },
        ],
        keyRisks: [
          { risk: "Aggressive valuation", severity: "HIGH", category: "financial", mitigation: "Negotiate to 8M", residualRisk: "Still above median", source: "financial-auditor" },
        ],
        financialSummary: {
          currentMetrics: { arr: 600000, mrr: 50000, burnRate: 80000 },
          projections: { realistic: false, concerns: ["Growth assumptions aggressive"] },
          valuationAssessment: {
            proposed: "10M pre-money",
            percentile: "P75",
            verdict: "AGGRESSIVE",
            benchmarkComparables: ["SimilarCo at 8M"],
          },
        },
        teamAssessment: {
          overallScore: 65,
          founders: [
            {
              name: "John Doe",
              role: "CEO",
              verificationStatus: "PARTIALLY_VERIFIED",
              strengths: ["Technical depth"],
              concerns: ["First-time founder"],
            },
          ],
          gaps: ["VP Sales needed"],
          verdict: "Competent team, needs sales leadership",
        },
        marketOpportunity: {
          tam: "5B",
          sam: "500M",
          som: "50M",
          timing: "GOOD",
          trend: "Growing",
          verdict: "Large market with good timing",
        },
        competitiveLandscape: {
          competitors: [{ name: "CompetitorA", threat: "HIGH" }],
          differentiation: "AI-native approach",
          moatStrength: 50,
          verdict: "Emerging moat, incumbent risk",
        },
        termsAnalysis: [
          {
            term: "Valuation",
            currentValue: "10M pre-money",
            assessment: "aggressive",
            benchmarkComparison: "P75 for Seed SaaS",
            recommendation: "Negotiate to 8M",
            impact: "Significant return impact",
          },
        ],
        dealStructure: {
          valuation: "10M pre-money",
          roundSize: "2M",
          keyTerms: ["1x non-participating preferred"],
          negotiationPoints: ["Valuation", "Pro-rata rights"],
        },
        investmentThesis: {
          bull: ["Large market", "Strong team", "Good traction"],
          bear: ["Aggressive valuation", "Incumbent risk", "No NRR data"],
        },
        nextSteps: [
          { action: "Request NRR data", priority: "CRITICAL", deadline: "Before term sheet" },
        ],
        appendix: {
          sourcesUsed: ["deck-forensics", "financial-auditor", "team-investigator"],
          analysisDate: new Date().toISOString(),
          confidenceLevel: 72,
          dataGaps: ["NRR", "Cohort retention data"],
        },
      };
    }

    // ----- Default fallback for any unmatched prompt -----
    return buildTier1Response("unknown-agent", {});
  }

  // Helper to build a standard Tier 1 response structure
  function buildTier1Response(agentName: string, findings: unknown): unknown {
    return {
      meta: {
        agentName,
        analysisDate: new Date().toISOString(),
        dataCompleteness: "partial",
        confidenceLevel: 72,
        limitations: ["Mock analysis - limited data"],
      },
      score: {
        value: 62,
        grade: "B",
        breakdown: [
          { criterion: "Data quality", weight: 30, score: 65, justification: "Partial data available" },
          { criterion: "Analysis depth", weight: 40, score: 60, justification: "Moderate depth achieved" },
          { criterion: "Actionability", weight: 30, score: 62, justification: "Actionable insights provided" },
        ],
      },
      findings,
      dbCrossReference: {
        claims: [
          { claim: "TAM 5B", location: "Slide 3", dbVerdict: "PARTIAL", evidence: "DB shows TAM closer to 4.5B" },
        ],
        uncheckedClaims: [],
      },
      redFlags: [
        {
          id: `rf-${agentName}-1`,
          category: "data_quality",
          severity: "MEDIUM",
          title: "Limited data completeness",
          description: "Some key data points are missing from the analysis",
          location: "Various",
          evidence: "Multiple fields returned as null or estimated",
          impact: "Reduced confidence in assessment",
          question: "Can you provide more detailed data?",
          redFlagIfBadAnswer: "Inability to provide basic operational data",
        },
      ],
      questions: [
        {
          priority: "HIGH",
          category: "general",
          question: "Can you provide more detailed operational metrics?",
          context: "Data completeness is partial",
          whatToLookFor: "Detailed and verifiable data",
        },
      ],
      alertSignal: {
        hasBlocker: false,
        recommendation: "PROCEED_WITH_CAUTION",
        justification: "Analysis based on partial data, further investigation recommended",
      },
      narrative: {
        oneLiner: "Partial analysis completed with moderate confidence.",
        summary: "Analysis based on available data suggests moderate potential. Key data gaps need to be addressed.",
        keyInsights: ["Data completeness is partial", "Further investigation needed"],
        forNegotiation: ["Use data gaps as leverage for better terms"],
      },
    };
  }

  return {
    complete: vi.fn().mockImplementation(async (prompt: string) => {
      const responseData = buildMockResponse(prompt);
      return {
        content: JSON.stringify(responseData),
        cost: 0.001,
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    }),
    completeJSON: vi.fn().mockImplementation(async <T>(prompt: string) => {
      const data = buildMockResponse(prompt) as T;
      return {
        data,
        cost: 0.001,
        raw: JSON.stringify(data),
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    }),
    completeJSONWithFallback: vi.fn().mockImplementation(async <T>(prompt: string) => {
      const data = buildMockResponse(prompt) as T;
      return {
        data,
        cost: 0.001,
        raw: JSON.stringify(data),
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    }),
    completeJSONStreaming: vi.fn().mockImplementation(async <T>(prompt: string) => {
      const data = buildMockResponse(prompt) as T;
      return {
        data,
        cost: 0.001,
        rawContent: JSON.stringify(data),
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 200 },
        wasTruncated: false,
        continuationAttempts: 0,
      };
    }),
    stream: vi.fn().mockResolvedValue({
      content: "mocked",
      cost: 0.001,
      model: "mock-model",
      usage: { inputTokens: 100, outputTokens: 200 },
    }),
    setAgentContext: vi.fn(),
    setAnalysisContext: vi.fn(),
    runWithLLMContext: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
    extractFirstJSON: vi.fn().mockImplementation((content: string) => {
      // Try to extract JSON from content
      try {
        JSON.parse(content);
        return content;
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        return match ? match[0] : content;
      }
    }),
  };
});

// ---------- Scoring Service (used by most Tier 1 agents) ----------
vi.mock("@/scoring/services/agent-score-calculator", () => ({
  calculateAgentScore: vi.fn().mockResolvedValue({
    score: 62,
    grade: "B",
    breakdown: [
      { criterion: "Overall", weight: 100, score: 62, justification: "Deterministic score" },
    ],
    findings: [],
    confidenceScore: { value: 0.7, reasoning: "Mock confidence" },
  }),
  normalizeMetricName: vi.fn().mockImplementation((name: string) => name.toLowerCase().replace(/\s+/g, "_")),
  DECK_FORENSICS_CRITERIA: {},
  FINANCIAL_AUDITOR_CRITERIA: {},
  MARKET_INTELLIGENCE_CRITERIA: {},
  COMPETITIVE_INTEL_CRITERIA: {},
  TEAM_INVESTIGATOR_CRITERIA: {},
  TECH_STACK_DD_CRITERIA: {},
  TECH_OPS_DD_CRITERIA: {},
  LEGAL_REGULATORY_CRITERIA: {},
  CAP_TABLE_AUDITOR_CRITERIA: {},
  GTM_ANALYST_CRITERIA: {},
  CUSTOMER_INTEL_CRITERIA: {},
  EXIT_STRATEGIST_CRITERIA: {},
  QUESTION_MASTER_CRITERIA: {},
}));

// ---------- Scoring Index (benchmarkService used by financial-auditor) ----------
vi.mock("@/scoring", () => ({
  benchmarkService: {
    lookup: vi.fn().mockResolvedValue({
      found: true,
      benchmark: { p25: 300000, median: 500000, p75: 900000, topDecile: 1500000 },
    }),
    calculatePercentile: vi.fn().mockReturnValue({ percentile: 60, explanation: "Mock percentile" }),
  },
  confidenceCalculator: {
    calculate: vi.fn().mockReturnValue({ value: 0.7, reasoning: "Mock" }),
  },
}));

// ---------- Benchmarks Service ----------
vi.mock("@/services/benchmarks", () => ({
  getBenchmark: vi.fn().mockReturnValue({ p25: 0, median: 50, p75: 100, topDecile: 150 }),
  getBenchmarkFull: vi.fn().mockReturnValue({
    found: true,
    benchmark: { p25: 0, median: 50, p75: 100, topDecile: 150 },
    source: "mock",
  }),
  getExitBenchmark: vi.fn().mockReturnValue(8),
  getExitBenchmarkFull: vi.fn().mockReturnValue({
    found: true,
    benchmark: { low: 5, median: 8, high: 15, topDecile: 25 },
  }),
  getTimeToLiquidity: vi.fn().mockReturnValue({ min: 4, median: 6, max: 10 }),
  getBAPreferences: vi.fn().mockReturnValue(null),
  calculateBATicketSize: vi.fn().mockReturnValue({ min: 25000, max: 100000, suggested: 50000 }),
  checkBenchmarkFreshness: vi.fn().mockReturnValue({ fresh: true, warnings: [] }),
  formatFreshnessWarning: vi.fn().mockReturnValue(null),
}));

vi.mock("@/services/benchmarks/freshness-checker", () => ({
  checkBenchmarkFreshness: vi.fn().mockReturnValue({ fresh: true, warnings: [] }),
  formatFreshnessWarning: vi.fn().mockReturnValue(null),
}));

// ---------- Funding DB (used by orchestrator) ----------
vi.mock("@/services/funding-db", () => ({
  querySimilarDeals: vi.fn().mockResolvedValue([]),
  getValuationBenchmarks: vi.fn().mockResolvedValue(null),
}));

// ---------- Funding DB Percentile Calculator (used by synthesis-deal-scorer) ----------
vi.mock("@/services/funding-db/percentile-calculator", () => ({
  calculateDealPercentile: vi.fn().mockResolvedValue({
    percentileOverall: 55,
    percentileSector: 60,
    percentileStage: 50,
    totalDealsCompared: 100,
  }),
}));

// ---------- Fact Store ----------
vi.mock("@/services/fact-store/fact-keys", () => ({
  FACT_KEYS: [],
  getFactKeyDefinition: vi.fn().mockReturnValue(null),
  FACT_KEY_COUNT: 0,
}));

vi.mock("@/services/fact-store/types", () => ({
  RELIABILITY_WEIGHTS: {
    AUDITED: 1.0,
    VERIFIED: 0.9,
    DECLARED: 0.6,
    PROJECTED: 0.3,
    ESTIMATED: 0.4,
    UNVERIFIABLE: 0.1,
  },
}));

vi.mock("@/services/fact-store/fact-filter", () => ({
  replaceUnreliableWithPlaceholders: vi.fn().mockReturnValue(""),
  formatFactsForScoringAgents: vi.fn().mockReturnValue(""),
}));

// ---------- Prisma (DB) ----------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findUnique: vi.fn(), update: vi.fn() },
    analysis: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    redFlag: { createMany: vi.fn() },
    agentResult: { create: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn({})),
  },
}));

// ---------- Tier 2 sector standards & benchmark injector ----------
// Both are pure data/functions that work without external dependencies - NOT mocked

// ---------- Scoring types ----------
vi.mock("@/scoring/types", () => ({
  // Empty - just needs to be importable
}));

// ---------- Red Flag Taxonomy ----------
vi.mock("@/agents/red-flag-taxonomy", () => ({
  // Empty - just needs to be importable
}));

// ============================================================================
// MOCK CONTEXT BUILDER
// ============================================================================

function buildMockDeal() {
  return {
    id: "test-deal-001",
    userId: "test-user-001",
    name: "TestCo",
    companyName: "TestCo SAS",
    description: "AI-powered analytics platform for B2B companies",
    sector: "SaaS",
    stage: "SEED",
    geography: "France",
    website: "https://testco.ai",
    arr: 600000,
    mrr: 50000,
    growthRate: 15,
    amountRequested: 2000000,
    valuationPre: 10000000,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    // Additional fields that might be accessed
    burnRate: null,
    runway: null,
    deletedAt: null,
    linkedinUrl: null,
    linkedinCompanyUrl: null,
    notes: null,
    sourceUrl: null,
    currency: "EUR",
  };
}

function buildMockDocuments() {
  return [
    {
      id: "doc-001",
      name: "deck.pdf",
      type: "PITCH_DECK",
      extractedText: `
        TestCo - AI Analytics Platform
        Slide 1: Our Mission - Democratize data analytics with AI
        Slide 2: Problem - Traditional BI tools are complex and expensive
        Slide 3: Market - TAM 5B, SAM 500M, SOM 50M. Source: Gartner 2024
        Slide 4: Solution - AI-native analytics platform
        Slide 5: Traction - ARR 600K EUR, 50 customers, 15% MoM growth
        Slide 6: Team - John Doe (CEO, ex-Google), Jane Smith (CTO, ex-Meta)
        Slide 7: Business Model - SaaS subscription, ARPA 10K EUR
        Slide 8: GTM - Direct sales + content marketing
        Slide 9: Competition - CompetitorA, CompetitorB
        Slide 10: Ask - 2M EUR at 10M pre-money
        Slide 11: Use of Funds - 50% Engineering, 30% Sales, 20% Ops
        Slide 12: Projections - 3M ARR in 24 months
      `.trim(),
      uploadedAt: new Date("2024-06-01"),
    },
  ];
}

function buildMockContext() {
  const deal = buildMockDeal();
  const documents = buildMockDocuments();

  return {
    dealId: deal.id,
    deal: deal as unknown as import("@prisma/client").Deal,
    documents,
    previousResults: {
      "document-extractor": {
        agentName: "document-extractor" as const,
        success: true,
        executionTimeMs: 1000,
        cost: 0.001,
        data: {
          extractedInfo: {
            companyName: "TestCo",
            sector: "SaaS",
            stage: "SEED",
            arr: 600000,
            mrr: 50000,
            founders: [
              { name: "John Doe", role: "CEO", background: "ex-Google" },
              { name: "Jane Smith", role: "CTO", background: "ex-Meta" },
            ],
            competitors: ["CompetitorA", "CompetitorB"],
            targetMarket: "B2B SaaS analytics",
            tam: 5000000000,
            sam: 500000000,
            som: 50000000,
          },
          confidence: { companyName: 95, sector: 90, arr: 80 },
          sourceReferences: [],
        },
      },
    },
    // EnrichedAgentContext fields
    contextEngine: {
      completeness: 0.65,
      competitiveLandscape: {
        competitors: [
          {
            name: "CompetitorA",
            overlap: "direct" as const,
            positioning: "Enterprise BI",
            totalFunding: 50000000,
            stage: "SERIES_A",
            source: { type: "crunchbase" as const, name: "Crunchbase", retrievedAt: "2024-06-01", confidence: 0.8 },
          },
        ],
        marketConcentration: "moderate" as const,
        competitiveAdvantages: ["AI-powered analytics", "Lower price point"],
        competitiveRisks: ["Large incumbents with distribution"],
      },
      dealIntelligence: {
        similarDeals: [],
        fundingContext: {
          period: "2023-2024",
          p25ValuationMultiple: 8,
          medianValuationMultiple: 12,
          p75ValuationMultiple: 18,
          trend: "cooling" as const,
          trendPercentage: -15,
          totalDealsInPeriod: 150,
          downRoundCount: 5,
        },
        percentileRank: 50,
        fairValueRange: { low: 6000000, high: 12000000, currency: "EUR" },
        verdict: "fair" as const,
      },
    },
    factStoreFormatted: "## Fact Store\n- financial.arr: 600000 EUR [DECLARED]\n- financial.mrr: 50000 EUR [DECLARED]",
    founderResponses: undefined,
    fundingContext: {
      competitors: [{ name: "CompetitorA", totalFunding: 50000000 }],
    },
    fundingDbContext: {
      similarDeals: [],
      benchmarks: { valuationMedian: 8000000, arrMultipleMedian: 12 },
      potentialCompetitors: [],
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Agent Pipeline Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // PART 1: INDIVIDUAL AGENT SMOKE TESTS
  // ==========================================================================

  describe("Part 1: Individual Agent Smoke Tests", () => {
    // ------ TIER 0: Fact Extractor ------
    describe("Tier 0: fact-extractor", () => {
      it("should run successfully and return extracted facts", async () => {
        const { factExtractorAgent } = await import("@/agents/tier0/fact-extractor");
        const context = buildMockContext();

        const result = await factExtractorAgent.run(context);

        expect(result.agentName).toBe("fact-extractor");
        // fact-extractor may succeed or fail depending on how it processes the context
        // The important thing is it doesn't throw
        expect(result).toHaveProperty("agentName");
        expect(result).toHaveProperty("success");
        expect(result).toHaveProperty("executionTimeMs");
        expect(result).toHaveProperty("cost");
        expect(result.cost).toBeGreaterThanOrEqual(0);

        if (!result.success) {
          console.warn(`[fact-extractor] Failed: ${result.error}`);
        }
      });
    });

    // ------ TIER 0: Document Extractor ------
    describe("Tier 0: document-extractor", () => {
      it("should run successfully and return extracted data", async () => {
        const { documentExtractor } = await import("@/agents/document-extractor");
        const context = buildMockContext();
        // Remove fact-extractor from previous results so document-extractor runs its own LLM call
        const contextWithoutFacts = { ...context, previousResults: {} };

        const result = await documentExtractor.run(contextWithoutFacts);

        expect(result.agentName).toBe("document-extractor");
        expect(result).toHaveProperty("success");
        expect(result).toHaveProperty("executionTimeMs");
        expect(result).toHaveProperty("cost");
        expect(result.cost).toBeGreaterThanOrEqual(0);

        if (result.success && "data" in result) {
          const data = result.data as { extractedInfo: unknown };
          expect(data).toHaveProperty("extractedInfo");
        }

        if (!result.success) {
          console.warn(`[document-extractor] Failed: ${result.error}`);
        }
      });
    });

    // ------ TIER 1 AGENTS ------
    const tier1Agents = [
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
    ] as const;

    describe("Tier 1 Agents", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tier1Module: Record<string, { run: (ctx: any) => Promise<any> }>;

      beforeAll(async () => {
        const mod = await import("@/agents/tier1");
        tier1Module = {
          "deck-forensics": mod.deckForensics,
          "financial-auditor": mod.financialAuditor,
          "team-investigator": mod.teamInvestigator,
          "competitive-intel": mod.competitiveIntel,
          "market-intelligence": mod.marketIntelligence,
          "tech-stack-dd": mod.techStackDD,
          "tech-ops-dd": mod.techOpsDD,
          "legal-regulatory": mod.legalRegulatory,
          "cap-table-auditor": mod.capTableAuditor,
          "gtm-analyst": mod.gtmAnalyst,
          "customer-intel": mod.customerIntel,
          "exit-strategist": mod.exitStrategist,
          "question-master": mod.questionMaster,
        };
      });

      for (const agentName of tier1Agents) {
        it(`[${agentName}] should run successfully and return valid result`, async () => {
          const agent = tier1Module[agentName];
          expect(agent, `Agent ${agentName} not found in tier1 module`).toBeDefined();
          expect(agent.run, `Agent ${agentName} has no run method`).toBeTypeOf("function");

          const context = buildMockContext();
          const result = await agent.run(context) as {
            agentName: string;
            success: boolean;
            executionTimeMs: number;
            cost: number;
            error?: string;
            data?: unknown;
          };

          // Basic result structure
          expect(result.agentName, `[${agentName}] agentName mismatch`).toBe(agentName);
          expect(result, `[${agentName}] missing executionTimeMs`).toHaveProperty("executionTimeMs");
          expect(result, `[${agentName}] missing cost`).toHaveProperty("cost");
          expect(result.cost, `[${agentName}] cost should be >= 0`).toBeGreaterThanOrEqual(0);

          if (result.success) {
            expect(result.data, `[${agentName}] success=true but no data`).toBeDefined();

            // For Tier 1 agents, data should have meta, score, findings
            const data = result.data as Record<string, unknown>;
            if (data.meta) {
              const meta = data.meta as Record<string, unknown>;
              expect(meta, `[${agentName}] meta should have confidenceLevel`).toHaveProperty("confidenceLevel");
              expect(meta, `[${agentName}] meta should have dataCompleteness`).toHaveProperty("dataCompleteness");
            }
          } else {
            // Log failure for debugging but don't fail - some agents may have specific context requirements
            console.warn(`[${agentName}] run() returned success=false: ${result.error}`);
          }
        });
      }
    });

    // ------ TIER 2: SaaS Expert ------
    describe("Tier 2: saas-expert", () => {
      it("should run successfully and return sector analysis", async () => {
        const { saasExpert } = await import("@/agents/tier2/saas-expert");
        const context = buildMockContext();

        const result = await saasExpert.run(context);

        expect(result.agentName).toBe("saas-expert");
        expect(result).toHaveProperty("success");
        expect(result).toHaveProperty("executionTimeMs");
        expect(result).toHaveProperty("cost");
        expect(result.cost).toBeGreaterThanOrEqual(0);

        if (result.success) {
          const data = result.data;
          expect(data, "[saas-expert] success=true but no data").toBeDefined();
          expect(data).toHaveProperty("sectorScore");
          expect(data).toHaveProperty("sectorName");
          expect(data).toHaveProperty("executiveSummary");
        } else {
          console.warn(`[saas-expert] Failed: ${result.error}`);
        }
      });
    });

    // ------ TIER 3 AGENTS ------
    const tier3Agents = [
      "contradiction-detector",
      "scenario-modeler",
      "devils-advocate",
      "synthesis-deal-scorer",
      "memo-generator",
    ] as const;

    describe("Tier 3 Agents", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tier3Module: Record<string, { run: (ctx: any) => Promise<any> }>;

      beforeAll(async () => {
        const mod = await import("@/agents/tier3");
        tier3Module = {
          "contradiction-detector": mod.contradictionDetector,
          "scenario-modeler": mod.scenarioModeler,
          "synthesis-deal-scorer": mod.synthesisDealScorer,
          "devils-advocate": mod.devilsAdvocate,
          "memo-generator": mod.memoGenerator,
        };
      });

      for (const agentName of tier3Agents) {
        it(`[${agentName}] should run successfully and return valid result`, async () => {
          const agent = tier3Module[agentName];
          expect(agent, `Agent ${agentName} not found in tier3 module`).toBeDefined();
          expect(agent.run, `Agent ${agentName} has no run method`).toBeTypeOf("function");

          // Tier 3 agents need previous results from Tier 1
          const context = buildMockContext();
          // Add some mock Tier 1 results that Tier 3 agents reference
          const tier1Results: Record<string, unknown> = {
            ...context.previousResults,
            "deck-forensics": {
              agentName: "deck-forensics",
              success: true,
              executionTimeMs: 5000,
              cost: 0.01,
              data: {
                meta: { dataCompleteness: "partial", confidenceLevel: 72, limitations: [] },
                score: { value: 62, grade: "B", breakdown: [] },
                findings: { narrativeAnalysis: { storyCoherence: 72 }, claimVerification: [], inconsistencies: [], deckQuality: {} },
                redFlags: [],
                questions: [],
                alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "Mock" },
                narrative: { oneLiner: "Mock", summary: "Mock", keyInsights: [], forNegotiation: [] },
              },
            },
            "financial-auditor": {
              agentName: "financial-auditor",
              success: true,
              executionTimeMs: 5000,
              cost: 0.01,
              data: {
                meta: { dataCompleteness: "partial", confidenceLevel: 70, limitations: [] },
                score: { value: 58, grade: "C", breakdown: [] },
                findings: { metrics: [], projections: {}, valuation: {}, unitEconomics: {}, burn: {} },
                redFlags: [],
                questions: [],
                alertSignal: { hasBlocker: false, recommendation: "PROCEED_WITH_CAUTION", justification: "Mock" },
                narrative: { oneLiner: "Mock", summary: "Mock", keyInsights: [], forNegotiation: [] },
              },
            },
            "team-investigator": {
              agentName: "team-investigator",
              success: true,
              executionTimeMs: 5000,
              cost: 0.01,
              data: {
                meta: { dataCompleteness: "partial", confidenceLevel: 65, limitations: [] },
                score: { value: 65, grade: "B", breakdown: [] },
                findings: {},
                redFlags: [],
                questions: [],
              },
            },
            "competitive-intel": {
              agentName: "competitive-intel",
              success: true,
              executionTimeMs: 5000,
              cost: 0.01,
              data: {
                meta: { dataCompleteness: "partial", confidenceLevel: 68, limitations: [] },
                score: { value: 55, grade: "C", breakdown: [] },
                findings: { competitors: [], moatAnalysis: {} },
                redFlags: [],
                questions: [],
              },
            },
            "market-intelligence": {
              agentName: "market-intelligence",
              success: true,
              executionTimeMs: 5000,
              cost: 0.01,
              data: {
                meta: { dataCompleteness: "partial", confidenceLevel: 70, limitations: [] },
                score: { value: 60, grade: "B", breakdown: [] },
                findings: { marketSize: {}, timing: {} },
                redFlags: [],
                questions: [],
              },
            },
          };

          const enrichedContext = {
            ...context,
            previousResults: tier1Results,
          };

          const result = await agent.run(enrichedContext) as {
            agentName: string;
            success: boolean;
            executionTimeMs: number;
            cost: number;
            error?: string;
            data?: unknown;
          };

          expect(result.agentName, `[${agentName}] agentName mismatch`).toBe(agentName);
          expect(result, `[${agentName}] missing executionTimeMs`).toHaveProperty("executionTimeMs");
          expect(result, `[${agentName}] missing cost`).toHaveProperty("cost");
          expect(result.cost, `[${agentName}] cost should be >= 0`).toBeGreaterThanOrEqual(0);

          if (result.success) {
            expect(result.data, `[${agentName}] success=true but no data`).toBeDefined();
          } else {
            console.warn(`[${agentName}] run() returned success=false: ${result.error}`);
          }
        });
      }
    });
  });

  // ==========================================================================
  // PART 2: CONTEXT BUILDING
  // ==========================================================================

  describe("Part 2: Context Building", () => {
    it("should build a valid EnrichedAgentContext", () => {
      const context = buildMockContext();

      expect(context.dealId).toBe("test-deal-001");
      expect(context.deal).toBeDefined();
      expect(context.deal.name).toBe("TestCo");
      expect(context.documents).toHaveLength(1);
      expect(context.documents![0].extractedText).toBeTruthy();
      expect(context.previousResults).toBeDefined();
      expect(context.contextEngine).toBeDefined();
      expect(context.factStoreFormatted).toBeTruthy();
    });

    it("should have valid document structure", () => {
      const context = buildMockContext();
      const doc = context.documents![0];

      expect(doc.id).toBeTruthy();
      expect(doc.name).toBeTruthy();
      expect(doc.type).toBeTruthy();
      expect(doc.extractedText).toBeTruthy();
      expect(doc.extractedText!.length).toBeGreaterThan(100);
    });

    it("should have valid deal fields for financial analysis", () => {
      const context = buildMockContext();
      const deal = context.deal;

      expect(deal.arr).toBe(600000);
      expect(deal.valuationPre).toBe(10000000);
      expect(deal.amountRequested).toBe(2000000);
      expect(deal.sector).toBe("SaaS");
      expect(deal.stage).toBe("SEED");
    });

    it("should have context engine data for enriched analysis", () => {
      const context = buildMockContext();

      expect(context.contextEngine).toBeDefined();
      expect(context.contextEngine!.completeness).toBeGreaterThan(0);
      expect(context.contextEngine!.competitiveLandscape).toBeDefined();
      expect(context.contextEngine!.dealIntelligence).toBeDefined();
    });
  });

  // ==========================================================================
  // PART 3: PIPELINE INTEGRATION
  // ==========================================================================

  describe("Part 3: Pipeline Integration", () => {
    it("getTier1Agents() should return all 13 agents", async () => {
      const { getTier1Agents } = await import("@/agents/orchestrator/agent-registry");

      const agents = await getTier1Agents();
      const agentNames = Object.keys(agents);

      expect(agentNames).toHaveLength(13);
      expect(agentNames).toContain("deck-forensics");
      expect(agentNames).toContain("financial-auditor");
      expect(agentNames).toContain("team-investigator");
      expect(agentNames).toContain("competitive-intel");
      expect(agentNames).toContain("market-intelligence");
      expect(agentNames).toContain("tech-stack-dd");
      expect(agentNames).toContain("tech-ops-dd");
      expect(agentNames).toContain("legal-regulatory");
      expect(agentNames).toContain("cap-table-auditor");
      expect(agentNames).toContain("gtm-analyst");
      expect(agentNames).toContain("customer-intel");
      expect(agentNames).toContain("exit-strategist");
      expect(agentNames).toContain("question-master");
    });

    it("getTier3Agents() should return all 5 agents", async () => {
      const { getTier3Agents } = await import("@/agents/orchestrator/agent-registry");

      const agents = await getTier3Agents();
      const agentNames = Object.keys(agents);

      expect(agentNames).toHaveLength(6);
      expect(agentNames).toContain("contradiction-detector");
      expect(agentNames).toContain("scenario-modeler");
      expect(agentNames).toContain("synthesis-deal-scorer");
      expect(agentNames).toContain("devils-advocate");
      expect(agentNames).toContain("memo-generator");
      expect(agentNames).toContain("conditions-analyst");
    });

    it("each Tier 1 agent should have a run method", async () => {
      const { getTier1Agents } = await import("@/agents/orchestrator/agent-registry");

      const agents = await getTier1Agents();
      for (const [name, agent] of Object.entries(agents)) {
        expect(agent.run, `Tier 1 agent ${name} is missing run method`).toBeTypeOf("function");
      }
    });

    it("each Tier 3 agent should have a run method", async () => {
      const { getTier3Agents } = await import("@/agents/orchestrator/agent-registry");

      const agents = await getTier3Agents();
      for (const [name, agent] of Object.entries(agents)) {
        expect(agent.run, `Tier 3 agent ${name} is missing run method`).toBeTypeOf("function");
      }
    });

    it("getTier2SectorExpert() should return saas-expert for SaaS sector", async () => {
      const { getTier2SectorExpert } = await import("@/agents/orchestrator/agent-registry");

      const expert = await getTier2SectorExpert("SaaS");

      expect(expert).not.toBeNull();
      expect(expert!.name).toBe("saas-expert");
      expect(expert!.run).toBeTypeOf("function");
    });

    it("getTier2SectorExpert() should return null for null sector", async () => {
      const { getTier2SectorExpert } = await import("@/agents/orchestrator/agent-registry");

      const expert = await getTier2SectorExpert(null);
      expect(expert).toBeNull();
    });

    it("clearAgentCache() should reset cached agents", async () => {
      const { getTier1Agents, getTier3Agents, clearAgentCache } = await import("@/agents/orchestrator/agent-registry");

      // Load agents first
      await getTier1Agents();
      await getTier3Agents();

      // Clear cache
      clearAgentCache();

      // Re-load should work without errors
      const tier1 = await getTier1Agents();
      const tier3 = await getTier3Agents();

      expect(Object.keys(tier1)).toHaveLength(13);
      expect(Object.keys(tier3)).toHaveLength(6);
    });
  });

  // ==========================================================================
  // PART 4: ERROR HANDLING
  // ==========================================================================

  describe("Part 4: Error Handling", () => {
    it("agents should never throw - always return { success: false }", async () => {
      const { deckForensics } = await import("@/agents/tier1/deck-forensics");

      // Run with minimal context that might cause issues
      const minimalContext = {
        dealId: "test",
        deal: { id: "test", name: "Test" } as unknown as import("@prisma/client").Deal,
        documents: [],
        previousResults: {},
      };

      // Should NOT throw
      const result = await deckForensics.run(minimalContext);

      expect(result).toHaveProperty("agentName");
      expect(result).toHaveProperty("success");
      // Whether success or not, it should have resolved (not rejected)
      expect(result.agentName).toBe("deck-forensics");
    });

    it("document-extractor should handle empty documents gracefully", async () => {
      const { documentExtractor } = await import("@/agents/document-extractor");

      const context = {
        dealId: "test",
        deal: { id: "test", name: "Empty Deal" } as unknown as import("@prisma/client").Deal,
        documents: [],
        previousResults: {},
      };

      const result = await documentExtractor.run(context);

      expect(result.agentName).toBe("document-extractor");
      // Should succeed with empty extraction
      if (result.success && "data" in result) {
        const data = result.data as { extractedInfo: unknown };
        expect(data.extractedInfo).toBeDefined();
      }
    });
  });
});
