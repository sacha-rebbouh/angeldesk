-- P0 Schema Hardening
--
-- Fixes :
--  * AnalysisExtractionRun.run ON DELETE : Restrict -> Cascade (levait un verrou de suppression)
--  * LiveSession.deal         ON DELETE : SetNull  -> Cascade (orphelins coaching supprime avec le deal)
--  * LiveSession.document     ON DELETE : SetNull  -> Cascade (transcript lie au doc, pas de reference morte)
--  * FactEvent : contrainte unique (dealId, factKey, createdAt, eventType) pour bloquer les writes concurrents duplicates
--  * AnalysisDocument : nouvelle table de jointure FK-contrainte (remplace progressivement Analysis.documentIds String[])
--
-- NOTE : cette migration est idempotente (IF NOT EXISTS / IF EXISTS). Les etapes de dedup
-- prealables doivent etre verifiees en staging avant de lancer `prisma migrate deploy`
-- en prod (voir section "Pre-clean FactEvent duplicates" ci-dessous).

-- ------------------------------------------------------------
-- 1. AnalysisExtractionRun.run : Restrict -> Cascade
-- ------------------------------------------------------------
ALTER TABLE "AnalysisExtractionRun"
  DROP CONSTRAINT IF EXISTS "AnalysisExtractionRun_runId_fkey";

ALTER TABLE "AnalysisExtractionRun"
  ADD CONSTRAINT "AnalysisExtractionRun_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DocumentExtractionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 2. LiveSession.deal : SetNull -> Cascade
-- ------------------------------------------------------------
ALTER TABLE "LiveSession"
  DROP CONSTRAINT IF EXISTS "LiveSession_dealId_fkey";

ALTER TABLE "LiveSession"
  ADD CONSTRAINT "LiveSession_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 3. LiveSession.document : SetNull -> Cascade
-- ------------------------------------------------------------
ALTER TABLE "LiveSession"
  DROP CONSTRAINT IF EXISTS "LiveSession_documentId_fkey";

ALTER TABLE "LiveSession"
  ADD CONSTRAINT "LiveSession_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 4. FactEvent : pre-clean des duplicates eventuels puis contrainte unique
-- ------------------------------------------------------------
-- Supprime les doublons exacts (dealId, factKey, createdAt, eventType)
-- en gardant le plus ancien (id lexicographiquement minimum - cuid).
DELETE FROM "FactEvent" a
USING "FactEvent" b
WHERE a."id" > b."id"
  AND a."dealId"    = b."dealId"
  AND a."factKey"   = b."factKey"
  AND a."createdAt" = b."createdAt"
  AND a."eventType" = b."eventType";

CREATE UNIQUE INDEX IF NOT EXISTS "FactEvent_dealId_factKey_createdAt_eventType_key"
  ON "FactEvent"("dealId", "factKey", "createdAt", "eventType");

-- ------------------------------------------------------------
-- 5. AnalysisDocument : table de jointure FK-contrainte
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AnalysisDocument" (
  "analysisId" TEXT    NOT NULL,
  "documentId" TEXT    NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalysisDocument_pkey" PRIMARY KEY ("analysisId", "documentId")
);

CREATE INDEX IF NOT EXISTS "AnalysisDocument_documentId_idx"
  ON "AnalysisDocument"("documentId");

CREATE INDEX IF NOT EXISTS "AnalysisDocument_analysisId_idx"
  ON "AnalysisDocument"("analysisId");

ALTER TABLE "AnalysisDocument"
  DROP CONSTRAINT IF EXISTS "AnalysisDocument_analysisId_fkey";

ALTER TABLE "AnalysisDocument"
  ADD CONSTRAINT "AnalysisDocument_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisDocument"
  DROP CONSTRAINT IF EXISTS "AnalysisDocument_documentId_fkey";

ALTER TABLE "AnalysisDocument"
  ADD CONSTRAINT "AnalysisDocument_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 6. Backfill AnalysisDocument depuis Analysis.documentIds legacy
-- ------------------------------------------------------------
-- Best-effort: ignore les IDs pointant sur des documents deja supprimes.
INSERT INTO "AnalysisDocument" ("analysisId", "documentId", "createdAt")
SELECT a."id", unnest(a."documentIds"), a."createdAt"
FROM "Analysis" a
WHERE array_length(a."documentIds", 1) > 0
  AND EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = ANY(a."documentIds")
  )
ON CONFLICT DO NOTHING;
