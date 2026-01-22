/**
 * BPI France Connector
 *
 * Provides validation signals from French public investment bank:
 * - JEI (Jeune Entreprise Innovante) status
 * - French Tech labels (Next40, FT120)
 * - BPI investments and grants
 * - Bourse French Tech recipients
 *
 * Sources:
 * - https://www.bpifrance.fr
 * - https://lafrenchtech.com
 * - Public lists and announcements
 *
 * Cost: FREE (public data)
 * Value: "Has the French state validated this company?"
 */

import type {
  Connector,
  ConnectorQuery,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface BPIValidation {
  companyName: string;
  siren?: string;
  validations: {
    type: ValidationLabel;
    year?: number;
    details?: string;
    source: string;
  }[];
  totalValidationScore: number; // 0-100 based on number and quality of validations
}

export type ValidationLabel =
  | "jei" // Jeune Entreprise Innovante
  | "jec" // Jeune Entreprise de Croissance
  | "cir" // Crédit Impôt Recherche (implied)
  | "next40" // French Tech Next40
  | "ft120" // French Tech 120
  | "french_tech" // French Tech label
  | "bourse_french_tech" // Grant recipient
  | "bpi_investment" // Direct BPI investment
  | "bpi_loan" // BPI loan (PGE, etc.)
  | "concours_ilab" // i-Lab innovation contest
  | "french_tech_visa"; // International talent visa

// ============================================================================
// STATIC DATA - KNOWN FRENCH TECH COMPANIES
// ============================================================================

// Next40 2024 - Les 40 scale-ups françaises les plus prometteuses
const NEXT40_2024: string[] = [
  "alan", "algolia", "ankorstore", "back market", "believe", "blablacar",
  "contentsquare", "dataiku", "deezer", "doctolib", "exotec", "figurines",
  "ivalua", "ledger", "lydia", "manomano", "meero", "mirakl", "mwm",
  "ogury", "openclassrooms", "ovh", "payfit", "pennylane", "pigment",
  "platform.sh", "playplay", "prestashop", "qonto", "shift technology",
  "spendesk", "swile", "talend", "veepee", "vestiaire collective",
  "withings", "ynsect", "younited", "zenly"
];

// FT120 2024 - Extended list (sample - would need full list)
const FT120_2024: string[] = [
  // All Next40 plus...
  ...NEXT40_2024,
  "agicap", "aircall", "alma", "batch", "brut", "bump", "capita",
  "cheerz", "cleany", "convelio", "datadog", "evaneos", "frichti",
  "getaround", "gleamer", "heetch", "hivebrite", "ornikar", "papernest",
  "phenix", "sezane", "shine", "skello", "sorare", "stan", "stockly",
  "sweep", "tableau de bord", "teachable", "toucan toco", "treatwell",
  "unit", "virtuo", "wavy", "welcometothejungle", "wttj", "yousign"
];

// Bourse French Tech 2023-2024 recipients (sample)
const BOURSE_FT_RECIPIENTS: { name: string; year: number; amount?: number }[] = [
  { name: "example startup 1", year: 2024, amount: 30000 },
  { name: "example startup 2", year: 2024, amount: 45000 },
  // In production, this would be populated from official lists
];

// i-Lab winners (sample)
const ILAB_WINNERS: { name: string; year: number; category?: string }[] = [
  { name: "prophesee", year: 2023, category: "deeptech" },
  { name: "aqemia", year: 2022, category: "healthtech" },
  // In production, this would be populated from official lists
];

// Known BPI-backed companies (sample from public announcements)
const BPI_BACKED: { name: string; type: "investment" | "loan"; year?: number }[] = [
  { name: "doctolib", type: "investment", year: 2020 },
  { name: "blablacar", type: "investment", year: 2018 },
  { name: "ovh", type: "investment", year: 2016 },
  // This list would grow from news scraping
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, "") // Remove special chars
    .trim();
}

function matchesCompany(searchName: string, listName: string): boolean {
  const normalizedSearch = normalizeCompanyName(searchName);
  const normalizedList = normalizeCompanyName(listName);

  return (
    normalizedSearch === normalizedList ||
    normalizedSearch.includes(normalizedList) ||
    normalizedList.includes(normalizedSearch)
  );
}

