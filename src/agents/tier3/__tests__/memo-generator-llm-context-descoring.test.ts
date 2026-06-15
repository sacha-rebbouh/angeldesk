/**
 * Chantier dé-scorisation P2-c — Le contexte LLM du mémo ne contient AUCUNE
 * note de deal.
 *
 * Vérifie que les extracteurs d'insights injectés dans le prompt mémo
 * (`extractTier1Insights` / `extractTier2Insights` / `extractTier3Insights`)
 * ne ré-injectent plus de note de deal (`Score: X/100`, `Sector Fit Score`,
 * `Score final`, `Grade`, `Scepticisme/100`, `Consistance/100`), même quand
 * les producteurs émettent encore leurs scores (ordre additif, retrait des
 * champs producteurs = P4).
 *
 * Les extracteurs sont `private` ; on les invoque via cast (pattern de test
 * d'invariant d'adapter, cf. memo-generator-transform.test.ts).
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { memoGenerator } from "../memo-generator";
import type { EnrichedAgentContext } from "../../types";

type ExtractFn = (context: EnrichedAgentContext) => string;
const agent = memoGenerator as unknown as {
  extractTier1Insights: ExtractFn;
  extractTier2Insights: ExtractFn;
  extractTier3Insights: ExtractFn;
};
const extractTier1Insights = agent.extractTier1Insights.bind(memoGenerator);
const extractTier2Insights = agent.extractTier2Insights.bind(memoGenerator);
const extractTier3Insights = agent.extractTier3Insights.bind(memoGenerator);

function ctx(previousResults: Record<string, unknown>): EnrichedAgentContext {
  return { previousResults } as unknown as EnrichedAgentContext;
}

function result(agentName: string, data: unknown) {
  return { agentName, success: true, executionTimeMs: 1, cost: 0, data };
}

describe("P2-c — contexte LLM mémo sans note de deal", () => {
  it("extractTier1Insights : producteurs avec overallScore/marketScore → AUCUN 'Score: X/100' (orientation conservée)", () => {
    const out = extractTier1Insights(
      ctx({
        "financial-auditor": result("financial-auditor", {
          overallScore: 72,
          verdict: "contrasted",
          redFlags: [{ severity: "HIGH" }],
          keyFindings: ["Burn élevé"],
        }),
        "market-intelligence": result("market-intelligence", { marketScore: 60, verdict: "favorable" }),
      })
    );
    expect(out).not.toMatch(/Score:\s*\d+\s*\/\s*100/);
    expect(out).not.toMatch(/\/100/);
    expect(out).toContain("Verdict: contrasted");
  });

  it("extractTier2Insights : sectorFitScore → AUCUN 'Sector Fit Score: X/100' (benchmarks observables conservés)", () => {
    const out = extractTier2Insights(
      ctx({
        "saas-expert": result("saas-expert", {
          sectorFitScore: 70,
          verdict: "favorable",
          benchmarks: [{ metric: "ARR growth", dealValue: 120, sectorMedian: 80, percentile: 75 }],
        }),
      })
    );
    expect(out).not.toMatch(/Sector Fit Score/);
    expect(out).not.toMatch(/\/100/);
    expect(out).toContain("ARR growth"); // benchmark observable conservé
  });

  it("extractTier3Insights : overallScore/grade/skepticism/consistency → AUCUN /100, orientation conservée", () => {
    const out = extractTier3Insights(
      ctx({
        "synthesis-deal-scorer": result("synthesis-deal-scorer", {
          overallScore: 72,
          grade: "B",
          verdict: "contrasted",
          investmentRecommendation: { action: "contrasted" },
        }),
        "devils-advocate": result("devils-advocate", { overallSkepticism: 85, topConcerns: ["x"] }),
        "contradiction-detector": result("contradiction-detector", { consistencyScore: 70, contradictions: [] }),
      })
    );
    expect(out).not.toMatch(/\/100/);
    expect(out).not.toMatch(/Score final/);
    expect(out).not.toMatch(/Grade:/);
    expect(out).not.toMatch(/Scepticisme/);
    expect(out).not.toMatch(/Consistance/);
    expect(out).toContain("Verdict: contrasted");
  });
});
