/**
 * Welcome to the Jungle (WTTJ) Connector
 *
 * Provides hiring signals from France's leading job platform:
 * - Job postings (hiring velocity)
 * - Team size indicators
 * - Company culture signals
 * - Growth trajectory
 *
 * Source: https://www.welcometothejungle.com
 * Method: Web scraping (no public API)
 * Cost: FREE
 * Value: Hiring = growth. Very popular in French tech ecosystem.
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

export interface WTTJCompany {
  name: string;
  slug: string;
  description?: string;
  industry?: string;
  size?: string; // "11-50", "51-200", etc.
  sizeMin?: number;
  sizeMax?: number;
  founded?: number;
  headquarters?: string;
  website?: string;
  wttjUrl: string;
  openPositions: number;
  jobCategories: string[];
}

export interface WTTJJob {
  title: string;
  department: string;
  location: string;
  contractType: string; // "CDI", "CDD", "Stage", etc.
  remote?: string; // "Full remote", "Partial remote", etc.
  salary?: string;
  postedAt?: string;
  url: string;
}

export interface WTTJAnalysis {
  found: boolean;
  company?: WTTJCompany;
  jobs: WTTJJob[];
  hiringAssessment?: {
    velocity: "aggressive" | "moderate" | "slow" | "none";
    signals: string[];
    redFlags: string[];
    growthScore: number; // 0-100
    hiringFocus: string[]; // "Tech", "Sales", "Product", etc.
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = "https://www.welcometothejungle.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

// Size range parsing
const SIZE_RANGES: Record<string, { min: number; max: number }> = {
  "1-10": { min: 1, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-200": { min: 51, max: 200 },
  "201-500": { min: 201, max: 500 },
  "501-1000": { min: 501, max: 1000 },
  "1001-5000": { min: 1001, max: 5000 },
  "5001+": { min: 5001, max: 10000 },
};

// Department categorization
const DEPARTMENT_CATEGORIES: Record<string, string[]> = {
  "Tech": ["engineering", "developer", "tech", "software", "data", "devops", "sre", "infrastructure", "backend", "frontend", "fullstack", "mobile", "qa", "security"],
  "Product": ["product", "design", "ux", "ui", "research"],
  "Sales": ["sales", "business development", "account", "commercial", "partnerships"],
  "Marketing": ["marketing", "growth", "content", "brand", "communication", "pr"],
  "Operations": ["operations", "ops", "supply", "logistics", "customer success", "support"],
  "Finance": ["finance", "accounting", "legal", "compliance"],
  "HR": ["hr", "human resources", "talent", "people", "recruitment"],
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

    if (!response.ok) {
      console.warn(`[WTTJ] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error("[WTTJ] Fetch error:", error);
    return null;
  }
}

function parseSize(sizeText: string): { min?: number; max?: number } {
  for (const [key, range] of Object.entries(SIZE_RANGES)) {
    if (sizeText.includes(key)) {
      return range;
    }
  }

  // Try to parse numbers directly
  const match = sizeText.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return { min: num, max: num };
  }

  return {};
}

function categorizeDepartment(title: string, department: string): string {
  const text = `${title} ${department}`.toLowerCase();

  for (const [category, keywords] of Object.entries(DEPARTMENT_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  return "Other";
}

const wttjSource: DataSource = {
  type: "web_search",
  name: "Welcome to the Jungle",
  url: "https://www.welcometothejungle.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

// ============================================================================
// SCRAPING FUNCTIONS
// ============================================================================

/**
 * Search for a company on WTTJ
 */
export async function searchCompany(companyName: string): Promise<{
  slug: string;
  name: string;
} | null> {
  const searchUrl = `${BASE_URL}/fr/companies?query=${encodeURIComponent(companyName)}`;
  const html = await rateLimitedFetch(searchUrl);

  if (!html) return null;

  // Look for company cards in search results
  // Pattern: href="/fr/companies/company-slug"
  const companyPattern = /href="\/fr\/companies\/([a-z0-9-]+)"[^>]*>[\s\S]*?<[^>]*>([^<]+)</gi;

  let match;
  while ((match = companyPattern.exec(html)) !== null) {
    const slug = match[1];
    const name = match[2].trim();

    // Check if it's a good match
    if (name.toLowerCase().includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(name.toLowerCase()) ||
        slug.includes(companyName.toLowerCase().replace(/\s+/g, "-"))) {
      return { slug, name };
    }
  }

  return null;
}

/**
 * Get company details and jobs from WTTJ
 */
