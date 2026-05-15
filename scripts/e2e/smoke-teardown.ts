/**
 * Phase 5 — E2E release gate: TEARDOWN a smoke-test deal + its blobs.
 *
 * SAFETY: refuses to delete unless BOTH gates pass:
 *   - the deal is owned by `dev-user-001` (the BYPASS_AUTH dev user); AND
 *   - the deal's `name` starts with `E2E-SMOKE-` (the prefix the setup
 *     script writes — anything else is presumed real user data).
 *
 * Mirrors the cascade in `/api/deals/[dealId]` DELETE: clean Vercel Blob /
 * local-storage blobs FIRST (otherwise `prisma.deal.delete` cascades the
 * Document rows away and the storageUrls leak), then delete the deal
 * (Prisma onDelete:Cascade clears Documents, ExtractionRuns, Pages, etc.).
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/e2e/smoke-teardown.ts <dealId>
 *      (or set E2E_DEAL_ID instead of passing as arg.)
 */
import { PrismaClient } from "@prisma/client";

import { deleteFile } from "../../src/services/storage";

const DEV_USER_ID = "dev-user-001";
const SAFETY_PREFIX = "E2E-SMOKE-";

async function main() {
  const dealId = process.argv[2] ?? process.env.E2E_DEAL_ID;
  if (!dealId) {
    console.error(
      "Usage: smoke-teardown.ts <dealId>  (or set E2E_DEAL_ID env var)"
    );
    process.exit(1);
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DIRECT_URL / DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, name: true, userId: true },
    });
    if (!deal) {
      console.log(`No deal with id ${dealId} — nothing to do.`);
      return;
    }

    // -- SAFETY GATES --------------------------------------------------------
    if (deal.userId !== DEV_USER_ID) {
      throw new Error(
        `Refusing to delete deal ${dealId}: owner is ${deal.userId}, not the BYPASS_AUTH dev user (${DEV_USER_ID}).`
      );
    }
    if (!deal.name?.startsWith(SAFETY_PREFIX)) {
      throw new Error(
        `Refusing to delete deal ${dealId}: name ${JSON.stringify(deal.name)} does not start with ${SAFETY_PREFIX}. Real user data is never touched by this script.`
      );
    }

    // -- BLOB CLEANUP FIRST (before the cascade drops the storage refs) -----
    const docs = await prisma.document.findMany({
      where: { dealId },
      select: { id: true, storageUrl: true, storagePath: true },
    });
    let cleaned = 0;
    let failed = 0;
    for (const doc of docs) {
      const target = doc.storageUrl ?? doc.storagePath;
      if (!target) continue;
      try {
        await deleteFile(target);
        cleaned += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `  [warn] blob cleanup failed for ${doc.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // -- DELETE DEAL (cascades Documents / ExtractionRuns / Pages / ...) ----
    await prisma.deal.delete({ where: { id: dealId } });

    console.log(
      `Teardown OK: deleted deal ${dealId} (${deal.name}); cleaned ${cleaned} blob${cleaned === 1 ? "" : "s"}${failed ? `, ${failed} cleanup failure${failed === 1 ? "" : "s"} (ignored)` : ""}.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("smoke-teardown FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
