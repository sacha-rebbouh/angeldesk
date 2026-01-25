/**
 * Parallel Fetcher for Context Engine
 *
 * Executes connector calls in parallel with:
 * - Individual timeouts per connector
 * - Retry with exponential backoff
 * - Circuit breaker integration
 * - Detailed result tracking
 */

import {
  isCircuitClosed,
  recordSuccess,
  recordFailure,
} from "./circuit-breaker";
import type { Connector, ConnectorQuery, SimilarDeal, MarketData, Competitor, NewsArticle } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface ConnectorResult<T> {
  connectorName: string;
  success: boolean;
  data: T | null;
  latencyMs: number;
  error?: string;
  retries: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface FetchConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  useCircuitBreaker: boolean;
}

// Connector tiers with different configs
export const CONNECTOR_TIERS: Record<string, FetchConfig> = {
  // Tier 1: Internal DB - fast, no retry needed
  internal: {
    timeoutMs: 2000,
    maxRetries: 0,
    retryDelayMs: 0,
    useCircuitBreaker: false,
  },
  // Tier 2: Fast APIs
  fast: {
    timeoutMs: 5000,
    maxRetries: 1,
    retryDelayMs: 500,
    useCircuitBreaker: true,
  },
  // Tier 3: Slow APIs (LinkedIn, web search)
  slow: {
    timeoutMs: 10000,
    maxRetries: 2,
    retryDelayMs: 1000,
    useCircuitBreaker: true,
  },
};

// Map connector names to their tier
const CONNECTOR_TIER_MAP: Record<string, keyof typeof CONNECTOR_TIERS> = {
  // Internal
  funding_db: "internal",

  // Fast
  frenchweb_api: "fast",
  maddyness_api: "fast",
  eu_startups_api: "fast",
  tech_eu: "fast",
  us_funding: "fast",
  seedtable: "fast",
  product_hunt: "fast",
  french_tech: "fast",
  bpi_france: "fast",
  incubators: "fast",
  yc_companies: "fast",
  eldorado: "fast",
  rss_funding: "fast",
  frenchweb_rss: "fast",
  app_stores: "fast",
  github: "fast",
  wttj: "fast",

  // Slow
  apify_linkedin: "slow",  // LinkedIn scraping via Apify (replaces proxycurl)
  web_search: "slow",
  news_api: "slow",
  societe_com: "slow",
  pappers: "slow",
  companies_house: "slow",
  indeed: "slow",
};

