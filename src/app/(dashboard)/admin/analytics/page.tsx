import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminAnalyticsPage() {
  await requireAdmin();

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // ---- Section 1: Overview cards (independent queries in parallel) ----
  const [
    totalUsers,
    totalDeals,
    totalAnalysesCompleted,
    purchaseTransactions,
    deductionTransactions,
    avgBalanceResult,
    creditPacks,
    recentAnalyses,
    recentUsers,
  ] = await Promise.all([
    // Total users
    prisma.user.count(),

    // Total deals
    prisma.deal.count(),

    // Total analyses completed
    prisma.analysis.count({
      where: { completedAt: { not: null } },
    }),

    // All PURCHASE transactions (for total purchased + revenue estimate)
    prisma.creditTransaction.findMany({
      where: { action: "PURCHASE" },
      select: { amount: true, packName: true },
    }),

    // All consumption transactions (negative amounts)
    prisma.creditTransaction.aggregate({
      where: {
        action: {
          in: [
            "QUICK_SCAN",
            "DEEP_DIVE",
            "AI_BOARD",
            "LIVE_COACHING",
            "RE_ANALYSIS",
          ],
        },
      },
      _sum: { amount: true },
    }),

    // Average credit balance per user
    prisma.userCreditBalance.aggregate({
      _avg: { balance: true },
    }),

    // Credit packs for price lookup
    prisma.creditPack.findMany({
      select: { name: true, priceEur: true },
    }),

    // Recent analyses (last 7 days, grouped by date)
    prisma.analysis.findMany({
      where: {
        completedAt: { gte: sevenDaysAgo },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    }),

    // Recent users (last 7 days)
    prisma.user.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // ---- Compute derived metrics ----

  // Total credits purchased (sum of positive amounts from PURCHASE)
  const totalCreditsPurchased = purchaseTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );

  // Total credits consumed (absolute value of negative amounts)
  const totalCreditsConsumed = Math.abs(deductionTransactions._sum.amount ?? 0);

  // Revenue estimate: match pack names to prices
  const packPriceMap = new Map(creditPacks.map((p) => [p.name, p.priceEur]));
  const revenueEstimate = purchaseTransactions.reduce((sum, tx) => {
    const price = tx.packName ? (packPriceMap.get(tx.packName) ?? 0) : 0;
    return sum + price;
  }, 0);

  // Average balance
  const avgBalance = Math.round(avgBalanceResult._avg.balance ?? 0);

  // ---- Group analyses per day (last 7 days) ----
  const analysesPerDay = groupByDay(
    recentAnalyses.map((a) => a.completedAt!),
    7,
    now
  );

  // ---- Group new users per day (last 7 days) ----
  const usersPerDay = groupByDay(
    recentUsers.map((u) => u.createdAt),
    7,
    now
  );

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Platform Analytics
        </h1>
        <p className="text-muted-foreground">
          Key metrics and recent activity across the platform
        </p>
      </div>

      {/* Section 1: Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Users" value={totalUsers.toLocaleString()} />
        <MetricCard title="Total Deals" value={totalDeals.toLocaleString()} />
        <MetricCard
          title="Analyses Completed"
          value={totalAnalysesCompleted.toLocaleString()}
        />
        <MetricCard
          title="Credits Purchased"
          value={totalCreditsPurchased.toLocaleString()}
          subtitle="lifetime total"
        />
      </div>

      {/* Section 2: Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Analyses per Day</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysesPerDay.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New Users per Day</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersPerDay.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Credit Health */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Credit Health</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Avg Balance per User"
            value={avgBalance.toLocaleString()}
            subtitle="credits"
          />
          <MetricCard
            title="Credits Consumed"
            value={totalCreditsConsumed.toLocaleString()}
            subtitle="lifetime total"
          />
          <MetricCard
            title="Revenue Estimate"
            value={`${revenueEstimate.toLocaleString()} EUR`}
            subtitle="from pack purchases"
          />
        </div>
      </div>
    </div>
  );
}

// ---- Helper components ----

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Helper functions ----

function groupByDay(
  dates: Date[],
  days: number,
  referenceDate: Date
): { date: string; count: number }[] {
  const result: { date: string; count: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(referenceDate);
    day.setDate(day.getDate() - i);
    const dateStr = day.toISOString().split("T")[0];
    result.push({ date: dateStr, count: 0 });
  }

  for (const d of dates) {
    const dateStr = d.toISOString().split("T")[0];
    const entry = result.find((r) => r.date === dateStr);
    if (entry) {
      entry.count++;
    }
  }

  return result;
}
