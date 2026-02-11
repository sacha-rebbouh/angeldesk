/**
 * Resume script: re-runs only FAILED agents from an existing analysis
 * and patches the results in-place.
 *
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/resume-failed-agents.ts <analysisId>
 */

import { prisma } from "@/lib/prisma";
import { getDealWithRelations, processAgentResult, updateAnalysisProgress } from "@/agents/orchestrator/persistence";
import { getCurrentFacts, formatFactStoreForAgents } from "@/services/fact-store/current-facts";
import { getTier1Agents, getTier2SectorExpert, getTier3Agents } from "@/agents/orchestrator/agent-registry";
import type { AgentResult, EnrichedAgentContext } from "@/agents/types";

async function main() {
  const analysisId = process.argv[2];
  if (!analysisId) {
    console.error("Usage: npx dotenv -e .env.local -- npx tsx scripts/resume-failed-agents.ts <analysisId>");
    process.exit(1);
  }

  console.log(`[Resume] Loading analysis ${analysisId}...`);

  // 1. Load analysis
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      dealId: true,
      status: true,
      type: true,
      mode: true,
      totalAgents: true,
      completedAgents: true,
      totalCost: true,
      results: true,
    },
  });

  if (!analysis) {
    console.error(`Analysis ${analysisId} not found`);
    process.exit(1);
  }

  console.log(`[Resume] Analysis status: ${analysis.status}, completed: ${analysis.completedAgents}/${analysis.totalAgents}`);

  // 2. Load checkpoint to find failed agents
  const checkpoint = await prisma.analysisCheckpoint.findFirst({
    where: { analysisId },
    orderBy: { createdAt: "desc" },
    select: {
      completedAgents: true,
      failedAgents: true,
      results: true,
    },
  });

  if (!checkpoint) {
    console.error("No checkpoint found");
    process.exit(1);
  }

  const checkpointFailedAgents = (checkpoint.failedAgents as Array<{ agent: string; error: string }>) || [];
  const completedAgents = (checkpoint.completedAgents as string[]) || [];
  const existingResults = (analysis.results ?? checkpoint.results ?? {}) as Record<string, AgentResult>;

  // Filter out agents that already succeeded in the analysis results (from a previous resume)
  const failedAgents = checkpointFailedAgents.filter(f => {
    const existing = existingResults[f.agent];
    if (existing && existing.success) {
      console.log(`[Resume] Skipping ${f.agent} — already succeeded in a previous resume`);
      return false;
    }
    return true;
  });

  console.log(`[Resume] Completed: ${completedAgents.length} agents`);
  console.log(`[Resume] Still failed: ${failedAgents.map(f => `${f.agent} (${f.error})`).join(", ")}`);

  if (failedAgents.length === 0) {
    console.log("[Resume] No failed agents to retry");
    process.exit(0);
  }

  // 3. Load deal with documents
  const deal = await getDealWithRelations(analysis.dealId);
  if (!deal) {
    console.error("Deal not found");
    process.exit(1);
  }

  // 4. Build enriched context
  const factStore = await getCurrentFacts(analysis.dealId);
  const factStoreFormatted = formatFactStoreForAgents(factStore);
  console.log(`[Resume] Loaded ${factStore.length} facts from store`);

  // Load founder responses
  const founderResponseFacts = await prisma.factEvent.findMany({
    where: {
      dealId: analysis.dealId,
      source: "FOUNDER_RESPONSE",
      eventType: { notIn: ["DELETED", "SUPERSEDED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const founderResponses = founderResponseFacts.map(fact => ({
    questionId: fact.id,
    question: fact.reason || "Question non specifiee",
    answer: fact.displayValue,
    category: fact.category,
  }));

  const enrichedContext: EnrichedAgentContext = {
    dealId: analysis.dealId,
    deal: deal as unknown as EnrichedAgentContext["deal"],
    documents: deal.documents,
    previousResults: existingResults,
    factStore,
    factStoreFormatted,
    founderResponses: founderResponses.length > 0 ? founderResponses : undefined,
  };

  // 5. Load agent registries
  const tier1AgentMap = await getTier1Agents();
  const tier3AgentMap = await getTier3Agents();

  let totalCostAdded = 0;
  let retriedCount = 0;

  // 6. Set analysis to RUNNING
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "RUNNING" },
  });

  try {
    // 7. Re-run each failed agent
    for (const { agent: agentName } of failedAgents) {
      console.log(`\n[Resume] Retrying ${agentName}...`);

      let result: AgentResult | null = null;

      // Determine agent type and run
      if (agentName in tier1AgentMap) {
        try {
          result = await tier1AgentMap[agentName].run(enrichedContext);
        } catch (error) {
          result = {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      } else if (agentName in tier3AgentMap) {
        try {
          result = await tier3AgentMap[agentName].run(enrichedContext);
        } catch (error) {
          result = {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      } else {
        // Tier 2 sector expert
        const sectorExpert = await getTier2SectorExpert(deal.sector);
        if (sectorExpert && sectorExpert.name === agentName) {
          try {
            result = await sectorExpert.run(enrichedContext);
          } catch (error) {
            result = {
              agentName,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        } else {
          console.log(`[Resume] Unknown agent: ${agentName}, skipping`);
          continue;
        }
      }

      if (result) {
        existingResults[agentName] = result;
        enrichedContext.previousResults![agentName] = result;
        totalCostAdded += result.cost;
        retriedCount++;

        if (result.success) {
          await processAgentResult(analysis.dealId, agentName, result);
          console.log(`[Resume] ✓ ${agentName} succeeded (cost: $${result.cost.toFixed(4)}, time: ${result.executionTimeMs}ms)`);
        } else {
          console.log(`[Resume] ✗ ${agentName} failed again: ${result.error}`);
        }
      }
    }

    // 8. Update analysis with patched results
    const newCompletedCount = Object.values(existingResults).filter(r => r.success).length;

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "COMPLETED",
        results: existingResults as unknown as Record<string, unknown>,
        completedAgents: newCompletedCount,
        totalCost: { increment: totalCostAdded },
        completedAt: new Date(),
      },
    });

    console.log(`\n[Resume] Done! Retried ${retriedCount} agents, added $${totalCostAdded.toFixed(4)}`);
    console.log(`[Resume] Analysis now COMPLETED with ${newCompletedCount}/${analysis.totalAgents} agents`);

  } catch (error) {
    // If anything goes wrong, mark as FAILED again
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED" },
    });
    console.error("[Resume] Error during retry:", error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
