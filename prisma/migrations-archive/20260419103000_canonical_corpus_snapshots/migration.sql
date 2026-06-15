-- Canonical corpus snapshots
--
-- Ajoute :
--  * Table CorpusSnapshot (header canonique du corpus)
--  * Table CorpusSnapshotMember (jointure snapshot ↔ document)
--  * Colonnes nullable Analysis.corpusSnapshotId et Thesis.corpusSnapshotId
--
-- Safe / additive:
--  * aucune suppression ou rewrite de donnees existantes
--  * pas de backfill automatique dans cette migration
--  * les champs legacy (Analysis.documentIds, AnalysisDocument, Thesis.sourceDocumentIds, Thesis.sourceHash)
--    restent en place pendant la migration applicative des consommateurs

-- ----------------------------------------------------------------------------
-- 1. Table CorpusSnapshot
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CorpusSnapshot" (
  "id"         TEXT NOT NULL,
  "dealId"     TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorpusSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CorpusSnapshot_dealId_idx"
  ON "CorpusSnapshot"("dealId");

CREATE INDEX IF NOT EXISTS "CorpusSnapshot_dealId_createdAt_idx"
  ON "CorpusSnapshot"("dealId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CorpusSnapshot_dealId_sourceHash_key"
  ON "CorpusSnapshot"("dealId", "sourceHash");

ALTER TABLE "CorpusSnapshot"
  DROP CONSTRAINT IF EXISTS "CorpusSnapshot_dealId_fkey";

ALTER TABLE "CorpusSnapshot"
  ADD CONSTRAINT "CorpusSnapshot_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 2. Table CorpusSnapshotMember
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CorpusSnapshotMember" (
  "corpusSnapshotId" TEXT NOT NULL,
  "documentId"       TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorpusSnapshotMember_pkey" PRIMARY KEY ("corpusSnapshotId", "documentId")
);

CREATE INDEX IF NOT EXISTS "CorpusSnapshotMember_documentId_idx"
  ON "CorpusSnapshotMember"("documentId");

CREATE INDEX IF NOT EXISTS "CorpusSnapshotMember_corpusSnapshotId_idx"
  ON "CorpusSnapshotMember"("corpusSnapshotId");

ALTER TABLE "CorpusSnapshotMember"
  DROP CONSTRAINT IF EXISTS "CorpusSnapshotMember_corpusSnapshotId_fkey";

ALTER TABLE "CorpusSnapshotMember"
  ADD CONSTRAINT "CorpusSnapshotMember_corpusSnapshotId_fkey"
  FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorpusSnapshotMember"
  DROP CONSTRAINT IF EXISTS "CorpusSnapshotMember_documentId_fkey";

ALTER TABLE "CorpusSnapshotMember"
  ADD CONSTRAINT "CorpusSnapshotMember_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Analysis : colonne corpusSnapshotId nullable
-- ----------------------------------------------------------------------------
ALTER TABLE "Analysis"
  ADD COLUMN IF NOT EXISTS "corpusSnapshotId" TEXT;

CREATE INDEX IF NOT EXISTS "Analysis_corpusSnapshotId_idx"
  ON "Analysis"("corpusSnapshotId");

ALTER TABLE "Analysis"
  DROP CONSTRAINT IF EXISTS "Analysis_corpusSnapshotId_fkey";

ALTER TABLE "Analysis"
  ADD CONSTRAINT "Analysis_corpusSnapshotId_fkey"
  FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 4. Thesis : colonne corpusSnapshotId nullable
-- ----------------------------------------------------------------------------
ALTER TABLE "Thesis"
  ADD COLUMN IF NOT EXISTS "corpusSnapshotId" TEXT;

CREATE INDEX IF NOT EXISTS "Thesis_corpusSnapshotId_idx"
  ON "Thesis"("corpusSnapshotId");

ALTER TABLE "Thesis"
  DROP CONSTRAINT IF EXISTS "Thesis_corpusSnapshotId_fkey";

ALTER TABLE "Thesis"
  ADD CONSTRAINT "Thesis_corpusSnapshotId_fkey"
  FOREIGN KEY ("corpusSnapshotId") REFERENCES "CorpusSnapshot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
