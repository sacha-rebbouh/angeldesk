/**
 * Funding Database Service
 *
 * Central service for managing the historical funding rounds database.
 * Handles:
 * - Storing deals from various sources (RSS, APIs, Kaggle)
 * - Deduplication
 * - Querying for similar deals
 * - Progressive accumulation from RSS feeds
 */

import { prisma } from "@/lib/prisma";
import type { FundingRound, Prisma } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface FundingRoundInput {
  companyName: string;
  description?: string;
  website?: string;

  amount?: number;
  amountUsd?: number;
  currency?: string;

  stage?: string;
  geography?: string;
  city?: string;
  region?: string;

  sector?: string;
  subSector?: string;

  investors?: string[];
  leadInvestor?: string;

  valuationPre?: number;
  valuationPost?: number;

  fundingDate?: Date;
  announcedDate?: Date;

  source: string;
  sourceUrl?: string;
  sourceId?: string;

  employeeCount?: number;
  foundedYear?: number;
}

export interface SimilarDealQuery {
  sector?: string;
  stage?: string;
  geography?: string;
  region?: string;
  minAmount?: number;
  maxAmount?: number;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalize company name for deduplication
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalize funding stage
 */
export function normalizeStage(stage: string | null | undefined): string | null {
  if (!stage) return null;

  const stageLower = stage.toLowerCase().replace(/[^a-z0-9]/g, "");

  const mappings: Record<string, string> = {
    preseed: "pre_seed",
    "pre-seed": "pre_seed",
    seed: "seed",
    seriesa: "series_a",
    "series-a": "series_a",
    a: "series_a",
    seriesb: "series_b",
    "series-b": "series_b",
    b: "series_b",
    seriesc: "series_c",
    "series-c": "series_c",
    c: "series_c",
    seriesd: "series_d",
    "series-d": "series_d",
    d: "series_d",
    seriese: "series_e",
    growth: "growth",
    latestage: "late_stage",
    late: "late_stage",
    ipo: "ipo",
    bridge: "bridge",
    extension: "extension",
  };

  return mappings[stageLower] || stage.toLowerCase();
}

/**
 * Normalize sector
 */
export function normalizeSector(sector: string | null | undefined): string | null {
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
    banking: "fintech",
    insurtech: "fintech",
    healthtech: "healthtech",
    health: "healthtech",
    healthcare: "healthtech",
    biotech: "healthtech",
    medtech: "healthtech",
    ai: "ai",
    "artificial intelligence": "ai",
    "machine learning": "ai",
    ml: "ai",
    marketplace: "marketplace",
    "e-commerce": "ecommerce",
    ecommerce: "ecommerce",
    retail: "ecommerce",
    greentech: "greentech",
    cleantech: "greentech",
    climate: "greentech",
    energy: "greentech",
    edtech: "edtech",
    education: "edtech",
    foodtech: "foodtech",
    food: "foodtech",
    agritech: "foodtech",
    proptech: "proptech",
    "real estate": "proptech",
    hrtech: "hrtech",
    hr: "hrtech",
    recruitment: "hrtech",
    logistics: "logistics",
    "supply chain": "logistics",
    mobility: "mobility",
    transport: "mobility",
    automotive: "mobility",
    cybersecurity: "cybersecurity",
    security: "cybersecurity",
    crypto: "crypto",
    blockchain: "crypto",
    web3: "crypto",
    gaming: "gaming",
    games: "gaming",
    deeptech: "deeptech",
    hardware: "deeptech",
    consumer: "consumer",
    social: "consumer",
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(mappings)) {
    if (sectorLower.includes(key)) {
      return value;
    }
  }

  return sectorLower;
}

/**
 * Get region from geography
 */
