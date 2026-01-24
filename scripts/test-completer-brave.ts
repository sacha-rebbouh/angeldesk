/**
 * Test DB_COMPLETER avec Brave Search (gratuit 2000 req/mois)
 *
 * Option A : Brave Search + Scraping + DeepSeek Chat
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/test-completer-brave.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// DeepSeek Chat - très cheap
const CHEAP_MODEL = "deepseek/deepseek-chat";

// ============================================================================
// BRAVE SEARCH
// ============================================================================

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

async function braveSearch(query: string): Promise<BraveSearchResult[]> {
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": BRAVE_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      console.error(`Brave Search error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results: BraveSearchResult[] = (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));

    return results;
  } catch (error) {
    console.error("Brave Search error:", error);
    return [];
  }
}

// ============================================================================
// SCRAPING
// ============================================================================

async function scrapeUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return "";

    const html = await response.text();

    // Extraire le contenu
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let content = articleMatch ? articleMatch[1] : html;

    // Nettoyer
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    content = content.replace(/<[^>]+>/g, " ");
    content = content.replace(/&[a-z]+;/gi, " ");
    content = content.replace(/&#\d+;/g, " ");
    content = content.replace(/\s+/g, " ");

    return content.trim().slice(0, 3000);
  } catch {
    return "";
  }
}

// ============================================================================
// LLM EXTRACTION
// ============================================================================

const EXTRACTION_PROMPT = `Tu es un expert en startups. Analyse ces informations et extrais le maximum de données sur l'entreprise.

## RÈGLES
1. **JAMAIS INVENTER** : Si une info n'est pas présente → null
2. **COMBINER LES SOURCES** : Utilise toutes les infos disponibles
3. **INDUSTRIE** : Utilise UNIQUEMENT cette taxonomie :
   - SaaS B2B, SaaS B2C, Developer Tools, Cloud Infrastructure, Data & Analytics
   - AI Pure-Play (seulement si l'IA EST le produit)
   - Cybersecurity, Enterprise Software
   - FinTech Payments, FinTech Banking, FinTech Lending, FinTech Insurance, FinTech WealthTech
   - HealthTech, MedTech, BioTech, Mental Health
   - E-commerce, Marketplace B2C, Marketplace B2B, Retail Tech, D2C Brands
   - MarTech, AdTech, Sales Tech
   - HRTech, Recruiting, Future of Work
   - PropTech, ConstructionTech
   - Logistics, Delivery, Mobility
   - CleanTech, Energy, GreenTech, AgriTech, FoodTech
   - EdTech, LegalTech, GovTech, SpaceTech
   - Gaming, Entertainment, Consumer Apps
   - Hardware, DeepTech, Robotics, TravelTech

## FORMAT JSON UNIQUEMENT
{
  "company_name": "nom exact",
  "industry": "UNE industrie de la liste",
  "sub_industry": "sous-catégorie ou null",
  "description": "2-3 phrases détaillées sur l'activité",
  "business_model": "SaaS|Marketplace|Transactional|Hardware|Services|null",
  "target_market": "B2B|B2C|B2B2C|null",
  "headquarters": "pays en anglais",
  "city": "ville ou null",
  "founded_year": "nombre ou null",
  "founders": [{"name": "string", "role": "string"}],
  "employees": "nombre ou null",
  "total_raised": "montant total levé ou null",
  "last_round_amount": "dernier montant levé ou null",
  "last_round_stage": "seed|series_a|series_b|etc ou null",
  "investors": ["liste des investisseurs connus"],
  "competitors": ["concurrents mentionnés"],
  "website": "url du site ou null",
  "confidence": 0-100,
  "data_completeness": 0-100
}`;

interface ExtractionResult {
  company_name: string | null;
  industry: string | null;
  sub_industry: string | null;
  description: string | null;
  business_model: string | null;
  target_market: string | null;
  headquarters: string | null;
  city: string | null;
  founded_year: number | null;
  founders: Array<{ name: string; role: string | null }>;
  employees: number | null;
  total_raised: string | null;
  last_round_amount: string | null;
  last_round_stage: string | null;
  investors: string[];
  competitors: string[];
  website: string | null;
  confidence: number;
  data_completeness: number;
}

async function extractWithLLM(content: string): Promise<{ result: ExtractionResult | null; cost: number; error?: string }> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://fullinvest.app",
        "X-Title": "FullInvest Test",
      },
      body: JSON.stringify({
        model: CHEAP_MODEL,
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          { role: "user", content: `${EXTRACTION_PROMPT}\n\nINFORMATIONS À ANALYSER:\n${content}` }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { result: null, cost: 0, error: `HTTP ${response.status}: ${error.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
    const cost = (usage.prompt_tokens / 1000) * 0.0003 + (usage.completion_tokens / 1000) * 0.0012;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { result: null, cost, error: "No JSON found" };
    }

    const result = JSON.parse(jsonMatch[0]) as ExtractionResult;
    return { result, cost };
  } catch (error) {
    return { result: null, cost: 0, error: error instanceof Error ? error.message : "Unknown" };
  }
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║        TEST DB_COMPLETER - Option A (BRAVE SEARCH + DeepSeek)                ║
║                                                                              ║
║   Brave Search (gratuit) + Scraping multi-sources + DeepSeek Chat            ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  if (!BRAVE_API_KEY) {
    console.error("❌ BRAVE_API_KEY non configurée!");
    process.exit(1);
  }

  // Récupérer les 20 startups de test (mêmes que Option B)
  const companies = await prisma.company.findMany({
    where: {
      industry: null,
      description: { not: null }
    },
    include: {
      fundingRounds: {
        where: { sourceUrl: { not: null } },
        select: { sourceUrl: true },
        take: 1
      }
    },
    take: 500
  });

  const validCompanies = companies.filter(c => {
    if (!c.description) return false;
    if (c.fundingRounds.length === 0) return false;
    const name = c.name.toLowerCase();
    const desc = c.description.toLowerCase();
    if (!desc.includes(name)) return false;
    const genericWords = ['le', 'la', 'les', 'un', 'une', 'plus', 'quel', 'aux', 'financement', 'entrepreneurs', 'ask', 'question', 'travail', 'love', 'etats-unis', 'bpifrance', 'bercy'];
    if (genericWords.includes(name)) return false;
    if (name.length < 4) return false;
    return true;
  }).slice(0, 20);

  console.log(`📊 Companies à tester: ${validCompanies.length}\n`);

  interface TestResult {
    name: string;
    braveResults: number;
    scrapedSources: number;
    extractSuccess: boolean;
    industry: string | null;
    confidence: number;
    completeness: number;
    founders: number;
    investors: number;
    competitors: number;
    hasWebsite: boolean;
    hasFoundedYear: boolean;
    hasEmployees: boolean;
    error?: string;
  }

  const results: TestResult[] = [];
  let totalCost = 0;
  let totalTime = 0;

  for (let i = 0; i < validCompanies.length; i++) {
    const company = validCompanies[i];
    const startTime = Date.now();

    console.log(`\n[${String(i + 1).padStart(2)}/${validCompanies.length}] ${company.name}`);
    console.log(`${"─".repeat(60)}`);

    // 1. Recherche Brave
    const searchQuery = `${company.name} startup levée fonds funding`;
    console.log(`   🔍 Brave Search: "${searchQuery.slice(0, 40)}..."`);

    const braveResults = await braveSearch(searchQuery);
    console.log(`   📄 ${braveResults.length} résultats trouvés`);

    // 2. Scraper les top résultats + l'article original
    const urlsToScrape = [
      company.fundingRounds[0]?.sourceUrl,
      ...braveResults.slice(0, 3).map(r => r.url)
    ].filter(Boolean) as string[];

    let combinedContent = "";
    let scrapedCount = 0;

    for (const url of urlsToScrape) {
      const content = await scrapeUrl(url);
      if (content.length > 200) {
        combinedContent += `\n\n--- Source: ${url.slice(0, 50)}... ---\n${content}`;
        scrapedCount++;
      }
    }

    console.log(`   📥 ${scrapedCount}/${urlsToScrape.length} sources scrapées (${combinedContent.length} chars)`);

    // Ajouter les descriptions des résultats Brave (même si scrape échoue)
    const braveDescriptions = braveResults.map(r => `${r.title}: ${r.description}`).join("\n");
    combinedContent += `\n\n--- Résumés de recherche ---\n${braveDescriptions}`;

    // 3. Extraire avec LLM
    console.log(`   🤖 Extraction LLM...`);
    const { result, cost, error } = await extractWithLLM(combinedContent.slice(0, 12000));
    totalCost += cost;

    const elapsed = Date.now() - startTime;
    totalTime += elapsed;

    if (!result) {
      console.log(`   ❌ Échec: ${error}`);
      results.push({
        name: company.name,
        braveResults: braveResults.length,
        scrapedSources: scrapedCount,
        extractSuccess: false,
        industry: null,
        confidence: 0,
        completeness: 0,
        founders: 0,
        investors: 0,
        competitors: 0,
        hasWebsite: false,
        hasFoundedYear: false,
        hasEmployees: false,
        error
      });
      continue;
    }

    console.log(`   ✅ ${result.industry || "???"} (conf: ${result.confidence}%, compl: ${result.data_completeness}%)`);
    console.log(`   📊 Fondateurs: ${result.founders?.length || 0}, Investisseurs: ${result.investors?.length || 0}, Concurrents: ${result.competitors?.length || 0}`);
    if (result.website) console.log(`   🌐 ${result.website}`);
    if (result.founded_year) console.log(`   📅 Fondée en ${result.founded_year}`);
    if (result.employees) console.log(`   👥 ${result.employees} employés`);

    results.push({
      name: company.name,
      braveResults: braveResults.length,
      scrapedSources: scrapedCount,
      extractSuccess: true,
      industry: result.industry,
      confidence: result.confidence,
      completeness: result.data_completeness,
      founders: result.founders?.length || 0,
      investors: result.investors?.length || 0,
      competitors: result.competitors?.length || 0,
      hasWebsite: !!result.website,
      hasFoundedYear: !!result.founded_year,
      hasEmployees: !!result.employees
    });

    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // ============================================================================
  // RÉSUMÉ COMPARATIF
  // ============================================================================

  const successful = results.filter(r => r.extractSuccess);

  console.log(`

${"═".repeat(80)}
📊 RÉSUMÉ - OPTION A (BRAVE SEARCH)
${"═".repeat(80)}

✅ Succès: ${successful.length}/${validCompanies.length} (${Math.round(successful.length / validCompanies.length * 100)}%)

⏱️  Temps moyen: ${Math.round(totalTime / validCompanies.length)}ms/company
💰 Coût LLM: $${totalCost.toFixed(4)}
🔍 Coût Brave: $0.00 (gratuit, ${validCompanies.length} req utilisées sur 2000/mois)

${"─".repeat(80)}
📈 RICHESSE DES DONNÉES (vs Option B qui n'a que l'article original)
${"─".repeat(80)}

| Métrique              | Moyenne/Total |
|-----------------------|---------------|
| Confidence            | ${Math.round(successful.reduce((s, r) => s + r.confidence, 0) / successful.length)}%            |
| Data Completeness     | ${Math.round(successful.reduce((s, r) => s + r.completeness, 0) / successful.length)}%            |
| Sources par company   | ${(successful.reduce((s, r) => s + r.scrapedSources, 0) / successful.length).toFixed(1)}             |
| Avec fondateurs       | ${successful.filter(r => r.founders > 0).length}/${successful.length}            |
| Avec investisseurs    | ${successful.filter(r => r.investors > 0).length}/${successful.length}            |
| Avec concurrents      | ${successful.filter(r => r.competitors > 0).length}/${successful.length}            |
| Avec website          | ${successful.filter(r => r.hasWebsite).length}/${successful.length}            |
| Avec année fondation  | ${successful.filter(r => r.hasFoundedYear).length}/${successful.length}            |
| Avec nb employés      | ${successful.filter(r => r.hasEmployees).length}/${successful.length}            |

${"─".repeat(80)}
📋 DÉTAIL
${"─".repeat(80)}
`);

  successful.forEach((r, i) => {
    const dataPoints = [
      r.founders > 0 ? `${r.founders}F` : null,
      r.investors > 0 ? `${r.investors}I` : null,
      r.competitors > 0 ? `${r.competitors}C` : null,
      r.hasWebsite ? "W" : null,
      r.hasFoundedYear ? "Y" : null,
      r.hasEmployees ? "E" : null,
    ].filter(Boolean).join(",");

    console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(18)} ${(r.industry || "???").padEnd(22)} conf:${String(r.confidence).padStart(3)}% compl:${String(r.completeness).padStart(3)}% [${dataPoints}]`);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
