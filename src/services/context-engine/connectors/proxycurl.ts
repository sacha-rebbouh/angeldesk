/**
 * Proxycurl LinkedIn Connector
 *
 * Provides access to LinkedIn profile data via Proxycurl API:
 * - Work experience (companies, roles, dates)
 * - Education history
 * - Skills and certifications
 * - Connection count
 * - Recent activity
 *
 * API: https://nubela.co/proxycurl/docs
 * Pricing: ~$0.01/profile (Person Profile endpoint)
 *
 * This is THE source for founder/team due diligence.
 */

import type {
  Connector,
  FounderBackground,
  DataSource,
} from "../types";

// ============================================================================
// TYPES - Proxycurl API Response
// ============================================================================

interface ProxycurlDate {
  day?: number;
  month?: number;
  year?: number;
}

interface ProxycurlExperience {
  company: string;
  company_linkedin_profile_url?: string;
  title: string;
  description?: string;
  location?: string;
  starts_at?: ProxycurlDate;
  ends_at?: ProxycurlDate | null;
  logo_url?: string;
}

interface ProxycurlEducation {
  school: string;
  school_linkedin_profile_url?: string;
  degree_name?: string;
  field_of_study?: string;
  starts_at?: ProxycurlDate;
  ends_at?: ProxycurlDate;
  activities_and_societies?: string;
  description?: string;
  logo_url?: string;
}

interface ProxycurlProfile {
  public_identifier: string;
  profile_pic_url?: string;
  background_cover_image_url?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  headline?: string;
  summary?: string;
  country?: string;
  country_full_name?: string;
  city?: string;
  state?: string;
  experiences: ProxycurlExperience[];
  education: ProxycurlEducation[];
  languages?: string[];
  skills?: string[];
  certifications?: {
    name: string;
    authority?: string;
    starts_at?: ProxycurlDate;
    ends_at?: ProxycurlDate;
  }[];
  connections?: number;
  follower_count?: number;
  recommendations?: string[];
  activities?: {
    title: string;
    link: string;
    activity_status: string;
  }[];
  articles?: {
    title: string;
    link: string;
    published_date?: string;
  }[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://nubela.co/proxycurl/api/v2";

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
const GAP_THRESHOLD_MONTHS = 12; // Gap > 12 months = worth noting
const LOW_CONNECTIONS_THRESHOLD = 300; // Very low network
const CLIFF_THRESHOLD_MONTHS = 12; // Standard vesting cliff

// ============================================================================
// EXPERTISE DETECTION - Industries, Roles, Ecosystems
// ============================================================================

// Industry keywords mapping
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

// Role/Function keywords mapping
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

// Ecosystem keywords mapping
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
  return process.env.PROXYCURL_API_KEY ?? null;
}

function dateToYear(date: ProxycurlDate | null | undefined): number | undefined {
  return date?.year;
}

function dateToTimestamp(date: ProxycurlDate | null | undefined): number | null {
  if (!date?.year) return null;
  return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1).getTime();
}

function monthsBetween(start: ProxycurlDate | null | undefined, end: ProxycurlDate | null | undefined): number | null {
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
  occurrences: number;
  totalMonths: number;
  percentage: number; // % of total career
}

/**
 * Raw experience data - ALWAYS available for LLM analysis
 */
interface RawExperience {
  company: string;
  title: string;
  description: string | null;
  durationMonths: number;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  // Classification results (may be empty if no match)
  detectedIndustries: string[];
  detectedRoles: string[];
  detectedEcosystems: string[];
}

interface ExpertiseProfile {
  // === RAW DATA (ALWAYS COMPLETE) ===
  rawExperiences: RawExperience[];
  totalCareerMonths: number;

  // === CLASSIFIED DATA (best effort) ===
  industries: ExpertiseAxis[];
  roles: ExpertiseAxis[];
  ecosystems: ExpertiseAxis[];

