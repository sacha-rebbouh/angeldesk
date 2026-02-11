#!/usr/bin/env npx tsx
/**
 * TEST AGENT WORKFLOW - Script de test complet pour tous les agents
 *
 * IMPORTANT: Run with dotenv to load .env.local:
 *   npx dotenv -e .env.local -- npx tsx scripts/test-agent-workflow.ts [options]
 *
 * Usage:
 *   npx tsx scripts/test-agent-workflow.ts --deal "NOM_DU_DEAL"
 *   npx tsx scripts/test-agent-workflow.ts --deal "NOM_DU_DEAL" --agent document-extractor
 *   npx tsx scripts/test-agent-workflow.ts --deal "NOM_DU_DEAL" --tier 1
 *   npx tsx scripts/test-agent-workflow.ts --deal "NOM_DU_DEAL" --full
 *   npx tsx scripts/test-agent-workflow.ts --deal "NOM_DU_DEAL" --board
 *
 * Options:
 *   --deal     Nom du deal (recherche partielle, insensible à la casse)
 *   --agent    Nom d'un agent spécifique à tester
 *   --tier     Tier à tester (0, 1, 2, 3)
 *   --full     Lancer l'analyse complète (Tier 0 + 1 + 2 + 3)
 *   --board    Lancer le AI Board après l'analyse
 *   --list     Lister tous les agents disponibles
 */

import { prisma } from "@/lib/prisma";
import { orchestrator } from "@/agents/orchestrator";
import { BASE_AGENTS, getTier1Agents, getTier2Agents, getTier3SectorExpert } from "@/agents/orchestrator/agent-registry";
import { enrichDeal } from "@/services/context-engine";
import { BoardOrchestrator } from "@/agents/board/board-orchestrator";
import type { AgentContext, EnrichedAgentContext, AgentResult } from "@/agents/types";
import type { EarlyWarning } from "@/agents/orchestrator/types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// TIER 0 runs SEQUENTIALLY: extractor THEN context-engine (context needs extracted data)
const TIER0_AGENTS = ["document-extractor", "context-engine"] as const;
const TIER1_AGENTS = [
  "deck-forensics",
  "financial-auditor",
  "market-intelligence",
  "competitive-intel",
  "team-investigator",
  "technical-dd",
  "legal-regulatory",
  "cap-table-auditor",
  "gtm-analyst",
  "customer-intel",
  "exit-strategist",
  "question-master",
] as const;
const TIER2_AGENTS = [
  "contradiction-detector",
  "scenario-modeler",
  "devils-advocate",
  "synthesis-deal-scorer",
  "memo-generator",
] as const;
const BASE_AGENT_NAMES = ["deal-screener", "red-flag-detector", "document-extractor", "deal-scorer"] as const;

// ============================================================================
// HELPERS
// ============================================================================

function log(message: string, color: keyof typeof COLORS = "reset"): void {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logHeader(title: string): void {
  const line = "═".repeat(60);
  console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
}

function logAgent(name: string, status: "start" | "success" | "error" | "info"): void {
  const icons = {
    start: `${COLORS.blue}⏳`,
    success: `${COLORS.green}✅`,
    error: `${COLORS.red}❌`,
    info: `${COLORS.yellow}ℹ️`,
  };
  console.log(`${icons[status]} ${COLORS.bright}${name}${COLORS.reset}`);
}

function logResult(result: AgentResult): void {
  const status = result.success ? COLORS.green : COLORS.red;
  console.log(`   ${status}Success: ${result.success}${COLORS.reset}`);
  console.log(`   ${COLORS.dim}Time: ${result.executionTimeMs}ms | Cost: $${result.cost.toFixed(4)}${COLORS.reset}`);

  if (result.error) {
    console.log(`   ${COLORS.red}Error: ${result.error}${COLORS.reset}`);
  }

  // Print data summary
  if ("data" in result && result.data) {
    const data = result.data as Record<string, unknown>;
    console.log(`   ${COLORS.cyan}Data keys: ${Object.keys(data).join(", ")}${COLORS.reset}`);

    // Print some key insights
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.length < 200) {
        console.log(`   ${COLORS.dim}• ${key}: ${value}${COLORS.reset}`);
      } else if (Array.isArray(value)) {
        console.log(`   ${COLORS.dim}• ${key}: [${value.length} items]${COLORS.reset}`);
      } else if (typeof value === "number") {
        console.log(`   ${COLORS.dim}• ${key}: ${value}${COLORS.reset}`);
      } else if (typeof value === "object" && value !== null) {
        console.log(`   ${COLORS.dim}• ${key}: {${Object.keys(value).length} keys}${COLORS.reset}`);
      }
    }
  }
  console.log("");
}

