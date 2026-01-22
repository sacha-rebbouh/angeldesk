"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Activity,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface CostBreakdown {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface CostAlert {
  id: string;
  type: string;
  severity: "warning" | "critical";
  message: string;
  dealId?: string;
  dealName?: string;
  currentCost: number;
  threshold: number;
  createdAt: string;
}

interface CostData {
  global: {
    totalCost: number;
    totalAnalyses: number;
    avgCostPerAnalysis: number;
    costByDay: { date: string; cost: number; analyses: number }[];
    costByModel: CostBreakdown[];
    costByType: Record<string, { count: number; totalCost: number; avgCost: number }>;
    topDeals: { dealId: string; dealName: string; totalCost: number }[];
  };
  user: {
    totalCost: number;
    totalAnalyses: number;
    avgCostPerAnalysis: number;
    totalDeals: number;
    costByDay: { date: string; cost: number; analyses: number }[];
    costByType: Record<string, { count: number; totalCost: number }>;
    topDeals: { dealId: string; dealName: string; totalCost: number }[];
  } | null;
  alerts: CostAlert[];
  estimates: Record<string, { min: number; max: number; avg: number }>;
}

async function fetchCostData(days: number): Promise<CostData> {
  const res = await fetch(`/api/admin/costs?days=${days}`);
  if (!res.ok) {
    throw new Error("Failed to fetch cost data");
  }
  const json = await res.json();
  return json.data;
}

interface CostsDashboardProps {
  defaultDays?: number;
}

