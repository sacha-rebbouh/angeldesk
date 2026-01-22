/**
 * Quick test for FrenchWeb and Maddyness API funding data
 */

import { getRecentFrenchFunding } from "../src/services/context-engine/connectors/frenchweb-api";
import { getRecentMaddynessFunding } from "../src/services/context-engine/connectors/maddyness-api";

async function testFundingAPIs() {
  console.log("=".repeat(60));
  console.log("FUNDING APIs TEST");
  console.log("=".repeat(60));
  console.log();

  // Test FrenchWeb
  console.log("📰 Testing FrenchWeb API...");
  const startFW = Date.now();
  const fwDeals = await getRecentFrenchFunding(1000);
  const durationFW = Date.now() - startFW;

  console.log(`   ✅ FrenchWeb: ${fwDeals.length} deals parsed in ${(durationFW / 1000).toFixed(1)}s`);

  // Show some stats
  const fwBySector: Record<string, number> = {};
  const fwByStage: Record<string, number> = {};
  let fwTotalAmount = 0;

  for (const deal of fwDeals) {
    fwBySector[deal.sector || "unknown"] = (fwBySector[deal.sector || "unknown"] || 0) + 1;
    fwByStage[deal.stage || "unknown"] = (fwByStage[deal.stage || "unknown"] || 0) + 1;
    fwTotalAmount += deal.amount || 0;
  }

  console.log(`   💰 Total amount: €${(fwTotalAmount / 1_000_000_000).toFixed(2)}B`);
  console.log(`   📊 Top sectors:`, Object.entries(fwBySector).sort((a, b) => b[1] - a[1]).slice(0, 5));
  console.log(`   📈 By stage:`, fwByStage);

  // Show sample deals
  console.log("\n   Recent deals:");
  for (const deal of fwDeals.slice(0, 5)) {
    console.log(`     - ${deal.companyName}: €${((deal.amount || 0) / 1_000_000).toFixed(1)}M (${deal.stage || "?"}) - ${deal.sector || "?"}`);
  }

  console.log();
  console.log("-".repeat(60));
  console.log();

  // Test Maddyness
  console.log("📰 Testing Maddyness API...");
  const startMN = Date.now();
  const mnDeals = await getRecentMaddynessFunding(1000);
  const durationMN = Date.now() - startMN;

  console.log(`   ✅ Maddyness: ${mnDeals.length} deals parsed in ${(durationMN / 1000).toFixed(1)}s`);

  // Show some stats
  const mnBySector: Record<string, number> = {};
  let mnTotalAmount = 0;

  for (const deal of mnDeals) {
    mnBySector[deal.sector || "unknown"] = (mnBySector[deal.sector || "unknown"] || 0) + 1;
    mnTotalAmount += deal.amount || 0;
  }

  console.log(`   💰 Total amount: €${(mnTotalAmount / 1_000_000_000).toFixed(2)}B`);
  console.log(`   📊 Top sectors:`, Object.entries(mnBySector).sort((a, b) => b[1] - a[1]).slice(0, 5));

  // Show sample deals
  console.log("\n   Recent deals:");
  for (const deal of mnDeals.slice(0, 5)) {
    console.log(`     - ${deal.companyName}: €${((deal.amount || 0) / 1_000_000).toFixed(1)}M (${deal.stage || "?"}) - ${deal.sector || "?"}`);
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`TOTAL: ${fwDeals.length + mnDeals.length} funding rounds`);
  console.log(`TOTAL AMOUNT: €${((fwTotalAmount + mnTotalAmount) / 1_000_000_000).toFixed(2)}B`);
  console.log("=".repeat(60));
}

testFundingAPIs().catch(console.error);
