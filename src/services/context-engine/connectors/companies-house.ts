/**
 * Companies House UK Connector
 *
 * Provides access to UK company data via the free Companies House API:
 * - Company profiles
 * - Filing history
 * - Officer information
 * - Financial accounts (when filed)
 *
 * API Key: Free - register at https://developer.company-information.service.gov.uk/
 * Rate limits: 600 requests per 5 minutes
 *
 * This is one of the best free sources for verified company financial data.
 */

import type {
  Connector,
  ConnectorQuery,
  FounderBackground,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

interface CompaniesHouseSearchResult {
  items: {
    company_number: string;
    title: string;
    company_status: string;
    company_type: string;
    date_of_creation: string;
    address: {
      address_line_1?: string;
      locality?: string;
      postal_code?: string;
      country?: string;
    };
    description?: string;
    matches?: {
      title?: number[];
      snippet?: number[];
    };
  }[];
  total_results: number;
}

interface CompaniesHouseCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  company_status_detail?: string;
  date_of_creation: string;
  type: string;
  jurisdiction?: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  accounts?: {
    accounting_reference_date?: {
      day: string;
      month: string;
    };
    last_accounts?: {
      made_up_to?: string;
      type?: string;
    };
    next_due?: string;
    next_made_up_to?: string;
  };
  sic_codes?: string[];
  previous_company_names?: {
    name: string;
    effective_from: string;
    ceased_on?: string;
  }[];
  has_been_liquidated?: boolean;
  has_charges?: boolean;
  has_insolvency_history?: boolean;
}

interface CompaniesHouseOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  date_of_birth?: {
    month: number;
    year: number;
  };
}

interface CompaniesHouseOfficersResponse {
  items: CompaniesHouseOfficer[];
  total_results: number;
  active_count: number;
  resigned_count: number;
}

interface CompaniesHouseFilingHistory {
  items: {
    category: string;
    date: string;
    description: string;
    type: string;
    links?: {
      document_metadata?: string;
    };
  }[];
  total_count: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://api.company-information.service.gov.uk";

// SIC code mappings for sector classification
const SIC_TO_SECTOR: Record<string, string> = {
  "62": "SaaS B2B", // Computer programming
  "63": "SaaS B2B", // Information service activities
  "64": "Fintech", // Financial service activities
  "66": "Fintech", // Insurance
  "70": "SaaS B2B", // Management consultancy
  "72": "Deeptech", // Scientific R&D
  "86": "Healthtech", // Human health activities
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getApiKey(): string | null {
  return process.env.COMPANIES_HOUSE_API_KEY ?? null;
}

async function makeRequest<T>(endpoint: string): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[CompaniesHouse] No API key configured");
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[CompaniesHouse] Rate limit exceeded");
      } else if (response.status === 404) {
        return null;
      } else {
        console.warn(`[CompaniesHouse] API error: ${response.status}`);
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[CompaniesHouse] Request failed:", error);
    return null;
  }
}

function getSectorFromSIC(sicCodes: string[] | undefined): string {
  if (!sicCodes || sicCodes.length === 0) return "Unknown";

  for (const sic of sicCodes) {
    const prefix = sic.substring(0, 2);
    if (SIC_TO_SECTOR[prefix]) {
      return SIC_TO_SECTOR[prefix];
    }
  }

  return "Other";
}

function extractFounderRoles(officers: CompaniesHouseOfficer[]): CompaniesHouseOfficer[] {
  // Filter to directors and secretaries (typically founders)
  return officers.filter(
    (o) =>
      !o.resigned_on &&
      (o.officer_role === "director" ||
        o.officer_role === "secretary" ||
        o.officer_role === "llp-member")
  );
}

