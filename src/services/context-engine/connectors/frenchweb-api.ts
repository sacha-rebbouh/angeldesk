/**
 * FrenchWeb API Connector
 *
 * Fetches REAL funding data from FrenchWeb.fr WordPress API.
 * This replaces static data with live funding rounds from French tech ecosystem.
 *
 * Source: https://www.frenchweb.fr/wp-json/wp/v2/posts
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
  content?: { rendered: string };
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
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://www.frenchweb.fr/wp-json/wp/v2";

// Category IDs from FrenchWeb
const CATEGORIES = {
  INVESTISSEMENTS: 12024,
  ACQUISITION: 12023,
  FW_INVEST: 30453,
};

// Cache - stores ALL historical funding data
let cachedDeals: ParsedFundingRound[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours (data doesn't change that fast)
const MAX_PAGES = 100; // Fetch up to 100 pages = 10,000 posts max
const PER_PAGE = 100; // Max allowed by WordPress API

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Clean HTML entities from text
 */
function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&#8212;/g, "—")
    .replace(/&mdash;/g, "—")
    .replace(/&#8230;/g, "...")
    .replace(/&hellip;/g, "...")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#8364;/g, "€")
    .replace(/&euro;/g, "€")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Check if title is a non-funding article (analysis, opinion, etc.)
 */
function isNonFundingArticle(title: string): boolean {
  const skipPatterns = [
    /^Ask\s+[aA]\s+VC/i,
    /^Question\s+à\s+un\s+VC/i,
    /^Ce\s+que\s+les\s+levées/i,
    /^Quelles\s+tendances/i,
    /^Comment\s+un\s+marché/i,
    /^IPO\s+tech/i,
    /^Financer\s+la\s+deeptech/i,
    /pourquoi\s+les\s+startups\s+se\s+tournent/i,
    /l['']analyse\s+de/i,
    /conclusion\s+du\s+rapport/i,
  ];

  return skipPatterns.some(pattern => pattern.test(title));
}

/**
 * Parse funding amount from text
 * Handles: "€37.7M", "37,7 millions d'euros", "10M€", "$15M", "15 millions de dollars", etc.
 */
function parseFundingAmount(text: string): { amount: number | null; currency: string } {
  // Clean the text first
  const cleanText = cleanHtmlEntities(text);

  // Euro patterns
  const euroPatterns = [
    // €37.7M, €37,7M, € 37.7 M
    /€\s*(\d+(?:[.,]\d+)?)\s*M/i,
    // 37.7M€, 37,7M€
    /(\d+(?:[.,]\d+)?)\s*M€/i,
    // 37.7 millions d'euros, 37,7 millions d'euros
    /(\d+(?:[.,]\d+)?)\s*millions?\s*(?:d['']euros?|€|EUR|euros?)/i,
    // lève 37.7 millions, lève 37,7 millions (assumes EUR)
    /lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    // levé 37.7 millions
    /levé\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    // qui lève 37.7 millions
    /qui\s+lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    // a levé 37.7 millions
    /a\s+levé\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    // et lève 37.7 millions
    /et\s+lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    // raised €37.7 million (EUR)
    /raised?\s+€\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
    // mobilise 100 millions
    /mobilise\s+(\d+(?:[.,]\d+)?)\s*millions?/i,
    // abonde de 4.5 millions
    /abonde\s+de\s+(\d+(?:[.,]\d+)?)\s*millions?/i,
  ];

  for (const pattern of euroPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 50000) { // Sanity check: 0 < amount < 50B
        return { amount: amount * 1_000_000, currency: "EUR" };
      }
    }
  }

  // Dollar patterns
  const dollarPatterns = [
    // $37.7M, $ 37.7 M
    /\$\s*(\d+(?:[.,]\d+)?)\s*M/i,
    // 37.7M$
    /(\d+(?:[.,]\d+)?)\s*M\$/i,
    // 37.7 millions de dollars, 37,7 million dollars
    /(\d+(?:[.,]\d+)?)\s*millions?\s*(?:de\s+)?dollars?/i,
    // raised $37.7 million (USD)
    /raised?\s+\$\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
  ];

  for (const pattern of dollarPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 50000) {
        return { amount: amount * 1_000_000, currency: "USD" };
      }
    }
  }

  // Generic millions pattern (default to EUR for French context)
  const genericMatch = cleanText.match(/(\d+(?:[.,]\d+)?)\s*millions?/i);
  if (genericMatch) {
    const amount = parseFloat(genericMatch[1].replace(",", "."));
    if (amount > 0 && amount < 50000) {
      return { amount: amount * 1_000_000, currency: "EUR" };
    }
  }

  // Try thousands (k€)
  const kPattern = /(\d+(?:[.,]\d+)?)\s*(?:k€|K€|000\s*€)/i;
  const kMatch = cleanText.match(kPattern);
  if (kMatch) {
    const amount = parseFloat(kMatch[1].replace(",", "."));
    if (amount > 0) {
      return { amount: amount * 1000, currency: "EUR" };
    }
  }

  return { amount: null, currency: "EUR" };
}

