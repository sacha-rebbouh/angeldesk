/**
 * Centralized terms normalization.
 * Single source of truth for converting Prisma DealTranche/DealTerms
 * to frontend-friendly formats.
 */

import type { DealTranche } from "@prisma/client";
import type { DealMode, TrancheData, DealTermsData, ConditionsFindings } from "@/components/deals/conditions/types";
import type { ConditionsAnalystData } from "@/agents/types";

/**
 * Normalize a Prisma DealTranche to frontend TrancheData.
 * Converts Decimal fields to numbers and handles null defaults.
 */
export function normalizeTranche(t: DealTranche): TrancheData {
  return {
    id: t.id,
    orderIndex: t.orderIndex,
    label: t.label ?? "",
    trancheType: t.trancheType,
    typeDetails: t.typeDetails,
    amount: t.amount != null ? Number(t.amount) : null,
    valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
    equityPct: t.equityPct != null ? Number(t.equityPct) : null,
    triggerType: t.triggerType,
    triggerDetails: t.triggerDetails,
    triggerDeadline: t.triggerDeadline?.toISOString() ?? null,
    instrumentTerms: t.instrumentTerms as Record<string, unknown> | null,
    liquidationPref: t.liquidationPref,
    antiDilution: t.antiDilution,
    proRataRights: t.proRataRights,
    status: t.status,
  };
}

/**
 * Normalize raw deal terms from DB (Prisma Decimal → number, uppercase → lowercase).
 */
export function normalizeTerms(rawTerms: Record<string, unknown> | null): DealTermsData | null {
  if (!rawTerms) return null;
  return {
    ...rawTerms,
    valuationPre: rawTerms.valuationPre != null ? Number(rawTerms.valuationPre) : null,
    amountRaised: rawTerms.amountRaised != null ? Number(rawTerms.amountRaised) : null,
    dilutionPct: rawTerms.dilutionPct != null ? Number(rawTerms.dilutionPct) : null,
    esopPct: rawTerms.esopPct != null ? Number(rawTerms.esopPct) : null,
  } as DealTermsData;
}

/**
 * Build a complete TermsResponse from DB data + cached analysis.
 * Used by both the API route and the SSR page to avoid duplication.
 */
export function buildTermsResponse(
  terms: Record<string, unknown> | null,
  cached: ConditionsAnalystData | null,
  conditionsScore: number | null,
  mode: DealMode = "SIMPLE",
  tranches: TrancheData[] | null = null,
) {
  const normalizedTerms = normalizeTerms(terms);

  // Lowercase severity/priority for frontend (agent outputs UPPERCASE)
  const advice = (cached?.findings?.negotiationAdvice ?? []).map(a => ({
    ...a,
    priority: (a.priority?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low",
  }));
  const flags = (cached?.redFlags ?? []).map(rf => ({
    ...rf,
    severity: (rf.severity?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low",
  }));
  const questions = (cached?.questions ?? []).map(q => ({
    ...q,
    priority: (q.priority?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low",
  }));

  return {
    terms: normalizedTerms,
    mode,
    tranches,
    conditionsScore,
    conditionsBreakdown: cached?.score?.breakdown ?? null,
    conditionsAnalysis: (cached?.findings ?? null) as ConditionsFindings | null,
    negotiationAdvice: advice.length > 0 ? advice : null,
    redFlags: flags.length > 0 ? flags : null,
    narrative: cached?.narrative ?? null,
    questions: questions.length > 0 ? questions : null,
    analysisStatus: cached ? "success" as const : null,
  };
}
