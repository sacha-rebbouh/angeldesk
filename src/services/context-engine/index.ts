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
  WebsiteContent,
} from "./types";
import { crawlWebsite, type CrawlOptions } from "./connectors/website-crawler";
import { resolveWebsiteUrl, type WebsiteResolutionInput } from "./website-resolver";
import { newsApiConnector } from "./connectors/news-api";
import { webSearchConnector } from "./connectors/web-search";
import { rssFundingConnector } from "./connectors/rss-funding";
import { ycCompaniesConnector } from "./connectors/yc-companies";
import { companiesHouseConnector } from "./connectors/companies-house";
import { pappersConnector } from "./connectors/pappers";
import { productHuntConnector } from "./connectors/product-hunt";
// LinkedIn data - Coresignal (694M+ profiles, refreshed every 6h)
import {
  coresignalLinkedInConnector,
  analyzeFounderLinkedIn,
  analyzeFounderByName,
  analyzeTeamLinkedIn,
  isCoresignalLinkedInConfigured,
} from "./connectors/coresignal-linkedin";
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
// Robust parallel fetching with circuit breaker and retry
import {
  fetchSimilarDealsParallel,
  fetchMarketDataParallel,
  fetchCompetitorsParallel,
  fetchNewsParallel,
  aggregateMetrics,
  type FetchMetrics,
  type ConnectorResult,
} from "./parallel-fetcher";
import { getCircuitStates } from "./circuit-breaker";
// Persistent storage for Context Engine snapshots
import {
  saveContextSnapshot,
  loadContextSnapshot,
  getSnapshotStats,
} from "./persistence";

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
  coresignalLinkedInConnector,   // LinkedIn data via Coresignal (2 credits/profile)

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
  // Include extracted data fields so different extractions get fresh context
  const normalized = {
    sector: (query.sector || "").toLowerCase().trim(),
    stage: (query.stage || "").toLowerCase().trim(),
    companyName: (query.companyName || "").toLowerCase().trim(),
    geography: (query.geography || "").toLowerCase().trim(),
    // Include extracted data in cache key
    tagline: (query.tagline || "").toLowerCase().trim().slice(0, 50),
    competitors: (query.mentionedCompetitors || []).sort().join(",").toLowerCase(),
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

  // ============================================================================
  // EXTRACTED DATA (from document-extractor)
  // Pass these after running document extraction for richer context
  // ============================================================================
  /** Tagline extracted from deck - helps find similar competitors */
  extractedTagline?: string;
  /** Competitors mentioned in the deck - will be enriched */
  extractedCompetitors?: string[];
  /** Product description from deck */
  extractedProductDescription?: string;
  /** Business model from deck */
  extractedBusinessModel?: string;

  // ============================================================================
  // USE CASE DATA (CRITICAL for competitor search)
  // Competitors are found by WHAT the product does, not its tech stack
  // ============================================================================
  /** Product name (e.g., "Axiom") */
  extractedProductName?: string;
  /** Core value proposition - THE central concept */
  extractedCoreValueProposition?: string;
  /** Use cases addressed by the product - MOST IMPORTANT for finding real competitors */
  extractedUseCases?: string[];
  /** Key differentiators - unique competitive advantages */
  extractedKeyDifferentiators?: string[];

  // ============================================================================
  // WEBSITE CRAWLING
  // Crawl the startup's website for comprehensive context
  // ============================================================================
  /** Enable website crawling */
  includeWebsite?: boolean;
  /** Website URL from form (will be validated, fallback to other sources if invalid) */
  formWebsiteUrl?: string;
  /** Website URL extracted from deck/documents (direct, no validation) */
  extractedWebsiteUrl?: string;
  /** Max pages to crawl (default: 100) */
  websiteMaxPages?: number;
  /** Document texts for URL extraction fallback (deck first, then others) */
  documentTexts?: {
    type: "pitch_deck" | "financials" | "other";
    text: string;
  }[];
}

