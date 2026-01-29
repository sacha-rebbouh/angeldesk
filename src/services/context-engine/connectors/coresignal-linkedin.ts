/**
 * RapidAPI Fresh LinkedIn Connector
 *
 * Uses RapidAPI "Fresh LinkedIn Profile Data" for LinkedIn profile enrichment.
 * Single GET call per profile, real-time fresh data.
 *
 * Pricing: $10/month for 500 profiles ($0.02/profile)
 * Auth: Headers `x-rapidapi-key` + `x-rapidapi-host`
 *
 * Name search: Brave Search → finds LinkedIn URL → RapidAPI fetch
 * - Query: "First Last" "Company" site:linkedin.com/in/
 * - Post-validation: checks name + company match to avoid homonyms
 */

import type {
  Connector,
  FounderBackground,
  DataSource,
} from "../types";

// ============================================================================
// TYPES - Internal normalized format
// ============================================================================

interface NormalizedDate {
  day?: number;
  month?: number;
  year?: number;
}

interface NormalizedExperience {
  company: string;
  company_linkedin_profile_url?: string;
  title: string;
  description?: string;
  location?: string;
  starts_at?: NormalizedDate;
  ends_at?: NormalizedDate | null;
  logo_url?: string;
}

interface NormalizedEducation {
  school: string;
  school_linkedin_profile_url?: string;
  degree_name?: string;
  field_of_study?: string;
  starts_at?: NormalizedDate;
  ends_at?: NormalizedDate;
  description?: string;
  logo_url?: string;
}

interface NormalizedProfile {
  public_identifier: string;
  profile_pic_url?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  headline?: string;
  summary?: string;
  country?: string;
  country_full_name?: string;
  city?: string;
  experiences: NormalizedExperience[];
  education: NormalizedEducation[];
  languages?: string[];
  skills?: string[];
  certifications?: {
    name: string;
    authority?: string;
    starts_at?: NormalizedDate;
    ends_at?: NormalizedDate;
  }[];
  connections?: number;
  follower_count?: number;
}

// ============================================================================
// TYPES - RapidAPI Fresh LinkedIn Response
// ============================================================================

interface RapidAPIExperience {
  company?: string;
  company_linkedin_url?: string;
  company_logo_url?: string;
  title?: string;
  description?: string;
  location?: string;
  start_month?: number | string;
  start_year?: number | string;
  end_month?: number | string;
  end_year?: number | string;
  is_current?: boolean;
  duration?: string;
  date_range?: string;
}

interface RapidAPIEducation {
  school?: string;
  school_linkedin_url?: string;
  school_logo_url?: string;
  degree?: string;
  field_of_study?: string;
  start_year?: number | string;
  start_month?: string;
  end_year?: number | string;
  end_month?: string;
  description?: string;
  activities?: string;
}

interface RapidAPIProfile {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  headline?: string;
  about?: string;
  location?: string;
  country?: string;
  city?: string;
  state?: string;
  public_id?: string;
  linkedin_url?: string;
  profile_image_url?: string;
  connection_count?: number;
  follower_count?: number;
  experiences?: RapidAPIExperience[];
  educations?: RapidAPIEducation[];
  skills?: string;
  languages?: string[];
  company?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const RAPIDAPI_HOST = "fresh-linkedin-profile-data.p.rapidapi.com";

// Notable companies for DD (indicates quality experience)
const NOTABLE_COMPANIES = new Set([
  "google", "meta", "facebook", "apple", "amazon", "microsoft", "netflix",
  "stripe", "airbnb", "uber", "lyft", "spotify", "slack", "salesforce",
  "twitter", "linkedin", "palantir", "snowflake", "datadog", "mongodb",
  "notion", "figma", "canva", "airtable", "asana", "monday", "miro",
  "revolut", "wise", "n26", "klarna", "adyen", "checkout", "plaid",
  "mckinsey", "bcg", "bain", "goldman sachs", "morgan stanley", "jp morgan",
  "sequoia", "a16z", "benchmark", "accel", "index ventures", "balderton",
]);

// Thresholds
const GAP_THRESHOLD_MONTHS = 12;
const LOW_CONNECTIONS_THRESHOLD = 300;

// ============================================================================
// EXPERTISE DETECTION - Industries, Roles, Ecosystems
// ============================================================================

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  fintech: ["fintech", "banking", "payments", "finance", "insurance", "insurtech", "trading", "wealth", "credit", "lending", "neobank"],
  healthtech: ["health", "medical", "healthcare", "biotech", "pharma", "clinical", "hospital", "patient", "diagnosis", "therapeutic"],
  saas: ["saas", "software", "cloud", "enterprise", "b2b"],
  ecommerce: ["ecommerce", "e-commerce", "retail", "marketplace", "shopping", "commerce"],
  edtech: ["education", "edtech", "learning", "school", "university", "training", "course"],
  proptech: ["real estate", "proptech", "property", "housing", "construction"],
  foodtech: ["food", "restaurant", "delivery", "grocery", "farming", "agritech"],
  mobility: ["mobility", "transport", "logistics", "automotive", "vehicle", "fleet"],
  gaming: ["gaming", "game", "esports", "entertainment"],
  media: ["media", "content", "publishing", "news", "advertising", "marketing"],
  hr: ["hr", "human resources", "recruiting", "talent", "hiring", "workforce", "payroll"],
  legal: ["legal", "law", "compliance", "regulatory"],
  cybersecurity: ["security", "cyber", "infosec", "privacy"],
  ai_ml: ["artificial intelligence", "machine learning", "ai", "ml", "deep learning", "nlp", "data science"],
  crypto: ["crypto", "blockchain", "web3", "defi", "nft"],
  climate: ["climate", "sustainability", "cleantech", "energy", "solar", "carbon"],
  deeptech: ["deeptech", "robotics", "quantum", "semiconductor", "hardware"],
};

