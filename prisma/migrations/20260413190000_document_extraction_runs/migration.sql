-- Strict document extraction audit trail.
-- Keeps the existing Document facade fields, but makes page-level extraction
-- state and user overrides first-class database facts.

CREATE TYPE "ExtractionRunStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'READY_WITH_WARNINGS',
  'BLOCKED',
  'FAILED'
);

CREATE TYPE "ExtractionPageStatus" AS ENUM (
  'READY',
  'READY_WITH_WARNINGS',
  'NEEDS_REVIEW',
  'FAILED',
  'SKIPPED'
);

CREATE TYPE "ExtractionMethod" AS ENUM (
  'NATIVE_TEXT',
  'OCR',
  'HYBRID',
  'SKIPPED'
);

CREATE TYPE "ExtractionOverrideType" AS ENUM (
  'BYPASS_PAGE',
  'MANUAL_VALUE',
  'EXCLUDE_PAGE'
);

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
  "errorMessage" TEXT,
  "textPreview" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentExtractionPage_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "AnalysisExtractionRun" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalysisExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentExtractionRun_documentId_idx" ON "DocumentExtractionRun"("documentId");
CREATE INDEX "DocumentExtractionRun_status_idx" ON "DocumentExtractionRun"("status");
CREATE INDEX "DocumentExtractionRun_readyForAnalysis_idx" ON "DocumentExtractionRun"("readyForAnalysis");
CREATE INDEX "DocumentExtractionRun_contentHash_idx" ON "DocumentExtractionRun"("contentHash");

CREATE UNIQUE INDEX "DocumentExtractionPage_runId_pageNumber_key" ON "DocumentExtractionPage"("runId", "pageNumber");
CREATE INDEX "DocumentExtractionPage_runId_idx" ON "DocumentExtractionPage"("runId");
CREATE INDEX "DocumentExtractionPage_status_idx" ON "DocumentExtractionPage"("status");
CREATE INDEX "DocumentExtractionPage_pageNumber_idx" ON "DocumentExtractionPage"("pageNumber");

CREATE INDEX "DocumentExtractionOverride_runId_idx" ON "DocumentExtractionOverride"("runId");
CREATE INDEX "DocumentExtractionOverride_createdByUserId_idx" ON "DocumentExtractionOverride"("createdByUserId");
CREATE INDEX "DocumentExtractionOverride_overrideType_idx" ON "DocumentExtractionOverride"("overrideType");

CREATE UNIQUE INDEX "AnalysisExtractionRun_analysisId_runId_key" ON "AnalysisExtractionRun"("analysisId", "runId");
CREATE INDEX "AnalysisExtractionRun_analysisId_idx" ON "AnalysisExtractionRun"("analysisId");
CREATE INDEX "AnalysisExtractionRun_runId_idx" ON "AnalysisExtractionRun"("runId");

ALTER TABLE "DocumentExtractionRun"
  ADD CONSTRAINT "DocumentExtractionRun_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentExtractionPage"
  ADD CONSTRAINT "DocumentExtractionPage_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentExtractionOverride"
  ADD CONSTRAINT "DocumentExtractionOverride_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentExtractionOverride"
  ADD CONSTRAINT "DocumentExtractionOverride_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisExtractionRun"
  ADD CONSTRAINT "AnalysisExtractionRun_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisExtractionRun"
  ADD CONSTRAINT "AnalysisExtractionRun_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
