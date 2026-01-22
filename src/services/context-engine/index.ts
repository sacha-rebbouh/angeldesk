/**
 * Context Engine
 *
 * Enriches deal analysis with external data from multiple sources.
 * Aggregates data from various connectors and provides a unified context.
 *
 * CACHING: Uses centralized CacheManager to avoid redundant API calls.
 * - enrichDeal() results cached for 10 minutes per query
 * - Founder backgrounds cached for 30 minutes
 * - Cache invalidated when deal is updated
 */

import type {
  DealContext,
  ConnectorQuery,
  Connector,
  SimilarDeal,
  MarketData,
  FounderBackground,
  Competitor,
  NewsArticle,
  DataSource,
  PeopleGraph,
} from "./types";
import { newsApiConnector } from "./connectors/news-api";
import { webSearchConnector } from "./connectors/web-search";
import { rssFundingConnector } from "./connectors/rss-funding";
import { ycCompaniesConnector } from "./connectors/yc-companies";
import { companiesHouseConnector } from "./connectors/companies-house";
import { pappersConnector } from "./connectors/pappers";
import { productHuntConnector } from "./connectors/product-hunt";
import { proxycurlConnector, analyzeFounderLinkedIn, findLinkedInProfile } from "./connectors/proxycurl";
// French ecosystem connectors
import { societeComConnector } from "./connectors/societe-com";
import { bpiFranceConnector } from "./connectors/bpi-france";
import { frenchTechConnector } from "./connectors/french-tech";
import { incubatorsConnector } from "./connectors/incubators";
import { eldoradoConnector } from "./connectors/eldorado";
import { frenchWebRssConnector } from "./connectors/frenchweb-rss";
// Real-time funding APIs (REAL DATA)
import { frenchWebApiConnector } from "./connectors/frenchweb-api";
import { maddynessApiConnector } from "./connectors/maddyness-api";
// European funding sources (REAL DATA)
import { euStartupsApiConnector } from "./connectors/eu-startups-api";
import { techEuConnector } from "./connectors/tech-eu-api";
import { seedtableConnector } from "./connectors/seedtable";
// US funding sources (REAL DATA)
import { usFundingConnector } from "./connectors/us-funding";
// Traction & hiring connectors
import { appStoresConnector } from "./connectors/app-stores";
import { githubConnector } from "./connectors/github";
import { wttjConnector } from "./connectors/welcome-to-the-jungle";
import { indeedConnector } from "./connectors/indeed";
// Internal funding database (1,500+ deals)
import { fundingDbConnector } from "./connectors/funding-db";
import { getCacheManager } from "../cache";

// Cache TTLs
const CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for deal context
const FOUNDER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for founder data

// Registry of all available connectors
// Priority order: REAL DATA sources first, then validation, then fallback
const connectors: Connector[] = [
  // === INTERNAL FUNDING DATABASE (1,500+ deals) ===
  fundingDbConnector,       // Internal DB - 1,500+ funding rounds (FR, EU, US)

  // === REAL-TIME FUNDING DATA (APIs - REAL DATA) ===
  frenchWebApiConnector,    // FrenchWeb API - REAL French funding rounds
  maddynessApiConnector,    // Maddyness API - REAL French funding rounds
  euStartupsApiConnector,   // EU-Startups API - REAL European funding rounds
  techEuConnector,          // Tech.eu RSS - REAL European funding rounds
  usFundingConnector,       // US funding (TechCrunch, Crunchbase News, VentureBeat)
  seedtableConnector,       // Seedtable - curated European startup database (40+ deals)

  // === FOUNDER DATA ===
  proxycurlConnector,       // LinkedIn data - KEY for founder DD (~$0.01/profile)

  // === COMPANY DATA (REAL - scraping/APIs) ===
  societeComConnector,      // French company data (scraping)
  pappersConnector,         // French company data (API, 100 req/month free)

  // === TRACTION SIGNALS (REAL - APIs/scraping) ===
  productHuntConnector,     // Product Hunt traction signals (450 req/day free)
  appStoresConnector,       // App Store + Google Play (ratings, downloads)
  githubConnector,          // GitHub presence (stars, activity, contributors)

  // === HIRING SIGNALS (REAL - scraping) ===
  wttjConnector,            // Welcome to the Jungle (FR job platform)
  indeedConnector,          // Indeed (disabled - needs proxy)

  // === NEWS (REAL - RSS feeds) ===
  rssFundingConnector,      // TechCrunch, Maddyness, Sifted RSS
  frenchWebRssConnector,    // FrenchWeb, JDN, L'Usine Digitale RSS

  // === VALIDATION DATA (semi-static - lists updated yearly) ===
  frenchTechConnector,      // Next40, FT120 validation
  bpiFranceConnector,       // BPI grants, JEI validation
  incubatorsConnector,      // Station F, eFounders alumni validation
  eldoradoConnector,        // French investors database (for matching)
  ycCompaniesConnector,     // YC batch validation

  // === INTERNATIONAL ===
  companiesHouseConnector,  // UK company data (free API key)

  // === PAID/LIMITED ===
  newsApiConnector,         // NewsAPI (100 req/day free)
  webSearchConnector,       // Perplexity search (requires OpenRouter key)
];