const ROLE_KEYWORDS: Record<string, string[]> = {
  product: ["product manager", "product owner", "product lead", "product director", "vp product", "cpo", "head of product"],
  engineering: ["engineer", "developer", "cto", "vp engineering", "tech lead", "architect", "devops", "sre"],
  design: ["designer", "ux", "ui", "creative director", "head of design", "cdo"],
  sales: ["sales", "account executive", "ae", "business development", "bd", "cro", "vp sales", "head of sales"],
  marketing: ["marketing", "growth", "cmo", "vp marketing", "head of marketing", "brand"],
  operations: ["operations", "ops", "coo", "vp operations", "head of ops", "chief of staff"],
  finance: ["finance", "cfo", "controller", "accounting", "fp&a", "investor relations"],
  data: ["data analyst", "data scientist", "data engineer", "analytics", "bi", "head of data"],
  hr_people: ["hr", "people", "talent", "recruiting", "chro", "head of people"],
  legal_compliance: ["legal", "counsel", "compliance", "general counsel", "clo"],
  founder_ceo: ["founder", "co-founder", "ceo", "chief executive"],
};

const ECOSYSTEM_KEYWORDS: Record<string, string[]> = {
  early_stage: ["seed", "series a", "early stage", "pre-seed", "angel"],
  growth_stage: ["series b", "series c", "growth", "scale-up", "scaleup"],
  corporate: ["corporate", "enterprise", "fortune 500", "multinational"],
  consulting: ["consulting", "consultant", "advisory", "mckinsey", "bcg", "bain", "deloitte", "pwc", "ey", "kpmg"],
  vc_pe: ["venture capital", "vc", "private equity", "pe", "investment", "fund", "portfolio"],
  startup: ["startup", "start-up"],
  agency: ["agency", "studio", "freelance"],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getApiKey(): string | null {
  return process.env.RAPIDAPI_LINKEDIN_KEY ?? null;
}

function getBraveApiKey(): string | null {
  return process.env.BRAVE_API_KEY ?? null;
}

/**
 * Find a LinkedIn profile URL using Brave Search.
 * Query: "Prénom Nom" "Boite" site:linkedin.com/in/
 * Returns the first linkedin.com/in/ URL found, or null.
 */
export async function findLinkedInUrl(
  firstName: string,
  lastName: string,
  companyName: string
): Promise<{ url: string | null; source: string; candidates: string[] }> {
  const braveKey = getBraveApiKey();
  if (!braveKey) {
    console.warn("[LinkedIn Finder] No BRAVE_API_KEY configured");
    return { url: null, source: "no_brave_key", candidates: [] };
  }

  // Sanitize quotes to prevent query structure breakage
  const sanitize = (s: string) => s.replace(/"/g, "");
  const safeName = `${sanitize(firstName)} ${sanitize(lastName)}`.trim();
  const safeCompany = sanitize(companyName).trim();

  if (!safeName || !safeCompany) {
    return { url: null, source: "invalid_input", candidates: [] };
  }

  // No site: operator — Brave doesn't support it well for LinkedIn
  // Instead, add "linkedin" to the query and filter URLs client-side
  const query = `"${safeName}" "${safeCompany}" linkedin`;
  console.log(`[LinkedIn Finder] Searching: ${query}`);

  try {
    const params = new URLSearchParams({
      q: query,
      count: "10",
    });

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveKey,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.warn(`[LinkedIn Finder] Brave API error: ${response.status}`);
      return { url: null, source: "brave_error", candidates: [] };
    }

    const data = await response.json() as {
      web?: { results?: { url: string; title: string; description?: string }[] };
    };

    const results = data.web?.results ?? [];

    // Extract all linkedin.com/in/ URLs from results
    const linkedinUrls: string[] = [];
    for (const r of results) {
      // Match linkedin.com/in/ URLs (including fr.linkedin.com, etc.)
      const match = r.url.match(/https?:\/\/([a-z]{2}\.)?linkedin\.com\/in\/[^/?]+/);
      if (match) {
        // Normalize: https, www, no trailing slash
        let normalized = match[0]
          .replace("http://", "https://")
          .replace(/\/$/, "");
        // Normalize country subdomains (fr.linkedin.com → www.linkedin.com)
        normalized = normalized.replace(/https:\/\/[a-z]{2}\.linkedin\.com/, "https://www.linkedin.com");
        if (!normalized.includes("www.")) {
          normalized = normalized.replace("linkedin.com", "www.linkedin.com");
        }
        if (!linkedinUrls.includes(normalized)) {
          linkedinUrls.push(normalized);
        }
      }
    }

    if (linkedinUrls.length === 0) {
      console.log(`[LinkedIn Finder] No LinkedIn URLs found for ${safeName}`);
      return { url: null, source: "not_found", candidates: [] };
    }

    console.log(`[LinkedIn Finder] Found ${linkedinUrls.length} candidate(s): ${linkedinUrls.join(", ")}`);
    return { url: linkedinUrls[0], source: "brave_search", candidates: linkedinUrls };
  } catch (err) {
    console.warn(`[LinkedIn Finder] Search failed:`, err);
    return { url: null, source: "search_error", candidates: [] };
  }
}

/**
 * Extract LinkedIn shorthand from a URL
 */
function extractShorthand(linkedinUrl: string): string | null {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
  return match ? match[1].replace(/\/$/, "") : null;
}

/**
 * Parse a year value that could be number or string
 */
function toYear(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const n = typeof val === "number" ? val : parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Parse a month value that could be number or month name string
 */
function toMonth(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return val;

  const n = parseInt(val, 10);
  if (!isNaN(n)) return n;

  // Month name → number
  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const key = val.toLowerCase().slice(0, 3);
  return monthNames[key];
}

function dateToYear(date: NormalizedDate | null | undefined): number | undefined {
  return date?.year;
}

function dateToTimestamp(date: NormalizedDate | null | undefined): number | null {
  if (!date?.year) return null;
  return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1).getTime();
}

function monthsBetween(start: NormalizedDate | null | undefined, end: NormalizedDate | null | undefined): number | null {
  const startTs = dateToTimestamp(start);
  const endTs = end ? dateToTimestamp(end) : Date.now();

  if (!startTs || !endTs) return null;

  return Math.round((endTs - startTs) / (1000 * 60 * 60 * 24 * 30));
}

function isNotableCompany(companyName: string): boolean {
  const normalized = companyName.toLowerCase().trim();
  return NOTABLE_COMPANIES.has(normalized) ||
    Array.from(NOTABLE_COMPANIES).some(notable => normalized.includes(notable));
}

// ============================================================================
// RAPIDAPI NORMALIZATION
// ============================================================================

function normalizeRapidAPIProfile(data: RapidAPIProfile, originalUrl: string): NormalizedProfile {
  const shorthand = data.public_id || extractShorthand(originalUrl) || "";

  // Parse skills string "Skill1|Skill2|Skill3" → array
  const skills = data.skills
    ? data.skills.split("|").map(s => s.trim()).filter(Boolean)
    : undefined;

  return {
    public_identifier: shorthand,
    profile_pic_url: data.profile_image_url || undefined,
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    full_name: data.full_name ?? `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim(),
    headline: data.headline ?? undefined,
    summary: data.about ?? undefined,
    country: data.country ?? undefined,
    city: data.city ?? undefined,
    experiences: (data.experiences ?? []).map((exp) => ({
      company: exp.company ?? "",
      company_linkedin_profile_url: exp.company_linkedin_url ?? undefined,
      title: exp.title ?? "",
      description: exp.description ?? undefined,
      location: exp.location ?? undefined,
      starts_at: toYear(exp.start_year)
        ? { year: toYear(exp.start_year)!, month: toMonth(exp.start_month) }
        : undefined,
      ends_at: exp.is_current
        ? null
        : toYear(exp.end_year)
          ? { year: toYear(exp.end_year)!, month: toMonth(exp.end_month) }
          : null,
      logo_url: exp.company_logo_url ?? undefined,
    })),
    education: (data.educations ?? []).map((edu) => ({
      school: edu.school ?? "",
      school_linkedin_profile_url: edu.school_linkedin_url ?? undefined,
      degree_name: edu.degree ?? undefined,
      field_of_study: edu.field_of_study || undefined,
      starts_at: toYear(edu.start_year)
        ? { year: toYear(edu.start_year)!, month: toMonth(edu.start_month) }
        : undefined,
      ends_at: toYear(edu.end_year)
        ? { year: toYear(edu.end_year)!, month: toMonth(edu.end_month) }
        : undefined,
      description: edu.activities ?? undefined,
      logo_url: edu.school_logo_url ?? undefined,
    })),
    languages: data.languages ?? undefined,
    skills,
    connections: data.connection_count ?? undefined,
    follower_count: data.follower_count ?? undefined,
  };
}

// ============================================================================
// EXPERTISE ANALYSIS
// ============================================================================

interface ExpertiseAxis {
  name: string;
  months: number;
  percentage: number;
}

interface RawExperience {
  company: string;
  title: string;
  months: number;
  startYear: number | undefined;
  endYear: number | undefined;
  matchedIndustries: string[];
  matchedRoles: string[];
  matchedEcosystems: string[];
}

interface ExpertiseProfile {
  rawExperiences: RawExperience[];
  totalCareerMonths: number;
  industries: ExpertiseAxis[];
  roles: ExpertiseAxis[];
  ecosystems: ExpertiseAxis[];
  unclassifiedExperiences: RawExperience[];
  unclassifiedMonths: number;
  unclassifiedPercentage: number;
  primaryIndustry: string | null;
  primaryRole: string | null;
  primaryEcosystem: string | null;
  isDiversified: boolean;
  hasDeepExpertise: boolean;
  expertiseDescription: string;
}

function analyzeExpertise(experiences: NormalizedExperience[]): ExpertiseProfile {
  const industryMonths: Record<string, number> = {};
  const roleMonths: Record<string, number> = {};
  const ecosystemMonths: Record<string, number> = {};
  let totalCareerMonths = 0;
  let unclassifiedMonths = 0;
  const rawExperiences: RawExperience[] = [];
  const unclassifiedExperiences: RawExperience[] = [];

  for (const exp of experiences) {
    const months = monthsBetween(exp.starts_at, exp.ends_at) ?? 0;
    if (months <= 0) continue;

    totalCareerMonths += months;

    const textToAnalyze = `${exp.company} ${exp.title} ${exp.description ?? ""}`.toLowerCase();
    const matchedIndustries: string[] = [];
    const matchedRoles: string[] = [];
    const matchedEcosystems: string[] = [];

    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      if (keywords.some(kw => textToAnalyze.includes(kw))) {
        industryMonths[industry] = (industryMonths[industry] ?? 0) + months;
        matchedIndustries.push(industry);
      }
    }

    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
      if (keywords.some(kw => textToAnalyze.includes(kw))) {
        roleMonths[role] = (roleMonths[role] ?? 0) + months;
        matchedRoles.push(role);
      }
    }

    for (const [ecosystem, keywords] of Object.entries(ECOSYSTEM_KEYWORDS)) {
      if (keywords.some(kw => textToAnalyze.includes(kw))) {
        ecosystemMonths[ecosystem] = (ecosystemMonths[ecosystem] ?? 0) + months;
        matchedEcosystems.push(ecosystem);
      }
    }

    const rawExp: RawExperience = {
      company: exp.company,
      title: exp.title,
      months,
      startYear: dateToYear(exp.starts_at),
      endYear: dateToYear(exp.ends_at),
      matchedIndustries,
      matchedRoles,
      matchedEcosystems,
    };

    rawExperiences.push(rawExp);

    if (matchedIndustries.length === 0 && matchedRoles.length === 0) {
      unclassifiedMonths += months;
      unclassifiedExperiences.push(rawExp);
    }
  }

  const toSortedAxis = (record: Record<string, number>): ExpertiseAxis[] => {
    return Object.entries(record)
      .map(([name, m]) => ({
        name,
        months: m,
        percentage: totalCareerMonths > 0 ? Math.round((m / totalCareerMonths) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  };

  const industries = toSortedAxis(industryMonths);
  const roles = toSortedAxis(roleMonths);
  const ecosystems = toSortedAxis(ecosystemMonths);

  const primaryIndustry = industries.length > 0 && industries[0].percentage >= 30 ? industries[0].name : null;
  const primaryRole = roles.length > 0 && roles[0].percentage >= 30 ? roles[0].name : null;
  const primaryEcosystem = ecosystems.length > 0 && ecosystems[0].percentage >= 30 ? ecosystems[0].name : null;

  const significantIndustries = industries.filter(i => i.percentage >= 15);
  const isDiversified = significantIndustries.length >= 4;

  const hasDeepExpertise =
    (industries.length > 0 && industries[0].percentage >= 50) ||
    (roles.length > 0 && roles[0].percentage >= 50) ||
    (ecosystems.length > 0 && ecosystems[0].percentage >= 50);

  const expertiseDescription = buildExpertiseDescription(
    primaryIndustry, primaryRole, primaryEcosystem, industries, isDiversified, hasDeepExpertise
  );

  const unclassifiedPercentage = totalCareerMonths > 0
    ? Math.round((unclassifiedMonths / totalCareerMonths) * 100) : 0;

  return {
    rawExperiences, totalCareerMonths, industries, roles, ecosystems,
    unclassifiedExperiences, unclassifiedMonths, unclassifiedPercentage,
    primaryIndustry, primaryRole, primaryEcosystem, isDiversified, hasDeepExpertise, expertiseDescription,
  };
}

function buildExpertiseDescription(
  primaryIndustry: string | null, primaryRole: string | null, primaryEcosystem: string | null,
  industries: ExpertiseAxis[], isDiversified: boolean, hasDeepExpertise: boolean
): string {
  const parts: string[] = [];

  if (hasDeepExpertise) {
    if (primaryRole) parts.push(`Expert ${primaryRole}`);
    if (primaryIndustry) parts.push(`spécialisé ${primaryIndustry}`);
    if (primaryEcosystem) parts.push(`(${primaryEcosystem})`);
  } else if (isDiversified) {
    parts.push(`Parcours diversifié (${industries.length} industries)`);
    if (primaryRole) parts.push(`avec dominante ${primaryRole}`);
  } else {
    if (primaryRole) parts.push(`Profil ${primaryRole}`);
    if (primaryIndustry) parts.push(`en ${primaryIndustry}`);
    if (!primaryRole && !primaryIndustry) parts.push("Parcours généraliste");
  }

  return parts.join(" ") || "Profil non catégorisé";
}

function checkSectorFit(
  expertise: ExpertiseProfile, startupSector: string | undefined
): { fits: boolean; explanation: string } {
  if (!startupSector) return { fits: true, explanation: "Secteur startup non spécifié" };

  const sectorLower = startupSector.toLowerCase();

  const matchingIndustry = expertise.industries.find(ind => {
    const keywords = INDUSTRY_KEYWORDS[ind.name] ?? [];
    return keywords.some(kw => sectorLower.includes(kw)) || sectorLower.includes(ind.name);
  });

  if (matchingIndustry) {
    return {
      fits: true,
      explanation: `Expérience ${matchingIndustry.name} (${matchingIndustry.percentage}% du parcours) cohérente avec ${startupSector}`,
    };
  }

  const hasTransferableExperience = expertise.ecosystems.some(
    eco => ["consulting", "vc_pe"].includes(eco.name) && eco.percentage >= 20
  );

  if (hasTransferableExperience) {
    return { fits: true, explanation: `Expérience consulting/VC transférable au secteur ${startupSector}` };
  }

  return {
    fits: false,
    explanation: `Pas d'expérience directe en ${startupSector} - industries: ${expertise.industries.slice(0, 3).map(i => i.name).join(", ") || "non identifiées"}`,
  };
}

// ============================================================================
// RED FLAG & QUESTIONS DETECTION
// ============================================================================

interface DetectedRedFlag {
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface QuestionToAsk {
  question: string;
  context: string;
  priority: "low" | "medium" | "high";
}

interface ProfileAnalysis {
  redFlags: DetectedRedFlag[];
  questionsToAsk: QuestionToAsk[];
  expertise: ExpertiseProfile;
  sectorFit?: { fits: boolean; explanation: string };
}

function hasCareerProgression(experiences: NormalizedExperience[]): boolean {
  const seniorityKeywords: Record<string, number> = {
    junior: 1, associate: 2, senior: 3, lead: 4, staff: 4,
    principal: 5, director: 5, vp: 6, "vice president": 6, head: 6,
    chief: 7, cto: 7, ceo: 7, cfo: 7, coo: 7, founder: 7, "co-founder": 7,
  };

  const seniorityScores = experiences.map(exp => {
    const title = exp.title.toLowerCase();
    for (const [keyword, score] of Object.entries(seniorityKeywords)) {
      if (title.includes(keyword)) return score;
    }
    return 2;
  });

  if (seniorityScores.length < 2) return true;

  const midpoint = Math.floor(seniorityScores.length / 2);
  const olderAvg = seniorityScores.slice(midpoint).reduce((a, b) => a + b, 0) / (seniorityScores.length - midpoint);
  const newerAvg = seniorityScores.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;

  return newerAvg >= olderAvg - 0.5;
}

function analyzeProfile(profile: NormalizedProfile, startupSector?: string): ProfileAnalysis {
  const redFlags: DetectedRedFlag[] = [];
  const questionsToAsk: QuestionToAsk[] = [];
  const experiences = profile.experiences;

  const expertise = analyzeExpertise(experiences);
  const sectorFit = startupSector ? checkSectorFit(expertise, startupSector) : undefined;

  // Check for gaps
  for (let i = 0; i < experiences.length - 1; i++) {
    const current = experiences[i];
    const next = experiences[i + 1];

    if (current.ends_at && next.starts_at) {
      const gapMonths = monthsBetween(current.ends_at, next.starts_at);
      if (gapMonths && gapMonths > GAP_THRESHOLD_MONTHS) {
        redFlags.push({
          type: "career_gap",
          description: `Gap de ${gapMonths} mois entre ${current.company} et ${next.company}`,
          severity: gapMonths > 24 ? "high" : "medium",
        });
      }
    }
  }

  // Short tenures
  const shortTenures = experiences.filter(exp => {
    const m = monthsBetween(exp.starts_at, exp.ends_at);
    return m && m < 12 && !exp.title.toLowerCase().includes("intern");
  });

  if (shortTenures.length >= 3) {
    redFlags.push({
      type: "job_hopping",
      description: `${shortTenures.length} postes de moins d'un an`,
      severity: "medium",
    });
  }

  // Low connections
  if (profile.connections && profile.connections < LOW_CONNECTIONS_THRESHOLD) {
    redFlags.push({
      type: "limited_network",
      description: `Seulement ${profile.connections} connexions LinkedIn`,
      severity: "low",
    });
  }

  // No notable companies
  const hasNotableExperience = experiences.some(exp => isNotableCompany(exp.company));
  if (!hasNotableExperience && experiences.length >= 3) {
    questionsToAsk.push({
      question: "Pas d'expérience dans une entreprise de référence - comment avez-vous développé vos compétences ?",
      context: "Aucune entreprise notable (FAANG, licornes, top consulting) dans le parcours",
      priority: "low",
    });
  }

  // No career progression
  if (!hasCareerProgression(experiences) && experiences.length >= 3) {
    redFlags.push({
      type: "no_progression",
      description: "Pas de progression de carrière visible",
      severity: "medium",
    });
  }

  // Diversified background
  if (expertise.isDiversified && expertise.unclassifiedPercentage < 30) {
    questionsToAsk.push({
      question: "Parcours très diversifié - comment cette variété vous prépare-t-elle à ce projet spécifique ?",
      context: expertise.expertiseDescription,
      priority: "medium",
    });
  }

  // Sector mismatch
  if (sectorFit && !sectorFit.fits) {
    questionsToAsk.push({
      question: `Pas d'expérience directe dans le secteur - comment comptez-vous combler ce gap ?`,
      context: sectorFit.explanation,
      priority: "medium",
    });
  }

  return { redFlags, questionsToAsk, expertise, sectorFit };
}

// ============================================================================
// API FUNCTIONS - RapidAPI Fresh LinkedIn
// ============================================================================

const linkedinSource: DataSource = {
  type: "linkedin",
  name: "Fresh LinkedIn (RapidAPI)",
  url: "https://linkedin.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95,
};

/**
 * Fetch LinkedIn profile via RapidAPI Fresh LinkedIn (single GET call)
 */
async function fetchLinkedInProfile(linkedinUrl: string): Promise<NormalizedProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RapidAPI LinkedIn] No API key configured (RAPIDAPI_LINKEDIN_KEY)");
    return null;
  }

  try {
    // Normalize LinkedIn URL
    let normalizedUrl = linkedinUrl.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://www.linkedin.com/in/${normalizedUrl}`;
    }

    console.log(`[RapidAPI LinkedIn] Fetching profile: ${normalizedUrl}`);

    const params = new URLSearchParams({
      linkedin_url: normalizedUrl,
      include_skills: "true",
      include_certifications: "false",
      include_publications: "false",
      include_honors: "false",
      include_volunteers: "false",
      include_projects: "false",
      include_patents: "false",
      include_courses: "false",
      include_organizations: "false",
      include_profile_status: "false",
      include_company_public_url: "false",
    });

    const response = await fetch(
      `https://${RAPIDAPI_HOST}/enrich-lead?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": apiKey,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.error(`[RapidAPI LinkedIn] API error: ${response.status}`);
      return null;
    }

    const json = await response.json() as { data?: RapidAPIProfile; message?: string };

    if (!json.data || json.message !== "ok") {
      console.warn(`[RapidAPI LinkedIn] No profile found for: ${normalizedUrl}`);
      return null;
    }

    const normalized = normalizeRapidAPIProfile(json.data, normalizedUrl);
    console.log(`[RapidAPI LinkedIn] Successfully fetched: ${normalized.full_name} (${normalized.experiences.length} exp, ${normalized.education.length} edu)`);

    return normalized;
  } catch (error) {
    console.error("[RapidAPI LinkedIn] Request failed:", error);
    return null;
  }
}

/**
 * Transform profile to FounderBackground format
 */
function profileToFounderBackground(
  profile: NormalizedProfile, role: string, linkedinUrl: string, startupSector?: string
): FounderBackground {
  const analysis = analyzeProfile(profile, startupSector);

  return {
    name: profile.full_name,
    role,
    linkedinUrl,

    previousCompanies: profile.experiences.map(exp => ({
      company: exp.company,
      role: exp.title,
      startYear: dateToYear(exp.starts_at),
      endYear: dateToYear(exp.ends_at),
      verified: true,
    })),

    previousVentures: profile.experiences
      .filter(exp =>
        exp.title.toLowerCase().includes("founder") ||
        exp.title.toLowerCase().includes("co-founder") ||
        exp.title.toLowerCase().includes("ceo")
      )
      .map(exp => ({
        companyName: exp.company,
        outcome: "unknown" as const,
        exitYear: dateToYear(exp.ends_at),
      })),

    education: profile.education.map(edu => ({
      institution: edu.school,
      degree: edu.degree_name,
      year: dateToYear(edu.ends_at),
    })),

    redFlags: analysis.redFlags.map(rf => ({
      type: rf.type,
      description: rf.description,
      severity: rf.severity,
      source: linkedinSource,
    })),

    investorConnections: [],
    verificationStatus: "verified" as const,
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const coresignalLinkedInConnector: Connector = {
  name: "rapidapi_linkedin",
  type: "linkedin",

  isConfigured: () => {
    return !!getApiKey();
  },

  async getFounderBackground(founderName: string): Promise<FounderBackground | null> {
    // RapidAPI requires a LinkedIn URL, not a name
    console.warn(`[RapidAPI LinkedIn] getFounderBackground requires LinkedIn URL, not name: ${founderName}`);
    return null;
  },
};

// Backward-compatible alias
export const apifyLinkedInConnector = coresignalLinkedInConnector;

// ============================================================================
// EXPORTED ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze a founder's LinkedIn profile by URL
 */
export async function analyzeFounderLinkedIn(
  linkedinUrl: string,
  role: string = "Founder",
  startupSector?: string
): Promise<{
  success: boolean;
  profile?: FounderBackground;
  analysis?: ProfileAnalysis;
  rawProfile?: NormalizedProfile;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: "RAPIDAPI_LINKEDIN_KEY not configured" };
  }

  const profile = await fetchLinkedInProfile(linkedinUrl);
  if (!profile) {
    return { success: false, error: "Failed to fetch LinkedIn profile" };
  }

  const analysis = analyzeProfile(profile, startupSector);
  const founderBackground = profileToFounderBackground(profile, role, linkedinUrl, startupSector);

  return { success: true, profile: founderBackground, analysis, rawProfile: profile };
}

/**
 * Find a founder's LinkedIn profile by name + company using Brave Search,
 * then fetch and analyze the profile via RapidAPI.
 *
 * Flow: Brave Search → LinkedIn URL → RapidAPI → Profile Analysis
 */
export async function analyzeFounderByName(
  founderName: string,
  companyName: string,
  role: string = "Founder",
  startupSector?: string
): Promise<{
  success: boolean;
  profile?: FounderBackground;
  analysis?: ProfileAnalysis;
  rawProfile?: NormalizedProfile;
  linkedinUrl?: string;
  error?: string;
}> {
  if (!founderName.trim() || !companyName.trim()) {
    return { success: false, error: "founderName and companyName are required" };
  }

  // Split name into first/last
  const parts = founderName.trim().split(/\s+/);
  const firstName = parts[0] || founderName;
  const lastName = parts.slice(1).join(" ") || "";

  if (!lastName) {
    return {
      success: false,
      error: `Cannot search LinkedIn for "${founderName}" — need first and last name`,
    };
  }

  // Step 1: Find LinkedIn URL via Brave Search
  const searchResult = await findLinkedInUrl(firstName, lastName, companyName);

  if (!searchResult.url) {
    return {
      success: false,
      error: `LinkedIn profile not found for ${founderName} at ${companyName} (${searchResult.source})`,
    };
  }

  console.log(`[LinkedIn Finder] Found URL for ${founderName}: ${searchResult.url}`);

  // Step 2: Fetch and analyze via RapidAPI
  const result = await analyzeFounderLinkedIn(searchResult.url, role, startupSector);

  if (!result.success) {
    return { ...result, linkedinUrl: searchResult.url };
  }

  // Step 3: Post-validation — verify the profile matches the company
  if (result.rawProfile) {
    const companyLower = companyName.toLowerCase();
    const matchesCompany = result.rawProfile.experiences.some(e => {
      const eLower = e.company.toLowerCase();
      return eLower.includes(companyLower) || companyLower.includes(eLower);
    });
    const fullNameLower = result.rawProfile.full_name.toLowerCase();
    const firstNameMatch =
      fullNameLower.includes(firstName.toLowerCase()) ||
      result.rawProfile.first_name.toLowerCase() === firstName.toLowerCase();
    const lastNameMatch =
      fullNameLower.includes(lastName.toLowerCase()) ||
      result.rawProfile.last_name.toLowerCase() === lastName.toLowerCase();
    const nameMatch = firstNameMatch && lastNameMatch;

    if (!nameMatch) {
      return {
        success: false,
        linkedinUrl: searchResult.url,
        error: `Profile found (${result.rawProfile.full_name}) doesn't match name "${founderName}" — possible homonym`,
      };
    }

    if (!matchesCompany) {
      console.warn(
        `[LinkedIn Finder] Warning: ${result.rawProfile.full_name} profile doesn't mention "${companyName}" in experiences — may be a homonym`
      );
      // Don't fail, just warn — the company name in LinkedIn might differ slightly
    }
  }

  return { ...result, linkedinUrl: searchResult.url };
}

/**
 * Analyze multiple founders in parallel
 */
export async function analyzeTeamLinkedIn(
  founders: { linkedinUrl: string; role: string; name?: string }[],
  startupSector?: string
): Promise<{
  success: boolean;
  profiles: FounderBackground[];
  analyses: (ProfileAnalysis | null)[];
  errors: string[];
}> {
  const results = await Promise.all(
    founders.map(f => analyzeFounderLinkedIn(f.linkedinUrl, f.role, startupSector))
  );

  const profiles: FounderBackground[] = [];
  const analyses: (ProfileAnalysis | null)[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.success && result.profile) {
      profiles.push(result.profile);
      analyses.push(result.analysis ?? null);
    } else {
      errors.push(`${founders[i].name || founders[i].linkedinUrl}: ${result.error}`);
      analyses.push(null);
    }
  }

  return { success: profiles.length > 0, profiles, analyses, errors };
}

/**
 * Check if LinkedIn connector is available
 */
export function isCoresignalLinkedInConfigured(): boolean {
  return !!getApiKey();
}

// Backward-compatible alias
export const isApifyLinkedInConfigured = isCoresignalLinkedInConfigured;