/**
 * Enrich a deal with external context
 *
 * Results are cached for 10 minutes to avoid redundant API calls
 * when the same deal is analyzed multiple times or by multiple agents.
 *
 * IMPORTANT: For best results, run AFTER document-extractor and pass
 * extracted data (tagline, competitors, etc.) via options.
 *
 * @param query - Search criteria (company, sector, geography, etc.)
 * @param options.forceRefresh - Skip cache
 * @param options.dealId - Deal ID for cache tagging
 * @param options.includeFounders - Whether to fetch LinkedIn data for founders
 * @param options.founders - List of founders with LinkedIn URLs
 * @param options.startupSector - Sector for founder fit analysis
 * @param options.extractedTagline - Tagline from document extraction
 * @param options.extractedCompetitors - Competitors mentioned in deck
 */
export async function enrichDeal(
  query: ConnectorQuery,
  options: EnrichDealOptions = {}
): Promise<DealContext> {
  const cache = getCacheManager();

  // Merge extracted data into query for better search results
  // PRIORITY: Use cases > product description > tagline (for competitor search)
  const enrichedQuery: ConnectorQuery = {
    ...query,
    tagline: options.extractedTagline || query.tagline,
    mentionedCompetitors: options.extractedCompetitors || query.mentionedCompetitors,
    productDescription: options.extractedProductDescription || query.productDescription,
    businessModel: options.extractedBusinessModel || query.businessModel,
    // USE CASE DATA (CRITICAL for finding real competitors)
    productName: options.extractedProductName || query.productName,
    coreValueProposition: options.extractedCoreValueProposition || query.coreValueProposition,
    useCases: options.extractedUseCases || query.useCases,
    keyDifferentiators: options.extractedKeyDifferentiators || query.keyDifferentiators,
  };

  const cacheKey = getQueryCacheKey(enrichedQuery);
  const tags = options.dealId ? [`deal:${options.dealId}`] : [];

  // Input data for snapshot comparison
  const inputData = {
    companyName: enrichedQuery.companyName,
    sector: enrichedQuery.sector,
    stage: enrichedQuery.stage,
    tagline: enrichedQuery.tagline,
    competitors: enrichedQuery.mentionedCompetitors,
  };

  // =========================================================================
  // LEVEL 1: Check persistent DB snapshot (survives server restarts)
  // =========================================================================
  if (options.dealId && !options.forceRefresh) {
    const dbSnapshot = await loadContextSnapshot(options.dealId, inputData);
    if (dbSnapshot) {
      console.log(`[ContextEngine] DB SNAPSHOT HIT for deal ${options.dealId}`);
      // Still need to handle website and founders below, but base context is from DB
      let result = { ...dbSnapshot };

      // Handle website crawling (separate from main context)
      result = await maybeAddWebsiteContent(result, enrichedQuery, options, tags);

      // Handle founder LinkedIn data
      if (options.includeFounders) {
        result = await maybeAddPeopleGraph(result, enrichedQuery, options);
      }

      return result;
    }
  }

  // =========================================================================
  // LEVEL 2: Check in-memory cache (fast, short-lived)
  // =========================================================================
  const { data, fromCache } = await cache.getOrCompute<DealContext>(
    "context-engine",
    cacheKey,
    async () => {
      // This only runs on cache miss
      return computeDealContext(enrichedQuery);
    },
    {
      ttlMs: CONTEXT_CACHE_TTL_MS,
      tags,
      forceRefresh: options.forceRefresh,
    }
  );

  if (fromCache) {
    console.log(`[ContextEngine] Memory cache HIT for query: ${enrichedQuery.companyName || enrichedQuery.sector}`);
  } else {
    console.log(`[ContextEngine] Cache MISS - computed fresh context for: ${enrichedQuery.companyName || enrichedQuery.sector}${options.extractedTagline ? " (with extracted data)" : ""}`);

    // =========================================================================
    // PERSIST TO DB for cross-session reuse
    // =========================================================================
    if (options.dealId) {
      // Fire and forget - don't block the response
      saveContextSnapshot(options.dealId, data, inputData).catch((err) => {
        console.error("[ContextEngine] Failed to save snapshot:", err);
      });
    }
  }

  // Build enriched result with optional additional data
  let result = { ...data };

  // Optionally crawl website (separate cache, can be expensive)
  result = await maybeAddWebsiteContent(result, enrichedQuery, options, tags);

  // Optionally fetch founder LinkedIn data (separate from main context cache)
  if (options.includeFounders) {
    result = await maybeAddPeopleGraph(result, enrichedQuery, options);
  }

  return result;
}

