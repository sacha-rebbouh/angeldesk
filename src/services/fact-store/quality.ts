import { canonicalizeFactKey, getFactKeyDefinition } from "./fact-keys";
import type { ReliabilityClassification } from "./types";

export type FactQualitySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FactQualityIssueCode =
  | "UNKNOWN_TAXONOMY_KEY"
  | "LEGACY_ALIAS_FACT_KEY"
  | "STRUCTURED_VALUE_FOR_SCALAR_KEY"
  | "NON_ARRAY_VALUE_FOR_ARRAY_KEY"
  | "DISPLAY_VALUE_OBJECT_COLLAPSE"
  | "DISPLAY_CURRENCY_MISMATCH"
  | "TRACTION_CUSTOMER_USER_SEMANTIC_MISMATCH"
  | "TRACTION_MAU_SEMANTIC_MISMATCH"
  | "MISSING_TEMPORAL_METADATA"
  | "MISSING_RELIABILITY_METADATA"
  | "MISSING_TRUTH_CONFIDENCE";

export interface FactQualityIssue {
  code: FactQualityIssueCode;
  severity: FactQualitySeverity;
  message: string;
  autoQuarantine: boolean;
}

export interface FactQualityInput {
  factKey: string;
  value: unknown;
  displayValue?: string | null;
  unit?: string | null;
  extractedText?: string | null;
  validAt?: Date | null;
  periodType?: string | null;
  periodLabel?: string | null;
  reliability?: ReliabilityClassification | Record<string, unknown> | null;
  truthConfidence?: number | null;
  source?: string | null;
}

function detectDisplayCurrencyMismatch(
  unit: string | null | undefined,
  displayValue: string | null | undefined
): string | null {
  if (!unit || !displayValue) {
    return null;
  }

  const normalizedUnit = unit.toUpperCase();
  const displayUpper = displayValue.toUpperCase();
  const displayCurrencies = new Set<string>();

  if (/[€]|\bEUR\b/.test(displayUpper)) displayCurrencies.add("EUR");
  if (/[$]|\bUSD\b/.test(displayUpper)) displayCurrencies.add("USD");
  if (/\bNOK\b/.test(displayUpper)) displayCurrencies.add("NOK");
  if (/\bGBP\b|£/.test(displayUpper)) displayCurrencies.add("GBP");

  if (displayCurrencies.size === 0) {
    return null;
  }

  const expectedCurrency =
    normalizedUnit.includes("EUR") ? "EUR" :
    normalizedUnit.includes("USD") ? "USD" :
    normalizedUnit.includes("NOK") ? "NOK" :
    normalizedUnit.includes("GBP") ? "GBP" :
    null;

  if (!expectedCurrency) {
    return null;
  }

  return displayCurrencies.has(expectedCurrency)
    ? null
    : `Currency mismatch for ${expectedCurrency}: displayValue="${displayValue}"`;
}

export function detectFactQualityIssues(input: FactQualityInput): FactQualityIssue[] {
  const canonicalFactKey = canonicalizeFactKey(input.factKey);
  const definition = getFactKeyDefinition(canonicalFactKey);
  const issues: FactQualityIssue[] = [];

  if (!definition) {
    issues.push({
      code: "UNKNOWN_TAXONOMY_KEY",
      severity: "CRITICAL",
      message: `Unknown taxonomy key "${input.factKey}"`,
      autoQuarantine: true,
    });
    return issues;
  }

  if (input.factKey !== canonicalFactKey) {
    issues.push({
      code: "LEGACY_ALIAS_FACT_KEY",
      severity: "LOW",
      message: `Legacy alias "${input.factKey}" should be canonicalized to "${canonicalFactKey}"`,
      autoQuarantine: false,
    });
  }

  const isArrayValue = Array.isArray(input.value);
  const isObjectValue =
    typeof input.value === "object" &&
    input.value !== null &&
    !isArrayValue;

  if (definition.type === "array") {
    if (!isArrayValue) {
      issues.push({
        code: "NON_ARRAY_VALUE_FOR_ARRAY_KEY",
        severity: "CRITICAL",
        message: `Fact "${canonicalFactKey}" expects an array value`,
        autoQuarantine: true,
      });
    }
  } else if (isArrayValue || isObjectValue) {
    issues.push({
      code: "STRUCTURED_VALUE_FOR_SCALAR_KEY",
      severity: "CRITICAL",
      message: `Fact "${canonicalFactKey}" expects a scalar value, received structured data`,
      autoQuarantine: true,
    });
  }

  if (input.displayValue === "[object Object]") {
    issues.push({
      code: "DISPLAY_VALUE_OBJECT_COLLAPSE",
      severity: "CRITICAL",
      message: `Display value for "${canonicalFactKey}" collapsed to [object Object]`,
      autoQuarantine: true,
    });
  }

  const currencyMismatch = detectDisplayCurrencyMismatch(
    input.unit ?? definition.unit,
    input.displayValue
  );
  if (currencyMismatch) {
    issues.push({
      code: "DISPLAY_CURRENCY_MISMATCH",
      severity: "HIGH",
      message: currencyMismatch,
      autoQuarantine: true,
    });
  }

  const semanticText = `${input.displayValue ?? ""} ${input.extractedText ?? ""}`.toLowerCase();

  if (
    canonicalFactKey === "traction.customers_count" ||
    canonicalFactKey === "traction.users_count"
  ) {
    if (/\bsqm\b|\bcla\b|\bnla\b|occupancy|storage units?|self-storage/i.test(semanticText)) {
      issues.push({
        code: "TRACTION_CUSTOMER_USER_SEMANTIC_MISMATCH",
        severity: "HIGH",
        message: `Semantic mismatch for ${canonicalFactKey}: area/occupancy/storage metric cannot be persisted as user or customer count`,
        autoQuarantine: true,
      });
    }
  }

  if (canonicalFactKey === "traction.mau") {
    if (semanticText.includes("%") || /occupancy|sqm|cla|nla|storage/i.test(semanticText)) {
      issues.push({
        code: "TRACTION_MAU_SEMANTIC_MISMATCH",
        severity: "HIGH",
        message: "Semantic mismatch for traction.mau: percentage/occupancy metric is not a monthly active users count",
        autoQuarantine: true,
      });
    }
  }

  if (definition.isTemporal && !input.validAt && !input.periodType && !input.periodLabel) {
    issues.push({
      code: "MISSING_TEMPORAL_METADATA",
      severity: "MEDIUM",
      message: `Temporal fact "${canonicalFactKey}" is missing validAt/period metadata`,
      autoQuarantine: false,
    });
  }

  if (input.source !== "BA_OVERRIDE" && !input.reliability) {
    issues.push({
      code: "MISSING_RELIABILITY_METADATA",
      severity: "MEDIUM",
      message: `Fact "${canonicalFactKey}" is missing reliability metadata`,
      autoQuarantine: false,
    });
  }

  if (input.source !== "BA_OVERRIDE" && input.truthConfidence == null) {
    issues.push({
      code: "MISSING_TRUTH_CONFIDENCE",
      severity: "MEDIUM",
      message: `Fact "${canonicalFactKey}" is missing truthConfidence`,
      autoQuarantine: false,
    });
  }

  return issues;
}

export function hasAutoQuarantineIssue(issues: FactQualityIssue[]): boolean {
  return issues.some((issue) => issue.autoQuarantine);
}

export function summarizeFactQualityIssues(issues: FactQualityIssue[]): string {
  return issues.map((issue) => issue.message).join("; ");
}
