import { z } from "zod";

import type {
  LoadBearingAssumption,
  ThesisAlert,
  ThesisAlertCategory,
  ThesisAlertSeverity,
} from "@/agents/thesis/types";
import type { ThesisDerivedMetric, ThesisFactScope, ThesisScopedFact } from "@/lib/thesis/fact-scope";

const LoadBearingStatusSchema = z.enum(["verified", "declared", "projected", "speculative"]);
const ThesisAlertSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
const ThesisAlertCategorySchema = z.enum([
  "why_now",
  "problem_reality",
  "solution_fit",
  "moat",
  "unit_economics",
  "path_to_exit",
  "team_dependency",
  "market_size",
  "assumption_fragile",
]);

export const LoadBearingAssumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  status: LoadBearingStatusSchema,
  impact: z.string().min(1),
  validationPath: z.string().min(1),
});

export const ThesisAlertSchema = z.object({
  severity: ThesisAlertSeveritySchema,
  category: ThesisAlertCategorySchema,
  title: z.string().min(1),
  detail: z.string().min(1),
  linkedAssumptionId: z.string().nullish(),
});

export const ThesisCoreClaimSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("direct_fact"),
    factKey: z.string().min(1),
    framing: z.string().min(1),
  }),
  z.object({
    kind: z.literal("derived_metric"),
    metricKey: z.enum(["ebitda_margin"]),
    framing: z.string().min(1),
  }),
  z.object({
    kind: z.literal("judgment"),
    text: z.string().min(1),
    supportingFactKeys: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    kind: z.literal("unknown"),
    text: z.string().min(1),
  }),
]);

export type ThesisCoreClaim = z.infer<typeof ThesisCoreClaimSchema>;

export const ThesisCoreStructuredSchema = z.preprocess(
  (raw) => {
    if (
      raw &&
      typeof raw === "object" &&
      "thesis" in raw &&
      !("reformulatedClaims" in raw)
    ) {
      return (raw as { thesis: unknown }).thesis;
    }
    return raw;
  },
  z.object({
    reformulatedClaims: z.array(ThesisCoreClaimSchema).min(1),
    problemClaims: z.array(ThesisCoreClaimSchema).min(1),
    solutionClaims: z.array(ThesisCoreClaimSchema).min(1),
    whyNowClaims: z.array(ThesisCoreClaimSchema).min(1),
    moatClaims: z.array(ThesisCoreClaimSchema).default([]),
    pathToExitClaims: z.array(ThesisCoreClaimSchema).default([]),
    loadBearing: z.array(LoadBearingAssumptionSchema),
    alerts: z.array(ThesisAlertSchema),
  })
);

export type ThesisCoreStructured = z.infer<typeof ThesisCoreStructuredSchema>;

export interface StructuredClaimIssue {
  section: string;
  reason: string;
  claim: ThesisCoreClaim;
}

export interface RepairedStructuredSections {
  reformulated: ThesisCoreClaim[];
  problem: ThesisCoreClaim[];
  solution: ThesisCoreClaim[];
  whyNow: ThesisCoreClaim[];
  moat: ThesisCoreClaim[];
  pathToExit: ThesisCoreClaim[];
}

const NUMERIC_PATTERN = /\d|[%€$£]|\b(?:m|bn|million|millions|milliard|milliards|x)\b/i;

function containsNumericAssertion(text: string): boolean {
  return NUMERIC_PATTERN.test(text);
}

function normalizeSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return trimmed;
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function stripKnownMetricDisplays(text: string, scope: ThesisFactScope): string {
  let repaired = text;
  for (const fact of scope.facts) {
    if (fact.displayValue) {
      repaired = repaired.replaceAll(fact.displayValue, "");
    }
  }
  for (const metric of scope.derivedMetrics) {
    repaired = repaired.replaceAll(metric.displayValue, "");
  }
  return repaired;
}

function stripNumericAssertions(text: string, scope: ThesisFactScope): string {
  let repaired = stripKnownMetricDisplays(text, scope);
  repaired = repaired.replace(/[-+]?\d+(?:[.,]\d+)?\s*(?:%|€|EUR|USD|NOK|GBP|x|m|bn|million|millions|milliard|milliards)?/gi, "");
  repaired = repaired.replace(/\bFY\d{2,4}\b/gi, "");
  repaired = repaired.replace(/\bQ[1-4]\s*\d{2,4}\b/gi, "");
  repaired = repaired.replace(/\b20\d{2}\b/g, "");
  return normalizeWhitespace(repaired);
}

