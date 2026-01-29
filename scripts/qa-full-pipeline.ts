/**
 * QA Agent - Full Pipeline Test (Post-Fix)
 *
 * Runs the complete analysis pipeline on deal cmkvkyf1u0001it5qney6gr70
 * with detailed instrumentation at every step.
 *
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/qa-full-pipeline.ts
 */

import { PrismaClient } from "@prisma/client";
import { orchestrator } from "@/agents";
import type { AnalysisResult, EarlyWarning } from "@/agents/orchestrator";
import { getSectorExpertForDeal } from "@/agents/tier2";
import { TIER1_AGENT_NAMES, TIER3_AGENT_NAMES } from "@/agents/orchestrator/types";

const DEAL_ID = "cmkvkyf1u0001it5qney6gr70";

// ============================================================================
// Logging
// ============================================================================
const c = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};

function header(t: string) {
  console.log(`\n${c.bold}${c.cyan}${"=".repeat(80)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${t}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"=".repeat(80)}${c.reset}\n`);
}
function section(t: string) { console.log(`\n${c.bold}${c.magenta}--- ${t} ---${c.reset}\n`); }
function ok(t: string) { console.log(`  ${c.green}✓${c.reset} ${t}`); }
function fail(t: string) { console.log(`  ${c.red}✗${c.reset} ${t}`); }
function warn(t: string) { console.log(`  ${c.yellow}⚠${c.reset} ${t}`); }
function info(t: string) { console.log(`  ${c.blue}ℹ${c.reset} ${t}`); }

interface QAFinding {
  category: "PASS" | "FAIL" | "WARN" | "BLIND_SPOT" | "SUGGESTION";
  component: string;
  description: string;
  details?: string;
}

const findings: QAFinding[] = [];

