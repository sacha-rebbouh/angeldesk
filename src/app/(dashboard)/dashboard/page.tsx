export const dynamic = "force-dynamic";

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
  ArrowRight,
} from "lucide-react";

async function getDashboardStats(userId: string) {
  const [totalDeals, activeDeals, recentDeals, redFlagsCount] =
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
    ]);

  return { totalDeals, activeDeals, recentDeals, redFlagsCount };
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Passé",
    INVESTED: "Investi",
    ARCHIVED: "Archivé",
  };
  return labels[status] ?? status;
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const { totalDeals, activeDeals, recentDeals, redFlagsCount } =
    await getDashboardStats(user.id);

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
      <div className="grid gap-4 md:grid-cols-3">
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
      </div>

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
              {recentDeals.map((deal) => {
                const criticalFlags = deal.redFlags.filter(
                  (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
                ).length;

                return (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{deal.name}</span>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(deal.status)}
                        >
                          {getStatusLabel(deal.status)}
                        </Badge>
                        {criticalFlags > 0 && (
                          <Badge variant="destructive">
                            {criticalFlags} red flag
                            {criticalFlags > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {deal.sector ?? "Secteur non défini"} •{" "}
                        {deal.stage ?? "Stade non défini"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/deals/${deal.id}`}>
                        Voir
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
              {recentDeals.length > 0 && (
                <div className="text-center">
                  <Button variant="outline" asChild>
                    <Link href="/deals">Voir tous les deals</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