/**
 * Get all configured connectors
 */
export function getConfiguredConnectors(): Connector[] {
  return connectors.filter((c) => c.isConfigured());
}

/**
 * Generate cache key from query
 */
function getQueryCacheKey(query: ConnectorQuery): string {
  // Normalize and create deterministic key
  const normalized = {
    sector: (query.sector || "").toLowerCase().trim(),
    stage: (query.stage || "").toLowerCase().trim(),
    companyName: (query.companyName || "").toLowerCase().trim(),
    geography: (query.geography || "").toLowerCase().trim(),
  };
  return JSON.stringify(normalized);
}

/**
 * Options for enrichDeal
 */
export interface EnrichDealOptions {
  forceRefresh?: boolean;
  dealId?: string;
  /** Include founder LinkedIn analysis (uses Proxycurl, ~$0.01/founder) */
  includeFounders?: boolean;
  /** Founder list for peopleGraph (overrides query.founderNames) */
  founders?: FounderInput[];
  /** Startup sector for founder fit analysis */
  startupSector?: string;
}

/**
 * Enrich a deal with external context
 *
 * Results are cached for 10 minutes to avoid redundant API calls
 * when the same deal is analyzed multiple times or by multiple agents.
 *
 * @param query - Search criteria (company, sector, geography, etc.)
 * @param options.forceRefresh - Skip cache
 * @param options.dealId - Deal ID for cache tagging
 * @param options.includeFounders - Whether to fetch LinkedIn data for founders
 * @param options.founders - List of founders with LinkedIn URLs
 * @param options.startupSector - Sector for founder fit analysis
 */
export async function enrichDeal(
  query: ConnectorQuery,
  options: EnrichDealOptions = {}
): Promise<DealContext> {
  const cache = getCacheManager();
  const cacheKey = getQueryCacheKey(query);
  const tags = options.dealId ? [`deal:${options.dealId}`] : [];

  // Use getOrCompute for atomic cache check + compute
  const { data, fromCache } = await cache.getOrCompute<DealContext>(
    "context-engine",
    cacheKey,
    async () => {
      // This only runs on cache miss
      return computeDealContext(query);
    },
    {
      ttlMs: CONTEXT_CACHE_TTL_MS,
      tags,
      forceRefresh: options.forceRefresh,
    }
  );

  if (fromCache) {
    console.log(`[ContextEngine] Cache HIT for query: ${query.companyName || query.sector}`);
  } else {
    console.log(`[ContextEngine] Cache MISS - computed fresh context for: ${query.companyName || query.sector}`);
  }

  // Optionally fetch founder LinkedIn data (separate from main context cache)
  if (options.includeFounders) {
    const founderList = options.founders || (query.founderNames?.map(name => ({ name })) ?? []);

    if (founderList.length > 0) {
      const peopleGraph = await buildPeopleGraph(founderList, {
        startupSector: options.startupSector || query.sector,
        forceRefresh: options.forceRefresh,
      });

      return {
        ...data,
        peopleGraph,
      };
    }
  }

  return data;
}

/**
 * Internal: Actually compute the deal context (called on cache miss)
 */
