/**
 * Database Maintenance System - Shared Types
 *
 * Types partagés pour tous les agents de maintenance (CLEANER, SOURCER, COMPLETER, SUPERVISOR)
 */

import type {
  MaintenanceAgent,
  MaintenanceStatus,
  TriggerSource,
  CheckStatus,
  SupervisorAction,
  HealthStatus,
  CompanyStatus,
} from '@prisma/client'

// Re-export Prisma enums for convenience
export type {
  MaintenanceAgent,
  MaintenanceStatus,
  TriggerSource,
  CheckStatus,
  SupervisorAction,
  HealthStatus,
}

// ============================================================================
// AGENT RUN TYPES
// ============================================================================

/** Base result interface for all agents */
export interface AgentRunResult {
  success: boolean
  status: MaintenanceStatus
  itemsProcessed: number
  itemsUpdated: number
  itemsCreated: number
  itemsFailed: number
  itemsSkipped: number
  durationMs: number
  totalCost?: number
  llmCalls?: number
  webSearches?: number
  errors?: AgentError[]
}

/** Error tracking */
export interface AgentError {
  message: string
  stack?: string
  itemId?: string
  itemName?: string
  phase?: string
  timestamp: Date
}

// ============================================================================
// DB_CLEANER TYPES
// ============================================================================

export interface CleanerResult extends AgentRunResult {
  details: CleanerDetails
  /** If dry-run mode, contains the execution plan without modifications */
  plan?: CleanerPlan
}

export interface CleanerDetails {
  duplicateCompaniesMerged: number
  duplicateFundingRoundsMerged: number
  invalidEntriesRemoved: number
  countriesNormalized: number
  stagesNormalized: number
  industriesNormalized: number
  orphansRemoved: number
  aberrantValuesFixed: number
}

/** Options for running the cleaner */
export interface CleanerOptions {
  /** If true, returns a plan of changes without executing them */
  dryRun?: boolean
  /** Run ID to track execution */
  runId?: string
  /** Skip certain phases if needed */
  skipPhases?: CleanerPhase[]
}

export type CleanerPhase =
  | 'deduplicate_companies'
  | 'deduplicate_rounds'
  | 'remove_invalid'
  | 'normalize_countries'
  | 'normalize_stages'
  | 'normalize_industries'
  | 'remove_orphans'
  | 'fix_aberrant'

/** Dry-run plan showing what would be changed */
export interface CleanerPlan {
  /** Companies that would be merged */
  companyMerges: PlannedCompanyMerge[]
  /** Funding rounds that would be merged */
  fundingRoundMerges: PlannedFundingRoundMerge[]
  /** Companies that would be deleted (invalid) */
  invalidCompaniesToDelete: PlannedDeletion[]
  /** Funding rounds that would be deleted (invalid/orphan) */
  invalidRoundsToDelete: PlannedDeletion[]
  /** Countries that would be normalized */
  countryNormalizations: PlannedNormalization[]
  /** Stages that would be normalized */
  stageNormalizations: PlannedNormalization[]
  /** Industries that would be normalized */
  industryNormalizations: PlannedNormalization[]
  /** Aberrant values that would be fixed */
  aberrantValueFixes: PlannedAberrantFix[]
  /** Summary counts */
  summary: CleanerPlanSummary
}

export interface PlannedCompanyMerge {
  keepId: string
  keepName: string
  mergeId: string
  mergeName: string
  similarity: SimilarityScore
  fieldsToTransfer: string[]
  fundingRoundsToTransfer: number
  enrichmentsToTransfer: number
  reason: string
}

export interface PlannedFundingRoundMerge {
  keepId: string
  mergeId: string
  companyName: string
  keepAmount: number | null
  mergeAmount: number | null
  keepDate: Date | null
  mergeDate: Date | null
  reason: string
}

export interface PlannedDeletion {
  id: string
  name: string
  reason: string
}

export interface PlannedNormalization {
  id: string
  name?: string
  field: string
  currentValue: string
  newValue: string
}

export interface PlannedAberrantFix {
  id: string
  name?: string
  field: string
  currentValue: string | number | null
  action: 'set_null' | 'correct'
  reason: string
}