/**
 * Parse funding stage from text
 */
function parseFundingStage(text: string): string | null {
  const cleanText = cleanHtmlEntities(text);

  const stagePatterns: [RegExp, string][] = [
    // Bracket tags first (most reliable)
    [/\[SERI?E\s*([A-D])\]/i, "Series $1"],
    [/\[S[ée]rie\s*([A-D])\]/i, "Series $1"],
    [/\[SCALE\]/i, "Growth"],
    [/\[GROWTH\]/i, "Growth"],
    [/\[SEED\]/i, "Seed"],
    [/\[PRE[\s\-]?SEED\]/i, "Pre-seed"],
    [/\[BRIDGE\]/i, "Bridge"],
    [/\[IPO\]/i, "IPO"],
    [/\[EARLY\s*STAGE\]/i, "Early Stage"],
    [/\[LATE\s*STAGE\]/i, "Late Stage"],
    // Without brackets
    [/series\s*([A-D])\b/i, "Series $1"],
    [/s[ée]rie\s*([A-D])\b/i, "Series $1"],
    [/\bseed\b/i, "Seed"],
    [/\bamorçage\b/i, "Seed"],
    [/\bpre[\s\-]?seed\b/i, "Pre-seed"],
    [/\bgrowth\b/i, "Growth"],
    [/\bextension\b/i, "Extension"],
    [/\bbridge\b/i, "Bridge"],
    [/\bipo\b/i, "IPO"],
    [/\blate\s*stage\b/i, "Late Stage"],
    [/\bearly\s*stage\b/i, "Early Stage"],
  ];

  for (const [pattern, stage] of stagePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      // Handle dynamic replacement for Series X
      if (stage.includes("$1") && match[1]) {
        return stage.replace("$1", match[1].toUpperCase());
      }
      return stage;
    }
  }

  return null;
}

/**
 * Extract company name from title
 * Multiple patterns to catch different article formats
 */