async function computeDealContext(query: ConnectorQuery): Promise<DealContext> {
  const configuredConnectors = getConfiguredConnectors();
  const sources: DataSource[] = [];

  // Gather data from all connectors in parallel
  const [similarDeals, marketData, competitors, news] = await Promise.all([
    gatherSimilarDeals(query, configuredConnectors),
    gatherMarketData(query, configuredConnectors),
    gatherCompetitors(query, configuredConnectors),
    gatherNews(query, configuredConnectors),
  ]);

  // Track sources
  for (const connector of configuredConnectors) {
    sources.push({
      type: connector.type,
      name: connector.name,
      retrievedAt: new Date().toISOString(),
      confidence: 0.8,
    });
  }

  // Calculate completeness
  const completeness = calculateCompleteness({
    similarDeals,
    marketData,
    competitors,
    news,
  });

  // Build deal intelligence from similar deals
  const dealIntelligence = similarDeals.length > 0
    ? buildDealIntelligence(similarDeals, query)
    : undefined;

  // Build news sentiment
  const newsSentiment = news.length > 0
    ? buildNewsSentiment(news)
    : undefined;

  return {
    dealIntelligence,
    marketData: marketData || undefined,
    competitiveLandscape: competitors.length > 0
      ? { competitors, marketConcentration: "moderate", competitiveAdvantages: [], competitiveRisks: [] }
      : undefined,
    newsSentiment,
    enrichedAt: new Date().toISOString(),
    sources,
    completeness,
  };
}

/**
 * Get founder background from all connectors
 *
 * Results are cached for 30 minutes (founder data changes infrequently)
 */
export async function getFounderContext(
  founderName: string,
  options: { forceRefresh?: boolean } = {}
): Promise<FounderBackground | null> {
  const cache = getCacheManager();
  const cacheKey = founderName.toLowerCase().trim();

  const { data, fromCache } = await cache.getOrCompute<FounderBackground | null>(
    "context-engine",
    `founder:${cacheKey}`,
    async () => {
      const configuredConnectors = getConfiguredConnectors();

      for (const connector of configuredConnectors) {
        if (connector.getFounderBackground) {
          const result = await connector.getFounderBackground(founderName);
          if (result) return result;
        }
      }

      return null;
    },
    {
      ttlMs: FOUNDER_CACHE_TTL_MS,
      forceRefresh: options.forceRefresh,
    }
  );

  if (fromCache) {
    console.log(`[ContextEngine] Founder cache HIT: ${founderName}`);
  }

  return data;
}

/**
 * Invalidate all cached context for a specific deal
 */
export function invalidateDealContext(dealId: string): number {
  const cache = getCacheManager();
  return cache.invalidateDeal(dealId);
}

// ============================================================================
// PEOPLE GRAPH - FOUNDER DUE DILIGENCE
// ============================================================================

/**
 * Input format for building a people graph
 */
export interface FounderInput {
  name: string;
  role?: string;
  linkedinUrl?: string;
  background?: string; // Optional text background from pitch deck
}

/**
 * Extended founder data with expertise analysis
 * Used for detailed founder DD - includes raw data for LLM analysis
 */
export interface EnrichedFounderData extends FounderBackground {
  /** Expertise profile with industry/role/ecosystem breakdown */
  expertiseProfile?: {
    rawExperiences: Array<{
      company: string;
      title: string;
      description: string | null;
      durationMonths: number;
      startYear: number | null;
      endYear: number | null;
      isCurrent: boolean;
      detectedIndustries: string[];
      detectedRoles: string[];
      detectedEcosystems: string[];
    }>;
    totalCareerMonths: number;
    industries: Array<{ name: string; totalMonths: number; percentage: number }>;
    roles: Array<{ name: string; totalMonths: number; percentage: number }>;
    ecosystems: Array<{ name: string; totalMonths: number; percentage: number }>;
    unclassifiedPercentage: number;
    primaryIndustry: string | null;
    primaryRole: string | null;
    primaryEcosystem: string | null;
    isDiversified: boolean;
    hasDeepExpertise: boolean;
    expertiseDescription: string;
  };
  /** Sector fit analysis if startup sector was provided */
  sectorFit?: {
    fits: boolean;
    explanation: string;
  };
  /** Questions to ask during reference checks */
  questionsToAsk?: Array<{
    question: string;
    context: string;
    priority: "low" | "medium" | "high";
  }>;
  /** Notable insights summary */
  insights?: {
    totalExperienceYears: number;
    hasNotableCompanyExperience: boolean;
    notableCompanies: string[];
    hasPreviousFounderExperience: boolean;
    previousVenturesCount: number;
    educationLevel: "top_tier" | "good" | "unknown";
    networkStrength: "strong" | "moderate" | "weak";
  };
}

/**
 * Extended PeopleGraph with enriched founder data
 */
