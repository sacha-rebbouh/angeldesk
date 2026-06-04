-- Phase 4 (refonte 5-sujets) — colonnes d'idempotence de l'email « analyse prête ».
-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "analysisReadyEmailClaimedAt" TIMESTAMP(3),
ADD COLUMN     "analysisReadyEmailSentAt" TIMESTAMP(3);

-- Phase 2 (refonte 5-sujets) — index pour le lookup du watchdog événementiel par dispatchEventId.
-- CreateIndex
CREATE INDEX "Analysis_dispatchEventId_idx" ON "Analysis"("dispatchEventId");
