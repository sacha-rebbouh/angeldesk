-- Fix C (H/D.6) — clé d'idempotence replay-safe pour les FactEvents du pipeline stepwise durable.
-- Additif + nullable : les FactEvents existants et hors-analyse restent à NULL (NULLs distincts en
-- Postgres → l'index unique ne les dédupe pas). Aucune réécriture de ligne, sûr en prod.

-- AlterTable
ALTER TABLE "FactEvent" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FactEvent_idempotencyKey_key" ON "FactEvent"("idempotencyKey");