export async function getCompanyDetails(
  slugOrName: string
): Promise<WTTJAnalysis> {
  // If it looks like a name, search first
  let slug = slugOrName;
  let companyName = slugOrName;

  if (slugOrName.includes(" ") || !slugOrName.match(/^[a-z0-9-]+$/)) {
    const searchResult = await searchCompany(slugOrName);
    if (!searchResult) {
      return { found: false, jobs: [] };
    }
    slug = searchResult.slug;
    companyName = searchResult.name;
  }

  const companyUrl = `${BASE_URL}/fr/companies/${slug}`;
  const html = await rateLimitedFetch(companyUrl);

  if (!html) {
    return { found: false, jobs: [] };
  }

  // Parse company info
  const company: WTTJCompany = {
    name: companyName,
    slug,
    wttjUrl: companyUrl,
    openPositions: 0,
    jobCategories: [],
  };

  // Extract description
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  company.description = descMatch ? descMatch[1] : undefined;

  // Extract size
  const sizeMatch = html.match(/(\d+(?:-\d+|\+)?)\s*(?:employés|employees|salariés)/i);
  if (sizeMatch) {
    company.size = sizeMatch[1];
    const parsed = parseSize(sizeMatch[1]);
    company.sizeMin = parsed.min;
    company.sizeMax = parsed.max;
  }

  // Extract industry
  const industryMatch = html.match(/Secteur[^:]*:\s*<[^>]+>([^<]+)</i) ||
                        html.match(/Industry[^:]*:\s*<[^>]+>([^<]+)</i);
  company.industry = industryMatch ? industryMatch[1].trim() : undefined;

  // Extract headquarters
  const hqMatch = html.match(/(?:Siège|Headquarters)[^:]*:\s*<[^>]+>([^<]+)</i);
  company.headquarters = hqMatch ? hqMatch[1].trim() : undefined;

  // Extract website
  const websiteMatch = html.match(/href="(https?:\/\/(?!www\.welcometothejungle)[^"]+)"[^>]*>(?:Site web|Website)</i);
  company.website = websiteMatch ? websiteMatch[1] : undefined;

  // Parse jobs
  const jobs: WTTJJob[] = [];
  const jobCategories = new Set<string>();

  // Look for job listings
  const jobPattern = /href="(\/fr\/companies\/[^\/]+\/jobs\/[^"]+)"[^>]*>[\s\S]*?<[^>]*>([^<]+)<[\s\S]*?(?:<[^>]*>([^<]*(?:CDI|CDD|Stage|Alternance|Freelance)[^<]*)<)?/gi;

  let jobMatch;
  while ((jobMatch = jobPattern.exec(html)) !== null && jobs.length < 20) {
    const jobUrl = `${BASE_URL}${jobMatch[1]}`;
    const title = jobMatch[2].trim();
    const contractType = jobMatch[3]?.trim() || "CDI";

    // Determine department
    const department = categorizeDepartment(title, "");
    jobCategories.add(department);

    jobs.push({
      title,
      department,
      location: company.headquarters || "France",
      contractType,
      url: jobUrl,
    });
  }

  company.openPositions = jobs.length;
  company.jobCategories = Array.from(jobCategories);

  // Build assessment
  const assessment = buildHiringAssessment(company, jobs);

  return {
    found: true,
    company,
    jobs,
    hiringAssessment: assessment,
  };
}

/**
 * Build hiring assessment from company and jobs data
 */
