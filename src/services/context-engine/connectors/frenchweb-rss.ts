/**
 * FrenchWeb RSS Connector
 *
 * Provides French tech news via RSS feeds:
 * - FrenchWeb.fr - Major French tech news site
 * - Journal du Net - Business/tech news
 * - L'Usine Digitale - Digital industry news
 *
 * Source: RSS feeds
 * Cost: FREE
 * Value: Additional French tech coverage beyond Maddyness
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  DataSource,
} from "../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const RSS_FEEDS = [
  {
    name: "FrenchWeb",
    url: "https://www.frenchweb.fr/feed",
    category: "tech",
  },
  {
    name: "Journal du Net",
    url: "https://www.journaldunet.com/rss/",
    category: "business",
  },
  {
    name: "L'Usine Digitale",
    url: "https://www.usine-digitale.fr/rss",
    category: "industry",
  },
  // Les Echos Start RSS blocked (403) - removed
];

// Keywords for funding detection
const FUNDING_KEYWORDS = [
  "lève", "levée", "levee", "million", "investissement", "série",
  "series", "financement", "tour de table", "fundraising",
  "seed", "amorçage", "capital", "valorisation"
];

// Keywords for sentiment analysis
const POSITIVE_KEYWORDS = [
  "lève", "croissance", "succès", "record", "innovation", "expansion",
  "partenariat", "acquisition", "licorne", "unicorn", "leader"
];

const NEGATIVE_KEYWORDS = [
  "licenciement", "fermeture", "faillite", "difficultés", "perte",
  "restructuration", "baisse", "crise", "échec", "problème"
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchRSSFeed(feedUrl: string): Promise<string | null> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "FullInvestBot/1.0",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      console.warn(`[FrenchWeb RSS] Failed to fetch ${feedUrl}: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`[FrenchWeb RSS] Error fetching ${feedUrl}:`, error);
    return null;
  }
}

function parseRSSItems(xml: string, sourceName: string): NewsArticle[] {
  const articles: NewsArticle[] = [];

  // Extract items using regex (simpler than full XML parsing)
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemPattern.exec(xml)) !== null) {
    const itemXml = match[1];

    // Extract title
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()
      : null;

    // Extract link
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const url = linkMatch
      ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()
      : null;

    // Extract description
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    let description = descMatch
      ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()
      : null;

    // Clean HTML from description
    if (description) {
      description = description
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 300);
    }

    // Extract pubDate
    const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const publishedAt = dateMatch
      ? new Date(dateMatch[1].trim()).toISOString()
      : new Date().toISOString();

    if (!title || !url) continue;

    // Analyze sentiment
    const textToAnalyze = `${title} ${description || ""}`.toLowerCase();
    const positiveCount = POSITIVE_KEYWORDS.filter(kw => textToAnalyze.includes(kw)).length;
    const negativeCount = NEGATIVE_KEYWORDS.filter(kw => textToAnalyze.includes(kw)).length;

    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    if (positiveCount > negativeCount + 1) sentiment = "positive";
    if (negativeCount > positiveCount + 1) sentiment = "negative";

    // Determine category (map to valid NewsArticle categories)
    const isFunding = FUNDING_KEYWORDS.some(kw => textToAnalyze.includes(kw));
    // "funding" news is about companies, "market" news is about sectors
    const category: "company" | "founder" | "sector" | "competitor" = isFunding ? "company" : "sector";

    articles.push({
      title,
      description: description || title,
      url,
      source: sourceName,
      publishedAt,
      sentiment,
      relevance: 0.7,
      category,
    });
  }

  return articles;
}

function matchesQuery(article: NewsArticle, query: ConnectorQuery): boolean {
  const text = `${article.title} ${article.description || ""}`.toLowerCase();

  // Match by company name
  if (query.companyName) {
    const companyLower = query.companyName.toLowerCase();
    if (text.includes(companyLower)) {
      return true;
    }
  }

  // Match by sector keywords
  if (query.sector) {
    const sectorKeywords: Record<string, string[]> = {
      "saas": ["saas", "logiciel", "software", "cloud"],
      "fintech": ["fintech", "paiement", "banque", "finance", "assurance"],
      "healthtech": ["santé", "health", "médical", "biotech", "pharma"],
      "marketplace": ["marketplace", "plateforme", "e-commerce"],
      "deeptech": ["deeptech", "hardware", "industrie", "robotique", "IA", "intelligence artificielle"],
      "ai": ["ia", "intelligence artificielle", "machine learning", "ai"],
    };

    const keywords = sectorKeywords[query.sector.toLowerCase()] || [query.sector.toLowerCase()];
    if (keywords.some(kw => text.includes(kw))) {
      return true;
    }
  }

  // Match by explicit keywords
  if (query.keywords) {
    if (query.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

const frenchWebSource: DataSource = {
  type: "news_api",
  name: "FrenchWeb RSS",
  url: "https://www.frenchweb.fr",
  retrievedAt: new Date().toISOString(),
  confidence: 0.75,
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const frenchWebRssConnector: Connector = {
  name: "FrenchWeb RSS",
  type: "news_api",

  isConfigured: () => true, // Always available

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const allArticles: NewsArticle[] = [];

    // Fetch all RSS feeds in parallel
    const feedPromises = RSS_FEEDS.map(async (feed) => {
      const xml = await fetchRSSFeed(feed.url);
      if (xml) {
        return parseRSSItems(xml, feed.name);
      }
      return [];
    });

    const results = await Promise.all(feedPromises);

    for (const articles of results) {
      allArticles.push(...articles);
    }

    // Filter by query
    let filtered = allArticles;
    if (query.companyName || query.sector || query.keywords) {
      filtered = allArticles.filter(article => matchesQuery(article, query));
    }

    // Sort by date (most recent first)
    filtered.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // Update relevance based on match quality
    for (const article of filtered) {
      if (query.companyName) {
        const text = `${article.title} ${article.description || ""}`.toLowerCase();
        if (text.includes(query.companyName.toLowerCase())) {
          article.relevance = 0.95;
        }
      }
    }

    return filtered.slice(0, 20);
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// ============================================================================

/**
 * Get latest French tech news
 */
