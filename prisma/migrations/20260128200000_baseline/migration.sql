warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATER');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('SCREENING', 'ANALYZING', 'IN_DD', 'PASSED', 'INVESTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PITCH_DECK', 'FINANCIAL_MODEL', 'CAP_TABLE', 'TERM_SHEET', 'INVESTOR_MEMO', 'FINANCIAL_STATEMENTS', 'LEGAL_DOCS', 'MARKET_STUDY', 'PRODUCT_DEMO', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RedFlagCategory" AS ENUM ('FOUNDER', 'FINANCIAL', 'MARKET', 'PRODUCT', 'DEAL_STRUCTURE');

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
CREATE TYPE "BoardVerdict" AS ENUM ('GO', 'NO_GO', 'NEED_MORE_INFO');

-- CreateEnum
CREATE TYPE "ConsensusLevel" AS ENUM ('UNANIMOUS', 'STRONG', 'SPLIT', 'MINORITY');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('INITIAL_ANALYSIS', 'DEBATE', 'FINAL_VOTE');

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

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "investmentPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "geography" TEXT,
    "arr" DECIMAL(12,2),
    "growthRate" DECIMAL(5,2),
    "amountRequested" DECIMAL(12,2),
    "valuationPre" DECIMAL(14,2),
    "status" "DealStatus" NOT NULL DEFAULT 'SCREENING',
    "globalScore" INTEGER,
    "teamScore" INTEGER,
    "marketScore" INTEGER,
    "productScore" INTEGER,
    "financialsScore" INTEGER,
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
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "customType" TEXT,
    "comments" TEXT,
    "storagePath" TEXT NOT NULL,
    "storageUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractionQuality" INTEGER,
    "extractionMetrics" JSONB,
    "extractionWarnings" JSONB,
    "requiresOCR" BOOLEAN NOT NULL DEFAULT false,
    "ocrProcessed" BOOLEAN NOT NULL DEFAULT false,
    "ocrText" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
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
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "connectorResults" JSONB,
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
    "extractedText" TEXT,
    "validAt" TIMESTAMP(3),
    "periodType" TEXT,
    "periodLabel" TEXT,
    "eventType" TEXT NOT NULL,
    "supersedesEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "FactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredits" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 10,
    "monthlyAllocation" INTEGER NOT NULL DEFAULT 10,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextResetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dealId" TEXT,
    "analysisId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Deal_userId_idx" ON "Deal"("userId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Founder_dealId_idx" ON "Founder"("dealId");

-- CreateIndex
CREATE INDEX "Document_dealId_idx" ON "Document"("dealId");

-- CreateIndex
CREATE INDEX "RedFlag_dealId_idx" ON "RedFlag"("dealId");

-- CreateIndex
CREATE INDEX "RedFlag_severity_idx" ON "RedFlag"("severity");

-- CreateIndex
CREATE INDEX "Analysis_dealId_idx" ON "Analysis"("dealId");

-- CreateIndex
CREATE INDEX "Analysis_dealId_mode_dealFingerprint_idx" ON "Analysis"("dealId", "mode", "dealFingerprint");

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
CREATE INDEX "FactEvent_dealId_idx" ON "FactEvent"("dealId");

-- CreateIndex
CREATE INDEX "FactEvent_dealId_factKey_idx" ON "FactEvent"("dealId", "factKey");

-- CreateIndex
CREATE INDEX "FactEvent_dealId_category_idx" ON "FactEvent"("dealId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredits_clerkUserId_key" ON "UserCredits"("clerkUserId");

-- CreateIndex
CREATE INDEX "CreditTransaction_clerkUserId_idx" ON "CreditTransaction"("clerkUserId");

-- CreateIndex
CREATE INDEX "CreditTransaction_clerkUserId_createdAt_idx" ON "CreditTransaction"("clerkUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Founder" ADD CONSTRAINT "Founder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedFlag" ADD CONSTRAINT "RedFlag_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_clerkUserId_fkey" FOREIGN KEY ("clerkUserId") REFERENCES "UserCredits"("clerkUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

