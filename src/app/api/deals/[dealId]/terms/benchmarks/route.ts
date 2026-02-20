import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// Static benchmarks from Carta 2024, Eldorado.co, France Angels, OpenVC 2024
const STAGE_BENCHMARKS: Record<string, {
  valuationPreMoney: { p25: number; p50: number; p75: number; p90: number };
  dilutionPctMedian: number;
  standardInstrument: string;
  protectionsStandard: string;
  governanceStandard: string;
}> = {
  PRE_SEED: {
    valuationPreMoney: { p25: 1_000_000, p50: 1_500_000, p75: 2_500_000, p90: 4_000_000 },
    dilutionPctMedian: 22,
    standardInstrument: "BSA-AIR (avec cap)",
    protectionsStandard: "Pro-rata + Info rights (minimum)",
    governanceStandard: "Vesting 4 ans/1 an cliff, ESOP 10%",
  },
  SEED: {
    valuationPreMoney: { p25: 2_500_000, p50: 4_000_000, p75: 6_000_000, p90: 10_000_000 },
    dilutionPctMedian: 20,
    standardInstrument: "BSA-AIR (cap + discount)",
    protectionsStandard: "Pro-rata + Info rights + Tag-along",
    governanceStandard: "Vesting 4 ans/1 an cliff, ESOP 10-12%",
  },
  SERIES_A: {
    valuationPreMoney: { p25: 10_000_000, p50: 15_000_000, p75: 25_000_000, p90: 40_000_000 },
    dilutionPctMedian: 20,
    standardInstrument: "Actions de preference",
    protectionsStandard: "Liquidation pref 1x NP + Pro-rata + Anti-dilution WA broad",
    governanceStandard: "Vesting 4 ans, ESOP 12-15%, Board observer",
  },
  SERIES_B: {
    valuationPreMoney: { p25: 30_000_000, p50: 50_000_000, p75: 80_000_000, p90: 120_000_000 },
    dilutionPctMedian: 18,
    standardInstrument: "Actions de preference",
    protectionsStandard: "Full protection stack",
    governanceStandard: "Vesting, ESOP 10-15%, Board seat",
  },
};

function normalizeStage(stage: string | null): string {
  if (!stage) return "SEED";
  const upper = stage.toUpperCase().replace(/[^A-Z_]/g, "").replace(/\s+/g, "_");
  if (upper.includes("PRE")) return "PRE_SEED";
  if (upper.includes("SEED")) return "SEED";
  if (upper.includes("SERIES_A") || upper === "A") return "SERIES_A";
  if (upper.includes("SERIES_B") || upper === "B") return "SERIES_B";
  return "SEED"; // Default fallback
}

function computePercentile(value: number, benchmarks: { p25: number; p50: number; p75: number; p90: number }): number {
  if (value <= benchmarks.p25) return Math.round((value / benchmarks.p25) * 25);
  if (value <= benchmarks.p50) return 25 + Math.round(((value - benchmarks.p25) / (benchmarks.p50 - benchmarks.p25)) * 25);
  if (value <= benchmarks.p75) return 50 + Math.round(((value - benchmarks.p50) / (benchmarks.p75 - benchmarks.p50)) * 25);
  if (value <= benchmarks.p90) return 75 + Math.round(((value - benchmarks.p75) / (benchmarks.p90 - benchmarks.p75)) * 15);
  return Math.min(99, 90 + Math.round(((value - benchmarks.p90) / benchmarks.p90) * 10));
}

// GET /api/deals/[dealId]/terms/benchmarks — Get benchmark positioning for the deal
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: {
        id: true,
        stage: true,
        dealTerms: true,
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const stageKey = normalizeStage(deal.stage);
    const benchmarks = STAGE_BENCHMARKS[stageKey] ?? STAGE_BENCHMARKS.SEED;
    const terms = deal.dealTerms as Record<string, unknown> | null;

    const valuationPre = terms?.valuationPre != null ? Number(terms.valuationPre) : null;
    const dilutionPct = terms?.dilutionPct != null ? Number(terms.dilutionPct) : null;
    const instrumentType = terms?.instrumentType as string | null;

    // Compute percentiles
    const valuationPercentile = valuationPre != null
      ? computePercentile(valuationPre, benchmarks.valuationPreMoney)
      : null;

    // Instrument assessment
    let instrumentAssessment: string | null = null;
    if (instrumentType) {
      const standard = benchmarks.standardInstrument.toLowerCase();
      const type = instrumentType.toLowerCase();
      if (type.includes("bsa") && standard.includes("bsa")) instrumentAssessment = "Standard pour ce stage";
      else if (type.includes("prefer") || type.includes("pref")) instrumentAssessment = "Standard Series A+";
      else if (type.includes("ordinaire")) instrumentAssessment = "Peu protecteur — pas standard";
      else instrumentAssessment = "A evaluer selon le contexte";
    }

    // Protection score rough estimate
    let protectionScore: number | null = null;
    if (terms) {
      let pts = 0;
      if (terms.proRataRights === true) pts += 25;
      if (terms.informationRights === true) pts += 15;
      if (terms.tagAlong === true) pts += 15;
      if (terms.liquidationPref && terms.liquidationPref !== "none") pts += 20;
      if (terms.antiDilution && terms.antiDilution !== "none") pts += 15;
      if (terms.boardSeat && terms.boardSeat !== "none") pts += 10;
      protectionScore = Math.min(100, pts);
    }

    // Governance score rough estimate
    let governanceScore: number | null = null;
    if (terms) {
      let pts = 0;
      if (terms.founderVesting === true) pts += 30;
      const vestingMonths = terms.vestingDurationMonths as number | null;
      if (vestingMonths && vestingMonths >= 36) pts += 20;
      const esop = terms.esopPct != null ? Number(terms.esopPct) : null;
      if (esop && esop >= 10) pts += 25;
      if (terms.dragAlong === true) pts += 10;
      if (terms.ratchet !== true && terms.payToPlay !== true) pts += 15;
      governanceScore = Math.min(100, pts);
    }

    return NextResponse.json({
      stage: stageKey,
      source: "Carta 2024, Eldorado.co, France Angels, OpenVC 2024",
      valuation: {
        p25: benchmarks.valuationPreMoney.p25,
        p50: benchmarks.valuationPreMoney.p50,
        p75: benchmarks.valuationPreMoney.p75,
        p90: benchmarks.valuationPreMoney.p90,
        dealValue: valuationPre,
        percentile: valuationPercentile,
      },
      dilution: {
        median: benchmarks.dilutionPctMedian,
        dealValue: dilutionPct,
      },
      instrument: {
        standard: benchmarks.standardInstrument,
        dealValue: instrumentType,
        assessment: instrumentAssessment,
      },
      protections: {
        standard: benchmarks.protectionsStandard,
        score: protectionScore,
      },
      governance: {
        standard: benchmarks.governanceStandard,
        score: governanceScore,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/deals/[dealId]/terms/benchmarks");
  }
}
