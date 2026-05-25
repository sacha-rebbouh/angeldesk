/**
 * Phase C slice C1a — Session reanalysis reservation helper.
 *
 * Sémantique de réservation partagée entre :
 *   - Le chemin manuel : `src/app/api/coaching/reanalyze/route.ts`
 *     (déclencheur explicite utilisateur, qui dépense des crédits).
 *   - Le chemin auto post-call : `src/lib/live/post-call-generator.ts`
 *     (déclencheur après generation du rapport post-call, fire-and-forget).
 *
 * Sans cette réservation partagée, un double webhook Recall `done` ou une
 * race entre un stop manuel et un webhook de fin pouvait déclencher deux
 * orchestrateurs `runAnalysis()` parallèles sur le même deal (double coût
 * LLM + race sur les writes `deal.*Score` + `mergeAnalysisResults`
 * interleaving).
 *
 * Invariants préservés depuis l'implémentation originale (route.ts) :
 *   - Advisory lock Postgres scoped par `session-reanalysis:<sessionId>`.
 *   - Fenêtre de fraîcheur 30 min : une réservation plus ancienne est
 *     considérée stale et peut être écrasée.
 *   - Transaction Serializable.
 *   - `requestId` UUIDv4 pour l'idempotency key Credits + le clear.
 *   - Clear strictement scopé : on ne libère QUE si `reanalysisRequestId`
 *     matche encore (évite d'écraser une réservation plus récente).
 *
 * Lecture seule en cas de session manquante :
 *   - `session_not_found` est retourné explicitement (pas de throw) pour
 *     permettre aux deux chemins de loger calmement et skip — typiquement
 *     une session qui a été supprimée entre le `findFirst` du caller et
 *     l'entrée dans la transaction.
 */

import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REANALYSIS_STALE_WINDOW_MS = 30 * 60 * 1000;

export type ReanalysisMode = "targeted" | "full";

export type ReserveSessionReanalysisResult =
  | { kind: "reserved"; requestId: string }
  | { kind: "active" }
  | { kind: "session_not_found" };

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

/**
 * Tente de réserver une re-analyse de session sous advisory lock Postgres.
 *
 * Comportement :
 *   - `reserved` : aucune réservation active dans la fenêtre 30 min ;
 *     un nouveau `requestId` est posé sur la `LiveSession`.
 *   - `active` : une réservation existe et est plus jeune que
 *     `REANALYSIS_STALE_WINDOW_MS`. Le caller doit skip / 409.
 *   - `session_not_found` : la session n'existe pas ou n'est pas dans
 *     l'état attendu (`completed` ou `processing`). Le caller doit log et
 *     skip (pas un cas d'erreur fatal).
 */
export async function reserveSessionReanalysis(
  sessionId: string,
  userId: string,
  mode: ReanalysisMode,
): Promise<ReserveSessionReanalysisResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${hashStringToBigInt(`session-reanalysis:${sessionId}`)})`,
      );

      const session = await tx.liveSession.findFirst({
        where: {
          id: sessionId,
          userId,
          status: { in: ["completed", "processing"] },
        },
        select: {
          id: true,
          reanalysisRequestId: true,
          reanalysisRequestedAt: true,
        },
      });

      if (!session) {
        return { kind: "session_not_found" as const };
      }

      if (
        session.reanalysisRequestId &&
        session.reanalysisRequestedAt &&
        session.reanalysisRequestedAt >= new Date(Date.now() - REANALYSIS_STALE_WINDOW_MS)
      ) {
        return { kind: "active" as const };
      }

      const requestId = randomUUID();
      await tx.liveSession.update({
        where: { id: sessionId },
        data: {
          reanalysisRequestId: requestId,
          reanalysisMode: mode,
          reanalysisRequestedAt: new Date(),
        },
      });

      return {
        kind: "reserved" as const,
        requestId,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

/**
 * Libère une réservation de re-analyse — strictement scopée au
 * `requestId` qui détient encore la slot. Si une réservation plus récente
 * a écrasé la nôtre entre-temps (cas dégradé), `updateMany` retournera 0
 * sans muter — comportement idempotent et safe sous race.
 */
export async function clearSessionReanalysisReservation(
  sessionId: string,
  requestId: string,
): Promise<void> {
  await prisma.liveSession.updateMany({
    where: {
      id: sessionId,
      reanalysisRequestId: requestId,
    },
    data: {
      reanalysisRequestId: null,
      reanalysisMode: null,
      reanalysisRequestedAt: null,
    },
  });
}
