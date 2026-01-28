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
  | 'DELETED';

export const SOURCE_PRIORITY: Record<FactSource, number> = {
  DATA_ROOM: 100,
  BA_OVERRIDE: 100,
  FINANCIAL_MODEL: 95,
  FOUNDER_RESPONSE: 90,
  PITCH_DECK: 80,
  CONTEXT_ENGINE: 60,
};

export interface ExtractedFact {
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  unit?: string;
  source: FactSource;
  sourceDocumentId?: string;
  sourceConfidence: number;
  extractedText?: string;
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
