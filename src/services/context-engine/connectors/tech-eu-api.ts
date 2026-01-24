/**
 * Tech.eu API Connector
 *
 * Fetches funding data from Tech.eu - premium European tech news.
 * Uses their public RSS feed and website scraping.
 *
 * Source: https://tech.eu/feed/
 * Cost: FREE
 * Coverage: European tech ecosystem
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  SimilarDeal,
  DataSource,
} from "../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const RSS_URL = "https://tech.eu/feed/";

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
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

// Cache
let cachedDeals: ParsedDeal[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

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
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
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
        title: cleanHtml(title),
        link: link.trim(),
        description: cleanHtml(description),
        pubDate,
      });
    }
  }

  return items;
}

function isFundingArticle(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  const fundingKeywords = [
    "raises", "raised", "funding", "investment", "series a", "series b", "series c",
    "seed round", "pre-seed", "million", "closes", "secures", "backed",
    "€", "$", "round", "capital", "venture", "funding round"
  ];
  return fundingKeywords.some(kw => text.includes(kw));
}

function parseFundingAmount(text: string): { amount: number | null; currency: string } {
  // Euro patterns
  const euroPatterns = [
    /€\s*(\d+(?:[.,]\d+)?)\s*(?:M|million)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:M|million)\s*(?:euros?|€)/i,
  ];

  for (const pattern of euroPatterns) {
    const match = text.match(pattern);
    if (match) {
      return { amount: parseFloat(match[1].replace(",", ".")) * 1_000_000, currency: "EUR" };
    }
  }

  // Dollar patterns
  const dollarPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:M|million)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:M|million)\s*(?:dollars?|\$)/i,
  ];

  for (const pattern of dollarPatterns) {
    const match = text.match(pattern);
    if (match) {
      return { amount: parseFloat(match[1].replace(",", ".")) * 1_000_000, currency: "USD" };
    }
  }

  return { amount: null, currency: "EUR" };
}

function parseStage(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/series\s*d/i.test(lowerText)) return "Series D";
  if (/series\s*c/i.test(lowerText)) return "Series C";
  if (/series\s*b/i.test(lowerText)) return "Series B";
  if (/series\s*a/i.test(lowerText)) return "Series A";
  if (/pre[\s-]?seed/i.test(lowerText)) return "Pre-seed";
  if (/seed/i.test(lowerText)) return "Seed";
  if (/growth/i.test(lowerText)) return "Growth";
  return null;
}

function extractCompanyName(title: string): string | null {
  const patterns = [
    /^([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures|closes|lands|bags|nabs)/i,
    /^(?:German|French|Dutch|Spanish|Swedish|UK|European)\s+(?:startup\s+)?([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 50) {
      return match[1].trim();
    }
  }

  return null;
}

function extractGeography(text: string): string | null {
  const lowerText = text.toLowerCase();
  const countries: [RegExp, string][] = [
    [/german|berlin|munich/i, "Germany"],
    [/french|france|paris/i, "France"],
    [/dutch|netherlands|amsterdam/i, "Netherlands"],
    [/spanish|spain|madrid|barcelona/i, "Spain"],
    [/swedish|sweden|stockholm/i, "Sweden"],
    [/uk|british|london/i, "UK"],
    [/finnish|finland|helsinki/i, "Finland"],
    [/danish|denmark|copenhagen/i, "Denmark"],
    [/norwegian|norway|oslo/i, "Norway"],
    [/irish|ireland|dublin/i, "Ireland"],
    [/swiss|switzerland|zurich/i, "Switzerland"],
  ];

  for (const [pattern, country] of countries) {
    if (pattern.test(lowerText)) return country;
  }
  return "Europe";
}

function detectSector(text: string): string | null {
  const lowerText = text.toLowerCase();
  const sectors: [RegExp, string][] = [
    [/fintech|payment|banking|finance/i, "fintech"],
    [/healthtech|health|medical|biotech/i, "healthtech"],
    [/saas|software|cloud/i, "saas"],
    [/\bai\b|artificial intelligence|machine learning/i, "ai"],
    [/cybersecurity|security/i, "cybersecurity"],
    [/greentech|climate|cleantech|energy/i, "greentech"],
    [/edtech|education/i, "edtech"],
    [/foodtech|food|agritech/i, "foodtech"],
    [/proptech|real estate/i, "proptech"],
    [/mobility|transport|automotive/i, "mobility"],
    [/logistics|supply chain/i, "logistics"],
  ];

  for (const [pattern, sector] of sectors) {
    if (pattern.test(lowerText)) return sector;
  }
  return null;
}

function parseRSSItem(item: RSSItem): ParsedDeal | null {
  const fullText = `${item.title} ${item.description}`;

  if (!isFundingArticle(item.title, item.description)) {
    return null;
  }

  const companyName = extractCompanyName(item.title);
  if (!companyName) return null;

  const { amount, currency } = parseFundingAmount(fullText);
  const stage = parseStage(fullText);
  const geography = extractGeography(fullText);
  const sector = detectSector(fullText);

  return {
    companyName,
    amount,
    currency,
    stage,
    investors: [],
    date: new Date(item.pubDate).toISOString(),
    sector,
    geography,
    url: item.link,
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchRSS(): Promise<RSSItem[]> {
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "AngelDesk/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      console.error(`[Tech.eu] HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseRSSXml(xml);
  } catch (error) {
    console.error("[Tech.eu] Fetch error:", error);
    return [];
  }
}

async function getDeals(forceRefresh = false): Promise<ParsedDeal[]> {
  const now = Date.now();

  if (!forceRefresh && cachedDeals.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return cachedDeals;
  }

  console.log("[Tech.eu] Fetching deals...");
  const items = await fetchRSS();

  const deals: ParsedDeal[] = [];
  for (const item of items) {
    const parsed = parseRSSItem(item);
    if (parsed && parsed.amount) {
      deals.push(parsed);
    }
  }

  deals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cachedDeals = deals;
  lastFetchTime = now;

  console.log(`[Tech.eu] Parsed ${deals.length} deals`);
  return deals;
}

// ============================================================================
// CONNECTOR
// ============================================================================

const techEuSource: DataSource = {
  type: "news_api",
  name: "Tech.eu",
  url: "https://tech.eu",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

export const techEuConnector: Connector = {
  name: "Tech.eu",
  type: "news_api",

  isConfigured: () => true,

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const deals = await getDeals();

    let filtered = deals;
    if (query.companyName) {
      const nameLower = query.companyName.toLowerCase();
      filtered = deals.filter(d => d.companyName.toLowerCase().includes(nameLower));
    }

    return filtered.slice(0, 15).map(deal => ({
      title: `${deal.companyName} raises ${deal.amount ? `€${(deal.amount / 1_000_000).toFixed(1)}M` : "funding"}`,
      description: `${deal.stage || "Funding"} - ${deal.geography || "Europe"} - ${deal.sector || "Tech"}`,
      url: deal.url,
      source: "Tech.eu",
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
        d.geography?.toLowerCase().includes(geoLower) || geoLower.includes("europe")
      );
    }

    return filtered
      .filter(d => d.amount !== null)
      .slice(0, 15)
      .map(deal => ({
        companyName: deal.companyName,
        sector: deal.sector || query.sector || "tech",
        stage: deal.stage || "Unknown",
        fundingAmount: deal.amount!,
        fundingDate: deal.date,
        investors: deal.investors,
        geography: deal.geography || "Europe",
        source: techEuSource,
      }));
  },
};

export async function getTechEuDeals(limit = 30): Promise<ParsedDeal[]> {
  const deals = await getDeals();
  return deals.slice(0, limit);
}
