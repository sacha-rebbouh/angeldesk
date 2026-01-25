/**
 * Apify LinkedIn Connector
 *
 * Replaces Proxycurl (which shut down in Jan 2025) for LinkedIn profile data.
 * Uses Apify's LinkedIn Profile Scraper: https://apify.com/supreme_coder/linkedin-profile-scraper
 *
 * Pricing: ~$3 per 1,000 profiles ($0.003/profile)
 *
 * Features:
 * - Work experience (companies, roles, dates)
 * - Education history
 * - Skills and certifications
 * - No LinkedIn cookies required (public data only)
 *
 * This is THE source for founder/team due diligence.
 */

import type {
  Connector,
  FounderBackground,
  DataSource,
} from "../types";

// ============================================================================
// TYPES - Apify LinkedIn Response (mapped to our internal format)
// ============================================================================

interface ApifyDate {
  day?: number;
  month?: number;
  year?: number;
}

interface ApifyExperience {
  companyName: string;
  companyUrl?: string;
  title: string;
  description?: string;
  location?: string;
  startDate?: string; // "YYYY-MM" or "YYYY"
  endDate?: string | null;
  companyLogo?: string;
}

interface ApifyEducation {
  schoolName: string;
  schoolUrl?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  schoolLogo?: string;
}

interface ApifyProfile {
  linkedinUrl: string;
  profilePicture?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  headline?: string;
  summary?: string;
  location?: string;
  country?: string;
  city?: string;
  experiences: ApifyExperience[];
  education: ApifyEducation[];
  languages?: string[];
  skills?: string[];
  certifications?: {
    name: string;
    authority?: string;
    startDate?: string;
    endDate?: string;
  }[];
  connectionCount?: number;
  followerCount?: number;
}

// Internal normalized format (compatible with old Proxycurl logic)
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
// CONFIGURATION
// ============================================================================

const APIFY_API_BASE = "https://api.apify.com/v2";
// Actor ID for supreme_coder/linkedin-profile-scraper
const LINKEDIN_SCRAPER_ACTOR_ID = "2SyF0bVxmgGr8IVCZ";

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
  return process.env.APIFY_API_KEY ?? null;
}

function parseApifyDate(dateStr: string | undefined | null): NormalizedDate | undefined {
  if (!dateStr) return undefined;

  // Handle "Oct 2021" or "January 2020" format (from Apify jobStartedOn/jobEndedOn)
  const monthNames: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const monthYearMatch = dateStr.match(/^(\w+)\s+(\d{4})$/i);
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2], 10);
    const month = monthNames[monthStr];
    if (month && !isNaN(year)) {
      return { year, month };
    }
  }

  // Handle just year "2021"
  const yearOnlyMatch = dateStr.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    return { year: parseInt(yearOnlyMatch[1], 10) };
  }

  // Handle "YYYY-MM" or "YYYY-MM-DD" format
  const parts = dateStr.split("-");
  if (parts.length >= 1) {
    const year = parseInt(parts[0], 10);
    if (!isNaN(year) && year > 1900 && year < 2100) {
      return {
        year,
        month: parts.length >= 2 ? parseInt(parts[1], 10) : undefined,
        day: parts.length >= 3 ? parseInt(parts[2], 10) : undefined,
      };
    }
  }
  return undefined;
}

/**
 * Parse education period like "2018 - 2023" or "2018 - Present"
 */
function parseEducationPeriod(period: string | undefined | null): { start?: NormalizedDate; end?: NormalizedDate } {
  if (!period) return {};

  const match = period.match(/(\d{4})\s*[-–]\s*(\d{4}|Present)?/i);
  if (match) {
    const startYear = parseInt(match[1], 10);
    const endPart = match[2];

    return {
      start: { year: startYear },
      end: endPart && endPart.toLowerCase() !== "present" ? { year: parseInt(endPart, 10) } : undefined,
    };
  }
  return {};
}

