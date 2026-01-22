/**
 * French Incubators Connector
 *
 * Provides validation signals from top French incubators/accelerators:
 * - Station F (Paris - World's largest startup campus)
 * - The Family (defunct but alumni network valuable)
 * - eFounders (SaaS studio)
 * - Techstars Paris
 * - HEC Incubator
 * - Polytechnique incubators (X-Up, etc.)
 * - Wilco (ex-Paris Pionnières)
 *
 * Source: Public directories and portfolios
 * Cost: FREE
 * Value: "Did they pass a competitive selection?"
 */

import type {
  Connector,
  ConnectorQuery,
  SimilarDeal,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface IncubatorCompany {
  name: string;
  incubator: IncubatorName;
  program?: string;
  batch?: string;
  year?: number;
  sector?: string;
  stage?: string;
  status?: "active" | "acquired" | "ipo" | "dead" | "unknown";
  description?: string;
  funding?: {
    total?: number;
    lastRound?: string;
  };
}

export type IncubatorName =
  | "station_f"
  | "efounders"
  | "the_family"
  | "techstars_paris"
  | "hec_incubator"
  | "x_up"
  | "wilco"
  | "numa"
  | "agoranov"
  | "50_partners";

export interface IncubatorInfo {
  name: string;
  fullName: string;
  acceptanceRate?: number; // Percentage
  website: string;
  description: string;
  notableAlumni: string[];
  type: "accelerator" | "incubator" | "studio";
}

// ============================================================================
// STATIC DATA - INCUBATOR INFO
// ============================================================================

const INCUBATORS: Record<IncubatorName, IncubatorInfo> = {
  station_f: {
    name: "Station F",
    fullName: "Station F - World's Largest Startup Campus",
    acceptanceRate: 5,
    website: "https://stationf.co",
    description: "World's largest startup campus with 30+ programs",
    notableAlumni: ["Zenly", "Algolia", "Datadog"],
    type: "incubator",
  },
  efounders: {
    name: "eFounders",
    fullName: "eFounders - SaaS Startup Studio",
    acceptanceRate: 1, // Very selective studio
    website: "https://www.efounders.com",
    description: "B2B SaaS studio, creates companies from scratch",
    notableAlumni: ["Front", "Aircall", "Spendesk", "Payfit"],
    type: "studio",
  },
  the_family: {
    name: "The Family",
    fullName: "The Family (defunct 2022)",
    acceptanceRate: 10,
    website: "https://www.thefamily.co", // archived
    description: "Was a leading European accelerator, closed in 2022",
    notableAlumni: ["Algolia", "Heetch", "Comet"],
    type: "accelerator",
  },
  techstars_paris: {
    name: "Techstars Paris",
    fullName: "Techstars Paris Accelerator",
    acceptanceRate: 1,
    website: "https://www.techstars.com/accelerators/paris",
    description: "Global accelerator network, Paris program",
    notableAlumni: ["Zyl", "Djit"],
    type: "accelerator",
  },
  hec_incubator: {
    name: "HEC Incubator",
    fullName: "HEC Paris Incubator",
    acceptanceRate: 15,
    website: "https://www.hec.edu/en/incubator",
    description: "Business school incubator",
    notableAlumni: ["Doctrine", "Shine"],
    type: "incubator",
  },
  x_up: {
    name: "X-Up",
    fullName: "X-Up (École Polytechnique)",
    acceptanceRate: 10,
    website: "https://www.polytechnique.edu/en/entrepreneurship",
    description: "Polytechnique engineering school incubator",
    notableAlumni: ["Criteo co-founders", "Dataiku"],
    type: "incubator",
  },
  wilco: {
    name: "Wilco",
    fullName: "Wilco (ex-Paris Pionnières)",
    acceptanceRate: 20,
    website: "https://wilco.io",
    description: "Impact-focused accelerator",
    notableAlumni: ["Too Good To Go (accelerated)"],
    type: "accelerator",
  },
  numa: {
    name: "NUMA",
    fullName: "NUMA Paris",
    acceptanceRate: 15,
    website: "https://numa.co",
    description: "Corporate innovation & accelerator",
    notableAlumni: ["various corporate spin-offs"],
    type: "accelerator",
  },
  agoranov: {
    name: "Agoranov",
    fullName: "Agoranov Incubator",
    acceptanceRate: 20,
    website: "https://www.agoranov.com",
    description: "Paris science & tech incubator since 1999",
    notableAlumni: ["Criteo", "Cellectis"],
    type: "incubator",
  },
  "50_partners": {
    name: "50 Partners",
    fullName: "50 Partners Accelerator",
    acceptanceRate: 5,
    website: "https://www.yoursite.com", // Check actual URL
    description: "Elite French accelerator",
    notableAlumni: ["various"],
    type: "accelerator",
  },
};

// ============================================================================
// STATIC DATA - INCUBATED COMPANIES
// ============================================================================

const INCUBATED_COMPANIES: IncubatorCompany[] = [
  // === STATION F ===
  {
    name: "Zenly",
    incubator: "station_f",
    program: "Founders Program",
    year: 2017,
    sector: "Consumer",
    status: "acquired",
    description: "Social map app, acquired by Snap for $200M+",
    funding: { total: 35_000_000 },
  },
  {
    name: "Alma",
    incubator: "station_f",
    program: "Founders Program",
    year: 2018,
    sector: "Fintech",
    status: "active",
    description: "Buy now pay later",
    funding: { total: 150_000_000, lastRound: "Series C" },
  },
  {
    name: "Silvr",
    incubator: "station_f",
    program: "Founders Program",
    year: 2020,
    sector: "Fintech",
    status: "active",
    description: "Revenue-based financing",
    funding: { total: 18_000_000, lastRound: "Series A" },
  },
  {
    name: "Sorare",
    incubator: "station_f",
    program: "Founders Program",
    year: 2019,
    sector: "Gaming",
    status: "active",
    description: "Fantasy sports NFTs",
    funding: { total: 740_000_000, lastRound: "Series B" },
  },
  {
    name: "PlayPlay",
    incubator: "station_f",
    program: "Founders Program",
    year: 2018,
    sector: "SaaS B2B",
    status: "active",
    description: "Video creation platform",
    funding: { total: 65_000_000, lastRound: "Series B" },
  },

  // === eFOUNDERS ===
  {
    name: "Front",
    incubator: "efounders",
    year: 2014,
    sector: "SaaS B2B",
    status: "active",
    description: "Shared inbox platform",
    funding: { total: 204_000_000, lastRound: "Series D" },
  },
  {
    name: "Aircall",
    incubator: "efounders",
    year: 2014,
    sector: "SaaS B2B",
    status: "active",
    description: "Cloud phone system",
    funding: { total: 226_000_000, lastRound: "Series D" },
  },
  {
    name: "Spendesk",
    incubator: "efounders",
    year: 2016,
    sector: "Fintech",
    status: "active",
    description: "Spend management",
    funding: { total: 260_000_000, lastRound: "Series C" },
  },
  {
    name: "Slite",
    incubator: "efounders",
    year: 2017,
    sector: "SaaS B2B",
    status: "active",
    description: "Knowledge base for teams",
    funding: { total: 16_000_000, lastRound: "Series A" },
  },
  {
    name: "Cycle",
    incubator: "efounders",
    year: 2021,
    sector: "SaaS B2B",
    status: "active",
    description: "Product feedback tool",
    funding: { total: 4_000_000, lastRound: "Seed" },
  },
  {
    name: "Folk",
    incubator: "efounders",
    year: 2020,
    sector: "SaaS B2B",
    status: "active",
    description: "CRM for relationships",
    funding: { total: 20_000_000, lastRound: "Series A" },
  },

  // === THE FAMILY (Alumni) ===
  {
    name: "Algolia",
    incubator: "the_family",
    year: 2012,
    sector: "SaaS B2B",
    status: "active",
    description: "Search-as-a-service",
    funding: { total: 334_000_000, lastRound: "Series D" },
  },
  {
    name: "Heetch",
    incubator: "the_family",
    year: 2013,
    sector: "Marketplace",
    status: "active",
    description: "Ride-hailing app",
    funding: { total: 60_000_000, lastRound: "Series B" },
  },
  {
    name: "Comet",
    incubator: "the_family",
    year: 2016,
    sector: "Marketplace",
    status: "active",
    description: "Freelance marketplace",
    funding: { total: 50_000_000, lastRound: "Series B" },
  },
  {
    name: "Strapi",
    incubator: "the_family",
    year: 2016,
    sector: "SaaS B2B",
    status: "active",
    description: "Headless CMS",
    funding: { total: 35_000_000, lastRound: "Series B" },
  },

  // === TECHSTARS PARIS ===
  {
    name: "Zyl",
    incubator: "techstars_paris",
    batch: "2018",
    year: 2018,
    sector: "Consumer",
    status: "active",
    description: "AI photo organization",
    funding: { total: 2_500_000, lastRound: "Seed" },
  },

  // === HEC INCUBATOR ===
  {
    name: "Doctrine",
    incubator: "hec_incubator",
    year: 2016,
    sector: "SaaS B2B",
    status: "active",
    description: "Legal intelligence platform",
    funding: { total: 35_000_000, lastRound: "Series B" },
  },
  {
    name: "Shine",
    incubator: "hec_incubator",
    year: 2017,
    sector: "Fintech",
    status: "acquired",
    description: "Banking for freelancers, acquired by Société Générale",
    funding: { total: 10_000_000 },
  },

  // === AGORANOV ===
  {
    name: "Criteo",
    incubator: "agoranov",
    year: 2005,
    sector: "SaaS B2B",
    status: "ipo",
    description: "Retargeting ads, IPO on NASDAQ",
    funding: { total: 250_000_000 },
  },
  {
    name: "Cellectis",
    incubator: "agoranov",
    year: 1999,
    sector: "Healthtech",
    status: "ipo",
    description: "Gene editing biotech",
    funding: { total: 228_000_000 },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const incubatorSource: DataSource = {
  type: "crunchbase",
  name: "French Incubators",
  url: "https://stationf.co",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9,
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const incubatorsConnector: Connector = {
  name: "French Incubators",
  type: "crunchbase",

  isConfigured: () => true, // Always available

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    let matches = INCUBATED_COMPANIES;

    // Filter by sector
    if (query.sector) {
      const sectorLower = query.sector.toLowerCase();
      matches = matches.filter(c =>
        c.sector?.toLowerCase().includes(sectorLower)
      );
    }

    // Exclude the company itself
    if (query.companyName) {
      const normalized = normalizeForSearch(query.companyName);
      matches = matches.filter(c =>
        normalizeForSearch(c.name) !== normalized
      );
    }

    return matches.slice(0, 10).map(company => ({
      companyName: company.name,
      sector: company.sector || "Unknown",
      stage: company.stage || company.funding?.lastRound || "Unknown",
      geography: "France",
      fundingDate: company.year?.toString() || "Unknown",
      fundingAmount: company.funding?.total || 0,
      investors: [`${INCUBATORS[company.incubator].name}`],
      source: {
        ...incubatorSource,
        name: INCUBATORS[company.incubator].name,
        url: INCUBATORS[company.incubator].website,
        retrievedAt: new Date().toISOString(),
      },
    }));
  },

  getCompetitors: async (query: ConnectorQuery) => {
    if (!query.sector) return [];

    const sectorLower = query.sector.toLowerCase();
    let matches = INCUBATED_COMPANIES.filter(c =>
      c.sector?.toLowerCase().includes(sectorLower)
    );

    // Exclude the company itself
    if (query.companyName) {
      const normalized = normalizeForSearch(query.companyName);
      matches = matches.filter(c =>
        normalizeForSearch(c.name) !== normalized
      );
    }

    return matches.slice(0, 5).map(c => ({
      name: c.name,
      description: c.description,
      website: undefined,
      stage: c.funding?.lastRound || "Unknown",
      positioning: c.description || c.sector || "N/A",
      overlap: "direct" as const,
      estimatedRevenue: undefined,
      source: {
        ...incubatorSource,
        name: INCUBATORS[c.incubator].name,
        retrievedAt: new Date().toISOString(),
      },
    }));
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// ============================================================================

/**
 * Check if a company went through a known incubator
 */
export function checkIncubatorHistory(companyName: string): {
  found: boolean;
  incubator?: IncubatorInfo;
  company?: IncubatorCompany;
  validationStrength: "strong" | "moderate" | "none";
  reasoning: string;
} {
  const normalized = normalizeForSearch(companyName);

  const company = INCUBATED_COMPANIES.find(c =>
    normalizeForSearch(c.name) === normalized ||
    normalizeForSearch(c.name).includes(normalized) ||
    normalized.includes(normalizeForSearch(c.name))
  );

  if (!company) {
    return {
      found: false,
      validationStrength: "none",
      reasoning: "No known incubator/accelerator affiliation found",
    };
  }

  const incubator = INCUBATORS[company.incubator];

  // Determine validation strength
  let validationStrength: "strong" | "moderate";
  let reasoning: string;

  if (incubator.type === "studio" ||
      (incubator.acceptanceRate && incubator.acceptanceRate <= 5)) {
    validationStrength = "strong";
    reasoning = `Highly selective: ${incubator.name} has ${incubator.acceptanceRate}% acceptance rate`;
  } else {
    validationStrength = "moderate";
    reasoning = `Passed ${incubator.name} selection process`;
  }

  // Boost for successful outcomes
  if (company.status === "acquired" || company.status === "ipo") {
    reasoning += `. Successful exit: ${company.status.toUpperCase()}`;
  }

  return {
    found: true,
    incubator,
    company,
    validationStrength,
    reasoning,
  };
}

/**
 * Get all companies from a specific incubator
 */
export function getIncubatorPortfolio(incubatorName: IncubatorName): IncubatorCompany[] {
  return INCUBATED_COMPANIES.filter(c => c.incubator === incubatorName);
}

/**
 * Get incubator info
 */
export function getIncubatorInfo(incubatorName: IncubatorName): IncubatorInfo | null {
  return INCUBATORS[incubatorName] || null;
}

/**
 * List all tracked incubators
 */
export function listIncubators(): IncubatorInfo[] {
  return Object.values(INCUBATORS);
}

/**
 * Get success rate for an incubator (based on known exits)
 */
export function getIncubatorSuccessRate(incubatorName: IncubatorName): {
  totalCompanies: number;
  successfulExits: number;
  activeCompanies: number;
  deadCompanies: number;
  successRate: number;
} {
  const portfolio = getIncubatorPortfolio(incubatorName);

  const stats = {
    totalCompanies: portfolio.length,
    successfulExits: portfolio.filter(c =>
      c.status === "acquired" || c.status === "ipo"
    ).length,
    activeCompanies: portfolio.filter(c => c.status === "active").length,
    deadCompanies: portfolio.filter(c => c.status === "dead").length,
    successRate: 0,
  };

  stats.successRate = stats.totalCompanies > 0
    ? (stats.successfulExits / stats.totalCompanies) * 100
    : 0;

  return stats;
}

/**
 * Compare an incubator to peers
 */
export function compareIncubators(): {
  name: string;
  type: string;
  acceptanceRate?: number;
  portfolioSize: number;
  successRate: number;
}[] {
  return Object.entries(INCUBATORS).map(([key, info]) => {
    const stats = getIncubatorSuccessRate(key as IncubatorName);
    return {
      name: info.name,
      type: info.type,
      acceptanceRate: info.acceptanceRate,
      portfolioSize: stats.totalCompanies,
      successRate: stats.successRate,
    };
  }).sort((a, b) => b.successRate - a.successRate);
}

/**
 * Find the best incubator fit for a startup based on sector
 */
export function suggestIncubator(sector: string): {
  recommended: IncubatorInfo[];
  reasoning: string;
} {
  const sectorLower = sector.toLowerCase();

  // eFounders for B2B SaaS
  if (sectorLower.includes("saas") || sectorLower.includes("b2b")) {
    return {
      recommended: [INCUBATORS.efounders, INCUBATORS.station_f],
      reasoning: "eFounders is the premier B2B SaaS studio in France. Station F also has strong SaaS programs.",
    };
  }

  // Station F for consumer/marketplace
  if (sectorLower.includes("consumer") || sectorLower.includes("marketplace")) {
    return {
      recommended: [INCUBATORS.station_f, INCUBATORS.techstars_paris],
      reasoning: "Station F and Techstars have produced successful consumer startups like Zenly and Sorare.",
    };
  }

  // Agoranov for deeptech
  if (sectorLower.includes("deeptech") || sectorLower.includes("biotech") || sectorLower.includes("health")) {
    return {
      recommended: [INCUBATORS.agoranov, INCUBATORS.x_up],
      reasoning: "Agoranov and X-Up specialize in deeptech/science-based startups.",
    };
  }

  // Default
  return {
    recommended: [INCUBATORS.station_f, INCUBATORS.techstars_paris],
    reasoning: "Station F and Techstars are generalist programs with strong networks.",
  };
}
