/**
 * Creator Economy Expert Agent
 *
 * Sector coverage:
 * - Creator platforms (YouTube, TikTok, Twitch, Patreon, OnlyFans, Substack)
 * - Creator tools (editing, analytics, monetization, link-in-bio, scheduling)
 * - Creator-led brands and personal brands
 * - Media & Content (podcasts, newsletters, streaming)
 * - Influencer marketing platforms
 * - UGC platforms
 * - Multi-Channel Networks (MCN), Talent Management
 *
 * Key metrics: CPM/RPM, Creator LTV, Platform Dependency, Creator Retention,
 * Engagement Rate, Payout Ratio, Owned Audience, Monetization Diversification
 */

import type { EnrichedAgentContext } from "../types";
import type { SectorExpertType, SectorExpertResult, SectorExpertData, ExtendedSectorData } from "./types";
import { CREATOR_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";
import { SectorExpertOutputSchema, getDefaultSectorData } from "./base-sector-expert";

// ============================================================================
// CREATOR ECONOMY SUB-SECTORS
// ============================================================================

type CreatorSubSector =
  | "creator_platform"        // Patreon, Substack, OnlyFans
  | "creator_tools"           // Link-in-bio, scheduling, editing, analytics
  | "influencer_marketing"    // Brand-creator matchmaking platforms
  | "mcn_talent"              // Multi-Channel Networks, Talent agencies
  | "podcasting"              // Podcast hosting, distribution, monetization
  | "newsletter"              // Newsletter platforms, paid subscriptions
  | "streaming"               // Live streaming, VOD platforms
  | "ugc_platform"            // User-generated content, short-form video
  | "creator_brand"           // Creator-led D2C brands, merchandise
  | "media_content";          // Digital media, content studios

// ============================================================================
// CREATOR-SPECIFIC RISKS
// ============================================================================

const CREATOR_SECTOR_RISKS = [
  "Platform dependency: > 70% revenue from single platform = algorithm change can kill business",
  "Creator concentration: Top 10 creators > 50% revenue = single point of failure",
  "Algorithm volatility: Reach can drop 50-90% overnight without warning",
  "Demonetization risk: Policy violations instantly stop revenue",
  "Platform risk: Platform decline/ban destroys businesses (Vine, TikTok ban risk)",
  "Authenticity crisis: Fake followers/engagement undermine entire category",
  "Brand safety: Creator scandals damage all platform partnerships",
  "Rate deflation: Oversupply of creators pushing down sponsorship rates",
  "AI disruption: AI-generated content threatening human creators",
  "Attention fragmentation: New platforms constantly splitting audience",
  "Regulatory: FTC disclosure, COPPA for kids, international content rules",
  "Burnout: Creator burnout leads to churn and content quality decline",
];

// ============================================================================
// CREATOR SUCCESS PATTERNS
// ============================================================================

const CREATOR_SUCCESS_PATTERNS = [
  "Multi-platform presence: Audience on 3+ platforms reduces single-platform risk",
  "Owned audience: Strong email/SMS list for direct audience access",
  "Diversified monetization: 4+ revenue streams (ads, sponsors, merch, courses, memberships)",
  "Creator exclusivity: Exclusive contracts with top creators create moat",
  "Vertical niche dominance: #1 for specific creator category",
  "Tools that increase earnings: Products measurably improving creator income",
  "Community and network effects: Peer value beyond platform features",
  "B2B enterprise pivot: Services to brands/agencies (higher ACV, more stable)",
  "Data and analytics moat: Proprietary creator/audience insights",
  "Cross-platform tools: Value across platforms more defensible",
];

// ============================================================================
// CREATOR EXPERT CONFIG
// ============================================================================

export interface CreatorConfig {
  name: SectorExpertType;
  activationSectors: string[];
  primaryMetrics: string[];
  secondaryMetrics: string[];
  subSectorClassification: Record<string, CreatorSubSector>;
}

export const CREATOR_CONFIG: CreatorConfig = {
  name: "creator-expert",
  activationSectors: [
    "creator economy", "creator", "media", "content", "influencer",
    "influencer marketing", "social media", "podcasting", "podcast",
    "newsletter", "streaming", "ugc", "creator tools", "creator platform",
    "digital media", "media tech", "mcn", "talent management",
    "patreon", "substack", "youtube", "tiktok", "twitch",
  ],
  primaryMetrics: [
    "Creator Retention Rate",
    "Revenue per Creator (RPC)",
    "Platform Dependency Score",
    "Creator Acquisition Cost (CAC)",
    "Engagement Rate",
  ],
  secondaryMetrics: [
    "CPM / RPM",
    "Payout Ratio",
    "Owned Audience Ratio",
    "Monetization Diversification Score",
    "Content Velocity",
    "Creator NPS",
  ],
  subSectorClassification: {
    "patreon": "creator_platform",
    "substack": "newsletter",
    "onlyfans": "creator_platform",
    "youtube": "ugc_platform",
    "tiktok": "ugc_platform",
    "twitch": "streaming",
    "podcast": "podcasting",
    "newsletter": "newsletter",
    "influencer marketing": "influencer_marketing",
    "mcn": "mcn_talent",
    "talent management": "mcn_talent",
    "creator tools": "creator_tools",
    "link in bio": "creator_tools",
    "scheduling": "creator_tools",
    "streaming": "streaming",
    "media": "media_content",
    "content studio": "media_content",
    "merchandise": "creator_brand",
    "merch": "creator_brand",
  },
};

// ============================================================================
// SUB-SECTOR SPECIFIC CONTEXT
// ============================================================================

function getSubSectorContext(subSector: CreatorSubSector): string {
  const contexts: Record<CreatorSubSector, string> = {
    creator_platform: `
## CREATOR PLATFORM SPECIFIC CONTEXT

Creator platforms (Patreon, Ko-fi, Gumroad, OnlyFans model):
- **Payout ratio is CRITICAL**: Creators compare platforms. YouTube: 55%, Twitch: 50-70%, Patreon: 88-95%.
- **Creator retention**: Platform value = what creators earn. Low earnings = churn.
- **Take rate ceiling**: > 20% take rate very hard to justify vs alternatives.
- **Feature differentiation**: Memberships, tips, merch, exclusive content, community features.
- **Creator concentration risk**: Losing top creators = losing significant GMV.

KEY METRICS TO VERIFY:
- Payout ratio (what % goes to creators)
- Creator retention 12-month
- GMV per creator
- Creator concentration (top 10 = what % of GMV?)
- Net promoter score from creators`,

    creator_tools: `
## CREATOR TOOLS SPECIFIC CONTEXT

Creator tools (Linktree, Later, Descript, Riverside, analytics):
- **Standard SaaS metrics apply**: ARR, NRR, churn, CAC payback.
- **Freemium conversion**: Most use freemium. 2-5% conversion typical.
- **Feature commoditization**: Tools get copied fast. Must have moat.
- **Platform integration**: Tools working across platforms more valuable.
- **Creator willingness to pay**: Varies by creator size and earnings.

KEY METRICS TO VERIFY:
- MRR/ARR and growth
- Paid conversion rate from free
- Net Revenue Retention
- Creator segment (micro, mid, macro, mega)
- Cross-platform vs single-platform value`,

    influencer_marketing: `
## INFLUENCER MARKETING PLATFORM SPECIFIC CONTEXT

Influencer marketing platforms (Aspire, Grin, CreatorIQ):
- **Two-sided marketplace**: Brands on one side, creators on other.
- **Take rate model**: Usually 10-30% of campaign value.
- **Campaign volume**: Key driver of revenue.
- **Creator database quality**: Authentic creators with real engagement.
- **Measurement/attribution**: ROI proof is key differentiator.

KEY METRICS TO VERIFY:
- Campaign GMV and take rate
- Brand retention and repeat campaigns
- Creator database size and quality
- Fraud detection capabilities
- Attribution/measurement depth`,

    mcn_talent: `
## MCN / TALENT MANAGEMENT SPECIFIC CONTEXT

Multi-Channel Networks and Talent Agencies:
- **Creator concentration is CRITICAL**: Top creators leaving = existential.
- **Revenue share**: Typically 10-30% of creator earnings.
- **Value proposition**: What does the MCN provide? (brand deals, production, analytics)
- **Exclusivity contracts**: Lock-in vs creator-friendly terms.
- **Margin pressure**: Creators negotiate harder as they grow.

KEY METRICS TO VERIFY:
- Creator concentration (top 5 = what % revenue?)
- Average revenue share taken
- Creator tenure/retention
- Value delivered (incremental earnings for creators)
- Contract terms and exclusivity`,

    podcasting: `
## PODCASTING SPECIFIC CONTEXT

Podcast platforms and tools (Spotify for Podcasters, Buzzsprout, advertising):
- **CPM ranges**: $15-50 CPM for host-read, $10-25 for programmatic.
- **Listener retention**: Downloads vs completion rates matter.
- **Monetization threshold**: Usually 10K+ downloads/episode for meaningful ad revenue.
- **Diversification**: Ads, sponsorships, premium subscriptions, live events.
- **Discovery problem**: Getting new listeners is the hardest challenge.

KEY METRICS TO VERIFY:
- Downloads per episode
- Listener retention/completion rate
- CPM achieved
- Revenue diversification (ads vs subscriptions vs other)
- Year-over-year listener growth`,

    newsletter: `
## NEWSLETTER SPECIFIC CONTEXT

Newsletter platforms (Substack, Beehiiv, ConvertKit, Ghost):
- **Open rate benchmark**: 20-40% is healthy. < 15% = list quality issues.
- **Paid conversion**: Free to paid conversion 2-10% typical for quality content.
- **Subscriber LTV**: $5-15/month subscriptions typical. $50-200 LTV common.
- **Owned audience**: Email IS the owned audience - key advantage.
- **Platform take rate**: Substack: 10%, Beehiiv: varies, Ghost: flat fee.

KEY METRICS TO VERIFY:
- Total subscribers (free + paid)
- Free to paid conversion rate
- Open rate and click rate
- Subscriber churn rate
- Revenue per subscriber`,

    streaming: `
## LIVE STREAMING SPECIFIC CONTEXT

Streaming platforms and tools (Twitch-like, StreamYard, Restream):
- **Monetization mix**: Subscriptions, donations, bits/tips, ads, sponsorships.
- **Concurrent viewers**: Key metric for streamer value.
- **Platform dependency**: Heavy Twitch/YouTube dependency common.
- **Engagement**: Chat activity, donations per viewer.
- **Streamer burnout**: High burnout rate in streaming.

KEY METRICS TO VERIFY:
- Average concurrent viewers
- Revenue per viewer hour
- Subscription/supporter conversion
- Platform dependency (what % from each platform)
- Streamer retention rate`,

    ugc_platform: `
## UGC PLATFORM SPECIFIC CONTEXT

User-generated content platforms (TikTok-like, short-form):
- **Creator fund economics**: Often criticized as low. $0.02-0.05/1K views typical.
- **Engagement is everything**: Watch time, completion rate, shares.
- **Algorithm-driven discovery**: Success depends on algorithm favor.
- **Monetization challenge**: Most UGC creators don't earn much directly.
- **Brand deal dependency**: Real money in sponsorships, not platform payouts.

KEY METRICS TO VERIFY:
- Daily/Monthly Active Users
- Average watch time per session
- Creator retention rate
- Revenue per 1K views (RPM)
- Brand partnership volume`,

    creator_brand: `
## CREATOR-LED BRAND SPECIFIC CONTEXT

Creator-led D2C brands (MrBeast Feastables, Prime Hydration):
- **Audience = distribution**: Creator audience is the marketing channel.
- **D2C unit economics**: CAC effectively subsidized by existing audience.
- **Brand equity risk**: Creator reputation = brand reputation.
- **Product quality**: Can't rely on creator alone - product must stand.
- **Retail expansion**: Scaling beyond D2C to retail.

KEY METRICS TO VERIFY:
- Revenue and growth rate
- % sales from creator audience vs new customers
- Repeat purchase rate
- Customer acquisition cost (should be low)
- Retail distribution status`,

    media_content: `
## DIGITAL MEDIA / CONTENT STUDIO CONTEXT

Digital media companies, content studios:
- **CPM-based business**: Revenue = views x CPM.
- **Content cost**: Production cost per video/content piece.
- **Platform dependency**: Where is content distributed?
- **IP ownership**: Who owns the content? Critical for licensing.
- **Talent dependency**: Are there key talent whose departure kills the business?

KEY METRICS TO VERIFY:
- Monthly views/impressions
- Revenue per 1K views (RPM)
- Content production cost
- IP ownership structure
- Talent contract terms`,
  };

  return contexts[subSector] || contexts.creator_platform;
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

export function buildCreatorPrompt(context: EnrichedAgentContext): { system: string; user: string } {
  const { deal, documents, contextEngine, fundingDbContext } = context;

  // Determine sub-sector
  const sector = deal.sector?.toLowerCase() || "";
  let subSector: CreatorSubSector = "creator_platform";

  for (const [keyword, type] of Object.entries(CREATOR_CONFIG.subSectorClassification)) {
    if (sector.includes(keyword)) {
      subSector = type;
      break;
    }
  }

  // Get standards injection
  const standardsInjection = getStandardsOnlyInjection("Creator Economy", deal.stage || "SEED");
  const subSectorContext = getSubSectorContext(subSector);

  const systemPrompt = `Tu es un EXPERT SENIOR en Creator Economy avec 15 ans d'experience.
Tu as investi dans et conseille des dizaines de startups Creator Economy a succes (Patreon, Substack, Cameo, etc.).
Tu connais intimement les metriques, les risques, et les patterns de succes du secteur.

## TON ROLE
Analyser ce deal Creator Economy pour un Business Angel qui n'a PAS d'expertise sectorielle.
Ton analyse doit etre:
1. SPECIFIQUE au sub-secteur (${subSector})
2. CHIFFREE avec des benchmarks reels
3. ACTIONNABLE avec des questions concretes a poser
4. HONNETE sur les risques specifiques au Creator Economy

## CONTEXTE SECTORIEL CRITIQUE

Le Creator Economy est un secteur a TRES HAUT RISQUE pour les investisseurs:

**Risques majeurs:**
${CREATOR_SECTOR_RISKS.map(r => `- ${r}`).join("\n")}

**Patterns de succes:**
${CREATOR_SUCCESS_PATTERNS.map(p => `- ${p}`).join("\n")}

${subSectorContext}

${standardsInjection}

## FORMAT DE SORTIE OBLIGATOIRE

Tu dois retourner un JSON valide avec cette structure exacte:
{
  "subSector": {
    "primary": "string - le sous-secteur principal identifie",
    "secondary": ["autres sous-secteurs si applicable"],
    "rationale": "string - pourquoi ce sous-secteur"
  },
  "sectorFit": {
    "score": number 0-100,
    "sectorMaturity": "emerging" | "growing" | "mature" | "declining",
    "timingAssessment": "early_mover" | "good_timing" | "crowded" | "too_late",
    "reasoning": "string - justification detaillee"
  },
  "metricsAnalysis": [
    {
      "metricName": "string",
      "valueProvided": "string ou number - valeur donnee par la startup",
      "percentile": number 0-100 (vs secteur),
      "benchmark": { "p25": number, "median": number, "p75": number, "topDecile": number },
      "assessment": "exceptional" | "above_average" | "average" | "below_average" | "concerning",
      "sectorContext": "string - pourquoi cette metrique compte dans ce secteur",
      "dataGap": "string ou null - si la donnee est manquante ou suspecte"
    }
  ],
  "platformDependencyAnalysis": {
    "dependencyScore": number 0-100 (plus haut = plus dependant = plus risque),
    "primaryPlatforms": ["liste des plateformes dont depend le business"],
    "riskLevel": "low" | "medium" | "high" | "critical",
    "mitigationFactors": ["facteurs qui reduisent le risque"],
    "worstCaseScenario": "string - que se passe-t-il si la plateforme principale change?"
  },
  "creatorEconomicsAnalysis": {
    "businessModel": "string - comment le business gagne de l'argent",
    "takeRateOrPricing": "string - taux de commission ou pricing",
    "creatorValueProposition": "string - quelle valeur pour les createurs?",
    "creatorRetentionRisk": "low" | "medium" | "high" | "critical",
    "concentrationRisk": {
      "level": "low" | "medium" | "high" | "critical",
      "topCreatorsPercentage": number ou null,
      "assessment": "string"
    }
  },
  "sectorRedFlags": [
    {
      "flag": "string - le red flag identifie",
      "severity": "critical" | "major" | "minor",
      "evidence": "string - preuve concrete du deck",
      "sectorThreshold": "string - pourquoi c'est un red flag dans ce secteur",
      "question": "string - question a poser au fondateur"
    }
  ],
  "sectorOpportunities": [
    {
      "opportunity": "string",
      "potential": "high" | "medium" | "low",
      "sectorContext": "string - pourquoi c'est une opportunite dans ce secteur",
      "validationNeeded": "string - comment verifier"
    }
  ],
  "sectorDynamics": {
    "competitionIntensity": "low" | "medium" | "high" | "intense",
    "consolidationTrend": "fragmenting" | "stable" | "consolidating",
    "barrierToEntry": "low" | "medium" | "high",
    "regulatoryRisk": {
      "level": "low" | "medium" | "high",
      "keyRegulations": ["liste des regulations applicables"],
      "upcomingChanges": ["changements a venir"]
    },
    "exitLandscape": {
      "typicalMultiple": { "low": number, "median": number, "high": number },
      "recentExits": ["exemples d'exits recents dans le secteur"],
      "likelyAcquirers": ["acquereurs potentiels"]
    }
  },
  "sectorQuestions": [
    {
      "question": "string - question concrete a poser",
      "priority": "must_ask" | "should_ask" | "nice_to_have",
      "expectedGoodAnswer": "string - ce qu'une bonne reponse devrait inclure",
      "redFlagAnswer": "string - ce qui serait inquietant"
    }
  ],
  "executiveSummary": "string - 3-4 phrases resumant l'analyse sectorielle"
}

## REGLES ABSOLUES

1. **PLATFORM DEPENDENCY EST CRITIQUE**: C'est LE risque #1 du Creator Economy. Evalue-le serieusement.
2. **CREATOR CONCENTRATION**: Si top 10 creators > 50% revenue, c'est un CRITICAL red flag.
3. **PAS DE BULLSHIT**: Si une metrique n'est pas fournie, dis-le clairement. Ne l'invente pas.
4. **BENCHMARKS SOURCES**: Chaque benchmark doit avoir un contexte sectoriel.
5. **QUESTIONS CONCRETES**: Les questions doivent etre specifiques au Creator Economy.
6. **HONNETE SUR LES RISQUES**: Le Creator Economy a des risques structurels. Sois direct.

IMPORTANT: Retourne UNIQUEMENT le JSON, sans texte avant ou apres.`;

  // Format funding DB context if available
  const fundingDbText = fundingDbContext
    ? `### Deals Comparables de la DB
${fundingDbContext.competitors?.map(c => `- ${c.name}: ${c.totalFunding ? `€${c.totalFunding.toLocaleString()}` : "N/A"} - ${c.lastRound || "N/A"}`).join("\n") || "Pas de comparables"}
${fundingDbContext.sectorBenchmarks ? `\nBenchmarks secteur: ${JSON.stringify(fundingDbContext.sectorBenchmarks, null, 2)}` : ""}`
    : "Pas de donnees de comparables disponibles";

  // Format context engine data if available
  const contextEngineText = contextEngine?.dealIntelligence || contextEngine?.marketData || contextEngine?.competitiveLandscape
    ? `### Context Engine Data
${contextEngine.dealIntelligence ? `Deal Intelligence: ${JSON.stringify(contextEngine.dealIntelligence, null, 2)}` : ""}
${contextEngine.marketData ? `Market Data: ${JSON.stringify(contextEngine.marketData, null, 2)}` : ""}
${contextEngine.competitiveLandscape ? `Competitive Landscape: ${JSON.stringify(contextEngine.competitiveLandscape, null, 2)}` : ""}`
    : "Pas de donnees Context Engine disponibles";

  // Get extracted text from documents
  const deckText = documents
    ?.filter(d => d.extractedText)
    .map(d => `### ${d.name}\n${d.extractedText}`)
    .join("\n\n") || "Pas de contenu de deck disponible";


  // Funding DB from context engine
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDbFromEngine = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDbFromEngine) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE\n\nTu DOIS produire un champ "dbCrossReference" dans ton output.\n\n### Concurrents détectés dans la DB\n${fundingDbFromEngine.competitors ? JSON.stringify(fundingDbFromEngine.competitors, null, 2).slice(0, 3000) : "Aucun"}\n\n### Benchmark valorisation\n${fundingDbFromEngine.valuationBenchmark ? JSON.stringify(fundingDbFromEngine.valuationBenchmark, null, 2) : "N/A"}\n\n### Tendance funding\n${fundingDbFromEngine.sectorTrend ? JSON.stringify(fundingDbFromEngine.sectorTrend, null, 2) : "N/A"}\n\nINSTRUCTIONS DB:\n1. Claims deck \u2192 vérifié vs données\n2. Concurrents DB absents du deck = RED FLAG CRITICAL\n3. Valo vs percentiles\n4. "pas de concurrent" + DB en trouve = RED FLAG CRITICAL`;
  }

  const userPrompt = `Analyse ce deal Creator Economy:

## INFORMATIONS DU DEAL
- **Startup**: ${deal.companyName || "Non specifie"}
- **Secteur**: ${deal.sector || "Creator Economy"}
- **Stage**: ${deal.stage || "Non specifie"}
- **Valorisation demandee**: ${deal.valuationPre ? `€${(Number(deal.valuationPre) / 1000000).toFixed(1)}M` : "Non specifie"}
- **Montant demande**: ${deal.amountRequested ? `€${(Number(deal.amountRequested) / 1000).toFixed(0)}K` : "Non specifie"}
- **ARR**: ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Non specifie"}
- **Growth Rate**: ${deal.growthRate ? `${deal.growthRate}%` : "Non specifie"}

## DOCUMENTS DISPONIBLES
${documents?.map(d => `- ${d.name} (${d.type})`).join("\n") || "Aucun document fourni"}

## CONTENU DU PITCH DECK
${deckText}

${fundingDbData}\n\n## CONTEXTE ADDITIONNEL
${fundingDbText}

${contextEngineText}

---

Fournis ton analyse sectorielle complete au format JSON specifie.`;

  return { system: systemPrompt, user: userPrompt };
}

