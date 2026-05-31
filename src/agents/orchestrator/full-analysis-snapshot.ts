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
 * Persiste un StepState comme nouveau checkpoint `STEPWISE:<unit>`.
 * Valide la sérialisabilité STRICTE avant écriture (lève si non JSON-pur).
 * Retourne l'id du checkpoint créé.
 */
export async function writeStepwiseSnapshot(
  state: FullAnalysisStepState
): Promise<string> {
  assertSerializableStepState(state);
  const saved = await prisma.analysisCheckpoint.create({
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
  return saved.id;
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
    orderBy: { createdAt: "desc" },
    select: { results: true },
  });
  if (!row || row.results == null) return null;
  return parseStepState(row.results);
}
