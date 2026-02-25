export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ExternalLink,
  Brain,
  Handshake,
  Radio,
} from "lucide-react";
import { AnalysisPanelWrapper } from "@/components/deals/analysis-panel-wrapper";
import { ScoreGrid } from "@/components/deals/score-display";
import { DocumentsTab } from "@/components/deals/documents-tab";
import { TeamManagement } from "@/components/deals/team-management";
import { ConditionsTab } from "@/components/deals/conditions/conditions-tab";
import type { TermsResponse } from "@/components/deals/conditions/types";
import type { ConditionsAnalystData } from "@/agents/types";
import { normalizeTranche, buildTermsResponse } from "@/services/terms-normalization";
import { DealInfoCard } from "@/components/deals/deal-info-card";
import { ChatWrapper } from "@/components/chat/chat-wrapper";
import LiveTabLoader from "@/components/deals/live-tab-loader";
import { getStatusColor, getStatusLabel, getStageLabel, formatCurrencyEUR } from "@/lib/format-utils";

async function getDeal(dealId: string, userId: string) {
  return prisma.deal.findFirst({
    where: {
      id: dealId,
      userId,
    },
    include: {
      founders: true,
      documents: {
        orderBy: { uploadedAt: "desc" },
      },
      redFlags: {
        orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      },
      analyses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          mode: true,
          status: true,
          totalAgents: true,
          completedAgents: true,
          summary: true,
          startedAt: true,
          completedAt: true,
          totalCost: true,
          totalTimeMs: true,
          createdAt: true,
          // results excluded — loaded separately for the latest completed analysis only
        },
      },
      // Conditions tab: prefetch to avoid extra API roundtrip on tab click
      dealTerms: true,
      dealStructure: {
        include: { tranches: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });
}

/** Load full results for the latest COMPLETED analysis only (avoids loading all analysis results) */
async function getLatestAnalysisResults(dealId: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, results: true },
  });
  return analysis;
}

interface PageProps {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function DealDetailPage({ params, searchParams }: PageProps) {
  const user = await requireAuth();
  const { dealId } = await params;
  const { tab } = await searchParams;
  const [deal, latestResults] = await Promise.all([
    getDeal(dealId, user.id),
    getLatestAnalysisResults(dealId),
  ]);

  if (!deal) {
    notFound();
  }

  // Build initialData for ConditionsTab (avoids extra API roundtrip on tab click)
  const conditionsInitialData: TermsResponse = (() => {
    const cached = deal.conditionsAnalysis as ConditionsAnalystData | null;
    const mode = (deal.dealStructure?.mode ?? "SIMPLE") as "SIMPLE" | "STRUCTURED";
    const tranches = deal.dealStructure?.tranches
      ? deal.dealStructure.tranches.map(normalizeTranche)
      : null;

    return buildTermsResponse(
      deal.dealTerms as Record<string, unknown> | null,
      cached,
      deal.conditionsScore ?? null,
      mode,
      tranches,
    );
  })();


