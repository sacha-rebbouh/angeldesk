/**
 * F70: Geography coverage detection and warning system.
 * Detects when analysis relies on limited data sources for non-FR geographies.
 */

export interface GeographyCoverage {
  geography: string;
  coverageLevel: "FULL" | "PARTIAL" | "LIMITED" | "MINIMAL";
  availableConnectors: string[];
  missingCapabilities: string[];
  warning: string | null;
  recommendations: string[];
}

const GEOGRAPHY_CONNECTORS: Record<string, {
  connectors: string[];
  capabilities: string[];
  coverageLevel: GeographyCoverage["coverageLevel"];
}> = {
  FR: {
    connectors: ["pappers", "societe-com", "bpi-france", "french-tech", "eldorado", "frenchweb-api", "maddyness-api", "incubators", "frenchweb-rss"],
    capabilities: ["company_data", "legal_data", "funding_history", "grants", "ecosystem_validation", "news"],
    coverageLevel: "FULL",
  },
  UK: {
    connectors: ["companies-house"],
    capabilities: ["company_data", "filing_history", "officers"],
    coverageLevel: "PARTIAL",
  },
  US: {
    connectors: ["us-funding"],
    capabilities: ["funding_news_rss"],
    coverageLevel: "LIMITED",
  },
  DE: {
    connectors: [],
    capabilities: [],
    coverageLevel: "MINIMAL",
  },
  DEFAULT: {
    connectors: [],
    capabilities: [],
    coverageLevel: "MINIMAL",
  },
};

const ALL_CAPABILITIES = [
  "company_data",
  "legal_data",
  "funding_history",
  "grants",
  "ecosystem_validation",
  "news",
  "filing_history",
  "officers",
];

export function detectGeography(deal: {
  geography?: string;
  country?: string;
}): string {
  const geo = (deal.geography || deal.country || "").toUpperCase().trim();
  if (geo === "FRANCE" || geo === "FR") return "FR";
  if (geo === "UK" || geo === "GB" || geo === "UNITED KINGDOM" || geo === "ENGLAND") return "UK";
  if (geo === "US" || geo === "USA" || geo === "UNITED STATES") return "US";
  if (geo === "DE" || geo === "GERMANY" || geo === "ALLEMAGNE" || geo === "DEUTSCHLAND") return "DE";
  return geo || "UNKNOWN";
}

export function getGeographyCoverage(geography: string): GeographyCoverage {
  const geo = geography.toUpperCase();
  const config = GEOGRAPHY_CONNECTORS[geo] || GEOGRAPHY_CONNECTORS.DEFAULT;

  const missingCapabilities = ALL_CAPABILITIES.filter(c => !config.capabilities.includes(c));

  let warning: string | null = null;
  const recommendations: string[] = [];

  if (config.coverageLevel === "LIMITED" || config.coverageLevel === "MINIMAL") {
    warning = `ATTENTION: La couverture de donnees pour la geographie "${geography}" est ${config.coverageLevel}. ` +
      `Les sources suivantes ne sont PAS disponibles: ${missingCapabilities.join(", ")}. ` +
      `L'analyse repose principalement sur les documents fournis et les sources globales (news, LinkedIn, GitHub).`;

    if (geo === "US") {
      recommendations.push("Verifier manuellement sur Crunchbase/PitchBook");
    }
    if (geo === "UK") {
      recommendations.push("Les donnees Companies House sont disponibles mais limitees aux filings legaux");
      recommendations.push("Verifier manuellement sur Beauhurst ou Dealroom");
    }
    if (geo === "DE") {
      recommendations.push("Verifier manuellement sur Startbase.de ou Crunchbase");
    }
  } else if (config.coverageLevel === "PARTIAL") {
    warning = `Couverture partielle pour "${geography}": certaines sources ne sont pas disponibles (${missingCapabilities.join(", ")}).`;
  }

  return {
    geography,
    coverageLevel: config.coverageLevel,
    availableConnectors: config.connectors,
    missingCapabilities,
    warning,
    recommendations,
  };
}

/**
 * Format geography coverage warning for LLM prompt injection.
 */
export function formatGeographyCoverageForPrompt(geography: string): string {
  const coverage = getGeographyCoverage(detectGeography({ geography }));

  if (!coverage.warning) return "";

  let text = `\n## COUVERTURE GEOGRAPHIQUE - AVERTISSEMENT\n`;
  text += `${coverage.warning}\n`;
  text += `Niveau de couverture: **${coverage.coverageLevel}**\n`;

  if (coverage.recommendations.length > 0) {
    text += `\nRecommandations:\n`;
    for (const rec of coverage.recommendations) {
      text += `- ${rec}\n`;
    }
  }

  text += `\n**IMPORTANT**: Les affirmations non verifiables via les sources disponibles doivent etre marquees "NON VERIFIE - source limitee pour ${geography}".\n`;

  return text;
}
