/**
 * Full FrenchWeb Enrichment Script
 *
 * Fetches all articles from FrenchWeb funding categories and enriches them
 * with structured data using Claude 3.5 Haiku via OpenRouter.
 *
 * Categories:
 * - 11276: "LES LEVEES DE FONDS" (~3,356 posts)
 * - 12024: "INVESTISSEMENTS" (~2,985 posts)
 *
 * USAGE:
 *   npx dotenv -e .env.local -- npx tsx scripts/enrich-frenchweb-full.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================================================================
// TYPES
// ============================================================================

interface EnrichedDeal {
  companyName: string | null;
  amount: number | null;
  currency: string | null;
  stage: string | null;
  valuation: number | null;
  investors: string[];
  leadInvestor: string | null;
  sector: string | null;
  geography: string | null;
  arr: number | null;
  revenue: number | null;
  growthRate: number | null;
  employees: number | null;
  customers: number | null;
  nrr: number | null;
  investorTypes: string[];
  previousRounds: string | null;
  totalRaised: number | null;
  useOfFunds: string | null;
  competitors: string[];
  fundingDate: string | null;
  companyDescription: string | null;
  confidenceScore: number;
  sourceUrl: string;
}

interface FailedArticle {
  url: string;
  title: string;
  error: string;
  category: string;
}

interface WordPressPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  link: string;
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_PROMPT = `Tu es un expert en analyse de levées de fonds. Extrais TOUTES les informations de cet article de manière structurée.

RÈGLES:
- Sois PRÉCIS: n'invente rien, extrait uniquement ce qui est explicitement mentionné
- Pour les montants, convertis en nombre (ex: "15 millions d'euros" → 15000000)
- Si une info n'est pas mentionnée, mets null
- Pour le confidence_score: 0-100 basé sur la qualité/complétude des données extraites

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de commentaires):

{
  "company_name": "string ou null",
  "amount": "nombre ou null (en unité de base, ex: 15000000 pour 15M€)",
  "currency": "EUR, USD, GBP ou null",
  "stage": "Pre-seed, Seed, Series A, Series B, Series C, Series D, Growth, Bridge ou null",
  "valuation": "nombre ou null",
  "investors": ["liste des investisseurs mentionnés"],
  "lead_investor": "string ou null",
  "sector": "SaaS, FinTech, HealthTech, EdTech, CleanTech, FoodTech, Marketplace, AI, Cybersecurity, etc. ou null",
  "geography": "pays du siège ou null",

  "arr": "nombre ou null",
  "revenue": "nombre ou null",
  "growth_rate": "nombre en % ou null (ex: 150 pour 150%)",
  "employees": "nombre ou null",
  "customers": "nombre ou null",
  "nrr": "nombre en % ou null",

  "investor_types": ["VC", "PE", "Corporate", "BA", "Family Office", etc.],
  "previous_rounds": "description des rounds précédents ou null",
  "total_raised": "total levé à date ou null",
  "use_of_funds": "utilisation prévue des fonds ou null",
  "competitors": ["concurrents mentionnés"],

  "funding_date": "YYYY-MM-DD ou null",
  "company_description": "description courte de l'activité ou null",
  "confidence_score": "0-100"
}`;

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
    });
    const html = await response.text();

    // Extract main content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let content = articleMatch ? articleMatch[1] : html;

    // Remove HTML tags
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    content = content.replace(/<[^>]+>/g, " ");
    content = content.replace(/&nbsp;/g, " ");
    content = content.replace(/&rsquo;/g, "'");
    content = content.replace(/&amp;/g, "&");
    content = content.replace(/&#8217;/g, "'");
    content = content.replace(/\s+/g, " ");
    content = content.trim();

    // Limit to first 4000 chars to save tokens
    return content.slice(0, 4000);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return "";
  }
}

async function fetchAllPosts(categoryId: number, categoryName: string): Promise<WordPressPost[]> {
  const allPosts: WordPressPost[] = [];
  let page = 1;
  const perPage = 100;
  let totalPages = 1;

  console.log(`\n[${categoryName}] Fetching posts...`);

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

      allPosts.push(...posts);
      console.log(`  Page ${page}/${totalPages}: ${posts.length} posts, ${allPosts.length} total`);

      page++;
      await new Promise(r => setTimeout(r, 200)); // Rate limiting
    } catch (error) {
      console.error(`  Error on page ${page}:`, error);
      break;
    }
  }

  return allPosts;
}

// ============================================================================
// LLM EXTRACTION
// ============================================================================

async function extractWithLLM(content: string, url: string): Promise<EnrichedDeal | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-5-haiku",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_PROMPT}\n\nARTICLE:\n${content}`,
          },
        ],
      }),
    });

    const apiResponse = await response.json();
    const text = apiResponse.choices?.[0]?.message?.content || "";

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return {
      companyName: extracted.company_name,
      amount: extracted.amount,
      currency: extracted.currency,
      stage: extracted.stage,
      valuation: extracted.valuation,
      investors: extracted.investors || [],
      leadInvestor: extracted.lead_investor,
      sector: extracted.sector,
      geography: extracted.geography,
      arr: extracted.arr,
      revenue: extracted.revenue,
      growthRate: extracted.growth_rate,
      employees: extracted.employees,
      customers: extracted.customers,
      nrr: extracted.nrr,
      investorTypes: extracted.investor_types || [],
      previousRounds: extracted.previous_rounds,
      totalRaised: extracted.total_raised,
      useOfFunds: extracted.use_of_funds,
      competitors: extracted.competitors || [],
      fundingDate: extracted.funding_date,
      companyDescription: extracted.company_description,
      confidenceScore: extracted.confidence_score || 0,
      sourceUrl: url,
    };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

function normalizeStage(stage: string | null): string | null {
  if (!stage) return null;
  const stageLower = stage.toLowerCase().replace(/[^a-z0-9]/g, "");

  const mappings: Record<string, string> = {
    preseed: "pre_seed",
    seed: "seed",
    seriesa: "series_a",
    seriesb: "series_b",
    seriesc: "series_c",
    seriesd: "series_d",
    growth: "growth",
    bridge: "bridge",
  };

  return mappings[stageLower] || stage.toLowerCase();
}

function normalizeSector(sector: string | null): string | null {
  if (!sector) return null;
  const sectorLower = sector.toLowerCase();

  const mappings: Record<string, string> = {
    saas: "saas",
    fintech: "fintech",
    healthtech: "healthtech",
    edtech: "edtech",
    cleantech: "greentech",
    greentech: "greentech",
    foodtech: "foodtech",
    marketplace: "marketplace",
    ai: "ai",
    cybersecurity: "cybersecurity",
    proptech: "proptech",
    hrtech: "hrtech",
    logistics: "logistics",
    mobility: "mobility",
    crypto: "crypto",
    gaming: "gaming",
    deeptech: "deeptech",
    ecommerce: "ecommerce",
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (sectorLower.includes(key)) {
      return value;
    }
  }

  return sectorLower;
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

async function saveDeal(deal: EnrichedDeal, source: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!deal.companyName) return { success: false, error: "No company name" };

    const sourceId = extractSourceId(deal.sourceUrl);
    const companySlug = deal.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Safely convert numbers (handle nulls and invalid values)
    const toNumber = (val: number | null): number | null => {
      if (val === null || val === undefined || isNaN(val)) return null;
      return Math.round(val * 100) / 100; // 2 decimal places
    };

    // Build enriched data JSON with ALL extracted info
    const enrichedData = {
      // Business metrics
      arr: deal.arr,
      revenue: deal.revenue,
      growthRate: deal.growthRate,
      employees: deal.employees,
      customers: deal.customers,
      nrr: deal.nrr,

      // Investment context
      investorTypes: deal.investorTypes,
      previousRounds: deal.previousRounds,
      totalRaised: deal.totalRaised,
      useOfFunds: deal.useOfFunds,

      // Competitive info
      competitors: deal.competitors,

      // Extraction metadata
      extractedAt: new Date().toISOString(),
    };

    // Parse funding date safely
    let fundingDate: Date | null = null;
    if (deal.fundingDate) {
      try {
        fundingDate = new Date(deal.fundingDate);
        if (isNaN(fundingDate.getTime())) fundingDate = null;
      } catch {
        fundingDate = null;
      }
    }

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
        description: deal.companyDescription || null,
        amount: toNumber(deal.amount),
        amountUsd: deal.amount ? toNumber(deal.amount * 1.08) : null,
        currency: deal.currency || "EUR",
        stage: deal.stage,
        stageNormalized: normalizeStage(deal.stage),
        valuationPre: toNumber(deal.valuation),
        sector: deal.sector,
        sectorNormalized: normalizeSector(deal.sector),
        geography: deal.geography || "France",
        region: "europe",
        fundingDate,
        investors: deal.investors || [],
        leadInvestor: deal.leadInvestor,
        employeeCount: deal.employees,
        source,
        sourceUrl: deal.sourceUrl,
        sourceId,
        enrichedData,
        confidenceScore: deal.confidenceScore,
        isEnriched: true,
      },
      update: {
        description: deal.companyDescription || undefined,
        amount: toNumber(deal.amount) ?? undefined,
        amountUsd: deal.amount ? toNumber(deal.amount * 1.08) ?? undefined : undefined,
        stage: deal.stage || undefined,
        stageNormalized: normalizeStage(deal.stage) || undefined,
        valuationPre: toNumber(deal.valuation) ?? undefined,
        sector: deal.sector || undefined,
        sectorNormalized: normalizeSector(deal.sector) || undefined,
        investors: deal.investors && deal.investors.length > 0 ? deal.investors : undefined,
        leadInvestor: deal.leadInvestor || undefined,
        employeeCount: deal.employees || undefined,
        enrichedData,
        confidenceScore: deal.confidenceScore,
        isEnriched: true,
      },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Check if article is already enriched
async function isAlreadyEnriched(url: string, source: string): Promise<boolean> {
  const sourceId = extractSourceId(url);
  const existing = await prisma.fundingRound.findUnique({
    where: {
      source_sourceId: {
        source,
        sourceId,
      },
    },
    select: { isEnriched: true },
  });
  return existing?.isEnriched === true;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║       FRENCHWEB FULL ENRICHMENT - LLM EXTRACTION               ║");
  console.log("║                                                                 ║");
  console.log("║  Using: Claude 3.5 Haiku via OpenRouter                         ║");
  console.log("║  Categories: 11276 (Levées) + 12024 (Investissements)           ║");
  console.log("║  Expected: ~6,000 articles                                      ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  if (!OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  const failedArticles: FailedArticle[] = [];
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalSkipped = 0;
  let totalCost = 0;

  // Process both categories
  const categories = [
    { id: 11276, name: "LEVEES DE FONDS", source: "frenchweb_levees_enriched" },
    { id: 12024, name: "INVESTISSEMENTS", source: "frenchweb_invest_enriched" },
  ];

  for (const category of categories) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`CATEGORY: ${category.name}`);
    console.log(`${"=".repeat(70)}`);

    // Fetch all posts
    const posts = await fetchAllPosts(category.id, category.name);
    console.log(`\nFetched ${posts.length} posts. Starting enrichment...\n`);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const title = (post.title?.rendered || "").replace(/&rsquo;/g, "'").replace(/&#8217;/g, "'").replace(/&amp;/g, "&");
      const shortTitle = title.slice(0, 50);

      process.stdout.write(`[${i + 1}/${posts.length}] ${shortTitle}...`);

      try {
        // Skip if already enriched
        const alreadyDone = await isAlreadyEnriched(post.link, category.source);
        if (alreadyDone) {
          totalSkipped++;
          console.log(" ⏭️  Already enriched");
          continue;
        }

        // Fetch full article content
        const content = await fetchArticleContent(post.link);

        if (!content || content.length < 100) {
          failedArticles.push({
            url: post.link,
            title,
            error: "Content too short or empty",
            category: category.name,
          });
          console.log(" ❌ No content");
          continue;
        }

        // Extract with LLM
        const startTime = Date.now();
        const deal = await extractWithLLM(content, post.link);
        const duration = Date.now() - startTime;

        // Estimate cost
        const inputTokens = content.length / 4;
        const outputTokens = 500;
        const cost = (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;
        totalCost += cost;

        if (!deal || !deal.companyName) {
          failedArticles.push({
            url: post.link,
            title,
            error: "LLM extraction failed or no company name",
            category: category.name,
          });
          console.log(" ❌ Extraction failed");
          continue;
        }

        // Save to database
        const saveResult = await saveDeal(deal, category.source);

        if (saveResult.success) {
          totalSaved++;
          const amountStr = deal.amount ? `${(deal.amount / 1_000_000).toFixed(1)}M€` : "N/A";
          console.log(` ✅ ${deal.companyName} | ${amountStr} | ${deal.stage || "?"} | ${duration}ms`);
        } else {
          failedArticles.push({
            url: post.link,
            title,
            error: `DB save: ${saveResult.error?.slice(0, 100) || "unknown"}`,
            category: category.name,
          });
          console.log(` ❌ DB: ${saveResult.error?.slice(0, 60) || "unknown"}`);
        }

        totalProcessed++;

        // Rate limiting - 200ms between requests
        await new Promise(r => setTimeout(r, 200));

        // Progress update every 100 articles
        if (totalProcessed % 100 === 0) {
          console.log(`\n--- Progress: ${totalProcessed} processed, ${totalSaved} saved, ${totalSkipped} skipped, ${failedArticles.length} failed, $${totalCost.toFixed(4)} spent ---\n`);
        }
      } catch (error) {
        failedArticles.push({
          url: post.link,
          title,
          error: String(error),
          category: category.name,
        });
        console.log(` ❌ Error: ${String(error).slice(0, 50)}`);
      }
    }
  }

  // Final summary
  console.log("\n\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                      ENRICHMENT COMPLETE                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  console.log(`\n📊 STATISTICS:`);
  console.log(`   - Total processed: ${totalProcessed}`);
  console.log(`   - Successfully saved: ${totalSaved}`);
  console.log(`   - Skipped (already enriched): ${totalSkipped}`);
  console.log(`   - Failed: ${failedArticles.length}`);
  console.log(`   - Success rate: ${totalProcessed > 0 ? ((totalSaved / totalProcessed) * 100).toFixed(1) : 0}%`);
  console.log(`   - Total cost: $${totalCost.toFixed(4)}`);
  console.log(`   - Avg cost/article: $${totalProcessed > 0 ? (totalCost / totalProcessed).toFixed(6) : 0}`);

  // Database stats
  const stats = await prisma.fundingRound.groupBy({
    by: ["source"],
    _count: true,
  });

  const total = await prisma.fundingRound.count();

  console.log(`\n📈 DATABASE STATUS:`);
  console.log(`   Total rounds in DB: ${total}`);
  stats.forEach(s => {
    console.log(`   - ${s.source}: ${s._count}`);
  });

  // Failed articles report
  if (failedArticles.length > 0) {
    console.log(`\n\n⚠️  FAILED ARTICLES (${failedArticles.length}):`);
    console.log("─".repeat(80));

    // Group by error type
    const byError: Record<string, FailedArticle[]> = {};
    for (const article of failedArticles) {
      const key = article.error.slice(0, 50);
      if (!byError[key]) byError[key] = [];
      byError[key].push(article);
    }

    for (const [error, articles] of Object.entries(byError)) {
      console.log(`\n[${error}] - ${articles.length} articles:`);
      for (const article of articles.slice(0, 5)) {
        console.log(`  - ${article.title.slice(0, 60)}`);
        console.log(`    ${article.url}`);
      }
      if (articles.length > 5) {
        console.log(`  ... and ${articles.length - 5} more`);
      }
    }

    // Save failed articles to file for review
    const failedJson = JSON.stringify(failedArticles, null, 2);
    const fs = await import("fs/promises");
    await fs.writeFile("scripts/failed-articles.json", failedJson);
    console.log(`\n📁 Full failed articles list saved to: scripts/failed-articles.json`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
