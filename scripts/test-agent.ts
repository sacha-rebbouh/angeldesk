/**
 * Test individuel d'un agent
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx ts-node scripts/test-agent.ts --list
 *   npx dotenv -e .env.local -- npx ts-node scripts/test-agent.ts --agent=financial-auditor --dealId=xxx
 *   npx dotenv -e .env.local -- npx ts-node scripts/test-agent.ts --tier=1 --dealId=xxx
 *   npx dotenv -e .env.local -- npx ts-node scripts/test-agent.ts --all --dealId=xxx
 *
 * Options:
 *   --list              Liste tous les agents disponibles (30 total)
 *   --agent=NAME        Teste un agent spécifique
 *   --tier=base|1|2|3   Teste tous les agents d'un tier
 *   --all               Teste tous les 30 agents
 *   --dealId=ID         ID du deal à analyser (requis sauf pour --list)
 *   --verbose           Affiche les résultats JSON détaillés
 *
 * Agents (30 total):
 *   - Base (4): document-extractor, deal-screener, deal-scorer, red-flag-detector
 *   - Tier 1 (12): financial-auditor, team-investigator, etc.
 *   - Tier 2 (5): synthesis-deal-scorer, scenario-modeler, etc.
 *   - Tier 3 (9): saas-expert, fintech-expert, etc.
 */

import { prisma } from "../src/lib/prisma";
import { enrichDeal, type FounderInput } from "../src/services/context-engine";

// Agent imports
const AGENTS = {
  // Base agents
  "document-extractor": () => import("../src/agents/document-extractor").then(m => m.documentExtractor),
  "deal-screener": () => import("../src/agents/deal-screener").then(m => m.dealScreener),
  "deal-scorer": () => import("../src/agents/deal-scorer").then(m => m.dealScorer),
  "red-flag-detector": () => import("../src/agents/red-flag-detector").then(m => m.redFlagDetector),

  // Tier 1 agents (12)
  "financial-auditor": () => import("../src/agents/tier1").then(m => m.financialAuditor),
  "team-investigator": () => import("../src/agents/tier1").then(m => m.teamInvestigator),
  "competitive-intel": () => import("../src/agents/tier1").then(m => m.competitiveIntel),
  "deck-forensics": () => import("../src/agents/tier1").then(m => m.deckForensics),
  "market-intelligence": () => import("../src/agents/tier1").then(m => m.marketIntelligence),
  "technical-dd": () => import("../src/agents/tier1").then(m => m.technicalDD),
  "legal-regulatory": () => import("../src/agents/tier1").then(m => m.legalRegulatory),
  "cap-table-auditor": () => import("../src/agents/tier1").then(m => m.capTableAuditor),
  "gtm-analyst": () => import("../src/agents/tier1").then(m => m.gtmAnalyst),
  "customer-intel": () => import("../src/agents/tier1").then(m => m.customerIntel),
  "exit-strategist": () => import("../src/agents/tier1").then(m => m.exitStrategist),
  "question-master": () => import("../src/agents/tier1").then(m => m.questionMaster),

  // Tier 2 agents (5)
  "synthesis-deal-scorer": () => import("../src/agents/tier2").then(m => m.synthesisDealScorer),
  "scenario-modeler": () => import("../src/agents/tier2").then(m => m.scenarioModeler),
  "devils-advocate": () => import("../src/agents/tier2").then(m => m.devilsAdvocate),
  "contradiction-detector": () => import("../src/agents/tier2").then(m => m.contradictionDetector),
  "memo-generator": () => import("../src/agents/tier2").then(m => m.memoGenerator),

  // Tier 3 sector experts (9)
  "saas-expert": () => import("../src/agents/tier3").then(m => m.saasExpert),
  "marketplace-expert": () => import("../src/agents/tier3").then(m => m.marketplaceExpert),
  "fintech-expert": () => import("../src/agents/tier3").then(m => m.fintechExpert),
  "healthtech-expert": () => import("../src/agents/tier3").then(m => m.healthtechExpert),
  "deeptech-expert": () => import("../src/agents/tier3").then(m => m.deeptechExpert),
  "climate-expert": () => import("../src/agents/tier3").then(m => m.climateExpert),
  "hardware-expert": () => import("../src/agents/tier3").then(m => m.hardwareExpert),
  "gaming-expert": () => import("../src/agents/tier3").then(m => m.gamingExpert),
  "consumer-expert": () => import("../src/agents/tier3").then(m => m.consumerExpert),
} as const;

