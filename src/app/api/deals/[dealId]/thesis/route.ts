/**
 * GET /api/deals/[dealId]/thesis
 *
 * Retourne la these courante (version latest) du deal + historique versions.
 * Auth + ownership check obligatoires.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import { normalizeThesisEvaluation } from "@/services/thesis/normalization";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

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

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const requestedAnalysisId = url.searchParams.get("analysisId");

    if (requestedAnalysisId && !isValidCuid(requestedAnalysisId)) {
      return NextResponse.json({ error: "Invalid analysis ID format" }, { status: 400 });
    }

    const [latest, history, requestedAnalysis] = await Promise.all([
      thesisService.getLatest(dealId),
      thesisService.getHistory(dealId),
      requestedAnalysisId
        ? prisma.analysis.findFirst({
            where: { id: requestedAnalysisId, dealId },
            select: {
              id: true,
              thesisId: true,
              thesisBypass: true,
              corpusSnapshotId: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const selectedThesis = requestedAnalysis
      ? await resolveAnalysisThesis({
          dealId,
          thesisId: requestedAnalysis.thesisId,
          corpusSnapshotId: requestedAnalysis.corpusSnapshotId,
        })
      : latest;

    if (!selectedThesis) {
      return NextResponse.json({
        data: {
          thesis: null,
          history: [],
          hasPendingDecision: false,
        },
      });
    }

    const hasPendingDecision = selectedThesis.decision === null;

    // Propagation de thesisBypass depuis l'analyse la plus recente liee a cette these
    const linkedAnalysis = await prisma.analysis.findFirst({
      where: { dealId, thesisId: selectedThesis.id },
      select: { thesisBypass: true, corpusSnapshotId: true },
      orderBy: { createdAt: "desc" },
    });

    const latestEnriched = {
      ...selectedThesis,
      thesisBypass: requestedAnalysis?.thesisId === selectedThesis.id
        ? requestedAnalysis.thesisBypass
        : linkedAnalysis?.thesisBypass ?? false,
      linkedCorpusSnapshotId: requestedAnalysis?.thesisId === selectedThesis.id
        ? requestedAnalysis.corpusSnapshotId ?? selectedThesis.corpusSnapshotId ?? null
        : linkedAnalysis?.corpusSnapshotId ?? selectedThesis.corpusSnapshotId ?? null,
      evaluationAxes: normalizeThesisEvaluation({
        verdict: selectedThesis.verdict as never,
        confidence: selectedThesis.confidence,
        ycLens: selectedThesis.ycLens as never,
        thielLens: selectedThesis.thielLens as never,
        angelDeskLens: selectedThesis.angelDeskLens as never,
      }),
    };

    return NextResponse.json({
      data: {
        thesis: latestEnriched,
        // History enrichie : renvoie les champs necessaires pour le diff (RevisionBanner)
        history: history.map((h) => ({
          id: h.id,
          version: h.version,
          isLatest: h.isLatest,
          verdict: h.verdict,
          confidence: h.confidence,
          createdAt: h.createdAt,
          decision: h.decision,
          corpusSnapshotId: h.corpusSnapshotId,
          reformulated: h.reformulated,
          problem: h.problem,
          solution: h.solution,
          whyNow: h.whyNow,
          moat: h.moat,
          pathToExit: h.pathToExit,
          loadBearing: h.loadBearing,
          evaluationAxes: normalizeThesisEvaluation({
            verdict: h.verdict as never,
            confidence: h.confidence,
            ycLens: h.ycLens as never,
            thielLens: h.thielLens as never,
            angelDeskLens: h.angelDeskLens as never,
          }),
        })),
        hasPendingDecision,
      },
    });
  } catch (error) {
    return handleApiError(error, "get thesis");
  }
}
