import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma + credits BEFORE importing the module under test (hoisted by Vitest).
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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

import {
  reapStaleAnalyses,
  reapStaleAnalysisById,
  reapStaleAnalysisByDispatchEventId,
  STALE_ANALYSIS_REAP_MS,
} from "@/lib/analysis-compensation";

const mockedPrisma = prisma as unknown as {
  analysis: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
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

  // ===== F (Fix C) — watchdog × durabilité stepwise v3 =====
  // En mode stepwise (DEEP_DIVE_STEPWISE=1), les checkpoints legacy sont SUPPRIMÉS
  // (state machine enableCheckpointing:false, persistTierCheckpoint no-op) ; la vivacité
  // vient des snapshots `writeStepwiseSnapshot` (AnalysisCheckpoint.create, state="STEPWISE:<unit>",
  // createdAt FRAIS à chaque step). Le reaper lit `checkpoints[0].createdAt` SANS filtre de state
  // → il voit ces snapshots comme signal de vivacité, exactement comme un checkpoint legacy.
  it("F — stepwise vivant : dernier checkpoint = snapshot STEPWISE frais → NON reapé", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ checkpoints: [{ createdAt: FRESH_AT, state: "STEPWISE:tier3-post" }] }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);
    expect(res.reaped).toBe(0);
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("F — stepwise réellement figé : dernier snapshot STEPWISE périmé → reapé + refund une fois", async () => {
    mockedPrisma.analysis.findMany.mockResolvedValue([
      runningRow({ checkpoints: [{ createdAt: STALE_AT, state: "STEPWISE:tier1-phase-c" }] }),
    ]);
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    const res = await reapStaleAnalyses(NOW);
    expect(res.reaped).toBe(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
  });

  it("F — le reaper lit les checkpoints SANS filtre de state (sinon il ignorerait les snapshots STEPWISE)", async () => {
    // DENTS de l'invariant : la vivacité stepwise repose sur le fait que la sous-requête
    // `checkpoints` n'a AUCUN `where` excluant `STEPWISE:*`. Les tests qui mockent le résultat
    // ne le protègent pas (un filtre ajouté demain passerait quand même) → on assert la FORME
    // de l'appel findMany : pas de `where`, orderBy createdAt desc, take 1, select createdAt.
    mockedPrisma.analysis.findMany.mockResolvedValue([]);
    await reapStaleAnalyses(NOW);

    const arg = mockedPrisma.analysis.findMany.mock.calls[0][0] as {
      select: { checkpoints: { where?: unknown; orderBy: unknown; take: number; select: unknown } };
    };
    const cp = arg.select.checkpoints;
    expect(cp.where).toBeUndefined(); // STEPWISE:* inclus dans le signal de vivacité
    expect(cp.orderBy).toEqual({ createdAt: "desc" });
    expect(cp.take).toBe(1);
    expect(cp.select).toEqual({ createdAt: true });
  });

  it("F — seuil reaper >> max wall-clock d'un step durable (route maxDuration 300s) + latence inter-step", () => {
    // Invariant de dimensionnement : chaque step.run stepwise est plafonné à 300s
    // (src/app/api/inngest/route.ts maxDuration=300, asserté par route-config.test.ts).
    // Le seuil de reap doit DÉPASSER LARGEMENT le pire cas (un step plein + la latence de
    // ré-invocation Inngest entre deux steps) pour ne JAMAIS tuer un run sain qui progresse
    // step par step. 20 min = 4× le plafond d'un step → marge confortable.
    const MAX_STEP_WALL_CLOCK_MS = 300_000;
    expect(STALE_ANALYSIS_REAP_MS).toBeGreaterThan(MAX_STEP_WALL_CLOCK_MS * 2);
  });
});

describe("reapStaleAnalysisById — watchdog par-analyse (résolu par id)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.analysis.update.mockResolvedValue({});
    mockedPrisma.deal.update.mockResolvedValue({});
    mockedPrisma.analysis.findFirst.mockResolvedValue(null); // compensate: pas d'autre RUNNING → deal reset
  });

  it("analyse terminée (≠ RUNNING) → terminal, aucune action", async () => {
    mockedPrisma.analysis.findUnique.mockResolvedValue({ ...runningRow(), status: "COMPLETED" });
    const res = await reapStaleAnalysisById("a1", NOW);
    expect(res.status).toBe("terminal");
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
  });

  it("introuvable → terminal", async () => {
    mockedPrisma.analysis.findUnique.mockResolvedValue(null);
    const res = await reapStaleAnalysisById("missing", NOW);
    expect(res.status).toBe("terminal");
  });

  it("RUNNING + figée → reaped + refund une fois", async () => {
    mockedPrisma.analysis.findUnique.mockResolvedValue({ ...runningRow(), status: "RUNNING" });
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    const res = await reapStaleAnalysisById("a1", NOW);
    expect(res.status).toBe("reaped");
    expect(refundCredits).toHaveBeenCalledTimes(1);
  });

  it("RUNNING + fraîche → alive (continuer à surveiller), pas de reap", async () => {
    mockedPrisma.analysis.findUnique.mockResolvedValue({
      ...runningRow({ checkpoints: [{ createdAt: FRESH_AT }] }),
      status: "RUNNING",
    });
    const res = await reapStaleAnalysisById("a1", NOW);
    expect(res.status).toBe("alive");
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });
});

describe("reapStaleAnalysisByDispatchEventId — watchdog par-analyse (résolu par dispatchEventId)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.analysis.update.mockResolvedValue({});
    mockedPrisma.deal.update.mockResolvedValue({});
  });

  it("résout par dispatchEventId et reape si figée", async () => {
    mockedPrisma.analysis.findFirst
      .mockResolvedValueOnce({ ...runningRow(), status: "RUNNING" }) // lookup principal
      .mockResolvedValue(null); // compensate: pas d'autre RUNNING
    mockedPrisma.analysis.updateMany.mockResolvedValue({ count: 1 });
    const res = await reapStaleAnalysisByDispatchEventId("disp-1", NOW);
    expect(res.status).toBe("reaped");
    expect(mockedPrisma.analysis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dispatchEventId: "disp-1" } })
    );
  });

  it("pas encore de ligne pour ce dispatchEventId (worker en file) → alive (pending, on continue)", async () => {
    mockedPrisma.analysis.findFirst.mockResolvedValue(null);
    const res = await reapStaleAnalysisByDispatchEventId("disp-x", NOW);
    expect(res.status).toBe("alive");
    expect(mockedPrisma.analysis.updateMany).not.toHaveBeenCalled();
  });

  it("ligne présente mais terminée (≠ RUNNING) → terminal", async () => {
    mockedPrisma.analysis.findFirst.mockResolvedValue({ ...runningRow(), status: "COMPLETED" });
    const res = await reapStaleAnalysisByDispatchEventId("disp-done", NOW);
    expect(res.status).toBe("terminal");
  });
});
