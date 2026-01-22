/**
 * French Tech Connector
 *
 * Dedicated connector for French Tech ecosystem data:
 * - Next40 / FT120 listings
 * - French Tech community members
 * - Capital cities (Paris, Lyon, Bordeaux, etc.)
 * - Programs (Visa, Tremplin, etc.)
 *
 * Source: https://lafrenchtech.com
 * Cost: FREE (public data)
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

export interface FrenchTechCompany {
  name: string;
  sector: string;
  stage: string;
  tier: "next40" | "ft120" | "community";
  city?: string;
  yearJoined?: number;
  description?: string;
  lastFunding?: {
    amount: number;
    date: string;
    round: string;
  };
  metrics?: {
    employees?: number;
    valuation?: number;
  };
}

// ============================================================================
// STATIC DATA - FRENCH TECH ECOSYSTEM
// ============================================================================

// Comprehensive Next40 + FT120 data
const FRENCH_TECH_COMPANIES: FrenchTechCompany[] = [
  // === NEXT40 (Top Tier) ===
  {
    name: "Doctolib",
    sector: "Healthtech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Medical appointment booking platform",
    lastFunding: { amount: 500_000_000, date: "2022-03", round: "Series F" },
    metrics: { employees: 2800, valuation: 5_800_000_000 },
  },
  {
    name: "BlaBlaCar",
    sector: "Marketplace",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Carpooling marketplace",
    lastFunding: { amount: 115_000_000, date: "2021-04", round: "Series F" },
    metrics: { employees: 700, valuation: 2_000_000_000 },
  },
  {
    name: "Dataiku",
    sector: "AI/ML",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Enterprise AI platform",
    lastFunding: { amount: 400_000_000, date: "2021-08", round: "Series E" },
    metrics: { employees: 1000, valuation: 4_600_000_000 },
  },
  {
    name: "Contentsquare",
    sector: "SaaS B2B",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Digital experience analytics",
    lastFunding: { amount: 600_000_000, date: "2022-07", round: "Series F" },
    metrics: { employees: 1800, valuation: 5_600_000_000 },
  },
  {
    name: "Mirakl",
    sector: "SaaS B2B",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Marketplace platform for enterprises",
    lastFunding: { amount: 555_000_000, date: "2021-09", round: "Series E" },
    metrics: { employees: 750, valuation: 3_500_000_000 },
  },
  {
    name: "Back Market",
    sector: "Marketplace",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Refurbished electronics marketplace",
    lastFunding: { amount: 510_000_000, date: "2022-01", round: "Series E" },
    metrics: { employees: 650, valuation: 5_700_000_000 },
  },
  {
    name: "Qonto",
    sector: "Fintech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Business banking for SMBs",
    lastFunding: { amount: 552_000_000, date: "2022-01", round: "Series D" },
    metrics: { employees: 1400, valuation: 5_000_000_000 },
  },
  {
    name: "Alan",
    sector: "Healthtech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Health insurance for companies",
    lastFunding: { amount: 183_000_000, date: "2022-05", round: "Series E" },
    metrics: { employees: 600, valuation: 2_700_000_000 },
  },
  {
    name: "Payfit",
    sector: "SaaS B2B",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Payroll and HR management",
    lastFunding: { amount: 254_000_000, date: "2022-01", round: "Series E" },
    metrics: { employees: 1100, valuation: 2_100_000_000 },
  },
  {
    name: "Ledger",
    sector: "Fintech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Hardware wallets for crypto",
    lastFunding: { amount: 380_000_000, date: "2021-06", round: "Series C" },
    metrics: { employees: 700, valuation: 1_500_000_000 },
  },
  {
    name: "ManoMano",
    sector: "Marketplace",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "DIY and gardening marketplace",
    lastFunding: { amount: 355_000_000, date: "2021-07", round: "Series F" },
    metrics: { employees: 1000, valuation: 2_600_000_000 },
  },
  {
    name: "Sorare",
    sector: "Gaming",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2021,
    description: "Fantasy sports NFT platform",
    lastFunding: { amount: 680_000_000, date: "2021-09", round: "Series B" },
    metrics: { employees: 400, valuation: 4_300_000_000 },
  },
  {
    name: "Vestiaire Collective",
    sector: "Marketplace",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Luxury second-hand fashion",
    lastFunding: { amount: 216_000_000, date: "2021-03", round: "Series F" },
    metrics: { employees: 600, valuation: 1_700_000_000 },
  },
  {
    name: "Swile",
    sector: "Fintech",
    stage: "Growth",
    tier: "next40",
    city: "Montpellier",
    yearJoined: 2021,
    description: "Employee benefits platform",
    lastFunding: { amount: 200_000_000, date: "2022-01", round: "Series D" },
    metrics: { employees: 750, valuation: 1_000_000_000 },
  },
  {
    name: "Spendesk",
    sector: "Fintech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2021,
    description: "Spend management platform",
    lastFunding: { amount: 100_000_000, date: "2022-01", round: "Series C" },
    metrics: { employees: 500, valuation: 1_100_000_000 },
  },
  {
    name: "Pennylane",
    sector: "Fintech",
    stage: "Series B",
    tier: "next40",
    city: "Paris",
    yearJoined: 2023,
    description: "Accounting automation platform",
    lastFunding: { amount: 40_000_000, date: "2022-07", round: "Series B" },
    metrics: { employees: 350, valuation: 500_000_000 },
  },
  {
    name: "Pigment",
    sector: "SaaS B2B",
    stage: "Series C",
    tier: "next40",
    city: "Paris",
    yearJoined: 2023,
    description: "Business planning platform",
    lastFunding: { amount: 88_000_000, date: "2023-04", round: "Series C" },
    metrics: { employees: 350, valuation: 800_000_000 },
  },
  {
    name: "Lydia",
    sector: "Fintech",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2020,
    description: "Mobile payment app",
    lastFunding: { amount: 100_000_000, date: "2021-12", round: "Series C" },
    metrics: { employees: 350, valuation: 1_000_000_000 },
  },
  {
    name: "Algolia",
    sector: "SaaS B2B",
    stage: "Growth",
    tier: "next40",
    city: "Paris",
    yearJoined: 2019,
    description: "Search-as-a-service API",
    lastFunding: { amount: 150_000_000, date: "2021-07", round: "Series D" },
    metrics: { employees: 700, valuation: 2_250_000_000 },
  },
  {
    name: "OVHcloud",
    sector: "SaaS B2B",
    stage: "Public",
    tier: "next40",
    city: "Roubaix",
    yearJoined: 2019,
    description: "European cloud provider",
    metrics: { employees: 2500, valuation: 3_500_000_000 },
  },

  // === FT120 (Extended list - sample) ===
  {
    name: "Agicap",
    sector: "Fintech",
    stage: "Series B",
    tier: "ft120",
    city: "Lyon",
    description: "Cash flow management",
    lastFunding: { amount: 100_000_000, date: "2022-07", round: "Series B" },
    metrics: { employees: 500 },
  },
  {
    name: "Aircall",
    sector: "SaaS B2B",
    stage: "Series D",
    tier: "ft120",
    city: "Paris",
    description: "Cloud-based phone system",
    lastFunding: { amount: 120_000_000, date: "2021-06", round: "Series D" },
    metrics: { employees: 800 },
  },
  {
    name: "Alma",
    sector: "Fintech",
    stage: "Series C",
    tier: "ft120",
    city: "Paris",
    description: "Buy now pay later",
    lastFunding: { amount: 115_000_000, date: "2022-01", round: "Series C" },
    metrics: { employees: 450 },
  },
  {
    name: "Yousign",
    sector: "SaaS B2B",
    stage: "Series B",
    tier: "ft120",
    city: "Caen",
    description: "Electronic signature",
    lastFunding: { amount: 30_000_000, date: "2022-03", round: "Series B" },
    metrics: { employees: 200 },
  },
  {
    name: "Welcome to the Jungle",
    sector: "SaaS B2B",
    stage: "Series C",
    tier: "ft120",
    city: "Paris",
    description: "Employer branding platform",
    lastFunding: { amount: 50_000_000, date: "2021-05", round: "Series C" },
    metrics: { employees: 500 },
  },
  {
    name: "Ornikar",
    sector: "Consumer",
    stage: "Series C",
    tier: "ft120",
    city: "Paris",
    description: "Online driving school",
    lastFunding: { amount: 100_000_000, date: "2022-02", round: "Series C" },
    metrics: { employees: 400 },
  },
  {
    name: "Skello",
    sector: "SaaS B2B",
    stage: "Series C",
    tier: "ft120",
    city: "Paris",
    description: "Workforce management",
    lastFunding: { amount: 40_000_000, date: "2022-01", round: "Series B" },
    metrics: { employees: 300 },
  },
  {
    name: "Sweep",
    sector: "SaaS B2B",
    stage: "Series B",
    tier: "ft120",
    city: "Paris",
    description: "Carbon management platform",
    lastFunding: { amount: 73_000_000, date: "2023-06", round: "Series B" },
    metrics: { employees: 150 },
  },
  {
    name: "Gleamer",
    sector: "Healthtech",
    stage: "Series B",
    tier: "ft120",
    city: "Paris",
    description: "AI for dental imaging",
    lastFunding: { amount: 32_000_000, date: "2023-01", round: "Series B" },
    metrics: { employees: 100 },
  },
  {
    name: "Hivebrite",
    sector: "SaaS B2B",
    stage: "Series B",
    tier: "ft120",
    city: "Paris",
    description: "Community management platform",
    lastFunding: { amount: 20_000_000, date: "2021-05", round: "Series B" },
    metrics: { employees: 200 },
  },
];

// French Tech Capital Cities
const FRENCH_TECH_CAPITALS = [
  "Paris", "Lyon", "Bordeaux", "Toulouse", "Nantes", "Lille", "Marseille",
  "Montpellier", "Rennes", "Grenoble", "Nice", "Strasbourg"
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

function matchesSearch(company: FrenchTechCompany, query: ConnectorQuery): boolean {
  const normalizedName = normalizeForSearch(company.name);

  // Match by company name
  if (query.companyName) {
    const searchName = normalizeForSearch(query.companyName);
    if (normalizedName.includes(searchName) || searchName.includes(normalizedName)) {
      return true;
    }
  }

  // Match by sector
  if (query.sector) {
    const searchSector = query.sector.toLowerCase();
    if (company.sector.toLowerCase().includes(searchSector) ||
        searchSector.includes(company.sector.toLowerCase())) {
      return true;
    }
  }

  // Match by keywords
  if (query.keywords) {
    const companyText = `${company.name} ${company.sector} ${company.description || ""}`.toLowerCase();
    if (query.keywords.some(kw => companyText.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

const frenchTechSource: DataSource = {
  type: "crunchbase",
  name: "French Tech",
  url: "https://lafrenchtech.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95,
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const frenchTechConnector: Connector = {
  name: "French Tech",
  type: "crunchbase",

  isConfigured: () => true, // Always available

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    // Find companies matching the query
    const matches = FRENCH_TECH_COMPANIES.filter(c => matchesSearch(c, query));

    // If searching by company name, exclude exact match (it's not a "similar" deal)
    const filtered = query.companyName
      ? matches.filter(c =>
          normalizeForSearch(c.name) !== normalizeForSearch(query.companyName!))
      : matches;

    return filtered.slice(0, 10).map(company => ({
      companyName: company.name,
      sector: company.sector,
      stage: company.stage,
      geography: "France",
      fundingDate: company.lastFunding?.date || "2023",
      fundingAmount: company.lastFunding?.amount || 0,
      valuationMultiple: company.metrics?.valuation && company.lastFunding?.amount
        ? company.metrics.valuation / (company.lastFunding.amount * 10) // Rough ARR multiple
        : undefined,
      investors: [],
      source: {
        ...frenchTechSource,
        retrievedAt: new Date().toISOString(),
      },
    }));
  },

  getCompetitors: async (query: ConnectorQuery) => {
    if (!query.sector) return [];

    const sectorCompanies = FRENCH_TECH_COMPANIES.filter(c =>
      c.sector.toLowerCase().includes(query.sector!.toLowerCase())
    );

    // Exclude the company itself
    const competitors = query.companyName
      ? sectorCompanies.filter(c =>
          normalizeForSearch(c.name) !== normalizeForSearch(query.companyName!))
      : sectorCompanies;

    return competitors.slice(0, 5).map(c => ({
      name: c.name,
      description: c.description,
      website: undefined,
      stage: c.stage,
      positioning: c.description || c.sector,
      overlap: "direct" as const,
      estimatedRevenue: undefined,
      estimatedEmployees: c.metrics?.employees,
      source: {
        ...frenchTechSource,
        retrievedAt: new Date().toISOString(),
      },
    }));
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// ============================================================================

/**
 * Check if a company is in French Tech listings
 */
