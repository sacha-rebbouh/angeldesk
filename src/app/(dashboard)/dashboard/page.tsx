import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
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
import {
  FolderKanban,
  AlertTriangle,
  TrendingUp,
  Plus,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RecentDealsList } from "@/components/deals/recent-deals-list";
import { FirstDealGuide } from "@/components/onboarding/first-deal-guide";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { formatAnalysisMode } from "@/lib/analysis-constants";

const PIPELINE_STATUSES = [
  { value: "SCREENING", label: "Screening", color: "bg-blue-500" },
  { value: "ANALYZING", label: "Analyse", color: "bg-yellow-500" },
  { value: "IN_DD", label: "En DD", color: "bg-purple-500" },
  { value: "NEGOTIATING", label: "Négociation", color: "bg-orange-500" },
  { value: "COMMITTED", label: "Investi", color: "bg-green-500" },
  { value: "PASSED", label: "Passé", color: "bg-gray-400" },
] as const;

async function getDashboardStats(userId: string) {
  noStore();
  const [totalDeals, activeDeals, recentDeals, redFlagsCount, topRedFlags, dealsByStatus, recentAnalyses, dealsWithScores] =
    await Promise.all([
      prisma.deal.count({ where: { userId } }),
      prisma.deal.count({
        where: {
          userId,
          status: { in: ["SCREENING", "ANALYZING", "IN_DD"] },
        },
      }),
      prisma.deal.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          redFlags: {
            where: { status: "OPEN" },
            select: { severity: true },
          },
        },
      }),
      prisma.redFlag.count({
        where: {
          deal: { userId },
          status: "OPEN",
        },
      }),
      // Top red flags for the dashboard (F87)
      prisma.redFlag.findMany({
        where: {
          deal: { userId },
          status: "OPEN",
          severity: { in: ["CRITICAL", "HIGH"] },
        },
        orderBy: { detectedAt: "desc" },
        take: 5,
        include: {
          deal: { select: { id: true, name: true } },
        },
      }),
      // Deals grouped by status (F87)
      prisma.deal.groupBy({
        by: ["status"],
        where: { userId },
        _count: { id: true },
      }),
      // Recent analyses (F87)
      prisma.analysis.findMany({
        where: { deal: { userId }, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 5,
        include: {
          deal: { select: { id: true, name: true } },
        },
      }),
      // Deals with scores for portfolio metrics (F87)
      prisma.deal.findMany({
        where: { userId, globalScore: { not: null } },
        select: { globalScore: true, sector: true },
      }),
    ]);

  // Compute pipeline counts
  const pipelineCounts: Record<string, number> = {};
  for (const s of dealsByStatus) {
    pipelineCounts[s.status] = s._count.id;
  }

  // Portfolio metrics
  const scores = dealsWithScores.map(d => d.globalScore!);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const sectorDistribution = [...new Set(dealsWithScores.map(d => d.sector).filter(Boolean))];

  return {
    totalDeals,
    activeDeals,
    recentDeals,
    redFlagsCount,
    topRedFlags,
    pipelineCounts,
    recentAnalyses,
    avgScore,
    sectorDistribution,
    dealsWithScoresCount: dealsWithScores.length,
  };
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const {
    totalDeals,
    activeDeals,
    recentDeals,
    redFlagsCount,
    topRedFlags,
    pipelineCounts,
    recentAnalyses,
    avgScore,
    sectorDistribution,
    dealsWithScoresCount,
  } = await getDashboardStats(user.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Bienvenue, {user.name ?? "Business Angel"}
          </p>
        </div>
        <Button asChild>
          <Link href="/deals/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau deal
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDeals}</div>
            <p className="text-xs text-muted-foreground">
              {activeDeals} en cours
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Red Flags</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{redFlagsCount}</div>
            <p className="text-xs text-muted-foreground">À investiguer</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plan</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.subscriptionStatus === "FREE" ? "Gratuit" : "Pro"}
            </div>
            <p className="text-xs text-muted-foreground">
              {user.subscriptionStatus === "FREE"
                ? "3 deals/mois"
                : "Illimité"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score moyen</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore !== null ? `${avgScore}/100` : "-"}</div>
            <p className="text-xs text-muted-foreground">
              {dealsWithScoresCount} deal{dealsWithScoresCount !== 1 ? "s" : ""} scoré{dealsWithScoresCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Bar (F87) */}
      {totalDeals > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-4 rounded-full overflow-hidden bg-muted">
              {PIPELINE_STATUSES.map(({ value, label, color }) => {
                const count = pipelineCounts[value] ?? 0;
                if (count === 0) return null;
                const pct = (count / totalDeals) * 100;
                return (
                  <div
                    key={value}
                    className={cn("h-full transition-all", color)}
                    style={{ width: `${pct}%` }}
                    title={`${label}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {PIPELINE_STATUSES.map(({ value, label, color }) => {
                const count = pipelineCounts[value] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className={cn("h-2.5 w-2.5 rounded-full", color)} />
                    <span>{label} ({count})</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onboarding Guide for first-time users (F33) */}
      <FirstDealGuide
        userName={user.name ?? "Business Angel"}
        totalDeals={totalDeals}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Red Flags (F87) */}
        {topRedFlags.length > 0 && (
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Alertes prioritaires
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topRedFlags.map((rf) => (
                  <Link
                    key={rf.id}
                    href={`/deals/${rf.deal.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={rf.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-xs shrink-0">
                        {rf.severity}
                      </Badge>
                      <span className="text-sm truncate">{rf.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2 group-hover:text-foreground">
                      {rf.deal.name}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Analyses (F87) */}
        {recentAnalyses.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-500" />
                Analyses récentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentAnalyses.map((analysis) => (
                  <Link
                    key={analysis.id}
                    href={`/deals/${analysis.deal.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{analysis.deal.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatAnalysisMode(analysis.type)}
                      </Badge>
                    </div>
                    {analysis.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(analysis.completedAt), { addSuffix: true, locale: fr })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Portfolio Metrics (F87) */}
      {avgScore !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Métriques Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{avgScore}/100</div>
                <p className="text-xs text-muted-foreground">Score moyen</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{sectorDistribution.length}</div>
                <p className="text-xs text-muted-foreground">Secteurs couverts</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{dealsWithScoresCount}</div>
                <p className="text-xs text-muted-foreground">Deals scorés</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Deals */}
      <Card>
        <CardHeader>
          <CardTitle>Deals récents</CardTitle>
          <CardDescription>
            Vos derniers deals analysés ou en cours
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FolderKanban className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Aucun deal</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Commencez par ajouter votre premier deal à analyser.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/deals/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un deal
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <RecentDealsList deals={recentDeals} />
              <div className="text-center">
                <Button variant="outline" asChild>
                  <Link href="/deals">Voir tous les deals</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