function extractCompanyName(title: string): string | null {
  const cleanTitle = cleanHtmlEntities(title);

  // Skip non-funding articles
  if (isNonFundingArticle(cleanTitle)) {
    return null;
  }

  // TAG pattern regex - matches [SERIE A], [Série B], [SEED], [SCALE], [GROWTH], [IPO], [EARLY STAGE], [PRE SEED], etc.
  const tagRegex = /^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]/i;

  // Pattern 1: "[TAG] X millions pour COMPANY" - amount before company (direct company name)
  // Examples: "[SERIE A] 11,3 millions d'euros pour HERO", "[Série B] 25 millions d'euros pour STOIK"
  const tagAmountPourMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+[\d,\.]+\s*millions?[^]*?pour\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\.\-&]+)(?:\s+(?:afin|et|qui|en|à|aux|optimise|veut|pour|une|,)|\.|,|\s*$)/i);
  if (tagAmountPourMatch && tagAmountPourMatch[1].length >= 1 && tagAmountPourMatch[1].length < 35) {
    let company = tagAmountPourMatch[1].trim();
    // Remove trailing dot if present (e.g., "MISTRAL.AI." -> "MISTRAL.AI")
    company = company.replace(/\.$/, "").trim();
    if (company.length >= 1) {
      return company;
    }
  }

  // Pattern 1b: "[TAG] X millions pour la startup/l'edtech COMPANY" - with descriptor before company
  // Example: "[SEED] 6 millions d'euros pour l'edtech AUGMENT"
  // Example: "[SERIE A] 10 millions d'euros pour le service de consigne de la startup LE FOURGON"
  // Note: Look for ALL-CAPS company name after descriptor keywords
  const tagPourDescMatch = cleanTitle.match(/(?:la\s+startup|l['']?edtech|l['']?fintech|l['']?healthtech|la\s+plateforme|la\s+société)\s+(?:[a-zà-ÿ\s\-\'\"]*\s+)?([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\s]+)(?:\s*$|\.)/);
  if (tagPourDescMatch && tagPourDescMatch[1].length >= 2 && tagPourDescMatch[1].length < 40) {
    return tagPourDescMatch[1].trim();
  }

  // Pattern 2: "[TAG] COMPANY lève/veut/met/étend/voit..." - company right after tag
  // Examples: "[SERIE A] HERO lève...", "[Série B] STOIK lève...", "[Série A] Aqemia étend..."
  const bracketCompanyMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\s\-\.&]*?)(?:\s+(?:lève|veut|met|donne|a levé|annonce|boucle|sécurise|étend|finalise|voit)|,|\s*$)/i);
  if (bracketCompanyMatch && bracketCompanyMatch[1].length >= 1 && bracketCompanyMatch[1].length < 45) {
    return bracketCompanyMatch[1].trim();
  }

  // Pattern 3: "COMPANY lève/raises/annonce..." at start (no tag)
  const leveMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:lève|raises|annonce|boucle|sécurise|mobilise|a levé|vient de lever)/i);
  if (leveMatch && leveMatch[1].length > 1 && leveMatch[1].length < 45) {
    return leveMatch[1].trim();
  }

  // Pattern 4: "...avec COMPANY qui lève..." - company after "avec"
  const avecMatch = cleanTitle.match(/avec\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)\s+qui\s+(?:lève|a levé)/i);
  if (avecMatch && avecMatch[1].length > 1) {
    return avecMatch[1].trim();
  }

  // Pattern 5: "Topic, COMPANY veut/lève..." - company after comma
  const commaMatch = cleanTitle.match(/^[^,]+,\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:veut|lève|annonce|a levé|cherche|vient de)/i);
  if (commaMatch && commaMatch[1].length > 1 && commaMatch[1].length < 45) {
    return commaMatch[1].trim();
  }

  // Pattern 6: "COMPANY veut...et lève" - company that does something then raises
  const veutLeveMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:veut|cherche|souhaite)[^]*?(?:et\s+lève|lève)/i);
  if (veutLeveMatch && veutLeveMatch[1].length > 1 && veutLeveMatch[1].length < 45) {
    return veutLeveMatch[1].trim();
  }

  // Pattern 7: "France 2030 abonde...COMPANY, qui a levé" - government funding mentions
  const abondeMatch = cleanTitle.match(/abonde[^,]*\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+),?\s+qui\s+a\s+levé/i);
  if (abondeMatch && abondeMatch[1].length > 1) {
    return abondeMatch[1].trim();
  }

  // Pattern 8: "COMPANY, description qui/et lève..." - comma after company name
  // Example: "DeepIP, l'IA embarquée dans Word qui transforme..., lève 15 millions"
  const companyCommaMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+),\s+[^,]+(?:,\s+)?(?:lève|qui\s+lève|et\s+lève|a levé)/i);
  if (companyCommaMatch && companyCommaMatch[1].length > 1 && companyCommaMatch[1].length < 35) {
    return companyCommaMatch[1].trim();
  }

  // Pattern 9: "COMPANY: description" - colon format
  const colonMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?):/);
  if (colonMatch && colonMatch[1].length > 1 && colonMatch[1].length < 35) {
    return colonMatch[1].trim();
  }

  // Pattern 10: "...met la main sur COMPANY..." - acquisition
  const acquisitionMatch = cleanTitle.match(/met\s+la\s+main\s+sur\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)/i);
  if (acquisitionMatch && acquisitionMatch[1].length > 1) {
    return acquisitionMatch[1].trim();
  }

  // Pattern 11: "COMPANY / COMPANY2 / ..." - multiple companies (take first)
  const slashMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s*\/\s*[A-ZÀ-Ÿ]/);
  if (slashMatch && slashMatch[1].length > 1 && slashMatch[1].length < 35) {
    return slashMatch[1].trim();
  }

  // Pattern 12: "X millions pour COMPANY" without tag
  const millionsPourMatch = cleanTitle.match(/[\d,\.]+\s*millions?[^]*?(?:pour|chez)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+et\s|\s+qui\s|\s+afin\s|\s*$)/i);
  if (millionsPourMatch && millionsPourMatch[1].length > 1 && millionsPourMatch[1].length < 45) {
    let company = millionsPourMatch[1].trim();
    company = company.replace(/\s+(le|la|les|du|de|des|l')$/i, "").trim();
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(company) && company.length > 1) {
      return company;
    }
  }

  // Pattern 13: "COMPANY finalise/clôture/conclut une levée"
  const finaliseMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:finalise|clôture|conclut|réalise)[^]*?(?:levée|tour|round)/i);
  if (finaliseMatch && finaliseMatch[1].length > 1 && finaliseMatch[1].length < 45) {
    return finaliseMatch[1].trim();
  }

  // Pattern 14: "Levée de fonds pour COMPANY" or "Tour de table pour COMPANY"
  const leveePourMatch = cleanTitle.match(/(?:levée|tour|round)[^]*?pour\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+qui|\s*$)/i);
  if (leveePourMatch && leveePourMatch[1].length > 1 && leveePourMatch[1].length < 45) {
    let company = leveePourMatch[1].trim();
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(company)) {
      return company;
    }
  }

  // Pattern 15: Try to extract company from "pour COMPANY" anywhere in title (fallback)
  const pourMatch = cleanTitle.match(/pour\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+et\s|\s+qui\s|\s+pour\s|\s+afin\s|\s*$)/i);
  if (pourMatch && pourMatch[1].length > 1 && pourMatch[1].length < 45) {
    // Make sure it's not "pour les" or "pour des" etc
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(pourMatch[1])) {
      return pourMatch[1].trim();
    }
  }

  // Pattern 16: "chez COMPANY" - company mentioned with "chez"
  const chezMatch = cleanTitle.match(/chez\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)/i);
  if (chezMatch && chezMatch[1].length > 1 && chezMatch[1].length < 35) {
    return chezMatch[1].trim();
  }

  // Pattern 17 (FALLBACK): Find ALL-CAPS company name (4+ chars) at end of title
  // Example: "[GROWTH] 300 millions de plus pour développer ELECTRA en Europe"
  // Only use this if no other pattern matched - it's less reliable
  const allCapsMatch = cleanTitle.match(/\s([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\.\-&]{3,})(?:\s+(?:en|aux?|à|et|qui)\s|\s*[,\.]|\s*$)/);
  if (allCapsMatch && allCapsMatch[1].length >= 4 && allCapsMatch[1].length < 30) {
    const word = allCapsMatch[1];
    // Exclude common words that aren't company names
    if (!/^(SERIE|SEED|SCALE|GROWTH|IPO|BRIDGE|EUR|USD|BPI|FRANCE|EUROPE|SALESFORCE|BNP|PARIBAS|AMAZON|GOOGLE|MICROSOFT)$/i.test(word)) {
      return word.trim();
    }
  }

  return null;
}

