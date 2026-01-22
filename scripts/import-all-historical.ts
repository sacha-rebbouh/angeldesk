/**
 * Import ALL Historical Funding Data
 *
 * This script fetches ALL available historical funding deals from every source:
 * - FrenchWeb (WordPress API): ~2985 posts
 * - Maddyness (WordPress API): ~5170 posts
 * - EU-Startups (WordPress API): ~8203 funding posts
 * - Tech.eu (RSS): ~50 recent
 * - US Sources (RSS): ~100 recent
 *
 * USAGE:
 *   npx tsx scripts/import-all-historical.ts
 *
 * This can take 30-60 minutes to complete for full import.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

interface ParsedDeal {
  companyName: string;
  title: string;
  amount?: number;
  currency?: string;
  stage?: string;
  geography?: string;
  sector?: string;
  investors?: string[];
  date?: string;
  url?: string;
  sourceName?: string;
}

interface ImportResult {
  source: string;
  fetched: number;
  inserted: number;
  errors: number;
  duration: number;
}

// ============================================================================
// FUNDING KEYWORDS FILTER
// ============================================================================

const FUNDING_KEYWORDS = [
  "raises", "raised", "funding", "investment", "series a", "series b", "series c", "series d",
  "seed round", "pre-seed", "million", "billion", "closes", "secures", "backed",
  "funding round", "venture capital", "vc funding", "led by", "round led", "capital raise",
  "€", "$", "M€", "M$", "mn", "mln", "lève", "levée", "tour de table", "financement",
];

function isFundingArticle(title: string, excerpt: string = ""): boolean {
  const text = `${title} ${excerpt}`.toLowerCase();
  return FUNDING_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ============================================================================
// PARSING HELPERS
// ============================================================================

function extractCompanyName(title: string): string {
  // Try to extract company name from title
  const patterns = [
    /^([A-Z][a-zA-Z0-9\-\.]+)\s+(?:raises?|secures?|closes?|gets?|lands?|bags?)/i,
    /^([A-Z][a-zA-Z0-9\-\.]+)\s+lève/i,
    /^French\s+startup\s+([A-Z][a-zA-Z0-9\-\.]+)/i,
    /^([A-Z][a-zA-Z0-9\-\.]+)\s+snags?/i,
    /^([A-Z][a-zA-Z0-9\-\.]+),/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Fallback: first word(s) before common verbs
  const words = title.split(/\s+/);
  if (words.length > 0) {
    // Take first 1-3 words that look like a company name
    let name = "";
    for (let i = 0; i < Math.min(3, words.length); i++) {
      const word = words[i];
      if (/^(raises?|secures?|closes?|gets?|lands?|lève|snags?|announces?|is|has|the|a|an)$/i.test(word)) {
        break;
      }
      name += (name ? " " : "") + word;
    }
    if (name) return name;
  }

  return title.slice(0, 50);
}

function extractAmount(text: string): number | undefined {
  const patterns = [
    /(\$|€|£)(\d+(?:\.\d+)?)\s*(million|mn|mln|M|billion|bn|B)/i,
    /(\d+(?:\.\d+)?)\s*(million|mn|mln|M|billion|bn|B)\s*(dollars?|euros?|\$|€|£|USD|EUR)/i,
    /(\d+(?:\.\d+)?)\s*M€/i,
    /(\d+(?:\.\d+)?)\s*M\$/i,
    /€\s*(\d+(?:\.\d+)?)\s*(million|mn|mln|M)/i,
    /\$\s*(\d+(?:\.\d+)?)\s*(million|mn|mln|M)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let value: number;
      if (match[1] === "$" || match[1] === "€" || match[1] === "£") {
        value = parseFloat(match[2]);
      } else {
        value = parseFloat(match[1]);
      }

      const unit = match[3]?.toLowerCase() || match[2]?.toLowerCase() || "";
      if (unit.includes("billion") || unit === "bn" || unit === "b") {
        value *= 1_000_000_000;
      } else if (unit.includes("million") || unit === "mn" || unit === "mln" || unit === "m" || unit.includes("m€") || unit.includes("m$")) {
        value *= 1_000_000;
      }

      if (value > 10000) return value;
    }
  }

  return undefined;
}

function extractCurrency(text: string): string {
  if (text.includes("€") || text.toLowerCase().includes("euro")) return "EUR";
  if (text.includes("£") || text.toLowerCase().includes("pound")) return "GBP";
  return "USD";
}

function extractStage(text: string): string | undefined {
  const stageLower = text.toLowerCase();
  if (stageLower.includes("series a")) return "Series A";
  if (stageLower.includes("series b")) return "Series B";
  if (stageLower.includes("series c")) return "Series C";
  if (stageLower.includes("series d")) return "Series D";
  if (stageLower.includes("series e")) return "Series E";
  if (stageLower.includes("pre-seed") || stageLower.includes("preseed")) return "Pre-seed";
  if (stageLower.includes("seed")) return "Seed";
  if (stageLower.includes("growth")) return "Growth";
  if (stageLower.includes("late stage") || stageLower.includes("late-stage")) return "Late Stage";
  if (stageLower.includes("bridge")) return "Bridge";
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

function normalizeStage(stage: string | undefined): string | null {
  if (!stage) return null;
  const stageLower = stage.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mappings: Record<string, string> = {
    preseed: "pre_seed",
    seed: "seed",
    seriesa: "series_a",
    seriesb: "series_b",
    seriesc: "series_c",
    seriesd: "series_d",
    seriese: "series_e",
    growth: "growth",
    latestage: "late_stage",
    bridge: "bridge",
  };
  return mappings[stageLower] || stage.toLowerCase();
}

function getRegion(geography: string | undefined): string | null {
  if (!geography) return null;
  const geoLower = geography.toLowerCase();
  if (["france", "germany", "uk", "spain", "italy", "netherlands", "belgium", "sweden", "norway", "denmark", "finland", "poland", "portugal", "austria", "switzerland", "ireland"].some(c => geoLower.includes(c))) {
    return "europe";
  }
  if (["usa", "united states", "us", "canada"].some(c => geoLower.includes(c))) return "north_america";
  if (geoLower.includes("israel")) return "israel";
  if (["india", "china", "japan", "singapore"].some(c => geoLower.includes(c))) return "asia";
  if (geoLower.includes("australia")) return "oceania";
  return null;
}

// ============================================================================
// WORDPRESS API FETCHERS
// ============================================================================

async function fetchWordPressAllPages(
  baseUrl: string,
  categoryId: number | null,
  sourceName: string,
  filterFunding: boolean = true,
  defaultGeography: string = "Unknown"
): Promise<ParsedDeal[]> {
  const allDeals: ParsedDeal[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  console.log(`\n[${sourceName}] Starting full historical import...`);

  while (hasMore) {
    try {
      let url = `${baseUrl}?per_page=${perPage}&page=${page}&_fields=id,title,excerpt,date,link`;
      if (categoryId) {
        url += `&categories=${categoryId}`;
      }

      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 404) {
          // No more pages
          hasMore = false;
          break;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const posts = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        const title = post.title?.rendered || "";
        const excerpt = post.excerpt?.rendered || "";
        const plainExcerpt = excerpt.replace(/<[^>]*>/g, "");

        // Filter for funding articles if enabled
        if (filterFunding && !isFundingArticle(title, plainExcerpt)) {
          continue;
        }

        const deal: ParsedDeal = {
          companyName: extractCompanyName(title),
          title: title,
          amount: extractAmount(title + " " + plainExcerpt),
          currency: extractCurrency(title + " " + plainExcerpt),
          stage: extractStage(title + " " + plainExcerpt),
          geography: defaultGeography,
          date: post.date,
          url: post.link,
          sourceName,
        };

        allDeals.push(deal);
      }

      // Progress
      const totalHeader = response.headers.get("X-WP-Total");
      const total = totalHeader ? parseInt(totalHeader) : "?";
      console.log(`  [${sourceName}] Page ${page}: ${posts.length} posts, ${allDeals.length} funding deals (total: ${total})`);

      // Check if there are more pages
      const totalPages = response.headers.get("X-WP-TotalPages");
      if (totalPages && page >= parseInt(totalPages)) {
        hasMore = false;
      }

      page++;

      // Rate limiting - be nice to the APIs
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`  [${sourceName}] Error on page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`  [${sourceName}] Complete: ${allDeals.length} funding deals total`);
  return allDeals;
}

// ============================================================================
// RSS FEED FETCHER
// ============================================================================

async function fetchRssFeed(url: string, sourceName: string): Promise<ParsedDeal[]> {
  const deals: ParsedDeal[] = [];

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
    });

    if (!response.ok) {
      console.log(`  [${sourceName}] RSS fetch failed: ${response.status}`);
      return deals;
    }

    const xml = await response.text();

    // Simple XML parsing
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const itemXml of itemMatches) {
      const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
      const link = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || "";
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const description = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || "";

      // Filter for funding
      if (!isFundingArticle(title, description)) continue;

      const deal: ParsedDeal = {
        companyName: extractCompanyName(title),
        title: title,
        amount: extractAmount(title + " " + description),
        currency: extractCurrency(title + " " + description),
        stage: extractStage(title + " " + description),
        geography: "USA",
        date: pubDate ? new Date(pubDate).toISOString() : undefined,
        url: link,
        sourceName,
      };

      deals.push(deal);
    }

    console.log(`  [${sourceName}] RSS: ${deals.length} funding deals`);
  } catch (error) {
    console.error(`  [${sourceName}] RSS error:`, error);
  }

  return deals;
}

// ============================================================================
// DATABASE INSERT
// ============================================================================

async function insertDeals(deals: ParsedDeal[], source: string): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  // Process in batches
  const BATCH_SIZE = 50;

  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE);

    for (const deal of batch) {
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
            amount: deal.amount ? deal.amount : null,
            amountUsd: deal.amount ? deal.amount * (deal.currency === "EUR" ? 1.08 : 1) : null,
            currency: deal.currency || "USD",
            stage: deal.stage,
            stageNormalized: normalizeStage(deal.stage),
            geography: deal.geography,
            region: getRegion(deal.geography),
            fundingDate: deal.date ? new Date(deal.date) : null,
            source,
            sourceUrl: deal.url,
            sourceId,
          },
          update: {
            // Don't update if exists
          },
        });

        inserted++;
      } catch (err) {
        errors++;
        // Silent - duplicates are expected
      }
    }

    // Progress every 500
    if ((i + BATCH_SIZE) % 500 === 0) {
      console.log(`  [${source}] Inserted ${i + BATCH_SIZE}/${deals.length}...`);
    }
  }

  return { inserted, errors };
}

// ============================================================================
// MAIN IMPORT FUNCTIONS
// ============================================================================

async function importFrenchWeb(): Promise<ImportResult> {
  const startTime = Date.now();
  console.log("\n========================================");
  console.log("IMPORTING FRENCHWEB (France - WordPress)");
  console.log("========================================");

  // FrenchWeb "Levées de fonds" category
  const deals = await fetchWordPressAllPages(
    "https://www.frenchweb.fr/wp-json/wp/v2/posts",
    18, // Levées de fonds category
    "FrenchWeb",
    true,
    "France"
  );

  const result = await insertDeals(deals, "frenchweb_historical");

  return {
    source: "frenchweb",
    fetched: deals.length,
    inserted: result.inserted,
    errors: result.errors,
    duration: Date.now() - startTime,
  };
}

async function importMaddyness(): Promise<ImportResult> {
  const startTime = Date.now();
  console.log("\n========================================");
  console.log("IMPORTING MADDYNESS (France - WordPress)");
  console.log("========================================");

  // Maddyness "Levees-de-fonds" category
  const deals = await fetchWordPressAllPages(
    "https://www.maddyness.com/wp-json/wp/v2/posts",
    14, // Levées de fonds category ID
    "Maddyness",
    true,
    "France"
  );

  const result = await insertDeals(deals, "maddyness_historical");

  return {
    source: "maddyness",
    fetched: deals.length,
    inserted: result.inserted,
    errors: result.errors,
    duration: Date.now() - startTime,
  };
}

async function importEuStartups(): Promise<ImportResult> {
  const startTime = Date.now();
  console.log("\n========================================");
  console.log("IMPORTING EU-STARTUPS (Europe - WordPress)");
  console.log("========================================");

  // EU-Startups "Funding" category (ID 1282, ~8203 posts)
  const deals = await fetchWordPressAllPages(
    "https://www.eu-startups.com/wp-json/wp/v2/posts",
    1282, // Funding category
    "EU-Startups",
    false, // Already filtered by category
    "Europe"
  );

  const result = await insertDeals(deals, "eu_startups_historical");

  return {
    source: "eu_startups",
    fetched: deals.length,
    inserted: result.inserted,
    errors: result.errors,
    duration: Date.now() - startTime,
  };
}

async function importTechEu(): Promise<ImportResult> {
  const startTime = Date.now();
  console.log("\n========================================");
  console.log("IMPORTING TECH.EU (Europe - RSS)");
  console.log("========================================");

  const deals = await fetchRssFeed(
    "https://tech.eu/feed/",
    "Tech.eu"
  );

  const result = await insertDeals(deals, "tech_eu_historical");

  return {
    source: "tech_eu",
    fetched: deals.length,
    inserted: result.inserted,
    errors: result.errors,
    duration: Date.now() - startTime,
  };
}

async function importUSRss(): Promise<ImportResult> {
  const startTime = Date.now();
  console.log("\n========================================");
  console.log("IMPORTING US SOURCES (RSS)");
  console.log("========================================");

  const rssFeeds = [
    { url: "https://techcrunch.com/category/startups/feed/", name: "TechCrunch" },
    { url: "https://techcrunch.com/tag/funding/feed/", name: "TechCrunch-Funding" },
    { url: "https://news.crunchbase.com/feed/", name: "CrunchbaseNews" },
    { url: "https://venturebeat.com/feed/", name: "VentureBeat" },
    { url: "https://hnrss.org/newest?q=funding+OR+raises+OR+series", name: "HackerNews" },
  ];

  let allDeals: ParsedDeal[] = [];

  for (const feed of rssFeeds) {
    const deals = await fetchRssFeed(feed.url, feed.name);
    allDeals = allDeals.concat(deals.map(d => ({ ...d, geography: "USA" })));
    await new Promise(r => setTimeout(r, 500));
  }

  const result = await insertDeals(allDeals, "us_rss_historical");

  return {
    source: "us_rss",
    fetched: allDeals.length,
    inserted: result.inserted,
    errors: result.errors,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         FULL HISTORICAL FUNDING DATA IMPORT                ║");
  console.log("║                                                            ║");
  console.log("║  Sources:                                                  ║");
  console.log("║  - FrenchWeb (FR): ~2,985 posts since 2010                 ║");
  console.log("║  - Maddyness (FR): ~5,170 posts                            ║");
  console.log("║  - EU-Startups (EU): ~8,203 funding posts                  ║");
  console.log("║  - Tech.eu (EU): RSS recent                                ║");
  console.log("║  - US Sources: RSS recent (5 feeds)                        ║");
  console.log("║                                                            ║");
  console.log("║  Estimated time: 30-60 minutes                             ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const results: ImportResult[] = [];

  // Import from each source
  results.push(await importFrenchWeb());
  results.push(await importMaddyness());
  results.push(await importEuStartups());
  results.push(await importTechEu());
  results.push(await importUSRss());

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    IMPORT SUMMARY                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  let totalFetched = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  for (const r of results) {
    console.log(`\n${r.source}:`);
    console.log(`  - Fetched: ${r.fetched}`);
    console.log(`  - Inserted: ${r.inserted}`);
    console.log(`  - Errors: ${r.errors}`);
    console.log(`  - Duration: ${(r.duration / 1000).toFixed(1)}s`);

    totalFetched += r.fetched;
    totalInserted += r.inserted;
    totalErrors += r.errors;
  }

  console.log("\n----------------------------------------");
  console.log(`TOTAL:`);
  console.log(`  - Fetched: ${totalFetched}`);
  console.log(`  - Inserted: ${totalInserted}`);
  console.log(`  - Errors/Duplicates: ${totalErrors}`);

  // Final DB stats
  const dbCount = await prisma.fundingRound.count();
  const bySource = await prisma.fundingRound.groupBy({
    by: ["source"],
    _count: true,
  });

  console.log("\n----------------------------------------");
  console.log("DATABASE STATS:");
  console.log(`  - Total rounds in DB: ${dbCount}`);
  bySource.forEach(s => {
    console.log(`  - ${s.source}: ${s._count}`);
  });

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
