/**
 * Test a single agent on a deal
 * Usage: npx ts-node scripts/test-single-agent.ts <agent-name> <deal-id>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testAgent(agentName: string, dealId: string) {
  console.log(`\n🧪 Testing ${agentName} on deal ${dealId}\n`);
  console.log("=".repeat(60));

  // Get the deal
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      documents: true,
      analyses: true,
    },
  });

  if (!deal) {
    console.error("❌ Deal not found");
    process.exit(1);
  }

  console.log(`📋 Deal: ${deal.name}`);
  console.log(`📂 Sector: ${deal.sector || "N/A"}`);
  console.log(`💰 Valuation: ${deal.valuationPre ? `${Number(deal.valuationPre)}€` : "N/A"}`);

  // Build context matching AgentContext interface
  const context = {
    dealId: deal.id,
    deal: {
      id: deal.id,
      name: deal.name,
      companyName: deal.name,
      sector: deal.sector,
      stage: deal.stage,
      geography: deal.geography,
      valuationPre: deal.valuationPre,
      amountRequested: deal.amountRequested,
      arr: deal.arr,
      growthRate: deal.growthRate,
    },
    documents: deal.documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      extractedText: d.extractedText,
    })),
    previousResults: {},
    fundingDbContext: null,
    webSearchContext: null,
  };

  // Import and run the agent
  const startTime = Date.now();
  let result: unknown;
  let error: string | null = null;

  try {
    if (agentName === "tech-stack-dd") {
      const { TechStackDDAgent } = await import("../src/agents/tier1/tech-stack-dd");
      const agent = new TechStackDDAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await agent.run(context as any);
    } else if (agentName === "tech-ops-dd") {
      const { TechOpsDDAgent } = await import("../src/agents/tier1/tech-ops-dd");
      const agent = new TechOpsDDAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await agent.run(context as any);
    } else if (agentName === "customer-intel") {
      const { CustomerIntelAgent } = await import("../src/agents/tier1/customer-intel");
      const agent = new CustomerIntelAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await agent.run(context as any);
    } else {
      console.error(`❌ Unknown agent: ${agentName}`);
      console.log("Available agents: technical-dd, tech-stack-dd, tech-ops-dd, customer-intel");
      process.exit(1);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const elapsed = Date.now() - startTime;

  console.log("\n" + "=".repeat(60));
  console.log("📊 RESULT");
  console.log("=".repeat(60));

  if (error) {
    console.log(`❌ FAILED: ${error}`);
  } else {
    const r = result as { success?: boolean; cost?: number; data?: unknown; error?: string };
    console.log(`✅ SUCCESS: ${r.success}`);
    console.log(`💵 Cost: $${(r.cost || 0).toFixed(4)}`);
    console.log(`⏱️  Time: ${(elapsed / 1000).toFixed(1)}s`);

    if (r.error) {
      console.log(`\n❌ Error: ${r.error}`);
    }

    if (r.data) {
      const fs = await import("fs");
      const outputPath = `/tmp/${agentName}-result.json`;
      fs.writeFileSync(outputPath, JSON.stringify(r.data, null, 2));
      console.log(`\n📝 Full result saved to: ${outputPath}`);
    }
  }

  await prisma.$disconnect();
}

// Parse args
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: npx ts-node scripts/test-single-agent.ts <agent-name> <deal-id>");
  console.log("Example: npx ts-node scripts/test-single-agent.ts technical-dd cmkvkyf1u0001it5qney6gr70");
  process.exit(1);
}

testAgent(args[0], args[1]).catch(console.error);