export async function getLatestFrenchTechNews(
  limit: number = 20
): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  for (const feed of RSS_FEEDS) {
    const xml = await fetchRSSFeed(feed.url);
    if (xml) {
      const articles = parseRSSItems(xml, feed.name);
      allArticles.push(...articles);
    }
  }

  // Sort by date and deduplicate by title
  const seen = new Set<string>();
  const unique = allArticles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return unique.slice(0, limit);
}

/**
 * Get funding news from French sources
 */
export async function getFrenchFundingNews(
  limit: number = 10
): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  for (const feed of RSS_FEEDS) {
    const xml = await fetchRSSFeed(feed.url);
    if (xml) {
      const articles = parseRSSItems(xml, feed.name);
      allArticles.push(...articles);
    }
  }

  // Filter for funding news
  const fundingNews = allArticles.filter(article => {
    const text = `${article.title} ${article.description || ""}`.toLowerCase();
    return FUNDING_KEYWORDS.some(kw => text.includes(kw));
  });

  fundingNews.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return fundingNews.slice(0, limit);
}

/**
 * Extract funding amount from article text
 */
export function extractFundingAmount(text: string): number | null {
  const patterns = [
    /(\d+(?:[,\.]\d+)?)\s*millions?\s*(?:d'euros?|€|EUR)/i,
    /€\s*(\d+(?:[,\.]\d+)?)\s*(?:M|millions?)/i,
    /(\d+(?:[,\.]\d+)?)\s*M€/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      return amount * 1_000_000; // Convert to EUR
    }
  }

  return null;
}

/**
 * Get sentiment summary for a company from French news
 */
export async function getCompanySentiment(
  companyName: string
): Promise<{
  articleCount: number;
  overallSentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // -1 to 1
  recentArticles: NewsArticle[];
}> {
  const allArticles: NewsArticle[] = [];

  for (const feed of RSS_FEEDS) {
    const xml = await fetchRSSFeed(feed.url);
    if (xml) {
      const articles = parseRSSItems(xml, feed.name);
      allArticles.push(...articles);
    }
  }

  // Filter for company
  const companyLower = companyName.toLowerCase();
  const companyArticles = allArticles.filter(article => {
    const text = `${article.title} ${article.description || ""}`.toLowerCase();
    return text.includes(companyLower);
  });

  if (companyArticles.length === 0) {
    return {
      articleCount: 0,
      overallSentiment: "neutral",
      sentimentScore: 0,
      recentArticles: [],
    };
  }

  // Calculate sentiment
  const sentimentScores: number[] = companyArticles.map(a => {
    switch (a.sentiment) {
      case "positive": return 1;
      case "negative": return -1;
      default: return 0;
    }
  });

  const avgScore = sentimentScores.length > 0
    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
    : 0;

  let overallSentiment: "positive" | "neutral" | "negative";
  if (avgScore > 0.3) overallSentiment = "positive";
  else if (avgScore < -0.3) overallSentiment = "negative";
  else overallSentiment = "neutral";

  return {
    articleCount: companyArticles.length,
    overallSentiment,
    sentimentScore: avgScore,
    recentArticles: companyArticles.slice(0, 5),
  };
}
