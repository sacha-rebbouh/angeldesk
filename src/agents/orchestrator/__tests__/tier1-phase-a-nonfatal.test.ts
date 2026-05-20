import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("Tier 1 Phase A required output", () => {
  it("aborts the full analysis when deck-forensics fails", () => {
    const source = readFileSync("src/agents/orchestrator/index.ts", "utf8");

    expect(source).toContain("Critical Tier 1 phase failed");
    expect(source).toContain("ABORTING remaining phases: critical agent(s) failed in");
    expect(source).not.toContain("Phase A agent(s) failed (non-fatal, continuing in degraded mode)");
  });

  it("retries checkpoint-failed Tier 1 agents on resume instead of silently skipping them", () => {
    const source = readFileSync("src/agents/orchestrator/index.ts", "utf8");
    const start = source.indexOf('if (currentState === "ANALYZING" || currentState === "GATHERING")');
    const end = source.indexOf("const canResumeSynthesis", start);
    const tier1ResumeSource = source.slice(start, end);

    expect(tier1ResumeSource).toContain("Previously failed agents are retried");
    expect(tier1ResumeSource).toContain("(name) => !completedSet.has(name)");
    expect(tier1ResumeSource).not.toContain("Skipped on resume after prior failure");
    expect(tier1ResumeSource).not.toContain("!completedSet.has(name) && !failedSet.has(name)");
  });
});
