/**
 * Test du prompt enrichi avec TOUS les champs
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const TEST_URLS = [
  "https://www.frenchweb.fr/tcv-et-blackstone-growth-entrent-au-capital-de-pennylane-et-injectent-175-millions-deuros/459755",
  "https://www.frenchweb.fr/revox-le-marketing-automation-sattaque-enfin-au-telephone-la-startup-leve-25-millions-deuros/459660",
  "https://www.frenchweb.fr/endra-leve-17-millions-deuros-en-seed-pour-automatiser-lingenierie-mep/459323",
  "https://www.frenchweb.fr/avec-281-millions-deuros-leves-lovable-veut-simposer-comme-un-acteur-cle-du-logiciel-pilote-par-lia/459318",
  "https://www.frenchweb.fr/arcads-ai-leve-14-millions-deuros-pour-industrialiser-la-production-video-marketing-par-lia/459274",
];

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

5. **INDUSTRIE** : C'est CRUCIAL. Utilise la taxonomie ci-dessous. Si l'entreprise utilise l'IA comme OUTIL mais son produit est dans un autre secteur → classer dans ce secteur, PAS en "AI".

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

  return content.slice(0, 5000); // Un peu plus pour le contexte
}

async function extractWithLLM(content: string, url: string): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      max_tokens: 2000, // Plus de tokens pour la réponse enrichie
      temperature: 0.1, // Moins de créativité = moins d'invention
      messages: [{ role: "user", content: `${ENRICHED_PROMPT}\n\nARTICLE:\n${content}` }],
    }),
  });

  const apiResponse = await response.json();
  const text = apiResponse.choices?.[0]?.message?.content || "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║         TEST PROMPT ENRICHI - 5 ARTICLES (DeepSeek)                    ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    const shortName = url.split("/").slice(-2, -1)[0]?.slice(0, 50);

    console.log(`\n${"═".repeat(90)}`);
    console.log(`[${i + 1}/5] ${shortName}`);
    console.log(`${"═".repeat(90)}\n`);

    const content = await fetchArticleContent(url);
    console.log(`📄 Contenu: ${content.length} chars\n`);

    const start = Date.now();
    const result = await extractWithLLM(content, url);
    const duration = Date.now() - start;

    if (result) {
      console.log(JSON.stringify(result, null, 2));
      console.log(`\n⏱️  Extraction: ${duration}ms`);
    } else {
      console.log("❌ Extraction échouée");
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n\n✅ Test terminé. Vérifie la qualité des extractions ci-dessus.");
}

main().catch(console.error);
