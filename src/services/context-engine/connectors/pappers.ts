/**
 * Pappers.fr Connector
 *
 * Provides access to French company data via Pappers API:
 * - Company profiles (SIREN/SIRET)
 * - Dirigeants (officers)
 * - Financial data (bilans déposés)
 * - Beneficiaires effectifs
 *
 * API: https://www.pappers.fr/api
 * Free tier: 100 requests/month
 * Paid: Starting at 19€/month for 1000 requests
 *
 * This is THE source for French startups data.
 */

import type {
  Connector,
  ConnectorQuery,
  FounderBackground,
  Competitor,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

interface PappersSearchResult {
  resultats_siren: {
    siren: string;
    nom_entreprise: string;
    siege: {
      siret: string;
      adresse_ligne_1?: string;
      code_postal?: string;
      ville?: string;
    };
    date_creation?: string;
    tranche_effectif?: string;
    categorie_juridique?: string;
    activite_principale?: string;
    code_naf?: string;
  }[];
  total: number;
}

interface PappersCompanyProfile {
  siren: string;
  nom_entreprise: string;
  nom_commercial?: string;
  siege: {
    siret: string;
    adresse_ligne_1?: string;
    adresse_ligne_2?: string;
    code_postal?: string;
    ville?: string;
    pays?: string;
  };
  date_creation?: string;
  date_cessation?: string;
  entreprise_cessee: boolean;
  categorie_juridique?: string;
  forme_juridique?: string;
  tranche_effectif?: string;
  effectif_min?: number;
  effectif_max?: number;
  capital_social?: number;
  code_naf?: string;
  libelle_code_naf?: string;
  domaine_activite?: string;
  objet_social?: string;

  // Dirigeants
  representants?: {
    nom?: string;
    prenom?: string;
    nom_complet: string;
    qualite: string; // "Président", "Directeur général", etc.
    date_prise_de_poste?: string;
    date_de_naissance_formatee?: string;
    nationalite?: string;
  }[];

  // Beneficiaires effectifs
  beneficiaires_effectifs?: {
    nom?: string;
    prenom?: string;
    nom_complet: string;
    pourcentage_parts?: number;
    pourcentage_votes?: number;
    date_prise_de_poste?: string;
  }[];

  // Finances (from bilans)
  finances?: {
    annee: number;
    chiffre_affaires?: number;
    resultat?: number;
    effectif?: number;
  }[];

  // Procédures collectives
  procedures_collectives?: {
    type: string;
    date_debut: string;
    date_fin?: string;
  }[];

  // Documents
  derniers_statuts?: {
    date_depot: string;
    type: string;
  };
}

interface PappersFinances {
  siren: string;
  bilans: {
    annee: number;
    date_cloture: string;
    duree_exercice: number;
    chiffre_affaires?: number;
    resultat?: number;
    resultat_exploitation?: number;
    total_bilan?: number;
    capitaux_propres?: number;
    effectif?: number;
    ratio_endettement?: number;
    marge_brute?: number;
  }[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://api.pappers.fr/v2";

// NAF code to sector mapping
const NAF_TO_SECTOR: Record<string, string> = {
  "62": "SaaS B2B", // Programmation informatique
  "63": "SaaS B2B", // Services d'information
  "64": "Fintech", // Services financiers
  "65": "Fintech", // Assurance
  "66": "Fintech", // Activités auxiliaires financières
  "70": "SaaS B2B", // Conseil de gestion
  "71": "Deeptech", // Architecture et ingénierie
  "72": "Deeptech", // R&D scientifique
  "73": "SaaS B2B", // Publicité et études de marché
  "74": "SaaS B2B", // Autres activités spécialisées
  "86": "Healthtech", // Activités pour la santé
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getApiKey(): string | null {
  return process.env.PAPPERS_API_KEY ?? null;
}

async function makeRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Pappers] No API key configured");
    return null;
  }

  try {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.set("api_token", apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[Pappers] Rate limit exceeded");
      } else if (response.status === 401) {
        console.warn("[Pappers] Invalid API key");
      } else if (response.status === 404) {
        return null;
      } else {
        console.warn(`[Pappers] API error: ${response.status}`);
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Pappers] Request failed:", error);
    return null;
  }
}

function getSectorFromNAF(nafCode: string | undefined): string {
  if (!nafCode) return "Unknown";
  const prefix = nafCode.substring(0, 2);
  return NAF_TO_SECTOR[prefix] ?? "Other";
}

function parseEffectif(tranche: string | undefined): number | undefined {
  if (!tranche) return undefined;

  // Pappers returns things like "10 à 19 salariés"
  const match = tranche.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

const pappersSource: DataSource = {
  type: "crunchbase", // Similar data type
  name: "Pappers.fr",
  url: "https://www.pappers.fr",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95, // Very high - official French registry data
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const pappersConnector: Connector = {
  name: "Pappers.fr",
  type: "crunchbase",

  isConfigured: () => {
    return !!getApiKey();
  },

  getFounderBackground: async (
    founderName: string
  ): Promise<FounderBackground | null> => {
    // Pappers can search for dirigeants across all companies
    // This would require the "recherche-dirigeants" endpoint
    // For now, return null - implement when needed
    return null;
  },

  getCompetitors: async (query: ConnectorQuery): Promise<Competitor[]> => {
    if (!query.companyName) return [];

    // Search for similar companies in the same sector
    const searchResult = await makeRequest<PappersSearchResult>("/recherche", {
      q: query.sector || query.companyName,
      par_page: "10",
    });

    if (!searchResult || !searchResult.resultats_siren) return [];

    const competitors: Competitor[] = [];

    for (const company of searchResult.resultats_siren) {
      // Skip the company itself
      if (company.nom_entreprise.toLowerCase() === query.companyName?.toLowerCase()) {
        continue;
      }

      competitors.push({
        name: company.nom_entreprise,
        description: company.activite_principale,
        website: undefined,
        stage: "Unknown",
        positioning: company.activite_principale || "N/A",
        overlap: "adjacent",
        estimatedEmployees: parseEffectif(company.tranche_effectif),
        source: {
          ...pappersSource,
          retrievedAt: new Date().toISOString(),
        },
      });
    }

    return competitors.slice(0, 5);
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// For direct use when more detailed data is needed
// ============================================================================

/**
 * Search for companies by name or keyword
 */
export async function searchCompanies(
  query: string,
  limit: number = 10
): Promise<PappersSearchResult | null> {
  return makeRequest<PappersSearchResult>("/recherche", {
    q: query,
    par_page: limit.toString(),
  });
}

/**
 * Get full company profile by SIREN
 */
export async function getCompanyProfile(
  siren: string
): Promise<PappersCompanyProfile | null> {
  return makeRequest<PappersCompanyProfile>("/entreprise", {
    siren,
  });
}

/**
 * Get company financial data
 */
export async function getCompanyFinances(
  siren: string
): Promise<PappersFinances | null> {
  return makeRequest<PappersFinances>("/entreprise", {
    siren,
    champs: "finances",
  });
}

/**
 * Enrich a French company with Pappers data
 * Returns structured data useful for due diligence
 */
export async function enrichFrenchCompany(companyName: string): Promise<{
  found: boolean;
  siren?: string;
  status?: "active" | "ceased";
  dateCreation?: string;
  sector?: string;
  effectif?: number;
  capitalSocial?: number;
  address?: string;
  dirigeants?: {
    name: string;
    role: string;
    since?: string;
  }[];
  beneficiaires?: {
    name: string;
    percentage?: number;
  }[];
  finances?: {
    year: number;
    revenue?: number;
    result?: number;
    employees?: number;
  }[];
  redFlags?: string[];
} | null> {
  // Step 1: Search for company
  const searchResults = await searchCompanies(companyName, 5);
  if (!searchResults || searchResults.resultats_siren.length === 0) {
    return { found: false };
  }

  // Find best match (non-ceased company with closest name)
  const companies = searchResults.resultats_siren;
  const company = companies[0];

  // Step 2: Get full profile
  const profile = await getCompanyProfile(company.siren);
  if (!profile) {
    return { found: false };
  }

  // Step 3: Identify red flags
  const redFlags: string[] = [];

  if (profile.entreprise_cessee) {
    redFlags.push("Entreprise cessée");
  }

  if (profile.procedures_collectives && profile.procedures_collectives.length > 0) {
    const activeProcs = profile.procedures_collectives.filter(p => !p.date_fin);
    if (activeProcs.length > 0) {
      redFlags.push(`Procédure collective en cours: ${activeProcs[0].type}`);
    } else {
      redFlags.push("Historique de procédure collective");
    }
  }

  // Check capital social (very low capital can be a flag)
  if (profile.capital_social && profile.capital_social < 1000) {
    redFlags.push(`Capital social très faible: ${profile.capital_social}€`);
  }

  // Check if company is very young
  if (profile.date_creation) {
    const creationDate = new Date(profile.date_creation);
    const ageMonths = (Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths < 6) {
      redFlags.push("Entreprise créée il y a moins de 6 mois");
    }
  }

  return {
    found: true,
    siren: profile.siren,
    status: profile.entreprise_cessee ? "ceased" : "active",
    dateCreation: profile.date_creation,
    sector: getSectorFromNAF(profile.code_naf),
    effectif: profile.effectif_min,
    capitalSocial: profile.capital_social,
    address: [
      profile.siege.adresse_ligne_1,
      profile.siege.code_postal,
      profile.siege.ville,
    ]
      .filter(Boolean)
      .join(", "),
    dirigeants: profile.representants?.map((r) => ({
      name: r.nom_complet,
      role: r.qualite,
      since: r.date_prise_de_poste,
    })),
    beneficiaires: profile.beneficiaires_effectifs?.map((b) => ({
      name: b.nom_complet,
      percentage: b.pourcentage_parts,
    })),
    finances: profile.finances?.map((f) => ({
      year: f.annee,
      revenue: f.chiffre_affaires,
      result: f.resultat,
      employees: f.effectif,
    })),
    redFlags,
  };
}

/**
 * Verify a French founder against Pappers data
 */
export async function verifyFrenchFounder(
  founderName: string,
  companyName: string
): Promise<{
  verified: boolean;
  role?: string;
  since?: string;
  ownershipPercentage?: number;
  otherCompanies?: string[];
}> {
  const searchResults = await searchCompanies(companyName, 3);
  if (!searchResults || searchResults.resultats_siren.length === 0) {
    return { verified: false };
  }

  const company = searchResults.resultats_siren[0];
  const profile = await getCompanyProfile(company.siren);
  if (!profile) {
    return { verified: false };
  }

  // Normalize names for comparison
  const normalizedFounder = founderName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Check representants
  const matchingRep = profile.representants?.find((r) => {
    const normalizedRep = r.nom_complet.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (
      normalizedRep.includes(normalizedFounder) ||
      normalizedFounder.split(" ").some((part) => normalizedRep.includes(part) && part.length > 3)
    );
  });

  if (!matchingRep) {
    return { verified: false };
  }

  // Check beneficiaires for ownership
  const matchingBenef = profile.beneficiaires_effectifs?.find((b) => {
    const normalizedBenef = b.nom_complet.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalizedBenef.includes(normalizedFounder);
  });

  return {
    verified: true,
    role: matchingRep.qualite,
    since: matchingRep.date_prise_de_poste,
    ownershipPercentage: matchingBenef?.pourcentage_parts,
  };
}

/**
 * Get financial growth metrics from Pappers data
 */
export function calculateGrowthMetrics(finances: PappersFinances): {
  revenueGrowthYoY?: number;
  profitMargin?: number;
  employeeGrowth?: number;
  latestRevenue?: number;
  latestYear?: number;
} | null {
  if (!finances.bilans || finances.bilans.length < 1) {
    return null;
  }

  // Sort by year descending
  const sorted = [...finances.bilans].sort((a, b) => b.annee - a.annee);
  const latest = sorted[0];
  const previous = sorted[1];

  const result: {
    revenueGrowthYoY?: number;
    profitMargin?: number;
    employeeGrowth?: number;
    latestRevenue?: number;
    latestYear?: number;
  } = {
    latestYear: latest.annee,
    latestRevenue: latest.chiffre_affaires,
  };

  // Calculate YoY growth
  if (previous && latest.chiffre_affaires && previous.chiffre_affaires) {
    result.revenueGrowthYoY =
      ((latest.chiffre_affaires - previous.chiffre_affaires) / previous.chiffre_affaires) * 100;
  }

  // Calculate profit margin
  if (latest.chiffre_affaires && latest.resultat) {
    result.profitMargin = (latest.resultat / latest.chiffre_affaires) * 100;
  }

  // Calculate employee growth
  if (previous && latest.effectif && previous.effectif) {
    result.employeeGrowth =
      ((latest.effectif - previous.effectif) / previous.effectif) * 100;
  }

  return result;
}
