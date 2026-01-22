/**
 * Indeed Connector
 *
 * Provides hiring signals from the world's largest job site:
 * - Job postings count
 * - Hiring velocity
 * - Salary data (when available)
 * - Location expansion signals
 *
 * Source: https://www.indeed.com / https://fr.indeed.com
 * Method: Web scraping (no public API)
 * Cost: FREE
 * Value: Broader coverage than WTTJ, especially for non-tech roles
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface IndeedJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  snippet?: string;
  postedAt?: string;
  contractType?: string;
  remote?: boolean;
  url: string;
}

export interface IndeedCompanyData {
  companyName: string;
  totalJobs: number;
  jobsByLocation: Record<string, number>;
  jobsByType: Record<string, number>;
  salaryRange?: {
    min: number;
    max: number;
    currency: string;
  };
  recentJobs: IndeedJob[];
}

export interface IndeedAnalysis {
  found: boolean;
  data?: IndeedCompanyData;
  assessment?: {
    hiringLevel: "aggressive" | "active" | "moderate" | "minimal" | "none";
    signals: string[];
    redFlags: string[];
    expansionIndicators: string[];
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL_FR = "https://fr.indeed.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2500; // 2.5 seconds - Indeed is strict

// Contract type keywords
const CONTRACT_TYPES = {
  "CDI": ["cdi", "permanent", "full-time", "temps plein"],
  "CDD": ["cdd", "temporary", "contract", "temps partiel"],
  "Stage": ["stage", "internship", "intern"],
  "Alternance": ["alternance", "apprenticeship", "apprenti"],
  "Freelance": ["freelance", "contractor", "indépendant"],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function rateLimitedFetch(url: string): Promise<string | null> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    if (response.status === 403) {
      console.warn("[Indeed] Access blocked (403) - may need proxy");
      return null;
    }

    if (!response.ok) {
      console.warn(`[Indeed] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error("[Indeed] Fetch error:", error);
    return null;
  }
}

function parseSalary(salaryText: string): { min?: number; max?: number } {
  // Clean the text
  const cleaned = salaryText.toLowerCase().replace(/\s/g, "");

  // Look for range patterns like "30000 - 45000" or "30k-45k"
  const rangeMatch = cleaned.match(/(\d+(?:[\.,]\d+)?)\s*[kK€]?\s*[-àto]\s*(\d+(?:[\.,]\d+)?)\s*[kK€]?/);

  if (rangeMatch) {
    let min = parseFloat(rangeMatch[1].replace(",", "."));
    let max = parseFloat(rangeMatch[2].replace(",", "."));

    // Handle "k" notation
    if (min < 1000) min *= 1000;
    if (max < 1000) max *= 1000;

    return { min, max };
  }

  // Single value
  const singleMatch = cleaned.match(/(\d+(?:[\.,]\d+)?)\s*[kK€]/);
  if (singleMatch) {
    let value = parseFloat(singleMatch[1].replace(",", "."));
    if (value < 1000) value *= 1000;
    return { min: value, max: value };
  }

  return {};
}

function detectContractType(text: string): string | undefined {
  const textLower = text.toLowerCase();

  for (const [type, keywords] of Object.entries(CONTRACT_TYPES)) {
    if (keywords.some(kw => textLower.includes(kw))) {
      return type;
    }
  }

  return undefined;
}

const indeedSource: DataSource = {
  type: "web_search",
  name: "Indeed",
  url: "https://fr.indeed.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.8,
};

// ============================================================================
// SCRAPING FUNCTIONS
// ============================================================================

/**
 * Search for jobs by company name on Indeed France
 */
