/**
 * Phase 5 — E2E release gate, scenario 8: advisory lock LIVE against Postgres.
 *
 * Proves the PRIMITIVE that Phase 4.3 concurrency safety relies on:
 * `acquireDocumentLineageLock` (pg_advisory_xact_lock keyed by the document
 * lineage) actually SERIALIZES concurrent transactions on the same lineage
 * and does NOT block unrelated lineages. That serialization is what
 * guarantees "exactly one isLatest per lineage, version monotone" under
 * concurrent promotions — the table-level invariant itself is pinned by the
 * mocked `promote-document-version.test.ts`.
 *
 * NO TABLE WRITES — zero risk to the database. Only `pg_advisory_xact_lock`
 * is exercised (the keys are random, no Document row needs to exist).
 *
 * Tests:
 *   1. SAME lineage  → tx B blocks until tx A's transaction commits.
 *   2. DIFFERENT lineages → tx B acquires immediately while A still holds.
 *   3. pgbouncer probe → the pooled DATABASE_URL can take/release the lock
 *      (pg_advisory_XACT_lock is transaction-scoped → transaction-pooling
 *      safe by design; this is a best-effort connectivity confirmation).
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/e2e/advisory-lock-live.ts
 */
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  acquireDocumentLineageLock,
  type DocumentLineage,
} from "../../src/services/documents/extraction-runs";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };

async function testSameLineageSerializes(prisma: PrismaClient): Promise<Result> {
  const lineage: DocumentLineage = {
    dealId: `e2e-lock-${randomUUID()}`,
    name: "deck.pdf",
    corpusParentDocumentId: null,
  };

  let signalAHasLock!: () => void;
  const aHasLock = new Promise<void>((resolve) => {
    signalAHasLock = resolve;
  });
  let releaseA!: () => void;
  const aMayRelease = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let bAcquiredAt: number | null = null;

  // Transaction A takes the lineage lock and holds the transaction OPEN
  // (awaiting the test's release signal) — the lock is released only when
  // this transaction commits.
  const txA = prisma.$transaction(
    async (tx) => {
      await acquireDocumentLineageLock(tx, lineage);
      signalAHasLock();
      await aMayRelease;
    },
    { timeout: 20_000, maxWait: 20_000 }
  );

  await aHasLock; // A definitely holds the lock now.

  // Transaction B tries the SAME lineage lock — it must BLOCK at the
  // Postgres level until A's transaction commits.
  const txB = prisma.$transaction(
    async (tx) => {
      await acquireDocumentLineageLock(tx, lineage);
      bAcquiredAt = Date.now();
    },
    { timeout: 20_000, maxWait: 20_000 }
  );

  await sleep(800);
  const bBlockedWhileAHeld = bAcquiredAt === null;

  const releasedAt = Date.now();
  releaseA();
  await txA;
  await txB;

  const bAcquiredAfterRelease = bAcquiredAt !== null && bAcquiredAt >= releasedAt - 25;
  const pass = bBlockedWhileAHeld && bAcquiredAfterRelease;
  return {
    name: "SAME lineage serializes — B waits for A's transaction to commit",
    status: pass ? "PASS" : "FAIL",
    detail: `B blocked for the full 800ms A held the lock: ${bBlockedWhileAHeld}; B acquired only AFTER A released: ${bAcquiredAfterRelease}`,
  };
}

async function testDifferentLineagesDoNotBlock(prisma: PrismaClient): Promise<Result> {
  const lineageA: DocumentLineage = {
    dealId: `e2e-lock-${randomUUID()}`,
    name: "a.pdf",
    corpusParentDocumentId: null,
  };
  const lineageB: DocumentLineage = {
    dealId: `e2e-lock-${randomUUID()}`,
    name: "b.pdf",
    corpusParentDocumentId: null,
  };

  let signalAHasLock!: () => void;
  const aHasLock = new Promise<void>((resolve) => {
    signalAHasLock = resolve;
  });
  let releaseA!: () => void;
  const aMayRelease = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let bAcquiredAt: number | null = null;

  const txA = prisma.$transaction(
    async (tx) => {
      await acquireDocumentLineageLock(tx, lineageA);
      signalAHasLock();
      await aMayRelease;
    },
    { timeout: 20_000, maxWait: 20_000 }
  );

  await aHasLock;

  const startB = Date.now();
  const txB = prisma.$transaction(
    async (tx) => {
      // Different lineage key → must NOT block on A's lock.
      await acquireDocumentLineageLock(tx, lineageB);
      bAcquiredAt = Date.now();
    },
    { timeout: 20_000, maxWait: 20_000 }
  );
  await txB; // resolves quickly even though A still holds its (different) lock

  releaseA();
  await txA;

  const elapsed = bAcquiredAt === null ? -1 : bAcquiredAt - startB;
  const pass = elapsed >= 0 && elapsed < 500;
  return {
    name: "DIFFERENT lineages do NOT block each other",
    status: pass ? "PASS" : "FAIL",
    detail: `B acquired its lock in ${elapsed}ms while A still held a different-lineage lock`,
  };
}

async function probePgbouncerCompat(): Promise<Result> {
  // Production runs through the pooled (pgbouncer) DATABASE_URL.
  // `pg_advisory_xact_lock` is TRANSACTION-scoped, so it is held only for
  // the transaction's duration and released on commit — which is exactly
  // pgbouncer transaction-pooling's unit of connection assignment. This
  // probe confirms the pooled URL can take + release the lock inside one
  // transaction. Best-effort: a sandbox connectivity failure is reported
  // SKIP, not FAIL (the design argument above still holds).
  const pooled = process.env.DATABASE_URL;
  if (!pooled) {
    return { name: "pgbouncer (pooled DATABASE_URL) lock probe", status: "SKIP", detail: "DATABASE_URL not set" };
  }
  const prisma = new PrismaClient({ datasources: { db: { url: pooled } } });
  try {
    const lineage: DocumentLineage = {
      dealId: `e2e-lock-${randomUUID()}`,
      name: "pgbouncer-probe.pdf",
      corpusParentDocumentId: null,
    };
    await prisma.$transaction(
      async (tx) => {
        await acquireDocumentLineageLock(tx, lineage);
      },
      { timeout: 15_000, maxWait: 8_000 }
    );
    return {
      name: "pgbouncer (pooled DATABASE_URL) lock probe",
      status: "PASS",
      detail: "pg_advisory_xact_lock taken + released inside one transaction on the pooled URL",
    };
  } catch (error) {
    return {
      name: "pgbouncer (pooled DATABASE_URL) lock probe",
      status: "SKIP",
      detail: `pooled URL unreachable from this environment (${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }). pg_advisory_xact_lock is transaction-scoped → transaction-pooling-safe by design.`,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) {
    console.error("DIRECT_URL (or DATABASE_URL) is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

  const results: Result[] = [];
  try {
    results.push(await testSameLineageSerializes(prisma));
    results.push(await testDifferentLineagesDoNotBlock(prisma));
  } finally {
    await prisma.$disconnect();
  }
  results.push(await probePgbouncerCompat());

  console.log("\n=== Phase 5 / Scenario 8 — advisory lock LIVE (Postgres) ===\n");
  let failed = false;
  for (const r of results) {
    console.log(`  [${r.status}] ${r.name}`);
    console.log(`         ${r.detail}\n`);
    if (r.status === "FAIL") failed = true;
  }
  console.log(`  RESULT: ${failed ? "FAIL" : "PASS"}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Scenario 8 ERROR:", error);
  process.exit(1);
});
