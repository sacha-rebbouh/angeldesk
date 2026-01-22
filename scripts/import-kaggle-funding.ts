/**
 * Import Kaggle Funding Dataset
 *
 * Downloads and imports startup funding data from Kaggle datasets.
 *
 * RECOMMENDED DATASETS (download manually from Kaggle):
 *
 * 1. "Crunchbase Investments" (~100K+ rounds)
 *    https://www.kaggle.com/datasets/justinas/startup-investments
 *    File: investments_VC.csv
 *
 * 2. "Startup Funding Rounds" (~50K rounds)
 *    https://www.kaggle.com/datasets/arindam235/startup-investments-crunchbase
 *    File: investments.csv
 *
 * 3. "Y Combinator Companies" (~3K companies)
 *    https://www.kaggle.com/datasets/miguelcorraljr/y-combinator-all-funded-companies-dataset
 *
 * USAGE:
 *   npx tsx scripts/import-kaggle-funding.ts ./data/investments.csv
 *
 * The script auto-detects the dataset format based on column names.
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

interface CsvRow {
  [key: string]: string;
}

interface ParsedRound {
  companyName: string;
  amount?: number;
  currency: string;
  stage?: string;
  geography?: string;
  city?: string;
  sector?: string;
  investors?: string[];
  fundingDate?: Date;
  source: string;
  sourceId: string;
}

// ============================================================================
// COLUMN MAPPINGS FOR DIFFERENT DATASETS
// ============================================================================

const COLUMN_MAPPINGS = {
  // Crunchbase Investments dataset
  crunchbase: {
    companyName: ["company_name", "name", "startup_name", "company"],
    amount: ["raised_amount_usd", "funding_total_usd", "amount", "raised_amount", "funding_amount"],
    currency: ["currency_code", "currency"],
    stage: ["funding_round_type", "round", "stage", "series"],
    geography: ["country_code", "country", "company_country_code", "hq_country"],
    city: ["company_city", "city", "hq_city"],
    sector: ["company_category_list", "category_list", "sector", "industry", "market"],
    investors: ["investor_names", "investors", "investor_name"],
    fundingDate: ["funded_at", "announced_on", "funding_date", "date"],
    foundedYear: ["founded_at", "founded_year", "founded_on"],
  },
};

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function findColumn(row: CsvRow, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) {
      return row[candidate];
    }
    // Try case-insensitive match
    const key = Object.keys(row).find(k => k.toLowerCase() === candidate.toLowerCase());
    if (key) return row[key];
  }
  return undefined;
}

function parseAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[$€£,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

function normalizeStage(stage: string | undefined): string | undefined {
  if (!stage) return undefined;

  const stageLower = stage.toLowerCase().trim();

  const mappings: Record<string, string> = {
    "pre-seed": "Pre-seed",
    "preseed": "Pre-seed",
    "angel": "Pre-seed",
    "seed": "Seed",
    "series_a": "Series A",
    "series a": "Series A",
    "a": "Series A",
    "series_b": "Series B",
    "series b": "Series B",
    "b": "Series B",
    "series_c": "Series C",
    "series c": "Series C",
    "c": "Series C",
    "series_d": "Series D",
    "series d": "Series D",
    "d": "Series D",
    "series_e": "Series E",
    "series e": "Series E",
    "venture": "Venture",
    "late_stage_venture": "Late Stage",
    "private_equity": "Private Equity",
    "post_ipo_equity": "Post-IPO",
    "debt_financing": "Debt",
    "convertible_note": "Convertible Note",
    "grant": "Grant",
    "secondary_market": "Secondary",
    "undisclosed": undefined,
  };

  return mappings[stageLower] || stage;
}

function normalizeSector(categoryList: string | undefined): string | undefined {
  if (!categoryList) return undefined;

  const categories = categoryList.toLowerCase();

  if (categories.includes("fintech") || categories.includes("financial")) return "fintech";
  if (categories.includes("health") || categories.includes("medical") || categories.includes("biotech")) return "healthtech";
  if (categories.includes("saas") || categories.includes("software") || categories.includes("enterprise")) return "saas";
  if (categories.includes("ai") || categories.includes("machine learning") || categories.includes("artificial")) return "ai";
  if (categories.includes("e-commerce") || categories.includes("ecommerce") || categories.includes("retail")) return "ecommerce";
  if (categories.includes("marketplace")) return "marketplace";
  if (categories.includes("edtech") || categories.includes("education")) return "edtech";
  if (categories.includes("cleantech") || categories.includes("energy") || categories.includes("climate")) return "greentech";
  if (categories.includes("food") || categories.includes("agri")) return "foodtech";
  if (categories.includes("real estate") || categories.includes("proptech")) return "proptech";
  if (categories.includes("cyber") || categories.includes("security")) return "cybersecurity";
  if (categories.includes("crypto") || categories.includes("blockchain")) return "crypto";
  if (categories.includes("gaming") || categories.includes("games")) return "gaming";
  if (categories.includes("transport") || categories.includes("mobility") || categories.includes("auto")) return "mobility";
  if (categories.includes("logistics") || categories.includes("supply chain")) return "logistics";
  if (categories.includes("hr") || categories.includes("recruiting")) return "hrtech";
  if (categories.includes("hardware") || categories.includes("deeptech")) return "deeptech";

  return undefined;
}

function normalizeCountry(code: string | undefined): string | undefined {
  if (!code) return undefined;

  const mappings: Record<string, string> = {
    USA: "USA",
    US: "USA",
    "United States": "USA",
    GBR: "UK",
    GB: "UK",
    "United Kingdom": "UK",
    DEU: "Germany",
    DE: "Germany",
    FRA: "France",
    FR: "France",
    NLD: "Netherlands",
    NL: "Netherlands",
    ESP: "Spain",
    ES: "Spain",
    ITA: "Italy",
    IT: "Italy",
    SWE: "Sweden",
    SE: "Sweden",
    CHE: "Switzerland",
    CH: "Switzerland",
    IRL: "Ireland",
    IE: "Ireland",
    ISR: "Israel",
    IL: "Israel",
    IND: "India",
    IN: "India",
    CHN: "China",
    CN: "China",
    CAN: "Canada",
    CA: "Canada",
    AUS: "Australia",
    AU: "Australia",
    SGP: "Singapore",
    SG: "Singapore",
    JPN: "Japan",
    JP: "Japan",
    BRA: "Brazil",
    BR: "Brazil",
  };

  return mappings[code.toUpperCase()] || code;
}

function parseInvestors(value: string | undefined): string[] {
  if (!value) return [];
  // Handle comma-separated or pipe-separated lists
  return value
    .split(/[,|]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100)
    .slice(0, 10);
}

// ============================================================================
// IMPORT FUNCTION
// ============================================================================

function parseRow(row: CsvRow): ParsedRound | null {
  const mapping = COLUMN_MAPPINGS.crunchbase;

  const companyName = findColumn(row, mapping.companyName);
  if (!companyName) return null;

  const amount = parseAmount(findColumn(row, mapping.amount));
  const stage = normalizeStage(findColumn(row, mapping.stage));
  const geography = normalizeCountry(findColumn(row, mapping.geography));
  const sector = normalizeSector(findColumn(row, mapping.sector));
  const fundingDate = parseDate(findColumn(row, mapping.fundingDate));
  const investors = parseInvestors(findColumn(row, mapping.investors));
  const city = findColumn(row, mapping.city);

  // Skip rounds without amount (can't use for benchmarking)
  if (!amount || amount < 10000) return null;

  // Generate unique ID
  const dateStr = fundingDate?.toISOString().split("T")[0] || "unknown";
  const sourceId = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}_${stage || "unknown"}_${dateStr}`;

  return {
    companyName,
    amount,
    currency: "USD",
    stage,
    geography,
    city,
    sector,
    investors,
    fundingDate,
    source: "kaggle_crunchbase",
    sourceId,
  };
}

async function importCsv(filePath: string): Promise<void> {
  console.log(`\n📂 Reading file: ${filePath}\n`);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.log("\nDownload a dataset from Kaggle:");
    console.log("  https://www.kaggle.com/datasets/justinas/startup-investments");
    console.log("  https://www.kaggle.com/datasets/arindam235/startup-investments-crunchbase");
    process.exit(1);
  }

  // Read and parse CSV
  const content = fs.readFileSync(filePath, "utf-8");
  const records: CsvRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`📊 Total rows in CSV: ${records.length}`);

  // Parse rows
  const rounds: ParsedRound[] = [];
  let skipped = 0;

  for (const row of records) {
    const parsed = parseRow(row);
    if (parsed) {
      rounds.push(parsed);
    } else {
      skipped++;
    }
  }

  console.log(`✅ Valid rounds parsed: ${rounds.length}`);
  console.log(`⏭️  Skipped (no amount/invalid): ${skipped}`);

  // Show sample
  console.log("\n📋 Sample rounds:");
  rounds.slice(0, 3).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.companyName} - $${(r.amount! / 1_000_000).toFixed(1)}M ${r.stage || ""} (${r.geography || "Unknown"})`);
  });

  // Confirm import
  console.log(`\n🚀 Importing ${rounds.length} rounds to database...\n`);

  // Import in batches
  const BATCH_SIZE = 500;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < rounds.length; i += BATCH_SIZE) {
    const batch = rounds.slice(i, i + BATCH_SIZE);

    try {
      // Prepare data for createMany
      const data = batch.map(r => ({
        companyName: r.companyName,
        companySlug: r.companyName.toLowerCase().replace(/[^a-z0-9]/g, ""),
        amount: r.amount,
        amountUsd: r.amount,
        currency: r.currency,
        stage: r.stage,
        stageNormalized: r.stage?.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        geography: r.geography,
        city: r.city,
        region: getRegion(r.geography),
        sector: r.sector,
        sectorNormalized: r.sector,
        investors: r.investors || [],
        fundingDate: r.fundingDate,
        source: r.source,
        sourceId: r.sourceId,
      }));

      await prisma.fundingRound.createMany({
        data,
        skipDuplicates: true,
      });

      imported += batch.length;
    } catch (error) {
      console.error(`Error importing batch ${i}-${i + BATCH_SIZE}:`, error);
      errors += batch.length;
    }

    // Progress
    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= rounds.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, rounds.length)}/${rounds.length} (${errors} errors)`);
    }
  }

  // Final stats
  console.log("\n✅ Import complete!");
  console.log(`  - Imported: ${imported}`);
  console.log(`  - Errors: ${errors}`);

  // Show DB stats
  const total = await prisma.fundingRound.count();
  const bySource = await prisma.fundingRound.groupBy({
    by: ["source"],
    _count: true,
  });

  console.log(`\n📊 Database stats:`);
  console.log(`  - Total rounds: ${total}`);
  bySource.forEach(s => {
    console.log(`  - ${s.source}: ${s._count}`);
  });
}

function getRegion(geography: string | undefined): string | null {
  if (!geography) return null;

  const europeCountries = ["France", "Germany", "UK", "Spain", "Italy", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Poland", "Portugal", "Austria", "Switzerland", "Ireland"];
  const naCountries = ["USA", "Canada"];

  if (europeCountries.includes(geography)) return "europe";
  if (naCountries.includes(geography)) return "north_america";
  if (geography === "Israel") return "israel";
  if (["India", "China", "Japan", "Singapore"].includes(geography)) return "asia";
  if (geography === "Australia") return "oceania";

  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/import-kaggle-funding.ts <csv-file>

Download datasets from:
  1. https://www.kaggle.com/datasets/justinas/startup-investments
  2. https://www.kaggle.com/datasets/arindam235/startup-investments-crunchbase

Example:
  npx tsx scripts/import-kaggle-funding.ts ./data/investments.csv
    `);
    process.exit(0);
  }

  const filePath = path.resolve(args[0]);
  await importCsv(filePath);

  await prisma.$disconnect();
}

main().catch(console.error);
