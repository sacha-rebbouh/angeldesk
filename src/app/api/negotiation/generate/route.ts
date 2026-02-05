import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateNegotiationStrategy, type AnalysisResults, type NegotiationStrategy } from "@/services/negotiation/strategist";

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
        negotiationStrategy: true,
      },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    // Return cached strategy or null
    return NextResponse.json({
      strategy: analysis.negotiationStrategy as unknown as NegotiationStrategy | null,
      cached: analysis.negotiationStrategy !== null,
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

    // 4. Fetch the analysis with results
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        deal: {
          id: dealId,
          userId: user.id,
        },
      },
    });

    if (!analysis || !analysis.results) {
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

    // 5. Check cache first (unless forceRegenerate)
    if (!forceRegenerate && analysis.negotiationStrategy) {
      return NextResponse.json({
        strategy: analysis.negotiationStrategy as unknown as NegotiationStrategy,
        cached: true,
      });
    }

    // 6. Verify results is not empty
    const resultsObj = analysis.results as Record<string, unknown>;
    if (Object.keys(resultsObj).length === 0) {
      return NextResponse.json(
        { error: "Analysis has no agent results to generate negotiation strategy from" },
        { status: 400 }
      );
    }

    // 7. Extract relevant data from analysis results
    const results = analysis.results as Record<string, {
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
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { negotiationStrategy: JSON.parse(JSON.stringify(strategy)) },
    });

    return NextResponse.json({ strategy, cached: false });
  } catch (error) {
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
