/**
 * Funding Database Connector
 *
 * Provides access to our internal funding rounds database for:
 * - Finding comparable deals
 * - Valuation benchmarks
 * - Market trends
 * - Similar company analysis
 *
 * Database contains 1,500+ deals from:
 * - FrenchWeb (France)
 * - Maddyness (France)
 * - EU-Startups (Europe)
 * - Tech.eu (Europe)
 * - US RSS feeds (TechCrunch, Crunchbase News, VentureBeat)
 */

import { prisma } from "@/lib/prisma";
import type {
  Connector,
  ConnectorQuery,
  SimilarDeal,
  MarketData,
  SectorBenchmark,
  DataSource,
} from "../types";

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeSector(sector: string | undefined): string | null {
  if (!sector) return null;

  const sectorLower = sector.toLowerCase();

  const mappings: Record<string, string> = {
    saas: "saas",
    "saas b2b": "saas",
    "b2b saas": "saas",
    software: "saas",
    fintech: "fintech",
    finance: "fintech",
    payments: "fintech",
    healthtech: "healthtech",
    health: "healthtech",
    healthcare: "healthtech",
    ai: "ai",
    "artificial intelligence": "ai",
    "machine learning": "ai",
    marketplace: "marketplace",
    "e-commerce": "ecommerce",
    ecommerce: "ecommerce",
    retail: "ecommerce",
    greentech: "greentech",
    cleantech: "greentech",
    climate: "greentech",
    edtech: "edtech",
    education: "edtech",
    foodtech: "foodtech",
    food: "foodtech",
    proptech: "proptech",
    "real estate": "proptech",
    hrtech: "hrtech",
    logistics: "logistics",
    mobility: "mobility",
    cybersecurity: "cybersecurity",
    crypto: "crypto",
    blockchain: "crypto",
    gaming: "gaming",
    deeptech: "deeptech",
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (sectorLower.includes(key)) {
      return value;
    }
  }

  return sectorLower;
}

function normalizeStage(stage: string | undefined): string | null {
  if (!stage) return null;

  const stageLower = stage.toLowerCase().replace(/[^a-z0-9]/g, "");

  const mappings: Record<string, string> = {
    preseed: "pre_seed",
    seed: "seed",
    seriesa: "series_a",
    seriesb: "series_b",
    seriesc: "series_c",
    seriesd: "series_d",
    growth: "growth",
    latestage: "late_stage",
  };

  return mappings[stageLower] || stage.toLowerCase();
}

// ============================================================================
// INTERNAL QUERY FUNCTIONS
// ============================================================================

interface InternalDeal {
  companyName: string;
  amount: number | null;
  amountUsd: number | null;
  currency: string;
  stage: string | null;
  geography: string | null;
  sector: string | null;
  fundingDate: Date | null;
  source: string;
  sourceUrl: string | null;
}

async function findComparableDeals(params: {
  sector?: string;
  stage?: string;
  geography?: string;
  region?: string;
  limit?: number;
}): Promise<InternalDeal[]> {
  const where: Record<string, unknown> = {
    amountUsd: { not: null },
  };

  if (params.sector) {
    where.sectorNormalized = normalizeSector(params.sector);
  }

  if (params.stage) {
    where.stageNormalized = normalizeStage(params.stage);
  }

  if (params.geography) {
    where.geography = { contains: params.geography, mode: "insensitive" };
  }

  if (params.region) {
    where.region = params.region.toLowerCase();
  }

  const deals = await prisma.fundingRound.findMany({
    where,
    orderBy: { fundingDate: "desc" },
    take: params.limit || 50,
    select: {
      companyName: true,
      amount: true,
      amountUsd: true,
      currency: true,
      stage: true,
      geography: true,
      sector: true,
      fundingDate: true,
      source: true,
      sourceUrl: true,
    },
  });

  return deals.map(d => ({
    companyName: d.companyName,
    amount: d.amount != null ? Number(d.amount) : null,
    amountUsd: d.amountUsd != null ? Number(d.amountUsd) : null,
    currency: d.currency,
    stage: d.stage,
    geography: d.geography,
    sector: d.sector,
    fundingDate: d.fundingDate,
    source: d.source,
    sourceUrl: d.sourceUrl,
  }));
}

interface InternalStageBenchmark {
  stage: string;
  count: number;
  avgAmount: number;
  medianAmount: number;
  p25: number;
  p75: number;
}

async function getStageBenchmarks(stage?: string): Promise<InternalStageBenchmark[]> {
  const where: Record<string, unknown> = {
    amountUsd: { not: null },
    stageNormalized: { not: null },
  };

  if (stage) {
    where.stageNormalized = normalizeStage(stage);
  }

  // SINGLE QUERY: Fetch all amounts with their stages at once (avoids N+1)
  const allRounds = await prisma.fundingRound.findMany({
    where,
    select: { stageNormalized: true, amountUsd: true },
    orderBy: { amountUsd: "asc" },
  });

  // Group amounts by stage in memory
  const amountsByStage = new Map<string, number[]>();
  for (const round of allRounds) {
    if (!round.stageNormalized || !round.amountUsd) continue;
    const amount = Number(round.amountUsd);
    if (amount <= 0) continue;

    const existing = amountsByStage.get(round.stageNormalized) || [];
    existing.push(amount);
    amountsByStage.set(round.stageNormalized, existing);
  }

  // Calculate benchmarks from grouped data
  const benchmarks: InternalStageBenchmark[] = [];

  for (const [stageKey, values] of amountsByStage.entries()) {
    // Values are already sorted because of orderBy above
    const count = values.length;
    if (count === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);

    benchmarks.push({
      stage: stageKey,
      count,
      avgAmount: sum / count,
      medianAmount: values[Math.floor(count / 2)],
      p25: values[Math.floor(count * 0.25)],
      p75: values[Math.floor(count * 0.75)],
    });
  }

  return benchmarks;
}

