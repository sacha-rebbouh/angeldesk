import { describe, expect, it } from "vitest";

import { runTier1CrossValidation } from "../tier1-cross-validation";
import type { AgentResult } from "../../types";

function makeResult(agentName: string, score: number): AgentResult {
  return {
    agentName,
    success: true,
    executionTimeMs: 10,
    cost: 0,
    data: {
      meta: { limitations: [] },
      score: { value: score, grade: "A", breakdown: [{ criterion: "Signal", weight: 1, score, justification: "fixture" }] },
      findings: {},
      redFlags: [],
      questions: [],
      alertSignal: { level: "none" },
      narrative: { summary: "fixture" },
    },
  } as AgentResult & { data: Record<string, unknown> };
}

describe("runTier1CrossValidation", () => {
  it("caps strongly optimistic Tier 1 scores when another agent is materially negative", () => {
    const result = runTier1CrossValidation({
      "financial-auditor": makeResult("financial-auditor", 88),
      "gtm-analyst": makeResult("gtm-analyst", 35),
      "team-investigator": makeResult("team-investigator", 66),
      "market-intelligence": makeResult("market-intelligence", 64),
      "competitive-intel": makeResult("competitive-intel", 61),
    });

    expect(result.validations.some((validation) => validation.verdict === "CONTRADICTION")).toBe(true);
    expect(result.adjustments).toContainEqual(
      expect.objectContaining({
        agentName: "financial-auditor",
        field: "score.value",
        before: 88,
        after: 60,
      })
    );
  });
});