/**
 * Helper: Add website content to context if requested
 */
async function maybeAddWebsiteContent(
  result: DealContext,
  query: ConnectorQuery,
  options: EnrichDealOptions,
  tags: string[]
): Promise<DealContext> {
  if (!options.includeWebsite) {
    return result;
  }

  const cache = getCacheManager();

  // Résoudre l'URL avec fallbacks: form → deck → docs → web search
  let websiteUrl = options.extractedWebsiteUrl || query.websiteUrl;
  let urlSource: "form" | "deck" | "document" | "web_search" | "direct" = "direct";

  // Si pas d'URL directe, utiliser le resolver
  if (!websiteUrl && query.companyName) {
    const resolution = await resolveWebsiteUrl({
      formUrl: options.formWebsiteUrl,
      companyName: query.companyName,
      sector: query.sector,
      documentTexts: options.documentTexts,
    });

    if (resolution.url) {
      websiteUrl = resolution.url;
      urlSource = resolution.source || "direct";
      console.log(`[ContextEngine] Website URL resolved via ${urlSource}: ${websiteUrl}`);
    } else {
      console.log(`[ContextEngine] No website URL found for ${query.companyName}`);
    }
  }

  if (!websiteUrl) {
    return result;
  }

  const websiteCacheKey = `website:${websiteUrl.toLowerCase().replace(/https?:\/\//, "")}`;

  const { data: websiteContent, fromCache: websiteFromCache } = await cache.getOrCompute<WebsiteContent | null>(
    "context-engine",
    websiteCacheKey,
    async () => {
      try {
        console.log(`[ContextEngine] Crawling website: ${websiteUrl}`);
        return await crawlWebsite(websiteUrl!, {
          maxPages: options.websiteMaxPages || 100,
        });
      } catch (error) {
        console.error(`[ContextEngine] Website crawl failed: ${error}`);
        return null;
      }
    },
    {
      ttlMs: CONTEXT_CACHE_TTL_MS * 6, // 1 hour cache for website (doesn't change often)
      tags,
      forceRefresh: options.forceRefresh,
    }
  );

  if (websiteFromCache) {
    console.log(`[ContextEngine] Website cache HIT: ${websiteUrl}`);
  }

  if (websiteContent) {
    return {
      ...result,
      websiteContent,
      // Add website source
      sources: [
        ...result.sources,
        {
          type: "web_search" as const,
          name: `Website Crawler (via ${urlSource})`,
          url: websiteUrl,
          retrievedAt: new Date().toISOString(),
          confidence: urlSource === "form" || urlSource === "direct" ? 0.95 : 0.85,
        },
      ],
    };
  }

  return result;
}

/**
 * Helper: Add people graph to context if requested
 */
async function maybeAddPeopleGraph(
  result: DealContext,
  query: ConnectorQuery,
  options: EnrichDealOptions
): Promise<DealContext> {
  const founderList = options.founders || (query.founderNames?.map(name => ({ name })) ?? []);

  if (founderList.length === 0) {
    return result;
  }

  const peopleGraph = await buildPeopleGraph(founderList, {
    startupSector: options.startupSector || query.sector,
    dealCompanyName: query.companyName,
    forceRefresh: options.forceRefresh,
  });

  return {
    ...result,
    peopleGraph,
  };
}

