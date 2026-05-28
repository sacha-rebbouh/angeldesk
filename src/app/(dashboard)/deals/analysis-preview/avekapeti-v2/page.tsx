export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AnalysisV2PageShell } from "@/components/deals/analysis-v2/page-shell";
import { buildAnalysisV2ViewModel } from "@/components/deals/analysis-v2/lib/selectors";
import type { ResultsMap } from "@/components/deals/analysis-v2/lib/extractors";
import { prisma } from "@/lib/prisma";

const AVEKAPETI_DEAL_ID = "cmp9q8o690001l804fx5rd5mc";

function isLocalPreviewEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.BYPASS_AUTH === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    !process.env.VERCEL
  );
}

export default async function AvekapetiAnalysisV2PreviewPage() {
  if (!isLocalPreviewEnabled()) {
    notFound();
  }

  const [deal, analysis, thesis] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: AVEKAPETI_DEAL_ID },
      select: {
        id: true,
        name: true,
        companyName: true,
        status: true,
        sector: true,
        stage: true,
      },
    }),
    prisma.analysis.findFirst({
      where: { dealId: AVEKAPETI_DEAL_ID, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        results: true,
        totalCost: true,
        totalTimeMs: true,
        completedAt: true,
        totalAgents: true,
        completedAgents: true,
        mode: true,
      },
    }),
    prisma.thesis.findFirst({
      where: { dealId: AVEKAPETI_DEAL_ID, isLatest: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!deal || !analysis?.results || typeof analysis.results !== "object" || Array.isArray(analysis.results)) {
    notFound();
  }

  const results = analysis.results as unknown as ResultsMap;

  const vm = buildAnalysisV2ViewModel({
    deal: {
      id: deal.id,
      name: deal.name,
      companyName: deal.companyName,
      status: deal.status ?? null,
      sector: deal.sector ?? null,
      stage: deal.stage ?? null,
    },
    analysis: {
      results,
      completedAt: analysis.completedAt,
      totalCost: typeof analysis.totalCost === "number" ? analysis.totalCost : null,
      totalTimeMs: typeof analysis.totalTimeMs === "number" ? analysis.totalTimeMs : null,
      totalAgents: analysis.totalAgents,
      completedAgents: analysis.completedAgents,
      mode: analysis.mode,
    },
    thesis: thesis ? (thesis as unknown as Record<string, unknown>) : null,
  });

  const dealName = deal.companyName ?? deal.name ?? "Deal sans nom";

  return (
    <>
      <div className="flex flex-col gap-2 px-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Preview locale</Badge>
          <Badge variant="outline">Branche analysis-redesign-opus</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Route de test locale non exposée en production. Comparer avec /deals/analysis-preview/avekapeti (Codex).
        </p>
      </div>
      <AnalysisV2PageShell dealName={dealName} vm={vm} />
    </>
  );
}
