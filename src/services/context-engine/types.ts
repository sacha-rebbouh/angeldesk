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

export interface DealContext {
  dealIntelligence?: DealIntelligence;
  marketData?: MarketData;
  peopleGraph?: PeopleGraph;
  competitiveLandscape?: CompetitiveLandscape;
  newsSentiment?: NewsSentiment;

  // Metadata
  enrichedAt: string;
  sources: DataSource[];
  completeness: number; // 0-1, how much data we found
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
