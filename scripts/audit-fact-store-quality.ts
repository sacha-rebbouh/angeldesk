import { quarantineSuspiciousCurrentFacts } from "@/services/fact-store";

function parseArgs(argv: string[]) {
  const parsed: {
    dealId?: string;
    limit: number;
    dryRun: boolean;
  } = {
    limit: 200,
    dryRun: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dealId" && argv[index + 1]) {
      parsed.dealId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--limit" && argv[index + 1]) {
      parsed.limit = Number(argv[index + 1]) || 200;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      parsed.dryRun = false;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await quarantineSuspiciousCurrentFacts({
    ...(args.dealId ? { dealId: args.dealId } : {}),
    limit: args.limit,
    dryRun: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
