/**
 * Test script - Run ALL agents sequentially on deal Antiopea
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/test-all-agents.ts
 */

import { PrismaClient } from "@prisma/client";
import type { AgentContext, EnrichedAgentContext, AgentResult } from "../src/agents/types";
import { enrichDeal } from "../src/services/context-engine";

const prisma = new PrismaClient();
const DEAL_ID = "cmkvkyf1u0001it5qney6gr70";

// Result tracking
interface TestResult {
  agent: string;
  tier: string;
  success: boolean;
  timeMs: number;
  cost: number;
  error?: string;
  hasData: boolean;
  dataPreview?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logResult(r: TestResult) {
  const status = r.success ? "✅ SUCCESS" : "❌ FAILED";
  const costStr = r.cost > 0 ? ` | Cost: $${r.cost.toFixed(4)}` : "";
  log(`${r.tier.padEnd(5)} | ${r.agent.padEnd(25)} | ${status} | ${r.timeMs}ms${costStr}`);
  if (r.error) {
    log(`       ERROR: ${r.error}`);
  }
}

async function runAgent(
  name: string,
  tier: string,
  agent: { run: (ctx: EnrichedAgentContext | AgentContext) => Promise<AgentResult> },
  context: EnrichedAgentContext
): Promise<AgentResult> {
  const start = Date.now();
  let result: AgentResult;

  try {
    log(`Starting ${tier} agent: ${name}`);
    result = await agent.run(context);

    const testResult: TestResult = {
      agent: name,
      tier,
      success: result.success,
      timeMs: Date.now() - start,
      cost: result.cost || 0,
      error: result.error,
      hasData: "data" in result && result.data !== null && result.data !== undefined,
      dataPreview: "data" in result ? JSON.stringify(result.data).slice(0, 300) : undefined,
    };

    results.push(testResult);
    logResult(testResult);

    return result;
  } catch (error) {
    const testResult: TestResult = {
      agent: name,
      tier,
      success: false,
      timeMs: Date.now() - start,
      cost: 0,
      error: error instanceof Error ? error.message : String(error),
      hasData: false,
    };

    results.push(testResult);
    logResult(testResult);

    return {
      agentName: name,
      success: false,
      executionTimeMs: Date.now() - start,
      cost: 0,
      error: testResult.error,
    };
  }
}

async function main() {
  log("=".repeat(80));
  log("AGENT TEST SUITE - Deal: Antiopea Seed");
  log("=".repeat(80));

  // Load deal
  log("Loading deal from database...");
  const deal = await prisma.deal.findUnique({
    where: { id: DEAL_ID },
    include: {
      documents: true,
      founders: true,
    },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${DEAL_ID}`);
  }

  log(`Deal loaded: ${deal.name} | Sector: ${deal.sector} | Stage: ${deal.stage}`);
  log(`Documents: ${deal.documents.length}`);

  // Build base context
  const baseContext: AgentContext = {
    dealId: deal.id,
    deal,
    documents: deal.documents,
    previousResults: {},
  };

  // ============================================================================
  // TIER 0: Document Extractor
  // ============================================================================
  log("\n" + "=".repeat(80));
  log("TIER 0: BASE AGENTS");
  log("=".repeat(80));

  const { documentExtractor } = await import("../src/agents/document-extractor");

  const extractorResult = await runAgent("document-extractor", "T0", documentExtractor, baseContext as EnrichedAgentContext);
  baseContext.previousResults!["document-extractor"] = extractorResult;

  // Enrich context
  log("\nEnriching context with Context Engine...");
  let contextEngineData;
  try {
    contextEngineData = await enrichDeal(
      {
        companyName: deal.companyName ?? deal.name,
        sector: deal.sector ?? undefined,
        stage: deal.stage ?? undefined,
        geography: deal.geography ?? undefined,
      },
      {
        dealId: deal.id,
        includeFounders: false,
      }
    );
    log(`Context Engine enriched: completeness=${contextEngineData.completeness}%`);
  } catch (error) {
    log(`Context Engine failed: ${error instanceof Error ? error.message : error}`);
  }

  const enrichedContext: EnrichedAgentContext = {
    ...baseContext,
    contextEngine: contextEngineData,
  };

  // ============================================================================
  // TIER 1: Investigation Agents (12)
  // ============================================================================
  log("\n" + "=".repeat(80));
  log("TIER 1: INVESTIGATION AGENTS (12)");
  log("=".repeat(80));

  const tier1Module = await import("../src/agents/tier1");

  const tier1Agents = [
    { name: "financial-auditor", agent: tier1Module.financialAuditor },
    { name: "deck-forensics", agent: tier1Module.deckForensics },
    { name: "cap-table-auditor", agent: tier1Module.capTableAuditor },
    { name: "technical-dd", agent: tier1Module.technicalDD },
    { name: "team-investigator", agent: tier1Module.teamInvestigator },
    { name: "competitive-intel", agent: tier1Module.competitiveIntel },
    { name: "market-intelligence", agent: tier1Module.marketIntelligence },
    { name: "legal-regulatory", agent: tier1Module.legalRegulatory },
    { name: "gtm-analyst", agent: tier1Module.gtmAnalyst },
    { name: "customer-intel", agent: tier1Module.customerIntel },
    { name: "exit-strategist", agent: tier1Module.exitStrategist },
    { name: "question-master", agent: tier1Module.questionMaster },
  ];

  for (const { name, agent } of tier1Agents) {
    const result = await runAgent(name, "T1", agent, enrichedContext);
    enrichedContext.previousResults![name] = result;

    // Small delay between agents to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // ============================================================================
  // TIER 2: Sector Expert
  // ============================================================================
  log("\n" + "=".repeat(80));
  log("TIER 2: SECTOR EXPERT");
  log("=".repeat(80));

  const { getSectorExpertForDeal } = await import("../src/agents/tier2");

  const sectorExpert = getSectorExpertForDeal(deal.sector);
  if (sectorExpert) {
    const result = await runAgent(sectorExpert.name, "T2", sectorExpert, enrichedContext);
    enrichedContext.previousResults![sectorExpert.name] = result;
  } else {
    log(`No sector expert found for sector: ${deal.sector}`);
  }

  // ============================================================================
  // TIER 3: Synthesis Agents (5)
  // ============================================================================
  log("\n" + "=".repeat(80));
  log("TIER 3: SYNTHESIS AGENTS (5)");
  log("=".repeat(80));

  const tier3Module = await import("../src/agents/tier3");

  const tier3Agents = [
    { name: "contradiction-detector", agent: tier3Module.contradictionDetector },
    { name: "scenario-modeler", agent: tier3Module.scenarioModeler },
    { name: "devils-advocate", agent: tier3Module.devilsAdvocate },
    { name: "synthesis-deal-scorer", agent: tier3Module.synthesisDealScorer },
    { name: "memo-generator", agent: tier3Module.memoGenerator },
  ];

  for (const { name, agent } of tier3Agents) {
    const result = await runAgent(name, "T3", agent, enrichedContext);
    enrichedContext.previousResults![name] = result;

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  log("\n" + "=".repeat(80));
  log("FINAL SUMMARY");
  log("=".repeat(80));

  const byTier = {
    T0: results.filter(r => r.tier === "T0"),
    T1: results.filter(r => r.tier === "T1"),
    T2: results.filter(r => r.tier === "T2"),
    T3: results.filter(r => r.tier === "T3"),
  };

  for (const [tier, tierResults] of Object.entries(byTier)) {
    const success = tierResults.filter(r => r.success).length;
    const total = tierResults.length;
    const totalCost = tierResults.reduce((sum, r) => sum + r.cost, 0);
    const totalTime = tierResults.reduce((sum, r) => sum + r.timeMs, 0);

    log(`${tier}: ${success}/${total} success | Total time: ${(totalTime / 1000).toFixed(1)}s | Cost: $${totalCost.toFixed(4)}`);

    const failed = tierResults.filter(r => !r.success);
    if (failed.length > 0) {
      for (const f of failed) {
        log(`   ❌ ${f.agent}: ${f.error}`);
      }
    }
  }

  const totalSuccess = results.filter(r => r.success).length;
  const totalAgents = results.length;
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  const totalTime = results.reduce((sum, r) => sum + r.timeMs, 0);

  log("\n" + "-".repeat(80));
  log(`TOTAL: ${totalSuccess}/${totalAgents} agents succeeded`);
  log(`Total execution time: ${(totalTime / 1000).toFixed(1)}s`);
  log(`Total cost: $${totalCost.toFixed(4)}`);
  log("-".repeat(80));

  // Write detailed results to file
  const fs = await import("fs");
  fs.writeFileSync(
    "scripts/test-results.json",
    JSON.stringify({ results, summary: { totalSuccess, totalAgents, totalCost, totalTime } }, null, 2)
  );
  log("\nDetailed results written to scripts/test-results.json");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
