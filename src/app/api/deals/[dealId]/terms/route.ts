import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { ConditionsAnalystAgent } from "@/agents/tier3/conditions-analyst";
import type { EnrichedAgentContext, ConditionsAnalystData } from "@/agents/types";
import type { Deal } from "@prisma/client";

// Normalize analysis data for frontend (lowercase severity/priority, convert Decimals)
function buildTermsResponse(
  terms: Record<string, unknown> | null,
  cached: ConditionsAnalystData | null,
  conditionsScore: number | null,
) {
  // Convert Prisma Decimal fields to numbers
  const normalizedTerms = terms ? {
    ...terms,
    valuationPre: terms.valuationPre != null ? Number(terms.valuationPre) : null,
    amountRaised: terms.amountRaised != null ? Number(terms.amountRaised) : null,
    dilutionPct: terms.dilutionPct != null ? Number(terms.dilutionPct) : null,
    esopPct: terms.esopPct != null ? Number(terms.esopPct) : null,
  } : null;

  // Lowercase severity/priority for frontend (agent outputs UPPERCASE)
  const advice = (cached?.findings?.negotiationAdvice ?? []).map(a => ({
    ...a,
    priority: a.priority?.toLowerCase() ?? "medium",
  }));
  const flags = (cached?.redFlags ?? []).map(rf => ({
    ...rf,
    severity: rf.severity?.toLowerCase() ?? "medium",
  }));

  return {
    terms: normalizedTerms,
    conditionsScore,
    conditionsBreakdown: cached?.score?.breakdown ?? null,
    conditionsAnalysis: cached?.findings ?? null,
    negotiationAdvice: advice.length > 0 ? advice : null,
    redFlags: flags.length > 0 ? flags : null,
    narrative: cached?.narrative ?? null,
    analysisStatus: cached ? "success" as const : null,
  };
}

const dealTermsSchema = z.object({
  // Valorisation
  valuationPre: z.number().positive().nullable().optional(),
  amountRaised: z.number().positive().nullable().optional(),
  dilutionPct: z.number().min(0).max(100).nullable().optional(),

  // Instrument
  instrumentType: z.string().nullable().optional(),
  instrumentDetails: z.string().nullable().optional(),

  // Protections investisseur
  liquidationPref: z.string().nullable().optional(),
  antiDilution: z.string().nullable().optional(),
  proRataRights: z.boolean().nullable().optional(),
  informationRights: z.boolean().nullable().optional(),
  boardSeat: z.string().nullable().optional(),

  // Gouvernance / Fondateurs
  founderVesting: z.boolean().nullable().optional(),
  vestingDurationMonths: z.number().int().min(0).nullable().optional(),
  vestingCliffMonths: z.number().int().min(0).nullable().optional(),
  esopPct: z.number().min(0).max(100).nullable().optional(),
  dragAlong: z.boolean().nullable().optional(),
  tagAlong: z.boolean().nullable().optional(),

  // Clauses spéciales
  ratchet: z.boolean().nullable().optional(),
  payToPlay: z.boolean().nullable().optional(),
  milestoneTranches: z.boolean().nullable().optional(),
  nonCompete: z.boolean().nullable().optional(),

  // Champ libre
  customConditions: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),

  // Source
  source: z.enum(["manual", "extracted", "negotiated"]).optional(),
});

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// GET /api/deals/[dealId]/terms — Get deal terms + cached conditions analysis
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    // Single query: deal + dealTerms in one round-trip
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: {
        id: true,
        stage: true,
        globalScore: true,
        conditionsScore: true,
        conditionsAnalysis: true,
        dealTerms: true,
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const cached = deal.conditionsAnalysis as ConditionsAnalystData | null;

    return NextResponse.json(
      buildTermsResponse(
        deal.dealTerms as unknown as Record<string, unknown> | null,
        cached,
        deal.conditionsScore ?? null,
      )
    );
  } catch (error) {
    return handleApiError(error, "GET /api/deals/[dealId]/terms");
  }
}

