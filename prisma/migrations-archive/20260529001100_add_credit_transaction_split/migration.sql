-- Refund pro-rata exact (2026-05-29).
--
-- Le refund doit recréditer EXACTEMENT ce qui a été déduit : si une déduction
-- de 5cr a pris 3 free + 2 paid, le refund doit créditer 3 free + 2 paid (pas
-- 5 paid). Sinon on transforme du free perdable en paid permanent (exploit).
--
-- On ajoute 2 colonnes sur CreditTransaction pour stocker le split :
--   freeAmount : montant en crédits free (négatif si deduct, positif si refund/grant)
--   paidAmount : montant en crédits paid (idem)
-- Invariant : amount = freeAmount + paidAmount
--
-- Backfill : toutes les rows historiques (avant ce refactor) sont 100% paid car
-- le concept free hebdo n'existait pas. paidAmount = amount, freeAmount = 0.

ALTER TABLE "CreditTransaction"
  ADD COLUMN "freeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "CreditTransaction"
SET "paidAmount" = "amount"
WHERE "freeAmount" = 0 AND "paidAmount" = 0;