function normalizeApifyProfile(apify: Record<string, unknown>, originalUrl: string): NormalizedProfile {
  // Handle various field name formats from different Apify actors
  const linkedinUrl = (apify.linkedinUrl || apify.url || apify.profileUrl || originalUrl) as string;
  const firstName = (apify.firstName || apify.first_name || "") as string;
  const lastName = (apify.lastName || apify.last_name || "") as string;
  const fullName = (apify.fullName || apify.full_name || apify.name || `${firstName} ${lastName}`.trim()) as string;

  // Extract experiences - handle different field names
  const rawExperiences = (apify.experiences || apify.experience || apify.positions || []) as Array<Record<string, unknown>>;

  // Extract education - handle different field names (Apify uses "educations")
  const rawEducation = (apify.educations || apify.education || []) as Array<Record<string, unknown>>;

  // Extract skills - Apify returns array of {title: string} objects
  const rawSkills = (apify.skills || []) as Array<string | { title?: string }>;
  const skills = rawSkills.map(s => typeof s === "string" ? s : (s.title ?? "")).filter(Boolean);

  // Extract languages - Apify returns array of {title: string} objects
  const rawLanguages = (apify.languages || []) as Array<string | { title?: string }>;
  const languages = rawLanguages.map(l => typeof l === "string" ? l : (l.title ?? "")).filter(Boolean);

  // Extract location
  const location = apify.location as Record<string, unknown> | undefined;

  return {
    public_identifier: linkedinUrl?.split("/in/")?.[1]?.replace(/\/$/, "") || "",
    profile_pic_url: (apify.profilePicture || apify.profilePic || apify.avatar || apify.image) as string | undefined,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    headline: (apify.headline || apify.title) as string | undefined,
    // Apify uses "about" field for the summary
    summary: (apify.about || apify.summary || apify.description) as string | undefined,
    country: (apify.country || location?.country) as string | undefined,
    city: (apify.city || location?.city) as string | undefined,
    experiences: rawExperiences.map((exp) => ({
      company: (exp.companyName || exp.company || exp.companyname || "") as string,
      company_linkedin_profile_url: (exp.companyUrl || exp.companyLinkedinUrl) as string | undefined,
      title: (exp.title || exp.role || exp.position || "") as string,
      // Apify uses "jobDescription" for experience description
      description: (exp.jobDescription || exp.description || exp.summary) as string | undefined,
      // Apify uses "jobLocation" for experience location
      location: (exp.jobLocation || exp.location) as string | undefined,
      // Apify uses "jobStartedOn" / "jobEndedOn" with format "Oct 2021"
      starts_at: parseApifyDate((exp.jobStartedOn || exp.startDate || exp.start_date || exp.from) as string),
      ends_at: (exp.jobEndedOn || exp.endDate || exp.end_date || exp.to)
        ? parseApifyDate((exp.jobEndedOn || exp.endDate || exp.end_date || exp.to) as string)
        : null,
      logo_url: (exp.logo || exp.companyLogo) as string | undefined,
    })),
    education: rawEducation.map((edu) => {
      // Apify uses "title" for school name and "subtitle" for degree
      const period = parseEducationPeriod(edu.period as string);
      return {
        school: (edu.title || edu.schoolName || edu.school || edu.institution || "") as string,
        school_linkedin_profile_url: (edu.schoolUrl || edu.schoolLinkedinUrl) as string | undefined,
        // Apify uses "subtitle" for degree info
        degree_name: (edu.subtitle || edu.degree || edu.degreeName || edu.degree_name) as string | undefined,
        field_of_study: (edu.fieldOfStudy || edu.field || edu.major) as string | undefined,
        // Parse period string like "2018 - 2023"
        starts_at: period.start || parseApifyDate((edu.startDate || edu.start_date || edu.from) as string),
        ends_at: period.end || parseApifyDate((edu.endDate || edu.end_date || edu.to) as string),
        description: edu.description as string | undefined,
        logo_url: (edu.logo || edu.schoolLogo) as string | undefined,
      };
    }),
    languages,
    skills,
    certifications: ((apify.certifications || []) as Array<Record<string, unknown>>).map((cert) => ({
      name: (cert.name || cert.title || "") as string,
      authority: cert.authority as string | undefined,
      starts_at: parseApifyDate((cert.startDate || cert.start_date) as string),
      ends_at: parseApifyDate((cert.endDate || cert.end_date) as string),
    })),
    connections: (apify.connections || apify.connectionCount || apify.connectionsCount) as number | undefined,
    follower_count: (apify.followers || apify.followerCount) as number | undefined,
  };
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

    // Match industries
    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      if (keywords.some(kw => textToAnalyze.includes(kw))) {
        industryMonths[industry] = (industryMonths[industry] ?? 0) + months;
        matchedIndustries.push(industry);
      }
    }

    // Match roles
    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
      if (keywords.some(kw => textToAnalyze.includes(kw))) {
        roleMonths[role] = (roleMonths[role] ?? 0) + months;
        matchedRoles.push(role);
      }
    }

    // Match ecosystems
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

    // Track unclassified
    if (matchedIndustries.length === 0 && matchedRoles.length === 0) {
      unclassifiedMonths += months;
      unclassifiedExperiences.push(rawExp);
    }
  }

  // Convert to sorted arrays with percentages
  const toSortedAxis = (record: Record<string, number>): ExpertiseAxis[] => {
    return Object.entries(record)
      .map(([name, months]) => ({
        name,
        months,
        percentage: totalCareerMonths > 0 ? Math.round((months / totalCareerMonths) * 100) : 0,
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
    primaryIndustry,
    primaryRole,
    primaryEcosystem,
    industries,
    isDiversified,
    hasDeepExpertise
  );

  const unclassifiedPercentage = totalCareerMonths > 0
    ? Math.round((unclassifiedMonths / totalCareerMonths) * 100)
    : 0;

  return {
    rawExperiences,
    totalCareerMonths,
    industries,
    roles,
    ecosystems,
    unclassifiedExperiences,
    unclassifiedMonths,
    unclassifiedPercentage,
    primaryIndustry,
    primaryRole,
    primaryEcosystem,
    isDiversified,
    hasDeepExpertise,
    expertiseDescription,
  };
}

function buildExpertiseDescription(
  primaryIndustry: string | null,
  primaryRole: string | null,
  primaryEcosystem: string | null,
  industries: ExpertiseAxis[],
  isDiversified: boolean,
  hasDeepExpertise: boolean
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
  expertise: ExpertiseProfile,
  startupSector: string | undefined
): { fits: boolean; explanation: string } {
  if (!startupSector) {
    return { fits: true, explanation: "Secteur startup non spécifié" };
  }

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
    return {
      fits: true,
      explanation: `Expérience consulting/VC transférable au secteur ${startupSector}`,
    };
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
    junior: 1,
    associate: 2,
    senior: 3,
    lead: 4,
    staff: 4,
    principal: 5,
    director: 5,
    vp: 6,
    "vice president": 6,
    head: 6,
    chief: 7,
    cto: 7,
    ceo: 7,
    cfo: 7,
    coo: 7,
    founder: 7,
    "co-founder": 7,
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

function analyzeProfile(
  profile: NormalizedProfile,
  startupSector?: string
): ProfileAnalysis {
  const redFlags: DetectedRedFlag[] = [];
  const questionsToAsk: QuestionToAsk[] = [];
  const experiences = profile.experiences;

  // Analyze expertise
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
    const months = monthsBetween(exp.starts_at, exp.ends_at);
    return months && months < 12 && !exp.title.toLowerCase().includes("intern");
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

  // Diversified background (can be positive or negative)
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
// API FUNCTIONS
// ============================================================================

const apifySource: DataSource = {
  type: "linkedin",
  name: "Apify (LinkedIn)",
  url: "https://linkedin.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9,
};

/**
 * Fetch LinkedIn profile via Apify Actor
 */
async function fetchLinkedInProfile(linkedinUrl: string): Promise<NormalizedProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Apify LinkedIn] No API key configured");
    return null;
  }

  try {
    // Normalize LinkedIn URL
    let normalizedUrl = linkedinUrl.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://www.linkedin.com/in/${normalizedUrl}`;
    }

    console.log(`[Apify LinkedIn] Fetching profile: ${normalizedUrl}`);
    console.log(`[Apify LinkedIn] API Key present: ${!!apiKey}, length: ${apiKey.length}`);

    // Run the actor synchronously
    const runUrl = `${APIFY_API_BASE}/acts/${LINKEDIN_SCRAPER_ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`;

    // Input format for supreme_coder/linkedin-profile-scraper
    const inputPayload = {
      profileUrls: [normalizedUrl],
    };
    console.log(`[Apify LinkedIn] Request payload:`, JSON.stringify(inputPayload));

    const response = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputPayload),
    });

    console.log(`[Apify LinkedIn] Response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 401) {
        console.error("[Apify LinkedIn] Invalid API key");
        return null;
      }
      if (response.status === 402) {
        console.error("[Apify LinkedIn] Insufficient credits");
        return null;
      }
      console.error(`[Apify LinkedIn] API error: ${response.status}`);
      const errorText = await response.text();
      console.error(`[Apify LinkedIn] Error body: ${errorText}`);
      return null;
    }

    const results = await response.json();
    console.log(`[Apify LinkedIn] Raw response:`, JSON.stringify(results, null, 2).slice(0, 2000));

    if (!results || results.length === 0) {
      console.warn(`[Apify LinkedIn] No profile found for: ${normalizedUrl}`);
      return null;
    }

    // The response structure may vary - log the first result's keys
    const firstResult = results[0];
    console.log(`[Apify LinkedIn] Response keys:`, Object.keys(firstResult || {}));

    // Normalize to our internal format
    const normalized = normalizeApifyProfile(firstResult, normalizedUrl);
    console.log(`[Apify LinkedIn] Successfully fetched profile for: ${normalized.full_name}`);

    return normalized;
  } catch (error) {
    console.error("[Apify LinkedIn] Request failed:", error);
    return null;
  }
}

/**
 * Transform profile to FounderBackground format
 */
function profileToFounderBackground(
  profile: NormalizedProfile,
  role: string,
  linkedinUrl: string,
  startupSector?: string
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
      source: apifySource,
    })),

    investorConnections: [],
    verificationStatus: "verified" as const,
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const apifyLinkedInConnector: Connector = {
  name: "apify_linkedin",
  type: "linkedin",

  isConfigured: () => {
    return !!getApiKey();
  },

  async getFounderBackground(founderName: string): Promise<FounderBackground | null> {
    // This method requires a LinkedIn URL, not just a name
    // Use analyzeFounderLinkedIn instead when you have the URL
    console.warn(`[Apify LinkedIn] getFounderBackground requires LinkedIn URL, not name: ${founderName}`);
    return null;
  },
};

// ============================================================================
// EXPORTED ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze a founder's LinkedIn profile
 *
 * @param linkedinUrl - LinkedIn profile URL
 * @param role - Founder's role in the startup
 * @param startupSector - Optional sector for fit analysis
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
    return {
      success: false,
      error: "APIFY_API_KEY not configured",
    };
  }

  const profile = await fetchLinkedInProfile(linkedinUrl);
  if (!profile) {
    return {
      success: false,
      error: "Failed to fetch LinkedIn profile",
    };
  }

  const analysis = analyzeProfile(profile, startupSector);
  const founderBackground = profileToFounderBackground(profile, role, linkedinUrl, startupSector);

  return {
    success: true,
    profile: founderBackground,
    analysis,
    rawProfile: profile,
  };
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

  return {
    success: profiles.length > 0,
    profiles,
    analyses,
    errors,
  };
}

/**
 * Check if Apify LinkedIn connector is available
 */
export function isApifyLinkedInConfigured(): boolean {
  return !!getApiKey();
}
