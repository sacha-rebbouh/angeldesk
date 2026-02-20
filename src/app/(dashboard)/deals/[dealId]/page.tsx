export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Users,
  AlertTriangle,
  TrendingUp,
  Brain,
  Crown,
  Handshake,
} from "lucide-react";
import { AnalysisPanelWrapper } from "@/components/deals/analysis-panel-wrapper";
import { ScoreGrid } from "@/components/deals/score-display";
import { BoardPanelWrapper } from "@/components/deals/board-panel-wrapper";
import { DocumentsTab } from "@/components/deals/documents-tab";
import { TeamManagement } from "@/components/deals/team-management";
import { ConditionsTab } from "@/components/deals/conditions/conditions-tab";
import type { TermsResponse, TrancheData, ConditionsFindings } from "@/components/deals/conditions/types";
import type { ConditionsAnalystData } from "@/agents/types";
import { DealInfoCard } from "@/components/deals/deal-info-card";
import { ChatWrapper } from "@/components/chat/chat-wrapper";
import { getStatusColor, getStatusLabel, getStageLabel, getSeverityColor, formatCurrencyEUR } from "@/lib/format-utils";

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

  const openRedFlags = deal.redFlags.filter((f) => f.status === "OPEN");
  const criticalFlags = openRedFlags.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
  );

  // Build initialData for ConditionsTab (avoids extra API roundtrip on tab click)
  const conditionsInitialData: TermsResponse = (() => {
    const rawTerms = deal.dealTerms;
    const cached = deal.conditionsAnalysis as ConditionsAnalystData | null;
    const mode = deal.dealStructure?.mode ?? "SIMPLE";
    const tranches: TrancheData[] | null = deal.dealStructure?.tranches
      ? deal.dealStructure.tranches.map(t => ({
          id: t.id,
          orderIndex: t.orderIndex,
          label: t.label ?? "",
          trancheType: t.trancheType,
          typeDetails: t.typeDetails,
          amount: t.amount != null ? Number(t.amount) : null,
          valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
          equityPct: t.equityPct != null ? Number(t.equityPct) : null,
          triggerType: t.triggerType,
          triggerDetails: t.triggerDetails,
          triggerDeadline: t.triggerDeadline?.toISOString() ?? null,
          instrumentTerms: t.instrumentTerms as Record<string, unknown> | null,
          liquidationPref: t.liquidationPref,
          antiDilution: t.antiDilution,
          proRataRights: t.proRataRights,
          status: t.status,
        }))
      : null;

    const normalizedTerms = rawTerms ? {
      valuationPre: rawTerms.valuationPre != null ? Number(rawTerms.valuationPre) : null,
      amountRaised: rawTerms.amountRaised != null ? Number(rawTerms.amountRaised) : null,
      dilutionPct: rawTerms.dilutionPct != null ? Number(rawTerms.dilutionPct) : null,
      instrumentType: rawTerms.instrumentType,
      instrumentDetails: rawTerms.instrumentDetails,
      liquidationPref: rawTerms.liquidationPref,
      antiDilution: rawTerms.antiDilution,
      proRataRights: rawTerms.proRataRights,
      informationRights: rawTerms.informationRights,
      boardSeat: rawTerms.boardSeat,
      founderVesting: rawTerms.founderVesting,
      vestingDurationMonths: rawTerms.vestingDurationMonths,
      vestingCliffMonths: rawTerms.vestingCliffMonths,
      esopPct: rawTerms.esopPct != null ? Number(rawTerms.esopPct) : null,
      dragAlong: rawTerms.dragAlong,
      tagAlong: rawTerms.tagAlong,
      ratchet: rawTerms.ratchet,
      payToPlay: rawTerms.payToPlay,
      milestoneTranches: rawTerms.milestoneTranches,
      nonCompete: rawTerms.nonCompete,
      customConditions: rawTerms.customConditions,
      notes: rawTerms.notes,
    } : null;

    const advice = (cached?.findings?.negotiationAdvice ?? []).map(a => ({
      ...a,
      priority: (a.priority?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low",
    }));
    const flags = (cached?.redFlags ?? []).map(rf => ({
      ...rf,
      severity: (rf.severity?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low",
    }));

    return {
      terms: normalizedTerms,
      mode: mode as "SIMPLE" | "STRUCTURED",
      tranches,
      conditionsScore: deal.conditionsScore ?? null,
      conditionsBreakdown: cached?.score?.breakdown ?? null,
      conditionsAnalysis: (cached?.findings ?? null) as ConditionsFindings | null,
      negotiationAdvice: advice.length > 0 ? advice : null,
      redFlags: flags.length > 0 ? flags : null,
      narrative: cached?.narrative ?? null,
      analysisStatus: cached ? "success" as const : null,
    };
  })();


  const content = (
    <div className="space-y-6">
      {/* Header */}
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
            <p className="text-muted-foreground">
              {deal.companyName ?? deal.name}
              {deal.website && (
                <a
                  href={deal.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center text-primary hover:underline"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Site web
                </a>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valorisation</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrencyEUR(
                deal.valuationPre ? Number(deal.valuationPre) : null
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pre-money • {getStageLabel(deal.stage, "Non d\u00e9fini")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ARR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrencyEUR(deal.arr ? Number(deal.arr) : null)}
            </div>
            <p className="text-xs text-muted-foreground">
              {deal.growthRate
                ? `+${Number(deal.growthRate)}% YoY`
                : "Croissance non définie"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deal.documents.length}</div>
            <p className="text-xs text-muted-foreground">Fichiers uploadés</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Red Flags</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openRedFlags.length}</div>
            <p className="text-xs text-muted-foreground">
              {criticalFlags.length > 0
                ? `${criticalFlags.length} critique${criticalFlags.length > 1 ? "s" : ""}`
                : "Aucun critique"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={tab || "overview"} className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="overview" className="whitespace-nowrap">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="analysis" className="whitespace-nowrap">
            <Brain className="mr-1 h-4 w-4" />
            Analyse IA
          </TabsTrigger>
          <TabsTrigger value="documents" className="whitespace-nowrap">
            Documents ({deal.documents.length})
          </TabsTrigger>
          <TabsTrigger value="founders" className="whitespace-nowrap">
            Team ({deal.founders.length})
          </TabsTrigger>
          <TabsTrigger value="conditions" className="whitespace-nowrap">
            <Handshake className="mr-1 h-4 w-4" />
            Conditions
          </TabsTrigger>
          <TabsTrigger value="redflags" className="whitespace-nowrap">
            Red Flags ({openRedFlags.length})
          </TabsTrigger>
          <TabsTrigger value="ai-board" className="whitespace-nowrap">
            <Users className="mr-1 h-4 w-4" />
            AI Board
            <Badge variant="secondary" className="ml-1 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 text-[10px] px-1.5 py-0">
              <Crown className="mr-0.5 h-2.5 w-2.5" />
              PRO
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DealInfoCard
              deal={{
                id: deal.id,
                sector: deal.sector,
                stage: deal.stage,
                geography: deal.geography,
                description: deal.description,
                amountRequested: deal.amountRequested ? Number(deal.amountRequested) : null,
                arr: deal.arr ? Number(deal.arr) : null,
                growthRate: deal.growthRate ? Number(deal.growthRate) : null,
                valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Scores</CardTitle>
                <CardDescription>
                  {deal.globalScore != null
                    ? "Scores calculés par l'analyse IA"
                    : "Lancez une analyse pour obtenir les scores"}
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Brain className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      Aucune analyse effectuée
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Allez dans l&apos;onglet &quot;Analyse IA&quot; pour lancer une analyse
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <AnalysisPanelWrapper
            dealId={deal.id}
            currentStatus={deal.status}
            analyses={deal.analyses.map(a => ({
              ...a,
              // Only inject results for the latest completed analysis (loaded separately)
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

        <TabsContent value="documents">
          <DocumentsTab
            dealId={deal.id}
            documents={deal.documents.map((doc) => ({
              ...doc,
              extractionWarnings: doc.extractionWarnings as { code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }[] | null,
            }))}
          />
        </TabsContent>

        <TabsContent value="founders">
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

        <TabsContent value="redflags">
          <Card>
            <CardHeader>
              <CardTitle>Red Flags</CardTitle>
              <CardDescription>
                Points d&apos;attention detectes par l&apos;analyse
              </CardDescription>
            </CardHeader>
            <CardContent>
              {openRedFlags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">Aucun red flag</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Lancez une analyse pour detecter les points d&apos;attention.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {openRedFlags.map((flag) => (
                    <div key={flag.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            className={`h-5 w-5 ${
                              flag.severity === "CRITICAL"
                                ? "text-red-500"
                                : flag.severity === "HIGH"
                                  ? "text-orange-500"
                                  : "text-yellow-500"
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{flag.title}</p>
                              <Badge className={getSeverityColor(flag.severity)}>
                                {flag.severity}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {flag.description}
                            </p>
                            {flag.questionsToAsk.length > 0 && (
                              <div className="mt-3">
                                <p className="text-sm font-medium">
                                  Questions à poser :
                                </p>
                                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                                  {flag.questionsToAsk.map((q, i) => (
                                    <li key={i}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {Math.round(Number(flag.confidenceScore) * 100)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-board">
          <BoardPanelWrapper dealId={deal.id} dealName={deal.name} />
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