  // === UNCLASSIFIED DATA (for LLM to analyze) ===
  unclassifiedExperiences: RawExperience[]; // Experiences with no detected categories
  unclassifiedMonths: number; // Total time not categorized
  unclassifiedPercentage: number; // % of career not categorized

  // === DERIVED INSIGHTS ===
  primaryIndustry: string | null;
  primaryRole: string | null;
  primaryEcosystem: string | null;

  isDiversified: boolean; // true if 4+ industries
  hasDeepExpertise: boolean; // true if any axis has 50%+ of career
  expertiseDescription: string; // Human-readable summary
}

/**
 * Detect which category an experience belongs to
 */
function detectCategories(
  exp: ProxycurlExperience,
  keywords: Record<string, string[]>
): string[] {
  const text = `${exp.company} ${exp.title} ${exp.description ?? ""}`.toLowerCase();
  const matches: string[] = [];

  for (const [category, categoryKeywords] of Object.entries(keywords)) {
    if (categoryKeywords.some(kw => text.includes(kw))) {
      matches.push(category);
    }
  }

  return matches;
}

/**
 * Analyze expertise across industries, roles, and ecosystems
 * Returns BOTH classified data AND raw data for LLM analysis
 */
function analyzeExpertise(experiences: ProxycurlExperience[]): ExpertiseProfile {
  const industryMap = new Map<string, { occurrences: number; months: number }>();
  const roleMap = new Map<string, { occurrences: number; months: number }>();
  const ecosystemMap = new Map<string, { occurrences: number; months: number }>();

  let totalCareerMonths = 0;
  const rawExperiences: RawExperience[] = [];
  const unclassifiedExperiences: RawExperience[] = [];
  let unclassifiedMonths = 0;

  for (const exp of experiences) {
    const months = monthsBetween(exp.starts_at, exp.ends_at) ?? 0;
    totalCareerMonths += months;

    // Detect categories for this experience
    const detectedIndustries = detectCategories(exp, INDUSTRY_KEYWORDS);
    const detectedRoles = detectCategories(exp, ROLE_KEYWORDS);
    const detectedEcosystems = detectCategories(exp, ECOSYSTEM_KEYWORDS);

    // Build raw experience record (ALWAYS)
    const rawExp: RawExperience = {
      company: exp.company,
      title: exp.title,
      description: exp.description ?? null,
      durationMonths: months,
      startYear: exp.starts_at?.year ?? null,
      endYear: exp.ends_at?.year ?? null,
      isCurrent: exp.ends_at === null,
      detectedIndustries,
      detectedRoles,
      detectedEcosystems,
    };
    rawExperiences.push(rawExp);

    // Track unclassified experiences (no industry AND no role detected)
    const isUnclassified = detectedIndustries.length === 0 && detectedRoles.length === 0;
    if (isUnclassified) {
      unclassifiedExperiences.push(rawExp);
      unclassifiedMonths += months;
    }

    // Aggregate industry stats
    for (const ind of detectedIndustries) {
      const existing = industryMap.get(ind) ?? { occurrences: 0, months: 0 };
      industryMap.set(ind, { occurrences: existing.occurrences + 1, months: existing.months + months });
    }

    // Aggregate role stats
    for (const role of detectedRoles) {
      const existing = roleMap.get(role) ?? { occurrences: 0, months: 0 };
      roleMap.set(role, { occurrences: existing.occurrences + 1, months: existing.months + months });
    }

    // Aggregate ecosystem stats
    for (const eco of detectedEcosystems) {
      const existing = ecosystemMap.get(eco) ?? { occurrences: 0, months: 0 };
      ecosystemMap.set(eco, { occurrences: existing.occurrences + 1, months: existing.months + months });
    }
  }

  // Convert maps to sorted arrays
  const toAxisArray = (map: Map<string, { occurrences: number; months: number }>): ExpertiseAxis[] => {
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        occurrences: data.occurrences,
        totalMonths: data.months,
        percentage: totalCareerMonths > 0 ? Math.round((data.months / totalCareerMonths) * 100) : 0,
      }))
      .sort((a, b) => b.totalMonths - a.totalMonths);
  };

  const industries = toAxisArray(industryMap);
  const roles = toAxisArray(roleMap);
  const ecosystems = toAxisArray(ecosystemMap);

  // Determine primary expertise on each axis
  const primaryIndustry = industries.length > 0 && industries[0].percentage >= 30 ? industries[0].name : null;
  const primaryRole = roles.length > 0 && roles[0].percentage >= 30 ? roles[0].name : null;
  const primaryEcosystem = ecosystems.length > 0 && ecosystems[0].percentage >= 30 ? ecosystems[0].name : null;

  // Check if diversified (4+ industries with significant time)
  const significantIndustries = industries.filter(i => i.percentage >= 15);
  const isDiversified = significantIndustries.length >= 4;

  // Check for deep expertise (any axis with 50%+ of career)
  const hasDeepExpertise =
    (industries.length > 0 && industries[0].percentage >= 50) ||
    (roles.length > 0 && roles[0].percentage >= 50) ||
    (ecosystems.length > 0 && ecosystems[0].percentage >= 50);

  // Build human-readable description
  const expertiseDescription = buildExpertiseDescription(
    primaryIndustry,
    primaryRole,
    primaryEcosystem,
    industries,
    isDiversified,
    hasDeepExpertise
  );

  // Calculate unclassified percentage
  const unclassifiedPercentage = totalCareerMonths > 0
    ? Math.round((unclassifiedMonths / totalCareerMonths) * 100)
    : 0;

  return {
    // Raw data (always complete)
    rawExperiences,
    totalCareerMonths,

    // Classified data
    industries,
    roles,
    ecosystems,

    // Unclassified data
    unclassifiedExperiences,
    unclassifiedMonths,
    unclassifiedPercentage,

    // Derived insights
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

/**
 * Check if founder's expertise matches the startup sector
 */
function checkSectorFit(
  expertise: ExpertiseProfile,
  startupSector: string | undefined
): { fits: boolean; explanation: string } {
  if (!startupSector) {
    return { fits: true, explanation: "Secteur startup non spécifié" };
  }

  const sectorLower = startupSector.toLowerCase();

  // Check if any of the founder's industries match the startup sector
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

  // Check for transferable skills (consulting, VC experience applies everywhere)
  const hasTransferableExperience = expertise.ecosystems.some(
    eco => ["consulting", "vc_pe"].includes(eco.name) && eco.percentage >= 20
  );

  if (hasTransferableExperience) {
    return {
      fits: true,
      explanation: `Expérience consulting/VC transférable au secteur ${startupSector}`,
    };
  }

  // No direct match
  return {
    fits: false,
    explanation: `Pas d'expérience directe en ${startupSector} - industries: ${expertise.industries.slice(0, 3).map(i => i.name).join(", ") || "non identifiées"}`,
  };
}

const proxycurlSource: DataSource = {
  type: "linkedin",
  name: "Proxycurl (LinkedIn)",
  url: "https://linkedin.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9, // High confidence - data comes from LinkedIn
};

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

/**
 * Check if there's career progression in the experiences
 */
function hasCareerProgression(experiences: ProxycurlExperience[]): boolean {
  const seniorityKeywords = {
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
    return 2; // Default mid-level
  });

  // Check if there's an upward trend (allowing for some variation)
  if (seniorityScores.length < 2) return true;

  // Compare first half avg to second half avg (older to newer)
  const midpoint = Math.floor(seniorityScores.length / 2);
  const olderAvg = seniorityScores.slice(midpoint).reduce((a, b) => a + b, 0) / (seniorityScores.length - midpoint);
  const newerAvg = seniorityScores.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;

  return newerAvg >= olderAvg - 0.5; // Allow slight dip
}

