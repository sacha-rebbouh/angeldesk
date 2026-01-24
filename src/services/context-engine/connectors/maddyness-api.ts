/**
 * Maddyness API Connector
 *
 * Fetches REAL funding data from Maddyness.com WordPress API.
 * Maddyness is a major French tech media covering startup news and funding.
 *
 * Source: https://www.maddyness.com/wp-json/wp/v2/posts
 * Cost: FREE
 * Rate limit: Be respectful, cache results
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  SimilarDeal,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

interface WPPost {
  id: number;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
}

interface ParsedFundingRound {
  companyName: string;
  amount: number | null;
  currency: string;
  stage: string | null;
  investors: string[];
  date: string;
  sector: string | null;
  url: string;
  description: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://www.maddyness.com/wp-json/wp/v2";

// Tags and categories
const TAGS = {
  MADDYMONEY: 42, // Funding roundups tag
};

// Cache - stores ALL historical funding data
let cachedDeals: ParsedFundingRound[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES = 100; // Fetch up to 100 pages = 10,000 posts max
const PER_PAGE = 100; // Max allowed by WordPress API

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse funding amount from text
 */
function parseFundingAmount(text: string): { amount: number | null; currency: string } {
  const patterns = [
    // €11M, €4.7M
    /€\s*(\d+(?:[.,]\d+)?)\s*M/i,
    // 11M€, 4,7M€
    /(\d+(?:[.,]\d+)?)\s*M€/i,
    // 11 millions d'euros
    /(\d+(?:[.,]\d+)?)\s*millions?\s*(?:d'euros?|€|EUR)/i,
    // lève 11 millions
    /lève\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
    // levé 11 millions
    /levé\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      return { amount: amount * 1_000_000, currency: "EUR" };
    }
  }

  return { amount: null, currency: "EUR" };
}

/**
 * Parse funding stage from text
 */
function parseFundingStage(text: string): string | null {
  const stagePatterns: [RegExp, string][] = [
    [/series\s*[dD]/i, "Series D"],
    [/series\s*[cC]/i, "Series C"],
    [/series\s*[bB]/i, "Series B"],
    [/series\s*[aA]/i, "Series A"],
    [/série\s*[dD]/i, "Series D"],
    [/série\s*[cC]/i, "Series C"],
    [/série\s*[bB]/i, "Series B"],
    [/série\s*[aA]/i, "Series A"],
    [/seed/i, "Seed"],
    [/amorçage/i, "Seed"],
    [/pre-seed/i, "Pre-seed"],
  ];

  for (const [pattern, stage] of stagePatterns) {
    if (pattern.test(text)) {
      return stage;
    }
  }

  return null;
}

/**
 * Extract company name from title
 */
function extractCompanyName(title: string): string | null {
  // Clean HTML entities
  const cleanTitle = title
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8230;/g, "...")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "");

  // Pattern: "CompanyName lève" or "CompanyName raises"
  const leveMatch = cleanTitle.match(/^([A-Za-zÀ-ÿ0-9\s\-\.]+?)\s+(?:lève|raises|annonce|boucle|sécurise|a levé)/i);
  if (leveMatch) {
    return leveMatch[1].trim();
  }

  // Pattern: "CompanyName, la startup qui..."
  const startupMatch = cleanTitle.match(/^([A-Za-zÀ-ÿ0-9\s\-\.]+?),?\s+(?:la startup|the startup)/i);
  if (startupMatch) {
    return startupMatch[1].trim();
  }

  // Pattern: starts with company name followed by colon
  const colonMatch = cleanTitle.match(/^([A-Za-zÀ-ÿ0-9\s\-\.]+?):/);
  if (colonMatch && colonMatch[1].length < 30) {
    return colonMatch[1].trim();
  }

  return null;
}

/**
 * Detect sector from text
 */