export async function searchCompanyJobs(
  companyName: string,
  options: {
    location?: string;
    limit?: number;
  } = {}
): Promise<IndeedJob[]> {
  const location = options.location || "";
  const searchUrl = `${BASE_URL_FR}/emplois?q=${encodeURIComponent(`"${companyName}"`)}&l=${encodeURIComponent(location)}`;

  const html = await rateLimitedFetch(searchUrl);

  if (!html) return [];

  const jobs: IndeedJob[] = [];

  // Indeed's HTML structure varies, but job cards typically contain:
  // - Job title in a link
  // - Company name
  // - Location
  // - Optional salary
  // - Job snippet/description

  // Pattern to match job cards
  const jobCardPattern = /<div[^>]*class="[^"]*job_seen_beacon[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  let cardMatch;
  while ((cardMatch = jobCardPattern.exec(html)) !== null && jobs.length < (options.limit || 20)) {
    const cardHtml = cardMatch[1];

    // Extract title and URL
    const titleMatch = cardHtml.match(/<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    if (!titleMatch) continue;

    const jobUrl = titleMatch[1].startsWith("http")
      ? titleMatch[1]
      : `${BASE_URL_FR}${titleMatch[1]}`;
    const title = titleMatch[2].trim();

    // Extract company (verify it matches)
    const companyMatch = cardHtml.match(/data-testid="company-name"[^>]*>([^<]+)</i) ||
                         cardHtml.match(/class="[^"]*companyName[^"]*"[^>]*>([^<]+)</i);
    const company = companyMatch ? companyMatch[1].trim() : "";

    // Skip if company doesn't match
    if (company && !company.toLowerCase().includes(companyName.toLowerCase()) &&
        !companyName.toLowerCase().includes(company.toLowerCase())) {
      continue;
    }

    // Extract location
    const locationMatch = cardHtml.match(/data-testid="text-location"[^>]*>([^<]+)</i) ||
                          cardHtml.match(/class="[^"]*companyLocation[^"]*"[^>]*>([^<]+)</i);
    const jobLocation = locationMatch ? locationMatch[1].trim() : "France";

    // Extract salary if available
    const salaryMatch = cardHtml.match(/class="[^"]*salary[^"]*"[^>]*>([^<]+)</i) ||
                        cardHtml.match(/(\d+[\s.,]*\d*\s*[kK€]?\s*[-àto]\s*\d+[\s.,]*\d*\s*[kK€]?)/);
    const salaryText = salaryMatch ? salaryMatch[1].trim() : undefined;
    const salary = salaryText ? parseSalary(salaryText) : {};

    // Extract snippet
    const snippetMatch = cardHtml.match(/class="[^"]*job-snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, " ").trim().substring(0, 200)
      : undefined;

    // Detect contract type
    const contractType = detectContractType(`${title} ${snippet || ""}`);

    // Detect remote
    const remote = /remote|télétravail|teletravail|à distance/i.test(`${title} ${jobLocation} ${snippet || ""}`);

    jobs.push({
      title,
      company: company || companyName,
      location: jobLocation,
      salary: salaryText,
      salaryMin: salary.min,
      salaryMax: salary.max,
      snippet,
      contractType,
      remote,
      url: jobUrl,
    });
  }

  return jobs;
}

/**
 * Get job count for a company (faster than full search)
 */
