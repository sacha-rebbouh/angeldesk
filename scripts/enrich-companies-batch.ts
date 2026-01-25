/**
 * Enrichissement des Companies par batch de 500
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/enrich-companies-batch.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/enrich-companies-batch.ts --batch=2
 */

import { PrismaClient, EnrichmentSource } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BATCH_SIZE = 500;

// ============================================================================
// PROMPT
// ============================================================================

const ENRICHMENT_PROMPT = `Tu es un expert en startups et levées de fonds. Analyse cet article sur une levée de fonds et extrais les informations sur l'ENTREPRISE.

## RÈGLES CRITIQUES
1. **JAMAIS INVENTER** : Si une info n'est PAS dans l'article → null
2. **INDUSTRIE** : C'est CRUCIAL. Utilise la taxonomie ci-dessous.
3. Si l'entreprise utilise l'IA comme OUTIL mais son produit est autre chose → classer dans le secteur du produit, PAS en "AI"

## TAXONOMIE DES INDUSTRIES
- SaaS B2B, SaaS B2C, Developer Tools, Cloud Infrastructure, Data & Analytics
- AI Pure-Play (uniquement si l'IA EST le produit principal)
- Cybersecurity, Enterprise Software
- FinTech Payments, FinTech Banking, FinTech Lending, FinTech Insurance, FinTech Accounting, FinTech WealthTech
- HealthTech, MedTech, BioTech, Pharma, Mental Health
- E-commerce, Marketplace B2C, Marketplace B2B, Retail Tech, D2C Brands
- MarTech, AdTech, Sales Tech
- HRTech, Recruiting, Future of Work, Corporate Learning
- PropTech, ConstructionTech, Smart Building
- Logistics, Delivery, Mobility, Automotive
- CleanTech, Energy, GreenTech, AgriTech, FoodTech
- EdTech, LegalTech, GovTech, SpaceTech, Defense
- Gaming, Entertainment, Social, Consumer Apps
- Hardware, DeepTech, Robotics, TravelTech

## FORMAT JSON (pas de markdown)
{
  "company_name": "nom exact ou null",
  "industry": "UNE industrie de la liste ci-dessus",
  "sub_industry": "sous-catégorie plus précise ou null",
  "description": "1-2 phrases décrivant l'activité",
  "business_model": "SaaS ou Marketplace ou Transactional ou Hardware ou Services ou null",
  "target_market": "B2B ou B2C ou B2B2C ou null",
  "headquarters_country": "pays du siège (en anglais: France, Germany, United States, etc.)",
  "headquarters_city": "ville ou null",
  "founded_year": "nombre ou null",
  "founders": [{"name": "string", "role": "string ou null"}],
  "employees": "nombre ou null",
  "is_profitable": "true ou false ou null",
  "notable_clients": ["clients mentionnés"],
  "competitors": ["concurrents mentionnés"],
  "confidence": "0-100"
}`;

// ============================================================================
// FUNCTIONS
// ============================================================================

async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return "";
    const html = await response.text();

    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let content = articleMatch ? articleMatch[1] : html;

    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    content = content.replace(/<[^>]+>/g, " ");
    content = content.replace(/&[a-z]+;/gi, " ");
    content = content.replace(/&#\d+;/g, " ");
    content = content.replace(/\s+/g, " ");
    return content.trim().slice(0, 4000);
  } catch {
    return "";
  }
}

interface EnrichmentResult {
  company_name: string | null;
  industry: string | null;
  sub_industry: string | null;
  description: string | null;
  business_model: string | null;
  target_market: string | null;
  headquarters_country: string | null;
  headquarters_city: string | null;
  founded_year: number | null;
  founders: Array<{ name: string; role: string | null }>;
  employees: number | null;
  is_profitable: boolean | null;
  notable_clients: string[];
  competitors: string[];
  confidence: number;
}

