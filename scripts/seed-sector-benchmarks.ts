/**
 * Seed Sector Benchmarks
 *
 * Imports hardcoded sector benchmarks into the database.
 * Run with: npx dotenv -e .env.local -- npx ts-node scripts/seed-sector-benchmarks.ts
 *
 * Options:
 *   --force : Overwrite existing records
 *   --dry-run : Show what would be done without making changes
 */

import { PrismaClient } from "@prisma/client";
import {
  SAAS_BENCHMARKS,
  FINTECH_BENCHMARKS,
  MARKETPLACE_BENCHMARKS,
  HEALTHTECH_BENCHMARKS,
  DEEPTECH_BENCHMARKS,
  CLIMATE_BENCHMARKS,
  HARDWARE_BENCHMARKS,
  GAMING_BENCHMARKS,
  CONSUMER_BENCHMARKS,
  type SectorBenchmarkData,
} from "../src/agents/tier3/sector-benchmarks";

const prisma = new PrismaClient();

const ALL_BENCHMARKS: SectorBenchmarkData[] = [
  SAAS_BENCHMARKS,
  FINTECH_BENCHMARKS,
  MARKETPLACE_BENCHMARKS,
  HEALTHTECH_BENCHMARKS,
  DEEPTECH_BENCHMARKS,
  CLIMATE_BENCHMARKS,
  HARDWARE_BENCHMARKS,
  GAMING_BENCHMARKS,
  CONSUMER_BENCHMARKS,
];

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("SEED SECTOR BENCHMARKS");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : force ? "FORCE" : "NORMAL"}`);
  console.log(`Sectors to seed: ${ALL_BENCHMARKS.length}`);
  console.log("");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const benchmark of ALL_BENCHMARKS) {
    const sector = benchmark.sector;

    // Check if exists
    const existing = await prisma.sectorBenchmark.findUnique({
      where: { sector },
    });

    if (existing && !force) {
      console.log(`⏭️  SKIP: ${sector} (already exists, use --force to overwrite)`);
      skipped++;
      continue;
    }

    // Count metrics for summary
    const primaryCount = benchmark.primaryMetrics.length;
    const secondaryCount = benchmark.secondaryMetrics.length;
    const redFlagCount = benchmark.redFlagRules.length;

    if (dryRun) {
      if (existing) {
        console.log(
          `🔄 WOULD UPDATE: ${sector} (${primaryCount} primary, ${secondaryCount} secondary, ${redFlagCount} red flags)`
        );
      } else {
        console.log(
          `✨ WOULD CREATE: ${sector} (${primaryCount} primary, ${secondaryCount} secondary, ${redFlagCount} red flags)`
        );
      }
      continue;
    }

    // Upsert
    await prisma.sectorBenchmark.upsert({
      where: { sector },
      create: {
        sector,
        data: benchmark as unknown as object,
        version: 1,
        source: "Hardcoded v1.0 - Initial seed",
      },
      update: {
        data: benchmark as unknown as object,
        version: existing ? existing.version + 1 : 1,
        source: `Hardcoded v1.0 - Updated ${new Date().toISOString().split("T")[0]}`,
      },
    });

    if (existing) {
      console.log(
        `🔄 UPDATED: ${sector} (v${existing.version} → v${existing.version + 1})`
      );
      updated++;
    } else {
      console.log(
        `✨ CREATED: ${sector} (${primaryCount} primary, ${secondaryCount} secondary, ${redFlagCount} red flags)`
      );
      created++;
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${ALL_BENCHMARKS.length}`);

  if (dryRun) {
    console.log("");
    console.log("ℹ️  This was a dry run. No changes were made.");
    console.log("   Run without --dry-run to apply changes.");
  }
}

main()
  .catch((error) => {
    console.error("Error seeding benchmarks:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
