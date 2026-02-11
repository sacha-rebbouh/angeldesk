/**
 * Analysis Cache Service
 *
 * Caches complete analysis results to avoid re-running expensive LLM calls
 * when the deal hasn't changed.
 *
 * Strategy:
 * 1. Generate a "fingerprint" of the deal (hash of relevant fields)
 * 2. Before running analysis, check if a valid cached result exists
 * 3. If fingerprint matches and analysis is recent enough, return cached result
 * 4. If deal changes (new fingerprint), previous cache is automatically invalid
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Deal, Document, Founder, Analysis } from "@prisma/client";

// Cache TTL: 24 hours (analysis results are expensive, keep them longer)
const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Types
type DealWithRelations = Deal & {
  documents: Pick<Document, "id" | "extractedText" | "processingStatus">[];
  founders: Pick<Founder, "id" | "name" | "role">[];
};

export interface CachedAnalysisResult {
  analysis: Analysis;
  fromCache: true;
  cacheAge: number; // ms since analysis was created
}

export interface AnalysisCacheLookupResult {
  found: boolean;
  analysis?: Analysis;
  cacheAge?: number;
  reason?: "fingerprint_mismatch" | "expired" | "not_found" | "incomplete";
}

/**
 * Generate a fingerprint for a deal
 *
 * Includes all fields that would affect analysis results:
 * - Deal metadata (name, sector, stage, etc.)
 * - Financial metrics
 * - Document content (extracted text)
 * - Founder info
 */
export function generateDealFingerprint(deal: DealWithRelations): string {
  const data = {
    // Core deal info
    name: deal.name,
    companyName: deal.companyName,
    description: deal.description,
    website: deal.website,
    sector: deal.sector,
    stage: deal.stage,
    geography: deal.geography,

    // Financial metrics
    arr: deal.arr?.toString(),
    growthRate: deal.growthRate?.toString(),
    amountRequested: deal.amountRequested?.toString(),
    valuationPre: deal.valuationPre?.toString(),

    // Documents (sorted by ID for consistency)
    documents: deal.documents
      .filter((d) => d.processingStatus === "COMPLETED")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => ({
        id: d.id,
        // Use first 1000 chars of extracted text for fingerprint
        // Full text would make fingerprint too large
        textPreview: d.extractedText?.slice(0, 1000) ?? null,
      })),

    // Founders (sorted by name for consistency)
    founders: deal.founders
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({
        name: f.name,
        role: f.role,
      })),

    // Timestamp of last deal update
    updatedAt: deal.updatedAt.toISOString(),
  };

  // Create SHA-256 hash
  const hash = createHash("sha256");
  hash.update(JSON.stringify(data));
  return hash.digest("hex").slice(0, 32); // Use first 32 chars
}

/**
 * Look up a cached analysis for a deal
 */
export async function lookupCachedAnalysis(
  dealId: string,
  mode: string,
  fingerprint: string
): Promise<AnalysisCacheLookupResult> {
  // Find most recent completed analysis for this deal + mode
  const analysis = await prisma.analysis.findFirst({
    where: {
      dealId,
      mode,
      status: "COMPLETED",
    },
    orderBy: {
      completedAt: "desc",
    },
  });

  if (!analysis) {
    return { found: false, reason: "not_found" };
  }

  // Check if fingerprint matches
  if (analysis.dealFingerprint !== fingerprint) {
    console.log(
      `[AnalysisCache] Fingerprint mismatch for deal ${dealId}: ` +
        `cached=${analysis.dealFingerprint?.slice(0, 8)}... vs current=${fingerprint.slice(0, 8)}...`
    );
    return { found: false, reason: "fingerprint_mismatch" };
  }

  // Check if cache is expired
  const cacheAge = Date.now() - (analysis.completedAt?.getTime() ?? 0);
  if (cacheAge > ANALYSIS_CACHE_TTL_MS) {
    console.log(
      `[AnalysisCache] Cache expired for deal ${dealId}: age=${Math.round(cacheAge / 1000 / 60)}min`
    );
    return { found: false, reason: "expired" };
  }

  // Check if analysis has results
  if (!analysis.results) {
    return { found: false, reason: "incomplete" };
  }

  console.log(
    `[AnalysisCache] Cache HIT for deal ${dealId}, mode=${mode}: ` +
      `age=${Math.round(cacheAge / 1000 / 60)}min, cost=$${analysis.totalCost}`
  );

  return {
    found: true,
    analysis,
    cacheAge,
  };
}

/**
 * Get deal with relations needed for fingerprint
 */
export async function getDealForFingerprint(
  dealId: string
): Promise<DealWithRelations | null> {
  return prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      documents: {
        select: {
          id: true,
          extractedText: true,
          processingStatus: true,
        },
      },
      founders: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  });
}

/**
 * Invalidate all cached analyses for a deal
 *
 * Call this when you want to force re-analysis even if deal hasn't changed
 */
export async function invalidateDealAnalysisCache(dealId: string): Promise<number> {
  const result = await prisma.analysis.updateMany({
    where: {
      dealId,
      status: "COMPLETED",
    },
    data: {
      // Setting fingerprint to null invalidates the cache
      dealFingerprint: null,
    },
  });

  console.log(`[AnalysisCache] Invalidated ${result.count} analyses for deal ${dealId}`);
  return result.count;
}

/**
 * Get cache statistics for a deal
 */
export async function getDealCacheStats(dealId: string) {
  const analyses = await prisma.analysis.findMany({
    where: {
      dealId,
      status: "COMPLETED",
    },
    select: {
      mode: true,
      dealFingerprint: true,
      completedAt: true,
      totalCost: true,
      totalTimeMs: true,
    },
    orderBy: {
      completedAt: "desc",
    },
  });

  const now = Date.now();

  return {
    totalAnalyses: analyses.length,
    byMode: analyses.reduce(
      (acc, a) => {
        const key = `${a.mode ?? "unknown"}`;
        if (!acc[key]) {
          acc[key] = {
            count: 0,
            latestAge: 0,
            totalCost: 0,
            hasValidCache: false,
          };
        }
        acc[key].count++;
        const age = now - (a.completedAt?.getTime() ?? 0);
        if (acc[key].latestAge === 0 || age < acc[key].latestAge) {
          acc[key].latestAge = age;
          acc[key].hasValidCache = a.dealFingerprint !== null && age < ANALYSIS_CACHE_TTL_MS;
        }
        acc[key].totalCost += Number(a.totalCost ?? 0);
        return acc;
      },
      {} as Record<
        string,
        { count: number; latestAge: number; totalCost: number; hasValidCache: boolean }
      >
    ),
  };
}
