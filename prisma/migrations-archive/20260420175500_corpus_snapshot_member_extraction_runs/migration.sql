-- ============================================================================
-- CORPUS SNAPSHOT MEMBER EXTRACTION RUN TRACEABILITY
-- ============================================================================

ALTER TABLE "CorpusSnapshotMember"
ADD COLUMN IF NOT EXISTS "extractionRunId" TEXT;

CREATE INDEX IF NOT EXISTS "CorpusSnapshotMember_extractionRunId_idx"
ON "CorpusSnapshotMember"("extractionRunId");

ALTER TABLE "CorpusSnapshotMember"
  DROP CONSTRAINT IF EXISTS "CorpusSnapshotMember_extractionRunId_fkey";

ALTER TABLE "CorpusSnapshotMember"
  ADD CONSTRAINT "CorpusSnapshotMember_extractionRunId_fkey"
  FOREIGN KEY ("extractionRunId") REFERENCES "DocumentExtractionRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
