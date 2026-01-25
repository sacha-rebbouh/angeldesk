/**
 * Test enrichment on ONE article to debug DB save issues
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
  "growth_rate": "nombre en % ou null",
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

async function test() {
  // Fetch one article
  const res = await fetch("https://www.frenchweb.fr/wp-json/wp/v2/posts?categories=11276&per_page=1&_fields=link");
  const posts = await res.json();
  const url = posts[0].link;
  console.log("URL:", url);

  // Fetch content
  const htmlRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await htmlRes.text();
  let content = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<[^>]+>/g, " ");
  content = content.replace(/&nbsp;/g, " ");
  content = content.replace(/&rsquo;/g, "'");
  content = content.replace(/\s+/g, " ").trim().slice(0, 4000);
  console.log("Content length:", content.length);

  // Extract with LLM
  const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat", // ~$0.14-0.28/MTok
      max_tokens: 1000,
      messages: [{ role: "user", content: `${EXTRACTION_PROMPT}\n\nARTICLE:\n${content}` }],
    }),
  });

  const llmData = await llmRes.json();
  const text = llmData.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("No JSON found in response:", text.slice(0, 200));
    await prisma.$disconnect();
    return;
  }

  const extracted = JSON.parse(jsonMatch[0]);
  console.log("\nExtracted data:");
  console.log(JSON.stringify(extracted, null, 2));

  // Try to save
  const sourceId = url.split("/").filter(Boolean).pop() || "test";
  const companySlug = (extracted.company_name || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "");

  const toNumber = (val: number | null): number | null => {
    if (val === null || val === undefined || isNaN(Number(val))) return null;
    return Math.round(Number(val) * 100) / 100;
  };

  const enrichedData = {
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
    extractedAt: new Date().toISOString(),
  };

  // Parse date safely
  let fundingDate: Date | null = null;
  if (extracted.funding_date) {
    try {
      fundingDate = new Date(extracted.funding_date);
      if (isNaN(fundingDate.getTime())) fundingDate = null;
    } catch {
      fundingDate = null;
    }
  }

  console.log("\nData to save:");
  console.log("- companyName:", extracted.company_name);
  console.log("- amount:", toNumber(extracted.amount));
  console.log("- stage:", extracted.stage);
  console.log("- sector:", extracted.sector);
  console.log("- investors:", extracted.investors);
  console.log("- fundingDate:", fundingDate);

  try {
    const result = await prisma.fundingRound.upsert({
      where: {
        source_sourceId: {
          source: "test_real",
          sourceId,
        },
      },
      create: {
        companyName: extracted.company_name || "Unknown",
        companySlug,
        description: extracted.company_description || null,
        amount: toNumber(extracted.amount),
        amountUsd: extracted.amount ? toNumber(Number(extracted.amount) * 1.08) : null,
        currency: extracted.currency || "EUR",
        stage: extracted.stage,
        stageNormalized: extracted.stage?.toLowerCase().replace(/[^a-z0-9]/g, "_") || null,
        valuationPre: toNumber(extracted.valuation),
        sector: extracted.sector,
        sectorNormalized: extracted.sector?.toLowerCase() || null,
        geography: extracted.geography || "France",
        region: "europe",
        fundingDate,
        investors: extracted.investors || [],
        leadInvestor: extracted.lead_investor,
        employeeCount: extracted.employees,
        source: "test_real",
        sourceUrl: url,
        sourceId,
        enrichedData,
        confidenceScore: extracted.confidence_score,
        isEnriched: true,
      },
      update: {},
    });
    console.log("\n✅ Saved successfully:", result.companyName, result.id);

    // Clean up
    await prisma.fundingRound.delete({ where: { id: result.id } });
    console.log("✅ Cleaned up");
  } catch (error) {
    console.error("\n❌ Save error:");
    console.error(error);
  }

  await prisma.$disconnect();
}

test();
