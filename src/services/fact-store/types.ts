// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - TYPES
// ═══════════════════════════════════════════════════════════════════════

export type FactCategory =
  | 'FINANCIAL'
  | 'TEAM'
  | 'MARKET'
  | 'PRODUCT'
  | 'LEGAL'
  | 'COMPETITION'
  | 'TRACTION'
  | 'OTHER';

export type FactSource =
  | 'DATA_ROOM'
  | 'FINANCIAL_MODEL'
  | 'FOUNDER_RESPONSE'
  | 'PITCH_DECK'
  | 'CONTEXT_ENGINE'
  | 'BA_OVERRIDE';

export type FactEventType =
  | 'CREATED'
  | 'SUPERSEDED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'DELETED'
  | 'PENDING_REVIEW'; // Awaits human validation due to major contradiction detected

export const SOURCE_PRIORITY: Record<FactSource, number> = {
  DATA_ROOM: 100,
  BA_OVERRIDE: 100,
  FINANCIAL_MODEL: 95,
  FOUNDER_RESPONSE: 65, // Donnees declarees non verifiees — inferieur au PITCH_DECK (F26)
  PITCH_DECK: 80,
  CONTEXT_ENGINE: 60,
};

export type PeriodType = 'POINT_IN_TIME' | 'QUARTER' | 'YEAR' | 'MONTH';

// ═══════════════════════════════════════════════════════════════════════
// DATA RELIABILITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════
//
// Every data point (financial metric, traction KPI, etc.) MUST be classified
// by how reliable it is. This prevents the system from treating projections
// from a Business Plan as verified historical facts.
//
// Hierarchy (most to least reliable):
// AUDITED > VERIFIED > DECLARED > PROJECTED > ESTIMATED > UNVERIFIABLE

/** How reliable is this specific data point? */
export type DataReliability =
  | 'AUDITED'       // Confirmed by external audit, bank statements, certified accounts
  | 'VERIFIED'      // Cross-verified via multiple independent sources (Context Engine + deck match)
  | 'DECLARED'      // Stated in deck/doc with no independent verification possible
  | 'PROJECTED'     // Explicitly or implicitly a forward-looking projection (BP, forecast)
  | 'ESTIMATED'     // Calculated/deduced by the AI from partial data
  | 'UNVERIFIABLE'; // Cannot be verified or falsified with available data

/** Why was this reliability level assigned? */
export interface ReliabilityClassification {
  reliability: DataReliability;
  reasoning: string; // Why this classification (e.g., "Document dated Aug 2025, this annual figure covers Sep-Dec = projection")
  isProjection: boolean; // Shortcut: true if reliability is PROJECTED or if temporal analysis shows future data
  temporalAnalysis?: {
    documentDate?: string; // ISO date of when the document was created/dated
    dataPeriodEnd?: string; // ISO date of the end of the period this data covers (e.g., "2025-12-31" for "CA 2025")
    monthsOfProjection?: number; // How many months of the claimed period are in the future relative to document date
    projectionPercent?: number; // % of the data period that is projected (e.g., 33% if 4 out of 12 months are future)
  };
  verificationMethod?: string; // How it was verified (e.g., "Cross-ref Context Engine", "Triangulation MRR x12 vs ARR")
}

/** Weights for reliability when computing adjusted scores */
export const RELIABILITY_WEIGHTS: Record<DataReliability, number> = {
  AUDITED: 1.0,
  VERIFIED: 0.95,
  DECLARED: 0.7,
  PROJECTED: 0.3,
  ESTIMATED: 0.4,
  UNVERIFIABLE: 0.2,
};

export interface ExtractedFact {
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  unit?: string;
  source: FactSource;
  sourceDocumentId?: string;
  /** Confidence d'extraction: certitude que la valeur a ete correctement lue/extraite (0-100) */
  sourceConfidence: number;
  /** Confiance dans la veracite: sourceConfidence * RELIABILITY_WEIGHT (0-100) (F57) */
  truthConfidence?: number;
  extractedText?: string;

  // Temporal fields - for facts that vary over time (ARR, MRR, headcount, etc.)
  validAt?: Date; // Date at which this fact was valid
  periodType?: PeriodType; // POINT_IN_TIME, QUARTER, YEAR, MONTH
  periodLabel?: string; // "Q4 2024", "FY2024", "Dec 2024"

  // Data Reliability Classification - CRITICAL for distinguishing facts from projections
  reliability?: ReliabilityClassification;
}

export interface CurrentFact {
  dealId: string;
  factKey: string;
  category: FactCategory;
  currentValue: unknown;
  currentDisplayValue: string;
  currentSource: FactSource;
  currentConfidence: number;
  isDisputed: boolean;
  disputeDetails?: {
    conflictingValue: unknown;
    conflictingSource: FactSource;
  };
  eventHistory: FactEventRecord[];
  firstSeenAt: Date;
  lastUpdatedAt: Date;

  // Data Reliability Classification
  reliability?: ReliabilityClassification;
}

export interface FactEventRecord {
  id: string;
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  unit?: string;
  source: FactSource;
  sourceDocumentId?: string;
  sourceConfidence: number;
  extractedText?: string;
  eventType: FactEventType;
  supersedesEventId?: string;
  createdAt: Date;
  createdBy: 'system' | 'ba';
  reason?: string;
}

export type MatchResultType = 'NEW' | 'SUPERSEDE' | 'IGNORE' | 'REVIEW_NEEDED';

export interface MatchResult {
  type: MatchResultType;
  existingFact?: CurrentFact;
  reason: string;
}

export interface ContradictionInfo {
  factKey: string;
  newValue: unknown;
  existingValue: unknown;
  newSource: FactSource;
  existingSource: FactSource;
  deltaPercent?: number;
  significance: 'MINOR' | 'SIGNIFICANT' | 'MAJOR';
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  contradictions: ContradictionInfo[];
  metadata: {
    factsExtracted: number;
    contradictionsDetected: number;
    averageConfidence: number;
    processingTimeMs: number;
  };
}
