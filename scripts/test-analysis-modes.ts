/**
 * Test script for new analysis features:
 * - Cost monitoring
 * - Analysis modes (full/lite/express)
 * - Fail-fast on critical warnings
 * - Circuit breaker
 */

import { orchestrator } from "../src/agents/orchestrator";
import { costMonitor } from "../src/services/cost-monitor";
import { getCircuitBreaker } from "../src/services/openrouter/circuit-breaker";

const DEAL_ID = "cmkkraeig0001it8eruol7my2"; // CloudMetrics - Test E2E

async function testAnalysisModes() {
  console.log("=".repeat(60));
  console.log("TESTING NEW ANALYSIS FEATURES");
  console.log("=".repeat(60));

  // 1. Test cost estimation
  console.log("\n📊 1. COST ESTIMATION");
  console.log("-".repeat(40));

  const estimates = {
    tier1_standard: costMonitor.estimateCost("tier1_complete", false),
    tier1_react: costMonitor.estimateCost("tier1_complete", true),
    full_standard: costMonitor.estimateCost("full_analysis", false),
    full_react: costMonitor.estimateCost("full_analysis", true),
  };

  console.log("Estimated costs:");
  for (const [type, est] of Object.entries(estimates)) {
    console.log(`  ${type}: $${est.min.toFixed(2)} - $${est.max.toFixed(2)} (avg: $${est.avg.toFixed(2)})`);
  }

  // 2. Test circuit breaker status
  console.log("\n🔌 2. CIRCUIT BREAKER STATUS");
  console.log("-".repeat(40));

  const cb = getCircuitBreaker();
  const cbStats = cb.getStats();
  console.log(`State: ${cbStats.state}`);
  console.log(`Total requests: ${cbStats.totalRequests}`);
  console.log(`Total failures: ${cbStats.totalFailures}`);
  console.log(`Can execute: ${cb.canExecute()}`);

  // 3. Run EXPRESS mode analysis (fastest, cheapest)
  console.log("\n🚀 3. EXPRESS MODE ANALYSIS");
  console.log("-".repeat(40));
  console.log("Running express analysis (Tier 1 only, no synthesis)...\n");

  const startExpress = Date.now();

  try {
    const expressResult = await orchestrator.runAnalysis({
      dealId: DEAL_ID,
      type: "full_analysis",
      mode: "express",
      useReAct: false, // Standard mode for speed
      forceRefresh: true,
      onProgress: (p) => {
        console.log(`  [${p.completedAgents}/${p.totalAgents}] ${p.currentAgent}${p.estimatedCostSoFar ? ` ($${p.estimatedCostSoFar.toFixed(4)})` : ""}`);
      },
      onEarlyWarning: (w) => {
        console.log(`  ⚠️ EARLY WARNING [${w.severity}]: ${w.title}`);
      },
    });

    const expressTime = Date.now() - startExpress;

    console.log(`\n✅ Express analysis completed in ${(expressTime / 1000).toFixed(1)}s`);
    console.log(`   Cost: $${expressResult.totalCost.toFixed(4)}`);
    console.log(`   Agents: ${Object.keys(expressResult.results).length}`);
    console.log(`   Has critical warnings: ${expressResult.hasCriticalWarnings ?? false}`);

    if (expressResult.earlyWarnings?.length) {
      console.log(`   Early warnings: ${expressResult.earlyWarnings.length}`);
      for (const w of expressResult.earlyWarnings.slice(0, 3)) {
        console.log(`     - [${w.severity}] ${w.title}`);
      }
    }
  } catch (error) {
    console.error(`❌ Express analysis failed: ${error}`);
  }

  // 4. Run LITE mode analysis
  console.log("\n⚡ 4. LITE MODE ANALYSIS");
  console.log("-".repeat(40));
  console.log("Running lite analysis (no debates/reflexion)...\n");

  const startLite = Date.now();

  try {
    const liteResult = await orchestrator.runAnalysis({
      dealId: DEAL_ID,
      type: "full_analysis",
      mode: "lite",
      useReAct: false,
      forceRefresh: true,
      maxCostUsd: 1.0, // Cost limit
      onProgress: (p) => {
        console.log(`  [${p.completedAgents}/${p.totalAgents}] ${p.currentAgent}`);
      },
    });

    const liteTime = Date.now() - startLite;

    console.log(`\n✅ Lite analysis completed in ${(liteTime / 1000).toFixed(1)}s`);
    console.log(`   Cost: $${liteResult.totalCost.toFixed(4)}`);
    console.log(`   Agents: ${Object.keys(liteResult.results).length}`);

  } catch (error) {
    console.error(`❌ Lite analysis failed: ${error}`);
  }

  // 5. Get cost report
  console.log("\n💰 5. COST MONITORING STATS");
  console.log("-".repeat(40));

  try {
    const dealCosts = await costMonitor.getDealCostSummary(DEAL_ID);
    if (dealCosts) {
      console.log(`Deal: ${dealCosts.dealName}`);
      console.log(`Total analyses: ${dealCosts.totalAnalyses}`);
      console.log(`Total cost: $${dealCosts.totalCost.toFixed(4)}`);
      console.log(`Avg cost/analysis: $${dealCosts.avgCostPerAnalysis.toFixed(4)}`);
    }

    const globalStats = await costMonitor.getGlobalStats(7); // Last 7 days
    console.log(`\nGlobal stats (7 days):`);
    console.log(`  Total analyses: ${globalStats.totalAnalyses}`);
    console.log(`  Total cost: $${globalStats.totalCost.toFixed(4)}`);
    console.log(`  Avg cost/analysis: $${globalStats.avgCostPerAnalysis.toFixed(4)}`);

    if (Object.keys(globalStats.costByType).length > 0) {
      console.log(`  By type:`);
      for (const [type, data] of Object.entries(globalStats.costByType)) {
        console.log(`    ${type}: ${data.count} analyses, $${data.totalCost.toFixed(4)} total`);
      }
    }
  } catch (error) {
    console.error(`Cost stats error: ${error}`);
  }

  // 6. Final circuit breaker status
  console.log("\n🔌 6. FINAL CIRCUIT BREAKER STATUS");
  console.log("-".repeat(40));

  const finalCbStats = cb.getStats();
  console.log(`State: ${finalCbStats.state}`);
  console.log(`Total requests: ${finalCbStats.totalRequests}`);
  console.log(`Total successes: ${finalCbStats.totalSuccesses}`);
  console.log(`Total failures: ${finalCbStats.totalFailures}`);

  console.log("\n" + "=".repeat(60));
  console.log("TEST COMPLETED");
  console.log("=".repeat(60));
}

// Run the test
testAnalysisModes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
