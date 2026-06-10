/**
 * Débloque les analyses « orphelines » coincées avant la revue de thèse.
 *
 * Cas visé : un Deep Dive (full_analysis) dont le worker Inngest est mort pendant
 * la phase 1 (corpus → thèse). La ligne reste RUNNING avec thesisId=null, donc :
 *  - aucune thèse à réviser → pas de modal, progression figée (ex. 2/21) ;
 *  - la garde reserveFullAnalysisDispatch la classe `pending_thesis` (car
 *    thesisDecision=null) → 409 sur toute relance, AVANT le filet anti-stale.
 * `failStalePreThesisAnalysisBeforeRetry` (lib/inngest.ts) la nettoierait, mais il
 * ne tourne qu'à un dispatch réussi… bloqué par le 409 → deadlock.
 *
 * Ce script applique le MÊME prédicat sûr (thesisId=null + RUNNING + full_analysis
 * + startedAt > 6 min + dernier checkpoint != ANALYZING), passe l'analyse en FAILED
 * et remet le deal en IN_DD pour autoriser la relance. NE rembourse PAS (cohérent
 * avec failStalePreThesis ; le refund équitable est traité par le fix backend dédié).
 *
 * Usage :
 *   # aperçu (dry-run, aucune écriture) :
 *   npx dotenv -e .env.local -- npx tsx scripts/unblock-stale-analysis.ts
 *   # appliquer :
 *   CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/unblock-stale-analysis.ts
 *   # cibler une analyse précise :
 *   ANALYSIS_ID=cmpqy76180003ib043y1c4jbj CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/unblock-stale-analysis.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRE_THESIS_STALE_MS = 6 * 60 * 1000;
const CONFIRM = process.env.CONFIRM === "1";
const TARGET_ID = process.env.ANALYSIS_ID || null;
// FORCE : clôture l'analyse ciblée (ANALYSIS_ID) si elle est encore RUNNING, sans
// exiger le prédicat stale strict (utile quand l'état a évolué mais qu'elle reste bloquée).
const FORCE = process.env.FORCE === "1";

async function failTargeted(id: string) {
  const a = await prisma.analysis.findUnique({
    where: { id },
    select: {
      id: true,
      dealId: true,
      status: true,
      mode: true,
      completedAgents: true,
      totalAgents: true,
      thesisId: true,
      thesisDecision: true,
      startedAt: true,
      deal: { select: { name: true, status: true } },
    },
  });

  if (!a) {
    console.log(`Analyse ${id} introuvable.`);
    return;
  }

  const ageMin = a.startedAt ? Math.round((Date.now() - new Date(a.startedAt).getTime()) / 60000) : null;
  console.log(
    `État actuel ${a.id} — deal "${a.deal?.name}" (${a.deal?.status}) · status=${a.status} · mode=${a.mode} · ` +
      `${a.completedAgents}/${a.totalAgents} · thesisId=${a.thesisId ?? "null"} · thesisDecision=${a.thesisDecision ?? "null"} · ${ageMin ?? "—"} min`
  );

  if (a.status !== "RUNNING") {
    console.log(`→ Pas RUNNING (${a.status}) : rien à kill, la relance est déjà possible.`);
    return;
  }

  if (!CONFIRM) {
    console.log("→ RUNNING. Aperçu uniquement — relancer avec FORCE=1 CONFIRM=1 pour clôturer.");
    return;
  }

  await prisma.$transaction([
    prisma.analysis.updateMany({
      where: { id: a.id, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        summary:
          "Analyse bloquée clôturée manuellement (kill ciblé) pour autoriser la relance.",
      },
    }),
    prisma.deal.update({ where: { id: a.dealId }, data: { status: "IN_DD" } }),
  ]);
  console.log(`  ✓ ${a.id} → FAILED, deal → IN_DD`);
}

async function main() {
  if (TARGET_ID && FORCE) {
    await failTargeted(TARGET_ID);
    return;
  }

  const staleCutoff = new Date(Date.now() - PRE_THESIS_STALE_MS);

  const candidates = await prisma.analysis.findMany({
    where: {
      ...(TARGET_ID ? { id: TARGET_ID } : {}),
      status: "RUNNING",
      mode: "full_analysis",
      thesisId: null,
      startedAt: { lt: staleCutoff },
    },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      dealId: true,
      completedAgents: true,
      totalAgents: true,
      startedAt: true,
      deal: { select: { name: true, status: true } },
      checkpoints: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { state: true, createdAt: true },
      },
    },
  });

  if (candidates.length === 0) {
    console.log("Aucune analyse orpheline pré-thèse (>6 min, thesisId=null) à débloquer.");
    return;
  }

  const now = Date.now();
  for (const a of candidates) {
    const checkpointState = a.checkpoints[0]?.state ?? null;
    const ageMin = a.startedAt ? Math.round((now - new Date(a.startedAt).getTime()) / 60000) : null;

    // Garde de sûreté : on ne tue pas un run dont le dernier checkpoint est ANALYZING
    // (il pourrait être réellement en train de progresser au-delà de la thèse).
    if (checkpointState === "ANALYZING") {
      console.log(`SKIP ${a.id} (deal ${a.deal?.name}) — checkpoint ANALYZING, possiblement actif.`);
      continue;
    }

    console.log(
      `${CONFIRM ? "FAIL" : "DRY-RUN"} ${a.id} — deal "${a.deal?.name}" (status ${a.deal?.status}) · ` +
        `${a.completedAgents}/${a.totalAgents} · ${ageMin} min · checkpoint=${checkpointState ?? "—"}`
    );

    if (!CONFIRM) continue;

    await prisma.$transaction([
      prisma.analysis.updateMany({
        where: { id: a.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          summary:
            "Analyse orpheline (worker interrompu avant la revue de thèse) — clôturée manuellement pour autoriser la relance.",
        },
      }),
      prisma.deal.update({
        where: { id: a.dealId },
        data: { status: "IN_DD" },
      }),
    ]);
    console.log(`  ✓ ${a.id} → FAILED, deal → IN_DD`);
  }

  if (!CONFIRM) {
    console.log("\nAperçu uniquement. Relancer avec CONFIRM=1 pour appliquer.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