/**
 * Internal: Actually compute the deal context (called on cache miss)
 *
 * ROBUST IMPLEMENTATION:
 * - Parallel fetching with individual timeouts per connector
 * - Circuit breaker prevents cascading failures
 * - Retry with exponential backoff for transient errors
 * - Detailed tracking of which sources succeeded/failed
 */
async function computeDealContext(query: ConnectorQuery): Promise<DealContext> {
  const configuredConnectors = getConfiguredConnectors();
  const startTime = Date.now();

  console.log(`[ContextEngine] Computing context for: ${query.companyName || query.sector} (${configuredConnectors.length} connectors)`);

  // =========================================================================
  // PARALLEL FETCH WITH CIRCUIT BREAKER + RETRY + TIMEOUT
  // =========================================================================
  const [
    { deals: similarDeals, results: dealsResults },
    { marketData, results: marketResults },
    { competitors, results: competitorResults },
    { news, results: newsResults },
  ] = await Promise.all([
    fetchSimilarDealsParallel(query, configuredConnectors),
    fetchMarketDataParallel(query, configuredConnectors),
    fetchCompetitorsParallel(query, configuredConnectors),
    fetchNewsParallel(query, configuredConnectors),
  ]);

  // =========================================================================
  // AGGREGATE METRICS
  // =========================================================================
  const allResults = [...dealsResults, ...marketResults, ...competitorResults, ...newsResults];
  const metrics = aggregateMetrics(allResults);

  // Build detailed sources tracking
  const sources: DataSource[] = [];
  const sourceResults: Record<string, { success: boolean; latencyMs: number; error?: string }> = {};

  for (const result of allResults) {
    sourceResults[result.connectorName] = {
      success: result.success,
      latencyMs: result.latencyMs,
      error: result.error,
    };

    if (result.success) {
      const connector = configuredConnectors.find((c) => c.name === result.connectorName);
      if (connector) {
        sources.push({
          type: connector.type,
          name: connector.name,
          retrievedAt: new Date().toISOString(),
          confidence: 0.85,
        });
      }
    }
  }

  // =========================================================================
  // CALCULATE COMPLETENESS (weighted by importance)
  // =========================================================================
  const completeness = calculateCompleteness({
    similarDeals,
    marketData,
    competitors,
    news,
  });

  // Calculate reliability (% of connectors that responded)
  const reliability = metrics.totalConnectors > 0
    ? metrics.successfulConnectors / metrics.totalConnectors
    : 0;

  // =========================================================================
  // BUILD ENRICHED CONTEXT
  // =========================================================================
  const dealIntelligence = similarDeals.length > 0
    ? buildDealIntelligence(similarDeals, query)
    : undefined;

  const newsSentiment = news.length > 0
    ? buildNewsSentiment(news)
    : undefined;

  const totalLatency = Date.now() - startTime;

  // Log summary
  console.log(
    `[ContextEngine] DONE in ${totalLatency}ms | ` +
    `Deals: ${similarDeals.length} | Competitors: ${competitors.length} | News: ${news.length} | ` +
    `Connectors: ${metrics.successfulConnectors}/${metrics.totalConnectors} OK | ` +
    `Completeness: ${(completeness * 100).toFixed(0)}% | Reliability: ${(reliability * 100).toFixed(0)}%`
  );

  // Log failed connectors for debugging
  const failed = allResults.filter((r) => !r.success && !r.skipped);
  if (failed.length > 0) {
    console.log(
      `[ContextEngine] Failed connectors: ${failed.map((r) => `${r.connectorName} (${r.error})`).join(", ")}`
    );
  }

  // Log circuit breaker states
  const circuits = getCircuitStates();
  const openCircuits = Object.entries(circuits).filter(([, s]) => s.state === "open");
  if (openCircuits.length > 0) {
    console.log(
      `[ContextEngine] Open circuits: ${openCircuits.map(([name]) => name).join(", ")}`
    );
  }

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
  companyName?: string; // Current company name (used to disambiguate when no LinkedIn URL)
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
    dealCompanyName?: string;
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
        return fetchAndAnalyzeFounder(founder, options.startupSector, options.dealCompanyName);
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
 * Uses Coresignal LinkedIn connector
 *
 * Strategy:
 * 1. If LinkedIn URL available → search by shorthand (from URL)
 * 2. If no URL → search by name + company name (disambiguation)
 * 3. If not found → return null (will be flagged as "unverified" in results)
 */
async function fetchAndAnalyzeFounder(
  founder: FounderInput,
  startupSector?: string,
  dealCompanyName?: string
): Promise<EnrichedFounderData | null> {
  const linkedinUrl = founder.linkedinUrl;

  let result: Awaited<ReturnType<typeof analyzeFounderLinkedIn>>;

  if (linkedinUrl) {
    // Case 1: LinkedIn URL available → direct lookup
    result = await analyzeFounderLinkedIn(
      linkedinUrl,
      founder.role || "Founder",
      startupSector
    );
  } else {
    // Case 2: No URL → search by name + company
    const companyName = founder.companyName || dealCompanyName;
    if (!companyName) {
      console.log(`[ContextEngine] No LinkedIn URL and no company name for founder: ${founder.name}`);
      return null;
    }

    console.log(`[ContextEngine] Searching LinkedIn by name for ${founder.name} @ ${companyName}`);
    const nameResult = await analyzeFounderByName(
      founder.name,
      companyName,
      founder.role || "Founder",
      startupSector
    );

    // If found, log the discovered LinkedIn URL
    if (nameResult.success && nameResult.linkedinUrl) {
      console.log(`[ContextEngine] Found LinkedIn for ${founder.name}: ${nameResult.linkedinUrl}`);
    }

    result = nameResult;
  }

  if (!result.success || !result.profile || !result.rawProfile) {
    console.log(`[ContextEngine] Failed to fetch LinkedIn for ${founder.name}: ${result.error}`);
    return null;
  }

  const { profile, analysis, rawProfile } = result;

  // Use discovered LinkedIn URL if original was not provided
  const resolvedLinkedinUrl = linkedinUrl
    || ("linkedinUrl" in result ? (result as { linkedinUrl?: string }).linkedinUrl : undefined);

  // Build enriched founder data
  const enrichedFounder: EnrichedFounderData = {
    name: profile.name,
    role: founder.role || profile.role,
    linkedinUrl: resolvedLinkedinUrl,
    previousCompanies: profile.previousCompanies,
    previousVentures: profile.previousVentures,
    education: profile.education,
    redFlags: profile.redFlags,
    investorConnections: profile.investorConnections,
    verificationStatus: profile.verificationStatus,
    // Extended data from analysis
    expertiseProfile: analysis?.expertise ? {
      rawExperiences: analysis.expertise.rawExperiences.map((exp: any) => ({
        company: exp.company,
        title: exp.title,
        description: null,
        durationMonths: exp.months,
        startYear: exp.startYear ?? null,
        endYear: exp.endYear ?? null,
        isCurrent: exp.endYear === undefined,
        detectedIndustries: exp.matchedIndustries,
        detectedRoles: exp.matchedRoles,
        detectedEcosystems: exp.matchedEcosystems,
      })),
      totalCareerMonths: analysis.expertise.totalCareerMonths,
      industries: analysis.expertise.industries.map((i) => ({
        name: i.name,
        totalMonths: i.months,
        percentage: i.percentage,
      })),
      roles: analysis.expertise.roles.map((r) => ({
        name: r.name,
        totalMonths: r.months,
        percentage: r.percentage,
      })),
      ecosystems: analysis.expertise.ecosystems.map((e) => ({
        name: e.name,
        totalMonths: e.months,
        percentage: e.percentage,
      })),
      unclassifiedPercentage: analysis.expertise.unclassifiedPercentage,
      primaryIndustry: analysis.expertise.primaryIndustry,
      primaryRole: analysis.expertise.primaryRole,
      primaryEcosystem: analysis.expertise.primaryEcosystem,
      isDiversified: analysis.expertise.isDiversified,
      hasDeepExpertise: analysis.expertise.hasDeepExpertise,
      expertiseDescription: analysis.expertise.expertiseDescription,
    } : undefined,
    sectorFit: analysis?.sectorFit,
    questionsToAsk: analysis?.questionsToAsk,
    insights: {
      totalExperienceYears: Math.round((analysis?.expertise?.totalCareerMonths ?? 0) / 12),
      hasNotableCompanyExperience: profile.previousCompanies.some(
        (c) => isNotableCompany(c.company)
      ),
      notableCompanies: profile.previousCompanies
        .filter((c) => isNotableCompany(c.company))
        .map((c) => c.company),
      hasPreviousFounderExperience: profile.previousVentures.length > 0,
      previousVenturesCount: profile.previousVentures.length,
      educationLevel: profile.education.length > 0 ? "good" : "unknown",
      networkStrength: rawProfile.connections
        ? rawProfile.connections > 500
          ? "strong"
          : rawProfile.connections > 200
            ? "moderate"
            : "weak"
        : "weak",  // Default to weak if unknown
    },
  };

  return enrichedFounder;
}

// Helper function to check notable companies
function isNotableCompany(companyName: string): boolean {
  const notableCompanies = new Set([
    "google", "meta", "facebook", "apple", "amazon", "microsoft", "netflix",
    "stripe", "airbnb", "uber", "lyft", "spotify", "slack", "salesforce",
    "twitter", "linkedin", "palantir", "snowflake", "datadog", "mongodb",
    "notion", "figma", "canva", "airtable", "asana", "monday", "miro",
    "revolut", "wise", "n26", "klarna", "adyen", "checkout", "plaid",
    "mckinsey", "bcg", "bain", "goldman sachs", "morgan stanley", "jp morgan",
    "sequoia", "a16z", "benchmark", "accel", "index ventures", "balderton",
  ]);
  const normalized = companyName.toLowerCase().trim();
  return notableCompanies.has(normalized) ||
    Array.from(notableCompanies).some(notable => normalized.includes(notable));
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

/**
 * Get circuit breaker status for all connectors
 * Useful for monitoring which connectors are healthy/failing
 */
export function getConnectorHealthStatus() {
  return getCircuitStates();
}

/**
 * Export circuit breaker controls for manual intervention
 */
export { resetCircuit, resetAllCircuits } from "./circuit-breaker";

/**
 * Export LinkedIn analysis functions (Coresignal)
 * Use these for founder/team due diligence
 */
export {
  analyzeFounderLinkedIn,
  analyzeFounderByName,
  analyzeTeamLinkedIn,
  isCoresignalLinkedInConfigured,
} from "./connectors/coresignal-linkedin";

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

// NOTE: Old sequential gather functions removed in favor of parallel-fetcher.ts
// which provides: circuit breaker, retry with backoff, individual timeouts

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
  const total = 4;

  if (data.similarDeals.length > 0) score += 1;
  if (data.marketData) score += 1;
  if (data.competitors.length > 0) score += 1;
  if (data.news.length > 0) score += 1;

  return score / total;
}

// Re-export types
export * from "./types";

// Export website crawler for direct usage
export { crawlWebsite, type CrawlOptions } from "./connectors/website-crawler";

// Export website URL resolver
export { resolveWebsiteUrl, type WebsiteResolutionInput, type WebsiteResolutionResult } from "./website-resolver";
