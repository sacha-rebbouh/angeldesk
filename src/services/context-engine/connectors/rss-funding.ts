/**
 * RSS Funding Connector
 *
 * Fetches funding news from free RSS feeds:
 * - TechCrunch Funding
 * - Maddyness (France)
 * - Sifted (Europe)
 * - EU-Startups
 *
 * Extracts funding amounts, company names, and sentiment from articles.
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  SimilarDeal,
  DataSource,
} from "../types";

// RSS Feed URLs (all free and public)
const RSS_FEEDS = [
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/category/startups/feed/",
    region: "global",
    language: "en",
  },
  {
    name: "Maddyness",
    url: "https://www.maddyness.com/feed/",
    region: "france",
    language: "fr",
  },
  {
    name: "Sifted",
    url: "https://sifted.eu/feed/",
    region: "europe",
    language: "en",
  },
  {
    name: "EU-Startups",
    url: "https://www.eu-startups.com/feed/",
    region: "europe",
    language: "en",
  },
];

// Funding keywords to identify relevant articles
const FUNDING_KEYWORDS = [
  "raises", "raised", "funding", "investment", "series a", "series b", "series c",
  "seed round", "pre-seed", "million", "lève", "levée", "financement",
  "million d'euros", "millions d'euros", "closes", "secures", "announces",
];

// Positive/negative keywords for sentiment
const POSITIVE_KEYWORDS = [
  "raises", "secures", "growth", "expansion", "success", "record",
  "milestone", "breakthrough", "unicorn", "profitable", "growing",
];

const NEGATIVE_KEYWORDS = [
  "layoff", "layoffs", "cuts", "shutdown", "pivot", "struggle",
  "decline", "loss", "fails", "bankruptcy", "down round",
];

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

/**
 * Parse RSS XML to extract items
 */
function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Simple regex-based parsing (no external dependencies)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    const titleMatch = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/i.exec(itemContent);
    const linkMatch = /<link>(.*?)<\/link>/i.exec(itemContent);
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]>|<description>([\s\S]*?)<\/description>/i.exec(itemContent);
    const dateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemContent);

    const title = titleMatch?.[1] || titleMatch?.[2] || "";
    const link = linkMatch?.[1] || "";
    const description = descMatch?.[1] || descMatch?.[2] || "";
    const pubDate = dateMatch?.[1] || new Date().toISOString();

    if (title && link) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        description: stripHtml(description).trim(),
        pubDate,
        source: sourceName,
      });
    }
  }

  return items;
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if article is funding-related
 */
function isFundingRelated(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return FUNDING_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Extract funding amount from text
 */
function extractFundingAmount(text: string): number | null {
  // Match patterns like "$5M", "€10 million", "5 million dollars", etc.
  const patterns = [
    /\$(\d+(?:\.\d+)?)\s*(?:m|million)/i,
    /€(\d+(?:\.\d+)?)\s*(?:m|million)/i,
    /(\d+(?:\.\d+)?)\s*million\s*(?:dollars|euros|€|\$)/i,
    /(\d+(?:\.\d+)?)\s*M€/i,
    /(\d+(?:\.\d+)?)\s*M\$/i,
    /(\d+)\s*million/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]) * 1_000_000;
    }
  }

  return null;
}

/**
 * Extract company name from funding article
 */
