/**
 * Context Engine Types
 *
 * The Context Engine enriches deal analysis with external data:
 * - Similar deals and funding context
 * - Market data and benchmarks
 * - Founder/team background
 * - Competitive landscape
 * - News and sentiment
 */

// ============================================================================
// DEAL INTELLIGENCE
// ============================================================================

export interface SimilarDeal {
  companyName: string;
  sector: string;
  subSector?: string;
  stage: string;
  geography: string;
  fundingAmount: number;
  valuation?: number;
  valuationMultiple?: number; // e.g., 30x ARR
  fundingDate: string;
  investors: string[];
  source: DataSource;
  sourceUrl?: string;
}

export interface FundingContext {
  totalDealsInPeriod: number;
  medianValuationMultiple: number;
  p25ValuationMultiple: number;
  p75ValuationMultiple: number;
  trend: "heating" | "stable" | "cooling";
  trendPercentage: number; // e.g., -15% vs previous quarter
  downRoundCount: number;
  period: string; // e.g., "Q4 2025"
}

export interface DealIntelligence {
  similarDeals: SimilarDeal[];
  fundingContext: FundingContext;
  percentileRank: number; // 0-100
  fairValueRange: {
    low: number;
    high: number;
    currency: string;
  };
  verdict: "undervalued" | "fair" | "aggressive" | "very_aggressive";
}

// ============================================================================
// MARKET DATA
// ============================================================================

export interface MarketSize {
  tam: number; // Total Addressable Market
  sam: number; // Serviceable Addressable Market
  som: number; // Serviceable Obtainable Market
  currency: string;
  year: number;
  cagr: number; // Compound Annual Growth Rate
  source: DataSource;
}

export interface SectorBenchmark {
  metricName: string; // e.g., "ARR Growth", "NRR", "CAC Payback"
  p25: number;
  median: number;
  p75: number;
  topDecile?: number;
  unit: string; // e.g., "%", "months", "ratio"
  sector: string;
  stage: string;
  source: DataSource;
  lastUpdated: string;
}

export interface MarketData {
  marketSize?: MarketSize;
  benchmarks: SectorBenchmark[];
  trends: MarketTrend[];
}

export interface MarketTrend {
  title: string;
  description: string;
  impact: "positive" | "neutral" | "negative";
  relevance: number; // 0-1
  source: DataSource;
  date: string;
}

// ============================================================================
// PEOPLE GRAPH
// ============================================================================

export interface FounderBackground {
  name: string;
  role: string;
  linkedinUrl?: string;

  // Work history
  previousCompanies: {
    company: string;
    role: string;
    startYear?: number;
    endYear?: number;
    verified: boolean;
  }[];

  // Previous ventures
  previousVentures: {
    companyName: string;
    outcome: "exit" | "acquihire" | "shutdown" | "ongoing" | "unknown";
    exitValue?: number;
    exitYear?: number;
    fundingRaised?: number;
  }[];

  // Education
  education: {
    institution: string;
    degree?: string;
    year?: number;
  }[];

  // Red flags
  redFlags: {
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
    source: DataSource;
  }[];

  // Network
  investorConnections: string[];
  verificationStatus: "verified" | "partial" | "unverified";
}

export interface PeopleGraph {
  founders: FounderBackground[];
  teamSize?: number;
  teamGrowthRate?: number; // % growth over last 6 months
  keyHires?: {
    name: string;
    role: string;
    previousCompany: string;
    date: string;
  }[];
}

// ============================================================================
// COMPETITIVE LANDSCAPE
// ============================================================================

export interface Competitor {
  name: string;
  description?: string;
  website?: string;

  // Funding
  totalFunding?: number;
  lastRoundAmount?: number;
  lastRoundDate?: string;
  stage?: string;

  // Positioning
  positioning: string; // How they position themselves
  overlap: "direct" | "partial" | "adjacent";

  // Metrics (if available)
  estimatedRevenue?: number;
  estimatedEmployees?: number;

  source: DataSource;
}

export interface CompetitiveLandscape {
  competitors: Competitor[];
  marketConcentration: "fragmented" | "moderate" | "concentrated";
  competitiveAdvantages: string[];
  competitiveRisks: string[];
}

// ============================================================================
// NEWS & SENTIMENT
// ============================================================================

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
  relevance: number; // 0-1
  category: "company" | "founder" | "sector" | "competitor";
}

export interface NewsSentiment {
  articles: NewsArticle[];
  overallSentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // -1 to 1
  keyTopics: string[];
}

// ============================================================================
// COMBINED CONTEXT
// ============================================================================

/** F59: Detailed context quality scoring */
export interface ContextQualityScore {
  /** Score global 0-1 */
  completeness: number;
  /** Score de fiabilite 0-1 (% de connecteurs OK) */
  reliability: number;
  /** Score composite qualite = completeness * reliability */
  qualityScore: number;
  /** Alerte si qualite insuffisante */
  degraded: boolean;
  /** Raison de la degradation */
  degradationReasons: string[];
  /** Detail par categorie */
  categories: {
    similarDeals: { score: number; count: number; weight: number };
    marketData: { score: number; available: boolean; weight: number };
    competitors: { score: number; count: number; weight: number };
    news: { score: number; count: number; weight: number };
  };
}

export interface DealContext {
  dealIntelligence?: DealIntelligence;
  marketData?: MarketData;
  peopleGraph?: PeopleGraph;
  competitiveLandscape?: CompetitiveLandscape;
  newsSentiment?: NewsSentiment;
  /** Full website content from crawling the startup's site */
  websiteContent?: WebsiteContent;

