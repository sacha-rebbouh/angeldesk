import { buildThesisFactScope, type ThesisFactScope } from "@/lib/thesis/fact-scope";
import type { CurrentFact } from "@/services/fact-store/types";

const DIRECT_METRIC_RULES = [
  {
    factKey: "financial.revenue",
    patterns: [/\b(?:ca|chiffre d['’]affaires|revenu(?:s)?)\b/i],
  },
  {
    factKey: "financial.ebitda",
    patterns: [/\bebitda\b/i],
  },
  {
    factKey: "market.tam",
    patterns: [/\btam\b/i],
  },
  {
    factKey: "market.sam",
    patterns: [/\bsam\b/i],
  },
  {
    factKey: "traction.customers_count",
    patterns: [
      /\b(?:nombre|nb|base)\s+de\s+clients?\b/i,
      /\bclients?\s+(?:actifs?|payants?|signes?|signés?|servis?)\b/i,
    ],
  },
  {
    factKey: "traction.users_count",
    patterns: [/\butilisateurs?\b/i],
  },
  {
    factKey: "traction.mau",
    patterns: [/\bmau\b|\bmonthly active users?\b/i],
  },
  {
    factKey: "financial.runway_months",
    patterns: [/\brunway\b|\bpiste de tresorerie\b/i],
  },
  {
    factKey: "financial.burn_rate",
    patterns: [/\bburn(?:\s+rate)?\b|\bconsommation de cash\b/i],
  },
  {
    factKey: "financial.valuation_multiple",
    patterns: [/\bmultiple de valorisation\b/i, /\bx\s*(?:arr|revenue|revenus?|ca)\b/i],
  },
  {
    factKey: "traction.ltv_cac_ratio",
    patterns: [/\bltv\s*\/\s*cac\b/i, /\bltv[-\s]?cac\b/i],
  },
  {
    factKey: "financial.gross_margin",
    patterns: [/\bmarge brute\b/i, /\bgross margin\b/i],
  },
  {
    factKey: "financial.net_margin",
    patterns: [/\bmarge nette\b/i, /\bnet margin\b/i],
  },
  {
    factKey: "financial.revenue_growth_yoy",
    patterns: [/\bcroissance\b/i],
  },
];

const DERIVED_METRIC_RULES = [
  {
    metricKey: "ebitda_margin" as const,
    patterns: [
      /\bmarge d['’]ebitda\b/i,
      /\bmarge ebitda\b/i,
      /\bebitda margin\b/i,
      /\bebitda\b.{0,40}\b(?:ca|chiffre d['’]affaires|revenu(?:s)?)\b/i,
      /\b(?:ca|chiffre d['’]affaires|revenu(?:s)?)\b.{0,40}\bebitda\b/i,
    ],
  },
];

const NON_NUMERIC_BUSINESS_MODEL_PATTERN = /\bB2B(?:2C|toC)?\b|\bB2C\b/gi;

const ABSENCE_OR_INSUFFICIENCY_PATTERNS = [
  /\baucun(?:e|s)?\b/i,
  /\bpas\s+(?:de|d['’])/i,
  /\bnon\s+(?:fourni|fournie|fournis|fournies|disponible|disponibles)\b/i,
  /\bnon\s+(?:documente|documentee|documentes|documentees|documenté|documentée|documentés|documentées)\b/i,
  /\bnon\s+(?:communique|communiquee|communiques|communiquees|communiqué|communiquée|communiqués|communiquées)\b/i,
  /\bnon\s+(?:declare|declaree|declares|declarees|déclaré|déclarée|déclarés|déclarées)\b/i,
  /\b(?:absent|absente|absents|absentes|indisponible|inconnu|inconnue|indetermine|indéterminé|manquant|manquante)\b/i,
  /\bsans\s+(?:projection|donnee|donnée|metrique|métrique|chiffre|precision|précision|element|élément|garantie)\b/i,
  /\bnot\s+(?:provided|available|disclosed|documented|stated)\b/i,
  /\bno\s+(?:projection|metric|data|figure|number|disclosure)\b/i,
  /\b(?:missing|unavailable|unknown|undisclosed|undocumented)\b/i,
];

export interface ThesisNarrativeGuardIssue {
  field: string;
  sentence: string;
  reason: string;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function containsNumericAssertion(sentence: string): boolean {
  return /\d|[%€$£]|\b(?:eur|usd|nok|gbp|bn|million|millions|milliard|milliards|x)\b/i.test(
    sentence.replace(NON_NUMERIC_BUSINESS_MODEL_PATTERN, "")
  );
}

function containsMetricValueAssertion(sentence: string): boolean {
  return /[%€$£]|\b(?:eur|usd|nok|gbp|bn|million|millions|milliard|milliards|x)\b/i.test(
    sentence.replace(NON_NUMERIC_BUSINESS_MODEL_PATTERN, "")
  );
}

function isAbsenceOrInsufficiencySentence(sentence: string): boolean {
  return ABSENCE_OR_INSUFFICIENCY_PATTERNS.some((pattern) => pattern.test(sentence));
}

function extractFirstPercentage(sentence: string): number | null {
  const match = sentence.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]?.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function findUnsupportedThesisNarrativeClaims(
  fields: Record<string, string | null | undefined>,
  scope: ThesisFactScope
): ThesisNarrativeGuardIssue[] {
  const issues: ThesisNarrativeGuardIssue[] = [];

  for (const [field, value] of Object.entries(fields)) {
    if (!value) {
      continue;
    }

    const sentences = splitIntoSentences(value);
    for (const sentence of sentences) {
      const numericAssertion = containsNumericAssertion(sentence);
      const absenceOnly =
        isAbsenceOrInsufficiencySentence(sentence) &&
        !containsMetricValueAssertion(sentence);

      if (absenceOnly) {
        continue;
      }

      for (const rule of DERIVED_METRIC_RULES) {
        if (!rule.patterns.some((pattern) => pattern.test(sentence))) {
          continue;
        }

        const metric = scope.derivedMetricsByKey.get(rule.metricKey);
        if (!metric) {
          issues.push({
            field,
            sentence,
            reason: `Derived metric "${rule.metricKey}" is not available in the validated thesis fact scope`,
          });
          continue;
        }

        const claimedPercentage = extractFirstPercentage(sentence);
        if (claimedPercentage != null && Math.abs(claimedPercentage - metric.value) > 2) {
          issues.push({
            field,
            sentence,
            reason: `Claimed ${rule.metricKey} (${claimedPercentage}%) does not match validated metric ${metric.displayValue}`,
          });
        }
      }

      if (!numericAssertion) {
        continue;
      }

      for (const rule of DIRECT_METRIC_RULES) {
        if (!rule.patterns.some((pattern) => pattern.test(sentence))) {
          continue;
        }

        const fact = scope.factsByKey.get(rule.factKey);
        if (!fact) {
          issues.push({
            field,
            sentence,
            reason: `Numeric claim references "${rule.factKey}" but this fact is absent from the validated thesis fact scope`,
          });
        }
      }
    }
  }

  return issues;
}

export function assertSupportedThesisNarrative(
  fields: Record<string, string | null | undefined>,
  facts: CurrentFact[]
): void {
  const scope = buildThesisFactScope(facts);
  const issues = findUnsupportedThesisNarrativeClaims(fields, scope);

  if (issues.length === 0) {
    return;
  }

  const preview = issues
    .slice(0, 3)
    .map((issue) => `${issue.field}: ${issue.reason} — "${issue.sentence}"`)
    .join("; ");

  throw new Error(
    `Unsupported thesis narrative claims detected: ${preview}`
  );
}