export interface EnrichedPeopleGraph extends PeopleGraph {
  founders: EnrichedFounderData[];
  /** Aggregated questions across all founders */
  allQuestionsToAsk: Array<{
    founderName: string;
    question: string;
    context: string;
    priority: "low" | "medium" | "high";
  }>;
  /** Overall team assessment */
  teamAssessment: {
    hasFounderExperience: boolean;
    hasNotableCompanyExperience: boolean;
    hasSectorExpertise: boolean;
    hasComplementarySkills: boolean;
    coverageGaps: string[];
  };
}

/**
 * Build a comprehensive people graph for founders
 *
 * Fetches LinkedIn data via Proxycurl, analyzes expertise,
 * and returns structured data for the Team Investigator agent.
 *
 * Results are cached for 30 minutes per founder.
 *
 * @param founders - List of founders to analyze
 * @param options.startupSector - The startup's sector (e.g., "fintech", "saas")
 * @param options.forceRefresh - Skip cache and fetch fresh data
 */
export async function buildPeopleGraph(
  founders: FounderInput[],
  options: {
    startupSector?: string;
    forceRefresh?: boolean;
  } = {}
): Promise<EnrichedPeopleGraph> {
  const cache = getCacheManager();
  const enrichedFounders: EnrichedFounderData[] = [];
  const allQuestions: EnrichedPeopleGraph["allQuestionsToAsk"] = [];

  console.log(`[ContextEngine] Building people graph for ${founders.length} founders`);

  // Process each founder in parallel
  const founderPromises = founders.map(async (founder) => {
    const cacheKey = `founder-enriched:${(founder.linkedinUrl || founder.name).toLowerCase().trim()}:${options.startupSector || ""}`;

    const { data, fromCache } = await cache.getOrCompute<EnrichedFounderData | null>(
      "context-engine",
      cacheKey,
      async () => {
        return fetchAndAnalyzeFounder(founder, options.startupSector);
      },
      {
        ttlMs: FOUNDER_CACHE_TTL_MS,
        forceRefresh: options.forceRefresh,
      }
    );

    if (fromCache) {
      console.log(`[ContextEngine] Founder cache HIT: ${founder.name}`);
    }

    return data;
  });

  const results = await Promise.all(founderPromises);

  // Aggregate results
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const founder = founders[i];

    if (result) {
      enrichedFounders.push(result);

      // Collect questions
      if (result.questionsToAsk) {
        for (const q of result.questionsToAsk) {
          allQuestions.push({
            founderName: result.name || founder.name,
            ...q,
          });
        }
      }
    } else {
      // Create minimal entry for unfetchable founders
      enrichedFounders.push({
        name: founder.name,
        role: founder.role || "Founder",
        previousCompanies: [],
        previousVentures: [],
        education: [],
        redFlags: [],
        investorConnections: [],
        verificationStatus: "unverified",
      });
    }
  }

  // Build team assessment
  const teamAssessment = buildTeamAssessment(enrichedFounders, options.startupSector);

  // Sort questions by priority
  allQuestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    founders: enrichedFounders,
    teamSize: founders.length,
    allQuestionsToAsk: allQuestions,
    teamAssessment,
  };
}

/**
 * Internal: Fetch and analyze a single founder
 */
