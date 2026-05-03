import type { FactCategory, FactSource } from "./types";
import { canonicalizeFactKey, getFactKeyDefinition } from "./fact-keys";
import {
  detectFactQualityIssues,
  hasAutoQuarantineIssue,
  summarizeFactQualityIssues,
} from "./quality";

export interface ValidatedTaxonomyFactInput {
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  unit?: string;
}

export function validateTaxonomyFactInput(input: {
  factKey: string;
  value: unknown;
  displayValue: string;
  source: FactSource;
}): { ok: true; data: ValidatedTaxonomyFactInput } | { ok: false; error: string } {
  const factKey = canonicalizeFactKey(input.factKey);
  const definition = getFactKeyDefinition(factKey);

  if (!definition) {
    return { ok: false, error: `Unknown fact key "${input.factKey}"` };
  }

  const issues = detectFactQualityIssues({
    factKey,
    value: input.value,
    displayValue: input.displayValue,
    unit: definition.unit,
    source: input.source,
  });

  if (hasAutoQuarantineIssue(issues)) {
    return {
      ok: false,
      error: summarizeFactQualityIssues(issues),
    };
  }

  return {
    ok: true,
    data: {
      factKey,
      category: definition.category,
      value: input.value,
      displayValue: input.displayValue,
      unit: definition.unit ?? undefined,
    },
  };
}