export function getRegion(geography: string | null | undefined): string | null {
  if (!geography) return null;

  const geoLower = geography.toLowerCase();

  const europeCountries = [
    "france", "germany", "uk", "united kingdom", "spain", "italy",
    "netherlands", "belgium", "sweden", "norway", "denmark", "finland",
    "poland", "portugal", "austria", "switzerland", "ireland",
  ];

  const naCountries = ["usa", "united states", "us", "canada"];

  if (europeCountries.some(c => geoLower.includes(c))) {
    return "europe";
  }

  if (naCountries.some(c => geoLower.includes(c))) {
    return "north_america";
  }

  if (geoLower.includes("israel")) return "israel";
  if (geoLower.includes("india")) return "asia";
  if (geoLower.includes("china")) return "asia";
  if (geoLower.includes("japan")) return "asia";
  if (geoLower.includes("singapore")) return "asia";
  if (geoLower.includes("australia")) return "oceania";

  return null;
}

/**
 * Convert amount to USD
 */
export function convertToUsd(amount: number, currency: string): number {
  // Approximate conversion rates (should use real-time API in production)
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.27,
    CHF: 1.13,
    SEK: 0.095,
    NOK: 0.092,
    DKK: 0.145,
    PLN: 0.25,
    CAD: 0.74,
    AUD: 0.65,
    INR: 0.012,
    CNY: 0.14,
    JPY: 0.0067,
    ILS: 0.27,
  };

  const rate = rates[currency.toUpperCase()] || 1;
  return Math.round(amount * rate);
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Insert or update a funding round
 */
export async function upsertFundingRound(input: FundingRoundInput): Promise<FundingRound | null> {
  try {
    const companySlug = normalizeCompanyName(input.companyName);
    const stageNormalized = normalizeStage(input.stage);
    const sectorNormalized = normalizeSector(input.sector);
    const region = getRegion(input.geography);

    // Calculate USD amount if not provided
    let amountUsd = input.amountUsd;
    if (!amountUsd && input.amount && input.currency) {
      amountUsd = convertToUsd(input.amount, input.currency);
    }

    // Generate sourceId if not provided
    const sourceId = input.sourceId || `${companySlug}_${input.fundingDate?.toISOString().split("T")[0] || Date.now()}`;

    const data: Prisma.FundingRoundCreateInput = {
      companyName: input.companyName,
      companySlug,
      description: input.description,
      website: input.website,
      amount: input.amount,
      amountUsd,
      currency: input.currency || "USD",
      stage: input.stage,
      stageNormalized,
      geography: input.geography,
      city: input.city,
      region,
      sector: input.sector,
      sectorNormalized,
      subSector: input.subSector,
      investors: input.investors || [],
      leadInvestor: input.leadInvestor,
      valuationPre: input.valuationPre,
      valuationPost: input.valuationPost,
      fundingDate: input.fundingDate,
      announcedDate: input.announcedDate,
      source: input.source,
      sourceUrl: input.sourceUrl,
      sourceId,
      employeeCount: input.employeeCount,
      foundedYear: input.foundedYear,
    };

    // Upsert based on source + sourceId
    const result = await prisma.fundingRound.upsert({
      where: {
        source_sourceId: {
          source: input.source,
          sourceId,
        },
      },
      create: data,
      update: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return result;
  } catch (error) {
    console.error("[FundingDB] Error upserting funding round:", error);
    return null;
  }
}

/**
 * Bulk insert funding rounds (for imports)
 */
export async function bulkInsertFundingRounds(
  rounds: FundingRoundInput[],
  options: { skipDuplicates?: boolean } = {}
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0;
  const skipped = 0;
  let errors = 0;

  // Process in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < rounds.length; i += BATCH_SIZE) {
    const batch = rounds.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (round) => {
        try {
          const result = await upsertFundingRound(round);
          return result ? "inserted" : "error";
        } catch {
          return "error";
        }
      })
    );

    inserted += results.filter(r => r === "inserted").length;
    errors += results.filter(r => r === "error").length;

    // Progress log
    if ((i + BATCH_SIZE) % 1000 === 0) {
      console.log(`[FundingDB] Progress: ${i + BATCH_SIZE}/${rounds.length}`);
    }
  }

  return { inserted, skipped, errors };
}

/**
 * Query similar deals
 */