// ============================================================================
// CREATOR EXPERT AGENT
// ============================================================================

export const creatorExpert = {
  name: "creator-expert" as SectorExpertType,
  activationSectors: CREATOR_CONFIG.activationSectors,

  buildPrompt: buildCreatorPrompt,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const { system, user } = buildCreatorPrompt(context);

      setAgentContext("creator-expert");

      const response = await complete(user, {
        systemPrompt: system,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      const parsed = SectorExpertOutputSchema.safeParse(JSON.parse(extractFirstJSON(response.content)));

      if (!parsed.success) {
        console.warn("[creator-expert] Output validation warnings:", parsed.error.issues);
      }

      const output = parsed.success ? parsed.data : JSON.parse(extractFirstJSON(response.content));

      
      // === SCORE CAPPING based on data completeness ===
      const metricsAnalysis = output.metricsAnalysis ?? [];
      const availableMetrics = metricsAnalysis.filter((m: { valueProvided?: unknown }) => m.valueProvided !== null && m.valueProvided !== undefined && m.valueProvided !== "Non fourni").length;
      const totalMetrics = metricsAnalysis.length;
      let completenessLevel: "complete" | "partial" | "minimal" = "partial";
      if (totalMetrics > 0) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = "minimal";
        else if (ratio < 0.7) completenessLevel = "partial";
        else completenessLevel = "complete";
      }
      let scoreMax = 100;
      if (completenessLevel === "minimal") scoreMax = 50;
      else if (completenessLevel === "partial") scoreMax = 70;
      const rawScore = output.sectorFit?.score ?? 50;
      const cappedScore = Math.min(rawScore, scoreMax);

      // Transform to SectorExpertData
      const sectorData: SectorExpertData = {
        sectorName: "Creator Economy",
        sectorMaturity: output.sectorFit?.sectorMaturity ?? "growing",
        keyMetrics: output.metricsAnalysis?.map((m: {
          metricName: string;
          percentile?: number;
          assessment?: string;
          sectorContext?: string;
          benchmark?: { p25: number; median: number; p75: number; topDecile: number };
        }) => ({
          metricName: m.metricName,
          value: m.percentile ?? null,
          sectorBenchmark: m.benchmark ?? { p25: 0, median: 0, p75: 0, topDecile: 0 },
          assessment: (m.assessment as SectorExpertData["keyMetrics"][0]["assessment"]) ?? "average",
          sectorContext: m.sectorContext ?? "",
        })) ?? [],
        sectorRedFlags: output.sectorRedFlags?.map((rf: { flag: string; severity: string; sectorThreshold?: string }) => ({
          flag: rf.flag,
          severity: rf.severity as "critical" | "major" | "minor",
          sectorReason: rf.sectorThreshold ?? "",
        })) ?? [],
        sectorOpportunities: output.sectorOpportunities?.map((o: { opportunity: string; potential: string; sectorContext?: string }) => ({
          opportunity: o.opportunity,
          potential: o.potential as "high" | "medium" | "low",
          reasoning: o.sectorContext ?? "",
        })) ?? [],
        regulatoryEnvironment: {
          complexity: output.sectorDynamics?.regulatoryRisk?.level ?? "medium",
          keyRegulations: output.sectorDynamics?.regulatoryRisk?.keyRegulations ?? [],
          complianceRisks: [],
          upcomingChanges: output.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: output.sectorDynamics?.competitionIntensity ?? "high",
          consolidationTrend: output.sectorDynamics?.consolidationTrend ?? "stable",
          barrierToEntry: output.sectorDynamics?.barrierToEntry ?? "low",
          typicalExitMultiple: output.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 3,
          recentExits: output.sectorDynamics?.exitLandscape?.recentExits ?? [],
        },
        sectorQuestions: output.sectorQuestions?.map((q: { question: string; priority: string; expectedGoodAnswer?: string; redFlagAnswer?: string }) => ({
          question: q.question,
          category: "business" as const,
          priority: q.priority as "must_ask" | "should_ask" | "nice_to_have",
          expectedAnswer: q.expectedGoodAnswer ?? "",
          redFlagAnswer: q.redFlagAnswer ?? "",
        })) ?? [],
        sectorFit: {
          score: cappedScore,
          strengths: [],
          weaknesses: [],
          sectorTiming: output.sectorFit?.timingAssessment === "early_mover" ? "early" :
            output.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: cappedScore,
        executiveSummary: output.executiveSummary ?? "",
      };

      // Build extended data with creator-specific fields
      const extendedData: ExtendedSectorData = {
        subSector: output.subSector,
        verdict: {
          recommendation: sectorData.sectorScore >= 70 ? "GOOD_FIT" :
            sectorData.sectorScore >= 50 ? "MODERATE_FIT" : "POOR_FIT",
          confidence: "medium",
          keyInsight: output.executiveSummary ?? "",
          topConcern: output.sectorRedFlags?.[0]?.flag ?? "Platform dependency risk",
          topStrength: output.sectorOpportunities?.[0]?.opportunity ?? "",
        },
      };

      // Add creator-specific extended data
      if (output.platformDependencyAnalysis) {
        (extendedData as ExtendedSectorData & { platformDependencyAnalysis: typeof output.platformDependencyAnalysis }).platformDependencyAnalysis = output.platformDependencyAnalysis;
      }
      if (output.creatorEconomicsAnalysis) {
        (extendedData as ExtendedSectorData & { creatorEconomicsAnalysis: typeof output.creatorEconomicsAnalysis }).creatorEconomicsAnalysis = output.creatorEconomicsAnalysis;
      }

      return {
        agentName: "creator-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        _extended: extendedData,
      };

    } catch (error) {
      console.error("[creator-expert] Execution error:", error);
      return {
        agentName: "creator-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultSectorData("creator-expert") as unknown as SectorExpertData,
      };
    }
  },
};
