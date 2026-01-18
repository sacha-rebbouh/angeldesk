/**
 * Mock Connector
 *
 * Provides realistic mock data for development and testing.
 * This allows the platform to work without external API keys.
 */

import type {
  Connector,
  ConnectorQuery,
  SimilarDeal,
  MarketData,
  Competitor,
  NewsArticle,
  FounderBackground,
  DataSource,
} from "../types";

const mockSource: DataSource = {
  type: "mock",
  name: "Mock Data",
  retrievedAt: new Date().toISOString(),
  confidence: 0.5,
};

// Mock similar deals database
const MOCK_DEALS: SimilarDeal[] = [
  {
    companyName: "DataFlow",
    sector: "SaaS B2B",
    subSector: "Data Infrastructure",
    stage: "SEED",
    geography: "France",
    fundingAmount: 2500000,
    valuation: 12500000,
    valuationMultiple: 25,
    fundingDate: "2025-09-15",
    investors: ["Kima Ventures", "Founders Future"],
    source: mockSource,
  },
  {
    companyName: "CloudMetrics",
    sector: "SaaS B2B",
    subSector: "Analytics",
    stage: "SEED",
    geography: "Germany",
    fundingAmount: 3000000,
    valuation: 15000000,
    valuationMultiple: 20,
    fundingDate: "2025-10-01",
    investors: ["Earlybird", "Point Nine"],
    source: mockSource,
  },
  {
    companyName: "APIStack",
    sector: "SaaS B2B",
    subSector: "Developer Tools",
    stage: "SEED",
    geography: "UK",
    fundingAmount: 4000000,
    valuation: 20000000,
    valuationMultiple: 30,
    fundingDate: "2025-08-20",
    investors: ["Accel", "LocalGlobe"],
    source: mockSource,
  },
  {
    companyName: "SecureAuth",
    sector: "SaaS B2B",
    subSector: "Security",
    stage: "SEED",
    geography: "France",
    fundingAmount: 2000000,
    valuation: 10000000,
    valuationMultiple: 18,
    fundingDate: "2025-11-05",
    investors: ["Partech", "360 Capital"],
    source: mockSource,
  },
  {
    companyName: "MLOps.io",
    sector: "SaaS B2B",
    subSector: "AI/ML",
    stage: "SEED",
    geography: "Netherlands",
    fundingAmount: 3500000,
    valuation: 17500000,
    valuationMultiple: 28,
    fundingDate: "2025-07-10",
    investors: ["Northzone", "Atomico"],
    source: mockSource,
  },
  {
    companyName: "PayFlow",
    sector: "Fintech",
    subSector: "Payments",
    stage: "SEED",
    geography: "France",
    fundingAmount: 5000000,
    valuation: 25000000,
    valuationMultiple: 22,
    fundingDate: "2025-06-15",
    investors: ["Index Ventures", "Ribbit Capital"],
    source: mockSource,
  },
  {
    companyName: "HealthSync",
    sector: "Healthtech",
    subSector: "Digital Health",
    stage: "SEED",
    geography: "Germany",
    fundingAmount: 2800000,
    valuation: 14000000,
    valuationMultiple: 24,
    fundingDate: "2025-09-01",
    investors: ["Heal Capital", "Cherry Ventures"],
    source: mockSource,
  },
  {
    companyName: "RetailAI",
    sector: "SaaS B2B",
    subSector: "Retail Tech",
    stage: "SEED",
    geography: "Spain",
    fundingAmount: 2200000,
    valuation: 11000000,
    valuationMultiple: 19,
    fundingDate: "2025-10-20",
    investors: ["Nauta Capital", "K Fund"],
    source: mockSource,
  },
];

// Mock benchmarks
const MOCK_BENCHMARKS = {
  "SaaS B2B": {
    SEED: {
      "ARR Growth YoY": { p25: 80, median: 120, p75: 200, unit: "%" },
      "Net Revenue Retention": { p25: 95, median: 110, p75: 130, unit: "%" },
      "CAC Payback": { p25: 18, median: 12, p75: 8, unit: "months" },
      "Burn Multiple": { p25: 2.5, median: 1.8, p75: 1.2, unit: "x" },
      "Valuation Multiple": { p25: 15, median: 22, p75: 30, unit: "x ARR" },
    },
  },
  "Fintech": {
    SEED: {
      "ARR Growth YoY": { p25: 100, median: 150, p75: 250, unit: "%" },
      "Net Revenue Retention": { p25: 100, median: 115, p75: 140, unit: "%" },
      "Valuation Multiple": { p25: 18, median: 25, p75: 35, unit: "x ARR" },
    },
  },
  "Healthtech": {
    SEED: {
      "ARR Growth YoY": { p25: 60, median: 100, p75: 150, unit: "%" },
      "Valuation Multiple": { p25: 12, median: 18, p75: 25, unit: "x ARR" },
    },
  },
};

// Mock competitors
const MOCK_COMPETITORS: Record<string, Competitor[]> = {
  "SaaS B2B": [
    {
      name: "Segment",
      description: "Customer data platform",
      website: "https://segment.com",
      totalFunding: 283000000,
      stage: "Acquired",
      positioning: "Enterprise CDP leader",
      overlap: "partial",
      source: mockSource,
    },
    {
      name: "Amplitude",
      description: "Product analytics platform",
      website: "https://amplitude.com",
      totalFunding: 336000000,
      stage: "Public",
      positioning: "Product analytics for growth teams",
      overlap: "adjacent",
      source: mockSource,
    },
  ],
  "Fintech": [
    {
      name: "Stripe",
      description: "Payment infrastructure",
      website: "https://stripe.com",
      totalFunding: 2200000000,
      stage: "Late",
      positioning: "Global payments leader",
      overlap: "partial",
      source: mockSource,
    },
  ],
};