/**
 * Analyze profile for red flags and questions to ask
 * @param profile - The LinkedIn profile data
 * @param startupSector - Optional: the sector of the startup being analyzed (e.g., "fintech", "healthtech")
 */
function analyzeProfile(profile: ProxycurlProfile, startupSector?: string): ProfileAnalysis {
  const redFlags: DetectedRedFlag[] = [];
  const questionsToAsk: QuestionToAsk[] = [];
  const experiences = profile.experiences || [];

  // Analyze expertise across all axes
  const expertise = analyzeExpertise(experiences);

  // Check sector fit if startup sector is provided
  const sectorFit = startupSector ? checkSectorFit(expertise, startupSector) : undefined;

  // Sort experiences by date (most recent first)
  const sortedExperiences = [...experiences].sort((a, b) => {
    const aStart = dateToTimestamp(a.starts_at) ?? 0;
    const bStart = dateToTimestamp(b.starts_at) ?? 0;
    return bStart - aStart;
  });

  // =========================================================================
  // 1. SMART JOB PATTERN ANALYSIS (Question, not red flag)
  // Only flag if pattern is SUSPICIOUS, not just "short tenures"
  // =========================================================================
  if (experiences.length >= 3) {
    const tenures = experiences
      .map(exp => ({
        company: exp.company,
        months: monthsBetween(exp.starts_at, exp.ends_at),
        isNotable: isNotableCompany(exp.company),
      }))
      .filter((t): t is { company: string; months: number; isNotable: boolean } =>
        t.months !== null && t.months > 0
      );

    if (tenures.length >= 3) {
      // Count how many exits were before the cliff (< 12 months)
      const preCliffExits = tenures.filter(t => t.months < CLIFF_THRESHOLD_MONTHS);
      const hasNotableExperience = tenures.some(t => t.isNotable);
      const hasProgression = hasCareerProgression(experiences);

      // Only raise question if:
      // - Multiple pre-cliff exits (pattern, not one-off)
      // - AND no notable company experience (which would explain short stints)
      // - AND no clear career progression
      if (preCliffExits.length >= 2 && !hasNotableExperience && !hasProgression) {
        questionsToAsk.push({
          question: "Plusieurs postes quittés avant 12 mois - quel était le contexte ?",
          context: `${preCliffExits.length} postes < 12 mois: ${preCliffExits.map(t => `${t.company} (${t.months} mois)`).join(", ")}`,
          priority: preCliffExits.length >= 3 ? "high" : "medium",
        });
      }

      // Special case: ALL positions are very short (< 10 months) with no progression
      const avgTenure = tenures.reduce((a, b) => a + b.months, 0) / tenures.length;
      if (avgTenure < 10 && !hasNotableExperience && !hasProgression && tenures.length >= 4) {
        questionsToAsk.push({
          question: "Parcours avec beaucoup de mouvements - quelle est la vision long terme ?",
          context: `Durée moyenne: ${Math.round(avgTenure)} mois sur ${tenures.length} postes`,
          priority: "medium",
        });
      }
    }
  }

  // =========================================================================
  // 2. CV GAPS DETECTION
  // =========================================================================

  for (let i = 0; i < sortedExperiences.length - 1; i++) {
    const current = sortedExperiences[i];
    const previous = sortedExperiences[i + 1];

    const currentStart = dateToTimestamp(current.starts_at);
    const previousEnd = dateToTimestamp(previous.ends_at);

    if (currentStart && previousEnd) {
      const gapMonths = Math.round((currentStart - previousEnd) / (1000 * 60 * 60 * 24 * 30));
      if (gapMonths > GAP_THRESHOLD_MONTHS) {
        // Long gaps are questions, not red flags (could be sabbatical, education, personal project)
        questionsToAsk.push({
          question: `Gap de ${gapMonths} mois dans le CV - quelle était l'activité ?`,
          context: `Entre ${previous.company} et ${current.company}`,
          priority: gapMonths > 24 ? "medium" : "low",
        });
      }
    }
  }

  // =========================================================================
  // 3. LOW CONNECTIONS (signal, not red flag)
  // =========================================================================
  if (profile.connections !== undefined && profile.connections < LOW_CONNECTIONS_THRESHOLD) {
    // Very low connections could indicate new profile, or intentional privacy
    if (profile.connections < 100) {
      questionsToAsk.push({
        question: "Réseau LinkedIn très limité - est-ce un choix ou un nouveau profil ?",
        context: `${profile.connections} connexions`,
        priority: "low",
      });
    }
    // Don't flag 100-300 connections, it's normal for many people
  }

  // =========================================================================
  // 4. NO EXPERIENCE - This IS a red flag
  // =========================================================================
  if (experiences.length === 0) {
    redFlags.push({
      type: "no_experience",
      description: "Aucune expérience professionnelle listée sur LinkedIn",
      severity: "high",
    });
  }

  // =========================================================================
  // 5. NO EDUCATION - Minor, just note it
  // =========================================================================
  // Don't flag missing education - many successful founders are self-taught

  // =========================================================================
  // 6. VERY RECENT PROFILE - Question if suspicious
  // =========================================================================
  const oldestExperience = sortedExperiences[sortedExperiences.length - 1];
  if (oldestExperience && experiences.length > 0) {
    const oldestYear = oldestExperience.starts_at?.year;
    const currentYear = new Date().getFullYear();
    // Only flag if person claims many years of experience but profile is new
    const claimedYearsOfExperience = experiences.length >= 3 ? 5 : 0; // Rough heuristic
    if (oldestYear && currentYear - oldestYear < 2 && claimedYearsOfExperience > 3) {
      questionsToAsk.push({
        question: "Profil LinkedIn récent malgré expérience affichée - nouveau sur LinkedIn ?",
        context: `Historique depuis ${oldestYear} seulement`,
        priority: "low",
      });
    }
  }

  // =========================================================================
  // 7. EXPERTISE & SECTOR FIT ANALYSIS
  // =========================================================================

  // Diversified background - question if no deep expertise AND no sector fit
  if (expertise.isDiversified && !expertise.hasDeepExpertise) {
    questionsToAsk.push({
      question: "Parcours diversifié sans spécialisation claire - quelle est l'expertise clé pour ce projet ?",
      context: expertise.expertiseDescription,
      priority: "medium",
    });
  }

  // Sector mismatch - only if startup sector was provided and doesn't fit
  if (sectorFit && !sectorFit.fits) {
    questionsToAsk.push({
      question: `Pas d'expérience directe dans le secteur - comment comptez-vous combler ce gap ?`,
      context: sectorFit.explanation,
      priority: "medium",
    });
  }

  // No identifiable industry expertise at all
  if (expertise.industries.length === 0 && experiences.length >= 3) {
    questionsToAsk.push({
      question: "Industries du parcours non identifiées - pouvez-vous préciser votre expertise sectorielle ?",
      context: "Les expériences ne correspondent pas aux secteurs tech standards",
      priority: "low",
    });
  }

  // Role diversity without clear primary - might be a question
  if (!expertise.primaryRole && expertise.roles.length >= 3) {
    const roleList = expertise.roles.slice(0, 3).map(r => r.name).join(", ");
    questionsToAsk.push({
      question: "Rôles variés dans le parcours - quel sera votre rôle principal en tant que fondateur ?",
      context: `Rôles détectés: ${roleList}`,
      priority: "low",
    });
  }

  return { redFlags, questionsToAsk, expertise, sectorFit };
}

