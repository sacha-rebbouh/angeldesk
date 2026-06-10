-- P1 — Analysis refund tracking
-- Permet au resume logic de savoir si une analyse precedente a deja ete remboursee
-- (evite le double-refund sur un resume qui re-fail) + UI peut afficher le montant.

ALTER TABLE "Analysis"
  ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundAmount" INTEGER;
