/**
 * Driver stepwise durable de full_analysis (D.5d-1c — « 1 step englobante d'abord »,
 * Modèle B). Module à DÉPENDANCES INJECTÉES (aucun import Prisma/orchestrateur lourd) →
 * testable en isolation (golden driver, helpers stubés).
 *
 * MODÈLE B : sur run sain, le corps pipeline tourne dans une unique unité durable via
 * `stepRunner.run('run-analysis', …)`, mute l'état vivant, et on retourne le `liveResult`
 * EXACT (bodyRan=true). Donc :
 *   - OFF (InlineStepRunner : run = fn() inline) → bodyRan toujours true → BYTE-INERT,
 *     l'enveloppe wire n'est jamais lue (ni même calculée hors stepwise).
 *   - E1 (single-pass Inline vs Fake) trivial : les deux retournent liveResult.
 * Au REPLAY (step mémoïsé : Inngest/Fake re-déroule la fonction du haut, `run` rend la
 * valeur JSON mémoïsée sans ré-exécuter `fn`), bodyRan reste false → on reconstruit
 * l'AnalysisResult depuis l'enveloppe wire (earlyWarnings ravivés) + `results` relu de la
 * persistance (completeAnalysis a déjà écrit allResults ; le cap 4 MB de sortie de step
 * interdit de mémoïser allResults — gate Codex).
 */

import type { AnalysisResult } from "./types";
import type { StepRunner } from "./step-runner";
import { buildTerminalEnvelope, reviveTerminalEnvelope } from "./full-analysis-step-state-bridge";

export interface TerminalStepwiseDriverParams {
  /** Runner d'unité : InlineStepRunner (OFF/single-pass) ou InngestStepRunner/FakeStepRunner. */
  stepRunner: StepRunner;
  /** Mode stepwise : si false, l'enveloppe wire n'est pas construite (chemin OFF byte-inert). */
  stepwise: boolean;
  /** Corps pipeline durable (runFullAnalysisPipeline en prod ; stub déterministe en test). */
  pipeline: () => Promise<AnalysisResult>;
  /** Relit allResults déjà persistés (loadResults en prod ; stub en test). Replay uniquement. */
  loadPersistedResults: () => Promise<AnalysisResult["results"] | null>;
}

/**
 * Exécute le corps pipeline dans l'unique step durable et retourne l'AnalysisResult.
 * Sur run sain (bodyRan=true) → liveResult exact. Au replay (bodyRan=false) → reconstruction
 * depuis l'enveloppe wire mémoïsée + results relus.
 */
export async function runTerminalStepwiseDriver(
  params: TerminalStepwiseDriverParams
): Promise<AnalysisResult> {
  const { stepRunner, stepwise, pipeline, loadPersistedResults } = params;

  let bodyRan = false;
  let liveResult: AnalysisResult | undefined;

  const envelope = await stepRunner.run("run-analysis", async () => {
    bodyRan = true;
    liveResult = await pipeline();
    // OFF (non stepwise) → null : jamais lu (bodyRan=true sur ce chemin). ON → enveloppe wire.
    return stepwise ? buildTerminalEnvelope(liveResult) : null;
  });

  // Run sain : le corps a tourné dans CETTE invocation → liveResult exact (Dates intactes).
  if (bodyRan) return liveResult as AnalysisResult;

  // Replay : step mémoïsé, corps NON ré-exécuté. Reconstruction depuis l'enveloppe durable.
  if (!envelope) {
    throw new Error("[stepwise-driver] replay sans enveloppe durable (état incohérent)");
  }
  const revived = reviveTerminalEnvelope(envelope);
  const persisted = await loadPersistedResults();
  return { ...revived, results: persisted ?? {} } as unknown as AnalysisResult;
}
