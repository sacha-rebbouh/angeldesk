/**
 * LLM Call Logger
 *
 * Logs LLM API calls for debugging and audit without persisting raw prompt/response
 * bodies by default. Raw storage must be explicitly re-enabled via env for controlled
 * debugging sessions only.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
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

function isRawLoggingEnabled(): boolean {
  return process.env.LLM_LOG_RAW_TEXT === "true";
}

function hashText(value: string | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

function protectText(value: string | undefined, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (isRawLoggingEnabled()) return value;

  const hash = hashText(value);
  return `[REDACTED:${label}; len=${value.length}; sha256=${hash?.slice(0, 16) ?? "none"}]`;
}

function buildProtectedMetadata(entry: LLMCallLogEntry): Record<string, unknown> | undefined {
  const hashes = {
    loggingMode: isRawLoggingEnabled() ? "raw" : "redacted",
    systemPromptHash: hashText(entry.systemPrompt),
    systemPromptLength: entry.systemPrompt?.length ?? 0,
    userPromptHash: hashText(entry.userPrompt),
    userPromptLength: entry.userPrompt.length,
    responseHash: hashText(entry.response),
    responseLength: entry.response.length,
  };

  if (!entry.metadata) {
    return hashes;
  }

  return {
    ...entry.metadata,
    llmTrace: hashes,
  };
}

/**
 * Log an LLM call to the database
 *
 * Fire-and-forget: doesn't block the caller
 */
export async function logLLMCall(entry: LLMCallLogEntry): Promise<string | null> {
  try {
    const protectedSystemPrompt = protectText(entry.systemPrompt, "system");
    const protectedUserPrompt = protectText(entry.userPrompt, "user") ?? "[REDACTED:user]";
    const protectedResponse = protectText(entry.response, "response") ?? "[REDACTED:response]";
    const protectedMetadata = buildProtectedMetadata(entry);

    const log = await prisma.lLMCallLog.create({
      data: {
        analysisId: entry.analysisId,
        boardSessionId: entry.boardSessionId,
        agentName: entry.agentName,
        model: entry.model,
        provider: entry.provider ?? "openrouter",
        systemPrompt: protectedSystemPrompt,
        userPrompt: protectedUserPrompt,
        temperature: entry.temperature,
        maxTokens: entry.maxTokens,
        response: protectedResponse,
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
        metadata: protectedMetadata
          ? (JSON.parse(JSON.stringify(protectedMetadata)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return log.id;
  } catch (error) {
    logger.error({ err: error }, "Failed to persist LLM call log");
    return null;
  }
}

/**
 * Log an LLM call asynchronously (doesn't await)
 */
export function logLLMCallAsync(entry: LLMCallLogEntry): void {
  logLLMCall(entry).catch((err) => {
    logger.error({ err }, "Async LLM call log failed");
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
    logger.error({ err: error, analysisId }, "Failed to load LLM calls for analysis");
    return [];
  }
}

/**
 * Get stored LLM call details. By default prompts/responses are redacted at write time.
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
    logger.error({ err: error, callId }, "Failed to get LLM call details");
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
    logger.error({ err: error, analysisId }, "Failed to compute LLM call cost breakdown");
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
