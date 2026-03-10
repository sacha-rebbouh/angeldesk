/**
 * Standalone script to fetch and display founder LinkedIn profile.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/fetch-founder-linkedin.ts
 */

import { analyzeFounderLinkedIn } from "../src/services/context-engine/connectors/rapidapi-linkedin";

const LINKEDIN_URL = "https://www.linkedin.com/in/sacha-/";

async function main() {
  console.log(`\n🔍 Fetching LinkedIn profile: ${LINKEDIN_URL}\n`);

  const result = await analyzeFounderLinkedIn(LINKEDIN_URL, "Founder & CEO");

  if (!result.success) {
    console.error(`❌ Error: ${result.error}`);
    process.exit(1);
  }

  const raw = result.rawProfile!;
  const analysis = result.analysis!;

  console.log("=".repeat(60));
  console.log(`👤 ${raw.full_name}`);
  console.log(`📍 ${raw.city ?? "?"}, ${raw.country_full_name ?? raw.country ?? "?"}`);
  console.log(`💼 ${raw.headline ?? "—"}`);
  console.log(`🔗 ${raw.connections ?? "?"} connexions | ${raw.follower_count ?? "?"} followers`);
  console.log("=".repeat(60));

  if (raw.summary) {
    console.log(`\n📝 ABOUT\n${raw.summary}\n`);
  }

  console.log("📋 EXPÉRIENCES");
  for (const exp of raw.experiences) {
    const start = exp.starts_at ? `${exp.starts_at.month ?? ""}/${exp.starts_at.year}` : "?";
    const end = exp.ends_at === null ? "Present" : exp.ends_at ? `${exp.ends_at.month ?? ""}/${exp.ends_at.year}` : "?";
    console.log(`  • ${exp.title} @ ${exp.company} (${start} → ${end})`);
    if (exp.description) {
      console.log(`    ${exp.description.slice(0, 150)}${exp.description.length > 150 ? "..." : ""}`);
    }
  }

  console.log("\n🎓 FORMATION");
  for (const edu of raw.education) {
    const degree = [edu.degree_name, edu.field_of_study].filter(Boolean).join(" — ");
    const years = [edu.starts_at?.year, edu.ends_at?.year].filter(Boolean).join("-");
    console.log(`  • ${edu.school}${degree ? ` (${degree})` : ""}${years ? ` [${years}]` : ""}`);
  }

  if (raw.skills?.length) {
    console.log(`\n🛠️  SKILLS: ${raw.skills.join(", ")}`);
  }

  if (raw.languages?.length) {
    console.log(`🌐 LANGUES: ${raw.languages.join(", ")}`);
  }

  console.log("\n📊 ANALYSE D'EXPERTISE");
  const exp = analysis.expertise;
  console.log(`  Carrière totale: ${Math.round(exp.totalCareerMonths / 12)} ans (${exp.totalCareerMonths} mois)`);
  console.log(`  Description: ${exp.expertiseDescription}`);
  if (exp.industries.length) {
    console.log(`  Industries: ${exp.industries.map(i => `${i.name} (${i.percentage}%)`).join(", ")}`);
  }
  if (exp.roles.length) {
    console.log(`  Rôles: ${exp.roles.map(r => `${r.name} (${r.percentage}%)`).join(", ")}`);
  }
  if (exp.ecosystems.length) {
    console.log(`  Ecosystèmes: ${exp.ecosystems.map(e => `${e.name} (${e.percentage}%)`).join(", ")}`);
  }

  if (analysis.redFlags.length) {
    console.log("\n⚠️  RED FLAGS");
    for (const rf of analysis.redFlags) {
      console.log(`  [${rf.severity.toUpperCase()}] ${rf.type}: ${rf.description}`);
    }
  }

  if (analysis.questionsToAsk.length) {
    console.log("\n❓ QUESTIONS");
    for (const q of analysis.questionsToAsk) {
      console.log(`  [${q.priority.toUpperCase()}] ${q.question}`);
      console.log(`    → ${q.context}`);
    }
  }

  // Output raw JSON for YAML integration
  console.log("\n" + "=".repeat(60));
  console.log("📄 RAW JSON (pour intégration YAML) :");
  console.log(JSON.stringify({
    name: raw.full_name,
    headline: raw.headline,
    city: raw.city,
    country: raw.country_full_name ?? raw.country,
    summary: raw.summary,
    connections: raw.connections,
    followers: raw.follower_count,
    experiences: raw.experiences.map(e => ({
      company: e.company,
      title: e.title,
      start: e.starts_at,
      end: e.ends_at,
      description: e.description?.slice(0, 200),
    })),
    education: raw.education.map(e => ({
      school: e.school,
      degree: e.degree_name,
      field: e.field_of_study,
      years: [e.starts_at?.year, e.ends_at?.year].filter(Boolean).join("-"),
    })),
    skills: raw.skills,
    languages: raw.languages,
    expertise: {
      description: exp.expertiseDescription,
      career_months: exp.totalCareerMonths,
      industries: exp.industries,
      roles: exp.roles,
      ecosystems: exp.ecosystems,
    },
  }, null, 2));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