function extractCompanyName(title: string): string | null {
  // Common patterns: "CompanyName raises $X", "CompanyName secures funding"
  const patterns = [
    /^([A-Z][a-zA-Z0-9\s]+?)\s+(?:raises|secures|closes|announces)/i,
    /^([A-Z][a-zA-Z0-9\s]+?)\s+lève/i,
    /^French\s+(?:startup\s+)?([A-Z][a-zA-Z0-9\s]+?)\s+/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Determine article sentiment
 */
function getSentiment(title: string, description: string): "positive" | "neutral" | "negative" {
  const combined = `${title} ${description}`.toLowerCase();

  let score = 0;
  for (const kw of POSITIVE_KEYWORDS) {
    if (combined.includes(kw)) score += 1;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (combined.includes(kw)) score -= 1;
  }

  if (score >= 2) return "positive";
  if (score <= -1) return "negative";
  return "neutral";
}

/**
 * Calculate relevance score
 */
function calculateRelevance(
  item: RSSItem,
  query: ConnectorQuery
): number {
  let score = 0.3; // Base score

  const combined = `${item.title} ${item.description}`.toLowerCase();

  // Boost for company name match
  if (query.companyName && combined.includes(query.companyName.toLowerCase())) {
    score += 0.4;
  }

  // Boost for sector match
  if (query.sector && combined.includes(query.sector.toLowerCase())) {
    score += 0.2;
  }

  // Boost for keywords
  if (query.keywords) {
    for (const kw of query.keywords) {
      if (combined.includes(kw.toLowerCase())) {
        score += 0.1;
      }
    }
  }

  // Boost for funding-related
  if (isFundingRelated(item.title, item.description)) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Fetch RSS feed with timeout
 */
async function fetchRSS(url: string, timeoutMs: number = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AngelDesk/1.0 (https://angeldesk.app; contact@angeldesk.app)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[RSSConnector] Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[RSSConnector] Timeout fetching ${url}`);
    } else {
      console.warn(`[RSSConnector] Error fetching ${url}:`, error);
    }
    return null;
  }
}

const rssSource: DataSource = {
  type: "news_api",
  name: "RSS Feeds (TechCrunch, Maddyness, Sifted)",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

export const rssFundingConnector: Connector = {
  name: "RSS Funding News",
  type: "news_api",

  isConfigured: () => true, // Always available (no API key needed)

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const articles: NewsArticle[] = [];

    // Fetch all RSS feeds in parallel
    const feedPromises = RSS_FEEDS.map(async (feed) => {
      const xml = await fetchRSS(feed.url);
      if (!xml) return [];

      const items = parseRSSXml(xml, feed.name);

      // Filter and transform items
      return items
        .filter((item) => {
          // If company name is specified, prioritize exact matches
          if (query.companyName) {
            const combined = `${item.title} ${item.description}`.toLowerCase();
            if (combined.includes(query.companyName.toLowerCase())) {
              return true;
            }
          }
          // Otherwise, filter for funding-related news
          return isFundingRelated(item.title, item.description);
        })
        .slice(0, 10) // Limit per feed
        .map((item): NewsArticle => ({
          title: item.title,
          description: item.description.slice(0, 300),
          url: item.link,
          source: item.source,
          publishedAt: new Date(item.pubDate).toISOString(),
          sentiment: getSentiment(item.title, item.description),
          relevance: calculateRelevance(item, query),
          category: query.companyName &&
            `${item.title} ${item.description}`.toLowerCase().includes(query.companyName.toLowerCase())
            ? "company"
            : "sector",
        }));
    });

    const results = await Promise.all(feedPromises);
    articles.push(...results.flat());

    // Sort by relevance and recency
    articles.sort((a, b) => {
      const relevanceDiff = b.relevance - a.relevance;
      if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return articles.slice(0, 20); // Return top 20
  },

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    const deals: SimilarDeal[] = [];

    // Fetch all RSS feeds in parallel
    const feedPromises = RSS_FEEDS.map(async (feed) => {
      const xml = await fetchRSS(feed.url);
      if (!xml) return [];

      const items = parseRSSXml(xml, feed.name);

      // Extract deals from funding news
      return items
        .filter((item) => isFundingRelated(item.title, item.description))
        .map((item) => {
          const companyName = extractCompanyName(item.title);
          const fundingAmount = extractFundingAmount(`${item.title} ${item.description}`);

          if (!companyName || !fundingAmount) return null;

          // Try to determine stage from text
          const text = `${item.title} ${item.description}`.toLowerCase();
          let stage = "SEED";
          if (text.includes("series a")) stage = "SERIES_A";
          else if (text.includes("series b")) stage = "SERIES_B";
          else if (text.includes("series c") || text.includes("series d")) stage = "SERIES_C";
          else if (text.includes("pre-seed")) stage = "PRE_SEED";

          // Try to determine geography
          let geography = "Europe";
          if (feed.region === "france" || text.includes("french") || text.includes("france")) {
            geography = "France";
          } else if (text.includes("german") || text.includes("germany")) {
            geography = "Germany";
          } else if (text.includes("uk") || text.includes("british") || text.includes("london")) {
            geography = "UK";
          }

          return {
            companyName,
            sector: query.sector || "Tech",
            stage,
            geography,
            fundingAmount,
            fundingDate: new Date(item.pubDate).toISOString().split("T")[0],
            investors: [], // RSS doesn't reliably provide this
            source: {
              ...rssSource,
              url: item.link,
              retrievedAt: new Date().toISOString(),
            },
            sourceUrl: item.link,
          } as SimilarDeal;
        })
        .filter((deal): deal is SimilarDeal => deal !== null);
    });

    const results = await Promise.all(feedPromises);
    deals.push(...results.flat());

    // Filter by query parameters
    let filtered = deals;

    if (query.sector) {
      // Keep all for now since we don't have reliable sector extraction
    }

    if (query.stage) {
      filtered = filtered.filter(
        (d) => d.stage.toLowerCase() === query.stage?.toLowerCase()
      );
    }

    if (query.geography) {
      const geoLower = query.geography.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.geography.toLowerCase().includes(geoLower) ||
          geoLower.includes("europe")
      );
    }

    // Sort by date (most recent first) and deduplicate
    const seen = new Set<string>();
    return filtered
      .sort((a, b) => new Date(b.fundingDate).getTime() - new Date(a.fundingDate).getTime())
      .filter((deal) => {
        const key = deal.companyName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  },
};
