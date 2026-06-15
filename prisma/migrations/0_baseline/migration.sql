-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CreditAction" AS ENUM ('PURCHASE', 'AUTO_REFILL', 'FREE_GRANT', 'QUICK_SCAN', 'DEEP_DIVE', 'AI_BOARD', 'LIVE_COACHING', 'RE_ANALYSIS', 'THESIS_REBUTTAL', 'THESIS_REEXTRACT', 'EXTRACTION_STANDARD_PAGE', 'EXTRACTION_HIGH_PAGE', 'EXTRACTION_SUPREME_PAGE', 'REFUND', 'ADMIN_ADJUSTMENT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATER');

-- CreateEnum
CREATE TYPE "FundingInstrument" AS ENUM ('EQUITY', 'SAFE', 'BSA_AIR', 'CONVERTIBLE_NOTE', 'BRIDGE');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('SCREENING', 'ANALYZING', 'IN_DD', 'PASSED', 'INVESTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentSourceKind" AS ENUM ('FILE', 'EMAIL', 'NOTE');

-- CreateEnum
CREATE TYPE "CorpusRole" AS ENUM ('GENERAL', 'DILIGENCE_RESPONSE');

-- CreateEnum
CREATE TYPE "LinkedQuestionSource" AS ENUM ('RED_FLAG', 'QUESTION_TO_ASK');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PITCH_DECK', 'FINANCIAL_MODEL', 'CAP_TABLE', 'TERM_SHEET', 'INVESTOR_MEMO', 'FINANCIAL_STATEMENTS', 'LEGAL_DOCS', 'MARKET_STUDY', 'PRODUCT_DEMO', 'CALL_TRANSCRIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractionRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'READY_WITH_WARNINGS', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractionPageStatus" AS ENUM ('READY', 'READY_WITH_WARNINGS', 'NEEDS_REVIEW', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('NATIVE_TEXT', 'OCR', 'HYBRID', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExtractionOverrideType" AS ENUM ('BYPASS_PAGE', 'MANUAL_VALUE', 'EXCLUDE_PAGE');

-- CreateEnum
CREATE TYPE "RedFlagCategory" AS ENUM ('FOUNDER', 'FINANCIAL', 'MARKET', 'PRODUCT', 'DEAL_STRUCTURE', 'THESIS', 'THESIS_VS_REALITY');

-- CreateEnum
CREATE TYPE "RedFlagSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RedFlagStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('SCREENING', 'FULL_DD');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BoardStatus" AS ENUM ('INITIALIZING', 'ANALYZING', 'DEBATING', 'VOTING', 'COMPLETED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "BoardVerdict" AS ENUM ('VERY_FAVORABLE', 'FAVORABLE', 'CONTRASTED', 'VIGILANCE', 'ALERT_DOMINANT', 'NEED_MORE_INFO', 'GO', 'NO_GO');

-- CreateEnum
CREATE TYPE "ConsensusLevel" AS ENUM ('UNANIMOUS', 'STRONG', 'SPLIT', 'MINORITY');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('INITIAL_ANALYSIS', 'DEBATE', 'FINAL_VOTE', 'THESIS_DEBATE');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'ACQUIRED', 'SHUTDOWN', 'INACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EnrichmentSource" AS ENUM ('ARTICLE_IMPORT', 'WEB_SEARCH', 'PITCH_DECK', 'MANUAL', 'API', 'LLM_EXTRACTION');

-- CreateEnum
CREATE TYPE "CostAlertType" AS ENUM ('DEAL_THRESHOLD', 'USER_DAILY', 'ANALYSIS_ANOMALY', 'BOARD_COST', 'MONTHLY_BUDGET');

-- CreateEnum
CREATE TYPE "CostAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceAgent" AS ENUM ('DB_CLEANER', 'DB_SOURCER', 'DB_COMPLETER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TriggerSource" AS ENUM ('CRON', 'SUPERVISOR', 'MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASSED', 'WARNING', 'FAILED', 'MISSED', 'TIMEOUT', 'PENDING');

-- CreateEnum
CREATE TYPE "SupervisorAction" AS ENUM ('NONE', 'RETRY', 'ALERT_ONLY', 'ESCALATE');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DealMode" AS ENUM ('SIMPLE', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "TrancheStatus" AS ENUM ('PENDING', 'ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('RED_FLAG', 'DEVILS_ADVOCATE', 'CONDITIONS');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "EvidenceSignalKind" AS ENUM ('DOCUMENT_DATE', 'EMAIL_SENT_AT', 'CAP_TABLE_AS_OF', 'BALANCE_SHEET_AS_OF', 'FINANCIAL_PERIOD_ACTUAL', 'FINANCIAL_PERIOD_FORECAST', 'ATTACHMENT_RELATION', 'EMAIL_LIKE_WARNING', 'STALE_DOCUMENT_WARNING', 'VALUATION_CLAIM', 'METRIC_CLAIM');

-- CreateEnum
CREATE TYPE "EvidenceSignalPrecision" AS ENUM ('YEAR', 'MONTH', 'DAY', 'RANGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EvidenceSignalConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EvidenceSignalMethod" AS ENUM ('DETERMINISTIC', 'LLM', 'HUMAN_OVERRIDE', 'IMPORT');

-- CreateEnum
CREATE TYPE "EvidenceSignalResolutionAction" AS ENUM ('RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "investmentPreferences" JSONB,
    "cguAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "priceEur" INTEGER NOT NULL,
    "perCredit" DOUBLE PRECISION NOT NULL,
    "stripePriceId" TEXT,
    "stripeRefillPriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCreditBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalPurchased" INTEGER NOT NULL DEFAULT 0,
    "lastPackName" TEXT,
    "balanceFree" INTEGER NOT NULL DEFAULT 10,
    "freeResetStartedAt" TIMESTAMP(3),
    "autoRefill" BOOLEAN NOT NULL DEFAULT false,
    "autoRefillPackName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "freeAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "action" "CreditAction" NOT NULL,
    "description" TEXT,
    "dealId" TEXT,
    "documentId" TEXT,
    "documentExtractionRunId" TEXT,
    "pageNumber" INTEGER,
    "idempotencyKey" TEXT,
    "packName" TEXT,
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "website" TEXT,
    "description" TEXT,
    "sector" TEXT,
    "stage" "DealStage",
    "instrument" "FundingInstrument",
    "geography" TEXT,
    "arr" DECIMAL(12,2),
    "growthRate" DECIMAL(5,2),
    "amountRequested" DECIMAL(12,2),
    "valuationPre" DECIMAL(14,2),
    "status" "DealStatus" NOT NULL DEFAULT 'SCREENING',
    "globalScore" INTEGER,
    "fundamentalsScore" INTEGER,
    "conditionsScore" INTEGER,
    "teamScore" INTEGER,
    "marketScore" INTEGER,
    "productScore" INTEGER,
    "financialsScore" INTEGER,
    "conditionsAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Founder" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "previousVentures" JSONB,
    "verifiedInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Founder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInProfileCache" (
    "id" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "profileData" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInProfileCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "customType" TEXT,
    "comments" TEXT,
    "storagePath" TEXT,
    "storageUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sourceKind" "DocumentSourceKind" NOT NULL DEFAULT 'FILE',
    "corpusRole" "CorpusRole" NOT NULL DEFAULT 'GENERAL',
    "sourceDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "sourceAuthor" TEXT,
    "sourceSubject" TEXT,
    "sourceMetadata" JSONB,
    "linkedQuestionSource" "LinkedQuestionSource",
    "linkedQuestionText" TEXT,
    "linkedRedFlagId" TEXT,
    "corpusParentDocumentId" TEXT,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractionQuality" INTEGER,
    "extractionMetrics" JSONB,
    "extractionWarnings" JSONB,
    "requiresOCR" BOOLEAN NOT NULL DEFAULT false,
    "ocrProcessed" BOOLEAN NOT NULL DEFAULT false,
    "ocrText" TEXT,
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentDocumentId" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "supersededAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractionRun" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "status" "ExtractionRunStatus" NOT NULL DEFAULT 'PENDING',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "pagesSucceeded" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "pagesSkipped" INTEGER NOT NULL DEFAULT 0,
    "coverageRatio" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "qualityScore" INTEGER,
    "readyForAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "extractionVersion" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "contentHash" TEXT,
    "corpusTextHash" TEXT,
    "summaryMetrics" JSONB,
    "warnings" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractionPage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "status" "ExtractionPageStatus" NOT NULL,
    "method" "ExtractionMethod" NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" INTEGER,
    "confidence" TEXT,
    "hasTables" BOOLEAN NOT NULL DEFAULT false,
    "hasCharts" BOOLEAN NOT NULL DEFAULT false,
    "hasFinancialKeywords" BOOLEAN NOT NULL DEFAULT false,
    "hasTeamKeywords" BOOLEAN NOT NULL DEFAULT false,
    "hasMarketKeywords" BOOLEAN NOT NULL DEFAULT false,
    "requiresOCR" BOOLEAN NOT NULL DEFAULT false,
    "ocrProcessed" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT,
    "artifactVersion" TEXT,
    "artifact" JSONB,
    "pageImageHash" TEXT,
    "errorMessage" TEXT,
    "textPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtractionPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractionOverride" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "overrideType" "ExtractionOverrideType" NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtractionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "documentName" TEXT,
    "phase" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtractionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisExtractionRun" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisDocument" (
    "analysisId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisDocument_pkey" PRIMARY KEY ("analysisId","documentId")
);

-- CreateTable
CREATE TABLE "RedFlag" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "category" "RedFlagCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RedFlagSeverity" NOT NULL,
    "confidenceScore" DECIMAL(3,2) NOT NULL,
    "evidence" JSONB NOT NULL,
    "questionsToAsk" TEXT[],
    "status" "RedFlagStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "AnalysisType" NOT NULL,
    "mode" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "totalAgents" INTEGER NOT NULL,
    "completedAgents" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "results" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalCost" DECIMAL(6,4),
    "totalTimeMs" INTEGER,
    "dealFingerprint" TEXT,
    "useReAct" BOOLEAN NOT NULL DEFAULT false,
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "negotiationStrategy" JSONB,
    "corpusSnapshotId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "thesisId" TEXT,
    "thesisDecision" TEXT,
    "thesisDecisionAt" TIMESTAMP(3),
    "thesisBypass" BOOLEAN NOT NULL DEFAULT false,
    "dispatchEventId" TEXT,
    "analysisReadyEmailClaimedAt" TIMESTAMP(3),
    "analysisReadyEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "idempotencyKey" TEXT,
    "extractionCost" DOUBLE PRECISION,
    "reformulated" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "moat" TEXT,
    "pathToExit" TEXT,
    "verdict" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "loadBearing" JSONB NOT NULL,
    "ycLens" JSONB NOT NULL,
    "thielLens" JSONB NOT NULL,
    "angelDeskLens" JSONB NOT NULL,
    "alerts" JSONB NOT NULL,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationJson" JSONB,
    "decision" TEXT,
    "decisionAt" TIMESTAMP(3),
    "rebuttalText" TEXT,
    "rebuttalVerdict" TEXT,
    "rebuttalCount" INTEGER NOT NULL DEFAULT 0,
    "sourceDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceHash" TEXT NOT NULL,
    "corpusSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusSnapshot" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorpusSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusSnapshotMember" (
    "corpusSnapshotId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorpusSnapshotMember_pkey" PRIMARY KEY ("corpusSnapshotId","documentId")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "p25" DECIMAL(10,2) NOT NULL,
    "median" DECIMAL(10,2) NOT NULL,
    "p75" DECIMAL(10,2) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorBenchmark" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectorBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoredFinding" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT NOT NULL,
    "normalizedValue" DOUBLE PRECISION,
    "percentile" INTEGER,
    "assessment" TEXT NOT NULL,
    "benchmarkData" JSONB,
    "confidenceLevel" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "confidenceFactors" JSONB,
    "evidence" JSONB,
    "reasoningTraceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoredFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasoningTrace" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "totalIterations" INTEGER NOT NULL,
    "finalConfidence" DOUBLE PRECISION NOT NULL,
    "executionTimeMs" INTEGER NOT NULL,
    "selfCritique" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReasoningTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateRecord" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "contradictionId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "participants" TEXT[],
    "claims" JSONB NOT NULL,
    "rounds" JSONB NOT NULL,
    "resolvedBy" TEXT,
    "winner" TEXT,
    "resolution" TEXT,
    "finalValue" TEXT,
    "resolutionConfidence" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DebateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "fromAgent" TEXT NOT NULL,
    "toAgent" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "replyTo" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "processedBy" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateTransition" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisCheckpoint" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "completedAgents" TEXT[],
    "pendingAgents" TEXT[],
    "failedAgents" JSONB,
    "findings" JSONB,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIBoardSession" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thesisId" TEXT,
    "corpusSnapshotId" TEXT,
    "status" "BoardStatus" NOT NULL DEFAULT 'INITIALIZING',
    "verdict" "BoardVerdict",
    "consensusLevel" "ConsensusLevel",
    "stoppingReason" TEXT,
    "consensusPoints" JSONB,
    "frictionPoints" JSONB,
    "questionsForFounder" JSONB,
    "totalRounds" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(8,4),
    "totalTimeMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIBoardSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIBoardMember" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "initialAnalysis" JSONB,
    "finalVote" "BoardVerdict",
    "finalConfidence" INTEGER,
    "voteJustification" TEXT,
    "analysisCost" DECIMAL(6,4),
    "debateCost" DECIMAL(6,4),
    "voteCost" DECIMAL(6,4),
    "totalCost" DECIMAL(6,4),
    "failedAt" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIBoardMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIBoardRound" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundType" "RoundType" NOT NULL,
    "responses" JSONB NOT NULL,
    "currentVerdicts" JSONB,
    "consensusReached" BOOLEAN NOT NULL DEFAULT false,
    "majorityStable" BOOLEAN NOT NULL DEFAULT false,
    "totalCost" DECIMAL(6,4),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIBoardRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBoardCredits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyAllocation" INTEGER NOT NULL DEFAULT 0,
    "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "extraCredits" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBoardCredits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDealUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 5,
    "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "tier1Count" INTEGER NOT NULL DEFAULT 0,
    "tier2Count" INTEGER NOT NULL DEFAULT 0,
    "tier3Count" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDealUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "shortDescription" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "crunchbaseUrl" TEXT,
    "industry" TEXT,
    "subIndustry" TEXT,
    "businessModel" TEXT,
    "targetMarket" TEXT,
    "useCases" TEXT[],
    "headquarters" TEXT,
    "city" TEXT,
    "region" TEXT,
    "foundedYear" INTEGER,
    "founders" JSONB,
    "employeeCount" INTEGER,
    "employeeRange" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusDetails" TEXT,
    "statusUpdatedAt" TIMESTAMP(3),
    "acquiredBy" TEXT,
    "acquiredDate" TIMESTAMP(3),
    "shutdownDate" TIMESTAMP(3),
    "totalRaised" DECIMAL(14,2),
    "lastValuation" DECIMAL(14,2),
    "lastRoundStage" TEXT,
    "lastRoundDate" TIMESTAMP(3),
    "arr" DECIMAL(14,2),
    "mrr" DECIMAL(14,2),
    "revenue" DECIMAL(14,2),
    "growthRate" INTEGER,
    "customers" INTEGER,
    "nrr" INTEGER,
    "isProfitable" BOOLEAN,
    "isEbitdaPositive" BOOLEAN,
    "competitors" TEXT[],
    "notableClients" TEXT[],
    "dataQuality" INTEGER DEFAULT 0,
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enrichmentLockedAt" TIMESTAMP(3),
    "enrichmentLockedBy" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEnrichment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "EnrichmentSource" NOT NULL,
    "sourceUrl" TEXT,
    "sourceDate" TIMESTAMP(3),
    "fieldsUpdated" TEXT[],
    "previousData" JSONB,
    "newData" JSONB NOT NULL,
    "confidence" INTEGER,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingRound" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT,
    "description" TEXT,
    "tagline" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "useCases" TEXT[],
    "businessModel" TEXT,
    "targetMarket" TEXT,
    "amount" DECIMAL(14,2),
    "amountUsd" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stage" TEXT,
    "stageNormalized" TEXT,
    "geography" TEXT,
    "city" TEXT,
    "region" TEXT,
    "sector" TEXT,
    "sectorNormalized" TEXT,
    "subSector" TEXT,
    "investors" TEXT[],
    "investorsFunds" TEXT[],
    "investorsAngels" TEXT[],
    "investorsCorporates" TEXT[],
    "leadInvestor" TEXT,
    "valuationPre" DECIMAL(14,2),
    "valuationPost" DECIMAL(14,2),
    "valuationMultiple" DOUBLE PRECISION,
    "isDownRound" BOOLEAN,
    "arrAtRaise" DECIMAL(14,2),
    "mrrAtRaise" DECIMAL(14,2),
    "growthRateAtRaise" DOUBLE PRECISION,
    "employeesAtRaise" INTEGER,
    "fundingDate" TIMESTAMP(3),
    "announcedDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceId" TEXT,
    "employeeCount" INTEGER,
    "foundedYear" INTEGER,
    "useOfFunds" TEXT,
    "hiringPlans" TEXT,
    "expansionPlans" TEXT,
    "enrichedData" JSONB,
    "confidenceScore" INTEGER,
    "isEnriched" BOOLEAN NOT NULL DEFAULT false,
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'rss',
    "sourceUrl" TEXT,
    "totalRounds" INTEGER NOT NULL DEFAULT 0,
    "lastImportAt" TIMESTAMP(3),
    "lastImportCount" INTEGER,
    "cursor" TEXT,
    "cursorType" TEXT,
    "historicalImportComplete" BOOLEAN NOT NULL DEFAULT false,
    "oldestDateImported" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
    "refreshIntervalHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "analysisId" TEXT,
    "boardSessionId" TEXT,
    "model" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cost" DECIMAL(8,6) NOT NULL,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAlert" (
    "id" TEXT NOT NULL,
    "type" "CostAlertType" NOT NULL,
    "severity" "CostAlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "dealId" TEXT,
    "dealName" TEXT,
    "analysisId" TEXT,
    "currentCost" DECIMAL(10,4) NOT NULL,
    "threshold" DECIMAL(10,4) NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "notificationChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostThreshold" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "dealWarning" DECIMAL(8,2) NOT NULL DEFAULT 5.00,
    "dealCritical" DECIMAL(8,2) NOT NULL DEFAULT 15.00,
    "userDailyWarning" DECIMAL(8,2) NOT NULL DEFAULT 10.00,
    "userDailyCritical" DECIMAL(8,2) NOT NULL DEFAULT 25.00,
    "analysisMax" DECIMAL(8,2) NOT NULL DEFAULT 5.00,
    "boardMax" DECIMAL(8,2) NOT NULL DEFAULT 2.00,
    "monthlyBudget" DECIMAL(10,2),
    "notifyOnWarning" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnCritical" BOOLEAN NOT NULL DEFAULT true,
    "notificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRun" (
    "id" TEXT NOT NULL,
    "agent" "MaintenanceAgent" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" "TriggerSource" NOT NULL DEFAULT 'CRON',
    "parentRunId" TEXT,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "errors" JSONB,
    "totalCost" DECIMAL(8,4),
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "webSearches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupervisorCheck" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checkStatus" "CheckStatus" NOT NULL,
    "checkDetails" JSONB,
    "actionTaken" "SupervisorAction" NOT NULL DEFAULT 'NONE',
    "retryRunId" TEXT,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "telegramMsgId" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "isRetryCheck" BOOLEAN NOT NULL DEFAULT false,
    "retryCheckAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupervisorCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "overallStatus" "HealthStatus" NOT NULL,
    "cleanerSummary" JSONB NOT NULL,
    "sourcerSummary" JSONB NOT NULL,
    "completerSummary" JSONB NOT NULL,
    "dataQualityStart" JSONB NOT NULL,
    "dataQualityEnd" JSONB NOT NULL,
    "qualityDelta" JSONB NOT NULL,
    "issuesDetected" INTEGER NOT NULL DEFAULT 0,
    "retriesTriggered" INTEGER NOT NULL DEFAULT 0,
    "retriesSuccessful" INTEGER NOT NULL DEFAULT 0,
    "retriesFailed" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "costByAgent" JSONB,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "telegramSentAt" TIMESTAMP(3),
    "reportHtml" TEXT,
    "reportText" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualitySnapshot" (
    "id" TEXT NOT NULL,
    "totalCompanies" INTEGER NOT NULL,
    "totalFundingRounds" INTEGER NOT NULL,
    "avgDataQuality" DOUBLE PRECISION NOT NULL,
    "companiesWithIndustry" INTEGER NOT NULL,
    "companiesWithDescription" INTEGER NOT NULL,
    "companiesWithFounders" INTEGER NOT NULL,
    "companiesWithWebsite" INTEGER NOT NULL,
    "companiesWithInvestors" INTEGER NOT NULL,
    "companiesActive" INTEGER NOT NULL DEFAULT 0,
    "companiesShutdown" INTEGER NOT NULL DEFAULT 0,
    "companiesAcquired" INTEGER NOT NULL DEFAULT 0,
    "companiesInactive" INTEGER NOT NULL DEFAULT 0,
    "companiesStatusUnknown" INTEGER NOT NULL DEFAULT 0,
    "duplicateCompanies" INTEGER NOT NULL DEFAULT 0,
    "orphanedRounds" INTEGER NOT NULL DEFAULT 0,
    "staleCompanies" INTEGER NOT NULL DEFAULT 0,
    "withIndustryPct" DOUBLE PRECISION NOT NULL,
    "withDescriptionPct" DOUBLE PRECISION NOT NULL,
    "withFoundersPct" DOUBLE PRECISION NOT NULL,
    "withInvestorsPct" DOUBLE PRECISION NOT NULL,
    "withStatusPct" DOUBLE PRECISION NOT NULL,
    "stalePct" DOUBLE PRECISION NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'scheduled',
    "relatedRunId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMergeLog" (
    "id" TEXT NOT NULL,
    "mergedFromId" TEXT NOT NULL,
    "mergedIntoId" TEXT NOT NULL,
    "mergedFromName" TEXT NOT NULL,
    "mergedIntoName" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "fieldsTransferred" TEXT[],
    "fundingRoundsTransferred" INTEGER NOT NULL DEFAULT 0,
    "enrichmentsTransferred" INTEGER NOT NULL DEFAULT 0,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "similarityDetails" JSONB,
    "matchReason" TEXT,
    "mergedBy" TEXT NOT NULL DEFAULT 'DB_CLEANER',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextEngineSnapshot" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "dealIntelligence" JSONB,
    "marketData" JSONB,
    "competitiveLandscape" JSONB,
    "newsSentiment" JSONB,
    "peopleGraph" JSONB,
    "websiteContent" JSONB,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "connectorResults" JSONB,
    "sources" JSONB,
    "contextQuality" JSONB,
    "sourceHealth" JSONB,
    "inputData" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextEngineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMCallLog" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT,
    "boardSessionId" TEXT,
    "agentName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "systemPrompt" TEXT,
    "userPrompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "response" TEXT NOT NULL,
    "finishReason" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "cost" DECIMAL(10,6) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "firstTokenMs" INTEGER,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "displayValue" TEXT NOT NULL,
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceConfidence" INTEGER NOT NULL,
    "truthConfidence" INTEGER,
    "extractedText" TEXT,
    "sourceMetadata" JSONB,
    "validAt" TIMESTAMP(3),
    "periodType" TEXT,
    "periodLabel" TEXT,
    "reliability" JSONB,
    "eventType" TEXT NOT NULL,
    "supersedesEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "FactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealChatContext" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "keyFacts" JSONB NOT NULL,
    "agentSummaries" JSONB NOT NULL,
    "redFlagsContext" JSONB NOT NULL,
    "extractedData" JSONB,
    "lastAnalysisId" TEXT,
    "lastAnalysisMode" TEXT,
    "benchmarkData" JSONB,
    "comparableDeals" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealChatContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "totalCost" DECIMAL(8,4),
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "contextUsed" JSONB,
    "toolsCalled" JSONB,
    "intent" TEXT,
    "intentConfidence" DOUBLE PRECISION,
    "cost" DECIMAL(8,6),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "model" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTerms" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "valuationPre" DECIMAL(14,2),
    "amountRaised" DECIMAL(12,2),
    "dilutionPct" DECIMAL(5,2),
    "instrumentType" TEXT,
    "instrumentDetails" TEXT,
    "liquidationPref" TEXT,
    "antiDilution" TEXT,
    "proRataRights" BOOLEAN,
    "informationRights" BOOLEAN,
    "boardSeat" TEXT,
    "founderVesting" BOOLEAN,
    "vestingDurationMonths" INTEGER,
    "vestingCliffMonths" INTEGER,
    "esopPct" DECIMAL(5,2),
    "dragAlong" BOOLEAN,
    "tagAlong" BOOLEAN,
    "ratchet" BOOLEAN,
    "payToPlay" BOOLEAN,
    "milestoneTranches" BOOLEAN,
    "nonCompete" BOOLEAN,
    "customConditions" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "aiAnalysisAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStructure" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "mode" "DealMode" NOT NULL DEFAULT 'SIMPLE',
    "totalInvestment" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTranche" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "trancheType" TEXT NOT NULL,
    "typeDetails" TEXT,
    "amount" DECIMAL(14,2),
    "valuationPre" DECIMAL(14,2),
    "equityPct" DECIMAL(5,2),
    "triggerType" TEXT,
    "triggerDetails" TEXT,
    "triggerDeadline" TIMESTAMP(3),
    "instrumentTerms" JSONB,
    "liquidationPref" TEXT,
    "antiDilution" TEXT,
    "proRataRights" BOOLEAN,
    "status" "TrancheStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealTranche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertResolution" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "status" "ResolutionStatus" NOT NULL,
    "justification" TEXT NOT NULL,
    "alertTitle" TEXT NOT NULL,
    "alertSeverity" TEXT NOT NULL,
    "alertCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTermsVersion" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "termsSnapshot" JSONB NOT NULL,
    "conditionsScore" INTEGER,
    "analysisSnapshot" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealTermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "userId" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "meetingPlatform" TEXT NOT NULL,
    "botId" TEXT,
    "botJoinUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "errorMessage" TEXT,
    "reanalysisRequestId" TEXT,
    "reanalysisMode" TEXT,
    "reanalysisRequestedAt" TIMESTAMP(3),
    "participants" JSONB NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'fr-en',
    "llmModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
    "totalCost" DECIMAL(8,4),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "screenShareActive" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "speakerRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT true,
    "timestampStart" DOUBLE PRECISION NOT NULL,
    "timestampEnd" DOUBLE PRECISION NOT NULL,
    "classification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingCard" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT,
    "reference" TEXT,
    "suggestedQuestion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "addressedAt" TIMESTAMP(3),
    "addressedBy" TEXT,
    "triggeredByChunkId" TEXT,
    "isVisualTrigger" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenCapture" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" DOUBLE PRECISION NOT NULL,
    "contentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keyData" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "newInsights" JSONB NOT NULL,
    "suggestedQuestion" TEXT,
    "perceptualHash" TEXT NOT NULL,
    "analysisCost" DECIMAL(8,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "newInformation" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "questionsAsked" JSONB NOT NULL,
    "remainingQuestions" JSONB NOT NULL,
    "confidenceDelta" JSONB NOT NULL,
    "sessionStats" JSONB NOT NULL,
    "markdownReport" TEXT NOT NULL,
    "condensedIntel" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSignal" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "signalScopeKey" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "extractorVersion" TEXT NOT NULL,
    "sourceTextHash" TEXT,
    "kind" "EvidenceSignalKind" NOT NULL,
    "valueJson" JSONB NOT NULL,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "asOfDate" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "precision" "EvidenceSignalPrecision" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" "EvidenceSignalConfidence" NOT NULL,
    "sourceMethod" "EvidenceSignalMethod" NOT NULL,
    "evidenceText" TEXT,
    "pageNumber" INTEGER,
    "sheetName" TEXT,
    "charOffset" INTEGER,
    "signalHash" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSignalResolution" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "signalKey" VARCHAR(512) NOT NULL,
    "action" "EvidenceSignalResolutionAction" NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSignalResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPack_name_key" ON "CreditPack"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserCreditBalance_userId_key" ON "UserCreditBalance"("userId");

-- CreateIndex
CREATE INDEX "UserCreditBalance_userId_idx" ON "UserCreditBalance"("userId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_action_idx" ON "CreditTransaction"("userId", "action");

-- CreateIndex
CREATE INDEX "CreditTransaction_dealId_idx" ON "CreditTransaction"("dealId");

-- CreateIndex
CREATE INDEX "CreditTransaction_documentId_pageNumber_idx" ON "CreditTransaction"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "CreditTransaction_documentExtractionRunId_idx" ON "CreditTransaction"("documentExtractionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Deal_userId_idx" ON "Deal"("userId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_userId_status_createdAt_idx" ON "Deal"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Founder_dealId_idx" ON "Founder"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfileCache_linkedinUrl_key" ON "LinkedInProfileCache"("linkedinUrl");

-- CreateIndex
CREATE INDEX "LinkedInProfileCache_linkedinUrl_idx" ON "LinkedInProfileCache"("linkedinUrl");

-- CreateIndex
CREATE INDEX "Document_dealId_idx" ON "Document"("dealId");

-- CreateIndex
CREATE INDEX "Document_processingStatus_idx" ON "Document"("processingStatus");

-- CreateIndex
CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");

-- CreateIndex
CREATE INDEX "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");

-- CreateIndex
CREATE INDEX "Document_dealId_sourceDate_idx" ON "Document"("dealId", "sourceDate");

-- CreateIndex
CREATE INDEX "Document_dealId_sourceKind_idx" ON "Document"("dealId", "sourceKind");

-- CreateIndex
CREATE INDEX "Document_dealId_corpusRole_idx" ON "Document"("dealId", "corpusRole");

-- CreateIndex
CREATE INDEX "Document_linkedRedFlagId_idx" ON "Document"("linkedRedFlagId");

-- CreateIndex
CREATE INDEX "Document_corpusParentDocumentId_idx" ON "Document"("corpusParentDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_dealId_key" ON "Document"("id", "dealId");

-- CreateIndex
CREATE INDEX "DocumentExtractionRun_documentId_idx" ON "DocumentExtractionRun"("documentId");

-- CreateIndex
CREATE INDEX "DocumentExtractionRun_status_idx" ON "DocumentExtractionRun"("status");

-- CreateIndex
CREATE INDEX "DocumentExtractionRun_readyForAnalysis_idx" ON "DocumentExtractionRun"("readyForAnalysis");

-- CreateIndex
CREATE INDEX "DocumentExtractionRun_contentHash_idx" ON "DocumentExtractionRun"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtractionRun_id_documentId_key" ON "DocumentExtractionRun"("id", "documentId");

-- CreateIndex
CREATE INDEX "DocumentExtractionPage_runId_idx" ON "DocumentExtractionPage"("runId");

-- CreateIndex
CREATE INDEX "DocumentExtractionPage_status_idx" ON "DocumentExtractionPage"("status");

-- CreateIndex
CREATE INDEX "DocumentExtractionPage_pageNumber_idx" ON "DocumentExtractionPage"("pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtractionPage_runId_pageNumber_key" ON "DocumentExtractionPage"("runId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentExtractionOverride_runId_idx" ON "DocumentExtractionOverride"("runId");

-- CreateIndex
CREATE INDEX "DocumentExtractionOverride_createdByUserId_idx" ON "DocumentExtractionOverride"("createdByUserId");

-- CreateIndex
CREATE INDEX "DocumentExtractionOverride_overrideType_idx" ON "DocumentExtractionOverride"("overrideType");

-- CreateIndex
CREATE INDEX "DocumentExtractionProgress_userId_idx" ON "DocumentExtractionProgress"("userId");

-- CreateIndex
CREATE INDEX "DocumentExtractionProgress_expiresAt_idx" ON "DocumentExtractionProgress"("expiresAt");

-- CreateIndex
CREATE INDEX "AnalysisExtractionRun_analysisId_idx" ON "AnalysisExtractionRun"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisExtractionRun_runId_idx" ON "AnalysisExtractionRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisExtractionRun_analysisId_runId_key" ON "AnalysisExtractionRun"("analysisId", "runId");

-- CreateIndex
CREATE INDEX "AnalysisDocument_documentId_idx" ON "AnalysisDocument"("documentId");

-- CreateIndex
CREATE INDEX "AnalysisDocument_analysisId_idx" ON "AnalysisDocument"("analysisId");

-- CreateIndex
CREATE INDEX "RedFlag_dealId_idx" ON "RedFlag"("dealId");

-- CreateIndex
CREATE INDEX "RedFlag_severity_idx" ON "RedFlag"("severity");

-- CreateIndex
CREATE INDEX "RedFlag_dealId_severity_idx" ON "RedFlag"("dealId", "severity");

-- CreateIndex
CREATE INDEX "Analysis_dealId_idx" ON "Analysis"("dealId");

-- CreateIndex
CREATE INDEX "Analysis_status_idx" ON "Analysis"("status");

-- CreateIndex
CREATE INDEX "Analysis_dealId_mode_dealFingerprint_idx" ON "Analysis"("dealId", "mode", "dealFingerprint");

-- CreateIndex
CREATE INDEX "Analysis_dealId_status_createdAt_idx" ON "Analysis"("dealId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Analysis_corpusSnapshotId_idx" ON "Analysis"("corpusSnapshotId");

-- CreateIndex
CREATE INDEX "Analysis_thesisId_idx" ON "Analysis"("thesisId");

-- CreateIndex
CREATE INDEX "Analysis_dispatchEventId_idx" ON "Analysis"("dispatchEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_idempotencyKey_key" ON "Thesis"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Thesis_dealId_isLatest_idx" ON "Thesis"("dealId", "isLatest");

-- CreateIndex
CREATE INDEX "Thesis_dealId_version_idx" ON "Thesis"("dealId", "version");

-- CreateIndex
CREATE INDEX "Thesis_verdict_idx" ON "Thesis"("verdict");

-- CreateIndex
CREATE INDEX "Thesis_corpusSnapshotId_idx" ON "Thesis"("corpusSnapshotId");

-- CreateIndex
CREATE INDEX "Thesis_dealId_createdAt_idx" ON "Thesis"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "CorpusSnapshot_dealId_idx" ON "CorpusSnapshot"("dealId");

-- CreateIndex
CREATE INDEX "CorpusSnapshot_dealId_createdAt_idx" ON "CorpusSnapshot"("dealId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorpusSnapshot_dealId_sourceHash_key" ON "CorpusSnapshot"("dealId", "sourceHash");

-- CreateIndex
CREATE INDEX "CorpusSnapshotMember_documentId_idx" ON "CorpusSnapshotMember"("documentId");

-- CreateIndex
CREATE INDEX "CorpusSnapshotMember_corpusSnapshotId_idx" ON "CorpusSnapshotMember"("corpusSnapshotId");

-- CreateIndex
CREATE INDEX "CorpusSnapshotMember_extractionRunId_idx" ON "CorpusSnapshotMember"("extractionRunId");

-- CreateIndex
CREATE INDEX "Benchmark_sector_stage_idx" ON "Benchmark"("sector", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_sector_stage_metricName_key" ON "Benchmark"("sector", "stage", "metricName");

-- CreateIndex
CREATE UNIQUE INDEX "SectorBenchmark_sector_key" ON "SectorBenchmark"("sector");

-- CreateIndex
CREATE INDEX "SectorBenchmark_sector_idx" ON "SectorBenchmark"("sector");

-- CreateIndex
CREATE INDEX "ScoredFinding_analysisId_idx" ON "ScoredFinding"("analysisId");

-- CreateIndex
CREATE INDEX "ScoredFinding_agentName_idx" ON "ScoredFinding"("agentName");

-- CreateIndex
CREATE INDEX "ScoredFinding_metric_idx" ON "ScoredFinding"("metric");

-- CreateIndex
CREATE INDEX "ReasoningTrace_analysisId_idx" ON "ReasoningTrace"("analysisId");

-- CreateIndex
CREATE INDEX "ReasoningTrace_agentName_idx" ON "ReasoningTrace"("agentName");

-- CreateIndex
CREATE UNIQUE INDEX "DebateRecord_contradictionId_key" ON "DebateRecord"("contradictionId");

-- CreateIndex
CREATE INDEX "DebateRecord_analysisId_idx" ON "DebateRecord"("analysisId");

-- CreateIndex
CREATE INDEX "DebateRecord_status_idx" ON "DebateRecord"("status");

-- CreateIndex
CREATE INDEX "AgentMessage_analysisId_idx" ON "AgentMessage"("analysisId");

-- CreateIndex
CREATE INDEX "AgentMessage_fromAgent_idx" ON "AgentMessage"("fromAgent");

-- CreateIndex
CREATE INDEX "AgentMessage_toAgent_idx" ON "AgentMessage"("toAgent");

-- CreateIndex
CREATE INDEX "AgentMessage_messageType_idx" ON "AgentMessage"("messageType");

-- CreateIndex
CREATE INDEX "StateTransition_analysisId_idx" ON "StateTransition"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisCheckpoint_analysisId_idx" ON "AnalysisCheckpoint"("analysisId");

-- CreateIndex
CREATE INDEX "AIBoardSession_dealId_idx" ON "AIBoardSession"("dealId");

-- CreateIndex
CREATE INDEX "AIBoardSession_userId_idx" ON "AIBoardSession"("userId");

-- CreateIndex
CREATE INDEX "AIBoardSession_status_idx" ON "AIBoardSession"("status");

-- CreateIndex
CREATE INDEX "AIBoardSession_thesisId_idx" ON "AIBoardSession"("thesisId");

-- CreateIndex
CREATE INDEX "AIBoardSession_corpusSnapshotId_idx" ON "AIBoardSession"("corpusSnapshotId");

-- CreateIndex
CREATE INDEX "AIBoardMember_sessionId_idx" ON "AIBoardMember"("sessionId");

-- CreateIndex
CREATE INDEX "AIBoardRound_sessionId_idx" ON "AIBoardRound"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AIBoardRound_sessionId_roundNumber_key" ON "AIBoardRound"("sessionId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UserBoardCredits_userId_key" ON "UserBoardCredits"("userId");

-- CreateIndex
CREATE INDEX "UserBoardCredits_userId_idx" ON "UserBoardCredits"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDealUsage_userId_key" ON "UserDealUsage"("userId");

-- CreateIndex
CREATE INDEX "UserDealUsage_userId_idx" ON "UserDealUsage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_industry_idx" ON "Company"("industry");

-- CreateIndex
CREATE INDEX "Company_headquarters_idx" ON "Company"("headquarters");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_totalRaised_idx" ON "Company"("totalRaised");

-- CreateIndex
CREATE INDEX "Company_lastRoundDate_idx" ON "Company"("lastRoundDate");

-- CreateIndex
CREATE INDEX "Company_enrichmentLockedAt_idx" ON "Company"("enrichmentLockedAt");

-- CreateIndex
CREATE INDEX "CompanyEnrichment_companyId_idx" ON "CompanyEnrichment"("companyId");

-- CreateIndex
CREATE INDEX "CompanyEnrichment_source_idx" ON "CompanyEnrichment"("source");

-- CreateIndex
CREATE INDEX "CompanyEnrichment_createdAt_idx" ON "CompanyEnrichment"("createdAt");

-- CreateIndex
CREATE INDEX "FundingRound_companyId_idx" ON "FundingRound"("companyId");

-- CreateIndex
CREATE INDEX "FundingRound_companyName_idx" ON "FundingRound"("companyName");

-- CreateIndex
CREATE INDEX "FundingRound_companySlug_idx" ON "FundingRound"("companySlug");

-- CreateIndex
CREATE INDEX "FundingRound_stageNormalized_idx" ON "FundingRound"("stageNormalized");

-- CreateIndex
CREATE INDEX "FundingRound_sectorNormalized_idx" ON "FundingRound"("sectorNormalized");

-- CreateIndex
CREATE INDEX "FundingRound_geography_idx" ON "FundingRound"("geography");

-- CreateIndex
CREATE INDEX "FundingRound_region_idx" ON "FundingRound"("region");

-- CreateIndex
CREATE INDEX "FundingRound_fundingDate_idx" ON "FundingRound"("fundingDate");

-- CreateIndex
CREATE INDEX "FundingRound_amountUsd_idx" ON "FundingRound"("amountUsd");

-- CreateIndex
CREATE INDEX "FundingRound_isMigrated_idx" ON "FundingRound"("isMigrated");

-- CreateIndex
CREATE INDEX "FundingRound_businessModel_idx" ON "FundingRound"("businessModel");

-- CreateIndex
CREATE INDEX "FundingRound_targetMarket_idx" ON "FundingRound"("targetMarket");

-- CreateIndex
CREATE INDEX "FundingRound_isDownRound_idx" ON "FundingRound"("isDownRound");

-- CreateIndex
CREATE UNIQUE INDEX "FundingRound_source_sourceId_key" ON "FundingRound"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingSource_name_key" ON "FundingSource"("name");

-- CreateIndex
CREATE INDEX "CostEvent_userId_idx" ON "CostEvent"("userId");

-- CreateIndex
CREATE INDEX "CostEvent_dealId_idx" ON "CostEvent"("dealId");

-- CreateIndex
CREATE INDEX "CostEvent_analysisId_idx" ON "CostEvent"("analysisId");

-- CreateIndex
CREATE INDEX "CostEvent_boardSessionId_idx" ON "CostEvent"("boardSessionId");

-- CreateIndex
CREATE INDEX "CostEvent_model_idx" ON "CostEvent"("model");

-- CreateIndex
CREATE INDEX "CostEvent_agent_idx" ON "CostEvent"("agent");

-- CreateIndex
CREATE INDEX "CostEvent_createdAt_idx" ON "CostEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CostEvent_userId_createdAt_idx" ON "CostEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CostAlert_userId_idx" ON "CostAlert"("userId");

-- CreateIndex
CREATE INDEX "CostAlert_dealId_idx" ON "CostAlert"("dealId");

-- CreateIndex
CREATE INDEX "CostAlert_type_idx" ON "CostAlert"("type");

-- CreateIndex
CREATE INDEX "CostAlert_severity_idx" ON "CostAlert"("severity");

-- CreateIndex
CREATE INDEX "CostAlert_acknowledged_idx" ON "CostAlert"("acknowledged");

-- CreateIndex
CREATE INDEX "CostAlert_createdAt_idx" ON "CostAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CostThreshold_userId_key" ON "CostThreshold"("userId");

-- CreateIndex
CREATE INDEX "CostThreshold_userId_idx" ON "CostThreshold"("userId");

-- CreateIndex
CREATE INDEX "MaintenanceRun_agent_idx" ON "MaintenanceRun"("agent");

-- CreateIndex
CREATE INDEX "MaintenanceRun_status_idx" ON "MaintenanceRun"("status");

-- CreateIndex
CREATE INDEX "MaintenanceRun_startedAt_idx" ON "MaintenanceRun"("startedAt");

-- CreateIndex
CREATE INDEX "MaintenanceRun_triggeredBy_idx" ON "MaintenanceRun"("triggeredBy");

-- CreateIndex
CREATE INDEX "MaintenanceRun_agent_startedAt_idx" ON "MaintenanceRun"("agent", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorCheck_runId_key" ON "SupervisorCheck"("runId");

-- CreateIndex
CREATE INDEX "SupervisorCheck_checkStatus_idx" ON "SupervisorCheck"("checkStatus");

-- CreateIndex
CREATE INDEX "SupervisorCheck_checkedAt_idx" ON "SupervisorCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "SupervisorCheck_actionTaken_idx" ON "SupervisorCheck"("actionTaken");

-- CreateIndex
CREATE INDEX "WeeklyReport_overallStatus_idx" ON "WeeklyReport"("overallStatus");

-- CreateIndex
CREATE INDEX "WeeklyReport_generatedAt_idx" ON "WeeklyReport"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_weekStart_key" ON "WeeklyReport"("weekStart");

-- CreateIndex
CREATE INDEX "DataQualitySnapshot_capturedAt_idx" ON "DataQualitySnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "DataQualitySnapshot_trigger_idx" ON "DataQualitySnapshot"("trigger");

-- CreateIndex
CREATE INDEX "CompanyMergeLog_mergedFromId_idx" ON "CompanyMergeLog"("mergedFromId");

-- CreateIndex
CREATE INDEX "CompanyMergeLog_mergedIntoId_idx" ON "CompanyMergeLog"("mergedIntoId");

-- CreateIndex
CREATE INDEX "CompanyMergeLog_createdAt_idx" ON "CompanyMergeLog"("createdAt");

-- CreateIndex
CREATE INDEX "CompanyMergeLog_maintenanceRunId_idx" ON "CompanyMergeLog"("maintenanceRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CacheEntry_key_key" ON "CacheEntry"("key");

-- CreateIndex
CREATE INDEX "CacheEntry_expiresAt_idx" ON "CacheEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "ContextEngineSnapshot_dealId_idx" ON "ContextEngineSnapshot"("dealId");

-- CreateIndex
CREATE INDEX "ContextEngineSnapshot_expiresAt_idx" ON "ContextEngineSnapshot"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContextEngineSnapshot_dealId_key" ON "ContextEngineSnapshot"("dealId");

-- CreateIndex
CREATE INDEX "LLMCallLog_analysisId_idx" ON "LLMCallLog"("analysisId");

-- CreateIndex
CREATE INDEX "LLMCallLog_boardSessionId_idx" ON "LLMCallLog"("boardSessionId");

-- CreateIndex
CREATE INDEX "LLMCallLog_agentName_idx" ON "LLMCallLog"("agentName");

-- CreateIndex
CREATE INDEX "LLMCallLog_model_idx" ON "LLMCallLog"("model");

-- CreateIndex
CREATE INDEX "LLMCallLog_createdAt_idx" ON "LLMCallLog"("createdAt");

-- CreateIndex
CREATE INDEX "LLMCallLog_isError_idx" ON "LLMCallLog"("isError");

-- CreateIndex
CREATE UNIQUE INDEX "FactEvent_idempotencyKey_key" ON "FactEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FactEvent_dealId_idx" ON "FactEvent"("dealId");

-- CreateIndex
CREATE INDEX "FactEvent_dealId_factKey_idx" ON "FactEvent"("dealId", "factKey");

-- CreateIndex
CREATE INDEX "FactEvent_dealId_category_idx" ON "FactEvent"("dealId", "category");

-- CreateIndex
CREATE INDEX "FactEvent_eventType_idx" ON "FactEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "FactEvent_dealId_factKey_createdAt_eventType_key" ON "FactEvent"("dealId", "factKey", "createdAt", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "DealChatContext_dealId_key" ON "DealChatContext"("dealId");

-- CreateIndex
CREATE INDEX "DealChatContext_dealId_idx" ON "DealChatContext"("dealId");

-- CreateIndex
CREATE INDEX "DealChatContext_lastAnalysisId_idx" ON "DealChatContext"("lastAnalysisId");

-- CreateIndex
CREATE INDEX "ChatConversation_dealId_idx" ON "ChatConversation"("dealId");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_idx" ON "ChatConversation"("userId");

-- CreateIndex
CREATE INDEX "ChatConversation_dealId_userId_idx" ON "ChatConversation"("dealId", "userId");

-- CreateIndex
CREATE INDEX "ChatConversation_dealId_userId_updatedAt_idx" ON "ChatConversation"("dealId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatConversation_status_idx" ON "ChatConversation"("status");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_role_idx" ON "ChatMessage"("role");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "Webhook_userId_idx" ON "Webhook"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DealTerms_dealId_key" ON "DealTerms"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealStructure_dealId_key" ON "DealStructure"("dealId");

-- CreateIndex
CREATE INDEX "DealStructure_dealId_idx" ON "DealStructure"("dealId");

-- CreateIndex
CREATE INDEX "DealTranche_structureId_idx" ON "DealTranche"("structureId");

-- CreateIndex
CREATE INDEX "DealTranche_structureId_orderIndex_idx" ON "DealTranche"("structureId", "orderIndex");

-- CreateIndex
CREATE INDEX "AlertResolution_dealId_idx" ON "AlertResolution"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertResolution_dealId_alertKey_key" ON "AlertResolution"("dealId", "alertKey");

-- CreateIndex
CREATE INDEX "DealTermsVersion_dealId_idx" ON "DealTermsVersion"("dealId");

-- CreateIndex
CREATE INDEX "DealTermsVersion_dealId_version_idx" ON "DealTermsVersion"("dealId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_documentId_key" ON "LiveSession"("documentId");

-- CreateIndex
CREATE INDEX "LiveSession_dealId_idx" ON "LiveSession"("dealId");

-- CreateIndex
CREATE INDEX "LiveSession_userId_idx" ON "LiveSession"("userId");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_botId_idx" ON "LiveSession"("botId");

-- CreateIndex
CREATE INDEX "LiveSession_userId_status_idx" ON "LiveSession"("userId", "status");

-- CreateIndex
CREATE INDEX "LiveSession_userId_createdAt_idx" ON "LiveSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveSession_reanalysisRequestedAt_idx" ON "LiveSession"("reanalysisRequestedAt");

-- CreateIndex
CREATE INDEX "TranscriptChunk_sessionId_idx" ON "TranscriptChunk"("sessionId");

-- CreateIndex
CREATE INDEX "TranscriptChunk_sessionId_speakerRole_idx" ON "TranscriptChunk"("sessionId", "speakerRole");

-- CreateIndex
CREATE INDEX "TranscriptChunk_sessionId_isFinal_classification_idx" ON "TranscriptChunk"("sessionId", "isFinal", "classification");

-- CreateIndex
CREATE INDEX "CoachingCard_sessionId_idx" ON "CoachingCard"("sessionId");

-- CreateIndex
CREATE INDEX "CoachingCard_sessionId_status_idx" ON "CoachingCard"("sessionId", "status");

-- CreateIndex
CREATE INDEX "ScreenCapture_sessionId_idx" ON "ScreenCapture"("sessionId");

-- CreateIndex
CREATE INDEX "ScreenCapture_sessionId_timestamp_idx" ON "ScreenCapture"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummary_sessionId_key" ON "SessionSummary"("sessionId");

-- CreateIndex
CREATE INDEX "EvidenceSignal_dealId_kind_idx" ON "EvidenceSignal"("dealId", "kind");

-- CreateIndex
CREATE INDEX "EvidenceSignal_dealId_asOfDate_idx" ON "EvidenceSignal"("dealId", "asOfDate");

-- CreateIndex
CREATE INDEX "EvidenceSignal_documentId_kind_idx" ON "EvidenceSignal"("documentId", "kind");

-- CreateIndex
CREATE INDEX "EvidenceSignal_extractionRunId_documentId_idx" ON "EvidenceSignal"("extractionRunId", "documentId");

-- CreateIndex
CREATE INDEX "EvidenceSignal_kind_confidence_idx" ON "EvidenceSignal"("kind", "confidence");

-- CreateIndex
CREATE INDEX "EvidenceSignal_signalScopeKey_idx" ON "EvidenceSignal"("signalScopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSignal_documentId_documentVersion_signalScopeKey_ki_key" ON "EvidenceSignal"("documentId", "documentVersion", "signalScopeKey", "kind", "signalHash");

-- CreateIndex
CREATE INDEX "EvidenceSignalResolution_dealId_idx" ON "EvidenceSignalResolution"("dealId");

-- CreateIndex
CREATE INDEX "EvidenceSignalResolution_userId_idx" ON "EvidenceSignalResolution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSignalResolution_dealId_signalKey_key" ON "EvidenceSignalResolution"("dealId", "signalKey");

-- AddForeignKey
ALTER TABLE "UserCreditBalance" ADD CONSTRAINT "UserCreditBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Founder" ADD CONSTRAINT "Founder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_linkedRedFlagId_fkey" FOREIGN KEY ("linkedRedFlagId") REFERENCES "RedFlag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_corpusParentDocumentId_fkey" FOREIGN KEY ("corpusParentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractionRun" ADD CONSTRAINT "DocumentExtractionRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractionPage" ADD CONSTRAINT "DocumentExtractionPage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractionOverride" ADD CONSTRAINT "DocumentExtractionOverride_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractionOverride" ADD CONSTRAINT "DocumentExtractionOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisExtractionRun" ADD CONSTRAINT "AnalysisExtractionRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisExtractionRun" ADD CONSTRAINT "AnalysisExtractionRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisDocument" ADD CONSTRAINT "AnalysisDocument_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisDocument" ADD CONSTRAINT "AnalysisDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedFlag" ADD CONSTRAINT "RedFlag_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_corpusSnapshotId_fkey" FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_corpusSnapshotId_fkey" FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusSnapshot" ADD CONSTRAINT "CorpusSnapshot_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusSnapshotMember" ADD CONSTRAINT "CorpusSnapshotMember_corpusSnapshotId_fkey" FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusSnapshotMember" ADD CONSTRAINT "CorpusSnapshotMember_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusSnapshotMember" ADD CONSTRAINT "CorpusSnapshotMember_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "DocumentExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoredFinding" ADD CONSTRAINT "ScoredFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasoningTrace" ADD CONSTRAINT "ReasoningTrace_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebateRecord" ADD CONSTRAINT "DebateRecord_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateTransition" ADD CONSTRAINT "StateTransition_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCheckpoint" ADD CONSTRAINT "AnalysisCheckpoint_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIBoardMember" ADD CONSTRAINT "AIBoardMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIBoardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIBoardRound" ADD CONSTRAINT "AIBoardRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIBoardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEnrichment" ADD CONSTRAINT "CompanyEnrichment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRound" ADD CONSTRAINT "FundingRound_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorCheck" ADD CONSTRAINT "SupervisorCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MaintenanceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEvent" ADD CONSTRAINT "FactEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEvent" ADD CONSTRAINT "FactEvent_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTerms" ADD CONSTRAINT "DealTerms_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStructure" ADD CONSTRAINT "DealStructure_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTranche" ADD CONSTRAINT "DealTranche_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "DealStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertResolution" ADD CONSTRAINT "AlertResolution_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTermsVersion" ADD CONSTRAINT "DealTermsVersion_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptChunk" ADD CONSTRAINT "TranscriptChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingCard" ADD CONSTRAINT "CoachingCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenCapture" ADD CONSTRAINT "ScreenCapture_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "EvidenceSignal_documentId_dealId_fkey" FOREIGN KEY ("documentId", "dealId") REFERENCES "Document"("id", "dealId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "EvidenceSignal_extractionRunId_documentId_fkey" FOREIGN KEY ("extractionRunId", "documentId") REFERENCES "DocumentExtractionRun"("id", "documentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignalResolution" ADD CONSTRAINT "EvidenceSignalResolution_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignalResolution" ADD CONSTRAINT "EvidenceSignalResolution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- OBJETS HORS-MODÈLE PRISMA (non couverts par migrate diff — repris de
-- migrations-archive/20260420174500_current_facts_view_canonical)
-- CURRENT FACTS MATERIALIZED VIEW + refresh function
-- ============================================================================

CREATE MATERIALIZED VIEW current_facts_mv AS
SELECT DISTINCT ON ("dealId", "factKey")
  id,
  "dealId",
  "factKey",
  category,
  value,
  "displayValue",
  unit,
  source,
  "sourceDocumentId",
  "sourceConfidence",
  "truthConfidence",
  "extractedText",
  "sourceMetadata",
  "validAt",
  "periodType",
  "periodLabel",
  reliability,
  "eventType",
  "supersedesEventId",
  "createdAt",
  "createdBy",
  reason
FROM "FactEvent"
WHERE "eventType" NOT IN ('DELETED', 'SUPERSEDED', 'PENDING_REVIEW')
ORDER BY "dealId", "factKey", "createdAt" DESC;

CREATE UNIQUE INDEX idx_current_facts_mv_deal_fact
ON current_facts_mv ("dealId", "factKey");

CREATE INDEX idx_current_facts_mv_deal
ON current_facts_mv ("dealId");

CREATE INDEX idx_current_facts_mv_category
ON current_facts_mv ("dealId", category);

CREATE OR REPLACE FUNCTION refresh_current_facts_mv()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY current_facts_mv;
END;
$$ LANGUAGE plpgsql;