function detectSector(text: string): string | null {
  const sectorKeywords: [RegExp, string][] = [
    [/fintech|paiement|banque|finance|assurance|insurtech/i, "fintech"],
    [/healthtech|santé|médical|biotech|pharma|medtech/i, "healthtech"],
    [/saas|logiciel|software|cloud/i, "saas"],
    [/marketplace|e-commerce|commerce/i, "marketplace"],
    [/deeptech|hardware|industrie|robotique/i, "deeptech"],
    [/ia\b|intelligence artificielle|machine learning|ai\b/i, "ai"],
    [/cyber|sécurité|security/i, "cybersecurity"],
    [/greentech|climat|énergie|cleantech/i, "greentech"],
    [/edtech|éducation|formation/i, "edtech"],
    [/foodtech|alimentation|agritech|agricole/i, "foodtech"],
    [/proptech|immobilier/i, "proptech"],
    [/hrtech|rh|recrutement/i, "hrtech"],
    [/legaltech|juridique/i, "legaltech"],
    [/sport|fitness/i, "sporttech"],
  ];

  for (const [pattern, sector] of sectorKeywords) {
    if (pattern.test(text)) {
      return sector;
    }
  }

  return null;
}

/**
 * Extract investors from text
 */
function extractInvestors(text: string): string[] {
  const investors: string[] = [];

  // Known French investors
  const knownInvestors = [
    "Bpifrance", "Eurazeo", "Partech", "Alven", "Elaia", "Idinvest",
    "Serena", "Breega", "Kima Ventures", "Daphni", "XAnge", "360 Capital",
    "Newfund", "Cathay Innovation", "Tikehau", "Blast", "Ventech",
  ];

  for (const investor of knownInvestors) {
    if (text.toLowerCase().includes(investor.toLowerCase())) {
      investors.push(investor);
    }
  }

  return [...new Set(investors)].slice(0, 5);
}

/**
 * Parse a WordPress post into funding round data
 */
function parsePost(post: WPPost): ParsedFundingRound | null {
  const title = post.title.rendered;
  const excerpt = post.excerpt.rendered.replace(/<[^>]+>/g, "").trim();
  const fullText = `${title} ${excerpt}`;

  const companyName = extractCompanyName(title);
  if (!companyName) return null;

  const { amount, currency } = parseFundingAmount(fullText);
  // Only return deals with amounts
  if (!amount) return null;

  const stage = parseFundingStage(fullText);
  const investors = extractInvestors(fullText);
  const sector = detectSector(fullText);

  return {
    companyName,
    amount,
    currency,
    stage,
    investors,
    date: post.date,
    sector,
    url: post.link,
    description: excerpt.substring(0, 200),
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch a single page of funding posts from Maddyness API
 */
async function fetchFundingPage(page: number): Promise<{ posts: WPPost[]; totalPages: number }> {
  const url = `${API_BASE}/posts?per_page=${PER_PAGE}&page=${page}&search=millions%20euros&_fields=id,date,title,excerpt,link`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AngelDesk/1.0",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[Maddyness API] HTTP ${response.status} on page ${page}`);
      return { posts: [], totalPages: 0 };
    }

    const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "0", 10);
    const posts = await response.json();

    return { posts, totalPages };
  } catch (error) {
    console.error("[Maddyness API] Fetch error:", error);
    return { posts: [], totalPages: 0 };
  }
}

/**
 * Fetch ALL funding posts with pagination
 */
