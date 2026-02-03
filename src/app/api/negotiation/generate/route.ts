import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateNegotiationStrategy, type AnalysisResults } from "@/services/negotiation/strategist";

export const maxDuration = 60;

// =============================================================================
// Request Validation Schema
// =============================================================================

const requestSchema = z.object({
  dealId: z.string().min(1, "dealId is required"),
  analysisId: z.string().min(1, "analysisId is required"),
  dealName: z.string().max(200).optional(),
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
// API Handler
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const user = await requireAuth();

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

    const { dealId, analysisId, dealName } = parseResult.data;

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
      return NextResponse.json(
        { error: "Analysis not found or has no results" },
        { status: 404 }
      );
    }

    // 5. Verify results is not empty
    const resultsObj = analysis.results as Record<string, unknown>;
    if (Object.keys(resultsObj).length === 0) {
      return NextResponse.json(
        { error: "Analysis has no agent results to generate negotiation strategy from" },
        { status: 400 }
      );
    }

    // 6. Extract relevant data from analysis results
    const results = analysis.results as Record<string, {
      agentName: string;
      success: boolean;
      data?: Record<string, unknown>;
    }>;

    // 7. Build AnalysisResults from agent outputs - match the expected interface
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

    // 8. Sanitize deal name and generate the negotiation strategy
    const safeDealName = sanitizeDealName(dealName ?? "Deal");
    const strategy = await generateNegotiationStrategy(
      safeDealName,
      analysisResults
    );

    if (!strategy) {
      return NextResponse.json(
        { error: "Failed to generate negotiation strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy });
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

    console.error("[API] Error generating negotiation strategy:", error);
    // Return generic error message in production to avoid leaking internal details
    return NextResponse.json(
      { error: "An error occurred while generating the negotiation strategy. Please try again." },
      { status: 500 }
    );
  }
}
