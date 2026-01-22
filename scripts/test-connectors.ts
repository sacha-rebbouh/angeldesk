/**
 * Quick test script for Context Engine connectors
 *
 * Tests each connector with a sample French company query
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/test-connectors.ts
 */

import { getConfiguredConnectors, enrichDeal } from "../src/services/context-engine";

// Test companies
const TEST_QUERIES = [
  { companyName: "Alan", sector: "insurtech", geography: "France", stage: "Series D" },
  { companyName: "Qonto", sector: "fintech", geography: "France", stage: "Series D" },
  { companyName: "Swile", sector: "fintech", geography: "France", stage: "Series C" },
];

async function testConnectors() {
  console.log("=".repeat(60));
  console.log("CONTEXT ENGINE - CONNECTORS TEST");
  console.log("=".repeat(60));
  console.log();

  // 1. List configured connectors
  const connectors = getConfiguredConnectors();
  console.log(`✅ ${connectors.length} connectors configured:\n`);

  for (const connector of connectors) {
    console.log(`   - ${connector.name} (${connector.type})`);
  }
  console.log();

  // 2. Test enrichDeal with a sample query
  console.log("=".repeat(60));
  console.log("TESTING enrichDeal()");
  console.log("=".repeat(60));
  console.log();

  for (const query of TEST_QUERIES) {
    console.log(`\n📊 Testing: ${query.companyName} (${query.sector})`);
    console.log("-".repeat(40));

    try {
      const startTime = Date.now();
      const context = await enrichDeal(query, { forceRefresh: true });
      const duration = Date.now() - startTime;

      console.log(`   ⏱️  Duration: ${duration}ms`);
      console.log(`   📈 Completeness: ${Math.round(context.completeness * 100)}%`);
      console.log(`   📰 News articles: ${context.newsSentiment?.articles.length || 0}`);
      console.log(`   🏢 Similar deals: ${context.dealIntelligence?.similarDeals.length || 0}`);
      console.log(`   🎯 Competitors: ${context.competitiveLandscape?.competitors.length || 0}`);
      console.log(`   📊 Market data: ${context.marketData ? "Yes" : "No"}`);
      console.log(`   🔗 Sources used: ${context.sources.length}`);

      // Show some similar deals if found
      if (context.dealIntelligence?.similarDeals.length) {
        console.log(`\n   Similar deals found:`);
        for (const deal of context.dealIntelligence.similarDeals.slice(0, 3)) {
          console.log(`     - ${deal.companyName}: ${deal.fundingAmount ? `€${(deal.fundingAmount / 1_000_000).toFixed(1)}M` : "N/A"} (${deal.stage || "Unknown stage"})`);
        }
      }

      // Show news if found
      if (context.newsSentiment?.articles.length) {
        console.log(`\n   Recent news:`);
        for (const article of context.newsSentiment.articles.slice(0, 2)) {
          console.log(`     - [${article.sentiment}] ${article.title.slice(0, 60)}...`);
        }
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
}

// Run
testConnectors().catch(console.error);
