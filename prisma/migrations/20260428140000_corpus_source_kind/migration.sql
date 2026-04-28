-- Corpus Timeline & Multi-Source Intake — extends Document with provenance/role/metadata + optional question linking.
-- Backward compatible: existing Documents default to sourceKind=FILE / corpusRole=GENERAL,
-- storagePath relaxed to nullable so emails/notes can live without blob storage.

-- CreateEnum
CREATE TYPE "DocumentSourceKind" AS ENUM ('FILE', 'EMAIL', 'NOTE');

-- CreateEnum
CREATE TYPE "CorpusRole" AS ENUM ('GENERAL', 'DILIGENCE_RESPONSE');

-- CreateEnum
CREATE TYPE "LinkedQuestionSource" AS ENUM ('RED_FLAG', 'QUESTION_TO_ASK');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "corpusRole" "CorpusRole" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "linkedQuestionSource" "LinkedQuestionSource",
ADD COLUMN     "linkedQuestionText" TEXT,
ADD COLUMN     "linkedRedFlagId" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "sourceAuthor" TEXT,
ADD COLUMN     "sourceDate" TIMESTAMP(3),
ADD COLUMN     "sourceKind" "DocumentSourceKind" NOT NULL DEFAULT 'FILE',
ADD COLUMN     "sourceMetadata" JSONB,
ADD COLUMN     "sourceSubject" TEXT,
ALTER COLUMN "storagePath" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Document_dealId_sourceDate_idx" ON "Document"("dealId", "sourceDate");

-- CreateIndex
CREATE INDEX "Document_dealId_sourceKind_idx" ON "Document"("dealId", "sourceKind");

-- CreateIndex
CREATE INDEX "Document_dealId_corpusRole_idx" ON "Document"("dealId", "corpusRole");

-- CreateIndex
CREATE INDEX "Document_linkedRedFlagId_idx" ON "Document"("linkedRedFlagId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_linkedRedFlagId_fkey" FOREIGN KEY ("linkedRedFlagId") REFERENCES "RedFlag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
