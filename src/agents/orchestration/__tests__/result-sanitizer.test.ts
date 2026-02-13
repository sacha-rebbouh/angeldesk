import { describe, it, expect } from "vitest";
import { sanitizeResultForDownstream, sanitizePreviousResults } from "../result-sanitizer";
import type { AgentResult } from "../../types";

function makeResult(agentName: string, data: unknown): AgentResult {
  return {
    agentName,
    success: true,
    executionTimeMs: 1000,
    cost: 0,
    data,
  } as unknown as AgentResult;
}

function getData(result: unknown): Record<string, unknown> {
  return (result as { data: Record<string, unknown> }).data;
}

describe("sanitizeResultForDownstream", () => {
  it("strips evaluative keys (score, verdict, redFlags)", () => {
    const result = makeResult("financial-auditor", {
      score: { value: 75, breakdown: [] },
      verdict: "INVEST",
      redFlags: [{ title: "High burn" }],
      findings: { arr: 500_000, mrr: 41_667 },
    });

    const sanitized = sanitizeResultForDownstream(result);
    const data = getData(sanitized);

    expect(data.score).toBeUndefined();
    expect(data.verdict).toBeUndefined();
    expect(data.redFlags).toBeUndefined();
    expect(data.findings).toBeDefined();
  });

  it("keeps raw factual data (findings, metrics)", () => {
    const result = makeResult("market-intelligence", {
      findings: { tam: 5_000_000_000, sam: 500_000_000 },
      recommendation: "INVEST",
      warnings: ["Market is hot"],
    });

    const sanitized = sanitizeResultForDownstream(result);
    const data = getData(sanitized);

    expect(data.findings).toBeDefined();
    expect(data.recommendation).toBeUndefined();
    expect(data.warnings).toBeUndefined();
  });

  it("passes through extractors unchanged (document-extractor)", () => {
    const result = makeResult("document-extractor", {
      score: { value: 80 },
      extractedText: "Full text...",
    });

    const sanitized = sanitizeResultForDownstream(result);
    const data = getData(sanitized);
    expect(data.score).toBeDefined();
    expect(data.extractedText).toBeDefined();
  });

  it("passes through fact-extractor unchanged", () => {
    const result = makeResult("fact-extractor", {
      verdict: "Done",
      facts: [{ key: "arr", value: 500_000 }],
    });

    const sanitized = sanitizeResultForDownstream(result);
    const data = getData(sanitized);
    expect(data.verdict).toBeDefined();
    expect(data.facts).toBeDefined();
  });

  it("skips sanitization when skipSanitization is true (for Tier 3)", () => {
    const result = makeResult("financial-auditor", {
      score: { value: 75 },
      verdict: "INVEST",
    });

    const sanitized = sanitizeResultForDownstream(result, { skipSanitization: true });
    const data = getData(sanitized);
    expect(data.score).toBeDefined();
    expect(data.verdict).toBeDefined();
  });

  it("handles failed results gracefully", () => {
    const result = {
      agentName: "test",
      success: false,
      executionTimeMs: 500,
      cost: 0,
      error: "timeout",
    } as unknown as AgentResult;

    const sanitized = sanitizeResultForDownstream(result);
    expect(sanitized.success).toBe(false);
  });
});

describe("sanitizePreviousResults", () => {
  it("sanitizes all results in the map", () => {
    const results: Record<string, AgentResult> = {
      "financial-auditor": makeResult("financial-auditor", { score: 75, findings: { arr: 500_000 } }),
      "team-investigator": makeResult("team-investigator", { verdict: "STRONG", findings: { teamSize: 5 } }),
    };

    const sanitized = sanitizePreviousResults(results);
    const finData = getData(sanitized["financial-auditor"]);
    const teamData = getData(sanitized["team-investigator"]);

    expect(finData.score).toBeUndefined();
    expect(finData.findings).toBeDefined();
    expect(teamData.verdict).toBeUndefined();
    expect(teamData.findings).toBeDefined();
  });
});
