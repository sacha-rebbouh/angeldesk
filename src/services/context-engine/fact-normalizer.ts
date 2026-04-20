import { getFactKeyDefinition } from "@/services/fact-store/fact-keys";
import type {
  DataReliability,
  ExtractedFact,
  ReliabilityClassification,
} from "@/services/fact-store/types";
import { RELIABILITY_WEIGHTS } from "@/services/fact-store/types";
import type {
  DataSource,
  DealContext,
  FounderBackground,
} from "./types";

type ContextFactInput = {
  dealIntelligence?: DealContext["dealIntelligence"];
  marketData?: DealContext["marketData"];
  peopleGraph?: DealContext["peopleGraph"];
  competitiveLandscape?: DealContext["competitiveLandscape"];
  newsSentiment?: DealContext["newsSentiment"];
  websiteContent?: {
    baseUrl?: string;
    companyName?: string;
    tagline?: string;
    pages?: unknown[];
    redFlags?: unknown[];
    crawlStats?: Record<string, unknown> & { crawledAt?: string };
    insights?: Record<string, unknown> & {
      integrations?: string[];
      teamSize?: number;
      clientCount?: number;
    };
  };
  contextQuality?: DealContext["contextQuality"];
  sourceHealth?: DealContext["sourceHealth"];
  sources?: DealContext["sources"];
  enrichedAt?: string;
  completeness?: number;
};

interface ContextFactOptions {
  corpusSnapshotId?: string | null;
}

function computeTruthConfidence(
  sourceConfidence: number,
  reliability: DataReliability
): number {
  return Math.max(
    0,
    Math.min(100, Math.round(sourceConfidence * RELIABILITY_WEIGHTS[reliability]))
  );
}

function buildReliability(
  reliability: DataReliability,
  reasoning: string,
  verificationMethod?: string
): ReliabilityClassification {
  return {
    reliability,
    reasoning,
    isProjection: reliability === "PROJECTED",
    verificationMethod,
  };
}

function createSourceMetadata(
  context: ContextFactInput,
  kind: string,
  primarySource?: DataSource | null,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    origin: "context-engine",
    kind,
    enrichedAt: context.enrichedAt ?? null,
    corpusSnapshotId: extra?.corpusSnapshotId ?? null,
    completeness: context.completeness ?? null,
    contextQuality: context.contextQuality
      ? {
          completeness: context.contextQuality.completeness,
          reliability: context.contextQuality.reliability,
          qualityScore: context.contextQuality.qualityScore,
          degraded: context.contextQuality.degraded,
        }
      : null,
    sourceHealth: context.sourceHealth
      ? {
          totalConfigured: context.sourceHealth.totalConfigured,
          successful: context.sourceHealth.successful,
          failed: context.sourceHealth.failed.map(({ name, severity }) => ({
            name,
            severity,
          })),
          unconfiguredCritical: context.sourceHealth.unconfiguredCritical.map(
            ({ name, severity }) => ({
              name,
              severity,
            })
          ),
        }
      : null,
    primarySource: primarySource ?? null,
    sources:
      context.sources?.map(({ name, type, url, retrievedAt, confidence }) => ({
        name,
        type,
        url,
        retrievedAt,
        confidence,
      })) ?? [],
    ...extra,
  };
}

function pushFact(
  facts: ExtractedFact[],
  factKey: string,
  value: unknown,
  displayValue: string,
  sourceConfidence: number,
  reliability: ReliabilityClassification,
  extractedText: string,
  sourceMetadata: Record<string, unknown>,
  extra?: Pick<ExtractedFact, "unit" | "validAt" | "periodType" | "periodLabel">
): void {
  const definition = getFactKeyDefinition(factKey);
  if (!definition) {
    return;
  }

  facts.push({
    factKey,
    category: definition.category,
    value,
    displayValue,
    unit: extra?.unit ?? definition.unit,
    source: "CONTEXT_ENGINE",
    sourceConfidence,
    truthConfidence: computeTruthConfidence(sourceConfidence, reliability.reliability),
    extractedText,
    sourceMetadata,
    validAt: extra?.validAt,
    periodType: extra?.periodType,
    periodLabel: extra?.periodLabel,
    reliability,
  });
}

