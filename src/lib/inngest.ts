/**
 * Inngest Client & Functions
 *
 * Background jobs pour les agents de maintenance (pas de limite de temps)
 */

import { createHash } from 'crypto'
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
import { sendAnalysisReadyNotification, type AnalysisReadyStep } from '@/services/notifications/analysis-ready-email'
import { completionActionForStatus } from '@/lib/analysis-completion-policy'
import type { SourceStats } from '@/agents/maintenance/types'
import { inngest } from '@/lib/inngest-client'
import { compensateFailedAnalysis, reapStaleAnalyses, reapStaleAnalysisById, reapStaleAnalysisByDispatchEventId } from '@/lib/analysis-compensation'

export { inngest }

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

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
    const { dealId, type, enableTrace, userId, dispatchRefundKey, dispatchEventId, stepwise: stepwiseFromDispatch, stepwiseGraphVersion } = event.data as {
      dealId: string;
      type: string;
      enableTrace: boolean;
      userId: string;
      dispatchRefundKey?: string;
      dispatchEventId?: string;
      stepwise?: boolean;
      stepwiseGraphVersion?: number;
    };

    // Gate thèse RETIRÉ (2026-05-30) : plus aucune pause ni décision BA après
    // l'extraction de thèse. `full_analysis` déroule Tier 0→0.5(thèse)→1→2→3 d'une
    // traite. La thèse reste extraite + réconciliée. Crédits : débit plein au
    // lancement (POST /analyze), refund total seulement sur vrai échec.
    //
    // D.5a/D.5d — Deep Dive durable (stepwise). Mode STICKY : décidé au DISPATCH
    // (event.data.stepwise, route.ts) et IMMUABLE sur tout le run → pas de changement de
    // graphe de steps en vol si le flag DEEP_DIVE_STEPWISE est flippé (gate Codex). OFF
    // (défaut / events legacy sans le champ) = chemin actuel exact : runAnalysis encapsulé
    // dans l'unique step.run('run-analysis') externe (mémoïsation monolithique). ON
    // (D.5d-1d) : runAnalysis appelé HORS du step.run externe avec un InngestStepRunner →
    // l'unique step durable 'run-analysis' est créé À L'INTÉRIEUR du driver (Modèle B ; split
    // en N unités d-2..k). Le bootstrap (createAnalysis) tourne hors step → re-tourne à chaque
    // ré-invocation ; dispatchEventId rend l'init idempotent (get-or-create tout statut,
    // analysis.id stable). AUCUN checkpoint legacy en stepwise. Rollback = DEEP_DIVE_STEPWISE=0
    // (n'affecte que les nouveaux dispatches).
    const runStepwise = stepwiseFromDispatch === true;
    let analysisResult;
    try {
      if (runStepwise) {
        const { orchestrator } = await import("@/agents");
        const { InngestStepRunner } = await import("@/agents/orchestrator/step-runner");
        // Inngest `step.run` renvoie Promise<Jsonify<T>> (sérialisation JSON du retour de
        // step). Nos sorties de step sont déjà wire-safe (enveloppe JSON-pure, Date→ISO) →
        // Jsonify<T> ≡ T : on adapte au contrat structurel du StepRunner (qui évite tout
        // import de types Inngest).
        const inngestStepRunner = new InngestStepRunner(
          step as unknown as { run<T>(id: string, fn: () => Promise<T>): Promise<T> }
        );
        analysisResult = await orchestrator.runAnalysis({
          dealId,
          type: type as "extraction" | "full_dd" | "tier1_complete" | "tier3_synthesis" | "tier2_sector" | "full_analysis",
          enableTrace,
          stepwise: true,
          stepRunner: inngestStepRunner,
          dispatchEventId,
          // d-2a — version STICKY du graphe (stampée au dispatch). Threadée jusqu'à
          // runFullAnalysis qui route EXACTEMENT dessus (undefined|1 → driver 1-step ;
          // v2+ à d-2b). Garantit qu'un replay reprend sur le graphe d'origine.
          stepwiseGraphVersion,
        });
      } else {
        analysisResult = await step.run('run-analysis', async () => {
          const { orchestrator } = await import("@/agents");
          return await orchestrator.runAnalysis({
            dealId,
            type: type as "extraction" | "full_dd" | "tier1_complete" | "tier3_synthesis" | "tier2_sector" | "full_analysis",
            enableTrace,
            // Persiste dispatchEventId sur la ligne Analysis (via initializeFullAnalysisRun) AUSSI
            // hors stepwise → le watchdog par-analyse peut résoudre le run par dispatchEventId même
            // avec DEEP_DIVE_STEPWISE off. Active aussi le get-or-create idempotent au retry worker.
            dispatchEventId,
          });
        });
      }
    } catch (error) {
      await step.run('compensate-analysis-throw', async () => {
        await compensateFailedAnalysis({
          userId,
          dealId,
          type,
          refundIdempotencyKey: dispatchRefundKey,
        });
      });
      throw error;
    }

    // Décision commerciale gatée sur le STATUT TERMINAL PERSISTÉ (source de vérité produit),
    // PAS sur analysisResult.success (= allSuccess : tous les agents `success:true`). Une analyse
    // COMPLETED avec agents imparfaits est LIVRÉE (doctrine « IA imparfaites ») → email + facturée ;
    // seule FAILED est remboursée. `allSuccess` reste un signal qualité, jamais une règle
    // commerciale (cf. src/lib/analysis-completion-policy.ts).
    const terminalStatus = analysisResult.sessionId
      ? await step.run('resolve-terminal-status', async () => {
          const a = await prisma.analysis.findUnique({
            where: { id: analysisResult.sessionId },
            select: { status: true },
          });
          return a?.status ?? null;
        })
      : null;

    const completionAction = completionActionForStatus(terminalStatus);
    if (completionAction === 'notify') {
      // Analyse LIVRÉE → notifier (email idempotent, best-effort : un échec d'envoi persistant
      // après le retry Inngest du step `send` ne doit pas faire échouer une analyse réussie).
      try {
        await sendAnalysisReadyNotification({
          analysisId: analysisResult.sessionId,
          userId,
          dealId,
          step: step as unknown as AnalysisReadyStep,
        });
      } catch (notifyError) {
        logger.warn(
          { notifyError, analysisId: analysisResult.sessionId },
          '[deal-analysis] notification « analyse prête » best-effort échouée'
        );
      }
    } else if (completionAction === 'refund') {
      // Échec terminal (FAILED) → refund idempotent.
      await step.run('refund-on-failure', async () => {
        await compensateFailedAnalysis({ analysisId: analysisResult.sessionId, userId, dealId, type });
      });
    }
    // completionAction === 'none' (statut non terminal) → rien (pas de refund à l'aveugle).

    return analysisResult;
  }
);

