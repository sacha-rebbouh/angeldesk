export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnalysisPreviewTabs } from "@/components/deals/analysis-preview-tabs";
import { prisma } from "@/lib/prisma";
import { extractDealScore } from "@/lib/score-utils";

const AVEKAPETI_DEAL_ID = "cmp9q8o690001l804fx5rd5mc";

function isLocalPreviewEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.BYPASS_AUTH === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    !process.env.VERCEL
  );
}

export default async function AvekapetiAnalysisPreviewPage() {
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
      },
    }),
    prisma.analysis.findFirst({
      where: {
        dealId: AVEKAPETI_DEAL_ID,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        results: true,
        totalCost: true,
        totalTimeMs: true,
        completedAt: true,
        totalAgents: true,
        completedAgents: true,
      },
    }),
    prisma.thesis.findFirst({
      where: {
        dealId: AVEKAPETI_DEAL_ID,
        isLatest: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        reformulated: true,
        problem: true,
        solution: true,
        whyNow: true,
        moat: true,
        verdict: true,
        confidence: true,
      },
    }),
  ]);

  if (!deal || !analysis?.results || typeof analysis.results !== "object" || Array.isArray(analysis.results)) {
    notFound();
  }

  const results = analysis.results as unknown as Parameters<typeof AnalysisPreviewTabs>[0]["results"];
  const currentScore = extractDealScore(results);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Preview locale</Badge>
            <Badge variant="outline">Branche analysis-redesign-avekapeti</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {deal.companyName ?? deal.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Route de test locale non exposée en production. Elle contourne seulement le filtre owner pour afficher le deal Avekapeti avec le nouveau front.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {analysis.completedAgents}/{analysis.totalAgents} agents · analyse {analysis.completedAt ? new Date(analysis.completedAt).toLocaleDateString("fr-FR") : "terminée"}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle lecture de l’analyse</CardTitle>
          <CardDescription>
            Même composant que celui branché dans l’onglet analyse, rendu dans une vraie page AngelDesk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalysisPreviewTabs
            dealName={deal.companyName ?? deal.name}
            results={results}
            thesis={thesis}
            totalTimeMs={analysis.totalTimeMs}
            totalCost={analysis.totalCost ? Number(analysis.totalCost) : null}
            currentScore={currentScore ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
