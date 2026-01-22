/**
 * Variance Test Script
 *
 * Tests that ReAct agent scores have < 5 points variance across 10 runs.
 * This validates the reproducibility promise of the production architecture.
 *
 * Usage:
 *   npx ts-node scripts/test-variance.ts [--runs=10] [--deal=DEAL_ID]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Configuration
const DEFAULT_RUNS = 10;
const MAX_ACCEPTABLE_VARIANCE = 5; // points

interface VarianceTestResult {
  agentName: string;
  scores: number[];
  mean: number;
  stdDev: number;
  range: number;
  passed: boolean;
}

async function getTestDealId(): Promise<string | null> {
  // Find a deal with documents for testing
  const deal = await prisma.deal.findFirst({
    where: {
      documents: {
        some: {
          extractedText: {
            not: null,
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (deal) {
    console.log(`Using deal: ${deal.name} (${deal.id})`);
    return deal.id;
  }

  return null;
}

function calculateStats(scores: number[]): { mean: number; stdDev: number; range: number } {
  if (scores.length === 0) return { mean: 0, stdDev: 0, range: 0 };

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const range = Math.max(...scores) - Math.min(...scores);

  return { mean, stdDev, range };
}

async function runVarianceTest(
  dealId: string,
  runs: number = DEFAULT_RUNS
): Promise<VarianceTestResult[]> {
  const results: Map<string, number[]> = new Map();

  console.log(`\n🔬 Running ${runs} analysis iterations...\n`);

  // Dynamically import orchestrator to avoid initialization issues
  const { orchestrator } = await import("../src/agents");

  for (let i = 0; i < runs; i++) {
    console.log(`Run ${i + 1}/${runs}...`);

    try {
      const result = await orchestrator.runAnalysis({
        dealId,
        type: "tier1_complete",
        useReAct: true,
      });

      // Extract scores from each agent
      for (const [agentName, agentResult] of Object.entries(result.results)) {
        if (agentResult.success && "data" in agentResult) {
          const data = agentResult.data as Record<string, unknown>;

          // Find score field (different agents use different names)
          const scoreFields = [
            "overallScore",
            "overallTeamScore",
            "marketScore",
            "competitiveScore",
            "technicalScore",
            "legalScore",
            "capTableScore",
            "gtmScore",
            "customerScore",
            "exitScore",
          ];

          for (const field of scoreFields) {
            if (typeof data[field] === "number") {
              if (!results.has(agentName)) {
                results.set(agentName, []);
              }
              results.get(agentName)!.push(data[field] as number);
              break;
            }
          }
        }
      }

      // Pause between runs to avoid rate limiting
      if (i < runs - 1) {
        console.log("  Waiting 5s before next run...");
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (error) {
      console.error(`  Error in run ${i + 1}:`, error);
    }
  }

  // Calculate variance for each agent
  const varianceResults: VarianceTestResult[] = [];

  for (const [agentName, scores] of results) {
    const { mean, stdDev, range } = calculateStats(scores);
    varianceResults.push({
      agentName,
      scores,
      mean,
      stdDev,
      range,
      passed: stdDev <= MAX_ACCEPTABLE_VARIANCE,
    });
  }

  return varianceResults;
}

function printResults(results: VarianceTestResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("                         VARIANCE TEST RESULTS");
  console.log("=".repeat(80) + "\n");

  // Sort by stdDev descending
  const sorted = [...results].sort((a, b) => b.stdDev - a.stdDev);

  for (const result of sorted) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} ${result.agentName}`);
    console.log(`  Scores: ${result.scores.map((s) => s.toFixed(1)).join(", ")}`);
    console.log(`  Mean: ${result.mean.toFixed(2)}`);
    console.log(`  Std Dev: ${result.stdDev.toFixed(2)}`);
    console.log(`  Range: ${result.range.toFixed(1)} points`);
    console.log("");
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const overallPass = passed === total;

  console.log("=".repeat(80));
  console.log(
    `SUMMARY: ${passed}/${total} agents passed (variance < ${MAX_ACCEPTABLE_VARIANCE} points)`
  );
  console.log(overallPass ? "✅ OVERALL: PASS" : "❌ OVERALL: FAIL");
  console.log("=".repeat(80));
}

async function main(): Promise<void> {
  // Parse args
  const args = process.argv.slice(2);
  let runs = DEFAULT_RUNS;
  let dealId: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--runs=")) {
      runs = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--deal=")) {
      dealId = arg.split("=")[1];
    }
  }

  // Get deal ID if not provided
  if (!dealId) {
    dealId = await getTestDealId();
    if (!dealId) {
      console.error("No deal found with documents. Please create a test deal first.");
      process.exit(1);
    }
  }

  console.log("🧪 Variance Test for ReAct Agents");
  console.log(`   Target: < ${MAX_ACCEPTABLE_VARIANCE} points standard deviation`);
  console.log(`   Runs: ${runs}`);
  console.log(`   Deal: ${dealId}`);

  const results = await runVarianceTest(dealId, runs);
  printResults(results);

  await prisma.$disconnect();
}

main().catch(console.error);
