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
import type { Deal, Document, Founder } from "@prisma/client";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";
import { loadResults } from "@/services/analysis-results/load-results";

// Cache TTL: 24 hours (analysis results are expensive, keep them longer)
const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Types
type DealWithRelations = Deal & {
  documents: (Pick<
    Document,
    | "id"
    | "extractedText"
    | "processingStatus"
    | "uploadedAt"
    // B6.1 fix-up (Codex P1) — every Document field that affects agent
    // context MUST be in the fingerprint. Otherwise a user-correction
    // (B6.1 manual sourceDate; B6.2 type/sourceKind; B6.3 email
    // metadata) re-triggers analysis but lands a stale cache built with
    // the OLD value. Anchored on the orchestrator's select shape
    // (src/agents/orchestrator/persistence.ts:681-700) so the two
    // surfaces never drift.
    | "name"
    | "type"
    | "sourceKind"
    | "corpusRole"
    | "sourceDate"
    | "receivedAt"
    | "sourceAuthor"
    | "sourceSubject"
    | "corpusParentDocumentId"
  > & {
    extractionRuns?: Array<{
      id: string;
      documentVersion: number;
      contentHash: string | null;
      corpusTextHash: string | null;
      status: string;
      readyForAnalysis: boolean;
      completedAt: Date | null;
    }>;
  })[];
  founders: Pick<Founder, "id" | "name" | "role">[];
  currentFacts: CurrentFact[];
};

type CachedAnalysisRecord = {
  id: string;
  status: string;
  totalCost: number | { toString(): string } | null;
  totalTimeMs: number | null;
  summary: string | null;
  completedAt: Date | null;
  dealFingerprint: string | null;
};

export interface AnalysisCacheLookupResult {
  found: boolean;
  analysis?: CachedAnalysisRecord;
  results?: Record<string, unknown>;
  cacheAge?: number;
  reason?: "fingerprint_mismatch" | "expired" | "not_found" | "incomplete";
}

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

function getCurrentFactString(
  factMap: Map<string, CurrentFact>,
  factKey: string
): string | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string") return fact.currentValue;
  if (typeof fact.currentDisplayValue === "string" && fact.currentDisplayValue.length > 0) {
    return fact.currentDisplayValue;
  }
  return null;
}

