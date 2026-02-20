// Shared types for the Conditions tab components

export interface DealTermsData {
  valuationPre: number | null;
  amountRaised: number | null;
  dilutionPct: number | null;
  instrumentType: string | null;
  instrumentDetails: string | null;
  liquidationPref: string | null;
  antiDilution: string | null;
  proRataRights: boolean | null;
  informationRights: boolean | null;
  boardSeat: string | null;
  founderVesting: boolean | null;
  vestingDurationMonths: number | null;
  vestingCliffMonths: number | null;
  esopPct: number | null;
  dragAlong: boolean | null;
  tagAlong: boolean | null;
  ratchet: boolean | null;
  payToPlay: boolean | null;
  milestoneTranches: boolean | null;
  nonCompete: boolean | null;
  customConditions: string | null;
  notes: string | null;
}

export const EMPTY_TERMS: DealTermsData = {
  valuationPre: null,
  amountRaised: null,
  dilutionPct: null,
  instrumentType: null,
  instrumentDetails: null,
  liquidationPref: null,
  antiDilution: null,
  proRataRights: null,
  informationRights: null,
  boardSeat: null,
  founderVesting: null,
  vestingDurationMonths: null,
  vestingCliffMonths: null,
  esopPct: null,
  dragAlong: null,
  tagAlong: null,
  ratchet: null,
  payToPlay: null,
  milestoneTranches: null,
  nonCompete: null,
  customConditions: null,
  notes: null,
};

export interface TrancheData {
  id: string;
  orderIndex: number;
  label: string;
  trancheType: string;
  typeDetails: string | null;
  amount: number | null;
  valuationPre: number | null;
  equityPct: number | null;
  triggerType: string | null;
  triggerDetails: string | null;
  triggerDeadline: string | null;
  instrumentTerms: Record<string, unknown> | null;
  liquidationPref: string | null;
  antiDilution: string | null;
  proRataRights: boolean | null;
  status: string;
}

export const EMPTY_TRANCHE: Omit<TrancheData, "id"> = {
  orderIndex: 0,
  label: "",
  trancheType: "CCA",
  typeDetails: null,
  amount: null,
  valuationPre: null,
  equityPct: null,
  triggerType: "UNCONDITIONAL",
  triggerDetails: null,
  triggerDeadline: null,
  instrumentTerms: null,
  liquidationPref: null,
  antiDilution: null,
  proRataRights: null,
  status: "PENDING",
};

export type DealMode = "SIMPLE" | "STRUCTURED";

export interface ScoreBreakdownItem {
  criterion: string;
  weight: number;
  score: number;
  justification: string;
}

export interface NegotiationAdviceItem {
  point: string;
  priority: "critical" | "high" | "medium" | "low";
  suggestedArgument: string;
  leverageSource?: string;
}

export interface RedFlagItem {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  evidence?: string;
  impact?: string;
  question?: string;
}

export interface NarrativeData {
  oneLiner?: string;
  summary?: string;
  keyInsights?: string[];
  forNegotiation?: string[];
}

export interface ConditionsFindings {
  termsSource?: string;
  negotiationAdvice?: NegotiationAdviceItem[];
  crossReferenceInsights?: Array<{ insight: string; sourceAgent: string; impact: string }>;
  structuredAssessment?: {
    overallStructureVerdict: string;
    trancheAssessments: { trancheLabel: string; assessment: string; risks: string[]; score: number }[];
    blendedEffectiveValuation: number | null;
    triggerRiskLevel: "LOW" | "MEDIUM" | "HIGH";
  };
  [key: string]: unknown;
}

export interface TermsResponse {
  terms: DealTermsData | null;
  mode: DealMode;
  tranches: TrancheData[] | null;
  conditionsScore: number | null;
  conditionsBreakdown: ScoreBreakdownItem[] | null;
  conditionsAnalysis: ConditionsFindings | null;
  negotiationAdvice: NegotiationAdviceItem[] | null;
  redFlags: RedFlagItem[] | null;
  narrative: NarrativeData | null;
  analysisStatus?: "success" | "failed" | "timeout" | null;
}

export interface TermsVersionData {
  id: string;
  version: number;
  label: string | null;
  termsSnapshot: Record<string, unknown>;
  conditionsScore: number | null;
  source: string;
  changeNote: string | null;
  createdAt: string;
}

export interface BenchmarkData {
  stage: string;
  source: string;
  valuation: { p25: number; p50: number; p75: number; p90: number; dealValue: number | null; percentile: number | null };
  dilution: { median: number; dealValue: number | null };
  instrument: { standard: string; dealValue: string | null; assessment: string | null };
}

export const TRANCHE_TYPES = [
  { value: "CCA", label: "Compte Courant d'Associe (CCA)" },
  { value: "EQUITY_ORDINARY", label: "Actions ordinaires" },
  { value: "EQUITY_PREFERRED", label: "Actions de preference" },
  { value: "BSA_AIR", label: "BSA-AIR" },
  { value: "CONVERTIBLE_NOTE", label: "Note convertible" },
  { value: "OPTION", label: "Option d'achat" },
  { value: "LOAN", label: "Pret" },
  { value: "OTHER", label: "Autre" },
] as const;

export const TRIGGER_TYPES = [
  { value: "UNCONDITIONAL", label: "Inconditionnel" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "DATE", label: "Date" },
  { value: "OPTION", label: "Option (au choix de l'investisseur)" },
  { value: "CONVERSION", label: "Conversion automatique" },
] as const;

export const TRANCHE_STATUSES = [
  { value: "PENDING", label: "En attente" },
  { value: "ACTIVE", label: "Active" },
  { value: "CONVERTED", label: "Convertie" },
  { value: "EXPIRED", label: "Expiree" },
  { value: "CANCELLED", label: "Annulee" },
] as const;

// Check if a tranche type should show equity-specific fields (valo, equity%, protections)
export function isEquityTranche(type: string): boolean {
  return ["EQUITY_ORDINARY", "EQUITY_PREFERRED", "BSA_AIR", "CONVERTIBLE_NOTE", "OPTION"].includes(type);
}