function findFounderByRole(
  founders: FounderBackground[] | undefined,
  roleMatcher: RegExp
): FounderBackground | undefined {
  return founders?.find((founder) => roleMatcher.test(founder.role ?? ""));
}

function buildFounderBackground(founder: FounderBackground): string | undefined {
  const previousCompanies = founder.previousCompanies
    .map((company) => `${company.role} at ${company.company}`)
    .slice(0, 3);
  const education = founder.education
    .map((entry) => entry.institution)
    .slice(0, 2);
  const parts = [...previousCompanies, ...education].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function countPreviousExits(founder: FounderBackground): number {
  return founder.previousVentures.filter((venture) => venture.outcome === "exit").length;
}

function pickDominantString(
  values: Array<string | null | undefined>
): { value: string; count: number } | null {
  const counts = new Map<string, { value: string; count: number }>();

  for (const rawValue of values) {
    if (!rawValue) continue;
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, { value, count: 1 });
  }

  const ranked = [...counts.values()].sort((left, right) => right.count - left.count);
  return ranked[0] ?? null;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function buildMarketFacts(
  facts: ExtractedFact[],
  context: ContextFactInput,
  options: ContextFactOptions
): void {
  const marketSize = context.marketData?.marketSize;
  if (!marketSize) {
    return;
  }

  const sourceConfidence = Math.round(
    ((marketSize.source?.confidence ?? 0.8) * 0.7 +
      (context.contextQuality?.qualityScore ?? context.completeness ?? 0.5) * 0.3) *
      100
  );
  const reliability = buildReliability(
    "ESTIMATED",
    `Market sizing from ${marketSize.source?.name ?? "context-engine"} for ${marketSize.year}.`,
    marketSize.source?.name
  );
  const validAt =
    Number.isFinite(marketSize.year) && marketSize.year > 1900
      ? new Date(Date.UTC(marketSize.year, 11, 31))
      : undefined;
  const sourceMetadata = createSourceMetadata(
    context,
    "market-size",
    marketSize.source,
    {
      corpusSnapshotId: options.corpusSnapshotId ?? null,
      marketYear: marketSize.year,
      marketCurrency: marketSize.currency,
    }
  );

  if (marketSize.tam > 0) {
    pushFact(
      facts,
      "market.tam",
      marketSize.tam,
      formatCurrency(marketSize.tam, marketSize.currency),
      sourceConfidence,
      reliability,
      `External market sizing estimates TAM at ${formatCurrency(marketSize.tam, marketSize.currency)}.`,
      sourceMetadata,
      {
        unit: marketSize.currency,
        validAt,
        periodType: "YEAR",
        periodLabel: `FY${marketSize.year}`,
      }
    );
  }

  if (marketSize.sam > 0) {
    pushFact(
      facts,
      "market.sam",
      marketSize.sam,
      formatCurrency(marketSize.sam, marketSize.currency),
      sourceConfidence,
      reliability,
      `External market sizing estimates SAM at ${formatCurrency(marketSize.sam, marketSize.currency)}.`,
      sourceMetadata,
      {
        unit: marketSize.currency,
        validAt,
        periodType: "YEAR",
        periodLabel: `FY${marketSize.year}`,
      }
    );
  }

  if (marketSize.som > 0) {
    pushFact(
      facts,
      "market.som",
      marketSize.som,
      formatCurrency(marketSize.som, marketSize.currency),
      sourceConfidence,
      reliability,
      `External market sizing estimates SOM at ${formatCurrency(marketSize.som, marketSize.currency)}.`,
      sourceMetadata,
      {
        unit: marketSize.currency,
        validAt,
        periodType: "YEAR",
        periodLabel: `FY${marketSize.year}`,
      }
    );
  }

  if (marketSize.cagr > 0) {
    pushFact(
      facts,
      "market.cagr",
      marketSize.cagr,
      `${marketSize.cagr}%`,
      sourceConfidence,
      reliability,
      `External market sizing estimates CAGR at ${marketSize.cagr}%.`,
      sourceMetadata,
      {
        periodType: "YEAR",
        periodLabel: `FY${marketSize.year}`,
      }
    );
  }
}

function buildCompetitionFacts(
  facts: ExtractedFact[],
  context: ContextFactInput,
  options: ContextFactOptions
): void {
  const competitors = context.competitiveLandscape?.competitors ?? [];
  if (competitors.length === 0) {
    return;
  }

  const sourceConfidence = Math.round(
    (0.75 + (context.contextQuality?.categories.competitors.score ?? 0) * 0.15) * 100
  );
  const reliability = buildReliability(
    "DECLARED",
    `Competitive landscape inferred from ${competitors.length} external competitor records.`,
    "Context Engine competitive aggregation"
  );
  const mainCompetitor =
    competitors.find((competitor) => competitor.overlap === "direct") ?? competitors[0];
  const fundedCompetitors = competitors
    .filter(
      (competitor) =>
        typeof competitor.totalFunding === "number" ||
        typeof competitor.lastRoundAmount === "number"
    )
    .map((competitor) => ({
      name: competitor.name,
      totalFunding: competitor.totalFunding ?? null,
      lastRoundAmount: competitor.lastRoundAmount ?? null,
      lastRoundDate: competitor.lastRoundDate ?? null,
      stage: competitor.stage ?? null,
      overlap: competitor.overlap,
    }));
  const sourceMetadata = createSourceMetadata(
    context,
    "competitive-landscape",
    mainCompetitor?.source,
    {
      corpusSnapshotId: options.corpusSnapshotId ?? null,
      competitors: competitors.map((competitor) => ({
        name: competitor.name,
        overlap: competitor.overlap,
        website: competitor.website ?? null,
        source: competitor.source,
      })),
    }
  );

  pushFact(
    facts,
    "competition.competitors_count",
    competitors.length,
    String(competitors.length),
    sourceConfidence,
    reliability,
    `External context identified ${competitors.length} relevant competitors.`,
    sourceMetadata
  );

  pushFact(
    facts,
    "competition.competitors_list",
    competitors.map((competitor) => competitor.name),
    competitors.map((competitor) => competitor.name).join(", "),
    sourceConfidence,
    reliability,
    `External context identified competitors: ${competitors.map((competitor) => competitor.name).join(", ")}.`,
    sourceMetadata
  );

  if (mainCompetitor) {
    pushFact(
      facts,
      "competition.main_competitor",
      mainCompetitor.name,
      mainCompetitor.name,
      sourceConfidence,
      reliability,
      `Primary competitor inferred as ${mainCompetitor.name}.`,
      sourceMetadata
    );
  }

  if (fundedCompetitors.length > 0) {
    pushFact(
      facts,
      "competition.competitors_funded",
      fundedCompetitors,
      fundedCompetitors.map((competitor) => competitor.name).join(", "),
      sourceConfidence,
      reliability,
      `Funded competitors identified: ${fundedCompetitors.map((competitor) => competitor.name).join(", ")}.`,
      sourceMetadata
    );
  }

  const differentiation = (context.competitiveLandscape?.competitiveAdvantages ?? [])
    .map((advantage) => advantage.trim())
    .filter((advantage) => advantage.length > 0);
  if (differentiation.length > 0) {
    const summary = differentiation.slice(0, 3).join(" | ");
    pushFact(
      facts,
      "competition.differentiation",
      summary,
      summary,
      sourceConfidence,
      reliability,
      `External competitive landscape highlights differentiation points: ${summary}.`,
      sourceMetadata
    );
  }

  const riskText = (context.competitiveLandscape?.competitiveRisks ?? [])
    .map((risk) => risk.toLowerCase())
    .join(" ");
  if (riskText) {
    let bigTechThreat: "none" | "low" | "medium" | "high" | "critical" = "low";

    if (/\b(google|microsoft|amazon|aws|meta|facebook|apple|openai|salesforce|oracle|sap)\b/.test(riskText)) {
      bigTechThreat = /\b(dominate|crush|commoditi[sz]e|existential|platform risk|displace)\b/.test(riskText)
        ? "high"
        : "medium";
    } else if (/\b(no big tech|limited platform threat|fragmented market)\b/.test(riskText)) {
      bigTechThreat = "none";
    }

    pushFact(
      facts,
      "competition.big_tech_threat",
      bigTechThreat,
      bigTechThreat,
      sourceConfidence,
      reliability,
      `External competitive risks assess big-tech threat as ${bigTechThreat}.`,
      sourceMetadata
    );
  }
}

function buildDealIntelligenceFacts(
  facts: ExtractedFact[],
  context: ContextFactInput,
  options: ContextFactOptions
): void {
  const dealIntelligence = context.dealIntelligence;
  if (!dealIntelligence) {
    return;
  }

  const similarDeals = dealIntelligence.similarDeals ?? [];
  const fundingContext = dealIntelligence.fundingContext;
  const sourceConfidence = Math.round(
    (0.72 + (context.contextQuality?.categories.similarDeals.score ?? 0) * 0.18) * 100
  );
  const reliability = buildReliability(
    "ESTIMATED",
    `Deal intelligence synthesized from ${similarDeals.length} similar deal records and funding context.`,
    "Context Engine similar deal aggregation"
  );
  const sourceMetadata = createSourceMetadata(
    context,
    "deal-intelligence",
    similarDeals[0]?.source ?? null,
    {
      corpusSnapshotId: options.corpusSnapshotId ?? null,
      percentileRank: dealIntelligence.percentileRank,
      valuationVerdict: dealIntelligence.verdict,
      fundingContext,
      similarDeals: similarDeals.map((deal) => ({
        companyName: deal.companyName,
        sector: deal.sector,
        stage: deal.stage,
        geography: deal.geography,
        fundingAmount: deal.fundingAmount,
        valuationMultiple: deal.valuationMultiple ?? null,
        fundingDate: deal.fundingDate,
        source: deal.source,
      })),
    }
  );

  const dominantSector = pickDominantString(similarDeals.map((deal) => deal.sector));
  if (dominantSector) {
    pushFact(
      facts,
      "other.sector",
      dominantSector.value,
      dominantSector.value,
      sourceConfidence,
      reliability,
      `External similar-deal set most frequently maps the company to sector ${dominantSector.value}.`,
      sourceMetadata
    );
  }

  const dominantGeography = pickDominantString(similarDeals.map((deal) => deal.geography));
  if (dominantGeography) {
    pushFact(
      facts,
      "market.geography_primary",
      dominantGeography.value,
      dominantGeography.value,
      sourceConfidence,
      reliability,
      `External similar deals are most concentrated in ${dominantGeography.value}.`,
      sourceMetadata
    );
  }

  const timingParts = [
    fundingContext
      ? `Funding market is ${fundingContext.trend} over ${fundingContext.period} (${fundingContext.totalDealsInPeriod} comparable deals, ${fundingContext.trendPercentage >= 0 ? "+" : ""}${fundingContext.trendPercentage}%).`
      : null,
    context.newsSentiment
      ? `News sentiment is ${context.newsSentiment.overallSentiment} (${context.newsSentiment.articles.length} relevant articles).`
      : null,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);

  if (timingParts.length > 0) {
    pushFact(
      facts,
      "market.timing_assessment",
      timingParts.join(" "),
      timingParts.join(" "),
      sourceConfidence,
      reliability,
      timingParts.join(" "),
      sourceMetadata
    );
  }
}

function buildPeopleFacts(
  facts: ExtractedFact[],
  context: ContextFactInput,
  options: ContextFactOptions
): void {
  const founders = context.peopleGraph?.founders ?? [];
  if (founders.length === 0) {
    return;
  }

  const foundersCount = founders.length;
  const ceo = findFounderByRole(founders, /\bceo\b|chief executive/i);
  const cto = findFounderByRole(founders, /\bcto\b|chief technology/i);
  const primaryFounder = ceo ?? founders[0];
  const founderVerification = primaryFounder?.verificationStatus ?? "partial";
  const reliabilityLevel: DataReliability =
    founderVerification === "verified"
      ? "VERIFIED"
      : founderVerification === "partial"
        ? "DECLARED"
        : "UNVERIFIABLE";
  const sourceConfidence =
    founderVerification === "verified"
      ? 92
      : founderVerification === "partial"
        ? 82
        : 68;
  const sourceMetadata = createSourceMetadata(
    context,
    "people-graph",
    null,
    {
      corpusSnapshotId: options.corpusSnapshotId ?? null,
      founders: founders.map((founder) => ({
        name: founder.name,
        role: founder.role,
        linkedinUrl: founder.linkedinUrl ?? null,
        verificationStatus: founder.verificationStatus,
      })),
    }
  );
  const reliability = buildReliability(
    reliabilityLevel,
    `Founder data sourced from Context Engine people graph (${foundersCount} founders).`,
    "LinkedIn / external founder graph"
  );

  if (
    typeof context.peopleGraph?.teamSize === "number" &&
    context.peopleGraph.teamSize > 0 &&
    typeof context.websiteContent?.insights?.teamSize !== "number"
  ) {
    pushFact(
      facts,
      "team.size",
      context.peopleGraph.teamSize,
      String(context.peopleGraph.teamSize),
      sourceConfidence,
      reliability,
      `Context Engine people graph estimates team size at ${context.peopleGraph.teamSize}.`,
      sourceMetadata
    );
  }

  pushFact(
    facts,
    "team.founders_count",
    foundersCount,
    String(foundersCount),
    sourceConfidence,
    reliability,
    `Context Engine identified ${foundersCount} founders.`,
    sourceMetadata
  );

  if (ceo) {
    pushFact(
      facts,
      "team.ceo.name",
      ceo.name,
      ceo.name,
      sourceConfidence,
      reliability,
      `CEO identified as ${ceo.name}.`,
      sourceMetadata
    );

    if (ceo.linkedinUrl) {
      pushFact(
        facts,
        "team.ceo.linkedin",
        ceo.linkedinUrl,
        ceo.linkedinUrl,
        sourceConfidence,
        reliability,
        `CEO LinkedIn profile identified for ${ceo.name}.`,
        sourceMetadata
      );
    }

    const background = buildFounderBackground(ceo);
    if (background) {
      pushFact(
        facts,
        "team.ceo.background",
        background,
        background,
        sourceConfidence,
        reliability,
        `CEO background synthesized from previous roles and education for ${ceo.name}.`,
        sourceMetadata
      );
    }

    const previousExits = countPreviousExits(ceo);
    if (previousExits > 0) {
      pushFact(
        facts,
        "team.ceo.previous_exits",
        previousExits,
        String(previousExits),
        sourceConfidence,
        reliability,
        `CEO ${ceo.name} has ${previousExits} prior exit(s) in external founder history.`,
        sourceMetadata
      );
    }
  }

  if (cto) {
    pushFact(
      facts,
      "team.cto.name",
      cto.name,
      cto.name,
      sourceConfidence,
      reliability,
      `CTO identified as ${cto.name}.`,
      sourceMetadata
    );

    if (cto.linkedinUrl) {
      pushFact(
        facts,
        "team.cto.linkedin",
        cto.linkedinUrl,
        cto.linkedinUrl,
        sourceConfidence,
        reliability,
        `CTO LinkedIn profile identified for ${cto.name}.`,
        sourceMetadata
      );
    }

    const background = buildFounderBackground(cto);
    if (background) {
      pushFact(
        facts,
        "team.cto.background",
        background,
        background,
        sourceConfidence,
        reliability,
        `CTO background synthesized from previous roles and education for ${cto.name}.`,
        sourceMetadata
      );
    }
  }
}

function buildWebsiteFacts(
  facts: ExtractedFact[],
  context: ContextFactInput,
  options: ContextFactOptions
): void {
  const website = context.websiteContent;
  if (!website?.baseUrl) {
    return;
  }

  const sourceConfidence = 92;
  const reliability = buildReliability(
    "DECLARED",
    "Website crawler captured first-party company claims from the public site.",
    "Website crawler"
  );
  const sourceMetadata = createSourceMetadata(
    context,
    "website",
    {
      type: "web_search",
      name: "Website Crawler",
      url: website.baseUrl,
      retrievedAt: website.crawlStats?.crawledAt ?? context.enrichedAt ?? new Date().toISOString(),
      confidence: 0.92,
    },
    {
      corpusSnapshotId: options.corpusSnapshotId ?? null,
      crawlStats: website.crawlStats ?? null,
    }
  );

  pushFact(
    facts,
    "other.website",
    website.baseUrl,
    website.baseUrl,
    100,
    buildReliability("VERIFIED", "Canonical website URL captured directly from crawl target.", "Website crawler"),
    `Website crawler resolved canonical website ${website.baseUrl}.`,
    sourceMetadata
  );

  if (website.companyName) {
    pushFact(
      facts,
      "company.name",
      website.companyName,
      website.companyName,
      95,
      buildReliability("VERIFIED", "Company name captured directly from public website.", "Website crawler"),
      `Website crawler identified company name ${website.companyName}.`,
      sourceMetadata
    );
  }

  if (website.tagline) {
    pushFact(
      facts,
      "product.tagline",
      website.tagline,
      website.tagline,
      sourceConfidence,
      reliability,
      `Website tagline captured as: ${website.tagline}.`,
      sourceMetadata
    );
  }

  const insights = website.insights;
  if (!insights) {
    return;
  }

  const integrations = insights.integrations ?? [];
  if (integrations.length > 0) {
    pushFact(
      facts,
      "product.integration_count",
      integrations.length,
      String(integrations.length),
      sourceConfidence,
      reliability,
      `Website lists ${integrations.length} integrations.`,
      sourceMetadata
    );
  }

  if (typeof insights.teamSize === "number" && insights.teamSize > 0) {
    pushFact(
      facts,
      "team.size",
      insights.teamSize,
      String(insights.teamSize),
      85,
      reliability,
      `Website indicates a team size of ${insights.teamSize}.`,
      sourceMetadata
    );
  }

  if (typeof insights.clientCount === "number" && insights.clientCount > 0) {
    pushFact(
      facts,
      "traction.customers_count",
      insights.clientCount,
      String(insights.clientCount),
      80,
      reliability,
      `Website signals ${insights.clientCount} referenced customers/clients.`,
      sourceMetadata
    );
  }
}

export function extractFactsFromDealContext(
  context: ContextFactInput | undefined,
  options: ContextFactOptions = {}
): ExtractedFact[] {
  if (!context) {
    return [];
  }

  const facts: ExtractedFact[] = [];

  buildWebsiteFacts(facts, context, options);
  buildDealIntelligenceFacts(facts, context, options);
  buildPeopleFacts(facts, context, options);
  buildMarketFacts(facts, context, options);
  buildCompetitionFacts(facts, context, options);

  return facts;
}
