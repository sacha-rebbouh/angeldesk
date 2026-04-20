import type { Deal } from "@prisma/client";
import type { AgentResult, ExtractedDealInfo } from "../types";
import type { CurrentFact } from "@/services/fact-store/types";

type RuntimeExtractedDealInfo = Partial<
  Pick<
    ExtractedDealInfo,
    | "companyName"
    | "tagline"
    | "sector"
    | "stage"
    | "instrument"
    | "geography"
    | "websiteUrl"
    | "arr"
    | "growthRateYoY"
    | "amountRaising"
    | "valuationPre"
    | "productDescription"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getCurrentFact(
  facts: CurrentFact[] | undefined,
  factKey: string
): CurrentFact | null {
  return facts?.find((candidate) => candidate.factKey === factKey) ?? null;
}

function getCurrentFactString(
  facts: CurrentFact[] | undefined,
  factKey: string
): string | null {
  const fact = getCurrentFact(facts, factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string" && fact.currentValue.trim().length > 0) {
    return fact.currentValue;
  }
  if (
    typeof fact.currentDisplayValue === "string" &&
    fact.currentDisplayValue.trim().length > 0
  ) {
    return fact.currentDisplayValue;
  }
  return null;
}

function getCurrentFactNumber(
  facts: CurrentFact[] | undefined,
  factKey: string
): number | null {
  const fact = getCurrentFact(facts, factKey);
  if (!fact) return null;
  return asFiniteNumber(fact.currentValue);
}

function pickFirstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const stringValue = asNonEmptyString(value);
    if (stringValue) return stringValue;
  }
  return null;
}

function pickFirstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    const numberValue = asFiniteNumber(value);
    if (numberValue != null) return numberValue;
  }
  return null;
}

export function extractRuntimeDealInfo(
  previousResults?: Record<string, AgentResult>,
  extractedData?: RuntimeExtractedDealInfo | null
): RuntimeExtractedDealInfo | null {
  const extractorResult = previousResults?.["document-extractor"];
  const rawExtractorData =
    extractorResult?.success && "data" in extractorResult
      ? (extractorResult as AgentResult & { data?: unknown }).data
      : null;
  const extractorData = isRecord(rawExtractorData) ? rawExtractorData : null;
  const extractedInfo = isRecord(extractorData?.extractedInfo)
    ? extractorData.extractedInfo
    : extractorData;

  const merged: RuntimeExtractedDealInfo = {
    companyName: pickFirstString(extractedInfo?.companyName, extractedData?.companyName) ?? undefined,
    tagline: pickFirstString(extractedInfo?.tagline, extractedData?.tagline) ?? undefined,
    sector: pickFirstString(extractedInfo?.sector, extractedData?.sector) ?? undefined,
    stage: pickFirstString(extractedInfo?.stage, extractedData?.stage) ?? undefined,
    instrument: pickFirstString(extractedInfo?.instrument, extractedData?.instrument) ?? undefined,
    geography: pickFirstString(extractedInfo?.geography, extractedData?.geography) ?? undefined,
    websiteUrl: pickFirstString(extractedInfo?.websiteUrl, extractedData?.websiteUrl) ?? undefined,
    arr: pickFirstNumber(extractedInfo?.arr, extractedData?.arr) ?? undefined,
    growthRateYoY:
      pickFirstNumber(extractedInfo?.growthRateYoY, extractedData?.growthRateYoY) ?? undefined,
    amountRaising:
      pickFirstNumber(extractedInfo?.amountRaising, extractedData?.amountRaising) ?? undefined,
    valuationPre:
      pickFirstNumber(extractedInfo?.valuationPre, extractedData?.valuationPre) ?? undefined,
    productDescription:
      pickFirstString(extractedInfo?.productDescription, extractedData?.productDescription) ??
      undefined,
  };

  return Object.values(merged).some((value) => value != null) ? merged : null;
}

export function buildCanonicalRuntimeDeal<T extends Deal>(
  deal: T,
  options?: {
    factStore?: CurrentFact[];
    previousResults?: Record<string, AgentResult>;
    extractedData?: RuntimeExtractedDealInfo | null;
  }
): T {
  const factStore = options?.factStore;
  const extractedInfo = extractRuntimeDealInfo(
    options?.previousResults,
    options?.extractedData
  );

  const companyName =
    pickFirstString(
      getCurrentFactString(factStore, "company.name"),
      extractedInfo?.companyName,
      deal.companyName,
      deal.name
    ) ?? deal.name;
  const sector =
    pickFirstString(
      getCurrentFactString(factStore, "other.sector"),
      extractedInfo?.sector,
      deal.sector
    ) ?? null;
  const stage =
    pickFirstString(
      getCurrentFactString(factStore, "product.stage"),
      extractedInfo?.stage,
      deal.stage
    ) ?? null;
  const instrument =
    pickFirstString(
      extractedInfo?.instrument,
      deal.instrument
    ) ?? null;
  const geography =
    pickFirstString(
      getCurrentFactString(factStore, "market.geography_primary"),
      extractedInfo?.geography,
      deal.geography
    ) ?? null;
  const website =
    pickFirstString(
      getCurrentFactString(factStore, "other.website"),
      extractedInfo?.websiteUrl,
      deal.website
    ) ?? null;
  const description =
    pickFirstString(
      getCurrentFactString(factStore, "product.tagline"),
      extractedInfo?.tagline,
      extractedInfo?.productDescription,
      deal.description
    ) ?? null;
  const arr =
    pickFirstNumber(
      getCurrentFactNumber(factStore, "financial.arr"),
      extractedInfo?.arr,
      deal.arr
    ) ?? null;
  const growthRate =
    pickFirstNumber(
      getCurrentFactNumber(factStore, "financial.revenue_growth_yoy"),
      extractedInfo?.growthRateYoY,
      deal.growthRate
    ) ?? null;
  const amountRequested =
    pickFirstNumber(
      getCurrentFactNumber(factStore, "financial.amount_raising"),
      extractedInfo?.amountRaising,
      deal.amountRequested
    ) ?? null;
  const valuationPre =
    pickFirstNumber(
      getCurrentFactNumber(factStore, "financial.valuation_pre"),
      extractedInfo?.valuationPre,
      deal.valuationPre
    ) ?? null;

  return {
    ...deal,
    companyName,
    sector,
    stage,
    instrument,
    geography,
    website,
    description,
    arr,
    growthRate,
    amountRequested,
    valuationPre,
  };
}
