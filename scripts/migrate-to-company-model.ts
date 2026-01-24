/**
 * Migration Script: FundingRound → Company Model
 *
 * This script:
 * 1. Identifies valid companies from FundingRound data
 * 2. Creates Company records
 * 3. Links FundingRounds to Companies
 * 4. Cleans up garbage data
 *
 * Run with:
 *   npx dotenv -e .env.local -- npx tsx scripts/migrate-to-company-model.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --clean      Delete garbage FundingRounds (names like "Que", "Les", etc.)
 */

import { PrismaClient, CompanyStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================================
// GARBAGE DETECTION
// ============================================================================

// Words that are NOT company names (French articles, question words, etc.)
const GARBAGE_WORDS = new Set([
  // French articles and common words
  "que", "les", "des", "une", "dans", "pour", "sur", "par", "avec", "sans",
  "cette", "ces", "son", "ses", "leur", "leurs", "notre", "nos", "votre", "vos",
  "qui", "quoi", "comment", "pourquoi", "quand", "combien", "lequel", "laquelle",
  "entre", "vers", "chez", "sous", "apres", "avant", "depuis", "contre",
  // Common title starters that got parsed as names
  "exclusif", "interview", "dossier", "analyse", "etude", "rapport",
  "infographie", "tribune", "edito", "podcast", "video", "entretien",
  "nouveau", "nouvelle", "nouveaux", "nouvelles", "petit", "grande",
  // Tech categories (not company names)
  "fintech", "proptech", "foodtech", "healthtech", "medtech", "edtech",
  "assurtech", "insurtech", "legaltech", "hrtech", "regtech", "cleantech",
  "deeptech", "biotech", "agritech", "govtech", "martech", "adtech",
  "agtech", "retailtech", "traveltech", "sporttech", "fashiontech",
  // Industry/sector terms
  "ecommerce", "e-commerce", "retail", "marketing", "blockchain", "crypto",
  "saas", "b2b", "b2c", "iot", "vr", "ar", "robotique", "cybersecurite",
  // Generic business words
  "startup", "startups", "entreprise", "entreprises", "societe", "societes",
  "investissement", "investissements", "levee", "levees", "fonds", "fond",
  "tour", "capital", "business", "tech", "digital", "innovation", "ventures",
  "france", "europe", "monde", "international", "mondial", "francais", "fran", "french",
  "chinois", "chine", "americain", "usa", "allemand", "anglais", "japonais",
  "capital-risque", "private-equity", "venture", "seed", "series",
  // Names that are clearly people or generic
  "jean", "pierre", "paul", "marie", "philippe", "olivier", "bruno",
  "charles", "nicolas", "francois", "antoine", "julien", "thomas",
  "laurent", "bernard", "jacques", "michel", "alain", "patrick",
  "carlos", "juan", "leclercq", "cerberus",
  // Big tech (usually article about them, not their funding)
  "google", "facebook", "amazon", "apple", "microsoft", "netflix",
  "uber", "airbnb", "spotify", "twitter", "linkedin", "instagram",
  "whatsapp", "snapchat", "tiktok", "youtube", "pinterest",
  "alibaba", "softbank", "tencent", "baidu", "tesla", "samsung",
  "intel", "oracle", "ibm", "cisco", "salesforce", "adobe", "sap",
  "orange", "fsi", "ntt", "sony", "tibco", "box", "zoom",
  // Other garbage
  "top", "best", "guide", "liste", "classement", "palmares", "return",
  "face", "cap", "mai", "avril", "mars", "juin", "juillet", "janvier",
  "radio", "internet", "cloud", "mobile", "web", "data", "ai", "ia",
  "display", "rh", "neo", "e-marketing",
  // Truncated names / orgs
  "newfund", "thefamily", "xange",
  // More generic French words
  "livraison", "industrie", "gestion", "jeux", "services", "solutions",
  "groupe", "banque", "assurance", "sante", "energie", "transport",
  "logistique", "immobilier", "education", "formation", "recrutement",
  "publicite", "communication", "media", "presse", "edition",
  "automobile", "aeronautique", "spatial", "defense", "securite",
  "alimentaire", "restauration", "hotellerie", "tourisme", "voyage",
  "sport", "loisirs", "culture", "art", "musique", "cinema",
  // English generic
  "payment", "delivery", "service", "platform", "solution", "system",
  "market", "industry", "sector", "company", "group", "network",
]);

// Minimum length for a valid company name
const MIN_NAME_LENGTH = 3;

// Maximum length for a valid company name
const MAX_NAME_LENGTH = 50;

function isGarbageName(name: string): boolean {
  if (!name) return true;

  const normalized = name.toLowerCase().trim();

  // Too short or too long
  if (normalized.length < MIN_NAME_LENGTH) return true;
  if (normalized.length > MAX_NAME_LENGTH) return true;

  // Is a known garbage word
  if (GARBAGE_WORDS.has(normalized)) return true;

  // Starts with a number (likely "19 millions", "2023", etc.)
  if (/^\d/.test(normalized)) return true;

  // Contains only common words
  const words = normalized.split(/\s+/);
  if (words.every(w => GARBAGE_WORDS.has(w))) return true;

  // Looks like a sentence fragment
  if (normalized.includes(" de ") || normalized.includes(" et ")) return true;
  if (normalized.startsWith("le ") || normalized.startsWith("la ")) return true;

  // Contains brackets (usually "[Infographie]", "[Dossier]", etc.)
  if (normalized.includes("[") || normalized.includes("]")) return true;

  return false;
}

function normalizeCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

interface MigrationStats {
  totalRounds: number;
  garbageRounds: number;
  validRounds: number;
  companiesCreated: number;
  companiesUpdated: number;
  roundsLinked: number;
  errors: number;
}

async function analyzeData(): Promise<{
  garbage: { name: string; count: number }[];
  valid: { name: string; count: number }[];
}> {
  console.log("📊 Analyzing existing data...\n");

  // Get all unique company names with counts
  const nameCounts = await prisma.$queryRaw<{ companyName: string; count: number }[]>`
    SELECT "companyName", COUNT(*)::int as count
    FROM "FundingRound"
    WHERE "companyName" IS NOT NULL
    GROUP BY "companyName"
    ORDER BY count DESC
  `;

  const garbage: { name: string; count: number }[] = [];
  const valid: { name: string; count: number }[] = [];

  for (const { companyName, count } of nameCounts) {
    if (isGarbageName(companyName)) {
      garbage.push({ name: companyName, count });
    } else {
      valid.push({ name: companyName, count });
    }
  }

  return { garbage, valid };
}

async function migrateData(dryRun: boolean, cleanGarbage: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalRounds: 0,
    garbageRounds: 0,
    validRounds: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    roundsLinked: 0,
    errors: 0,
  };

  // Step 1: Analyze
  const { garbage, valid } = await analyzeData();

  console.log(`📈 Analysis results:`);
  console.log(`   - Garbage names: ${garbage.length} unique (${garbage.reduce((s, g) => s + g.count, 0)} rounds)`);
  console.log(`   - Valid names: ${valid.length} unique (${valid.reduce((s, v) => s + v.count, 0)} rounds)`);

  // Show top garbage
  console.log(`\n🗑️  Top garbage names (will be ${cleanGarbage ? "DELETED" : "skipped"}):`);
  for (const g of garbage.slice(0, 15)) {
    console.log(`   - "${g.name}": ${g.count} rounds`);
  }

  // Show sample valid
  console.log(`\n✅ Sample valid companies:`);
  for (const v of valid.slice(0, 15)) {
    console.log(`   - "${v.name}": ${v.count} rounds`);
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No changes will be made");
    return stats;
  }

  // Step 2: Clean garbage if requested
  if (cleanGarbage) {
    console.log("\n🧹 Cleaning garbage FundingRounds...");

    for (const g of garbage) {
      try {
        const deleted = await prisma.fundingRound.deleteMany({
          where: { companyName: g.name },
        });
        stats.garbageRounds += deleted.count;
        if (garbage.indexOf(g) % 50 === 0) {
          console.log(`   Progress: ${garbage.indexOf(g)}/${garbage.length}`);
        }
      } catch (error) {
        stats.errors++;
      }
    }

    console.log(`   Deleted ${stats.garbageRounds} garbage rounds`);
  }

  // Step 3: Create/update Companies and link FundingRounds
  console.log("\n🏢 Creating Companies and linking FundingRounds...");

  // Process valid names, starting with those that have the most rounds
  for (let i = 0; i < valid.length; i++) {
    const { name } = valid[i];

    try {
      const slug = normalizeCompanySlug(name);

      if (!slug || slug.length < 2) {
        continue;
      }

      // Get all rounds for this company name
      const rounds = await prisma.fundingRound.findMany({
        where: { companyName: name, isMigrated: false },
        orderBy: { fundingDate: "desc" },
      });

      if (rounds.length === 0) continue;

      stats.validRounds += rounds.length;

      // Find or create Company
      let company = await prisma.company.findUnique({ where: { slug } });

      if (!company) {
        // Create new company with data from the most recent round
        const latestRound = rounds[0];
        const enrichedData = latestRound.enrichedData as Record<string, unknown> | null;

        company = await prisma.company.create({
          data: {
            name: name,
            slug: slug,
            description: latestRound.description,
            website: latestRound.website,
            industry: latestRound.sector,
            subIndustry: latestRound.subSector,
            headquarters: latestRound.geography,
            city: latestRound.city,
            region: latestRound.region,
            foundedYear: latestRound.foundedYear,
            employeeCount: latestRound.employeeCount,
            status: CompanyStatus.ACTIVE,
            // Aggregate financials
            totalRaised: rounds.reduce((sum, r) => {
              const amt = r.amountUsd ? Number(r.amountUsd) : 0;
              return sum + amt;
            }, 0),
            lastValuation: latestRound.valuationPost || latestRound.valuationPre,
            lastRoundStage: latestRound.stage,
            lastRoundDate: latestRound.fundingDate,
            // Metrics from enriched data
            founders: enrichedData?.founders as object || null,
            competitors: (enrichedData?.competitors as string[]) || [],
            notableClients: (enrichedData?.notable_clients as string[]) || [],
            dataQuality: latestRound.confidenceScore || 50,
          },
        });

        stats.companiesCreated++;
      } else {
        // Update company if we have better data
        const latestRound = rounds[0];
        const updateData: Record<string, unknown> = {};

        if (!company.industry && latestRound.sector) {
          updateData.industry = latestRound.sector;
        }
        if (!company.headquarters && latestRound.geography) {
          updateData.headquarters = latestRound.geography;
        }
        if (!company.foundedYear && latestRound.foundedYear) {
          updateData.foundedYear = latestRound.foundedYear;
        }
        if (latestRound.fundingDate && (!company.lastRoundDate || latestRound.fundingDate > company.lastRoundDate)) {
          updateData.lastRoundDate = latestRound.fundingDate;
          updateData.lastRoundStage = latestRound.stage;
          if (latestRound.valuationPost) {
            updateData.lastValuation = latestRound.valuationPost;
          }
        }

        // Recalculate total raised
        const allRounds = await prisma.fundingRound.findMany({
          where: { companyId: company.id },
          select: { amountUsd: true },
        });
        const currentTotal = allRounds.reduce((sum, r) => sum + (r.amountUsd ? Number(r.amountUsd) : 0), 0);
        const newTotal = rounds.reduce((sum, r) => sum + (r.amountUsd ? Number(r.amountUsd) : 0), 0);
        updateData.totalRaised = currentTotal + newTotal;

        if (Object.keys(updateData).length > 0) {
          await prisma.company.update({
            where: { id: company.id },
            data: updateData,
          });
          stats.companiesUpdated++;
        }
      }

      // Link all rounds to this company
      const roundIds = rounds.map(r => r.id);
      await prisma.fundingRound.updateMany({
        where: { id: { in: roundIds } },
        data: {
          companyId: company.id,
          isMigrated: true,
        },
      });

      stats.roundsLinked += rounds.length;

      // Progress
      if (i % 100 === 0 || i === valid.length - 1) {
        console.log(`   Progress: ${i + 1}/${valid.length} companies (${stats.roundsLinked} rounds linked)`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`   Error processing "${name}":`, error);
    }
  }

  stats.totalRounds = stats.garbageRounds + stats.validRounds;

  return stats;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const cleanGarbage = args.includes("--clean");

  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║         MIGRATION: FundingRound → Company Model                        ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Clean garbage: ${cleanGarbage ? "YES" : "NO"}`);
  console.log("");

  // Get current counts
  const totalRounds = await prisma.fundingRound.count();
  const totalCompanies = await prisma.company.count();
  const migratedRounds = await prisma.fundingRound.count({ where: { isMigrated: true } });

  console.log(`📊 Current state:`);
  console.log(`   - FundingRounds: ${totalRounds}`);
  console.log(`   - Companies: ${totalCompanies}`);
  console.log(`   - Already migrated: ${migratedRounds}`);
  console.log("");

  // Run migration
  const stats = await migrateData(dryRun, cleanGarbage);

  // Final stats
  console.log("\n\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                           MIGRATION COMPLETE                            ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`📊 Results:`);
  console.log(`   - Total rounds processed: ${stats.totalRounds}`);
  console.log(`   - Garbage rounds deleted: ${stats.garbageRounds}`);
  console.log(`   - Valid rounds linked: ${stats.roundsLinked}`);
  console.log(`   - Companies created: ${stats.companiesCreated}`);
  console.log(`   - Companies updated: ${stats.companiesUpdated}`);
  console.log(`   - Errors: ${stats.errors}`);

  // New counts
  const newTotalRounds = await prisma.fundingRound.count();
  const newTotalCompanies = await prisma.company.count();
  const newMigratedRounds = await prisma.fundingRound.count({ where: { isMigrated: true } });

  console.log(`\n📈 New state:`);
  console.log(`   - FundingRounds: ${newTotalRounds}`);
  console.log(`   - Companies: ${newTotalCompanies}`);
  console.log(`   - Migrated rounds: ${newMigratedRounds}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