function getConnectorConfig(connectorName: string): FetchConfig {
  const tier = CONNECTOR_TIER_MAP[connectorName] || "fast";
  return CONNECTOR_TIERS[tier];
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  connectorName: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${connectorName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

// ============================================================================
// RETRY WRAPPER
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  config: FetchConfig,
  connectorName: string
): Promise<{ data: T; retries: number }> {
  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const data = await withTimeout(fn(), config.timeoutMs, connectorName);
      return { data, retries };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries = attempt;

      if (attempt < config.maxRetries) {
        // Exponential backoff
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// PARALLEL FETCHER
// ============================================================================

/**
 * Fetch similar deals from all connectors in parallel
 */
export async function fetchSimilarDealsParallel(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<{
  deals: SimilarDeal[];
  results: ConnectorResult<SimilarDeal[]>[];
}> {
  const relevantConnectors = connectors.filter((c) => c.searchSimilarDeals);
  const startTime = Date.now();

  const promises = relevantConnectors.map(async (connector): Promise<ConnectorResult<SimilarDeal[]>> => {
    const connectorStart = Date.now();
    const config = getConnectorConfig(connector.name);

    // Check circuit breaker
    if (config.useCircuitBreaker && !isCircuitClosed(connector.name)) {
      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: 0,
        retries: 0,
        skipped: true,
        skipReason: "circuit_open",
      };
    }

    try {
      const { data, retries } = await withRetry(
        () => connector.searchSimilarDeals!(query),
        config,
        connector.name
      );

      if (config.useCircuitBreaker) {
        recordSuccess(connector.name);
      }

      return {
        connectorName: connector.name,
        success: true,
        data,
        latencyMs: Date.now() - connectorStart,
        retries,
      };
    } catch (error) {
      if (config.useCircuitBreaker) {
        recordFailure(connector.name);
      }

      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: Date.now() - connectorStart,
        error: error instanceof Error ? error.message : String(error),
        retries: config.maxRetries,
      };
    }
  });

  const results = await Promise.all(promises);

  // Aggregate all deals
  const allDeals: SimilarDeal[] = [];
  for (const result of results) {
    if (result.success && result.data) {
      allDeals.push(...result.data);
    }
  }

  // Deduplicate by company name (case-insensitive)
  const seen = new Set<string>();
  const deduplicatedDeals = allDeals.filter((deal) => {
    const key = deal.companyName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const totalLatency = Date.now() - startTime;
  console.log(
    `[ParallelFetcher] similarDeals: ${deduplicatedDeals.length} deals from ${
      results.filter((r) => r.success).length
    }/${relevantConnectors.length} connectors in ${totalLatency}ms`
  );

  return { deals: deduplicatedDeals, results };
}

/**
 * Fetch market data from all connectors in parallel and AGGREGATE
 */
export async function fetchMarketDataParallel(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<{
  marketData: MarketData | null;
  results: ConnectorResult<MarketData>[];
}> {
  const relevantConnectors = connectors.filter((c) => c.getMarketData);
  const startTime = Date.now();

  const promises = relevantConnectors.map(async (connector): Promise<ConnectorResult<MarketData>> => {
    const connectorStart = Date.now();
    const config = getConnectorConfig(connector.name);

    if (config.useCircuitBreaker && !isCircuitClosed(connector.name)) {
      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: 0,
        retries: 0,
        skipped: true,
        skipReason: "circuit_open",
      };
    }

    try {
      const { data, retries } = await withRetry(
        () => connector.getMarketData!(query),
        config,
        connector.name
      );

      if (config.useCircuitBreaker) {
        recordSuccess(connector.name);
      }

      // Only count as success if we got meaningful data
      const hasData = !!(data && (data.benchmarks.length > 0 || data.marketSize || data.trends.length > 0));

      return {
        connectorName: connector.name,
        success: hasData,
        data: hasData ? data : null,
        latencyMs: Date.now() - connectorStart,
        retries,
      };
    } catch (error) {
      if (config.useCircuitBreaker) {
        recordFailure(connector.name);
      }

      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: Date.now() - connectorStart,
        error: error instanceof Error ? error.message : String(error),
        retries: config.maxRetries,
      };
    }
  });

  const results = await Promise.all(promises);

  // AGGREGATE market data from all sources (not just first one!)
  const aggregatedData: MarketData = {
    benchmarks: [],
    trends: [],
    marketSize: undefined,
  };

  for (const result of results) {
    if (result.success && result.data) {
      // Merge benchmarks
      if (result.data.benchmarks) {
        aggregatedData.benchmarks.push(...result.data.benchmarks);
      }
      // Merge trends
      if (result.data.trends) {
        aggregatedData.trends.push(...result.data.trends);
      }
      // Take first marketSize (they should be similar)
      if (result.data.marketSize && !aggregatedData.marketSize) {
        aggregatedData.marketSize = result.data.marketSize;
      }
    }
  }

  const hasData = aggregatedData.benchmarks.length > 0 || aggregatedData.marketSize || aggregatedData.trends.length > 0;

  const totalLatency = Date.now() - startTime;
  console.log(
    `[ParallelFetcher] marketData: ${aggregatedData.benchmarks.length} benchmarks, ${aggregatedData.trends.length} trends from ${
      results.filter((r) => r.success).length
    }/${relevantConnectors.length} connectors in ${totalLatency}ms`
  );

  return {
    marketData: hasData ? aggregatedData : null,
    results,
  };
}

/**
 * Fetch competitors from all connectors in parallel
 */
export async function fetchCompetitorsParallel(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<{
  competitors: Competitor[];
  results: ConnectorResult<Competitor[]>[];
}> {
  const relevantConnectors = connectors.filter((c) => c.getCompetitors);
  const startTime = Date.now();

  const promises = relevantConnectors.map(async (connector): Promise<ConnectorResult<Competitor[]>> => {
    const connectorStart = Date.now();
    const config = getConnectorConfig(connector.name);

    if (config.useCircuitBreaker && !isCircuitClosed(connector.name)) {
      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: 0,
        retries: 0,
        skipped: true,
        skipReason: "circuit_open",
      };
    }

    try {
      const { data, retries } = await withRetry(
        () => connector.getCompetitors!(query),
        config,
        connector.name
      );

      if (config.useCircuitBreaker) {
        recordSuccess(connector.name);
      }

      return {
        connectorName: connector.name,
        success: true,
        data,
        latencyMs: Date.now() - connectorStart,
        retries,
      };
    } catch (error) {
      if (config.useCircuitBreaker) {
        recordFailure(connector.name);
      }

      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: Date.now() - connectorStart,
        error: error instanceof Error ? error.message : String(error),
        retries: config.maxRetries,
      };
    }
  });

  const results = await Promise.all(promises);

  // Aggregate and deduplicate
  const allCompetitors: Competitor[] = [];
  for (const result of results) {
    if (result.success && result.data) {
      allCompetitors.push(...result.data);
    }
  }

  const seen = new Set<string>();
  const deduplicatedCompetitors = allCompetitors.filter((c) => {
    const key = c.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const totalLatency = Date.now() - startTime;
  console.log(
    `[ParallelFetcher] competitors: ${deduplicatedCompetitors.length} from ${
      results.filter((r) => r.success).length
    }/${relevantConnectors.length} connectors in ${totalLatency}ms`
  );

  return { competitors: deduplicatedCompetitors, results };
}

/**
 * Fetch news from all connectors in parallel
 */
export async function fetchNewsParallel(
  query: ConnectorQuery,
  connectors: Connector[]
): Promise<{
  news: NewsArticle[];
  results: ConnectorResult<NewsArticle[]>[];
}> {
  const relevantConnectors = connectors.filter((c) => c.getNews);
  const startTime = Date.now();

  const promises = relevantConnectors.map(async (connector): Promise<ConnectorResult<NewsArticle[]>> => {
    const connectorStart = Date.now();
    const config = getConnectorConfig(connector.name);

    if (config.useCircuitBreaker && !isCircuitClosed(connector.name)) {
      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: 0,
        retries: 0,
        skipped: true,
        skipReason: "circuit_open",
      };
    }

    try {
      const { data, retries } = await withRetry(
        () => connector.getNews!(query),
        config,
        connector.name
      );

      if (config.useCircuitBreaker) {
        recordSuccess(connector.name);
      }

      return {
        connectorName: connector.name,
        success: true,
        data,
        latencyMs: Date.now() - connectorStart,
        retries,
      };
    } catch (error) {
      if (config.useCircuitBreaker) {
        recordFailure(connector.name);
      }

      return {
        connectorName: connector.name,
        success: false,
        data: null,
        latencyMs: Date.now() - connectorStart,
        error: error instanceof Error ? error.message : String(error),
        retries: config.maxRetries,
      };
    }
  });

  const results = await Promise.all(promises);

  // Aggregate and sort by date
  const allNews: NewsArticle[] = [];
  for (const result of results) {
    if (result.success && result.data) {
      allNews.push(...result.data);
    }
  }

  // Sort by date descending
  const sortedNews = allNews.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const totalLatency = Date.now() - startTime;
  console.log(
    `[ParallelFetcher] news: ${sortedNews.length} articles from ${
      results.filter((r) => r.success).length
    }/${relevantConnectors.length} connectors in ${totalLatency}ms`
  );

  return { news: sortedNews, results };
}

// ============================================================================
// AGGREGATE METRICS
// ============================================================================

export interface FetchMetrics {
  totalConnectors: number;
  successfulConnectors: number;
  failedConnectors: number;
  skippedConnectors: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  connectorDetails: ConnectorResult<unknown>[];
}

export function aggregateMetrics(
  results: ConnectorResult<unknown>[]
): FetchMetrics {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  const totalLatency = results.reduce((sum, r) => sum + r.latencyMs, 0);

  return {
    totalConnectors: results.length,
    successfulConnectors: successful.length,
    failedConnectors: failed.length,
    skippedConnectors: skipped.length,
    totalLatencyMs: totalLatency,
    avgLatencyMs: results.length > 0 ? Math.round(totalLatency / results.length) : 0,
    connectorDetails: results,
  };
}
