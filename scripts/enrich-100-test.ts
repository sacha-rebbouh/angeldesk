/**
 * Enrichissement de 100 articles - Test de validation
 *
 * Utilise DeepSeek via OpenRouter avec le prompt enrichi v2
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================================================================
// PROMPT ENRICHI V2
// ============================================================================

const ENRICHED_PROMPT = `Tu es un expert en analyse de levées de fonds startup. Extrais TOUTES les informations de cet article.

## RÈGLES CRITIQUES - À RESPECTER ABSOLUMENT

1. **JAMAIS INVENTER** : Si une information n'est PAS EXPLICITEMENT mentionnée dans l'article → mettre null
   - Ne PAS déduire, ne PAS supposer, ne PAS extrapoler
   - Mieux vaut null qu'une information incorrecte
   - Si tu n'es pas sûr à 100% → null

2. **PRÉCISION** : Extrait UNIQUEMENT ce qui est ÉCRIT dans l'article

3. **MONTANTS** : Convertis en nombre entier (ex: "15 millions d'euros" → 15000000)

4. **INVESTISSEURS** : Inclure TOUS les investisseurs mentionnés :
   - Fonds VC/PE dans investors_funds
   - Business Angels (personnes individuelles) dans investors_angels
   - Corporates/entreprises dans investors_corporates

5. **INDUSTRIE** : C'est CRUCIAL. Utilise la taxonomie ci-dessous. Si l'entreprise utilise l'IA comme OUTIL mais son produit est dans un autre secteur → classer dans ce secteur, PAS en "AI Pure-Play".

## TAXONOMIE DES INDUSTRIES (liste exhaustive)

### Tech & Software
- SaaS B2B : logiciels métiers, ERP, CRM, outils entreprise
- SaaS B2C : apps grand public par abonnement
- Developer Tools : APIs, SDKs, outils pour développeurs, infrastructure dev
- Cloud Infrastructure : hébergement, serverless, edge computing
- Data & Analytics : BI, data platforms, data engineering
- AI Pure-Play : entreprises dont le PRODUIT PRINCIPAL est l'IA/ML (modèles, LLMs)
- Cybersecurity : sécurité informatique, identity, compliance
- Enterprise Software : logiciels grands comptes

### Finance
- FinTech Payments : paiements, PSP, acquiring, BNPL
- FinTech Banking : neobanks, banking-as-a-service
- FinTech Lending : crédit, prêts, financement
- FinTech Insurance : assurtech, courtage digital
- FinTech Accounting : comptabilité, finance d'entreprise, CFO tools
- FinTech WealthTech : gestion patrimoine, trading, crypto
- FinTech RegTech : conformité, KYC, AML

### Health & Science
- HealthTech : santé digitale, télémédecine, apps santé
- MedTech : devices médicaux, équipements
- BioTech : biotechnologies, thérapies
- Pharma : médicaments, drug discovery
- Mental Health : santé mentale, bien-être

### Commerce
- E-commerce : vente en ligne B2C
- E-commerce B2B : wholesale, distribution
- Marketplace B2C : mise en relation consommateurs
- Marketplace B2B : mise en relation entreprises
- Retail Tech : tech pour magasins physiques
- D2C Brands : marques direct-to-consumer

### Marketing & Sales
- MarTech : marketing automation, CRM marketing
- AdTech : publicité digitale, programmatique
- Sales Tech : outils commerciaux, CRM ventes
- Influence & Creator : économie des créateurs

### HR & Work
- HRTech : RH, paie, SIRH
- Recruiting : recrutement, ATS, job boards
- Future of Work : remote, collaboration, productivité
- Corporate Learning : formation entreprise

### Real Estate & Construction
- PropTech : immobilier digital, gestion locative
- ConstructionTech : BTP, chantiers, ingénierie bâtiment
- Smart Building : bâtiments connectés

### Transport & Logistics
- Logistics : supply chain, warehousing, fulfillment
- Delivery : livraison dernier kilomètre
- Mobility : transport personnes, MaaS
- Automotive : véhicules, équipementiers

### Energy & Climate
- CleanTech : technologies propres générales
- Energy : énergie, utilities, grid
- GreenTech : environnement, économie circulaire
- Carbon : capture carbone, compensation
- AgriTech : agriculture, farming tech
- FoodTech : alimentation, food delivery, food science

### Other Verticals
- EdTech : éducation, e-learning
- LegalTech : juridique, contracts, compliance légale
- GovTech : administration, civic tech
- SpaceTech : spatial, satellites
- Gaming : jeux vidéo, esports
- Entertainment : média, streaming, musique
- Social : réseaux sociaux, communautés
- Consumer Apps : apps grand public hors catégories ci-dessus
- Hardware : produits physiques, IoT, devices
- DeepTech : R&D intensive, tech de rupture (quantum, fusion, etc.)
- Robotics : robots, automation industrielle
- TravelTech : voyage, hospitality
- Defense : défense, militaire, sécurité nationale

## FORMAT DE RÉPONSE
Réponds UNIQUEMENT avec un JSON valide. Pas de markdown, pas de commentaires, pas d'explication.

{
  "company_name": "string ou null - NE PAS INVENTER",
  "company_description": "description courte de l'activité (1-2 phrases) ou null",

  "amount": "nombre ou null (ex: 15000000 pour 15M€)",
  "currency": "EUR ou USD ou GBP ou null",
  "stage": "Pre-seed ou Seed ou Series A ou Series B ou Series C ou Series D ou Growth ou Bridge ou null",
  "valuation_pre": "nombre ou null",
  "valuation_post": "nombre ou null",

  "industry": "UNE industrie de la taxonomie ci-dessus - OBLIGATOIRE si identifiable",
  "sub_sector": "string plus précis ou null (ex: 'Néobanque', 'Drug Discovery', 'Livraison restauration')",

  "geography": "pays du siège ou null - NE PAS INVENTER",
  "headquarters_city": "ville du siège ou null - NE PAS INVENTER",

  "business_model": "SaaS ou Marketplace ou Transactionnel ou Hardware ou Services ou null",
  "target_market": "B2B ou B2C ou B2B2C ou null",
  "revenue_model": "Subscription ou Commission ou Licensing ou Freemium ou Usage-based ou null",

  "investors_funds": ["liste des fonds VC/PE - UNIQUEMENT ceux MENTIONNÉS"],
  "investors_angels": ["liste des Business Angels (PERSONNES) - UNIQUEMENT ceux MENTIONNÉS"],
  "investors_corporates": ["liste des corporates - UNIQUEMENT ceux MENTIONNÉS"],
  "lead_investor": "string ou null",

  "founders": [{"name": "string", "role": "CEO/CTO/COO/etc ou null", "background": "UNIQUEMENT si mentionné dans l'article, sinon null"}],
  "founded_year": "nombre ou null - NE PAS INVENTER",
  "employees": "nombre ou null - NE PAS INVENTER",

  "arr": "nombre ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "mrr": "nombre ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "revenue": "nombre ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "growth_rate": "nombre en % ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "customers": "nombre ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "nrr": "nombre en % ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "gmv": "nombre ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "is_profitable": "true ou false ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "is_ebitda_positive": "true ou false ou null - UNIQUEMENT si EXPLICITEMENT mentionné",

  "notable_clients": ["clients EXPLICITEMENT mentionnés - liste vide si aucun"],
  "competitors": ["concurrents EXPLICITEMENT mentionnés - liste vide si aucun"],

  "previous_rounds": "description des rounds précédents ou null",
  "total_raised": "total levé à date ou null - UNIQUEMENT si EXPLICITEMENT mentionné",
  "existing_investors": ["investisseurs précédents EXPLICITEMENT mentionnés"],

  "use_of_funds": "utilisation prévue des fonds ou null",
  "hiring_plans": "plans de recrutement ou null",
  "expansion_plans": "plans d'expansion géo ou null",

  "funding_date": "YYYY-MM-DD ou null",

  "key_quotes": ["citations importantes (max 2) - liste vide si aucune"],
  "confidence_score": "0-100 basé sur richesse de l'article"
}

RAPPEL FINAL : NE JAMAIS INVENTER. Si l'information n'est pas dans l'article → null ou liste vide.`;

// ============================================================================
// TYPES
// ============================================================================

interface EnrichedData {
  company_name: string | null;
  company_description: string | null;
  amount: number | null;
  currency: string | null;
  stage: string | null;
  valuation_pre: number | null;
  valuation_post: number | null;
  industry: string | null;
  sub_sector: string | null;
  geography: string | null;
  headquarters_city: string | null;
  business_model: string | null;
  target_market: string | null;
  revenue_model: string | null;
  investors_funds: string[];
  investors_angels: string[];
  investors_corporates: string[];
  lead_investor: string | null;
  founders: Array<{ name: string; role: string | null; background: string | null }>;
  founded_year: number | null;
  employees: number | null;
  arr: number | null;
  mrr: number | null;
  revenue: number | null;
  growth_rate: number | null;
  customers: number | null;
  nrr: number | null;
  gmv: number | null;
  is_profitable: boolean | null;
  is_ebitda_positive: boolean | null;
  notable_clients: string[];
  competitors: string[];
  previous_rounds: string | null;
  total_raised: number | null;
  existing_investors: string[];
  use_of_funds: string | null;
  hiring_plans: string | null;
  expansion_plans: string | null;
  funding_date: string | null;
  key_quotes: string[];
  confidence_score: number;
}

interface Stats {
  total: number;
  success: number;
  failed: number;
  withIndustry: number;
  withAmount: number;
  withStage: number;
  withInvestors: number;
  withFounders: number;
  avgConfidence: number;
  industries: Record<string, number>;
  totalCost: number;
  totalTime: number;
}

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
    content = content.replace(/&nbsp;/g, " ");
    content = content.replace(/&rsquo;/g, "'");
    content = content.replace(/&amp;/g, "&");
    content = content.replace(/&#8217;/g, "'");
    content = content.replace(/&#8216;/g, "'");
    content = content.replace(/&#8220;/g, '"');
    content = content.replace(/&#8221;/g, '"');
    content = content.replace(/\s+/g, " ");
    content = content.trim();

    return content.slice(0, 5000);
  } catch (error) {
    return "";
  }
}

async function extractWithLLM(content: string): Promise<EnrichedData | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: "user", content: `${ENRICHED_PROMPT}\n\nARTICLE:\n${content}` }],
      }),
    });

    const apiResponse = await response.json();
    const text = apiResponse.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as EnrichedData;
  } catch (error) {
    return null;
  }
}

async function updateFundingRound(id: string, data: EnrichedData): Promise<boolean> {
  try {
    const allInvestors = [
      ...(data.investors_funds || []),
      ...(data.investors_angels || []),
      ...(data.investors_corporates || []),
    ];

    await prisma.fundingRound.update({
      where: { id },
      data: {
        companyName: data.company_name || undefined,
        description: data.company_description || undefined,
        amount: data.amount || undefined,
        amountUsd: data.amount ? Math.round(data.amount * (data.currency === "EUR" ? 1.08 : 1)) : undefined,
        currency: data.currency || undefined,
        stage: data.stage || undefined,
        stageNormalized: data.stage?.toLowerCase().replace(/[^a-z0-9]/g, "_") || undefined,
        valuationPre: data.valuation_pre || undefined,
        valuationPost: data.valuation_post || undefined,
        sector: data.industry || undefined,
        sectorNormalized: data.industry?.toLowerCase().replace(/[^a-z0-9]/g, "_") || undefined,
        subSector: data.sub_sector || undefined,
        geography: data.geography || undefined,
        city: data.headquarters_city || undefined,
        investors: allInvestors.length > 0 ? allInvestors : undefined,
        leadInvestor: data.lead_investor || undefined,
        employeeCount: data.employees || undefined,
        foundedYear: data.founded_year || undefined,
        fundingDate: data.funding_date ? new Date(data.funding_date) : undefined,
        enrichedData: {
          ...data,
          enriched_at: new Date().toISOString(),
          enrichment_version: "v2",
        },
        confidenceScore: data.confidence_score,
        isEnriched: true,
      },
    });

    return true;
  } catch (error) {
    console.error(`DB update error for ${id}:`, error);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║         ENRICHISSEMENT 100 ARTICLES - TEST DE VALIDATION              ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  // Get 100 non-enriched articles with sourceUrl
  const articles = await prisma.fundingRound.findMany({
    where: {
      isEnriched: false,
      sourceUrl: { not: null },
    },
    select: {
      id: true,
      companyName: true,
      sourceUrl: true,
      source: true,
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  console.log(`📊 Articles à enrichir: ${articles.length}\n`);

  if (articles.length === 0) {
    console.log("❌ Aucun article non-enrichi trouvé avec sourceUrl");
    await prisma.$disconnect();
    return;
  }

  const stats: Stats = {
    total: articles.length,
    success: 0,
    failed: 0,
    withIndustry: 0,
    withAmount: 0,
    withStage: 0,
    withInvestors: 0,
    withFounders: 0,
    avgConfidence: 0,
    industries: {},
    totalCost: 0,
    totalTime: 0,
  };

  let confidenceSum = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const shortName = article.companyName?.slice(0, 30) || article.sourceUrl?.split("/").slice(-2, -1)[0]?.slice(0, 30) || "?";

    process.stdout.write(`[${String(i + 1).padStart(3)}/100] ${shortName.padEnd(32)}`);

    const startTime = Date.now();

    // Fetch content
    const content = await fetchArticleContent(article.sourceUrl!);

    if (!content || content.length < 200) {
      console.log("❌ Contenu vide/court");
      stats.failed++;
      continue;
    }

    // Extract with LLM
    const data = await extractWithLLM(content);
    const duration = Date.now() - startTime;
    stats.totalTime += duration;

    // Estimate cost (DeepSeek: $0.14/1M input, $0.28/1M output)
    const cost = (content.length / 4 * 0.14 + 800 * 0.28) / 1_000_000;
    stats.totalCost += cost;

    if (!data) {
      console.log("❌ Extraction échouée");
      stats.failed++;
      continue;
    }

    // Update DB
    const updated = await updateFundingRound(article.id, data);

    if (!updated) {
      console.log("❌ DB update échoué");
      stats.failed++;
      continue;
    }

    // Stats
    stats.success++;
    if (data.industry) {
      stats.withIndustry++;
      stats.industries[data.industry] = (stats.industries[data.industry] || 0) + 1;
    }
    if (data.amount) stats.withAmount++;
    if (data.stage) stats.withStage++;
    if ((data.investors_funds?.length || 0) + (data.investors_angels?.length || 0) > 0) stats.withInvestors++;
    if (data.founders?.length > 0) stats.withFounders++;
    confidenceSum += data.confidence_score || 0;

    // Output
    const amountStr = data.amount ? `${(data.amount / 1_000_000).toFixed(1)}M` : "N/A";
    const industryStr = data.industry?.slice(0, 20) || "?";
    console.log(`✅ ${amountStr.padEnd(8)} | ${industryStr.padEnd(20)} | ${duration}ms`);

    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  stats.avgConfidence = stats.success > 0 ? Math.round(confidenceSum / stats.success) : 0;

  // Summary
  console.log("\n\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                           RÉSUMÉ                                        ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log("📊 STATISTIQUES GLOBALES:");
  console.log(`   - Total traité: ${stats.total}`);
  console.log(`   - Succès: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(0)}%)`);
  console.log(`   - Échecs: ${stats.failed}`);
  console.log(`   - Temps total: ${(stats.totalTime / 1000).toFixed(1)}s`);
  console.log(`   - Coût total: $${stats.totalCost.toFixed(4)}`);
  console.log(`   - Coût/article: $${(stats.totalCost / stats.success).toFixed(5)}`);

  console.log("\n📈 QUALITÉ DES DONNÉES:");
  console.log(`   - Avec industrie: ${stats.withIndustry}/${stats.success} (${((stats.withIndustry / stats.success) * 100).toFixed(0)}%)`);
  console.log(`   - Avec montant: ${stats.withAmount}/${stats.success} (${((stats.withAmount / stats.success) * 100).toFixed(0)}%)`);
  console.log(`   - Avec stage: ${stats.withStage}/${stats.success} (${((stats.withStage / stats.success) * 100).toFixed(0)}%)`);
  console.log(`   - Avec investisseurs: ${stats.withInvestors}/${stats.success} (${((stats.withInvestors / stats.success) * 100).toFixed(0)}%)`);
  console.log(`   - Avec founders: ${stats.withFounders}/${stats.success} (${((stats.withFounders / stats.success) * 100).toFixed(0)}%)`);
  console.log(`   - Confidence moyenne: ${stats.avgConfidence}/100`);

  console.log("\n🏷️  RÉPARTITION PAR INDUSTRIE:");
  const sortedIndustries = Object.entries(stats.industries).sort((a, b) => b[1] - a[1]);
  for (const [industry, count] of sortedIndustries.slice(0, 15)) {
    const bar = "█".repeat(Math.ceil(count / 2));
    console.log(`   ${industry.padEnd(25)} ${String(count).padStart(3)} ${bar}`);
  }
  if (sortedIndustries.length > 15) {
    console.log(`   ... et ${sortedIndustries.length - 15} autres industries`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Test terminé.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
