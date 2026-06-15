-- AlterTable
ALTER TABLE "Thesis" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_idempotencyKey_key" ON "Thesis"("idempotencyKey");
