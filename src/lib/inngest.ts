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
          cost: result.totalCost ? Number(result.totalCost) : undefined,
        })
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_COMPLETER', errorMsg, false)
      }
    })

    return result
  }
)

// Export all functions for the serve handler
export const functions = [cleanerFunction, sourcerFunction, completerFunction]