async function enrichWithLLM(content: string): Promise<EnrichmentResult | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat", // ~$0.14-0.28/MTok
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{ role: "user", content: `${ENRICHMENT_PROMPT}\n\nARTICLE:\n${content}` }],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeCountry(country: string | null): string | null {
  if (!country) return null;
  const c = country.toLowerCase().trim();
  const mapping: Record<string, string> = {
    "france": "France",
    "usa": "United States",
    "us": "United States",
    "united states": "United States",
    "uk": "United Kingdom",
    "united kingdom": "United Kingdom",
    "england": "United Kingdom",
    "germany": "Germany",
    "allemagne": "Germany",
    "spain": "Spain",
    "espagne": "Spain",
    "italy": "Italy",
    "italie": "Italy",
    "netherlands": "Netherlands",
    "pays-bas": "Netherlands",
    "belgium": "Belgium",
    "belgique": "Belgium",
    "switzerland": "Switzerland",
    "suisse": "Switzerland",
    "sweden": "Sweden",
    "suède": "Sweden",
    "israel": "Israel",
    "china": "China",
    "chine": "China",
    "india": "India",
    "inde": "India",
    "japan": "Japan",
    "japon": "Japan",
    "canada": "Canada",
    "australia": "Australia",
    "europe": "Europe",
  };
  return mapping[c] || country;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const batchArg = args.find(a => a.startsWith("--batch="));
  const batchNum = batchArg ? parseInt(batchArg.split("=")[1]) : 1;
  const offset = (batchNum - 1) * BATCH_SIZE;

  console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║         ENRICHISSEMENT COMPANIES - BATCH ${batchNum} (${offset}-${offset + BATCH_SIZE})              ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════╝\n`);

  // Get companies without industry
  const companies = await prisma.company.findMany({
    where: { industry: null },
    include: {
      fundingRounds: {
        where: { sourceUrl: { not: null } },
        select: { sourceUrl: true },
        take: 1,
      },
    },
    skip: offset,
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  const totalWithoutIndustry = await prisma.company.count({ where: { industry: null } });
  console.log(`📊 Companies sans industrie: ${totalWithoutIndustry}`);
  console.log(`📦 Batch ${batchNum}: ${companies.length} companies (offset ${offset})\n`);

  if (companies.length === 0) {
    console.log("✅ Aucune company à enrichir dans ce batch.");
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;
  let noUrl = 0;
  let totalCost = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const sourceUrl = company.fundingRounds[0]?.sourceUrl;

    process.stdout.write(`[${String(i + 1).padStart(3)}/${companies.length}] ${company.name.slice(0, 30).padEnd(32)}`);

    if (!sourceUrl) {
      console.log("⏭️  Pas d'URL");
      noUrl++;
      continue;
    }

    // Fetch article
    const content = await fetchArticleContent(sourceUrl);
    if (!content || content.length < 200) {
      console.log("❌ Contenu vide");
      failed++;
      continue;
    }

    // Enrich with LLM
    const result = await enrichWithLLM(content);
    totalCost += 0.0003; // ~$0.0003 per call

    if (!result || !result.industry) {
      console.log("❌ Pas d'industrie extraite");
      failed++;
      continue;
    }

    // Update company
    try {
      const updateData: Record<string, unknown> = {
        industry: result.industry,
        subIndustry: result.sub_industry,
        lastEnrichedAt: new Date(),
      };

      if (result.description && !company.description) {
        updateData.description = result.description;
      }
      if (result.business_model) {
        updateData.businessModel = result.business_model;
      }
      if (result.target_market) {
        updateData.targetMarket = result.target_market;
      }
      if (result.headquarters_country) {
        updateData.headquarters = normalizeCountry(result.headquarters_country);
      }
      if (result.headquarters_city && !company.city) {
        updateData.city = result.headquarters_city;
      }
      if (result.founded_year && !company.foundedYear) {
        updateData.foundedYear = result.founded_year;
      }
      if (result.founders && result.founders.length > 0 && !company.founders) {
        updateData.founders = result.founders;
      }
      if (result.employees && !company.employeeCount) {
        updateData.employeeCount = result.employees;
      }
      if (result.is_profitable !== null) {
        updateData.isProfitable = result.is_profitable;
      }
      if (result.competitors && result.competitors.length > 0) {
        updateData.competitors = result.competitors;
      }
      if (result.notable_clients && result.notable_clients.length > 0) {
        updateData.notableClients = result.notable_clients;
      }
      if (result.confidence) {
        updateData.dataQuality = result.confidence;
      }

      await prisma.company.update({
        where: { id: company.id },
        data: updateData,
      });

      // Log enrichment
      await prisma.companyEnrichment.create({
        data: {
          companyId: company.id,
          source: EnrichmentSource.LLM_EXTRACTION,
          sourceUrl: sourceUrl,
          fieldsUpdated: Object.keys(updateData),
          newData: result,
        },
      });

      success++;
      console.log(`✅ ${result.industry.slice(0, 20)}`);
    } catch (error) {
      console.log(`❌ DB error`);
      failed++;
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RÉSUMÉ BATCH ${batchNum}:`);
  console.log(`   - Succès: ${success}/${companies.length}`);
  console.log(`   - Échecs: ${failed}`);
  console.log(`   - Sans URL: ${noUrl}`);
  console.log(`   - Coût estimé: $${totalCost.toFixed(4)}`);

  const remaining = totalWithoutIndustry - offset - companies.length;
  if (remaining > 0) {
    console.log(`\n📌 Prochain batch: npx dotenv -e .env.local -- npx tsx scripts/enrich-companies-batch.ts --batch=${batchNum + 1}`);
    console.log(`   Remaining: ${remaining} companies`);
  } else {
    console.log(`\n✅ Tous les batches sont terminés !`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
