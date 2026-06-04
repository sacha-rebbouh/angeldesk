/**
 * Analysis compensation + stale-run reaping.
 *
 * Extrait de `inngest.ts` pour deps légères (prisma + logger + import dynamique
 * credits) — testable en isolation, et source unique du refund/reset deal.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Compensation d'une analyse qui a échoué : refund crédits + reset deal status.
 * Idempotent côté refund (clé d'idempotence) ; pose `refundedAt` pour que le
 * resume logic sache que l'analyse a déjà été remboursée avant toute re-tentative.
 */
export async function compensateFailedAnalysis(params: {
  analysisId?: string;
  userId: string;
  dealId: string;
  type: string;
  refundIdempotencyKey?: string;
  refundAmount?: number;
}) {
  const { refundCredits, refundCreditAmount, getActionForAnalysisType, CREDIT_COSTS } = await import("@/services/credits");
  const action = getActionForAnalysisType(params.type);
  try {
    const refundAmount = params.refundAmount;
    if (typeof refundAmount === "number" && refundAmount > 0) {
      await refundCreditAmount(params.userId, action, refundAmount, {
        dealId: params.dealId,
        idempotencyKey: params.refundIdempotencyKey,
        description: `Remboursement analyse echouee (${refundAmount} credits)`,
      });
    } else {
      await refundCredits(params.userId, action, params.dealId, {
        analysisId: params.analysisId,
        ...(params.refundIdempotencyKey
          ? { idempotencyKey: params.refundIdempotencyKey }
          : {}),
      });
    }
    if (params.analysisId) {
      await prisma.analysis.update({
        where: { id: params.analysisId },
        data: { refundedAt: new Date(), refundAmount: refundAmount ?? CREDIT_COSTS[action] ?? null },
      }).catch((err: unknown) => logger.warn({ err, analysisId: params.analysisId }, 'Could not mark refundedAt'));
    }
  } catch (err) {
    logger.error({ err, dealId: params.dealId, userId: params.userId }, 'Inngest refund failed for failed analysis');
  }
  try {
    const anotherRunningAnalysis = await prisma.analysis.findFirst({
      where: {
        dealId: params.dealId,
        status: "RUNNING",
      },
      select: { id: true },
    });

    if (!anotherRunningAnalysis) {
      await prisma.deal.update({ where: { id: params.dealId }, data: { status: 'IN_DD' } });
    }
  } catch (err) {
    logger.error({ err, dealId: params.dealId }, 'Inngest deal status reset failed');
  }
}

export const STALE_ANALYSIS_REAP_MS = 20 * 60 * 1000;

interface ReapableAnalysis {
  id: string;
  dealId: string;
  type: string;
  startedAt: Date | null;
  deal: { userId: string | null } | null;
  checkpoints: { createdAt: Date }[];
}

/**
 * Reape UNE analyse si figée : RUNNING + dernière activité (dernier checkpoint, sinon
 * `startedAt`) au-delà du cutoff. Flip atomique RUNNING→FAILED (seule la transition
 * gagnante rembourse) + refund + reset deal. Source UNIQUE de la logique de reap,
 * partagée par le scan global (`reapStaleAnalyses`) et le watchdog par-analyse.
 * Retourne true si reapée, false sinon (fraîche, abstention, course perdue, userId manquant).
 */
async function reapIfStale(a: ReapableAnalysis, cutoff: Date, nowMs: number): Promise<boolean> {
  // Signal de vivacité : dernier checkpoint écrit, sinon startedAt.
  const lastActivity = a.checkpoints[0]?.createdAt ?? a.startedAt;
  if (!lastActivity) return false; // aucune activité datable → on s'abstient
  if (new Date(lastActivity) >= cutoff) return false; // encore frais → vivant

  // Flip atomique : seule la transition gagnante déclenche le refund.
  const flip = await prisma.analysis.updateMany({
    where: { id: a.id, status: 'RUNNING' },
    data: {
      status: 'FAILED',
      completedAt: new Date(nowMs),
      summary:
        'Analyse interrompue (timeout infrastructure) — clôturée automatiquement ' +
        'par le watchdog pour autoriser la relance. Crédits remboursés.',
    },
  });
  if (flip.count !== 1) return false; // déjà terminalisée par un autre chemin

  if (!a.deal?.userId) {
    logger.error(
      { analysisId: a.id, dealId: a.dealId },
      '[stale-reaper] flipped FAILED but deal has no userId — cannot refund'
    );
    return false;
  }

  await compensateFailedAnalysis({
    analysisId: a.id,
    userId: a.deal.userId,
    dealId: a.dealId,
    type: a.type,
  });
  logger.warn(
    { analysisId: a.id, dealId: a.dealId, lastActivity },
    '[stale-reaper] stale RUNNING analysis reaped → FAILED + refunded + deal IN_DD'
  );
  return true;
}