/**
 * Legacy wrapper for backward compatibility
 */
function detectRedFlags(profile: ProxycurlProfile): DetectedRedFlag[] {
  return analyzeProfile(profile).redFlags;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchLinkedInProfile(linkedinUrl: string): Promise<ProxycurlProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Proxycurl] No API key configured");
    return null;
  }

  try {
    const url = new URL(`${API_BASE}/linkedin`);
    url.searchParams.set("url", linkedinUrl);
    // Request extra data fields
    url.searchParams.set("skills", "include");
    url.searchParams.set("use_cache", "if-present"); // Use cache when available to save credits
    url.searchParams.set("fallback_to_cache", "on-error");

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[Proxycurl] Profile not found: ${linkedinUrl}`);
        return null;
      }
      if (response.status === 401) {
        console.error("[Proxycurl] Invalid API key");
        return null;
      }
      if (response.status === 429) {
        console.error("[Proxycurl] Rate limit exceeded");
        return null;
      }
      if (response.status === 402) {
        console.error("[Proxycurl] Insufficient credits");
        return null;
      }
      console.error(`[Proxycurl] API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Proxycurl] Request failed:", error);
    return null;
  }
}

/**
 * Search for a LinkedIn profile by name (less reliable than direct URL)
 * Uses the Person Lookup endpoint
 */
