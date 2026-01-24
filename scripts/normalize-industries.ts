/**
 * Normalise les industries vers la taxonomie standard
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/normalize-industries.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapping des variantes vers la taxonomie standard
const INDUSTRY_MAPPING: Record<string, string> = {
  // FinTech variants
  "fintech": "FinTech",
  "fintech payments": "FinTech Payments",
  "fintech banking": "FinTech Banking",
  "fintech lending": "FinTech Lending",
  "fintech insurance": "FinTech Insurance",
  "fintech accounting": "FinTech Accounting",
  "fintech wealthtech": "FinTech WealthTech",
  "insurtech": "FinTech Insurance",
  "assurtech": "FinTech Insurance",
  "crowdfunding": "FinTech Lending",
  "bitcoin": "FinTech",
  "blockchain": "FinTech",
  "web3": "FinTech",
  "vc": "FinTech",
  "venture capital": "FinTech",

  // HealthTech variants
  "healthtech": "HealthTech",
  "medtech": "MedTech",
  "biotech": "BioTech",
  "pharma": "Pharma",
  "mental health": "Mental Health",
  "healthtech, hrtech": "HealthTech",
  "healthtech, insurtech": "HealthTech",
  "fitnesstech": "HealthTech",

  // E-commerce variants
  "e-commerce": "E-commerce",
  "ecommerce": "E-commerce",
  "retail & e-commerce": "E-commerce",
  "retail & ecommerce": "E-commerce",
  "retail & logistics": "E-commerce",
  "retail & marketplace": "E-commerce",
  "retail, e-commerce, machine learning": "E-commerce",
  "retail": "Retail Tech",
  "retailtech": "Retail Tech",
  "retail tech": "Retail Tech",
  "retail media": "Retail Tech",

  // MarTech variants
  "martech": "MarTech",
  "marttech": "MarTech",
  "adtech": "AdTech",
  "marketing": "MarTech",
  "marketing & sales": "MarTech",
  "marketing data": "MarTech",
  "seo": "MarTech",
  "crm": "MarTech",
  "saas, crm, ai": "MarTech",

  // SaaS variants
  "saas": "SaaS B2B",
  "saas b2b": "SaaS B2B",
  "saas b2c": "SaaS B2C",
  "b2b saas": "SaaS B2B",
  "b2b": "SaaS B2B",
  "software": "Enterprise Software",
  "software services": "Enterprise Software",
  "enterprise software": "Enterprise Software",
  "tech": "Enterprise Software",
  "tech & software": "Enterprise Software",
  "tech services": "Enterprise Software",
  "tech, digital": "Enterprise Software",
  "services tech": "Enterprise Software",
  "it": "Enterprise Software",
  "informatique": "Enterprise Software",
  "digital transformation": "Enterprise Software",
  "erp": "Enterprise Software",
  "cms": "Enterprise Software",
  "devops": "Developer Tools",
  "developer tools": "Developer Tools",

  // AI variants
  "ai": "AI Pure-Play",
  "ai pure-play": "AI Pure-Play",
  "big data": "Data & Analytics",
  "big data, ai": "Data & Analytics",
  "data & analytics": "Data & Analytics",
  "datatech": "Data & Analytics",
  "data hub": "Data & Analytics",
  "dataprivacy": "Data & Analytics",
  "rpa": "AI Pure-Play",
  "robotics, ai": "Robotics",

  // Mobility variants
  "mobility": "Mobility",
  "mobilitytech": "Mobility",
  "mobility tech": "Mobility",
  "mobility, autonomous vehicles": "Mobility",
  "automotive": "Automotive",
  "automobile": "Automotive",
  "cartech": "Automotive",
  "transportation": "Logistics",
  "transport, logistics": "Logistics",
  "logistics": "Logistics",
  "logistictech": "Logistics",
  "delivery": "Delivery",
  "food delivery": "Delivery",

  // PropTech variants
  "proptech": "PropTech",
  "real estate": "PropTech",
  "constructech": "ConstructionTech",
  "constructechtech": "ConstructionTech",
  "constructtech": "ConstructionTech",
  "construction": "ConstructionTech",
  "proptech, constructiontech, smart building": "PropTech",
  "smart building": "Smart Building",
  "smart buildings": "Smart Building",
  "coworking": "PropTech",

  // HRTech variants
  "hrtech": "HRTech",
  "hr tech": "HRTech",
  "hr": "HRTech",
  "rh": "HRTech",
  "future of work": "Future of Work",
  "corporate learning": "Corporate Learning",
  "travail collaboratif": "Future of Work",

  // EdTech variants
  "edtech": "EdTech",

  // Entertainment variants
  "entertainment": "Entertainment",
  "entertainment technology": "Entertainment",
  "media": "Entertainment",
  "media tech": "Entertainment",
  "media/entertainment": "Entertainment",
  "gaming": "Gaming",
  "gaming, entertainment, social, consumer apps": "Gaming",
  "esport": "Gaming",
  "e-sport": "Gaming",
  "music": "Entertainment",
  "music tech": "Entertainment",
  "streaming": "Entertainment",
  "video streaming": "Entertainment",
  "social": "Social",
  "social media": "Social",
  "social network": "Social",
  "social media intelligence": "Social",
  "dating": "Social",
  "consumer apps": "Consumer Apps",
  "mobile applications": "Consumer Apps",
  "mobile services": "Consumer Apps",
  "messaging": "Consumer Apps",
  "messagerie instantanée": "Consumer Apps",

  // CleanTech variants
  "cleantech": "CleanTech",
  "greentech": "GreenTech",
  "energy": "Energy",
  "energtech": "Energy",
  "energy management": "Energy",

  // AgriTech variants
  "agritech": "AgriTech",
  "agtech": "AgriTech",
  "agriculture": "AgriTech",
  "foodtech": "FoodTech",

  // Travel variants
  "traveltech": "TravelTech",
  "travel tech": "TravelTech",
  "tourism": "TravelTech",
  "hospitality": "TravelTech",
  "hospitalitytech": "TravelTech",

  // Other Tech verticals
  "legaltech": "LegalTech",
  "govtech": "GovTech",
  "spacetech": "SpaceTech",
  "aerotech": "SpaceTech",
  "defense": "Defense",
  "defensetech": "Defense",
  "defense tech": "Defense",
  "cybersecurity": "Cybersecurity",
  "privacy tech": "Cybersecurity",

  // Hardware variants
  "hardware": "Hardware",
  "deeptech": "DeepTech",
  "robotics": "Robotics",
  "robotique industrielle": "Robotics",
  "drones": "Robotics",
  "drone tech": "Robotics",
  "drone technology": "Robotics",
  "iot": "Hardware",
  "objets connectés": "Hardware",
  "smart city, iot": "Hardware",
  "3d printing": "Hardware",
  "semiconductors": "Hardware",
  "smartphones": "Hardware",
  "quantique": "DeepTech",
  "ar/vr": "Hardware",
  "vr": "Hardware",
  "virtualreality": "Hardware",
  "réalité augmentée": "Hardware",

  // Marketplace variants
  "marketplace": "Marketplace B2C",
  "marketplace b2c": "Marketplace B2C",
  "marketplace b2b": "Marketplace B2B",
  "consommation collaborative": "Marketplace B2C",
  "passion economy": "Marketplace B2C",

  // Others
  "telecom": "Telecom",
  "telecommunications": "Telecom",
  "cloud": "Cloud Infrastructure",
  "cloud infrastructure": "Cloud Infrastructure",
  "cloud computing": "Cloud Infrastructure",
  "cloud services": "Cloud Infrastructure",
  "cloud storage": "Cloud Infrastructure",
  "datacenters": "Cloud Infrastructure",
  "storage": "Cloud Infrastructure",
  "database management": "Cloud Infrastructure",

  // Niche
  "beautytech": "D2C Brands",
  "fashiontech": "D2C Brands",
  "pettech": "Consumer Apps",
  "sporttech": "Entertainment",
  "sportech": "Entertainment",
  "ticketing": "Entertainment",
  "arts et culture": "Entertainment",
  "culture": "Entertainment",
  "cultural tech": "Entertainment",
  "art, online auctions": "Entertainment",
  "design": "Consumer Apps",
  "interior design": "Consumer Apps",
  "advertising": "AdTech",
  "enterprise communication": "Enterprise Software",
  "manufacturing": "Hardware",
  "industrie": "Hardware",
  "industrie 4.0": "Hardware",
  "industry": "Hardware",
  "industrialtech": "Hardware",
  "navigation par satellite": "SpaceTech",
  "services": "Enterprise Software",
  "services à la personne": "Marketplace B2C",
  "commerce": "E-commerce",
  "communication digitale": "MarTech",
  "mobile analytics": "Data & Analytics",
  "other verticals": null, // Will be set to null to skip
};

async function normalizeIndustries() {
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    NORMALISATION DES INDUSTRIES                         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  // Get all unique industries
  const industries = await prisma.$queryRaw<{ industry: string; count: number }[]>`
    SELECT industry, COUNT(*)::int as count
    FROM "Company"
    WHERE industry IS NOT NULL
    GROUP BY industry
    ORDER BY count DESC
  `;

  console.log(`📊 ${industries.length} industries uniques à analyser\n`);

  let updated = 0;
  let skipped = 0;
  const unmapped: string[] = [];

  for (const { industry, count } of industries) {
    const normalized = industry.toLowerCase().trim();
    const mapping = INDUSTRY_MAPPING[normalized];

    if (mapping === undefined) {
      // Not in mapping - check if it's already a valid taxonomy value
      const validTaxonomy = Object.values(INDUSTRY_MAPPING).includes(industry);
      if (!validTaxonomy) {
        unmapped.push(`"${industry}" (${count})`);
      }
      skipped += count;
      continue;
    }

    if (mapping === null) {
      // Explicitly skip
      skipped += count;
      continue;
    }

    if (mapping === industry) {
      // Already correct
      skipped += count;
      continue;
    }

    // Update
    const result = await prisma.company.updateMany({
      where: { industry },
      data: { industry: mapping },
    });

    console.log(`✅ "${industry}" → "${mapping}" (${result.count} companies)`);
    updated += result.count;
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RÉSUMÉ:`);
  console.log(`   - Mises à jour: ${updated}`);
  console.log(`   - Déjà corrects: ${skipped}`);

  if (unmapped.length > 0) {
    console.log(`\n⚠️  Industries non mappées (${unmapped.length}):`);
    unmapped.forEach(u => console.log(`   - ${u}`));
  }

  // Final count
  const finalCount = await prisma.$queryRaw<{ industry: string; count: number }[]>`
    SELECT industry, COUNT(*)::int as count
    FROM "Company"
    WHERE industry IS NOT NULL
    GROUP BY industry
    ORDER BY count DESC
  `;

  console.log(`\n📈 Après normalisation: ${finalCount.length} industries uniques`);

  await prisma.$disconnect();
}

normalizeIndustries().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
