import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  analysis: {
    findMany: vi.fn(),
  },
  costEvent: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findMany: (args: unknown) => mockPrisma.analysis.findMany(args),
    },
    costEvent: {
      findMany: (args: unknown) => mockPrisma.costEvent.findMany(args),
      groupBy: (args: unknown) => mockPrisma.costEvent.groupBy(args),
    },
  },
}));

const { costMonitor } = await import("../index");

describe("costMonitor.getGlobalStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates stats without selecting analysis results", async () => {
    const startDate = new Date("2026-04-01T00:00:00.000Z");
    const endDate = new Date("2026-04-20T23:59:59.999Z");
    const analysisCreatedAt = new Date("2026-04-10T12:00:00.000Z");
    const eventCreatedAt = new Date("2026-04-10T13:00:00.000Z");

    mockPrisma.analysis.findMany.mockResolvedValue([
      {
        id: "analysis-1",
        dealId: "deal-1",
        mode: "full_analysis",
        totalCost: 1.5,
        createdAt: analysisCreatedAt,
        deal: {
          name: "Acme",
          userId: "user-1",
          user: {
            name: "Alice",
            email: "alice@example.com",
          },
        },
      },
    ]);

    mockPrisma.costEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        userId: "user-1",
        dealId: "deal-1",
        model: "gpt-5",
        agent: "memo-generator",
        cost: 1.5,
        inputTokens: 1000,
        outputTokens: 500,
        createdAt: eventCreatedAt,
      },
    ]);

    mockPrisma.costEvent.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
      if (by[0] === "userId") {
        return [{ userId: "user-1", _count: 1 }];
      }
      if (by[0] === "dealId") {
        return [{ dealId: "deal-1", _count: 1 }];
      }
      return [];
    });

    const stats = await costMonitor.getGlobalStats(30, { startDate, endDate });
    const analysisCall = mockPrisma.analysis.findMany.mock.calls[0]?.[0] as
      | { select?: Record<string, unknown> }
      | undefined;

    expect(mockPrisma.analysis.findMany).toHaveBeenCalledTimes(1);
    expect(analysisCall).toMatchObject({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(analysisCall?.select?.results).toBeUndefined();

    expect(stats.costByDay).toEqual([
      {
        date: "2026-04-10",
        cost: 1.5,
        analyses: 1,
        apiCalls: 1,
      },
    ]);
    expect(stats.costByModel).toEqual([
      {
        model: "gpt-5",
        calls: 1,
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.5,
      },
    ]);
    expect(stats).toMatchObject({
      totalCost: 1.5,
      totalAnalyses: 1,
      avgCostPerAnalysis: 1.5,
      totalApiCalls: 1,
      totalUsers: 1,
      totalDeals: 1,
      costByType: {
        full_analysis: {
          count: 1,
          totalCost: 1.5,
          avgCost: 1.5,
        },
      },
      costByAgent: {
        "memo-generator": {
          count: 1,
          totalCost: 1.5,
          avgCost: 1.5,
        },
      },
      topDeals: [
        {
          dealId: "deal-1",
          dealName: "Acme",
          userId: "user-1",
          userName: "Alice",
          totalCost: 1.5,
        },
      ],
      topUsers: [
        {
          userId: "user-1",
          userName: "Alice",
          userEmail: "alice@example.com",
          totalCost: 1.5,
          dealCount: 1,
          analysisCount: 1,
        },
      ],
    });
  });
});
