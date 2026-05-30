import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma + credits BEFORE importing the module under test (hoisted by Vitest).
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    deal: {
      update: vi.fn(),
    },
  },
}));

// compensateFailedAnalysis dynamically imports "@/services/credits".
const refundCredits = vi.fn(async () => ({ success: true }));
const refundCreditAmount = vi.fn(async () => ({ success: true }));
vi.mock("@/services/credits", () => ({
  refundCredits,
  refundCreditAmount,
  getActionForAnalysisType: () => "DEEP_DIVE",
  CREDIT_COSTS: { DEEP_DIVE: 5 },
}));

// Logger has no behavioural role in the reaper invariants under test.
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { reapStaleAnalyses, STALE_ANALYSIS_REAP_MS } from "@/lib/analysis-compensation";

const mockedPrisma = prisma as unknown as {
  analysis: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  deal: { update: ReturnType<typeof vi.fn> };
};

const NOW = 1_000_000_000_000;
const STALE_AT = new Date(NOW - STALE_ANALYSIS_REAP_MS - 60_000); // 1 min past cutoff
const FRESH_AT = new Date(NOW - 60_000); // 1 min ago — alive

function runningRow(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    dealId: "d1",
    type: "full_analysis",
    startedAt: new Date(NOW - 30 * 60_000),
    deal: { userId: "u1" },
    checkpoints: [{ createdAt: STALE_AT }],
    ...over,
  };
}

describe("reapStaleAnalyses — watchdog des analyses figées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.analysis.update.mockResolvedValue({});
    mockedPrisma.deal.update.mockResolvedValue({});
    mockedPrisma.analysis.findFirst.mockResolvedValue(null); // no other RUNNING → deal reset
  });

  it("reape une analyse stale : flip FAILED + refund une fois", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([runningRow()]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);

    expect(res.reaped).toBe(1);
    expect(res.reapedIds).toEqual(["a1"]);
    // flip atomique gardé sur status RUNNING
    expect(mockedPrisma.analysis.updateMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.analysis.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "a1",
      status: "RUNNING",
    });
    // refund déclenché exactement une fois (via refundCredits, pas refundCreditAmount)
    expect(refundCredits).toHaveBeenCalledTimes(1);
    // deal remis en IN_DD
    expect(mockedPrisma.deal.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "IN_DD" },
    });
  });

  it("ne touche PAS un run frais (dernier checkpoint < seuil)", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ checkpoints: [{ createdAt: FRESH_AT }] }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);

    expect(res.reaped).toBe(0);
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("course perdue (flip count=0) → AUCUN refund (pas de double-spend)", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([runningRow()]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 0 }); // déjà terminalisée ailleurs

    const res = await reapStaleAnalyses(NOW);

    expect(res.reaped).toBe(0);
    expect(refundCredits).not.toHaveBeenCalled();
    expect(mockedPrisma.deal.update).not.toHaveBeenCalled();
  });

  it("fallback startedAt quand aucun checkpoint", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ checkpoints: [], startedAt: STALE_AT }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);
    expect(res.reaped).toBe(1);
  });

  it("aucun signal d'activité (ni checkpoint ni startedAt) → on s'abstient", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ checkpoints: [], startedAt: null }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);
    expect(res.reaped).toBe(0);
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
  });

  it("flip réussi mais userId manquant → pas de refund (log error), pas de crash", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ deal: { userId: null } }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);
    expect(res.reaped).toBe(0);
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
