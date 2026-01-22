/**
 * Import FrenchWeb - FULL Historical Data
 *
 * FrenchWeb Categories:
 * - 11276: "LES LEVEES DE FONDS" = 3,356 posts
 * - 12024: "INVESTISSEMENTS" = 2,985 posts
 *
 * TOTAL POTENTIAL: ~6,000+ funding deals
 *
 * USAGE:
 *   npx tsx scripts/import-frenchweb-full.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================================
// PARSING HELPERS
// ============================================================================

function extractCompanyName(title: string): string {
  title = title.replace(/&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&#8217;/g, "'");

  const patterns = [
    /^([A-Z][A-Z0-9\-\.]+)\s+lève/i,
    /^([A-Z][a-zA-Z0-9\-\.]+)\s+lève/i,
    /^([A-Z][A-Z0-9\-\.]+)\s*:/i,
    /la startup\s+([A-Z][a-zA-Z0-9\-\.]+)/i,
    /^([A-Z][a-zA-Z0-9\-\.]+)\s+raises?/i,
    /^([A-Z][a-zA-Z0-9\-\.]+),/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const words = title.split(/\s+/);
  for (const word of words) {
    if (/^[A-Z][A-Za-z0-9\-\.]+$/.test(word) && word.length > 2) {
      return word;
    }
  }

  return title.slice(0, 50);
}

function extractAmount(text: string): number | undefined {
  text = text.replace(/&rsquo;/g, "'").replace(/&amp;/g, "&");

  const patterns = [
    /(\d+(?:[\.,]\d+)?)\s*millions?\s*d['']euros/i,
    /(\d+(?:[\.,]\d+)?)\s*M€/i,
    /(\d+(?:[\.,]\d+)?)\s*millions?\s*€/i,
    /€\s*(\d+(?:[\.,]\d+)?)\s*millions?/i,
    /(\d+(?:[\.,]\d+)?)\s*milliards?\s*d['']euros/i,
    /(\d+(?:[\.,]\d+)?)\s*milliards?/i,
    /(\$|€|£)(\d+(?:\.\d+)?)\s*(million|mn|mln|M|billion|bn|B)/i,
    /(\d+(?:\.\d+)?)\s*(million|mn|mln|M|billion|bn|B)\s*(dollars?|euros?|\$|€)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let valueStr = match[1];
      if (valueStr === "$" || valueStr === "€" || valueStr === "£") {
        valueStr = match[2];
      }
      let value = parseFloat(valueStr.replace(",", "."));

      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes("milliard") || fullMatch.includes("billion") || fullMatch.includes("bn")) {
        value *= 1_000_000_000;
      } else if (fullMatch.includes("million") || fullMatch.includes("mn") || fullMatch.includes("mln") || fullMatch.includes("m€")) {
        value *= 1_000_000;
      }

      if (value > 10000) return value;
    }
  }

  return undefined;
}

function extractSourceId(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1] || url.replace(/[^a-z0-9]/gi, "_").slice(0, 100);
  } catch {
    return url.replace(/[^a-z0-9]/gi, "_").slice(0, 100);
  }
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function normalizeStage(text: string): string | null {
  const textLower = text.toLowerCase();
  if (textLower.includes("série a") || textLower.includes("series a")) return "series_a";
  if (textLower.includes("série b") || textLower.includes("series b")) return "series_b";
  if (textLower.includes("série c") || textLower.includes("series c")) return "series_c";
  if (textLower.includes("série d") || textLower.includes("series d")) return "series_d";
  if (textLower.includes("amorçage") || textLower.includes("seed")) return "seed";
  if (textLower.includes("pré-seed") || textLower.includes("pre-seed")) return "pre_seed";
  return null;
}

// ============================================================================
// IMPORT FUNCTION
// ============================================================================

interface ParsedDeal {
  companyName: string;
  title: string;
  amount?: number;
  date?: string;
  url?: string;
  stage?: string | null;
}

async function fetchAllPages(categoryId: number, categoryName: string): Promise<ParsedDeal[]> {
  const allDeals: ParsedDeal[] = [];
  let page = 1;
  const perPage = 100;
  let totalPages = 1;

  console.log(`\n[FrenchWeb - ${categoryName}] Starting import...`);

  while (page <= totalPages) {
    try {
      const url = `https://www.frenchweb.fr/wp-json/wp/v2/posts?categories=${categoryId}&per_page=${perPage}&page=${page}&_fields=id,title,excerpt,date,link`;

      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
      });

      if (!response.ok) {
        console.log(`  HTTP ${response.status} at page ${page}`);
        break;
      }

      if (page === 1) {
        const totalPagesHeader = response.headers.get("X-WP-TotalPages");
        const totalHeader = response.headers.get("X-WP-Total");
        if (totalPagesHeader) {
          totalPages = parseInt(totalPagesHeader);
        }
        console.log(`  Total posts: ${totalHeader}, Pages: ${totalPages}`);
      }

      const posts = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        break;
      }

      for (const post of posts) {
        const title = (post.title?.rendered || "").replace(/&rsquo;/g, "'").replace(/&#8217;/g, "'");
        const excerpt = (post.excerpt?.rendered || "").replace(/<[^>]*>/g, "");

        const deal: ParsedDeal = {
          companyName: extractCompanyName(title),
          title: title,
          amount: extractAmount(title + " " + excerpt),
          date: post.date,
          url: post.link,
          stage: normalizeStage(title + " " + excerpt),
        };

        allDeals.push(deal);
      }

      console.log(`  Page ${page}/${totalPages}: ${posts.length} posts, ${allDeals.length} total`);

      page++;
      await new Promise(r => setTimeout(r, 300)); // Rate limiting
    } catch (error) {
      console.error(`  Error on page ${page}:`, error);
      break;
    }
  }

  console.log(`  [${categoryName}] Complete: ${allDeals.length} deals`);
  return allDeals;
}

async function insertDeals(deals: ParsedDeal[], source: string): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (const deal of deals) {
    try {
      const sourceId = extractSourceId(deal.url || `${deal.companyName}_${deal.date || Date.now()}`);
      const companySlug = normalizeCompanyName(deal.companyName);

      await prisma.fundingRound.upsert({
        where: {
          source_sourceId: {
            source,
            sourceId,
          },
        },
        create: {
          companyName: deal.companyName,
          companySlug,
          description: deal.title,
          amount: deal.amount || null,
          amountUsd: deal.amount ? deal.amount * 1.08 : null,
          currency: "EUR",
          stage: deal.stage,
          stageNormalized: deal.stage,
          geography: "France",
          region: "europe",
          fundingDate: deal.date ? new Date(deal.date) : null,
          source,
          sourceUrl: deal.url,
          sourceId,
        },
        update: {},
      });

      inserted++;
    } catch {
      errors++;
    }
  }

  return { inserted, errors };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         FRENCHWEB FULL HISTORICAL IMPORT                   ║");
  console.log("║                                                            ║");
  console.log("║  Categories:                                               ║");
  console.log("║  - 11276: LES LEVEES DE FONDS (3,356 posts)                ║");
  console.log("║  - 12024: INVESTISSEMENTS (2,985 posts)                    ║");
  console.log("║                                                            ║");
  console.log("║  Expected: ~6,000 funding deals                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Category 1: LES LEVEES DE FONDS
  const leveesDeals = await fetchAllPages(11276, "LEVEES DE FONDS");
  const leveesResult = await insertDeals(leveesDeals, "frenchweb_levees");
  console.log(`  Inserted: ${leveesResult.inserted}, Errors: ${leveesResult.errors}`);

  // Category 2: INVESTISSEMENTS
  const investDeals = await fetchAllPages(12024, "INVESTISSEMENTS");
  const investResult = await insertDeals(investDeals, "frenchweb_invest");
  console.log(`  Inserted: ${investResult.inserted}, Errors: ${investResult.errors}`);

  // Summary
  console.log("\n========================================");
  console.log("IMPORT SUMMARY");
  console.log("========================================");

  const stats = await prisma.fundingRound.groupBy({
    by: ["source"],
    _count: true,
  });

  const total = await prisma.fundingRound.count();

  console.log(`\nTotal rounds in DB: ${total}`);
  stats.forEach(s => {
    console.log(`  - ${s.source}: ${s._count}`);
  });

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
