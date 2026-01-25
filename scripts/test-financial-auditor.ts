#!/usr/bin/env npx tsx
/**
 * Test financial-auditor agent on Antiopea
 */

import { prisma } from "../src/lib/prisma";
import { enrichDeal } from "../src/services/context-engine";
import { financialAuditor } from "../src/agents/tier1";
import { documentExtractor } from "../src/agents/document-extractor";

async function main() {
  const deal = await prisma.deal.findFirst({
    where: { name: { contains: "Antiopea" } },
    include: { documents: true, founders: true },
  });

  if (!deal) {
    console.log("Deal not found");
    return;
  }

  console.log("Found deal:", deal.name);
  console.log("Documents:", deal.documents.length);

  // Enrich context
  console.log("\nEnriching context...");
  const contextEngine = await enrichDeal({
    dealName: deal.name,
    companyName: deal.companyName || deal.name,
    sector: deal.sector || undefined,
    stage: deal.stage || undefined,
    founders: [],
  });

  // Run document extractor first
  console.log("\nRunning document-extractor...");
  const extractorResult = await documentExtractor.run({
    deal,
    documents: deal.documents,
    contextEngine,
  });
  console.log("Extractor success:", extractorResult.success);

  // Run financial auditor
  console.log("\nRunning financial-auditor...");
  const result = await financialAuditor.run({
    deal,
    documents: deal.documents,
    contextEngine,
    previousResults: { "document-extractor": extractorResult },
  });

  console.log("\n" + "=".repeat(60));
  console.log("FINANCIAL AUDITOR RESULT");
  console.log("=".repeat(60));
  console.log("Success:", result.success);
  console.log("Time:", result.executionTimeMs + "ms");
  console.log("Cost:", "$" + result.cost.toFixed(4));

  if (result.success && result.data) {
    const d = result.data;

    console.log("\n--- METRICS ANALYSIS ---");
    console.log("Count:", d.metricsAnalysis.length);
    for (const m of d.metricsAnalysis) {
      console.log(`  • ${m.metric} [${m.category}] - ${m.status}`);
      if (m.investorConcern) {
        console.log(`    └─ ${m.investorConcern.substring(0, 80)}...`);
      }
    }

    console.log("\n--- PROJECTIONS ANALYSIS ---");
    console.log("Has projections:", d.projectionsAnalysis.hasProjections);
    console.log("Realistic:", d.projectionsAnalysis.projectionsRealistic);
    if (d.projectionsAnalysis.redFlags.length > 0) {
      console.log("Red flags:");
      for (const rf of d.projectionsAnalysis.redFlags) {
        console.log(`  • ${rf}`);
      }
    }

    console.log("\n--- FINANCIAL RED FLAGS ---");
    console.log("Count:", d.financialRedFlags.length);
    for (const rf of d.financialRedFlags) {
      console.log(`  • [${rf.category}] ${rf.flag}`);
      console.log(`    Severity: ${rf.severity}`);
      console.log(`    Evidence: ${rf.evidence.substring(0, 60)}...`);
    }

    console.log("\n--- FINANCIAL QUESTIONS ---");
    console.log("Count:", d.financialQuestions.length);
    for (const q of d.financialQuestions) {
      console.log(`  • ${q.question}`);
      console.log(`    Context: ${q.context.substring(0, 60)}...`);
    }

    console.log("\n--- OVERALL ASSESSMENT ---");
    console.log("Score:", d.overallAssessment.score);
    console.log("Data completeness:", d.overallAssessment.dataCompleteness);
    console.log("Summary:", d.overallAssessment.summary);
    console.log("Key risks:");
    for (const risk of d.overallAssessment.keyRisks) {
      console.log(`  • ${risk}`);
    }
    console.log("Key strengths:");
    for (const strength of d.overallAssessment.keyStrengths) {
      console.log(`  • ${strength}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
