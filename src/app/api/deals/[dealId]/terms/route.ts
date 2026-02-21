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
import type { DealMode, TrancheData } from "@/components/deals/conditions/types";
import { normalizeTranche, buildTermsResponse } from "@/services/terms-normalization";

const dealTermsSchema = z.object({
  // Valorisation
  valuationPre: z.number().positive().max(1e15).nullable().optional(),
  amountRaised: z.number().positive().max(1e15).nullable().optional(),
  dilutionPct: z.number().min(0).max(100).nullable().optional(),

  // Instrument
  instrumentType: z.string().max(100).nullable().optional(),
  instrumentDetails: z.string().max(500).nullable().optional(),

  // Protections investisseur
  liquidationPref: z.string().max(100).nullable().optional(),
  antiDilution: z.string().max(100).nullable().optional(),
  proRataRights: z.boolean().nullable().optional(),
  informationRights: z.boolean().nullable().optional(),
  boardSeat: z.string().max(100).nullable().optional(),

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
  customConditions: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

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

    // Single query: deal + dealTerms + dealStructure with tranches in one round-trip
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: {
        id: true,
        stage: true,
        globalScore: true,
        conditionsScore: true,
        conditionsAnalysis: true,
        dealTerms: true,
        dealStructure: {
          include: {
            tranches: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const cached = deal.conditionsAnalysis as ConditionsAnalystData | null;
    const mode: DealMode = deal.dealStructure?.mode ?? "SIMPLE";
    const tranches: TrancheData[] | null = deal.dealStructure?.tranches
      ? deal.dealStructure.tranches.map(normalizeTranche)
      : null;

    return NextResponse.json(
      buildTermsResponse(
        deal.dealTerms as unknown as Record<string, unknown> | null,
        cached,
        deal.conditionsScore ?? null,
        mode,
        tranches,
      )
    );
  } catch (error) {
    return handleApiError(error, "GET /api/deals/[dealId]/terms");
  }
}

// Schema for structured tranches
const trancheSchema = z.object({
  id: z.string().optional(), // existing tranche ID (for updates)
  orderIndex: z.number().int().min(0),
  label: z.string().max(200).default(""),
  trancheType: z.string().max(100),
  typeDetails: z.string().max(500).nullable().optional(),
  amount: z.number().positive().nullable().optional(),
  valuationPre: z.number().positive().nullable().optional(),
  equityPct: z.number().min(0).max(100).nullable().optional(),
  triggerType: z.string().nullable().optional(),
  triggerDetails: z.string().max(1000).nullable().optional(),
  triggerDeadline: z.string().nullable().optional(), // ISO date
  instrumentTerms: z.record(z.string(), z.unknown()).nullable().optional(),
  liquidationPref: z.string().max(100).nullable().optional(),
  antiDilution: z.string().max(100).nullable().optional(),
  proRataRights: z.boolean().nullable().optional(),
  status: z.enum(["PENDING", "ACTIVE", "CONVERTED", "EXPIRED", "CANCELLED"]).default("PENDING"),
});

// Wrapper schema: accepts { terms, mode, tranches? }
const putBodySchema = z.object({
  terms: dealTermsSchema,
  mode: z.enum(["SIMPLE", "STRUCTURED"]).default("SIMPLE"),
  tranches: z.array(trancheSchema).max(10).optional(),
});

// PUT /api/deals/[dealId]/terms — Save terms + run AI conditions analysis
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const body = await putBodySchema.parse(await request.json());
    const { terms: parsed, mode, tranches: inputTranches } = body;

    // Verify deal ownership and load deal data + existing terms for versioning snapshot
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      include: {
        documents: true,
        dealTerms: true,
        dealStructure: { include: { tranches: true } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // --- 0. Create a DealTermsVersion snapshot of the current state (before saving) ---
    const existingTerms = deal.dealTerms;
    if (existingTerms) {
      // Count existing versions to set next version number
      const lastVersion = await prisma.dealTermsVersion.findFirst({
        where: { dealId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const versionCount = lastVersion?.version ?? 0;
      const snapshot: Record<string, unknown> = {
        terms: existingTerms,
        mode: deal.dealStructure?.mode ?? "SIMPLE",
        tranches: deal.dealStructure?.tranches?.map(t => ({
          label: t.label,
          trancheType: t.trancheType,
          amount: t.amount != null ? Number(t.amount) : null,
          valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
          equityPct: t.equityPct != null ? Number(t.equityPct) : null,
          triggerType: t.triggerType,
          status: t.status,
        })) ?? null,
      };
      await prisma.dealTermsVersion.create({
        data: {
          dealId,
          version: versionCount + 1,
          termsSnapshot: snapshot as Prisma.InputJsonValue,
          conditionsScore: deal.conditionsScore,
          analysisSnapshot: deal.conditionsAnalysis as Prisma.InputJsonValue | undefined,
          source: existingTerms.source ?? "manual",
        },
      });
    }

    // --- 1. Upsert DealTerms + handle structured mode + load latest analysis ---
    const upsertTermsPromise = prisma.dealTerms.upsert({
      where: { dealId },
      create: { dealId, ...parsed, source: parsed.source ?? "manual" },
      update: { ...parsed },
    });

    const latestAnalysisPromise = prisma.analysis.findFirst({
      where: { dealId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { summary: true },
    });

    // Handle structured mode: upsert DealStructure + replace tranches
    let structurePromise: Promise<unknown> = Promise.resolve();
    if (mode === "STRUCTURED" && inputTranches && inputTranches.length > 0) {
      const totalInvestment = inputTranches.reduce(
        (sum, t) => sum + (t.amount ?? 0), 0
      );
      structurePromise = prisma.$transaction(async (tx) => {
        // Upsert the DealStructure
        const structure = await tx.dealStructure.upsert({
          where: { dealId },
          create: { dealId, mode: "STRUCTURED", totalInvestment },
          update: { mode: "STRUCTURED", totalInvestment },
        });
        // Delete existing tranches and recreate (simpler than diffing)
        await tx.dealTranche.deleteMany({ where: { structureId: structure.id } });
        // Create new tranches
        await tx.dealTranche.createMany({
          data: inputTranches.map((t, idx) => ({
            structureId: structure.id,
            orderIndex: t.orderIndex ?? idx,
            label: t.label || null,
            trancheType: t.trancheType,
            typeDetails: t.typeDetails ?? null,
            amount: t.amount ?? null,
            valuationPre: t.valuationPre ?? null,
            equityPct: t.equityPct ?? null,
            triggerType: t.triggerType ?? null,
            triggerDetails: t.triggerDetails ?? null,
            triggerDeadline: t.triggerDeadline ? new Date(t.triggerDeadline) : null,
            instrumentTerms: t.instrumentTerms as Prisma.InputJsonValue ?? Prisma.JsonNull,
            liquidationPref: t.liquidationPref ?? null,
            antiDilution: t.antiDilution ?? null,
            proRataRights: t.proRataRights ?? null,
            status: (t.status as "PENDING" | "ACTIVE" | "CONVERTED" | "EXPIRED" | "CANCELLED") ?? "PENDING",
          })),
        });
      });
    } else if (mode === "SIMPLE" && deal.dealStructure) {
      // Switching back to SIMPLE: update mode but keep structure data
      structurePromise = prisma.dealStructure.update({
        where: { dealId },
        data: { mode: "SIMPLE" },
      });
    }

    const [upsertedTerms, latestAnalysis] = await Promise.all([
      upsertTermsPromise,
      latestAnalysisPromise,
      structurePromise,
    ]);

    // --- 2. Run AI conditions analysis (standalone mode) ---
    const agent = new ConditionsAnalystAgent({ standaloneTimeoutMs: 50_000 });
    const standaloneContext = buildStandaloneContextSync(
      deal, upsertedTerms, latestAnalysis?.summary ?? null,
      mode === "STRUCTURED" ? inputTranches : undefined,
    );

    let analysisResult: ConditionsAnalystData | null = null;
    let analysisStatus: "success" | "failed" | "timeout" = "failed";
    let routeTimerId: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        agent.run(standaloneContext),
        new Promise<never>((_, reject) => {
          routeTimerId = setTimeout(() => reject(new Error("Timeout 52s")), 52_000);
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

    // --- 3. Update deal scores ---
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

    // --- 4. Reload tranches for response (fresh from DB) ---
    let responseTranches: TrancheData[] | null = null;
    if (mode === "STRUCTURED") {
      const structure = await prisma.dealStructure.findUnique({
        where: { dealId },
        include: { tranches: { orderBy: { orderIndex: "asc" } } },
      });
      responseTranches = structure?.tranches.map(normalizeTranche) ?? null;
    }

    const response = buildTermsResponse(
      upsertedTerms as unknown as Record<string, unknown>,
      analysisResult,
      conditionsScore != null ? Math.round(conditionsScore) : null,
      mode as DealMode,
      responseTranches,
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
  structuredTranches?: Array<z.infer<typeof trancheSchema>>,
): EnrichedAgentContext {
  const ctx: EnrichedAgentContext = {
    dealId: deal.id,
    deal,
    documents: deal.documents,
    previousResults: {},
    dealTerms: {
      valuationPre: terms.valuationPre != null ? Number(terms.valuationPre) : null,
      amountRaised: terms.amountRaised != null ? Number(terms.amountRaised) : null,
      dilutionPct: terms.dilutionPct != null ? Number(terms.dilutionPct) : null,
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
      esopPct: terms.esopPct != null ? Number(terms.esopPct) : null,
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

  // Pass structured tranches to the agent if in STRUCTURED mode
  if (structuredTranches && structuredTranches.length > 0) {
    ctx.dealStructure = {
      mode: "STRUCTURED",
      totalInvestment: structuredTranches.reduce((s, t) => s + (t.amount ?? 0), 0),
      tranches: structuredTranches.map(t => ({
        label: t.label || "Tranche",
        trancheType: t.trancheType,
        amount: t.amount ?? null,
        valuationPre: t.valuationPre ?? null,
        equityPct: t.equityPct ?? null,
        triggerType: t.triggerType ?? null,
        triggerDetails: t.triggerDetails ?? null,
        status: t.status ?? "PENDING",
      })),
    };
  }

  return ctx;
}
