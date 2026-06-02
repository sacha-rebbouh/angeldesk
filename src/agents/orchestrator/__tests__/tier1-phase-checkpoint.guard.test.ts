import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const orchestratorSource = readFileSync(
  "src/agents/orchestrator/index.ts",
  "utf8"
);

describe("Tier 1 phase checkpointing guard", () => {
  it("flushes a checkpoint immediately after Tier 1 phase progress is persisted", () => {
    // d-3 — la finalisation d'une phase Tier 1 (progress + flush + log + fail-checks)
    // vit désormais dans `runTier1PhaseFinalize` (extrait byte-inert de
    // `runTier1Phase`). On borne la recherche au body de ce helper pour prouver
    // l'invariant exactement là où il s'exécute, sans fragilité.
    const finalizeStart = orchestratorSource.indexOf(
      "private async runTier1PhaseFinalize("
    );
    expect(finalizeStart).toBeGreaterThanOrEqual(0);
    // borne haute = la méthode suivante (runTier1Phases) — le body de
    // runTier1PhaseFinalize est strictement entre les deux.
    const phaseRunnerStart = orchestratorSource.indexOf(
      "private async runTier1Phases(params: {",
      finalizeStart
    );
    expect(phaseRunnerStart).toBeGreaterThan(finalizeStart);

    const finalizeBody = orchestratorSource.slice(finalizeStart, phaseRunnerStart);

    // 1) updateAnalysisProgress(...) existe dans runTier1PhaseFinalize.
    const progressCall = finalizeBody.indexOf(
      "await updateAnalysisProgress(analysisId, completedCount, initialTotalCost + totalCost);"
    );
    expect(progressCall).toBeGreaterThanOrEqual(0);

    // 2) le flush arrive juste après la persistance de progression.
    const flushCall = finalizeBody.indexOf(
      "await stateMachine?.flushCheckpoint();",
      progressCall
    );
    expect(flushCall).toBeGreaterThan(progressCall);

    // 3) le log de complétion de phase reste après le flush.
    const phaseCompletionLog = finalizeBody.indexOf(
      "[Orchestrator] ${phase.name} complete",
      progressCall
    );
    expect(phaseCompletionLog).toBeGreaterThan(flushCall);
  });

  it("keeps flushCheckpoint on the state machine API", () => {
    const stateMachineSource = readFileSync(
      "src/agents/orchestration/state-machine.ts",
      "utf8"
    );

    expect(stateMachineSource).toContain("async flushCheckpoint(): Promise<void>");
    expect(stateMachineSource).toContain("await this.createCheckpoint(true);");
  });
});
