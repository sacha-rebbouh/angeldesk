/**
 * Inngest Client & Functions
 *
 * Background jobs pour les agents de maintenance (pas de limite de temps)
 */

import { Inngest } from 'inngest'
import { runCleaner } from '@/agents/maintenance/db-cleaner'
import {
  LEGACY_SOURCES,
  PAGINATED_SOURCES,
  processLegacySource,
  processPaginatedSource,
  finalizeSourcerRun,
  type SourceResult,
} from '@/agents/maintenance/db-sourcer'
import {
  processCompleterBatch,
  finalizeCompleterRun,
  emptyBatchStats,
  type CompleterBatchStats,
} from '@/agents/maintenance/db-completer'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { notifyAgentCompleted, notifyAgentFailed } from '@/services/notifications'
import type { SourceStats } from '@/agents/maintenance/types'

// Create the Inngest client
export const inngest = new Inngest({
  id: 'angeldesk',
  name: 'Angel Desk',
})

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * DB_CLEANER - Nettoie les doublons et normalise les données
 */
export const cleanerFunction = inngest.createFunction(
  {
    id: 'db-cleaner',
    name: 'DB Cleaner',
    retries: 2,
  },
  { event: 'maintenance/cleaner.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_CLEANER',
          status: 'PENDING',
          triggeredBy: 'CRON', // Inngest triggered via cron
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Step 2: Run the cleaner
    const result = await step.run('run-cleaner', async () => {
      return await runCleaner({ runId })
    })

    // Step 3: Notify via Telegram
    await step.run('notify', async () => {
      console.log('[Inngest] Notify step - status:', result.status)
      if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
        const notifResult = await notifyAgentCompleted('DB_CLEANER', {
          itemsProcessed: result.itemsProcessed,
          durationMs: result.durationMs,
        })
        console.log('[Inngest] Notification result:', notifResult)
        return notifResult
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        const notifResult = await notifyAgentFailed('DB_CLEANER', errorMsg, false)
        return notifResult
      }
    })

    return result
  }
)

/**
 * DB_SOURCER - Scrappe les sources et importe les nouveaux deals
 *
 * MULTI-STEP: Chaque source est un step séparé pour éviter les timeouts
 */
export const sourcerFunction = inngest.createFunction(
  {
    id: 'db-sourcer',
    name: 'DB Sourcer',
    retries: 1, // Don't retry the whole thing, individual steps will handle errors
  },
  { event: 'maintenance/sourcer.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }
    const startTime = Date.now()

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_SOURCER',
          status: 'PENDING',
          triggeredBy: 'CRON',
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Mark as running
    await step.run('mark-running', async () => {
      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date() },
      })
    })

    // Collect results from all sources
    const results: SourceResult[] = []

    // =========================================================================
    // LEGACY RSS SOURCES (one step each)
    // =========================================================================
    for (const source of LEGACY_SOURCES.filter((s) => s.enabled)) {
      const stats = await step.run(`legacy-${source.name}`, async () => {
        try {
          return await processLegacySource(source.name)
        } catch (error) {
          console.error(`[Inngest] Error processing ${source.name}:`, error)
          return {
            articlesFound: 0,
            articlesParsed: 0,
            newCompanies: 0,
            newRounds: 0,
            errors: 1,
          } as SourceStats
        }
      })
      results.push({ sourceName: source.name, stats })
    }

    // =========================================================================
    // PAGINATED SOURCES (one step each)
    // =========================================================================
    for (const connector of PAGINATED_SOURCES) {
      const stats = await step.run(`paginated-${connector.name}`, async () => {
        try {
          return await processPaginatedSource(connector.name)
        } catch (error) {
          console.error(`[Inngest] Error processing ${connector.name}:`, error)
          return {
            articlesFound: 0,
            articlesParsed: 0,
            newCompanies: 0,
            newRounds: 0,
            errors: 1,
          } as SourceStats
        }
      })
      results.push({ sourceName: connector.name, stats })
    }

    // =========================================================================
    // FINALIZE
    // =========================================================================
    const finalResult = await step.run('finalize', async () => {
      return await finalizeSourcerRun(runId, results, startTime)
    })

    // Notify via Telegram
    await step.run('notify', async () => {
      if (finalResult.status === 'COMPLETED' || finalResult.status === 'PARTIAL') {
        await notifyAgentCompleted('DB_SOURCER', {
          itemsProcessed: finalResult.itemsProcessed,
          itemsCreated: finalResult.itemsCreated,
          durationMs: finalResult.durationMs,
        })
      } else {
        const errorMsg = finalResult.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_SOURCER', errorMsg, false)
      }
    })

    return finalResult
  }
)

