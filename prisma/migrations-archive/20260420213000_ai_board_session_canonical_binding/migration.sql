-- Persist the canonical thesis/snapshot binding used by each board session.
ALTER TABLE "AIBoardSession"
ADD COLUMN "thesisId" TEXT,
ADD COLUMN "corpusSnapshotId" TEXT;

CREATE INDEX "AIBoardSession_thesisId_idx" ON "AIBoardSession"("thesisId");
CREATE INDEX "AIBoardSession_corpusSnapshotId_idx" ON "AIBoardSession"("corpusSnapshotId");