async function fetchAllFundingPosts(): Promise<WPPost[]> {
  const allPosts: WPPost[] = [];

  // First request to get total pages
  const { posts: firstPage, totalPages } = await fetchFundingPage(1);
  allPosts.push(...firstPage);

  const pagesToFetch = Math.min(totalPages, MAX_PAGES);
  console.log(`[Maddyness API] Total pages: ${totalPages}, fetching ${pagesToFetch} pages...`);

  // Fetch remaining pages in batches
  const BATCH_SIZE = 5;
  for (let startPage = 2; startPage <= pagesToFetch; startPage += BATCH_SIZE) {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, pagesToFetch);
    const pagePromises: Promise<{ posts: WPPost[]; totalPages: number }>[] = [];

    for (let page = startPage; page <= endPage; page++) {
      pagePromises.push(fetchFundingPage(page));
    }

    const results = await Promise.all(pagePromises);
    for (const result of results) {
      allPosts.push(...result.posts);
    }

    // Small delay between batches
    if (endPage < pagesToFetch) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[Maddyness API] Fetched ${allPosts.length} total posts`);
  return allPosts;
}

/**
 * Get cached or fresh funding deals
 */
async function getFundingDeals(forceRefresh = false): Promise<ParsedFundingRound[]> {
  const now = Date.now();

  if (!forceRefresh && cachedDeals.length > 0 && now - lastFetchTime < CACHE_TTL) {
    console.log(`[Maddyness API] Using cache (${cachedDeals.length} deals)`);
    return cachedDeals;
  }

  console.log("[Maddyness API] Fetching ALL historical funding data...");
  const posts = await fetchAllFundingPosts();

  // Dedupe by URL
  const seen = new Set<string>();
  const uniquePosts = posts.filter(p => {
    if (seen.has(p.link)) return false;
    seen.add(p.link);
    return true;
  });

  const deals: ParsedFundingRound[] = [];
  for (const post of uniquePosts) {
    const parsed = parsePost(post);
    if (parsed) {
      deals.push(parsed);
    }
  }

  // Sort by date (most recent first)
  deals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cachedDeals = deals;
  lastFetchTime = now;

  console.log(`[Maddyness API] Parsed ${deals.length} funding rounds from ${posts.length} posts`);
  return deals;
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

const maddynessSource: DataSource = {
  type: "news_api",
  name: "Maddyness API",
  url: "https://www.maddyness.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9,
};

export const maddynessApiConnector: Connector = {
  name: "Maddyness API",
  type: "news_api",

  isConfigured: () => true, // Always available

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const deals = await getFundingDeals();

    // Filter by company name if provided
    let filtered = deals;
    if (query.companyName) {
      const companyLower = query.companyName.toLowerCase();
      filtered = deals.filter(d =>
        d.companyName.toLowerCase().includes(companyLower)
      );
    }

    // Filter by sector if provided and no company match
    if (query.sector && filtered.length === deals.length) {
      filtered = deals.filter(d =>
        d.sector === query.sector?.toLowerCase()
      );
    }

    return filtered.slice(0, 15).map(deal => ({
      title: `${deal.companyName} lève €${(deal.amount! / 1_000_000).toFixed(1)}M`,
      description: deal.description || `${deal.stage || "Levée"} - ${deal.sector || "tech"}`,
      url: deal.url,
      source: "Maddyness",
      publishedAt: deal.date,
      sentiment: "positive" as const,
      relevance: query.companyName ? 0.95 : 0.8,
      category: "company" as const,
    }));
  },

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    const deals = await getFundingDeals();

    // Filter by sector
    let filtered = deals;
    if (query.sector) {
      const sectorLower = query.sector.toLowerCase();
      filtered = deals.filter(d => d.sector === sectorLower);
    }

    // If no sector match, return all deals
    if (filtered.length === 0) {
      filtered = deals;
    }

    return filtered.slice(0, 15).map(deal => ({
      companyName: deal.companyName,
      sector: deal.sector || query.sector || "tech",
      stage: deal.stage || "Unknown",
      fundingAmount: deal.amount!,
      fundingDate: deal.date,
      investors: deal.investors,
      geography: "France",
      source: maddynessSource,
    }));
  },
};

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Get weekly funding summary (MaddyMoney style)
 */
export async function getWeeklyFundingSummary(): Promise<{
  totalAmount: number;
  dealCount: number;
  averageTicket: number;
  topDeals: ParsedFundingRound[];
  bySector: Record<string, { count: number; total: number }>;
}> {
  const deals = await getFundingDeals();

  // Get deals from last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekDeals = deals.filter(d => new Date(d.date) >= weekAgo);

  const totalAmount = weekDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const dealCount = weekDeals.length;

  // Group by sector
  const bySector: Record<string, { count: number; total: number }> = {};
  for (const deal of weekDeals) {
    const sector = deal.sector || "other";
    if (!bySector[sector]) {
      bySector[sector] = { count: 0, total: 0 };
    }
    bySector[sector].count++;
    bySector[sector].total += deal.amount || 0;
  }

  return {
    totalAmount,
    dealCount,
    averageTicket: dealCount > 0 ? totalAmount / dealCount : 0,
    topDeals: weekDeals.slice(0, 5),
    bySector,
  };
}

/**
 * Get all recent funding with full data
 */
export async function getRecentMaddynessFunding(limit: number = 20): Promise<ParsedFundingRound[]> {
  const deals = await getFundingDeals();
  return deals.slice(0, limit);
}