/**
 * DB_COMPLETER - Enrichit les entreprises avec des données web + LLM
 *
 * MULTI-STEP: 10 batches de 50 companies = 500 companies par run
 */
export const completerFunction = inngest.createFunction(
  {
    id: 'db-completer',
    name: 'DB Completer',
    retries: 1,
  },
  { event: 'maintenance/completer.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }
    const startTime = Date.now()
    const BATCH_COUNT = 10 // 10 batches × 50 companies = 500 per run

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_COMPLETER',
          status: 'PENDING',
          triggeredBy: 'CRON',
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Mark as running
    await step.run('mark-running', async () => {
      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date() },
      })
    })

    // Process 10 batches (one step each)
    const batchStats: CompleterBatchStats[] = []

    for (let i = 1; i <= BATCH_COUNT; i++) {
      const stats = await step.run(`batch-${i}`, async () => {
        try {
          return await processCompleterBatch(i)
        } catch (error) {
          console.error(`[Inngest] Error processing batch ${i}:`, error)
          return emptyBatchStats()
        }
      }) as unknown as CompleterBatchStats
      batchStats.push(stats)

      // Stop early if no companies were found in this batch
      if (stats.companiesProcessed === 0) {
        console.log(`[Inngest] Batch ${i} found no companies, stopping early`)
        break
      }
    }

    // Finalize
    const result = await step.run('finalize', async () => {
      return await finalizeCompleterRun(runId, batchStats, startTime)
    })

    // Notify via Telegram
    await step.run('notify', async () => {
      if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
        await notifyAgentCompleted('DB_COMPLETER', {
          itemsProcessed: result.itemsProcessed,
          durationMs: result.durationMs,
          cost: result.totalCost != null ? Number(result.totalCost) : undefined,
        })
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_COMPLETER', errorMsg, false)
      }
    })

    return result
  }
)

/**
 * DEAL ANALYSIS via Inngest
 * Decouple l'analyse du request handler.
 * Chaque tier est un step separe pour resilience et observabilite.
 *
 * Retry logic:
 *  - retries: 1 → l'Inngest worker refait un essai en cas de crash infra (OOM, timeout step)
 *  - Le refund credit est gere par le handler cote route API en cas d'echec persistant
 *    (Inngest ne sait pas rembourser le user, c'est une concern metier)
 */
