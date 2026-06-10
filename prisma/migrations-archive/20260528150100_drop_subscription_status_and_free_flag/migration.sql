-- Refactor crédits-only — Phase 1 / Step 2 (destructive).
--
-- Drop des artefacts legacy du modèle FREE/PRO :
--   - User.subscriptionStatus (champ inerte runtime depuis ce refactor)
--   - SubscriptionStatus enum
--   - UserCreditBalance.freeCreditsGranted (remplacé par sémantique balanceFree>=0)
--
-- Pré-condition (vérifiée lors du refactor code) : aucune lecture/écriture
-- runtime de ces 3 artefacts. Le client Prisma post-migrate échouera tout
-- accès résiduel (filet de sécurité TypeScript).
--
-- Ordre : DROP COLUMN avant DROP TYPE (Postgres refuse l'inverse).

-- AlterTable
ALTER TABLE "User" DROP COLUMN "subscriptionStatus";

-- AlterTable
ALTER TABLE "UserCreditBalance" DROP COLUMN "freeCreditsGranted";

-- DropEnum
DROP TYPE "SubscriptionStatus";