export interface SimilarityScore {
  combined: number
  levenshtein: number
  jaroWinkler: number
  phonetic: number
  normalizedMatch: boolean
}

export interface CleanerPlanSummary {
  totalCompanyMerges: number
  totalFundingRoundMerges: number
  totalInvalidCompanies: number
  totalInvalidRounds: number
  totalCountryNormalizations: number
  totalStageNormalizations: number
  totalIndustryNormalizations: number
  totalAberrantFixes: number
  estimatedDuration: string
}

/** Duplicate candidate for review */
export interface DuplicateCandidate {
  companyId1: string
  companyId2: string
  name1: string
  name2: string
  slug: string
  similarity: number // 0-1
  similarityDetails: SimilarityScore
  reason: string
}

/** Merge result */
export interface MergeResult {
  keptId: string
  mergedId: string
  fieldsUpdated: string[]
  fundingRoundsTransferred: number
  enrichmentsTransferred: number
  mergeLogId: string
}

// ============================================================================
// DB_SOURCER TYPES
// ============================================================================

export interface SourcerResult extends AgentRunResult {
  details: SourcerDetails
}

export interface SourcerDetails {
  sourcesScraped: number
  articlesFound: number
  articlesParsed: number
  duplicatesSkipped: number
  newCompaniesCreated: number
  newFundingRoundsCreated: number
  sourceBreakdown: Record<string, SourceStats>
}

export interface SourceStats {
  articlesFound: number
  articlesParsed: number
  newCompanies: number
  newRounds: number
  errors: number
}

/** Parsed funding article */
export interface ParsedFunding {
  companyName: string
  amount: number | null
  currency: string
  stage: string | null
  investors: string[]
  leadInvestor: string | null
  date: Date
  sourceUrl: string
  sourceName: string
  description: string | null
}

/** Source connector interface (legacy RSS) */
export interface SourceConnector {
  name: string
  displayName: string
  fetch(): Promise<ParsedFunding[]>
}

/** Paginated source result */
export interface PaginatedSourceResult {
  items: ParsedFunding[]
  nextCursor: string | null // null = no more pages
  hasMore: boolean
  totalEstimated?: number // Estimated total items if known
}

/** Paginated source connector interface */
export interface PaginatedSourceConnector {
  name: string
  displayName: string
  sourceType: 'archive' | 'api' | 'scrape'
  cursorType: 'page' | 'date' | 'offset' | 'token'
  /** Minimum date to import (2021-01-01) */
  minDate: Date
  /** Fetch a batch of items starting from cursor */
  fetch(cursor: string | null): Promise<PaginatedSourceResult>
  /** Get initial cursor for new imports */
  getInitialCursor(): string
}

// ============================================================================
// DB_COMPLETER TYPES
// ============================================================================

export interface CompleterResult extends AgentRunResult {
  details: CompleterDetails
}

export interface CompleterDetails {
  companiesProcessed: number
  companiesEnriched: number
  companiesSkipped: number
  companiesFailed: number
  fieldsUpdated: FieldUpdateStats
  activityStatusBreakdown: ActivityStatusBreakdown
  avgConfidence: number
  avgDataCompleteness: number
  avgSourcesPerCompany: number
}

export interface FieldUpdateStats {
  industry: number
  description: number
  founders: number
  investors: number
  headquarters: number
  foundedYear: number
  website: number
  competitors: number
  status: number
  employees: number
}

export interface ActivityStatusBreakdown {
  active: number
  shutdown: number
  acquired: number
  inactive: number
  unknown: number
}

/** LLM extraction result */
export interface LLMExtractionResult {
  company_name: string | null
  activity_status: 'active' | 'shutdown' | 'acquired' | 'pivoted' | null
  activity_status_details: string | null
  industry: string | null
  sub_industry: string | null
  description: string | null
  business_model: 'SaaS' | 'Marketplace' | 'Transactional' | 'Hardware' | 'Services' | null
  target_market: 'B2B' | 'B2C' | 'B2B2C' | null
  headquarters_country: string | null
  headquarters_city: string | null
  founded_year: number | null
  founders: FounderInfo[]
  employees: number | null
  total_raised: string | null
  last_round_amount: string | null
  last_round_stage: string | null
  investors: string[]
  competitors: string[]
  notable_clients: string[]
  website: string | null
  is_profitable: boolean | null
  confidence: number // 0-100
  data_completeness: number // 0-100
}

