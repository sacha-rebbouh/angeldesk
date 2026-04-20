import { describe, expect, it } from "vitest";
import { extractFactsFromDealContext } from "../fact-normalizer";

describe("extractFactsFromDealContext", () => {
  it("normalizes website, people, market, and competition signals into canonical facts", () => {
    const facts = extractFactsFromDealContext(
      {
        enrichedAt: "2026-04-19T12:00:00.000Z",
        completeness: 0.82,
        contextQuality: {
          completeness: 0.82,
          reliability: 0.74,
          qualityScore: 0.61,
          degraded: false,
          degradationReasons: [],
          categories: {
            similarDeals: { score: 0.6, count: 3, weight: 0.35 },
            marketData: { score: 0.8, available: true, weight: 0.25 },
            competitors: { score: 0.7, count: 4, weight: 0.25 },
            news: { score: 0.5, count: 2, weight: 0.15 },
          },
        },
        sourceHealth: {
          totalConfigured: 6,
          successful: 4,
          failed: [],
          unconfiguredCritical: [],
        },
        sources: [
          {
            type: "database",
            name: "Funding DB",
            retrievedAt: "2026-04-19T11:59:00.000Z",
            confidence: 0.9,
          },
        ],
        websiteContent: {
          baseUrl: "https://acme.example",
          companyName: "Acme",
          tagline: "The modern workflow OS",
          pages: [],
          insights: {
            productDescription: "Workflow automation platform",
            features: ["automation"],
            integrations: ["Slack", "HubSpot"],
            hasFreeTier: false,
            hasPricing: true,
            pricingModel: "subscription",
            teamSize: 24,
            teamMembers: [],
            clientCount: 150,
            clients: ["Foo Corp"],
            testimonials: [],
            openPositions: 3,
            hiringDepartments: ["Engineering"],
            hasDocumentation: true,
            hasAPI: true,
          },
          crawlStats: {
            totalPages: 12,
            successfulPages: 12,
            failedPages: 0,
            totalWordCount: 12000,
            crawlDurationMs: 8500,
            crawledAt: "2026-04-19T11:58:00.000Z",
          },
          redFlags: [],
        },
        peopleGraph: {
          teamSize: 26,
          founders: [
            {
              name: "Alice Martin",
              role: "CEO",
              linkedinUrl: "https://linkedin.com/in/alice",
              previousCompanies: [{ company: "Stripe", role: "PM", verified: true }],
              previousVentures: [{ companyName: "PrevCo", outcome: "exit" }],
              education: [{ institution: "HEC" }],
              redFlags: [],
              investorConnections: [],
              verificationStatus: "verified",
            },
            {
              name: "Bob Leroy",
              role: "CTO",
              linkedinUrl: "https://linkedin.com/in/bob",
              previousCompanies: [{ company: "Datadog", role: "Engineer", verified: true }],
              previousVentures: [],
              education: [{ institution: "EPFL" }],
              redFlags: [],
              investorConnections: [],
              verificationStatus: "verified",
            },
          ],
        },
        dealIntelligence: {
          similarDeals: [
            {
              companyName: "Acme Peer 1",
              sector: "Workflow SaaS",
              stage: "Series A",
              geography: "France",
              fundingAmount: 4_000_000,
              fundingDate: "2026-01-10",
              investors: ["SeedX"],
              source: {
                type: "database",
                name: "Funding DB",
                retrievedAt: "2026-04-19T11:55:00.000Z",
                confidence: 0.86,
              },
            },
            {
              companyName: "Acme Peer 2",
              sector: "Workflow SaaS",
              stage: "Seed",
              geography: "France",
              fundingAmount: 2_500_000,
              fundingDate: "2025-11-02",
              investors: ["North"],
              source: {
                type: "database",
                name: "Funding DB",
                retrievedAt: "2026-04-19T11:55:00.000Z",
                confidence: 0.86,
              },
            },
          ],
          fundingContext: {
            totalDealsInPeriod: 12,
            medianValuationMultiple: 11,
            p25ValuationMultiple: 8,
            p75ValuationMultiple: 15,
            trend: "heating",
            trendPercentage: 14,
            downRoundCount: 1,
            period: "Last 12 months",
          },
          percentileRank: 61,
          fairValueRange: {
            low: 3_000_000,
            high: 5_000_000,
            currency: "EUR",
          },
          verdict: "fair",
        },
        marketData: {
          marketSize: {
            tam: 1000000000,
            sam: 250000000,
            som: 50000000,
            currency: "USD",
            year: 2026,
            cagr: 28,
            source: {
              type: "database",
              name: "Market DB",
              retrievedAt: "2026-04-19T11:57:00.000Z",
              confidence: 0.82,
            },
          },
          benchmarks: [],
          trends: [],
        },
        newsSentiment: {
          articles: [
            {
              title: "Acme expands in Europe",
              description: "Expansion momentum",
              url: "https://news.example/acme",
              source: "News",
              publishedAt: "2026-04-18T00:00:00.000Z",
              sentiment: "positive",
              relevance: 0.9,
              category: "company",
            },
          ],
          overallSentiment: "positive",
          sentimentScore: 0.7,
          keyTopics: ["expansion"],
        },
        competitiveLandscape: {
          competitors: [
            {
              name: "Rival One",
              overlap: "direct",
              positioning: "Workflow automation",
              source: {
                type: "web_search",
                name: "Web Search",
                retrievedAt: "2026-04-19T11:56:00.000Z",
                confidence: 0.78,
              },
              totalFunding: 20000000,
              stage: "Series A",
            },
            {
              name: "Rival Two",
              overlap: "partial",
              positioning: "Ops tooling",
              source: {
                type: "web_search",
                name: "Web Search",
                retrievedAt: "2026-04-19T11:56:00.000Z",
                confidence: 0.78,
              },
            },
          ],
          marketConcentration: "moderate",
          competitiveAdvantages: ["Faster onboarding", "Deeper workflow automation"],
          competitiveRisks: ["Microsoft could bundle adjacent workflow tooling"],
        },
      },
      { corpusSnapshotId: "snap_123" }
    );

    const byKey = new Map(facts.map((fact) => [fact.factKey, fact]));

    expect(byKey.get("other.website")?.value).toBe("https://acme.example");
    expect(byKey.get("company.name")?.value).toBe("Acme");
    expect(byKey.get("product.tagline")?.value).toBe("The modern workflow OS");
    expect(byKey.get("product.integration_count")?.value).toBe(2);
    expect(byKey.get("team.founders_count")?.value).toBe(2);
    expect(byKey.get("team.ceo.linkedin")?.value).toBe("https://linkedin.com/in/alice");
    expect(byKey.get("team.ceo.previous_exits")?.value).toBe(1);
    expect(byKey.get("market.tam")?.value).toBe(1000000000);
    expect(byKey.get("competition.main_competitor")?.value).toBe("Rival One");
    expect(byKey.get("competition.competitors_count")?.value).toBe(2);
    expect(String(byKey.get("competition.differentiation")?.value)).toContain("Faster onboarding");
    expect(byKey.get("competition.big_tech_threat")?.value).toBe("medium");
    expect(byKey.get("traction.customers_count")?.value).toBe(150);
    expect(byKey.get("other.sector")?.value).toBe("Workflow SaaS");
    expect(byKey.get("market.geography_primary")?.value).toBe("France");
    expect(String(byKey.get("market.timing_assessment")?.value)).toContain("Funding market is heating");

    const marketFact = byKey.get("market.tam");
    expect(marketFact?.source).toBe("CONTEXT_ENGINE");
    expect(marketFact?.truthConfidence).toBeGreaterThan(0);
    expect(marketFact?.reliability?.reliability).toBe("ESTIMATED");
    expect(marketFact?.sourceMetadata?.origin).toBe("context-engine");
    expect(marketFact?.sourceMetadata?.corpusSnapshotId).toBe("snap_123");
  });

  it("returns an empty list when no context is available", () => {
    expect(extractFactsFromDealContext(undefined)).toEqual([]);
  });

  it("falls back to people-graph team size when website insights do not expose one", () => {
    const facts = extractFactsFromDealContext({
      enrichedAt: "2026-04-19T12:00:00.000Z",
      completeness: 0.4,
      peopleGraph: {
        teamSize: 11,
        founders: [
          {
            name: "Alice",
            role: "CEO",
            previousCompanies: [],
            previousVentures: [],
            education: [],
            redFlags: [],
            investorConnections: [],
            verificationStatus: "partial",
          },
        ],
      },
    });

    const teamSizeFact = facts.find((fact) => fact.factKey === "team.size");
    expect(teamSizeFact?.value).toBe(11);
  });
});
