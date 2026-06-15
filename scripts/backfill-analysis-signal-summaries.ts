/**
 * Backfill the AnalysisSignalSummary read-model (Phase H2).
 *
 * Pre-warms the denormalized cache for the canonical analysis of every deal so
 * the hot SSR pages (deals list, dashboard, deal detail) skip loadResults from
 * the first view. This is OPTIONAL: the read path is self-correcting and warms
 * the cache lazily on miss anyway — the backfill just front-loads it.
 *
 * Idempotent: skips analyses already summarized at the current schema version,
 * so it is safe to re-run. The authoritative "nothing left" signal is a dry-run
 * reporting `toBackfill: 0`.
 *
 * Usage:
 *   # preview (dry-run, no writes):
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-analysis-signal-summaries.ts
 *   # apply:
 *   CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/backfill-analysis-signal-summaries.ts
 *   # tune batch size (default 50):
 *   BATCH_SIZE=100 CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/backfill-analysis-signal-summaries.ts
 */

import { prisma } from "@/lib/prisma";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";
import { loadResults } from "@/services/analysis-results/load-results";
import {
  upsertAnalysisSignalSummary,
  CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION,
} from "@/services/deals/analysis-signal-summary";

const CONFIRM = process.env.CONFIRM === "1";
// Fail-fast on a bad BATCH_SIZE: Number("abc") -> NaN would make chunk() process
// zero deals and falsely report toBackfill: 0 (the dry-run is the authoritative
// signal, so it must never lie).
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "50");
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1) {
  throw new Error(
    `BATCH_SIZE must be a positive integer (got ${JSON.stringify(process.env.BATCH_SIZE)})`
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function main() {
  const deals = await prisma.deal.findMany({ select: { id: true } });
  const dealIds = deals.map((deal) => deal.id);

  let withCanonical = 0;
  let alreadyCached = 0;
  let toBackfill = 0;
  let backfilled = 0;

  for (const batch of chunk(dealIds, BATCH_SIZE)) {
    // Same inputs as loadCanonicalDealSignals' canonical selection — reused, not
    // duplicated: pickCanonicalAnalysis decides which analysis the read path reads.
    const [theses, analyses] = await Promise.all([
      prisma.thesis.findMany({
        where: { dealId: { in: batch }, isLatest: true },
        select: { id: true, dealId: true, corpusSnapshotId: true },
      }),
      prisma.analysis.findMany({
        where: {
          dealId: { in: batch },
          status: "COMPLETED",
          completedAt: { not: null },
        },
        select: {
          id: true,
          dealId: true,
          mode: true,
          thesisId: true,
          corpusSnapshotId: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const thesisByDeal = new Map(theses.map((thesis) => [thesis.dealId, thesis]));
    const analysesByDeal = new Map<string, typeof analyses>();
    for (const analysis of analyses) {
      const existing = analysesByDeal.get(analysis.dealId) ?? [];
      existing.push(analysis);
      analysesByDeal.set(analysis.dealId, existing);
    }

    const canonical: { analysisId: string; dealId: string }[] = [];
    for (const dealId of batch) {
      const picked = pickCanonicalAnalysis(
        thesisByDeal.get(dealId) ?? null,
        analysesByDeal.get(dealId) ?? []
      );
      if (picked) {
        canonical.push({ analysisId: picked.id, dealId });
      }
    }
    withCanonical += canonical.length;
    if (canonical.length === 0) {
      continue;
    }

    const existingSummaries = await prisma.analysisSignalSummary.findMany({
      where: {
        analysisId: { in: canonical.map((c) => c.analysisId) },
        schemaVersion: CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION,
      },
      select: { analysisId: true },
    });
    const cached = new Set(existingSummaries.map((row) => row.analysisId));
    alreadyCached += cached.size;
    const missing = canonical.filter((c) => !cached.has(c.analysisId));
    toBackfill += missing.length;

    for (const { analysisId, dealId } of missing) {
      console.log(
        `${CONFIRM ? "BACKFILL" : "DRY-RUN"} analysis=${analysisId} deal=${dealId}`
      );
      if (!CONFIRM) continue;
      const results = await loadResults(analysisId);
      // Best-effort upsert (logs on failure). Re-run a dry-run to confirm
      // toBackfill drops to 0; any residue means a failed upsert to retry.
      await upsertAnalysisSignalSummary(analysisId, dealId, results);
      backfilled += 1;
    }
  }

  console.log(
    `\nDeals: ${dealIds.length} · with canonical analysis: ${withCanonical} · ` +
      `already cached: ${alreadyCached} · toBackfill: ${toBackfill}`
  );
  if (CONFIRM) {
    console.log(`Backfilled (upsert attempted): ${backfilled}`);
  } else {
    console.log("\nDry-run only. Re-run with CONFIRM=1 to apply.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
