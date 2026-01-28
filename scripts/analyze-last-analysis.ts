/**
 * Script to analyze the cost breakdown of the last analysis
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/analyze-last-analysis.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get the last completed analysis
  const lastAnalysis = await prisma.analysis.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    include: { deal: true },
  });

  if (!lastAnalysis) {
    console.log("No completed analysis found");
    return;
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("ANALYSIS COST BREAKDOWN");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log(`Analysis ID: ${lastAnalysis.id}`);
  console.log(`Deal: ${lastAnalysis.deal.name}`);
  console.log(`Type: ${lastAnalysis.type}`);
  console.log(`Mode: ${lastAnalysis.mode}`);
  console.log(`Started: ${lastAnalysis.startedAt}`);
  console.log(`Completed: ${lastAnalysis.completedAt}`);
  console.log(`Duration: ${lastAnalysis.totalTimeMs ? (lastAnalysis.totalTimeMs / 1000 / 60).toFixed(1) : 'N/A'} minutes`);
  console.log(`Total Cost: $${Number(lastAnalysis.totalCost).toFixed(4)}`);

  // Get all LLM calls for this analysis
  const llmCalls = await prisma.lLMCallLog.findMany({
    where: { analysisId: lastAnalysis.id },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nTotal LLM Calls: ${llmCalls.length}`);

  // Group by agent
  const byAgent: Record<string, {
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    models: Set<string>;
  }> = {};

  const byModel: Record<string, { calls: number; cost: number }> = {};
  let totalErrors = 0;

  for (const call of llmCalls) {
    const agent = call.agentName;
    const model = call.model;

    if (!byAgent[agent]) {
      byAgent[agent] = {
        calls: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs: 0,
        models: new Set(),
      };
    }

    byAgent[agent].calls++;
    byAgent[agent].inputTokens += call.inputTokens;
    byAgent[agent].outputTokens += call.outputTokens;
    byAgent[agent].cost += Number(call.cost);
    byAgent[agent].durationMs += call.durationMs;
    byAgent[agent].models.add(model);

    if (call.isError) {
      byAgent[agent].errors++;
      totalErrors++;
    }

    if (!byModel[model]) {
      byModel[model] = { calls: 0, cost: 0 };
    }
    byModel[model].calls++;
    byModel[model].cost += Number(call.cost);
  }

  // Print by agent
  console.log("\n────────────────────────────────────────────────────────────");
  console.log("BY AGENT:");
  console.log("────────────────────────────────────────────────────────────\n");

  const sortedAgents = Object.entries(byAgent).sort((a, b) => b[1].cost - a[1].cost);

  for (const [agent, stats] of sortedAgents) {
    const models = Array.from(stats.models).join(", ");
    const errorsStr = stats.errors > 0 ? ` ⚠️ ${stats.errors} errors` : "";
    console.log(`${agent}:`);
    console.log(`  Calls: ${stats.calls} | Cost: $${stats.cost.toFixed(4)} | In: ${stats.inputTokens.toLocaleString()} | Out: ${stats.outputTokens.toLocaleString()} | Time: ${(stats.durationMs/1000).toFixed(1)}s${errorsStr}`);
    console.log(`  Models: ${models}`);
    console.log();
  }

  // Print by model
  console.log("────────────────────────────────────────────────────────────");
  console.log("BY MODEL:");
  console.log("────────────────────────────────────────────────────────────\n");

  for (const [model, stats] of Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`${model}: ${stats.calls} calls, $${stats.cost.toFixed(4)}`);
  }

  // Summary
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("SUMMARY:");
  console.log("════════════════════════════════════════════════════════════\n");

  const totalInputTokens = llmCalls.reduce((sum, c) => sum + c.inputTokens, 0);
  const totalOutputTokens = llmCalls.reduce((sum, c) => sum + c.outputTokens, 0);
  const totalCost = llmCalls.reduce((sum, c) => sum + Number(c.cost), 0);

  console.log(`Total Input Tokens: ${totalInputTokens.toLocaleString()}`);
  console.log(`Total Output Tokens: ${totalOutputTokens.toLocaleString()}`);
  console.log(`Total Tokens: ${(totalInputTokens + totalOutputTokens).toLocaleString()}`);
  console.log(`Total Cost from LLM logs: $${totalCost.toFixed(4)}`);
  console.log(`Total Errors/Retries: ${totalErrors}`);
  console.log(`Avg calls per agent: ${(llmCalls.length / Object.keys(byAgent).length).toFixed(1)}`);

  // Find expensive calls
  const expensiveCalls = llmCalls
    .filter(c => Number(c.cost) > 0.10)
    .sort((a, b) => Number(b.cost) - Number(a.cost));

  if (expensiveCalls.length > 0) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("EXPENSIVE CALLS (>$0.10):");
    console.log("────────────────────────────────────────────────────────────\n");

    for (const call of expensiveCalls.slice(0, 10)) {
      console.log(`${call.agentName}: $${Number(call.cost).toFixed(4)} | In: ${call.inputTokens.toLocaleString()} | Out: ${call.outputTokens.toLocaleString()} | Model: ${call.model}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