function inferDerivedMetricFromText(text: string, scope: ThesisFactScope): ThesisCoreClaim | null {
  const lower = text.toLowerCase();
  if (
    (lower.includes("marge ebitda") || lower.includes("ebitda margin")) &&
    scope.derivedMetricsByKey.has("ebitda_margin")
  ) {
    const framing = stripNumericAssertions(text, scope);
    return {
      kind: "derived_metric",
      metricKey: "ebitda_margin",
      framing: framing || "La société vise une marge EBITDA de",
    };
  }

  return null;
}

function inferDirectFactFromText(
  text: string,
  candidateFactKeys: string[],
  scope: ThesisFactScope
): ThesisCoreClaim | null {
  for (const factKey of candidateFactKeys) {
    const fact = scope.factsByKey.get(factKey);
    if (!fact || !fact.displayValue) {
      continue;
    }
    if (!text.includes(fact.displayValue)) {
      continue;
    }
    const framing = normalizeWhitespace(text.replaceAll(fact.displayValue, "")) || `${fact.label}:`;
    return {
      kind: "direct_fact",
      factKey,
      framing,
    };
  }
  return null;
}

function repairClaim(claim: ThesisCoreClaim, scope: ThesisFactScope): ThesisCoreClaim {
  if (claim.kind === "direct_fact") {
    return {
      ...claim,
      framing: stripNumericAssertions(claim.framing, scope) || claim.framing.replace(/\d+/g, "").trim() || "Selon les faits validés:",
    };
  }

  if (claim.kind === "derived_metric") {
    return {
      ...claim,
      framing: stripNumericAssertions(claim.framing, scope) || "La société vise une métrique de",
    };
  }

  if (claim.kind === "judgment") {
    const directFromSupport = inferDirectFactFromText(claim.text, claim.supportingFactKeys, scope);
    if (directFromSupport) {
      return directFromSupport;
    }
    const derived = inferDerivedMetricFromText(claim.text, scope);
    if (derived) {
      return derived;
    }
    const supportingFactKeys = claim.supportingFactKeys.filter((factKey) => scope.factsByKey.has(factKey));
    if (supportingFactKeys.length === 0) {
      return {
        kind: "unknown",
        text: stripNumericAssertions(claim.text, scope) || "Information insuffisamment documentée.",
      };
    }
    return {
      ...claim,
      text: stripNumericAssertions(claim.text, scope) || "L'information reste qualitative et doit être validée.",
      supportingFactKeys,
    };
  }

  const derived = inferDerivedMetricFromText(claim.text, scope);
  if (derived) {
    return derived;
  }

  return {
    kind: "unknown",
    text: stripNumericAssertions(claim.text, scope) || "Information insuffisamment documentée.",
  };
}

function renderDirectFactClaim(claim: Extract<ThesisCoreClaim, { kind: "direct_fact" }>, fact: ThesisScopedFact): string {
  const base = `${claim.framing.trim()} ${fact.displayValue}`.trim();
  if (fact.isProjection) {
    return normalizeSentence(`${base} (projection déclarée)`);
  }
  if (fact.reliability === "DECLARED") {
    return normalizeSentence(`${base} (déclaré, non vérifié)`);
  }
  return normalizeSentence(base);
}

function renderDerivedMetricClaim(
  claim: Extract<ThesisCoreClaim, { kind: "derived_metric" }>,
  metric: ThesisDerivedMetric
): string {
  return normalizeSentence(`${claim.framing.trim()} ${metric.displayValue}`);
}

