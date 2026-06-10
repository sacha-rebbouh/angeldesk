/**
 * Débloque un deal coincé en ANALYZING alors que son analyse est déjà terminale
 * (FAILED/COMPLETED) — cas typique d'un run clôturé sans reset du deal status.
 * Remet le deal en IN_DD pour autoriser une relance. NE rembourse PAS.
 *
 * Garde de sûreté : refuse d'agir s'il existe encore une analyse RUNNING sur ce
 * deal (on ne veut pas débloquer un deal réellement en cours d'analyse).
 *
 * Usage :
 *   # aperçu (lecture seule) :
 *   DEAL=avekapeti npx dotenv -e .env.local -- npx tsx scripts/unblock-deal-status.ts
 *   # appliquer :
 *   DEAL=avekapeti CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/unblock-deal-status.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEAL = process.env.DEAL || "avekapeti";
const CONFIRM = process.env.CONFIRM === "1";

async function main() {
  const deal = await prisma.deal.findFirst({
    where: { name: { equals: DEAL, mode: "insensitive" } },
    select: { id: true, name: true, status: true },
  });
  if (!deal) {
    console.log(`Deal "${DEAL}" introuvable.`);
    return;
  }

  const running = await prisma.analysis.findFirst({
    where: { dealId: deal.id, status: "RUNNING" },
    select: { id: true },
  });

  console.log(
    `Deal "${deal.name}" (${deal.id}) · status=${deal.status} · analyse RUNNING ? ${running ? running.id : "non"}`
  );

  if (running) {
    console.log("→ Une analyse est encore RUNNING : on ne touche pas (laisse le watchdog ou la complétion gérer).");
    return;
  }
  if (deal.status === "IN_DD") {
    console.log("→ Déjà en IN_DD : rien à faire.");
    return;
  }
  if (!CONFIRM) {
    console.log(`→ Aperçu : passerait "${deal.status}" → IN_DD. Relancer avec CONFIRM=1 pour appliquer.`);
    return;
  }

  await prisma.deal.update({ where: { id: deal.id }, data: { status: "IN_DD" } });
  console.log(`  ✓ Deal "${deal.name}" → IN_DD (relance autorisée).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