export interface FounderInfo {
  name: string
  role: string | null
}

/** Web search result */
export interface WebSearchResult {
  title: string
  description: string
  url: string
}

/** Scraped content */
export interface ScrapedContent {
  url: string
  title: string
  text: string
  success: boolean
  error?: string
}

// ============================================================================
// SUPERVISOR TYPES
// ============================================================================

export interface SupervisorCheckResult {
  runId: string
  agent: MaintenanceAgent
  checkStatus: CheckStatus
  actionTaken: SupervisorAction
  retryRunId?: string
  details: SupervisorCheckDetails
}

export interface SupervisorCheckDetails {
  runFound: boolean
  runStatus?: MaintenanceStatus
  runDurationMs?: number
  itemsProcessed?: number
  expectedMinItems: number
  qualityBefore?: DataQualityMetrics
  qualityAfter?: DataQualityMetrics
  qualityDelta?: DataQualityDelta
  reason: string
  /** Last errors from the run (up to 3) */
  lastErrors?: CondensedError[]
  /** Error pattern summary */
  errorSummary?: ErrorSummary
}

/** Condensed error for notifications */
export interface CondensedError {
  message: string
  category: ErrorCategory
  stackFirstLine?: string
  timestamp?: Date
}

/** Summary of error patterns */
export interface ErrorSummary {
  totalErrors: number
  byCategory: Record<ErrorCategory, number>
  dominantCategory: ErrorCategory
  dominantPercentage: number
}

// ============================================================================
// RETRY STRATEGY TYPES
// ============================================================================

/** Categories of errors for retry strategy */
export type ErrorCategory =
  | 'RATE_LIMIT'    // 429, quota exceeded
  | 'TIMEOUT'       // Request/operation timeout
  | 'NETWORK'       // Connection errors, DNS, etc.
  | 'AUTH'          // 401, 403, API key issues
  | 'RESOURCE'      // Out of memory, disk, etc.
  | 'VALIDATION'    // Bad input, schema errors
  | 'EXTERNAL_API'  // Third-party API errors (not rate limit)
  | 'DATABASE'      // Prisma/DB errors
  | 'UNKNOWN'       // Unclassified errors

/** Strategy for retrying a failed run */
export interface RetryStrategy {
  /** Whether to retry at all */
  shouldRetry: boolean
  /** Delay before retry in ms */
  delayMs: number
  /** Reason for the decision */
  reason: string
  /** Adjustments to make for the retry */
  adjustments: RetryAdjustments
}

/** Adjustments to apply when retrying */
export interface RetryAdjustments {
  /** Increase timeout by this factor (e.g., 1.5 = 50% more) */
  timeoutMultiplier?: number
  /** Reduce batch size */
  reduceBatchSize?: boolean
  /** Skip certain phases */
  skipPhases?: string[]
  /** Use backup API/service */
  useBackupService?: boolean
}

/** Configuration for backoff calculation */
export interface BackoffConfig {
  /** Base delay in ms for rate limit errors */
  rateLimitBaseMs: number
  /** Base delay in ms for other errors */
  defaultBaseMs: number
  /** Maximum delay in ms */
  maxDelayMs: number
  /** Jitter factor (0-1) */
  jitterFactor: number
}

export interface DataQualityMetrics {
  totalCompanies: number
  totalFundingRounds: number
  avgDataQuality: number
  withIndustryPct: number
  withDescriptionPct: number
  withFoundersPct: number
  withInvestorsPct: number
  withStatusPct: number
  stalePct: number
  statusBreakdown: ActivityStatusBreakdown
}

export interface DataQualityDelta {
  companiesDelta: number
  fundingRoundsDelta: number
  qualityDelta: number
  industryDelta: number
  descriptionDelta: number
  foundersDelta: number
  investorsDelta: number
  statusDelta: number
  staleDelta: number
}

