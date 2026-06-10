-- Option B "free hebdo only for non-purchasers" (2026-05-29).
--
-- Le free hebdo 10cr/7j use-it-or-lose-it est réservé aux users qui n'ont JAMAIS
-- acheté de pack (totalPurchased = 0). Dès le 1er achat, l'user "sort" du free et
-- vit uniquement sur son balance paid. Empêche la cannibalisation des packs.
--
-- Cette migration synchronise les rows existantes avec la nouvelle règle :
-- toute row qui a déjà du totalPurchased > 0 voit son balanceFree écrasé à 0
-- (et son timer freeResetStartedAt remis à NULL).

UPDATE "UserCreditBalance"
SET "balanceFree" = 0, "freeResetStartedAt" = NULL
WHERE "totalPurchased" > 0;