export const dealAnalysisFunction = inngest.createFunction(
  {
    id: 'deal-analysis',
    name: 'Deal Analysis',
    retries: 1,
    // Concurrency: max 3 analyses simultanees par user (evite l'epuisement du pool Neon et d'OpenRouter)
    concurrency: [{
      key: "event.data.userId",
      limit: 3,
    }],
  },
  { event: 'analysis/deal.analyze' },
  async ({ event, step }) => {
    const { dealId, type, enableTrace, userPlan, userId } = event.data as {
      dealId: string;
      type: string;
      enableTrace: boolean;
      userPlan: string;
      userId: string;
    };

    // Thesis-first gate actif uniquement pour full_analysis (Deep Dive).
    // Les autres types (extraction, tier2_sector, tier3_synthesis) bypass.
    const withThesisGate = type === "full_analysis";

    // ========================================================================
    // PHASE 1 : Analyse jusqu'a l'extraction de la these (Tier 0.5)
    // ========================================================================
    const phase1 = await step.run('phase1-extract-thesis', async () => {
      const { orchestrator } = await import("@/agents");
      return await orchestrator.runAnalysis({
        dealId,
        type: type as "extraction" | "full_dd" | "tier1_complete" | "tier3_synthesis" | "tier2_sector" | "full_analysis",
        enableTrace,
        userPlan: userPlan as "FREE" | "PRO",
        pauseAfterThesis: withThesisGate,
      });
    });

    // Pas de pause (non-Deep-Dive ou pause non appliquee) → on se comporte comme avant
    const paused = withThesisGate && (phase1 as { pausedAfterThesis?: boolean }).pausedAfterThesis === true;

    if (!paused) {
      if (!phase1.success) {
        await step.run('refund-on-failure', async () => {
          await compensateFailedAnalysis({ analysisId: phase1.sessionId, userId, dealId, type });
        });
      }
      return phase1;
    }

    // ========================================================================
    // PHASE 2 : Attente de la decision BA via step.waitForEvent (timeout 24h)
    // ========================================================================
    const analysisId = phase1.sessionId;

    const decisionEvent = await step.waitForEvent('wait-thesis-decision', {
      event: 'analysis/thesis.decision',
      timeout: '24h',
      if: `async.data.analysisId == "${analysisId}"`,
    });

    const decisionData = decisionEvent?.data as
      | { analysisId: string; decision: "stop" | "continue" | "contest"; thesisBypass?: boolean }
      | undefined;

    const decision: "stop" | "continue" | "contest" | "timeout" = decisionData?.decision ?? "timeout";
    const thesisBypass = decisionData?.thesisBypass ?? false;

    // ========================================================================
    // PHASE 3 : Reprise selon la decision
    //  - stop/timeout : completer these-only + refund partiel/complet
    //  - continue/contest : lancer Tier 1/2/3 via continueAnalysisAfterThesis
    // ========================================================================
    const phase3 = await step.run('phase3-post-thesis', async () => {
      const { orchestrator } = await import("@/agents");
      return await orchestrator.continueAnalysisAfterThesis(analysisId, decision, { thesisBypass });
    });

    // Refund partiel sur stop (3 credits sur 5), complet sur timeout
    if (decision === "stop" || decision === "timeout") {
      await step.run('partial-refund-on-thesis-stop', async () => {
        const { refundCreditAmount, getActionForAnalysisType, CREDIT_COSTS } = await import("@/services/credits");
        const action = getActionForAnalysisType(type);
        const fullCost = CREDIT_COSTS[action] ?? 5;
        // Timeout: full refund. Stop: partial (rembourse ce qui n'a pas ete consomme = Tier1/2/3).
        // Estimation : thesis + tier 0 coute ~2 credits, reste = fullCost - 2.
        const refundAmount = decision === "timeout" ? fullCost : Math.max(0, fullCost - 2);
        if (refundAmount > 0) {
          try {
            const refundResult = await refundCreditAmount(userId, action, refundAmount, {
              dealId,
              idempotencyKey: `thesis:${decision}-refund:${analysisId}`,
              description: decision === "timeout"
                ? `Thesis timeout — refund integral ${refundAmount}cr (deal ${dealId})`
                : `Thesis stop — refund partiel ${refundAmount}cr (deal ${dealId})`,
            });
            if (refundResult.success) {
              await prisma.analysis.update({
                where: { id: analysisId },
                data: { refundedAt: new Date(), refundAmount },
              }).catch((err: unknown) => logger.warn({ err, analysisId }, 'Could not mark refundedAt'));
            }
          } catch (err) {
            logger.error({ err, dealId, userId, analysisId, decision }, 'Partial refund on thesis-stop failed');
          }
        }
      });
    }

    // Compensation si phase3 echoue — CAS SPECIAL : si paused, le BA a deja recu
    // la valeur "these" (Tier 0.5 complet). Refund partiel UNIQUEMENT du reste
    // (Tier 1/2/3 non livre). FIX (audit P1 #10) : avant on refund integral = double valeur.
    if (!phase3.success) {
      await step.run('refund-on-phase3-failure', async () => {
        if (paused) {
          // Phase3 fail apres continue/contest → rembourser 3cr (meme montant que stop)
          // car les Tier 1/2/3 n'ont pas produit la valeur finale.
          const { refundCreditAmount, CREDIT_COSTS } = await import("@/services/credits");
          const partialRefund = Math.max(0, (CREDIT_COSTS["DEEP_DIVE"] ?? 5) - 2);
          try {
            await refundCreditAmount(userId, "DEEP_DIVE", partialRefund, {
              dealId,
              idempotencyKey: `thesis:phase3-fail-refund:${analysisId}`,
              description: `Partial refund apres echec phase3 (these livree, Tier 1/2/3 non-livre)`,
            });
            await prisma.analysis.update({
              where: { id: analysisId },
              data: { refundedAt: new Date(), refundAmount: partialRefund },
            }).catch((err: unknown) => logger.warn({ err, analysisId }, 'Could not mark refundedAt'));
          } catch (err) {
            logger.error({ err, dealId, userId, analysisId }, 'Partial refund on phase3 failure (paused path) failed');
          }
          try {
            await prisma.deal.update({ where: { id: dealId }, data: { status: 'IN_DD' } });
          } catch (err) {
            logger.error({ err, dealId }, 'Deal status reset failed');
          }
        } else {
          await compensateFailedAnalysis({ analysisId: phase3.sessionId, userId, dealId, type });
        }
      });
    }

    return phase3;
  }
);

