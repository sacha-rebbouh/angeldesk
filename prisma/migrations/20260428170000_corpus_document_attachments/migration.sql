-- Corpus attachments — link uploaded FILE documents to a parent EMAIL/NOTE corpus item.
-- This is intentionally separate from parentDocumentId, which remains reserved
-- for F62 document versioning/replacement.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "corpusParentDocumentId" TEXT;

-- CreateIndex
CREATE INDEX "Document_corpusParentDocumentId_idx" ON "Document"("corpusParentDocumentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_corpusParentDocumentId_fkey" FOREIGN KEY ("corpusParentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