/**
 * STALE ANALYSIS REAPER — BACKSTOP global basse fréquence (cron Inngest 12 h).
 *
 * La détection PRIMAIRE des analyses figées est désormais ÉVÉNEMENTIELLE et par-analyse
 * (`analysisWatchdogFunction` ci-dessous, déclenchée au lancement de chaque analyse) :
 * Neon n'est réveillé que pendant qu'une analyse tourne réellement. Ce cron ne sert plus
 * que de FILET pour les orphelins — analyses lancées avant ce mécanisme, ou dont l'event
 * watchdog n'a pas pu être émis. Cadence 12 h = 2 réveils Neon/j (vs 96/j en cadence 15 min) : c'est
 * ce qui restaure le baseline compute-hours. Le scan reste un findMany inconditionnel, d'où
 * la fréquence volontairement basse. Logique partagée dans `reapStaleAnalyses`
 * (@/lib/analysis-compensation), testée en isolation.
 */
export const staleAnalysisReaperFunction = inngest.createFunction(
  { id: 'stale-analysis-reaper', name: 'Stale Analysis Reaper (backstop)', retries: 1 },
  { cron: '0 */12 * * *' },
  async () => reapStaleAnalyses()
);

/**
 * ANALYSIS WATCHDOG — détection PRIMAIRE des analyses figées, ÉVÉNEMENTIELLE et par-analyse.
 *
 * Déclenchée par `analysis/watchdog.check` AU LANCEMENT d'une analyse (route.ts : new + resume).
 * Boucle durable : dort 25 min (gratuit pendant le sleep Inngest) → vérifie CETTE analyse →
 * la reap si figée (RUNNING + dernière activité > 20 min) ; si encore RUNNING et active,
 * re-dort ; si terminale (COMPLETED/FAILED) ou reapée, sort. Cap WATCHDOG_MAX_CHECKS pour
 * borner la boucle (au-delà, le backstop 12 h prend le relais).
 *
 * Pourquoi pas un cron global : un cron réveille Neon à VIDE (findMany inconditionnel) 24/7
 * → compute-hours. Ici Neon n'est touché (~2 checks) que pendant qu'une analyse tourne.
 * 25 min > 20 min (STALE_ANALYSIS_REAP_MS) : au réveil, une analyse figée est past-seuil. La
 * boucle (vs un tir unique) couvre les hangs survenant APRÈS le 1ᵉʳ check (granularité ~25 min,
 * comme l'ancien cron) sans laisser le user attendre le backstop 12 h.
 */
