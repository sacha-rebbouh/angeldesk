/**
 * Societe.com Connector
 *
 * Provides free French company data via web scraping:
 * - Basic company info (SIREN, address, activity)
 * - Financial data (CA, resultat, effectifs)
 * - Directors and legal representatives
 *
 * Source: https://www.societe.com
 * Cost: FREE (public data, scraping)
 * Complement to Pappers for data not requiring API key
 *
 * Note: This scrapes public data. Respect robots.txt and rate limits.
 */

import type {
  Connector,
  ConnectorQuery,
  Competitor,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface SocieteComCompany {
  siren: string;
  name: string;
  legalForm?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  activity?: string;
  nafCode?: string;
  capital?: number;
  creationDate?: string;
  employees?: string; // "10 à 19 salariés"
  revenue?: number; // Chiffre d'affaires
  result?: number; // Résultat
  directors?: {
    name: string;
    role: string;
  }[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = "https://www.societe.com";
const USER_AGENT = "Mozilla/5.0 (compatible; FullInvestBot/1.0; +https://fullinvest.com)";

// Rate limiting: max 1 request per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function rateLimitedFetch(url: string): Promise<string | null> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`[Societe.com] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error("[Societe.com] Fetch error:", error);
    return null;
  }
}

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function parseEmployees(text: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseRevenue(text: string | null): number | undefined {
  if (!text) return undefined;
  // Handle formats like "1 234 567 €" or "1.2 M€"
  const cleaned = text.replace(/\s/g, "").replace("€", "");
  if (cleaned.includes("M")) {
    return parseFloat(cleaned.replace("M", "")) * 1_000_000;
  }
  if (cleaned.includes("K")) {
    return parseFloat(cleaned.replace("K", "")) * 1_000;
  }
  return parseInt(cleaned, 10) || undefined;
}

const societeComSource: DataSource = {
  type: "crunchbase",
  name: "Societe.com",
  url: "https://www.societe.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85, // Public data, generally accurate
};

// ============================================================================
// SCRAPING FUNCTIONS
// ============================================================================

/**
 * Search for companies by name
 */
export async function searchCompanies(query: string): Promise<{
  siren: string;
  name: string;
  city?: string;
}[]> {
  const searchUrl = `${BASE_URL}/cgi-bin/search?champs=${encodeURIComponent(query)}`;
  const html = await rateLimitedFetch(searchUrl);

  if (!html) return [];

  const results: { siren: string; name: string; city?: string }[] = [];

  // Extract company links from search results
  // Pattern: /societe/company-name-123456789.html
  const companyPattern = /href="\/societe\/([^"]+)-(\d{9})\.html"[^>]*>([^<]+)</g;
  let match;

  while ((match = companyPattern.exec(html)) !== null && results.length < 10) {
    results.push({
      siren: match[2],
      name: match[3].trim(),
    });
  }

  return results;
}

/**
 * Get company details by SIREN
 */
export async function getCompanyBySiren(siren: string): Promise<SocieteComCompany | null> {
  // First, search to get the company URL slug
  const searchUrl = `${BASE_URL}/cgi-bin/search?champs=${siren}`;
  const searchHtml = await rateLimitedFetch(searchUrl);

  if (!searchHtml) return null;

  // Find the company page URL
  const urlMatch = searchHtml.match(/href="(\/societe\/[^"]+\.html)"/);
  if (!urlMatch) return null;

  const companyUrl = `${BASE_URL}${urlMatch[1]}`;
  const html = await rateLimitedFetch(companyUrl);

  if (!html) return null;

  return parseCompanyPage(html, siren);
}

/**
 * Parse company page HTML
 */
