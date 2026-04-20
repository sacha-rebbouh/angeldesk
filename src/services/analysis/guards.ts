import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface RunningAnalysisGuard {
  id: string;
  dealId: string;
  mode: string | null;
  status: string;
  thesisId: string | null;
  thesisDecision: string | null;
  createdAt: Date;
}

const STALE_RUNNING_ANALYSIS_CUTOFF_MS = 2 * 60 * 60 * 1000;
export const FULL_ANALYSIS_DISPATCH_PENDING_WINDOW_MS = 60 * 1000;

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

export async function getRunningAnalysisForDeal(
  dealId: string
): Promise<RunningAnalysisGuard | null> {
  return prisma.analysis.findFirst({
    where: {
      dealId,
      status: "RUNNING",
    },
    select: {
      id: true,
      dealId: true,
      mode: true,
      status: true,
      thesisId: true,
      thesisDecision: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function isPendingThesisReview(
  analysis: Pick<RunningAnalysisGuard, "status" | "mode" | "thesisDecision"> | null | undefined
): boolean {
  return Boolean(
    analysis &&
      analysis.status === "RUNNING" &&
      analysis.mode === "full_analysis" &&
      analysis.thesisDecision === null
  );
}

export function isFullAnalysisInProgress(
  analysis: Pick<RunningAnalysisGuard, "status" | "mode"> | null | undefined
): boolean {
  return Boolean(
    analysis &&
      analysis.status === "RUNNING" &&
      analysis.mode === "full_analysis"
  );
}

export type FullAnalysisDispatchReservation =
  | { kind: "reserved" }
  | { kind: "pending_dispatch" }
  | { kind: "running"; analysisId: string; thesisId: string | null }
  | { kind: "pending_thesis"; analysisId: string; thesisId: string | null };

export async function reserveFullAnalysisDispatch(
  dealId: string
): Promise<FullAnalysisDispatchReservation> {
  const lockKey = hashStringToBigInt(`analysis-dispatch:${dealId}`);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

    const runningAnalysis = await tx.analysis.findFirst({
      where: {
        dealId,
        status: "RUNNING",
      },
      select: {
        id: true,
        thesisId: true,
        mode: true,
        status: true,
        thesisDecision: true,
        createdAt: true,
        completedAgents: true,
        totalCost: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (runningAnalysis) {
      if (isPendingThesisReview(runningAnalysis)) {
        return {
          kind: "pending_thesis",
          analysisId: runningAnalysis.id,
          thesisId: runningAnalysis.thesisId,
        };
      }

      const hasMeaningfulProgress =
        (runningAnalysis.completedAgents ?? 0) > 0 ||
        runningAnalysis.thesisDecision != null ||
        Number(runningAnalysis.totalCost ?? 0) > 0;

      if (
        runningAnalysis.createdAt < new Date(Date.now() - STALE_RUNNING_ANALYSIS_CUTOFF_MS) &&
        !hasMeaningfulProgress
      ) {
        await tx.analysis.update({
          where: { id: runningAnalysis.id },
          data: { status: "FAILED" },
        });
      } else {
        return {
          kind: "running",
          analysisId: runningAnalysis.id,
          thesisId: runningAnalysis.thesisId,
        };
      }
    }

    const deal = await tx.deal.findUnique({
      where: { id: dealId },
      select: { status: true, updatedAt: true },
    });

    if (
      deal?.status === "ANALYZING" &&
      deal.updatedAt >= new Date(Date.now() - FULL_ANALYSIS_DISPATCH_PENDING_WINDOW_MS)
    ) {
      return { kind: "pending_dispatch" };
    }

    await tx.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    return { kind: "reserved" };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function claimFailedAnalysisResume(
  analysisId: string,
  dealId: string
): Promise<boolean> {
  const lockKey = hashStringToBigInt(`analysis-resume:${dealId}`);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

    const analysis = await tx.analysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });

    if (!analysis || analysis.status !== "FAILED") {
      return false;
    }

    await tx.analysis.update({
      where: { id: analysisId },
      data: {
        status: "RUNNING",
        completedAt: null,
      },
    });

    await tx.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    return true;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