/**
 * Extract investors from text
 */
function extractInvestors(text: string): string[] {
  const investors: string[] = [];

  // Known investor patterns
  const investorPatterns = [
    /(?:led by|mené par|avec)\s+([A-Za-z0-9\s,&]+?)(?:\.|,\s*avec|$)/gi,
    /investisseurs?[:\s]+([A-Za-z0-9\s,&]+?)(?:\.|$)/gi,
    /(?:Bpifrance|Eurazeo|Partech|Alven|Elaia|Idinvest|Serena|Breega)[A-Za-z\s]*/gi,
  ];

  for (const pattern of investorPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const investorText = match[1] || match[0];
      const names = investorText.split(/,|&|et\s/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
      investors.push(...names);
    }
  }

  // Dedupe
  return [...new Set(investors)].slice(0, 5);
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
    [/ia|intelligence artificielle|machine learning|ai\b/i, "ai"],
    [/cyber|sécurité|security/i, "cybersecurity"],
    [/greentech|climat|énergie|cleantech/i, "greentech"],
    [/edtech|éducation|formation/i, "edtech"],
    [/foodtech|alimentation|agritech/i, "foodtech"],
    [/proptech|immobilier/i, "proptech"],
    [/hrtech|rh|recrutement/i, "hrtech"],
    [/legaltech|juridique/i, "legaltech"],
  ];

  for (const [pattern, sector] of sectorKeywords) {
    if (pattern.test(text)) {
      return sector;
    }
  }

  return null;
}

/**
 * Parse a WordPress post into funding round data
 */