function logDetailedResult(agentName: string, result: AgentResult): void {
  console.log(`\n${COLORS.bgBlue}${COLORS.white} ${agentName.toUpperCase()} - DETAILED OUTPUT ${COLORS.reset}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n${COLORS.dim}${"─".repeat(60)}${COLORS.reset}\n`);
}

function logEarlyWarning(warning: EarlyWarning): void {
  const severityColors = {
    critical: COLORS.bgRed,
    high: COLORS.red,
    medium: COLORS.yellow,
  };
  const color = severityColors[warning.severity] || COLORS.yellow;
  console.log(`\n${color}${COLORS.bright}⚠️  EARLY WARNING: ${warning.title}${COLORS.reset}`);
  console.log(`   ${COLORS.dim}From: ${warning.agentName} | Severity: ${warning.severity}${COLORS.reset}`);
  console.log(`   ${warning.description}`);
}

async function findDeal(dealName: string) {
  const deal = await prisma.deal.findFirst({
    where: {
      name: {
        contains: dealName,
        mode: "insensitive",
      },
    },
    include: {
      documents: true,
      founders: true,
    },
  });
  return deal;
}

// ============================================================================
// AGENT RUNNERS
// ============================================================================

async function runSingleAgent(
  agentName: string,
  context: EnrichedAgentContext
): Promise<AgentResult> {
  logAgent(agentName, "start");

  let agent: { run: (ctx: AgentContext | EnrichedAgentContext) => Promise<AgentResult> };

  // Check base agents first
  if (BASE_AGENT_NAMES.includes(agentName as typeof BASE_AGENT_NAMES[number])) {
    agent = BASE_AGENTS[agentName as keyof typeof BASE_AGENTS];
  }
  // Check Tier 1 agents
  else if (TIER1_AGENTS.includes(agentName as typeof TIER1_AGENTS[number])) {
    const tier1Agents = await getTier1Agents();
    agent = tier1Agents[agentName];
  }
  // Check Tier 2 agents
  else if (TIER2_AGENTS.includes(agentName as typeof TIER2_AGENTS[number])) {
    const tier2Agents = await getTier2Agents();
    agent = tier2Agents[agentName];
  }
  else {
    throw new Error(`Agent "${agentName}" not found`);
  }

  const result = await agent.run(context);

  if (result.success) {
    logAgent(agentName, "success");
  } else {
    logAgent(agentName, "error");
  }

  logResult(result);
  return result;
}

