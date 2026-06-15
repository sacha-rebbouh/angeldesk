-- Refactor crédits-only — Phase 1 / Step 1 (additive).
--
-- Ajoute le free tier hebdo "use it or lose it" : 10 crédits free
-- dans une fenêtre de 7j qui démarre au 1er deduct du free de cette batch.
-- Au reset, balanceFree est écrasé à 10 (pas additif).
-- freeResetStartedAt = NULL signifie "fenêtre non démarrée" (juste après
-- reset ou row neuve).
--
-- Cette migration est ADDITIVE et safe à rollback (DROP COLUMN si besoin).
-- La logique service (deductCreditAmount lazy reset + free-first) est livrée
-- dans le même commit.

-- AlterTable
ALTER TABLE "UserCreditBalance"
  ADD COLUMN "balanceFree" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "freeResetStartedAt" TIMESTAMP(3);