const WATCHDOG_SLEEP = '25m';
const WATCHDOG_MAX_CHECKS = 8; // ~3,3 h de surveillance active par analyse ; au-delà → backstop 12 h

export const analysisWatchdogFunction = inngest.createFunction(
  { id: 'analysis-watchdog', name: 'Analysis Watchdog', retries: 1 },
  { event: 'analysis/watchdog.check' },
  async ({ event, step }) => {
    const { analysisId, dispatchEventId } = event.data as {
      analysisId?: string;
      dispatchEventId?: string;
    };
    if (!analysisId && !dispatchEventId) {
      return { ok: false, reason: 'no-identifier' };
    }

    for (let i = 0; i < WATCHDOG_MAX_CHECKS; i++) {
      await step.sleep(`wait-${i}`, WATCHDOG_SLEEP);
      const outcome = await step.run(`check-${i}`, async () =>
        analysisId
          ? reapStaleAnalysisById(analysisId)
          : reapStaleAnalysisByDispatchEventId(dispatchEventId as string)
      );
      // 'alive' = encore RUNNING et fraîche → on continue à surveiller ; sinon on sort.
      if (outcome.status !== 'alive') {
        return { ok: true, checks: i + 1, outcome: outcome.status };
      }
    }
    return { ok: true, checks: WATCHDOG_MAX_CHECKS, outcome: 'cap-reached' };
  }
);

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
    const { analysisId, dealId, userId, resumeRefundKey, resumeRefundAmount } = event.data as {
      analysisId: string;
      dealId: string;
      userId: string;
      resumeRefundKey?: string | null;
      resumeRefundAmount?: number | null;
    };

    const compensateResumeFailure = async (stepId: string) => {
      await step.run(stepId, async () => {
        const analysis = await prisma.analysis.findUnique({
          where: { id: analysisId },
          select: { type: true },
        });
        await compensateFailedAnalysis({
          analysisId,
          userId,
          dealId,
          type: analysis?.type ?? "full_analysis",
          refundIdempotencyKey: resumeRefundKey ?? undefined,
          refundAmount: typeof resumeRefundAmount === "number" ? resumeRefundAmount : undefined,
        });
      });
    };

    try {
      const result = await step.run('resume-analysis', async () => {
        return await orchestrator.resumeAnalysis(analysisId);
      });

      // Même politique que dealAnalysisFunction : gate sur le STATUT TERMINAL PERSISTÉ,
      // pas result.success (= allSuccess). COMPLETED → email ; FAILED → refund.
      const terminalStatus = await step.run('resolve-terminal-status-resume', async () => {
        const a = await prisma.analysis.findUnique({ where: { id: analysisId }, select: { status: true } });
        return a?.status ?? null;
      });
      const completionAction = completionActionForStatus(terminalStatus);
      if (completionAction === 'notify') {
        // Analyse (reprise) LIVRÉE → notifier. Même claim idempotent que la 1ʳᵉ complétion :
        // la ligne Analysis est la même → un seul email même après resume.
        try {
          await sendAnalysisReadyNotification({
            analysisId,
            userId,
            dealId,
            step: step as unknown as AnalysisReadyStep,
          });
        } catch (notifyError) {
          logger.warn(
            { notifyError, analysisId },
            '[deal-analysis-resume] notification « analyse prête » best-effort échouée'
          );
        }
      } else if (completionAction === 'refund') {
        await compensateResumeFailure('compensate-resume-failure');
      }

      return result;
    } catch (error) {
      await compensateResumeFailure('compensate-resume-throw');
      throw error;
    }
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
      key: "event.data.dealId",
      limit: 1,
    }],
  },
  { event: 'analysis/thesis.reextract' },
  async ({ event, step }) => {
    const { dealId, userId, previousThesisId, triggeredByAdminId, triggeredByRebuttal } = event.data as {
      dealId: string;
      userId: string;
      triggeredByDocumentId?: string;
      previousThesisId?: string;
      triggeredByAdminId?: string;
      triggeredByRebuttal?: boolean;
    };

    const reextractRefundAttemptKey = await step.run('prepare-reextract-refund-key', async () => crypto.randomUUID());

    let userReextractChargeApplied = false;

    const refundReextractCharge = async (stepId: string, reason: string) => {
      await step.run(stepId, async () => {
        const { refundCreditAmount } = await import("@/services/credits");

        if (triggeredByAdminId) {
          await refundCreditAmount(triggeredByAdminId, "THESIS_REEXTRACT", 2, {
            dealId,
            idempotencyKey: `thesis-reextract-refund:admin:${triggeredByAdminId}:${dealId}:${previousThesisId ?? 'first'}:${reextractRefundAttemptKey}:${reason}`,
            description: `Refund admin backfill (thesis re-extract ${reason})`,
          });
          return;
        }

        if (!triggeredByRebuttal && userReextractChargeApplied) {
          await refundCreditAmount(userId, "THESIS_REEXTRACT", 1, {
            dealId,
            idempotencyKey: `thesis-reextract-refund:${dealId}:${previousThesisId ?? 'first'}:${reextractRefundAttemptKey}:${reason}`,
            description: `Refund thesis re-extract (${reason})`,
          });
        }
      });
    };

    if (!triggeredByRebuttal) {
      const pausedAnalysis = await step.run('check-existing-paused-thesis-review', async () => {
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${hashStringToBigInt(`thesis-reextract:${dealId}`)})`);
          return await tx.analysis.findFirst({
            where: {
              dealId,
              status: "RUNNING",
              mode: "full_analysis",
            },
            select: {
              id: true,
              thesisId: true,
              thesisDecision: true,
            },
            orderBy: { createdAt: "desc" },
          });
        });
      });

      if (pausedAnalysis) {
        logger.warn(
          {
            dealId,
            runningAnalysisId: pausedAnalysis.id,
            thesisId: pausedAnalysis.thesisId,
            thesisDecision: pausedAnalysis.thesisDecision,
            triggeredByAdminId,
          },
          'Skipping thesis re-extract because a full analysis is already in progress'
        );
        if (triggeredByAdminId) {
          await refundReextractCharge('refund-admin-skip-existing-analysis', 'skip-existing-analysis');
        }
        return {
          success: false,
          skipped: true,
          reason: "analysis_in_progress",
          analysisId: pausedAnalysis.id,
          dealId,
        };
      }
    }

    // FIX (audit P0 #5) : si triggered par admin (backfill), l'admin a deja paye
    // ADMIN_BACKFILL_COST (2cr) sur son compte. On ne deduit PAS le BA.
    // Si triggered par rebuttal valide, le BA a deja paye le rebuttal judge (1cr)
    // et la re-extraction fait partie du meme flux, sans debit supplementaire.
    // Autrement : upload doc auto → facturation 1cr au BA (idempotent).
    let creditResult: { success: boolean; error?: string; alreadyDeducted?: boolean } = { success: true };
    if (!triggeredByAdminId && !triggeredByRebuttal) {
      creditResult = await step.run('deduct-reextract-credit', async () => {
        const { deductCreditAmount } = await import("@/services/credits");
        return await deductCreditAmount(userId, "THESIS_REEXTRACT", 1, {
          dealId,
          idempotencyKey: `thesis-reextract:${dealId}:${previousThesisId ?? 'first'}`,
          description: `Re-extraction these apres upload document (deal ${dealId})`,
        });
      });
      userReextractChargeApplied = creditResult.success && creditResult.alreadyDeducted !== true;
    } else if (triggeredByRebuttal) {
      logger.info({ dealId, userId, previousThesisId }, 'Thesis re-extract triggered by valid rebuttal — skipping extra deduction');
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
    let result;
    try {
      result = await step.run('run-thesis-reextract', async () => {
        const { orchestrator } = await import("@/agents");
        try {
          // stopAfterThesis : on relance Tier 0 + thesis-extractor uniquement, puis on
          // COMPLETE l'analyse en mode thesis_only (pas de gate, pas de decision). La
          // nouvelle version de these est affichee via ThesisRevisionBanner (informatif).
          const res = await orchestrator.runAnalysis({
            dealId,
            type: "full_analysis",
            stopAfterThesis: true,
            forceRefresh: true,
          });
          return res;
        } catch (err) {
          logger.error({ err, dealId }, 'Thesis re-extract run failed');
          throw err;
        }
      });
    } catch (error) {
      await refundReextractCharge('refund-reextract-credit-on-throw', 'throw');
      throw error;
    }

    // Step 3 : si echec → refund le credit DU COMPTE qui a paye (admin OU user)
    if (!result.success) {
      await refundReextractCharge('refund-reextract-credit', 'result-failure');
      return result;
    }

    return result;
  }
);

/**
 * DOCUMENT_EXTRACTION — Phase 4 durable pipeline.
 *
 * Consumer of `document/extraction.run`. The HTTP routes (upload / process
 * / page-retry) claim the document (PROCESSING), persist an ExtractionRun
 * row, deduct credits up-front, and send this event. The function then:
 *   1. runs `runDocumentExtractionPipeline` inside a checkpointed step;
 *   2. on persistent failure, marks the document FAILED and refunds the
 *      credits via `refundCreditAmount` (idempotency key = the event's
 *      `dispatchRefundKey`).
 *
 * Idempotency:
 *   - Inngest dedupes events with the same `id` (we use a deterministic id
 *     keyed by `extractionRunId`). Re-sending the same event from a route
 *     retry is a no-op.
 *   - `runDocumentExtractionPipeline` checks whether the run already
 *     reached a terminal status and returns the cached summary without
 *     re-mutating anything.
 *   - Page-level writes use upsert(runId, pageNumber), so a mid-extraction
 *     retry never duplicates rows.
 *
 * Retries: `retries: 1` (so one infrastructural retry on OOM / step
 * timeout); business-level failures throw ExtractionPipelineError which is
 * caught and compensated.
 */
export const documentExtractionFunction = inngest.createFunction(
  {
    id: 'document-extraction',
    name: 'Document Extraction',
    retries: 1,
    // Concurrency cap per user — same envelope as deal analysis, to avoid
    // saturating the Neon pool and OpenRouter quota when a single user
    // bulk-uploads.
    concurrency: [{ key: 'event.data.userId', limit: 3 }],
  },
  { event: 'document/extraction.run' },
  async ({ event, step }) => {
    const data = event.data as {
      documentId: string;
      extractionRunId: string;
      userId: string;
      dealId: string;
      reason: "upload" | "reprocess" | "page-retry";
      creditAction?: "EXTRACTION_HIGH_PAGE" | "EXTRACTION_SUPREME_PAGE" | "EXTRACTION_STANDARD_PAGE";
      chargedCredits?: number;
      dispatchRefundKey?: string;
      // Phase 4.2: when true, reconcile the pre-charged credits against the
      // actual manifest cost on SUCCESS (delta charge or refund). The
      // /process flow omits this (it charges a fixed estimate). The upload
      // PDF flow pre-charges a worst-case estimate and relies on this.
      reconcileCredits?: boolean;
      // Phase 4.2: forwarded to the pipeline so it can mirror its extraction
      // phases into DocumentExtractionProgress for the upload client poller.
      uploadProgressId?: string;
      documentName?: string;
    };

    try {
      const result = await step.run('run-extraction-pipeline', async () => {
        const { runDocumentExtractionPipeline } = await import("@/services/documents/extraction-pipeline");
        return await runDocumentExtractionPipeline({
          documentId: data.documentId,
          extractionRunId: data.extractionRunId,
          progressPublishing:
            data.uploadProgressId && data.documentName
              ? {
                  uploadProgressId: data.uploadProgressId,
                  userId: data.userId,
                  documentName: data.documentName,
                }
              : undefined,
        });
      });

      // Phase 4.2 credit reconciliation (SUCCESS path). The upload PDF flow
      // pre-charges a worst-case estimate; once the real cost is known we
      // either refund the over-charge or charge the (rare) delta. Idempotent
      // via deterministic idempotency keys derived from the run id.
      //
      // B3.3.3 fix-up #2 — gate on `result.status === "COMPLETED"`. The
      // pipeline can now return `SUPERSEDED` (run terminalized by /process
      // stale-retry while this worker was in flight) — reconciling against
      // a sentinel with `actualCredits=0` would compute a bogus refund/charge
      // delta. SUPERSEDED is handled below (explicit refund of chargedCredits
      // since the run was killed before producing the document). FAILED is
      // handled by the global catch block (which throws and triggers
      // `compensate-failed-extraction`) — but a pipeline-level FAILED return
      // (no throw) would also wrongly reconcile. Tighten the gate.
      if (
        result.status === "COMPLETED" &&
        data.reconcileCredits &&
        data.creditAction &&
        typeof data.chargedCredits === "number"
      ) {
        await step.run('reconcile-extraction-credits', async () => {
          const charged = data.chargedCredits ?? 0;
          const actual = result.actualCredits;
          if (actual === charged) return;
          // B10.1 — extraction is not billed separately while
          // `CHARGE_DOCUMENT_EXTRACTION_CREDITS` is false. Routes
          // skip their pre-charge entirely (charged = 0); a worker
          // top-up here would create a ghost charge with no
          // user-visible pre-charge to anchor it. Hard skip the
          // reconcile branch so the ledger stays at 0.
          const { CHARGE_DOCUMENT_EXTRACTION_CREDITS } = await import("@/services/credits");
          if (!CHARGE_DOCUMENT_EXTRACTION_CREDITS) return;
          const { deductCreditAmount, refundCreditAmount } = await import("@/services/credits");
          if (actual > charged) {
            const delta = actual - charged;
            const extra = await deductCreditAmount(data.userId, data.creditAction!, delta, {
              dealId: data.dealId,
              documentId: data.documentId,
              documentExtractionRunId: data.extractionRunId,
              idempotencyKey: `extraction:delta:${data.extractionRunId}`,
              description: `Delta extraction (+${delta} credits) for document ${data.documentId}`,
            });
            if (!extra?.success) {
              // Compute already consumed; accept the result but log the gap.
              logger.warn(
                { userId: data.userId, documentId: data.documentId, delta, error: extra?.error },
                '[document-extraction] delta charge failed — extraction kept, user under-charged'
              );
            }
          } else {
            const refundAmount = charged - actual;
            const refund = await refundCreditAmount(data.userId, data.creditAction!, refundAmount, {
              dealId: data.dealId,
              documentId: data.documentId,
              documentExtractionRunId: data.extractionRunId,
              idempotencyKey: `extraction:reconcile-refund:${data.extractionRunId}`,
              description: `Refund extraction over-estimate (-${refundAmount} credits) for document ${data.documentId}`,
            });
            if (!refund?.success) {
              logger.error(
                { userId: data.userId, documentId: data.documentId, refundAmount, error: refund?.error },
                '[document-extraction] reconciliation refund failed — user over-charged'
              );
            }
          }
        });
      }

      // Phase 4.2: thesis auto re-extract. The upload route used to trigger
      // this synchronously after inline extraction; now that the PDF path
      // is durable, the trigger moves here — it must fire when the document
      // actually reaches COMPLETED, which only happens inside this function.
      //
      // B3.3.3 fix-up #2 — gate on `result.status === "COMPLETED"`. A
      // SUPERSEDED return means the run was killed by /process stale-retry
      // mid-flight; the NEW run will trigger its own thesis re-extract when
      // it completes. Without this gate, a late-completing superseded run
      // would fire a phantom thesis re-extract (duplicate work + wrong
      // `triggeredByDocumentId` provenance since no document reached COMPLETED
      // via this run).
      if (result.status === "COMPLETED" && data.reason === "upload") {
        await step.run('trigger-thesis-reextract', async () => {
          try {
            const { thesisService } = await import("@/services/thesis");
            const existingThesis = await thesisService.getLatest(data.dealId);
            if (existingThesis) {
              await inngest.send({
                name: "analysis/thesis.reextract",
                data: {
                  dealId: data.dealId,
                  userId: data.userId,
                  triggeredByDocumentId: data.documentId,
                  previousThesisId: existingThesis.id,
                },
              });
            }
          } catch (thesisError) {
            // Non-blocking: a failed thesis re-extract trigger must not fail
            // the extraction itself.
            logger.warn(
              { dealId: data.dealId, documentId: data.documentId, thesisError },
              '[document-extraction] thesis re-extract trigger failed'
            );
          }
        });
      }

      // B3.3.3 fix-up #2 — SUPERSEDED branch. The run was terminalized by
      // /process stale-retry while this worker was in flight. The user paid
      // for the upload-time pre-charge (chargedCredits), but the run never
      // produced a document. /process deducted SEPARATE credits for the new
      // run, so leaving chargedCredits on the user's tab would double-bill
      // them. Refund explicitly (idempotent via dispatchRefundKey).
      //
      // Note: we deliberately do NOT throw and do NOT terminalize/flip the
      // document FAILED here — the run is already terminal, and the document
      // belongs to the new run now. Touching it would clobber the new run's
      // state (the precise bug this fix-up closes).
      if (result.status === "SUPERSEDED") {
        await step.run('compensate-superseded-extraction', async () => {
          if (
            data.chargedCredits &&
            data.chargedCredits > 0 &&
            data.creditAction &&
            data.dispatchRefundKey
          ) {
            // B10.1 — strict contract: while
            // CHARGE_DOCUMENT_EXTRACTION_CREDITS is false,
            // refundCreditAmount(..., "EXTRACTION_*", ...) is NEVER
            // called. A non-zero `data.chargedCredits` on an in-flight
            // event from before the flag flip would otherwise produce
            // a phantom refund (ghost credit) that breaks ledger
            // conservation. Skip the refund — the matching deduct was
            // either real (and we accept the legacy charge stays
            // until manual reconcile) or was never taken (and there's
            // nothing to refund). When the flag flips back on, the
            // gate naturally lifts.
            const { CHARGE_DOCUMENT_EXTRACTION_CREDITS } = await import("@/services/credits");
            if (!CHARGE_DOCUMENT_EXTRACTION_CREDITS) return;
            try {
              const { refundCreditAmount } = await import("@/services/credits");
              const refund = await refundCreditAmount(
                data.userId,
                data.creditAction,
                data.chargedCredits,
                {
                  dealId: data.dealId,
                  documentId: data.documentId,
                  documentExtractionRunId: data.extractionRunId,
                  idempotencyKey: data.dispatchRefundKey,
                  description: `Refund superseded extraction for ${data.documentId} (run replaced by stale-retry)`,
                }
              );
              if (!refund?.success) {
                logger.error(
                  { userId: data.userId, documentId: data.documentId, refundError: refund?.error },
                  '[document-extraction] superseded refund returned non-success — user remains debited'
                );
              }
            } catch (refundError) {
              logger.error(
                { userId: data.userId, documentId: data.documentId, refundError },
                '[document-extraction] superseded refund threw — user remains debited'
              );
            }
          }
        });
      }

      return result;
    } catch (error) {
      // Persistent failure: refund the user (if anything was charged) and
      // ensure the Document row is in a recoverable state. The pipeline
      // itself already attempted to mark the document FAILED before
      // throwing — we re-assert it here defensively in case the throw was
      // earlier than the FAILED write.
      await step.run('compensate-failed-extraction', async () => {
        // B10.1 — strict contract: refund gated on the same flag as
        // the SUPERSEDED branch. See compensate-superseded-extraction
        // for the full rationale (ledger conservation while
        // CHARGE_DOCUMENT_EXTRACTION_CREDITS is false). The
        // terminalize + document FAILED side effects (below) must
        // still run unconditionally — they are state recovery, not
        // money movement — so the guard is a wrapping if (not an
        // early return that would skip the recovery path).
        const { CHARGE_DOCUMENT_EXTRACTION_CREDITS } = await import("@/services/credits");
        if (
          CHARGE_DOCUMENT_EXTRACTION_CREDITS &&
          data.chargedCredits && data.chargedCredits > 0 && data.creditAction && data.dispatchRefundKey
        ) {
          try {
            const { refundCreditAmount } = await import("@/services/credits");
            const refund = await refundCreditAmount(
              data.userId,
              data.creditAction,
              data.chargedCredits,
              {
                dealId: data.dealId,
                documentId: data.documentId,
                documentExtractionRunId: data.extractionRunId,
                idempotencyKey: data.dispatchRefundKey,
                description: `Refund failed durable extraction for ${data.documentId}`,
              }
            );
            if (!refund?.success) {
              logger.error(
                { userId: data.userId, documentId: data.documentId, refundError: refund?.error },
                '[document-extraction] refund returned non-success — user remains debited'
              );
            }
          } catch (refundError) {
            logger.error(
              { userId: data.userId, documentId: data.documentId, refundError },
              '[document-extraction] refund threw — user remains debited'
            );
          }
        }

        // Terminalize BOTH the run and the document. The pipeline's own
        // try/catch already does this on the common paths, but if the
        // pipeline crashed (OOM, infra kill) before its catch ran, the run
        // would be left stuck PROCESSING. `terminalizeExtractionRunAsFailed`
        // is idempotent (only flips PENDING/PROCESSING), so re-asserting
        // here is safe.
        const { terminalizeExtractionRunAsFailed } = await import("@/services/documents/extraction-runs");
        await terminalizeExtractionRunAsFailed(
          data.extractionRunId,
          `Durable extraction failed for document ${data.documentId}`
        ).catch(() => undefined);
        await prisma.document
          .updateMany({
            where: { id: data.documentId, processingStatus: "PROCESSING" },
            data: { processingStatus: "FAILED" },
          })
          .catch(() => undefined);
      });
      throw error;
    }
  }
);

// Export all functions for the serve handler
export const functions = [cleanerFunction, sourcerFunction, completerFunction, dealAnalysisFunction, dealAnalysisResumeFunction, staleAnalysisReaperFunction, analysisWatchdogFunction, thesisReextractFunction, documentExtractionFunction]
