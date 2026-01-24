/**
 * EU-Startups API Connector
 *
 * Fetches REAL funding data from EU-Startups.com WordPress API.
 * Similar approach to FrenchWeb - extracts structured deal data.
 *
 * Source: https://www.eu-startups.com/wp-json/wp/v2/posts
 * Cost: FREE
 * Coverage: All of Europe
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
  categories: number[];
}

interface ParsedDeal {
  companyName: string;
  amount: number | null;
  currency: string;
  stage: string | null;
  investors: string[];
  date: string;
  sector: string | null;
  geography: string | null;
  url: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://www.eu-startups.com/wp-json/wp/v2";

// Category ID for Funding on EU-Startups (8203 posts!)
const FUNDING_CATEGORY = 1282;

// Cache
let cachedDeals: ParsedDeal[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours (data doesn't change fast)
const MAX_PAGES = 100; // 100 pages × 100 posts = up to 10,000 posts (~3+ years)
const PER_PAGE = 100;

// ============================================================================
// FUNDING KEYWORDS FILTER
// ============================================================================

const FUNDING_KEYWORDS = [
  // English
  "raises", "raised", "funding", "investment", "series a", "series b", "series c", "series d",
  "seed round", "pre-seed", "million", "billion", "closes", "secures", "backed",
  "funding round", "venture capital", "vc funding", "led by", "round led", "capital raise",
  // Variations
  "€", "$", "EUR", "USD", "mn", "mln",
];

function isFundingArticle(title: string, excerpt: string): boolean {
  const text = `${title} ${excerpt}`.toLowerCase();
  return FUNDING_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "...")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFundingAmount(text: string): { amount: number | null; currency: string } {
  const cleanText = cleanHtml(text);

  // Euro patterns
  const euroPatterns = [
    /€\s*(\d+(?:[.,]\d+)?)\s*(?:M|million)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:M|million)\s*(?:euros?|€)/i,
    /(\d+(?:[.,]\d+)?)\s*million\s*(?:euros?|€|EUR)/i,
  ];

  for (const pattern of euroPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 10000) {
        return { amount: amount * 1_000_000, currency: "EUR" };
      }
    }
  }

  // Dollar patterns
  const dollarPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:M|million)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:M|million)\s*(?:dollars?|\$|USD)/i,
  ];

  for (const pattern of dollarPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 10000) {
        return { amount: amount * 1_000_000, currency: "USD" };
      }
    }
  }

  // Billion patterns
  const billionPatterns = [
    /€\s*(\d+(?:[.,]\d+)?)\s*(?:B|billion)/i,
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:B|billion)/i,
  ];

  for (const pattern of billionPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      const currency = cleanText.includes("€") ? "EUR" : "USD";
      return { amount: amount * 1_000_000_000, currency };
    }
  }

  return { amount: null, currency: "EUR" };
}

function parseStage(text: string): string | null {
  const cleanText = cleanHtml(text).toLowerCase();

  if (/series\s*d/i.test(cleanText)) return "Series D";
  if (/series\s*c/i.test(cleanText)) return "Series C";
  if (/series\s*b/i.test(cleanText)) return "Series B";
  if (/series\s*a/i.test(cleanText)) return "Series A";
  if (/pre[\s-]?seed/i.test(cleanText)) return "Pre-seed";
  if (/seed/i.test(cleanText)) return "Seed";
  if (/growth|late[\s-]?stage/i.test(cleanText)) return "Growth";
  if (/bridge/i.test(cleanText)) return "Bridge";

  return null;
}

function extractCompanyName(title: string): string | null {
  const cleanTitle = cleanHtml(title);

  // Pattern: "CompanyName raises/secures/closes..."
  const patterns = [
    /^([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures|closes|lands|bags|gets|receives|announces|nabs)/i,
    /^([A-Z][A-Za-z0-9\-\.&]+),?\s+(?:a|an|the)?\s*(?:\w+\s+)?(?:startup|company)/i,
    /^(?:German|French|Dutch|Spanish|Italian|Swedish|UK|British|European)\s+(?:startup\s+)?([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanTitle.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 50) {
      return match[1].trim();
    }
  }

  return null;
}

function extractGeography(text: string): string | null {
  const cleanText = cleanHtml(text).toLowerCase();

  const countries: [RegExp, string][] = [
    [/\bgerman[y]?\b|\bberlin\b|\bmunich\b/i, "Germany"],
    [/\bfrench\b|\bfrance\b|\bparis\b/i, "France"],
    [/\bdutch\b|\bnetherlands\b|\bamsterdam\b/i, "Netherlands"],
    [/\bspanish\b|\bspain\b|\bmadrid\b|\bbarcelona\b/i, "Spain"],
    [/\bitalian\b|\bitaly\b|\bmilan\b/i, "Italy"],
    [/\bswedish\b|\bsweden\b|\bstockholm\b/i, "Sweden"],
    [/\bnorwegian\b|\bnorway\b|\boslo\b/i, "Norway"],
    [/\bdanish\b|\bdenmark\b|\bcopenhagen\b/i, "Denmark"],
    [/\bfinnish\b|\bfinland\b|\bhelsinki\b/i, "Finland"],
    [/\bpolish\b|\bpoland\b|\bwarsaw\b/i, "Poland"],
    [/\bportugu?ese?\b|\bportugal\b|\blisbon\b/i, "Portugal"],
    [/\bbelgian\b|\bbelgium\b|\bbrussels\b/i, "Belgium"],
    [/\baustrian\b|\baustria\b|\bvienna\b/i, "Austria"],
    [/\bswiss\b|\bswitzerland\b|\bzurich\b/i, "Switzerland"],
    [/\buk\b|\bbritish\b|\blondon\b|\bengland\b/i, "UK"],
    [/\birish\b|\bireland\b|\bdublin\b/i, "Ireland"],
  ];

  for (const [pattern, country] of countries) {
    if (pattern.test(cleanText)) {
      return country;
    }
  }

  return "Europe";
}

function detectSector(text: string): string | null {
  const cleanText = cleanHtml(text).toLowerCase();

  const sectors: [RegExp, string][] = [
    [/fintech|payment|banking|finance|insurtech/i, "fintech"],
    [/healthtech|health|medical|biotech|pharma|medtech/i, "healthtech"],
    [/saas|software|cloud|b2b/i, "saas"],
    [/marketplace|e-commerce|ecommerce/i, "marketplace"],
    [/deeptech|hardware|robotics|semiconductor/i, "deeptech"],
    [/\bai\b|artificial intelligence|machine learning/i, "ai"],
    [/cybersecurity|security|infosec/i, "cybersecurity"],
    [/greentech|climate|cleantech|energy|sustainability/i, "greentech"],
    [/edtech|education|learning/i, "edtech"],
    [/foodtech|food|agritech/i, "foodtech"],
    [/proptech|real estate/i, "proptech"],
    [/hrtech|hr\b|recruitment/i, "hrtech"],
    [/logistics|supply chain|shipping/i, "logistics"],
    [/mobility|transport|automotive/i, "mobility"],
  ];

  for (const [pattern, sector] of sectors) {
    if (pattern.test(cleanText)) {
      return sector;
    }
  }

  return null;
}

function extractInvestors(text: string): string[] {
  const investors: string[] = [];
  const cleanText = cleanHtml(text);

  // Known VC patterns
  const vcPatterns = [
    /(?:led by|with|from|backed by)\s+([A-Z][A-Za-z0-9\s,&]+?)(?:\.|,\s*(?:along|with|and)|$)/gi,
  ];

  for (const pattern of vcPatterns) {
    let match;
    while ((match = pattern.exec(cleanText)) !== null) {
      const names = match[1].split(/,|&|\band\b/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
      investors.push(...names);
    }
  }

  return [...new Set(investors)].slice(0, 5);
}

function parsePost(post: WPPost): ParsedDeal | null {
  const title = post.title.rendered;
  const excerpt = post.excerpt.rendered;
  const fullText = `${title} ${excerpt}`;

  // FILTER: Only process funding-related articles
  if (!isFundingArticle(title, excerpt)) {
    return null;
  }

  const companyName = extractCompanyName(title);
  if (!companyName) return null;

  const { amount, currency } = parseFundingAmount(fullText);
  const stage = parseStage(fullText);
  const geography = extractGeography(fullText);
  const sector = detectSector(fullText);
  const investors = extractInvestors(fullText);

  return {
    companyName,
    amount,
    currency,
    stage,
    investors,
    date: post.date,
    sector,
    geography,
    url: post.link,
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchPage(page: number): Promise<{ posts: WPPost[]; totalPages: number }> {
  const url = `${API_BASE}/posts?categories=${FUNDING_CATEGORY}&per_page=${PER_PAGE}&page=${page}&_fields=id,date,title,excerpt,link,categories`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AngelDesk/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[EU-Startups API] HTTP ${response.status} on page ${page}`);
      return { posts: [], totalPages: 0 };
    }

    const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "0", 10);
    const posts = await response.json();

    return { posts, totalPages };
  } catch (error) {
    console.error("[EU-Startups API] Fetch error:", error);
    return { posts: [], totalPages: 0 };
  }
}

async function fetchAllPosts(): Promise<WPPost[]> {
  const allPosts: WPPost[] = [];

  const { posts: firstPage, totalPages } = await fetchPage(1);
  allPosts.push(...firstPage);

  const pagesToFetch = Math.min(totalPages, MAX_PAGES);
  console.log(`[EU-Startups API] Fetching ${pagesToFetch} pages...`);

  const BATCH_SIZE = 5;
  for (let startPage = 2; startPage <= pagesToFetch; startPage += BATCH_SIZE) {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, pagesToFetch);
    const pagePromises: Promise<{ posts: WPPost[]; totalPages: number }>[] = [];

    for (let page = startPage; page <= endPage; page++) {
      pagePromises.push(fetchPage(page));
    }

    const results = await Promise.all(pagePromises);
    for (const result of results) {
      allPosts.push(...result.posts);
    }

    if (endPage < pagesToFetch) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[EU-Startups API] Fetched ${allPosts.length} posts`);
  return allPosts;
}

async function getDeals(forceRefresh = false): Promise<ParsedDeal[]> {
  const now = Date.now();

  if (!forceRefresh && cachedDeals.length > 0 && now - lastFetchTime < CACHE_TTL) {
    console.log(`[EU-Startups API] Using cache (${cachedDeals.length} deals)`);
    return cachedDeals;
  }

  console.log("[EU-Startups API] Fetching deals...");
  const posts = await fetchAllPosts();

  const deals: ParsedDeal[] = [];
  for (const post of posts) {
    const parsed = parsePost(post);
    if (parsed && parsed.amount) {
      deals.push(parsed);
    }
  }

  deals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cachedDeals = deals;
  lastFetchTime = now;

  console.log(`[EU-Startups API] Parsed ${deals.length} deals`);
  return deals;
}

// ============================================================================
// CONNECTOR
// ============================================================================

const euStartupsSource: DataSource = {
  type: "news_api",
  name: "EU-Startups",
  url: "https://www.eu-startups.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

export const euStartupsApiConnector: Connector = {
  name: "EU-Startups API",
  type: "news_api",

  isConfigured: () => true,

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const deals = await getDeals();

    let filtered = deals;
    if (query.companyName) {
      const nameLower = query.companyName.toLowerCase();
      filtered = deals.filter(d => d.companyName.toLowerCase().includes(nameLower));
    }

    if (query.sector && filtered.length === deals.length) {
      filtered = deals.filter(d => d.sector === query.sector?.toLowerCase());
    }

    return filtered.slice(0, 20).map(deal => ({
      title: `${deal.companyName} raises ${deal.amount ? `€${(deal.amount / 1_000_000).toFixed(1)}M` : "funding"}`,
      description: `${deal.stage || "Funding round"} in ${deal.geography || "Europe"}. Investors: ${deal.investors.join(", ") || "Undisclosed"}`,
      url: deal.url,
      source: "EU-Startups",
      publishedAt: deal.date,
      sentiment: "positive" as const,
      relevance: query.companyName ? 0.95 : 0.8,
      category: "company" as const,
    }));
  },

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    const deals = await getDeals();

    let filtered = deals;

    if (query.sector) {
      const sectorLower = query.sector.toLowerCase();
      filtered = deals.filter(d => d.sector === sectorLower);
    }

    if (query.geography) {
      const geoLower = query.geography.toLowerCase();
      filtered = filtered.filter(d =>
        d.geography?.toLowerCase().includes(geoLower) ||
        geoLower.includes("europe")
      );
    }

    if (filtered.length === 0) {
      filtered = deals;
    }

    return filtered
      .filter(d => d.amount !== null)
      .slice(0, 20)
      .map(deal => ({
        companyName: deal.companyName,
        sector: deal.sector || query.sector || "tech",
        stage: deal.stage || "Unknown",
        fundingAmount: deal.amount!,
        fundingDate: deal.date,
        investors: deal.investors,
        geography: deal.geography || "Europe",
        source: euStartupsSource,
      }));
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export async function getEUStartupsDeals(limit = 50): Promise<ParsedDeal[]> {
  const deals = await getDeals();
  return deals.slice(0, limit);
}

export async function searchEUStartups(companyName: string): Promise<ParsedDeal | null> {
  const deals = await getDeals();
  return deals.find(d => d.companyName.toLowerCase().includes(companyName.toLowerCase())) || null;
}
