/**
 * News API Connector
 *
 * Fetches news articles from NewsAPI.org
 * Free tier: 100 requests/day, 1 month old articles
 * Get API key at: https://newsapi.org/
 *
 * Set NEWS_API_KEY in .env.local
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  DataSource,
} from "../types";

const NEWS_API_BASE = "https://newsapi.org/v2";

function getApiKey(): string | undefined {
  return process.env.NEWS_API_KEY;
}

function createSource(): DataSource {
  return {
    type: "news_api",
    name: "NewsAPI.org",
    retrievedAt: new Date().toISOString(),
    confidence: 0.9,
  };
}

/**
 * Analyze sentiment based on title and description
 * Simple keyword-based approach
 */
function analyzeSentiment(
  title: string,
  description: string
): "positive" | "neutral" | "negative" {
  const text = `${title} ${description}`.toLowerCase();

  const positiveKeywords = [
    "growth", "success", "raises", "funding", "launch", "expansion",
    "partnership", "breakthrough", "innovation", "record", "milestone",
    "profit", "revenue", "surges", "wins", "leading"
  ];

  const negativeKeywords = [
    "layoff", "cuts", "decline", "loss", "fails", "shutdown",
    "bankruptcy", "lawsuit", "fraud", "scandal", "crash", "plunge",
    "downturn", "warning", "risk", "concern", "investigation"
  ];

  let score = 0;
  for (const keyword of positiveKeywords) {
    if (text.includes(keyword)) score += 1;
  }
  for (const keyword of negativeKeywords) {
    if (text.includes(keyword)) score -= 1;
  }

  if (score >= 2) return "positive";
  if (score <= -2) return "negative";
  return "neutral";
}

/**
 * Calculate relevance score based on keywords
 */
function calculateRelevance(
  article: { title: string; description?: string },
  query: ConnectorQuery
): number {
  const text = `${article.title} ${article.description || ""}`.toLowerCase();
  let score = 0.3; // Base relevance

  // Company name match
  if (query.companyName && text.includes(query.companyName.toLowerCase())) {
    score += 0.4;
  }

  // Sector match
  if (query.sector && text.includes(query.sector.toLowerCase())) {
    score += 0.2;
  }

  // Keywords match
  if (query.keywords) {
    for (const keyword of query.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.1;
      }
    }
  }

  return Math.min(score, 1);
}

/**
 * Determine article category
 */
function categorizeArticle(
  article: { title: string; description?: string },
  query: ConnectorQuery
): "company" | "founder" | "sector" | "competitor" {
  const text = `${article.title} ${article.description || ""}`.toLowerCase();

  if (query.companyName && text.includes(query.companyName.toLowerCase())) {
    return "company";
  }

  if (query.founderNames) {
    for (const name of query.founderNames) {
      if (text.includes(name.toLowerCase())) {
        return "founder";
      }
    }
  }

  return "sector";
}

export const newsApiConnector: Connector = {
  name: "NewsAPI.org",
  type: "news_api",

  isConfigured: () => !!getApiKey(),

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    // Build search query
    const searchTerms: string[] = [];
    if (query.companyName) searchTerms.push(query.companyName);
    if (query.sector) searchTerms.push(query.sector);
    if (query.keywords) searchTerms.push(...query.keywords);

    if (searchTerms.length === 0) {
      searchTerms.push("startup funding");
    }

    const q = searchTerms.join(" OR ");

    try {
      const params = new URLSearchParams({
        q,
        language: "en",
        sortBy: "publishedAt",
        pageSize: "20",
        apiKey,
      });

      const response = await fetch(`${NEWS_API_BASE}/everything?${params}`);

      if (!response.ok) {
        console.error("NewsAPI error:", response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      if (data.status !== "ok" || !data.articles) {
        return [];
      }

      const source = createSource();

      return data.articles.map((article: {
        title: string;
        description?: string;
        url: string;
        source: { name: string };
        publishedAt: string;
      }) => ({
        title: article.title,
        description: article.description || "",
        url: article.url,
        source: article.source?.name || "Unknown",
        publishedAt: article.publishedAt,
        sentiment: analyzeSentiment(article.title, article.description || ""),
        relevance: calculateRelevance(article, query),
        category: categorizeArticle(article, query),
      }));
    } catch (error) {
      console.error("NewsAPI fetch error:", error);
      return [];
    }
  },
};
