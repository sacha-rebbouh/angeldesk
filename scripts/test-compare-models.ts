/**
 * Compare DeepSeek vs Haiku on the same 20 articles
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Same 20 URLs from the previous test
const TEST_URLS = [
  "https://www.frenchweb.fr/ce-que-la-serie-d-de-preply-revele-de-la-nouvelle-selectivite-du-capital-en-edtech/459809",
  "https://www.frenchweb.fr/la-maintenance-comme-infrastructure-strategique-de-lindustrie-fracttal-leve-pres-de-30-millions-deuros/459778",
  "https://www.frenchweb.fr/tcv-et-blackstone-growth-entrent-au-capital-de-pennylane-et-injectent-175-millions-deuros/459755",
  "https://www.frenchweb.fr/agents-ia-en-entreprise-pourquoi-la-levee-de-310-millions-deuros-de-parloa-marque-un-changement-de-cadre/459666",
  "https://www.frenchweb.fr/revox-le-marketing-automation-sattaque-enfin-au-telephone-la-startup-leve-25-millions-deuros/459660",
  "https://www.frenchweb.fr/stealthmode-apres-flipkart-binny-bansal-mise-sur-linfrastructure-du-e-commerce-transfrontalier-avec-oppdoor/459635",
  "https://www.frenchweb.fr/harmattan-ai-ouvre-son-capital-a-dassault-aviation-lors-dune-serie-b-de-171-millions-deuros/459572",
  "https://www.frenchweb.fr/depistage-prenatal-comment-lia-tente-de-combler-lun-des-grands-angles-morts-de-lechographie/459523",
  "https://www.frenchweb.fr/swap-deux-tours-en-un-an-pourquoi-les-vc-securisent-les-positions-dominantes/459515",
  "https://www.frenchweb.fr/pourquoi-la-medtech-critique-ne-peut-plus-etre-financee-comme-une-startup-logicielle/459499",
  "https://www.frenchweb.fr/xai-un-tour-de-table-de-20-milliards-de-dollars-qui-eclaire-levolution-du-financement-de-lia/459482",
  "https://www.frenchweb.fr/endra-leve-17-millions-deuros-en-seed-pour-automatiser-lingenierie-mep/459323",
  "https://www.frenchweb.fr/avec-281-millions-deuros-leves-lovable-veut-simposer-comme-un-acteur-cle-du-logiciel-pilote-par-lia/459318",
  "https://www.frenchweb.fr/vega-ou-lere-des-fondateurs-ultra-experimentes-dans-la-cybersecurite/459294",
  "https://www.frenchweb.fr/deux-tours-de-table-en-un-an-ankar-leve-17-millions-deuros-pour-ses-outils-de-brevets-ia/459278",
  "https://www.frenchweb.fr/arcads-ai-leve-14-millions-deuros-pour-industrialiser-la-production-video-marketing-par-lia/459274",
  "https://www.frenchweb.fr/jutro-medical-veut-reorganiser-la-medecine-de-ville-grace-a-lia/459225",
  "https://www.frenchweb.fr/index-ventures-et-a16z-misent-35-millions-deuros-en-seed-sur-mirelo/459222",
  "https://www.frenchweb.fr/runware-leve-425-millions-deuros-pour-industrialiser-linference-ia-dans-la-generation-dimages/459196",
  "https://www.frenchweb.fr/qargo-leve-30-millions-deuros-pour-optimiser-les-trajets-a-vide-dans-le-transport-routier/459193",
];

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
  "use_of_funds": "utilisation prévue des fonds ou null",
  "competitors": ["concurrents mentionnés"],
  "funding_date": "YYYY-MM-DD ou null",
  "company_description": "description courte de l'activité ou null",
  "confidence_score": "0-100"
}`;

interface Result {
  companyName: string | null;
  amount: number | null;
  stage: string | null;
  sector: string | null;
  investors: string[];
  valuation: number | null;
  confidenceScore: number;
}

async function fetchArticleContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingBot/1.0)" },
  });
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
  content = content.replace(/\s+/g, " ");
  content = content.trim();

  return content.slice(0, 4000);
}

async function extractWithModel(content: string, model: string): Promise<Result | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: "user", content: `${EXTRACTION_PROMPT}\n\nARTICLE:\n${content}` }],
      }),
    });

    const apiResponse = await response.json();
    const text = apiResponse.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const extracted = JSON.parse(jsonMatch[0]);

    return {
      companyName: extracted.company_name,
      amount: extracted.amount,
      stage: extracted.stage,
      sector: extracted.sector,
      investors: extracted.investors || [],
      valuation: extracted.valuation,
      confidenceScore: extracted.confidence_score || 0,
    };
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║           COMPARAISON: HAIKU vs DEEPSEEK (20 articles)                 ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  // First, fetch all content once
  console.log("📥 Fetching 20 articles content...\n");
  const contents: string[] = [];
  for (const url of TEST_URLS) {
    const content = await fetchArticleContent(url);
    contents.push(content);
    process.stdout.write(".");
  }
  console.log(" Done!\n");

  // Test with Haiku
  console.log("═".repeat(80));
  console.log("🔵 CLAUDE 3.5 HAIKU");
  console.log("═".repeat(80));

  const haikuResults: (Result | null)[] = [];
  let haikuTime = 0;

  for (let i = 0; i < contents.length; i++) {
    const shortName = TEST_URLS[i].split("/").slice(-2, -1)[0]?.slice(0, 40);
    process.stdout.write(`[${i + 1}/20] ${shortName}...`);

    const start = Date.now();
    const result = await extractWithModel(contents[i], "anthropic/claude-3-5-haiku");
    const duration = Date.now() - start;
    haikuTime += duration;

    haikuResults.push(result);

    if (result) {
      const amountStr = result.amount ? `${(result.amount / 1_000_000).toFixed(1)}M` : "N/A";
      console.log(` ✅ ${result.companyName || "?"} | ${amountStr} | ${result.stage || "?"} | ${result.sector || "?"} | ${duration}ms`);
    } else {
      console.log(" ❌ Failed");
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // Test with DeepSeek
  console.log("\n" + "═".repeat(80));
  console.log("🟢 DEEPSEEK CHAT");
  console.log("═".repeat(80));

  const deepseekResults: (Result | null)[] = [];
  let deepseekTime = 0;

  for (let i = 0; i < contents.length; i++) {
    const shortName = TEST_URLS[i].split("/").slice(-2, -1)[0]?.slice(0, 40);
    process.stdout.write(`[${i + 1}/20] ${shortName}...`);

    const start = Date.now();
    const result = await extractWithModel(contents[i], "deepseek/deepseek-chat");
    const duration = Date.now() - start;
    deepseekTime += duration;

    deepseekResults.push(result);

    if (result) {
      const amountStr = result.amount ? `${(result.amount / 1_000_000).toFixed(1)}M` : "N/A";
      console.log(` ✅ ${result.companyName || "?"} | ${amountStr} | ${result.stage || "?"} | ${result.sector || "?"} | ${duration}ms`);
    } else {
      console.log(" ❌ Failed");
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // Comparison
  console.log("\n\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         COMPARAISON                                     ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  const haikuValid = haikuResults.filter(r => r !== null) as Result[];
  const deepseekValid = deepseekResults.filter(r => r !== null) as Result[];

  const metrics = [
    { name: "Articles traités", haiku: haikuValid.length, deepseek: deepseekValid.length },
    { name: "Avec montant", haiku: haikuValid.filter(r => r.amount).length, deepseek: deepseekValid.filter(r => r.amount).length },
    { name: "Avec stage", haiku: haikuValid.filter(r => r.stage).length, deepseek: deepseekValid.filter(r => r.stage).length },
    { name: "Avec secteur", haiku: haikuValid.filter(r => r.sector).length, deepseek: deepseekValid.filter(r => r.sector).length },
    { name: "Avec investors", haiku: haikuValid.filter(r => r.investors.length > 0).length, deepseek: deepseekValid.filter(r => r.investors.length > 0).length },
    { name: "Avec valuation", haiku: haikuValid.filter(r => r.valuation).length, deepseek: deepseekValid.filter(r => r.valuation).length },
  ];

  const haikuAvgConf = haikuValid.reduce((sum, r) => sum + r.confidenceScore, 0) / haikuValid.length;
  const deepseekAvgConf = deepseekValid.reduce((sum, r) => sum + r.confidenceScore, 0) / deepseekValid.length;

  console.log("┌────────────────────────┬────────────┬────────────┬─────────┐");
  console.log("│ Métrique               │   HAIKU    │  DEEPSEEK  │ Winner  │");
  console.log("├────────────────────────┼────────────┼────────────┼─────────┤");

  for (const m of metrics) {
    const winner = m.haiku > m.deepseek ? "🔵" : m.deepseek > m.haiku ? "🟢" : "🟡";
    console.log(`│ ${m.name.padEnd(22)} │ ${String(m.haiku).padStart(6)}/20  │ ${String(m.deepseek).padStart(6)}/20  │   ${winner}    │`);
  }

  console.log("├────────────────────────┼────────────┼────────────┼─────────┤");
  const confWinner = haikuAvgConf > deepseekAvgConf ? "🔵" : deepseekAvgConf > haikuAvgConf ? "🟢" : "🟡";
  console.log(`│ Confidence moyenne     │ ${haikuAvgConf.toFixed(0).padStart(6)}/100 │ ${deepseekAvgConf.toFixed(0).padStart(6)}/100 │   ${confWinner}    │`);

  console.log("├────────────────────────┼────────────┼────────────┼─────────┤");
  const timeWinner = haikuTime < deepseekTime ? "🔵" : deepseekTime < haikuTime ? "🟢" : "🟡";
  console.log(`│ Temps total            │ ${(haikuTime / 1000).toFixed(1).padStart(6)}s   │ ${(deepseekTime / 1000).toFixed(1).padStart(6)}s   │   ${timeWinner}    │`);

  console.log("├────────────────────────┼────────────┼────────────┼─────────┤");
  // Cost calculation
  const haikuCost = (1000 * 0.25 + 500 * 1.25) / 1_000_000 * 20;
  const deepseekCost = (1000 * 0.14 + 500 * 0.28) / 1_000_000 * 20;
  const costWinner = haikuCost < deepseekCost ? "🔵" : deepseekCost < haikuCost ? "🟢" : "🟡";
  console.log(`│ Coût estimé            │ $${haikuCost.toFixed(4).padStart(7)}  │ $${deepseekCost.toFixed(4).padStart(7)}  │   ${costWinner}    │`);

  console.log("└────────────────────────┴────────────┴────────────┴─────────┘");

  // Detail comparison for each article
  console.log("\n\n📋 DÉTAIL PAR ARTICLE:\n");
  console.log("┌─────────────────────────────┬──────────────────────────────┬──────────────────────────────┐");
  console.log("│ Article                     │ HAIKU                        │ DEEPSEEK                     │");
  console.log("├─────────────────────────────┼──────────────────────────────┼──────────────────────────────┤");

  for (let i = 0; i < 20; i++) {
    const h = haikuResults[i];
    const d = deepseekResults[i];
    const shortUrl = TEST_URLS[i].split("/").slice(-2, -1)[0]?.slice(0, 25) || "";

    const hStr = h ? `${h.companyName?.slice(0, 12) || "?"} ${h.amount ? (h.amount / 1_000_000).toFixed(0) + "M" : "N/A"}` : "FAILED";
    const dStr = d ? `${d.companyName?.slice(0, 12) || "?"} ${d.amount ? (d.amount / 1_000_000).toFixed(0) + "M" : "N/A"}` : "FAILED";

    console.log(`│ ${shortUrl.padEnd(27)} │ ${hStr.padEnd(28)} │ ${dStr.padEnd(28)} │`);
  }

  console.log("└─────────────────────────────┴──────────────────────────────┴──────────────────────────────┘");

  console.log("\n✅ Comparaison terminée.");
}

main().catch(console.error);
