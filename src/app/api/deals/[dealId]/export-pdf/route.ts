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
import { generateAnalysisPdf, type PdfExportData, type PdfFormat } from "@/lib/pdf/generate-analysis-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;
    const analysisId = request.nextUrl.searchParams.get("analysisId");
    const format = (request.nextUrl.searchParams.get("format") === "summary" ? "summary" : "full") as PdfFormat;

    // 1. Check subscription — PRO only
    // requireAuth() returns the Prisma User directly (with subscriptionStatus)
    if (user.subscriptionStatus === "FREE") {
      return NextResponse.json(
        { error: "L'export PDF est reserve aux utilisateurs PRO." },
        { status: 403 }
      );
    }

    // 2. Load deal with relations
    const deal = await prisma.deal.findFirst({
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
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal non trouve" }, { status: 404 });
    }

    // 3. Load analysis (specific or latest completed)
    const analysis = analysisId
      ? await prisma.analysis.findFirst({
          where: { id: analysisId, dealId, deal: { userId: user.id } },
        })
      : await prisma.analysis.findFirst({
          where: { dealId, status: "COMPLETED", deal: { userId: user.id } },
          orderBy: { createdAt: "desc" },
        });

    if (!analysis || !analysis.results) {
      return NextResponse.json(
        { error: "Aucune analyse completee trouvee" },
        { status: 404 }
      );
    }

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

    // 5. Load negotiation strategy from analysis JSON field (if exists)
    const negotiationRaw = analysis.negotiationStrategy;

    // 5b. Extract early warnings from analysis results (stored at top level of results JSON)
    const rawResults = analysis.results as Record<string, unknown>;
    const earlyWarnings = (rawResults?.earlyWarnings ?? []) as PdfExportData["earlyWarnings"];

    // 6. Build export data
    const exportData: PdfExportData = {
      deal: {
        name: deal.name,
        companyName: deal.companyName,
        sector: deal.sector,
        stage: deal.stage,
        geography: deal.geography,
        valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
        amountRequested: deal.amountRequested != null ? Number(deal.amountRequested) : null,
        arr: deal.arr != null ? Number(deal.arr) : null,
        growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
        website: deal.website,
        description: deal.description,
        founders: deal.founders,
        redFlags: deal.redFlags.map((f) => ({
          ...f,
          confidenceScore: f.confidenceScore != null ? Number(f.confidenceScore) : null,
        })),
      },
      analysis: {
        id: analysis.id,
        type: analysis.type,
        completedAt: analysis.completedAt?.toISOString() ?? null,
        totalAgents: analysis.totalAgents,
        completedAgents: analysis.completedAgents,
        results: analysis.results as unknown as Record<string, PdfExportData["analysis"]["results"][string]>,
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
    const filename = `${prefix}_${(deal.companyName ?? deal.name).replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

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
