/**
 * Notification « analyse prête » — claim atomique idempotent (Phase 4).
 *
 * Appelée CÔTÉ INNGEST à la complétion réussie d'une analyse (dealAnalysisFunction +
 * dealAnalysisResumeFunction). Garantit qu'un seul email part par analyse, même si
 * plusieurs invocations du worker complètent la même ligne (retry infra, resume) :
 *
 *   1. CLAIM ATOMIQUE — `updateMany where { id, sentAt: null, claimedAt: null }` pose
 *      `claimedAt`. `count === 1` ⇒ on est le gagnant ; sinon un autre a déjà claim/envoyé.
 *   2. SEND — résout destinataire + deal, envoie via Resend, puis pose `sentAt` (succès) ou
 *      relâche `claimedAt` + throw (échec ⇒ retry Inngest, puis best-effort au call site).
 *
 * Claim ET send sont des `step.run` Inngest distincts : au replay d'un retry, le claim est
 * mémoïsé (pas de re-claim), seul le send est rejoué.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isEmailConfigured, sendAnalysisReadyEmail } from "./email";

/**
 * Contrat structurel minimal du `step` Inngest (évite d'importer les types Inngest ici,
 * cohérent avec InngestStepRunner). Le call site passe le vrai `step` via un cast.
 */
export type AnalysisReadyStep = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

/** Base URL serveur (jamais NEXT_PUBLIC) pour construire le deep-link du deal. */
function getAppBaseUrl(): string | null {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return null;
}

export async function sendAnalysisReadyNotification(opts: {
  analysisId: string;
  userId: string;
  dealId: string;
  step: AnalysisReadyStep;
  /** Préfixe d'id de step (déduplication entre fonctions Inngest). Optionnel. */
  stepPrefix?: string;
}): Promise<void> {
  const { analysisId, userId, dealId, step } = opts;
  const prefix = opts.stepPrefix ?? "analysis-ready-email";

  // 1) CLAIM ATOMIQUE — un seul gagnant pose claimedAt.
  const claimed = await step.run(`${prefix}-claim`, async () => {
    const res = await prisma.analysis.updateMany({
      where: {
        id: analysisId,
        analysisReadyEmailSentAt: null,
        analysisReadyEmailClaimedAt: null,
      },
      data: { analysisReadyEmailClaimedAt: new Date() },
    });
    return res.count === 1;
  });
  if (!claimed) return;

  // 2) SEND — résout destinataire + deal, envoie, finalise (sentAt) ou relâche le claim.
  await step.run(`${prefix}-send`, async () => {
    // Email non configuré. En PRODUCTION c'est une MISCONFIG, pas un no-op légitime : relâcher le
    // claim + throw → l'email repartira au retry une fois RESEND_API_KEY ajoutée, au lieu de graver
    // sentAt en silence (preuve d'envoi mensongère). Hors prod (dev/local + Vercel Preview, où la clé
    // peut légitimement manquer), consommer le claim sans retry. Gate sur VERCEL_ENV (PAS NODE_ENV,
    // qui vaut "production" aussi en Preview) — cohérent avec proxy.ts.
    if (!isEmailConfigured()) {
      if (process.env.VERCEL_ENV === "production") {
        await prisma.analysis.updateMany({
          where: { id: analysisId, analysisReadyEmailSentAt: null },
          data: { analysisReadyEmailClaimedAt: null },
        });
        logger.error({ analysisId }, "[analysis-ready-email] RESEND_API_KEY absente en PRODUCTION — claim relâché, retry attendu");
        throw new Error("[analysis-ready-email] email non configuré en production (RESEND_API_KEY absente)");
      }
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { analysisReadyEmailSentAt: new Date() },
      });
      logger.info({ analysisId }, "[analysis-ready-email] email non configuré (hors prod) — notification ignorée");
      return;
    }

    // Re-vérifie l'état APRÈS le claim (mémoïsé au replay Inngest) : si un gagnant
    // concurrent a déjà envoyé (sentAt posé après un reset+re-claim), ne pas renvoyer.
    // Ferme la fenêtre de double-envoi sans même appeler Resend ; la clé d'idempotence
    // ci-dessous couvre le reste (race re-check↔send, échec d'update post-envoi).
    const current = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { analysisReadyEmailSentAt: true },
    });
    if (current?.analysisReadyEmailSentAt) return;

    const [user, deal] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.deal.findUnique({ where: { id: dealId }, select: { name: true, companyName: true } }),
    ]);

    if (!user?.email) {
      // Destinataire introuvable (ex. compte supprimé) → consommer le claim : rien à envoyer,
      // inutile de boucler en retry sur un destinataire définitivement absent.
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { analysisReadyEmailSentAt: new Date() },
      });
      logger.warn({ analysisId, userId }, "[analysis-ready-email] destinataire introuvable — notification ignorée");
      return;
    }

    const baseUrl = getAppBaseUrl();
    const dealUrl = baseUrl ? `${baseUrl}/deals/${dealId}` : null;
    const dealName = deal?.companyName?.trim() || deal?.name?.trim() || "votre deal";

    // Clé d'idempotence Resend (≤256 car., TTL 24h, format <event>/<entity>) : un renvoi
    // avec la MÊME clé renvoie la même réponse SANS envoyer un 2ᵉ email → exactly-once même
    // si deux invocations (retry worker, resume) atteignent le send sur la même analyse.
    const result = await sendAnalysisReadyEmail({
      to: user.email,
      dealName,
      dealUrl,
      idempotencyKey: `analysis-ready/${analysisId}`,
    });

    if (result.success) {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { analysisReadyEmailSentAt: new Date() },
      });
      return;
    }

    // Échec d'envoi APRÈS claim → relâcher le claim pour autoriser un retry (Inngest), puis
    // throw. Le reset est conditionné à sentAt:null pour ne jamais écraser un envoi concurrent.
    await prisma.analysis.updateMany({
      where: { id: analysisId, analysisReadyEmailSentAt: null },
      data: { analysisReadyEmailClaimedAt: null },
    });
    throw new Error(`[analysis-ready-email] envoi Resend échoué (${result.error ?? "raison inconnue"})`);
  });
}