async function searchLinkedInProfile(
  firstName: string,
  lastName: string,
  company?: string
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Proxycurl] No API key configured");
    return null;
  }

  try {
    const url = new URL(`${API_BASE}/linkedin/profile/resolve`);
    url.searchParams.set("first_name", firstName);
    url.searchParams.set("last_name", lastName);
    if (company) {
      url.searchParams.set("company_domain", company);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.url ?? null;
  } catch (error) {
    console.error("[Proxycurl] Profile search failed:", error);
    return null;
  }
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const proxycurlConnector: Connector = {
  name: "Proxycurl",
  type: "linkedin",

  isConfigured: () => {
    return !!getApiKey();
  },

  getFounderBackground: async (
    founderNameOrUrl: string
  ): Promise<FounderBackground | null> => {
    let profile: ProxycurlProfile | null = null;
    let linkedinUrl: string | undefined;

    // Check if input is a LinkedIn URL or a name
    if (founderNameOrUrl.includes("linkedin.com")) {
      linkedinUrl = founderNameOrUrl;
      profile = await fetchLinkedInProfile(founderNameOrUrl);
    } else {
      // Try to search by name (less reliable)
      const nameParts = founderNameOrUrl.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ");
        const foundUrl = await searchLinkedInProfile(firstName, lastName);
        if (foundUrl) {
          linkedinUrl = foundUrl;
          profile = await fetchLinkedInProfile(foundUrl);
        }
      }
    }

    if (!profile) {
      return null;
    }

    // Detect red flags
    const detectedRedFlags = detectRedFlags(profile);

    // Map experiences to our format
    const previousCompanies = (profile.experiences || []).map(exp => ({
      company: exp.company,
      role: exp.title,
      startYear: dateToYear(exp.starts_at),
      endYear: dateToYear(exp.ends_at),
      verified: true, // LinkedIn data is considered verified
    }));

    // Identify potential previous ventures (founder/co-founder roles)
    const founderRoles = ["founder", "co-founder", "cofounder", "ceo", "cto", "co-ceo"];
    const previousVentures = (profile.experiences || [])
      .filter(exp => {
        const title = exp.title.toLowerCase();
        return founderRoles.some(role => title.includes(role));
      })
      .filter(exp => exp.ends_at !== null) // Exclude current role
      .map(exp => ({
        companyName: exp.company,
        outcome: "unknown" as const, // Would need Crunchbase to determine
        exitYear: dateToYear(exp.ends_at),
      }));

    // Map education
    const education = (profile.education || []).map(edu => ({
      institution: edu.school,
      degree: edu.degree_name,
      year: dateToYear(edu.ends_at),
    }));

    // Extract investor connections (VCs in connections - would need network data)
    // For now, return empty - could be enhanced with Proxycurl's network endpoint
    const investorConnections: string[] = [];

    // Determine verification status
    let verificationStatus: "verified" | "partial" | "unverified" = "verified";
    if (previousCompanies.length === 0 && education.length === 0) {
      verificationStatus = "partial";
    }
    if (detectedRedFlags.some(f => f.type === "no_experience")) {
      verificationStatus = "unverified";
    }

    return {
      name: profile.full_name,
      role: profile.headline ?? "Unknown",
      linkedinUrl,
      previousCompanies,
      previousVentures,
      education,
      redFlags: detectedRedFlags.map(flag => ({
        type: flag.type,
        description: flag.description,
        severity: flag.severity,
        source: {
          ...proxycurlSource,
          retrievedAt: new Date().toISOString(),
        },
      })),
      investorConnections,
      verificationStatus,
    };
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// For direct use when more detailed data is needed
// ============================================================================

/**
 * Get full LinkedIn profile with all available data
 */
export async function getFullLinkedInProfile(linkedinUrl: string): Promise<ProxycurlProfile | null> {
  return fetchLinkedInProfile(linkedinUrl);
}

/**
 * Search for LinkedIn profile by name
 * Returns the LinkedIn URL if found
 */
export async function findLinkedInProfile(
  firstName: string,
  lastName: string,
  companyDomain?: string
): Promise<string | null> {
  return searchLinkedInProfile(firstName, lastName, companyDomain);
}

/**
 * Analyze a founder's LinkedIn for DD purposes
 * Returns structured insights including questions to ask and expertise analysis
 *
 * @param linkedinUrl - The LinkedIn profile URL
 * @param options.startupSector - Optional: the sector of the startup (e.g., "fintech", "healthtech")
 *                                 Used to check if founder's background fits the startup
 */
export async function analyzeFounderLinkedIn(
  linkedinUrl: string,
  options: { startupSector?: string } = {}
): Promise<{
  profile: ProxycurlProfile | null;
  insights: {
    totalExperienceYears: number;
    hasNotableCompanyExperience: boolean;
    notableCompanies: string[];
    hasPreviousFounderExperience: boolean;
    previousVenturesCount: number;
    educationLevel: "top_tier" | "good" | "unknown";
    networkStrength: "strong" | "moderate" | "weak";
    redFlags: DetectedRedFlag[];
    questionsToAsk: QuestionToAsk[];
    expertise: ExpertiseProfile;
    sectorFit?: { fits: boolean; explanation: string };
  } | null;
} | null> {
  const profile = await fetchLinkedInProfile(linkedinUrl);
  if (!profile) {
    return null;
  }

  const experiences = profile.experiences || [];

  // Calculate total experience years
  let totalMonths = 0;
  for (const exp of experiences) {
    const months = monthsBetween(exp.starts_at, exp.ends_at);
    if (months) totalMonths += months;
  }

  // Check for notable companies
  const notableCompanies = experiences
    .filter(exp => isNotableCompany(exp.company))
    .map(exp => exp.company);

  // Check for founder experience
  const founderRoles = ["founder", "co-founder", "cofounder"];
  const previousVentures = experiences.filter(exp =>
    founderRoles.some(role => exp.title.toLowerCase().includes(role))
  );

  // Determine education level (simplified)
  const topTierSchools = ["harvard", "stanford", "mit", "hec", "insead", "polytechnique", "centrale", "oxford", "cambridge", "yale", "princeton"];
  const educationLevel = (profile.education || []).some(edu =>
    topTierSchools.some(school => edu.school.toLowerCase().includes(school))
  ) ? "top_tier" : (profile.education?.length ? "good" : "unknown");

  // Determine network strength
  const connections = profile.connections ?? 0;
  const networkStrength = connections > 1000 ? "strong" : connections > 500 ? "moderate" : "weak";

  // Get full analysis (red flags + questions + expertise)
  const { redFlags, questionsToAsk, expertise, sectorFit } = analyzeProfile(profile, options.startupSector);

  return {
    profile,
    insights: {
      totalExperienceYears: Math.round(totalMonths / 12),
      hasNotableCompanyExperience: notableCompanies.length > 0,
      notableCompanies,
      hasPreviousFounderExperience: previousVentures.length > 0,
      previousVenturesCount: previousVentures.length,
      educationLevel,
      networkStrength,
      redFlags,
      questionsToAsk,
      expertise,
      sectorFit,
    },
  };
}
