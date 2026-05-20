/**
 * B17.1 — Admin Analysis Debug Console (read-only)
 *
 * GET /api/admin/analyses/:analysisId/debug
 *
 * Aggregates observability metadata for a single Analysis:
 *  - summary (status, counts, costs, timings, thesis decision, refund tracking)
 *  - per-agent timeline (counts, errors, totals, latest model)
 *  - recent LLM call log (limit 200, sanitized errorMessage, NO prompts/responses)
 *  - latest AnalysisCheckpoint
 *  - server-computed anomalies
 *
 * Strictly read-only. Admin auth via requireAdmin().
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError, sanitizeErrorText } from "@/lib/api-error";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

const COST_THRESHOLD_USD = Number(process.env.ADMIN_DEBUG_COST_THRESHOLD_USD ?? 3);
const SLOW_CALL_MS = 180_000;
const HIGH_INPUT_TOKENS = 60_000;

type AgentStatus = "success" | "failed" | "unknown";

type Anomaly = {
  type:
    | "unknown_agent_calls"
    | "agent_errors"
    | "total_cost_exceeded"
    | "slow_llm_call"
    | "high_input_tokens"
    | "completed_with_errors"
    | "checkpoint_divergence";
  severity: "warn" | "high";
  message: string;
  count?: number;
  data?: Record<string, unknown>;
};

function decToNum(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  // Prisma Decimal
  if (typeof (d as { toNumber?: () => number }).toNumber === "function") {
    return (d as { toNumber: () => number }).toNumber();
  }
  const n = Number(d);
  return Number.isFinite(n) ? n : 0;
}

function decToNumOrNull(d: unknown): number | null {
  if (d == null) return null;
  return decToNum(d);
}

function sanitizeCheckpointFailedAgents(value: unknown): unknown {
  if (!Array.isArray(value)) return value == null ? null : "[unrecognized failedAgents shape]";

  return value.map((item) => {
    if (item == null || typeof item !== "object") {
      return { agent: "unknown", error: sanitizeErrorText(item), retries: null };
    }
    const record = item as Record<string, unknown>;
    return {
      agent: sanitizeErrorText(record.agent ?? record.agentName ?? "unknown"),
      error: sanitizeErrorText(record.error ?? ""),
      retries: typeof record.retries === "number" ? record.retries : null,
    };
  });
}

async function requireAdminForDebug(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized" || message === "Clerk user not found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Admin access required") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  try {
    const adminFailure = await requireAdminForDebug();
    if (adminFailure) return adminFailure;
    const { analysisId } = await params;

    if (!isValidCuid(analysisId)) {
      return NextResponse.json({ error: "Invalid analysisId format" }, { status: 400 });
    }

    const { limit } = querySchema.parse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    const [
      analysis,
      checkpoint,
      llmCalls,
      llmCallsTotal,
      agentAggregates,
      slowestCall,
      highestInputCall,
    ] = await Promise.all([
      prisma.analysis.findUnique({
        where: { id: analysisId },
        select: {
          id: true,
          dealId: true,
          status: true,
          mode: true,
          type: true,
          totalAgents: true,
          completedAgents: true,
          totalCost: true,
          totalTimeMs: true,
          startedAt: true,
          completedAt: true,
          thesisId: true,
          thesisDecision: true,
          thesisDecisionAt: true,
          refundedAt: true,
          refundAmount: true,
          summary: true,
          results: true,
          negotiationStrategy: true,
        },
      }),
      prisma.analysisCheckpoint.findFirst({
        where: { analysisId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          state: true,
          completedAgents: true,
          pendingAgents: true,
          failedAgents: true,
          createdAt: true,
        },
      }),
      prisma.lLMCallLog.findMany({
        where: { analysisId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          agentName: true,
          model: true,
          isError: true,
          errorType: true,
          errorMessage: true,
          durationMs: true,
          cost: true,
          inputTokens: true,
          outputTokens: true,
          finishReason: true,
          createdAt: true,
        },
      }),
      prisma.lLMCallLog.count({ where: { analysisId } }),
      prisma.lLMCallLog.groupBy({
        by: ["agentName"],
        where: { analysisId },
        _count: { _all: true },
        _sum: {
          cost: true,
          durationMs: true,
          inputTokens: true,
          outputTokens: true,
        },
      }),
      prisma.lLMCallLog.findFirst({
        where: { analysisId },
        orderBy: { durationMs: "desc" },
        select: { agentName: true, model: true, durationMs: true },
      }),
      prisma.lLMCallLog.findFirst({
        where: { analysisId },
        orderBy: { inputTokens: "desc" },
        select: { agentName: true, model: true, inputTokens: true },
      }),
    ]);

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Per-agent error count + latest call info (single query each, low cost)
    const agentNames = agentAggregates.map((a) => a.agentName);
    const [errorCounts, latestCallByAgent] = await Promise.all([
      prisma.lLMCallLog.groupBy({
        by: ["agentName"],
        where: { analysisId, isError: true },
        _count: { _all: true },
      }),
      agentNames.length > 0
        ? prisma.lLMCallLog.findMany({
            where: { analysisId, agentName: { in: agentNames } },
            orderBy: { createdAt: "desc" },
            distinct: ["agentName"],
            select: { agentName: true, model: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const errorCountByAgent = new Map(
      errorCounts.map((e) => [e.agentName, e._count._all])
    );
    const latestByAgent = new Map(
      latestCallByAgent.map((l) => [l.agentName, l])
    );

    const agents = agentAggregates
      .map((a) => {
        const errorCount = errorCountByAgent.get(a.agentName) ?? 0;
        const latest = latestByAgent.get(a.agentName) ?? null;
        const status: AgentStatus =
          a.agentName === "unknown"
            ? "unknown"
            : errorCount > 0
            ? "failed"
            : "success";
        return {
          agentName: a.agentName,
          callCount: a._count._all,
          errorCount,
          totalCost: decToNum(a._sum.cost),
          totalDurationMs: a._sum.durationMs ?? 0,
          totalInputTokens: a._sum.inputTokens ?? 0,
          totalOutputTokens: a._sum.outputTokens ?? 0,
          latestModel: latest?.model ?? null,
          latestCreatedAt: latest?.createdAt?.toISOString() ?? null,
          status,
        };
      })
      .sort((a, b) => {
        const order = { failed: 0, unknown: 1, success: 2 } as const;
        return order[a.status] - order[b.status] || a.agentName.localeCompare(b.agentName);
      });

    // Anomalies
    const anomalies: Anomaly[] = [];
    const unknownAgent = agents.find((a) => a.agentName === "unknown");
    if (unknownAgent) {
      anomalies.push({
        type: "unknown_agent_calls",
        severity: "warn",
        message: `${unknownAgent.callCount} LLM call(s) tagged agentName="unknown" (cost ${unknownAgent.totalCost.toFixed(4)} USD)`,
        count: unknownAgent.callCount,
        data: {
          totalCost: unknownAgent.totalCost,
          totalInputTokens: unknownAgent.totalInputTokens,
        },
      });
    }

    const erroredAgents = agents.filter((a) => a.errorCount > 0);
    if (erroredAgents.length > 0) {
      anomalies.push({
        type: "agent_errors",
        severity: "high",
        message: `${erroredAgents.length} agent(s) with errored LLM call(s): ${erroredAgents.map((a) => `${a.agentName}(${a.errorCount})`).join(", ")}`,
        count: erroredAgents.reduce((s, a) => s + a.errorCount, 0),
        data: { agents: erroredAgents.map((a) => ({ agentName: a.agentName, errorCount: a.errorCount })) },
      });
    }

    const totalCostNum = decToNumOrNull(analysis.totalCost);
    if (totalCostNum != null && totalCostNum > COST_THRESHOLD_USD) {
      anomalies.push({
        type: "total_cost_exceeded",
        severity: "warn",
        message: `Analysis totalCost ${totalCostNum.toFixed(4)} USD > threshold ${COST_THRESHOLD_USD} USD`,
        data: { totalCost: totalCostNum, threshold: COST_THRESHOLD_USD },
      });
    }

    const slowestCallMs = slowestCall?.durationMs ?? 0;
    if (slowestCallMs > SLOW_CALL_MS) {
      anomalies.push({
        type: "slow_llm_call",
        severity: "warn",
        message: `Slowest LLM call ${slowestCallMs}ms > ${SLOW_CALL_MS}ms (agent=${slowestCall?.agentName}, model=${slowestCall?.model})`,
        data: { durationMs: slowestCallMs, agentName: slowestCall?.agentName, model: slowestCall?.model },
      });
    }

    const highTokenCall = highestInputCall && highestInputCall.inputTokens > HIGH_INPUT_TOKENS
      ? highestInputCall
      : null;
    if (highTokenCall) {
      anomalies.push({
        type: "high_input_tokens",
        severity: "warn",
        message: `LLM call with inputTokens=${highTokenCall.inputTokens} > ${HIGH_INPUT_TOKENS} (agent=${highTokenCall.agentName}, model=${highTokenCall.model})`,
        data: {
          inputTokens: highTokenCall.inputTokens,
          agentName: highTokenCall.agentName,
          model: highTokenCall.model,
        },
      });
    }

    if (analysis.status === "COMPLETED" && erroredAgents.length > 0) {
      anomalies.push({
        type: "completed_with_errors",
        severity: "high",
        message: "Analysis status=COMPLETED but LLM call errors are present",
      });
    }

    if (checkpoint && analysis.completedAgents !== checkpoint.completedAgents.length) {
      anomalies.push({
        type: "checkpoint_divergence",
        severity: "high",
        message: `Analysis.completedAgents=${analysis.completedAgents} but checkpoint.completedAgents.length=${checkpoint.completedAgents.length}`,
        data: {
          analysisCompletedAgents: analysis.completedAgents,
          checkpointCompletedAgents: checkpoint.completedAgents.length,
        },
      });
    }

    return NextResponse.json({
      data: {
        summary: {
          id: analysis.id,
          dealId: analysis.dealId,
          status: analysis.status,
          mode: analysis.mode,
          type: analysis.type,
          totalAgents: analysis.totalAgents,
          completedAgents: analysis.completedAgents,
          totalCost: totalCostNum,
          totalTimeMs: analysis.totalTimeMs,
          startedAt: analysis.startedAt?.toISOString() ?? null,
          completedAt: analysis.completedAt?.toISOString() ?? null,
          thesisId: analysis.thesisId,
          thesisDecision: analysis.thesisDecision,
          thesisDecisionAt: analysis.thesisDecisionAt?.toISOString() ?? null,
          refundedAt: analysis.refundedAt?.toISOString() ?? null,
          refundAmount: analysis.refundAmount,
          hasSummary: Boolean(analysis.summary),
          hasResults: analysis.results != null,
          hasNegotiationStrategy: analysis.negotiationStrategy != null,
        },
        agents,
        llmCalls: llmCalls.map((c) => ({
          id: c.id,
          agentName: c.agentName,
          model: c.model,
          isError: c.isError,
          errorType: c.errorType,
          errorMessage: c.errorMessage ? sanitizeErrorText(c.errorMessage) : null,
          durationMs: c.durationMs,
          cost: decToNum(c.cost),
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          finishReason: c.finishReason,
          createdAt: c.createdAt.toISOString(),
        })),
        checkpoint: checkpoint
          ? {
              id: checkpoint.id,
              state: checkpoint.state,
              completedAgents: checkpoint.completedAgents,
              pendingAgents: checkpoint.pendingAgents,
              failedAgents: sanitizeCheckpointFailedAgents(checkpoint.failedAgents),
              createdAt: checkpoint.createdAt.toISOString(),
            }
          : null,
        anomalies,
        meta: {
          llmCallsLimit: limit,
          llmCallsReturned: llmCalls.length,
          llmCallsTotal,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch analysis debug data");
  }
}
