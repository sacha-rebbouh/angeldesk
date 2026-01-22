"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Activity,
  Users,
  FileText,
  RefreshCw,
  Download,
  ChevronRight,
  Check,
  XCircle,
  Layers,
  Cpu,
  Calendar,
  BarChart3,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface CostBreakdown {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface GlobalStats {
  totalCost: number;
  totalAnalyses: number;
  avgCostPerAnalysis: number;
  totalApiCalls: number;
  totalUsers: number;
  totalDeals: number;
  costByDay: { date: string; cost: number; analyses: number; apiCalls: number }[];
  costByModel: CostBreakdown[];
  costByType: Record<string, { count: number; totalCost: number; avgCost: number }>;
  costByAgent: Record<string, { count: number; totalCost: number; avgCost: number }>;
  topDeals: { dealId: string; dealName: string; userId: string; userName: string | null; totalCost: number }[];
  topUsers: { userId: string; userName: string | null; userEmail: string; totalCost: number; dealCount: number; analysisCount: number }[];
}

interface CostAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  userId: string | null;
  dealId: string | null;
  dealName: string | null;
  currentCost: number;
  threshold: number;
  acknowledged: boolean;
  createdAt: string;
}

interface UserCostStat {
  userId: string;
  userName: string | null;
  userEmail: string;
  subscriptionStatus: string;
  totalCost: number;
  dealCount: number;
  analysisCount: number;
  apiCallCount: number;
  boardSessionCount: number;
  avgCostPerDeal: number;
  lastActivity: string | null;
}

interface BoardSession {
  sessionId: string;
  dealId: string;
  dealName: string;
  userId: string;
  userName: string | null;
  status: string;
  verdict: string | null;
  totalCost: number;
  totalRounds: number;
  memberCount: number;
  createdAt: string;
}

interface CostData {
  global: GlobalStats;
  alerts: CostAlert[];
  thresholds: {
    dealWarning: number;
    dealCritical: number;
    userDailyWarning: number;
    userDailyCritical: number;
    analysisMax: number;
    boardMax: number;
  };
  boards: {
    totalCost: number;
    totalSessions: number;
    recentSessions: BoardSession[];
  };
}

interface UsersData {
  users: UserCostStat[];
  total: number;
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalCost: number;
    totalDeals: number;
    totalAnalyses: number;
    totalApiCalls: number;
    totalBoardSessions: number;
  };
}

interface UserDetailData {
  userId: string;
  userName: string | null;
  userEmail: string;
  totalCost: number;
  totalAnalyses: number;
  avgCostPerAnalysis: number;
  totalDeals: number;
  totalApiCalls: number;
  boardSessionCount: number;
  costByDay: { date: string; cost: number; analyses: number; apiCalls: number }[];
  costByType: Record<string, { count: number; totalCost: number }>;
  costByModel: CostBreakdown[];
  costByAgent: Record<string, { count: number; totalCost: number }>;
  topDeals: { dealId: string; dealName: string; totalCost: number; apiCalls: number }[];
}