export async function querySimilarDeals(query: SimilarDealQuery): Promise<FundingRound[]> {
  const where: Prisma.FundingRoundWhereInput = {};

  if (query.sector) {
    where.sectorNormalized = normalizeSector(query.sector);
  }

  if (query.stage) {
    where.stageNormalized = normalizeStage(query.stage);
  }

  if (query.geography) {
    where.geography = { contains: query.geography, mode: "insensitive" };
  }

  if (query.region) {
    where.region = query.region.toLowerCase();
  }

  if (query.minAmount || query.maxAmount) {
    where.amountUsd = {};
    if (query.minAmount) where.amountUsd.gte = query.minAmount;
    if (query.maxAmount) where.amountUsd.lte = query.maxAmount;
  }

  if (query.fromDate || query.toDate) {
    where.fundingDate = {};
    if (query.fromDate) where.fundingDate.gte = query.fromDate;
    if (query.toDate) where.fundingDate.lte = query.toDate;
  }

  return prisma.fundingRound.findMany({
    where,
    orderBy: { fundingDate: "desc" },
    take: query.limit || 50,
  });
}

/**
 * Get statistics
 */
export async function getFundingStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
  bySector: Record<string, number>;
  byRegion: Record<string, number>;
  byStage: Record<string, number>;
  dateRange: { oldest: Date | null; newest: Date | null };
}> {
  const [total, bySource, bySector, byRegion, byStage, dateRange] = await Promise.all([
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
      by: ["region"],
      _count: true,
      where: { region: { not: null } },
    }),
    prisma.fundingRound.groupBy({
      by: ["stageNormalized"],
      _count: true,
      where: { stageNormalized: { not: null } },
    }),
    prisma.fundingRound.aggregate({
      _min: { fundingDate: true },
      _max: { fundingDate: true },
    }),
  ]);

  return {
    total,
    bySource: Object.fromEntries(bySource.map(s => [s.source, s._count])),
    bySector: Object.fromEntries(bySector.map(s => [s.sectorNormalized || "unknown", s._count])),
    byRegion: Object.fromEntries(byRegion.map(s => [s.region || "unknown", s._count])),
    byStage: Object.fromEntries(byStage.map(s => [s.stageNormalized || "unknown", s._count])),
    dateRange: {
      oldest: dateRange._min.fundingDate,
      newest: dateRange._max.fundingDate,
    },
  };
}

/**
 * Search by company name
 */
export async function searchByCompany(companyName: string, limit = 10): Promise<FundingRound[]> {
  const slug = normalizeCompanyName(companyName);

  return prisma.fundingRound.findMany({
    where: {
      OR: [
        { companySlug: { contains: slug } },
        { companyName: { contains: companyName, mode: "insensitive" } },
      ],
    },
    orderBy: { fundingDate: "desc" },
    take: limit,
  });
}

/**
 * Get valuation benchmarks
 */
export async function getValuationBenchmarks(query: {
  sector?: string;
  stage?: string;
  region?: string;
}): Promise<{
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  average: number | null;
}> {
  const where: Prisma.FundingRoundWhereInput = {
    amountUsd: { not: null },
  };

  if (query.sector) where.sectorNormalized = normalizeSector(query.sector);
  if (query.stage) where.stageNormalized = normalizeStage(query.stage);
  if (query.region) where.region = query.region.toLowerCase();

  const rounds = await prisma.fundingRound.findMany({
    where,
    select: { amountUsd: true },
    orderBy: { amountUsd: "asc" },
  });

  if (rounds.length === 0) {
    return { count: 0, median: null, p25: null, p75: null, average: null };
  }

  const amounts = rounds.map(r => Number(r.amountUsd)).filter(a => a > 0);
  amounts.sort((a, b) => a - b);

  const count = amounts.length;
  const median = amounts[Math.floor(count / 2)];
  const p25 = amounts[Math.floor(count * 0.25)];
  const p75 = amounts[Math.floor(count * 0.75)];
  const average = amounts.reduce((a, b) => a + b, 0) / count;

  return { count, median, p25, p75, average };
}