// ============================================================================
// WEEKLY REPORT TYPES
// ============================================================================

export interface WeeklyReportData {
  weekStart: Date
  weekEnd: Date
  overallStatus: HealthStatus
  agentSummaries: {
    cleaner: AgentWeeklySummary
    sourcer: AgentWeeklySummary
    completer: AgentWeeklySummary
  }
  dataQualityStart: DataQualityMetrics
  dataQualityEnd: DataQualityMetrics
  qualityDelta: DataQualityDelta
  issues: WeeklyIssue[]
  totalCost: number
  costByAgent: {
    cleaner: number
    sourcer: number
    completer: number
  }
}

export interface AgentWeeklySummary {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  itemsProcessed: number
  itemsUpdated: number
  itemsCreated: number
  retriesTriggered: number
  retriesSuccessful: number
  avgDurationMs: number
  totalCost: number
}

export interface WeeklyIssue {
  date: Date
  agent: MaintenanceAgent
  issue: string
  resolution: string
  recovered: boolean
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface TelegramMessage {
  chatId: string
  text: string
  parseMode?: 'Markdown' | 'HTML'
  disableNotification?: boolean
}

export interface TelegramCommandContext {
  chatId: string
  command: string
  args: string[]
  messageId: number
}

export type TelegramCommand =
  | 'status'
  | 'run'
  | 'report'
  | 'health'
  | 'last'
  | 'retry'
  | 'cancel'
  | 'help'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

// ============================================================================
// INDUSTRY TAXONOMY
// ============================================================================

export const INDUSTRY_TAXONOMY = [
  // Software & Tech
  'SaaS B2B',
  'SaaS B2C',
  'Developer Tools',
  'Cloud Infrastructure',
  'Data & Analytics',
  'AI Pure-Play',
  'Cybersecurity',
  'Enterprise Software',
  // FinTech
  'FinTech Payments',
  'FinTech Banking',
  'FinTech Lending',
  'FinTech Insurance',
  'FinTech WealthTech',
  // Health
  'HealthTech',
  'MedTech',
  'BioTech',
  'Pharma',
  'Mental Health',
  // Commerce
  'E-commerce',
  'Marketplace B2C',
  'Marketplace B2B',
  'Retail Tech',
  'D2C Brands',
  // Marketing & Sales
  'MarTech',
  'AdTech',
  'Sales Tech',
  // HR & Work
  'HRTech',
  'Recruiting',
  'Future of Work',
  'Corporate Learning',
  // Real Estate & Construction
  'PropTech',
  'ConstructionTech',
  'Smart Building',
  // Transport & Logistics
  'Logistics',
  'Delivery',
  'Mobility',
  'Automotive',
  // Sustainability
  'CleanTech',
  'Energy',
  'GreenTech',
  'AgriTech',
  'FoodTech',
  // Other
  'EdTech',
  'LegalTech',
  'GovTech',
  'SpaceTech',
  'Defense',
  'Gaming',
  'Entertainment',
  'Social',
  'Consumer Apps',
  'Hardware',
  'DeepTech',
  'Robotics',
  'TravelTech',
] as const

export type Industry = (typeof INDUSTRY_TAXONOMY)[number]

// ============================================================================
// FUNDING STAGE NORMALIZATION
// ============================================================================

export const STAGE_NORMALIZATION: Record<string, string> = {
  // Pre-seed variants
  'pre-seed': 'PRE_SEED',
  preseed: 'PRE_SEED',
  'pre seed': 'PRE_SEED',
  angel: 'PRE_SEED',
  // Seed variants
  seed: 'SEED',
  amorçage: 'SEED',
  // Series A variants
  'series a': 'SERIES_A',
  'série a': 'SERIES_A',
  'serie a': 'SERIES_A',
  a: 'SERIES_A',
  // Series B variants
  'series b': 'SERIES_B',
  'série b': 'SERIES_B',
  'serie b': 'SERIES_B',
  b: 'SERIES_B',
  // Series C variants
  'series c': 'SERIES_C',
  'série c': 'SERIES_C',
  'serie c': 'SERIES_C',
  c: 'SERIES_C',
  // Series D+
  'series d': 'SERIES_D',
  'série d': 'SERIES_D',
  'serie d': 'SERIES_D',
  d: 'SERIES_D',
  'series e': 'SERIES_E',
  'series f': 'SERIES_F',
  // Late stage
  'late stage': 'LATE_STAGE',
  growth: 'GROWTH',
  // IPO
  ipo: 'IPO',
  'pre-ipo': 'PRE_IPO',
  // Other
  bridge: 'BRIDGE',
  convertible: 'CONVERTIBLE',
  debt: 'DEBT',
  grant: 'GRANT',
}

// ============================================================================
// COUNTRY NORMALIZATION
// ============================================================================

export const COUNTRY_NORMALIZATION: Record<string, string> = {
  // USA
  usa: 'United States',
  'u.s.a.': 'United States',
  us: 'United States',
  'u.s.': 'United States',
  america: 'United States',
  'états-unis': 'United States',
  'etats-unis': 'United States',
  // UK
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  'royaume-uni': 'United Kingdom',
  // Germany
  germany: 'Germany',
  deutschland: 'Germany',
  allemagne: 'Germany',
  // France
  france: 'France',
  // Spain
  spain: 'Spain',
  espagne: 'Spain',
  españa: 'Spain',
  // Italy
  italy: 'Italy',
  italie: 'Italy',
  italia: 'Italy',
  // Netherlands
  netherlands: 'Netherlands',
  'pays-bas': 'Netherlands',
  holland: 'Netherlands',
  // Belgium
  belgium: 'Belgium',
  belgique: 'Belgium',
  // Switzerland
  switzerland: 'Switzerland',
  suisse: 'Switzerland',
  schweiz: 'Switzerland',
  // Israel
  israel: 'Israel',
  israël: 'Israel',
  // China
  china: 'China',
  chine: 'China',
  // India
  india: 'India',
  inde: 'India',
  // Brazil
  brazil: 'Brazil',
  brésil: 'Brazil',
  brasil: 'Brazil',
  // Canada
  canada: 'Canada',
  // Australia
  australia: 'Australia',
  australie: 'Australia',
}

// ============================================================================
// COMPANY STATUS MAPPING
// ============================================================================

export const ACTIVITY_STATUS_TO_COMPANY_STATUS: Record<string, CompanyStatus> = {
  active: 'ACTIVE',
  shutdown: 'SHUTDOWN',
  acquired: 'ACQUIRED',
  pivoted: 'ACTIVE', // Pivoted companies are still active
  inactive: 'INACTIVE',
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAINTENANCE_CONSTANTS = {
  // Timeouts
  AGENT_TIMEOUT_MS: 2 * 60 * 60 * 1000, // 2 hours
  SCRAPE_TIMEOUT_MS: 30 * 1000, // 30 seconds
  LLM_TIMEOUT_MS: 60 * 1000, // 60 seconds

  // Limits
  COMPLETER_BATCH_SIZE: 50, // Petit batch pour éviter timeout (search + scrape + LLM)
  SOURCER_MAX_ARTICLES_PER_SOURCE: 50,
  MAX_RETRY_ATTEMPTS: 2,

  // Historical import settings
  HISTORICAL_MIN_DATE: new Date('2021-01-01'),
  HISTORICAL_ITEMS_PER_BATCH: 20, // Items per batch for paginated sources
  HISTORICAL_MAX_BATCHES_PER_RUN: 2, // Max batches per source per run (avoid Vercel timeout)

  // Thresholds
  MIN_CONFIDENCE_THRESHOLD: 70,
  DUPLICATE_SIMILARITY_THRESHOLD: 0.9, // 90% similar
  STALE_DAYS_THRESHOLD: 30,

  // Costs (USD)
  DEEPSEEK_COST_PER_1K_INPUT: 0.0003,
  DEEPSEEK_COST_PER_1K_OUTPUT: 0.0012,

  // Scheduling
  SUPERVISOR_CHECK_DELAY_HOURS: 2,
} as const
