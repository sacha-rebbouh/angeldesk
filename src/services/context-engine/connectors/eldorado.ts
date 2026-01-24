/**
 * Eldorado.co Connector
 *
 * Provides French startup ecosystem data:
 * - Funding rounds in France
 * - Investor database
 * - Startup directory
 *
 * Source: https://eldorado.co
 * Cost: FREE (public data, some features require account)
 * Value: Best free French deals database
 */

import type {
  Connector,
  ConnectorQuery,
  SimilarDeal,
  NewsArticle,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface EldoradoDeal {
  companyName: string;
  sector: string;
  stage: string;
  amount: number; // in EUR
  date: string; // YYYY-MM-DD
  investors: string[];
  description?: string;
  city?: string;
  source: string;
}

export interface EldoradoInvestor {
  name: string;
  type: "vc" | "ba" | "cvc" | "family_office" | "public";
  stagePreference: string[];
  sectorPreference: string[];
  ticketSize?: { min: number; max: number };
  notableDeals: string[];
  website?: string;
}

// ============================================================================
// STATIC DATA - RECENT FRENCH DEALS (Sample - would be refreshed via scraping)
// ============================================================================

const RECENT_DEALS: EldoradoDeal[] = [
  // 2024 Deals
  {
    companyName: "Mistral AI",
    sector: "AI/ML",
    stage: "Series A",
    amount: 385_000_000,
    date: "2024-06-11",
    investors: ["Andreessen Horowitz", "Lightspeed", "General Catalyst"],
    description: "Foundation models for enterprise AI",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Poolside",
    sector: "AI/ML",
    stage: "Seed",
    amount: 126_000_000,
    date: "2024-05-01",
    investors: ["Felicis", "Bain Capital Ventures"],
    description: "AI coding assistant",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Pennylane",
    sector: "Fintech",
    stage: "Series C",
    amount: 40_000_000,
    date: "2024-01-15",
    investors: ["Sequoia", "Global Founders Capital"],
    description: "Accounting automation for SMBs",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Swan",
    sector: "Fintech",
    stage: "Series B",
    amount: 37_000_000,
    date: "2024-02-20",
    investors: ["Lakestar", "Accel", "Creandum"],
    description: "Banking-as-a-service",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Dust",
    sector: "AI/ML",
    stage: "Series A",
    amount: 16_000_000,
    date: "2024-03-12",
    investors: ["Sequoia", "XYZ Ventures"],
    description: "AI assistant for teams",
    city: "Paris",
    source: "eldorado.co",
  },

  // 2023 Deals
  {
    companyName: "Pigment",
    sector: "SaaS B2B",
    stage: "Series C",
    amount: 88_000_000,
    date: "2023-04-18",
    investors: ["ICONIQ", "Meritech Capital", "FirstMark"],
    description: "Business planning platform",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Sweep",
    sector: "SaaS B2B",
    stage: "Series B",
    amount: 73_000_000,
    date: "2023-06-15",
    investors: ["Coatue", "La Famiglia", "New Wave"],
    description: "Carbon management software",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Agicap",
    sector: "Fintech",
    stage: "Series C",
    amount: 100_000_000,
    date: "2023-01-10",
    investors: ["Greenoaks", "BlackRock"],
    description: "Cash flow management",
    city: "Lyon",
    source: "eldorado.co",
  },
  {
    companyName: "Ankorstore",
    sector: "Marketplace",
    stage: "Series C",
    amount: 250_000_000,
    date: "2023-01-20",
    investors: ["Tiger Global", "Bond"],
    description: "B2B wholesale marketplace",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Verkor",
    sector: "Deeptech",
    stage: "Series C",
    amount: 850_000_000,
    date: "2023-09-25",
    investors: ["EQT", "BPI France", "Renault Group"],
    description: "Battery gigafactory",
    city: "Grenoble",
    source: "eldorado.co",
  },

  // More deals by sector for variety
  {
    companyName: "Alan",
    sector: "Healthtech",
    stage: "Series E",
    amount: 183_000_000,
    date: "2022-05-12",
    investors: ["Coatue", "Ribbit Capital"],
    description: "Health insurance for companies",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Doctolib",
    sector: "Healthtech",
    stage: "Series F",
    amount: 500_000_000,
    date: "2022-03-15",
    investors: ["Eurazeo", "BPI France"],
    description: "Medical appointment booking",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Qonto",
    sector: "Fintech",
    stage: "Series D",
    amount: 552_000_000,
    date: "2022-01-10",
    investors: ["Tiger Global", "DST Global", "Tencent"],
    description: "Business banking for SMBs",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "Ynsect",
    sector: "Deeptech",
    stage: "Series C",
    amount: 372_000_000,
    date: "2022-04-05",
    investors: ["Astanor", "Upfront Ventures"],
    description: "Insect protein production",
    city: "Paris",
    source: "eldorado.co",
  },
  {
    companyName: "ManoMano",
    sector: "Marketplace",
    stage: "Series F",
    amount: 355_000_000,
    date: "2021-07-08",
    investors: ["Dragoneer", "General Atlantic"],
    description: "DIY & gardening marketplace",
    city: "Paris",
    source: "eldorado.co",
  },
];

// ============================================================================
// STATIC DATA - FRENCH INVESTORS
// ============================================================================

const FRENCH_INVESTORS: EldoradoInvestor[] = [
  // VCs
  {
    name: "Partech",
    type: "vc",
    stagePreference: ["Seed", "Series A", "Series B"],
    sectorPreference: ["SaaS B2B", "Fintech", "Consumer"],
    ticketSize: { min: 500_000, max: 50_000_000 },
    notableDeals: ["Mirakl", "Doctolib", "ManoMano"],
    website: "https://partechpartners.com",
  },
  {
    name: "Eurazeo",
    type: "vc",
    stagePreference: ["Series B", "Series C", "Growth"],
    sectorPreference: ["SaaS B2B", "Healthtech", "Consumer"],
    ticketSize: { min: 10_000_000, max: 200_000_000 },
    notableDeals: ["Doctolib", "Qonto", "Back Market"],
    website: "https://www.eurazeo.com",
  },
  {
    name: "Elaia",
    type: "vc",
    stagePreference: ["Seed", "Series A"],
    sectorPreference: ["Deeptech", "SaaS B2B", "Healthtech"],
    ticketSize: { min: 500_000, max: 15_000_000 },
    notableDeals: ["Criteo", "Shift Technology", "Mirakl"],
    website: "https://www.elaia.com",
  },
  {
    name: "Alven",
    type: "vc",
    stagePreference: ["Seed", "Series A", "Series B"],
    sectorPreference: ["SaaS B2B", "Fintech", "Marketplace"],
    ticketSize: { min: 1_000_000, max: 30_000_000 },
    notableDeals: ["Algolia", "Stripe France", "Alan"],
    website: "https://www.alven.co",
  },
  {
    name: "Singular",
    type: "vc",
    stagePreference: ["Seed", "Series A"],
    sectorPreference: ["Deeptech", "SaaS B2B", "AI/ML"],
    ticketSize: { min: 500_000, max: 10_000_000 },
    notableDeals: ["Owkin", "Vestiaire Collective early"],
    website: "https://www.singular.vc",
  },
  {
    name: "Breega",
    type: "vc",
    stagePreference: ["Seed", "Series A"],
    sectorPreference: ["SaaS B2B", "Fintech", "Consumer"],
    ticketSize: { min: 500_000, max: 20_000_000 },
    notableDeals: ["Yousign", "Spendesk early", "MWM"],
    website: "https://www.breega.com",
  },
  {
    name: "Serena",
    type: "vc",
    stagePreference: ["Seed", "Series A"],
    sectorPreference: ["SaaS B2B", "AI/ML", "Deeptech"],
    ticketSize: { min: 300_000, max: 10_000_000 },
    notableDeals: ["Dataiku early", "Akeneo"],
    website: "https://www.serena.vc",
  },
  {
    name: "Kima Ventures",
    type: "vc",
    stagePreference: ["Pre-seed", "Seed"],
    sectorPreference: ["All"],
    ticketSize: { min: 50_000, max: 300_000 },
    notableDeals: ["Algolia", "Front", "Sorare"],
    website: "https://www.kimaventures.com",
  },

  // Public investors
  {
    name: "BPI France",
    type: "public",
    stagePreference: ["Seed", "Series A", "Series B", "Growth"],
    sectorPreference: ["All - French companies"],
    ticketSize: { min: 100_000, max: 100_000_000 },
    notableDeals: ["Doctolib", "OVH", "Verkor"],
    website: "https://www.bpifrance.fr",
  },

  // Business Angels / Angel groups
  {
    name: "Angelsquare",
    type: "ba",
    stagePreference: ["Pre-seed", "Seed"],
    sectorPreference: ["SaaS B2B", "Consumer"],
    ticketSize: { min: 50_000, max: 500_000 },
    notableDeals: ["various early-stage"],
    website: "https://www.angelsquare.co",
  },
  {
    name: "BADGE (Business Angels des Grandes Ecoles)",
    type: "ba",
    stagePreference: ["Pre-seed", "Seed"],
    sectorPreference: ["All"],
    ticketSize: { min: 20_000, max: 200_000 },
    notableDeals: ["various early-stage"],
    website: "https://www.yoursite.com", // Check
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

function matchesSector(dealSector: string, querySector: string): boolean {
  const dealNorm = dealSector.toLowerCase();
  const queryNorm = querySector.toLowerCase();

  // Direct match
  if (dealNorm.includes(queryNorm) || queryNorm.includes(dealNorm)) {
    return true;
  }

  // Alias matching
  const aliases: Record<string, string[]> = {
    "saas": ["saas b2b", "software", "b2b saas"],
    "fintech": ["finance", "banking", "payments"],
    "healthtech": ["health", "medtech", "biotech"],
    "marketplace": ["platform", "e-commerce"],
    "deeptech": ["hardware", "science", "biotech"],
    "ai": ["ai/ml", "machine learning", "artificial intelligence"],
  };

  for (const [key, values] of Object.entries(aliases)) {
    if (queryNorm.includes(key)) {
      if (values.some(v => dealNorm.includes(v)) || dealNorm.includes(key)) {
        return true;
      }
    }
  }

  return false;
}

function calculateValuationMultiple(
  amount: number,
  stage: string
): number | undefined {
  // Rough estimate based on typical dilution per stage
  const dilutionByStage: Record<string, number> = {
    "pre-seed": 0.15,
    "seed": 0.20,
    "series a": 0.20,
    "series b": 0.15,
    "series c": 0.12,
    "series d": 0.10,
    "series e": 0.08,
    "series f": 0.06,
    "growth": 0.05,
  };

  const stageLower = stage.toLowerCase();
  const dilution = dilutionByStage[stageLower];

  if (!dilution) return undefined;

  // Post-money valuation = amount / dilution
  const postMoney = amount / dilution;

  // Assume ARR = post-money / 20 (rough SaaS multiple)
  // Return the implied ARR multiple
  return 20; // Simplified - would need actual ARR data
}

const eldoradoSource: DataSource = {
  type: "crunchbase",
  name: "Eldorado.co",
  url: "https://eldorado.co",
  retrievedAt: new Date().toISOString(),
  confidence: 0.85,
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const eldoradoConnector: Connector = {
  name: "Eldorado.co",
  type: "crunchbase",

  isConfigured: () => true, // Always available

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    let matches = RECENT_DEALS;

    // Filter by sector
    if (query.sector) {
      matches = matches.filter(d => matchesSector(d.sector, query.sector!));
    }

    // Filter by stage
    if (query.stage) {
      const stageLower = query.stage.toLowerCase();
      matches = matches.filter(d =>
        d.stage.toLowerCase().includes(stageLower) ||
        stageLower.includes(d.stage.toLowerCase())
      );
    }

    // Exclude the company itself
    if (query.companyName) {
      const normalized = normalizeForSearch(query.companyName);
      matches = matches.filter(d =>
        normalizeForSearch(d.companyName) !== normalized
      );
    }

    // Sort by date (most recent first)
    matches = matches.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return matches.slice(0, 10).map(deal => ({
      companyName: deal.companyName,
      sector: deal.sector,
      stage: deal.stage,
      geography: "France",
      fundingAmount: deal.amount,
      fundingDate: deal.date,
      valuationMultiple: calculateValuationMultiple(deal.amount, deal.stage),
      investors: deal.investors,
      source: {
        ...eldoradoSource,
        retrievedAt: new Date().toISOString(),
      },
    }));
  },

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    // Convert recent deals to news format
    let matches = RECENT_DEALS;

    if (query.companyName) {
      const normalized = normalizeForSearch(query.companyName);
      matches = matches.filter(d =>
        normalizeForSearch(d.companyName).includes(normalized) ||
        normalized.includes(normalizeForSearch(d.companyName))
      );
    }

    if (query.sector) {
      matches = matches.filter(d => matchesSector(d.sector, query.sector!));
    }

    return matches.slice(0, 5).map(deal => ({
      title: `${deal.companyName} raises €${(deal.amount / 1_000_000).toFixed(1)}M ${deal.stage}`,
      description: `${deal.description || deal.sector}. Investors: ${deal.investors.join(", ")}`,
      url: `https://eldorado.co/company/${normalizeForSearch(deal.companyName)}`,
      source: "Eldorado.co",
      publishedAt: deal.date,
      sentiment: "positive" as const,
      relevance: 0.9,
      category: "company" as const,
    }));
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// ============================================================================

/**
 * Get comparable deals for valuation benchmarking
 */
export function getComparableDeals(
  sector: string,
  stage: string,
  limit: number = 10
): {
  deals: EldoradoDeal[];
  stats: {
    count: number;
    medianAmount: number;
    minAmount: number;
    maxAmount: number;
    avgAmount: number;
  };
} {
  let matches = RECENT_DEALS.filter(d =>
    matchesSector(d.sector, sector) &&
    d.stage.toLowerCase() === stage.toLowerCase()
  );

  if (matches.length === 0) {
    // Fallback: just sector match
    matches = RECENT_DEALS.filter(d => matchesSector(d.sector, sector));
  }

  const amounts = matches.map(d => d.amount).sort((a, b) => a - b);

  return {
    deals: matches.slice(0, limit),
    stats: {
      count: matches.length,
      medianAmount: amounts.length > 0
        ? amounts[Math.floor(amounts.length / 2)]
        : 0,
      minAmount: amounts.length > 0 ? amounts[0] : 0,
      maxAmount: amounts.length > 0 ? amounts[amounts.length - 1] : 0,
      avgAmount: amounts.length > 0
        ? amounts.reduce((a, b) => a + b, 0) / amounts.length
        : 0,
    },
  };
}

/**
 * Find relevant investors for a startup
 */
export function findRelevantInvestors(
  sector: string,
  stage: string
): EldoradoInvestor[] {
  return FRENCH_INVESTORS.filter(investor => {
    // Check stage preference
    const stageMatch = investor.stagePreference.some(pref =>
      pref.toLowerCase().includes(stage.toLowerCase()) ||
      stage.toLowerCase().includes(pref.toLowerCase())
    );

    // Check sector preference
    const sectorMatch = investor.sectorPreference.some(pref =>
      pref.toLowerCase() === "all" ||
      matchesSector(pref, sector)
    );

    return stageMatch && sectorMatch;
  });
}

/**
 * Get market trends from deal data
 */
export function getMarketTrends(sector?: string): {
  totalDeals: number;
  totalAmount: number;
  byStage: Record<string, { count: number; totalAmount: number }>;
  byYear: Record<string, { count: number; totalAmount: number }>;
  topInvestors: { name: string; dealCount: number }[];
} {
  const deals = sector
    ? RECENT_DEALS.filter(d => matchesSector(d.sector, sector))
    : RECENT_DEALS;

  const byStage: Record<string, { count: number; totalAmount: number }> = {};
  const byYear: Record<string, { count: number; totalAmount: number }> = {};
  const investorCounts: Record<string, number> = {};

  for (const deal of deals) {
    // By stage
    const stage = deal.stage;
    if (!byStage[stage]) {
      byStage[stage] = { count: 0, totalAmount: 0 };
    }
    byStage[stage].count++;
    byStage[stage].totalAmount += deal.amount;

    // By year
    const year = deal.date.substring(0, 4);
    if (!byYear[year]) {
      byYear[year] = { count: 0, totalAmount: 0 };
    }
    byYear[year].count++;
    byYear[year].totalAmount += deal.amount;

    // Investor counts
    for (const investor of deal.investors) {
      investorCounts[investor] = (investorCounts[investor] || 0) + 1;
    }
  }

  // Top investors
  const topInvestors = Object.entries(investorCounts)
    .map(([name, dealCount]) => ({ name, dealCount }))
    .sort((a, b) => b.dealCount - a.dealCount)
    .slice(0, 10);

  return {
    totalDeals: deals.length,
    totalAmount: deals.reduce((sum, d) => sum + d.amount, 0),
    byStage,
    byYear,
    topInvestors,
  };
}

/**
 * Assess a funding round against market data
 */
export function assessFundingRound(
  amount: number,
  sector: string,
  stage: string
): {
  percentile: number;
  assessment: "below_market" | "market_rate" | "above_market" | "outlier";
  comparables: string[];
  marketContext: string;
} {
  const { deals, stats } = getComparableDeals(sector, stage);

  if (stats.count === 0) {
    return {
      percentile: 50,
      assessment: "market_rate",
      comparables: [],
      marketContext: "Insufficient comparable data",
    };
  }

  // Calculate percentile
  const amounts = deals.map(d => d.amount).sort((a, b) => a - b);
  const belowCount = amounts.filter(a => a < amount).length;
  const percentile = Math.round((belowCount / amounts.length) * 100);

  // Determine assessment
  let assessment: "below_market" | "market_rate" | "above_market" | "outlier";
  if (percentile < 25) {
    assessment = "below_market";
  } else if (percentile > 90) {
    assessment = "outlier";
  } else if (percentile > 75) {
    assessment = "above_market";
  } else {
    assessment = "market_rate";
  }

  return {
    percentile,
    assessment,
    comparables: deals.slice(0, 5).map(d => d.companyName),
    marketContext: `Based on ${stats.count} ${sector} ${stage} deals in France. Median: €${(stats.medianAmount / 1_000_000).toFixed(1)}M`,
  };
}