function add(f: QAFinding) {
  findings.push(f);
  const fn = f.category === "PASS" ? ok : f.category === "FAIL" ? fail : warn;
  fn(`[${f.component}] ${f.description}`);
  if (f.details) console.log(`    ${c.dim}${f.details}${c.reset}`);
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const prisma = new PrismaClient();
  const startTime = Date.now();

  header("ANGELDESK QA AGENT - POST-FIX VALIDATION");
  info(`Deal ID: ${DEAL_ID}`);
  info(`Date: ${new Date().toISOString()}`);
  info(`Testing fixes: StateMachine, Persistence, Reflexion, Consensus, EarlyWarnings, SectorRouting`);

  // ========================================================================
  // PHASE 1: Pre-flight
  // ========================================================================
  header("PHASE 1: PRE-FLIGHT CHECKS");

  const deal = await prisma.deal.findUnique({
    where: { id: DEAL_ID },
    include: { documents: true, founders: true },
  });
  if (!deal) { fail("Deal not found"); process.exit(1); }

  add({ category: "PASS", component: "Deal", description: `"${deal.name}" (${deal.companyName}), sector=${deal.sector}, stage=${deal.stage}` });

  // Fix 6 check: sector routing
  section("1.1 Sector Routing (Fix 6)");
  const sectorExpert = getSectorExpertForDeal(deal.sector);
  add({
    category: sectorExpert?.name === "blockchain-expert" ? "PASS" : "FAIL",
    component: "Fix6:SectorRouting",
    description: `"${deal.sector}" → ${sectorExpert?.name ?? "NULL"} (expected: blockchain-expert)`,
  });

  // Pre-run fact count
  const preFactCount = await prisma.factEvent.count({ where: { dealId: DEAL_ID } });

  // ========================================================================
  // PHASE 2: Run Pipeline
  // ========================================================================
  header("PHASE 2: RUNNING FULL ANALYSIS PIPELINE");

  const earlyWarnings: EarlyWarning[] = [];
  const progressLog: string[] = [];

  let result: AnalysisResult;
  try {
    result = await orchestrator.runAnalysis({
      dealId: DEAL_ID,
      type: "full_analysis",
      forceRefresh: true,
      enableTrace: true,
      mode: "full",
      failFastOnCritical: false,
      userPlan: "PRO",
      onProgress: (p) => {
        const msg = `[${p.completedAgents}/${p.totalAgents}] ${p.currentAgent} ${p.estimatedCostSoFar ? `($${p.estimatedCostSoFar.toFixed(3)})` : ""}`;
        progressLog.push(msg);
        console.log(`  ${msg}`);
      },
      onEarlyWarning: (w) => {
        earlyWarnings.push(w);
        console.log(`  ${c.red}[EARLY WARNING] ${w.severity}: ${w.title}${c.reset}`);
      },
    });
  } catch (error) {
    fail(`Analysis threw an exception: ${error instanceof Error ? error.message : String(error)}`);
    add({
      category: "FAIL",
      component: "Orchestrator",
      description: "Analysis threw an unhandled exception",
      details: error instanceof Error ? error.stack : String(error),
    });
    await printReport(Date.now() - startTime, earlyWarnings);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ========================================================================
  // PHASE 3: Results Analysis
  // ========================================================================
  header("PHASE 3: RESULTS ANALYSIS");

  // 3.1 Overall
  section("3.1 Overall (Fix 1: StateMachine)");
  add({
    category: result.success ? "PASS" : "FAIL",
    component: "Fix1:StateMachine",
    description: `Analysis ${result.success ? "SUCCEEDED" : "FAILED"} | cost=$${result.totalCost.toFixed(3)} | time=${(result.totalTimeMs / 1000).toFixed(1)}s`,
  });
  add({
    category: "PASS",
    component: "TierGating",
    description: `Tiers: ${result.tiersExecuted?.join(", ") ?? "NOT REPORTED"}`,
  });

  // 3.2 Agent-by-Agent
  section("3.2 Agent Results");
  const agentsRan = Object.keys(result.results).filter(k => k !== "_consensus_resolutions");

  const allExpected = [
    "fact-extractor", "document-extractor",
    ...TIER1_AGENT_NAMES,
    ...(sectorExpert ? [sectorExpert.name] : []),
    ...TIER3_AGENT_NAMES,
  ];

  for (const name of agentsRan) {
    const r = result.results[name];
    const dataSize = "data" in r && r.data ? JSON.stringify(r.data).length : 0;
    add({
      category: r.success ? "PASS" : "FAIL",
      component: name,
      description: `${r.success ? "OK" : "FAILED"} | ${r.executionTimeMs}ms | $${r.cost.toFixed(4)} | data=${dataSize} chars`,
      details: r.error ? `Error: ${r.error}` : undefined,
    });
  }

  // 3.3 Missing/Extra
  section("3.3 Missing & Extra Agents");
  const missing = allExpected.filter(a => !agentsRan.includes(a));
  const extra = agentsRan.filter(a => !allExpected.includes(a));
  for (const m of missing) add({ category: "FAIL", component: "Pipeline", description: `"${m}" expected but DID NOT RUN` });
  for (const e of extra) add({ category: "WARN", component: "Pipeline", description: `"${e}" ran but was NOT expected` });
  if (missing.length === 0 && extra.length === 0) add({ category: "PASS", component: "Pipeline", description: "All expected agents ran, no extras" });

  // 3.4 Consensus (Fix 4)
  section("3.4 Consensus Engine (Fix 4)");
  const consensusData = result.results["_consensus_resolutions"];
  if (consensusData && "data" in consensusData) {
    const data = consensusData.data as { resolutions?: unknown[] };
    add({
      category: (data.resolutions?.length ?? 0) > 0 ? "PASS" : "WARN",
      component: "Fix4:Consensus",
      description: `${data.resolutions?.length ?? 0} resolutions generated`,
    });
  } else {
    add({ category: "WARN", component: "Fix4:Consensus", description: "No consensus data in results" });
  }

  // 3.5 Early Warnings (Fix 5)
  section("3.5 Early Warnings (Fix 5)");
  add({
    category: earlyWarnings.length > 0 ? "PASS" : "WARN",
    component: "Fix5:EarlyWarnings",
    description: `${earlyWarnings.length} early warnings emitted`,
  });
  for (const w of earlyWarnings) {
    info(`  [${w.severity}] ${w.title} (from ${w.agentName}, conf=${w.confidence}%)`);
  }

  // 3.6 Cost (Fix 3)
  section("3.6 Cost & Timing (Fix 3: Reflexion)");
  add({
    category: result.totalCost < 2.0 ? "PASS" : result.totalCost < 4.0 ? "WARN" : "FAIL",
    component: "Fix3:Cost",
    description: `Total cost: $${result.totalCost.toFixed(3)} (was $8.08 before fix, target <$2)`,
  });
  add({
    category: result.totalTimeMs < 300000 ? "PASS" : result.totalTimeMs < 600000 ? "WARN" : "FAIL",
    component: "Fix3:Timing",
    description: `Total time: ${(result.totalTimeMs / 1000).toFixed(1)}s (was 1268s before fix, target <5min)`,
  });

  // Most expensive agents
  const agentCosts = agentsRan
    .map(name => ({ name, cost: result.results[name].cost }))
    .sort((a, b) => b.cost - a.cost);
  info("Top 5 most expensive:");
  for (const ac of agentCosts.slice(0, 5)) {
    info(`  - ${ac.name}: $${ac.cost.toFixed(4)} (${((ac.cost / result.totalCost) * 100).toFixed(1)}%)`);
  }

  // 3.7 Summary
  section("3.7 Summary Quality");
  if (result.summary) {
    add({
      category: result.summary.length > 100 ? "PASS" : "WARN",
      component: "Summary",
      description: `${result.summary.length} chars`,
    });
    if (!result.summary.includes("Invalid state transition")) {
      add({ category: "PASS", component: "Summary", description: "No state machine error in summary" });
    } else {
      add({ category: "FAIL", component: "Summary", description: "Summary still contains state machine error" });
    }
  } else {
    add({ category: "FAIL", component: "Summary", description: "No summary" });
  }

  // ========================================================================
  // PHASE 4: DB Checks
  // ========================================================================
  header("PHASE 4: POST-EXECUTION DB CHECKS");

  section("4.1 Persistence (Fix 2)");
  const latestAnalysis = await prisma.analysis.findFirst({
    where: { dealId: DEAL_ID },
    orderBy: { createdAt: "desc" },
  });
  add({
    category: latestAnalysis?.status === "COMPLETED" ? "PASS" : "FAIL",
    component: "Fix2:Persistence",
    description: `DB status: ${latestAnalysis?.status} (expected: COMPLETED)`,
  });

  // Check scored findings were persisted
  if (latestAnalysis) {
    const scoredFindings = await prisma.scoredFinding.count({ where: { analysisId: latestAnalysis.id } });
    add({
      category: scoredFindings > 0 ? "PASS" : "WARN",
      component: "Fix2:ScoredFindings",
      description: `${scoredFindings} scored findings persisted to DB`,
    });
  }

  section("4.2 Fact Store");
  const postFactCount = await prisma.factEvent.count({ where: { dealId: DEAL_ID } });
  add({
    category: postFactCount > preFactCount ? "PASS" : "WARN",
    component: "FactStore",
    description: `Facts: ${preFactCount} before → ${postFactCount} after (+${postFactCount - preFactCount})`,
  });

  // ========================================================================
  // PHASE 5: Final Report
  // ========================================================================
  await printReport(Date.now() - startTime, earlyWarnings, result);
  await prisma.$disconnect();
}

async function printReport(totalMs: number, earlyWarnings: EarlyWarning[], result?: AnalysisResult) {
  header("FINAL QA REPORT - POST-FIX VALIDATION");

  const passes = findings.filter(f => f.category === "PASS").length;
  const fails = findings.filter(f => f.category === "FAIL").length;
  const warns = findings.filter(f => f.category === "WARN").length;

  console.log(`
${c.bold}SUMMARY${c.reset}
  ${c.green}✓ PASS: ${passes}${c.reset}
  ${c.red}✗ FAIL: ${fails}${c.reset}
  ${c.yellow}⚠ WARN: ${warns}${c.reset}
  Total time: ${(totalMs / 1000).toFixed(1)}s
  Early warnings: ${earlyWarnings.length}
`);

  // Fix-by-fix verdict
  section("FIX VALIDATION SUMMARY");

  const fixChecks = [
    { fix: "Fix 1: StateMachine", key: "Fix1:", expected: "Analysis SUCCEEDED" },
    { fix: "Fix 2: Persistence", key: "Fix2:", expected: "DB status: COMPLETED" },
    { fix: "Fix 3: Reflexion", key: "Fix3:", expected: "cost + timing improved" },
    { fix: "Fix 4: Consensus", key: "Fix4:", expected: "resolutions > 0" },
    { fix: "Fix 5: EarlyWarnings", key: "Fix5:", expected: "warnings > 0" },
    { fix: "Fix 6: SectorRouting", key: "Fix6:", expected: "blockchain-expert" },
  ];

  for (const fc of fixChecks) {
    const related = findings.filter(f => f.component.includes(fc.key));
    const allPass = related.length > 0 && related.every(f => f.category === "PASS");
    const anyFail = related.some(f => f.category === "FAIL");

    if (allPass) {
      ok(`${fc.fix}: VALIDATED`);
    } else if (anyFail) {
      fail(`${fc.fix}: NOT FIXED`);
      for (const f of related.filter(f => f.category === "FAIL")) {
        console.log(`    ${c.dim}${f.description}${c.reset}`);
      }
    } else {
      warn(`${fc.fix}: PARTIAL (${related.filter(f => f.category === "PASS").length}/${related.length} checks pass)`);
    }
  }

  // Comparison with pre-fix run
  if (result) {
    section("BEFORE vs AFTER");
    console.log(`
  | Metric              | BEFORE (pre-fix) | AFTER (post-fix) | Delta        |
  |---------------------|------------------|------------------|--------------|
  | Status              | FAILED           | ${result.success ? "COMPLETED" : "FAILED"}        | ${result.success ? "FIXED" : "STILL BROKEN"}       |
  | Cost                | $8.08            | $${result.totalCost.toFixed(2).padStart(5)}           | ${result.totalCost < 8 ? "-" + ((1 - result.totalCost / 8.08) * 100).toFixed(0) + "%" : "WORSE"}           |
  | Time                | 1268s            | ${(result.totalTimeMs / 1000).toFixed(0).padStart(5)}s           | ${result.totalTimeMs < 1268000 ? "-" + ((1 - result.totalTimeMs / 1268000) * 100).toFixed(0) + "%" : "WORSE"}           |
  | Agents ran          | 15/20            | ${Object.keys(result.results).filter(k => k !== "_consensus_resolutions").length}/${20}             |              |
  | Early warnings      | 0                | ${earlyWarnings.length}                |              |
  | Tier 2 ran          | NO               | ${Object.keys(result.results).some(k => k.includes("expert")) ? "YES" : "NO"}              |              |
  | Tier 3 ran          | NO               | ${TIER3_AGENT_NAMES.some(n => n in result.results) ? "YES" : "NO"}              |              |
`);
  }

  if (fails > 0) {
    section("REMAINING FAILURES");
    for (const f of findings.filter(f => f.category === "FAIL")) {
      fail(`[${f.component}] ${f.description}`);
      if (f.details) console.log(`    ${c.dim}${f.details}${c.reset}`);
    }
  }

  if (warns > 0) {
    section("REMAINING WARNINGS");
    for (const f of findings.filter(f => f.category === "WARN")) {
      warn(`[${f.component}] ${f.description}`);
    }
  }
}

main().catch((err) => {
  console.error("QA Agent crashed:", err);
  process.exit(1);
});