export function validateStructuredClaims(
  claims: ThesisCoreClaim[],
  section: string,
  scope: ThesisFactScope
): StructuredClaimIssue[] {
  const issues: StructuredClaimIssue[] = [];

  for (const claim of claims) {
    if (claim.kind === "direct_fact") {
      if (containsNumericAssertion(claim.framing)) {
        issues.push({
          section,
          reason: `direct_fact framing must not contain numeric assertions (${claim.factKey})`,
          claim,
        });
      }
      if (!scope.factsByKey.has(claim.factKey)) {
        issues.push({
          section,
          reason: `direct_fact references missing scoped fact "${claim.factKey}"`,
          claim,
        });
      }
    } else if (claim.kind === "derived_metric") {
      if (containsNumericAssertion(claim.framing)) {
        issues.push({
          section,
          reason: `derived_metric framing must not contain numeric assertions (${claim.metricKey})`,
          claim,
        });
      }
      if (!scope.derivedMetricsByKey.has(claim.metricKey)) {
        issues.push({
          section,
          reason: `derived_metric references unavailable validated metric "${claim.metricKey}"`,
          claim,
        });
      }
    } else if (claim.kind === "judgment") {
      if (containsNumericAssertion(claim.text)) {
        issues.push({
          section,
          reason: "judgment text must not contain numeric assertions; use direct_fact or derived_metric instead",
          claim,
        });
      }
      for (const factKey of claim.supportingFactKeys) {
        if (!scope.factsByKey.has(factKey)) {
          issues.push({
            section,
            reason: `judgment references missing scoped fact "${factKey}"`,
            claim,
          });
        }
      }
    } else if (claim.kind === "unknown") {
      if (containsNumericAssertion(claim.text)) {
        issues.push({
          section,
          reason: "unknown text must not contain numeric assertions",
          claim,
        });
      }
    }
  }

  return issues;
}

export function assertValidStructuredClaims(
  sections: Record<string, ThesisCoreClaim[]> | RepairedStructuredSections,
  scope: ThesisFactScope
): void {
  const issues = Object.entries(sections).flatMap(([section, claims]) =>
    validateStructuredClaims(claims, section, scope)
  );

  if (issues.length === 0) {
    return;
  }

  const preview = issues
    .slice(0, 5)
    .map((issue) => `${issue.section}: ${issue.reason}`)
    .join("; ");

  throw new Error(`Invalid structured thesis claims detected: ${preview}`);
}

export function repairStructuredClaims(
  sections: RepairedStructuredSections,
  scope: ThesisFactScope
): RepairedStructuredSections {
  return {
    reformulated: sections.reformulated.map((claim) => repairClaim(claim, scope)),
    problem: sections.problem.map((claim) => repairClaim(claim, scope)),
    solution: sections.solution.map((claim) => repairClaim(claim, scope)),
    whyNow: sections.whyNow.map((claim) => repairClaim(claim, scope)),
    moat: sections.moat.map((claim) => repairClaim(claim, scope)),
    pathToExit: sections.pathToExit.map((claim) => repairClaim(claim, scope)),
  };
}

export function renderStructuredClaims(
  claims: ThesisCoreClaim[],
  scope: ThesisFactScope
): string {
  const rendered = claims.map((claim) => {
    switch (claim.kind) {
      case "direct_fact": {
        const fact = scope.factsByKey.get(claim.factKey);
        if (!fact) {
          throw new Error(`Cannot render missing scoped fact "${claim.factKey}"`);
        }
        return renderDirectFactClaim(claim, fact);
      }
      case "derived_metric": {
        const metric = scope.derivedMetricsByKey.get(claim.metricKey);
        if (!metric) {
          throw new Error(`Cannot render unavailable metric "${claim.metricKey}"`);
        }
        return renderDerivedMetricClaim(claim, metric);
      }
      case "judgment":
      case "unknown":
        return normalizeSentence(claim.text);
      default:
        return "";
    }
  }).filter(Boolean);

  return rendered.join(" ");
}

export function normalizeLoadBearingAssumptions(
  assumptions: Array<z.infer<typeof LoadBearingAssumptionSchema>>
): LoadBearingAssumption[] {
  return assumptions.map((assumption) => ({
    id: assumption.id,
    statement: assumption.statement,
    status: assumption.status,
    impact: assumption.impact,
    validationPath: assumption.validationPath,
  }));
}

export function normalizeThesisAlerts(
  alerts: Array<z.infer<typeof ThesisAlertSchema>>
): ThesisAlert[] {
  return alerts.map((alert) => ({
    severity: alert.severity as ThesisAlertSeverity,
    category: alert.category as ThesisAlertCategory,
    title: alert.title,
    detail: alert.detail,
    linkedAssumptionId: alert.linkedAssumptionId ?? undefined,
  }));
}