async function fetchAndAnalyzeFounder(
  founder: FounderInput,
  startupSector?: string
): Promise<EnrichedFounderData | null> {
  let linkedinUrl = founder.linkedinUrl;

  // Try to find LinkedIn URL if not provided
  if (!linkedinUrl && founder.name) {
    const nameParts = founder.name.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");
      linkedinUrl = await findLinkedInProfile(firstName, lastName) ?? undefined;
    }
  }

  if (!linkedinUrl) {
    console.log(`[ContextEngine] No LinkedIn URL for founder: ${founder.name}`);
    return null;
  }

  // Fetch full analysis via Proxycurl
  const analysis = await analyzeFounderLinkedIn(linkedinUrl, { startupSector });

  if (!analysis || !analysis.profile) {
    return null;
  }

  const { profile, insights } = analysis;

  // Map to FounderBackground + enriched data
  const previousCompanies = (profile.experiences || []).map((exp) => ({
    company: exp.company,
    role: exp.title,
    startYear: exp.starts_at?.year,
    endYear: exp.ends_at?.year ?? undefined,
    verified: true,
  }));

  const founderRoles = ["founder", "co-founder", "cofounder", "ceo"];
  const previousVentures = (profile.experiences || [])
    .filter((exp) => {
      const title = exp.title.toLowerCase();
      return founderRoles.some((role) => title.includes(role));
    })
    .filter((exp) => exp.ends_at !== null)
    .map((exp) => ({
      companyName: exp.company,
      outcome: "unknown" as const,
      exitYear: exp.ends_at?.year,
    }));

  const education = (profile.education || []).map((edu) => ({
    institution: edu.school,
    degree: edu.degree_name,
    year: edu.ends_at?.year,
  }));

  // Build enriched founder data
  const enrichedFounder: EnrichedFounderData = {
    name: profile.full_name,
    role: founder.role || profile.headline || "Founder",
    linkedinUrl,
    previousCompanies,
    previousVentures,
    education,
    redFlags: insights?.redFlags.map((f) => ({
      type: f.type,
      description: f.description,
      severity: f.severity,
      source: {
        type: "linkedin" as const,
        name: "Proxycurl",
        retrievedAt: new Date().toISOString(),
        confidence: 0.9,
      },
    })) || [],
    investorConnections: [],
    verificationStatus: insights?.redFlags.some((f) => f.type === "no_experience")
      ? "unverified"
      : "verified",
    // Extended data
    expertiseProfile: insights?.expertise ? {
      rawExperiences: insights.expertise.rawExperiences,
      totalCareerMonths: insights.expertise.totalCareerMonths,
      industries: insights.expertise.industries.map((i) => ({
        name: i.name,
        totalMonths: i.totalMonths,
        percentage: i.percentage,
      })),
      roles: insights.expertise.roles.map((r) => ({
        name: r.name,
        totalMonths: r.totalMonths,
        percentage: r.percentage,
      })),
      ecosystems: insights.expertise.ecosystems.map((e) => ({
        name: e.name,
        totalMonths: e.totalMonths,
        percentage: e.percentage,
      })),
      unclassifiedPercentage: insights.expertise.unclassifiedPercentage,
      primaryIndustry: insights.expertise.primaryIndustry,
      primaryRole: insights.expertise.primaryRole,
      primaryEcosystem: insights.expertise.primaryEcosystem,
      isDiversified: insights.expertise.isDiversified,
      hasDeepExpertise: insights.expertise.hasDeepExpertise,
      expertiseDescription: insights.expertise.expertiseDescription,
    } : undefined,
    sectorFit: insights?.sectorFit,
    questionsToAsk: insights?.questionsToAsk,
    insights: insights ? {
      totalExperienceYears: insights.totalExperienceYears,
      hasNotableCompanyExperience: insights.hasNotableCompanyExperience,
      notableCompanies: insights.notableCompanies,
      hasPreviousFounderExperience: insights.hasPreviousFounderExperience,
      previousVenturesCount: insights.previousVenturesCount,
      educationLevel: insights.educationLevel,
      networkStrength: insights.networkStrength,
    } : undefined,
  };

  return enrichedFounder;
}

/**
 * Build team assessment from enriched founder data
 */
function buildTeamAssessment(
  founders: EnrichedFounderData[],
  startupSector?: string
): EnrichedPeopleGraph["teamAssessment"] {
  const hasFounderExperience = founders.some(
    (f) => f.insights?.hasPreviousFounderExperience
  );

  const hasNotableCompanyExperience = founders.some(
    (f) => f.insights?.hasNotableCompanyExperience
  );

  const hasSectorExpertise = startupSector
    ? founders.some((f) => f.sectorFit?.fits)
    : true;

  // Check for complementary skills (different primary roles)
  const primaryRoles = new Set(
    founders
      .map((f) => f.expertiseProfile?.primaryRole)
      .filter((r): r is string => r !== null && r !== undefined)
  );
  const hasComplementarySkills = primaryRoles.size >= Math.min(2, founders.length);

  // Identify coverage gaps
  const coverageGaps: string[] = [];
  const allRoles = founders.flatMap((f) =>
    f.expertiseProfile?.roles.map((r) => r.name) || []
  );

  const criticalRoles = ["engineering", "product", "sales", "founder_ceo"];
  for (const role of criticalRoles) {
    if (!allRoles.includes(role)) {
      const roleLabel =
        role === "engineering"
          ? "Tech/Engineering"
          : role === "product"
            ? "Product"
            : role === "sales"
              ? "Sales/Business"
              : null;
      if (roleLabel) {
        coverageGaps.push(roleLabel);
      }
    }
  }

  if (!hasSectorExpertise && startupSector) {
    coverageGaps.push(`${startupSector} expertise`);
  }

  return {
    hasFounderExperience,
    hasNotableCompanyExperience,
    hasSectorExpertise,
    hasComplementarySkills,
    coverageGaps,
  };
}

/**
 * Get cache statistics for monitoring
 */
