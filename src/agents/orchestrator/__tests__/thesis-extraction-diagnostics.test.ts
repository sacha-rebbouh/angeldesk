import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync("src/agents/orchestrator/index.ts", "utf8");

describe("Codex prod incident thesis extraction diagnostics", () => {
  it("records a thesis-extractor failure result when the extractor throws before returning", () => {
    expect(SOURCE).toContain('allResults["thesis-extractor"] = thesisResultForDiagnostics');
    expect(SOURCE).toContain('agentName: "thesis-extractor"');
    expect(SOURCE).toContain("executionTimeMs: Date.now() - startTime");
  });

  it("marks post-processing failures as failed while preserving the extractor result payload", () => {
    expect(SOURCE).toContain("...thesisResultForDiagnostics");
    expect(SOURCE).toContain("success: false");
    expect(SOURCE).toContain("Post-processing failed:");
  });
});