export async function getJobCount(companyName: string): Promise<number> {
  const searchUrl = `${BASE_URL_FR}/emplois?q=${encodeURIComponent(`"${companyName}"`)}`;
  const html = await rateLimitedFetch(searchUrl);

  if (!html) return 0;

  // Look for job count in results
  const countMatch = html.match(/(\d+(?:\s*\d+)*)\s*(?:offres?|emplois?|résultats?)/i);

  if (countMatch) {
    return parseInt(countMatch[1].replace(/\s/g, ""), 10);
  }

  // Fallback: count job cards
  const cardMatches = html.match(/job_seen_beacon/gi);
  return cardMatches ? cardMatches.length : 0;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Full Indeed analysis for a company
 */
export async function analyzeIndeedPresence(
  companyName: string
): Promise<IndeedAnalysis> {
  const jobs = await searchCompanyJobs(companyName, { limit: 30 });

  if (jobs.length === 0) {
    // Try alternate search
    const count = await getJobCount(companyName);
    if (count === 0) {
      return { found: false };
    }
  }

  // Aggregate data
  const jobsByLocation: Record<string, number> = {};
  const jobsByType: Record<string, number> = {};
  let salaryMin: number | undefined;
  let salaryMax: number | undefined;

  for (const job of jobs) {
    // Location aggregation
    const loc = job.location.split(",")[0].trim();
    jobsByLocation[loc] = (jobsByLocation[loc] || 0) + 1;

    // Contract type aggregation
    const type = job.contractType || "Unknown";
    jobsByType[type] = (jobsByType[type] || 0) + 1;

    // Salary range
    if (job.salaryMin && (!salaryMin || job.salaryMin < salaryMin)) {
      salaryMin = job.salaryMin;
    }
    if (job.salaryMax && (!salaryMax || job.salaryMax > salaryMax)) {
      salaryMax = job.salaryMax;
    }
  }

  const data: IndeedCompanyData = {
    companyName,
    totalJobs: jobs.length,
    jobsByLocation,
    jobsByType,
    salaryRange: salaryMin && salaryMax ? {
      min: salaryMin,
      max: salaryMax,
      currency: "EUR",
    } : undefined,
    recentJobs: jobs.slice(0, 10),
  };

  // Build assessment
  const assessment = buildAssessment(data);

  return {
    found: true,
    data,
    assessment,
  };
}

/**
 * Build hiring assessment
 */
function buildAssessment(
  data: IndeedCompanyData
): IndeedAnalysis["assessment"] {
  const signals: string[] = [];
  const redFlags: string[] = [];
  const expansionIndicators: string[] = [];

  const jobCount = data.totalJobs;

  // Determine hiring level
  let hiringLevel: "aggressive" | "active" | "moderate" | "minimal" | "none";
  if (jobCount >= 30) {
    hiringLevel = "aggressive";
    signals.push(`Very active hiring: ${jobCount}+ positions on Indeed`);
  } else if (jobCount >= 15) {
    hiringLevel = "active";
    signals.push(`Active hiring: ${jobCount} positions on Indeed`);
  } else if (jobCount >= 5) {
    hiringLevel = "moderate";
    signals.push(`Moderate hiring: ${jobCount} positions on Indeed`);
  } else if (jobCount >= 1) {
    hiringLevel = "minimal";
    signals.push(`Limited Indeed presence: ${jobCount} position(s)`);
  } else {
    hiringLevel = "none";
    redFlags.push("No jobs found on Indeed");
  }

  // Location analysis
  const locations = Object.keys(data.jobsByLocation);
  if (locations.length >= 5) {
    expansionIndicators.push(`Multi-city presence: ${locations.length} locations`);
    signals.push("Geographic expansion ongoing");
  } else if (locations.length >= 3) {
    expansionIndicators.push(`Growing footprint: ${locations.join(", ")}`);
  }

  // Check for international expansion
  const internationalLocations = locations.filter(loc =>
    !/paris|lyon|marseille|toulouse|bordeaux|nantes|lille|france/i.test(loc)
  );
  if (internationalLocations.length > 0) {
    expansionIndicators.push(`International presence: ${internationalLocations.join(", ")}`);
    signals.push("International expansion signal");
  }

  // Contract type analysis
  const cdiCount = data.jobsByType["CDI"] || 0;
  const stageCount = (data.jobsByType["Stage"] || 0) + (data.jobsByType["Alternance"] || 0);

  if (cdiCount >= jobCount * 0.7 && jobCount >= 5) {
    signals.push("Predominantly permanent positions");
  }

  if (stageCount > cdiCount && jobCount >= 3) {
    redFlags.push("More internships than permanent roles");
  }

  // Salary analysis
  if (data.salaryRange) {
    const avgSalary = (data.salaryRange.min + data.salaryRange.max) / 2;
    if (avgSalary >= 60000) {
      signals.push(`Competitive salaries: ${data.salaryRange.min/1000}k-${data.salaryRange.max/1000}k€`);
    } else if (avgSalary < 35000 && cdiCount > 0) {
      redFlags.push(`Below-market salaries: avg ~${Math.round(avgSalary/1000)}k€`);
    }
  }

  // Remote work
  const remoteCount = data.recentJobs.filter(j => j.remote).length;
  if (remoteCount >= jobCount * 0.5) {
    signals.push("Remote-friendly culture");
  }

  return {
    hiringLevel,
    signals,
    redFlags,
    expansionIndicators,
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const indeedConnector: Connector = {
  name: "Indeed",
  type: "web_search",

  // Disabled: Indeed blocks scraping (403) - needs proxy or API
  // Set to true when proxy is configured via INDEED_PROXY_URL env var
  isConfigured: () => !!process.env.INDEED_PROXY_URL,

  getNews: async (query: ConnectorQuery) => {
    if (!query.companyName) return [];

    const analysis = await analyzeIndeedPresence(query.companyName);

    if (!analysis.found || !analysis.data) return [];

    const articles: NewsArticle[] = [];

    // Main hiring article
    const data = analysis.data;
    articles.push({
      title: `${data.companyName} - ${data.totalJobs} job postings on Indeed`,
      description: analysis.assessment?.signals.join(". ") ||
                   `Hiring in ${Object.keys(data.jobsByLocation).join(", ")}`,
      url: `${BASE_URL_FR}/emplois?q=${encodeURIComponent(data.companyName)}`,
      source: "Indeed",
      publishedAt: new Date().toISOString(),
      sentiment: analysis.assessment?.hiringLevel === "aggressive" ? "positive" : "neutral",
      relevance: 0.8,
      category: "company" as const,
    });

    return articles;
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check for Indeed presence
 */
export async function hasIndeedPresence(companyName: string): Promise<{
  found: boolean;
  jobCount: number;
}> {
  const count = await getJobCount(companyName);
  return {
    found: count > 0,
    jobCount: count,
  };
}

/**
 * Compare hiring activity across job platforms
 */
export async function compareHiringPlatforms(
  companyName: string
): Promise<{
  indeed: number;
  totalEstimate: number;
  primaryPlatform: string;
}> {
  const indeedCount = await getJobCount(companyName);

  // Indeed typically has ~60-70% of French job market coverage
  // WTTJ has more tech-focused roles
  const totalEstimate = Math.round(indeedCount / 0.65);

  return {
    indeed: indeedCount,
    totalEstimate,
    primaryPlatform: "Indeed (broad coverage)",
  };
}

/**
 * Get salary benchmarks from Indeed data
 */
export function getSalaryBenchmarks(
  jobs: IndeedJob[]
): {
  hasSalaryData: boolean;
  sampleSize: number;
  median?: number;
  range?: { min: number; max: number };
  transparency: "high" | "medium" | "low";
} {
  const jobsWithSalary = jobs.filter(j => j.salaryMin || j.salaryMax);

  if (jobsWithSalary.length === 0) {
    return {
      hasSalaryData: false,
      sampleSize: 0,
      transparency: "low",
    };
  }

  const salaries = jobsWithSalary
    .map(j => (j.salaryMin && j.salaryMax) ? (j.salaryMin + j.salaryMax) / 2 : j.salaryMin || j.salaryMax)
    .filter((s): s is number => s !== undefined)
    .sort((a, b) => a - b);

  const median = salaries[Math.floor(salaries.length / 2)];

  const transparency = jobsWithSalary.length >= jobs.length * 0.5 ? "high" :
                       jobsWithSalary.length >= jobs.length * 0.2 ? "medium" : "low";

  return {
    hasSalaryData: true,
    sampleSize: jobsWithSalary.length,
    median,
    range: {
      min: salaries[0],
      max: salaries[salaries.length - 1],
    },
    transparency,
  };
}
