/**
 * Legal Registry Check Service (F79)
 *
 * Identifies available public registries based on deal geography.
 * Provides URLs for verification and flags data that couldn't be checked.
 *
 * NOTE: Actual data fetching happens via the Context Engine connectors
 * (pappers, companies-house, etc.) which are already injected into
 * formatContextEngineData(). This service adds registry-specific
 * verification metadata to the legal-regulatory agent prompt.
 */

export interface RegistryCheckResult {
  geography: string;
  checks: {
    registry: string;
    status: "AVAILABLE" | "NOT_AVAILABLE";
    url?: string;
    capabilities: string[];
    warning?: string;
  }[];
  overallStatus: "FULL" | "PARTIAL" | "NOT_VERIFIED";
  missingChecks: string[];
}

const REGISTRY_MAP: Record<string, {
  registries: { name: string; url: (company: string) => string; capabilities: string[] }[];
}> = {
  FR: {
    registries: [
      {
        name: "Pappers (Registre du Commerce FR)",
        url: (c) => `https://www.pappers.fr/recherche?q=${encodeURIComponent(c)}`,
        capabilities: ["legal_status", "dirigeants", "beneficiaires_effectifs", "finances", "publications_bodacc"],
      },
      {
        name: "Societe.com (Donnees entreprise FR)",
        url: (c) => `https://www.societe.com/cgi-bin/search?champs=${encodeURIComponent(c)}`,
        capabilities: ["chiffre_affaires", "effectif", "bilans", "dirigeants"],
      },
      {
        name: "INPI (Brevets & Marques FR)",
        url: (_c) => `https://data.inpi.fr/`,
        capabilities: ["brevets", "marques", "dessins_modeles"],
      },
    ],
  },
  UK: {
    registries: [
      {
        name: "Companies House (UK)",
        url: (c) => `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(c)}`,
        capabilities: ["company_status", "officers", "filing_history", "charges", "insolvency"],
      },
      {
        name: "IPO (Intellectual Property Office UK)",
        url: (_c) => `https://www.ipo.gov.uk/`,
        capabilities: ["patents", "trademarks"],
      },
    ],
  },
  US: {
    registries: [
      {
        name: "SEC EDGAR (Filings US)",
        url: (c) => `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(c)}`,
        capabilities: ["10K", "10Q", "8K", "registration"],
      },
      {
        name: "USPTO (Patents US)",
        url: (_c) => `https://www.uspto.gov/patents`,
        capabilities: ["patents", "trademarks"],
      },
    ],
  },
  DE: {
    registries: [
      {
        name: "Handelsregister (Registre commerce DE)",
        url: (_c) => `https://www.handelsregister.de/`,
        capabilities: ["company_data", "register_entries"],
      },
    ],
  },
};

export function checkLegalRegistries(
  companyName: string,
  geography: string,
  _siren?: string
): RegistryCheckResult {
  const geo = geography.toUpperCase().replace("FRANCE", "FR").replace("UNITED KINGDOM", "UK").replace("ENGLAND", "UK").replace("USA", "US").replace("UNITED STATES", "US").replace("GERMANY", "DE").replace("ALLEMAGNE", "DE").replace("GB", "UK");

  const config = REGISTRY_MAP[geo];
  const checks: RegistryCheckResult["checks"] = [];
  const missingChecks: string[] = [];

  if (config) {
    for (const reg of config.registries) {
      checks.push({
        registry: reg.name,
        status: "AVAILABLE",
        url: reg.url(companyName),
        capabilities: reg.capabilities,
      });
    }
  } else {
    missingChecks.push(`Aucun registre configure pour la geographie "${geography}"`);
    missingChecks.push("Les conclusions legales doivent etre marquees NON VERIFIABLE");
  }

  // Add missing registries for all geos
  if (geo !== "FR") {
    missingChecks.push("Registres FR (Pappers, Societe.com) non applicables");
  }
  if (geo !== "UK") {
    missingChecks.push("Companies House (UK) non applicable");
  }

  const overallStatus: RegistryCheckResult["overallStatus"] =
    checks.length >= 2 ? "FULL" : checks.length === 1 ? "PARTIAL" : "NOT_VERIFIED";

  return { geography, checks, overallStatus, missingChecks };
}

/**
 * Format registry results for injection into legal-regulatory prompt
 */
export function formatRegistryResults(result: RegistryCheckResult): string {
  let text = "\n## VERIFICATION REGISTRES PUBLICS\n";
  text += `Geographie: ${result.geography} | Couverture: ${result.overallStatus}\n\n`;

  if (result.checks.length > 0) {
    text += "### Registres disponibles\n";
    for (const check of result.checks) {
      text += `- **${check.registry}** [${check.status}]\n`;
      text += `  Capacites: ${check.capabilities.join(", ")}\n`;
      if (check.url) text += `  URL: ${check.url}\n`;
    }
  }

  if (result.missingChecks.length > 0) {
    text += "\n### Registres NON disponibles\n";
    for (const missing of result.missingChecks) {
      text += `- ${missing}\n`;
    }
  }

  text += `\n### REGLES DE VERIFICATION OBLIGATOIRES\n`;
  text += `Pour CHAQUE conclusion legale:\n`;
  text += `- Si verifiable via registre disponible: marquer "VERIFIE (source: [registre])"\n`;
  text += `- Si base uniquement sur le deck: marquer "NON VERIFIE - base sur le deck uniquement"\n`;
  text += `- Si registre non disponible pour la geo: marquer "NON VERIFIABLE - registre non accessible pour ${result.geography}"\n`;

  return text;
}