function parsePost(post: WPPost): ParsedFundingRound | null {
  const title = post.title.rendered;
  const excerpt = post.excerpt.rendered.replace(/<[^>]+>/g, "");
  const fullText = `${title} ${excerpt}`;

  const companyName = extractCompanyName(title);
  if (!companyName) return null;

  const { amount, currency } = parseFundingAmount(fullText);
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
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch a single page of funding posts from FrenchWeb API
 */
async function fetchFundingPage(page: number): Promise<{ posts: WPPost[]; totalPages: number }> {
  const url = `${API_BASE}/posts?categories=${CATEGORIES.INVESTISSEMENTS}&per_page=${PER_PAGE}&page=${page}&_fields=id,date,title,excerpt,link`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FullInvest/1.0",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[FrenchWeb API] HTTP ${response.status} on page ${page}`);
      return { posts: [], totalPages: 0 };
    }

    const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "0", 10);
    const posts = await response.json();

    return { posts, totalPages };
  } catch (error) {
    console.error("[FrenchWeb API] Fetch error:", error);
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
  console.log(`[FrenchWeb API] Total pages: ${totalPages}, fetching ${pagesToFetch} pages...`);

  // Fetch remaining pages in batches to avoid overwhelming the server
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

    // Small delay between batches to be respectful
    if (endPage < pagesToFetch) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[FrenchWeb API] Fetched ${allPosts.length} total posts`);
  return allPosts;
}

/**
 * Get cached or fresh funding deals
 */
async function getFundingDeals(forceRefresh = false): Promise<ParsedFundingRound[]> {
  const now = Date.now();

  if (!forceRefresh && cachedDeals.length > 0 && now - lastFetchTime < CACHE_TTL) {
    console.log(`[FrenchWeb API] Using cache (${cachedDeals.length} deals)`);
    return cachedDeals;
  }

  console.log("[FrenchWeb API] Fetching ALL historical funding data...");
  const posts = await fetchAllFundingPosts();

  const deals: ParsedFundingRound[] = [];
  for (const post of posts) {
    const parsed = parsePost(post);
    if (parsed && parsed.amount) {
      deals.push(parsed);
    }
  }

  // Sort by date (most recent first)
  deals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cachedDeals = deals;
  lastFetchTime = now;

  console.log(`[FrenchWeb API] Parsed ${deals.length} funding rounds from ${posts.length} posts`);
  return deals;
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

const frenchWebSource: DataSource = {
  type: "news_api",
  name: "FrenchWeb API",
  url: "https://www.frenchweb.fr",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9,
};

export const frenchWebApiConnector: Connector = {
  name: "FrenchWeb API",
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

    // Filter by sector if provided
    if (query.sector && filtered.length === deals.length) {
      filtered = deals.filter(d =>
        d.sector === query.sector?.toLowerCase()
      );
    }

    return filtered.slice(0, 20).map(deal => ({
      title: `${deal.companyName} lève ${deal.amount ? `€${(deal.amount / 1_000_000).toFixed(1)}M` : "un montant non divulgué"}`,
      description: `${deal.stage || "Levée de fonds"} - Investisseurs: ${deal.investors.join(", ") || "Non communiqués"}`,
      url: deal.url,
      source: "FrenchWeb",
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
        geography: "France",
        source: frenchWebSource,
      }));
  },
};

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Get all recent French funding rounds
 */
export async function getRecentFrenchFunding(limit: number = 20): Promise<ParsedFundingRound[]> {
  const deals = await getFundingDeals();
  return deals.slice(0, limit);
}

/**
 * Search funding by company name
 */
export async function searchFundingByCompany(companyName: string): Promise<ParsedFundingRound | null> {
  const deals = await getFundingDeals();
  const companyLower = companyName.toLowerCase();
  return deals.find(d => d.companyName.toLowerCase().includes(companyLower)) || null;
}

/**
 * Get funding stats by sector
 */
export async function getFundingBySector(sector: string): Promise<{
  deals: ParsedFundingRound[];
  totalAmount: number;
  averageAmount: number;
  count: number;
}> {
  const deals = await getFundingDeals();
  const sectorDeals = deals.filter(d => d.sector === sector.toLowerCase());

  const totalAmount = sectorDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

  return {
    deals: sectorDeals,
    totalAmount,
    averageAmount: sectorDeals.length > 0 ? totalAmount / sectorDeals.length : 0,
    count: sectorDeals.length,
  };
}