  const content = (
    <div className="space-y-6">
      {/* Header — enriched with stage, sector, amount */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/deals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{deal.name}</h1>
              <Badge
                variant="secondary"
                className={getStatusColor(deal.status)}
              >
                {getStatusLabel(deal.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              {deal.companyName && deal.companyName !== deal.name && (
                <span>{deal.companyName}</span>
              )}
              {deal.stage && (
                <Badge variant="outline" className="text-xs">
                  {getStageLabel(deal.stage, deal.stage)}
                </Badge>
              )}
              {deal.sector && <span>{deal.sector}</span>}
              {deal.valuationPre != null && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{formatCurrencyEUR(Number(deal.valuationPre))}</span>
                </>
              )}
              {deal.website && (
                <a
                  href={deal.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-primary hover:underline"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Site web
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Tabs: Vue d'ensemble | Analyse IA | Documents & Team | Conditions */}
      <Tabs defaultValue={tab || "overview"} className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="overview" className="whitespace-nowrap">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="analysis" className="whitespace-nowrap">
            <Brain className="mr-1 h-4 w-4" />
            Analyse IA
          </TabsTrigger>
          <TabsTrigger value="docs-team" className="whitespace-nowrap">
            Documents & Team
          </TabsTrigger>
          <TabsTrigger value="conditions" className="whitespace-nowrap">
            <Handshake className="mr-1 h-4 w-4" />
            Conditions
          </TabsTrigger>
          <TabsTrigger value="live" className="whitespace-nowrap">
            <Radio className="mr-1 h-4 w-4" />
            Live
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Vue d'ensemble — Scores + DealInfo */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5">
                    <Brain className="h-4 w-4 text-foreground/70" />
                  </div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Scores</h3>
                </div>
                {deal.globalScore != null && (
                  <span className="text-[11px] text-muted-foreground/60 font-medium">Analyse IA</span>
                )}
              </div>
              <div className="px-6 py-5">
                {deal.globalScore != null ? (
                  <ScoreGrid
                    scores={{
                      global: deal.globalScore,
                      fundamentals: deal.fundamentalsScore,
                      conditions: deal.conditionsScore,
                      team: deal.teamScore,
                      market: deal.marketScore,
                      product: deal.productScore,
                      financials: deal.financialsScore,
                    }}
                    stage={deal.stage}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="rounded-2xl bg-muted/50 p-4">
                      <Brain className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <p className="mt-5 text-sm font-semibold">Aucune analyse effectuée</p>
                    <p className="mt-1.5 text-xs text-muted-foreground max-w-xs">
                      Allez dans l&apos;onglet &quot;Analyse IA&quot; pour lancer une analyse
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DealInfoCard
              deal={{
                id: deal.id,
                sector: deal.sector,
                stage: deal.stage,
                geography: deal.geography,
                description: deal.description,
                amountRequested: deal.amountRequested != null ? Number(deal.amountRequested) : null,
                arr: deal.arr != null ? Number(deal.arr) : null,
                growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
                valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
              }}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Analyse IA — Analysis Panel (includes AI Board as sub-tab) */}
        <TabsContent value="analysis" className="space-y-6">
          <AnalysisPanelWrapper
            dealId={deal.id}
            dealName={deal.name}
            currentStatus={deal.status}
            analyses={deal.analyses.map(a => ({
              ...a,
              results: (latestResults && a.id === latestResults.id
                ? latestResults.results as Record<string, {
                    agentName: string;
                    success: boolean;
                    executionTimeMs: number;
                    cost: number;
                    error?: string;
                    data?: unknown;
                  }>
                : null),
              startedAt: a.startedAt?.toISOString() ?? null,
              completedAt: a.completedAt?.toISOString() ?? null,
              totalCost: a.totalCost?.toString() ?? null,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        </TabsContent>

        {/* Tab 3: Documents & Team */}
        <TabsContent value="docs-team" className="space-y-6">
          <DocumentsTab
            dealId={deal.id}
            documents={deal.documents.map((doc) => ({
              ...doc,
              extractionWarnings: doc.extractionWarnings as { code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }[] | null,
            }))}
          />
          <TeamManagement
            dealId={deal.id}
            founders={deal.founders.map((f) => ({
              ...f,
              verifiedInfo: f.verifiedInfo as Record<string, unknown> | null,
              previousVentures: f.previousVentures,
              createdAt: f.createdAt.toISOString(),
            }))}
          />
        </TabsContent>

        {/* Tab 4: Conditions & Negociation */}
        <TabsContent value="conditions">
          <ConditionsTab
            dealId={deal.id}
            stage={deal.stage}
            initialData={conditionsInitialData}
            termSheetDoc={(() => {
              const ts = deal.documents.find(d =>
                d.type === "TERM_SHEET" ||
                d.name.toLowerCase().includes("term sheet") ||
                d.name.toLowerCase().includes("termsheet")
              );
              return ts ? { id: ts.id, name: ts.name } : null;
            })()}
          />
        </TabsContent>

        {/* Tab 5: Live Coaching */}
        <TabsContent value="live">
          <LiveTabLoader dealId={deal.id} dealName={deal.name} />
        </TabsContent>
      </Tabs>

      {/* Chat IA - split view on desktop (F86) */}
    </div>
  );

  return (
    <ChatWrapper dealId={deal.id} dealName={deal.name}>
      {content}
    </ChatWrapper>
  );
}