type AgentName = keyof typeof AGENTS;

const BASE_AGENTS: AgentName[] = [
  "document-extractor", "deal-screener", "deal-scorer", "red-flag-detector"
];

const TIER1_AGENTS: AgentName[] = [
  "financial-auditor", "team-investigator", "competitive-intel", "deck-forensics",
  "market-intelligence", "technical-dd", "legal-regulatory", "cap-table-auditor",
  "gtm-analyst", "customer-intel", "exit-strategist", "question-master"
];

const TIER2_AGENTS: AgentName[] = [
  "synthesis-deal-scorer", "scenario-modeler", "devils-advocate",
  "contradiction-detector", "memo-generator"
];

const TIER3_AGENTS: AgentName[] = [
  "saas-expert", "marketplace-expert", "fintech-expert", "healthtech-expert",
  "deeptech-expert", "climate-expert", "hardware-expert", "gaming-expert", "consumer-expert"
];

// Parse CLI arguments
function parseArgs() {
  const args: Record<string, string | boolean> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key] = value ?? true;
    }
  }

  return args;
}

// Get deal with all relations
async function getDeal(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      documents: true,
      founders: true,
    },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  return deal;
}

// Build enriched context
async function buildContext(deal: Awaited<ReturnType<typeof getDeal>>) {
  console.log("\n📊 Enrichissement du contexte...");

  const founders: FounderInput[] = (deal.founders || []).map(f => ({
    name: f.name,
    role: f.role,
    linkedinUrl: f.linkedinUrl ?? undefined,
  }));

  const contextEngine = await enrichDeal(
    {
      companyName: deal.companyName ?? deal.name,
      sector: deal.sector ?? undefined,
      stage: deal.stage ?? undefined,
      geography: deal.geography ?? undefined,
    },
    {
      dealId: deal.id,
      includeFounders: founders.length > 0,
      founders: founders.length > 0 ? founders : undefined,
      startupSector: deal.sector ?? undefined,
    }
  );

  console.log(`   ✓ ${contextEngine.sources?.length ?? 0} sources de données`);
  console.log(`   ✓ ${contextEngine.dealIntelligence?.similarDeals?.length ?? 0} deals similaires`);
  console.log(`   ✓ Complétude: ${Math.round((contextEngine.completeness ?? 0) * 100)}%`);

  return {
    dealId: deal.id,
    deal,
    documents: deal.documents,
    previousResults: {},
    contextEngine,
  };
}

