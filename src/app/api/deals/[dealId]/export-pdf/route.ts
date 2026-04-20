/**
 * API Route: Export analysis as PDF
 *
 * GET /api/deals/:dealId/export-pdf?analysisId=xxx&format=full|summary
 *
 * PRO feature — generates a Due Diligence PDF report.
 * - format=full (default): Complete 30-50 page report with all agent details
 * - format=summary: Concise 5-7 page executive brief
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { generateAnalysisPdf, type PdfExportData, type PdfFormat } from "@/lib/pdf/generate-analysis-pdf";
import { loadResults } from "@/services/analysis-results/load-results";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";
import { thesisService } from "@/services/thesis";
import { normalizeThesisEvaluation } from "@/services/thesis/normalization";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";

async function resolveAnalysisThesis(params: {
  dealId: string;
  thesisId: string | null;
  corpusSnapshotId: string | null;
}) {
  const directlyLinked = params.thesisId
    ? await thesisService.getById(params.thesisId)
    : null;

  if (directlyLinked) {
    return directlyLinked;
  }

  if (!params.corpusSnapshotId) {
    return null;
  }

  return prisma.thesis.findFirst({
    where: {
      dealId: params.dealId,
      corpusSnapshotId: params.corpusSnapshotId,
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;
    const analysisId = request.nextUrl.searchParams.get("analysisId");
    const format = (request.nextUrl.searchParams.get("format") === "summary" ? "summary" : "full") as PdfFormat;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }
    if (analysisId && !isValidCuid(analysisId)) {
      return NextResponse.json({ error: "Invalid analysis ID format" }, { status: 400 });
    }

    // PDF export is free (0 credits) — no subscription check needed

    // Load deal and analysis metadata in parallel (excludes heavy results blob)
    const analysisSelect = {
      id: true,
      mode: true,
      thesisId: true,
      corpusSnapshotId: true,
      type: true,
      status: true,
      completedAt: true,
      totalAgents: true,
      completedAgents: true,
      negotiationStrategy: true,
    } as const;

    const [deal, latestThesis, completedAnalyses, requestedAnalysis] = await Promise.all([
      prisma.deal.findFirst({
        where: { id: dealId, userId: user.id },
        include: {
          founders: { select: { name: true, role: true, linkedinUrl: true } },
          redFlags: {
            where: { status: "OPEN" },
            orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
            select: {
              title: true,
              description: true,
              severity: true,
              confidenceScore: true,
              questionsToAsk: true,
              status: true,
            },
          },
        },
      }),
      thesisService.getLatest(dealId),
      analysisId
        ? Promise.resolve([])
        : prisma.analysis.findMany({
            where: {
              dealId,
              status: "COMPLETED",
              completedAt: { not: null },
              deal: { userId: user.id },
            },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            select: {
              ...analysisSelect,
              dealId: true,
              createdAt: true,
            },
          }),
      analysisId
        ? prisma.analysis.findFirst({
            where: {
              id: analysisId,
              dealId,
              status: "COMPLETED",
              completedAt: { not: null },
              deal: { userId: user.id },
            },
            select: analysisSelect,
          })
        : Promise.resolve(null),
    ]);

    if (!deal) {
      return NextResponse.json({ error: "Deal non trouve" }, { status: 404 });
    }

    const canonicalAnalysisMatch = analysisId
      ? requestedAnalysis
      : pickCanonicalAnalysis(
          latestThesis
            ? {
                id: latestThesis.id,
                corpusSnapshotId: latestThesis.corpusSnapshotId,
              }
            : null,
          completedAnalyses
        );

    const canonicalAnalysis = analysisId
      ? requestedAnalysis
      : completedAnalyses.find(
          (analysis) => analysis.id === canonicalAnalysisMatch?.id
        ) ?? null;

    const analysisMeta = analysisId ? requestedAnalysis : canonicalAnalysis;

    if (!analysisMeta) {
      return NextResponse.json(
        { error: "Aucune analyse canonique completee trouvee pour la these courante" },
        { status: analysisId ? 404 : 409 }
      );
    }

    const [pairedThesis, results, currentFacts] = await Promise.all([
      resolveAnalysisThesis({
        dealId,
        thesisId: analysisMeta.thesisId,
        corpusSnapshotId: analysisMeta.corpusSnapshotId,
      }),
      loadResults(analysisMeta.id),
      getCurrentFactsFromView(dealId),
    ]);
    if (!results) {
      return NextResponse.json(
        { error: "Aucune analyse completee trouvee" },
        { status: 404 }
      );
    }

    const factMap = buildCurrentFactMap(currentFacts);

    // 4. Load founder responses
    const founderResponseFacts = await prisma.factEvent.findMany({
      where: {
        dealId,
        source: "FOUNDER_RESPONSE",
        eventType: { notIn: ["DELETED", "SUPERSEDED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        reason: true,
        displayValue: true,
        category: true,
      },
    });

    const founderResponses = founderResponseFacts.map((fact) => ({
      question: fact.reason || "Question non specifiee",
      answer: fact.displayValue,
      category: fact.category,
    }));

    // 5. Load negotiation strategy from analysis metadata (if exists)
    const negotiationRaw = analysisMeta.negotiationStrategy;

    // 5b. Extract early warnings from analysis results (stored at top level of results JSON)
    const rawResults = results as Record<string, unknown>;
    const earlyWarnings = (rawResults?.earlyWarnings ?? []) as PdfExportData["earlyWarnings"];

    // 6. Build export data
    const exportData: PdfExportData = {
      deal: {
        name: deal.name,
        companyName: getCurrentFactString(factMap, "company.name") ?? deal.companyName,
        sector: deal.sector,
        stage: deal.stage,
        geography: deal.geography,
        valuationPre:
          getCurrentFactNumber(factMap, "financial.valuation_pre") ??
          (deal.valuationPre != null ? Number(deal.valuationPre) : null),
        amountRequested:
          getCurrentFactNumber(factMap, "financial.amount_raising") ??
          (deal.amountRequested != null ? Number(deal.amountRequested) : null),
        arr:
          getCurrentFactNumber(factMap, "financial.arr") ??
          (deal.arr != null ? Number(deal.arr) : null),
        growthRate:
          getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
          (deal.growthRate != null ? Number(deal.growthRate) : null),
        website: getCurrentFactString(factMap, "other.website") ?? deal.website,
        description: deal.description,
        founders: deal.founders,
        redFlags: deal.redFlags.map((f) => ({
          ...f,
          confidenceScore: f.confidenceScore != null ? Number(f.confidenceScore) : null,
        })),
      },
      thesis: pairedThesis
        ? {
            reformulated: pairedThesis.reformulated,
            verdict: pairedThesis.verdict,
            confidence: pairedThesis.confidence,
            evaluationAxes: normalizeThesisEvaluation({
              verdict: pairedThesis.verdict as never,
              confidence: pairedThesis.confidence,
              ycLens: pairedThesis.ycLens as never,
              thielLens: pairedThesis.thielLens as never,
              angelDeskLens: pairedThesis.angelDeskLens as never,
            }),
          }
        : null,
      analysis: {
        id: analysisMeta.id,
        type: analysisMeta.type,
        completedAt: analysisMeta.completedAt?.toISOString() ?? null,
        totalAgents: analysisMeta.totalAgents,
        completedAgents: analysisMeta.completedAgents,
        results: results as unknown as Record<string, PdfExportData["analysis"]["results"][string]>,
      },
      founderResponses,
      negotiation: negotiationRaw
        ? (negotiationRaw as unknown as PdfExportData["negotiation"])
        : null,
      earlyWarnings: earlyWarnings && Array.isArray(earlyWarnings) && earlyWarnings.length > 0
        ? earlyWarnings
        : undefined,
      format,
    };

    // 7. Generate PDF
    const pdfBuffer = await generateAnalysisPdf(exportData);

    // 8. Return PDF
    const prefix = format === "summary" ? "DD_Resume" : "DD_Complet";
    const companyLabel =
      getCurrentFactString(factMap, "company.name") ?? deal.companyName ?? deal.name;
    const filename = `${prefix}_${companyLabel.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export-pdf] Error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la generation du PDF" },
      { status: 500 }
    );
  }
}
