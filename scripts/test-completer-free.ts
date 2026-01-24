/**
 * Test DB_COMPLETER avec options gratuites
 *
 * Option B : Scraping sourceUrl + DeepSeek :free
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/test-completer-free.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// DeepSeek Chat - très cheap ($0.0003 input / $0.0012 output per 1K tokens)
// Bien meilleur pour l'extraction JSON que R1 (modèle de raisonnement)
const CHEAP_MODEL = "deepseek/deepseek-chat";

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
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return `[ERROR: HTTP ${response.status}]`;
    }

    const html = await response.text();

    // Extraire le contenu de l'article
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let content = articleMatch ? articleMatch[1] : html;

    // Nettoyer le HTML
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
    content = content.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
    content = content.replace(/<[^>]+>/g, " ");
    content = content.replace(/&[a-z]+;/gi, " ");
    content = content.replace(/&#\d+;/g, " ");
    content = content.replace(/\s+/g, " ");

    return content.trim().slice(0, 6000); // Plus de contexte pour le LLM
  } catch (error) {
    return `[ERROR: ${error instanceof Error ? error.message : "Unknown"}]`;
  }
}

// ============================================================================
// LLM EXTRACTION
// ============================================================================

const EXTRACTION_PROMPT = `Tu es un expert en startups. Analyse cet article sur une levée de fonds et extrais les informations.

## RÈGLES
1. **JAMAIS INVENTER** : Si une info n'est PAS dans l'article → null
2. **INDUSTRIE** : Utilise UNIQUEMENT cette taxonomie :
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

## FORMAT JSON UNIQUEMENT (pas de markdown, pas d'explication)
{
  "company_name": "nom exact",
  "industry": "UNE industrie de la liste",
  "sub_industry": "sous-catégorie ou null",
  "description": "1-2 phrases",
  "business_model": "SaaS|Marketplace|Transactional|Hardware|Services|null",
  "target_market": "B2B|B2C|B2B2C|null",
  "headquarters": "pays en anglais",
  "city": "ville ou null",
  "founded_year": null,
  "founders": [{"name": "string", "role": "string"}],
  "employees": null,
  "confidence": 0-100
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
  confidence: number;
}

async function extractWithLLM(content: string): Promise<{ result: ExtractionResult | null; cost: number; error?: string }> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://angeldesk.app",
        "X-Title": "Angel Desk Test",
      },
      body: JSON.stringify({
        model: CHEAP_MODEL,
        max_tokens: 1500,
        temperature: 0.1,
        messages: [
          { role: "user", content: `${EXTRACTION_PROMPT}\n\nARTICLE:\n${content}` }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { result: null, cost: 0, error: `HTTP ${response.status}: ${error.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Calculer le coût
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
    // DeepSeek Chat: $0.0003/1K input, $0.0012/1K output
    const cost = (usage.prompt_tokens / 1000) * 0.0003 + (usage.completion_tokens / 1000) * 0.0012;

    // Extraire le JSON de la réponse
    // DeepSeek R1 peut mettre du texte avant/après le JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { result: null, cost, error: "No JSON found in response" };
    }

    const result = JSON.parse(jsonMatch[0]) as ExtractionResult;
    return { result, cost };
  } catch (error) {
    return { result: null, cost: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║           TEST DB_COMPLETER - Option B (QUASI-GRATUIT)                       ║
║                                                                              ║
║   Scraping sourceUrl + DeepSeek Chat (~$0.0003/call)                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // Récupérer les 20 startups de test
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

  // Filtrer pour garder les vraies startups
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

  const results: Array<{
    name: string;
    sourceUrl: string;
    scrapeSuccess: boolean;
    extractSuccess: boolean;
    industry: string | null;
    confidence: number;
    error?: string;
  }> = [];

  let successCount = 0;
  let totalTime = 0;
  let totalCost = 0;

  for (let i = 0; i < validCompanies.length; i++) {
    const company = validCompanies[i];
    const sourceUrl = company.fundingRounds[0]?.sourceUrl || "";
    const startTime = Date.now();

    process.stdout.write(`[${String(i + 1).padStart(2)}/${validCompanies.length}] ${company.name.padEnd(20).slice(0, 20)} `);

    // 1. Scraper l'URL
    const content = await scrapeUrl(sourceUrl);
    const scrapeSuccess = !content.startsWith("[ERROR");

    if (!scrapeSuccess) {
      console.log(`❌ Scrape failed: ${content.slice(0, 50)}`);
      results.push({
        name: company.name,
        sourceUrl,
        scrapeSuccess: false,
        extractSuccess: false,
        industry: null,
        confidence: 0,
        error: content
      });
      continue;
    }

    process.stdout.write(`✓ scraped (${content.length} chars) → `);

    // 2. Extraire avec LLM
    const { result, cost, error } = await extractWithLLM(content);
    const elapsed = Date.now() - startTime;
    totalTime += elapsed;
    totalCost += cost;

    if (!result) {
      console.log(`❌ LLM failed: ${error?.slice(0, 50)}`);
      results.push({
        name: company.name,
        sourceUrl,
        scrapeSuccess: true,
        extractSuccess: false,
        industry: null,
        confidence: 0,
        error
      });
      continue;
    }

    successCount++;
    console.log(`✅ ${result.industry || "???"} (${result.confidence}%) [${elapsed}ms]`);

    results.push({
      name: company.name,
      sourceUrl,
      scrapeSuccess: true,
      extractSuccess: true,
      industry: result.industry,
      confidence: result.confidence
    });

    // Rate limiting léger
    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================================================
  // RÉSUMÉ
  // ============================================================================

  console.log(`
${"═".repeat(80)}
📊 RÉSUMÉ DU TEST
${"═".repeat(80)}

✅ Succès: ${successCount}/${validCompanies.length} (${Math.round(successCount / validCompanies.length * 100)}%)
❌ Échecs scraping: ${results.filter(r => !r.scrapeSuccess).length}
❌ Échecs LLM: ${results.filter(r => r.scrapeSuccess && !r.extractSuccess).length}

⏱️  Temps moyen: ${Math.round(totalTime / validCompanies.length)}ms/company
💰 Coût total: $${totalCost.toFixed(4)} (~$${(totalCost / successCount * 1000).toFixed(2)}/1000 companies)

${"─".repeat(80)}
📋 DÉTAIL DES EXTRACTIONS RÉUSSIES
${"─".repeat(80)}
`);

  const successful = results.filter(r => r.extractSuccess);
  successful.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name.padEnd(20)} → ${(r.industry || "???").padEnd(25)} (${r.confidence}%)`);
  });

  // Grouper par industrie
  const byIndustry = successful.reduce((acc, r) => {
    const ind = r.industry || "Unknown";
    acc[ind] = (acc[ind] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`
${"─".repeat(80)}
📈 RÉPARTITION PAR INDUSTRIE
${"─".repeat(80)}
`);

  Object.entries(byIndustry)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ind, count]) => {
      console.log(`${ind.padEnd(30)} ${"█".repeat(count)} ${count}`);
    });

  // Confidence moyenne
  const avgConfidence = successful.length > 0
    ? Math.round(successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length)
    : 0;

  console.log(`
${"─".repeat(80)}
📊 QUALITÉ
${"─".repeat(80)}
Confidence moyenne: ${avgConfidence}%
Industries uniques: ${Object.keys(byIndustry).length}
`);

  if (results.filter(r => r.error).length > 0) {
    console.log(`
${"─".repeat(80)}
⚠️  ERREURS
${"─".repeat(80)}
`);
    results.filter(r => r.error).forEach(r => {
      console.log(`${r.name}: ${r.error?.slice(0, 100)}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