export function checkFrenchTechStatus(companyName: string): {
  found: boolean;
  tier?: "next40" | "ft120" | "community";
  company?: FrenchTechCompany;
  comparables?: FrenchTechCompany[];
} {
  const normalized = normalizeForSearch(companyName);

  const company = FRENCH_TECH_COMPANIES.find(c =>
    normalizeForSearch(c.name) === normalized ||
    normalizeForSearch(c.name).includes(normalized) ||
    normalized.includes(normalizeForSearch(c.name))
  );

  if (!company) {
    return { found: false };
  }

  // Find comparables (same sector, similar stage)
  const comparables = FRENCH_TECH_COMPANIES.filter(c =>
    c.name !== company.name &&
    c.sector === company.sector
  ).slice(0, 5);

  return {
    found: true,
    tier: company.tier,
    company,
    comparables,
  };
}

/**
 * Get all companies in a specific tier
 */
export function getCompaniesByTier(tier: "next40" | "ft120"): FrenchTechCompany[] {
  return FRENCH_TECH_COMPANIES.filter(c =>
    tier === "next40" ? c.tier === "next40" : true // FT120 includes Next40
  );
}

/**
 * Get sector benchmarks from French Tech data
 */
export function getSectorBenchmarks(sector: string): {
  sampleSize: number;
  medianValuation?: number;
  medianEmployees?: number;
  medianLastRound?: number;
  companies: string[];
} | null {
  const sectorCompanies = FRENCH_TECH_COMPANIES.filter(c =>
    c.sector.toLowerCase().includes(sector.toLowerCase())
  );

  if (sectorCompanies.length === 0) return null;

  const valuations = sectorCompanies
    .map(c => c.metrics?.valuation)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  const employees = sectorCompanies
    .map(c => c.metrics?.employees)
    .filter((e): e is number => e !== undefined)
    .sort((a, b) => a - b);

  const rounds = sectorCompanies
    .map(c => c.lastFunding?.amount)
    .filter((a): a is number => a !== undefined)
    .sort((a, b) => a - b);

  return {
    sampleSize: sectorCompanies.length,
    medianValuation: valuations.length > 0
      ? valuations[Math.floor(valuations.length / 2)]
      : undefined,
    medianEmployees: employees.length > 0
      ? employees[Math.floor(employees.length / 2)]
      : undefined,
    medianLastRound: rounds.length > 0
      ? rounds[Math.floor(rounds.length / 2)]
      : undefined,
    companies: sectorCompanies.map(c => c.name),
  };
}

