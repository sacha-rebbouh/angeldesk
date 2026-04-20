import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadResults } from "@/services/analysis-results/load-results";
import { generateNegotiationStrategy, type AnalysisResults, type NegotiationStrategy } from "@/services/negotiation/strategist";
import { thesisService } from "@/services/thesis";
import { normalizeThesisEvaluation } from "@/services/thesis/normalization";
import {
  assertFeatureAccess,
  FeatureAccessError,
  serializeFeatureAccessError,
} from "@/services/credits/feature-access";

export const maxDuration = 60;

// =============================================================================
// Request Validation Schema
// =============================================================================

const requestSchema = z.object({
  dealId: z.string().cuid("dealId must be a valid CUID"),
  analysisId: z.string().cuid("analysisId must be a valid CUID"),
  dealName: z.string().max(200).optional(),
  forceRegenerate: z.boolean().optional(), // Force regeneration even if cached
});

const getRequestSchema = z.object({
  dealId: z.string().cuid(),
  analysisId: z.string().cuid(),
});

// =============================================================================
// Rate Limiting (in-memory, per-user) - Serverless-safe with lazy cleanup
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 requests per minute per user
const RATE_LIMIT_MAX_ENTRIES = 1000; // Prevent unbounded growth

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface NegotiationStrategyCacheMeta {
  schemaVersion: 3;
  analysisId: string;
  thesisId: string;
  thesisSourceHash: string;
  thesisCorpusSnapshotId: string | null;
  thesisUpdatedAt: string;
  thesisDecision: string | null;
  thesisBypass: boolean;
}

type CachedNegotiationStrategy = NegotiationStrategy & {
  cacheMeta?: NegotiationStrategyCacheMeta;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

// Lazy cleanup: remove expired entries when map gets too large
function lazyCleanup(now: number): void {
  if (rateLimitMap.size <= RATE_LIMIT_MAX_ENTRIES) return;

  for (const [userId, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(userId);
    }
  }
}

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();

  // Lazy cleanup when map grows too large (serverless-safe, no setInterval)
  lazyCleanup(now);

  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window - entry expired or doesn't exist
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

// =============================================================================
// Sanitization
// =============================================================================

function sanitizeDealName(name: string): string {
  // Remove control characters, limit length, and escape special chars for LLM prompt safety
  return name
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>{}[\]\\]/g, '') // Remove chars that could be interpreted as markup/code
    .trim()
    .slice(0, 100); // Limit length
}

function buildNegotiationCacheMeta(params: {
  analysisId: string;
  thesisId: string;
  thesisSourceHash: string;
  thesisCorpusSnapshotId: string | null;
  thesisUpdatedAt: Date;
  thesisDecision: string | null;
  thesisBypass: boolean;
}): NegotiationStrategyCacheMeta {
  return {
    schemaVersion: 3,
    analysisId: params.analysisId,
    thesisId: params.thesisId,
    thesisSourceHash: params.thesisSourceHash,
    thesisCorpusSnapshotId: params.thesisCorpusSnapshotId,
    thesisUpdatedAt: params.thesisUpdatedAt.toISOString(),
    thesisDecision: params.thesisDecision,
    thesisBypass: params.thesisBypass,
  };
}

function isNegotiationCacheValid(params: {
  strategy: NegotiationStrategy | null;
  analysisId: string;
  analysisThesisId: string | null;
  thesisBypass: boolean;
  latestThesis: NonNullable<Awaited<ReturnType<typeof thesisService.getLatest>>> | null;
  latestThesisScope: Awaited<ReturnType<typeof thesisService.resolveSourceScope>> | null;
}): params is {
  strategy: CachedNegotiationStrategy;
  analysisId: string;
  analysisThesisId: string;
  thesisBypass: boolean;
  latestThesis: NonNullable<Awaited<ReturnType<typeof thesisService.getLatest>>>;
  latestThesisScope: NonNullable<Awaited<ReturnType<typeof thesisService.resolveSourceScope>>>;
} {
  if (!params.strategy || !params.latestThesis || !params.analysisThesisId || !params.latestThesisScope) {
    return false;
  }

  if (params.analysisThesisId !== params.latestThesis.id) {
    return false;
  }

  const cacheMeta = (params.strategy as CachedNegotiationStrategy).cacheMeta;
  if (!cacheMeta || cacheMeta.schemaVersion !== 3) {
    return false;
  }

  const snapshotAligned = cacheMeta.thesisCorpusSnapshotId && params.latestThesisScope.corpusSnapshotId
    ? cacheMeta.thesisCorpusSnapshotId === params.latestThesisScope.corpusSnapshotId
    : cacheMeta.thesisSourceHash === params.latestThesisScope.sourceHash;

  return (
    cacheMeta.analysisId === params.analysisId &&
    cacheMeta.thesisId === params.latestThesis.id &&
    snapshotAligned &&
    cacheMeta.thesisUpdatedAt === params.latestThesis.updatedAt.toISOString() &&
    cacheMeta.thesisDecision === params.latestThesis.decision &&
    cacheMeta.thesisBypass === params.thesisBypass
  );
}

