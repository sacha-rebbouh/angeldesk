/**
 * Snapshot stepwise — read/write du FullAnalysisStepState via AnalysisCheckpoint.
 * ÉTAPE B (Fix C). Décision (audit Codex #3) : réutiliser le modèle existant
 * `AnalysisCheckpoint` avec `state: "STEPWISE:<unit>"` + le StepState (JSON pur) dans
 * la colonne `results`. AUCUNE nouvelle table, AUCUNE migration.
 *
 * IMPORTANT : on écrit via `prisma.analysisCheckpoint.create` DIRECTEMENT, PAS via
 * `saveCheckpoint()` — car saveCheckpoint merge son `results` dans `Analysis.results`
 * (RUNNING-gated), or un StepState n'a PAS la forme d'un set de résultats d'agents :
 * le merger corromprait `Analysis.results`. On crée donc juste la ligne checkpoint
 * (ce qui rafraîchit aussi `createdAt` → le watchdog voit l'analyse vivante).
 *
 * FOLLOW-UP connu pour l'étape D (NON traité ici) : `loadLatestCheckpoint` /
 * `loadAnalysisForRecovery` ordonnent par createdAt desc et renverraient un
 * checkpoint "STEPWISE:*" comme « dernier » — le chemin resume devra les filtrer
 * (state.startsWith("STEPWISE:")) pour ne pas interpréter un StepState comme un set
 * de résultats d'agents ni "STEPWISE:..." comme un état de state-machine. À l'étape B
 * ces helpers ne sont appelés par AUCUN chemin runtime, donc zéro impact.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type FullAnalysisStepState,
  type FullAnalysisUnit,
  assertSerializableStepState,
  parseStepState,
} from "./full-analysis-step-state";

/** Préfixe de `AnalysisCheckpoint.state` réservé aux snapshots stepwise. */
export const STEPWISE_STATE_PREFIX = "STEPWISE:";

/** Construit la valeur `state` d'un checkpoint stepwise pour une unité. */
export function stepwiseStateValue(unit: FullAnalysisUnit): string {
  return `${STEPWISE_STATE_PREFIX}${unit}`;
}

/** true si une valeur `AnalysisCheckpoint.state` est un snapshot stepwise. */
export function isStepwiseState(state: string | null | undefined): boolean {
  return typeof state === "string" && state.startsWith(STEPWISE_STATE_PREFIX);
}

/**
 * Persiste un StepState comme nouveau checkpoint `STEPWISE:<unit>` ET flushe le compteur de
 * progression `Analysis.completedAgents` — le tout dans UNE transaction (gate Codex).
 * Valide la sérialisabilité STRICTE avant écriture (lève si non JSON-pur).
 * Retourne l'id du checkpoint créé.
 *
 * Flush du compteur (fix « gel 2/22 ») : `Analysis.completedAgents` n'était mis à jour qu'au
 * finalize Tier1 (updateAnalysisProgress) → entre deux frontières de tier (ex. pendant le replay
 * de tier0-thesis ~10 min), l'UI restait figée. On flushe ici `state.completedCount` (compteur
 * STRUCTUREL monotone — PAS `Object.keys(allResults)` qui compterait les agents échoués/synthétiques)
 * à CHAQUE snapshot, via un `updateMany` CONDITIONNEL atomique (`where completedAgents < nouveau`
 * → monotone garanti DB-side, jamais de régression même sous écritures concurrentes ; `status`
 * RUNNING-gated → ne réécrit pas un terminal). Même transaction que le checkpoint → atomique : si
 * le flush échoue, le checkpoint rollback aussi (pas de checkpoint orphelin ni de double-création
 * au retry du step). 1 seule op DB (pas de read-then-write).
 */
export async function writeStepwiseSnapshot(
  state: FullAnalysisStepState
): Promise<string> {
  assertSerializableStepState(state);
  return prisma.$transaction(async (tx) => {
    const saved = await tx.analysisCheckpoint.create({
      data: {
        analysisId: state.analysisId,
        state: stepwiseStateValue(state.lastUnit),
        completedAgents: Object.keys(state.allResults),
        pendingAgents: [],
        failedAgents: [] as unknown as Prisma.InputJsonValue,
        findings: [] as unknown as Prisma.InputJsonValue,
        results: state as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // updateMany CONDITIONNEL atomique (gate Codex) : monotone garanti par `completedAgents: { lt }`
    // (jamais de régression, même sous écritures concurrentes) + RUNNING-gated par `status` (ne
    // réécrit pas un terminal). count=0 quand il n'y a rien à avancer. 1 op, pas de read-then-write.
    await tx.analysis.updateMany({
      where: {
        id: state.analysisId,
        status: "RUNNING",
        completedAgents: { lt: state.completedCount },
      },
      data: { completedAgents: state.completedCount },
    });

    return saved.id;
  });
}

/**
 * Lit le dernier snapshot stepwise d'une analyse (le plus récent checkpoint
 * `STEPWISE:*`). Retourne null si aucun. Valide le StepState au load (lève si
 * la forme persistée est invalide / version inconnue).
 */
export async function readLatestStepwiseSnapshot(
  analysisId: string
): Promise<FullAnalysisStepState | null> {
  const row = await prisma.analysisCheckpoint.findFirst({
    where: { analysisId, state: { startsWith: STEPWISE_STATE_PREFIX } },
    // Tie-break par id desc : deux checkpoints peuvent partager la même createdAt
    // (granularité timestamp) → garantit un « dernier » déterministe (audit Codex #3).
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { results: true },
  });
  if (!row || row.results == null) return null;
  return parseStepState(row.results);
}
