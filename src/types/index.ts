import type {
  Deal,
  User,
  Founder,
  Document,
  RedFlag,
  Analysis,
  Benchmark,
  DealStage,
  DealStatus,
  DocumentType,
  ProcessingStatus,
  RedFlagCategory,
  RedFlagSeverity,
  RedFlagStatus,
  AnalysisType,
  AnalysisStatus,
  SubscriptionStatus,
} from "@prisma/client";

// Re-export Prisma types for convenience
export type {
  Deal,
  User,
  Founder,
  Document,
  RedFlag,
  Analysis,
  Benchmark,
  DealStage,
  DealStatus,
  DocumentType,
  ProcessingStatus,
  RedFlagCategory,
  RedFlagSeverity,
  RedFlagStatus,
  AnalysisType,
  AnalysisStatus,
  SubscriptionStatus,
};

// Extended types with relations
export type DealWithRelations = Deal & {
  founders: Founder[];
  documents: Document[];
  redFlags: RedFlag[];
  analyses: Analysis[];
};

export type DealWithUser = Deal & {
  user: User;
};

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Form input types (without auto-generated fields)
export interface CreateDealInput {
  name: string;
  companyName?: string;
  website?: string;
  description?: string;
  sector?: string;
  stage?: DealStage;
  geography?: string;
  arr?: number;
  growthRate?: number;
  amountRequested?: number;
  valuationPre?: number;
}

export interface UpdateDealInput extends Partial<CreateDealInput> {
  status?: DealStatus;
}

export interface CreateFounderInput {
  name: string;
  role: string;
  linkedinUrl?: string;
}

// Analysis types
export interface AnalysisProgress {
  analysisId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  totalAgents: number;
  completedAgents: number;
  currentAgent?: string;
  progress: number; // 0-100
}

// Red flag types
export interface DetectedRedFlag {
  category: RedFlagCategory;
  title: string;
  description: string;
  severity: RedFlagSeverity;
  confidenceScore: number;
  evidence: Record<string, unknown>;
  questionsToAsk: string[];
}

// Score types
export interface DealScores {
  global: number;
  team: number;
  market: number;
  product: number;
  financials: number;
}

// Benchmark comparison
export interface BenchmarkComparison {
  metricName: string;
  dealValue: number;
  p25: number;
  median: number;
  p75: number;
  percentile: number; // Where the deal falls (0-100)
  assessment: "below" | "average" | "above" | "excellent";
}
