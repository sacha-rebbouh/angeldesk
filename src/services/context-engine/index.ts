/**
 * Context Engine
 *
 * Enriches deal analysis with external data from multiple sources.
 * Aggregates data from various connectors and provides a unified context.
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
} from "./types";
import { newsApiConnector } from "./connectors/news-api";
import { webSearchConnector } from "./connectors/web-search";
import { mockConnector } from "./connectors/mock";

// Registry of all available connectors
const connectors: Connector[] = [
  newsApiConnector,
  webSearchConnector,
  mockConnector,
];

/**
 * Get all configured connectors
 */
export function getConfiguredConnectors(): Connector[] {
  return connectors.filter((c) => c.isConfigured());
}

/**
 * Enrich a deal with external context
 */
export async function enrichDeal(query: ConnectorQuery): Promise<DealContext> {
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
 */
export async function getFounderContext(
  founderName: string
): Promise<FounderBackground | null> {
  const configuredConnectors = getConfiguredConnectors();

  for (const connector of configuredConnectors) {
    if (connector.getFounderBackground) {
      const result = await connector.getFounderBackground(founderName);
      if (result) return result;
    }
  }

  return null;
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