function parseCompanyPage(html: string, siren: string): SocieteComCompany | null {
  const company: SocieteComCompany = { siren, name: "" };

  // Company name - usually in h1 or title
  const nameMatch = html.match(/<h1[^>]*>([^<]+)</);
  company.name = nameMatch ? nameMatch[1].trim() : "";

  if (!company.name) {
    const titleMatch = html.match(/<title>([^<]+)/);
    company.name = titleMatch ? titleMatch[1].split("-")[0].trim() : "";
  }

  // Address
  const addressMatch = html.match(/itemprop="streetAddress"[^>]*>([^<]+)</);
  company.address = addressMatch ? addressMatch[1].trim() : undefined;

  const postalMatch = html.match(/itemprop="postalCode"[^>]*>([^<]+)</);
  company.postalCode = postalMatch ? postalMatch[1].trim() : undefined;

  const cityMatch = html.match(/itemprop="addressLocality"[^>]*>([^<]+)</);
  company.city = cityMatch ? cityMatch[1].trim() : undefined;

  // Activity / NAF
  const activityMatch = html.match(/Activité[^:]*:\s*<[^>]+>([^<]+)</i);
  company.activity = activityMatch ? activityMatch[1].trim() : undefined;

  const nafMatch = html.match(/Code NAF[^:]*:\s*<[^>]+>(\d{4}[A-Z]?)</i);
  company.nafCode = nafMatch ? nafMatch[1].trim() : undefined;

  // Capital
  const capitalMatch = html.match(/Capital[^:]*:\s*<[^>]+>([\d\s]+)\s*€/i);
  if (capitalMatch) {
    company.capital = parseInt(capitalMatch[1].replace(/\s/g, ""), 10);
  }

  // Creation date
  const creationMatch = html.match(/(?:Date de création|Création)[^:]*:\s*<[^>]+>(\d{2}\/\d{2}\/\d{4})</i);
  company.creationDate = creationMatch ? creationMatch[1] : undefined;

  // Employees
  const employeesMatch = html.match(/Effectif[^:]*:\s*<[^>]+>([^<]+)</i);
  company.employees = employeesMatch ? employeesMatch[1].trim() : undefined;

  // Financial data (CA, Résultat)
  const caMatch = html.match(/Chiffre d'affaires[^:]*:\s*<[^>]+>([\d\s,\.]+(?:K|M)?)\s*€/i);
  company.revenue = parseRevenue(caMatch ? caMatch[1] : null);

  const resultMatch = html.match(/Résultat[^:]*:\s*<[^>]+>([-\d\s,\.]+(?:K|M)?)\s*€/i);
  company.result = parseRevenue(resultMatch ? resultMatch[1] : null);

  // Directors
  const directors: { name: string; role: string }[] = [];
  const directorPattern = /class="[^"]*dirigeant[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<[\s\S]*?<span[^>]*>([^<]+)</gi;
  let dirMatch;

  while ((dirMatch = directorPattern.exec(html)) !== null && directors.length < 5) {
    directors.push({
      name: dirMatch[1].trim(),
      role: dirMatch[2].trim(),
    });
  }

  if (directors.length > 0) {
    company.directors = directors;
  }

  return company.name ? company : null;
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const societeComConnector: Connector = {
  name: "Societe.com",
  type: "crunchbase",

  isConfigured: () => true, // Always available (scraping)

  getCompetitors: async (query: ConnectorQuery): Promise<Competitor[]> => {
    if (!query.companyName && !query.sector) return [];

    const searchTerm = query.sector || query.companyName || "";
    const searchResults = await searchCompanies(searchTerm);

    const competitors: Competitor[] = [];

    for (const result of searchResults.slice(0, 5)) {
      // Skip the company itself
      if (query.companyName &&
          result.name.toLowerCase().includes(query.companyName.toLowerCase())) {
        continue;
      }

      const details = await getCompanyBySiren(result.siren);

      if (details) {
        competitors.push({
          name: details.name,
          description: details.activity,
          website: undefined,
          stage: "Unknown",
          positioning: details.activity || "N/A",
          overlap: "adjacent",
          estimatedRevenue: details.revenue,
          estimatedEmployees: parseEmployees(details.employees || null),
          source: {
            ...societeComSource,
            retrievedAt: new Date().toISOString(),
          },
        });
      }
    }

    return competitors;
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// ============================================================================

/**
 * Enrich a French company with Societe.com data
 * Use this as a complement to Pappers when API key is not available
 */
export async function enrichFromSocieteCom(companyName: string): Promise<{
  found: boolean;
  siren?: string;
  name?: string;
  address?: string;
  activity?: string;
  employees?: string;
  revenue?: number;
  result?: number;
  capital?: number;
  creationDate?: string;
  directors?: { name: string; role: string }[];
} | null> {
  const searchResults = await searchCompanies(companyName);

  if (searchResults.length === 0) {
    return { found: false };
  }

  // Find best match
  const nameLower = companyName.toLowerCase();
  const exactMatch = searchResults.find(r =>
    r.name.toLowerCase() === nameLower
  );
  const partialMatch = searchResults.find(r =>
    r.name.toLowerCase().includes(nameLower) ||
    nameLower.includes(r.name.toLowerCase())
  );

  const match = exactMatch || partialMatch || searchResults[0];
  const details = await getCompanyBySiren(match.siren);

  if (!details) {
    return { found: false };
  }

  return {
    found: true,
    siren: details.siren,
    name: details.name,
    address: [details.address, details.postalCode, details.city]
      .filter(Boolean)
      .join(", ") || undefined,
    activity: details.activity,
    employees: details.employees,
    revenue: details.revenue,
    result: details.result,
    capital: details.capital,
    creationDate: details.creationDate,
    directors: details.directors,
  };
}

/**
 * Compare a company's financials with Societe.com data
 * Useful for validating claims in pitch decks
 */
export async function validateFinancials(
  companyName: string,
  claimedRevenue?: number,
  claimedEmployees?: number
): Promise<{
  validated: boolean;
  discrepancies: string[];
  actualData?: {
    revenue?: number;
    employees?: string;
  };
}> {
  const data = await enrichFromSocieteCom(companyName);

  if (!data || !data.found) {
    return {
      validated: false,
      discrepancies: ["Company not found on Societe.com"],
    };
  }

  const discrepancies: string[] = [];

  // Check revenue discrepancy (allow 20% tolerance)
  if (claimedRevenue && data.revenue) {
    const revenueDiff = Math.abs(claimedRevenue - data.revenue) / data.revenue;
    if (revenueDiff > 0.2) {
      discrepancies.push(
        `Revenue discrepancy: claimed ${claimedRevenue}€ vs official ${data.revenue}€ (${(revenueDiff * 100).toFixed(0)}% diff)`
      );
    }
  }

  // Check employee count discrepancy
  if (claimedEmployees && data.employees) {
    const actualEmployees = parseEmployees(data.employees);
    if (actualEmployees) {
      const empDiff = Math.abs(claimedEmployees - actualEmployees) / actualEmployees;
      if (empDiff > 0.3) {
        discrepancies.push(
          `Employee discrepancy: claimed ${claimedEmployees} vs official "${data.employees}"`
        );
      }
    }
  }

  return {
    validated: discrepancies.length === 0,
    discrepancies,
    actualData: {
      revenue: data.revenue,
      employees: data.employees,
    },
  };
}