// PUT /api/deals/[dealId]/terms — Save terms + run AI conditions analysis
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = dealTermsSchema.parse(body);

    // Verify deal ownership and load deal data
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      include: { documents: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // 1. Upsert deal terms + load latest analysis summary in parallel
    const [upsertedTerms, latestAnalysis] = await Promise.all([
      prisma.dealTerms.upsert({
        where: { dealId },
        create: {
          dealId,
          ...parsed,
          source: parsed.source ?? "manual",
        },
        update: {
          ...parsed,
        },
      }),
      prisma.analysis.findFirst({
        where: { dealId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { summary: true },
      }),
    ]);

    // 2. Run AI conditions analysis (standalone mode)
    // Agent internal timeout = 50s (self-terminates), route guard = 55s (safety net)
    // This prevents orphan agents: the agent kills its own LLM call at 50s,
    // so no background process continues after the route responds.
    const agent = new ConditionsAnalystAgent({ standaloneTimeoutMs: 50_000 });
    const standaloneContext = buildStandaloneContextSync(deal, upsertedTerms, latestAnalysis?.summary ?? null);

    let analysisResult: ConditionsAnalystData | null = null;
    let analysisStatus: "success" | "failed" | "timeout" = "failed";
    let routeTimerId: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        agent.run(standaloneContext),
        new Promise<never>((_, reject) => {
          routeTimerId = setTimeout(() => reject(new Error("Timeout 55s")), 55_000);
        }),
      ]);
      clearTimeout(routeTimerId);
      if (result.success && "data" in result) {
        analysisResult = result.data as ConditionsAnalystData;
        analysisStatus = "success";
      }
    } catch (err) {
      clearTimeout(routeTimerId);
      const msg = err instanceof Error ? err.message : String(err);
      analysisStatus = msg.includes("Timeout") || msg.includes("timed out") ? "timeout" : "failed";
      console.error(`[conditions-analyst] Standalone analysis ${analysisStatus}:`, msg);
    }

    // 3. Update deal scores
    const conditionsScore = analysisResult?.score?.value ?? null;
    await prisma.$transaction([
      prisma.deal.update({
        where: { id: dealId },
        data: {
          conditionsScore: conditionsScore != null ? Math.round(conditionsScore) : null,
          conditionsAnalysis: analysisResult
            ? (analysisResult as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      }),
      prisma.dealTerms.update({
        where: { dealId },
        data: { aiAnalysisAt: new Date() },
      }),
    ]);

    const response = buildTermsResponse(
      upsertedTerms as unknown as Record<string, unknown>,
      analysisResult,
      conditionsScore != null ? Math.round(conditionsScore) : null,
    );

    return NextResponse.json({
      ...response,
      analysisStatus,
    });
  } catch (error) {
    return handleApiError(error, "PUT /api/deals/[dealId]/terms");
  }
}

// Build lightweight context for standalone conditions analysis (synchronous — DB queries done upstream)
function buildStandaloneContextSync(
  deal: Deal & { documents: Array<{ id: string; name: string; type: string; extractedText?: string | null }> },
  terms: {
    valuationPre: unknown; amountRaised: unknown; dilutionPct: unknown;
    instrumentType: string | null; instrumentDetails: string | null;
    liquidationPref: string | null; antiDilution: string | null;
    proRataRights: boolean | null; informationRights: boolean | null;
    boardSeat: string | null; founderVesting: boolean | null;
    vestingDurationMonths: number | null; vestingCliffMonths: number | null;
    esopPct: unknown; dragAlong: boolean | null; tagAlong: boolean | null;
    ratchet: boolean | null; payToPlay: boolean | null;
    milestoneTranches: boolean | null; nonCompete: boolean | null;
    customConditions: string | null; notes: string | null;
  },
  analysisSummary: string | null,
): EnrichedAgentContext {
  return {
    dealId: deal.id,
    deal,
    documents: deal.documents,
    previousResults: {},
    dealTerms: {
      valuationPre: terms.valuationPre ? Number(terms.valuationPre) : null,
      amountRaised: terms.amountRaised ? Number(terms.amountRaised) : null,
      dilutionPct: terms.dilutionPct ? Number(terms.dilutionPct) : null,
      instrumentType: terms.instrumentType,
      instrumentDetails: terms.instrumentDetails,
      liquidationPref: terms.liquidationPref,
      antiDilution: terms.antiDilution,
      proRataRights: terms.proRataRights,
      informationRights: terms.informationRights,
      boardSeat: terms.boardSeat,
      founderVesting: terms.founderVesting,
      vestingDurationMonths: terms.vestingDurationMonths,
      vestingCliffMonths: terms.vestingCliffMonths,
      esopPct: terms.esopPct ? Number(terms.esopPct) : null,
      dragAlong: terms.dragAlong,
      tagAlong: terms.tagAlong,
      ratchet: terms.ratchet,
      payToPlay: terms.payToPlay,
      milestoneTranches: terms.milestoneTranches,
      nonCompete: terms.nonCompete,
      customConditions: terms.customConditions,
      notes: terms.notes,
    },
    conditionsAnalystMode: "standalone",
    conditionsAnalystSummary: analysisSummary,
  };
}
