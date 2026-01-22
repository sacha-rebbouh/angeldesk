/**
 * Comparison Script: Standard vs ReAct Mode
 *
 * Purpose: Validate that ReAct mode produces equivalent or better outputs
 * before consolidating codebase to ReAct-only.
 *
 * Runs the same agent (market-intelligence) in both modes and compares:
 * - Output quality (scores, findings)
 * - Execution time
 * - Cost
 * - Reproducibility
 */

import { PrismaClient } from "@prisma/client";
import { enrichDeal } from "../src/services/context-engine";
import type { EnrichedAgentContext, MarketIntelResult } from "../src/agents/types";

const prisma = new PrismaClient();
const DEAL_ID = "cmkkraeig0001it8eruol7my2"; // CloudMetrics SAS

interface ComparisonResult {
  mode: "standard" | "react";
  executionTimeMs: number;
  cost: number;
  success: boolean;
  marketScore: number | null;
  findings: number;
  error?: string;
  output?: MarketIntelResult;
}

async function runStandardAgent(context: EnrichedAgentContext): Promise<ComparisonResult> {
  console.log("\n🔵 Running STANDARD mode...");
  const start = Date.now();

  try {
    const { marketIntelligence } = await import("../src/agents/tier1");
    const result = await marketIntelligence.run(context);

    const output = result.data as MarketIntelResult | undefined;

    return {
      mode: "standard",
      executionTimeMs: Date.now() - start,
      cost: result.cost,
      success: result.success,
      marketScore: output?.marketScore ?? null,
      findings: output?.findings?.length ?? 0,
      output,
    };
  } catch (error) {
    return {
      mode: "standard",
      executionTimeMs: Date.now() - start,
      cost: 0,
      success: false,
      marketScore: null,
      findings: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runReActAgent(context: EnrichedAgentContext): Promise<ComparisonResult> {
  console.log("\n🟢 Running REACT mode...");
  const start = Date.now();

  try {
    const { marketIntelligenceReAct } = await import("../src/agents/react");
    const result = await marketIntelligenceReAct.run(context);

    const output = result.data as MarketIntelResult | undefined;

    // Debug: Log the full result for investigation
    if (!result.success) {
      console.log("\n⚠️  ReAct FAILED - Debug info:");
      console.log("   Error:", result.error);
      console.log("   Cost:", result.cost);
      // Check if there's a _react property with reasoning trace
      const reactData = (result as unknown as { _react?: { reasoningTrace?: unknown } })._react;
      if (reactData?.reasoningTrace) {
        console.log("   Steps completed:", (reactData.reasoningTrace as { totalIterations?: number }).totalIterations);
      }
    }

    return {
      mode: "react",
      executionTimeMs: Date.now() - start,
      cost: result.cost,
      success: result.success,
      marketScore: output?.marketScore ?? null,
      findings: output?.findings?.length ?? 0,
      output,
      error: result.error,
    };
  } catch (error) {
    console.log("\n❌ ReAct EXCEPTION:", error);
    return {
      mode: "react",
      executionTimeMs: Date.now() - start,
      cost: 0,
      success: false,
      marketScore: null,
      findings: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function compareOutputs(standard: ComparisonResult, react: ComparisonResult): void {
  console.log("\n" + "=".repeat(70));
  console.log("📊 COMPARISON RESULTS");
  console.log("=".repeat(70));

  // Summary table
  console.log("\n┌─────────────────┬──────────────┬──────────────┬────────────┐");
  console.log("│     Metric      │   Standard   │    ReAct     │   Delta    │");
  console.log("├─────────────────┼──────────────┼──────────────┼────────────┤");

  // Success
  const successDelta = standard.success === react.success ? "=" : (react.success ? "✓" : "✗");
  console.log(`│ Success         │ ${standard.success ? "✅ Yes" : "❌ No "}       │ ${react.success ? "✅ Yes" : "❌ No "}       │     ${successDelta}      │`);

  // Time
  const timeDelta = react.executionTimeMs - standard.executionTimeMs;
  const timeSign = timeDelta > 0 ? "+" : "";
  console.log(`│ Execution Time  │ ${formatDuration(standard.executionTimeMs).padEnd(12)} │ ${formatDuration(react.executionTimeMs).padEnd(12)} │ ${(timeSign + formatDuration(timeDelta)).padStart(10)} │`);

  // Cost
  const costDelta = react.cost - standard.cost;
  const costSign = costDelta > 0 ? "+" : "";
  console.log(`│ Cost            │ $${standard.cost.toFixed(4).padEnd(10)} │ $${react.cost.toFixed(4).padEnd(10)} │ ${(costSign + "$" + costDelta.toFixed(4)).padStart(10)} │`);

  // Market Score
  const scoreDelta = (react.marketScore ?? 0) - (standard.marketScore ?? 0);
  const scoreSign = scoreDelta > 0 ? "+" : "";
  console.log(`│ Market Score    │ ${(standard.marketScore?.toString() ?? "N/A").padEnd(12)} │ ${(react.marketScore?.toString() ?? "N/A").padEnd(12)} │ ${(scoreSign + scoreDelta.toString()).padStart(10)} │`);

  // Findings
  const findingsDelta = react.findings - standard.findings;
  const findingsSign = findingsDelta > 0 ? "+" : "";
  console.log(`│ Findings Count  │ ${standard.findings.toString().padEnd(12)} │ ${react.findings.toString().padEnd(12)} │ ${(findingsSign + findingsDelta.toString()).padStart(10)} │`);

  console.log("└─────────────────┴──────────────┴──────────────┴────────────┘");

  // Analysis
  console.log("\n📝 ANALYSIS");
  console.log("-".repeat(70));

  // Time analysis
  const timeRatio = react.executionTimeMs / standard.executionTimeMs;
  if (timeRatio > 1.5) {
    console.log(`⏱️  ReAct is ${timeRatio.toFixed(1)}x SLOWER (expected for reasoning chains)`);
  } else if (timeRatio < 0.8) {
    console.log(`⏱️  ReAct is ${(1/timeRatio).toFixed(1)}x FASTER (unexpected!)`);
  } else {
    console.log(`⏱️  Execution times are comparable (${timeRatio.toFixed(1)}x ratio)`);
  }

  // Cost analysis
  const costRatio = react.cost / (standard.cost || 0.0001);
  if (costRatio > 1.5) {
    console.log(`💰 ReAct costs ${costRatio.toFixed(1)}x MORE (expected for multi-step reasoning)`);
  } else if (costRatio < 0.8) {
    console.log(`💰 ReAct costs ${(1/costRatio).toFixed(1)}x LESS (unexpected!)`);
  } else {
    console.log(`💰 Costs are comparable (${costRatio.toFixed(1)}x ratio)`);
  }

  // Quality analysis
  const scoreDiff = Math.abs((react.marketScore ?? 0) - (standard.marketScore ?? 0));
  if (scoreDiff <= 5) {
    console.log(`📈 Market scores are CONSISTENT (${scoreDiff} points difference)`);
  } else if (scoreDiff <= 10) {
    console.log(`📈 Market scores have MINOR variance (${scoreDiff} points difference)`);
  } else {
    console.log(`⚠️  Market scores have SIGNIFICANT variance (${scoreDiff} points difference)`);
  }

  // Recommendation
  console.log("\n💡 RECOMMENDATION");
  console.log("-".repeat(70));

  if (!standard.success && react.success) {
    console.log("✅ ReAct succeeded where Standard failed → Keep ReAct");
  } else if (standard.success && !react.success) {
    console.log("❌ Standard succeeded where ReAct failed → Investigate ReAct issues");
  } else if (scoreDiff <= 10 && react.findings >= standard.findings) {
    console.log("✅ ReAct produces equivalent or better output → Safe to consolidate to ReAct-only");
  } else {
    console.log("⚠️  Outputs differ significantly → Run more tests before consolidating");
  }

  // Detailed output comparison
  if (standard.output && react.output) {
    console.log("\n📋 DETAILED OUTPUT COMPARISON");
    console.log("-".repeat(70));

    // Market size validation
    console.log("\n[Market Size Validation]");
    const stdMsv = standard.output.marketSizeValidation;
    const reactMsv = react.output.marketSizeValidation;

    if (stdMsv && reactMsv) {
      console.log(`  TAM - Standard: ${stdMsv.claimedTAM ?? "N/A"} | ReAct: ${reactMsv.claimedTAM ?? "N/A"}`);
      console.log(`  Discrepancy - Standard: ${stdMsv.discrepancy ?? "N/A"} | ReAct: ${reactMsv.discrepancy ?? "N/A"}`);
    }

    // Timing analysis
    console.log("\n[Timing Analysis]");
    const stdTa = standard.output.timingAnalysis;
    const reactTa = react.output.timingAnalysis;

    if (stdTa && reactTa) {
      console.log(`  Maturity - Standard: ${stdTa.marketMaturity ?? "N/A"} | ReAct: ${reactTa.marketMaturity ?? "N/A"}`);
      console.log(`  Timing - Standard: ${stdTa.timing ?? "N/A"} | ReAct: ${reactTa.timing ?? "N/A"}`);
    }
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("🔬 STANDARD vs REACT MODE COMPARISON TEST");
  console.log("=".repeat(70));
  console.log(`Deal ID: ${DEAL_ID}`);
  console.log(`Agent: market-intelligence`);

  // Load deal
  const deal = await prisma.deal.findUnique({
    where: { id: DEAL_ID },
    include: { documents: true },
  });

  if (!deal) {
    console.error("❌ Deal not found!");
    process.exit(1);
  }

  console.log(`Company: ${deal.companyName ?? "Unknown"}`);
  console.log(`Sector: ${deal.sector ?? "Unknown"}`);

  // Enrich context
  console.log("\n📥 Enriching context with Context Engine...");
  const contextEngineData = await enrichDeal(deal);

  const context: EnrichedAgentContext = {
    dealId: DEAL_ID,
    deal,
    documents: deal.documents.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      extractedText: d.extractedText,
    })),
    previousResults: {},
    contextEngine: contextEngineData,
  };

  // Run both modes
  const standardResult = await runStandardAgent(context);
  const reactResult = await runReActAgent(context);

  // Compare
  compareOutputs(standardResult, reactResult);

  // Cleanup
  await prisma.$disconnect();

  console.log("\n" + "=".repeat(70));
  console.log("TEST COMPLETED");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