function getCurrentFactNumber(
  factMap: Map<string, CurrentFact>,
  factKey: string
): number | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "number" && Number.isFinite(fact.currentValue)) {
    return fact.currentValue;
  }
  if (typeof fact.currentValue === "string") {
    const parsed = Number(fact.currentValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
/**
 * Phase 5.1 (Codex round 15 P2) — fingerprint inputs for EvidenceSignal so a
 * new attachment / temporal signal invalidates the analysis cache. Caller is
 * responsible for fetching from the DB.
 */
export interface EvidenceSignalFingerprintInput {
  documentId: string;
  signalScopeKey: string;
  kind: string;
  signalHash: string;
  extractorVersion: string;
}

export function generateDealFingerprint(
  deal: DealWithRelations,
  evidenceSignals: EvidenceSignalFingerprintInput[] = []
): string {
  const factMap = buildCurrentFactMap(deal.currentFacts);

  const data = {
    // Core deal info
    name: deal.name,
    companyName: getCurrentFactString(factMap, "company.name") ?? deal.companyName,
    description: deal.description,
    website: getCurrentFactString(factMap, "other.website") ?? deal.website,
    sector: deal.sector,
    stage: deal.stage,
    geography: deal.geography,

    // Financial metrics
    arr:
      getCurrentFactNumber(factMap, "financial.arr")?.toString() ??
      deal.arr?.toString(),
    growthRate:
      getCurrentFactNumber(factMap, "financial.revenue_growth_yoy")?.toString() ??
      deal.growthRate?.toString(),
    amountRequested:
      getCurrentFactNumber(factMap, "financial.amount_raising")?.toString() ??
      deal.amountRequested?.toString(),
    valuationPre:
      getCurrentFactNumber(factMap, "financial.valuation_pre")?.toString() ??
      deal.valuationPre?.toString(),

    // Documents (sorted by ID for consistency)
    documents: deal.documents
      .filter((d) => d.processingStatus === "COMPLETED")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => ({
        id: d.id,
        uploadedAt: d.uploadedAt.toISOString(),
        // B6.1 fix-up (Codex P1) — agent-visible metadata that affects
        // chronology / attribution / corpus role. Each field surfaces
        // in the orchestrator's context payload AND in agent-facing
        // system prompts (via base-agent.ts:998-1000 timeline +
        // persistence.ts:681 select). Any user override (B6.1
        // sourceDate, B6.2 type/sourceKind, B6.3 email metadata) MUST
        // invalidate the analysis cache — anchored here.
        name: d.name,
        type: d.type,
        sourceKind: d.sourceKind,
        corpusRole: d.corpusRole,
        sourceDate: d.sourceDate ? d.sourceDate.toISOString() : null,
        receivedAt: d.receivedAt ? d.receivedAt.toISOString() : null,
        sourceAuthor: d.sourceAuthor,
        sourceSubject: d.sourceSubject,
        corpusParentDocumentId: d.corpusParentDocumentId,
        latestExtractionRun: d.extractionRuns?.[0]
          ? {
              id: d.extractionRuns[0].id,
              documentVersion: d.extractionRuns[0].documentVersion,
              contentHash: d.extractionRuns[0].contentHash,
              corpusTextHash: d.extractionRuns[0].corpusTextHash,
              status: d.extractionRuns[0].status,
              readyForAnalysis: d.extractionRuns[0].readyForAnalysis,
              completedAt: d.extractionRuns[0].completedAt?.toISOString() ?? null,
            }
          : null,
        corpusFingerprint:
          d.extractionRuns?.[0]?.corpusTextHash ??
          (d.extractedText
            ? createHash("sha256").update(d.extractedText, "utf8").digest("hex")
            : null),
      })),

    // Founders (sorted by name for consistency)
    founders: deal.founders
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({
        name: f.name,
        role: f.role,
      })),

    // Phase 5.1 (Codex round 15 P2) — EvidenceSignals (sorted for stable
    // hashing). Any new/changed signal invalidates the cache, so a fresh
    // ATTACHMENT_RELATION or CAP_TABLE_AS_OF re-triggers analysis instead
    // of replaying a stale result.
    //
    // Phase 5.2 (Codex round 16 P2) — extractorVersion is part of the hashed
    // string, so it MUST also be the final tie-breaker in the sort. Without
    // it, two signals identical except extractorVersion could swap order
    // between runs and produce different fingerprints for the same content.
    evidenceSignals: evidenceSignals
      .slice()
      .sort((a, b) => {
        const docCmp = a.documentId.localeCompare(b.documentId);
        if (docCmp !== 0) return docCmp;
        const scopeCmp = a.signalScopeKey.localeCompare(b.signalScopeKey);
        if (scopeCmp !== 0) return scopeCmp;
        const kindCmp = a.kind.localeCompare(b.kind);
        if (kindCmp !== 0) return kindCmp;
        const hashCmp = a.signalHash.localeCompare(b.signalHash);
        if (hashCmp !== 0) return hashCmp;
        return a.extractorVersion.localeCompare(b.extractorVersion);
      })
      .map((s) => `${s.documentId}|${s.signalScopeKey}|${s.kind}|${s.signalHash}|${s.extractorVersion}`),

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
    select: {
      id: true,
      status: true,
      totalCost: true,
      totalTimeMs: true,
      summary: true,
      completedAt: true,
      dealFingerprint: true,
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

  const loadedResults = await loadResults(analysis.id);
  if (
    !loadedResults ||
    typeof loadedResults !== "object" ||
    Array.isArray(loadedResults) ||
    Object.keys(loadedResults).length === 0
  ) {
    return { found: false, reason: "incomplete" };
  }

  console.log(
    `[AnalysisCache] Cache HIT for deal ${dealId}, mode=${mode}: ` +
      `age=${Math.round(cacheAge / 1000 / 60)}min, cost=$${analysis.totalCost}`
  );

  return {
    found: true,
    analysis,
    results: loadedResults as Record<string, unknown>,
    cacheAge,
  };
}

/**
 * Get deal with relations needed for fingerprint
 */
export async function getDealForFingerprint(
  dealId: string
): Promise<DealWithRelations | null> {
  const [deal, currentFacts] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        documents: {
          where: {
            isLatest: true,
          },
          select: {
            id: true,
            extractedText: true,
            processingStatus: true,
            uploadedAt: true,
            // B6.1 fix-up (Codex P1) — Document metadata that drives
            // agent context. Selected here so the fingerprint can hash
            // them (see DealWithRelations + generateDealFingerprint).
            // The B6.x manual editor surfaces (sourceDate / type /
            // sourceKind / email metadata) all flow through these
            // fields, so the cache invalidation is automatic once a
            // user override is persisted.
            name: true,
            type: true,
            sourceKind: true,
            corpusRole: true,
            sourceDate: true,
            receivedAt: true,
            sourceAuthor: true,
            sourceSubject: true,
            corpusParentDocumentId: true,
            extractionRuns: {
              orderBy: { completedAt: "desc" },
              take: 1,
              select: {
                id: true,
                documentVersion: true,
                contentHash: true,
                corpusTextHash: true,
                status: true,
                readyForAnalysis: true,
                completedAt: true,
              },
            },
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
    }),
    getCurrentFactsFromView(dealId).catch(() => []),
  ]);

  return deal
    ? {
        ...deal,
        currentFacts,
      }
    : null;
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