/**
 * Helper — compensation d'une analyse qui a echoue (refund + reset deal status).
 */
async function compensateFailedAnalysis(params: { analysisId?: string; userId: string; dealId: string; type: string }) {
  const { refundCredits, getActionForAnalysisType, CREDIT_COSTS } = await import("@/services/credits");
  const action = getActionForAnalysisType(params.type);
  try {
    await refundCredits(params.userId, action, params.dealId, { analysisId: params.analysisId });
    if (params.analysisId) {
      await prisma.analysis.update({
        where: { id: params.analysisId },
        data: { refundedAt: new Date(), refundAmount: CREDIT_COSTS[action] ?? null },
      }).catch((err: unknown) => logger.warn({ err, analysisId: params.analysisId }, 'Could not mark refundedAt'));
    }
  } catch (err) {
    logger.error({ err, dealId: params.dealId, userId: params.userId }, 'Inngest refund failed for failed analysis');
  }
  try {
    await prisma.deal.update({ where: { id: params.dealId }, data: { status: 'IN_DD' } });
  } catch (err) {
    logger.error({ err, dealId: params.dealId }, 'Inngest deal status reset failed');
  }
}

/**
 * DEAL ANALYSIS RESUME via Inngest
 * Reprend une analyse FAILED depuis le dernier checkpoint.
 */
export const dealAnalysisResumeFunction = inngest.createFunction(
  {
    id: 'deal-analysis-resume',
    name: 'Deal Analysis Resume',
    retries: 1,
    concurrency: [{
      key: "event.data.userId",
      limit: 3,
    }],
  },
  { event: 'analysis/deal.resume' },
  async ({ event, step }) => {
    const { orchestrator } = await import("@/agents");
    const { analysisId, dealId } = event.data as {
      analysisId: string;
      dealId: string;
      userId: string;
    };

    const result = await step.run('resume-analysis', async () => {
      return await orchestrator.resumeAnalysis(analysisId);
    });

    if (!result.success) {
      await step.run('reset-deal-on-failure', async () => {
        try {
          await prisma.deal.update({ where: { id: dealId }, data: { status: 'IN_DD' } });
        } catch (err) {
          logger.error({ err, dealId }, 'Inngest resume: deal status reset failed');
        }
      });
    }

    return result;
  }
);

/**
 * THESIS REEXTRACT via Inngest
 * Re-extrait la these d'un deal quand un nouveau document est uploade.
 * Facture 1 credit (THESIS_REEXTRACT). L'ancienne version reste accessible via versioning.
 */
