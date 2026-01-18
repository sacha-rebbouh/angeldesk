import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Benchmark data based on industry reports:
 * - OpenView SaaS Benchmarks 2024
 * - Bessemer Cloud Index
 * - SaaS Capital Annual Report
 * - KeyBanc SaaS Survey
 */

interface BenchmarkData {
  sector: string;
  stage: string;
  metricName: string;
  p25: number;
  median: number;
  p75: number;
  source: string;
}

const benchmarks: BenchmarkData[] = [
  // ============================================================================
  // SAAS B2B - PRE-SEED
  // ============================================================================
  {
    sector: "SaaS B2B",
    stage: "PRE_SEED",
    metricName: "ARR Growth YoY",
    p25: 150,
    median: 250,
    p75: 400,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "PRE_SEED",
    metricName: "Valuation Multiple (x ARR)",
    p25: 20,
    median: 35,
    p75: 60,
    source: "SaaS Capital Report 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "PRE_SEED",
    metricName: "Burn Multiple",
    p25: 3.0,
    median: 2.0,
    p75: 1.2,
    source: "Bessemer Efficiency Score",
  },

  // ============================================================================
  // SAAS B2B - SEED
  // ============================================================================
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "ARR Growth YoY",
    p25: 80,
    median: 120,
    p75: 200,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "Net Revenue Retention",
    p25: 95,
    median: 110,
    p75: 130,
    source: "KeyBanc SaaS Survey 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "Gross Margin",
    p25: 65,
    median: 75,
    p75: 85,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "CAC Payback (months)",
    p25: 18,
    median: 12,
    p75: 8,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "Burn Multiple",
    p25: 2.5,
    median: 1.8,
    p75: 1.2,
    source: "Bessemer Efficiency Score",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "Valuation Multiple (x ARR)",
    p25: 15,
    median: 22,
    p75: 35,
    source: "SaaS Capital Report 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "LTV/CAC Ratio",
    p25: 2.5,
    median: 3.5,
    p75: 5.0,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SEED",
    metricName: "Magic Number",
    p25: 0.5,
    median: 0.75,
    p75: 1.0,
    source: "Bessemer Cloud Index",
  },

  // ============================================================================
  // SAAS B2B - SERIES A
  // ============================================================================
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "ARR Growth YoY",
    p25: 60,
    median: 100,
    p75: 150,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "Net Revenue Retention",
    p25: 100,
    median: 115,
    p75: 140,
    source: "KeyBanc SaaS Survey 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "Gross Margin",
    p25: 70,
    median: 78,
    p75: 85,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "CAC Payback (months)",
    p25: 15,
    median: 10,
    p75: 6,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "Burn Multiple",
    p25: 2.0,
    median: 1.5,
    p75: 1.0,
    source: "Bessemer Efficiency Score",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "Valuation Multiple (x ARR)",
    p25: 10,
    median: 15,
    p75: 25,
    source: "SaaS Capital Report 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_A",
    metricName: "Rule of 40",
    p25: 20,
    median: 40,
    p75: 60,
    source: "Bessemer Cloud Index",
  },

  // ============================================================================
  // SAAS B2B - SERIES B
  // ============================================================================
  {
    sector: "SaaS B2B",
    stage: "SERIES_B",
    metricName: "ARR Growth YoY",
    p25: 40,
    median: 70,
    p75: 100,
    source: "OpenView SaaS Benchmarks 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_B",
    metricName: "Net Revenue Retention",
    p25: 105,
    median: 120,
    p75: 145,
    source: "KeyBanc SaaS Survey 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_B",
    metricName: "Valuation Multiple (x ARR)",
    p25: 8,
    median: 12,
    p75: 20,
    source: "SaaS Capital Report 2024",
  },
  {
    sector: "SaaS B2B",
    stage: "SERIES_B",
    metricName: "Rule of 40",
    p25: 30,
    median: 45,
    p75: 70,
    source: "Bessemer Cloud Index",
  },

  // ============================================================================
  // FINTECH - SEED
  // ============================================================================
  {
    sector: "Fintech",
    stage: "SEED",
    metricName: "ARR Growth YoY",
    p25: 100,
    median: 150,
    p75: 250,
    source: "a]6z Fintech Report 2024",
  },
  {
    sector: "Fintech",
    stage: "SEED",
    metricName: "Net Revenue Retention",
    p25: 100,
    median: 115,
    p75: 140,
    source: "a16z Fintech Report 2024",
  },
  {
    sector: "Fintech",
    stage: "SEED",
    metricName: "Valuation Multiple (x ARR)",
    p25: 18,
    median: 28,
    p75: 45,
    source: "Dealroom Fintech Report 2024",
  },
  {
    sector: "Fintech",
    stage: "SEED",
    metricName: "Take Rate",
    p25: 0.5,
    median: 1.5,
    p75: 3.0,
    source: "a16z Fintech Report 2024",
  },

  // ============================================================================
  // FINTECH - SERIES A
  // ============================================================================
  {
    sector: "Fintech",
    stage: "SERIES_A",
    metricName: "ARR Growth YoY",
    p25: 80,
    median: 120,
    p75: 180,
    source: "a16z Fintech Report 2024",
  },
  {
    sector: "Fintech",
    stage: "SERIES_A",
    metricName: "Valuation Multiple (x ARR)",
    p25: 12,
    median: 20,
    p75: 35,
    source: "Dealroom Fintech Report 2024",
  },
  {
    sector: "Fintech",
    stage: "SERIES_A",
    metricName: "Net Revenue Retention",
    p25: 105,
    median: 120,
    p75: 150,
    source: "a16z Fintech Report 2024",
  },

  // ============================================================================
  // HEALTHTECH - SEED
  // ============================================================================
  {
    sector: "Healthtech",
    stage: "SEED",
    metricName: "ARR Growth YoY",
    p25: 60,
    median: 100,
    p75: 150,
    source: "Rock Health Digital Health Report 2024",
  },
  {
    sector: "Healthtech",
    stage: "SEED",
    metricName: "Valuation Multiple (x ARR)",
    p25: 12,
    median: 20,
    p75: 30,
    source: "Rock Health Digital Health Report 2024",
  },
  {
    sector: "Healthtech",
    stage: "SEED",
    metricName: "Gross Margin",
    p25: 55,
    median: 65,
    p75: 75,
    source: "Rock Health Digital Health Report 2024",
  },

  // ============================================================================
  // HEALTHTECH - SERIES A
  // ============================================================================
  {
    sector: "Healthtech",
    stage: "SERIES_A",
    metricName: "ARR Growth YoY",
    p25: 50,
    median: 80,
    p75: 120,
    source: "Rock Health Digital Health Report 2024",
  },
  {
    sector: "Healthtech",
    stage: "SERIES_A",
    metricName: "Valuation Multiple (x ARR)",
    p25: 8,
    median: 15,
    p75: 25,
    source: "Rock Health Digital Health Report 2024",
  },

  // ============================================================================
  // MARKETPLACE - SEED
  // ============================================================================
  {
    sector: "Marketplace",
    stage: "SEED",
    metricName: "GMV Growth YoY",
    p25: 100,
    median: 200,
    p75: 400,
    source: "a16z Marketplace Report 2024",
  },
  {
    sector: "Marketplace",
    stage: "SEED",
    metricName: "Take Rate",
    p25: 8,
    median: 15,
    p75: 25,
    source: "a16z Marketplace Report 2024",
  },
  {
    sector: "Marketplace",
    stage: "SEED",
    metricName: "Valuation Multiple (x GMV)",
    p25: 0.3,
    median: 0.5,
    p75: 1.0,
    source: "a16z Marketplace Report 2024",
  },

  // ============================================================================
  // AI/ML - SEED
  // ============================================================================
  {
    sector: "AI/ML",
    stage: "SEED",
    metricName: "ARR Growth YoY",
    p25: 150,
    median: 250,
    p75: 400,
    source: "Menlo Ventures AI Report 2024",
  },
  {
    sector: "AI/ML",
    stage: "SEED",
    metricName: "Valuation Multiple (x ARR)",
    p25: 25,
    median: 40,
    p75: 80,
    source: "Menlo Ventures AI Report 2024",
  },
  {
    sector: "AI/ML",
    stage: "SEED",
    metricName: "Gross Margin",
    p25: 50,
    median: 65,
    p75: 80,
    source: "Menlo Ventures AI Report 2024",
  },

  // ============================================================================
  // AI/ML - SERIES A
  // ============================================================================
  {
    sector: "AI/ML",
    stage: "SERIES_A",
    metricName: "ARR Growth YoY",
    p25: 100,
    median: 180,
    p75: 300,
    source: "Menlo Ventures AI Report 2024",
  },
  {
    sector: "AI/ML",
    stage: "SERIES_A",
    metricName: "Valuation Multiple (x ARR)",
    p25: 20,
    median: 35,
    p75: 60,
    source: "Menlo Ventures AI Report 2024",
  },

  // ============================================================================
  // DEEPTECH - SEED
  // ============================================================================
  {
    sector: "Deeptech",
    stage: "SEED",
    metricName: "R&D as % of Revenue",
    p25: 40,
    median: 60,
    p75: 80,
    source: "Dealroom Deeptech Report 2024",
  },
  {
    sector: "Deeptech",
    stage: "SEED",
    metricName: "Time to Revenue (months)",
    p25: 24,
    median: 36,
    p75: 48,
    source: "Dealroom Deeptech Report 2024",
  },
];

async function main() {
  console.log("🌱 Seeding benchmarks...\n");

  let created = 0;
  let updated = 0;

  for (const benchmark of benchmarks) {
    const result = await prisma.benchmark.upsert({
      where: {
        sector_stage_metricName: {
          sector: benchmark.sector,
          stage: benchmark.stage,
          metricName: benchmark.metricName,
        },
      },
      update: {
        p25: benchmark.p25,
        median: benchmark.median,
        p75: benchmark.p75,
        source: benchmark.source,
      },
      create: benchmark,
    });

    if (result.createdAt.getTime() === result.createdAt.getTime()) {
      // Check if it was an insert or update based on timing
      const isNew = Date.now() - result.createdAt.getTime() < 1000;
      if (isNew) {
        created++;
      } else {
        updated++;
      }
    }
  }

  console.log(`✅ Seeding complete!`);
  console.log(`   - ${benchmarks.length} benchmarks processed`);
  console.log(`   - Sectors: SaaS B2B, Fintech, Healthtech, Marketplace, AI/ML, Deeptech`);
  console.log(`   - Stages: PRE_SEED, SEED, SERIES_A, SERIES_B`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