// Test a single agent
async function testAgent(agentName: AgentName, context: Awaited<ReturnType<typeof buildContext>>, verbose: boolean) {
  console.log(`\n🤖 Test de l'agent: ${agentName}`);
  console.log("─".repeat(50));

  const startTime = Date.now();

  try {
    const agentLoader = AGENTS[agentName];
    const agent = await agentLoader();

    const result = await agent.run(context);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      console.log(`✅ SUCCÈS en ${duration}s`);
      console.log(`   Coût: $${result.cost.toFixed(4)}`);

      if (verbose && "data" in result) {
        console.log("\n📋 Résultat:");
        console.log(JSON.stringify(result.data, null, 2).slice(0, 2000));
        if (JSON.stringify(result.data).length > 2000) {
          console.log("   ... (tronqué)");
        }
      }
    } else {
      console.log(`❌ ÉCHEC en ${duration}s`);
      console.log(`   Erreur: ${result.error}`);
    }

    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`💥 ERREUR en ${duration}s`);
    console.log(`   ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// Main
async function main() {
  const args = parseArgs();

  // List agents
  if (args.list) {
    console.log("\n📋 Agents disponibles:\n");
    console.log("BASE AGENTS (4):");
    BASE_AGENTS.forEach(a => console.log(`  - ${a}`));
    console.log("\nTIER 1 - Investigation (12):");
    TIER1_AGENTS.forEach(a => console.log(`  - ${a}`));
    console.log("\nTIER 2 - Synthèse (5):");
    TIER2_AGENTS.forEach(a => console.log(`  - ${a}`));
    console.log("\nTIER 3 - Experts sectoriels (9):");
    TIER3_AGENTS.forEach(a => console.log(`  - ${a}`));
    console.log("\n─────────────────────────────");
    console.log(`TOTAL: ${BASE_AGENTS.length + TIER1_AGENTS.length + TIER2_AGENTS.length + TIER3_AGENTS.length} agents`);
    process.exit(0);
  }

  // Validate dealId
  const dealId = args.dealId as string;
  if (!dealId) {
    console.error("❌ --dealId requis");
    process.exit(1);
  }

  const verbose = !!args.verbose;

  try {
    // Get deal and build context
    console.log(`\n🔍 Chargement du deal: ${dealId}`);
    const deal = await getDeal(dealId);
    console.log(`   ✓ ${deal.name} (${deal.companyName})`);
    console.log(`   ✓ ${deal.documents.length} documents`);
    console.log(`   ✓ ${deal.founders?.length ?? 0} fondateurs`);

    const context = await buildContext(deal);

    // Determine which agents to test
    let agentsToTest: AgentName[] = [];

    if (args.all) {
      agentsToTest = [...BASE_AGENTS, ...TIER1_AGENTS, ...TIER2_AGENTS, ...TIER3_AGENTS];
    } else if (args.tier === "1") {
      agentsToTest = TIER1_AGENTS;
    } else if (args.tier === "2") {
      agentsToTest = TIER2_AGENTS;
    } else if (args.tier === "3") {
      agentsToTest = TIER3_AGENTS;
    } else if (args.tier === "base") {
      agentsToTest = BASE_AGENTS;
    } else if (args.agent) {
      const agentName = args.agent as AgentName;
      if (!(agentName in AGENTS)) {
        console.error(`❌ Agent inconnu: ${agentName}`);
        console.error(`   Utilisez --list pour voir les agents disponibles`);
        process.exit(1);
      }
      agentsToTest = [agentName];
    } else {
      console.error("❌ --agent=NAME ou --all ou --tier=1|2|3|base requis");
      process.exit(1);
    }

    // Run tests
    console.log(`\n🚀 Test de ${agentsToTest.length} agent(s)...`);

    const results: Array<{ agent: string; success: boolean; cost: number; time: number }> = [];

    for (const agentName of agentsToTest) {
      const startTime = Date.now();
      const result = await testAgent(agentName, context, verbose);
      const time = (Date.now() - startTime) / 1000;

      results.push({
        agent: agentName,
        success: result?.success ?? false,
        cost: result?.cost ?? 0,
        time,
      });

      // Small delay between agents to avoid rate limiting
      if (agentsToTest.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Summary
    console.log("\n" + "═".repeat(50));
    console.log("📊 RÉSUMÉ");
    console.log("═".repeat(50));

    const successful = results.filter(r => r.success).length;
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTime = results.reduce((sum, r) => sum + r.time, 0);

    console.log(`\n✅ Succès: ${successful}/${results.length}`);
    console.log(`💰 Coût total: $${totalCost.toFixed(4)}`);
    console.log(`⏱️  Temps total: ${totalTime.toFixed(1)}s`);

    if (results.some(r => !r.success)) {
      console.log("\n❌ Échecs:");
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.agent}`);
      });
    }

  } catch (error) {
    console.error(`\n💥 Erreur: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
