/**
 * Database integration tests for the credit money-path — exercises the REAL
 * Postgres semantics that credit-flow-e2e.test.ts re-implements in mocks :
 *  - idempotency via the UNIQUE constraint on CreditTransaction.idempotencyKey
 *  - TOCTOU protection via the optimistic-locking conditional updateMany
 *    (deux deducts concurrents dont la somme dépasse le solde → un seul passe)
 *  - refund idempotency
 *
 * Contexte : errors.md 2026-05-14 — du code SQL couvert uniquement par des
 * tests mockés a déjà shippé 2 bugs runtime (advisory lock $queryRaw). Ce
 * fichier ferme la même couture pour le chemin argent.
 *
 * Hits the actual Postgres via DATABASE_URL (CI : Postgres éphémère localhost).
 * SKIP : SKIP_DB_TESTS=1, DATABASE_URL absente, ou DB distante sans
 * ALLOW_REMOTE_DB=1 (garde anti-prod — voir src/lib/test-db-guard.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

import { shouldSkipDbTests } from "@/lib/test-db-guard";

config({ path: ".env.local" });

// Les round-trips DB peuvent être lents sur endpoints froids.
const DB_TEST_TIMEOUT = 30_000;

const skipDbTests = shouldSkipDbTests().skip;

if (skipDbTests) {
  describe.skip(`credits — DB integration (skipped: ${shouldSkipDbTests().reason})`, () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { deductCreditAmount, refundCreditAmount } = await import("../usage-gate");

  const prisma = new PrismaClient();
  const PREFIX = `__credits_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";

  describe("credits — DB integration (vraie sémantique Postgres)", () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          clerkId: `${PREFIX}__clerk`,
          email: `${PREFIX}@test.invalid`,
          name: "Credits DB Test",
        },
      });
      userId = user.id;
      // Purchaser (totalPurchased > 0) → chemin 100% paid, déterministe
      // (pas de fenêtre free hebdo dans les assertions).
      await prisma.userCreditBalance.create({
        data: { userId, balance: 10, balanceFree: 0, totalPurchased: 10 },
      });
    }, DB_TEST_TIMEOUT);

    afterAll(async () => {
      // Cascade User → UserCreditBalance + CreditTransaction
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }, DB_TEST_TIMEOUT);

    it(
      "deduct happy path — décrémente le paid et écrit la transaction avec le split exact",
      async () => {
        const res = await deductCreditAmount(userId, "DEEP_DIVE", 3, {
          idempotencyKey: `${PREFIX}:deduct:1`,
        });
        expect(res.success).toBe(true);
        expect(res.balanceAfter).toBe(7);
        expect(res.alreadyDeducted).toBeUndefined();

        const balance = await prisma.userCreditBalance.findUnique({ where: { userId } });
        expect(balance?.balance).toBe(7);

        const txn = await prisma.creditTransaction.findUnique({
          where: { idempotencyKey: `${PREFIX}:deduct:1` },
        });
        expect(txn).toMatchObject({
          amount: -3,
          paidAmount: -3,
          freeAmount: 0,
          balanceAfter: 7,
          action: "DEEP_DIVE",
        });
      },
      DB_TEST_TIMEOUT
    );

    it(
      "deduct idempotent — même idempotencyKey rejoué : pas de double débit (contrainte UNIQUE réelle)",
      async () => {
        const replay = await deductCreditAmount(userId, "DEEP_DIVE", 3, {
          idempotencyKey: `${PREFIX}:deduct:1`,
        });
        expect(replay.success).toBe(true);
        expect(replay.alreadyDeducted).toBe(true);
        expect(replay.balanceAfter).toBe(7);

        const balance = await prisma.userCreditBalance.findUnique({ where: { userId } });
        expect(balance?.balance).toBe(7);

        const txns = await prisma.creditTransaction.count({
          where: { userId, action: "DEEP_DIVE" },
        });
        expect(txns).toBe(1);
      },
      DB_TEST_TIMEOUT
    );

    it(
      "TOCTOU — deux deducts concurrents dont la somme dépasse le solde : exactement un passe",
      async () => {
        // Solde courant : 7. Deux débits de 5 en parallèle → un seul doit
        // réussir (updateMany WHERE balance >= 5, re-évalué par Postgres sur
        // la row verrouillée après commit du gagnant).
        const [a, b] = await Promise.all([
          deductCreditAmount(userId, "DEEP_DIVE", 5, {
            idempotencyKey: `${PREFIX}:race:a`,
          }),
          deductCreditAmount(userId, "DEEP_DIVE", 5, {
            idempotencyKey: `${PREFIX}:race:b`,
          }),
        ]);

        const successes = [a, b].filter((r) => r.success);
        const failures = [a, b].filter((r) => !r.success);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(successes[0].balanceAfter).toBe(2);
        // Le perdant échoue en concurrence détectée OU crédits insuffisants
        // selon l'ordonnancement des transactions — les deux sont corrects.
        expect(failures[0].error).toMatch(/Concurrence détectée|Crédits insuffisants/);

        const balance = await prisma.userCreditBalance.findUnique({ where: { userId } });
        expect(balance?.balance).toBe(2);

        const raceTxns = await prisma.creditTransaction.count({
          where: { idempotencyKey: { in: [`${PREFIX}:race:a`, `${PREFIX}:race:b`] } },
        });
        expect(raceTxns).toBe(1);
      },
      DB_TEST_TIMEOUT
    );

    it(
      "refund + idempotence — re-crédite en paid (purchaser) et ne double-rembourse jamais",
      async () => {
        // Solde courant : 2.
        const refund = await refundCreditAmount(userId, "DEEP_DIVE", 5, {
          idempotencyKey: `${PREFIX}:refund:1`,
        });
        expect(refund.success).toBe(true);
        expect(refund.balanceAfter).toBe(7);

        const replay = await refundCreditAmount(userId, "DEEP_DIVE", 5, {
          idempotencyKey: `${PREFIX}:refund:1`,
        });
        expect(replay.success).toBe(true);
        expect(replay.alreadyRefunded).toBe(true);
        expect(replay.balanceAfter).toBe(7);

        const balance = await prisma.userCreditBalance.findUnique({ where: { userId } });
        expect(balance?.balance).toBe(7);

        const refunds = await prisma.creditTransaction.count({
          where: { userId, action: "REFUND" },
        });
        expect(refunds).toBe(1);
      },
      DB_TEST_TIMEOUT
    );
  });
}
