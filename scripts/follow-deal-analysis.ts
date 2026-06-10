/**
 * Moniteur LECTURE SEULE : suit l'état des analyses + thèse d'un deal.
 * Aucune écriture. Usage :
 *   DEAL=avekapeti npx dotenv -e .env.local -- npx tsx scripts/follow-deal-analysis.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEAL = process.env.DEAL || "avekapeti";

async function main() {
  const deal = await prisma.deal.findFirst({
    where: { name: { equals: DEAL, mode: "insensitive" } },
    select: { id: true, name: true, status: true, updatedAt: true },
  });
  if (!deal) {
    console.log(`Deal "${DEAL}" introuvable.`);
    return;
  }

  const now = Date.now();
  const mins = (d: Date | null | undefined) =>
    d ? `${Math.round((now - new Date(d).getTime()) / 60000)}min` : "—";

  const analyses = await prisma.analysis.findMany({
    where: { dealId: deal.id },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      status: true,
      mode: true,
      type: true,
      completedAgents: true,
      totalAgents: true,
      thesisId: true,
      thesisDecision: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const latestThesis = await prisma.thesis.findFirst({
    where: { dealId: deal.id, isLatest: true },
    orderBy: { version: "desc" },
    select: { id: true, version: true, decision: true, verdict: true, confidence: true, createdAt: true },
  });

  const snapshot = {
    deal: { id: deal.id, name: deal.name, status: deal.status, updatedAgo: mins(deal.updatedAt) },
    analyses: analyses.map((a) => ({
      id: a.id,
      status: a.status,
      mode: a.mode,
      type: a.type,
      progress: `${a.completedAgents}/${a.totalAgents}`,
      thesisId: a.thesisId,
      thesisDecision: a.thesisDecision,
      createdAgo: mins(a.createdAt),
      startedAgo: mins(a.startedAt),
      completedAgo: a.completedAt ? mins(a.completedAt) : null,
    })),
    latestThesis: latestThesis
      ? {
          id: latestThesis.id,
          version: latestThesis.version,
          decision: latestThesis.decision,
          verdict: latestThesis.verdict,
          confidence: latestThesis.confidence,
          createdAgo: mins(latestThesis.createdAt),
        }
      : null,
  };
  console.log(JSON.stringify(snapshot, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
