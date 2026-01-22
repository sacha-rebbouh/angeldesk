/**
 * US Funding Connector
 *
 * Aggregates funding data from multiple FREE US sources:
 * - TechCrunch Startups + Funding (RSS) - #1 source for US startup news
 * - Crunchbase News (RSS) - Blog/news, NOT the paid database
 * - VentureBeat (RSS) - Enterprise tech + AI funding
 * - Hacker News Funding (RSS) - Community-curated funding news
 *
 * Cost: 100% FREE (all RSS feeds)
 * Coverage: US startup ecosystem
 *
 * NOTE: This uses Crunchbase NEWS (free blog), not Crunchbase DATABASE (paid $400+/mo)
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

const US_RSS_FEEDS = [
  {
    name: "TechCrunch Startups",
    url: "https://techcrunch.com/category/startups/feed/",
  },
  {
    name: "TechCrunch Funding",
    url: "https://techcrunch.com/tag/funding/feed/",
  },
  {
    name: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
  },
  {
    name: "VentureBeat",
    url: "https://venturebeat.com/feed/",
  },
  {
    name: "Hacker News Funding",
    url: "https://hnrss.org/newest?q=funding+OR+raises+OR+series",
  },
];

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

interface ParsedDeal {
  companyName: string;
  amount: number | null;
  currency: string;
  stage: string | null;
  investors: string[];
  date: string;
  sector: string | null;
  geography: string;
  url: string;
  source: string;
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

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
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
        source: sourceName,
      });
    }
  }

  return items;
}

function isFundingArticle(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  const fundingKeywords = [
    "raises", "raised", "funding", "investment", "series a", "series b", "series c", "series d",
    "seed round", "pre-seed", "million", "billion", "closes", "secures", "backed", "valued at",
    "funding round", "venture capital", "vc funding", "led by", "round led"
  ];
  return fundingKeywords.some(kw => text.includes(kw));
}

function parseFundingAmount(text: string): { amount: number | null; currency: string } {
  // Billion patterns first
  const billionPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:B|billion)/i,
    /(\d+(?:[.,]\d+)?)\s*billion\s*(?:dollars?|\$)/i,
  ];

  for (const pattern of billionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return { amount: parseFloat(match[1].replace(",", ".")) * 1_000_000_000, currency: "USD" };
    }
  }

  // Million patterns
  const millionPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)\s*(?:M|million)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:M|million)\s*(?:dollars?|\$)/i,
    /(\d+(?:[.,]\d+)?)\s*million/i,
  ];

  for (const pattern of millionPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 50000) {
        return { amount: amount * 1_000_000, currency: "USD" };
      }
    }
  }

  return { amount: null, currency: "USD" };
}

function parseStage(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/series\s*[e-z]/i.test(lowerText)) return "Late Stage";
  if (/series\s*d/i.test(lowerText)) return "Series D";
  if (/series\s*c/i.test(lowerText)) return "Series C";
  if (/series\s*b/i.test(lowerText)) return "Series B";
  if (/series\s*a/i.test(lowerText)) return "Series A";
  if (/pre[\s-]?seed/i.test(lowerText)) return "Pre-seed";
  if (/seed/i.test(lowerText)) return "Seed";
  if (/growth|late[\s-]?stage/i.test(lowerText)) return "Growth";
  if (/ipo|public/i.test(lowerText)) return "IPO";
  return null;
}

function extractCompanyName(title: string): string | null {
  const patterns = [
    // "CompanyName raises $X" pattern
    /^([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures|closes|lands|bags|nabs|gets|announces|scores)/i,
    // "AI startup CompanyName raises..."
    /(?:startup|company)\s+([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures|closes)/i,
    // Patterns with descriptors
    /^(?:Fintech|Healthtech|AI|SaaS|Crypto|Web3)\s+(?:startup\s+)?([A-Z][A-Za-z0-9\s\-\.&]+?)\s+(?:raises|secures)/i,
    // "CompanyName, the/a XYZ startup, raises..."
    /^([A-Z][A-Za-z0-9\-\.&]+),?\s+(?:the|a)\s+[\w\s]+\s+(?:startup|company),?\s+(?:raises|secures)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 50) {
      // Clean up company name
      let name = match[1].trim();
      // Remove trailing articles or prepositions
      name = name.replace(/\s+(the|a|an|in|at|to)$/i, "").trim();
      if (name.length > 1) {
        return name;
      }
    }
  }

  return null;
}

function extractInvestors(text: string): string[] {
  const investors: string[] = [];

  // Known investor patterns
  const patterns = [
    /led by\s+([A-Z][A-Za-z0-9\s,&]+?)(?:\.|,\s*(?:with|along)|$)/gi,
    /backed by\s+([A-Z][A-Za-z0-9\s,&]+?)(?:\.|,|$)/gi,
    /from\s+([A-Z][A-Za-z0-9\s,&]+?)\s+(?:and|,)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const names = match[1].split(/,|&|\band\b/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
      investors.push(...names);
    }
  }

  // Known VC names
  const knownVCs = [
    "Sequoia", "Andreessen Horowitz", "a16z", "Accel", "Benchmark", "Greylock",
    "Kleiner Perkins", "NEA", "Lightspeed", "GGV", "Index Ventures", "Bessemer",
    "Insight Partners", "Tiger Global", "SoftBank", "General Catalyst", "Founders Fund",
    "Y Combinator", "Khosla Ventures", "First Round", "Union Square", "Spark Capital"
  ];

  for (const vc of knownVCs) {
    if (text.includes(vc) && !investors.includes(vc)) {
      investors.push(vc);
    }
  }

  return [...new Set(investors)].slice(0, 5);
}

function extractGeography(text: string): string {
  const lowerText = text.toLowerCase();

  // US cities/states
  const usLocations = [
    /san francisco|sf|bay area/i,
    /new york|nyc|manhattan/i,
    /los angeles|la\b/i,
    /boston/i,
    /seattle/i,
    /austin/i,
    /chicago/i,
    /miami/i,
    /denver/i,
    /atlanta/i,
    /silicon valley/i,
  ];

  for (const pattern of usLocations) {
    if (pattern.test(lowerText)) {
      return "USA";
    }
  }

  // Default to USA for these sources
  return "USA";
}

function detectSector(text: string): string | null {
  const lowerText = text.toLowerCase();
  const sectors: [RegExp, string][] = [
    [/fintech|payment|banking|finance|neobank|lending/i, "fintech"],
    [/healthtech|health|medical|biotech|pharma|healthcare/i, "healthtech"],
    [/saas|software|cloud|enterprise/i, "saas"],
    [/\bai\b|artificial intelligence|machine learning|llm|gpt/i, "ai"],
    [/cybersecurity|security|infosec/i, "cybersecurity"],
    [/greentech|climate|cleantech|energy|solar|ev\b/i, "greentech"],
    [/edtech|education|learning/i, "edtech"],
    [/foodtech|food|restaurant|delivery/i, "foodtech"],
    [/proptech|real estate/i, "proptech"],
    [/crypto|blockchain|web3|defi|nft/i, "crypto"],
    [/ecommerce|e-commerce|retail|dtc/i, "ecommerce"],
    [/hr\s?tech|recruiting|talent/i, "hrtech"],
    [/logistics|supply chain|shipping|freight/i, "logistics"],
    [/mobility|autonomous|transportation/i, "mobility"],
    [/gaming|games|esports/i, "gaming"],
    [/devtools|developer|infrastructure/i, "devtools"],
  ];

  for (const [pattern, sector] of sectors) {
    if (pattern.test(lowerText)) {
      return sector;
    }
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
  const investors = extractInvestors(fullText);

  return {
    companyName,
    amount,
    currency,
    stage,
    investors,
    date: new Date(item.pubDate).toISOString(),
    sector,
    geography,
    url: item.link,
    source: item.source,
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchRSS(url: string, sourceName: string): Promise<RSSItem[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "FullInvest/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[US Funding] HTTP ${response.status} for ${sourceName}`);
      return [];
    }

    const xml = await response.text();
    return parseRSSXml(xml, sourceName);
  } catch (error) {
    console.warn(`[US Funding] Error fetching ${sourceName}:`, error);
    return [];
  }
}

async function fetchAllFeeds(): Promise<RSSItem[]> {
  const allItems: RSSItem[] = [];

  const feedPromises = US_RSS_FEEDS.map(feed =>
    fetchRSS(feed.url, feed.name)
  );

  const results = await Promise.all(feedPromises);
  for (const items of results) {
    allItems.push(...items);
  }

  console.log(`[US Funding] Fetched ${allItems.length} items from ${US_RSS_FEEDS.length} feeds`);
  return allItems;
}

async function getDeals(forceRefresh = false): Promise<ParsedDeal[]> {
  const now = Date.now();

  if (!forceRefresh && cachedDeals.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return cachedDeals;
  }

  console.log("[US Funding] Fetching deals...");
  const items = await fetchAllFeeds();

  const deals: ParsedDeal[] = [];
  const seenCompanies = new Set<string>();

  for (const item of items) {
    const parsed = parseRSSItem(item);
    if (parsed && parsed.amount) {
      // Deduplicate by company name
      const key = parsed.companyName.toLowerCase();
      if (!seenCompanies.has(key)) {
        seenCompanies.add(key);
        deals.push(parsed);
      }
    }
  }

  deals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cachedDeals = deals;
  lastFetchTime = now;

  console.log(`[US Funding] Parsed ${deals.length} unique deals`);
  return deals;
}

// ============================================================================
// CONNECTOR
// ============================================================================

const usFundingSource: DataSource = {
  type: "news_api",
  name: "US Funding Sources",
  url: "https://techcrunch.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

export const usFundingConnector: Connector = {
  name: "US Funding",
  type: "news_api",

  isConfigured: () => true,

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    const deals = await getDeals();

    let filtered = deals;
    if (query.companyName) {
      const nameLower = query.companyName.toLowerCase();
      filtered = deals.filter(d => d.companyName.toLowerCase().includes(nameLower));
    }

    if (query.sector) {
      const sectorLower = query.sector.toLowerCase();
      filtered = filtered.length > 0 ? filtered : deals.filter(d => d.sector === sectorLower);
    }

    return filtered.slice(0, 20).map(deal => ({
      title: `${deal.companyName} raises $${deal.amount ? (deal.amount / 1_000_000).toFixed(1) : "?"}M`,
      description: `${deal.stage || "Funding"} | ${deal.sector || "Tech"} | Investors: ${deal.investors.slice(0, 3).join(", ") || "Undisclosed"}`,
      url: deal.url,
      source: deal.source,
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

    if (query.stage) {
      const stageLower = query.stage.toLowerCase();
      filtered = filtered.filter(d =>
        d.stage?.toLowerCase().includes(stageLower)
      );
    }

    if (filtered.length === 0) {
      filtered = deals;
    }

    return filtered
      .filter(d => d.amount !== null)
      .slice(0, 25)
      .map(deal => ({
        companyName: deal.companyName,
        sector: deal.sector || query.sector || "tech",
        stage: deal.stage || "Unknown",
        fundingAmount: deal.amount!,
        fundingDate: deal.date,
        investors: deal.investors,
        geography: deal.geography,
        source: { ...usFundingSource, name: deal.source },
      }));
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export async function getUSDeals(limit = 50): Promise<ParsedDeal[]> {
  const deals = await getDeals();
  return deals.slice(0, limit);
}

export async function searchUSFunding(companyName: string): Promise<ParsedDeal | null> {
  const deals = await getDeals();
  return deals.find(d => d.companyName.toLowerCase().includes(companyName.toLowerCase())) || null;
}

export async function getUSFundingBySector(sector: string): Promise<ParsedDeal[]> {
  const deals = await getDeals();
  return deals.filter(d => d.sector === sector.toLowerCase());
}