export function getContextEngineCacheStats() {
  const cache = getCacheManager();
  return cache.getStats();
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function gatherSimilarDeals(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<SimilarDeal[]> {
  const results: SimilarDeal[] = [];

  for (const connector of connectors) {
    if (connector.searchSimilarDeals) {
      try {
        const deals = await connector.searchSimilarDeals(query);
        results.push(...deals);
      } catch (error) {
        console.error(`Error fetching similar deals from ${connector.name}:`, error);
      }
    }
  }

  // Deduplicate by company name
  const seen = new Set<string>();
  return results.filter((deal) => {
    const key = deal.companyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function gatherMarketData(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<MarketData | null> {
  for (const connector of connectors) {
    if (connector.getMarketData) {
      try {
        const data = await connector.getMarketData(query);
        if (data && (data.benchmarks.length > 0 || data.marketSize)) {
          return data;
        }
      } catch (error) {
        console.error(`Error fetching market data from ${connector.name}:`, error);
      }
    }
  }
  return null;
}

async function gatherCompetitors(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<Competitor[]> {
  const results: Competitor[] = [];

  for (const connector of connectors) {
    if (connector.getCompetitors) {
      try {
        const competitors = await connector.getCompetitors(query);
        results.push(...competitors);
      } catch (error) {
        console.error(`Error fetching competitors from ${connector.name}:`, error);
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return results.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function gatherNews(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<NewsArticle[]> {
  const results: NewsArticle[] = [];

  for (const connector of connectors) {
    if (connector.getNews) {
      try {
        const news = await connector.getNews(query);
        results.push(...news);
      } catch (error) {
        console.error(`Error fetching news from ${connector.name}:`, error);
      }
    }
  }

  // Sort by date, most recent first
  return results.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

function buildDealIntelligence(
  deals: SimilarDeal[],
  _query: ConnectorQuery
): import("./types").DealIntelligence {
  // Calculate statistics from similar deals
  const multiples = deals
    .map((d) => d.valuationMultiple)
    .filter((m): m is number => m !== undefined)
    .sort((a, b) => a - b);

  const median = multiples.length > 0
    ? multiples[Math.floor(multiples.length / 2)]
    : 20;

  const p25 = multiples.length > 3
    ? multiples[Math.floor(multiples.length * 0.25)]
    : median * 0.7;

  const p75 = multiples.length > 3
    ? multiples[Math.floor(multiples.length * 0.75)]
    : median * 1.3;

  return {
    similarDeals: deals.slice(0, 10), // Top 10
    fundingContext: {
      totalDealsInPeriod: deals.length,
      medianValuationMultiple: median,
      p25ValuationMultiple: p25,
      p75ValuationMultiple: p75,
      trend: "stable",
      trendPercentage: 0,
      downRoundCount: 0,
      period: "Last 12 months",
    },
    percentileRank: 50, // Would need current deal valuation to calculate
    fairValueRange: {
      low: 0,
      high: 0,
      currency: "EUR",
    },
    verdict: "fair",
  };
}

function buildNewsSentiment(news: NewsArticle[]): import("./types").NewsSentiment {
  // Calculate overall sentiment
  const sentimentScores: number[] = news.map((n) => {
    switch (n.sentiment) {
      case "positive": return 1;
      case "negative": return -1;
      default: return 0;
    }
  });

  const avgScore = sentimentScores.length > 0
    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
    : 0;

  const overallSentiment: "positive" | "neutral" | "negative" =
    avgScore > 0.3 ? "positive" : avgScore < -0.3 ? "negative" : "neutral";

  // Extract key topics (simple approach)
  const topics = new Set<string>();
  for (const article of news.slice(0, 5)) {
    const words = article.title.split(" ").filter((w) => w.length > 5);
    words.slice(0, 2).forEach((w) => topics.add(w));
  }

  return {
    articles: news.slice(0, 10),
    overallSentiment,
    sentimentScore: avgScore,
    keyTopics: Array.from(topics).slice(0, 5),
  };
}

function calculateCompleteness(data: {
  similarDeals: SimilarDeal[];
  marketData: MarketData | null;
  competitors: Competitor[];
  news: NewsArticle[];
}): number {
  let score = 0;
  let total = 4;

  if (data.similarDeals.length > 0) score += 1;
  if (data.marketData) score += 1;
  if (data.competitors.length > 0) score += 1;
  if (data.news.length > 0) score += 1;

  return score / total;
}

// Re-export types
export * from "./types";
