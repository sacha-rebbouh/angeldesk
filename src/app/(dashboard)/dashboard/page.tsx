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
import {
  FolderKanban,
  AlertTriangle,
  TrendingUp,
  Plus,
} from "lucide-react";
import { RecentDealsList } from "@/components/deals/recent-deals-list";

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
