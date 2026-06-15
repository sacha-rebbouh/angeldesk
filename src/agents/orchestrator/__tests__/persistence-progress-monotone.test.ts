import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    analysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    analysisCheckpoint: {
      create: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma)
  );

  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));

import {
  completeAnalysis,
  mergeAnalysisResults,
  monotoneCompletedAgents,
  saveCheckpoint,
  updateAnalysisProgress,
} from "../persistence";
import { logger } from "@/lib/logger";

const DEGRADED_RESULTS = {
  "financial-auditor": {
    agentName: "financial-auditor",
    success: true,
    cost: 0.1,
    executionTimeMs: 10,
  },
  "legal-regulatory": {
    agentName: "legal-regulatory",
    success: false,
    cost: 0,
    executionTimeMs: 0,
    error: "timed out",
  },
};

function degradedLogCalls() {
  const calls = vi.mocked(logger.error).mock.calls as unknown as Array<
    [Record<string, unknown>, string]
  >;
  return calls.filter((call) => call[1] === "Analysis completed degraded");
}

describe("analysis progress persistence monotonicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMocks.prisma) => unknown) => callback(prismaMocks.prisma)
    );
    prismaMocks.prisma.analysis.update.mockResolvedValue({ id: "analysis_1", dealId: "deal_1" });
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.prisma.analysisCheckpoint.create.mockResolvedValue({ id: "checkpoint_1" });
  });

  it("keeps completedAgents monotone for direct progress updates", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      completedAgents: 2,
      totalCost: "0.50",
    });

    await updateAnalysisProgress("analysis_1", 1, 0.25);

    expect(prismaMocks.prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: "analysis_1" },
      data: {
        completedAgents: 2,
        totalCost: 0.5,
      },
    });
  });

  it("keeps terminal completeAnalysis from lowering visible progress", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      completedAgents: 3,
      totalCost: "1.25",
    });

    await completeAnalysis({
      analysisId: "analysis_1",
      success: false,
      totalCost: 0.5,
      totalTimeMs: 1000,
      summary: "failed",
      statusOverride: "FAILED",
      results: {
        "document-extractor": {
          agentName: "document-extractor",
          success: true,
          cost: 0.5,
          executionTimeMs: 10,
        },
      },
    });

    // Le write FAILED passe désormais par updateMany CONDITIONNEL (NOT COMPLETED,
    // terminal-safe — gate Codex salvage) ; l'invariant monotone reste identique.
    expect(prismaMocks.prisma.analysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "analysis_1", NOT: { status: "COMPLETED" } },
        data: expect.objectContaining({
          completedAgents: 3,
          totalCost: 1.25,
          status: "FAILED",
        }),
      })
    );
  });

  it("never drops agents already persisted when completeAnalysis receives a partial result set", async () => {
    // La DB contient déjà 3 agents (dont 2 échoués) plus tôt dans le run.
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      completedAgents: 3,
      totalCost: "1.00",
      results: {
        "financial-auditor": { agentName: "financial-auditor", success: true, cost: 0.1, executionTimeMs: 10 },
        "legal-regulatory": { agentName: "legal-regulatory", success: false, cost: 0, executionTimeMs: 0, error: "timed out after 180000ms" },
        "cap-table-auditor": { agentName: "cap-table-auditor", success: false, cost: 0, executionTimeMs: 0, error: "empty_response" },
      },
    });

    // Le chemin stop=thesis_only re-complète avec un set PARTIEL (extracteur seul).
    await completeAnalysis({
      analysisId: "analysis_1",
      success: true,
      totalCost: 1.0,
      totalTimeMs: 1000,
      summary: "thesis only",
      mode: "thesis_only",
      results: {
        "document-extractor": { agentName: "document-extractor", success: true, cost: 0.05, executionTimeMs: 5 },
      },
    });

    const updateArg = prismaMocks.prisma.analysis.update.mock.calls[0][0] as {
      data: { results: Record<string, { success?: boolean }>; completedAgents: number };
    };
    const persisted = updateArg.data.results;
    // Aucun agent pré-existant n'est droppé — y compris les échoués.
    expect(Object.keys(persisted).sort()).toEqual([
      "cap-table-auditor",
      "document-extractor",
      "financial-auditor",
      "legal-regulatory",
    ]);
    expect(persisted["legal-regulatory"].success).toBe(false);
    expect(persisted["cap-table-auditor"].success).toBe(false);
    // completedAgents reste monotone (max(3, 2 succès dans le set mergé)).
    expect(updateArg.data.completedAgents).toBe(3);
  });

  it("keeps checkpoint writes from lowering progress or dropping existing result keys", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "RUNNING",
      completedAgents: 2,
      totalCost: "0.50",
      results: {
        "fact-extractor": { success: true },
      },
    });

    await saveCheckpoint("analysis_1", {
      state: "GATHERING",
      completedAgents: ["document-extractor"],
      pendingAgents: ["thesis-extractor"],
      failedAgents: [],
      findings: [],
      results: {
        "document-extractor": { success: true },
      },
      totalCost: 0.25,
      startTime: "2026-05-20T00:00:00.000Z",
    });

    expect(prismaMocks.prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: "analysis_1" },
      data: {
        completedAgents: 2,
        totalCost: 0.5,
        results: {
          "fact-extractor": { success: true },
          "document-extractor": { success: true },
        },
      },
    });
  });

  it("does not let late checkpoints overwrite terminal analysis rows", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "FAILED",
      completedAgents: 2,
      totalCost: "0.50",
      results: {},
    });

    await saveCheckpoint("analysis_1", {
      state: "FAILED",
      completedAgents: ["document-extractor"],
      pendingAgents: [],
      failedAgents: [],
      findings: [],
      results: {
        "document-extractor": { success: true },
      },
      totalCost: 0.25,
      startTime: "2026-05-20T00:00:00.000Z",
    });

    expect(prismaMocks.prisma.analysis.update).not.toHaveBeenCalled();
  });

  it("emits one degraded-completion Sentry signal on the transition into COMPLETED", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "RUNNING",
      completedAgents: 1,
      totalCost: "0.50",
      results: {},
    });
    prismaMocks.prisma.analysis.update.mockResolvedValueOnce({
      id: "analysis_1",
      dealId: "deal_1",
    });

    await completeAnalysis({
      analysisId: "analysis_1",
      success: false,
      totalCost: 0.5,
      totalTimeMs: 1000,
      summary: "degraded",
      results: DEGRADED_RESULTS,
    });

    const calls = degradedLogCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({
      analysisId: "analysis_1",
      dealId: "deal_1",
      failedAgents: ["legal-regulatory"],
      failedCount: 1,
    });
  });

  it("does not re-emit the degraded signal when re-completing an already COMPLETED analysis", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "COMPLETED",
      completedAgents: 2,
      totalCost: "1.00",
      results: {},
    });
    prismaMocks.prisma.analysis.update.mockResolvedValueOnce({
      id: "analysis_1",
      dealId: "deal_1",
    });

    await completeAnalysis({
      analysisId: "analysis_1",
      success: false,
      totalCost: 1.0,
      totalTimeMs: 1000,
      summary: "re-complete",
      results: DEGRADED_RESULTS,
    });

    expect(degradedLogCalls()).toHaveLength(0);
  });

  it("does not emit a degraded signal when all agents succeeded", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "RUNNING",
      completedAgents: 0,
      totalCost: "0",
      results: {},
    });
    prismaMocks.prisma.analysis.update.mockResolvedValueOnce({
      id: "analysis_1",
      dealId: "deal_1",
    });

    await completeAnalysis({
      analysisId: "analysis_1",
      success: true,
      totalCost: 0.2,
      totalTimeMs: 500,
      summary: "ok",
      results: {
        "financial-auditor": {
          agentName: "financial-auditor",
          success: true,
          cost: 0.1,
          executionTimeMs: 10,
        },
      },
    });

    expect(degradedLogCalls()).toHaveLength(0);
  });

  it("exposes pure helpers for regression guards", () => {
    expect(monotoneCompletedAgents(2, 1)).toBe(2);
    expect(monotoneCompletedAgents(1, 2)).toBe(2);
    expect(mergeAnalysisResults({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});