/**
 * Cœur du watchdog : passe en FAILED + rembourse + remet le deal en IN_DD toute
 * analyse RUNNING dont la dernière activité (dernier checkpoint, ou `startedAt` à
 * défaut) date de plus de STALE_ANALYSIS_REAP_MS.
 *
 * Contexte : une `full_analysis` déroule Tier 0→0.5→1→2→3 dans UNE seule step
 * Inngest (`run-analysis`), plafonnée à 300s côté Vercel. Si un agent sérialise
 * assez de retries/timeouts pour pousser la step au-delà de 300s, Vercel tue la
 * fonction au milieu : la ligne reste `RUNNING` indéfiniment (aucun watchdog ne
 * couvrait ce cas depuis le retrait du gate thèse). Ce reaper terminalise proprement
 * un run déjà mort pour autoriser la relance — il ne touche AUCUN prompt ni output.
 *
 * Sûreté (anti faux-positif + anti double-remboursement) :
 *  - Seuil large (20 min) >> cadence normale d'un checkpoint (~5 min) : un run
 *    lent-mais-vivant n'est jamais tué (un agent seul plafonne ~9 min retries inclus).
 *  - Le flip RUNNING→FAILED est ATOMIQUE (updateMany where status RUNNING) ; le refund
 *    n'est déclenché que si CE reaper a réellement fait la transition (count === 1) →
 *    pas de double refund, pas de course avec une complétion normale.
 *
 * `nowMs` est injecté pour des tests déterministes.
 */
export async function reapStaleAnalyses(nowMs: number = Date.now()): Promise<{
  scanned: number;
  reaped: number;
  reapedIds: string[];
}> {
  const cutoff = new Date(nowMs - STALE_ANALYSIS_REAP_MS);

  const running = await prisma.analysis.findMany({
    where: { status: 'RUNNING' },
    select: {
      id: true,
      dealId: true,
      type: true,
      startedAt: true,
      deal: { select: { userId: true } },
      checkpoints: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const reapedIds: string[] = [];
  for (const a of running) {
    if (await reapIfStale(a, cutoff, nowMs)) reapedIds.push(a.id);
  }

  if (reapedIds.length > 0) {
    logger.warn({ scanned: running.length, reaped: reapedIds.length, reapedIds }, '[stale-reaper] run complete');
  }
  return { scanned: running.length, reaped: reapedIds.length, reapedIds };
}

/**
 * Issue d'un check par-analyse (watchdog événementiel) :
 * - 'reaped'   : était figée → flippée FAILED + remboursée
 * - 'terminal' : n'est plus RUNNING (terminée / disparue) → plus rien à surveiller
 * - 'alive'    : encore RUNNING et fraîche → continuer à surveiller
 */
export type SingleReapOutcome = { status: 'reaped' | 'terminal' | 'alive' };

/**
 * Watchdog par-analyse (résolu par id, chemin resume). Reape CETTE analyse si figée.
 * Remplace, avec reapStaleAnalysisByDispatchEventId, le scan global régulier : Neon
 * n'est touché que pendant qu'une analyse tourne réellement (cf. inngest.ts watchdog).
 */
export async function reapStaleAnalysisById(
  analysisId: string,
  nowMs: number = Date.now()
): Promise<SingleReapOutcome> {
  const a = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      dealId: true,
      type: true,
      startedAt: true,
      status: true,
      deal: { select: { userId: true } },
      checkpoints: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  if (!a || a.status !== 'RUNNING') return { status: 'terminal' };
  const cutoff = new Date(nowMs - STALE_ANALYSIS_REAP_MS);
  return { status: (await reapIfStale(a, cutoff, nowMs)) ? 'reaped' : 'alive' };
}

/**
 * Watchdog par-analyse (résolu par dispatchEventId, chemin new-analysis : l'analysisId
 * est créé dans le worker, indisponible au dispatch). Reape CETTE analyse si figée.
 */
export async function reapStaleAnalysisByDispatchEventId(
  dispatchEventId: string,
  nowMs: number = Date.now()
): Promise<SingleReapOutcome> {
  const a = await prisma.analysis.findFirst({
    where: { dispatchEventId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      dealId: true,
      type: true,
      startedAt: true,
      status: true,
      deal: { select: { userId: true } },
      checkpoints: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  // Pas encore de ligne pour ce dispatchEventId = worker pas encore démarré (file Inngest /
  // concurrence > 25 min) → PENDING : on continue à surveiller jusqu'au cap au lieu d'abandonner.
  if (!a) return { status: 'alive' };
  if (a.status !== 'RUNNING') return { status: 'terminal' };
  const cutoff = new Date(nowMs - STALE_ANALYSIS_REAP_MS);
  return { status: (await reapIfStale(a, cutoff, nowMs)) ? 'reaped' : 'alive' };
}