interface DealDetailData {
  summary: {
    dealId: string;
    dealName: string;
    userId: string;
    userName: string | null;
    totalAnalyses: number;
    totalCost: number;
    avgCostPerAnalysis: number;
    analysesByType: Record<string, { count: number; totalCost: number }>;
    apiCalls: number;
    boardSessions: number;
  };
  apiCalls: Array<{
    id: string;
    model: string;
    agent: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number | null;
    createdAt: string;
  }>;
  totalApiCalls: number;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchCostData(days: number, startDate?: string, endDate?: string): Promise<CostData> {
  const params = new URLSearchParams({ days: String(days) });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  const res = await fetch(`/api/admin/costs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch cost data");
  const json = await res.json();
  return json.data;
}

async function fetchUsersData(
  days: number,
  sortBy: string = "totalCost",
  sortOrder: string = "desc"
): Promise<UsersData> {
  const params = new URLSearchParams({
    days: String(days),
    sortBy,
    sortOrder,
  });
  const res = await fetch(`/api/admin/costs/users?${params}`);
  if (!res.ok) throw new Error("Failed to fetch users data");
  const json = await res.json();
  return json.data;
}

async function fetchUserDetail(userId: string, days: number): Promise<UserDetailData> {
  const params = new URLSearchParams({ days: String(days), userId });
  const res = await fetch(`/api/admin/costs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch user detail");
  const json = await res.json();
  return json.data;
}

async function fetchDealDetail(dealId: string): Promise<DealDetailData> {
  const params = new URLSearchParams({ dealId });
  const res = await fetch(`/api/admin/costs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch deal detail");
  const json = await res.json();
  return json.data;
}

async function acknowledgeAlert(alertId: string): Promise<void> {
  const res = await fetch("/api/admin/costs/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId }),
  });
  if (!res.ok) throw new Error("Failed to acknowledge alert");
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CostsDashboardV2() {
  const queryClient = useQueryClient();

  // State
  const [periodType, setPeriodType] = useState<"preset" | "custom">("preset");
  const [days, setDays] = useState(30);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [usersSortBy, setUsersSortBy] = useState("totalCost");
  const [usersSortOrder, setUsersSortOrder] = useState("desc");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Compute effective dates
  const effectiveDays = periodType === "custom" && customStartDate && customEndDate
    ? Math.ceil((new Date(customEndDate).getTime() - new Date(customStartDate).getTime()) / (1000 * 60 * 60 * 24))
    : days;

  // Queries
  const { data: costData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.costs.stats(
      effectiveDays,
      periodType === "custom" ? customStartDate : undefined,
      periodType === "custom" ? customEndDate : undefined
    ),
    queryFn: () => fetchCostData(
      effectiveDays,
      periodType === "custom" ? customStartDate : undefined,
      periodType === "custom" ? customEndDate : undefined
    ),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: queryKeys.costs.users(effectiveDays, { sortBy: usersSortBy, sortOrder: usersSortOrder }),
    queryFn: () => fetchUsersData(effectiveDays, usersSortBy, usersSortOrder),
    staleTime: 60 * 1000,
    enabled: activeTab === "users",
  });

  const { data: userDetail, isLoading: isLoadingUserDetail } = useQuery({
    queryKey: queryKeys.costs.userDetail(selectedUser ?? "", effectiveDays),
    queryFn: () => fetchUserDetail(selectedUser!, effectiveDays),
    enabled: !!selectedUser,
  });

  const { data: dealDetail, isLoading: isLoadingDealDetail } = useQuery({
    queryKey: queryKeys.costs.dealDetail(selectedDeal ?? ""),
    queryFn: () => fetchDealDetail(selectedDeal!),
    enabled: !!selectedDeal,
  });

  // Mutations
  const acknowledgeAlertMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    },
  });

  // Handlers
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDaysChange = useCallback((value: string) => {
    setPeriodType("preset");
    setDays(Number(value));
  }, []);

  const handleExport = useCallback(async (format: "csv" | "json", type: "events" | "summary") => {
    const startDate = periodType === "custom" && customStartDate
      ? customStartDate
      : new Date(Date.now() - effectiveDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = periodType === "custom" && customEndDate
      ? customEndDate
      : new Date().toISOString().split("T")[0];

    const params = new URLSearchParams({
      startDate,
      endDate,
      format: type,
      fileFormat: format,
    });

    window.open(`/api/admin/costs/export?${params}`, "_blank");
  }, [periodType, customStartDate, customEndDate, effectiveDays]);

  // Computed values
  const costTrend = useMemo(() => {
    if (!costData?.global.costByDay?.length) return null;
    const days = costData.global.costByDay;
    if (days.length < 14) return null;

    const recent = days.slice(-7).reduce((sum, d) => sum + d.cost, 0);
    const previous = days.slice(-14, -7).reduce((sum, d) => sum + d.cost, 0);

    if (previous === 0) return null;
    return ((recent - previous) / previous) * 100;
  }, [costData?.global.costByDay]);

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-8 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">Failed to load cost data</p>
          <Button variant="outline" className="mt-4" onClick={handleRefresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Cost Monitoring</h2>
          <p className="text-muted-foreground">
            Track LLM costs, API usage, and spending across users and deals
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <Select value={String(days)} onValueChange={handleDaysChange}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom date range */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                if (e.target.value && customEndDate) setPeriodType("custom");
              }}
              className="w-[130px]"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                if (customStartDate && e.target.value) setPeriodType("custom");
              }}
              className="w-[130px]"
            />
          </div>

          {/* Export dropdown */}
          <Select onValueChange={(v) => {
            const [format, type] = v.split("-") as ["csv" | "json", "events" | "summary"];
            handleExport(format, type);
          }}>
            <SelectTrigger className="w-[120px]">
              <Download className="h-4 w-4 mr-2" />
              Export
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv-summary">CSV Summary</SelectItem>
              <SelectItem value="csv-events">CSV Events</SelectItem>
              <SelectItem value="json-summary">JSON Summary</SelectItem>
              <SelectItem value="json-events">JSON Events</SelectItem>
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
      {costData?.alerts && costData.alerts.length > 0 && (
        <AlertsSection
          alerts={costData.alerts}
          onAcknowledge={(id) => acknowledgeAlertMutation.mutate(id)}
          isAcknowledging={acknowledgeAlertMutation.isPending}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <SummaryCard
          title="Total Cost"
          value={`$${(costData?.global.totalCost ?? 0).toFixed(2)}`}
          description={`${effectiveDays}d`}
          icon={<DollarSign className="h-4 w-4" />}
          loading={isLoading}
          highlight
        />
        <SummaryCard
          title="API Calls"
          value={String(costData?.global.totalApiCalls ?? 0)}
          description="Total calls"
          icon={<Cpu className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Analyses"
          value={String(costData?.global.totalAnalyses ?? 0)}
          description="Completed"
          icon={<Activity className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Avg/Analysis"
          value={`$${(costData?.global.avgCostPerAnalysis ?? 0).toFixed(4)}`}
          description="Per analysis"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Board Sessions"
          value={String(costData?.boards?.totalSessions ?? 0)}
          description={`$${(costData?.boards?.totalCost ?? 0).toFixed(2)}`}
          icon={<Layers className="h-4 w-4" />}
          loading={isLoading}
        />
        <SummaryCard
          title="Cost Trend"
          value={costTrend !== null ? `${costTrend > 0 ? "+" : ""}${costTrend.toFixed(1)}%` : "N/A"}
          description="vs prev 7d"
          icon={<BarChart3 className="h-4 w-4" />}
          loading={isLoading}
          trend={costTrend}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="deals">
            <FileText className="h-4 w-4 mr-2" />
            Costly Deals
          </TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="boards">Boards</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            data={costData}
            loading={isLoading}
            onUserClick={setSelectedUser}
            onDealClick={setSelectedDeal}
          />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab
            data={usersData}
            loading={isLoadingUsers}
            sortBy={usersSortBy}
            sortOrder={usersSortOrder}
            onSortChange={(by, order) => {
              setUsersSortBy(by);
              setUsersSortOrder(order);
            }}
            onUserClick={setSelectedUser}
          />
        </TabsContent>

        <TabsContent value="deals">
          <DealsTab
            data={costData}
            loading={isLoading}
            onDealClick={setSelectedDeal}
          />
        </TabsContent>

        <TabsContent value="models">
          <ModelsTab data={costData} loading={isLoading} />
        </TabsContent>

        <TabsContent value="boards">
          <BoardsTab data={costData} loading={isLoading} />
        </TabsContent>

        <TabsContent value="daily">
          <DailyTab data={costData} loading={isLoading} />
        </TabsContent>
      </Tabs>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              User Cost Details: {userDetail?.userName ?? userDetail?.userEmail ?? "Loading..."}
            </DialogTitle>
            <DialogDescription>
              Detailed cost breakdown for this user
            </DialogDescription>
          </DialogHeader>
          {isLoadingUserDetail ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : userDetail ? (
            <UserDetailContent
              data={userDetail}
              onDealClick={(dealId) => {
                setSelectedUser(null);
                setSelectedDeal(dealId);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Deal Detail Dialog */}
      <Dialog open={!!selectedDeal} onOpenChange={() => setSelectedDeal(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Deal Cost Details: {dealDetail?.summary.dealName ?? "Loading..."}
            </DialogTitle>
            <DialogDescription>
              API calls and cost breakdown for this deal
            </DialogDescription>
          </DialogHeader>
          {isLoadingDealDetail ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : dealDetail ? (
            <DealDetailContent data={dealDetail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  loading?: boolean;
  trend?: number | null;
  highlight?: boolean;
}

function SummaryCard({ title, value, description, icon, loading, trend, highlight }: SummaryCardProps) {
  return (
    <Card className={highlight ? "border-primary/50 bg-primary/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 bg-muted animate-pulse rounded" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {description}
              {trend !== null && trend !== undefined && (
                <span className={trend > 0 ? "text-red-500" : "text-green-500"}>
                  {trend > 0 ? "(+)" : "(-)"}
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
  onAcknowledge: (id: string) => void;
  isAcknowledging: boolean;
}

function AlertsSection({ alerts, onAcknowledge, isAcknowledging }: AlertsSectionProps) {
  const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL" && !a.acknowledged);
  const warningAlerts = alerts.filter((a) => a.severity === "WARNING" && !a.acknowledged);

  return (
    <Card className={criticalAlerts.length > 0 ? "border-red-300 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${criticalAlerts.length > 0 ? "text-red-500" : "text-amber-500"}`} />
          Cost Alerts ({criticalAlerts.length + warningAlerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {[...criticalAlerts, ...warningAlerts].slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border flex items-start justify-between ${
                alert.severity === "CRITICAL"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "outline"}>
                    {alert.severity}
                  </Badge>
                  <Badge variant="secondary">{alert.type.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm font-medium">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ${alert.currentCost.toFixed(2)} / ${alert.threshold.toFixed(2)} threshold
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAcknowledge(alert.id)}
                disabled={isAcknowledging}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({
  data,
  loading,
  onUserClick,
  onDealClick,
}: {
  data: CostData | undefined;
  loading: boolean;
  onUserClick: (userId: string) => void;
  onDealClick: (dealId: string) => void;
}) {
  if (loading) return <TableSkeleton rows={5} cols={4} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Highest Spending Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.global.topUsers?.slice(0, 5).map((user, idx) => (
                <TableRow
                  key={user.userId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onUserClick(user.userId)}
                >
                  <TableCell>
                    <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                    {user.userName ?? user.userEmail}
                  </TableCell>
                  <TableCell className="text-right">{user.dealCount}</TableCell>
                  <TableCell className="text-right font-medium">${user.totalCost.toFixed(2)}</TableCell>
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Deals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Most Expensive Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.global.topDeals?.slice(0, 5).map((deal, idx) => (
                <TableRow
                  key={deal.dealId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onDealClick(deal.dealId)}
                >
                  <TableCell>
                    <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                    {deal.dealName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{deal.userName ?? "-"}</TableCell>
                  <TableCell className="text-right font-medium">${deal.totalCost.toFixed(4)}</TableCell>
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost by Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost by Analysis Type</CardTitle>
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
              {Object.entries(data?.global.costByType ?? {}).map(([type, stats]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">{type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right">{stats.count}</TableCell>
                  <TableCell className="text-right">${stats.totalCost.toFixed(4)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">${stats.avgCost.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost by Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost by Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data?.global.costByAgent ?? {})
                .sort((a, b) => b[1].totalCost - a[1].totalCost)
                .slice(0, 10)
                .map(([agent, stats]) => (
                  <TableRow key={agent}>
                    <TableCell className="font-medium">{agent}</TableCell>
                    <TableCell className="text-right">{stats.count}</TableCell>
                    <TableCell className="text-right">${stats.totalCost.toFixed(4)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${stats.avgCost.toFixed(6)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab({
  data,
  loading,
  sortBy,
  sortOrder,
  onSortChange,
  onUserClick,
}: {
  data: UsersData | undefined;
  loading: boolean;
  sortBy: string;
  sortOrder: string;
  onSortChange: (by: string, order: string) => void;
  onUserClick: (userId: string) => void;
}) {
  if (loading) return <TableSkeleton rows={10} cols={7} />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Users Cost Leaderboard</CardTitle>
            <CardDescription>
              {data?.summary.activeUsers ?? 0} active users / {data?.summary.totalUsers ?? 0} total
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => onSortChange(v, sortOrder)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="totalCost">By Cost</SelectItem>
                <SelectItem value="dealCount">By Deals</SelectItem>
                <SelectItem value="analysisCount">By Analyses</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSortChange(sortBy, sortOrder === "desc" ? "asc" : "desc")}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Deals</TableHead>
              <TableHead className="text-right">Analyses</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Boards</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Avg/Deal</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.users.map((user, idx) => (
              <TableRow
                key={user.userId}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onUserClick(user.userId)}
              >
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{user.userName ?? "No name"}</div>
                    <div className="text-xs text-muted-foreground">{user.userEmail}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.subscriptionStatus === "PRO" ? "default" : "secondary"}>
                    {user.subscriptionStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{user.dealCount}</TableCell>
                <TableCell className="text-right">{user.analysisCount}</TableCell>
                <TableCell className="text-right">{user.apiCallCount}</TableCell>
                <TableCell className="text-right">{user.boardSessionCount}</TableCell>
                <TableCell className="text-right font-medium">${user.totalCost.toFixed(2)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  ${user.avgCostPerDeal.toFixed(2)}
                </TableCell>
                <TableCell className="w-8">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DealsTab({
  data,
  loading,
  onDealClick,
}: {
  data: CostData | undefined;
  loading: boolean;
  onDealClick: (dealId: string) => void;
}) {
  if (loading) return <TableSkeleton rows={10} cols={5} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Expensive Deals</CardTitle>
        <CardDescription>Deals with highest analysis costs</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Deal</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.global.topDeals?.map((deal, idx) => {
              const totalCost = data.global.totalCost || 1;
              const percentage = (deal.totalCost / totalCost) * 100;
              return (
                <TableRow
                  key={deal.dealId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onDealClick(deal.dealId)}
                >
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{deal.dealName}</TableCell>
                  <TableCell className="text-muted-foreground">{deal.userName ?? "-"}</TableCell>
                  <TableCell className="text-right font-medium">${deal.totalCost.toFixed(4)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ModelsTab({
  data,
  loading,
}: {
  data: CostData | undefined;
  loading: boolean;
}) {
  if (loading) return <TableSkeleton rows={8} cols={5} />;

  const totalCost = data?.global.costByModel?.reduce((sum, m) => sum + m.cost, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Model</CardTitle>
        <CardDescription>LLM model usage and costs</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Input Tokens</TableHead>
              <TableHead className="text-right">Output Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.global.costByModel
              ?.sort((a, b) => b.cost - a.cost)
              .map((model) => {
                const percentage = totalCost > 0 ? (model.cost / totalCost) * 100 : 0;
                return (
                  <TableRow key={model.model}>
                    <TableCell className="font-medium">{model.model}</TableCell>
                    <TableCell className="text-right">{model.calls.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{model.inputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{model.outputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">${model.cost.toFixed(4)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={percentage > 30 ? "destructive" : "secondary"}>
                        {percentage.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BoardsTab({
  data,
  loading,
}: {
  data: CostData | undefined;
  loading: boolean;
}) {
  if (loading) return <TableSkeleton rows={5} cols={6} />;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.boards?.totalSessions ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Board Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(data?.boards?.totalCost ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avg Cost/Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data?.boards?.totalSessions ? ((data.boards.totalCost ?? 0) / data.boards.totalSessions).toFixed(2) : "0.00"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">% of Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.global.totalCost ? (((data.boards?.totalCost ?? 0) / data.global.totalCost) * 100).toFixed(1) : "0"}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Board Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead className="text-right">Rounds</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.boards?.recentSessions?.map((session) => (
                <TableRow key={session.sessionId}>
                  <TableCell className="font-medium">{session.dealName}</TableCell>
                  <TableCell className="text-muted-foreground">{session.userName ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={session.status === "COMPLETED" ? "default" : "secondary"}>
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {session.verdict ? (
                      <Badge
                        variant={
                          session.verdict === "GO"
                            ? "default"
                            : session.verdict === "NO_GO"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {session.verdict.replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">{session.totalRounds}</TableCell>
                  <TableCell className="text-right font-medium">${session.totalCost.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.boards?.recentSessions || data.boards.recentSessions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No board sessions yet
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

function DailyTab({
  data,
  loading,
}: {
  data: CostData | undefined;
  loading: boolean;
}) {
  if (loading) return <TableSkeleton rows={14} cols={4} />;

  const sortedDays = [...(data?.global.costByDay ?? [])].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Costs</CardTitle>
        <CardDescription>Cost per day (most recent first)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Analyses</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDays.map((day) => (
              <TableRow key={day.date}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {day.date}
                  </div>
                </TableCell>
                <TableCell className="text-right">{day.apiCalls}</TableCell>
                <TableCell className="text-right">{day.analyses}</TableCell>
                <TableCell className="text-right font-medium">${day.cost.toFixed(4)}</TableCell>
              </TableRow>
            ))}
            {sortedDays.length === 0 && (
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

function UserDetailContent({
  data,
  onDealClick,
}: {
  data: UserDetailData;
  onDealClick: (dealId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Total Cost</div>
          <div className="text-xl font-bold">${data.totalCost.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Deals</div>
          <div className="text-xl font-bold">{data.totalDeals}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Analyses</div>
          <div className="text-xl font-bold">{data.totalAnalyses}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">API Calls</div>
          <div className="text-xl font-bold">{data.totalApiCalls}</div>
        </div>
      </div>

      {/* Top Deals */}
      <div>
        <h4 className="font-medium mb-2">Most Expensive Deals</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topDeals.map((deal) => (
              <TableRow
                key={deal.dealId}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onDealClick(deal.dealId)}
              >
                <TableCell className="font-medium">{deal.dealName}</TableCell>
                <TableCell className="text-right">{deal.apiCalls}</TableCell>
                <TableCell className="text-right">${deal.totalCost.toFixed(4)}</TableCell>
                <TableCell className="w-8">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cost by Model */}
      <div>
        <h4 className="font-medium mb-2">Cost by Model</h4>
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
            {data.costByModel.map((model) => (
              <TableRow key={model.model}>
                <TableCell>{model.model}</TableCell>
                <TableCell className="text-right">{model.calls}</TableCell>
                <TableCell className="text-right">
                  {(model.inputTokens + model.outputTokens).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">${model.cost.toFixed(4)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DealDetailContent({ data }: { data: DealDetailData }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Total Cost</div>
          <div className="text-xl font-bold">${data.summary.totalCost.toFixed(4)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">API Calls</div>
          <div className="text-xl font-bold">{data.summary.apiCalls}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Analyses</div>
          <div className="text-xl font-bold">{data.summary.totalAnalyses}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Avg/Analysis</div>
          <div className="text-xl font-bold">${data.summary.avgCostPerAnalysis.toFixed(4)}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Board Sessions</div>
          <div className="text-xl font-bold">{data.summary.boardSessions}</div>
        </div>
      </div>

      {/* Analysis Types */}
      <div>
        <h4 className="font-medium mb-2">By Analysis Type</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.summary.analysesByType).map(([type, stats]) => (
            <Badge key={type} variant="outline" className="text-sm">
              {type.replace(/_/g, " ")}: {stats.count} (${stats.totalCost.toFixed(4)})
            </Badge>
          ))}
        </div>
      </div>

      {/* API Calls Table */}
      <div>
        <h4 className="font-medium mb-2">API Calls ({data.totalApiCalls} total)</h4>
        <div className="max-h-80 overflow-y-auto border rounded-lg">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead className="text-right">In/Out</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.apiCalls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(call.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{call.model}</TableCell>
                  <TableCell className="text-xs">{call.agent}</TableCell>
                  <TableCell className="text-xs">{call.operation}</TableCell>
                  <TableCell className="text-right text-xs">
                    {call.inputTokens}/{call.outputTokens}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    ${call.cost.toFixed(6)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
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
