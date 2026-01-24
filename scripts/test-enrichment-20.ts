/**
 * Test LLM Enrichment on 20 Real Articles
 *
 * Tests the quality of structured data extraction from funding articles.
 */

// Use OpenRouter API directly
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================================================================
// TYPES
// ============================================================================

interface EnrichedDeal {
  // Essential
  companyName: string | null;
  amount: number | null;
  currency: string | null;
  stage: string | null;
  valuation: number | null;
  investors: string[];
  leadInvestor: string | null;
  sector: string | null;
  geography: string | null;

  // Business metrics
  arr: number | null;
  revenue: number | null;
  growthRate: number | null;
  employees: number | null;
  customers: number | null;
  nrr: number | null;

  // Deal context
  investorTypes: string[];
  previousRounds: string | null;
  totalRaised: number | null;
  useOfFunds: string | null;
  competitors: string[];

  // Meta
  fundingDate: string | null;
  companyDescription: string | null;
  confidenceScore: number;
  sourceUrl: string;
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
// FETCH ARTICLES
// ============================================================================

async function fetchArticleUrls(count: number): Promise<string[]> {
  const response = await fetch(
    `https://www.frenchweb.fr/wp-json/wp/v2/posts?categories=11276&per_page=${count}&_fields=link`
  );
  const posts = await response.json();
  return posts.map((p: { link: string }) => p.link);
}

async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
    });
    const html = await response.text();

    // Extract main content (simple extraction)
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
        model: "deepseek/deepseek-chat",
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
      console.error("No JSON found in response");
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
    console.error("LLM extraction error:", error);
    return null;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║     TEST ENRICHISSEMENT LLM - 20 ARTICLES FRENCHWEB        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Fetch 20 article URLs
  console.log("📥 Récupération des 20 articles...\n");
  const urls = await fetchArticleUrls(20);

  const results: EnrichedDeal[] = [];
  let totalCost = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[${i + 1}/20] ${url.split("/").slice(-2, -1)[0]?.slice(0, 50)}...`);

    // Fetch content
    const content = await fetchArticleContent(url);
    if (!content) {
      console.log("  ❌ Impossible de récupérer le contenu");
      continue;
    }

    // Extract with LLM
    const startTime = Date.now();
    const deal = await extractWithLLM(content, url);
    const duration = Date.now() - startTime;

    // Estimate cost (DeepSeek: $0.14/1M input, $0.28/1M output)
    const inputTokens = content.length / 4; // rough estimate
    const outputTokens = 500; // rough estimate
    const cost = (inputTokens * 0.14 + outputTokens * 0.28) / 1_000_000;
    totalCost += cost;

    if (deal) {
      results.push(deal);

      // Display key info
      const amountStr = deal.amount ? `${(deal.amount / 1_000_000).toFixed(1)}M${deal.currency || "€"}` : "N/A";
      console.log(`  ✅ ${deal.companyName || "?"} | ${amountStr} | ${deal.stage || "?"} | ${deal.sector || "?"}`);
      console.log(`     Investors: ${deal.investors.slice(0, 3).join(", ") || "N/A"}`);
      console.log(`     Confidence: ${deal.confidenceScore}/100 | ${duration}ms | ~$${cost.toFixed(4)}`);
    } else {
      console.log("  ❌ Extraction échouée");
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary
  console.log("\n\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      RÉSUMÉ                                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  console.log(`\n📊 STATISTIQUES:`);
  console.log(`   - Articles traités: ${results.length}/20`);
  console.log(`   - Coût total estimé: $${totalCost.toFixed(4)}`);
  console.log(`   - Coût moyen/article: $${(totalCost / results.length).toFixed(4)}`);

  // Quality metrics
  const withAmount = results.filter(r => r.amount).length;
  const withStage = results.filter(r => r.stage).length;
  const withSector = results.filter(r => r.sector).length;
  const withInvestors = results.filter(r => r.investors.length > 0).length;
  const withValuation = results.filter(r => r.valuation).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length;

  console.log(`\n📈 QUALITÉ DES DONNÉES:`);
  console.log(`   - Avec montant: ${withAmount}/${results.length} (${((withAmount/results.length)*100).toFixed(0)}%)`);
  console.log(`   - Avec stage: ${withStage}/${results.length} (${((withStage/results.length)*100).toFixed(0)}%)`);
  console.log(`   - Avec secteur: ${withSector}/${results.length} (${((withSector/results.length)*100).toFixed(0)}%)`);
  console.log(`   - Avec investisseurs: ${withInvestors}/${results.length} (${((withInvestors/results.length)*100).toFixed(0)}%)`);
  console.log(`   - Avec valuation: ${withValuation}/${results.length} (${((withValuation/results.length)*100).toFixed(0)}%)`);
  console.log(`   - Confidence moyenne: ${avgConfidence.toFixed(0)}/100`);

  // Detailed results
  console.log(`\n\n📋 DÉTAIL DES 20 EXTRACTIONS:\n`);
  console.log("─".repeat(120));

  for (const deal of results) {
    const amountStr = deal.amount ? `${(deal.amount / 1_000_000).toFixed(1)}M${deal.currency || "€"}` : "N/A";
    const valuationStr = deal.valuation ? `${(deal.valuation / 1_000_000).toFixed(0)}M${deal.currency || "€"}` : "N/A";

    console.log(`\n🏢 ${deal.companyName || "UNKNOWN"}`);
    console.log(`   💰 Amount: ${amountStr} | Stage: ${deal.stage || "N/A"} | Valuation: ${valuationStr}`);
    console.log(`   🏷️  Sector: ${deal.sector || "N/A"} | Geography: ${deal.geography || "N/A"}`);
    console.log(`   👥 Investors: ${deal.investors.join(", ") || "N/A"}`);
    console.log(`   🎯 Lead: ${deal.leadInvestor || "N/A"} | Types: ${deal.investorTypes.join(", ") || "N/A"}`);

    if (deal.arr || deal.employees || deal.growthRate) {
      console.log(`   📊 Metrics: ARR=${deal.arr ? (deal.arr/1_000_000).toFixed(1)+"M" : "N/A"} | Employees=${deal.employees || "N/A"} | Growth=${deal.growthRate ? deal.growthRate+"%" : "N/A"}`);
    }

    if (deal.competitors.length > 0) {
      console.log(`   ⚔️  Competitors: ${deal.competitors.join(", ")}`);
    }

    if (deal.useOfFunds) {
      console.log(`   🎯 Use of funds: ${deal.useOfFunds.slice(0, 100)}...`);
    }

    console.log(`   📅 Date: ${deal.fundingDate || "N/A"} | Confidence: ${deal.confidenceScore}/100`);
    console.log(`   🔗 ${deal.sourceUrl}`);
  }

  console.log("\n" + "─".repeat(120));
  console.log("\n✅ Test terminé. Vérifie la qualité des extractions ci-dessus.");
}

main().catch(console.error);