async function runTier0(
  deal: NonNullable<Awaited<ReturnType<typeof findDeal>>>,
  context: AgentContext
): Promise<{ extractedData: Record<string, unknown>; contextEngine: EnrichedAgentContext["contextEngine"] }> {
  logHeader("TIER 0: Document Extraction & Context Engine");
  log("Execution: SEQUENTIAL (extractor → context-engine)", "yellow");
  log("Reason: Context Engine needs extracted data (tagline, competitors, founders)\n", "dim");

  let extractedData: Record<string, unknown> = {};

  // Document Extractor
  if (deal.documents.length > 0) {
    logAgent("document-extractor", "start");
    const extractorResult = await BASE_AGENTS["document-extractor"].run(context);

    if (extractorResult.success) {
      logAgent("document-extractor", "success");
      if ("data" in extractorResult) {
        extractedData = extractorResult.data as Record<string, unknown>;
      }
    } else {
      logAgent("document-extractor", "error");
    }
    logResult(extractorResult);
    context.previousResults!["document-extractor"] = extractorResult;
  } else {
    logAgent("document-extractor", "info");
    log("   No documents to extract", "yellow");
  }

  // Context Engine
  logAgent("context-engine", "start");

  // Extract nested info from document-extractor result
  const extractedInfo = (extractedData as { extractedInfo?: Record<string, unknown> }).extractedInfo ?? {};
  const tagline = extractedInfo.tagline as string | undefined;
  const competitors = extractedInfo.competitors as string[] | undefined;
  const productDescription = extractedInfo.productDescription as string | undefined;
  const extractedSector = extractedInfo.sector as string | undefined;
  // USE CASE DATA - CRITICAL for finding real competitors
  const productName = extractedInfo.productName as string | undefined;
  const coreValueProposition = extractedInfo.coreValueProposition as string | undefined;
  const useCases = extractedInfo.useCases as string[] | undefined;
  const keyDifferentiators = extractedInfo.keyDifferentiators as string[] | undefined;

  log(`Using extracted data:`, "dim");
  log(`   tagline: ${tagline ?? "N/A"}`, "dim");
  log(`   competitors: ${competitors?.join(", ") ?? "N/A"}`, "dim");
  log(`   sector: ${extractedSector ?? "N/A"}`, "dim");
  log(`   productDescription: ${productDescription?.substring(0, 50) ?? "N/A"}...`, "dim");
  log(`   productName: ${productName ?? "N/A"}`, "dim");
  log(`   useCases: ${useCases?.join(", ") ?? "N/A"}`, "dim");
  log(`   coreValueProposition: ${coreValueProposition?.substring(0, 60) ?? "N/A"}...\n`, "dim");

  const contextEngineData = await enrichDeal(
    {
      companyName: deal.companyName ?? deal.name,
      sector: extractedSector ?? deal.sector ?? undefined,
      stage: deal.stage ?? undefined,
      geography: deal.geography ?? undefined,
      tagline,
      productDescription,
      mentionedCompetitors: competitors,
      // USE CASE DATA
      productName,
      coreValueProposition,
      useCases,
      keyDifferentiators,
    },
    {
      dealId: deal.id,
      includeFounders: deal.founders.length > 0,
      founders: deal.founders.map(f => ({
        name: f.name,
        role: f.role,
        linkedinUrl: f.linkedinUrl ?? undefined,
      })),
      extractedTagline: tagline,
      extractedCompetitors: competitors,
      extractedProductDescription: productDescription,
      // USE CASE DATA - CRITICAL for finding real competitors
      extractedProductName: productName,
      extractedCoreValueProposition: coreValueProposition,
      extractedUseCases: useCases,
      extractedKeyDifferentiators: keyDifferentiators,
    }
  );

  logAgent("context-engine", "success");
  log(`   Completeness: ${contextEngineData.completeness}%`, "cyan");
  log(`   Similar deals: ${contextEngineData.dealIntelligence?.similarDeals?.length ?? 0}`, "dim");
  log(`   Competitors: ${contextEngineData.competitiveLandscape?.competitors?.length ?? 0}`, "dim");
  log(`   Market data sources: ${contextEngineData.marketData?.sources?.length ?? 0}`, "dim");
  console.log("");

  return { extractedData, contextEngine: contextEngineData };
}

async function runTier1(
  context: EnrichedAgentContext
): Promise<Record<string, AgentResult>> {
  logHeader("TIER 1: Investigation Agents (12 agents)");

  const tier1Agents = await getTier1Agents();
  const results: Record<string, AgentResult> = {};

  // Run all Tier 1 agents in PARALLEL
  log("Running 12 agents in parallel...\n", "cyan");

  const startTime = Date.now();
  const agentResults = await Promise.all(
    TIER1_AGENTS.map(async (agentName) => {
      const agent = tier1Agents[agentName];
      try {
        const result = await agent.run(context);
        return { agentName, result };
      } catch (error) {
        return {
          agentName,
          result: {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          } as AgentResult,
        };
      }
    })
  );

  const totalTime = Date.now() - startTime;

  // Collect results
  let totalCost = 0;
  let successCount = 0;

  for (const { agentName, result } of agentResults) {
    results[agentName] = result;
    context.previousResults![agentName] = result;
    totalCost += result.cost;

    if (result.success) {
      logAgent(agentName, "success");
      successCount++;
    } else {
      logAgent(agentName, "error");
    }
    logResult(result);
  }

  log(`\nTier 1 Summary:`, "bright");
  log(`   Success: ${successCount}/${TIER1_AGENTS.length}`, successCount === TIER1_AGENTS.length ? "green" : "yellow");
  log(`   Total time: ${totalTime}ms (parallel)`, "dim");
  log(`   Total cost: $${totalCost.toFixed(4)}`, "dim");

  return results;
}

