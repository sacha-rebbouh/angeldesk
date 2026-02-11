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
} from "lucide-react";
import { AnalysisPanelWrapper } from "@/components/deals/analysis-panel-wrapper";
import { ScoreGrid } from "@/components/deals/score-display";
import { BoardPanelWrapper } from "@/components/deals/board-panel-wrapper";
import { DocumentsTab } from "@/components/deals/documents-tab";
import { TeamManagement } from "@/components/deals/team-management";
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
      },
    },
  });
}

interface PageProps {
  params: Promise<{ dealId: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const user = await requireAuth();
  const { dealId } = await params;
  const deal = await getDeal(dealId, user.id);

  if (!deal) {
    notFound();
  }

  const openRedFlags = deal.redFlags.filter((f) => f.status === "OPEN");
  const criticalFlags = openRedFlags.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
  );


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
      <Tabs defaultValue="overview" className="space-y-4">
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
            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Secteur
                    </p>
                    <p>{deal.sector ?? "Non défini"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Stade
                    </p>
                    <p>{getStageLabel(deal.stage, "Non d\u00e9fini")}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Géographie
                    </p>
                    <p>{deal.geography ?? "Non défini"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Montant demande
                    </p>
                    <p>
                      {formatCurrencyEUR(
                        deal.amountRequested
                          ? Number(deal.amountRequested)
                          : null
                      )}
                    </p>
                  </div>
                </div>
                {deal.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Description
                    </p>
                    <p className="mt-1 text-sm">{deal.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scores</CardTitle>
                <CardDescription>
                  {deal.globalScore
                    ? "Scores calculés par l'analyse IA"
                    : "Lancez une analyse pour obtenir les scores"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deal.globalScore ? (
                  <ScoreGrid
                    scores={{
                      global: deal.globalScore,
                      team: deal.teamScore,
                      market: deal.marketScore,
                      product: deal.productScore,
                      financials: deal.financialsScore,
                    }}
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
              results: a.results as Record<string, {
                agentName: string;
                success: boolean;
                executionTimeMs: number;
                cost: number;
                error?: string;
                data?: unknown;
              }> | null,
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