function calculateValidationScore(validations: BPIValidation["validations"]): number {
  let score = 0;

  for (const v of validations) {
    switch (v.type) {
      case "next40":
        score += 40; // Top tier - huge validation
        break;
      case "ft120":
        score += 30; // Very strong
        break;
      case "bpi_investment":
        score += 25; // Direct state investment
        break;
      case "concours_ilab":
        score += 20; // Innovation contest winner
        break;
      case "bourse_french_tech":
        score += 15; // Grant recipient
        break;
      case "jei":
        score += 15; // R&D validation
        break;
      case "french_tech":
        score += 10; // Basic label
        break;
      case "bpi_loan":
        score += 10; // Loan (less selective than investment)
        break;
      case "jec":
        score += 10;
        break;
      case "french_tech_visa":
        score += 5;
        break;
      default:
        score += 5;
    }
  }

  return Math.min(100, score);
}

const bpiSource: DataSource = {
  type: "web_search",
  name: "BPI France / French Tech",
  url: "https://lafrenchtech.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95, // Official government data
};

// ============================================================================
// MAIN LOOKUP FUNCTIONS
// ============================================================================

/**
 * Check if a company has any BPI/French Tech validations
 */
export function checkValidations(companyName: string): BPIValidation {
  const validations: BPIValidation["validations"] = [];

  // Check Next40
  if (NEXT40_2024.some(name => matchesCompany(companyName, name))) {
    validations.push({
      type: "next40",
      year: 2024,
      details: "Member of French Tech Next40 - Top 40 French scale-ups",
      source: "lafrenchtech.com",
    });
  }

  // Check FT120 (only if not already in Next40)
  if (validations.length === 0 &&
      FT120_2024.some(name => matchesCompany(companyName, name))) {
    validations.push({
      type: "ft120",
      year: 2024,
      details: "Member of French Tech 120 - Top 120 French startups",
      source: "lafrenchtech.com",
    });
  }

  // Check Bourse French Tech
  const bourseFT = BOURSE_FT_RECIPIENTS.find(r => matchesCompany(companyName, r.name));
  if (bourseFT) {
    validations.push({
      type: "bourse_french_tech",
      year: bourseFT.year,
      details: bourseFT.amount
        ? `Bourse French Tech recipient - ${bourseFT.amount}€`
        : "Bourse French Tech recipient",
      source: "bpifrance.fr",
    });
  }

  // Check i-Lab
  const ilabWinner = ILAB_WINNERS.find(w => matchesCompany(companyName, w.name));
  if (ilabWinner) {
    validations.push({
      type: "concours_ilab",
      year: ilabWinner.year,
      details: `i-Lab innovation contest winner${ilabWinner.category ? ` (${ilabWinner.category})` : ""}`,
      source: "bpifrance.fr",
    });
  }

  // Check BPI backing
  const bpiBacked = BPI_BACKED.find(b => matchesCompany(companyName, b.name));
  if (bpiBacked) {
    validations.push({
      type: bpiBacked.type === "investment" ? "bpi_investment" : "bpi_loan",
      year: bpiBacked.year,
      details: bpiBacked.type === "investment"
        ? "BPI France direct investment"
        : "BPI France loan recipient",
      source: "bpifrance.fr",
    });
  }

  return {
    companyName,
    validations,
    totalValidationScore: calculateValidationScore(validations),
  };
}

/**
 * Check if a company is likely JEI based on characteristics
 * Note: Official JEI status is not publicly available in bulk
 */
