-- Thesis-First Architecture
--
-- Ajoute :
--  * Enum values : RedFlagCategory.THESIS, RedFlagCategory.THESIS_VS_REALITY
--  * Enum values : RoundType.THESIS_DEBATE
--  * Enum values : CreditAction.THESIS_REBUTTAL, CreditAction.THESIS_REEXTRACT
--  * Table Thesis (modele de these d'investissement structuree)
--  * Colonnes Analysis : thesisId (FK), thesisDecision, thesisDecisionAt, thesisBypass
--
-- Safe: aucune donnee existante n'est modifiee. Tous les nouveaux champs sont nullable
-- ou ont un default. Les deals existants n'ont pas de these (badge UI "Thesis stale").

-- ----------------------------------------------------------------------------
-- 1. Enum extensions (Postgres: ALTER TYPE ... ADD VALUE)
-- ----------------------------------------------------------------------------
ALTER TYPE "RedFlagCategory" ADD VALUE IF NOT EXISTS 'THESIS';
ALTER TYPE "RedFlagCategory" ADD VALUE IF NOT EXISTS 'THESIS_VS_REALITY';

ALTER TYPE "RoundType" ADD VALUE IF NOT EXISTS 'THESIS_DEBATE';

ALTER TYPE "CreditAction" ADD VALUE IF NOT EXISTS 'THESIS_REBUTTAL';
ALTER TYPE "CreditAction" ADD VALUE IF NOT EXISTS 'THESIS_REEXTRACT';

-- ----------------------------------------------------------------------------
-- 2. Table Thesis
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Thesis" (
  "id"                 TEXT NOT NULL,
  "dealId"             TEXT NOT NULL,
  "version"            INTEGER NOT NULL DEFAULT 1,
  "isLatest"           BOOLEAN NOT NULL DEFAULT true,
  "reformulated"       TEXT NOT NULL,
  "problem"            TEXT NOT NULL,
  "solution"           TEXT NOT NULL,
  "whyNow"             TEXT NOT NULL,
  "moat"               TEXT,
  "pathToExit"         TEXT,
  "verdict"            TEXT NOT NULL,
  "confidence"         INTEGER NOT NULL,
  "loadBearing"        JSONB NOT NULL,
  "ycLens"             JSONB NOT NULL,
  "thielLens"          JSONB NOT NULL,
  "angelDeskLens"      JSONB NOT NULL,
  "alerts"             JSONB NOT NULL,
  "reconciledAt"       TIMESTAMP(3),
  "reconciliationJson" JSONB,
  "decision"           TEXT,
  "decisionAt"         TIMESTAMP(3),
  "rebuttalText"       TEXT,
  "rebuttalVerdict"    TEXT,
  "rebuttalCount"      INTEGER NOT NULL DEFAULT 0,
  "sourceDocumentIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceHash"         TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Thesis_dealId_isLatest_idx" ON "Thesis"("dealId", "isLatest");
CREATE INDEX IF NOT EXISTS "Thesis_dealId_version_idx" ON "Thesis"("dealId", "version");
CREATE INDEX IF NOT EXISTS "Thesis_verdict_idx" ON "Thesis"("verdict");
CREATE INDEX IF NOT EXISTS "Thesis_dealId_createdAt_idx" ON "Thesis"("dealId", "createdAt");

ALTER TABLE "Thesis"
  DROP CONSTRAINT IF EXISTS "Thesis_dealId_fkey";

ALTER TABLE "Thesis"
  ADD CONSTRAINT "Thesis_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Analysis : colonnes thesis
-- ----------------------------------------------------------------------------
ALTER TABLE "Analysis"
  ADD COLUMN IF NOT EXISTS "thesisId" TEXT,
  ADD COLUMN IF NOT EXISTS "thesisDecision" TEXT,
  ADD COLUMN IF NOT EXISTS "thesisDecisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "thesisBypass" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Analysis_thesisId_idx" ON "Analysis"("thesisId");

ALTER TABLE "Analysis"
  DROP CONSTRAINT IF EXISTS "Analysis_thesisId_fkey";

ALTER TABLE "Analysis"
  ADD CONSTRAINT "Analysis_thesisId_fkey"
  FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
