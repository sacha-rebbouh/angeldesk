import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    analysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

describe("analysis progress persistence monotonicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMocks.prisma) => unknown) => callback(prismaMocks.prisma)
    );
    prismaMocks.prisma.analysis.update.mockResolvedValue({ id: "analysis_1" });
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

    expect(prismaMocks.prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAgents: 3,
          totalCost: 1.25,
          status: "FAILED",
        }),
      })
    );
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

  it("exposes pure helpers for regression guards", () => {
    expect(monotoneCompletedAgents(2, 1)).toBe(2);
    expect(monotoneCompletedAgents(1, 2)).toBe(2);
    expect(mergeAnalysisResults({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});