export const mockConnector: Connector = {
  name: "Mock Data",
  type: "mock",

  isConfigured: () => true, // Always available

  searchSimilarDeals: async (query: ConnectorQuery): Promise<SimilarDeal[]> => {
    // Simulate API delay
    await new Promise((r) => setTimeout(r, 100));

    let results = [...MOCK_DEALS];

    // Filter by sector
    if (query.sector) {
      const sectorLower = query.sector.toLowerCase();
      results = results.filter(
        (d) =>
          d.sector.toLowerCase().includes(sectorLower) ||
          (d.subSector && d.subSector.toLowerCase().includes(sectorLower))
      );
    }

    // Filter by stage
    if (query.stage) {
      results = results.filter(
        (d) => d.stage.toUpperCase() === query.stage?.toUpperCase()
      );
    }

    // Filter by geography
    if (query.geography) {
      const geoLower = query.geography.toLowerCase();
      results = results.filter(
        (d) =>
          d.geography.toLowerCase().includes(geoLower) ||
          geoLower.includes("europe") // Include all European deals
      );
    }

    return results;
  },

  getMarketData: async (query: ConnectorQuery): Promise<MarketData> => {
    await new Promise((r) => setTimeout(r, 50));

    const sector = query.sector || "SaaS B2B";
    const stage = query.stage || "SEED";

    const sectorBenchmarks = MOCK_BENCHMARKS[sector as keyof typeof MOCK_BENCHMARKS];
    const stageBenchmarks = sectorBenchmarks?.[stage as keyof typeof sectorBenchmarks];

    const benchmarks = stageBenchmarks
      ? Object.entries(stageBenchmarks).map(([name, data]) => ({
          metricName: name,
          p25: data.p25,
          median: data.median,
          p75: data.p75,
          unit: data.unit,
          sector,
          stage,
          source: mockSource,
          lastUpdated: new Date().toISOString(),
        }))
      : [];

    return {
      marketSize: {
        tam: 50000000000,
        sam: 5000000000,
        som: 500000000,
        currency: "EUR",
        year: 2025,
        cagr: 15,
        source: mockSource,
      },
      benchmarks,
      trends: [
        {
          title: "AI Integration Accelerating",
          description: "Companies with AI features raising at 30% premium",
          impact: "positive",
          relevance: 0.8,
          source: mockSource,
          date: "2025-Q4",
        },
        {
          title: "Funding Cooling in Late Stage",
          description: "Series B+ valuations down 15% YoY",
          impact: "neutral",
          relevance: 0.6,
          source: mockSource,
          date: "2025-Q4",
        },
      ],
    };
  },

  getCompetitors: async (query: ConnectorQuery): Promise<Competitor[]> => {
    await new Promise((r) => setTimeout(r, 50));

    const sector = query.sector || "SaaS B2B";
    return MOCK_COMPETITORS[sector] || [];
  },

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    await new Promise((r) => setTimeout(r, 50));

    const companyName = query.companyName || "the company";
    const sector = query.sector || "tech";

    return [
      {
        title: `${sector} Sector Sees Strong Q4 Investment Activity`,
        description: `Venture capital investment in ${sector} reached record levels in Q4 2025, with seed deals up 20% year-over-year.`,
        url: "https://example.com/news/1",
        source: "TechCrunch",
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        sentiment: "positive",
        relevance: 0.7,
        category: "sector",
      },
      {
        title: `European Startups Attract Global Investors`,
        description: "US investors increasingly looking at European seed deals for better valuations.",
        url: "https://example.com/news/2",
        source: "Sifted",
        publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentiment: "positive",
        relevance: 0.6,
        category: "sector",
      },
      {
        title: `New Regulations Impact ${sector} Startups`,
        description: "EU Digital Services Act creating compliance challenges for early-stage companies.",
        url: "https://example.com/news/3",
        source: "Reuters",
        publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        sentiment: "negative",
        relevance: 0.5,
        category: "sector",
      },
    ];
  },

  getFounderBackground: async (
    founderName: string
  ): Promise<FounderBackground | null> => {
    await new Promise((r) => setTimeout(r, 50));

    // Return mock data for any founder
    return {
      name: founderName,
      role: "CEO & Co-founder",
      linkedinUrl: `https://linkedin.com/in/${founderName.toLowerCase().replace(" ", "-")}`,
      previousCompanies: [
        {
          company: "Google",
          role: "Senior Product Manager",
          startYear: 2018,
          endYear: 2022,
          verified: true,
        },
        {
          company: "McKinsey",
          role: "Associate",
          startYear: 2015,
          endYear: 2018,
          verified: true,
        },
      ],
      previousVentures: [
        {
          companyName: "PreviousStartup",
          outcome: "acquihire",
          exitValue: 5000000,
          exitYear: 2021,
          fundingRaised: 2000000,
        },
      ],
      education: [
        {
          institution: "HEC Paris",
          degree: "MBA",
          year: 2015,
        },
        {
          institution: "Ecole Polytechnique",
          degree: "MSc Engineering",
          year: 2013,
        },
      ],
      redFlags: [],
      investorConnections: ["Kima Ventures", "Founders Future", "Partech"],
      verificationStatus: "partial",
    };
  },
};