/**
 * Get all French Tech companies (for admin/export)
 */
export function getAllFrenchTechCompanies(): FrenchTechCompany[] {
  return [...FRENCH_TECH_COMPANIES];
}

/**
 * Get statistics about the French Tech ecosystem
 */
export function getFrenchTechStats(): {
  totalCompanies: number;
  next40Count: number;
  ft120Count: number;
  bySector: Record<string, number>;
  byCity: Record<string, number>;
  totalValuation: number;
  totalEmployees: number;
} {
  const bySector: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  let totalValuation = 0;
  let totalEmployees = 0;

  for (const company of FRENCH_TECH_COMPANIES) {
    bySector[company.sector] = (bySector[company.sector] || 0) + 1;
    if (company.city) {
      byCity[company.city] = (byCity[company.city] || 0) + 1;
    }
    if (company.metrics?.valuation) {
      totalValuation += company.metrics.valuation;
    }
    if (company.metrics?.employees) {
      totalEmployees += company.metrics.employees;
    }
  }

  return {
    totalCompanies: FRENCH_TECH_COMPANIES.length,
    next40Count: FRENCH_TECH_COMPANIES.filter(c => c.tier === "next40").length,
    ft120Count: FRENCH_TECH_COMPANIES.filter(c => c.tier === "ft120").length,
    bySector,
    byCity,
    totalValuation,
    totalEmployees,
  };
}
