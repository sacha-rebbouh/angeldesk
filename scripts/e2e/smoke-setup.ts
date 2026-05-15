/**
 * Phase 5 — E2E release gate: SETUP a fresh, owned-by-BYPASS_AUTH deal.
 *
 * Creates exactly what the manual smoke scenarios (1, 2, 5, 6) need:
 *   1. Ensures the BYPASS_AUTH dev user exists in the DB (mirror of
 *      `getOrCreateUser` in `src/lib/auth.ts`).
 *   2. Creates a fresh Deal owned by that user, named `E2E-SMOKE-<runId>`.
 *      The prefix is the safety token the teardown script relies on.
 *   3. Prints `DEAL_ID=...` for shell capture.
 *
 * Without this, the runbook scenarios fail with 404 / 403: the upload route
 * requires `deal.userId === currentUser.id`, and `BYPASS_AUTH=true` resolves
 * the current user to `dev-user-001`.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/e2e/smoke-setup.ts
 *      eval "$(... smoke-setup.ts)"   # to export DEAL_ID into your shell
 */
import { PrismaClient } from "@prisma/client";

const DEV_USER_ID = "dev-user-001";
const DEV_CLERK_ID = "dev-clerk-001";
const SAFETY_PREFIX = "E2E-SMOKE-";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DIRECT_URL / DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    // 1. Ensure the BYPASS_AUTH dev user exists.
    await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      create: {
        id: DEV_USER_ID,
        clerkId: DEV_CLERK_ID,
        email: "dev@angeldesk.local",
        name: "Dev User",
      },
      update: {},
    });

    // 2. Create a fresh test deal. Name is the SAFETY token the teardown
    //    script checks before deleting — never strip the prefix.
    const runId = (process.env.E2E_RUN_ID ?? new Date().toISOString())
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const dealName = `${SAFETY_PREFIX}${runId}`;
    const deal = await prisma.deal.create({
      data: {
        userId: DEV_USER_ID,
        name: dealName,
        companyName: dealName,
      },
      select: { id: true, name: true },
    });

    // 3. Print machine-parseable lines (so `eval` exports them into a shell).
    console.log(`DEAL_ID=${deal.id}`);
    console.log(`DEAL_NAME=${deal.name}`);
    console.log(`USER_ID=${DEV_USER_ID}`);
    console.log(`RUN_ID=${runId}`);
    console.error(
      `\nReady. Pass DEAL_ID=${deal.id} to the runbook commands. Teardown when done:\n  npx dotenv -e .env.local -- npx tsx scripts/e2e/smoke-teardown.ts ${deal.id}\n`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("smoke-setup FAILED:", error);
  process.exit(1);
});