function buildHiringAssessment(
  company: WTTJCompany,
  jobs: WTTJJob[]
): WTTJAnalysis["hiringAssessment"] {
  const signals: string[] = [];
  const redFlags: string[] = [];
  let growthScore = 0;

  const jobCount = jobs.length;

  // Hiring velocity based on job count
  let velocity: "aggressive" | "moderate" | "slow" | "none";
  if (jobCount >= 20) {
    velocity = "aggressive";
    signals.push(`Very aggressive hiring: ${jobCount} open positions`);
    growthScore += 40;
  } else if (jobCount >= 10) {
    velocity = "moderate";
    signals.push(`Active hiring: ${jobCount} open positions`);
    growthScore += 25;
  } else if (jobCount >= 3) {
    velocity = "slow";
    signals.push(`Some hiring: ${jobCount} open positions`);
    growthScore += 10;
  } else if (jobCount >= 1) {
    velocity = "slow";
    signals.push(`Limited hiring: ${jobCount} position(s)`);
    growthScore += 5;
  } else {
    velocity = "none";
    redFlags.push("No open positions on WTTJ");
  }

  // Hiring focus analysis
  const categoryCount: Record<string, number> = {};
  for (const job of jobs) {
    categoryCount[job.department] = (categoryCount[job.department] || 0) + 1;
  }

  const hiringFocus = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // Interpret hiring focus
  if (categoryCount["Tech"] >= 5) {
    signals.push("Heavy tech hiring - scaling engineering team");
    growthScore += 15;
  }

  if (categoryCount["Sales"] >= 3) {
    signals.push("Sales expansion - go-to-market push");
    growthScore += 10;
  }

  if (categoryCount["Product"] >= 2) {
    signals.push("Product team growth - product-led approach");
    growthScore += 10;
  }

  // Team size analysis
  if (company.sizeMin && company.sizeMax) {
    const avgSize = (company.sizeMin + company.sizeMax) / 2;
    const hiringRatio = jobCount / avgSize;

    if (hiringRatio > 0.2) {
      signals.push(`High growth: hiring ${Math.round(hiringRatio * 100)}% of current team size`);
      growthScore += 20;
    } else if (hiringRatio > 0.1) {
      signals.push(`Moderate growth: hiring ${Math.round(hiringRatio * 100)}% of current team size`);
      growthScore += 10;
    }
  }

  // Contract type analysis
  const cdiCount = jobs.filter(j => j.contractType.includes("CDI")).length;
  const internCount = jobs.filter(j =>
    j.contractType.includes("Stage") || j.contractType.includes("Alternance")
  ).length;

  if (cdiCount >= jobCount * 0.8 && jobCount >= 5) {
    signals.push("Mostly permanent positions - stable growth");
  }

  if (internCount > cdiCount && jobCount >= 3) {
    redFlags.push("More interns than permanent hires - cost optimization?");
  }

  // Normalize score
  growthScore = Math.min(100, Math.max(0, growthScore));

  return {
    velocity,
    signals,
    redFlags,
    growthScore,
    hiringFocus,
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const wttjConnector: Connector = {
  name: "Welcome to the Jungle",
  type: "web_search",

  isConfigured: () => true, // Always available (scraping)

  getNews: async (query: ConnectorQuery) => {
    if (!query.companyName) return [];

    const analysis = await getCompanyDetails(query.companyName);

    if (!analysis.found || !analysis.company) return [];

    const articles: NewsArticle[] = [];

    // Main company presence article
    articles.push({
      title: `${analysis.company.name} - ${analysis.company.openPositions} open positions on WTTJ`,
      description: analysis.hiringAssessment?.signals.join(". ") ||
                   `${analysis.company.size || "Unknown size"} company hiring in ${analysis.company.jobCategories.join(", ")}`,
      url: analysis.company.wttjUrl,
      source: "Welcome to the Jungle",
      publishedAt: new Date().toISOString(),
      sentiment: analysis.hiringAssessment?.velocity === "aggressive" ? "positive" : "neutral",
      relevance: 0.85,
      category: "company" as const,
    });

    return articles;
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if a company is on WTTJ
 */
export async function isOnWTTJ(companyName: string): Promise<{
  found: boolean;
  openPositions: number;
  url?: string;
}> {
  const result = await searchCompany(companyName);

  if (!result) {
    return { found: false, openPositions: 0 };
  }

  const details = await getCompanyDetails(result.slug);

  return {
    found: details.found,
    openPositions: details.company?.openPositions || 0,
    url: details.company?.wttjUrl,
  };
}

/**
 * Compare hiring to typical French startup benchmarks
 */
export function assessHiringVelocity(
  openPositions: number,
  teamSize: number
): {
  percentile: number;
  benchmark: string;
  interpretation: string;
} {
  const hiringRatio = openPositions / Math.max(1, teamSize);

  let percentile: number;
  let benchmark: string;
  let interpretation: string;

  if (hiringRatio >= 0.3) {
    percentile = 95;
    benchmark = "Hypergrowth";
    interpretation = "Growing team by 30%+ - very aggressive expansion";
  } else if (hiringRatio >= 0.2) {
    percentile = 85;
    benchmark = "Fast growth";
    interpretation = "Growing team by 20%+ - strong momentum";
  } else if (hiringRatio >= 0.1) {
    percentile = 65;
    benchmark = "Healthy growth";
    interpretation = "Growing team by 10%+ - normal for funded startup";
  } else if (hiringRatio >= 0.05) {
    percentile = 40;
    benchmark = "Moderate growth";
    interpretation = "Growing team by 5%+ - sustainable pace";
  } else if (openPositions > 0) {
    percentile = 20;
    benchmark = "Slow growth";
    interpretation = "Limited hiring - possibly cautious or profitable";
  } else {
    percentile = 5;
    benchmark = "No growth";
    interpretation = "No open positions - stable or contracting";
  }

  return { percentile, benchmark, interpretation };
}
