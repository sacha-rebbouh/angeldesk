import { getFactKeyDefinition } from "@/services/fact-store/fact-keys";
import type { CurrentFact, DataReliability, PeriodType } from "@/services/fact-store/types";

const THESIS_DIRECT_FACT_KEYS = [
  "company.name",
  "financial.arr",
  "financial.mrr",
  "financial.revenue",
  "financial.revenue_growth_yoy",
  "financial.revenue_growth_mom",
  "financial.burn_rate",
  "financial.runway_months",
  "financial.gross_margin",
  "financial.net_margin",
  "financial.ebitda",
  "financial.cash_position",
  "financial.debt",
  "financial.valuation_pre",
  "financial.valuation_post",
  "financial.valuation_multiple",
  "financial.amount_raised_total",
  "financial.amount_raising",
  "financial.dilution_current_round",
  "traction.nrr",
  "traction.grr",
  "traction.cac",
  "traction.ltv",
  "traction.ltv_cac_ratio",
  "traction.payback_months",
  "traction.customers_count",
  "traction.users_count",
  "traction.dau",
  "traction.mau",
  "traction.conversion_rate",
  "traction.arpu",
  "traction.arppu",
  "market.tam",
  "market.sam",
  "market.som",
  "market.cagr",
  "market.geography_primary",
  "market.b2b_or_b2c",
  "product.stage",
  "competition.competitors_count",
  "team.size",
  "team.founders_count",
  "team.ceo.name",
] as const;

type ThesisDirectFactKey = (typeof THESIS_DIRECT_FACT_KEYS)[number];

export interface ThesisScopedFact {
  factKey: ThesisDirectFactKey;
  label: string;
  value: unknown;
  displayValue: string;
  unit?: string;
  source: CurrentFact["currentSource"];
  sourceDocumentId?: string;
  periodType?: PeriodType;
  periodLabel?: string;
  reliability?: DataReliability;
  isProjection: boolean;
  evidence?: string;
}

export interface ThesisDerivedMetric {
  key: "ebitda_margin";
  label: string;
  value: number;
  displayValue: string;
  numeratorFactKey: "financial.ebitda";
  denominatorFactKey: "financial.revenue";
  periodType: PeriodType;
  periodLabel: string;
  currency: string;
}

export interface ThesisFactScope {
  facts: ThesisScopedFact[];
  factsByKey: Map<string, ThesisScopedFact>;
  derivedMetrics: ThesisDerivedMetric[];
  derivedMetricsByKey: Map<string, ThesisDerivedMetric>;
}

function toCurrencyCode(fact: CurrentFact): string | null {
  const unitUpper = fact.currentUnit?.toUpperCase() ?? "";
  const displayUpper = fact.currentDisplayValue.toUpperCase();

  if (unitUpper.includes("EUR") || /[€]|\bEUR\b/.test(displayUpper)) return "EUR";
  if (unitUpper.includes("USD") || /[$]|\bUSD\b/.test(displayUpper)) return "USD";
  if (unitUpper.includes("NOK") || /\bNOK\b/.test(displayUpper)) return "NOK";
  if (unitUpper.includes("GBP") || /£|\bGBP\b/.test(displayUpper)) return "GBP";

  return null;
}