async function runTier2(
  context: EnrichedAgentContext
): Promise<Record<string, AgentResult>> {
  logHeader("TIER 2: Synthesis Agents (5 agents)");

  const tier2Agents = await getTier2Agents();
  const results: Record<string, AgentResult> = {};

  // Batch 1: Parallel (3 agents)
  log("Batch 1: Running 3 agents in parallel...\n", "cyan");
  const batch1Agents = ["contradiction-detector", "scenario-modeler", "devils-advocate"];

  const batch1Results = await Promise.all(
    batch1Agents.map(async (agentName) => {
      const agent = tier2Agents[agentName];
      try {
        const result = await agent.run(context);
        return { agentName, result };
      } catch (error) {
        return {
          agentName,
          result: {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          } as AgentResult,
        };
      }
    })
  );

  for (const { agentName, result } of batch1Results) {
    results[agentName] = result;
    context.previousResults![agentName] = result;
    if (result.success) {
      logAgent(agentName, "success");
    } else {
      logAgent(agentName, "error");
    }
    logResult(result);
  }

  // Batch 2: Sequential (synthesis-deal-scorer)
  log("\nBatch 2: Synthesis Deal Scorer...\n", "cyan");
  const scorerResult = await runSingleAgent("synthesis-deal-scorer", context, false);
  results["synthesis-deal-scorer"] = scorerResult;
  context.previousResults!["synthesis-deal-scorer"] = scorerResult;

  // Batch 3: Sequential (memo-generator)
  log("\nBatch 3: Memo Generator...\n", "cyan");
  const memoResult = await runSingleAgent("memo-generator", context, false);
  results["memo-generator"] = memoResult;

  return results;
}

async function runTier3(
  deal: NonNullable<Awaited<ReturnType<typeof findDeal>>>,
  context: EnrichedAgentContext
): Promise<AgentResult | null> {
  logHeader("TIER 3: Sector Expert");

  const sectorExpert = await getTier3SectorExpert(deal.sector);

  if (!sectorExpert) {
    log(`No sector expert available for sector: ${deal.sector ?? "unknown"}`, "yellow");
    return null;
  }

  logAgent(sectorExpert.name, "start");
  const result = await sectorExpert.run(context);

  if (result.success) {
    logAgent(sectorExpert.name, "success");
  } else {
    logAgent(sectorExpert.name, "error");
  }

  logResult(result);
  return result;
}

