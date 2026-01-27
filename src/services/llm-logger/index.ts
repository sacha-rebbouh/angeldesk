/**
 * LLM Call Logger
 *
 * Logs all LLM API calls (prompts and responses) for debugging, audit, and replay.
 * Also tracks detailed costs per call.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface LLMCallLogEntry {
  // Context
  analysisId?: string;
  boardSessionId?: string;
  agentName: string;

  // Model info
  model: string;
  provider?: string;

  // Request
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;

  // Response
  response: string;
  finishReason?: string;

  // Tokens & Cost
  inputTokens: number;
  outputTokens: number;
  cost: number;

  // Timing
  durationMs: number;
  firstTokenMs?: number;

  // Error info
  isError?: boolean;
  errorMessage?: string;
  errorType?: string;

  // Additional context
  metadata?: Record<string, unknown>;
}

/**
 * Log an LLM call to the database
 *
 * Fire-and-forget: doesn't block the caller
 */
export async function logLLMCall(entry: LLMCallLogEntry): Promise<string | null> {
  try {
    const log = await prisma.lLMCallLog.create({
      data: {
        analysisId: entry.analysisId,
        boardSessionId: entry.boardSessionId,
        agentName: entry.agentName,
        model: entry.model,
        provider: entry.provider ?? "openrouter",
        systemPrompt: entry.systemPrompt,
        userPrompt: entry.userPrompt,
        temperature: entry.temperature,
        maxTokens: entry.maxTokens,
        response: entry.response,
        finishReason: entry.finishReason,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.inputTokens + entry.outputTokens,
        cost: entry.cost,
        durationMs: entry.durationMs,
        firstTokenMs: entry.firstTokenMs,
        isError: entry.isError ?? false,
        errorMessage: entry.errorMessage,
        errorType: entry.errorType,
        metadata: entry.metadata
          ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return log.id;
  } catch (error) {
    console.error("[LLMLogger] Failed to log call:", error);
    return null;
  }
}

/**
 * Log an LLM call asynchronously (doesn't await)
 */
export function logLLMCallAsync(entry: LLMCallLogEntry): void {
  logLLMCall(entry).catch((err) => {
    console.error("[LLMLogger] Async log failed:", err);
  });
}

/**
 * Get LLM calls for an analysis
 */
export async function getLLMCallsForAnalysis(
  analysisId: string
): Promise<
  Array<{
    id: string;
    agentName: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    isError: boolean;
    createdAt: Date;
  }>
> {
  try {
    const logs = await prisma.lLMCallLog.findMany({
      where: { analysisId },
      select: {
        id: true,
        agentName: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
        durationMs: true,
        isError: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Convert Decimal to number
    return logs.map((log) => ({
      ...log,
      cost: Number(log.cost),
    }));
  } catch (error) {
    console.error("[LLMLogger] Failed to get calls:", error);
    return [];
  }
}

/**
 * Get full LLM call details (including prompts/response)
 */
export async function getLLMCallDetails(callId: string): Promise<LLMCallLogEntry | null> {
  try {
    const log = await prisma.lLMCallLog.findUnique({
      where: { id: callId },
    });

    if (!log) return null;

    return {
      analysisId: log.analysisId ?? undefined,
      boardSessionId: log.boardSessionId ?? undefined,
      agentName: log.agentName,
      model: log.model,
      provider: log.provider,
      systemPrompt: log.systemPrompt ?? undefined,
      userPrompt: log.userPrompt,
      temperature: log.temperature ?? undefined,
      maxTokens: log.maxTokens ?? undefined,
      response: log.response,
      finishReason: log.finishReason ?? undefined,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cost: Number(log.cost),
      durationMs: log.durationMs,
      firstTokenMs: log.firstTokenMs ?? undefined,
      isError: log.isError,
      errorMessage: log.errorMessage ?? undefined,
      errorType: log.errorType ?? undefined,
      metadata: log.metadata as Record<string, unknown> | undefined,
    };
  } catch (error) {
    console.error("[LLMLogger] Failed to get call details:", error);
    return null;
  }
}

/**
 * Get cost breakdown for an analysis
 */
export async function getAnalysisCostBreakdown(
  analysisId: string
): Promise<{
  totalCost: number;
  totalTokens: { input: number; output: number };
  byAgent: Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  totalCalls: number;
  totalDurationMs: number;
  errors: number;
}> {
  try {
    const logs = await prisma.lLMCallLog.findMany({
      where: { analysisId },
      select: {
        agentName: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
        durationMs: true,
        isError: true,
      },
    });

    const result = {
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      byAgent: {} as Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }>,
      byModel: {} as Record<string, { cost: number; calls: number }>,
      totalCalls: logs.length,
      totalDurationMs: 0,
      errors: 0,
    };

    for (const log of logs) {
      const cost = Number(log.cost);

      result.totalCost += cost;
      result.totalTokens.input += log.inputTokens;
      result.totalTokens.output += log.outputTokens;
      result.totalDurationMs += log.durationMs;

      if (log.isError) {
        result.errors++;
      }

      // By agent
      if (!result.byAgent[log.agentName]) {
        result.byAgent[log.agentName] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
      }
      result.byAgent[log.agentName].cost += cost;
      result.byAgent[log.agentName].calls++;
      result.byAgent[log.agentName].inputTokens += log.inputTokens;
      result.byAgent[log.agentName].outputTokens += log.outputTokens;

      // By model
      if (!result.byModel[log.model]) {
        result.byModel[log.model] = { cost: 0, calls: 0 };
      }
      result.byModel[log.model].cost += cost;
      result.byModel[log.model].calls++;
    }

    return result;
  } catch (error) {
    console.error("[LLMLogger] Failed to get cost breakdown:", error);
    return {
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      byAgent: {},
      byModel: {},
      totalCalls: 0,
      totalDurationMs: 0,
      errors: 0,
    };
  }
}

/**
 * Cleanup old LLM logs (keep last N days)
 */
export async function cleanupOldLLMLogs(keepDays: number = 30): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);

    const result = await prisma.lLMCallLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    if (result.count > 0) {
      console.log(`[LLMLogger] Cleaned up ${result.count} old logs`);
    }

    return result.count;
  } catch (error) {
    console.error("[LLMLogger] Failed to cleanup logs:", error);
    return 0;
  }
}

// Re-export for convenience
export type { LLMCallLogEntry as LLMLogEntry };
