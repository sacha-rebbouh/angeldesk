-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "mode" TEXT,
ADD COLUMN     "results" JSONB,
ADD COLUMN     "totalTimeMs" INTEGER;