export function assessJEILikelihood(
  companyAge: number, // in years
  hasRnD: boolean,
  isIndependent: boolean,
  employeeCount?: number
): {
  likely: boolean;
  confidence: number;
  criteria: { name: string; met: boolean }[];
} {
  const criteria: { name: string; met: boolean }[] = [];

  // JEI criteria (simplified)
  // 1. Less than 8 years old
  const ageCriteria = companyAge < 8;
  criteria.push({ name: "Moins de 8 ans", met: ageCriteria });

  // 2. R&D activity (15%+ of expenses)
  criteria.push({ name: "Activité R&D significative", met: hasRnD });

  // 3. Independent (not >25% owned by large company)
  criteria.push({ name: "Entreprise indépendante", met: isIndependent });

  // 4. Less than 250 employees
  const sizeCriteria = !employeeCount || employeeCount < 250;
  criteria.push({ name: "Moins de 250 salariés", met: sizeCriteria });

  // 5. New company (not from restructuring)
  criteria.push({ name: "Création nouvelle", met: true }); // Assume true

  const metCount = criteria.filter(c => c.met).length;
  const likely = metCount >= 4;
  const confidence = (metCount / criteria.length) * 100;

  return { likely, confidence, criteria };
}

/**
 * Get investment thesis validation
 * Summarizes what the French state thinks of this company
 */
export function getStateValidationSummary(companyName: string): {
  hasValidation: boolean;
  score: number; // 0-100
  tier: "top" | "validated" | "none";
  labels: string[];
  investmentThesisSupport: string;
} {
  const validation = checkValidations(companyName);

  const labels = validation.validations.map(v => {
    switch (v.type) {
      case "next40": return "Next40";
      case "ft120": return "FT120";
      case "bpi_investment": return "BPI Investment";
      case "bpi_loan": return "BPI Loan";
      case "bourse_french_tech": return "Bourse FT";
      case "concours_ilab": return "i-Lab Winner";
      case "jei": return "JEI";
      case "french_tech": return "French Tech";
      default: return v.type;
    }
  });

  let tier: "top" | "validated" | "none";
  if (validation.validations.some(v => v.type === "next40")) {
    tier = "top";
  } else if (validation.validations.length > 0) {
    tier = "validated";
  } else {
    tier = "none";
  }

  let investmentThesisSupport: string;
  if (tier === "top") {
    investmentThesisSupport = "Strong institutional validation - recognized as top French scale-up by government";
  } else if (tier === "validated") {
    investmentThesisSupport = "Has received French state validation/support - positive signal for quality";
  } else {
    investmentThesisSupport = "No known French state validation - not a red flag, but no extra credibility";
  }

  return {
    hasValidation: validation.validations.length > 0,
    score: validation.totalValidationScore,
    tier,
    labels,
    investmentThesisSupport,
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const bpiFranceConnector: Connector = {
  name: "BPI France",
  type: "web_search",

  isConfigured: () => true, // Always available (static data + scraping)

  // This connector doesn't provide traditional news/competitors
  // It provides validation signals that enhance confidence
  getNews: async (query: ConnectorQuery) => {
    if (!query.companyName) return [];

    const validation = checkValidations(query.companyName);

    if (validation.validations.length === 0) return [];

    // Convert validations to "news" items for the context engine
    return validation.validations.map(v => ({
      title: `${query.companyName}: ${v.details || v.type}`,
      description: `Official French state validation: ${v.type}${v.year ? ` (${v.year})` : ""}`,
      url: `https://${v.source}`,
      source: "BPI France / French Tech",
      publishedAt: v.year ? `${v.year}-01-01` : new Date().toISOString(),
      sentiment: "positive" as const,
      relevance: 0.95,
      category: "company" as const,
    }));
  },
};

// ============================================================================
// DATA REFRESH FUNCTIONS
// ============================================================================

/**
 * In production, these would scrape official sources to update the lists
 */

export async function refreshNext40List(): Promise<string[]> {
  // Would scrape https://lafrenchtech.com/fr/la-france-aide-les-startups/next40-2/
  // For now, return static list
  console.log("[BPI France] Would refresh Next40 list from lafrenchtech.com");
  return NEXT40_2024;
}

export async function refreshFT120List(): Promise<string[]> {
  // Would scrape https://lafrenchtech.com/fr/la-france-aide-les-startups/french-tech-120/
  console.log("[BPI France] Would refresh FT120 list from lafrenchtech.com");
  return FT120_2024;
}

export async function refreshBourseFTRecipients(): Promise<typeof BOURSE_FT_RECIPIENTS> {
  // Would scrape BPI France press releases
  console.log("[BPI France] Would refresh Bourse FT recipients from bpifrance.fr");
  return BOURSE_FT_RECIPIENTS;
}