export const thesisReextractFunction = inngest.createFunction(
  {
    id: 'thesis-reextract',
    name: 'Thesis Re-extraction',
    retries: 1,
    concurrency: [{
      key: "event.data.userId",
      limit: 2,
    }],
  },
  { event: 'analysis/thesis.reextract' },
  async ({ event, step }) => {
    const { dealId, userId, previousThesisId, triggeredByAdminId } = event.data as {
      dealId: string;
      userId: string;
      triggeredByDocumentId?: string;
      previousThesisId?: string;
      triggeredByAdminId?: string;
    };

    // FIX (audit P0 #5) : si triggered par admin (backfill), l'admin a deja paye
    // ADMIN_BACKFILL_COST (2cr) sur son compte. On ne deduit PAS le BA.
    // Autrement : upload doc auto → facturation 1cr au BA (idempotent).
    let creditResult: { success: boolean; error?: string } = { success: true };
    if (!triggeredByAdminId) {
      creditResult = await step.run('deduct-reextract-credit', async () => {
        const { deductCreditAmount } = await import("@/services/credits");
        return await deductCreditAmount(userId, "THESIS_REEXTRACT", 1, {
          dealId,
          idempotencyKey: `thesis-reextract:${dealId}:${previousThesisId ?? 'first'}`,
          description: `Re-extraction these apres upload document (deal ${dealId})`,
        });
      });
    } else {
      logger.info({ dealId, adminId: triggeredByAdminId, userId }, 'Thesis re-extract triggered by admin — skipping BA deduction');
    }

    if (!creditResult.success) {
      // FIX (audit P2 #9) : logger explicite (error, pas warn) + remonter l'erreur
      // pour que le monitoring / le produit puisse alerter le user via notif.
      logger.error({ dealId, userId, reason: creditResult.error }, 'Thesis re-extract : credit deduction failed (user will not see updated thesis)');
      return { success: false, error: creditResult.error };
    }

    // Step 2 : re-extraction via orchestrator (charge tous les docs COMPLETED du deal)
    const result = await step.run('run-thesis-reextract', async () => {
      const { orchestrator } = await import("@/agents");
      try {
        // runAnalysis en mode "extraction" + pauseAfterThesis = uniquement Tier 0 + thesis.
        // Apres pause, BA decide via modal. Le pipeline ne poursuit PAS automatiquement.
        const res = await orchestrator.runAnalysis({
          dealId,
          type: "full_analysis",
          userPlan: "PRO",
          pauseAfterThesis: true,
          forceRefresh: true,
        });
        return res;
      } catch (err) {
        logger.error({ err, dealId }, 'Thesis re-extract run failed');
        throw err;
      }
    });

    // Step 3 : si echec → refund le credit DU COMPTE qui a paye (admin OU user)
    if (!result.success) {
      await step.run('refund-reextract-credit', async () => {
        const { refundCreditAmount } = await import("@/services/credits");
        if (triggeredByAdminId) {
          // Admin a paye 2cr via backfill → rembourser 2cr a admin
          await refundCreditAmount(triggeredByAdminId, "THESIS_REEXTRACT", 2, {
            dealId,
            idempotencyKey: `thesis-reextract-refund:admin:${triggeredByAdminId}:${dealId}:${previousThesisId ?? 'first'}`,
            description: `Refund admin backfill (echec extraction)`,
          });
        } else {
          await refundCreditAmount(userId, "THESIS_REEXTRACT", 1, {
            dealId,
            idempotencyKey: `thesis-reextract-refund:${dealId}:${previousThesisId ?? 'first'}`,
            description: `Refund re-extraction these (echec extraction)`,
          });
        }
      });
    }

    return result;
  }
);

// Export all functions for the serve handler
export const functions = [cleanerFunction, sourcerFunction, completerFunction, dealAnalysisFunction, dealAnalysisResumeFunction, thesisReextractFunction]
