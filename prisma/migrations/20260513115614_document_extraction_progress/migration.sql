-- Ephemeral progress snapshots for in-flight document upload + extraction pipelines.
-- Replaces the Redis/InMemoryStore-backed key/value store used in
-- src/services/documents/extraction-progress.ts so writes from the upload
-- POST invocation are visible to GET polls running on other Vercel invocations.

-- CreateTable
CREATE TABLE "DocumentExtractionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "documentName" TEXT,
    "phase" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtractionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentExtractionProgress_userId_idx" ON "DocumentExtractionProgress"("userId");

-- CreateIndex
CREATE INDEX "DocumentExtractionProgress_expiresAt_idx" ON "DocumentExtractionProgress"("expiresAt");