// ============================================================================
// CONNECTOR
// ============================================================================

export const fundingDbConnector: Connector = {
  name: "funding_db",
  type: "database",

  isConfigured(): boolean {
    return true; // Always available - internal DB
  },

  async searchSimilarDeals(query: ConnectorQuery): Promise<SimilarDeal[]> {
    try {
      const deals = await findComparableDeals({
        sector: query.sector,
        stage: query.stage,
        geography: query.geography,
        limit: 50,
      });

      const now = new Date().toISOString();

      return deals
        .filter(d => d.amountUsd && d.amountUsd > 0)
        .map(d => {
          const source: DataSource = {
            name: `Funding Database (${d.source})`,
            type: "database",
            url: d.sourceUrl || undefined,
            retrievedAt: now,
            confidence: 0.85,
          };

          return {
            companyName: d.companyName,
            sector: d.sector || query.sector || "Unknown",
            stage: d.stage || query.stage || "Unknown",
            geography: d.geography || query.geography || "Unknown",
            fundingAmount: d.amountUsd || 0,
            fundingDate: d.fundingDate?.toISOString() || now,
            investors: [], // We don't store investor names in our DB
            source,
          };
        });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[FundingDB] Error searching similar deals:", error);
      }
      return [];
    }
  },

  async getMarketData(query: ConnectorQuery): Promise<MarketData> {
    try {
      const stageBenchmarks = await getStageBenchmarks(query.stage);
      const now = new Date().toISOString();

      const benchmarks: SectorBenchmark[] = stageBenchmarks.map(sb => ({
        metricName: "Funding Amount",
        p25: sb.p25,
        median: sb.medianAmount,
        p75: sb.p75,
        unit: "EUR",
        sector: query.sector || "all",
        stage: sb.stage,
        source: {
          name: "Funding Database",
          type: "database",
          retrievedAt: now,
          confidence: 0.85,
        },
        lastUpdated: now,
      }));

      // Build trends from data
      const relevantBenchmark = stageBenchmarks.find(
        sb => sb.stage === normalizeStage(query.stage)
      );

      const trends = relevantBenchmark
        ? [
            {
              title: `${relevantBenchmark.count} comparable ${query.stage || "stage"} deals`,
              description: `Based on ${relevantBenchmark.count} funding rounds in our database. Median raise: €${(relevantBenchmark.medianAmount / 1_000_000).toFixed(1)}M`,
              impact: "neutral" as const,
              relevance: 0.9,
              source: {
                name: "Funding Database",
                type: "database" as const,
                retrievedAt: now,
                confidence: 0.85,
              },
              date: now,
            },
          ]
        : [];

      return {
        benchmarks,
        trends,
      };
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[FundingDB] Error getting market data:", error);
      }
      return {
        benchmarks: [],
        trends: [],
      };
    }
  },
};

// ============================================================================
// STANDALONE EXPORTS FOR DIRECT USE
// ============================================================================

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
  bySector: Record<string, number>;
  byStage: Record<string, number>;
  byRegion: Record<string, number>;
}> {
  const [total, bySource, bySector, byStage, byRegion] = await Promise.all([
    prisma.fundingRound.count(),
    prisma.fundingRound.groupBy({
      by: ["source"],
      _count: true,
    }),
    prisma.fundingRound.groupBy({
      by: ["sectorNormalized"],
      _count: true,
      where: { sectorNormalized: { not: null } },
    }),
    prisma.fundingRound.groupBy({
      by: ["stageNormalized"],
      _count: true,
      where: { stageNormalized: { not: null } },
    }),
    prisma.fundingRound.groupBy({
      by: ["region"],
      _count: true,
      where: { region: { not: null } },
    }),
  ]);

  return {
    total,
    bySource: Object.fromEntries(bySource.map(s => [s.source, s._count])),
    bySector: Object.fromEntries(bySector.map(s => [s.sectorNormalized || "unknown", s._count])),
    byStage: Object.fromEntries(byStage.map(s => [s.stageNormalized || "unknown", s._count])),
    byRegion: Object.fromEntries(byRegion.map(s => [s.region || "unknown", s._count])),
  };
}

/**
 * Search for a specific company in our database
 */
export async function searchCompanyFunding(companyName: string): Promise<InternalDeal[]> {
  const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

  const deals = await prisma.fundingRound.findMany({
    where: {
      OR: [
        { companySlug: { contains: companySlug } },
        { companyName: { contains: companyName, mode: "insensitive" } },
      ],
    },
    orderBy: { fundingDate: "desc" },
    take: 10,
    select: {
      companyName: true,
      amount: true,
      amountUsd: true,
      currency: true,
      stage: true,
      geography: true,
      sector: true,
      fundingDate: true,
      source: true,
      sourceUrl: true,
    },
  });

  return deals.map(d => ({
    companyName: d.companyName,
    amount: d.amount != null ? Number(d.amount) : null,
    amountUsd: d.amountUsd != null ? Number(d.amountUsd) : null,
    currency: d.currency,
    stage: d.stage,
    geography: d.geography,
    sector: d.sector,
    fundingDate: d.fundingDate,
    source: d.source,
    sourceUrl: d.sourceUrl,
  }));
}
