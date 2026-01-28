import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get the failed analyses for Antiopea Seed
  const analyses = await prisma.analysis.findMany({
    where: {
      status: "FAILED",
      deal: { name: "Antiopea Seed" }
    },
    orderBy: { startedAt: "desc" },
    take: 4
  });

  for (const a of analyses) {
    console.log("\n════════════════════════════════════");
    console.log("Analysis:", a.id);
    console.log("Cost: $" + Number(a.totalCost).toFixed(4));
    console.log("Started:", a.startedAt);
    console.log("Summary:", (a.summary || "N/A").slice(0, 300));

    // Get LLM calls
    const calls = await prisma.lLMCallLog.findMany({
      where: { analysisId: a.id }
    });
    console.log("\nLLM Calls:", calls.length);

    if (calls.length > 0) {
      const errors = calls.filter(c => c.isError);
      console.log("Errors:", errors.length);

      // Group by agent
      const byAgent: Record<string, { calls: number; cost: number; errors: number }> = {};
      for (const c of calls) {
        if (!byAgent[c.agentName]) {
          byAgent[c.agentName] = { calls: 0, cost: 0, errors: 0 };
        }
        byAgent[c.agentName].calls++;
        byAgent[c.agentName].cost += Number(c.cost);
        if (c.isError) byAgent[c.agentName].errors++;
      }

      console.log("\nBy agent:");
      const sorted = Object.entries(byAgent).sort((a, b) => b[1].cost - a[1].cost);
      for (const [agent, stats] of sorted) {
        const errStr = stats.errors > 0 ? ` (${stats.errors} errors)` : "";
        console.log(`  ${agent}: ${stats.calls} calls, $${stats.cost.toFixed(4)}${errStr}`);
      }

      // Show error messages if any
      if (errors.length > 0) {
        console.log("\nError messages:");
        for (const e of errors.slice(0, 3)) {
          console.log(`  - ${e.agentName}: ${e.errorMessage?.slice(0, 100) || "No message"}`);
        }
      }
    }
  }

  // Total across all failed analyses
  const totalCost = analyses.reduce((sum, a) => sum + Number(a.totalCost), 0);
  console.log("\n════════════════════════════════════");
  console.log("TOTAL COST (failed analyses): $" + totalCost.toFixed(4));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
