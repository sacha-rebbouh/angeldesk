/**
 * StepRunner — abstraction au-dessus de `step.run` Inngest (D.5c).
 *
 * Le driver stepwise (D.5d) appelle `stepRunner.run('unit', fn)` par unité durable.
 * Trois implémentations :
 *   - `InlineStepRunner`   : exécute `fn` immédiatement, AUCUNE durabilité. Sémantique
 *                            single-pass = chemin OFF / référence du golden harness.
 *   - `InngestStepRunner`  : délègue au vrai `step.run` Inngest (mémoïsation durable).
 *   - `FakeStepRunner`     : simule Inngest pour le golden harness — mémoïse les résultats
 *                            de step EN JSON (round-trip = la frontière « wire » durable),
 *                            permet de tuer un run après K nouveaux steps (timeout 300s) et
 *                            de le RESUME (re-déroulé du haut, steps complétés mémoïsés).
 *
 * INVARIANT clé que le harness vérifie : un résultat de step DOIT être JSON-sérialisable
 * sans perte (les StepState le sont par construction, cf. assertSerializableStepState).
 * Le FakeStepRunner round-trip à CHAQUE run (pas seulement au replay comme Inngest) pour
 * détecter immédiatement tout résultat non-wire-safe (ex. Date résiduelle) — plus strict
 * qu'Inngest, volontairement.
 */

export interface StepRunner {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/** Single-pass : exécute fn immédiatement. Référence du golden harness (= comportement OFF). */
export class InlineStepRunner implements StepRunner {
  run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/** Réel : délègue au step Inngest (signature structurelle pour éviter d'importer les types Inngest). */
export class InngestStepRunner implements StepRunner {
  constructor(private readonly step: { run<T>(id: string, fn: () => Promise<T>): Promise<T> }) {}
  run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.step.run(id, fn);
  }
}

/** Erreur de « kill » simulée (timeout plateforme) — interceptée par runStepwiseUntilDone. */
export class FakeStepKill extends Error {
  constructor(public readonly stepId: string) {
    super(`[FakeStepRunner] killed before step '${stepId}'`);
    this.name = "FakeStepKill";
  }
}

/**
 * Simule Inngest pour le golden harness. Mémoïse en JSON (round-trip = frontière wire),
 * tue après `killAfterNewSteps` NOUVEAUX steps d'une passe, et retient le memo entre passes
 * (resume). `startPass(killAfter)` arme la passe suivante.
 */
export class FakeStepRunner implements StepRunner {
  private readonly memo = new Map<string, string>();
  private newStepsThisPass = 0;
  private killAfter: number | null = null;
  /** Ordre des steps RÉELLEMENT exécutés (hors mémoïsés), toutes passes confondues. */
  readonly executedIds: string[] = [];
  /** Nombre de fois où un step a été servi depuis le memo (replay). */
  memoHits = 0;

  /** Arme la passe : null = pas de kill ; n = throw avant le (n+1)-ème nouveau step. */
  startPass(killAfterNewSteps: number | null = null): void {
    this.newStepsThisPass = 0;
    this.killAfter = killAfterNewSteps;
  }

  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.memo.get(id);
    if (cached !== undefined) {
      this.memoHits++;
      return JSON.parse(cached) as T; // replay : forme wire mémoïsée
    }
    if (this.killAfter !== null && this.newStepsThisPass >= this.killAfter) {
      throw new FakeStepKill(id);
    }
    const result = await fn();
    this.newStepsThisPass++;
    this.executedIds.push(id);
    const json = JSON.stringify(result ?? null);
    this.memo.set(id, json);
    return JSON.parse(json) as T; // round-trip dès la 1re exécution (strict)
  }

  /** Pour le négatif-control : oublie un step mémoïsé (simule une perte de durabilité). */
  forgetStep(id: string): void {
    this.memo.delete(id);
  }
}

/**
 * Driver de resume : ré-exécute `pipeline` jusqu'à complétion. À chaque passe, arme le
 * runner avec `killSchedule[pass]` (null = pas de kill). Un FakeStepKill relance une passe
 * (resume) ; toute autre erreur remonte. Renvoie le résultat + le nombre de passes.
 */
export async function runStepwiseUntilDone<T>(
  pipeline: (runner: StepRunner) => Promise<T>,
  runner: FakeStepRunner,
  killSchedule: Array<number | null> = [],
): Promise<{ result: T; passes: number }> {
  const MAX_PASSES = 50; // garde-fou anti-boucle (le harness a des fixtures bornées)
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    runner.startPass(killSchedule[pass] ?? null);
    try {
      const result = await pipeline(runner);
      return { result, passes: pass + 1 };
    } catch (err) {
      if (err instanceof FakeStepKill && pass < killSchedule.length) {
        continue; // resume à la passe suivante
      }
      throw err;
    }
  }
  throw new Error(`[runStepwiseUntilDone] non terminé après ${MAX_PASSES} passes`);
}
