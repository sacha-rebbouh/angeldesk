-- Reserve a single post-call reanalysis per live session while the HTTP run is in flight.
ALTER TABLE "LiveSession"
ADD COLUMN "reanalysisRequestId" TEXT,
ADD COLUMN "reanalysisMode" TEXT,
ADD COLUMN "reanalysisRequestedAt" TIMESTAMP(3);

CREATE INDEX "LiveSession_reanalysisRequestedAt_idx" ON "LiveSession"("reanalysisRequestedAt");
