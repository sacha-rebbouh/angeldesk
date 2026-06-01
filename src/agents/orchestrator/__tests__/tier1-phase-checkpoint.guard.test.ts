import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const orchestratorSource = readFileSync(
  "src/agents/orchestrator/index.ts",
  "utf8"
);

describe("Tier 1 phase checkpointing guard", () => {
  it("flushes a checkpoint immediately after Tier 1 phase progress is persisted", () => {
    // C.3a — le corps d'une phase Tier 1 vit désormais dans `runTier1Phase`
    // (extrait de `runTier1Phases`). On borne la recherche au body de ce helper
    // pour prouver l'invariant exactement là où il s'exécute, sans fragilité.
    const phaseStart = orchestratorSource.indexOf("private async runTier1Phase(");
    expect(phaseStart).toBeGreaterThanOrEqual(0);
    // borne haute = la méthode suivante (runTier1Phases) — le body de runTier1Phase
    // est strictement entre les deux.
    const phaseRunnerStart = orchestratorSource.indexOf(
      "private async runTier1Phases(params: {",
      phaseStart
    );
    expect(phaseRunnerStart).toBeGreaterThan(phaseStart);

    const phaseBody = orchestratorSource.slice(phaseStart, phaseRunnerStart);

    // 1) updateAnalysisProgress(...) existe dans runTier1Phase.
    const progressCall = phaseBody.indexOf(
      "await updateAnalysisProgress(analysisId, completedCount, initialTotalCost + totalCost);"
    );
    expect(progressCall).toBeGreaterThanOrEqual(0);

    // 2) le flush arrive juste après la persistance de progression.
    const flushCall = phaseBody.indexOf(
      "await stateMachine?.flushCheckpoint();",
      progressCall
    );
    expect(flushCall).toBeGreaterThan(progressCall);

    // 3) le log de complétion de phase reste après le flush.
    const phaseCompletionLog = phaseBody.indexOf(
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