async function runBoard(
  deal: NonNullable<Awaited<ReturnType<typeof findDeal>>>,
  userId: string
): Promise<void> {
  logHeader("AI BOARD: Multi-LLM Deliberation");

  const boardOrchestrator = new BoardOrchestrator({
    dealId: deal.id,
    userId,
    onProgress: (event) => {
      switch (event.type) {
        case "session_started":
          log(`Session started: ${event.sessionId}`, "cyan");
          break;
        case "member_analysis_started":
          logAgent(`${event.memberName}`, "start");
          break;
        case "member_analysis_completed":
          logAgent(`${event.memberName}: ${event.analysis?.verdict}`, "success");
          break;
        case "debate_round_started":
          log(`\nDebate Round ${event.roundNumber}`, "magenta");
          break;
        case "debate_response":
          log(`   ${event.memberName}: ${event.debateResponse?.positionChanged ? "CHANGED" : "maintained"}`, "dim");
          break;
        case "member_voted":
          log(`   ${event.memberName}: ${event.vote?.verdict} (${event.vote?.confidence}%)`, "cyan");
          break;
        case "verdict_reached":
          log(`\n${COLORS.bgGreen}${COLORS.white} VERDICT: ${event.verdict?.verdict} (${event.verdict?.consensusLevel}) ${COLORS.reset}`, "bright");
          break;
        case "error":
          log(`Error: ${event.error}`, "red");
          break;
      }
    },
  });

  const result = await boardOrchestrator.runBoard({
    dealId: deal.id,
    userId,
  });

  console.log("\n" + JSON.stringify(result, null, 2));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let dealName: string | null = null;
  let agentName: string | null = null;
  let tier: number | null = null;
  let runFull = false;
  let runBoardFlag = false;
  let listAgents = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--deal":
        dealName = args[++i];
        break;
      case "--agent":
        agentName = args[++i];
        break;
      case "--tier":
        tier = parseInt(args[++i], 10);
        break;
      case "--full":
        runFull = true;
        break;
      case "--board":
        runBoardFlag = true;
        break;
      case "--list":
        listAgents = true;
        break;
    }
  }

  // List agents
  if (listAgents) {
    logHeader("AVAILABLE AGENTS");

    log("\nTIER 0 (Foundation):", "cyan");
    TIER0_AGENTS.forEach(a => log(`  • ${a}`, "dim"));

    log("\nBASE AGENTS:", "cyan");
    BASE_AGENT_NAMES.forEach(a => log(`  • ${a}`, "dim"));

    log("\nTIER 1 (Investigation - 12 agents):", "cyan");
    TIER1_AGENTS.forEach(a => log(`  • ${a}`, "dim"));

    log("\nTIER 2 (Synthesis - 5 agents):", "cyan");
    TIER2_AGENTS.forEach(a => log(`  • ${a}`, "dim"));

    log("\nTIER 3 (Sector Experts - dynamic):", "cyan");
    log("  • saas-expert", "dim");
    log("  • fintech-expert", "dim");
    log("  • healthtech-expert", "dim");
    log("  • marketplace-expert", "dim");
    log("  • deeptech-expert", "dim");
    log("  • climate-expert", "dim");
    log("  • hardware-expert", "dim");
    log("  • gaming-expert", "dim");
    log("  • consumer-expert", "dim");

    log("\nAI BOARD:", "cyan");
    log("  • 4 LLMs: Claude Opus, GPT-4 Turbo, Gemini Ultra, Mistral Large", "dim");

    process.exit(0);
  }

  // Validate deal name
  if (!dealName) {
    log("Error: --deal is required", "red");
    log("\nUsage:", "dim");
    log("  npx tsx scripts/test-agent-workflow.ts --deal \"NOM_DU_DEAL\" [options]", "dim");
    log("\nOptions:", "dim");
    log("  --agent <name>   Test a specific agent", "dim");
    log("  --tier <0|1|2|3> Test a specific tier", "dim");
    log("  --full           Run full analysis (all tiers)", "dim");
    log("  --board          Run AI Board after analysis", "dim");
    log("  --list           List all available agents", "dim");
    process.exit(1);
  }

  // Find deal
  logHeader("FINDING DEAL");
  log(`Searching for: "${dealName}"...`, "cyan");

  const deal = await findDeal(dealName);

  if (!deal) {
    log(`Deal not found: "${dealName}"`, "red");

    // List available deals
    const deals = await prisma.deal.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: { name: true, companyName: true, sector: true },
    });

    log("\nAvailable deals:", "yellow");
    deals.forEach(d => log(`  • ${d.name} (${d.companyName ?? "N/A"}) - ${d.sector ?? "N/A"}`, "dim"));

    process.exit(1);
  }

  log(`Found: ${deal.name}`, "green");
  log(`   Company: ${deal.companyName ?? "N/A"}`, "dim");
  log(`   Sector: ${deal.sector ?? "N/A"}`, "dim");
  log(`   Stage: ${deal.stage ?? "N/A"}`, "dim");
  log(`   Documents: ${deal.documents.length}`, "dim");
  log(`   Founders: ${deal.founders.length}`, "dim");

  // Build base context
  const baseContext: AgentContext = {
    dealId: deal.id,
    deal,
    documents: deal.documents.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      extractedText: d.extractedText,
    })),
    previousResults: {},
  };

  // Early warning handler
  const onEarlyWarning = (warning: EarlyWarning) => {
    logEarlyWarning(warning);
  };

  // Run based on options
  const startTime = Date.now();
  let totalCost = 0;

  try {
    // Single agent test
    if (agentName && !runFull && tier === null) {
      logHeader(`TESTING SINGLE AGENT: ${agentName}`);

      // Special case: document-extractor runs alone (no context engine needed)
      if (agentName === "document-extractor") {
        const result = await runSingleAgent(agentName, baseContext as EnrichedAgentContext, false);
        logDetailedResult(agentName, result);
        totalCost = result.cost;
      }
      // Special case: context-engine alone (needs extractor data first)
      else if (agentName === "context-engine") {
        log("Context Engine requires document-extractor first. Running both sequentially.\n", "yellow");
        const { contextEngine } = await runTier0(deal, baseContext);
        log("\nContext Engine Result:", "bright");
        console.log(JSON.stringify(contextEngine, null, 2));
        totalCost = 0; // Context engine cost is in API calls, not tracked here
      }
      // Other agents: need Tier 0 first for context
      else {
        log("Running Tier 0 first (required for context)...\n", "dim");
        const { contextEngine } = await runTier0(deal, baseContext);

        const enrichedContext: EnrichedAgentContext = {
          ...baseContext,
          contextEngine,
        };

        const result = await runSingleAgent(agentName, enrichedContext);
        logDetailedResult(agentName, result);
        totalCost = result.cost;
      }
    }
    // Specific tier
    else if (tier !== null && !runFull) {
      switch (tier) {
        case 0: {
          logHeader("TIER 0: Step by Step");

          // Step 1: Document Extractor
          log("STEP 1/2: Document Extractor\n", "cyan");
          let extractedData: Record<string, unknown> = {};
          if (deal.documents.length > 0) {
            logAgent("document-extractor", "start");
            const extractorResult = await BASE_AGENTS["document-extractor"].run(baseContext);
            if (extractorResult.success) {
              logAgent("document-extractor", "success");
              if ("data" in extractorResult) {
                extractedData = extractorResult.data as Record<string, unknown>;
              }
            } else {
              logAgent("document-extractor", "error");
            }
            logResult(extractorResult);
            logDetailedResult("document-extractor", extractorResult);
            baseContext.previousResults!["document-extractor"] = extractorResult;
            totalCost += extractorResult.cost;
          } else {
            log("No documents to extract\n", "yellow");
          }

          // Step 2: Context Engine
          log("\nSTEP 2/2: Context Engine\n", "cyan");

          // Extract nested info from document-extractor result
          const extractedInfo = (extractedData as { extractedInfo?: Record<string, unknown> }).extractedInfo ?? {};
          const tagline = extractedInfo.tagline as string | undefined;
          const competitors = extractedInfo.competitors as string[] | undefined;
          const productDescription = extractedInfo.productDescription as string | undefined;
          const extractedSector = extractedInfo.sector as string | undefined;
          // USE CASE DATA - CRITICAL for finding real competitors
          const productName = extractedInfo.productName as string | undefined;
          const coreValueProposition = extractedInfo.coreValueProposition as string | undefined;
          const useCases = extractedInfo.useCases as string[] | undefined;
          const keyDifferentiators = extractedInfo.keyDifferentiators as string[] | undefined;

          log("Using extracted data:", "dim");
          log(`   tagline: ${tagline ?? "N/A"}`, "dim");
          log(`   competitors: ${competitors?.join(", ") ?? "N/A"}`, "dim");
          log(`   sector: ${extractedSector ?? "N/A"}`, "dim");
          log(`   productDescription: ${productDescription?.substring(0, 50) ?? "N/A"}...`, "dim");
          log(`   productName: ${productName ?? "N/A"}`, "dim");
          log(`   useCases: ${useCases?.join(", ") ?? "N/A"}`, "dim");
          log(`   coreValueProposition: ${coreValueProposition?.substring(0, 60) ?? "N/A"}...\n`, "dim");

          const contextEngineData = await enrichDeal(
            {
              companyName: deal.companyName ?? deal.name,
              sector: extractedSector ?? deal.sector ?? undefined,
              stage: deal.stage ?? undefined,
              geography: deal.geography ?? undefined,
              tagline,
              productDescription,
              mentionedCompetitors: competitors,
              // USE CASE DATA
              productName,
              coreValueProposition,
              useCases,
              keyDifferentiators,
            },
            {
              dealId: deal.id,
              includeFounders: deal.founders.length > 0,
              founders: deal.founders.map(f => ({
                name: f.name,
                role: f.role,
                linkedinUrl: f.linkedinUrl ?? undefined,
              })),
              extractedTagline: tagline,
              extractedCompetitors: competitors,
              extractedProductDescription: productDescription,
              // USE CASE DATA - CRITICAL for finding real competitors
              extractedProductName: productName,
              extractedCoreValueProposition: coreValueProposition,
              extractedUseCases: useCases,
              extractedKeyDifferentiators: keyDifferentiators,
            }
          );

          logAgent("context-engine", "success");
          log(`\nContext Engine Result:`, "bright");
          console.log(JSON.stringify(contextEngineData, null, 2));
          break;
        }
        case 1: {
          const { contextEngine } = await runTier0(deal, baseContext);
          const enrichedContext: EnrichedAgentContext = { ...baseContext, contextEngine };
          const results = await runTier1(enrichedContext);
          totalCost = Object.values(results).reduce((sum, r) => sum + r.cost, 0);
          break;
        }
        case 2: {
          const { contextEngine } = await runTier0(deal, baseContext);
          const enrichedContext: EnrichedAgentContext = { ...baseContext, contextEngine };
          const tier1Results = await runTier1(enrichedContext);
          const tier2Results = await runTier2(enrichedContext);
          totalCost = Object.values(tier1Results).reduce((sum, r) => sum + r.cost, 0);
          totalCost += Object.values(tier2Results).reduce((sum, r) => sum + r.cost, 0);
          break;
        }
        case 3: {
          const { contextEngine } = await runTier0(deal, baseContext);
          const enrichedContext: EnrichedAgentContext = { ...baseContext, contextEngine };
          const tier1Results = await runTier1(enrichedContext);
          const sectorResult = await runTier3(deal, enrichedContext);
          totalCost = Object.values(tier1Results).reduce((sum, r) => sum + r.cost, 0);
          if (sectorResult) totalCost += sectorResult.cost;
          break;
        }
        default:
          log(`Invalid tier: ${tier}. Use 0, 1, 2, or 3.`, "red");
          process.exit(1);
      }
    }
    // Full analysis
    else if (runFull || runBoardFlag) {
      logHeader("FULL ANALYSIS (PRO MODE)");

      const result = await orchestrator.runAnalysis({
        dealId: deal.id,
        type: "full_analysis",
        forceRefresh: true,
        mode: "full",
        onProgress: (progress) => {
          log(`[${progress.completedAgents}/${progress.totalAgents}] ${progress.currentAgent}`, "dim");
        },
        onEarlyWarning,
      });

      log("\n" + COLORS.bgGreen + COLORS.white + " ANALYSIS COMPLETE " + COLORS.reset, "bright");
      log(`   Success: ${result.success}`, result.success ? "green" : "red");
      log(`   Total time: ${result.totalTimeMs}ms`, "dim");
      log(`   Total cost: $${result.totalCost.toFixed(4)}`, "dim");
      log(`   Agents: ${Object.keys(result.results).length}`, "dim");

      if (result.earlyWarnings && result.earlyWarnings.length > 0) {
        log(`\n   Early Warnings: ${result.earlyWarnings.length}`, "yellow");
        result.earlyWarnings.forEach(w => log(`     • ${w.severity}: ${w.title}`, "yellow"));
      }

      totalCost = result.totalCost;

      // Run Board if requested
      if (runBoardFlag) {
        await runBoard(deal, deal.userId);
      }
    }
    // Default: show help
    else {
      log("No action specified. Use --full, --tier, --agent, or --board.", "yellow");
      process.exit(1);
    }

    // Final summary
    const totalTime = Date.now() - startTime;
    logHeader("FINAL SUMMARY");
    log(`Total execution time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`, "bright");
    log(`Total cost: $${totalCost.toFixed(4)}`, "bright");

  } catch (error) {
    log(`\nError: ${error instanceof Error ? error.message : "Unknown error"}`, "red");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
