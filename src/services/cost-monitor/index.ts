/**
 * Cost Monitoring Service
 * Tracks LLM costs per analysis, deal, and globally
 * Now with persistent CostEvent and CostAlert storage
 */

import { prisma } from "@/lib/prisma";
import type { CostAlertType, CostAlertSeverity } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface CostBreakdown {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface AnalysisCostReport {
  analysisId: string;
  dealId: string;
  userId?: string;
  type: string;
  useReAct: boolean;
  totalCost: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: CostBreakdown[];
  byAgent: Record<string, CostBreakdown>;
  duration: number;
  timestamp: Date;
}

export interface DealCostSummary {
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
}

export interface GlobalCostStats {
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

export interface UserCostStats {
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

export interface CostEventRecord {
  id: string;
  userId: string;
  dealId: string;
  analysisId: string | null;
  boardSessionId: string | null;
  model: string;
  agent: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number | null;
  createdAt: Date;
}

export interface CostAlertRecord {
  id: string;
  type: string;
  severity: string;
  message: string;
  userId: string | null;
  dealId: string | null;
  dealName: string | null;
  analysisId: string | null;
  currentCost: number;
  threshold: number;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  notificationSent: boolean;
  createdAt: Date;
}

// Threshold configuration
export interface CostThresholds {
  dealWarning: number;
  dealCritical: number;
  userDailyWarning: number;
  userDailyCritical: number;
  analysisMax: number;
  boardMax: number;
  monthlyBudget: number | null;
}

// In-memory accumulator for current analysis
interface AnalysisAccumulator {
  analysisId: string;
  dealId: string;
  userId: string;
  type: string;
  useReAct: boolean;
  startTime: number;
  boardSessionId?: string;
  calls: {
    model: string;
    agent: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs?: number;
    timestamp: Date;
  }[];
}

// ============================================================================
// COST MONITOR CLASS
// ============================================================================

// Default thresholds (in USD)
const DEFAULT_THRESHOLDS: CostThresholds = {
  dealWarning: 5.0,
  dealCritical: 15.0,
  userDailyWarning: 10.0,
  userDailyCritical: 25.0,
  analysisMax: 5.0,
  boardMax: 2.0,
  monthlyBudget: null,
};

class CostMonitor {
  private currentAnalysis: AnalysisAccumulator | null = null;
  private static instance: CostMonitor;
  private thresholds: CostThresholds = DEFAULT_THRESHOLDS;

  private constructor() {}

  static getInstance(): CostMonitor {
    if (!CostMonitor.instance) {
      CostMonitor.instance = new CostMonitor();
    }
    return CostMonitor.instance;
  }

  /**
   * Start tracking a new analysis
   */
  startAnalysis(params: {
    analysisId: string;
    dealId: string;
    userId: string;
    type: string;
    useReAct: boolean;
    boardSessionId?: string;
  }): void {
    this.currentAnalysis = {
      ...params,
      startTime: Date.now(),
      calls: [],
    };
  }

  /**
   * Record an LLM call - now persists to CostEvent table
   */
  recordCall(params: {
    model: string;
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    operation?: string;
    durationMs?: number;
  }): void {
    if (!this.currentAnalysis) {
      console.warn("[CostMonitor] No active analysis to record call");
      return;
    }

    const operation = params.operation ?? this.currentAnalysis.type;

    this.currentAnalysis.calls.push({
      model: params.model,
      agent: params.agent,
      operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cost: params.cost,
      durationMs: params.durationMs,
      timestamp: new Date(),
    });

    // Persist to CostEvent table asynchronously (fire and forget)
    this.persistCostEvent({
      userId: this.currentAnalysis.userId,
      dealId: this.currentAnalysis.dealId,
      analysisId: this.currentAnalysis.analysisId,
      boardSessionId: this.currentAnalysis.boardSessionId,
      model: params.model,
      agent: params.agent,
      operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cost: params.cost,
      durationMs: params.durationMs,
    }).catch((err) => {
      console.error("[CostMonitor] Failed to persist cost event:", err);
    });
  }

  /**
   * Persist a single cost event to database
   */
  private async persistCostEvent(params: {
    userId: string;
    dealId: string;
    analysisId?: string;
    boardSessionId?: string;
    model: string;
    agent: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs?: number;
  }): Promise<void> {
    await prisma.costEvent.create({
      data: {
        userId: params.userId,
        dealId: params.dealId,
        analysisId: params.analysisId ?? null,
        boardSessionId: params.boardSessionId ?? null,
        model: params.model,
        agent: params.agent,
        operation: params.operation,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        cost: params.cost,
        durationMs: params.durationMs ?? null,
      },
    });
  }

  /**
   * End tracking and persist the cost report
   */
  async endAnalysis(): Promise<AnalysisCostReport | null> {
    if (!this.currentAnalysis) {
      return null;
    }

    const { analysisId, dealId, type, useReAct, startTime, calls } = this.currentAnalysis;
    const duration = Date.now() - startTime;

    // Aggregate by model
    const byModel = new Map<string, CostBreakdown>();
    const byAgent = new Map<string, CostBreakdown>();

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const call of calls) {
      totalCost += call.cost;
      totalInputTokens += call.inputTokens;
      totalOutputTokens += call.outputTokens;

      // By model
      const modelStats = byModel.get(call.model) ?? {
        model: call.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
      modelStats.calls++;
      modelStats.inputTokens += call.inputTokens;
      modelStats.outputTokens += call.outputTokens;
      modelStats.cost += call.cost;
      byModel.set(call.model, modelStats);

      // By agent
      const agentStats = byAgent.get(call.agent) ?? {
        model: call.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
      agentStats.calls++;
      agentStats.inputTokens += call.inputTokens;
      agentStats.outputTokens += call.outputTokens;
      agentStats.cost += call.cost;
      byAgent.set(call.agent, agentStats);
    }

    const report: AnalysisCostReport = {
      analysisId,
      dealId,
      type,
      useReAct,
      totalCost,
      totalCalls: calls.length,
      totalInputTokens,
      totalOutputTokens,
      byModel: Array.from(byModel.values()),
      byAgent: Object.fromEntries(byAgent),
      duration,
      timestamp: new Date(),
    };

    // Persist to database
    await this.persistReport(report);

    // Check thresholds and create alerts if needed
    await this.checkThresholds(report);

    // Reset
    this.currentAnalysis = null;

    return report;
  }

  /**
   * Persist cost report to database
   */
  private async persistReport(report: AnalysisCostReport): Promise<void> {
    try {
      // Get existing results
      const existing = await prisma.analysis.findUnique({
        where: { id: report.analysisId },
        select: { results: true },
      });

      const existingResults = (existing?.results as Record<string, unknown>) ?? {};

      const costReportData = {
        totalCalls: report.totalCalls,
        totalInputTokens: report.totalInputTokens,
        totalOutputTokens: report.totalOutputTokens,
        byModel: report.byModel.map(b => ({ ...b })),
        byAgent: Object.fromEntries(
          Object.entries(report.byAgent).map(([k, v]) => [k, { ...v }])
        ),
      };

      // Build merged results object
      const mergedResults = {
        ...existingResults,
        _costReport: costReportData,
      };

      await prisma.analysis.update({
        where: { id: report.analysisId },
        data: {
          totalCost: report.totalCost,
          totalTimeMs: report.duration,
          // Store detailed cost breakdown in results JSON
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          results: mergedResults as any,
        },
      });
    } catch (error) {
      console.error("[CostMonitor] Failed to persist report:", error);
    }
  }

  /**
   * Get cost summary for a deal - now using CostEvent for granular data
   */
  async getDealCostSummary(dealId: string): Promise<DealCostSummary | null> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        name: true,
        userId: true,
        user: { select: { name: true } },
      },
    });

    if (!deal) return null;

    // Get analyses for this deal
    const analyses = await prisma.analysis.findMany({
      where: { dealId },
      select: {
        id: true,
        mode: true,
        totalCost: true,
        status: true,
      },
    });

    // Get cost events for granular API call data
    const costEvents = await prisma.costEvent.findMany({
      where: { dealId },
      select: { cost: true },
    });

    // Get board sessions count
    const boardSessions = await prisma.aIBoardSession.count({
      where: { dealId },
    });

    const analysesByType: Record<string, { count: number; totalCost: number }> = {};
    let totalCost = 0;

    for (const analysis of analyses) {
      const type = analysis.mode ?? "unknown";
      totalCost += Number(analysis.totalCost ?? 0);

      if (!analysesByType[type]) {
        analysesByType[type] = { count: 0, totalCost: 0 };
      }
      analysesByType[type].count++;
      analysesByType[type].totalCost += Number(analysis.totalCost ?? 0);
    }

    // If no analysis cost, sum from cost events
    if (totalCost === 0 && costEvents.length > 0) {
      totalCost = costEvents.reduce((sum, e) => sum + Number(e.cost), 0);
    }

    return {
      dealId,
      dealName: deal.name,
      userId: deal.userId,
      userName: deal.user?.name ?? null,
      totalAnalyses: analyses.length,
      totalCost,
      avgCostPerAnalysis: analyses.length > 0 ? totalCost / analyses.length : 0,
      analysesByType,
      apiCalls: costEvents.length,
      boardSessions,
    };
  }

  /**
   * Get detailed API calls for a specific deal
   */
  async getDealApiCalls(dealId: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ events: CostEventRecord[]; total: number }> {
    const [events, total] = await Promise.all([
      prisma.costEvent.findMany({
        where: { dealId },
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      prisma.costEvent.count({ where: { dealId } }),
    ]);

    return {
      events: events.map((e) => ({
        id: e.id,
        userId: e.userId,
        dealId: e.dealId,
        analysisId: e.analysisId,
        boardSessionId: e.boardSessionId,
        model: e.model,
        agent: e.agent,
        operation: e.operation,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cost: Number(e.cost),
        durationMs: e.durationMs,
        createdAt: e.createdAt,
      })),
      total,
    };
  }

  /**
   * Get global cost statistics - enhanced with CostEvent data
   */
  async getGlobalStats(days: number = 30, options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<GlobalCostStats> {
    const endDate = options?.endDate ?? new Date();
    const startDate = options?.startDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    })();

    // Fetch data in parallel for performance
    const [analyses, costEvents, distinctUsers, distinctDeals] = await Promise.all([
      prisma.analysis.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: "COMPLETED",
        },
        select: {
          id: true,
          dealId: true,
          mode: true,
          totalCost: true,
          results: true,
          createdAt: true,
          deal: {
            select: { name: true, userId: true, user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.costEvent.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: {
          id: true,
          userId: true,
          dealId: true,
          model: true,
          agent: true,
          cost: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
        },
      }),
      prisma.costEvent.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: true,
      }),
      prisma.costEvent.groupBy({
        by: ["dealId"],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: true,
      }),
    ]);

    // Aggregate by day, model, type, deal, user
    const costByDay = new Map<string, { cost: number; analyses: number; apiCalls: number }>();
    const costByModel = new Map<string, CostBreakdown>();
    const costByAgent: Record<string, { count: number; totalCost: number; avgCost: number }> = {};
    const costByType: Record<string, { count: number; totalCost: number; avgCost: number }> = {};
    const costByDeal = new Map<string, { dealName: string; userId: string; userName: string | null; totalCost: number }>();
    const costByUser = new Map<string, { userName: string | null; userEmail: string; totalCost: number; dealCount: Set<string>; analysisCount: number }>();

    let totalCost = 0;

    // Process cost events for granular data
    for (const event of costEvents) {
      const cost = Number(event.cost);
      totalCost += cost;

      // By day
      const dateStr = event.createdAt.toISOString().split("T")[0];
      const dayStats = costByDay.get(dateStr) ?? { cost: 0, analyses: 0, apiCalls: 0 };
      dayStats.cost += cost;
      dayStats.apiCalls++;
      costByDay.set(dateStr, dayStats);

      // By model
      const modelStats = costByModel.get(event.model) ?? {
        model: event.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
      modelStats.calls++;
      modelStats.inputTokens += event.inputTokens;
      modelStats.outputTokens += event.outputTokens;
      modelStats.cost += cost;
      costByModel.set(event.model, modelStats);

      // By agent
      if (!costByAgent[event.agent]) {
        costByAgent[event.agent] = { count: 0, totalCost: 0, avgCost: 0 };
      }
      costByAgent[event.agent].count++;
      costByAgent[event.agent].totalCost += cost;
    }

    // Process analyses
    for (const analysis of analyses) {
      const dateStr = analysis.createdAt.toISOString().split("T")[0];
      const dayStats = costByDay.get(dateStr) ?? { cost: 0, analyses: 0, apiCalls: 0 };
      dayStats.analyses++;
      costByDay.set(dateStr, dayStats);

      // By type
      const type = analysis.mode ?? "unknown";
      if (!costByType[type]) {
        costByType[type] = { count: 0, totalCost: 0, avgCost: 0 };
      }
      costByType[type].count++;
      costByType[type].totalCost += Number(analysis.totalCost ?? 0);

      // By deal
      const dealStats = costByDeal.get(analysis.dealId) ?? {
        dealName: analysis.deal?.name ?? "Unknown",
        userId: analysis.deal?.userId ?? "",
        userName: analysis.deal?.user?.name ?? null,
        totalCost: 0,
      };
      dealStats.totalCost += Number(analysis.totalCost ?? 0);
      costByDeal.set(analysis.dealId, dealStats);

      // By user
      const userId = analysis.deal?.userId ?? "";
      const userStats = costByUser.get(userId) ?? {
        userName: analysis.deal?.user?.name ?? null,
        userEmail: analysis.deal?.user?.email ?? "",
        totalCost: 0,
        dealCount: new Set<string>(),
        analysisCount: 0,
      };
      userStats.totalCost += Number(analysis.totalCost ?? 0);
      userStats.dealCount.add(analysis.dealId);
      userStats.analysisCount++;
      costByUser.set(userId, userStats);
    }

    // Calculate averages
    for (const type of Object.keys(costByType)) {
      costByType[type].avgCost = costByType[type].count > 0 ? costByType[type].totalCost / costByType[type].count : 0;
    }
    for (const agent of Object.keys(costByAgent)) {
      costByAgent[agent].avgCost = costByAgent[agent].count > 0 ? costByAgent[agent].totalCost / costByAgent[agent].count : 0;
    }

    // Sort top deals
    const topDeals = Array.from(costByDeal.entries())
      .map(([dealId, stats]) => ({ dealId, ...stats }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    // Sort top users
    const topUsers = Array.from(costByUser.entries())
      .map(([userId, stats]) => ({
        userId,
        userName: stats.userName,
        userEmail: stats.userEmail,
        totalCost: stats.totalCost,
        dealCount: stats.dealCount.size,
        analysisCount: stats.analysisCount,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    return {
      totalCost,
      totalAnalyses: analyses.length,
      avgCostPerAnalysis: analyses.length > 0 ? totalCost / analyses.length : 0,
      totalApiCalls: costEvents.length,
      totalUsers: distinctUsers.length,
      totalDeals: distinctDeals.length,
      costByDay: Array.from(costByDay.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      costByModel: Array.from(costByModel.values()),
      costByType,
      costByAgent,
      topDeals,
      topUsers,
    };
  }

  /**
   * Estimate cost for an analysis type
   */
  estimateCost(type: string, useReAct: boolean): { min: number; max: number; avg: number } {
    // Based on empirical data
    const estimates: Record<string, { min: number; max: number; avg: number }> = {
      screening: { min: 0.02, max: 0.05, avg: 0.03 },
      extraction: { min: 0.02, max: 0.05, avg: 0.03 },
      full_dd: { min: 0.08, max: 0.15, avg: 0.10 },
      tier1_complete: { min: 0.25, max: 0.45, avg: 0.34 },
      tier1_complete_react: { min: 1.00, max: 1.80, avg: 1.35 },
      tier2_synthesis: { min: 0.10, max: 0.18, avg: 0.13 },
      tier3_sector: { min: 0.02, max: 0.05, avg: 0.03 },
      full_analysis: { min: 0.40, max: 0.65, avg: 0.50 },
      full_analysis_react: { min: 1.50, max: 2.50, avg: 1.90 },
    };

    const key = useReAct && (type === "tier1_complete" || type === "full_analysis")
      ? `${type}_react`
      : type;

    return estimates[key] ?? { min: 0.10, max: 0.50, avg: 0.25 };
  }

  /**
   * Get all cost estimates for UI display
   */
  getAllCostEstimates(): Record<string, { min: number; max: number; avg: number }> {
    return {
      screening: { min: 0.02, max: 0.05, avg: 0.03 },
      extraction: { min: 0.02, max: 0.05, avg: 0.03 },
      full_dd: { min: 0.08, max: 0.15, avg: 0.10 },
      tier1_complete: { min: 0.25, max: 0.45, avg: 0.34 },
      tier1_complete_react: { min: 1.00, max: 1.80, avg: 1.35 },
      tier2_synthesis: { min: 0.10, max: 0.18, avg: 0.13 },
      tier3_sector: { min: 0.02, max: 0.05, avg: 0.03 },
      full_analysis: { min: 0.40, max: 0.65, avg: 0.50 },
      full_analysis_react: { min: 1.50, max: 2.50, avg: 1.90 },
    };
  }

  /**
   * Get cost statistics for a specific user - enhanced with CostEvent data
   */
  async getUserStats(userId: string, days: number = 30, options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<UserCostStats | null> {
    const endDate = options?.endDate ?? new Date();
    const startDate = options?.startDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    })();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) return null;

    // Fetch analyses and cost events in parallel
    const [analyses, costEvents, boardSessions] = await Promise.all([
      prisma.analysis.findMany({
        where: {
          deal: { userId },
          createdAt: { gte: startDate, lte: endDate },
          status: "COMPLETED",
        },
        select: {
          id: true,
          dealId: true,
          mode: true,
          totalCost: true,
          createdAt: true,
          deal: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.costEvent.findMany({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          dealId: true,
          model: true,
          agent: true,
          cost: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
        },
      }),
      prisma.aIBoardSession.count({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    // Count distinct deals
    const dealIds = new Set(analyses.map((a) => a.dealId));

    // Aggregate by day
    const costByDay = new Map<string, { cost: number; analyses: number; apiCalls: number }>();
    const costByType: Record<string, { count: number; totalCost: number }> = {};
    const costByModel = new Map<string, CostBreakdown>();
    const costByAgent: Record<string, { count: number; totalCost: number }> = {};
    const costByDeal = new Map<string, { dealName: string; totalCost: number; apiCalls: number }>();

    let totalCost = 0;

    // Process cost events
    for (const event of costEvents) {
      const cost = Number(event.cost);
      totalCost += cost;

      // By day
      const dateStr = event.createdAt.toISOString().split("T")[0];
      const dayStats = costByDay.get(dateStr) ?? { cost: 0, analyses: 0, apiCalls: 0 };
      dayStats.cost += cost;
      dayStats.apiCalls++;
      costByDay.set(dateStr, dayStats);

      // By model
      const modelStats = costByModel.get(event.model) ?? {
        model: event.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
      modelStats.calls++;
      modelStats.inputTokens += event.inputTokens;
      modelStats.outputTokens += event.outputTokens;
      modelStats.cost += cost;
      costByModel.set(event.model, modelStats);

      // By agent
      if (!costByAgent[event.agent]) {
        costByAgent[event.agent] = { count: 0, totalCost: 0 };
      }
      costByAgent[event.agent].count++;
      costByAgent[event.agent].totalCost += cost;

      // By deal
      const dealStats = costByDeal.get(event.dealId) ?? {
        dealName: "Unknown",
        totalCost: 0,
        apiCalls: 0,
      };
      dealStats.totalCost += cost;
      dealStats.apiCalls++;
      costByDeal.set(event.dealId, dealStats);
    }

    // Process analyses (for type breakdown and deal names)
    for (const analysis of analyses) {
      const dateStr = analysis.createdAt.toISOString().split("T")[0];
      const dayStats = costByDay.get(dateStr) ?? { cost: 0, analyses: 0, apiCalls: 0 };
      dayStats.analyses++;
      costByDay.set(dateStr, dayStats);

      // By type
      const type = analysis.mode ?? "unknown";
      if (!costByType[type]) {
        costByType[type] = { count: 0, totalCost: 0 };
      }
      costByType[type].count++;
      costByType[type].totalCost += Number(analysis.totalCost ?? 0);

      // Update deal name
      if (costByDeal.has(analysis.dealId)) {
        const stats = costByDeal.get(analysis.dealId)!;
        stats.dealName = analysis.deal?.name ?? "Unknown";
      }
    }

    // Sort top deals
    const topDeals = Array.from(costByDeal.entries())
      .map(([dealId, stats]) => ({ dealId, ...stats }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      totalCost,
      totalAnalyses: analyses.length,
      avgCostPerAnalysis: analyses.length > 0 ? totalCost / analyses.length : 0,
      totalDeals: dealIds.size,
      totalApiCalls: costEvents.length,
      boardSessionCount: boardSessions,
      costByDay: Array.from(costByDay.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      costByType,
      costByModel: Array.from(costByModel.values()),
      costByAgent,
      topDeals,
    };
  }

  /**
   * Get all users cost stats for leaderboard
   */
  async getAllUsersStats(days: number = 30, options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    sortBy?: "totalCost" | "dealCount" | "analysisCount";
    sortOrder?: "asc" | "desc";
  }): Promise<{
    users: Array<{
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
      lastActivity: Date | null;
    }>;
    total: number;
  }> {
    const endDate = options?.endDate ?? new Date();
    const startDate = options?.startDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    })();

    // Get all users with their deals
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        subscriptionStatus: true,
        deals: {
          select: {
            id: true,
            analyses: {
              where: {
                createdAt: { gte: startDate, lte: endDate },
                status: "COMPLETED",
              },
              select: {
                totalCost: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    // Get cost events grouped by user
    const costEventsByUser = await prisma.costEvent.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
      _sum: { cost: true },
    });

    // Get board sessions grouped by user
    const boardSessionsByUser = await prisma.aIBoardSession.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
    });

    const costEventMap = new Map(costEventsByUser.map((e) => [e.userId, e]));
    const boardSessionMap = new Map(boardSessionsByUser.map((e) => [e.userId, e._count]));

    const userStats = users.map((user) => {
      const dealsWithActivity = user.deals.filter((d) => d.analyses.length > 0);
      const totalAnalyses = user.deals.reduce((sum, d) => sum + d.analyses.length, 0);
      const totalCostFromAnalyses = user.deals.reduce(
        (sum, d) => sum + d.analyses.reduce((s, a) => s + Number(a.totalCost ?? 0), 0),
        0
      );

      const costEventData = costEventMap.get(user.id);
      const boardCount = boardSessionMap.get(user.id) ?? 0;

      const totalCost = costEventData?._sum?.cost
        ? Number(costEventData._sum.cost)
        : totalCostFromAnalyses;

      const lastAnalysis = user.deals
        .flatMap((d) => d.analyses)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        subscriptionStatus: user.subscriptionStatus,
        totalCost,
        dealCount: dealsWithActivity.length,
        analysisCount: totalAnalyses,
        apiCallCount: costEventData?._count ?? 0,
        boardSessionCount: boardCount,
        avgCostPerDeal: dealsWithActivity.length > 0 ? totalCost / dealsWithActivity.length : 0,
        lastActivity: lastAnalysis?.createdAt ?? null,
      };
    });

    // Sort
    const sortBy = options?.sortBy ?? "totalCost";
    const sortOrder = options?.sortOrder ?? "desc";
    const sortedUsers = userStats.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortOrder === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });

    const limitedUsers = options?.limit ? sortedUsers.slice(0, options.limit) : sortedUsers;

    return {
      users: limitedUsers,
      total: users.length,
    };
  }

  /**
   * Check thresholds and create alerts if needed - now persists to DB
   */
  async checkThresholds(report: AnalysisCostReport): Promise<void> {
    // Check single analysis cost
    if (report.totalCost > this.thresholds.analysisMax) {
      await this.createAlert({
        type: "ANALYSIS_ANOMALY",
        severity: "WARNING",
        message: `Analysis cost ($${report.totalCost.toFixed(2)}) exceeded max threshold ($${this.thresholds.analysisMax})`,
        userId: report.userId,
        dealId: report.dealId,
        analysisId: report.analysisId,
        currentCost: report.totalCost,
        threshold: this.thresholds.analysisMax,
      });
    }

    // Check deal total cost
    const dealSummary = await this.getDealCostSummary(report.dealId);
    if (dealSummary) {
      if (dealSummary.totalCost > this.thresholds.dealCritical) {
        await this.createAlert({
          type: "DEAL_THRESHOLD",
          severity: "CRITICAL",
          message: `Deal "${dealSummary.dealName}" total cost ($${dealSummary.totalCost.toFixed(2)}) exceeded critical threshold`,
          userId: dealSummary.userId,
          dealId: report.dealId,
          dealName: dealSummary.dealName,
          currentCost: dealSummary.totalCost,
          threshold: this.thresholds.dealCritical,
        });
      } else if (dealSummary.totalCost > this.thresholds.dealWarning) {
        await this.createAlert({
          type: "DEAL_THRESHOLD",
          severity: "WARNING",
          message: `Deal "${dealSummary.dealName}" total cost ($${dealSummary.totalCost.toFixed(2)}) exceeded warning threshold`,
          userId: dealSummary.userId,
          dealId: report.dealId,
          dealName: dealSummary.dealName,
          currentCost: dealSummary.totalCost,
          threshold: this.thresholds.dealWarning,
        });
      }
    }

    // Check user daily cost
    if (report.userId) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const userDailyCost = await prisma.costEvent.aggregate({
        where: {
          userId: report.userId,
          createdAt: { gte: todayStart },
        },
        _sum: { cost: true },
      });

      const dailyCost = Number(userDailyCost._sum?.cost ?? 0);

      if (dailyCost > this.thresholds.userDailyCritical) {
        await this.createAlert({
          type: "USER_DAILY",
          severity: "CRITICAL",
          message: `User daily cost ($${dailyCost.toFixed(2)}) exceeded critical threshold`,
          userId: report.userId,
          currentCost: dailyCost,
          threshold: this.thresholds.userDailyCritical,
        });
      } else if (dailyCost > this.thresholds.userDailyWarning) {
        await this.createAlert({
          type: "USER_DAILY",
          severity: "WARNING",
          message: `User daily cost ($${dailyCost.toFixed(2)}) exceeded warning threshold`,
          userId: report.userId,
          currentCost: dailyCost,
          threshold: this.thresholds.userDailyWarning,
        });
      }
    }
  }

  /**
   * Create a cost alert - persisted to database
   */
  private async createAlert(params: {
    type: CostAlertType;
    severity: CostAlertSeverity;
    message: string;
    userId?: string;
    dealId?: string;
    dealName?: string;
    analysisId?: string;
    currentCost: number;
    threshold: number;
  }): Promise<void> {
    try {
      // Check if similar unacknowledged alert exists (to avoid duplicates)
      const existingAlert = await prisma.costAlert.findFirst({
        where: {
          type: params.type,
          dealId: params.dealId ?? null,
          userId: params.userId ?? null,
          acknowledged: false,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24h
          },
        },
      });

      if (existingAlert) {
        // Update if severity increased
        if (params.severity === "CRITICAL" && existingAlert.severity !== "CRITICAL") {
          await prisma.costAlert.update({
            where: { id: existingAlert.id },
            data: {
              severity: "CRITICAL",
              message: params.message,
              currentCost: params.currentCost,
            },
          });
        }
        return;
      }

      await prisma.costAlert.create({
        data: {
          type: params.type,
          severity: params.severity,
          message: params.message,
          userId: params.userId ?? null,
          dealId: params.dealId ?? null,
          dealName: params.dealName ?? null,
          analysisId: params.analysisId ?? null,
          currentCost: params.currentCost,
          threshold: params.threshold,
        },
      });

      console.log(`[CostMonitor] Alert created: ${params.severity} - ${params.message}`);
    } catch (error) {
      console.error("[CostMonitor] Failed to create alert:", error);
    }
  }

  /**
   * Get all active (unacknowledged) alerts from database
   */
  async getActiveAlerts(options?: {
    userId?: string;
    limit?: number;
  }): Promise<CostAlertRecord[]> {
    const alerts = await prisma.costAlert.findMany({
      where: {
        acknowledged: false,
        ...(options?.userId ? { userId: options.userId } : {}),
      },
      orderBy: [
        { severity: "asc" }, // CRITICAL first (alphabetically before WARNING)
        { createdAt: "desc" },
      ],
      take: options?.limit ?? 50,
    });

    return alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      userId: a.userId,
      dealId: a.dealId,
      dealName: a.dealName,
      analysisId: a.analysisId,
      currentCost: Number(a.currentCost),
      threshold: Number(a.threshold),
      acknowledged: a.acknowledged,
      acknowledgedAt: a.acknowledgedAt,
      notificationSent: a.notificationSent,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Acknowledge an alert in database
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      await prisma.costAlert.update({
        where: { id: alertId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all alerts (for history view)
   */
  async getAllAlerts(options?: {
    userId?: string;
    type?: CostAlertType;
    severity?: CostAlertSeverity;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ alerts: CostAlertRecord[]; total: number }> {
    const where = {
      ...(options?.userId ? { userId: options.userId } : {}),
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.severity ? { severity: options.severity } : {}),
      ...(options?.acknowledged !== undefined ? { acknowledged: options.acknowledged } : {}),
      ...(options?.startDate || options?.endDate
        ? {
            createdAt: {
              ...(options?.startDate ? { gte: options.startDate } : {}),
              ...(options?.endDate ? { lte: options.endDate } : {}),
            },
          }
        : {}),
    };

    const [alerts, total] = await Promise.all([
      prisma.costAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      prisma.costAlert.count({ where }),
    ]);

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        userId: a.userId,
        dealId: a.dealId,
        dealName: a.dealName,
        analysisId: a.analysisId,
        currentCost: Number(a.currentCost),
        threshold: Number(a.threshold),
        acknowledged: a.acknowledged,
        acknowledgedAt: a.acknowledgedAt,
        notificationSent: a.notificationSent,
        createdAt: a.createdAt,
      })),
      total,
    };
  }

  /**
   * Update threshold configuration
   */
  setThresholds(thresholds: Partial<CostThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current threshold configuration
   */
  getThresholds(): CostThresholds {
    return { ...this.thresholds };
  }

  /**
   * Get threshold config from DB (global or user-specific)
   */
  async getThresholdsFromDB(userId?: string): Promise<CostThresholds> {
    const threshold = await prisma.costThreshold.findFirst({
      where: userId ? { userId } : { userId: null },
    });

    if (!threshold) {
      return { ...DEFAULT_THRESHOLDS };
    }

    return {
      dealWarning: Number(threshold.dealWarning),
      dealCritical: Number(threshold.dealCritical),
      userDailyWarning: Number(threshold.userDailyWarning),
      userDailyCritical: Number(threshold.userDailyCritical),
      analysisMax: Number(threshold.analysisMax),
      boardMax: Number(threshold.boardMax),
      monthlyBudget: threshold.monthlyBudget ? Number(threshold.monthlyBudget) : null,
    };
  }

  /**
   * Export cost data for CSV download
   */
  async exportCostData(options: {
    startDate: Date;
    endDate: Date;
    userId?: string;
    format: "events" | "summary";
  }): Promise<Array<Record<string, unknown>>> {
    if (options.format === "events") {
      // Export individual cost events
      const events = await prisma.costEvent.findMany({
        where: {
          createdAt: { gte: options.startDate, lte: options.endDate },
          ...(options.userId ? { userId: options.userId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      // Get deal names
      const dealIds = [...new Set(events.map((e) => e.dealId))];
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, name: true },
      });
      const dealMap = new Map(deals.map((d) => [d.id, d.name]));

      // Get user names
      const userIds = [...new Set(events.map((e) => e.userId))];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));

      return events.map((e) => ({
        date: e.createdAt.toISOString(),
        userId: e.userId,
        userName: userMap.get(e.userId)?.name ?? "",
        userEmail: userMap.get(e.userId)?.email ?? "",
        dealId: e.dealId,
        dealName: dealMap.get(e.dealId) ?? "",
        model: e.model,
        agent: e.agent,
        operation: e.operation,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        totalTokens: e.inputTokens + e.outputTokens,
        cost: Number(e.cost),
        durationMs: e.durationMs ?? "",
      }));
    } else {
      // Export daily summary
      const events = await prisma.costEvent.findMany({
        where: {
          createdAt: { gte: options.startDate, lte: options.endDate },
          ...(options.userId ? { userId: options.userId } : {}),
        },
        select: {
          userId: true,
          cost: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
        },
      });

      // Get user names
      const userIds = [...new Set(events.map((e) => e.userId))];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));

      // Group by day and user
      const dailyByUser = new Map<string, {
        date: string;
        userId: string;
        cost: number;
        calls: number;
        inputTokens: number;
        outputTokens: number;
      }>();

      for (const e of events) {
        const dateStr = e.createdAt.toISOString().split("T")[0];
        const key = `${dateStr}-${e.userId}`;

        const existing = dailyByUser.get(key) ?? {
          date: dateStr,
          userId: e.userId,
          cost: 0,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
        };

        existing.cost += Number(e.cost);
        existing.calls++;
        existing.inputTokens += e.inputTokens;
        existing.outputTokens += e.outputTokens;
        dailyByUser.set(key, existing);
      }

      return Array.from(dailyByUser.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: d.date,
          userId: d.userId,
          userName: userMap.get(d.userId)?.name ?? "",
          userEmail: userMap.get(d.userId)?.email ?? "",
          apiCalls: d.calls,
          inputTokens: d.inputTokens,
          outputTokens: d.outputTokens,
          totalTokens: d.inputTokens + d.outputTokens,
          cost: d.cost,
        }));
    }
  }

  /**
   * Get board session costs
   */
  async getBoardSessionsCosts(options?: {
    userId?: string;
    days?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    sessions: Array<{
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
      createdAt: Date;
    }>;
    totalCost: number;
    totalSessions: number;
  }> {
    const endDate = options?.endDate ?? new Date();
    const startDate = options?.startDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - (options?.days ?? 30));
      return d;
    })();

    const sessions = await prisma.aIBoardSession.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...(options?.userId ? { userId: options.userId } : {}),
      },
      include: {
        members: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get deal names
    const dealIds = [...new Set(sessions.map((s) => s.dealId))];
    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds } },
      select: { id: true, name: true, userId: true, user: { select: { name: true } } },
    });
    const dealMap = new Map(deals.map((d) => [d.id, d]));

    const sessionData = sessions.map((s) => {
      const deal = dealMap.get(s.dealId);
      return {
        sessionId: s.id,
        dealId: s.dealId,
        dealName: deal?.name ?? "Unknown",
        userId: s.userId,
        userName: deal?.user?.name ?? null,
        status: s.status,
        verdict: s.verdict,
        totalCost: Number(s.totalCost ?? 0),
        totalRounds: s.totalRounds,
        memberCount: s.members.length,
        createdAt: s.createdAt,
      };
    });

    return {
      sessions: sessionData,
      totalCost: sessionData.reduce((sum, s) => sum + s.totalCost, 0),
      totalSessions: sessions.length,
    };
  }
}

// Export singleton
export const costMonitor = CostMonitor.getInstance();

// Export types
export type { CostMonitor };