function getPeriodSignature(fact: CurrentFact): { periodType: PeriodType; periodLabel: string } | null {
  if (fact.periodType && fact.periodLabel) {
    return {
      periodType: fact.periodType,
      periodLabel: fact.periodLabel,
    };
  }

  if (fact.validAt && fact.periodType) {
    return {
      periodType: fact.periodType,
      periodLabel: fact.validAt.toISOString().slice(0, 10),
    };
  }

  return null;
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildScopedFact(fact: CurrentFact): ThesisScopedFact | null {
  if (!THESIS_DIRECT_FACT_KEYS.includes(fact.factKey as ThesisDirectFactKey)) {
    return null;
  }

  const definition = getFactKeyDefinition(fact.factKey);
  return {
    factKey: fact.factKey as ThesisDirectFactKey,
    label: definition?.description ?? fact.factKey,
    value: fact.currentValue,
    displayValue: fact.currentDisplayValue,
    unit: fact.currentUnit,
    source: fact.currentSource,
    sourceDocumentId: fact.currentSourceDocumentId,
    periodType: fact.periodType,
    periodLabel: fact.periodLabel,
    reliability: fact.reliability?.reliability,
    isProjection: fact.reliability?.isProjection === true,
    evidence: fact.currentExtractedText,
  };
}

function buildEbitdaMarginMetric(
  factsByKey: Map<string, CurrentFact>
): ThesisDerivedMetric | null {
  const ebitda = factsByKey.get("financial.ebitda");
  const revenue = factsByKey.get("financial.revenue");

  if (!ebitda || !revenue) {
    return null;
  }

  const ebitdaValue = toNumericValue(ebitda.currentValue);
  const revenueValue = toNumericValue(revenue.currentValue);
  if (ebitdaValue == null || revenueValue == null || revenueValue <= 0) {
    return null;
  }

  if (ebitda.reliability?.isProjection || revenue.reliability?.isProjection) {
    return null;
  }

  const ebitdaPeriod = getPeriodSignature(ebitda);
  const revenuePeriod = getPeriodSignature(revenue);
  if (!ebitdaPeriod || !revenuePeriod) {
    return null;
  }

  if (
    ebitdaPeriod.periodType !== revenuePeriod.periodType ||
    ebitdaPeriod.periodLabel !== revenuePeriod.periodLabel
  ) {
    return null;
  }

  const ebitdaCurrency = toCurrencyCode(ebitda);
  const revenueCurrency = toCurrencyCode(revenue);
  if (!ebitdaCurrency || !revenueCurrency || ebitdaCurrency !== revenueCurrency) {
    return null;
  }

  const value = (ebitdaValue / revenueValue) * 100;
  if (!Number.isFinite(value) || value < -100 || value > 100) {
    return null;
  }

  return {
    key: "ebitda_margin",
    label: "EBITDA margin",
    value,
    displayValue: `${value.toFixed(1)}%`,
    numeratorFactKey: "financial.ebitda",
    denominatorFactKey: "financial.revenue",
    periodType: ebitdaPeriod.periodType,
    periodLabel: ebitdaPeriod.periodLabel,
    currency: ebitdaCurrency,
  };
}

export function buildThesisFactScope(facts: CurrentFact[]): ThesisFactScope {
  const currentFactsByKey = new Map(facts.map((fact) => [fact.factKey, fact]));
  const scopedFacts = facts
    .map(buildScopedFact)
    .filter((fact): fact is ThesisScopedFact => fact !== null)
    .sort((a, b) => a.factKey.localeCompare(b.factKey));

  const factsByKey = new Map(scopedFacts.map((fact) => [fact.factKey, fact]));
  const derivedMetrics = [buildEbitdaMarginMetric(currentFactsByKey)]
    .filter((metric): metric is ThesisDerivedMetric => metric !== null);
  const derivedMetricsByKey = new Map(derivedMetrics.map((metric) => [metric.key, metric]));

  return {
    facts: scopedFacts,
    factsByKey,
    derivedMetrics,
    derivedMetricsByKey,
  };
}

export function formatThesisFactScope(scope: ThesisFactScope): string {
  const payload = {
    facts: scope.facts.map((fact) => ({
      factKey: fact.factKey,
      label: fact.label,
      displayValue: fact.displayValue,
      unit: fact.unit ?? null,
      periodType: fact.periodType ?? null,
      periodLabel: fact.periodLabel ?? null,
      source: fact.source,
      reliability: fact.reliability ?? null,
      isProjection: fact.isProjection,
      sourceDocumentId: fact.sourceDocumentId ?? null,
      evidence: fact.evidence ?? null,
    })),
    precomputedMetrics: scope.derivedMetrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      displayValue: metric.displayValue,
      periodType: metric.periodType,
      periodLabel: metric.periodLabel,
      currency: metric.currency,
      numeratorFactKey: metric.numeratorFactKey,
      denominatorFactKey: metric.denominatorFactKey,
    })),
  };

  return JSON.stringify(payload, null, 2);
}
