import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const orchestratorSource = readFileSync(
  "src/agents/orchestrator/index.ts",
  "utf8"
);

describe("Tier 1 phase checkpointing guard", () => {
  it("flushes a checkpoint immediately after Tier 1 phase progress is persisted", () => {
    const phaseRunnerStart = orchestratorSource.indexOf("private async runTier1Phases");
    expect(phaseRunnerStart).toBeGreaterThanOrEqual(0);

    const progressCall = orchestratorSource.indexOf(
      "await updateAnalysisProgress(analysisId, completedCount, params.initialTotalCost + totalCost);",
      phaseRunnerStart
    );
    expect(progressCall).toBeGreaterThan(phaseRunnerStart);

    const flushCall = orchestratorSource.indexOf(
      "await stateMachine?.flushCheckpoint();",
      progressCall
    );
    expect(flushCall).toBeGreaterThan(progressCall);

    const phaseCompletionLog = orchestratorSource.indexOf(
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