export function CostsDashboard({ defaultDays = 30 }: CostsDashboardProps) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(defaultDays);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.costs.stats(days),
    queryFn: () => fetchCostData(days),
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDaysChange = useCallback((value: string) => {
    setDays(Number(value));
  }, []);

  // Memoize computed values
  const costTrend = useMemo(() => {
    if (!data?.global.costByDay?.length) return null;
    const days = data.global.costByDay;
    if (days.length < 2) return null;

    const recent = days.slice(-7).reduce((sum, d) => sum + d.cost, 0);
    const previous = days.slice(-14, -7).reduce((sum, d) => sum + d.cost, 0);

    if (previous === 0) return null;
    return ((recent - previous) / previous) * 100;
  }, [data?.global.costByDay]);

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-8 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">Failed to load cost data</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={handleRefresh}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cost Monitoring</h2>
          <p className="text-muted-foreground">
            Track LLM costs and usage across your analyses
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={String(days)} onValueChange={handleDaysChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <AlertsSection alerts={data.alerts} />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Cost"
          value={`$${(data?.global.totalCost ?? 0).toFixed(2)}`}
          description={`${days} days`}
          icon={<DollarSign className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Total Analyses"
          value={String(data?.global.totalAnalyses ?? 0)}
          description={`${days} days`}
          icon={<Activity className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Avg Cost/Analysis"
          value={`$${(data?.global.avgCostPerAnalysis ?? 0).toFixed(4)}`}
          description="per analysis"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Cost Trend"
          value={costTrend !== null ? `${costTrend > 0 ? "+" : ""}${costTrend.toFixed(1)}%` : "N/A"}
          description="vs previous 7 days"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
          trend={costTrend}
        />
      </div>

      {/* Detailed Views */}
      <Tabs defaultValue="breakdown" className="space-y-4">
        <TabsList>
          <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="daily">Daily Costs</TabsTrigger>
          <TabsTrigger value="deals">Top Deals</TabsTrigger>
          <TabsTrigger value="estimates">Cost Estimates</TabsTrigger>
        </TabsList>

        <TabsContent value="breakdown">
          <CostBreakdownTable
            byModel={data?.global.costByModel ?? []}
            byType={data?.global.costByType ?? {}}
            loading={isLoading}
          />
        </TabsContent>

        <TabsContent value="daily">
          <DailyCostsTable
            costs={data?.global.costByDay ?? []}
            loading={isLoading}
          />
        </TabsContent>

        <TabsContent value="deals">
          <TopDealsTable
            deals={data?.global.topDeals ?? []}
            loading={isLoading}
          />
        </TabsContent>

        <TabsContent value="estimates">
          <CostEstimatesTable
            estimates={data?.estimates ?? {}}
            loading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-components

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  loading?: boolean;
  trend?: number | null;
}

function SummaryCard({ title, value, description, icon, loading, trend }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 bg-muted animate-pulse rounded" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {description}
              {trend !== null && trend !== undefined && (
                <span className={trend > 0 ? "text-red-500" : "text-green-500"}>
                  {trend > 0 ? "(higher)" : "(lower)"}
                </span>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AlertsSectionProps {
  alerts: CostAlert[];
}

function AlertsSection({ alerts }: AlertsSectionProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Cost Alerts ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.severity === "critical"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <Badge
                    variant={alert.severity === "critical" ? "destructive" : "outline"}
                    className="mb-1"
                  >
                    {alert.severity}
                  </Badge>
                  <p className="text-sm font-medium">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: ${alert.currentCost.toFixed(2)} / Threshold: ${alert.threshold.toFixed(2)}
                  </p>
                </div>
                {alert.dealName && (
                  <Badge variant="secondary">{alert.dealName}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CostBreakdownTableProps {
  byModel: CostBreakdown[];
  byType: Record<string, { count: number; totalCost: number; avgCost: number }>;
  loading: boolean;
}

function CostBreakdownTable({ byModel, byType, loading }: CostBreakdownTableProps) {
  if (loading) {
    return <TableSkeleton rows={4} cols={5} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Model</CardTitle>
          <CardDescription>Cost breakdown per LLM model</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.map((model) => (
                <TableRow key={model.model}>
                  <TableCell className="font-medium">{model.model}</TableCell>
                  <TableCell className="text-right">{model.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {(model.inputTokens + model.outputTokens).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">${model.cost.toFixed(4)}</TableCell>
                </TableRow>
              ))}
              {byModel.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Analysis Type</CardTitle>
          <CardDescription>Cost breakdown per analysis type</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byType).map(([type, stats]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">{type}</TableCell>
                  <TableCell className="text-right">{stats.count}</TableCell>
                  <TableCell className="text-right">${stats.totalCost.toFixed(4)}</TableCell>
                  <TableCell className="text-right">${stats.avgCost.toFixed(4)}</TableCell>
                </TableRow>
              ))}
              {Object.keys(byType).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface DailyCostsTableProps {
  costs: { date: string; cost: number; analyses: number }[];
  loading: boolean;
}

function DailyCostsTable({ costs, loading }: DailyCostsTableProps) {
  if (loading) {
    return <TableSkeleton rows={7} cols={3} />;
  }

  // Show most recent first
  const sortedCosts = [...costs].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Daily Costs</CardTitle>
        <CardDescription>Cost per day (most recent first)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Analyses</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCosts.map((day) => (
              <TableRow key={day.date}>
                <TableCell className="font-medium">{day.date}</TableCell>
                <TableCell className="text-right">{day.analyses}</TableCell>
                <TableCell className="text-right">${day.cost.toFixed(4)}</TableCell>
              </TableRow>
            ))}
            {sortedCosts.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface TopDealsTableProps {
  deals: { dealId: string; dealName: string; totalCost: number }[];
  loading: boolean;
}

function TopDealsTable({ deals, loading }: TopDealsTableProps) {
  if (loading) {
    return <TableSkeleton rows={5} cols={3} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Top Deals by Cost</CardTitle>
        <CardDescription>Deals with highest analysis costs</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal, idx) => {
              const totalCost = deals.reduce((sum, d) => sum + d.totalCost, 0);
              const percentage = totalCost > 0 ? (deal.totalCost / totalCost) * 100 : 0;
              return (
                <TableRow key={deal.dealId}>
                  <TableCell className="font-medium">
                    <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                    {deal.dealName}
                  </TableCell>
                  <TableCell className="text-right">${deal.totalCost.toFixed(4)}</TableCell>
                  <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                </TableRow>
              );
            })}
            {deals.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface CostEstimatesTableProps {
  estimates: Record<string, { min: number; max: number; avg: number }>;
  loading: boolean;
}

function CostEstimatesTable({ estimates, loading }: CostEstimatesTableProps) {
  if (loading) {
    return <TableSkeleton rows={8} cols={4} />;
  }

  const formatType = (type: string) => {
    return type
      .replace(/_/g, " ")
      .replace(/react$/, "(ReAct)")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cost Estimates</CardTitle>
        <CardDescription>Expected cost ranges by analysis type</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Analysis Type</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(estimates).map(([type, est]) => (
              <TableRow key={type}>
                <TableCell className="font-medium">{formatType(type)}</TableCell>
                <TableCell className="text-right text-green-600">${est.min.toFixed(2)}</TableCell>
                <TableCell className="text-right">${est.avg.toFixed(2)}</TableCell>
                <TableCell className="text-right text-amber-600">${est.max.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {Object.keys(estimates).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface TableSkeletonProps {
  rows: number;
  cols: number;
}

function TableSkeleton({ rows, cols }: TableSkeletonProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4">
              {Array.from({ length: cols }).map((_, j) => (
                <div
                  key={j}
                  className="h-6 bg-muted animate-pulse rounded flex-1"
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