  // Metadata
  enrichedAt: string;
  sources: DataSource[];
  completeness: number; // 0-1, how much data we found
  /** F59: Detailed quality scoring (replaces simple completeness) */
  contextQuality?: ContextQualityScore;
}

// ============================================================================
// DATA SOURCES
// ============================================================================

export type DataSourceType =
  | "crunchbase"
  | "dealroom"
  | "pitchbook"
  | "linkedin"
  | "news_api"
  | "web_search"
  | "database"
  | "manual";

export interface DataSource {
  type: DataSourceType;
  name: string;
  url?: string;
  retrievedAt: string;
  confidence: number; // 0-1
}

// ============================================================================
// CONNECTOR INTERFACE
// ============================================================================

export interface ConnectorQuery {
  companyName?: string;
  sector?: string;
  subSector?: string;
  stage?: string;
  geography?: string;
  founderNames?: string[];
  keywords?: string[];
  /** Startup website URL for full site crawling */
  websiteUrl?: string;

  // ============================================================================
  // EXTRACTED DATA (from document-extractor)
  // These fields are populated after document extraction for richer context
  // ============================================================================
  /** Company tagline extracted from deck - used for competitor search */
  tagline?: string;
  /** Competitors mentioned in the deck - used to enrich competitive landscape */
  mentionedCompetitors?: string[];
  /** Product/service description extracted from deck */
  productDescription?: string;
  /** Business model extracted from deck */
  businessModel?: string;

  // ============================================================================
  // USE CASE DATA (CRITICAL for competitor search)
  // Competitors are found by WHAT the product does, not its tech stack
  // ============================================================================
  /** Product name (e.g., "Axiom", "Notion") */
  productName?: string;
  /** Core value proposition - the central concept */
  coreValueProposition?: string;
  /** Use cases addressed by the product - MOST IMPORTANT for finding real competitors */
  useCases?: string[];
  /** Key differentiators - unique competitive advantages */
  keyDifferentiators?: string[];
}

export interface Connector {
  name: string;
  type: DataSourceType;
  isConfigured: () => boolean;

  // Each connector implements relevant methods
  searchSimilarDeals?(query: ConnectorQuery): Promise<SimilarDeal[]>;
  getMarketData?(query: ConnectorQuery): Promise<MarketData>;
  getFounderBackground?(founderName: string): Promise<FounderBackground | null>;
  getCompetitors?(query: ConnectorQuery): Promise<Competitor[]>;
  getNews?(query: ConnectorQuery): Promise<NewsArticle[]>;
}

// ============================================================================
// WEBSITE CONTENT (Full site crawling)
// ============================================================================

/**
 * A single scraped page from the startup's website
 */
export interface WebsitePage {
  url: string;
  path: string; // e.g., "/about", "/pricing"
  title: string;
  description?: string; // meta description
  content: string; // full text content
  pageType: WebsitePageType;
  extractedData?: {
    // Team page specific
    teamMembers?: {
      name: string;
      role: string;
      bio?: string;
      linkedinUrl?: string;
    }[];
    // Pricing page specific
    pricingPlans?: {
      name: string;
      price: string;
      features: string[];
    }[];
    // Testimonials
    testimonials?: {
      quote: string;
      author: string;
      company?: string;
      role?: string;
    }[];
    // Client logos/names
    clients?: string[];
    // Job openings
    jobOpenings?: {
      title: string;
      department: string;
      location?: string;
    }[];
    // Features/product info
    features?: {
      title: string;
      description: string;
    }[];
    // Integrations
    integrations?: string[];
  };
  scrapedAt: string;
  wordCount: number;
}

export type WebsitePageType =
  | "homepage"
  | "about"
  | "team"
  | "pricing"
  | "product"
  | "features"
  | "customers"
  | "case-studies"
  | "testimonials"
  | "blog"
  | "blog-post"
  | "careers"
  | "contact"
  | "legal"
  | "documentation"
  | "api"
  | "integrations"
  | "other";

/**
 * Complete website content from crawling
 */
export interface WebsiteContent {
  /** Base URL of the website */
  baseUrl: string;
  /** Company name extracted from site */
  companyName?: string;
  /** Main tagline/value prop from homepage */
  tagline?: string;
  /** All crawled pages */
  pages: WebsitePage[];
  /** Aggregated insights from all pages */
  insights: {
    // Product
    productDescription?: string;
    features: string[];
    integrations: string[];
    // Pricing
    hasFreeTier: boolean;
    hasPricing: boolean;
    pricingModel?: "freemium" | "subscription" | "usage-based" | "enterprise" | "contact-sales";
    priceRange?: { min: number; max: number; currency: string };
    // Team
    teamSize?: number;
    teamMembers: { name: string; role: string; linkedinUrl?: string }[];
    // Traction
    clientCount?: number;
    clients: string[];
    testimonials: { quote: string; author: string; company?: string }[];
    // Hiring
    openPositions: number;
    hiringDepartments: string[];
    // Content health
    lastBlogPost?: string;
    blogPostCount?: number;
    hasDocumentation: boolean;
    hasAPI: boolean;
  };
  /** Crawl metadata */
  crawlStats: {
    totalPages: number;
    successfulPages: number;
    failedPages: number;
    totalWordCount: number;
    crawlDurationMs: number;
    crawledAt: string;
  };
  /** Red flags detected from website */
  redFlags: {
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
  }[];
}
