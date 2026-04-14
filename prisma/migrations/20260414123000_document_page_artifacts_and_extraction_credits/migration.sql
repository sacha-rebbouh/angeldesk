-- Document extraction artifacts and extraction credit actions

ALTER TYPE "CreditAction" ADD VALUE IF NOT EXISTS 'EXTRACTION_STANDARD_PAGE';
ALTER TYPE "CreditAction" ADD VALUE IF NOT EXISTS 'EXTRACTION_HIGH_PAGE';
ALTER TYPE "CreditAction" ADD VALUE IF NOT EXISTS 'EXTRACTION_SUPREME_PAGE';

ALTER TABLE "CreditTransaction"
  ADD COLUMN IF NOT EXISTS "documentId" TEXT,
  ADD COLUMN IF NOT EXISTS "documentExtractionRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "pageNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE INDEX IF NOT EXISTS "CreditTransaction_documentId_pageNumber_idx"
  ON "CreditTransaction"("documentId", "pageNumber");

CREATE INDEX IF NOT EXISTS "CreditTransaction_documentExtractionRunId_idx"
  ON "CreditTransaction"("documentExtractionRunId");

CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_idempotencyKey_key"
  ON "CreditTransaction"("idempotencyKey");

ALTER TABLE "DocumentExtractionPage"
  ADD COLUMN IF NOT EXISTS "artifactVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "artifact" JSONB,
  ADD COLUMN IF NOT EXISTS "pageImageHash" TEXT;