// =============================================================================
// GET Handler - Load cached strategy
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const parseResult = getRequestSchema.safeParse({
      dealId: searchParams.get("dealId"),
      analysisId: searchParams.get("analysisId"),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { dealId, analysisId } = parseResult.data;

    // Fetch analysis with cached strategy
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        deal: {
          id: dealId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        thesisId: true,
        thesisBypass: true,
        negotiationStrategy: true,
      },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    const latestThesis = await thesisService.getLatest(dealId);
    const latestThesisScope = latestThesis
      ? await thesisService.resolveSourceScope(latestThesis)
      : null;
    const strategy = analysis.negotiationStrategy as NegotiationStrategy | null;
    const cacheValid = isNegotiationCacheValid({
      strategy,
      analysisId: analysis.id,
      analysisThesisId: analysis.thesisId,
      thesisBypass: analysis.thesisBypass ?? false,
      latestThesis,
      latestThesisScope,
    });

    return NextResponse.json({
      strategy: cacheValid ? strategy : null,
      cached: cacheValid,
      canonicalAligned: !!latestThesis && analysis.thesisId === latestThesis.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg === "unauthorized" || errorMsg.includes("unauthenticated") || errorMsg.includes("not authenticated")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[API] Error fetching negotiation strategy:", error);
    }
    return NextResponse.json(
      { error: "An error occurred while fetching the negotiation strategy." },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST Handler - Generate and cache strategy
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] POST request received");
    }

    // 1. Authentication
    const user = await requireAuth();
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] User authenticated:", user.id);
    }

    // 1bis. Gate feature "negotiation" — seuil totalPurchased >= 60
    await assertFeatureAccess(user.id, "negotiation");

    // 2. Rate limiting
    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 60000) / 1000)),
          }
        }
      );
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { dealId, analysisId, dealName, forceRegenerate } = parseResult.data;
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] Request params:", { dealId, analysisId, forceRegenerate });
    }

    // 4. Fetch the analysis metadata, then load results via the canonical loader
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        deal: {
          id: dealId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        thesisId: true,
        thesisBypass: true,
        negotiationStrategy: true,
      },
    });

    if (!analysis) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Negotiation API] Analysis not found or no results");
      }
      return NextResponse.json(
        { error: "Analysis not found or has no results" },
        { status: 404 }
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] Analysis found, hasCache:", !!analysis.negotiationStrategy);
    }

    const rawResults = await loadResults(analysis.id);
    if (!rawResults) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Negotiation API] Analysis not found or no results");
      }
      return NextResponse.json(
        { error: "Analysis not found or has no results" },
        { status: 404 }
      );
    }

    const latestThesis = await thesisService.getLatest(dealId);
    if (!latestThesis) {
      return NextResponse.json(
        { error: "Negotiation requires a current canonical thesis. Run the thesis-first analysis flow first." },
        { status: 409 }
      );
    }
    const latestThesisScope = await thesisService.resolveSourceScope(latestThesis);
    if (!latestThesisScope) {
      return NextResponse.json(
        { error: "Latest thesis source scope could not be resolved. Re-run the thesis-first Deep Dive before generating negotiation." },
        { status: 409 }
      );
    }

    if (!analysis.thesisId || analysis.thesisId !== latestThesis.id) {
      return NextResponse.json(
        { error: "This analysis is no longer aligned with the latest canonical thesis. Re-run the thesis-first Deep Dive before generating negotiation." },
        { status: 409 }
      );
    }

    // 5. Check cache first (unless forceRegenerate)
    const cachedStrategy = analysis.negotiationStrategy as NegotiationStrategy | null;
    const cacheValid = isNegotiationCacheValid({
      strategy: cachedStrategy,
      analysisId: analysis.id,
      analysisThesisId: analysis.thesisId,
      thesisBypass: analysis.thesisBypass ?? false,
      latestThesis,
      latestThesisScope,
    });
    if (!forceRegenerate && cacheValid) {
      return NextResponse.json({
        strategy: cachedStrategy,
        cached: true,
      });
    }

    // 6. Verify results is not empty
    const resultsObj = rawResults as Record<string, unknown>;
    if (Object.keys(resultsObj).length === 0) {
      return NextResponse.json(
        { error: "Analysis has no agent results to generate negotiation strategy from" },
        { status: 400 }
      );
    }

    // 7. Extract relevant data from analysis results
    const results = rawResults as Record<string, {
      agentName: string;
      success: boolean;
      data?: Record<string, unknown>;
    }>;
    // 8. Build AnalysisResults from agent outputs - match the expected interface
    const analysisResults: AnalysisResults = {};

    // Extract financial-auditor data
    if (results["financial-auditor"]?.success && results["financial-auditor"]?.data) {
      const data = results["financial-auditor"].data;
      const findings = data.findings as Record<string, unknown> | undefined;
      analysisResults.financialAuditor = {
        score: data.score as { value?: number } | undefined,
        findings: findings ? {
          valuationAnalysis: findings.valuationAnalysis as {
            currentValuation?: number;
            suggestedRange?: { min?: number; max?: number };
            multipleAnalysis?: {
              current?: { arrMultiple?: number; revenueMultiple?: number };
              benchmark?: { p25?: number; median?: number; p75?: number };
            };
          } | undefined,
          unitEconomics: findings.unitEconomics as {
            ltv?: number;
            cac?: number;
            ltvCacRatio?: number;
          } | undefined,
        } : undefined,
        redFlags: data.redFlags as Array<{ severity: string; title: string; description: string }> | undefined,
      };
    }

    // Extract cap-table-auditor data
    if (results["cap-table-auditor"]?.success && results["cap-table-auditor"]?.data) {
      const data = results["cap-table-auditor"].data;
      const findings = data.findings as Record<string, unknown> | undefined;
      analysisResults.capTableAuditor = {
        findings: findings ? {
          currentCapTable: findings.currentCapTable as {
            founderOwnership?: number;
            investorOwnership?: number;
            esopPool?: number;
          } | undefined,
          dilutionAnalysis: findings.dilutionAnalysis as {
            postMoneyOwnership?: number;
            effectiveDilution?: number;
          } | undefined,
          termsConcerns: findings.termsConcerns as Array<{ term: string; concern: string; suggestion: string }> | undefined,
        } : undefined,
        redFlags: data.redFlags as Array<{ severity: string; title: string; description: string }> | undefined,
      };
    }

    // Extract synthesis-deal-scorer data
    if (results["synthesis-deal-scorer"]?.success && results["synthesis-deal-scorer"]?.data) {
      const data = results["synthesis-deal-scorer"].data;
      analysisResults.synthesisDealScorer = {
        score: data.score as { value?: number } | undefined,
        overallScore: data.overallScore as number | undefined,
        verdict: data.verdict as string | undefined,
        keyStrengths: data.keyStrengths as string[] | undefined,
        keyWeaknesses: data.keyWeaknesses as string[] | undefined,
        redFlags: data.redFlags as Array<{ severity: string; title: string; description: string }> | undefined,
      };
    }

    if (latestThesis) {
      analysisResults.thesis = {
        verdict: latestThesis.verdict,
        confidence: latestThesis.confidence,
        reformulated: latestThesis.reformulated,
        evaluationAxes: normalizeThesisEvaluation({
          verdict: latestThesis.verdict as never,
          confidence: latestThesis.confidence,
          ycLens: latestThesis.ycLens as never,
          thielLens: latestThesis.thielLens as never,
          angelDeskLens: latestThesis.angelDeskLens as never,
        }),
      };
    }

    // 9. Sanitize deal name and generate the negotiation strategy
    const safeDealName = sanitizeDealName(dealName ?? "Deal");
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] Generating strategy for:", safeDealName);
    }
    const strategy = await generateNegotiationStrategy(
      safeDealName,
      analysisResults
    );
    if (process.env.NODE_ENV === "development") {
      console.log("[Negotiation API] Strategy generated:", !!strategy);
    }

    if (!strategy) {
      return NextResponse.json(
        { error: "Failed to generate negotiation strategy" },
        { status: 500 }
      );
    }

    // 10. Save strategy to database for caching
    const strategyWithMeta: CachedNegotiationStrategy = {
      ...strategy,
      cacheMeta: buildNegotiationCacheMeta({
        analysisId: analysis.id,
        thesisId: latestThesis.id,
        thesisSourceHash: latestThesisScope.sourceHash,
        thesisCorpusSnapshotId: latestThesisScope.corpusSnapshotId,
        thesisUpdatedAt: latestThesis.updatedAt,
        thesisDecision: latestThesis.decision,
        thesisBypass: analysis.thesisBypass ?? false,
      }),
    };

    await prisma.analysis.update({
      where: { id: analysisId },
      data: { negotiationStrategy: JSON.parse(JSON.stringify(strategyWithMeta)) },
    });

    return NextResponse.json({ strategy: strategyWithMeta, cached: false });
  } catch (error) {
    if (error instanceof FeatureAccessError) {
      return NextResponse.json(serializeFeatureAccessError(error), { status: 403 });
    }

    // Handle authentication errors specifically (Clerk can throw various auth-related messages)
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg === "unauthorized" || errorMsg.includes("unauthenticated") || errorMsg.includes("not authenticated")) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[Negotiation API] Error:", error);
      console.error("[Negotiation API] Error stack:", error instanceof Error ? error.stack : "N/A");
    }
    // Return generic error message in production to avoid leaking internal details
    return NextResponse.json(
      { error: "An error occurred while generating the negotiation strategy. Please try again." },
      { status: 500 }
    );
  }
}