const chSource: DataSource = {
  type: "crunchbase", // Using as company data source
  name: "Companies House UK",
  url: "https://find-and-update.company-information.service.gov.uk/",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95, // Very high - official government data
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const companiesHouseConnector: Connector = {
  name: "Companies House UK",
  type: "crunchbase",

  isConfigured: () => {
    return !!getApiKey();
  },

  getFounderBackground: async (
    founderName: string
  ): Promise<FounderBackground | null> => {
    // Companies House doesn't have a direct person search
    // but we can search for companies and then look at officers
    // This is limited but can provide some verification

    // For now, return null - would need company number to get officer details
    return null;
  },

  // Additional methods specific to Companies House
};

// ============================================================================
// EXTENDED API FUNCTIONS
// Can be used directly for more detailed queries
// ============================================================================

/**
 * Search for companies by name
 */
export async function searchCompanies(
  query: string,
  limit: number = 10
): Promise<CompaniesHouseSearchResult | null> {
  const encoded = encodeURIComponent(query);
  return makeRequest<CompaniesHouseSearchResult>(
    `/search/companies?q=${encoded}&items_per_page=${limit}`
  );
}

/**
 * Get company profile by company number
 */
export async function getCompanyProfile(
  companyNumber: string
): Promise<CompaniesHouseCompanyProfile | null> {
  return makeRequest<CompaniesHouseCompanyProfile>(`/company/${companyNumber}`);
}

/**
 * Get company officers (directors, secretaries)
 */
export async function getCompanyOfficers(
  companyNumber: string
): Promise<CompaniesHouseOfficersResponse | null> {
  return makeRequest<CompaniesHouseOfficersResponse>(
    `/company/${companyNumber}/officers`
  );
}

/**
 * Get filing history
 */
export async function getFilingHistory(
  companyNumber: string,
  limit: number = 10
): Promise<CompaniesHouseFilingHistory | null> {
  return makeRequest<CompaniesHouseFilingHistory>(
    `/company/${companyNumber}/filing-history?items_per_page=${limit}`
  );
}

/**
 * Enrich a company with Companies House data
 * Returns structured data about the company
 */
export async function enrichCompanyFromUK(companyName: string): Promise<{
  found: boolean;
  companyNumber?: string;
  status?: string;
  dateOfCreation?: string;
  sector?: string;
  address?: string;
  officers?: {
    name: string;
    role: string;
    appointedOn: string;
    occupation?: string;
  }[];
  hasAccounts?: boolean;
  lastAccountsDate?: string;
  redFlags?: string[];
} | null> {
  // Step 1: Search for company
  const searchResults = await searchCompanies(companyName, 5);
  if (!searchResults || searchResults.items.length === 0) {
    return { found: false };
  }

  // Find best match (active company with closest name)
  const activeCompanies = searchResults.items.filter(
    (c) => c.company_status === "active"
  );
  const company = activeCompanies[0] || searchResults.items[0];

  // Step 2: Get full profile
  const profile = await getCompanyProfile(company.company_number);
  if (!profile) {
    return { found: false };
  }

  // Step 3: Get officers
  const officersResponse = await getCompanyOfficers(company.company_number);
  const officers = officersResponse
    ? extractFounderRoles(officersResponse.items)
    : [];

  // Step 4: Identify red flags
  const redFlags: string[] = [];
  if (profile.has_been_liquidated) {
    redFlags.push("Company has been liquidated previously");
  }
  if (profile.has_insolvency_history) {
    redFlags.push("Company has insolvency history");
  }
  if (profile.company_status !== "active") {
    redFlags.push(`Company status: ${profile.company_status}`);
  }
  if (profile.previous_company_names && profile.previous_company_names.length > 2) {
    redFlags.push("Company has changed names multiple times");
  }

  return {
    found: true,
    companyNumber: profile.company_number,
    status: profile.company_status,
    dateOfCreation: profile.date_of_creation,
    sector: getSectorFromSIC(profile.sic_codes),
    address: [
      profile.registered_office_address.address_line_1,
      profile.registered_office_address.locality,
      profile.registered_office_address.postal_code,
    ]
      .filter(Boolean)
      .join(", "),
    officers: officers.map((o) => ({
      name: o.name,
      role: o.officer_role,
      appointedOn: o.appointed_on,
      occupation: o.occupation,
    })),
    hasAccounts: !!profile.accounts?.last_accounts,
    lastAccountsDate: profile.accounts?.last_accounts?.made_up_to,
    redFlags,
  };
}

/**
 * Verify founder against Companies House records
 */
export async function verifyFounderUK(
  founderName: string,
  companyName: string
): Promise<{
  verified: boolean;
  role?: string;
  appointedOn?: string;
  otherCompanies?: string[];
}> {
  const searchResults = await searchCompanies(companyName, 3);
  if (!searchResults || searchResults.items.length === 0) {
    return { verified: false };
  }

  const company = searchResults.items.find(
    (c) => c.company_status === "active"
  );
  if (!company) {
    return { verified: false };
  }

  const officers = await getCompanyOfficers(company.company_number);
  if (!officers) {
    return { verified: false };
  }

  // Normalize names for comparison
  const normalizedFounder = founderName.toLowerCase().trim();
  const matchingOfficer = officers.items.find((o) => {
    const normalizedOfficer = o.name.toLowerCase().trim();
    // Check for partial match (last name match, etc.)
    return (
      normalizedOfficer.includes(normalizedFounder) ||
      normalizedFounder
        .split(" ")
        .some((part) => normalizedOfficer.includes(part) && part.length > 3)
    );
  });

  if (!matchingOfficer) {
    return { verified: false };
  }

  return {
    verified: true,
    role: matchingOfficer.officer_role,
    appointedOn: matchingOfficer.appointed_on,
  };
}
