import { backfillCorpusSnapshots, listCorpusBackfillCandidates } from "@/services/corpus/backfill";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return {
    dealId: typeof args.get("deal") === "string" ? String(args.get("deal")) : undefined,
    limit: typeof args.get("limit") === "string" ? Number(args.get("limit")) : 100,
    apply: args.get("apply") === true,
  };
}

async function main() {
  const { dealId, limit, apply } = parseArgs(process.argv.slice(2));
  const dryRun = !apply;

  const [candidates, result] = await Promise.all([
    listCorpusBackfillCandidates({ ...(dealId ? { dealId } : {}), take: limit }),
    backfillCorpusSnapshots({ ...(dealId ? { dealId } : {}), limit, dryRun }),
  ]);

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    dealId: dealId ?? null,
    candidateCount: candidates.length,
    candidates,
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
