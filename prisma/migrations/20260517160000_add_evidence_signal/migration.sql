-- Evidence Engine Phase 1: add EvidenceSignal table + composite uniques for cross-tenant/cross-doc FKs.
-- See docs-private/evidence-engine-phase1-schema.md (révision 3) for the full design rationale.
--
-- Integrity invariants enforced at the DB level:
--   1. Cross-tenant FK (documentId, dealId) -> Document(id, dealId)
--   2. Cross-document run FK (extractionRunId, documentId) -> DocumentExtractionRun(id, documentId)
--      MATCH SIMPLE (Postgres default): NULL on extractionRunId disables the FK check on that row,
--      but does NOT require documentId to also be NULL.
--   3. Idempotence unique tuple (documentId, documentVersion, signalScopeKey, kind, signalHash)
--      ALL NON-NULL -> NULL != NULL bypass impossible.
--
-- evidenceText AND valueJson are stored as encryptText() / encryptJsonField() envelopes at write
-- time (application layer responsibility, not enforced by DB).

-- CreateEnum
CREATE TYPE "EvidenceSignalKind" AS ENUM ('DOCUMENT_DATE', 'EMAIL_SENT_AT', 'CAP_TABLE_AS_OF', 'BALANCE_SHEET_AS_OF', 'FINANCIAL_PERIOD_ACTUAL', 'FINANCIAL_PERIOD_FORECAST', 'ATTACHMENT_RELATION', 'EMAIL_LIKE_WARNING', 'STALE_DOCUMENT_WARNING', 'VALUATION_CLAIM', 'METRIC_CLAIM');

-- CreateEnum
CREATE TYPE "EvidenceSignalPrecision" AS ENUM ('YEAR', 'MONTH', 'DAY', 'RANGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EvidenceSignalConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EvidenceSignalMethod" AS ENUM ('DETERMINISTIC', 'LLM', 'HUMAN_OVERRIDE', 'IMPORT');

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

-- CreateIndex (idempotence unique — ALL FIELDS NON-NULL, no NULL != NULL bypass)
CREATE UNIQUE INDEX "EvidenceSignal_documentId_documentVersion_signalScopeKey_ki_key" ON "EvidenceSignal"("documentId", "documentVersion", "signalScopeKey", "kind", "signalHash");

-- CreateIndex
CREATE INDEX "EvidenceSignal_dealId_kind_idx" ON "EvidenceSignal"("dealId", "kind");

-- CreateIndex
CREATE INDEX "EvidenceSignal_dealId_asOfDate_idx" ON "EvidenceSignal"("dealId", "asOfDate");

-- CreateIndex
CREATE INDEX "EvidenceSignal_documentId_kind_idx" ON "EvidenceSignal"("documentId", "kind");

-- CreateIndex (covers reverse lookup for composite FK on (extractionRunId, documentId))
CREATE INDEX "EvidenceSignal_extractionRunId_documentId_idx" ON "EvidenceSignal"("extractionRunId", "documentId");

-- CreateIndex
CREATE INDEX "EvidenceSignal_kind_confidence_idx" ON "EvidenceSignal"("kind", "confidence");

-- CreateIndex
CREATE INDEX "EvidenceSignal_signalScopeKey_idx" ON "EvidenceSignal"("signalScopeKey");

-- CreateIndex (composite target required by EvidenceSignal cross-tenant FK)
CREATE UNIQUE INDEX "Document_id_dealId_key" ON "Document"("id", "dealId");

-- CreateIndex (composite target required by EvidenceSignal cross-document run FK)
CREATE UNIQUE INDEX "DocumentExtractionRun_id_documentId_key" ON "DocumentExtractionRun"("id", "documentId");

-- AddForeignKey (invariant #1: cross-tenant integrity)
ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "EvidenceSignal_documentId_dealId_fkey" FOREIGN KEY ("documentId", "dealId") REFERENCES "Document"("id", "dealId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (invariant #2: cross-document run integrity, MATCH SIMPLE default tolerates extractionRunId IS NULL)
ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "EvidenceSignal_extractionRunId_documentId_fkey" FOREIGN KEY ("extractionRunId", "documentId") REFERENCES "DocumentExtractionRun"("id", "documentId") ON DELETE CASCADE ON UPDATE CASCADE;
